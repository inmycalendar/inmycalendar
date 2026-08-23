"use strict";
/* ===========================================================================
   Generates one real, crawlable page per country under /holidays/.

   WHY THIS EXISTS
   The app can already show any country's holidays at #calendar/JP, but
   everything after "#" is never sent to the server and is never indexed.
   So the app had 247 potential landing pages and Google could see none of
   them. These are the indexable versions.

   They are NOT doorway pages. Each one carries the actual holiday dates for
   three years in a real table - content someone searching "Japan public
   holidays 2027" genuinely wants - and links into the app for the rest.
   A page with a link and no content would deserve to be ignored, and would be.

   RUN:  node tools/build-holiday-pages.js
   Re-run whenever the holiday data or the page shell changes; it overwrites
   /holidays/ entirely, so it is the single source of truth for those files.
   =========================================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT  = path.join(ROOT, "holidays");
const V    = "38";                     /* cache tag, keep in step with the pages */
/* Six years, not three. The data runs 2015-2045, and every extra year is
   another search phrase someone actually types ("public holidays 2030").
   Six is where the page is still readable; the app covers the rest. */
const YEARS = [2026, 2027, 2028, 2029, 2030, 2031];

/* ---- country names, read from the app so the two can never disagree ------ */
const appJs = fs.readFileSync(path.join(ROOT, "assets/app.js"), "utf8");
const m = appJs.match(/var COUNTRIES = (\[.*?\]);\n/s);
if (!m) throw new Error("COUNTRIES list not found in app.js");
const COUNTRIES = eval(m[1]);
const NAME = {};
COUNTRIES.forEach(([code, name]) => { NAME[code] = name; });

/* ---- holiday data -------------------------------------------------------- */
function loadHolidays(code){
  const file = path.join(ROOT, "assets/holidays", code + ".js");
  if (!fs.existsSync(file)) return null;
  let captured = null;
  global.window = { __imcHol: (c, data) => { captured = data; } };
  delete require.cache[require.resolve(file)];
  require(file);
  return captured;
}

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function rowsFor(data, year){
  const y = data[String(year)];
  if (!y) return [];
  return Object.keys(y).sort().map(mmdd => {
    const mo = +mmdd.slice(0,2), da = +mmdd.slice(2,4);
    const d  = new Date(year, mo - 1, da);
    const [name, regional] = y[mmdd];
    return { mo, da, dow: DOW[d.getDay()], name, regional: regional === 1,
             iso: year + "-" + String(mo).padStart(2,"0") + "-" + String(da).padStart(2,"0") };
  });
}

function page(code, name, data){
  const perYear = YEARS.map(y => ({ year:y, rows: rowsFor(data, y) })).filter(x => x.rows.length);
  if (!perYear.length) return null;

  const nationalNow = perYear[0].rows.filter(r => !r.regional).length;
  const title = `Public holidays in ${name} ${YEARS[0]} to ${YEARS[YEARS.length-1]}`;
  const regionalNow = perYear[0].rows.filter(r => r.regional).length;
  const desc  = `Every public holiday in ${name} from ${YEARS[0]} to ${YEARS[YEARS.length-1]}, with dates and days of the week. ` +
                `${nationalNow} national${regionalNow ? " and " + regionalNow + " regional" : ""} holidays in ${YEARS[0]}. ` +
                `Free, and you can plan around them on a year-at-a-glance calendar.`;

  const tables = perYear.map(({ year, rows }) => `
<h2>Public holidays in ${esc(name)} in ${year}</h2>
<div class="tablewrap">
<table>
  <thead><tr><th>Date</th><th>Day</th><th>Holiday</th><th>Type</th></tr></thead>
  <tbody>
${rows.map(r => `    <tr><td>${r.da} ${MONTHS[r.mo-1]}</td><td>${r.dow}</td><td>${esc(r.name)}</td><td>${r.regional ? "Regional" : "National"}</td></tr>`).join("\n")}
  </tbody>
</table>
</div>`).join("\n");

  /* Structured data: a real list of dated events is what search engines and
     AI summaries quote. Only the nearest year, to keep the payload sane. */
  const events = perYear[0].rows.filter(r => !r.regional).slice(0, 40).map(r => ({
    "@type":"Event", "name": r.name, "startDate": r.iso,
    "eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode",
    "location":{"@type":"Place","name":name},
    "description":`${r.name} is a public holiday in ${name}.`
  }));

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
<meta property="og:url" content="https://inmycalendar.com/holidays/${code}.html">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="icon" href="../assets/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
<link rel="canonical" href="https://inmycalendar.com/holidays/${code}.html">
<link rel="stylesheet" href="../assets/site.css?v=${V}">
<style>
.tablewrap{overflow-x:auto;border:1px solid var(--rule);border-radius:var(--r);background:var(--card);margin:0 0 18px}
table{border-collapse:collapse;width:100%;min-width:420px;font-size:13.5px;font-family:var(--sans)}
thead th{text-align:left;font-family:var(--disp);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--soft);font-weight:500;padding:10px 12px;border-bottom:1px solid var(--rule)}
tbody td{padding:9px 12px;border-bottom:1px solid var(--rule2)}
tbody tr:last-child td{border-bottom:0}
.ctrylist{columns:4 170px;column-gap:18px;font-family:var(--sans);font-size:13.5px;margin-top:8px}
.ctrylist a{display:block;padding:2px 0;text-decoration:none;color:var(--ink)}
.ctrylist a:hover{text-decoration:underline}
</style>
<script type="application/ld+json">
${JSON.stringify({ "@context":"https://schema.org", "@graph": events }, null, 1)}
</script>
</head>
<body>
<header class="bar">
 <div class="wrap">
  <a class="brand" href="../index.html"><svg width="22" height="22" viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="26" fill="#18181b"/><rect x="24" y="32" width="80" height="66" rx="10" fill="#fff"/><rect x="24" y="32" width="80" height="18" rx="10" fill="#d4d4d8"/><text x="64" y="90" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="600" font-size="40" fill="#18181b">imc</text></svg><span class="wordmark">in<b>my</b>calendar</span></a>
  <div class="appzone"></div>
  <nav class="sitenav">
    <a href="../index.html#board">Kanban Board</a>
    <a href="../index.html#calendar">Calendar</a>
    <span class="gap"></span>
    <a class="page" href="../about.html">About</a><a class="page" href="../guide.html">Guide</a><a class="page" href="index.html">Holidays</a><a class="page" href="../contact.html">Contact</a><a class="page" href="../privacy.html">Privacy</a>
  </nav>
  <span class="authslot hidden" id="authSlot"></span>
 </div>
</header>

<main class="wrap pagebody"><div class="body">

<h1>${esc(title)}</h1>
<div class="eyebrow"><a href="index.html">All countries</a> &middot; ${nationalNow} national${regionalNow ? " and " + regionalNow + " regional" : ""} holidays in ${YEARS[0]}</div>

<p>Below are the public holidays in ${esc(name)} for every year from ${YEARS[0]} to ${YEARS[YEARS.length-1]}. National holidays apply across the whole country; regional ones apply only in particular states or areas, so check locally before booking anything around them.</p>

<div class="card">
  <p style="margin:0"><strong>See these on a calendar.</strong> <a href="../index.html#calendar/${code}">Open the ${esc(name)} calendar</a> to see every one of these marked on a year-at-a-glance grid, alongside your own leave, travel and deadlines. Free, and no sign-up.</p>
</div>
${tables}

<h2>Planning around them</h2>
<p>Public holidays are most useful when you can see them next to everything else you have on. inmycalendar lays several years out week by week, so a holiday, a week of leave and a deadline two months later are all visible at once, rather than in three separate month views.</p>
<p><a href="../index.html#calendar/${code}">Open the ${esc(name)} calendar</a>, or <a href="../about.html">read what inmycalendar is</a>.</p>

<h2>Other countries</h2>
<p><a href="index.html">Public holidays for 247 countries and territories</a>.</p>

</div></main>
<footer>
  <div class="wrap">
    <a href="../index.html#board">Kanban Board</a><a href="../index.html#calendar">Calendar</a>
    <a href="../about.html">About</a><a href="../guide.html">Guide</a><a href="index.html">Holidays</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a>
    <div style="margin-top:5px">Free, no sign-up needed. Sign in only if you want your board on more than one device.</div>
  </div>
</footer>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="../assets/site.js?v=${V}"></script>
<script src="../assets/auth.js?v=${V}"></script>
</body>
</html>
`;
}

/* ---- build ---------------------------------------------------------------- */
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive:true });
fs.readdirSync(OUT).forEach(f => { if (f.endsWith(".html")) fs.unlinkSync(path.join(OUT, f)); });

const built = [];
COUNTRIES.forEach(([code, name]) => {
  const data = loadHolidays(code);
  if (!data) return;
  const html = page(code, name, data);
  if (!html) return;
  fs.writeFileSync(path.join(OUT, code + ".html"), html);
  built.push({ code, name });
});

/* ---- index page ----------------------------------------------------------- */
const listTitle = `Public holidays by country, ${YEARS[0]} to ${YEARS[YEARS.length-1]}`;
const listDesc  = `Public holiday dates for ${built.length} countries and territories, from ${YEARS[0]} to ${YEARS[YEARS.length-1]}. National and regional holidays, free, with a year-at-a-glance calendar to plan around them.`;
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(listTitle)} - inmycalendar</title>
<meta name="description" content="${esc(listDesc)}">
<meta property="og:title" content="${esc(listTitle)}">
<meta property="og:description" content="${esc(listDesc)}">
<meta property="og:url" content="https://inmycalendar.com/holidays/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="icon" href="../assets/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
<link rel="canonical" href="https://inmycalendar.com/holidays/">
<link rel="stylesheet" href="../assets/site.css?v=${V}">
<style>
.ctrylist{columns:4 170px;column-gap:18px;font-family:var(--sans);font-size:13.5px;margin-top:8px}
.ctrylist a{display:block;padding:2px 0;text-decoration:none;color:var(--ink);break-inside:avoid}
.ctrylist a:hover{text-decoration:underline}
</style>
</head>
<body>
<header class="bar">
 <div class="wrap">
  <a class="brand" href="../index.html"><svg width="22" height="22" viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="26" fill="#18181b"/><rect x="24" y="32" width="80" height="66" rx="10" fill="#fff"/><rect x="24" y="32" width="80" height="18" rx="10" fill="#d4d4d8"/><text x="64" y="90" text-anchor="middle" font-family="Oswald,sans-serif" font-weight="600" font-size="40" fill="#18181b">imc</text></svg><span class="wordmark">in<b>my</b>calendar</span></a>
  <div class="appzone"></div>
  <nav class="sitenav">
    <a href="../index.html#board">Kanban Board</a>
    <a href="../index.html#calendar">Calendar</a>
    <span class="gap"></span>
    <a class="page" href="../about.html">About</a><a class="page" href="../guide.html">Guide</a><a class="page" href="index.html">Holidays</a><a class="page" href="../contact.html">Contact</a><a class="page" href="../privacy.html">Privacy</a>
  </nav>
  <span class="authslot hidden" id="authSlot"></span>
 </div>
</header>

<main class="wrap pagebody"><div class="body">
<h1>Public holidays by country</h1>
<div class="eyebrow">${built.length} countries and territories &middot; ${YEARS[0]} to ${YEARS[YEARS.length-1]}</div>
<p>Pick a country for its public holiday dates, or open any of them on a year-at-a-glance calendar to plan leave, travel and deadlines around them. Free, and no sign-up needed.</p>
<div class="ctrylist">
${built.map(c => `<a href="${c.code}.html">${esc(c.name)}</a>`).join("\n")}
</div>
</div></main>
<footer>
  <div class="wrap">
    <a href="../index.html#board">Kanban Board</a><a href="../index.html#calendar">Calendar</a>
    <a href="../about.html">About</a><a href="../guide.html">Guide</a><a href="index.html">Holidays</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a>
    <div style="margin-top:5px">Free, no sign-up needed. Sign in only if you want your board on more than one device.</div>
  </div>
</footer>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="../assets/site.js?v=${V}"></script>
<script src="../assets/auth.js?v=${V}"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, "index.html"), indexHtml);

/* ---- sitemap -------------------------------------------------------------- */
const core = [
  ["https://inmycalendar.com/", "weekly", "1.0"],
  ["https://inmycalendar.com/about.html", "monthly", "0.8"],
  ["https://inmycalendar.com/guide.html", "monthly", "0.9"],
  ["https://inmycalendar.com/holidays/", "monthly", "0.9"],
  ["https://inmycalendar.com/contact.html", "yearly", "0.3"],
  ["https://inmycalendar.com/privacy.html", "yearly", "0.3"]
];
const urls = core.map(([loc, cf, pr]) =>
  `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${cf}</changefreq>\n    <priority>${pr}</priority>\n  </url>`)
 .concat(built.map(c =>
  `  <url>\n    <loc>https://inmycalendar.com/holidays/${c.code}.html</loc>\n    <changefreq>yearly</changefreq>\n    <priority>0.6</priority>\n  </url>`));
fs.writeFileSync(path.join(ROOT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);

console.log("built " + built.length + " country pages + index, and a sitemap with " + (built.length + core.length) + " URLs");
