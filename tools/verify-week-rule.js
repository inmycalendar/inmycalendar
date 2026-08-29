/* RUN: node tools/verify-week-rule.js
   ---------------------------------------------------------------------------
   Checks the three week-numbering rules against independent implementations.

   Why this file exists: a week number that is wrong at the year boundary is
   invisible. Nothing throws, nothing looks odd, and it only surfaces months
   later as a year-on-year comparison that does not line up. So the rules are
   checked against arithmetic that is obviously correct, over four decades, on
   every single day.

   The three rules:
     majority  week 1 is the first week with 4+ of its days in the new year.
               The pivot is the FOURTH day of the week, so it moves with the
               week start: Thursday for Monday, Wednesday for Sunday.
               With weeks starting Monday this IS ISO 8601.
     thursday  week 1 is the week containing the year's first Thursday,
               whatever day the week starts on. Some large organisations use
               this with a SUNDAY start, which gives a week 1 holding only
               three days of the new year. Deliberate, not a bug.
     firstfull week 1 is the first week lying ENTIRELY in the new year, so it
               begins on the first week-start day on or after 1 January and
               never reaches back into December.
     jan1      week 1 is the week containing 1 January.
   --------------------------------------------------------------------------- */
const MS_DAY = 86400000;
const cfg = { weekStart: 0, weekRule: "thursday" };

function sow(d){
  const x = new Date(d.getTime());
  x.setDate(x.getDate() - ((x.getDay() - cfg.weekStart + 7) % 7));
  x.setHours(0,0,0,0); return x;
}
function addDays(d,n){ const x=new Date(d.getTime()); x.setDate(x.getDate()+n); return x; }
function firstDowInYear(y, dow){
  const d = new Date(y,0,1); d.setHours(0,0,0,0);
  while (d.getDay() !== dow) d.setDate(d.getDate()+1);
  return d;
}
function majorityPivot(){ return (cfg.weekStart + 3) % 7; }
function week1Start(y){
  if (cfg.weekRule === "jan1")      return sow(new Date(y,0,1));
  if (cfg.weekRule === "firstfull") return firstDowInYear(y, cfg.weekStart);
  if (cfg.weekRule === "majority")  return sow(firstDowInYear(y, majorityPivot()));
  return sow(firstDowInYear(y, 4));
}
function weeksForYear(y){
  const start = week1Start(y), out = [];
  let n = Math.round((week1Start(y+1) - start) / (7*MS_DAY));
  if (!(n > 0) || n > 60) n = 52;
  for (let i=0;i<n;i++) out.push({ num:i+1, year:y, start: addDays(start, i*7) });
  return out;
}
function appWeek(d){
  const s = sow(d).getTime(), y = d.getFullYear();
  for (const c of [y-1,y,y+1]) for (const w of weeksForYear(c))
    if (w.start.getTime() === s) return w;
  return null;
}

/* Independent reference: real ISO 8601 week and week-year. */
function isoWeekYear(d){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year,0,1));
  return { year, week: Math.ceil((((t - jan1) / MS_DAY) + 1) / 7) };
}

const FROM = 1995, TO = 2035;
function sweep(fn){
  let n = 0, bad = 0, first = null;
  for (let d = new Date(FROM,0,1); d <= new Date(TO,11,31); d = addDays(d,1)){
    n++;
    const r = fn(d);
    if (!r.ok){ bad++; if (!first) first = r.why; }
  }
  return { n, bad, first };
}
const iso = d => d.toISOString().slice(0,10);
let failures = 0;
const report = (label, res) => {
  const ok = res.bad === 0;
  if (!ok) failures++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
              "   " + res.n + " days, " + res.bad + " mismatch" + (res.bad === 1 ? "" : "es") +
              (res.first ? "   first: " + res.first : ""));
};

/* 1. Monday start + majority must BE ISO 8601, exactly. */
cfg.weekStart = 1; cfg.weekRule = "majority";
report("Monday + majority == ISO 8601", sweep(d => {
  const a = appWeek(d), r = isoWeekYear(d);
  return { ok: a && a.num === r.week && a.year === r.year,
           why: iso(d) + " app " + (a ? a.year+"-W"+a.num : "null") + " vs ISO " + r.year+"-W"+r.week };
}));

/* 2. With Monday start the two rules must be indistinguishable, or the labels
      are lying to anyone who switches between them. */
report("Monday: majority and thursday agree", sweep(d => {
  cfg.weekRule = "majority"; const a = appWeek(d);
  cfg.weekRule = "thursday"; const b = appWeek(d);
  return { ok: a && b && a.num === b.num && a.year === b.year,
           why: iso(d) + " majority " + (a?a.year+"-W"+a.num:"null") + " vs thursday " + (b?b.year+"-W"+b.num:"null") };
}));

/* 3. Sunday + thursday is the ISO-week-of-the-following-day convention, which
      is the shorthand several organisations publish for their reporting week. */
cfg.weekStart = 0; cfg.weekRule = "thursday";
report("Sunday + thursday == ISO week of next day", sweep(d => {
  const a = appWeek(d), r = isoWeekYear(addDays(d,1));
  return { ok: a && a.num === r.week && a.year === r.year,
           why: iso(d) + " app " + (a ? a.year+"-W"+a.num : "null") + " vs ref " + r.year+"-W"+r.week };
}));

/* 4. Sunday + majority really does put 4+ days of week 1 in the new year,
      which is the entire promise the label makes. */
cfg.weekStart = 0; cfg.weekRule = "majority";
{
  let bad = 0, first = null;
  for (let y = FROM; y <= TO; y++){
    const s = week1Start(y);
    let inNew = 0;
    for (let i=0;i<7;i++) if (addDays(s,i).getFullYear() === y) inNew++;
    if (inNew < 4){ bad++; if (!first) first = y + " week 1 starts " + iso(s) + " with only " + inNew + " days in " + y; }
  }
  report("Sunday + majority: week 1 always has 4+ days in the year",
         { n: TO-FROM+1, bad, first });
}

/* 5. And the two rules must genuinely DIFFER on a Sunday start, or the third
      option is pointless. 2026 is the case: 1 Jan 2026 is a Thursday. */
{
  cfg.weekStart = 0;
  cfg.weekRule = "thursday"; const t = week1Start(2026);
  cfg.weekRule = "majority"; const m = week1Start(2026);
  const differ = t.getTime() !== m.getTime();
  if (!differ) failures++;
  console.log("  " + (differ ? "ok  " : "FAIL") +
    "  Sunday, 2026: thursday starts week 1 on " + iso(t) +
    ", majority on " + iso(m) + (differ ? "   (they differ, as they must)" : "   (IDENTICAL - the option is pointless)"));
}

/* 6. firstfull must keep ITS promise, on EVERY week start: week 1 holds seven
      days of the new year and not one day of the old one. That is the whole
      reason the rule exists, so it is checked for all seven starts. */
{
  let bad = 0, first = null, n = 0;
  for (let ws = 0; ws <= 6; ws++){
    cfg.weekStart = ws; cfg.weekRule = "firstfull";
    for (let y = FROM; y <= TO; y++){
      n++;
      const s = week1Start(y);
      let inNew = 0;
      for (let i=0;i<7;i++) if (addDays(s,i).getFullYear() === y) inNew++;
      if (inNew !== 7){ bad++; if (!first) first = "weekStart " + ws + ", " + y +
        " week 1 starts " + iso(s) + " with only " + inNew + " days in " + y; }
    }
  }
  report("firstfull: week 1 wholly inside the year, all 7 starts", { n, bad, first });
}

/* 7. And it must be a rule of its own, not a rename of one already present.
      2024 is the case: 1 January 2024 is a Monday, so the other three all
      reach back into December and firstfull alone does not. */
{
  cfg.weekStart = 0;
  const at = r => { cfg.weekRule = r; return iso(week1Start(2024)); };
  const j = at("jan1"), m = at("majority"), t = at("thursday"), f = at("firstfull");
  const alone = f !== j && f !== m && f !== t;
  if (!alone) failures++;
  console.log("  " + (alone ? "ok  " : "FAIL") +
    "  Sunday, 2024: jan1/majority/thursday all start week 1 on " + j +
    ", firstfull on " + f +
    (alone ? "   (distinct, as it must be)" : "   (DUPLICATE - the option is pointless)"));
}

/* 8. No two rules may agree on EVERY year and EVERY week start - a setting
      that never changes anything is a setting that lies to the user. */
{
  const rules = ["majority","thursday","firstfull","jan1"];
  let bad = 0, first = null;
  for (let a = 0; a < rules.length; a++) for (let b = a+1; b < rules.length; b++){
    let same = 0, tot = 0;
    for (let ws = 0; ws <= 6; ws++) for (let y = FROM; y <= TO; y++){
      cfg.weekStart = ws;
      cfg.weekRule = rules[a]; const x = week1Start(y).getTime();
      cfg.weekRule = rules[b]; const z = week1Start(y).getTime();
      tot++; if (x === z) same++;
    }
    if (same === tot){ bad++; if (!first) first = rules[a] + " and " + rules[b] + " never differ"; }
  }
  report("all 4 rules are distinct from one another", { n: 6, bad, first });
}

console.log("\n  " + (failures ? failures + " CHECK(S) FAILED" : "all checks passed"));
process.exit(failures ? 1 : 0);
