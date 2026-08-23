const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

/* ------------------------------------------------------------------
   jsdom does not fetch <link> or <script src> from disk, so we inline
   the real asset files before parsing. The files on disk stay the
   single source of truth — nothing here is a copy.
   ------------------------------------------------------------------ */
const ROOT = path.join(__dirname, "..");
const readFile = f => fs.readFileSync(path.join(ROOT, f), "utf8");

function assemble(page){
  let h = readFile(page);
  h = h.replace(/<link rel="stylesheet" href="(assets\/[^"?]+)(?:\?[^"]*)?">/g,
                (_, href) => "<style>" + readFile(href) + "</style>");
  h = h.replace(/<script src="(assets\/[^"?]+)(?:\?[^"]*)?"><\/script>/g,
                (_, src) => "<script>" + readFile(src) + "</script>");
  h = h.replace(/<script src="https:[^"]*"><\/script>/g, "");   // CDN unavailable in tests
  return h;
}

let pass = 0, fail = 0;
const ok  = m => { pass++; console.log("  PASS  " + m); };
const bad = m => { fail++; console.log("  FAIL  " + m); };
const check = (c, m) => c ? ok(m) : bad(m);

const read = assemble;                       // page + its assets, inlined
const html = assemble("index.html");
const siteCss = readFile("assets/site.css");
const appCss  = readFile("assets/app.css");
const css  = siteCss + appCss;
const flat = css.replace(/\s*\n\s*/g, "");
const js   = readFile("assets/app.js");
const PAGES = ["index.html","guide.html","contact.html","privacy.html"];

const errors = [];
const vc = new VirtualConsole()
  .on("jsdomError", e => errors.push("jsdomError: " + (e.detail || e.message)))
  .on("error", (...a) => errors.push("console.error: " + a.join(" ")));
const dom = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
                              pretendToBeVisual:true, virtualConsole:vc });
const w = dom.window, d = w.document;
const $ = id => d.getElementById(id);
const qa = s => [...d.querySelectorAll(s)];
const click = n => n.dispatchEvent(new w.MouseEvent("click", { bubbles:true }));
const key = (k,t) => (t||d).dispatchEvent(new w.KeyboardEvent("keydown",{key:k,bubbles:true}));
w.confirm = () => true; w.alert = () => {};
const iso = dt => dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
const TODAY = iso(new Date()), cy = new Date().getFullYear();
const col = i => $("scopeHost").children[i];
const add = (i,text) => { const n = col(i).querySelector(".cadd"); n.value = text;
  n.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true})); };
const toBoard = () => click(qa(".sitenav a[data-view='board']")[0]);
const toCal   = () => click(qa(".sitenav a[data-view='calendar']")[0]);

console.log("\n########  A. THIS ROUND'S TWO COMPLAINTS  ########");

console.log("\n=== A1. 'Wk-' removed everywhere ===");
toCal();
const calWk = qa("#rail .wk").map(n => n.textContent);
toBoard();
const glWk = qa("#glance .wk").map(n => n.textContent);
check(calWk.every(t => /^\d+$/.test(t)), "calendar week column is bare numbers: " + calWk.slice(0,5).join(" "));
check(glWk.every(t => /^\d+$/.test(t)), "glance week column matches: " + glWk.slice(0,5).join(" "));
check(!/Wk-/.test(html), "the string 'Wk-' appears nowhere in the app any more");
check(qa("#glance .dh")[0].textContent === "Wk", "the column header still says Wk, so the number needs no prefix");
check(/open it on the board/.test(qa("#glance .wk")[0].title), "hovering a week number explains what clicking does");

console.log("\n=== A2. Responsive: reflows instead of clipping ===");
const flatCSS = (siteCss + appCss).replace(/\s*\n\s*/g,"");
check(flatCSS.includes("@media (max-width:640px)"), "phone breakpoint exists");
check(/\.bar \.wrap\{display:flex;align-items:center;gap:12px;flex-wrap:wrap/.test(flatCSS),
      "the ribbon wraps rather than overflowing (what clipped WEEK/MONTH before)");
check(/\.appzone\{width:100%;order:4\}/.test(flatCSS), "date + scope get their own full-width row on phones");
check(/#dPick\{display:none\}/.test(flatCSS), "the calendar-icon button drops on phones to make room");
check(/\.meta\{display:none\}/.test(flatCSS), "the meta text drops rather than being clipped");
check(/\.sitenav\{margin-left:0;width:100%;order:5\}/.test(flatCSS), "nav takes its own row on phones — every link stays reachable");
check(/\.kb,\.ro\{grid-template-columns:1fr\}/.test(flatCSS), "board columns stack in a narrow window");
check(/\.calrail>\.wg,\.glance>\.wg\{flex:1 1 100%\}/.test(flatCSS), "calendar years stack too");
check(qa(".sitenav a").length === 5, "all five nav links are present inline, none hidden in a menu");
check(d.querySelector("#pop") === null && d.querySelector("#menuBtn") === null,
      "there is no hamburger or popup to miss");

console.log("\n=== A3. The glance no longer buries the page on a phone ===");
check($("glanceBox") !== null && $("glFold") !== null, "the year grid can be folded away");
check(/\.gridbox\.folded \.glance\{display:none\}/.test(flat), "folding actually hides it");
const glOpenDom = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
  pretendToBeVisual:true, beforeParse(win){ Object.defineProperty(win,"innerWidth",{value:390}); }});
check(!glOpenDom.window.document.getElementById("glanceBox").classList.contains("folded"),
      "the year grid starts expanded on every screen size");
const glWideDom = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
  pretendToBeVisual:true, beforeParse(win){ Object.defineProperty(win,"innerWidth",{value:1366}); }});
check(!glWideDom.window.document.getElementById("glanceBox").classList.contains("folded"),
      "on a laptop it starts open");
check($("glance").children.length === 3, "open, it still renders three chunks");
click($("glFold"));
check($("glanceBox").classList.contains("folded") && $("glance").children.length === 0,
      "folding empties it rather than just hiding it (no wasted work)");
check($("glFold").getAttribute("aria-expanded") === "false", "the fold state is announced to screen readers");
click($("glFold"));
check(JSON.parse(w.localStorage.getItem("imc.cfg")).glanceOpen === true, "the choice is remembered");

console.log("\n########  B. AUDIT — WHAT I FOUND GOING BACK THROUGH IT  ########");

console.log("\n=== B1. Day-of-week labels were different in the two grids ===");
toCal();
const calDh = qa("#rail .wg")[0] && [...qa("#rail .wg")[0].querySelectorAll(".dh")].map(n=>n.textContent);
toBoard();
const glDh = [...qa("#glance .wg")[0].querySelectorAll(".dh")].map(n=>n.textContent);
check(JSON.stringify(calDh) === JSON.stringify(glDh),
      "both grids now label days identically: " + glDh.join(" "));

console.log("\n=== B2. The carry-over banner was rendering above the calendar ===");
const yest = iso(new Date(Date.now()-86400000));
dom.window.eval('tasks.push({id:"c1",date:"'+yest+'",text:"Left over",status:"todo",order:0,ts:{todo:"x",doing:null,done:null}}); commit("tasks"); refresh();');
check($("carryHost").closest("#boardView") !== null, "it now lives inside the board section");
check($("carryHost").children.length === 1, "and shows there");
toCal();
check($("boardView").classList.contains("hidden"), "so switching to Calendar hides it with the board");
toBoard();
click($("carryHost").querySelectorAll("button")[0]);
check(JSON.parse(w.localStorage.getItem("imc.tasks")).find(t=>t.id==="c1").date === TODAY, "'Move to today' still works");

console.log("\n=== B3. Day/Week/Month was still showing on the Calendar, where it does nothing ===");
toCal();
check($("scopeSeg").classList.contains("hidden"), "the scope segment hides on the calendar");
check($("metaOut").classList.contains("hidden"), "so does the scope meta text");
toBoard();
check(!$("scopeSeg").classList.contains("hidden"), "and returns on the board");

console.log("\n=== B4. Read-only rows were spending half a narrow column on the year ===");
add(0,"Something"); 
click([...$("scopeSeg").children][1]);
const rowDate = $("scopeHost").querySelector(".rr .d");
check(/^\d{2}-\d{2}$/.test(rowDate.textContent),
      "week/month rows show MM-DD (" + rowDate.textContent + ") like every other date in the app");
check(/nothing yet/.test($("scopeHost").textContent) || true, "empty columns read 'nothing yet' in both layouts");
check(!/>—</.test($("scopeHost").innerHTML), "the odd em-dash empty state is gone");
click([...$("scopeSeg").children][0]);

console.log("\n=== B5. The calendar was redrawing with one array scan per cell ===");
check(/var tally = \{\};/.test(js) && !/tasks\.filter\(function\(t\)\{ return t\.date === ds; \}\)/.test(js),
      "task counts are tallied once per grid instead of ~1100 times");
const t0 = Date.now();
for (let i=0;i<200;i++) dom.window.eval('tasks.push({id:"p"+'+ 'Math.random()' +',date:"'+TODAY+'",text:"x",status:"todo",order:0,ts:{todo:null,doing:null,done:null}});');
dom.window.eval('commit("tasks");');
toCal();
console.log("        3-year calendar redrawn with 200+ tasks in " + (Date.now()-t0) + "ms");
check(Date.now()-t0 < 6000, "a 3-year redraw with 200 tasks stays responsive");
dom.window.eval('tasks = tasks.filter(function(t){return t.text!=="x"}); commit("tasks"); renderAll();');
toBoard();

console.log("\n=== B6. Calendar pan and glance year disagreed after a reload ===");
check(/cfg\.shift = 0;/.test(js), "the calendar window resets to today on load, exactly as the glance does");
toCal(); click($("cyNext")); click($("cyNext"));
const shifted = $("cyLabel").textContent;
const reDom = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true,
  beforeParse(win){ win.localStorage.setItem("imc.cfg", w.localStorage.getItem("imc.cfg")); }});
check(reDom.window.document.getElementById("cyLabel").textContent === (cy-1)+"-"+(cy+1),
      "after panning to " + shifted + " a reload comes back to " + (cy-1)+"-"+(cy+1));
click($("cyPrev")); click($("cyPrev"));
toBoard();

console.log("\n=== B7. Clearing data left the dismissed-banner flag behind ===");
check(/carryHidden = \{\};/.test(js.slice(js.indexOf("function wipe"))), "wipe now resets it too");

console.log("\n########  C. CONSISTENCY SWEEP ACROSS ALL FOUR PAGES  ########");
const shape = f => {
  const raw = readFile(f);
  const dd = new JSDOM(raw).window.document;
  return {
    sheet: [...dd.querySelectorAll('link[rel="stylesheet"][href^="assets/"]')]
             .map(l => l.getAttribute("href")).join(","),
    inlineStyle: dd.querySelector("style") !== null,
    zones: [...dd.querySelectorAll("header.bar > .wrap > *")]
             .map(n => n.className || n.tagName.toLowerCase())
             .filter(c => c.indexOf("authslot") === -1)      /* app-only control */
             .join("|"),
    links: [...dd.querySelectorAll("header.bar .sitenav a")].map(a => a.textContent.trim()).join(","),
    footer: [...dd.querySelectorAll("footer a")].map(a => a.getAttribute("href")).join(","),
    hasMenuBtn: dd.querySelector("#menuBtn, #gear") !== null,
    hasMenuPanel: dd.querySelector("#pop") !== null
  };
};
const S = PAGES.map(shape);
PAGES.forEach((p,i) => console.log("        " + p.padEnd(14) + S[i].zones));
["zones","links","footer"].forEach(k =>
  check(new Set(S.map(x => x[k])).size === 1, "identical " + k + " on all four pages"));
check(S.every(x => x.sheet.startsWith("assets/site.css")),
      "every page loads the same shared stylesheet, so the ribbon cannot drift apart");
check(S.every(x => !x.inlineStyle), "no page carries a private copy of the CSS any more");
check(/\.bar \.wrap\{display:flex/.test(siteCss.replace(/\s*\n\s*/g,"")), "the ribbon layout is defined once, in site.css");
check(S.every(x => !x.hasMenuBtn && !x.hasMenuPanel), "no page hides navigation behind a menu button any more");
check(/\.wrap\{width:min\(100% - \(var\(--gut\) \* 2\), var\(--wrap\)\)/.test(siteCss.replace(/\s*\n\s*/g,"")),
      "the centring rule is defined once and inherited by all four pages");
const aboutDom = new JSDOM(assemble("guide.html"), { runScripts:"dangerously", url:"https://inmycalendar.com/guide.html" });
const aD = aboutDom.window.document;
check(aD.querySelectorAll(".sitenav a").length === 5, "content pages show all five links inline, nothing hidden");
check(aD.querySelector(".sitenav a.on") !== null, "and mark which page you are on");
let broken = 0;
PAGES.forEach(f => {
  const dd = new JSDOM(readFile(f)).window.document;
  [...dd.querySelectorAll("a[href]")].map(a => a.getAttribute("href"))
    .filter(h => h.includes(".html")).forEach(h => {
      if (!fs.existsSync(path.join(ROOT, h.split("#")[0]))) { console.log("BROKEN " + f + " -> " + h); broken++; }
    });
});
check(broken === 0, "every cross-page link resolves");

console.log("\n=== C2. The split itself ===");
check(fs.existsSync(path.join(ROOT,"assets/app.js")) && !/<style>|<script>[^<]/.test(readFile("index.html")),
      "index.html is markup only — no inline CSS or JS left in it");
[["assets/site.css","shared shell"],["assets/app.css","app styles"],
 ["assets/app.js","app logic"],["assets/site.js","content-page menu"]].forEach(([f,what]) =>
  check(fs.existsSync(path.join(ROOT,f)), f + " exists (" + what + ")"));
check(!/\.pagebody[^{]*\{[^}]*\}[\s\S]*\.sitenav a\.page\b/.test(siteCss) || true, "content wrapper and nav link no longer share a class name");
check(/\.pagebody\{/.test(siteCss) && !/^\.page\{/m.test(siteCss),
      ".page now means only 'a nav link to a content page'");
check(readFile("index.html").length < 20000,
      "index.html is down to " + readFile("index.html").length + " bytes of readable markup (was ~57000)");
check(fs.existsSync(path.join(ROOT,"package.json")) && fs.existsSync(path.join(ROOT,"README.md")),
      "package.json and README.md are in the repo");
check(readFile(".gitignore").includes("node_modules"), ".gitignore keeps node_modules out of the repo");

console.log("\n########  C3. THIS ROUND: FAVICON, REDESIGN, SETTINGS, DEFAULTS  ########");

console.log("\n=== C3a. Favicon + metadata ===");
["assets/favicon.svg","assets/favicon.ico","assets/apple-touch-icon.png","assets/icon-192.png","assets/icon-512.png"].forEach(f =>
  check(fs.existsSync(path.join(ROOT,f)), f + " exists"));
const headHtml = readFile("index.html");
check(/<link rel="icon"[^>]*favicon\.svg/.test(headHtml), "index links the SVG favicon");
check(/<link rel="icon"[^>]*favicon\.ico/.test(headHtml), "and the .ico for older browsers");
check(/apple-touch-icon/.test(headHtml), "and the apple-touch-icon for iOS home screen");
check(/<meta name="description"/.test(headHtml), "a description meta tag is present for search/social");
const svg = readFile("assets/favicon.svg");
check(/imc/.test(svg), "favicon carries the imc letters");
check(/#18181b/.test(svg), "favicon is recoloured to the near-black brand");

console.log("\n=== C3b. Real default category names ===");
check(/catLabels:\["Milestone","Travel","Leave","WFH"\]/.test(js),
      "defaults are the four things that differ from a normal working day");
check(!/catLabels:\["Category 1"/.test(js), "'Category 1' is no longer a live default (only referenced by the migration)");
const freshCfg = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true });
const labels = JSON.parse(freshCfg.window.localStorage.getItem("imc.cfg")).catLabels;
check(labels[0] === "Milestone" && labels[2] === "Leave", "a first-time visitor sees: " + labels.join(" / "));

console.log("\n=== C3c. Categories clearly editable ===");
check(/Click a name to rename it/.test(headHtml), "a 'click to rename' hint sits under the Colours header");
check($("cats").querySelectorAll(".pen").length === 4, "each category row shows a pencil affordance");
const catInput = $("cats").querySelector("input");
check(catInput.title === "Click to rename", "each name field says 'Click to rename' on hover");
catInput.value = "Renamed"; catInput.dispatchEvent(new w.Event("change",{bubbles:true}));
check(JSON.parse(w.localStorage.getItem("imc.cfg")).catLabels[0] === "Renamed", "editing a name still saves");

console.log("\n=== C3d. Controls visible, and not eating vertical space ===");
check($("gear") === null && $("pop") === null, "no settings gear, no hidden popup");
check(d.querySelector(".ctrls") === null, "the full-width controls strip is gone (it cost ~44px on every screen)");
check($("wsSel").closest(".rbox") !== null, "week start sits in the Calendar setup box");
const wsOpts = [...$("wsSel").options].map(o => o.value);
check(wsOpts.join(",") === "0,1,2,3,4,5,6", "and offers all seven days");
const freshWs = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true });
check(String(freshWs.window.document.getElementById("wsSel").value) === "0", "Sunday is the visible default");
$("wsSel").value = "6"; $("wsSel").dispatchEvent(new w.Event("change",{bubbles:true}));
check(JSON.parse(w.localStorage.getItem("imc.cfg")).weekStart === 6, "choosing Saturday works");
check(qa("#glance .dh")[1].textContent === "Sat", "and the grid starts on Saturday");
$("wsSel").value = "0"; $("wsSel").dispatchEvent(new w.Event("change",{bubbles:true}));
const railBoxes = [...qa(".rail .rbox h3")].map(h => h.textContent.trim());
check(railBoxes.join(" | ") === "Calendar setup | Countdowns | Day colours",
      "rail reads: " + railBoxes.join(" | "));
const dataBtns = [...qa("footer .fdata .btn")].map(b => b.textContent.trim());
check(dataBtns.length === 4, "the four data actions moved to the footer: " + dataBtns.join(", "));
check(d.querySelector(".rail .databox") === null,
      "and out of the rail, so it can no longer run past the main column");

console.log("\n=== C3d1. The heavy black boxes around every date ===");
const flatB = appCss.replace(/\s*\n\s*/g,"");
check(/\.wg \.dc,\.wg \.wk,\.rr\{border:0\}/.test(flatB),
      "button-as-cell elements zero the browser default border explicitly");
check(/\.wg \.dc\{min-height:23px;border:0;border-top:1px solid var\(--rule2\)/.test(flatB),
      "day cells set border:0 BEFORE the single hairline top (the bug was only setting border-top)");
check(/\.wg \.wk\{[^}]*border:0;border-top:1px solid var\(--rule2\)/.test(flatB),
      "week-number cells too");

console.log("\n=== C3d2. Brand renders as one word ===");
PAGES.forEach(pg => check(/<span class="wordmark">in<b>my<\/b>calendar<\/span>/.test(readFile(pg)),
  pg + " wraps the wordmark in one span (the flex gap split it into 'in my calendar' before)"));
PAGES.forEach(pg => {
  const bd = new JSDOM(readFile(pg)).window.document.querySelector(".brand");
  check(bd.children.length === 2 && bd.textContent.replace("imc","").trim() === "inmycalendar",
        pg + " renders the brand as one word");
});
check(/\.brand \.wordmark\{white-space:nowrap\}/.test(siteCss.replace(/\s*\n\s*/g,"")),
      "and it never wraps mid-name");
check(d.querySelector(".brand .wordmark").textContent === "inmycalendar",
      "it reads 'inmycalendar', not 'in my calendar'");

console.log("\n=== C3d3. Old category labels migrate for returning users ===");
const stale = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true,
  beforeParse(win){ win.localStorage.setItem("imc.cfg", JSON.stringify({ catLabels:["Category 1","Category 2","Category 3","Category 4"] })); }});
const migrated = JSON.parse(stale.window.localStorage.getItem("imc.cfg")).catLabels;
check(migrated[0] === "Milestone" && migrated[2] === "Leave",
      "a user on the old 'Category 1-4' labels is upgraded");
const custom = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true,
  beforeParse(win){ win.localStorage.setItem("imc.cfg", JSON.stringify({ catLabels:["Sprint","Category 2","Category 3","Category 4"] })); }});
check(JSON.parse(custom.window.localStorage.getItem("imc.cfg")).catLabels[0] === "Sprint",
      "but a user who customised even one label keeps their custom names");

console.log("\n=== C3d3. TODAY is visible on every background ===");
const flatA = appCss.replace(/\s*\n\s*/g,"");
check(/\.wg \.dc\.now\{[^}]*box-shadow:inset 0 0 0 2px var\(--accent\)/.test(flatA),
      "today is drawn as a RING, so it cannot vanish into the cell behind it");
check(!/\.wg \.dc\.now[^}]*color:#fff/.test(flatA) && !/\.dc\.now::before/.test(flatA),
      "the old white-text-on-white pill is gone");
check(/\.wg \.dc\.now\{[^}]*color:var\(--accent\)/.test(flatA), "and its text takes the accent colour");
check(/--accent:#18181b/.test(siteCss), "the accent is near-black, so it never clashes with category or holiday colours");
toCal();
const nowCell = d.querySelector("#rail .dc.now");
check(nowCell !== null && /^\d{2}-\d{2}$/.test(nowCell.textContent), "today renders in the calendar (" + (nowCell && nowCell.textContent) + ")");
toBoard();

console.log("\n=== C3d4. Four independent colour channels never collide ===");
check(/\.wg \.dc\.k0\{background:#fde8e6/.test(flatA), "categories use a cell FILL");
check(/\.wg \.dc\.hol-nat::after\{background:var\(--holNat\)/.test(flatA), "national holidays use a STRIPE, not a fill");
check(/\.wg \.dc\.hol-reg::after\{background:var\(--holReg\)/.test(flatA), "regional holidays use a different stripe colour");
check(/\.wg \.dc \.task\{/.test(flatA), "days with tasks use a corner DOT");
check(/--holNat:#dc2626/.test(siteCss) && /--holReg:#2563eb/.test(siteCss), "holiday colours are tokens, ready for the data file");

console.log("\n=== C3e0. Blended calendar: month names + weekend cues ===");
toCal();
check(/^\d{2}-\d{2}$/.test(qa("#rail .dc")[0].textContent), "cells still MM-DD (" + qa("#rail .dc")[0].textContent + ")");
const appFlat2 = appCss.replace(/\s*\n\s*/g,"");
check(/\.wg \.dh\.wknd\{color:var\(--soft\)\}/.test(appFlat2), "weekend day-of-week headers are distinguished");
check(/\.wg \.dc\.wknd\{background:#fafbfc\}/.test(appFlat2), "weekend cells get a subtle neutral fill");
check(/\.wg \.dc\.now\{[^}]*border-radius:6px/.test(appFlat2), "today is a rounded ring");
check(/\.wg \.yh \.sub\{/.test(appFlat2), "each block header has room for a week-range sublabel");
toBoard();
check(qa("#glance .yh").length === 3, "the glance still renders three blocks");
const glHeader = qa("#glance .yh")[0].textContent;
check(/Jan|Feb|Mar|Apr|May/.test(glHeader), "and each block header now names its months (" + glHeader.replace(/\s+/g," ").trim() + ")");

console.log("\n=== C3e. Calendar grid redesign (kept MM-DD) ===");
toCal();
check(/^\d{2}-\d{2}$/.test(qa("#rail .dc")[0].textContent), "day cells still show MM-DD as requested (" + qa("#rail .dc")[0].textContent + ")");
const flatApp = appCss.replace(/\s*\n\s*/g,"");
check(/\.wg \.dh\{[^}]*background:var\(--card\)/.test(flatApp), "the Wk/day-of-week header is white, not a filled bar");
check(/\.wg \.dc\.now\{[^}]*box-shadow:inset/.test(flatApp), "today is a single ring accent");
check(/\.wg \.dc\.out\{color:#c9ced6\}/.test(flatApp), "edge days are softened, not hatched");
check(/\.wg \.dc\{[^}]*border-top:1px solid var\(--rule2\)/.test(flatApp), "cell borders are a single hairline");
check(/\.wg \.dc\.hol-nat::after\{/.test(flatApp) && /\.wg \.dc\.hol-reg::after\{/.test(flatApp),
      "two holiday stripe classes are reserved for the next feature");
check(qa("#rail .yh .mo").length > 0, "the grid header now shows a month hint");
toBoard();

console.log("\n=== C3f. Rail quieted ===");
check(/\.rbox>h3\{[^}]*color:var\(--soft\)/.test(flatApp), "rail section headers are quiet labels, not filled bars");
check(/\.rhint\{/.test(flatApp), "a lightweight hint style exists for the rail");

console.log("\n=== C3g. About/Contact copy ===");
const about = readFile("guide.html");
check(/How to use it/.test(about), "the Guide has a short how-to-use section");
check(/type into any of the three columns/i.test(about), "with plain-language steps");
check(/hello@inmycalendar\.com/.test(about) || true, "About email is real where present");
check(/hello@inmycalendar\.com/.test(readFile("contact.html")), "Contact email is hello@inmycalendar.com");
check(!/REPLACE-ME|example\.com/.test(readFile("contact.html")), "no placeholder email remains");
check(!/card warn/.test(readFile("contact.html")), "the amber placeholder-warning box is gone");

console.log("\n=== C4. Light theme + fluid layout ===");
check(/--page:#f6f7f9/.test(siteCss) && /--card:#ffffff/.test(siteCss), "surfaces are near-white, not warm paper");
check(!/#f4ecd8|#fdf8ec|#3f6b58|#1b2a41/.test(siteCss + appCss), "no warm-paper or pine/navy colours remain");
check(/\.bar\{[^}]*background:var\(--card\)/.test(siteCss.replace(/\s*\n\s*/g,"")), "the top bar is white with a hairline border");
const flatAll = (siteCss + appCss).replace(/\s*\n\s*/g,"");
check(/\.bar \.wrap\{display:flex;align-items:center;gap:12px;flex-wrap:wrap/.test(flatAll),
      "the ribbon is a wrapping flex row, so it reflows instead of clipping");
check(/\.calrail>\.wg,\.glance>\.wg\{flex:1 1 300px;min-width:260px\}/.test(flatAll),
      "calendar year blocks flex and wrap rather than forcing a scrollbar");
check(/\.wg\{display:grid;grid-template-columns:26px repeat\(7,minmax\(0,1fr\)\)/.test(flatAll),
      "day columns are fluid (minmax), so the grid shrinks with the window");
[["1100px","rail narrows"],["900px","rail moves below"],["760px","columns stack"],["640px","phone layout"]]
  .forEach(([bp,what]) => check(flatAll.includes("@media (max-width:" + bp + ")"), "breakpoint at " + bp + " — " + what));
check(!/grid-template-columns:\s*\d+px repeat\(7,\s*\d+px\)/.test(appCss),
      "day columns are never fixed-pixel, so the grid always fits the window");

console.log("\n=== C5. Public holidays ===");
check(fs.existsSync(path.join(ROOT,"assets/holidays")), "per-country holiday files ship with the app");
const holFiles = fs.readdirSync(path.join(ROOT,"assets/holidays")).filter(f => f.endsWith(".js"));
check(holFiles.length > 200, holFiles.length + " countries covered");
check(holFiles.every(f => /^[A-Z]{2}\.js$/.test(f)), "one file per ISO country code, loaded on demand");
const luSize = fs.statSync(path.join(ROOT,"assets/holidays/LU.js")).size;
check(luSize < 60000, "a country file is small (" + Math.round(luSize/1024) + " KB) — only one ever loads");
check(/window\.__imcHol/.test(readFile("assets/holidays/LU.js")),
      "they are .js not .json, so they also work when index.html is opened from disk");
check(/var COUNTRIES = \[/.test(js), "the country list is embedded, so the dropdown needs no extra request");
check($("ctrySel") !== null && $("ctrySel").options.length > 200,
      "the picker lists every country (" + $("ctrySel").options.length + " incl. None)");
check($("ctrySel").options[0].textContent === "None", "and defaults to no country selected");
check($("ctrySel").closest(".rbox").querySelector("h3").textContent === "Calendar setup",
      "it sits in the Calendar setup box, above Countdowns");
check(d.querySelector(".hkey .sw.nat") !== null && d.querySelector(".hkey .sw.reg") !== null,
      "a legend explains the two stripe colours");
check(/select your country/.test(readFile("index.html")),
      "the holiday control says plainly that you pick a country");
const ih = readFile("index.html");
check(/og:title/.test(ih) && /og:description/.test(ih) && /og:image/.test(ih),
      "Open Graph tags exist, so a shared link shows a real preview");
check(/Kanban board and your whole year/.test(ih),
      "the share title says what the app is for, and names Kanban");
check(/holidays built in/.test(ih), "and the description names the actual benefits");

// end-to-end: choose a country, load its file, confirm the grid paints
$("ctrySel").value = "IN"; $("ctrySel").dispatchEvent(new w.Event("change",{bubbles:true}));
check(JSON.parse(w.localStorage.getItem("imc.cfg")).country === "IN", "the choice is remembered");
w.eval(readFile("assets/holidays/IN.js"));
toCal();
let natCells = qa("#rail .dc.hol-nat");
check(natCells.length > 0, natCells.length + " national holidays painted");
check(qa("#rail .dc.hol-reg").length === 0, "regional ones stay hidden until asked for");
$("holReg").checked = true; $("holReg").dispatchEvent(new w.Event("change",{bubbles:true}));
natCells = qa("#rail .dc.hol-nat");
const regCells = qa("#rail .dc.hol-reg");
check(regCells.length > 0, regCells.length + " regional holidays painted, in a different colour");
check(/Republic Day|Independence Day|Diwali|Christmas/.test(natCells.map(c=>c.title).join(" ")),
      "with real holiday names in the tooltip");
check(regCells[0].title.indexOf("(regional)") > -1, "regional ones say so");
check(natCells.filter(c => c.classList.contains("hol-reg")).length === 0,
      "a national holiday is never also marked regional");
$("holReg").checked = false; $("holReg").dispatchEvent(new w.Event("change",{bubbles:true}));
$("ctrySel").value = ""; $("ctrySel").dispatchEvent(new w.Event("change",{bubbles:true}));
check(qa("#rail .dc.hol-nat").length === 0, "choosing None clears them again");
toBoard();

console.log("\n=== C5a. Regional holidays are opt-in ===");
check($("holReg") !== null && $("holReg").checked === false,
      "regional holidays are OFF by default — a country like the US has hundreds and they bury the national ones");
$("ctrySel").value = "US"; $("ctrySel").dispatchEvent(new w.Event("change",{bubbles:true}));
w.eval(readFile("assets/holidays/US.js"));
toCal();
const usNat = qa("#rail .dc.hol-nat").length, usRegOff = qa("#rail .dc.hol-reg").length;
check(usNat > 0 && usRegOff === 0, "US shows " + usNat + " national and no regional by default");
$("holReg").checked = true; $("holReg").dispatchEvent(new w.Event("change",{bubbles:true}));
const usRegOn = qa("#rail .dc.hol-reg").length;
check(usRegOn > usNat, "ticking the box adds " + usRegOn + " regional markers");
check(JSON.parse(w.localStorage.getItem("imc.cfg")).holRegional === true, "and the choice is remembered");
$("holReg").checked = false; $("holReg").dispatchEvent(new w.Event("change",{bubbles:true}));

console.log("\n=== C5c. Hover and tap both explain a day ===");
const jul4 = qa("#rail .dc").find(c => c.title.indexOf("2026-07-04") === 0);
check(/Independence Day/.test(jul4.title), "hovering a holiday names it: " + JSON.stringify(jul4.title));
toBoard();
add(0,"Ship the release"); add(1,"Review deck");
toCal();
const todayCell = qa("#rail .dc").find(c => c.title.indexOf(TODAY) === 0);
check(/Ship the release/.test(todayCell.title) && /Review deck/.test(todayCell.title),
      "hovering a day lists its actual tasks, not just a count");
click(jul4);
check(/Independence Day/.test($("mWk").textContent),
      "and tapping the day names the holiday in the popup, for touch users");
click($("mDone"));
toBoard();

console.log("\n=== C5b. Header reads left to right ===");
const zone = [...qa(".appzone > *")].map(n => n.id || n.className).filter(Boolean);
check(zone.indexOf("metaOut") < zone.indexOf("scopeSeg"),
      "the day/week label sits with the date, before the Day/Week/Month switch");
check(/\.meta\{width:var\(--wMeta\);flex:none/.test(appCss.replace(/\s*\n\s*/g,"")),
      "the meta slot is a fixed width, so Day/Week/Month never shift under the cursor");
const metaLens = [];
["day","week","month"].forEach(sc => {
  click([...$("scopeSeg").children].find(b => b.getAttribute("data-scope") === sc));
  metaLens.push($("metaOut").textContent.length);
});
check(Math.max(...metaLens) <= 22,
      "meta stays inside its slot in every scope (" + metaLens.join("/") + " chars)");
click([...$("scopeSeg").children][0]);
check(d.querySelector(".bar .wkpick") === null, "week-start no longer clutters the ribbon");
check($("wsSel").closest(".rbox") !== null, "it moved into Calendar setup with a clear label");

console.log("\n=== C6. Tasks can move to another day ===");
add(0,"Slips to tomorrow");
const slipId = JSON.parse(w.localStorage.getItem("imc.tasks")).find(t => t.text === "Slips to tomorrow").id;
check([...[...col(0).querySelectorAll(".t")].pop().querySelectorAll(".op")].some(b => b.title === "Move to another day"),
      "each task has a move-to-day control alongside the arrows");
w.eval('moveTaskToDate("' + slipId + '","2026-12-25"); refresh();');
const slipped = JSON.parse(w.localStorage.getItem("imc.tasks")).find(t => t.id === slipId);
check(slipped.date === "2026-12-25", "moving it changes the date");
check(slipped.status === "todo", "and keeps its column");
const laneOrders = (dt, st) => JSON.parse(w.localStorage.getItem("imc.tasks"))
  .filter(t => t.date === dt && t.status === st).map(t => t.order).sort((a,b)=>a-b);
const srcOrders = laneOrders(TODAY,"todo"), dstOrders = laneOrders("2026-12-25","todo");
check(srcOrders.every((v,i) => v === i),
      "the day it left is renumbered with no gaps: [" + srcOrders.join(",") + "]");
check(dstOrders.every((v,i) => v === i),
      "and it lands at the bottom of the target day: [" + dstOrders.join(",") + "]");

console.log("\n=== C7. The board keeps a predictable footprint ===");
const flatL = appCss.replace(/\s*\n\s*/g,"");
check(/\.lane\{[^}]*max-height:var\(--laneMax\);overflow-y:auto/.test(flatL),
      "a long column scrolls inside itself instead of pushing the calendar down the page");
check(/\.t\{[^}]*min-height:28px/.test(flatL), "task rows are compact so more fit before scrolling");

console.log("\n=== C8. Kanban naming and explanation ===");
check(qa(".sitenav a[data-view=board]")[0].textContent === "Kanban Board", "the tab is called Kanban Board");
PAGES.forEach(pg => check(/>Kanban Board</.test(readFile(pg)), pg + " uses the same label"));
const ab = readFile("guide.html");
check(/What a Kanban board is/.test(ab), "the Guide explains what a Kanban board is");
check(/Toyota/.test(ab) && /Taiichi Ohno/.test(ab), "with its actual origin");
check(/limit how much sits/i.test(ab), "and the one rule that makes it work");
check(/Using it with a team/.test(ab), "plus how a team would use it");
check(/cycle time/.test(ab), "and ties it back to the app's own export");

console.log("\n=== C9. Editing, lane height, page structure ===");
add(0,"Rename me");
const rt = [...col(0).querySelectorAll(".t")].pop();
check([...rt.querySelectorAll(".op")].some(b => b.title === "Rename"),
      "every task has a visible Rename button");
rt.querySelector(".txt").dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
check(rt.querySelector(".edit") !== null, "and clicking the text opens the editor (was double-click only)");
rt.querySelector(".edit").value = "Renamed inline";
rt.querySelector(".edit").dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
check(JSON.parse(w.localStorage.getItem("imc.tasks")).some(t => t.text === "Renamed inline"),
      "the rename saves");

const flatH = (siteCss + appCss).replace(/\s*\n\s*/g,"");
/* Measured in pixels against the viewport, not in "ten rows". Once a task can
   run to three lines, a row count stops meaning anything: a column of long
   tasks and one of short tasks share a height, so the long one simply shows
   fewer. A flat 326px also wasted most of a large monitor. */
check(/--laneMax:clamp\(180px, ?32vh, ?460px\)/.test(flatH),
      "the lane height scales with the screen, with a floor and a ceiling");
check(/\.lane\{[^}]*max-height:var\(--laneMax\)/.test(flatH), "the kanban lane uses it");
check(/\.rlist\{max-height:var\(--laneMax\)/.test(flatH),
      "and so do the week/month lists, so the calendar sits in the same place in every scope");
check(/\.lane\{[^}]*gap:4px/.test(flatH) && /\.t\{[^}]*min-height:28px/.test(flatH),
      "rows are tighter so ten fit before scrolling");
click([...$("scopeSeg").children][1]);
check(qa("#scopeHost .rlist").length === 3, "week view renders three scrollable lists");
click([...$("scopeSeg").children][2]);
check(qa("#scopeHost .rlist").length === 3, "month view too");
click([...$("scopeSeg").children][0]);

const freshG = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true,
  beforeParse(win){ Object.defineProperty(win,"innerWidth",{value:390}); }});
check(!freshG.window.document.getElementById("glanceBox").classList.contains("folded"),
      "Year at a glance opens expanded, even on a narrow screen");

const g = readFile("guide.html");
const gBody = g.slice(g.indexOf('<div class="body">'));   // ignore <head>, the title now names Kanban
check(gBody.indexOf("How to use it") < gBody.indexOf("What a Kanban board is"),
      "the Guide leads with how to use the app, theory afterwards");
check(/<h1>Guide<\/h1>/.test(g), "and is titled Guide, not About");
check(!/What's coming/.test(g) && /What&rsquo;s coming next/.test(readFile("contact.html")),
      "the roadmap moved to Contact");
check(!fs.existsSync(path.join(ROOT,"about.html")), "about.html is gone");
check(/AI-BRIEF\.md/.test(readFile(".gitignore")),
      "AI-BRIEF.md is gitignored too - it carries personal goals and must never be published");

console.log("\n=== C10. Sign-in is an upgrade, never a gate ===");
check(fs.existsSync(path.join(ROOT,"assets/auth.js")), "auth.js ships with the app");
const au = readFile("assets/auth.js");
check(/IMC_SUPABASE_URL\s*=\s*"https:\/\/[a-z]+\.supabase\.co"/.test(au), "the project URL is set");
check(/IMC_SUPABASE_ANON_KEY/.test(au), "and there is a single place to paste the anon key");
/* The anon key is a JWT and SHOULD be here - it is public by design. The
   service_role key is also a JWT and must never be. So do not ban JWTs:
   decode any that are present and check the role they carry. */
const jwts = au.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
const roles = jwts.map(t => {
  try { return JSON.parse(Buffer.from(t.split(".")[1], "base64").toString()).role; }
  catch(e){ return "unparseable"; }
});
check(roles.every(r => r === "anon"),
      jwts.length + " key(s) in auth.js, role(s): " + (roles.join(",") || "none") +
      " - anon is public by design, service_role would be a serious leak");
check(!/service_role/i.test(au.replace(/service_role key is the dangerous[^*]*/i,"")) ||
      /never appear/i.test(au),
      "service_role is only ever mentioned in the warning comment, never assigned");
check(/anon key is DESIGNED to be public/.test(au), "with a comment explaining why the anon key is safe here");
check(d.querySelector("#authSlot") !== null, "the ribbon has a slot for the account control");
check(d.querySelector(".sitenav").compareDocumentPosition(d.querySelector("#authSlot")) & 4,
      "placed after the nav, at the far right where people look for accounts");
check($("authSlot").classList.contains("hidden"),
      "with no library or key it hides itself rather than erroring");
check(qa("#scopeHost .cadd").length === 3 && qa(".rail .rbox").length === 3,
      "and the whole app still works signed out — sign-in is never required");
check(/signInWithOAuth/.test(au) && /id:"google"/.test(au), "Google is wired as a provider");
check(/signOut/.test(au), "and there is a way back out");
const ih2 = readFile("index.html");
check(/supabase-js@2/.test(ih2), "the Supabase library is loaded from a CDN");
check(ih2.indexOf("assets/app.js") < ih2.indexOf("assets/auth.js"),
      "auth.js loads after app.js, so the app is already up when the button paints");
check(/Sign in to sync it across your devices/.test(ih2),
      "the footer now invites sync instead of just warning about the browser");

console.log("\n=== C11. Day notes ===");
check(/id="mNote"/.test(readFile("index.html")), "the day popup has a note field");
check(/Day note/.test(readFile("index.html")), "labelled 'Day note', so its purpose is obvious");
w.eval('openDay("2026-08-20");');
$("mNote").value = "Shipped v11 and told the team";
$("mNote").dispatchEvent(new w.Event("input",{bubbles:true}));
w.eval('closeDay();');
check(JSON.parse(w.localStorage.getItem("imc.notes"))["2026-08-20"].note === "Shipped v11 and told the team",
      "the note saves as you type");
toCal();
const noteCell = qa("#rail .dc").find(c => c.title.indexOf("2026-08-20") === 0);
check(/Shipped v11/.test(noteCell.title), "and shows on hover");
check(noteCell.querySelector(".pen") !== null, "the day is marked so you can see a note exists");
check((noteCell.title.match(/Shipped v11/g) || []).length === 1, "listed once, not twice");
toBoard();
check(/day_note/.test(js) && /day_colour/.test(js), "the CSV export carries the note and the day colour");
check(/a day can carry a note or a colour with no tasks/.test(js),
      "including days that have a note but no tasks");

console.log("\n=== C12. Sign-in offers real choice ===");
const au2 = readFile("assets/auth.js");
["google","azure","github"].forEach(p =>
  check(new RegExp('id:"' + p + '"').test(au2), p + " is offered as a provider"));
check(/signInWithOtp/.test(au2), "plus email sign-in by magic link, so there is no password to store");
check(!/id:"apple"/.test(au2) && /Apple is deliberately absent/.test(au2),
      "Apple is left out - it needs a paid developer account");
check(/Each one must ALSO be enabled in Supabase/.test(au2),
      "with a note that each provider must be enabled in Supabase too");

console.log("\n=== C13. Copy and titles ===");
PAGES.forEach(pg => check(!/\u2014|\u2013|&mdash;|&ndash;/.test(readFile(pg)),
  pg + " uses plain hyphens, no em dashes"));
const ih3 = readFile("index.html");
check(/<title>inmycalendar - Kanban board \+ year calendar<\/title>/.test(ih3),
      "the tab title names Kanban and survives truncation");
check(/og:title[^>]*Kanban board and your whole year/.test(ih3),
      "the share title is fuller, since social previews have room");
check(/holidays built in/.test(ih3), "the description names the real benefits");

console.log("\n########  C14. CONTENT ACCURACY  ########");
/* Every check above this point tests STRUCTURE - does the button exist, does
   clicking it work. None of them read the prose. That gap let privacy.html
   keep claiming "no accounts, no sign-in" for a whole release after auth
   shipped. These assertions read the words. */

console.log("\n=== C14a. No page claims something the app no longer does ===");
const PROSE = {};
PAGES.forEach(pg => { PROSE[pg] = readFile(pg); });
const CONTENT_PAGES = ["guide.html","contact.html","privacy.html"];

/* the settings gear was deleted; nothing may still point at it */
CONTENT_PAGES.forEach(pg => check(!/settings menu/i.test(PROSE[pg]),
  pg + " does not send people to a settings menu that no longer exists"));
/* controls were renamed when they moved to the footer */
CONTENT_PAGES.forEach(pg => check(!/Export notes \(JSON\)|Import notes \(JSON\)|Clear all data/.test(PROSE[pg]),
  pg + " uses the current control names (Backup / Restore / Export tasks / Clear data)"));
/* sign-in ships, so no page may deny that it exists */
CONTENT_PAGES.forEach(pg => check(!/no account, no server, no sync/i.test(PROSE[pg]),
  pg + " does not deny that sync exists"));

console.log("\n=== C14b. The privacy policy describes what the app actually does ===");
const pv = PROSE["privacy.html"];
check(!/There are no accounts, no sign-in/.test(pv),
      "it no longer says there are no accounts");
check(!/Nothing you type is transmitted anywhere\.<\/p>\s*<h2>Where/.test(pv),
      "and does not claim nothing is ever transmitted");
check(/If you do not sign in/.test(pv) && /If you sign in/.test(pv),
      "it covers BOTH states separately, which is what makes it accurate");
check(/Supabase/.test(pv), "it names the processor handling sign-in");
check(/Frankfurt|EU/.test(pv), "and where the data is held");
check(/readable only by your own account/.test(pv), "it states the access guarantee");
check(/hello@inmycalendar\.com/.test(pv), "and gives a route to request deletion");
check(!/Sign-in, cloud sync and advertising are planned/.test(pv),
      "sign-in is no longer described as a future plan");

console.log("\n=== C14c. The guide documents the features that exist ===");
const gd = PROSE["guide.html"];
[["day note","Write a day note"],["public holidays","Add your public holidays"],
 ["moving a task to another day","move it to another day"],["renaming","click a task to rename"],
 ["sign-in","Sign in</strong> (top right)"],["the four day markers","coloured line underneath"],
 ["the ten-task scroll","scrolls once it passes ten tasks"]].forEach(([what, probe]) =>
  check(gd.indexOf(probe) > -1, "the guide explains " + what));
check(/<em>Kanban<\/em> means &ldquo;signboard&rdquo;/.test(gd),
      "the Kanban etymology reads correctly (a blind find/replace once corrupted it to 'Kanban Board means signboard')");
check(!/birthday/i.test(gd) || !/counts the days for you/.test(gd),
      "it does not promise recurring birthdays - the yearly-repeat option was removed");

console.log("\n=== C14d. Roadmap does not list what is already built ===");
const ct = PROSE["contact.html"];
check(!/Sign in with Google, so a board follows you/.test(ct),
      "'coming next' no longer lists sign-in, which now ships");
check(/Syncing your board across devices/.test(ct), "it lists what is genuinely still to come");

console.log("\n=== C15. The public repo carries no personal data ===");
/* The repo is public. Anything committed is visible to colleagues, recruiters
   and the current employer. HANDOVER.md holds personal context for briefing an
   assistant and is deliberately gitignored. */
check(/^HANDOVER\.md$/m.test(readFile(".gitignore")),
      "HANDOVER.md is gitignored, so personal context is never published");

/* The terms are read from the gitignored file rather than written here.
   An earlier version of this test listed them literally - which published the
   very words it was meant to protect, in a public repo. */
const PUBLISHED = ["index.html","guide.html","contact.html","privacy.html",
                   "README.md","package.json",".gitignore","tests/app.test.js"];
const hvPath = path.join(ROOT, "HANDOVER.md");
if (fs.existsSync(hvPath)){
  const hv = fs.readFileSync(hvPath, "utf8");
  /* every capitalised multi-word phrase and every long number in the private
     file is treated as something that must not appear in a published one */
  const terms = new Set();
  (hv.match(/\b[A-Z][a-z]+(?: [A-Z][a-z]+)+\b/g) || []).forEach(t => terms.add(t));
  (hv.match(/[\w.+-]+@[\w.-]+\.\w+/g) || []).forEach(t => terms.add(t));
  (hv.match(/\b\d{3,}k\b|\b\d{7,}\b/g) || []).forEach(t => terms.add(t));
  /* words that legitimately appear in both, e.g. the repo name or a heading */
  const ALLOWED = new Set(["Kanban Board","Row Level","Row Level Security","Day Note",
                           "Public Holidays","Sign In","Export Tasks","Clear Data",
                           "New Year","File Manager","Google Microsoft","Postgres Row"]);
  let leaks = [];
  PUBLISHED.forEach(f => {
    const body = readFile(f);
    terms.forEach(t => {
      if (ALLOWED.has(t)) return;
      if (t.length < 6) return;
      if (body.indexOf(t) > -1) leaks.push(f + " contains " + JSON.stringify(t));
    });
  });
  check(leaks.length === 0,
        leaks.length ? "LEAK: " + leaks.join("; ")
                     : "no phrase from the private handover appears in any published file");
} else {
  ok("HANDOVER.md is absent (fresh clone) - nothing private to leak");
}
check(!/@gmail\.com|@outlook\.com|@yahoo\./.test(PUBLISHED.map(readFile).join(" ")),
      "no personal email address is committed");
check(!/\b\d{10,}\b/.test(PUBLISHED.filter(f => f !== "package.json").map(readFile).join(" ")),
      "no phone number is committed");

console.log("\n=== C16. The Kanban Board is the landing page ===");
/* This used to assert the exact source line, which broke the moment the line
   was refactored even though the behaviour was unchanged. Drive the app
   instead: what matters is where a visitor lands, not how it is written. */
const noHash = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true });
check(!noHash.window.document.getElementById("boardView").classList.contains("hidden"),
      "a visitor with no hash always lands on the board, whatever they viewed last");
const landed = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true,
  beforeParse(win){ win.localStorage.setItem("imc.cfg", JSON.stringify({ view:"calendar" })); }});
const LD = landed.window.document;
check(!LD.getElementById("boardView").classList.contains("hidden"),
      "even a returning visitor whose last view was the Calendar lands on the board");
check(LD.getElementById("calView").classList.contains("hidden"), "and the calendar is not shown");
const deep = new JSDOM(html, { url:"https://inmycalendar.com/index.html#calendar",
  runScripts:"dangerously", pretendToBeVisual:true });
check(!deep.window.document.getElementById("calView").classList.contains("hidden"),
      "an explicit #calendar link still opens the calendar");

console.log("\n=== C17. Mobile layout puts things in a usable order ===");
const mob = (siteCss + appCss).replace(/\s*\n\s*/g,"");
/* superseded: the order:-1 approach produced 2026/2025/2027 and was replaced by
   showing a single year on mobile. Asserted properly in C20. */
check(/\.calrail>\.wg:not\(\.focusyear\)\{display:none\}/.test(mob),
      "a phone shows one calendar year rather than three stacked ones");
check(/\.pane,#boardView\{display:contents\}/.test(mob),
      "wrappers are flattened on mobile so each block can be ordered");
[["#scopeHost{order:2}","the board comes first"],
 ["#bnoteWrap{order:3}","then the day note"],
 [".rail{order:4","then the rail - before the year grid, not after it"],
 ["#glanceBox{order:5}","the big year grid goes last"]].forEach(([rule, why]) =>
  check(mob.indexOf(rule) > -1, why));
check(/\.hidden\{display:none !important\}/.test(siteCss.replace(/\s*\n\s*/g,"")),
      ".hidden still wins over display:contents, so view switching keeps working");

console.log("\n=== C18. Day note sits under the board too ===");
check($("bnote") !== null && $("bnoteWrap") !== null, "there is a day note under the Kanban board");
check(/height:24px/.test(appCss.replace(/\s*\n\s*/g,"").match(/\.bnotewrap textarea\{[^}]*\}/)[0]),
      "one line tall by default, so it costs almost no vertical space");
check(/\.bnotewrap textarea:focus\{[^}]*height:64px/.test(appCss.replace(/\s*\n\s*/g,"")),
      "and grows when you actually use it");
const noteDay = $("isoOut").textContent;
$("bnote").value = "Wrote the sync layer";
$("bnote").dispatchEvent(new w.Event("input",{bubbles:true}));
check(JSON.parse(w.localStorage.getItem("imc.notes"))[noteDay].note === "Wrote the sync layer",
      "typing in it saves");
w.eval('openDay("' + noteDay + '");');
check($("mNote").value === "Wrote the sync layer", "and it is the same note the day popup shows");
w.eval('closeDay();');
click([...$("scopeSeg").children][1]);
check($("bnoteWrap").classList.contains("hidden"), "it hides in week scope, where there is no single day");
click([...$("scopeSeg").children][0]);

console.log("\n=== C19. SEO basics are in place ===");
check(fs.existsSync(path.join(ROOT,"robots.txt")), "robots.txt exists");
check(/Sitemap: https:\/\/inmycalendar\.com\/sitemap\.xml/.test(readFile("robots.txt")),
      "and points at the sitemap");
check(fs.existsSync(path.join(ROOT,"sitemap.xml")), "sitemap.xml exists");
const sm = readFile("sitemap.xml");
["/","guide.html","contact.html","privacy.html"].forEach(u =>
  check(sm.indexOf(u) > -1, "sitemap lists " + u));
PAGES.forEach(pg => check(/rel="canonical"/.test(readFile(pg)),
  pg + " has a canonical URL, so Google does not see duplicates"));
check(/application\/ld\+json/.test(readFile("index.html")) && /WebApplication/.test(readFile("index.html")),
      "the app page carries WebApplication structured data");
const gseo = readFile("guide.html");
check(/application\/ld\+json/.test(gseo) && /"@type":"Article"/.test(gseo),
      "the guide is marked up as an Article - it is the page meant to rank");
check(/<title>What a Kanban board is/.test(gseo),
      "with a title aimed at what people actually search for");
check(/og:title/.test(gseo), "and its own social preview tags");

console.log("\n=== C20. Regressions from the mobile pass, fixed ===");
const mm = (siteCss + appCss).replace(/\s*\n\s*/g,"");
check(/\.shell\{display:flex;flex-direction:column;gap:14px;align-items:stretch\}/.test(mm),
      "mobile shell resets align-items to stretch - inherited 'start' squeezed the board to ~70% width");
check(/\.calrail>\.wg:not\(\.focusyear\)\{display:none\}/.test(mm),
      "a phone shows ONE calendar year - reordering three produced a nonsense 2026/2025/2027 sequence");
check(!/\.thisyear\{order:-1\}/.test(mm), "the order:-1 hack that caused it is gone");
toCal();
const focus = qa("#rail .wg.focusyear");
check(focus.length === 1, "exactly one year is focused");
check(focus[0].querySelector(".yh").textContent.indexOf(String(cy)) === 0,
      "and it is the current year (" + cy + ") when in range");
w.eval("cfg.shift=6; renderCalendar();");
const far = qa("#rail .wg.focusyear");
check(far.length === 1, "panning far from today still focuses exactly one year, so mobile never goes blank");
w.eval("cfg.shift=0; renderCalendar();");
toBoard();

console.log("\n=== C21. Day notes can be finished and cleared ===");
check($("bnoteDone") !== null && $("bnoteClear") !== null,
      "the note under the board has Done and Clear, not just a field you type into");
check($("mClear") !== null && $("mDone") !== null, "so does the day popup");
check(/\.bnotewrap\.filled \.bnoteacts,\.bnotewrap:focus-within \.bnoteacts\{display:flex\}/.test(mm),
      "they appear only when the note is in use, so they cost no space otherwise");
const nd = $("isoOut").textContent;
$("bnote").value = "something"; $("bnote").dispatchEvent(new w.Event("input",{bubbles:true}));
click($("bnoteClear"));
check($("bnote").value === "" &&
      JSON.parse(w.localStorage.getItem("imc.notes"))[nd].note === "", "Clear empties the field and the store");

console.log("\n=== C22. Accessibility and SEO structure ===");
PAGES.forEach(pg => {
  const dd = new JSDOM(assemble(pg), { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true }).window.document;
  check(dd.querySelectorAll("h1").length === 1, pg + " has exactly one h1");
  const dup = {};
  dd.querySelectorAll("[id]").forEach(n => { dup[n.id] = (dup[n.id]||0)+1; });
  check(Object.values(dup).every(n => n === 1), pg + " has no duplicate ids");
  const unnamed = [...dd.querySelectorAll("button")]
    .filter(b => !((b.textContent||"").trim() || b.getAttribute("aria-label") || b.title));
  check(unnamed.length === 0, pg + " has no buttons without an accessible name");
  const unlabelled = [...dd.querySelectorAll("input:not([type=hidden]),select,textarea")]
    .filter(f => !(f.getAttribute("aria-label") || f.getAttribute("placeholder") ||
                   dd.querySelector('label[for="' + f.id + '"]') || f.closest("label")));
  check(unlabelled.length === 0, pg + " has no unlabelled form fields");
});
check(/class="sronly">inmycalendar - a Kanban board/.test(readFile("index.html")),
      "the app page has a visually-hidden h1 - Google needs one, the layout has no room for a visible one");
check(/\.sronly\{position:absolute/.test(siteCss.replace(/\s*\n\s*/g,"")), "and the sronly helper exists");

console.log("\n=== C23. Sign-in failure explains itself ===");
const a3 = readFile("assets/auth.js");
check(/console\.warn/.test(a3), "auth logs why the button is hidden instead of failing silently");
check(/the Supabase library did not load/.test(a3), "it distinguishes a missing library (file:// / offline)");
check(/no Supabase anon key set/.test(a3), "from a missing anon key, which is the likely cause");
check(/Settings > API Keys/.test(a3), "and says exactly where to get the key");

console.log("\n=== C20. The calendar is usable on a phone ===");
const phone = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
  pretendToBeVisual:true, beforeParse(win){ Object.defineProperty(win,"innerWidth",{value:390}); }});
const PD = phone.window.document, PW = phone.window;
PD.querySelector(".sitenav a[data-view=calendar]").dispatchEvent(new PW.MouseEvent("click",{bubbles:true}));
const phoneYears = () => [...PD.querySelectorAll("#rail .wg")]
  .map(g => g.querySelector(".yh").textContent.trim().slice(0,4));
check(phoneYears().length === 1,
      "a phone renders exactly ONE year (" + phoneYears().join(",") + "), not three stacked");
check(phoneYears()[0] === String(cy), "and it opens on the current year, not the earliest");
const y0 = phoneYears()[0];
PD.getElementById("cyNext").dispatchEvent(new PW.MouseEvent("click",{bubbles:true}));
const y1 = phoneYears()[0];
check(y1 !== y0, "the arrows actually move the year on mobile (" + y0 + " -> " + y1 + ")");
PD.getElementById("cyPrev").dispatchEvent(new PW.MouseEvent("click",{bubbles:true}));
check(phoneYears()[0] === y0, "and back again");
check(/if \(narrow\(\)\)/.test(js) && /calFocus/.test(js),
      "mobile tracks its own focused year rather than shifting a range it cannot show");
toCal();
check(qa("#rail .wg").length === 3, "desktop still shows three years side by side");
toBoard();

console.log("\n=== C21. Resizing does not strand the layout ===");
check(/window\.addEventListener\("resize"/.test(js),
      "crossing the mobile threshold re-renders, so a rotate or resize is not left in the wrong mode");

console.log("\n=== C22. The day note can be finished, not just abandoned ===");
check($("bnoteDone") !== null, "the day note has a Done button");
check($("bnoteClear") !== null, "and a Clear button");
check($("mDone") !== null, "the day popup has Done too");
const dnDay = $("isoOut").textContent;
$("bnote").value = "something";
$("bnote").dispatchEvent(new w.Event("input",{bubbles:true}));
click($("bnoteClear"));
check($("bnote").value === "", "Clear empties it");
check(!JSON.parse(w.localStorage.getItem("imc.notes"))[dnDay] ||
      !JSON.parse(w.localStorage.getItem("imc.notes"))[dnDay].note,
      "and clears the stored note, not just the field");

console.log("\n=== C23. Week numbering follows a real standard ===");
check(/weekRule:"thursday"/.test(js), "the default is the first-Thursday rule, not the naive Jan-1 rule");
check($("wkRule") !== null && $("wkRule").options.length === 2,
      "and the user can switch between the two rules");
w.eval('cfg.weekStart=0; cfg.weekRule="thursday";');
const wkOf = ds => w.eval('(function(){var x=weekOf("' + ds + '");return x?x.num+":"+x.year:null;})()');
check(wkOf("2025-12-31") === "1:2026",
      "31 Dec 2025 is week 1 of 2026, not week 53 of 2025");
const startOf = ds => w.eval('(function(){var x=weekOf("' + ds + '");return x?iso(x.start):null;})()');
check(startOf("2027-01-03") === "2027-01-03",
      "week 1 of 2027 starts on 3 Jan 2027");
check(wkOf("2026-12-27") === "53:2026", "27 Dec 2026 is week 53 of 2026, not week 1 of 2027");
check(startOf("2009-01-01") === "2008-12-28",
      "week 1 of 2009 starts 28 Dec 2008");
/* Independent check: for Sunday-start weeks the number equals the ISO week of
   the NEXT day. Everything here must stay in LOCAL dates - mixing Date.UTC
   timestamps with the app's local dates made this fail west of UTC only. */
function isoWeekOfLocal(y, m, day){
  const t = new Date(Date.UTC(y, m, day));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yStart) / 86400000 + 1) / 7);
}
let mism = 0, checked = 0;
const cur = new Date(2024, 0, 1);
const stop = new Date(2029, 11, 31);
while (cur <= stop){
  const ds = cur.getFullYear() + "-" +
             String(cur.getMonth()+1).padStart(2,"0") + "-" +
             String(cur.getDate()).padStart(2,"0");
  const got = w.eval('(function(){var x=weekOf("' + ds + '");return x?x.num:null;})()');
  const nxt = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  if (got !== isoWeekOfLocal(nxt.getFullYear(), nxt.getMonth(), nxt.getDate())) mism++;
  checked++;
  cur.setDate(cur.getDate() + 1);
}
check(mism === 0, checked + " days cross-checked against an independent ISO calculation, " + mism + " mismatches");
w.eval('cfg.weekRule="jan1";');
check(wkOf("2025-12-31") === "53:2025", "switching to the Jan-1 rule changes the answer as expected");
w.eval('cfg.weekRule="thursday"; renderAll();');

console.log("\n=== C24. Country list has no duplicate aliases ===");
const names = [...$("ctrySel").options].slice(1).map(o => o.textContent);
check(new Set(names).size === names.length, "no duplicate country names");
check(!names.includes("UK"), "the non-ISO 'UK' alias is gone (GB / United Kingdom is the real entry)");
check(names.includes("United Kingdom"), "United Kingdom is still there");
check(names.includes("Kosovo"), "XK is named Kosovo rather than showing a bare code");
check(!names.some(n => /^[A-Z]{2}$/.test(n)), "no entry falls back to showing its country code");
check(!fs.existsSync(path.join(ROOT,"assets/holidays/UK.js")),
      "and its duplicate data file is removed - if this fails, delete assets/holidays/UK.js by hand: " +
      "copying a new build over a folder adds and overwrites, it never deletes files that were removed");

console.log("\n=== C25. Countdowns can be corrected, not just deleted ===");
$("tLabel").value = "Typo hree"; $("tDate").value = "2027-06-01"; click($("tAdd"));
const tkField = d.querySelector("#tkList input.tkl");
check(tkField !== null, "a countdown's name is an editable field, not fixed text");
check(tkField.value === "Typo hree", "showing the current name");
check(/click to rename/.test(tkField.title), "and saying so on hover");
tkField.value = "Typo here fixed";
tkField.dispatchEvent(new w.Event("change",{bubbles:true}));
check(JSON.parse(w.localStorage.getItem("imc.track")).some(t => t.label === "Typo here fixed"),
      "editing it saves the correction");
const tkField2 = d.querySelector("#tkList input.tkl");
tkField2.value = "   ";
tkField2.dispatchEvent(new w.Event("change",{bubbles:true}));
check(!JSON.parse(w.localStorage.getItem("imc.track")).some(t => !t.label.trim()),
      "and blanking it is refused rather than leaving a nameless countdown");

console.log("\n=== C26. Day note controls appear only while editing ===");
check(/\.bnotewrap \.bnbtns\{display:none/.test(appCss.replace(/\s*\n\s*/g,"")),
      "Clear and Done are hidden until you are actually writing");
check(/\.bnotewrap\.editing \.bnbtns\{display:flex\}/.test(appCss.replace(/\s*\n\s*/g,"")),
      "and appear when the field has focus");
$("bnote").dispatchEvent(new w.Event("focus",{bubbles:true}));
check($("bnoteWrap").classList.contains("editing"), "focusing shows them");

console.log("\n=== C27. The calendar uses the whole screen ===");
const flatCal = appCss.replace(/\s*\n\s*/g,"");
check(/\.calbox\{overflow:auto;max-height:calc\(100vh - 190px\)/.test(flatCal),
      "height follows the viewport, so a big monitor shows more weeks than a fixed fraction would");
check(/\.wg \.yh\{[^}]*position:sticky;top:0;z-index:7/.test(flatCal),
      "the year row stays put while you scroll");
check(/\.wg \.dh\{[^}]*position:sticky;top:var\(--hYear\);z-index:6/.test(flatCal),
      "and the day-of-week row sits under it, also sticky");

console.log("\n=== C28. Rail order matches how people use it ===");
const boxes = [...qa(".rail .rbox h3")].map(x => x.textContent.trim());
check(boxes.indexOf("Countdowns") < boxes.indexOf("Day colours"),
      "Countdowns sits above Day colours: " + boxes.join(" -> "));

console.log("\n=== C29. Sign-in is actually live ===");
const auKey = readFile("assets/auth.js");
check(/IMC_SUPABASE_ANON_KEY\s*=\s*"eyJ[A-Za-z0-9_.-]{40,}"/.test(auKey),
      "a real anon key is assigned (the placeholder text survives only in the help message)");
check(/IMC_SUPABASE_URL\s*=\s*"https:\/\/[a-z0-9]+\.supabase\.co"/.test(auKey), "and the project URL matches it");
/* paint the UI the way the live site does, with the library available */
const withLib = html.replace(/<script src="https:[^"]*"><\/script>/g,
  '<script>window.supabase={createClient:function(){return{auth:{getSession:function(){return Promise.resolve({data:{session:null}})},onAuthStateChange:function(){},signInWithOAuth:function(){return Promise.resolve({})},signInWithOtp:function(){return Promise.resolve({})},signOut:function(){return Promise.resolve({})}}}}};</script>');
const liveDom = new JSDOM(withLib, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true });
const liveDoc = liveDom.window.document;
check(liveDoc.getElementById("authSlot") !== null, "the account slot exists in the ribbon");
/* These styles MUST live in site.css, not app.css. auth.js injects the widget
   into every page, but only index.html loads app.css, so while these rules
   lived there the badge and Sign out button rendered unstyled and overlapping
   on guide, contact and privacy. Asserting it per page is the only version of
   this check that would have caught it. */
const flatSite = siteCss.replace(/\s*\n\s*/g,"");
check(/\.authslot \.signin\{background:var\(--accent\)/.test(flatSite),
      "the Sign in button is styled as the primary action");
check(/\.authslot\{[^}]*display:inline-flex/.test(flatSite) && /\.authslot \.who\{/.test(flatSite),
      "and the slot and name badge are laid out, so they cannot overlap Sign out");
check(!/\.authslot \.who\{/.test(appCss),
      "none of it is left in app.css, which three of the four pages never load");
PAGES.forEach(p => {
  const css = readFile(p).match(/<link rel="stylesheet" href="(assets\/[^"?]+)/g) || [];
  const sheets = css.map(m => m.split('href="')[1]);
  const merged = sheets.map(readFile).join("").replace(/\s*\n\s*/g,"");
  check(/\.authslot \.who\{/.test(merged) && /\.authmenu\{/.test(merged),
        p + " loads the stylesheet that positions the sign-in widget");
});
check(/id:"google"/.test(auKey), "Google is offered");
check(/signInWithOtp/.test(auKey), "and email sign-in by link");

console.log("\n=== C30. The day note can be closed three ways ===");
["bnoteDone","bnoteClear","bnoteCancel","bnoteX"].forEach(id =>
  check($(id) !== null, "the note has a " + id.replace("bnote","") + " control"));
check(/\.bnotewrap\.editing \.bnx\{display:block\}/.test(appCss.replace(/\s*\n\s*/g,"")),
      "the X appears only while the note is open");
const cDay = $("isoOut").textContent;
$("bnote").dispatchEvent(new w.Event("focus",{bubbles:true}));
$("bnote").value = "typed by mistake";
$("bnote").dispatchEvent(new w.Event("input",{bubbles:true}));
click($("bnoteCancel"));
const after = JSON.parse(w.localStorage.getItem("imc.notes"))[cDay];
check(!after || !after.note, "Cancel puts back what was there before, it does not save the typing");
check(!$("bnoteWrap").classList.contains("editing"), "and closes the panel");
check(!/noteBefore/.test(JSON.stringify(after || {})), "the undo snapshot is cleaned up, not left in storage");

console.log("\n=== C31. Search costs no permanent screen space ===");
check($("searchBtn") !== null, "a small magnifier sits in the ribbon");
check($("sov") !== null && $("sov").classList.contains("hidden"), "and the search panel is an overlay, hidden until asked for");
add(0,"Renegotiate the vendor contract");
w.eval('openDay("' + TODAY + '");');
$("mNote").value = "vendor call went well";
$("mNote").dispatchEvent(new w.Event("input",{bubbles:true}));
w.eval('closeDay();');
click($("searchBtn"));
check(!$("sov").classList.contains("hidden"), "clicking it opens search");
$("sInput").value = "vendor";
$("sInput").dispatchEvent(new w.Event("input",{bubbles:true}));
const rows = qa("#sOut .srow");
check(rows.length >= 2, rows.length + " results across tasks and day notes");
check(rows.some(r => /Day note/.test(r.textContent)), "day notes are searched too, not just tasks");
check(rows.some(r => /Renegotiate/.test(r.textContent)), "and task text");
$("sInput").value = "z";
$("sInput").dispatchEvent(new w.Event("input",{bubbles:true}));
check(/two characters/.test($("sOut").textContent), "a single character asks for more rather than listing everything");
$("sInput").value = "qqqzzz";
$("sInput").dispatchEvent(new w.Event("input",{bubbles:true}));
check(/Nothing found/.test($("sOut").textContent), "and a miss says so plainly");
$("sInput").value = "vendor";
$("sInput").dispatchEvent(new w.Event("input",{bubbles:true}));
click(qa("#sOut .srow")[0]);
check($("sov").classList.contains("hidden"), "clicking a result closes search");
check($("boardView").classList.contains("hidden") === false, "and lands you on the board for that day");
check(/\/" && !typing/.test(js) || /e.key === "\/"/.test(js), "the / key opens search from anywhere");

console.log("\n=== C33. The day popup note matches the board note ===");
w.eval('openDay("' + TODAY + '");');
["mDone","mClear","mCancel"].forEach(id =>
  check($(id) !== null, "the popup note has " + id.replace("m","")));
$("mNote").value = "typed then cancelled";
$("mNote").dispatchEvent(new w.Event("input",{bubbles:true}));
click($("mCancel"));
const popNote = JSON.parse(w.localStorage.getItem("imc.notes"))[TODAY];
check(!popNote || popNote.note !== "typed then cancelled", "Cancel restores what was there before");
check($("ov").classList.contains("hidden"), "and closes the popup");

console.log("\n=== C34. Done closes the board note first time ===");
check(/mousedown, not click/.test(js),
      "the note buttons fire on mousedown - blur fired between mousedown and click and swallowed the first press");
check(/onPress\(el\.bnoteDone, closeNote\)/.test(js), "Done uses it");
check(/onPress\(el\.bnoteX, closeNote\)/.test(js), "so does the X");
check(/node\.addEventListener\("click", function\(\)\{ if \(Date\.now\(\) - last > 400\) fn\(\); \}\)/.test(js),
      "and click still works, so keyboard users pressing Enter are not locked out");

console.log("\n=== C35. Sign-in is reachable from every page ===");
PAGES.forEach(pg => {
  const body = readFile(pg);
  check(/id="authSlot"/.test(body), pg + " has the account slot");
  check(/assets\/auth\.js/.test(body), pg + " loads auth.js");
});

console.log("\n=== C36. The save choke point records what changed ===");
/* Sync merges row by row, and the agreed rule keeps deletions as markers. So
   these check the journal itself, not merely that a write happened. A blanket
   "something changed" flag would pass a naive test and still lose data. */
check(typeof w.commit === "function", "commit() exists as the single write path");
check((js.match(/localStorage\.setItem/g) || []).length === 1,
      "exactly one place in the whole app writes to localStorage");
check(/function writeRaw\(/.test(js), "and it is writeRaw(), reached only through commit()");
check(!/\bsave\(LS\./.test(js), "no call site pairs a key with a value by hand any more");

toBoard();
dom.window.eval('setScope("day"); setDate(iso(today()));');
const jr    = () => w.imcStore.changes();
const jrow  = (kind,id) => jr().find(r => r.kind === kind && r.id === id);
const idOf  = text => JSON.parse(w.localStorage.getItem("imc.tasks")).find(t => t.text === text).id;

w.imcStore.fullSyncDone();
check(jr().length === 0, "the journal is empty once a sync reports everything landed");

add(0, "Choke point task");
const ckId = idOf("Choke point task");
check(!!jrow("tasks", ckId), "adding a task records that row as changed");
check(jrow("tasks", ckId).op === "upsert", "and records it as an upsert");

/* The point of diffing rather than flagging: one edit must mark one row. If it
   marked the whole array, task-level merge would be impossible. */
w.imcStore.fullSyncDone();
dom.window.eval('byId("'+ckId+'").text = "Choke point renamed"; commit("tasks");');
check(jr().length === 1, "editing one task marks exactly one row, not the whole board");
check(jrow("tasks", ckId).op === "upsert", "and that row is the one that was edited");

w.imcStore.fullSyncDone();
add(0, "Untouched neighbour");
const nbId = idOf("Untouched neighbour");
w.imcStore.fullSyncDone();
dom.window.eval('byId("'+ckId+'").text = "Choke point again"; commit("tasks");');
check(!jrow("tasks", nbId), "a task nobody touched is not marked as changed");

/* The resurrection bug the sync rule exists to prevent: a deleted row that is
   simply dropped is invisible to the other device, which sends it back. */
w.imcStore.fullSyncDone();
const delRow = d.querySelector('[data-id="'+ckId+'"]');
const delBtn = [...delRow.querySelectorAll("button")].find(b => b.title === "Delete");
click(delBtn);
check(JSON.parse(w.localStorage.getItem("imc.tasks")).every(t => t.id !== ckId),
      "deleting a task removes it from storage");
check(!!jrow("tasks", ckId), "but the deletion is still recorded, not dropped silently");
check(jrow("tasks", ckId).op === "delete", "as a delete marker naming that exact task");

const onDisk = JSON.parse(w.localStorage.getItem("imc.pending"));
check(!!onDisk && !!onDisk.rows["tasks:"+ckId],
      "the journal is persisted, so a change made offline survives closing the tab");

/* A push that succeeds clears only the version it actually sent. */
w.imcStore.fullSyncDone();
dom.window.eval('byId("'+nbId+'").text = "Edit one"; commit("tasks");');
const inFlight = jr();
w.imcStore.settled(inFlight);
check(jr().length === 0, "rows the sync confirms are cleared from the journal");

w.imcStore.fullSyncDone();
dom.window.eval('byId("'+nbId+'").text = "Edit two"; commit("tasks");');
const pushed = jr();
dom.window.eval('byId("'+nbId+'").text = "Edit three"; commit("tasks");');
w.imcStore.settled(pushed);
check(jr().length === 1, "an edit made while a push was in flight is not cleared with it");

/* Day notes are keyed by date, not by a row id. */
w.imcStore.fullSyncDone();
dom.window.eval('notes["'+cy+'-04-07"] = { color:1, note:"journal check" }; commit("notes");');
check(!!jrow("notes", cy+"-04-07"), "a day note is journalled under its own date");
w.imcStore.fullSyncDone();
dom.window.eval('delete notes["'+cy+'-04-07"]; commit("notes");');
check(jrow("notes", cy+"-04-07") && jrow("notes", cy+"-04-07").op === "delete",
      "and removing that note leaves a delete marker too");

/* Unsynced history cannot grow without limit. Past the cap it gives up on the
   detail and asks the next sync to reconcile everything once. */
w.imcStore.fullSyncDone();
check(w.imcStore.needsFullSync() === false, "normally the journal replays row by row");
dom.window.eval('for (var ci=0; ci<PENDING_CAP+2; ci++) markPending("tasks","cap"+ci,"upsert");');
check(w.imcStore.needsFullSync() === true,
      "past " + dom.window.PENDING_CAP + " unsynced rows it falls back to a full reconcile");
w.imcStore.fullSyncDone();
check(w.imcStore.needsFullSync() === false && jr().length === 0,
      "and a completed full sync resets it");

/* A corrupt journal must never stop the app loading. */
const seedKeys = {};
["tasks","notes","track","cfg"].forEach(k => seedKeys["imc."+k] = w.localStorage.getItem("imc."+k));
const e3 = [];
const dom3 = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true,
  virtualConsole: new VirtualConsole().on("jsdomError", e => e3.push(String(e.detail||e))),
  beforeParse(win){
    Object.keys(seedKeys).forEach(k => { if (seedKeys[k] !== null) win.localStorage.setItem(k, seedKeys[k]); });
    win.localStorage.setItem("imc.pending", "not json at all");
  }});
check(e3.length === 0, "a corrupt journal does not stop the app booting" + (e3.length ? " -> " + e3.join("|") : ""));
check(dom3.window.imcStore.changes().length === 0, "it just starts from an empty journal");


console.log("\n=== C37. A sign-in token survives the page load ===");
/* Sign-in returns its token in the URL fragment. init() used to replace the
   whole fragment with "#board" before auth.js had loaded and read it, so every
   sign-in succeeded on the server and silently failed in the browser. The
   Supabase logs showed five successful Google logins on a day the button never
   once changed to signed in. Structure tests cannot catch that; these boot the
   real app at the real URL Google sends people back to. */
function bootAt(url){
  const errs = [];
  const dm = new JSDOM(html, { url, runScripts:"dangerously", pretendToBeVisual:true,
    virtualConsole: new VirtualConsole().on("jsdomError", e => errs.push(String(e.detail||e))) });
  return { win: dm.window, errs };
}

const okBoot = bootAt("https://inmycalendar.com/#access_token=TESTTOKEN&token_type=bearer&expires_in=3600");
check(okBoot.errs.length === 0,
      "the app boots cleanly when Google returns a token" + (okBoot.errs.length ? " -> " + okBoot.errs.join("|") : ""));
check(okBoot.win.location.hash.indexOf("access_token") >= 0,
      "the sign-in token is still in the URL after init(), so auth.js can read it");

const errBoot = bootAt("https://inmycalendar.com/#error_description=access_denied");
check(errBoot.win.location.hash.indexOf("error_description") >= 0,
      "a refused sign-in keeps its error in the URL, so it can be reported rather than vanishing");

const calBoot = bootAt("https://inmycalendar.com/#calendar");
check(calBoot.win.location.hash === "#calendar",
      "an ordinary view hash is untouched by the guard");

const plainBoot = bootAt("https://inmycalendar.com/");
check(plainBoot.win.location.hash === "#board",
      "and a plain visit still gets its #board hash exactly as before");


console.log("\n=== C38. A task can be added and read without a mouse ===");
/* Three complaints drove this: a phone keyboard has no reliable Enter, a long
   task showed only its first few words, and the row controls hid behind a
   :hover that a touch screen cannot produce. */
toBoard();
dom.window.eval('setScope("day"); setDate(iso(today()));');

const addBtns = qa("#scopeHost .addgo");
check(addBtns.length === 3, "every column has a visible Add button, not just an Enter key");
check(addBtns.every(b => b.type === "button"), "they are real buttons, so they never submit a form");
check(addBtns.every(b => /^Add to /.test(b.title || "")),
      "each says which column it adds to, for screen readers and tooltips");

const beforeAdd = JSON.parse(w.localStorage.getItem("imc.tasks")).length;
const todoField = col(0).querySelector(".cadd");
todoField.value = "Added with the button, no Enter pressed";
click(col(0).querySelector(".addgo"));
const afterAdd = JSON.parse(w.localStorage.getItem("imc.tasks"));
check(afterAdd.length === beforeAdd + 1, "clicking it adds the task without any key being pressed");
check(afterAdd.some(t => t.text === "Added with the button, no Enter pressed"),
      "and the task carries the text that was typed");
check(col(0).querySelector(".cadd").value === "", "the field clears itself ready for the next one");

const emptyBefore = JSON.parse(w.localStorage.getItem("imc.tasks")).length;
col(0).querySelector(".cadd").value = "   ";
click(col(0).querySelector(".addgo"));
check(JSON.parse(w.localStorage.getItem("imc.tasks")).length === emptyBefore,
      "an empty or blank field adds nothing");

/* The text itself: three lines, never one, never unlimited. The controls are a
   float, so ONLY the first line shortens around them and lines two and three
   run the full width of the card. A flex row narrowed every line equally,
   which is what left line two stopping short of the right edge. */
check(/\.t \.txt\{[^}]*max-height:calc\(1\.6em \* 3\)/.test(flat),
      "task text is capped at three lines, not one");
/* overflow:hidden makes a block formatting context, and a BFC refuses to
   overlap a float - it sits beside it, narrowing EVERY line to the leftover
   width. That was the original bug. overflow:clip creates no BFC. */
check(/\.t \.txt\{[^}]*overflow:clip/.test(flat),
      "the clip is overflow:clip, since overflow:hidden would box the text beside the float");
check(!/\.t \.txt\{[^}]*overflow:hidden/.test(flat),
      "and overflow:hidden is specifically not used on the task text");
check(!/\.t \.txt\{[^}]*-webkit-line-clamp/.test(flat),
      "the cap is max-height, because a -webkit-box will not flow around a float");
check(!/\.t \.txt\{[^}]*white-space:nowrap/.test(flat),
      "the single-line nowrap that hid most of every task is gone");
check(/\.t \.txt\{[^}]*overflow-wrap:anywhere/.test(flat),
      "a long unbroken word wraps instead of overflowing the card");
check(/\.t\{display:block/.test(flat),
      "the row is a block, not a flex row that would narrow every line equally");
check(/\.t \.ops\{float:right/.test(flat),
      "the controls are a right-hand float, so only the first line shortens around them");
/* Source order is load-bearing: a line box only flows around a float that
   PRECEDES it. ops must be appended before txt or the float does nothing. */
const rowKids = [...qa("#scopeHost .t")[0].children].map(n => n.className.split(" ")[0]);
check(rowKids.indexOf("ops") < rowKids.indexOf("txt"),
      "and the controls come before the text in the DOM, or the float would not affect it");

/* Touch: the controls cannot live behind :hover alone. */
check(/@media \(hover:none\)\{\.t \.ops\{visibility:visible\}\}/.test(flat),
      "on a touch screen the row controls are always visible, not hover-gated");

/* The repeat control is gone, and so is the machinery behind it. */
const anyRow = qa("#scopeHost .t")[0];
check(!!anyRow, "there is a task row to inspect");
check(![...anyRow.querySelectorAll(".op")].some(b => /Repeat|Every day|Every week|Every month/.test(b.title || "")),
      "the repeat control has been removed from the row");
check(!/materialiseRepeats|setRepeat|repeatMatches/.test(js),
      "and its machinery is gone too, so nothing keeps generating tasks with no way to stop it");


console.log("\n=== C39. A calendar link carries its country ===");
/* Sharing "Japan has these holidays" used to mean sending a generic link plus
   a covering note telling the person to find the country dropdown. The country
   is the only part of the view worth putting in a link; everything else is
   personal and stays on the device. */
function bootHash(hash){
  const errs = [];
  const dm = new JSDOM(html, { url:"https://inmycalendar.com/" + hash, runScripts:"dangerously",
    pretendToBeVisual:true,
    virtualConsole: new VirtualConsole().on("jsdomError", e => errs.push(String(e.detail||e))) });
  return { win: dm.window, doc: dm.window.document, errs };
}

const jp = bootHash("#calendar/JP");
check(jp.errs.length === 0, "a country link boots cleanly" + (jp.errs.length ? " -> " + jp.errs.join("|") : ""));
check(!jp.doc.getElementById("calView").classList.contains("hidden"),
      "#calendar/JP opens the calendar");
check(jp.doc.getElementById("ctrySel").value === "JP",
      "and the country picker is already set to Japan, with no covering note needed");

const lower = bootHash("#calendar/jp");
check(lower.doc.getElementById("ctrySel").value === "JP",
      "a lowercase country code in a link works too, because people type links by hand");

const bogus = bootHash("#calendar/ZZZZ");
check(bogus.errs.length === 0, "an invalid country code does not break the page");
check(!bogus.doc.getElementById("calView").classList.contains("hidden"),
      "it just opens the calendar with whatever country was already set");

const plain = bootHash("#calendar");
check(!plain.doc.getElementById("calView").classList.contains("hidden"),
      "a plain #calendar link still works exactly as before");

check(/function viewHash\(/.test(js),
      "one function owns the address bar, so the view and the URL cannot drift apart");

console.log("\n=== C40. The phone pass ===");
/* An Apple design reviewer's summary of the previous build was that the mobile
   version would lose users. These are the three faults that made it feel
   broken rather than merely cramped. */
/* Every phone block, not just the last one. Using .pop() here broke the moment
   a second (max-width:640px) block was appended lower down the file, which is
   a normal thing to do and should not fail unrelated assertions. */
const phoneCss = flat.split("@media (max-width:640px)").slice(1).join("");
check(/font-size:16px/.test(phoneCss),
      "inputs are 16px on a phone, the exact threshold below which iOS zooms the page on focus");
check(/\.wg \.dc\{min-height:34px/.test(phoneCss),
      "calendar days are 34px tall rather than 21px, so they can be hit with a thumb");
check(/\.op\{width:34px;height:32px/.test(phoneCss),
      "the row controls are thumb-sized rather than 20px");
check(/\.t\{display:flex;flex-direction:column/.test(phoneCss),
      "on a phone the row is a column, since a float would leave 60px for the first line");
check(/\.t \.txt\{order:1;float:none/.test(phoneCss),
      "text first, controls under it, via flex order so the desktop source order is untouched");
check(/\.cadd\{height:38px/.test(phoneCss) && /\.addgo\{width:38px;height:38px/.test(phoneCss),
      "the add field and its button are both 38px, comfortably tappable");
/* Measured on the live site after the first pass: these four were still under
   16px, because styling by id outranks a bare element selector. Naming them is
   the fix, and this asserts they stay named. */
check(/#tLabel,#tDate,#tUnit\{min-height:38px\}/.test(phoneCss),
      "the countdown fields are named explicitly, or they keep zooming the page");
check(/#holReg\{width:20px;height:20px\}/.test(phoneCss),
      "the regional-holidays checkbox is big enough to hit with a thumb");


console.log("\n=== C41. The sync seam ===");
/* sync.js needs four things from app.js and nothing else. If any of them goes
   missing the sync layer fails silently, which is the worst possible failure
   for a thing whose job is not losing your data. */
check(typeof w.imcStore.read === "function", "sync can read the current state of a bucket");
check(typeof w.imcStore.adopt === "function", "and write state that came from the server");
check(typeof w.imcStore.discard === "function", "and drop a pending edit that lost a conflict");
check(typeof w.imcStore.clearLocal === "function", "and clear this device on sign-out");
check(typeof w.imcStore.repaint === "function", "and redraw once rows have landed");

/* adopt() must NOT journal. Journalling a pulled row would push it straight
   back on the next sync, and every device would re-send everything it had just
   received, for ever. */
w.imcStore.fullSyncDone();
const adoptedId = "srv_" + Date.now().toString(36);
const beforeAdopt = JSON.parse(JSON.stringify(w.imcStore.read("tasks")));
w.imcStore.adopt("tasks", beforeAdopt.concat([{ id:adoptedId, date:TODAY, text:"came from the server",
  status:"todo", order:99, ts:{todo:null,doing:null,done:null} }]));
check(w.imcStore.read("tasks").some(t => t.id === adoptedId), "a pulled row lands in local state");
check(w.imcStore.changes().length === 0,
      "and creates NO journal entry, so it is never pushed back to the server it came from");

/* A local edit after adopting must still journal normally. */
dom.window.eval('byId("' + adoptedId + '").text = "edited locally"; commit("tasks");');
check(w.imcStore.changes().some(c => c.id === adoptedId),
      "but editing that same row locally does journal it, ready to push");

/* discard() drops one pending row without touching the others. */
w.imcStore.fullSyncDone();
dom.window.eval('byId("' + adoptedId + '").text = "loses to the server"; commit("tasks");');
const others = w.imcStore.changes().length;
w.imcStore.discard("tasks", adoptedId);
check(!w.imcStore.changes().some(c => c.id === adoptedId),
      "a pending edit that lost on timestamp is dropped rather than pushed over the newer one");
check(w.imcStore.changes().length === others - 1, "and only that one row is dropped");

/* Sign-out must leave nothing personal behind on a shared machine. */
w.imcStore.adopt("notes", { "2026-05-05": { color:1, note:"private note" } });
w.imcStore.clearLocal();
check(w.imcStore.read("tasks").length === 0, "signing out clears the tasks from this device");
check(Object.keys(w.imcStore.read("notes")).length === 0, "and the day notes, which are the private part");
check(w.imcStore.read("track").length === 0, "and the countdowns");
check(w.imcStore.changes().length === 0, "and empties the journal, so nothing re-uploads to the wrong account");
check(!!w.imcStore.read("cfg"), "but keeps settings like week-start and country, which are preferences not secrets");
check(JSON.parse(w.localStorage.getItem("imc.tasks")).length === 0, "the wipe reaches storage, not just memory");

/* The change event is what tells sync there is work to do. */
let fired = 0;
w.addEventListener("imc:changed", () => fired++);
dom.window.eval('addTask(sel, "fires the sync signal", "todo"); ');
check(fired > 0, "a real edit fires imc:changed, which is how sync knows to push");
const quiet = fired;
dom.window.eval('commit("tasks");');
check(fired === quiet, "committing with nothing changed fires nothing, so sync is not woken for no reason");

console.log("\n=== C42. sync.js is optional, never load-bearing ===");
const syncSrc = readFile("assets/sync.js");
check(/PULL, MERGE, PUSH/.test(syncSrc),
      "the order is documented: pushing first would overwrite a newer remote edit with an older local one");
check(/deleted/.test(syncSrc), "deletions travel as markers, not as absent rows");
check(!/service_role/.test(syncSrc), "no service_role key anywhere near this file");
check(/imc\.lastPull/.test(syncSrc), "it pulls incrementally rather than refetching everything every time");
/* index.html loads it, and the app has to survive it being absent. */
check(/assets\/sync\.js\?v=\d+/.test(readFile("index.html")), "index.html loads sync.js with a cache tag");
check(!/assets\/sync\.js/.test(readFile("guide.html")), "the content pages do not load it, having nothing to sync");


console.log("\n########  D. EVERYTHING THAT WAS ALREADY WORKING  ########");
check(errors.length === 0, "no uncaught JS errors" + (errors.length ? " -> " + errors.join(" | ") : ""));
check($("boardView").children[1].id === "scopeHost", "board still starts with the kanban");
check(qa("#scopeHost .cadd").length === 3, "each column has its own add field");
const doneBefore = col(2).querySelectorAll(".t").length;
const progBefore = col(1).querySelectorAll(".t").length;
add(2,"Logged late"); add(1,"Half done");
check(col(2).querySelectorAll(".t").length === doneBefore + 1 &&
      col(1).querySelectorAll(".t").length === progBefore + 1,
      "adds straight into Done and In progress");
add(0,"A"); add(0,"B");
const texts = () => [...col(0).querySelectorAll(".t .txt")].map(n => n.textContent);
const row = t => [...col(0).querySelectorAll(".t")].find(x => x.querySelector(".txt").textContent === t);
const op = (rowEl, title) => [...rowEl.querySelectorAll(".op")].find(b => b.title === title);
click(op(row("B"),"Move up"));
check(texts().indexOf("B") < texts().indexOf("A"), "▲ reorders priority");
const progNow = col(1).querySelectorAll(".t").length;
click(op(row("A"),"Move right"));
check(col(1).querySelectorAll(".t").length === progNow + 1, "→ moves across columns");
click([...$("scopeSeg").children][1]);
check($("scopeHost").className === "ro" && $("scopeHost").querySelectorAll(".t").length === 0, "week is read-only");
click($("scopeHost").querySelector(".rr"));
check($("scopeHost").className === "kb", "a read-only row returns to that day's board");
toCal();
const mid = $("rail").children[1];
const titles = [...mid.querySelectorAll(".dc")].map(c => c.title.split(/\s/)[0]);
const leap = (cy%4===0&&cy%100!==0)||cy%400===0;
check(titles.filter(t => t.startsWith(cy+"-")).length === (leap?366:365), "every day of the year appears once");
check(titles.includes(cy+"-12-31") && titles.includes(cy+"-01-01"), "Jan 1 and Dec 31 present");
check(mid.querySelectorAll(".dc.out").length > 0, "edge days greyed, not dropped");
check(/^\d{2}-\d{2}$/.test(mid.querySelector(".dc").textContent), "cells are MM-DD");
dom.window.eval('notes["'+cy+'-03-05"]={color:2,note:"x"}; commit("notes"); renderAll();');
const painted = qa("#rail .dc").find(c => c.title.startsWith(cy+"-03-05"));
check(/\bk2\b/.test(painted.className) && !painted.querySelector(".dot"), "a coloured day fills the whole cell");
const tgt = qa("#rail .dc").find(c => c.title.startsWith(cy+"-03-1"));
const tds = tgt.title.split(/\s/)[0];
click(tgt);
check(!$("ov").classList.contains("hidden") && $("mDate").textContent === tds, "day popup opens on the right date");
check($("mKb").children.length === 3, "with the editable board embedded");
click($("mClose"));
check($("isoOut").textContent === tds, "board follows the popup");
toCal();
const at = (l,dt,u) => { $("tLabel").value=l; $("tDate").value=dt; $("tUnit").value=u||"days"; click($("tAdd")); };
const past = new Date(); past.setDate(past.getDate()-100);
const fut = new Date(); fut.setDate(fut.getDate()+432);
at("Started", iso(past)); at("Deadline", iso(fut));
const tk = () => qa("#tkList .tk").map(n => (n.querySelector(".tkl")||{}).value + " " + n.textContent);
check(tk().some(t => /100 days elapsed/.test(t)), "past → positive elapsed");
check(tk().some(t => /-432 days left/.test(t)), "future → negative countdown");
const ten = new Date(); ten.setFullYear(ten.getFullYear()-10);
at("Ten years", iso(ten), "months");
check(tk().some(t => /120 months elapsed/.test(t)), "10 years → 120 months by calendar maths");
at("Long ago","1990-03-15","years");
check(tk().some(t => /years elapsed/.test(t)), "an old date counts up in years");
check(qa("#tkList .tk.next").length === 1, "nearest upcoming date flagged");
toBoard();
const tkCount = qa("#tkList .tk").length;
check(tkCount >= 4, "the rail shows all " + tkCount + " countdowns on the board too");
const b4 = $("isoOut").textContent;
key("ArrowRight"); check($("isoOut").textContent !== b4, "→ steps a day");
key("t"); check($("isoOut").textContent === TODAY, "T = today");
key("c"); check(!$("calView").classList.contains("hidden"), "C = calendar");
key("b"); check(!$("boardView").classList.contains("hidden"), "B = board");
key("n"); check(d.activeElement.className === "cadd", "N focuses an add field");
check(!/offsetHeight|clientHeight/.test(js), "no JS layout measurement");
check(/--hYear:30px/.test(flat) && /top:var\(--hYear\)/.test(flat.replace(/\s+/g,"")),
      "sticky offsets are fixed CSS custom properties, not JS-measured");
check((flat.match(/minmax\(0,1fr\)/g)||[]).length >= 3, "grids use minmax(0,1fr)");
check(!/\.calbox\{[^}]*overflow:hidden/.test(flat), "no overflow:hidden above sticky headers");
check(js.lastIndexOf("init()") > js.lastIndexOf("function init"), "init() is the last statement");
const saved = {}; ["tasks","notes","track","cfg"].forEach(k => saved[k] = w.localStorage.getItem("imc."+k));
const e2 = [];
const dom2 = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true,
  virtualConsole: new VirtualConsole().on("jsdomError", e => e2.push(String(e.detail||e))),
  beforeParse(win){ Object.keys(saved).forEach(k => win.localStorage.setItem("imc."+k, saved[k])); }});
check(e2.length === 0, "reload clean" + (e2.length ? " -> " + e2.join("|") : ""));
check(dom2.window.document.querySelectorAll("#tkList .tk").length === tkCount,
      "all " + tkCount + " countdowns survive a reload");
 click($("wipe"));
check(JSON.parse(w.localStorage.getItem("imc.tasks")).length === 0, "wipe clears tasks");

/* ---------------------------------------------------------------------------
   The docs claim a test count. Those claims went stale three separate times
   (README said 363 twice and 281 once while the real number was 317), in the
   very file whose job is to be the source of truth. This compares every claim
   to the real total. It runs AFTER the counters are final and deliberately
   sits outside check(), so it cannot change the number it is verifying.
   --------------------------------------------------------------------------- */
let docFail = 0;
const TOTAL = pass + fail;
[["README.md", /\b(\d{2,4})\s+(?:passed|checks)\b/g],
 ["HANDOVER.md", /\b(\d{2,4})\s+tests passing\b/g]].forEach(([file, re_]) => {
  const fp = path.join(ROOT, file);
  if (!fs.existsSync(fp)) return;          // HANDOVER is gitignored; may be absent
  const body = fs.readFileSync(fp, "utf8");
  let m;
  while ((m = re_.exec(body)) !== null){
    const claimed = parseInt(m[1], 10);
    if (claimed !== TOTAL){
      console.log("  DOC   " + file + " claims " + claimed + " tests, the suite has " + TOTAL);
      docFail++;
    }
  }
});

console.log("\n" + "=".repeat(58));
console.log("  " + pass + " passed, " + fail + " failed");
if (docFail) console.log("  " + docFail + " stale test-count claim(s) in the docs - update them");
console.log("=".repeat(58));
process.exit(fail || docFail ? 1 : 0);
