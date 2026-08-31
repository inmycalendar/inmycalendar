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

/* ---- 6. horizon coverage (reported, not enforced) ------------------------- */
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

/* ---- 7. the classification watchlist (reported, not enforced) ------------- */
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
