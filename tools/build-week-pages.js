/* RUN: node tools/build-week-pages.js
   ---------------------------------------------------------------------------
   Builds /week-number/, the pages that target what people actually search for
   when they need a week number.

   WHY THESE PAGES EXIST

   The 1718 holiday pages compete with timeanddate.com and officeholidays.com,
   which are twenty-year-old domains with enormous authority. Ranking against
   them is not realistic.

   "What week is it" is served by thin single-purpose calculators, most of which
   handle two conventions: ISO and US. This app handles four numbering rules
   across seven week starts, twenty-eight combinations, verified correct on
   every day from 1995 to 2035. That is a real advantage over the incumbents
   rather than a hopeful one, and it had no page at all.

   WHAT IS STATIC AND WHAT IS NOT

   Everything that ranks is in the HTML: the full table of weeks for a year,
   the date ranges, the explanations. A search engine sees all of it without
   running a line of script.

   The one thing that cannot be static is "right now it is week N", because
   that changes weekly and these are files on disk. A small script fills that
   in and highlights the current row. If the script never runs, the page is
   still complete and still correct - it just does not know what day it is.
   --------------------------------------------------------------------------- */
const fs   = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT  = path.join(ROOT, "week-number");
const V    = "64";                    /* keep in step with the other pages */

const THIS_YEAR = 2026;
const YEARS = [THIS_YEAR - 2, THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1, THIS_YEAR + 2, THIS_YEAR + 3];

const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
                          .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const p2  = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + p2(d.getMonth()+1) + "-" + p2(d.getDate());
const nice = d => d.getDate() + " " + MON[d.getMonth()];

/* ---- the week maths, the same four rules the app applies ------------------ */
function sow(d, weekStart){
  const x = new Date(d.getTime());
  x.setDate(x.getDate() - ((x.getDay() - weekStart + 7) % 7));
  x.setHours(0,0,0,0);
  return x;
}
function addDays(d, n){ const x = new Date(d.getTime()); x.setDate(x.getDate()+n); return x; }
function firstDowInYear(y, dow){
  const d = new Date(y,0,1); d.setHours(0,0,0,0);
  while (d.getDay() !== dow) d.setDate(d.getDate()+1);
  return d;
}
function week1Start(y, weekStart, rule){
  if (rule === "jan1")      return sow(new Date(y,0,1), weekStart);
  if (rule === "firstfull") return firstDowInYear(y, weekStart);
  if (rule === "majority")  return sow(firstDowInYear(y, (weekStart + 3) % 7), weekStart);
  return sow(firstDowInYear(y, 4), weekStart);            /* thursday */
}
function weeksIn(y, weekStart, rule){
  const start = week1Start(y, weekStart, rule);
  let n = Math.round((week1Start(y+1, weekStart, rule) - start) / (7 * 86400000));
  if (!(n > 0) || n > 60) n = 52;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ num: i+1, start: addDays(start, i*7), end: addDays(start, i*7+6) });
  return out;
}

/* ---- page furniture -------------------------------------------------------
   Kept in step with tools/build-holiday-pages.js by a test, rather than by
   remembering. A nav link added to one and not the other is invisible until
   someone follows it. */
const STYLE = `
.tablewrap{overflow-x:auto;border:1px solid var(--rule);border-radius:var(--r);background:var(--card);margin:0 0 18px}
table{border-collapse:collapse;width:100%;font-size:13px;min-width:420px}
th,td{padding:7px 12px;text-align:left;border-bottom:1px solid var(--rule)}
thead th{font-family:var(--disp);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--soft);font-weight:500;background:var(--card2)}
tbody tr:last-child td{border-bottom:none}
td.n{font-family:var(--mono);font-weight:700}
tr.nowrow{background:var(--accentBg)}
tr.nowrow td{font-weight:600}
.yearnav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
.yearnav a,.yearnav span{font-family:var(--disp);font-size:12px;letter-spacing:.06em;padding:6px 12px;
  border:1px solid var(--rule);border-radius:7px;text-decoration:none;color:var(--ink);background:var(--card)}
.yearnav a:hover{background:var(--accentBg)}
.yearnav .on{background:var(--accent);color:var(--onAccent);border-color:var(--accent)}
.answer{border:1px solid var(--rule);border-left:3px solid var(--accent);background:var(--card);
  border-radius:var(--r);padding:14px 16px;margin:0 0 20px}
.answer .big{font-family:var(--mono);font-size:26px;font-weight:700;line-height:1.15;display:block;margin-bottom:4px}
.answer .sub{color:var(--soft);font-size:13px}
.cols{display:flex;flex-wrap:wrap;gap:14px;margin:0 0 18px}
.cols>div{flex:1 1 240px;border:1px solid var(--rule);border-radius:var(--r);background:var(--card);padding:12px 14px}
.cols h3{margin:0 0 6px;font-size:13px}
.cols p{margin:0;font-size:13px;color:var(--soft)}`;

function shell({ title, desc, canonical, ld, body }){
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - inmycalendar</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="icon" href="../assets/favicon.ico?v=${V}" sizes="any">
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg?v=${V}">
<link rel="apple-touch-icon" href="../assets/apple-touch-icon-v2.png?v=${V}">
<link rel="manifest" href="../manifest.webmanifest?v=${V}">
<meta name="theme-color" content="#18181b">
<link rel="canonical" href="${canonical}">
<link rel="stylesheet" href="../assets/site.css?v=${V}">
<style>${STYLE}</style>
${ld ? `<script type="application/ld+json">\n${ld}\n</script>` : ""}
</head>
<body>
<header class="bar">
 <div class="wrap">
  <a class="brand" href="../index.html"><svg width="22" height="22" viewBox="0 0 128 128" aria-hidden="true"><rect x="39" y="12" width="7" height="18" rx="3.5" fill="#3f3f46"/><rect x="82" y="12" width="7" height="18" rx="3.5" fill="#3f3f46"/><rect x="10" y="22" width="108" height="94" rx="16" fill="#fff" stroke="#18181b" stroke-width="6"/><path d="M13 40 A13 13 0 0 1 26 25 H102 A13 13 0 0 1 115 40 V44 H13 Z" fill="#18181b"/><text x="64" y="98" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="700" font-size="58" fill="#18181b">imc</text></svg><span class="wordmark">in<b>my</b>calendar</span></a>
  <div class="appzone"></div>
  <nav class="sitenav">
    <a href="../index.html#board"><span class="navlong">Kanban Board</span><span class="navshort">Board</span></a>
    <a href="../index.html#calendar">Calendar</a>
    <span class="gap"></span>
    <a class="page" href="../about.html">About</a><a class="page" href="../guide.html">Guide</a><a class="page" href="../holidays/index.html">Holidays</a><a class="page" href="../contact.html">Contact</a><a class="page" href="../privacy.html">Privacy</a>
  </nav>
  <span class="authslot hidden" id="authSlot"></span>
 </div>
</header>

<main class="wrap pagebody"><div class="body">
${body}
</div></main>
<footer>
  <div class="wrap">
    <a href="../index.html#board">Kanban Board</a><a href="../index.html#calendar">Calendar</a>
    <a href="../about.html">About</a><a href="../guide.html">Guide</a><a href="../holidays/index.html">Holidays</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a>
    <div style="margin-top:5px">Free, no sign-up needed. Sign in only if you want your board on more than one device.</div>
  </div>
</footer>
<script src="../assets/errors.js?v=${V}"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="../assets/site.js?v=${V}"></script>
<script src="../assets/auth.js?v=${V}"></script>
<script src="week.js?v=${V}"></script>
</body>
</html>
`;
}

function yearNav(current){
  return `<div class="yearnav">` +
    YEARS.map(y => y === current
      ? `<span class="on">${y}</span>`
      : `<a href="${y}.html">${y}</a>`).join("") +
    (current === null ? `<span class="on">Now</span>` : `<a href="index.html">Now</a>`) +
    `</div>`;
}

/* Two conventions per table, because those are the two people search for and a
   four-column table on a phone is unreadable. The other twenty-six
   combinations are what the app itself is for. */
function weekTable(year, markToday){
  const isoWeeks = weeksIn(year, 1, "majority");     /* Monday start, 4-day rule = ISO 8601 */
  const usWeeks  = weeksIn(year, 0, "jan1");         /* Sunday start, week of 1 January = US */
  const n = Math.max(isoWeeks.length, usWeeks.length);
  const rows = [];
  for (let i = 0; i < n; i++){
    const a = isoWeeks[i], b = usWeeks[i];
    rows.push(`    <tr${markToday ? ` data-iso-start="${a ? iso(a.start) : ""}"` : ""}>` +
      `<td class="n">${i+1}</td>` +
      `<td>${a ? nice(a.start) + " to " + nice(a.end) : "-"}</td>` +
      `<td>${b ? nice(b.start) + " to " + nice(b.end) : "-"}</td></tr>`);
  }
  return `<div class="tablewrap">
<table>
  <thead><tr><th>Week</th><th>ISO 8601 (Monday start)</th><th>US (Sunday start)</th></tr></thead>
  <tbody>
${rows.join("\n")}
  </tbody>
</table>
</div>`;
}

const EXPLAIN = `<h2>Why two systems disagree</h2>
<p>Everyone agrees a year has weeks. Nobody agrees which one is week 1, and that is where the two numbers come from.</p>
<p><strong>ISO 8601</strong>, used across Europe and by most software, starts weeks on Monday and gives week 1 to the first week with four or more of its days in the new year. That is usually described as "the week containing the first Thursday", which is the same rule said differently: Thursday is the fourth day of a Monday-start week.</p>
<p><strong>The US convention</strong> starts weeks on Sunday and gives week 1 to whatever week holds 1 January. It is easier to explain and it produces a 53rd week far more often.</p>
<p>The two can differ by a full week for the same date, which is exactly the sort of thing that goes unnoticed until two reports disagree at a year end.</p>`;

const RULES = `<h2>The four rules, and why the Thursday one is not arbitrary</h2>
<p>Thursday is not a magic day. It is the <em>fourth</em> day of a week that starts on Monday, so "the week containing the first Thursday" and "the first week with four or more days in the new year" are two ways of saying one thing.</p>
<p>That equivalence dies the moment weeks do not start on Monday. The fourth day of a Sunday-start week is <strong>Wednesday</strong>. Keep the Thursday pivot with a Sunday start and week 1 can hold only three days of the new year, which several large retailers do deliberately for their reporting weeks.</p>
<p>So there are four rules in real use, not one:</p>
<ul>
<li><strong>First week with 4+ days in the new year.</strong> The majority rule. With weeks starting Monday this is exactly ISO 8601.</li>
<li><strong>Week containing the first Thursday.</strong> ISO's pivot kept whatever day your week starts on.</li>
<li><strong>First week fully inside the new year.</strong> Week 1 never begins in December. Common in US federal payroll and in broadcast and retail calendars.</li>
<li><strong>Week containing 1 January.</strong> The simplest to explain, and the one that most often produces a week 53.</li>
</ul>
<p>Combined with the seven possible week-start days, that is twenty-eight ways to number a year. <a href="../index.html#calendar">The calendar</a> does all of them, and shows three years side by side so you can see the effect rather than take it on trust.</p>`;

const CTA = `<div class="callout"><p style="margin:0"><strong>See it on a calendar.</strong> <a href="../index.html#calendar">Open the week calendar</a> for three years of week rows side by side, with your own leave, travel and deadlines marked on them. Free, no sign-up.</p></div>`;

/* ---- build ---------------------------------------------------------------- */
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
fs.readdirSync(OUT).forEach(f => { if (f.endsWith(".html")) fs.unlinkSync(path.join(OUT, f)); });

const written = [];

/* the hub: the query is "what week is it", so the page answers that first */
{
  const title = "What week is it? Current week number";
  const desc  = "The current week number under both the ISO 8601 and US systems, with every week of " +
                THIS_YEAR + " and its dates. Four week-numbering rules and seven week starts, explained.";
  const body = `<h1>What week is it?</h1>
<div class="answer">
  <span class="big" id="nowWeek">Week ${THIS_YEAR}-W__</span>
  <span class="sub" id="nowSub">Loading today's date. The full table below is correct either way.</span>
</div>
<p>Two answers are possible for the same day, because two systems are in common use. Both are in the table below, side by side, for every week of ${THIS_YEAR}.</p>
${yearNav(null)}
${weekTable(THIS_YEAR, true)}
${CTA}
${EXPLAIN}
${RULES}
<p>Other years: ${YEARS.map(y => `<a href="${y}.html">${y}</a>`).join(" &middot; ")}</p>`;
  fs.writeFileSync(path.join(OUT, "index.html"), shell({
    title, desc, canonical: "https://inmycalendar.com/week-number/",
    ld: JSON.stringify({
      "@context":"https://schema.org","@type":"FAQPage","mainEntity":[
        {"@type":"Question","name":"What week number is it now?",
         "acceptedAnswer":{"@type":"Answer","text":"It depends which system you use. ISO 8601 starts weeks on Monday and gives week 1 to the first week with four or more days in the new year. The US convention starts weeks on Sunday and gives week 1 to the week containing 1 January. The two can differ by a full week for the same date."}},
        {"@type":"Question","name":"Why is ISO week 1 the week containing the first Thursday?",
         "acceptedAnswer":{"@type":"Answer","text":"Thursday is the fourth day of a Monday-start week, so the week containing the first Thursday is the same as the first week with four or more of its days in the new year. The two phrasings only match for a Monday start; the fourth day of a Sunday-start week is Wednesday."}},
        {"@type":"Question","name":"How many weeks are in a year?",
         "acceptedAnswer":{"@type":"Answer","text":"52 in most years and 53 in some, depending on the rule and on which day your week starts. The week containing 1 January rule produces a 53rd week far more often than the ISO rule does."}}]}, null, 1),
    body
  }));
  written.push({ file: "index.html", loc: "https://inmycalendar.com/week-number/", pri: "0.9" });
}

/* one page per year: the exact-match query is "week numbers 2027" */
for (const year of YEARS){
  const title = "Week numbers " + year;
  const desc  = "Every week of " + year + " with its dates, under both ISO 8601 and the US convention. " +
                "Week 1 starts " + iso(week1Start(year, 1, "majority")) + " under ISO.";
  const body = `<h1>Week numbers ${year}</h1>
<p>All ${weeksIn(year, 1, "majority").length} ISO weeks of ${year} with their date ranges, alongside the US numbering for the same weeks. Under ISO 8601, week 1 of ${year} begins on <strong>${nice(week1Start(year,1,"majority"))} ${week1Start(year,1,"majority").getFullYear()}</strong>.</p>
${yearNav(year)}
${weekTable(year, year === THIS_YEAR)}
${CTA}
${EXPLAIN}
<p>Other years: ${YEARS.filter(y=>y!==year).map(y => `<a href="${y}.html">${y}</a>`).join(" &middot; ")} &middot; <a href="index.html">what week is it now</a></p>`;
  fs.writeFileSync(path.join(OUT, year + ".html"), shell({
    title, desc, canonical: "https://inmycalendar.com/week-number/" + year + ".html", body
  }));
  written.push({ file: year + ".html", loc: "https://inmycalendar.com/week-number/" + year + ".html",
                 pri: (year === THIS_YEAR || year === THIS_YEAR + 1) ? "0.8" : "0.5" });
}

/* the explainer, which is the page that earns links rather than clicks */
{
  const title = "ISO 8601 week numbers, and how they differ from US weeks";
  const desc  = "Why ISO week 1 is the week containing the first Thursday, why that is the same as the " +
                "four-day rule, and where the US convention gives a different answer for the same date.";
  const body = `<h1>ISO 8601 week numbers, and how they differ from US weeks</h1>
<p>If two people look up the same date and get different week numbers, neither is wrong. They are using different rules, and both rules are in real use.</p>
${EXPLAIN}
${RULES}
<h2>A worked example</h2>
<p>1 January 2026 is a Thursday. With weeks starting Sunday, the Thursday rule puts week 1 on <strong>${nice(week1Start(2026,0,"thursday"))} ${week1Start(2026,0,"thursday").getFullYear()}</strong>, holding only three days of 2026. The four-day rule puts it on <strong>${nice(week1Start(2026,0,"majority"))} 2026</strong>. A whole week apart, for the same year, on the same calendar.</p>
<p>Neither is a mistake. Which one is right depends entirely on whose reporting week you have to match.</p>
${CTA}
<p><a href="index.html">What week is it now</a> &middot; ${YEARS.map(y => `<a href="${y}.html">${y}</a>`).join(" &middot; ")}</p>`;
  fs.writeFileSync(path.join(OUT, "iso-week-numbers.html"), shell({
    title, desc, canonical: "https://inmycalendar.com/week-number/iso-week-numbers.html", body
  }));
  written.push({ file: "iso-week-numbers.html",
                 loc: "https://inmycalendar.com/week-number/iso-week-numbers.html", pri: "0.7" });
}

/* the tiny script that fills in "right now". Everything above it is already
   complete without this file; it only adds what a static page cannot know. */
fs.writeFileSync(path.join(OUT, "week.js"), `/* Fills in today's week number and highlights its row.
   The page is complete and correct without this: it only supplies the one fact
   a file on disk cannot know, which is what day you are reading it on. */
(function(){
  function p2(n){ return String(n).padStart(2,"0"); }
  function isoOf(d){ return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate()); }
  function sow(d, ws){ var x=new Date(d.getTime()); x.setDate(x.getDate()-((x.getDay()-ws+7)%7)); x.setHours(0,0,0,0); return x; }
  function firstDow(y,dow){ var d=new Date(y,0,1); d.setHours(0,0,0,0); while(d.getDay()!==dow) d.setDate(d.getDate()+1); return d; }
  function w1(y,ws,rule){
    if (rule==="jan1") return sow(new Date(y,0,1),ws);
    if (rule==="majority") return sow(firstDow(y,(ws+3)%7),ws);
    return sow(firstDow(y,4),ws);
  }
  function weekOf(d, ws, rule){
    var s=sow(d,ws), y=d.getFullYear();
    for (var c=y+1;c>=y-1;c--){
      var a=w1(c,ws,rule);
      if (s>=a){ return { year:c, num: Math.round((s-a)/(7*86400000))+1 }; }
    }
    return null;
  }
  var today=new Date(); today.setHours(0,0,0,0);
  var isoW=weekOf(today,1,"majority"), usW=weekOf(today,0,"jan1");
  var big=document.getElementById("nowWeek"), sub=document.getElementById("nowSub");
  if (big && isoW) big.textContent="Week "+isoW.year+"-W"+p2(isoW.num);
  if (sub && isoW && usW){
    sub.textContent="ISO 8601 week "+isoW.num+" of "+isoW.year+
      "  \\u00b7  US week "+usW.num+"  \\u00b7  today is "+isoOf(today);
  }
  var s=isoOf(sow(today,1));
  var row=document.querySelector('tr[data-iso-start="'+s+'"]');
  if (row){ row.className="nowrow"; }
})();
`);

console.log("  built " + written.length + " pages in /week-number/");
written.forEach(w => console.log("    " + w.file));

/* ---- hand the new URLs to the sitemap builder ----------------------------- */
fs.writeFileSync(path.join(__dirname, "week-pages.json"), JSON.stringify(written, null, 1) + "\n");
console.log("  wrote tools/week-pages.json for the sitemap");
