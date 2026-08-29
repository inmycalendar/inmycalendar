/* RUN: node tools/verify-week-rule.js
   Checks the app's week numbering against an organisation whose weeks start
   on Sunday and whose week 1 is the one containing the first Thursday - the
   convention several large companies use for reporting weeks.
   Kept because the rule is easy to get subtly wrong at the year boundary and
   a wrong week number is invisible until it corrupts a year-on-year report. */
/* Does inmycalendar, set to "week starts Sunday" + "first week with 4+ days",
   produce AMAZON week numbers?

   The wiki defines the Amazon week two equivalent ways:
     - weeks start Sunday, and week 1 is the first week containing a Thursday
     - the Amazon week number equals the ISO week number of the FOLLOWING day

   The second is the one to test against, because it is trivially correct and
   is what every snippet on that page uses.

   This replicates the app's own functions exactly as written in assets/app.js.
*/
const MS_DAY = 86400000;
const cfg = { weekStart: 0, weekRule: "thursday" };   // Sunday, first-Thursday

function sow(d){
  const x = new Date(d.getTime());
  x.setDate(x.getDate() - ((x.getDay() - cfg.weekStart + 7) % 7));
  x.setHours(0,0,0,0); return x;
}
function addDays(d,n){ const x=new Date(d.getTime()); x.setDate(x.getDate()+n); return x; }
function firstThursday(y){
  const d = new Date(y,0,1); d.setHours(0,0,0,0);
  while (d.getDay() !== 4) d.setDate(d.getDate()+1);
  return d;
}
function week1Start(y){ return sow(firstThursday(y)); }
function weeksForYear(y){
  const start = week1Start(y), out = [];
  let n = Math.round((week1Start(y+1) - start) / (7*MS_DAY));
  if (!(n > 0) || n > 60) n = 52;
  for (let i=0;i<n;i++) out.push({ num:i+1, year:y, start: addDays(start, i*7) });
  return out;
}
function appWeek(d){
  const s = sow(d).getTime(), y = d.getFullYear();
  for (const c of [y-1,y,y+1]){
    for (const w of weeksForYear(c)) if (w.start.getTime() === s) return w;
  }
  return null;
}

/* The reference: ISO week (and ISO week-year) of the following day. */
function isoWeekYear(d){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;               // Mon=1..Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day);       // the Thursday of that ISO week
  const year = t.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year,0,1));
  const week = Math.ceil((((t - jan1) / MS_DAY) + 1) / 7);
  return { year, week };
}
function amazonWeek(d){ return isoWeekYear(addDays(d,1)); }

/* ---- 1. the specific facts the wiki states ---------------------------- */
const iso = d => d.toISOString().slice(0,10);
const named = [
  ["2008-12-28", 2009,  1, "wiki: week 1 of 2009 began on 28 Dec 2008"],
  ["2011-01-01", 2010, 52, "wiki sample table: 1 Jan 2011 is week 52 of 2010"],
  ["2011-01-02", 2011,  1, "wiki sample table: 2 Jan 2011 is week 1 of 2011"],
  ["2010-12-26", 2010, 52, "wiki sample table"],
  ["2012-12-29", 2012, 52, "Access section: 29 Dec 2012 is week 52"],
  ["2012-12-30", 2013,  1, "Access section: 30 Dec 2012 is week 1 of 2013"],
  ["2004-01-02", 2004,  1, "Access section: 2 Jan 2004 is week 1"],
];
console.log("=== against the facts stated on the wiki page ===");
let bad = 0;
for (const [ds, wantY, wantW, why] of named){
  const d = new Date(ds + "T00:00:00");
  const got = appWeek(d);
  const ok = got && got.year === wantY && got.num === wantW;
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + ds +
              "  app says " + (got ? got.year + "-W" + String(got.num).padStart(2,"0") : "null") +
              "   expected " + wantY + "-W" + String(wantW).padStart(2,"0") + "   (" + why + ")");
}

/* ---- 2. every day over a long range, against ISO-week-of-next-day ------ */
console.log("\n=== every day 1995-01-01 to 2035-12-31, against the +1 day rule ===");
let checked = 0, mismatch = 0, first = null;
for (let d = new Date(1995,0,1); d <= new Date(2035,11,31); d = addDays(d,1)){
  const a = appWeek(d), r = amazonWeek(d);
  checked++;
  if (!a || a.num !== r.week || a.year !== r.year){
    mismatch++;
    if (!first) first = iso(d) + "  app " + (a ? a.year+"-W"+a.num : "null") + "  vs  amazon " + r.year+"-W"+r.week;
  }
}
console.log("  days checked: " + checked);
console.log("  mismatches:   " + mismatch + (first ? "   first: " + first : ""));

/* ---- 3. the 53-week years the wiki calls out --------------------------- */
console.log("\n=== years with 53 weeks (wiki: any year starting Thursday, or a leap year starting Wednesday) ===");
const long = [];
for (let y=2015; y<=2035; y++) if (weeksForYear(y).length === 53) long.push(y);
console.log("  app reports 53 weeks in: " + long.join(", "));
console.log("  wiki names 2020 explicitly as one: " + (long.indexOf(2020) >= 0 ? "yes" : "NO"));

console.log("\n  VERDICT: " + (bad === 0 && mismatch === 0
  ? "with week start = Sunday and the first-Thursday rule, the app's week numbers ARE Amazon week numbers."
  : "the app does NOT match Amazon week numbers - do not link it from that page."));
