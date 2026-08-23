"use strict";
/* ===========================================================================
   Generates the crawlable holiday pages under /holidays/.

   WHY THIS SHAPE
   Google ranks a PAGE against a QUERY. People type "public holidays in India
   2027", so the page that wins is the one whose title is exactly that - not a
   section inside a page called "2026 to 2031". Hence:

     /holidays/index.html      every country, one list
     /holidays/IN.html         India: hub, current year in full, links to years
     /holidays/IN-2027.html    India 2027: that year in full, exact-match title

   The app can already show any of this at #calendar/IN, but everything after
   "#" is never sent to a server and never indexed. These are the indexable
   twins of that view.

   None of them is a doorway page: every one carries the real dates, national
   AND regional, which is what the person searching actually wants. A page that
   is a link and nothing else deserves to be ignored, and would be.

   The window is six years, not the full 2015-2045 range the data holds. A page
   for a year nobody searches does not earn traffic, it dilutes the ones that
   do, and 31 years per country would be 7,600 thin pages.

   RUN:  node tools/build-holiday-pages.js
   It overwrites /holidays/ entirely and rewrites sitemap.xml, so it is the
   single source of truth for both. Never hand-edit a file it produces.
   =========================================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT  = path.join(ROOT, "holidays");
const V    = "44";                        /* cache tag, keep in step with the pages */

const THIS_YEAR = 2026;
const YEARS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1, THIS_YEAR + 2, THIS_YEAR + 3, THIS_YEAR + 4];

const appJs = fs.readFileSync(path.join(ROOT, "assets/app.js"), "utf8");
const m = appJs.match(/var COUNTRIES = (\[.*?\]);\n/s);
if (!m) throw new Error("COUNTRIES list not found in app.js");
const COUNTRIES = eval(m[1]);

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
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
                          .replace(/>/g,"&gt;").replace(/"/g,"&quot;");

function rowsFor(data, year){
  const y = data[String(year)];
  if (!y) return [];
  return Object.keys(y).sort().map(mmdd => {
    const mo = +mmdd.slice(0,2), da = +mmdd.slice(2,4);
    const [name, regional] = y[mmdd];
    return { mo, da, dow: DOW[new Date(year, mo-1, da).getDay()], name,
             regional: regional === 1,
             iso: year + "-" + String(mo).padStart(2,"0") + "-" + String(da).padStart(2,"0") };
  });
}

const STYLE = `
.tablewrap{overflow-x:auto;border:1px solid var(--rule);border-radius:var(--r);background:var(--card);margin:0 0 18px}
table{border-collapse:collapse;width:100%;min-width:420px;font-size:13.5px;font-family:var(--sans)}
thead th{text-align:left;font-family:var(--disp);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--soft);font-weight:500;padding:10px 12px;border-bottom:1px solid var(--rule)}
tbody td{padding:9px 12px;border-bottom:1px solid var(--rule2)}
tbody tr:last-child td{border-bottom:0}
tbody tr.reg td{color:var(--soft)}
.ctrylist{columns:4 170px;column-gap:18px;font-family:var(--sans);font-size:13.5px;margin-top:8px}
.ctrylist a{display:block;padding:2px 0;text-decoration:none;color:var(--ink);break-inside:avoid}
.ctrylist a:hover{text-decoration:underline}
.yearnav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
.yearnav a,.yearnav span{font-family:var(--disp);font-size:12px;letter-spacing:.06em;padding:6px 12px;
  border:1px solid var(--rule);border-radius:7px;text-decoration:none;color:var(--ink);background:var(--card)}
.yearnav a:hover{background:var(--accentBg)}
.yearnav .on{background:var(--accent);color:var(--onAccent);border-color:var(--accent)}`;

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
<link rel="icon" href="../assets/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
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
    <a class="page" href="../about.html">About</a><a class="page" href="../guide.html">Guide</a><a class="page" href="index.html">Holidays</a><a class="page" href="../contact.html">Contact</a><a class="page" href="../privacy.html">Privacy</a>
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

function table(rows){
  return `<div class="tablewrap">
<table>
  <thead><tr><th>Date</th><th>Day</th><th>Holiday</th><th>Type</th></tr></thead>
  <tbody>
${rows.map(r => `    <tr${r.regional ? ' class="reg"' : ''}><td>${r.da} ${MONTHS[r.mo-1]}</td><td>${r.dow}</td><td>${esc(r.name)}</td><td>${r.regional ? "Regional" : "National"}</td></tr>`).join("\n")}
  </tbody>
</table>
</div>`;
}

function yearNav(code, current, available){
  return `<div class="yearnav">` + available.map(y =>
    y === current ? `<span class="on">${y}</span>`
                  : `<a href="${code}-${y}.html">${y}</a>`).join("") + `</div>`;
}

function eventsLd(rows, name){
  const events = rows.filter(r => !r.regional).slice(0, 40).map(r => ({
    "@type":"Event", "name": r.name, "startDate": r.iso,
    "eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode",
    "location":{"@type":"Place","name":name},
    "description":`${r.name} is a public holiday in ${name}.`
  }));
  return JSON.stringify({ "@context":"https://schema.org", "@graph": events }, null, 1);
}

/* ---------------- build ---------------- */
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive:true });
fs.readdirSync(OUT).forEach(f => { if (f.endsWith(".html")) fs.unlinkSync(path.join(OUT, f)); });

const built = [];
const yearPages = [];

COUNTRIES.forEach(([code, name]) => {
  const data = loadHolidays(code);
  if (!data) return;
  const years = YEARS.filter(y => rowsFor(data, y).length);
  if (!years.length) return;

  /* ---- one page per year: the exact-match title people search for ---- */
  years.forEach(year => {
    const rows = rowsFor(data, year);
    const nat = rows.filter(r => !r.regional).length;
    const reg = rows.length - nat;
    const title = `Public holidays in ${name} ${year}`;
    const desc = `All ${nat} national${reg ? ` and ${reg} regional` : ""} public holidays in ${name} in ${year}, `
               + `with the date and day of the week for each. Free, and you can see them on a year calendar.`;
    const idx = years.indexOf(year);
    const prev = idx > 0 ? years[idx-1] : null;
    const next = idx < years.length-1 ? years[idx+1] : null;

    const wk = rows.filter(r => !r.regional && r.dow !== "Saturday" && r.dow !== "Sunday").length;
    const we = nat - wk;
    const weekdayLine = !nat
      ? "No national holidays are recorded for this year."
      : `Of the ${nat} national holidays in ${year}, ${wk} fall on a weekday and ${we} at a weekend. `
        + (we ? "A holiday landing on a weekend is worth spotting early if you were counting on a long one."
              : "Every one lands on a weekday this year.");

    const body = `
<h1>${esc(title)}</h1>
<div class="eyebrow"><a href="${code}.html">${esc(name)}</a> &middot; <a href="index.html">All countries</a> &middot; ${nat} national${reg ? `, ${reg} regional` : ""}</div>
${yearNav(code, year, years)}
<p>Every public holiday in ${esc(name)} in ${year} is listed below, with the day of the week each one falls on. National holidays apply across the whole country. Regional ones apply only in certain states or areas, so check locally before booking anything around them.</p>

<div class="card">
  <p style="margin:0"><strong>See ${year} on a calendar.</strong> <a href="../index.html#calendar/${code}">Open the ${esc(name)} calendar</a> to see these marked on a year-at-a-glance grid next to your own leave, travel and deadlines. Free, no sign-up.</p>
</div>

<h2>Public holiday dates in ${esc(name)}, ${year}</h2>
${table(rows)}

<h2>Which days of the week they fall on</h2>
<p>${weekdayLine}</p>
${prev || next ? `<h2>Other years</h2>\n<p>${
  [prev ? `<a href="${code}-${prev}.html">Public holidays in ${esc(name)} ${prev}</a>` : null,
   next ? `<a href="${code}-${next}.html">Public holidays in ${esc(name)} ${next}</a>` : null]
  .filter(Boolean).join(" &middot; ")}</p>` : ""}

<h2>Other countries</h2>
<p><a href="index.html">Public holidays for 247 countries and territories</a>, or back to <a href="${code}.html">${esc(name)}</a>.</p>`;

    fs.writeFileSync(path.join(OUT, `${code}-${year}.html`),
      shell({ title, desc, canonical:`https://inmycalendar.com/holidays/${code}-${year}.html`,
              ld: eventsLd(rows, name), body }));
    yearPages.push({ code, year });
  });

  /* ---- country hub ---- */
  const hubYear = years.indexOf(THIS_YEAR) > -1 ? THIS_YEAR : years[0];
  const hubRows = rowsFor(data, hubYear);
  const hubNat = hubRows.filter(r => !r.regional).length;
  const hubReg = hubRows.length - hubNat;
  const hubTitle = `Public holidays in ${name}`;
  const hubDesc = `Public holidays in ${name} for ${years[0]} to ${years[years.length-1]}. `
                + `${hubNat} national${hubReg ? ` and ${hubReg} regional` : ""} holidays in ${hubYear}, with dates and days of the week.`;
  const hubBody = `
<h1>Public holidays in ${esc(name)}</h1>
<div class="eyebrow"><a href="index.html">All countries</a> &middot; ${years[0]} to ${years[years.length-1]}</div>
${yearNav(code, hubYear, years)}
<p>Public holiday dates for ${esc(name)}, year by year. Pick a year above for the full list, or read ${hubYear} below.</p>

<div class="card">
  <p style="margin:0"><strong>See them on a calendar.</strong> <a href="../index.html#calendar/${code}">Open the ${esc(name)} calendar</a> to plan leave, travel and deadlines around them on a year-at-a-glance grid. Free, no sign-up.</p>
</div>

<h2>Public holidays in ${esc(name)}, ${hubYear}</h2>
${table(hubRows)}

<h2>Every year</h2>
<ul>
${years.map(y => `  <li><a href="${code}-${y}.html">Public holidays in ${esc(name)} ${y}</a></li>`).join("\n")}
</ul>

<h2>Other countries</h2>
<p><a href="index.html">Public holidays for 247 countries and territories</a>.</p>`;

  fs.writeFileSync(path.join(OUT, `${code}.html`),
    shell({ title: hubTitle, desc: hubDesc, canonical:`https://inmycalendar.com/holidays/${code}.html`,
            ld: eventsLd(hubRows, name), body: hubBody }));
  built.push({ code, name, years });
});

/* ---- index ---- */
const listDesc = `Public holiday dates for ${built.length} countries and territories, ${YEARS[0]} to ${YEARS[YEARS.length-1]}. `
               + `National and regional holidays, free, with a year-at-a-glance calendar to plan around them.`;
const listBody = `
<h1>Public holidays by country</h1>
<div class="eyebrow">${built.length} countries and territories &middot; ${YEARS[0]} to ${YEARS[YEARS.length-1]}</div>
<p>Pick a country for its public holiday dates, year by year, national and regional. Every one can be opened on a year-at-a-glance calendar to plan leave, travel and deadlines around. Free, and no sign-up needed.</p>
<div class="ctrylist">
${built.map(c => `<a href="${c.code}.html">${esc(c.name)}</a>`).join("\n")}
</div>`;
fs.writeFileSync(path.join(OUT, "index.html"),
  shell({ title: "Public holidays by country", desc: listDesc,
          canonical:"https://inmycalendar.com/holidays/", ld: null, body: listBody }));

/* ---- sitemap ---- */
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
    `  <url>\n    <loc>https://inmycalendar.com/holidays/${c.code}.html</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`))
  .concat(yearPages.map(({ code, year }) => {
    /* this year and next are what people search now; the rest still get indexed */
    const pri = (year === THIS_YEAR || year === THIS_YEAR + 1) ? "0.8" : "0.5";
    return `  <url>\n    <loc>https://inmycalendar.com/holidays/${code}-${year}.html</loc>\n    <changefreq>yearly</changefreq>\n    <priority>${pri}</priority>\n  </url>`;
  }));
fs.writeFileSync(path.join(ROOT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);

console.log(`built ${built.length} country hubs + ${yearPages.length} year pages + index`);
console.log(`sitemap lists ${urls.length} URLs`);
