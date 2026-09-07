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

   IT IS NO LONGER A SIX-YEAR WINDOW. It used to be, on the argument that a page
   for a year nobody searches dilutes the ones that do. That argument is wrong
   here, and the note is kept rather than deleted because it was believed for a
   while: these pages are not thin. Every one carries that country's real dates
   for that year, national and regional, which exist nowhere else on the site
   and cannot be derived from a neighbouring year. The dilution argument applies
   to pages that are a link and a heading; it does not apply to a page that is
   the only place a fact is written down.

   So all 31 years the data holds are published, 2015 to 2045. That is 7,602
   year pages, and the cost is real - a rebuild rewrites all of them - but the
   data was already in the repo and 25 years of it were simply not reachable.

   RUN:  node tools/build-holiday-pages.js
   It overwrites /holidays/ entirely and rewrites sitemap.xml, so it is the
   single source of truth for both. Never hand-edit a file it produces.
   =========================================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT  = path.join(ROOT, "holidays");
const V    = "80";                        /* cache tag, keep in step with the pages */

const THIS_YEAR = 2026;

/* EVERY YEAR THERE IS DATA FOR, not a window around today.

   This used to be [THIS_YEAR-1 .. THIS_YEAR+4] - six years - while the country
   files in assets/holidays have carried thirty-one, 2015 to 2045, all along.
   Twenty-five years of data were sitting in the repo unpublished, so a search
   for "public holidays in Germany 2038" found nothing here and the app's own
   calendar could show a year the site had no page for.

   Derived from the files rather than written down, so it follows the data if
   the data is ever refetched. Nothing outside 2015-2045 can be added by
   widening this: holiday RULES change - Juneteenth only became a US federal
   holiday in 2021 - so a year with no data cannot be computed from a
   neighbouring one, it has to be fetched.

   Each country is filtered again below to the years IT has, so a file with a
   shorter run does not get pages full of nothing. */
const YEARS = (() => {
  const dir = path.join(ROOT, "assets/holidays");
  const seen = new Set();
  fs.readdirSync(dir).forEach(f => {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    (raw.match(/"(19|20)\d{2}":\{/g) || []).forEach(s => seen.add(+s.slice(1, 5)));
  });
  return [...seen].sort((a, b) => a - b);
})();

const appJs = fs.readFileSync(path.join(ROOT, "assets/app.js"), "utf8");
/* \r?\n, not \n. Git checks this repo out with CRLF on Windows and LF on
   Linux, so a pattern anchored to a bare \n matches on the CI runner and fails
   on a Windows machine - which is exactly what happened: the generator threw,
   the holiday pages kept the previous build tag, and the only symptom was a
   version-consistency test failing with no obvious connection to line endings. */
const m = appJs.match(/var COUNTRIES = (\[[\s\S]*?\]);\r?\n/);
if (!m) throw new Error(
  "COUNTRIES list not found in assets/app.js.\n" +
  "The declaration must read: var COUNTRIES = [ ... ];  on its own line.");
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
/* THE HEADING STICKS AT EVERY WIDTH.
   These tables run to sixty-five rows. On a laptop that is about two screens,
   so the column headings scroll away after ten and the rest of the year is
   three unlabelled columns of text - the same fault as on a phone, just later.

   .tablewrap used to be overflow-x:auto, and a box with overflow on either axis
   is a SCROLL CONTAINER, which is what position:sticky measures against: the
   heading stuck to a box that never scrolls vertically, so it did not stick at
   all. The sideways scroll was insurance against a table too wide for its
   column, and with min-width gone there is no such table - measured at 641,
   900 and 1400px, nothing overflows and no row wraps badly. */
.tablewrap{border:1px solid var(--rule);border-radius:var(--r);background:var(--card);margin:0 0 18px}
table{border-collapse:collapse;width:100%;font-size:13.5px;font-family:var(--sans)}
thead th{text-align:left;font-family:var(--disp);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--soft);font-weight:500;padding:10px 12px;border-bottom:1px solid var(--rule);
  position:sticky;top:0;z-index:2;background:var(--card)}
tbody td{padding:9px 12px;border-bottom:1px solid var(--rule2)}
tbody tr:last-child td{border-bottom:0}
tbody tr.reg td{color:var(--soft)}
.ctrylist{columns:4 170px;column-gap:18px;font-family:var(--sans);font-size:13.5px;margin-top:8px}
.ctrylist a{display:block;padding:2px 0;text-decoration:none;color:var(--ink);break-inside:avoid}
.ctrylist a:hover{text-decoration:underline}

/* FINDING ONE OF 246 COUNTRIES, at any width.
   Four columns on a wide screen is scannable in a way two columns on a phone
   is not, but scanning 246 names is still the wrong way to reach one you can
   already name. The box is narrow here and full-width on a phone; everything
   below it stays phone-only. */
.ctryfind{display:block;width:100%;max-width:320px;margin:14px 0 2px;padding:9px 12px;
  font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--card);
  border:1px solid var(--rule);border-radius:9px}
.ctryfind:focus{outline:none;border-color:var(--accent)}
.ctrycount{font-family:var(--disp);font-size:10px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--faint);padding:6px 2px 0}
.ctrylist a.nomatch{display:none}

@media (max-width:640px){
  /* Full width, and 16px or iOS zooms the page the moment it is focused. */
  .ctryfind{max-width:none;font-size:16px;padding:12px 14px;margin-bottom:4px}
  .ctrycount{padding-top:8px}
  /* TWO columns, and rows a thumb can hit.

     One column at 44px was the first attempt and it made this page 13.5
     screens long - 246 rows of 44px is 10,800px. Two columns halves that to
     about 6.4 while leaving each row 180px wide and 44 tall, which is still a
     comfortable target: the 44 that matters here is the height.

     The filter above is the fast path and this is the browsing one, so the
     browsing one should not be a five-minute scroll. break-inside keeps a
     two-line country name whole. */
  .ctrylist{columns:2;column-gap:14px;font-size:14px;margin-top:4px}
  .ctrylist a{min-height:44px;display:flex;align-items:center;
    border-top:1px solid var(--rule2);padding:4px 0;break-inside:avoid}
}
.yearnav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
/* THIRTY-ONE YEARS, not six.
   Wrapped, that is three rows on a desktop and five on a phone - about 180px
   of year chips above the thing you came to read. On a phone it becomes one
   row that scrolls sideways instead, which is what a strip of chips is for.
   flex-wrap:nowrap is deliberate here and unlike the case the app's stylesheet
   bans it for: that was a row of unknown content where a tight fit turned into
   overlapping text. This is fixed-width chips in a box that scrolls, so a
   tight fit is the normal state rather than a failure.
   site.js scrolls the current year into view, or you would land on 2015. */
@media (max-width:640px){
  .yearnav{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;
    margin:0 -14px 16px;padding:2px 14px 8px;scroll-padding:0 14px}
  .yearnav::-webkit-scrollbar{display:none}
  .yearnav a,.yearnav span{flex:none;min-height:38px;display:inline-flex;
    align-items:center;scroll-snap-align:center}
}
.yearnav a,.yearnav span{font-family:var(--disp);font-size:12px;letter-spacing:.06em;padding:6px 12px;
  border:1px solid var(--rule);border-radius:7px;text-decoration:none;color:var(--ink);background:var(--card)}
.yearnav a:hover{background:var(--accentBg)}
.yearnav .on{background:var(--accent);color:var(--onAccent);border-color:var(--accent)}

/* THE FOURTH COLUMN DOES NOT FIT ON A PHONE.
   Measured at 390px: the table is 420px inside a wrapper that scrolls, so 56px
   is hidden to the right - the whole National/Regional column. Nothing on
   screen said it scrolled, so it did not read as scrollable, it read as broken:
   the heading cut to "TY" and every row ending in a clipped N or R.

   A scroll shadow was tried first. It made the scrolling discoverable and left
   the column exactly as unreadable, which is solving the wrong half.

   So the column comes out below 640px and the table then fits with no sideways
   scrolling at all. Nothing is lost: regional rows already carry .reg, so a
   small grey marker after the holiday name says the same thing in the space
   that exists. National days get no marker because they are the default and the
   majority, and labelling the common case is noise.

   Inside a max-width query, so the four-column desktop table is untouched. */
@media (max-width:640px){
  table{min-width:0}
  thead th:nth-child(4),tbody td:nth-child(4){display:none}
  tbody tr.reg td:nth-child(3)::after{content:" · regional";color:var(--soft);
    font-size:11px;white-space:nowrap}
}`;

function shell({ title, desc, canonical, ld, body }){
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} - inmycalendar</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<link rel="icon" href="../assets/favicon.ico?v=${V}" sizes="any">
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg?v=${V}">
<link rel="apple-touch-icon" href="../assets/apple-touch-icon-v2.png?v=${V}">
<link rel="manifest" href="../manifest.webmanifest?v=${V}">
<script>/* theme before first paint - see the dark block in site.css */
try{var t=localStorage.getItem("imc.theme");if(t!=="system")document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){}</script>
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6f7f9">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f1115">
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
<!-- The same four destinations as the app, in the same place. A tab bar that
     is missing on some pages teaches you where to look and then takes it away,
     which is what tapping Holidays used to do. Hidden above 640px. -->
<nav class="tabbar" aria-label="Main">
  <a class="tab" href="../index.html#board"><span class="ti" aria-hidden="true">&#9635;</span><span class="tl">Board</span></a>
  <a class="tab" href="../index.html#calendar"><span class="ti" aria-hidden="true">&#9638;</span><span class="tl">Calendar</span></a>
  <a class="tab" data-tab="holidays" href="index.html"><span class="ti" aria-hidden="true">&#9733;</span><span class="tl">Holidays</span></a>
  <a class="tab" href="../index.html#settings"><span class="ti" aria-hidden="true">&#9881;</span><span class="tl">Settings</span></a>
</nav>

<footer>
  <div class="wrap">
    <a href="../index.html#board">Kanban Board</a><a href="../index.html#calendar">Calendar</a>
    <a href="../about.html">About</a><a href="../guide.html">Guide</a><a href="index.html">Holidays</a><a href="../contact.html">Contact</a><a href="../privacy.html">Privacy</a><a href="../terms.html">Terms</a>
    <div style="margin-top:5px">Free, no sign-up needed. Sign in only if you want your board on more than one device.</div>
  </div>
</footer>
<script src="../assets/errors.js?v=${V}"></script>
<script src="../assets/vendor/supabase.js?v=${V}"></script>
<script src="../assets/site.js?v=${V}"></script>
<script src="../assets/auth.js?v=${V}"></script>
<script src="../assets/stats.js?v=${V}"></script>
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

/* THE PAGE NAME IS NOT ALWAYS THE DATA CODE.

   GB is the ISO 3166-1 code for the United Kingdom, so the data file is GB.js
   and always will be. But /holidays/GB.html is a URL a person reads, types and
   shares, and outside a standards body nobody writes GB. Serving the real page
   at /holidays/UK.html and redirecting GB to it costs nothing and matches what
   people expect.

   Only the URL changes. The data code, the country list and the app's internal
   country value all stay GB. */
const PAGE_SLUG = { GB: "UK" };

COUNTRIES.forEach(([dataCode, name]) => {
  const data = loadHolidays(dataCode);
  const code = PAGE_SLUG[dataCode] || dataCode;   /* used for every URL below */
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
  <p style="margin:6px 0 0">Planning around a reporting week rather than a month? <a href="../week-number/${year}.html">Week numbers for ${year}</a> lists every week with its dates.</p>
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
  <p style="margin:6px 0 0">Working to week numbers rather than months? <a href="../week-number/">See the current week number</a>, in both the ISO and US systems.</p>
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
<!-- Phone only, hidden by CSS above 640px. -->
<input type="search" class="ctryfind" id="ctryFind" autocomplete="off"
       placeholder="Find a country" aria-label="Find a country"
       aria-controls="ctryList">
<div class="ctrycount" id="ctryCount" aria-live="polite"></div>
<div class="ctrylist" id="ctryList">
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
  ["https://inmycalendar.com/privacy.html", "yearly", "0.3"],
  ["https://inmycalendar.com/terms.html", "yearly", "0.3"]
];
/* The week-number pages are built by tools/build-week-pages.js, which drops its
   URL list here rather than writing a second sitemap. Two sitemaps for one site
   is a way to have half of it silently unlisted. Missing file is not an error:
   it just means that generator has not been run yet. */
const weekFile = path.join(__dirname, "week-pages.json");
const weekPages = fs.existsSync(weekFile) ? JSON.parse(fs.readFileSync(weekFile, "utf8")) : [];
weekPages.forEach(w => core.push([w.loc, "weekly", w.pri]));
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
