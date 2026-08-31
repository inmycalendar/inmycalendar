/* RUN: node tools/audit-holidays.js
   ---------------------------------------------------------------------------
   Checks the holiday data for the kinds of fault that are invisible in the UI.

   Why this file exists: a wrong holiday looks exactly like an ordinary day.
   Nothing throws and nothing renders oddly, so the only way anyone finds out
   is by knowing the answer already and noticing the calendar disagrees. That
   is how 25 August 2025 was found: a UK bank holiday that simply was not
   drawn, because the source data classified it as regional and regional days
   are hidden by default.

   WHAT THIS CAN AND CANNOT PROVE
   It can prove structural facts: files parse, every year in a country's range
   has data, no year consists only of regional days, the horizon is covered.
   It CANNOT prove a holiday is on the right date, because that needs a
   reference source this repo does not have. Treat a clean run as "no broken
   plumbing", never as "the dates are correct".

   THE CLASSIFICATION PROBLEM
   The source data marks a day national only when it is observed in EVERY
   subdivision. That is internally consistent and it is user-hostile: it
   demotes Easter Monday and the late-August bank holiday in the UK, because
   Scotland does something different, even though both are bank holidays for
   about 97% of the country. The rule this project applies instead is that a
   day observed by the overwhelming majority of the population is national.
   Applying that needs per-country knowledge, so it is done case by case, and
   the countries most likely to need it are listed by the watchlist below.
   --------------------------------------------------------------------------- */
const fs   = require("fs");
const path = require("path");

const DIR     = path.resolve(__dirname, "..", "assets", "holidays");
const HORIZON = 2035;        /* the calendar shows a multi-year forward window */

/* Countries with devolved or federal subdivisions that observe different days.
   These are where "national means every subdivision" does the most damage, so
   they are the ones worth checking by hand against an official source. */
const WATCHLIST = ["GB","CA","CH","DE","ES","AU","US","IN","FR","IT","AT","BE",
                   "MY","AE","BR","MX","NL","DK","FI","NO","SE","PT","ZA","NZ"];

function load(code){
  let out = null;
  const src = fs.readFileSync(path.join(DIR, code + ".js"), "utf8");
  new Function("window", "return eval(arguments[1])")({ __imcHol:(c,d)=>{ out = d; } }, src);
  return out;
}

const codes = fs.readdirSync(DIR).filter(f => f.endsWith(".js")).map(f => f.replace(".js",""));
let failures = 0;
const line = (ok, msg) => { if (!ok) failures++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + msg); };

/* ---- 1. everything parses and emits data ---------------------------------- */
const data = {};
const broken = [];
for (const c of codes){
  try {
    const d = load(c);
    if (!d || typeof d !== "object") broken.push(c + " (emitted nothing)");
    else data[c] = d;
  } catch (e){ broken.push(c + " (" + e.message + ")"); }
}
line(broken.length === 0,
     codes.length + " country files parse and emit data" +
     (broken.length ? "   broken: " + broken.slice(0,6).join(", ") : ""));

/* ---- 2. no gap inside a country's own range ------------------------------- */
{
  const gaps = [];
  for (const c in data){
    const yrs = Object.keys(data[c]).map(Number).sort((a,b)=>a-b);
    for (let y = yrs[0]; y <= yrs[yrs.length-1]; y++)
      if (!data[c][String(y)]) { gaps.push(c + ":" + y); break; }
  }
  line(gaps.length === 0,
       "no country has a missing year inside its own range" +
       (gaps.length ? "   " + gaps.join(" ") : ""));
}

/* ---- 3. no year that is entirely regional --------------------------------- */
/* A year like this renders as a blank calendar for anyone who has not found
   the regional toggle, which is exactly the fault reported for the UK. */
{
  const bad = [];
  for (const c in data) for (const y in data[c]){
    const v = data[c][y], keys = Object.keys(v);
    if (keys.length && !keys.some(k => v[k][1] !== 1)) { bad.push(c + ":" + y); break; }
  }
  line(bad.length === 0,
       "no country-year consists only of regional days" +
       (bad.length ? "   " + bad.join(" ") : ""));
}

/* ---- 4. the UK fix stays fixed -------------------------------------------- */
/* Regression guard for the reported bug. If the data is ever regenerated from
   the upstream source these will silently revert, and the calendar will go
   back to showing no August bank holiday to a British user. */
{
  const gb = data.GB || {};
  let demoted = [], scotland = 0;
  for (const y in gb) for (const k in gb[y]){
    const [name, flag] = gb[y][k];
    if (/^(Easter Monday|Late Summer Bank Holiday)$/.test(name) && flag === 1)
      demoted.push(y + "-" + k + " " + name);
    if (name === "Summer Bank Holiday" && flag === 1) scotland++;
  }
  line(demoted.length === 0,
       "UK: Easter Monday and the late-August bank holiday are national" +
       (demoted.length ? "   still regional: " + demoted.slice(0,4).join(", ") : ""));
  line(scotland > 0,
       "UK: Scotland's own early-August holiday stays regional (" + scotland + " years)");
}

/* ---- 5. no plain weekday masquerading as a holiday ------------------------ */
/* Swedish law really does class every Sunday as a public holiday. True, and
   useless here: it painted the entire Sunday column red for 31 years and
   buried the eleven days a Swede actually plans around. 1529 entries named
   "Sunday" were removed. This stops them, or anything like them, coming back. */
{
  const DOW = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/;
  const bad = [];
  for (const c in data) for (const y in data[c]) for (const k in data[c][y]){
    const name = data[c][y][k][0];
    if (String(name).split(";").some(s => DOW.test(s.trim()))){ bad.push(c + ":" + y); break; }
  }
  line(bad.length === 0,
       "no country lists a bare weekday as a holiday" +
       (bad.length ? "   " + [...new Set(bad.map(b=>b.split(":")[0]))].join(" ") : ""));
}

/* ---- 6. a fixed-date holiday must not vanish just because it is a weekend -- */
/* This is the fault that hid Christmas Day in Spain. The upstream source
   deleted the holiday outright in years when it fell on a Sunday and left
   behind only a REGIONAL "Monday following X", which is hidden by default. So
   a Spanish user opening 25 December 2033 saw an ordinary day.

   The check: for every national holiday on a fixed date that appears in most
   years, find the years it is absent. If every one of those absences lands on
   a Saturday or Sunday, that is not a calendar quirk, that is the bug.

   Two exemptions, both legitimate. A holiday that genuinely MOVES is fine, so
   a national stand-in within two days clears it (Dutch King's Day really does
   shift to the 26th when the 27th is a Sunday). And a day whose own name marks
   it as an observance or a substitution is year-specific by definition. */
{
  const key = d => String(d.getMonth()+1).padStart(2,"0") + String(d.getDate()).padStart(2,"0");
  const EXEMPT = /observed|substitut/i;
  const bad = [];
  for (const c in data){
    const years = Object.keys(data[c]).map(Number).sort((a,b)=>a-b);
    if (years.length < 10) continue;
    const seen = {};
    for (const y of years) for (const k in data[c][String(y)]) if (data[c][String(y)][k][1] !== 1)
      (seen[k] = seen[k] || { years:[], name:data[c][String(y)][k][0] }).years.push(y);

    for (const k in seen){
      if (EXEMPT.test(seen[k].name)) continue;
      const present = new Set(seen[k].years);
      const missing = years.filter(y => !present.has(y));
      if (present.size < years.length * 0.6 || missing.length < 2) continue;
      if (!missing.every(y => { const d = new Date(y, +k.slice(0,2)-1, +k.slice(2)).getDay();
                                return d === 0 || d === 6; })) continue;

      /* does a national stand-in exist within two days in EVERY missing year? */
      let covered = 0;
      for (const y of missing){
        const base = new Date(y, +k.slice(0,2)-1, +k.slice(2));
        for (let off = -2; off <= 2; off++){
          if (!off) continue;
          const d = new Date(base); d.setDate(d.getDate() + off);
          const e = data[c][String(y)][key(d)];
          if (e && e[1] !== 1 && e[0].indexOf(seen[k].name) >= 0){ covered++; break; }
        }
      }
      if (covered < missing.length)
        bad.push(c + " " + k.slice(0,2) + "-" + k.slice(2) + " " + seen[k].name +
                 " (missing " + missing.length + "y)");
    }
  }
  line(bad.length === 0,
       "no fixed-date national holiday disappears on weekends" +
       (bad.length ? "   " + bad.slice(0,6).join("; ") : ""));
}

/* ---- 7. the big countries keep the days they are known to have ------------ */
/* Spot values, checked by hand against each country's official list. They are
   here because every fault above was invisible until someone who knew the
   answer looked. If a regeneration ever silently changes one of these, this is
   what says so. */
{
  const EXPECT = [
    ["GB","2025","0825","Late Summer Bank Holiday"],  /* the reported bug */
    ["GB","2025","0421","Easter Monday"],
    ["ES","2025","1012","National Day"],              /* dropped for being a Sunday */
    ["ES","2033","1225","Christmas Day"],
    ["AU","2025","0127","Australia Day"],             /* nationwide substitute */
    ["US","2025","0619","Juneteenth National Independence Day"],
    ["JP","2025","0505","Children's Day"],
    ["DE","2025","1003","German Unity Day"],
    ["FR","2025","0714","National Day"],
    ["IT","2025","0425","Liberation Day"]
  ];
  const missed = [];
  for (const [c, y, k, name] of EXPECT){
    const e = data[c] && data[c][y] && data[c][y][k];
    if (!e || e[1] === 1 || e[0].indexOf(name) < 0)
      missed.push(c + " " + y + "-" + k + " " + name + (e ? " (flag " + e[1] + ")" : " (absent)"));
  }
  line(missed.length === 0,
       EXPECT.length + " hand-checked days in the largest countries are national" +
       (missed.length ? "   " + missed.join("; ") : ""));
}

/* ---- 8. horizon coverage (reported, not enforced) ------------------------- */
/* Not a failure: the upstream source genuinely stops early for some countries,
   and inventing dates to fill the gap would be worse than showing none. */
{
  const short = [];
  for (const c in data){
    const yrs = Object.keys(data[c]).map(Number).sort((a,b)=>a-b);
    const last = yrs[yrs.length-1];
    if (last < HORIZON) short.push({ c, first: yrs[0], last });
  }
  console.log("\n  Coverage to " + HORIZON + ": " + (codes.length - short.length) +
              " of " + codes.length + " countries reach the horizon.");
  if (short.length){
    console.log("  These stop early and need a real data source, not a guess:");
    short.sort((a,b) => a.last - b.last)
         .forEach(s => console.log("    " + s.c + "  " + s.first + " to " + s.last));
  }
}

/* ---- 8b. years the calendar can reach but has no holidays for ------------- */
/* CAP in app.js is 20, so the arrows reach twenty years either side of today.
   A year outside the data renders as an ordinary month with no holidays at
   all and nothing on screen to say why, which is the same silent failure as
   every other fault in this file.

   Reported rather than enforced: closing it needs a regeneration, not an edit,
   and failing the build over it would only block work that has nothing to do
   with holidays. */
{
  const now = new Date().getFullYear(), CAP = 20;
  let lo = 9999, hi = 0;
  for (const c in data){
    const ys = Object.keys(data[c]).map(Number);
    lo = Math.min(lo, Math.min.apply(null, ys));
    hi = Math.max(hi, Math.max.apply(null, ys));
  }
  const wantLo = now - CAP, wantHi = now + CAP;
  console.log("");
  console.log("  Data covers " + lo + " to " + hi + ", " + (hi - lo + 1) + " years.");
  console.log("  The calendar's arrows reach " + wantLo + " to " + wantHi + ".");
  if (lo > wantLo || hi < wantHi){
    const gaps = [];
    if (lo > wantLo) gaps.push(wantLo + " to " + (lo - 1));
    if (hi < wantHi) gaps.push((hi + 1) + " to " + wantHi);
    console.log("  REACHABLE BUT EMPTY: " + gaps.join(", ") + ".");
    console.log("  Regenerate to close it. extract-holidays.py now uses the same CAP.");
  } else {
    console.log("  Every reachable year has data.");
  }
}

/* ---- 9. the classification watchlist (reported, not enforced) ------------- */
{
  console.log("\n  Classification watchlist. These have subdivisions that observe");
  console.log("  different days, so 'national' may be under-reporting. Check each");
  console.log("  against an official source before changing anything.");
  const rows = [];
  for (const c of WATCHLIST){
    const y = data[c] && data[c]["2025"];
    if (!y) continue;
    const keys = Object.keys(y);
    const nat = keys.filter(k => y[k][1] !== 1).length;
    const reg = keys.length - nat;
    rows.push({ c, nat, reg, ratio: nat ? reg / nat : Infinity });
  }
  rows.sort((a,b) => b.ratio - a.ratio);
  for (const r of rows)
    console.log("    " + r.c + "   national " + String(r.nat).padStart(2) +
                "   regional " + String(r.reg).padStart(2) +
                (r.ratio >= 3 ? "   <- regional dominates, worth a look" : ""));
}

console.log("\n  " + (failures ? failures + " CHECK(S) FAILED" : "all structural checks passed"));
console.log("  Reminder: this proves the plumbing, not the dates.");
process.exit(failures ? 1 : 0);
