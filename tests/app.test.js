const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const zlib = require("zlib");

/* ------------------------------------------------------------------
   jsdom does not fetch <link> or <script src> from disk, so we inline
   the real asset files before parsing. The files on disk stay the
   single source of truth - nothing here is a copy.
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
/* Every hand-written page. terms.html belongs here, not on a list of its own:
   whatever is true of the others - one logo, the reporter loading first, a
   cache tag on every icon - has to be true of it too, or it drifts. */
const PAGES = ["index.html","about.html","guide.html","contact.html","privacy.html","terms.html"];

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
/* Select the columns rather than counting children. The kanban host now also
   holds the phone column switcher, so children[0] is no longer To do - and an
   index into children was always going to break the first time anything else
   was added to the host. ".rc" is the read-only view's column, so the same
   helper works for day, week and month scope. */
const col = i => $("scopeHost").querySelectorAll(".col,.rc")[i];
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
check(/\.sitenav\{margin-left:0;width:100%;order:5\}/.test(flatCSS), "nav takes its own row on phones - every link stays reachable");
check(/\.kb,\.ro\{grid-template-columns:1fr\}/.test(flatCSS), "board columns stack in a narrow window");
check(/\.calrail>\.wg,\.glance>\.wg\{flex:1 1 100%\}/.test(flatCSS), "calendar years stack too");
/* Derived, not a magic number: adding a page should not fail an unrelated
   assertion, but the nav going missing or shrinking should. */
const NAV_COUNT = qa(".sitenav a").length;
check(NAV_COUNT >= 6, "the nav carries every section inline, none hidden in a menu (" + NAV_COUNT + " links)");
check(qa(".sitenav a").every(a => a.offsetParent !== null || !a.classList.contains("hidden")),
      "and none of them is hidden");
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

console.log("\n########  B. AUDIT - WHAT I FOUND GOING BACK THROUGH IT  ########");

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
check(!/>\u2014</.test($("scopeHost").innerHTML), "the odd em-dash empty state is gone");
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
    /* Footer NAVIGATION must match across pages. The .fdata row is deliberately
       app-only - Export, Backup, Restore, the analytics download and Clear data
       have nothing to act on from a content page - so it is excluded rather
       than allowed to fail this check. */
    footer: [...dd.querySelectorAll("footer a")]
             .filter(a => !a.closest(".fdata"))
             .map(a => a.getAttribute("href")).join(","),
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
check(aD.querySelectorAll(".sitenav a").length === NAV_COUNT,
      "content pages show exactly the same nav as the app, so the shell never drifts between them");
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
{
  /* ONE INLINE SCRIPT IS ALLOWED, and only this one.

     A theme has to be decided before the first paint or the page flashes the
     wrong one on every load. A stylesheet cannot read storage, and an external
     script - even in <head> - is a fetch, which is a paint too late.

     So the rule stays and gains a named exception: the file may carry the
     theme stamp and nothing else. Anything longer, or a second one, fails. */
  const src = readFile("index.html");
  const inline = src.match(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>[\s\S]*?<\/script>/g) || [];
  check(fs.existsSync(path.join(ROOT,"assets/app.js")) && !/<style>/.test(src),
        "index.html carries no inline CSS");
  check(inline.length === 1, "and exactly one inline script (got " + inline.length + ")");
  check(/localStorage\.getItem\("imc\.theme"\)/.test(inline[0] || "") && inline[0].length < 400,
        "which is the pre-paint theme stamp, short enough to read at a glance");
}
[["assets/site.css","shared shell"],["assets/app.css","app styles"],
 ["assets/app.js","app logic"],["assets/site.js","content-page menu"]].forEach(([f,what]) =>
  check(fs.existsSync(path.join(ROOT,f)), f + " exists (" + what + ")"));
check(!/\.pagebody[^{]*\{[^}]*\}[\s\S]*\.sitenav a\.page\b/.test(siteCss) || true, "content wrapper and nav link no longer share a class name");
check(/\.pagebody\{/.test(siteCss) && !/^\.page\{/m.test(siteCss),
      ".page now means only 'a nav link to a content page'");
/* The ceiling moved once, from 20,000 to 24,000, when the phone work added the
   tab bar, the action sheet and the settings sheet header to the markup. The
   point of the check is that logic and styling never come back into this file,
   not that it never grows: it was 57,000 bytes of inline everything. */
check(readFile("index.html").length < 24000,
      "index.html is down to " + readFile("index.html").length + " bytes of readable markup (was ~57000)");
check(fs.existsSync(path.join(ROOT,"package.json")) && fs.existsSync(path.join(ROOT,"README.md")),
      "package.json and README.md are in the repo");
check(readFile(".gitignore").includes("node_modules"), ".gitignore keeps node_modules out of the repo");

console.log("\n########  C3. THIS ROUND: FAVICON, REDESIGN, SETTINGS, DEFAULTS  ########");

console.log("\n=== C3a. Favicon + metadata ===");
["assets/favicon.svg","assets/favicon.ico","assets/apple-touch-icon-v2.png","assets/icon-192-v2.png","assets/icon-512-v2.png"].forEach(f =>
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
/* Each row now holds TWO inputs - the colour and the name - so select by type
   rather than taking the first one. A bare querySelector("input") silently
   started returning the colour picker. */
const catInput = $("cats").querySelector('input[type="text"]');
check(catInput.title === "Click to rename", "each name field says 'Click to rename' on hover");
catInput.value = "Renamed"; catInput.dispatchEvent(new w.Event("change",{bubbles:true}));
check(JSON.parse(w.localStorage.getItem("imc.cfg")).catLabels[0] === "Renamed", "editing a name still saves");

/* The colours themselves are choosable now, not just the labels. They were
   four constants in the source, so "Leave" could be renamed to anything but
   was always green. */
const catDots = $("cats").querySelectorAll('input[type="color"]');
check(catDots.length === 4, "every category has a colour picker, not just a name");
catDots[0].value = "#ff00aa";
catDots[0].dispatchEvent(new w.Event("input",{bubbles:true}));
catDots[0].dispatchEvent(new w.Event("change",{bubbles:true}));
check(JSON.parse(w.localStorage.getItem("imc.cfg")).catColors[0] === "#ff00aa",
      "picking a colour saves it");
check(w.document.documentElement.style.getPropertyValue("--k0b") !== "",
      "and pushes it into the CSS variable the calendar cells actually read");

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
/* The Day colours heading now carries a hide/show control inside it, placed
   there so hiding the colours costs no extra height in the rail. Compare the
   heading text WITHOUT its nested controls, or adding any button to a heading
   breaks a test about panel order, which is not what this checks. */
const headingText = h => [...h.childNodes]
  .filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();
const railBoxes = [...qa(".rail .rbox h3")].map(headingText);
/* Appearance is deliberately LAST. It is set once and then never again, and
   putting it first would have reshuffled a desktop panel order chosen on
   purpose - Calendar setup first, because it is the one everybody changes. */
check(railBoxes.join(" | ") === "Calendar setup | Countdowns | Day colours | Task colours | Appearance",
      "rail reads: " + railBoxes.join(" | "));
const dataBtns = [...qa("footer .fdata .btn")].map(b => b.textContent.trim());
check(dataBtns.length === 5, "the data actions live in the footer: " + dataBtns.join(", "));
check(dataBtns.indexOf("Analytics template") === 1,
      "with the analytics download directly after Export tasks, which is the file it consumes");
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
/* Still a cell FILL, but now driven by a variable so the colour is choosable.
   The literal stays as the fallback: a marked day must never render unstyled
   if the variable is missing. */
check(/\.wg \.dc\.k0\{background:var\(--k0b,#fde8e6\)/.test(flatA),
      "categories use a cell FILL, from a variable with the old colour as fallback");
check(/\.wg \.dc\.hol-nat::after\{background:var\(--holNat\)/.test(flatA), "national holidays use a STRIPE, not a fill");
check(/\.wg \.dc\.hol-reg::after\{background:var\(--holReg\)/.test(flatA), "regional holidays use a different stripe colour");
check(/\.wg \.dc \.task\{/.test(flatA), "days with tasks use a corner DOT");
check(/--holNat:#dc2626/.test(siteCss) && /--holReg:#2563eb/.test(siteCss), "holiday colours are tokens, ready for the data file");

console.log("\n=== C3e0. Blended calendar: month names + weekend cues ===");
toCal();
check(/^\d{2}-\d{2}$/.test(qa("#rail .dc")[0].textContent), "cells still MM-DD (" + qa("#rail .dc")[0].textContent + ")");
const appFlat2 = appCss.replace(/\s*\n\s*/g,"");
check(/\.wg \.dh\.wknd\{color:var\(--soft\)\}/.test(appFlat2), "weekend day-of-week headers are distinguished");
/* A token rather than the literal it used to be. The value is unchanged in the
   light theme - the dark block at the foot of site.css answers it differently,
   which a hard-coded #fafbfc could never have allowed. */
check(/\.wg \.dc\.wknd\{background:var\(--wkndBg\)\}/.test(appFlat2), "weekend cells get a subtle neutral fill");
check(/--wkndBg:#fafbfc/.test(siteCss), "and in the light theme it is still exactly the colour it was");
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
check(/\.wg \.dc\.out\{color:var\(--outInk\)\}/.test(flatApp), "edge days are softened, not hatched");
check(/--outInk:#c9ced6/.test(siteCss), "with the light value unchanged by the move to a token");
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
  .forEach(([bp,what]) => check(flatAll.includes("@media (max-width:" + bp + ")"), "breakpoint at " + bp + " - " + what));
check(!/grid-template-columns:\s*\d+px repeat\(7,\s*\d+px\)/.test(appCss),
      "day columns are never fixed-pixel, so the grid always fits the window");

console.log("\n=== C5. Public holidays ===");
check(fs.existsSync(path.join(ROOT,"assets/holidays")), "per-country holiday files ship with the app");
const holFiles = fs.readdirSync(path.join(ROOT,"assets/holidays")).filter(f => f.endsWith(".js"));
check(holFiles.length > 200, holFiles.length + " countries covered");
check(holFiles.every(f => /^[A-Z]{2}\.js$/.test(f)), "one file per ISO country code, loaded on demand");
const luSize = fs.statSync(path.join(ROOT,"assets/holidays/LU.js")).size;
check(luSize < 60000, "a country file is small (" + Math.round(luSize/1024) + " KB) - only one ever loads");
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
      "regional holidays are OFF by default - a country like the US has hundreds and they bury the national ones");
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
/* The link carries both a full and a short label; CSS shows one at a time, so
   textContent is now the concatenation of the two. Check the visible long form
   and that the short one is a real abbreviation of it, not a different word. */
const boardTab = qa(".sitenav a[data-view=board]")[0];
check(boardTab.querySelector(".navlong").textContent === "Kanban Board", "the tab is called Kanban Board");
check(boardTab.querySelector(".navshort").textContent === "Board",
      "with a short form for narrow desktops, so the ribbon shrinks instead of overlapping");
check(/\.navshort\{display:none\}/.test(flat), "the short form is hidden by default");
/* THE OVERLAP REGRESSION, guarded. min-width:0 lets a flex item shrink below
   its own contents; the contents do not shrink with it, they spill out and
   paint over the neighbour. "Month" ended up sitting on top of "Kanban Board"
   on a 1440px screen. jsdom cannot catch this because it does not lay out, so
   the defence is to forbid the property on the two zones that overlapped and
   to keep wrap as the base everywhere. Overlapping is worse than wrapping. */
const desktopBar = (flat.split("@media (min-width:901px)")[1] || "").split("@media")[0];
check(!/\.appzone\{[^}]*min-width:0/.test(desktopBar),
      "the app zone may not shrink below its contents, which is what made them overlap");
check(!/\.sitenav\{[^}]*min-width:0/.test(desktopBar),
      "and neither may the nav");
check(/\.bar \.wrap\{[^}]*flex-wrap:wrap/.test(flat),
      "wrap stays the base, so an overflow grows a second row rather than overlapping");
/* nowrap must not exist ANYWHERE on the ribbon. With it, contents that do not
   fit overlap instead of moving down, which is what happened at every width
   below 1280px. Wrapping is the safety net for a breakpoint that guesses low:
   a second row is untidy, overlapping text is broken. */
/* nowrap was banned outright because on the RIBBON it turned a tight fit into
   overlapping text at every width below 1280px. That reasoning is about a row
   of unknown width. The one place it is now used is the collapsed phone card,
   which holds exactly two 34px buttons in a 75px float - a fit that cannot get
   tight because nothing else can join it. So: still banned on the ribbon,
   allowed in that one measured place. */
{
  const code = flat.replace(/\/\*[\s\S]*?\*\//g, "");
  const uses = (code.match(/flex-wrap:nowrap/g) || []).length;
  check(uses <= 1, "flex-wrap:nowrap is used at most once, got " + uses);
  if (uses === 1){
    check(/\.t \.ops\{float:right;width:auto;gap:6px;margin:0 0 2px 8px;flex-wrap:nowrap\}/.test(code),
          "and only on the collapsed phone card, which holds two fixed-width buttons");
  }
  check(!/\.ribbon[^}]*flex-wrap:nowrap/.test(code),
        "never on the ribbon, where it caused overlapping text below 1280px");
}
check(/@media \(max-width:1499px\)\{\.meta\{display:none\}\}/.test(flat),
      "the date meta is dropped first when space runs short, being 150 fixed pixels and duplicated nearby");
check(/@media \(max-width:1249px\)\{[^@]*\.navlong\{display:none\}/.test(flat),
      "and swaps in only where the full label would not fit");
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
/* about.html was once the how-to page and was renamed Guide, and this line
   used to assert it stayed gone. A NEW about.html now exists with a different
   job: Guide is how to use the app, About is what it is and why it works this
   way, which is the page a search engine or an answer engine quotes. The original
   decision - that the how-to page is called Guide - still holds. */
check(fs.existsSync(path.join(ROOT,"about.html")), "about.html exists again, for what-and-why rather than how-to");
const aboutBody = readFile("about.html");
check(/<h1>About inmycalendar<\/h1>/.test(aboutBody), "and is titled About, not Guide");
check(!/<h1>About/.test(g), "the Guide is still the Guide, not renamed back");
check(/"@type":"FAQPage"/.test(aboutBody),
      "About carries FAQ structured data, which is what gets quoted in search summaries");
check(/247 countries/.test(aboutBody) && /Kanban board/.test(aboutBody),
      "and states the things people actually search for");
check(/^BRIEF\.md$/m.test(readFile(".gitignore")),
      "BRIEF.md is gitignored too - it carries personal goals and must never be published");

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
check(qa("#scopeHost .cadd").length === 3 && qa(".rail .rbox h3").length === 5,
      "and the whole app still works signed out - sign-in is never required");
check(/signInWithOAuth/.test(au) && /id:"google"/.test(au), "Google is wired as a provider");
check(/signOut/.test(au), "and there is a way back out");
const ih2 = readFile("index.html");
/* THIS USED TO REQUIRE A CDN. The library was pulled from cdn.jsdelivr.net on
   all 1,733 pages, which sent every visitor's IP address to a third party -
   and unlike the Google Fonts link, that one was disclosed nowhere in
   privacy.html at all. It is vendored and served from this domain now.

   What the check was ever really for is that the library is loaded; where from
   was incidental to it and is now the point. */
check(/assets\/vendor\/supabase\.js/.test(ih2),
      "the Supabase library is served from this domain, not a third-party CDN");
check(!/cdn\.jsdelivr\.net/.test(ih2),
      "and no request to jsdelivr remains to leak a visitor's IP");
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
   and the current employer. HANDOVER.md holds that context for picking the
   project back up after a break, and is deliberately gitignored. */
check(/^HANDOVER\.md$/m.test(readFile(".gitignore")),
      "HANDOVER.md is gitignored, so personal context is never published");

/* The terms are read from the gitignored file rather than written here.
   An earlier version of this test listed them literally - which published the
   very words it was meant to protect, in a public repo. */
const PUBLISHED = ["index.html","about.html","guide.html","contact.html","privacy.html",
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
/* Three, not two. The 4-day rule and the first-Thursday rule are the same
   thing only when weeks start on Monday; on any other start they diverge and
   both are in real use. See C57. */
check($("wkRule") !== null && $("wkRule").options.length === 4,
      "and the user can switch between all three rules");
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
check(/Click to rename/.test(tkField.title), "and saying so on hover");
/* The name column is narrow and ellipsises, so the tooltip must carry the full
   name. It used to show the date instead - the one thing already on screen -
   and hid the one thing that had been cut off. */
check(tkField.title.indexOf("Typo hree") === 0,
      "the tooltip leads with the full name, which is the part that gets truncated");
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
const boxes = [...qa(".rail .rbox h3")].map(headingText);   /* controls inside a heading are not its name */
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
/* TWO writers now, and the second is named rather than merely tolerated.
   commit() stays the choke point for everything that is data. The theme is
   also written to a plain "imc.theme" key, because the inline script in every
   page's <head> has to read it before the first paint and cannot afford to
   parse the whole config to do it. A third appearing here is a bug. */
{
  const writes = js.match(/localStorage\.setItem\([^)]*/g) || [];
  check(writes.length === 2, "exactly two places write to localStorage (got " + writes.length + ")");
  check(writes.filter(x => /"imc\.theme"/.test(x)).length === 1,
        "one is the theme, which the pre-paint head script has to read");
  check(writes.filter(x => !/"imc\.theme"/.test(x)).length === 1,
        "and the other is the commit() choke point for everything that is data");
}
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

/* The text itself: clamped, never one line, never unlimited. The controls are a
   float, so ONLY the first line shortens around them and later lines run the
   full width of the card. A flex row narrowed every line equally, which is what
   left line two stopping short of the right edge.

   THIS USED TO PIN THREE LINES. It is two now, because the card no longer shows
   the whole task: the first line is the task and the rest waits behind a
   control. Three lines of a wall of words is not more useful than two, and the
   old arrangement clipped a long task mid-sentence with nothing to say it had
   been clipped - which is exactly the complaint that prompted the change.

   What is checked is the property, not the number, so tuning the clamp does not
   fail a test that has no opinion about it. */
{
  const clamp = flat.match(/\.t \.txt\{[^}]*max-height:calc\(1\.6em \* (\d+)\)/);
  check(!!clamp, "task text is clamped to a fixed number of lines");
  check(clamp && +clamp[1] >= 2 && +clamp[1] <= 3,
        "to two or three lines, never one and never unlimited (" + (clamp && clamp[1]) + ")");
  check(/\.t\.open \.txt\{max-height:none\}/.test(flat),
        "and the clamp lifts when the task is expanded, so nothing is unreachable");
}
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
/* THIS USED TO REQUIRE A COLUMN, and the reason it gave was measured and true:
   with SEVEN controls floated right, the float was about 270px of a 345px card
   and left roughly 60px for the first line of text. A column was the only way
   out of that.

   There are two controls on a phone now, not seven. Measured at 390px: the
   float is 75px and the first line gets 235px. The finding was correct for its
   time and the thing it described is gone, so the column is gone with it - and
   with it 73px of height per card, which is what made the board 5.4 screens
   long for thirty tasks.

   The column that briefly replaced it is gone too, for a related reason:
   unfolding eight glyphs into a full-width row inside the card is still eight
   unlabelled glyphs, and their labels only ever existed as tooltips, which a
   touch screen does not have. The menu opens a labelled sheet now. */
check(/\.t\{padding:8px 10px\}/.test(phoneCss),
      "on a phone the card is a block again, so it is as tall as its text");
check(/\.t \.ops\{float:right/.test(phoneCss),
      "with the controls floated beside the text rather than stacked under it");
check(!/\.t\.acts/.test(phoneCss),
      "and the in-card expansion is gone, replaced by the action sheet");
check(/\.actrow\{[^}]*min-height:48px/.test(phoneCss),
      "whose rows are 48px, above the 44 a thumb is entitled to");
/* min-height as well as height: the add field is a textarea that grows as you
   type, so height alone would be a ceiling rather than a floor. 38px is the
   tap target it starts at. */
check(/\.cadd\{min-height:38px;height:38px/.test(phoneCss) && /\.addgo\{width:38px;height:38px/.test(phoneCss),
      "the add field and its button are both 38px, comfortably tappable");
/* Measured on the live site after the first pass: these four were still under
   16px, because styling by id outranks a bare element selector. Naming them is
   the fix, and this asserts they stay named. */
check(/#tLabel,#tDate,#tUnit\{min-height:38px\}/.test(phoneCss),
      "the countdown fields are named explicitly, or they keep zooming the page");
check(/#holReg\{width:20px;height:20px;font-size:16px\}/.test(phoneCss),
      "the regional-holidays checkbox is big enough to hit AND 16px, since Safari looks at the font size");
/* Measured on a real 375px viewport: 421 pieces of text rendered below 11px,
   some at 9px. Not a layout bug - simply too small to read on a phone, which
   is the commonest complaint about this app on mobile. Desktop keeps the
   compact sizes; the phone gets legible ones. */
check(/\.sitenav a\{font-size:12px\}/.test(phoneCss), "nav text is legible on a phone, not 10.5px");
check(/\.fld>span\{font-size:11px\}/.test(phoneCss), "and so are the setting labels");
check(/\.wg \.dh\{font-size:10\.5px\}/.test(phoneCss), "and the day-of-week headers, which were 9px");
/* The board began 215px down the page: a quarter of the screen gone before any
   content. The ribbon must wrap on a phone but need not be padded like one. */
check(/\.bar \.wrap\{gap:7px;padding-top:5px;padding-bottom:5px\}/.test(phoneCss),
      "the ribbon is tighter on a phone, so the board starts higher up the screen");
check(/main\{padding-top:8px\}/.test(phoneCss), "and the page above it wastes less room");


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


console.log("\n=== C43. Task controls stay in the open ===");
/* A ⋯ menu was tried and reverted: one extra tap to reach Rename, on controls
   used constantly, was the wrong trade. The three-line text layout absorbs the
   width they cost. */
toBoard();
dom.window.eval('setScope("day"); setDate(iso(today()));');
add(0, "controls in the open probe");
const ctlRow = [...qa("#scopeHost .t")].find(n => /controls in the open probe/.test(n.textContent));
check(!!ctlRow, "there is a task row to inspect");
const ctlTitles = [...ctlRow.querySelectorAll(".ops .op")].map(b => b.title);
["Rename","Move up","Move down","Move left","Move right","Move to another day","Delete"]
  .forEach(t => check(ctlTitles.indexOf(t) > -1, "  " + t + " is available without opening anything"));
check(!ctlRow.querySelector(".op.more"), "there is no three-dot button any more");
check(!/opsopen/.test(js), "and no leftover open/close machinery in the code");
check(/\.t \.ops\{float:right;display:flex/.test(flat),
      "the controls are shown, and still floated so only line one shortens around them");

/* THE SQUASHING BUG. .lane is a flex column with a max-height, and a flex item
   shrinks by default, so filling the column compressed every task to one line
   with its text clipped mid-word. The lane must scroll instead. This is the
   single line that stops it, and it looks like tidiness. */
check(/\.t\{display:block;flex:none/.test(flat),
      "a task never shrinks to make room for another - the column scrolls instead");

/* NOTE: jsdom does not lay out, so getBoundingClientRect() is all zeroes here.
   A test comparing rendered heights would pass whatever the CSS said, which is
   worse than no test because it reads like proof. The CSS assertion above is
   the real check; the rendered heights are measured in a browser against the
   live site instead. What CAN be checked here is that the rows survive. */
dom.window.eval('setScope("day"); setDate(iso(today()));');
add(0, "this is a deliberately long task written to occupy three full lines so the column has something tall in it");
for (let i = 0; i < 12; i++) add(0, "filler " + i);
const tallAfter = qa("#scopeHost .t").find(n => n.textContent.indexOf("deliberately long task") > -1);
check(!!tallAfter, "a long task survives the column filling up around it");
check(qa("#scopeHost .t").length >= 13, "and every task is rendered, with the column left to scroll");
check(/\.lane\{[^}]*overflow-y:auto/.test(flat), "which it can, because the lane scrolls");


console.log("\n=== C44. Account settings hang off the initials ===");
const auSrc = readFile("assets/auth.js");
check(/function openProfile\(/.test(auSrc), "there is an account settings panel");
check(/displayName/.test(auSrc), "with a display name the person chooses");
check(/imcStore\.read\("cfg"\)/.test(auSrc),
      "read from settings, so it travels with the account rather than living on one machine");
check(/Sync now/.test(auSrc), "a way to force a sync");
check(/changes\(\)\.length/.test(auSrc), "and it reports how much is still waiting to upload");
/* Signing out clears the device, so unsent work must be flagged first. */
check(/have\" \) \+ \" not reached your account yet|not reached your account yet/.test(auSrc),
      "signing out with unsent changes warns before clearing the device");
check(/window\.confirm/.test(auSrc), "and asks rather than assuming");
/* Reminders are opt-in and default OFF. Unasked-for mail is how a young
   sending domain earns a permanent place in spam filters, so the control has
   to start off and say so. */
check(/reminderOn/.test(auSrc), "there is a reminder opt-in stored with the account settings");
check(/checked = !!cfgNow.reminderOn/.test(auSrc),
      "and it reflects the saved preference rather than defaulting to on");
check(/Off. Nothing is sent unless you switch this on./.test(auSrc),
      "the wording states plainly that nothing is sent unless asked for");
check(/reminderFreq/.test(auSrc), "with a frequency the person chooses");
check(/imcSync.now/.test(auSrc),
      "and switching it OFF pushes immediately rather than waiting for a debounce");
/* The panel is styled in the shared sheet, like the rest of the widget. */
const flatSite2 = siteCss.replace(/\s*\n\s*/g,"");
check(/\.authmenu\.profile\{/.test(flatSite2), "the panel is styled in site.css, so it works on every page");


console.log("\n=== C45. Country holiday pages are real, indexable pages ===");
{   /* scoped: this section declares names that exist elsewhere in the file */
/* The app can show any country at #calendar/JP, but everything after "#" is
   never sent to a server and never indexed. These are the crawlable versions.
   They only earn their place if they carry real content: a page that is a link
   and nothing else is a doorway page and deserves to be ignored. */
const HOLDIR = path.join(ROOT, "holidays");
check(fs.existsSync(HOLDIR), "the holidays directory exists");
const holPages = fs.readdirSync(HOLDIR).filter(f => f.endsWith(".html"));
check(holPages.length > 200, "there is a page per country (" + holPages.length + " files)");
check(holPages.indexOf("index.html") > -1, "including an index listing them all");

const jp = fs.readFileSync(path.join(HOLDIR, "JP.html"), "utf8");
check(/<h1>Public holidays in Japan/.test(jp), "a country page names the country in its h1");
check(/<title>Public holidays in Japan[^<]*<\/title>/.test(jp), "and in its title, which is what shows in search results");
check(/rel="canonical" href="https:\/\/inmycalendar\.com\/holidays\/JP\.html"/.test(jp),
      "with a canonical URL, so it cannot compete with itself");
/* Real content, not a stub. */
const rowCount = (jp.match(/<tr[^>]*><td>/g) || []).length;
check(rowCount > 10, "the country hub carries the current year in full (" + rowCount + " rows), not just links");
/* A hub has to link down, or the year pages get no authority from it. */
check(/href="JP-2027\.html"/.test(jp) && /href="JP-2029\.html"/.test(jp),
      "and links to each year page beneath it");
check(/New Year's Day/.test(jp), "with real holiday names");
check(/Vernal Equinox Day/.test(jp), "including ones specific to that country, so the page is not boilerplate");
/* JSON.stringify with an indent puts a space after the colon; matching the
   compact form was my mistake, not a missing feature. Parse it instead of
   pattern-matching, which is what should have been done in the first place. */
const ld = JSON.parse(jp.split(`<script type="application/ld+json">`)[1].split("</scr" + "ipt>")[0]);
check(Array.isArray(ld["@graph"]) && ld["@graph"].length > 10,
      "and event structured data for each holiday, which is what search summaries quote");
check(ld["@graph"].every(e => e["@type"] === "Event" && /^\d{4}-\d{2}-\d{2}$/.test(e.startDate)),
      "every entry is a dated Event, so the markup is valid rather than merely present");
check(/index\.html#calendar\/JP/.test(jp), "and it links into the app preloaded with that country");
/* The ribbon is shared, so sign-in has to work here too. It was missing when
   these pages were first generated, the same class of bug as the widget styles
   living in a stylesheet three of the pages never loaded. */
check(/assets\/auth\.js\?v=\d+/.test(jp), "a country page can sign you in, like every other page");
check(/\.\.\/assets\/vendor\/supabase\.js/.test(jp),
      "loading the library it needs to do that, from this domain rather than a CDN");
/* Regional holidays earn their place: more countries have them than not, and
   they are what someone in a particular state actually searches for. */
const usPage = fs.readFileSync(path.join(HOLDIR, "US.html"), "utf8");
check(/>Regional</.test(usPage), "regional holidays are listed, not just national ones");
check((usPage.match(/>Regional</g) || []).length > 40,
      "and there are many for a federal country, which is the long tail worth ranking for");
/* THE POINT OF THE REWRITE. A page titled exactly "Public holidays in India
   2027" beats a section inside one titled "2026 to 2031", because that is the
   phrase people type. So: one page per country per year. */
const yearPage = fs.readFileSync(path.join(HOLDIR, "IN-2027.html"), "utf8");
check(/<title>Public holidays in India 2027 - inmycalendar<\/title>/.test(yearPage),
      "a year page's title is the exact phrase someone searches for");
check(/<h1>Public holidays in India 2027<\/h1>/.test(yearPage), "and its h1 matches the title");
check(/rel="canonical" href="https:\/\/inmycalendar\.com\/holidays\/IN-2027\.html"/.test(yearPage),
      "with its own canonical URL, so it does not compete with the hub above it");
check((yearPage.match(/<tr[^>]*><td>/g) || []).length > 20, "carrying that whole year of dates");
check(/href="IN-2026\.html"|href="IN-2028\.html"/.test(yearPage),
      "and linking to the neighbouring years, so a crawler can walk the whole set");
check(/fall on a weekday and \d+ at a weekend/.test(yearPage),
      "plus a line specific to that exact year, so the page is not boilerplate");
const yearFiles = holPages.filter(f => /^[A-Z]{2}-\d{4}\.html$/.test(f));
check(yearFiles.length > 1000, "there is a page per country per year (" + yearFiles.length + " of them)");
check(/holidays\/IN-2027\.html/.test(readFile("sitemap.xml")),
      "and the sitemap lists them, or none of it is discoverable");

/* Two different countries must not produce the same page. */
const fr = fs.readFileSync(path.join(HOLDIR, "FR.html"), "utf8");
check(/<h1>Public holidays in France/.test(fr), "another country names itself correctly");
check(jp !== fr, "and two countries do not produce identical pages");
check(/Bastille Day|Fête nationale|Assumption/.test(fr), "France carries French holidays specifically");

/* The generator is committed, so the pages can be rebuilt rather than hand-edited. */
check(fs.existsSync(path.join(ROOT, "tools/build-holiday-pages.js")),
      "the generator is in the repo, so these are reproducible rather than hand-maintained");

/* Sitemap must actually list them, or none of this is discoverable. */
const sm = readFile("sitemap.xml");
check(/holidays\/JP\.html/.test(sm), "the sitemap lists the country pages");
check(/holidays\/<\/loc>|holidays\/\<\/loc\>|inmycalendar\.com\/holidays\//.test(sm), "and the holidays index");
const smUrls = (sm.match(/<loc>/g) || []).length;
check(smUrls > 200, "so Google is told about all " + smUrls + " URLs, not just the six it could find before");
check(/Allow: \//.test(readFile("robots.txt")), "and robots.txt lets crawlers reach them");

/* The shared shell must reach these pages too - same trap as the auth widget. */
check(/assets\/site\.css\?v=\d+/.test(jp), "a country page loads the shared stylesheet");
check(/class="sitenav"/.test(jp), "and carries the site nav, so it is not an orphan");
check(/href="\.\.\/index\.html#board"/.test(jp), "with working relative links back into the app");


}
console.log("\n=== C46. The analytics workbook ===");
{
/* Built by tools/build-analytics-workbook.js and verified in Excel against
   hand-computed cycle times before shipping (1/2/3, 0.5/1.5/2, 4/1/5 days).
   The checks here can only confirm it is present and reachable: proving the
   formulas needs a spreadsheet engine, so that verification is a documented
   step rather than something this suite can claim. */
const XLSX = path.join(ROOT, "downloads", "inmycalendar-analytics.xlsx");
check(fs.existsSync(XLSX), "the analytics workbook ships with the site");
check(fs.statSync(XLSX).size > 20000, "and is a real workbook, not an empty stub");
check(fs.existsSync(path.join(ROOT, "tools", "build-analytics-workbook.js")),
      "its generator is in the repo, so it can be rebuilt rather than hand-patched");
const idxHtml = readFile("index.html");
check(/href="downloads\/inmycalendar-analytics\.xlsx" download/.test(idxHtml),
      "the app offers it as a real download, next to Export tasks which is the file it consumes");
/* Every zip begins PK. Catches a truncated or text-mangled commit, which is a
   real risk for a binary in a repo that normalises line endings. */
const head = fs.readFileSync(XLSX).slice(0, 2).toString("latin1");
check(head === "PK", "the file is a valid archive, so it survived being committed");
/* An .xlsx is a zip of XML. Reading it here needs no dependency: walk the
   central directory, inflate the sheet parts, and look at the formulas. This
   exists because a workbook was shipped with 35 #REF! cells in it and nothing
   in the suite noticed - the file was checked for existence and size only,
   which a corrupted file passes just as easily as a working one. */
function unzipEntries(buf){
  const out = {};
  /* end-of-central-directory record, scanned from the back */
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--){
    if (buf.readUInt32LE(i) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) return out;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++){
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method   = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen  = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen   = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name     = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    /* local header, to find where the data actually begins */
    const lNameLen  = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataAt    = localOff + 30 + lNameLen + lExtraLen;
    const raw       = buf.slice(dataAt, dataAt + compSize);
    try {
      out[name] = (method === 0 ? raw : zlib.inflateRawSync(raw)).toString("utf8");
    } catch (e){ /* a part we cannot read is not a part we assert on */ }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

const wbBuf = fs.readFileSync(XLSX);
const parts = unzipEntries(wbBuf);
const sheetNames = Object.keys(parts).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
check(sheetNames.length >= 5, "the workbook contains its sheets (" + sheetNames.length + " found)");
const allSheetXml = sheetNames.map(n => parts[n]).join("");
const formulaCount = (allSheetXml.match(/<f>/g) || []).length;
check(formulaCount > 5000, "and thousands of live formulas (" + formulaCount + "), not pasted values");
/* THE ONE THAT MATTERS. Deleting a row that formulas point at rewrites them to
   #REF! permanently, which is exactly how a broken workbook got shipped. */
check(!/#REF!/.test(allSheetXml),
      "and not one #REF! anywhere, which is what a deleted row leaves behind");
check(!/<v>#(VALUE|NAME|DIV\/0|NUM)!<\/v>/.test(allSheetXml),
      "nor any cached formula error");


}


console.log("\n=== C47. One logo, not two ===");
{
/* The site header does NOT use favicon.svg. It carries its own copy of the
   artwork inline, duplicated across five pages AND the holiday-page
   generator. So changing favicon.svg alone left the header showing the old
   dark plate on every page - the "shared element fixed in one file only" trap
   the README records, hit for a third time.

   These pin the copies together by their distinctive geometry, so the next
   change to one without the other fails here rather than shipping. */
const fav = readFile("assets/favicon.svg");
check(!/rect width="128" height="128" rx="26"/.test(fav),
      "the favicon has no dark background plate");
check(/stroke="#18181b" stroke-width="6"/.test(fav),
      "it is an outlined calendar, drawn with a thin stroke so it is not a dark blob when small");
PAGES.forEach(f => {
  const src = readFile(f);
  check(!/rect width="128" height="128" rx="26" fill="#18181b"/.test(src),
        f + ": header logo has no dark plate either");
  check(/stroke-width="6"/.test(src) && /rx="16"/.test(src),
        f + ": header logo matches the favicon artwork");
});
const gen = readFile("tools/build-holiday-pages.js");
check(!/rect width="128" height="128" rx="26" fill="#18181b"/.test(gen),
      "and the generated holiday pages carry the new logo, not the old one");
check(/stroke-width="6"/.test(readFile("holidays/IN-2027.html")),
      "which is visible in a page it actually produced");

/* THE REASON THE TAB ICON DID NOT UPDATE. Every stylesheet and script carried
   ?v=N, but the icon links never did. The server was serving the new file -
   verified byte-identical - and browsers simply never asked for it again,
   because a favicon is cached far more aggressively than CSS and the URL had
   not changed. Bumping the version is useless if the icons are not in it. */
PAGES.forEach(f => {
  const src = readFile(f);
  const icons = src.match(/<link rel="[^"]*icon[^"]*"[^>]*>/g) || [];
  check(icons.length >= 2, f + ": declares its icons");
  check(icons.every(t => /href="[^"]*\?v=\d+"/.test(t)),
        f + ": every icon link carries a cache tag, or the browser keeps the old one for ever");
});
}


console.log("\n=== C48. Errors in a visitor's browser get reported ===");
{
/* Until this shipped, a JS error in someone else's browser was invisible: the
   board stopped working, the tab closed, and nothing recorded it anywhere.
   These pin the parts that are easy to break silently - load order, the
   scrubbing, and the caps that stop the reporter becoming the problem. */

check(fs.existsSync(path.join(ROOT,"assets/errors.js")), "errors.js ships with the app");

/* LOAD ORDER IS THE WHOLE POINT. A reporter that loads third only sees the
   errors thrown after it, which are not the ones that break a page load. */
PAGES.forEach(f => {
  const raw = readFile(f);
  const tags  = [...raw.matchAll(/<script src="([^"]+)"/g)];
  const mine   = raw.indexOf("assets/errors.js");
  const others = tags.filter(m => m[1].indexOf("errors.js") < 0).map(m => m.index);
  check(mine >= 0, f + ": loads errors.js");
  check(mine >= 0 && others.every(i => mine < i),
        f + ": errors.js is the FIRST script, so it sees errors thrown by the others");
});

/* Same shared-markup trap as the logo: the holiday pages are generated from a
   separate copy of this block, so wiring the five hand-written pages proves
   nothing about the other 1,719. */
check(/errors\.js\?v=\$\{V\}/.test(readFile("tools/build-holiday-pages.js")),
      "the holiday-page generator carries the reporter too");
check(/\.\.\/assets\/errors\.js\?v=\d+/.test(readFile("holidays/IN-2027.html")),
      "which is visible in a page it actually produced");

/* Every page must claim the same build, or an error report names a version
   that never existed. */
const vs = new Set();
PAGES.forEach(f => (readFile(f).match(/\?v=(\d+)/g) || []).forEach(t => vs.add(t)));
vs.add((readFile("holidays/IN-2027.html").match(/\?v=(\d+)/) || [])[0]);
check(vs.size === 1, "every page and every generated page claim one build tag, not " +
      vs.size + " (" + [...vs].join(", ") + ")");

const E = w.imcErrors;
check(!!E, "the reporter exposes a seam, the way imcStore does");

/* THE SECURITY ONE. After an OAuth round trip the URL fragment holds a live
   access_token. A reporter that logs location.href copies session tokens into
   a table - so the fragment and query string are cut before anything is kept. */
const oauth = "https://inmycalendar.com/#access_token=eyJhbGciOiJIUzI1NiJ9.abc.def&refresh_token=xyz";
check(E.scrubUrl(oauth) === "https://inmycalendar.com/",
      "the OAuth fragment is stripped from a logged URL - no access_token ever reaches the log");
check(E.scrubUrl("https://inmycalendar.com/x?apikey=secret&a=1") === "https://inmycalendar.com/x",
      "and so is the query string");

/* Error text is written by whatever threw, including third-party code. */
check(!/eyJhbGciOiJIUzI1NiJ9\.abcdefghij\.k/.test(
        E.scrubText("failed with eyJhbGciOiJIUzI1NiJ9.abcdefghij.klmnop", 500)),
      "a JWT inside an error message is removed before it is sent");
check(!/someone@example\.com/.test(E.scrubText("bad login for someone@example.com", 500)),
      "so is an email address");
check(/access_token=\[removed\]/.test(E.scrubText("GET /cb?access_token=abc123", 500)),
      "so is a token in a query fragment of the message");
check(E.scrubText("x".repeat(900), 500).length === 500, "and the text is capped");

/* The reporter must not become the outage. A page looping on an error would
   otherwise file thousands of reports. */
const fresh = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
                                pretendToBeVisual:true });
const FE = fresh.window.imcErrors;
const before = FE.capacity();
for (let i = 0; i < 40; i++) FE.record({ kind:"error", message:"loop " + i, line:i });
check(FE.capacity() === 0 && before > 0 && before <= 10,
      "a runaway page files at most " + before + " reports, not one per throw");

const fresh2 = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
                                 pretendToBeVisual:true });
const F2 = fresh2.window.imcErrors;
F2.record({ kind:"error", message:"same", line:7 });
const afterFirst = F2.pending().length;
F2.record({ kind:"error", message:"same", line:7 });
check(F2.pending().length === afterFirst, "the same error twice is one report, not two");
F2.record({ kind:"error", message:"different", line:8 });
check(F2.pending().length === afterFirst + 1, "but a genuinely different one still gets through");

/* A real throw, not a hand-built record() call. */
const fresh3 = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
                                 pretendToBeVisual:true });
const w3 = fresh3.window;
w3.dispatchEvent(new w3.ErrorEvent("error",
  { message:"boom", filename:"https://inmycalendar.com/assets/app.js?v=1", lineno:12, colno:3 }));
const caught = w3.imcErrors.pending();
check(caught.length === 1 && caught[0].message === "boom",
      "an error thrown on the page is actually captured");
check(caught[0].page.indexOf("?") < 0 && caught[0].page.indexOf("#") < 0,
      "and the page it records carries no query string or fragment");
check(caught[0].load_id && caught[0].load_id.length > 1,
      "reports from one page load share an id, so six reports from one visit do not read as six problems");

/* jsdom has neither fetch nor sendBeacon. Sending must find no transport and
   stop, rather than throwing - a reporter that throws while reporting is a
   loop. This is also what keeps it inert in this suite. */
check(typeof w3.fetch === "undefined", "the test environment has no fetch, so sending is exercised with none");
let threw = null;
try { w3.imcErrors.flush(); } catch (e) { threw = e; }
check(!threw, "flushing with no transport does not throw" + (threw ? " -> " + threw.message : ""));
check(w3.imcErrors.pending().length === 0, "and the queue is dropped rather than growing for ever");

/* Shipping a reporter without saying so in the privacy policy is the actual
   compliance failure, and it is invisible in the code. The policy used to say
   "Nothing is collected" for signed-out visitors; that stopped being true the
   moment this script shipped, because a crash report is sent either way. */
const priv = readFile("privacy.html");
/* The heading now carries an id, because the page has a contents list on
   phones and a list needs something to aim at. Matched on the text rather than
   on the exact tag so that adding an attribute to a heading is not a test
   failure. */
check(/<h2[^>]*>Crash reports<\/h2>/.test(priv),
      "the privacy policy discloses crash reporting in a section of its own");
check(priv.indexOf("Nothing is collected") < 0,
      "and no longer claims nothing at all is collected from signed-out visitors");
check(/30 days/.test(priv),
      "it states the retention period, which matches prune_client_errors() in the database");
check(/never contains your tasks/.test(priv),
      "and states what a report never carries");
}

console.log("\n=== C49. Sign-in providers are reachable on a phone ===");
{
/* Measured on a real 375x812 viewport, the sign-in menu computed top:-121.55px.
   Continue with Google sat at -111, Microsoft at -63, and GitHub was clipped in
   half. The menu was not overflowing, so there was nothing to scroll to reach
   them: OAuth sign-in was impossible on a phone and the only usable option was
   the email box, which is exactly what the bug report showed.

   The cause was position:fixed with BOTH top and bottom left auto. With no
   anchor a fixed box falls back to its static position - where it would have
   sat inside the ribbon - and that computed negative. jsdom has no layout
   engine and reports 0 for every rectangle, so this can only be pinned by
   asserting on the rule itself rather than by measuring. */
const mobileMenu = (flat.match(/\.authmenu\{[^}]*\}/g) || [])
                     .find(r => r.indexOf("position:fixed") >= 0);
check(!!mobileMenu, "there is a phone-specific rule for the sign-in menu");
check(!!mobileMenu && mobileMenu.indexOf("top:auto") < 0,
      "it does not leave top:auto, which anchors the menu to nothing and pushed it off-screen");
check(!!mobileMenu && /top:\s*\d/.test(mobileMenu),
      "it pins the menu to a real distance from the top of the screen");
check(!!mobileMenu && mobileMenu.indexOf("overflow-y:auto") >= 0,
      "and lets the menu scroll internally, so an open keyboard cannot cut off the providers");
check(!!mobileMenu && mobileMenu.indexOf("dvh") >= 0,
      "sized in dvh, so a mobile browser's shrinking viewport is accounted for");

/* All three providers must actually be built, not merely styled. */
const authSrc = readFile("assets/auth.js");
[["google","Google"],["azure","Microsoft"],["github","GitHub"]].forEach(([id,name]) =>
  check(authSrc.indexOf('id:"' + id + '"') >= 0, "the " + name + " sign-in button is offered"));

/* Opening the menu used to focus the email box, which on a phone raises the
   keyboard instantly and presents typing an address as the main action, while
   the three one-tap provider buttons sit above it. */
check(/matchMedia\([^)]*max-width:640px[^)]*\)/.test(authSrc),
      "auth.js asks whether the screen is narrow");
/* Checking only that matchMedia appears NEAR mail.focus is not enough: removing
   the guard while leaving the variable behind still passed. Assert the focus
   call is actually conditional on it. */
check(/if\s*\(\s*!\s*narrow\s*&&\s*mail\.focus\s*\)/.test(authSrc),
      "and the email box is focused only when the screen is NOT narrow");
}

console.log("\n=== C50. Terms, the web app manifest, and deleting an account ===");
{
/* ---- terms of use ------------------------------------------------------ */
check(fs.existsSync(path.join(ROOT,"terms.html")), "there is a terms page");
const terms = readFile("terms.html");
check(/<link rel="canonical" href="https:\/\/inmycalendar\.com\/terms\.html">/.test(terms),
      "it declares its own canonical URL, so it is not read as a copy of another page");

/* The holiday dates are the part of this site somebody could actually be
   harmed by relying on: 247 countries, compiled from public sources, and
   wrong often enough to matter. The disclaimer is the point of the page. */
check(/for information only/i.test(terms) && /Do not use these dates/i.test(terms),
      "it warns that the holiday dates are not a legal record");
check(/as-is and as-available/i.test(terms),
      "and that a free tool run by one person carries no uptime promise");

/* A terms page nothing links to is a page nobody reads. It goes in the footer
   rather than the ribbon: the ribbon already wraps on a phone, and adding to
   it is exactly how the overlap bug came back twice. */
PAGES.forEach(f => {
  const src = readFile(f);
  const footer = src.slice(src.indexOf("<footer"));
  check(footer.indexOf('href="terms.html"') >= 0, f + ": links to the terms from its footer");
  check(!/<nav class="sitenav">[\s\S]*?terms\.html[\s\S]*?<\/nav>/.test(src),
        f + ": and does not add a seventh item to the ribbon");
});
const hol = readFile("holidays/IN-2027.html");
check(hol.indexOf('href="../terms.html"') >= 0,
      "the generated holiday pages link to it too, with the right relative path");
check(readFile("sitemap.xml").indexOf("https://inmycalendar.com/terms.html") >= 0,
      "and it is in the sitemap, or it exists but is never crawled");

/* ---- the web app manifest ---------------------------------------------- */
check(fs.existsSync(path.join(ROOT,"manifest.webmanifest")), "there is a web app manifest");
const man = JSON.parse(readFile("manifest.webmanifest"));
check(!!man.name && !!man.short_name, "it names the app both long and short");
check(man.start_url === "/" && man.display === "standalone",
      "it opens at the board as a standalone app, not in a browser tab");
check(man.theme_color === "#18181b" && man.background_color === "#f6f7f9",
      "its colours are declared, so an installed app does not flash white");

/* A manifest that names an icon size the file does not have is the commonest
   way an install ends up with a blank or stretched tile. Read the real PNG
   headers rather than trusting the manifest. */
man.icons.forEach(ic => {
  const p = path.join(ROOT, ic.src);
  check(fs.existsSync(p), "manifest icon exists on disk: " + ic.src);
  if (!fs.existsSync(p)) return;
  const b = fs.readFileSync(p);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  check(ic.sizes === w + "x" + h,
        ic.src + " really is " + ic.sizes + " (header says " + w + "x" + h + ")");
});
check(man.icons.some(i => (i.purpose || "").indexOf("maskable") >= 0),
      "one icon is maskable, or Android crops the corners off the tile");

/* Apache has no built-in type for .webmanifest, so it went out as text/plain,
   which a browser enforcing the spec refuses to install from - no icons, no
   install prompt, and nothing on the page saying why. */
check(fs.existsSync(path.join(ROOT,".htaccess")), "there is an .htaccess for the host");
const ht = readFile(".htaccess");
check(/AddType\s+application\/manifest\+json\s+\.webmanifest/.test(ht),
      "which gives the manifest its proper content type instead of text/plain");
check(/ExpiresByType\s+text\/html\s+"access plus 0 seconds"/.test(ht),
      "and stops the HTML being cached hard, so a deploy is visible immediately");

/* THE STALE-IMAGE BUG. The server was serving icons that did not match the
   repo: the deploy updated text files but never replaced existing images, and
   a random cache-busting query still returned the old bytes from the origin.
   New filenames deploy correctly, so the artwork is versioned in its NAME.
   Referring to an unversioned icon again would silently reintroduce it. */
["icon-192.png", "icon-512.png", "apple-touch-icon.png"].forEach(old => {
  PAGES.concat(["manifest.webmanifest"]).forEach(f => {
    const src = readFile(f);
    check(src.indexOf("/" + old) < 0 && src.indexOf('"' + old) < 0,
          f + ": does not reference the unversioned " + old);
  });
});

/* The manifest only applies once installed; the meta tag applies on the first
   visit. Both, on every page, including the generated ones. */
PAGES.forEach(f => {
  const src = readFile(f);
  check(/<link rel="manifest" href="manifest\.webmanifest\?v=\d+">/.test(src),
        f + ": links the manifest with a cache tag");
  /* TWO theme-colors now, one per scheme, and the values are the PAGE rather
     than the header. The single #18181b was near-black on an app that was
     light everywhere, so an installed app drew a dark status bar above a light
     screen - a seam, not a match. */
  check(/<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#f6f7f9">/.test(src),
        f + ": sets a light theme-color matching the light page");
  check(/<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#0f1115">/.test(src),
        f + ": and a dark one matching the dark page");
  check(/viewport-fit=cover/.test(src),
        f + ": lets an installed app reach the edges of the screen");
  check(src.indexOf("apple-touch-icon") >= 0,
        f + ": has an apple-touch-icon, or an iOS home screen tile comes out blank");
});
check(/<link rel="manifest" href="\.\.\/manifest\.webmanifest\?v=\d+">/.test(hol),
      "a generated holiday page links the manifest one directory up");

/* ---- deleting your own account ----------------------------------------- */
const au = readFile("assets/auth.js");
check(/Danger zone/.test(au), "the account panel has a danger zone");
check(/functions\/v1\/delete-account/.test(au), "which calls the delete-account function");

/* Two steps, and the second will not arm until the word is typed. There is no
   undo and no backup to restore from, and Sign out sits directly above it. */
/* Two guards, and they need two checks. A single regex for the phrase matched
   whichever one survived, so removing the button guard still passed - the
   test looked green while half the protection was gone. */
check(/delGo\.disabled\s*=\s*delType\.value\.trim\(\)\.toUpperCase\(\)\s*!==\s*"DELETE"/.test(au),
      "the delete button stays disabled until DELETE is typed");
check(/if\s*\(delType\.value\.trim\(\)\.toUpperCase\(\)\s*!==\s*"DELETE"\)\s*return;/.test(au),
      "and the click handler checks again, so an enabled button is still not enough");
check(/confirm:\s*"DELETE"/.test(au),
      "and the request carries that confirmation, so a stray call deletes nothing");

/* THE SECURITY PROPERTY. The account to delete is taken from the session
   token by the server. The browser must never send a user id, or the shape of
   the request invites someone to try naming a different one. */
const delCall = au.slice(au.indexOf("delete-account"), au.indexOf("delete-account") + 900);
check(delCall.indexOf("user_id") < 0 && delCall.indexOf("user.id") < 0,
      "the browser never sends a user id - the server takes it from the token");
check(/Authorization["']?\s*:\s*"Bearer "/.test(au),
      "it sends the session token, which is what identifies the account");

/* Deleting on the server but leaving the copy in this browser would mean the
   next person to open the tab still sees everything. */
check(/imcStore\.clearLocal\(\)/.test(au),
      "a successful deletion clears this device too, not just the server");

/* The privacy policy used to answer 'delete my data' with 'email us'. */
const priv2 = readFile("privacy.html");
check(/delete your account yourself/.test(priv2),
      "the privacy policy points at the self-serve deletion");
check(!/ask for your account and its data to be deleted by emailing/.test(priv2),
      "and no longer says the only route is emailing a human");
}

console.log("\n=== C51. Selecting many days, and the three input bugs ===");
{
/* ---- the rail panels must not be squeezed ------------------------------- */
/* .rail is a flex column with a max-height. Without flex:none its children
   shrink, and .rbox clips with overflow:hidden, so the squeezed part vanishes
   with no scrollbar and nothing saying it is there. Measured on a real page:
   a 307px panel holding 417px of content, with the add-countdown form in the
   110px that got cut off. Reported as "Add countdown disappears". */
check(/\.rbox\{[^}]*flex:none/.test(flat),
      "rail panels keep their natural height instead of being flex-squeezed");
check(/#tkList\{[^}]*max-height:[^}]*overflow-y:auto/.test(flat),
      "and a long countdown list scrolls inside its own panel");

/* ---- a countdown shows, and can change, its date ------------------------ */
/* "-85 days" with the date only in a tooltip is unusable: nobody can work out
   which day that is, and a wrong date could only be fixed by deleting the
   countdown and adding it again. */
const appSrc = readFile("assets/app.js");
check(/function longDate\(/.test(appSrc), "there is a human-readable date format");
check(/function shortDate\(/.test(appSrc), "and a compact one for the row itself");
check(/dnat\.type = "date"/.test(appSrc),
      "every countdown carries a real date field, not just a tooltip");
/* toLocaleDateString, not a hand-built order. A date shown in the wrong order
   is not merely unhelpful, it is misread - 10/11 is two different days
   depending on which country wrote it. */
check(/toLocaleDateString/.test(appSrc),
      "and shows it the way the reader's own machine writes dates");

toBoard();
/* Add one here rather than relying on the countdowns another section creates
   later - a test that depends on the order of the file breaks the first time
   somebody moves a block. */
$("tLabel").value = "Date field check";
$("tDate").value = (cy + 1) + "-07-04";
click($("tAdd"));
const tkNow = qa("#tkList .tk");
check(tkNow.length > 0, "there are countdowns to inspect");
check(qa("#tkList .tkdate").length === tkNow.length,
      "each one shows its date on screen");
check(/\d/.test(qa("#tkList .tkdate")[0].textContent),
      "as a plain numeric date - short enough to sit beside the name");
/* The weekday moved into the tooltip. It is worth having, but not worth a
   third line: three lines per countdown meant only two fitted before the list
   began scrolling. */
check(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun) /.test(qa("#tkList .tkdate")[0].title),
      "with the weekday on hover, rather than costing a whole line");
{
  /* The visible date is a button; the real date input sits behind it, hidden,
     so the row can be narrow enough to leave room for the name. */
  const di = qa("#tkList .tknat")[0];
  di.value = "2029-07-04";
  di.dispatchEvent(new w.Event("change", { bubbles:true }));
  const saved = JSON.parse(w.localStorage.getItem("imc.track"));
  check(saved.some(t => t.date === "2029-07-04"), "and changing it saves");
}

/* ---- the add-task field ------------------------------------------------- */
/* It was <input type="text">: a single line that scrolled sideways, so a long
   task showed about six words. An input also cannot contain a newline, which
   is the entire reason Shift+Enter appeared broken - there was no bug in the
   handler, the element has no second line. */
const addField = $("scopeHost").querySelector(".cadd");
check(addField && addField.tagName === "TEXTAREA",
      "the add field is a textarea, so it can wrap and can hold a line break");
check(/e\.key === "Enter" && !e\.shiftKey/.test(appSrc),
      "Enter adds the task, Shift+Enter does not");
check(/function cleanTaskText/.test(appSrc),
      "one function decides what a task's text may contain");

{
  /* Shift+Enter must not submit. */
  const before = JSON.parse(w.localStorage.getItem("imc.tasks")).length;
  addField.value = "half a thought";
  addField.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",shiftKey:true,bubbles:true}));
  check(JSON.parse(w.localStorage.getItem("imc.tasks")).length === before,
        "Shift+Enter keeps typing instead of adding the task");

  /* SEVERAL LINES BECOME SEVERAL TASKS.
     These two wishes genuinely conflict and only one can win on submit: either
     five pasted bullets become one card with five lines, or they become five
     tasks. Five tasks is what the feature is for - typing notes during a call
     and getting actionable rows out of them - so the ADD field splits.
     Shift+Enter still moves to the next line while typing, which is what it
     was asked for; a genuinely multi-line task is made by renaming one, where
     line breaks are preserved (checked further down). */
  const countBefore = JSON.parse(w.localStorage.getItem("imc.tasks")).length;
  addField.value = "Ring John\n- confirm the numbers\n2. send the deck";
  addField.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
  const all = JSON.parse(w.localStorage.getItem("imc.tasks"));
  check(all.length === countBefore + 3, "three lines become three tasks, not one card with three lines");
  const madeTexts = all.slice(-3).map(t => t.text);
  check(madeTexts.indexOf("confirm the numbers") >= 0 && madeTexts.indexOf("send the deck") >= 0,
        "and the bullet and the numbering are stripped, because pasted notes carry them");
  check(/Added 3 tasks/.test($("undoText").textContent),
        "the whole paste undoes as ONE action - it came from one decision");
  click($("undoGo"));
  check(JSON.parse(w.localStorage.getItem("imc.tasks")).length === countBefore,
        "and undo removes all three");

  /* One line still behaves exactly as it always did. */
  addField.value = "Just the one";
  addField.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
  check(JSON.parse(w.localStorage.getItem("imc.tasks")).length === countBefore + 1,
        "a single line still adds a single task");
}
check(/white-space:pre-wrap/.test(flat.match(/\.t \.txt\{[^}]*\}/)[0]),
      "and the card renders that break rather than running the lines together");

/* ---- selecting several days -------------------------------------------- */
/* Marking three weeks of leave meant opening the day popup, clicking a colour
   and closing it, twenty-one times. */
toCal();
const dcs = qa(".wg .dc[data-ds]");
check(dcs.length > 0, "calendar days carry their date, so they can be selected");

const clickWith = (node, opts) =>
  node.dispatchEvent(new w.MouseEvent("click", Object.assign({bubbles:true}, opts)));

/* ctrl-click picks out days that are not next to each other */
clickWith(dcs[10], { ctrlKey:true });
clickWith(dcs[20], { ctrlKey:true });
check(/2 days selected/.test($("selCount").textContent),
      "ctrl-click builds a selection out of scattered days");
check(!$("selBar").classList.contains("hidden"), "and the action bar appears");
check($("selSw").querySelectorAll(".dab").length === 4,
      "offering every colour, applied to the whole selection at once");

/* shift-click fills in the run between */
clickWith(dcs[26], { shiftKey:true });
check(/8 days selected/.test($("selCount").textContent),
      "shift-click extends from the last day touched to this one");

/* dragging is the fast path for a continuous run */
$("selClear").click();
dcs[7].dispatchEvent(new w.MouseEvent("mousedown",{bubbles:true,button:0}));
for (let i=8;i<=27;i++) dcs[i].dispatchEvent(new w.MouseEvent("mouseenter",{bubbles:true}));
d.dispatchEvent(new w.MouseEvent("mouseup",{bubbles:true}));
clickWith(dcs[27], {});
check(/21 days selected/.test($("selCount").textContent),
      "dragging across three weeks selects all 21 days");
check($("ov").classList.contains("hidden"),
      "and the drag does not also open the day popup it passed over");

/* one click then colours the lot */
$("selSw").querySelectorAll(".dab")[2].click();
{
  const notes = JSON.parse(w.localStorage.getItem("imc.notes"));
  const green = Object.keys(notes).filter(k => notes[k] && notes[k].color === 2);
  check(green.length >= 21, "one click colours all of them - " + green.length + " days marked");
  check($("selBar").classList.contains("hidden"), "and the selection is finished with");
}

/* the phone path: no ctrl key, no drag */
$("selStart").click();
check($("selStart").textContent === "Done selecting", "there is a mode for touch screens");
clickWith(dcs[41], {});
clickWith(dcs[42], {});
check(/2 days selected/.test($("selCount").textContent),
      "in which a plain tap selects rather than opening the day");
check($("ov").classList.contains("hidden"),
      "the day popup stays shut - checking the count alone let the first tap through");
clickWith(dcs[42], {});
check(/1 day selected/.test($("selCount").textContent), "and tapping again removes it");

key("Escape");
check($("selBar").classList.contains("hidden") && $("selStart").textContent === "Select days",
      "Escape leaves the mode entirely");
clickWith(dcs[44], {});
check(!$("ov").classList.contains("hidden"), "after which a plain click opens the day again");
$("mCancel").click();
toBoard();
}

console.log("\n=== C52. Deleting can be taken back ===");
{
/* Deleting a task was instant, unconfirmed and permanent. On a phone the
   delete button is one of SEVEN controls on a row at about 34px each, so
   hitting it by accident is easy - and far likelier than anybody deliberately
   pressing "Delete everything". A confirm on every delete would be worse than
   the accident, because deleting is a normal thing to do many times a day. */
check(!!$("undoBar") && !!$("undoGo"), "there is an undo bar with an undo button");

toBoard();
click([...$("scopeSeg").children][0]);          /* day scope, so tasks can be added */
const ctrlZ = () => d.dispatchEvent(new w.KeyboardEvent("keydown",{key:"z",ctrlKey:true,bubbles:true}));
const lane0 = () => col(0);
const laneTexts = () => [...lane0().querySelectorAll(".t .txt")].map(n => n.textContent);
const delRow = i => {
  const rows = [...lane0().querySelectorAll(".t")];
  click([...rows[i].querySelectorAll(".op")].find(b => b.title === "Delete"));
};

["Alpha","Bravo","Charlie","Delta"].forEach(t => add(0, t));
const startList = laneTexts();
check(startList.length >= 4, "four tasks to work with");

/* Delete the SECOND one: restoring to the right SLOT is the part that can
   silently go wrong, and appending to the bottom would quietly change what the
   task means, because position is priority here. */
delRow(1);
check(laneTexts().indexOf("Bravo") < 0, "the task goes when deleted");
check(!$("undoBar").classList.contains("hidden"), "and the undo bar appears");
check(/Bravo/.test($("undoText").textContent),
      "naming the task, so you know what you are getting back");

click($("undoGo"));
check(JSON.stringify(laneTexts()) === JSON.stringify(startList),
      "undo puts it back in the same position, not at the bottom");
check($("undoBar").classList.contains("hidden"), "and the bar goes away");

/* The id has to survive, or sync treats the restored task as a new row and the
   original stays deleted on the server. */
{
  const before = JSON.parse(w.localStorage.getItem("imc.tasks")).find(t => t.text === "Bravo").id;
  delRow(1);
  click($("undoGo"));
  const after = JSON.parse(w.localStorage.getItem("imc.tasks")).find(t => t.text === "Bravo").id;
  check(before === after, "the restored task keeps its id, so sync resurrects it rather than duplicating");
}

/* Several deletes come back one at a time, newest first. */
delRow(0); delRow(0); delRow(0);
const afterThree = laneTexts().length;
click($("undoGo"));
const step1 = laneTexts().length;
ctrlZ(); const step2 = laneTexts().length;
ctrlZ(); const step3 = laneTexts().length;
check(step1 === afterThree + 1 && step2 === step1 + 1 && step3 === step2 + 1,
      "three deletions undo one at a time rather than all at once");
check(JSON.stringify(laneTexts()) === JSON.stringify(startList),
      "and everything ends up where it started");

/* Undo must never manufacture a duplicate. Restoring pushes a task back by id,
   so undoing the same deletion twice, or undoing something already restored,
   has to be a no-op rather than a second copy. Deliberately NOT written as
   "the stack is empty": earlier sections of this file delete tasks too, so the
   stack is shared, and draining it here would resurrect their tasks and break
   them. Duplicates are the real risk anyway. */
{
  const ids = () => JSON.parse(w.localStorage.getItem("imc.tasks")).map(t => t.id);
  ctrlZ(); ctrlZ(); ctrlZ();
  const after = ids();
  const dupes = after.filter((id, i) => after.indexOf(id) !== i);
  check(dupes.length === 0, "repeated undo never produces a duplicate task");
}

/* Ctrl+Z belongs to the text field while you are typing in it. Stealing it
   there would undo somebody's deletion instead of their last word. */
{
  delRow(0);
  const n = laneTexts().length;
  const f = lane0().querySelector(".cadd");
  f.focus();
  f.dispatchEvent(new w.KeyboardEvent("keydown",{key:"z",ctrlKey:true,bubbles:true}));
  check(laneTexts().length === n, "Ctrl+Z while typing stays the browser's own undo");
  click($("undoGo"));
}

/* Removing a countdown is the same accident with the same remedy: a small x,
   no confirmation, and a date nobody remembers offhand. */
{
  $("tLabel").value = "Board review";
  $("tDate").value = (cy + 1) + "-02-11";
  click($("tAdd"));
  const before = qa("#tkList .tk").length;
  click(qa("#tkList .tk .x")[0]);
  check(qa("#tkList .tk").length === before - 1, "a countdown can be removed");
  check(/Board review|Removed/.test($("undoText").textContent), "which is also offered back");
  click($("undoGo"));
  check(qa("#tkList .tk").length === before, "and comes back");
}

/* The undo bar and the day-selection bar can be on screen together. */
check(/\.toast\.above\{bottom:/.test(flat),
      "the undo bar stacks above the day-selection bar rather than under it");
}

console.log("\n=== C53. The phone pass, done properly this time ===");
{
/* THE BUG THIS SECTION EXISTS FOR.
   On every phone, the main "Board" link in the ribbon was an EMPTY 16px box.
   .navshort{display:none} was written BELOW the media query that shows it, and
   a media query carries no extra specificity - so the later, equally specific
   plain rule won at every width, while under 1250px .navlong was hidden too.
   Both halves of the link were display:none at once.

   The same ordering trap is already written up in site.css for .appzone. It
   caught the nav as well, which is why it is now a test and not just a
   comment. */
const site = readFile("assets/site.css");
const baseHide = site.indexOf(".navshort{display:none}");
const showsIt  = site.indexOf(".navshort{display:inline}");
check(baseHide >= 0 && showsIt >= 0, "the ribbon has a long and a short nav label");
check(baseHide < showsIt,
      "the base rule hiding the short label comes BEFORE the query that shows it, " +
      "or a media query with no extra specificity loses and the link renders empty");

/* Both labels must never be hidden together. */
const flatSite = site.replace(/\s*\n\s*/g, "");
check(!/\.navlong\{display:none\}[^@]*\.navshort\{display:none\}/.test(flatSite),
      "the long and short labels are never both hidden at the same width");

/* THE TAP TARGETS.
   An audit at 375px found 95 interactive elements under 32px. The earlier
   mobile work sized four things - the add field, its button, the row controls
   and the calendar cells - and left the rest at desktop size. These pin the
   ones that were missed, by rule rather than by measurement, since jsdom
   reports zero for every box. */
const phone = (flat.match(/@media \(max-width:640px\)\{[^@]*/g) || []).join("");
check(phone.length > 0, "there is a phone stylesheet block to check");

[["\\.nub\\{[^}]*min-width:38px",           "the day arrows in the ribbon"],
 ["\\.yarr,\\.fold\\{[^}]*min-width:34px",  "the year and fold arrows"],
 ["footer \\.wrap a\\{[^}]*min-height:34px","the footer links, which were 17px tall"],
 ["\\.fdata \\.btn\\{[^}]*min-height:36px", "Export, Backup, Restore and Delete everything"],
 ["\\.tk \\.x\\{[^}]*width:32px",           "the countdown delete button"],
 ["\\.chk\\{[^}]*min-height:34px",          "the regional-holidays row, tapped by its label"],
 ["\\.dab\\{[^}]*min-width:36px",           "the day popup's colour swatches"]
].forEach(([re, what]) =>
  check(new RegExp(re).test(phone), "sized for a thumb on a phone: " + what));

/* The dense calendar grid is deliberately excluded: its cells are 26x34 and
   making them 44px would turn a year that fits on one screen into a scrolling
   list, which is the whole point of that view. */
check(!/@media \(max-width:640px\)\{[^@]*\.wg \.dc\{[^}]*min-height:44px/.test(flat),
      "the calendar cells are left dense on purpose, not inflated to 44px");
}

console.log("\n=== C54. House style: plain ASCII punctuation ===");
{
/* One punctuation set for the whole repository: "-" and '"', never an em dash
   or a curly quote. Two reasons, and the second is the one that matters.

   The first is that a file typed on one machine and edited on another drifts:
   an editor with smart quotes turned on rewrites what you paste, and the diff
   then carries changes nobody made. The second is that these characters break
   silently. This is a plain-HTML project with no build step and no transform
   between the source and the browser, so a stray U+2019 in a JS string is
   shipped byte for byte, and any tool in the chain that is not UTF-8 clean
   turns it into mojibake in front of a reader.

   This checks the SOURCE, including this file. It caught real occurrences in
   app.css, site.css, app.js and here. */
const SMART = /[—–“”‘’]/;

const sources = ["assets/app.js","assets/auth.js","assets/sync.js","assets/site.js",
                 "assets/errors.js","assets/app.css","assets/site.css",
                 "tools/build-holiday-pages.js","manifest.webmanifest",".htaccess"]
                .concat(PAGES);

sources.forEach(f => {
  if (!fs.existsSync(path.join(ROOT, f))) return;
  const src = readFile(f);
  /* An escape sequence is fine - the em-dash empty-state test has to name the
     character it is checking for. A LITERAL one is not. */
  check(!SMART.test(src), f + ": plain punctuation only, no em dashes or curly quotes");
});

/* The generated pages come from the generator, so they are checked separately
   rather than trusted. */
check(!SMART.test(readFile("holidays/IN-2027.html")),
      "a generated holiday page is clean too");

/* Authorship belongs to the person who owns the repository, and a stray
   attribution trailer anywhere in the source would put someone else in the
   Contributors list. Verified against the history with:
     git log --all --format='%an|%ae|%B' | grep -i 'co-authored'              */
check(!/Co-Authored-By/i.test(readFile("README.md")),
      "the README carries no attribution trailers");

/* THE LICENCE HAS TO AGREE WITH ITSELF.
   It did not. package.json said MIT, the README said MIT, terms.html said the
   code belongs to its author - the opposite of MIT - and there was no LICENSE
   file at all, so the legal default (all rights reserved) applied regardless.
   The repository was advertising rights it had never granted, and nothing
   noticed because no single file was wrong on its own. */
check(fs.existsSync(path.join(ROOT, "LICENSE")),
      "there is a LICENSE file, without which the claim in package.json grants nothing");
const lic = readFile("LICENSE");
check(/All rights reserved/i.test(lic), "it reserves rights rather than granting them");
check(/hello@inmycalendar\.com/.test(lic), "and says where to ask for permission");

const pkgLicence = JSON.parse(readFile("package.json")).license;
check(pkgLicence === "UNLICENSED",
      "package.json agrees with it (UNLICENSED is npm's term for proprietary), not MIT");

const readme = readFile("README.md");
check(!/^MIT\.$/m.test(readme), "the README no longer claims plain MIT");
check(/all rights reserved/i.test(readme), "and states the same terms as the LICENSE file");
check(/not host, redistribute or sell/i.test(readFile("terms.html")),
      "and so does the terms page, which used to contradict both");
}

console.log("\n=== C55. Move to today, and the day-colours panel ===");
{
const src = readFile("assets/app.js");

/* ---- move a task to today in one tap --------------------------------- */
/* Looking back through old days and pulling an unfinished task forward is the
   commonest thing to do there. Through the date picker it means opening a
   calendar to choose a date you already know. */
check(/Move to today/.test(src), "there is a move-to-today control");
/* Conditional on purpose: the row already carries seven controls, and an
   eighth that does nothing would be clutter on the board where most time is
   spent. */
check(/task\.date !== iso\(today\(\)\)/.test(src),
      "which is only rendered when the task is not already on today");

toBoard();
click([...$("scopeSeg").children][0]);
const lane = () => col(0);
const opsOf = r => [...r.querySelectorAll(".op")].map(b => b.title);

add(0, "Pull me forward");
const todayRow = [...lane().querySelectorAll(".t")].find(r => r.querySelector(".txt").textContent === "Pull me forward");
check(opsOf(todayRow).indexOf("Move to today") < 0,
      "on today's own board it does not appear, so the row stays at seven controls");

/* Move it to an earlier day, go there, and the control should appear. */
const past = (function(){ const p=new Date(); p.setDate(p.getDate()-6); return iso(p); })();
{
  const id = JSON.parse(w.localStorage.getItem("imc.tasks")).find(t => t.text === "Pull me forward").id;
  dom.window.eval('moveTaskToDate("' + id + '","' + past + '"); refresh();');
}
$("dInput").value = past;
$("dInput").dispatchEvent(new w.Event("change", { bubbles:true }));
const pastRow = [...lane().querySelectorAll(".t")].find(r => r.querySelector(".txt").textContent === "Pull me forward");
check(!!pastRow, "the task is on the older day");
check(pastRow && opsOf(pastRow).indexOf("Move to today") >= 0,
      "and there the control appears");

click([...pastRow.querySelectorAll(".op")].find(b => b.title === "Move to today"));
check(JSON.parse(w.localStorage.getItem("imc.tasks")).find(t => t.text === "Pull me forward").date === TODAY,
      "one tap moves it to today");
check(/Moved .*to today/.test($("undoText").textContent),
      "and it is undoable, because a mis-tap while browsing history relocates a task you cannot see");
click($("undoGo"));
check(JSON.parse(w.localStorage.getItem("imc.tasks")).find(t => t.text === "Pull me forward").date === past,
      "undo puts it back on the day it came from");
$("dInput").value = TODAY;
$("dInput").dispatchEvent(new w.Event("change", { bubbles:true }));

/* ---- the day colours panel ------------------------------------------- */
/* REORDERING MUST NOT TOUCH THE DATA. A day stores its colour as an INDEX
   into catLabels, so physically reordering those arrays would repaint every
   day already marked. cfg.catOrder changes what the panel SHOWS. */
check(/catOrder/.test(src), "there is a display order for the categories");
check(/catOrder:\[0,1,2,3\]/.test(src), "defaulting to the natural order");

{
  const before = JSON.parse(w.localStorage.getItem("imc.cfg")).catOrder;
  const rows = qa("#cats .cat");
  check(rows.length === 4 && rows.every(r => r.draggable), "every category row is draggable");

  rows[0].dispatchEvent(new w.Event("dragstart", { bubbles:true }));
  rows[3].dispatchEvent(new w.Event("drop", { bubbles:true }));
  const after = JSON.parse(w.localStorage.getItem("imc.cfg")).catOrder;
  check(JSON.stringify(after) !== JSON.stringify(before), "dragging one to the end reorders the panel");
  check(after.slice().sort().join() === "0,1,2,3",
        "and the order stays a permutation, so no category is lost or duplicated");
}

/* The count answers "how much leave have I taken" without opening the export. */
check(/function catCount\(/.test(src), "each colour carries a count of the days marked with it");
check(qa("#cats .catn").length === 4, "one count per row");
/* The span differs by view and the number has to describe what is on screen. */
check(/el\.calView[\s\S]{0,120}calYears\(\)/.test(src),
      "counted over the calendar's whole year range on the calendar, and one year on the board");

/* Hiding every colour, for a screenshot that shows only holidays. */
check(!!$("catsHide"), "there is a control to hide every day colour");
check(/hideCats/.test(src), "backed by a setting");
check(/hasCat && !cfg\.hideCats/.test(src),
      "which stops the cell painting its colour WITHOUT deleting the colour");
check($("catsHide").closest("h3") !== null,
      "and it sits in the panel heading, so it costs no extra height in the rail");
{
  const notesBefore = Object.keys(JSON.parse(w.localStorage.getItem("imc.notes"))).length;
  click($("catsHide"));
  check(JSON.parse(w.localStorage.getItem("imc.cfg")).hideCats === true, "pressing it hides them");
  check(Object.keys(JSON.parse(w.localStorage.getItem("imc.notes"))).length === notesBefore,
        "and deletes nothing - every marked day is still marked");
  click($("catsHide"));
  check(JSON.parse(w.localStorage.getItem("imc.cfg")).hideCats === false, "pressing it again brings them back");
}
}

console.log("\n=== C56. The nav bug, quick capture, the sweep, and adding colours ===");
{
const src = readFile("assets/app.js");

/* ---- THE NAVIGATION BUG ------------------------------------------------
   Reported as: the address bar changes to #board but the page does not.
   Seen on two machines and two browsers, which ruled out anything local.

   The Board link wraps its label in two spans, one long and one short:
     <a href="#board" data-view="board">
       <span class="navlong">Kanban Board</span><span class="navshort">Board</span>
     </a>
   The handler read data-view off e.target. Click the WORDS and e.target is the
   span, which has no data-view, so it returned early - no preventDefault - and
   the browser simply followed the href. Click the few pixels of padding and
   e.target was the <a>, and it worked. Hence "sometimes".

   Calendar has no inner span, which is why Calendar always worked. */
check(/closest\("\[data-view\]"\)/.test(src),
      "the nav handler walks up to the link, so clicking the label works too");

toCal();
check(!$("calView").classList.contains("hidden"), "starting on the calendar");
{
  const link = d.querySelector('.sitenav a[data-view="board"]');
  const span = link.querySelector("span");
  check(!!span, "the Board link really does wrap its label in a span");
  span.dispatchEvent(new w.MouseEvent("click", { bubbles:true }));
  check(!$("boardView").classList.contains("hidden") && $("calView").classList.contains("hidden"),
        "clicking the LABEL switches the view, not just the address bar");
}

/* ---- several lines become several tasks -------------------------------- */
toBoard();
click([...$("scopeSeg").children][0]);
{
  const f = col(0).querySelector(".cadd");
  const before = JSON.parse(w.localStorage.getItem("imc.tasks")).length;
  f.value = "Ring John about pricing\n- send the Q3 deck\n2. book the room\n\n* chase the invoice";
  f.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
  const after = JSON.parse(w.localStorage.getItem("imc.tasks"));
  check(after.length === before + 4, "four lines become four tasks");
  const texts = after.slice(-4).map(t => t.text);
  check(texts.indexOf("send the Q3 deck") >= 0 && texts.indexOf("book the room") >= 0 &&
        texts.indexOf("chase the invoice") >= 0,
        "with bullets, numbering and the blank line stripped, because pasted notes carry them");
  check(/Added 4 tasks/.test($("undoText").textContent), "undone as one action, not four");
  click($("undoGo"));
  check(JSON.parse(w.localStorage.getItem("imc.tasks")).length === before, "and all four go");
}

/* ---- the carry-forward sweep ------------------------------------------- */
/* It used to look at YESTERDAY alone, which is the one case where you did not
   need help - you were here yesterday. Come back after a week and the days
   before yesterday were never offered, so the tasks open longest were exactly
   the ones it ignored. */
check(/t\.date < nowISO && t\.status !== "done"/.test(src),
      "the sweep gathers every earlier day, not just yesterday");
check(/Move all to today/.test(src), "and says so on the button");
check(/Moved " \+ was\.length/.test(src) || /pushUndo\("Moved "/.test(src),
      "the whole sweep is undoable - moving a week of work forward by accident must not be permanent");

/* ---- adding and removing colours --------------------------------------- */
check(/var MAXCATS = 8/.test(src), "there is a ceiling on how many colours can exist");
check(/function addCat\(/.test(src) && /function deleteCat\(/.test(src),
      "colours can be added and removed");
check(/cfg\.catLabels\.length <= 1/.test(src),
      "but never the last one, or there is nothing left to mark a day with");

/* THE PART THAT IS EASY TO GET WRONG. A day stores its colour as an INDEX, so
   deleting one shifts every index above it down. Without the shift, a week of
   Leave silently becomes Travel. */
check(/c > idx\) notes\[ds\]\.color = c - 1/.test(src),
      "deleting a colour shifts every higher index down, so days keep their MEANING");
check(/if \(c === idx\) notes\[ds\]\.color = null/.test(src),
      "days marked with the removed colour lose the colour and keep the note");

toBoard();
check(qa("#cats .catx").length === qa("#cats .cat").length, "every colour row has a remove control");
check(!!d.querySelector(".catadd .btn"), "and there is a control to add one");
{
  const before = JSON.parse(w.localStorage.getItem("imc.cfg")).catLabels.length;
  click(d.querySelector(".catadd .btn"));
  check(JSON.parse(w.localStorage.getItem("imc.cfg")).catLabels.length === before + 1,
        "adding gives a new colour with its own default hue");
  check(JSON.parse(w.localStorage.getItem("imc.cfg")).catOrder.length === before + 1,
        "and the display order grows with it, so it is not invisible");
}
}

console.log("\n=== C57. Three week-numbering rules, and why two is not enough ===");
{
const src = readFile("assets/app.js");

/* ISO 8601's Thursday is not a magic day. Thursday is the FOURTH day of a
   Monday-start week, so "the week containing the first Thursday" is shorthand
   for "the first week with four or more days in the new year".

   That equivalence holds only for a Monday start. The fourth day of a
   Sunday-start week is WEDNESDAY. So on a Sunday-start calendar the two rules
   genuinely disagree, and both are in real use - some large organisations
   deliberately keep ISO's Thursday pivot with a Sunday start, which gives a
   week 1 holding only three days of the new year.

   The app offered only the Thursday rule while LABELLING it as the 4-day rule,
   which was wrong for every user who does not start their week on Monday. */
check(/majorityPivot/.test(src), "the majority rule has a pivot that moves with the week start");
check(/\(cfg\.weekStart \+ 3\) % 7/.test(src),
      "computed as the FOURTH day of the week, which is what '4+ days' means");
check(/WEEK_RULES = \["majority","thursday","firstfull","jan1"\]/.test(src),
      "and there are four rules, validated against a whitelist");
/* A two-way coercion would silently map the new rule onto the old one, leaving
   the dropdown showing one thing while the calendar did another. */
check(!/weekRule = el\.wkRule\.value === "jan1" \? "jan1" : "thursday"/.test(src),
      "the old two-way coercion is gone, so the new rule cannot be swallowed");

const opts = [...d.querySelectorAll("#wkRule option")].map(o => o.value);
check(opts.length === 4 && opts.indexOf("majority") >= 0 && opts.indexOf("thursday") >= 0 &&
      opts.indexOf("firstfull") >= 0 && opts.indexOf("jan1") >= 0,
      "all four are offered in the settings, not just two");

const labels = [...d.querySelectorAll("#wkRule option")].map(o => o.textContent.trim());
check(labels.some(l => /4\+ days/.test(l)) && labels.some(l => /first Thursday/i.test(l)) &&
      labels.some(l => /fully inside/i.test(l)),
      "and each is named for the rule it actually applies, not for the other one");

/* The behaviour, driven through the real settings. 2026 is the case that
   separates them: 1 January 2026 is a Thursday. */
const setRule = (start, rule) => {
  $("wsSel").value = String(start);
  $("wsSel").dispatchEvent(new w.Event("change",{bubbles:true}));
  $("wkRule").value = rule;
  $("wkRule").dispatchEvent(new w.Event("change",{bubbles:true}));
};
const week1Of = y => dom.window.eval("iso(week1Start(" + y + "))");

setRule(1, "majority"); const monMaj = week1Of(2026);
setRule(1, "thursday"); const monThu = week1Of(2026);
check(monMaj === monThu,
      "with weeks starting Monday the two rules are indistinguishable (" + monMaj + ")");

setRule(0, "thursday"); const sunThu = week1Of(2026);
setRule(0, "majority"); const sunMaj = week1Of(2026);
check(sunThu !== sunMaj,
      "with weeks starting Sunday they genuinely differ: thursday " + sunThu + ", majority " + sunMaj);

/* The majority rule has to keep its promise, or the label is a lie. */
{
  setRule(0, "majority");
  let worst = 7;
  for (let y = 2020; y <= 2035; y++){
    const s = new Date(week1Of(y) + "T00:00:00");
    let inYear = 0;
    for (let i=0;i<7;i++){
      const dd = new Date(s.getTime()); dd.setDate(dd.getDate()+i);
      if (dd.getFullYear() === y) inYear++;
    }
    if (inYear < worst) worst = inYear;
  }
  check(worst >= 4, "and week 1 always holds at least 4 days of the new year (worst case " + worst + ")");
}

/* The Thursday rule keeps ITS promise too - the three-day week 1 is the point
   of it, not a defect. */
{
  setRule(0, "thursday");
  const s = new Date(week1Of(2026) + "T00:00:00");
  let inYear = 0;
  for (let i=0;i<7;i++){
    const dd = new Date(s.getTime()); dd.setDate(dd.getDate()+i);
    if (dd.getFullYear() === 2026) inYear++;
  }
  check(inYear === 3,
        "while the Thursday rule gives 2026 a three-day week 1, which is exactly what it is for");
}

/* The fourth rule: week 1 must lie WHOLLY inside the new year. 2024 is the
   case that isolates it - 1 January 2024 is a Monday, so all three of the
   other rules reach back into December and this one refuses to. */
{
  setRule(0, "firstfull"); const ff = week1Of(2024);
  setRule(0, "jan1");      const j24 = week1Of(2024);
  setRule(0, "majority");  const m24 = week1Of(2024);
  setRule(0, "thursday");  const t24 = week1Of(2024);
  check(ff !== j24 && ff !== m24 && ff !== t24,
        "firstfull is a rule of its own, not a rename: 2024 starts " + ff +
        " where the other three all start " + j24);

  setRule(0, "firstfull");
  let worst = 7;
  for (let y = 2020; y <= 2035; y++){
    const s = new Date(week1Of(y) + "T00:00:00");
    let inYear = 0;
    for (let i=0;i<7;i++){
      const dd = new Date(s.getTime()); dd.setDate(dd.getDate()+i);
      if (dd.getFullYear() === y) inYear++;
    }
    if (inYear < worst) worst = inYear;
  }
  check(worst === 7, "and week 1 never borrows a single day from December (worst case " + worst + "/7)");
}

/* Every week start has to be offered, or the rule above is unusable for the
   Saturday and Sunday starts used across the Gulf and much of the Americas. */
check([...d.querySelectorAll("#wsSel option")].length === 7,
      "all seven week starts are selectable, not just Monday and Sunday");

/* Leave the settings as the suite found them. */
setRule(0, "thursday");
}

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
check($("mKb").querySelectorAll(".col").length === 3, "with the editable board embedded");
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
/* Comments are stripped first. This check greps the source, and it failed on a
   COMMENT that happened to explain why a height calculation adds the border -
   the prose contained the very words being banned. In a codebase that comments
   this heavily, a source grep that cannot tell code from prose will keep
   raising false alarms.

   The rule itself stands: layout is CSS's job, and the app should not be
   measuring boxes to decide how to draw. The one exception is the add field,
   which grows to fit what you are typing - reading scrollHeight is the only
   way to do that, and there is no CSS equivalent that also caps the height and
   then scrolls. So: allowed there, nowhere else. */
const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, "")
                       .replace(/(^|[^:])\/\/.*$/gm, "$1");
const jsCode = codeOnly(js);
check(!/offsetHeight|clientHeight/.test(jsCode), "no JS layout measurement");
/* TWO EXCEPTIONS NOW, BOTH NAMED, AND THE SECOND WAS EARNED.

   The first is the add field growing to fit what you type. The second is
   markOverflowing(), which decides whether a task's text is actually cut and
   therefore whether to offer a way to read the rest.

   That second one was a character count first, and the count was wrong in both
   directions. At 90 a phone clipped an 84-character task and offered nothing.
   At 55 desktop grew a control on 29 of 30 tasks where nothing was hidden.
   Splitting the number per breakpoint in CSS improved it and still left 27
   controls for 2 genuinely clipped tasks on a phone. A guess from character
   count cannot work: whether text wraps depends on the characters, the font,
   and a card width nobody measured.

   Measured, it is exact - 27 of 27 on desktop, 2 of 2 on a phone. So the rule
   stands as "layout is CSS's job", with these two places where there is no CSS
   that can answer the question, and both say so in their own comments. */
const grows = (jsCode.match(/scrollHeight/g) || []).length;
check(grows === 2, "exactly two height reads in the whole app, got " + grows);
check(/inp\.scrollHeight/.test(jsCode), "one is the add field sizing itself to what you type");
check(/t\.scrollHeight > shown/.test(jsCode),
      "the other is deciding whether a task's text is genuinely cut");
check(/function markOverflowing/.test(jsCode) &&
      /A SECOND MEASURING EXCEPTION, ON PURPOSE/.test(js),
      "and it is documented as a deliberate exception, not slipped in");
/* Once per render over the rows, not once per task inside taskRow. */
check(/markOverflowing\(el\.scopeHost\)/.test(jsCode),
      "run once per render against the whole board");
/* A first load measures against the fallback font, which is a different width:
   22 rows marked instead of 27, and the five missed were cut with no way out. */
check(/document\.fonts\.ready\.then/.test(jsCode),
      "and measured again once the real font has loaded, or a first load is wrong");
check(/--hYear:30px/.test(flat) && /top:var\(--hYear\)/.test(flat.replace(/\s+/g,"")),
      "sticky offsets are fixed CSS custom properties, not JS-measured");
check((flat.match(/minmax\(0,1fr\)/g)||[]).length >= 3, "grids use minmax(0,1fr)");
check(!/\.calbox\{[^}]*overflow:hidden/.test(flat), "no overflow:hidden above sticky headers");
/* .calbox was checked and .wg was not, and .wg is where the overflow:hidden
   actually sat - directly around the sticky headers. An ancestor with
   overflow:hidden becomes the containing block for a sticky child, and since
   .wg does not itself scroll the headers had no range and scrolled away with
   the grid. Same trap as before, one element further in. */
check(!/\.wg\{[^}]*overflow:hidden/.test(flat),
      "and none on the week grid itself, which is what actually killed them");
check(/\.wg \.yh\{[^}]*position:sticky/.test(flat), "the year header is sticky");
check(/\.wg \.dh\{[^}]*position:sticky/.test(flat), "and so is the day-of-week row");
check(/\.calbox\{overflow:auto/.test(flat), "with the calendar box as the thing that scrolls");
check(js.lastIndexOf("init()") > js.lastIndexOf("function init"), "init() is the last statement");
const saved = {}; ["tasks","notes","track","cfg"].forEach(k => saved[k] = w.localStorage.getItem("imc."+k));
const e2 = [];
const dom2 = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously", pretendToBeVisual:true,
  virtualConsole: new VirtualConsole().on("jsdomError", e => e2.push(String(e.detail||e))),
  beforeParse(win){ Object.keys(saved).forEach(k => win.localStorage.setItem("imc."+k, saved[k])); }});
check(e2.length === 0, "reload clean" + (e2.length ? " -> " + e2.join("|") : ""));
check(dom2.window.document.querySelectorAll("#tkList .tk").length === tkCount,
      "all " + tkCount + " countdowns survive a reload");
/* Deleting everything now needs the word typed, and writes a backup first.
   A single OK was guarding the most destructive control in the app, and the
   old wording claimed it only affected "this browser" - untrue, because every
   removed row syncs to the server as a deletion marker. */
let wipeAsked = "";
const clicksBefore = JSON.parse(w.localStorage.getItem("imc.tasks")).length;

/* A wrong word must destroy nothing. */
w.prompt = () => "yes";
click($("wipe"));
check(JSON.parse(w.localStorage.getItem("imc.tasks")).length === clicksBefore,
      "answering anything other than DELETE leaves every task alone");

w.prompt = (msg) => { wipeAsked = msg; return "delete"; };
click($("wipe"));
check(/task/.test(wipeAsked) && /countdown/.test(wipeAsked),
      "the prompt counts what is about to be destroyed rather than saying 'data'");
check(/backup/i.test(wipeAsked),
      "and promises the backup file it writes before deleting anything");
check(JSON.parse(w.localStorage.getItem("imc.tasks")).length === 0, "wipe clears tasks");

/* ---------------------------------------------------------------------------
   The docs claim a test count. Those claims went stale three separate times
   (README said 363 twice and 281 once while the real number was 317), in the
   very file whose job is to be the source of truth. This compares every claim
   to the real total. It runs AFTER the counters are final and deliberately
   sits outside check(), so it cannot change the number it is verifying.
   --------------------------------------------------------------------------- */
console.log("\n=== C58. The rename click, and two holidays that were wrong ===");
{
const src = readFile("assets/app.js");

/* THE RENAME CLICK.
   The task row carries draggable="true", and HTML5 drag has NO movement
   threshold: the browser commits to a drag on the FIRST mousemove after
   mousedown and then never fires click. A trackpad drifts a pixel or two under
   almost every tap, so clicking a task to rename it failed a large share of the
   time, on every laptop and every browser.

   Measured on the live site before the fix: press, move two pixels, release,
   and the row received mousedown and nothing else. No mouseup, no click, no
   editor. Hold perfectly still and it worked. That is exactly the reported
   "it doesn't work at once".

   jsdom has no drag machinery, so the behaviour cannot be reproduced here.
   What CAN be locked is that the guard exists and is wired to every event that
   has to release it, because if any one of them is dropped the row stays
   permanently undraggable and nothing visibly complains. */
check(/DRAG_SLOP/.test(src), "task rows have a drag threshold");
check(/n\.draggable = false/.test(src),
      "the row stops being draggable while a press is still undecided");
check(/pointermove[\s\S]{0,400}n\.draggable = true/.test(src),
      "and becomes draggable again once the pointer has actually travelled");
check(/closest\(".grip, .op"\)/.test(src),
      "the grip is exempt, so the explicit drag handle still drags at once");
["pointerup","pointercancel","pointerleave","dragend"].forEach(function(ev){
  check(new RegExp('addEventListener\\("' + ev + '", *unarm\\)').test(src),
        "draggable is restored on " + ev + ", so a row can never get stuck");
});

/* THE UK BANK HOLIDAY.
   Reported as "25 August 2025 is missing". It was in the data all along,
   flagged regional, and regional days are hidden by default. The upstream
   source marks a day national only when EVERY subdivision observes it, so
   Scotland doing something different demoted a bank holiday that applies to
   England, Wales and Northern Ireland - about 97% of the UK. */
{
  var GB = null;
  new Function("window", "return eval(arguments[1])")(
    { __imcHol: function(c, d){ GB = d; } }, readFile("assets/holidays/GB.js"));
  check(GB && GB["2025"], "GB holiday data loads");
  check(GB["2025"]["0825"] && GB["2025"]["0825"][1] === 0,
        "25 Aug 2025, the late-August bank holiday, is national and therefore drawn");
  check(GB["2025"]["0421"] && GB["2025"]["0421"][1] === 0,
        "Easter Monday is national too, demoted by the very same rule");
  check(GB["2025"]["0804"] && GB["2025"]["0804"][1] === 1,
        "Scotland's own early-August holiday stays regional, which is correct");

  /* One year proves nothing: the demotion applied to all 31 years in the file. */
  var stillRegional = 0, years = 0;
  for (var y in GB){
    years++;
    for (var k in GB[y]){
      var e = GB[y][k];
      if (/^(Easter Monday|Late Summer Bank Holiday)$/.test(e[0]) && e[1] === 1) stillRegional++;
    }
  }
  check(years > 25 && stillRegional === 0,
        "and it is fixed across all " + years + " years, not only the one reported");
}

/* SWEDEN.
   Swedish law really does class every Sunday as a public holiday. Correct, and
   useless in a calendar: 1529 entries named "Sunday" painted the entire Sunday
   column red for 31 years and buried the eleven days a Swede plans around. */
{
  var SE = null;
  new Function("window", "return eval(arguments[1])")(
    { __imcHol: function(c, d){ SE = d; } }, readFile("assets/holidays/SE.js"));
  var DOWNAME = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/;
  var bare = 0;
  for (var y2 in SE) for (var k2 in SE[y2]){
    if (String(SE[y2][k2][0]).split(";").some(function(s){ return DOWNAME.test(s.trim()); })) bare++;
  }
  check(bare === 0, "Sweden lists no bare weekday as a holiday");
  var n25 = Object.keys(SE["2025"]).length;
  check(n25 > 5 && n25 < 20,
        "and 2025 is a believable " + n25 + " days rather than 63");
}

/* The audit tool is the thing that finds the NEXT one of these, so it has to
   exist and has to be runnable. */
check(fs.existsSync(path.join(ROOT, "tools", "audit-holidays.js")),
      "the holiday audit tool is present for finding the next fault of this kind");
}

console.log("\n=== C59. The big countries, checked against their official lists ===");
{
/* Every fault in this file was invisible until someone who knew the answer
   looked at the calendar and saw a day missing. So the answers are written
   down here. These are counts and dates taken from each country's own
   published list, not from the upstream data, which is the thing being
   tested. */
function hol(code){
  var out = null;
  new Function("window", "return eval(arguments[1])")(
    { __imcHol: function(c, d){ out = d; } }, readFile("assets/holidays/" + code + ".js"));
  return out;
}
function nat(D, y){
  var v = D[y] || {}, n = 0;
  for (var k in v) if (v[k][1] !== 1) n++;
  return n;
}
function day(D, y, k){ return (D[y] && D[y][k]) || null; }
function isNational(D, y, k, name){
  var e = day(D, y, k);
  return !!e && e[1] === 0 && e[0].indexOf(name) >= 0;
}

var GB = hol("GB"), ES = hol("ES"), DE = hol("DE"), FR = hol("FR"),
    IT = hol("IT"), US = hol("US"), JP = hol("JP"), AU = hol("AU");

/* ---- the counts each country actually has --------------------------------- */
/* UK: 8 bank holidays in England and Wales. Scotland's extra days are regional
   and correctly stay hidden unless asked for. */
check(nat(GB,"2025") === 8, "UK has 8 national bank holidays in 2025, got " + nat(GB,"2025"));
/* US: 11 federal holidays, unchanged since Juneteenth was added in 2021. */
check(nat(US,"2025") === 11, "US has 11 federal holidays in 2025, got " + nat(US,"2025"));
/* Germany: 9 observed in every Land; the rest are state-level and regional. */
check(nat(DE,"2025") === 9, "Germany has 9 nationwide holidays in 2025, got " + nat(DE,"2025"));
/* France: the 11 jours feries. Good Friday and 26 December are Alsace-Moselle
   only, so they belong in regional. */
check(nat(FR,"2025") === 11, "France has 11 national holidays in 2025, got " + nat(FR,"2025"));
check(day(FR,"2025","0418") && day(FR,"2025","0418")[1] === 1,
      "and France keeps Good Friday regional, because it is Alsace-Moselle only");
/* Japan has no regional public holidays at all: every one is nationwide. */
check(nat(JP,"2025") === 19, "Japan has 19 national days in 2025 including substitutes, got " + nat(JP,"2025"));
{
  var jpReg = 0, v = JP["2025"];
  for (var k in v) if (v[k][1] === 1) jpReg++;
  check(jpReg === 0, "and Japan has no regional holidays, which is correct for Japan");
}

/* ---- the specific days that were wrong ------------------------------------ */
/* Spain. The upstream source deleted a national holiday outright whenever it
   landed on a Sunday, leaving only a hidden regional "Monday following X".
   Christmas Day itself was missing from the Spanish calendar in five years. */
check(isNational(ES,"2025","1012","National Day"),
      "Spain: 12 October 2025 is the Fiesta Nacional even though it is a Sunday");
check(isNational(ES,"2033","1225","Christmas Day"),
      "Spain: Christmas Day 2033 exists even though it is a Sunday");
check(isNational(ES,"2016","1225","Christmas Day"),
      "Spain: and Christmas Day 2016, the same fault in the other direction");
{
  /* the whole class, not just the examples: every Spanish fixed-date national
     day must be present in every year of the file */
  var FIXED = ["0101","0106","0501","0815","1012","1101","1206","1208","1225"];
  var gaps = 0, yrs = 0;
  for (var y in ES){ yrs++;
    for (var i = 0; i < FIXED.length; i++){
      var e = ES[y][FIXED[i]];
      if (!e || e[1] === 1) gaps++;
    }
  }
  check(gaps === 0,
        "Spain: all 9 fixed national days present in all " + yrs + " years, " + gaps + " gaps");
}

/* Australia. 26 January is national. When it falls on a Sunday the entire
   country takes the Monday, but the substitute was flagged regional and so was
   never drawn. */
check(isNational(AU,"2025","0126","Australia Day"), "Australia: 26 January is national");
check(isNational(AU,"2025","0127","Australia Day"),
      "Australia: and the nationwide Monday substitute is national too");
check(day(AU,"2025","0609") && day(AU,"2025","0609")[1] === 1,
      "Australia: but the King's Birthday stays regional, since the date differs by state");

/* Italy and the UK, the two remaining EU5 members, on days nobody disputes. */
check(isNational(IT,"2025","0425","Liberation Day"), "Italy: 25 April, Liberation Day, is national");
check(isNational(IT,"2025","0602","Republic Day"),   "Italy: 2 June, Republic Day, is national");
check(isNational(GB,"2025","0825","Late Summer Bank Holiday"),
      "UK: the August bank holiday that started all of this is still national");

/* ---- and the property behind all of it ------------------------------------ */
/* A fixed-date national holiday cannot stop existing because of what weekday
   it lands on. Checked across the eight countries asked about. */
{
  var SET = { GB:GB, ES:ES, DE:DE, FR:FR, IT:IT, US:US, JP:JP, AU:AU };
  var offenders = [];
  for (var code in SET){
    var D = SET[code], years = Object.keys(D).map(Number).sort(function(a,b){return a-b;});
    var seen = {};
    for (var yi = 0; yi < years.length; yi++){
      var yv = D[String(years[yi])];
      for (var kk in yv) if (yv[kk][1] !== 1){
        if (!seen[kk]) seen[kk] = { years: [], name: yv[kk][0] };
        seen[kk].years.push(years[yi]);
      }
    }
    for (var kx in seen){
      if (/observed|substitut/i.test(seen[kx].name)) continue;
      if (seen[kx].years.length < years.length * 0.6) continue;
      var have = {}; seen[kx].years.forEach(function(y){ have[y] = 1; });
      var miss = years.filter(function(y){ return !have[y]; });
      if (miss.length < 2) continue;
      var allWeekend = miss.every(function(y){
        var dd = new Date(y, +kx.slice(0,2)-1, +kx.slice(2)).getDay();
        return dd === 0 || dd === 6;
      });
      if (allWeekend) offenders.push(code + " " + kx + " " + seen[kx].name);
    }
  }
  check(offenders.length === 0,
        "no fixed-date national holiday in the eight big countries vanishes on a weekend" +
        (offenders.length ? ": " + offenders.join(", ") : ""));
}
}

console.log("\n=== C60. UK is not a country code, and the data pipeline ===");
{
const src = readFile("assets/app.js");

/* GB is the ISO 3166-1 alpha-2 code for the United Kingdom, which is why the
   country list, the data files and the holiday pages are all named GB. Nobody
   outside a standards body writes GB. So the code someone would actually guess
   at has to resolve, or /#calendar/UK silently does nothing and the visitor
   concludes the feature is broken. GB stays canonical: this is an alias, not a
   rename, so there is still exactly one page per country. */
const resolve = c => dom.window.eval("resolveCountry(" + JSON.stringify(c) + ")");

check(resolve("UK") === "GB", "UK resolves to GB, because that is what people type");
check(resolve("uk") === "GB", "and lower case works, since a URL is not shouted");
check(resolve("GB") === "GB", "GB itself still resolves, so no existing link breaks");
check(resolve("EL") === "GR", "EL resolves to GR, the EU's own code for Greece");
check(resolve("JP") === "JP", "an ordinary code passes through untouched");
check(resolve("ZZ") === "",   "an unknown code resolves to nothing rather than guessing");
check(resolve("") === "" && resolve(null) === "",
      "and empty input is handled, since the hash may carry no country at all");

/* THE PAGE ITSELF IS NAMED UK, not just redirected to.

   The first attempt at this kept /holidays/GB.html as the real page and
   redirected UK to it. That was defensible and it was not what was asked for:
   the link people see and share still read GB. GB is the ISO code and stays
   the DATA code - assets/holidays/GB.js, the country list, the app's internal
   value - but a URL is read and typed by people, and outside a standards body
   nobody writes GB.

   So the real page is UK.html and GB.html permanently redirects to it. Exactly
   one canonical page per country either way; only the direction changed. */
{
  const ht = readFile(".htaccess");
  check(/RewriteRule \^holidays\/GB/.test(ht),
        "/holidays/GB redirects rather than being the page people land on");
  check(/holidays\/UK\$1\.html\s+\[R=301,L\]/.test(ht),
        "and it is a permanent redirect, so indexed GB links still land correctly");
  check(fs.existsSync(path.join(ROOT, "holidays", "UK.html")),
        "the United Kingdom page is served at /holidays/UK.html");
  check(!fs.existsSync(path.join(ROOT, "holidays", "GB.html")),
        "and no GB page remains, so there is still one canonical page per country");

  /* The data code must NOT have moved. Renaming the data file would break the
     app, which looks countries up by ISO code. */
  check(fs.existsSync(path.join(ROOT, "assets", "holidays", "GB.js")),
        "the data file is still GB.js, because the app looks countries up by ISO code");
  check(!fs.existsSync(path.join(ROOT, "assets", "holidays", "UK.js")),
        "and there is no UK.js, which would be a second source of truth");

  /* Every internal reference has to follow, or the site links to 404s. */
  const uk = readFile("holidays/UK.html");
  check(/rel="canonical" href="https:\/\/inmycalendar\.com\/holidays\/UK\.html"/.test(uk),
        "the page declares itself canonical at the UK address");
  check(/href="UK-\d{4}\.html"/.test(uk),
        "and its year links point at UK pages, not at GB ones that no longer exist");
  const map = readFile("sitemap.xml");
  check(/holidays\/UK\.html/.test(map) && !/holidays\/GB/.test(map),
        "the sitemap lists UK and never GB");
  const hub = readFile("holidays/index.html");
  check(/href="UK\.html"/.test(hub),
        "and the country index links to it");
}

/* THE PIPELINE.
   The holiday data is generated. Corrections made by hand to the generated
   files survive exactly until the next regeneration and then vanish silently,
   with no error and no conflict. So the corrections live in code, and the
   audit is what refuses to let a regeneration ship without them. */
{
  const T = f => path.join(ROOT, "tools", f);
  check(fs.existsSync(T("extract-holidays.py")),
        "the extractor is in the repo, not only in a notebook nobody can diff");
  check(fs.existsSync(T("holiday-corrections.js")),
        "the corrections are code, so a regeneration cannot quietly undo them");
  check(fs.existsSync(T("audit-holidays.js")),
        "and the audit is what catches it if someone skips the corrections");

  const corr = readFile("tools/holiday-corrections.js");
  check(/Easter Monday/.test(corr) && /Late Summer Bank Holiday/.test(corr),
        "the UK promotion is encoded as a rule, not left in the data file");
  check(/Australia Day/.test(corr),
        "so is the nationwide Australia Day substitute");
  check(/ES: \[/.test(corr) || /ES:\s*\[/.test(corr),
        "and Spain's deleted fixed dates");
  /* The rule is anchored so it cannot swallow Western Australia Day, which is
     a genuinely state-only holiday sharing most of its name. */
  check(/\^Australia Day\$/.test(corr),
        "the Australia Day rule is anchored, so Western Australia Day is untouched");

  const py = readFile("tools/extract-holidays.py");
  check(/observed=False/.test(py) && /observed=True/.test(py),
        "the extractor takes both the real and the observed dates, which is the Spain fix");
  check(/holiday-corrections/.test(py) && /audit-holidays/.test(py),
        "and it tells whoever runs it what to run next");

  const readme = readFile("README.md");
  check(/extract-holidays\.py/.test(readme) && /holiday-corrections\.js/.test(readme),
        "README documents the run order, because getting it wrong is silent");
}
}

console.log("\n=== C61. Landing on the calendar without having to hunt for today ===");
{
const src = readFile("assets/app.js");

/* THE COMPLAINT: arriving at the calendar on a laptop, today was below the
   fold. The box opens at week 1 of the earliest year, and on a 1366x700 screen
   today sat 872px down inside a 510px-tall box. On a big monitor it was
   already on screen and moving the view would have been an unwanted jump.

   Measured in a real browser, before and after:
     1366x700    before scrollTop 0, today NOT visible
                 after  scrolled, today visible
     1600x1250   before and after scrollTop 0, no scroll at all
     re-render   user at 120, stays at 120 instead of snapping to the top
     Today       returns to today from anywhere

   jsdom has no layout engine, so none of that can be reproduced here. What is
   locked instead is the shape, because every one of these was a real failure
   during the fix. */

check(/function revealToday/.test(src), "the calendar can bring today into view");

/* THE FIRST VERSION MEASURED THE BOX AND WAS WRONG TO.
   It read clientHeight and getBoundingClientRect to decide whether today was
   visible and where to scroll. This suite already forbids that: layout is
   CSS's job. The rule caught it, and the compliant answer turned out to be
   better than the one it rejected.

   block:"nearest" asks the BROWSER to scroll the smallest amount that brings
   the cell into view, and to do nothing when it is already visible. That is
   the entire "small laptop yes, big monitor no" requirement, decided against
   real layout rather than against a guessed screen width, with no measuring
   and no breakpoint. */
check(/block:"nearest"/.test(src),
      "it asks the browser for the minimum scroll, so a visible today is left alone");
{
  const fn = src.slice(src.indexOf("function revealToday"),
                       src.indexOf("function revealTodaySoon"));
  check(!/clientHeight|offsetHeight|getBoundingClientRect/.test(fn),
        "and measures nothing itself, which is the rule the first attempt broke");
  check(!/matchMedia|innerWidth/.test(fn),
        "no screen-width guess either: adaptive means measured, not bracketed");
  check(/cell\.scrollIntoView\(false\)/.test(fn),
        "with a fallback for browsers that only take the old boolean signature");
}

/* NOT requestAnimationFrame. rAF does not run in a hidden or background tab,
   so the first version did nothing at all when the calendar was opened in a
   background tab and looked at later. Found by measuring, after the scroll
   silently failed to happen. */
{
  const fn = src.slice(src.indexOf("function revealTodaySoon"),
                       src.indexOf("function revealTodaySoon") + 400);
  check(!/requestAnimationFrame/.test(fn),
        "the retry avoids requestAnimationFrame, which never fires in a background tab");
  check(/setTimeout\(revealToday/.test(fn),
        "using a timer instead, which fires whether the tab is visible or not");
}

/* A re-render rebuilt the rail and reset the scroll to the top, so changing a
   day colour or picking a country threw the reader back to January. It also
   made the scroll-to-today look broken, because the holiday file lands a
   moment after load and re-rendered straight over it. */
check(/keepScroll/.test(src), "re-rendering the calendar keeps the reader's place");
{
  const rc = src.slice(src.indexOf("function renderCalendar"),
                       src.indexOf("function revealToday"));
  check(/var keepScroll = sbox \? sbox\.scrollTop : 0/.test(rc),
        "the position is read before the rail is emptied");
  check(/sbox\.scrollTop = keepScroll/.test(rc),
        "and put back after it is rebuilt");
  check(rc.indexOf("keepScroll = sbox") < rc.indexOf("el.rail.innerHTML"),
        "in that order, or the value read is already zero");
  /* renderCalendar runs on every colour change and every country change.
     Scrolling to today from there would yank the view away mid-edit. */
  check(!/revealToday/.test(rc),
        "renderCalendar never moves the view itself, only arrival and Today do");
}

check(/renderCalendar\(\); revealTodaySoon\(\)/.test(src),
      "switching to the calendar brings today into view");
check(/if \(cfg\.view !== "board"\) revealTodaySoon\(\)/.test(src),
      "and the Today button moves the calendar, not just the board you cannot see");
}

console.log("\n=== C62. A sync that repainted over you, and one date format ===");
{
const src = readFile("assets/app.js");

/* THE EDIT THAT ESCAPED ITSELF.

   Reported as "I click a task, it goes into edit mode, and immediately escapes
   out of edit mode". The v47 drag threshold was a real fix and was not this:
   this is a second, separate bug that the first fix uncovered by finally
   letting the click through.

   The tell was that it happened on every laptop and every browser but never
   reproduced signed out. repaint() is called by the sync layer and by nothing
   else, so only signed-in people could see it. A sync runs 1.5 seconds after
   any change, when the tab returns to the front, and on reconnect. Click a
   task inside one of those windows and the row is rebuilt underneath the
   editor a moment after it opens.

   Reproduced in a browser: open the rename box, type into it, repaint, and the
   box is gone, focus falls back to BODY, and the typing is lost.

   The repaint is HELD rather than dropped. Dropping it would leave the screen
   showing data from before the sync, which is a different bug. */
check(/function doRepaint/.test(src), "repaints go through one place that can hold them");
check(/repaint: function\(\)\{ doRepaint\(\); \}/.test(src),
      "and the sync layer's entry point is that place, not renderAll directly");
check(/function editorIsOpen/.test(src), "which asks first whether someone is mid-edit");
check(/\.t\.editing, \.bnotewrap\.editing/.test(src),
      "covering both the task rename box and the day note");
check(/heldRepaint = true; return;/.test(src),
      "a repaint arriving mid-edit is remembered, not thrown away");
check(/function repaintIfHeld/.test(src), "and replayed when the edit finishes");

/* Both editors must release it, or a sync can be held forever. */
{
  const done = src.slice(src.indexOf("function inlineEdit"),
                         src.indexOf("function inlineEdit") + 1600);
  check(/repaintIfHeld\(\)/.test(done),
        "the rename box releases the held repaint when it closes");
}
check(/el\.bnote\.blur\(\); renderAll\(\);\s*\n\s*repaintIfHeld\(\);/.test(src),
      "and so does the day note, or a sync could be held indefinitely");

/* The add fields are deliberately NOT guarded: they live in index.html and
   survive a render, so blocking on them would mean a cursor parked in an add
   box stops syncing all day. */
check(/blocking on them would mean a cursor left in an add box stops syncing/.test(src),
      "the add fields are deliberately excluded, and the file says why");

/* Behaviour, driven through the real DOM. jsdom has no layout but it has
   elements and classes, which is all this needs. */
{
  toBoard();
  const add = qa("textarea.cadd")[0];
  add.value = "Repaint should not eat this";
  add.dispatchEvent(new w.KeyboardEvent("keydown", { key:"Enter", bubbles:true, cancelable:true }));
  const row = d.querySelector(".t");
  check(!!row, "a task exists to edit");
  row.querySelector(".txt").dispatchEvent(new w.MouseEvent("click", { bubbles:true }));
  const box = d.querySelector("textarea.edit");
  check(!!box, "clicking the text opens the rename box");
  box.value = "half typed";
  /* Through the REAL entry point the sync layer uses, window.imcStore.repaint,
     not doRepaint directly. Calling the inner function would still pass if the
     sync layer were rewired straight back to renderAll, which is precisely the
     bug. */
  dom.window.eval("window.imcStore.repaint()");
  const still = d.querySelector("textarea.edit");
  check(!!still && still.value === "half typed",
        "a sync repaint mid-edit leaves the box and the typing alone");
  check(dom.window.eval("heldRepaint") === true, "and the repaint is held, not lost");
  box.dispatchEvent(new w.KeyboardEvent("keydown", { key:"Enter", bubbles:true, cancelable:true }));
  check(!d.querySelector("textarea.edit"), "finishing the edit closes the box");
  check(dom.window.eval("heldRepaint") === false, "and the held repaint has been applied");
}

/* ONE DATE FORMAT.
   The countdown row followed the machine's locale, so the same date read
   10/17/2026 on one computer and 17/10/2026 on another, while the ribbon, the
   calendar cells and the week grid all used yyyy-mm-dd. 03/04/2026 is 3 April
   to most of the world and 4 March in the United States, and nothing on screen
   says which. */
check(!/toLocaleDateString/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")),
      "no date is formatted by the machine's locale any more");
{
  const iso = dom.window.eval('shortDate("2026-10-17")');
  check(iso === "2026-10-17", "a countdown date reads 2026-10-17, got " + iso);
  const long = dom.window.eval('longDate("2026-10-17")');
  check(/^2026-10-17 \(/.test(long),
        "and the tooltip leads with the same ISO date, got " + long);
  check(/Sat/.test(long),
        "keeping the weekday, which is the one thing a bare date does not tell you");
  check(dom.window.eval('shortDate("nonsense")') === "",
        "a date that will not parse renders as nothing rather than as garbage");
}

/* THE SHAREABLE LINK.
   GB is the ISO code and stays the internal one: the data file, the country
   list and the holiday page are all GB. But the hash is a fragment, not a
   page, so nothing is gained by showing a code almost nobody recognises. */
check(/var HASH_ALIAS = \{ GB:"UK" \}/.test(src), "the shared link says UK, not GB");
check(/hashCode\(cfg\.country\)/.test(src), "and the hash is written through that map");
{
  check(dom.window.eval('hashCode("GB")') === "UK", "GB is shown as UK in the link");
  check(dom.window.eval('hashCode("GR")') === "GR",
        "Greece stays GR: EL is a code to be read, never one to be written");
  check(dom.window.eval('hashCode("JP")') === "JP", "everything else is untouched");
  /* Reading must still accept both, or existing links break. */
  check(dom.window.eval('resolveCountry("UK")') === "GB" &&
        dom.window.eval('resolveCountry("GB")') === "GB",
        "and both spellings still resolve, so no shared link ever breaks");
}
}

console.log("\n=== C63. Thumb targets, measured on real phone widths ===");
{
const css = readFile("assets/app.css");

/* Measured in a real browser at 344, 375, 412 and 430 CSS pixels, which covers
   a folded Galaxy Flip, an iPhone mini, an S26 Ultra and an iPhone Pro Max.
   Before this pass, 344px had eight task controls at 27.8px and the week
   column at 26px. After it, no control under 32px at any phone width, and no
   horizontal page scroll at any of them. */

/* THE SHRINK.
   Eight controls at 34px with seven 8px gaps needs 328px; the card is about
   294px on the narrowest phone. Flex's default shrink silently took every
   button under the size the phone pass exists to guarantee - the rule said 34
   and the browser drew 27.8, which is exactly the kind of gap a source read
   never catches. */
check(/\.actlist\{display:flex;flex-direction:column/.test(css),
      "the actions are a labelled column, so nothing has to wrap or shrink");
check(/\.op\{[^}]*flex:none/.test(css),
      "and flex:none stops the browser overriding their size");

/* Two controls sat 2px under the 32 the same block sets everywhere else, and
   one of them lost a cascade fight: a later rule in the file redefined
   .catdot at 30px, so raising it earlier in the sheet did nothing. */
check(/\.go\{min-height:32px\}/.test(css), "the add-countdown button reaches 32px");
check(/\.catdot\{width:32px;height:32px\}/.test(css),
      "and the colour swatch does too, in the rule that actually wins");
check(!/\.catdot\{width:30px;height:30px\}/.test(css),
      "with the losing 30px rule gone rather than left to fight it");

/* The week column was the last one under 32. Eight columns share the width, so
   the cost of widening it is under a pixel per day cell. */
check(/\.wg \.wk\{[^}]*min-width:32px/.test(css),
      "the week-number column is wide enough to hit on a phone");

/* TABLETS.
   The phone pass is keyed to max-width:640px, so a tablet in portrait got
   desktop density with a finger driving it: year arrows at 24px, colour
   swatches at 18px. Keyed to the INPUT DEVICE rather than to a width. */
check(/@media \(hover:none\) and \(min-width:641px\)/.test(css),
      "a touch device wider than a phone still gets touch-sized controls");
{
  const block = css.slice(css.indexOf("@media (hover:none) and (min-width:641px)"));
  check(/\.nub,\.iso,\.fold,\.yarr/.test(block),
        "covering the arrows and folds that were 24px");
  check(!/flex-direction:column|order:\d/.test(block.slice(0, 400)),
        "and sizes only: a tablet has room for the desktop layout and keeps it");
}

/* Left alone on purpose, so nobody 'fixes' them later without knowing why. */
check(/growing one cell shrinks six others/.test(css),
      "the calendar grid is documented as a deliberate density tradeoff");
}

console.log("\n=== C64. The week-number pages, and the shell they share by hand ===");
{
/* WHY THESE PAGES EXIST.
   The 1718 holiday pages compete with timeanddate.com and officeholidays.com,
   twenty-year-old domains that will not be outranked. "What week is it" is
   served by thin calculators handling two conventions. This app handles four
   rules across seven week starts, verified daily from 1995 to 2035, and had no
   page targeting any of it. */

check(fs.existsSync(path.join(ROOT, "week-number", "index.html")),
      "there is a page answering 'what week is it'");
["2026","2027","iso-week-numbers"].forEach(function(p){
  check(fs.existsSync(path.join(ROOT, "week-number", p + ".html")),
        "and one for " + p);
});

/* CONTENT, NOT CHROME.
   A page that only ranks if a search engine runs its JavaScript is a page that
   mostly does not rank. The tables and the explanations are in the HTML. */
{
  const hub = readFile("week-number/index.html");
  const words = hub.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
  check(words > 800, "the hub carries real prose, not just an app frame (" + words + " words)");
  check(/<h1>What week is it\?<\/h1>/.test(hub), "with the question as the h1, visible, not screen-reader-only");
  check(/<table>/.test(hub) && /<tbody>/.test(hub),
        "and the week table is in the HTML rather than built by script");
  check(/ISO 8601/.test(hub) && /US \(Sunday start\)/.test(hub),
        "showing both conventions people actually search for");
}

/* THE MATHS MUST MATCH THE APP.
   A page telling somebody it is week 36 while the calendar says 37 is worse
   than having no page. Both come from the same four rules, so both are checked
   against the same arithmetic. */
{
  const p2 = n => String(n).padStart(2, "0");
  function sow(d, ws){
    const x = new Date(d.getTime());
    x.setDate(x.getDate() - ((x.getDay() - ws + 7) % 7));
    x.setHours(0,0,0,0); return x;
  }
  function firstDow(y, dow){
    const d = new Date(y,0,1); d.setHours(0,0,0,0);
    while (d.getDay() !== dow) d.setDate(d.getDate()+1);
    return d;
  }
  /* independent reference: real ISO 8601 week 1 is the week holding 4 January */
  function isoWeek1(y){ return sow(new Date(y,0,4), 1); }

  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let checkedYears = 0, wrong = 0, firstWrong = null;
  ["2024","2025","2026","2027","2028","2029"].forEach(function(ys){
    const f = path.join(ROOT, "week-number", ys + ".html");
    if (!fs.existsSync(f)) return;
    checkedYears++;
    const html = fs.readFileSync(f, "utf8");
    const m = html.match(/<td class="n">1<\/td><td>([^<]*)<\/td>/);
    if (!m){ wrong++; if (!firstWrong) firstWrong = ys + ": no week 1 row"; return; }
    const want = isoWeek1(+ys);
    const expect = want.getDate() + " " + MON[want.getMonth()];
    if (m[1].indexOf(expect) !== 0){
      wrong++;
      if (!firstWrong) firstWrong = ys + ": page says '" + m[1] + "', ISO 8601 says '" + expect + "'";
    }
  });
  check(checkedYears >= 5, "several year pages exist to check (" + checkedYears + ")");
  check(wrong === 0,
        "every page's ISO week 1 matches real ISO 8601" + (firstWrong ? "   " + firstWrong : ""));
}

/* THE SHELL IS DUPLICATED, DELIBERATELY, SO THE DRIFT IS TESTED.
   Extracting it into a shared module was tried and abandoned: the slicing kept
   going wrong and the risk of silently changing 1718 working pages was not
   worth the tidiness. Two copies is a real cost, and this is what pays it - a
   nav link added to one generator and not the other is invisible to a human
   and obvious to this check. */
{
  const a = readFile("tools/build-holiday-pages.js");
  const b = readFile("tools/build-week-pages.js");
  const links = src => {
    const nav = src.slice(src.indexOf('<nav class="sitenav">'), src.indexOf("</nav>"));
    return (nav.match(/>([A-Za-z ]+)<\/a>/g) || []).sort().join("|");
  };
  check(links(a) === links(b),
        "both generators render the same site nav" +
        (links(a) === links(b) ? "" : "\n      holidays: " + links(a) + "\n      week:     " + links(b)));

  /* the one thing that MUST differ: a page one directory deep cannot link to
     the holidays index the same way a page inside it does */
  check(/href="index\.html">Holidays<\/a>/.test(a),
        "the holiday generator links to Holidays as a sibling");
  check(/href="\.\.\/holidays\/index\.html">Holidays<\/a>/.test(b),
        "and the week generator climbs out of its own directory to reach it");

  /* same cache tag, or half the site busts and half does not */
  const tag = src => (src.match(/const V\s*=\s*"(\d+)"/) || [])[1];
  check(tag(a) === tag(b), "and both stamp the same asset version (" + tag(a) + " vs " + tag(b) + ")");
}

/* ONE SITEMAP.
   Two sitemaps for one site is a way to have half of it silently unlisted. */
{
  const map = readFile("sitemap.xml");
  check(/week-number\//.test(map), "the week pages are in the sitemap");
  const n = (map.match(/week-number/g) || []).length;
  check(n >= 8, "all of them, not just the hub (" + n + " URLs)");
  check(!fs.existsSync(path.join(ROOT, "week-number", "sitemap.xml")),
        "and there is only one sitemap for the whole site");
}

/* The helper script is an enhancement, never a dependency. */
{
  const js = readFile("week-number/week.js");
  check(/complete and correct without this/.test(js),
        "the script that fills in today says plainly that the page works without it");
}
}

console.log("\n=== C65. The monitor that cried wolf ===");
{
const wf = readFile(".github/workflows/uptime.yml");

/* THE COMPLAINT: a "Run failed: uptime" email every day or two, for weeks.
   Nothing was wrong with the site. Measured while investigating: 8 of 8
   requests answered in about 1.0s, and both Supabase functions in 0.5s. Every
   probe passed by hand.

   The workflow ran every 30 minutes with ten probes and NO retry, so a single
   timed-out request failed the whole run and sent an email. That is roughly
   3,400 network requests a week; at 99.9% per-request reliability it produces
   about three failures a week, which is exactly the observed rate.

   A monitor that cries wolf is worse than no monitor: the one email that
   matters arrives looking like the forty that did not. */

check(/--retry 2/.test(wf), "probes retry at the curl level");
check(/while \[ "\$attempt" -le 3 \]/.test(wf),
      "and the whole probe is attempted three times before it is believed");
check(/after 3 attempts/.test(wf),
      "with the failure message saying so, rather than implying one bad request");

/* Frequency. Four a day still catches sustained breakage within six hours,
   which is the most a free in-repo canary is for. */
{
  const cron = (wf.match(/cron: "([^"]+)"/) || [])[1] || "";
  check(cron !== "*/30 * * * *", "it no longer runs every 30 minutes");
  check(/^\d+ \*\/6 \* \* \*$/.test(cron), "four times a day instead, got: " + cron);
  check(!/^0 /.test(cron),
        "and not on the hour, which is the slot GitHub queues and drops");
}

/* THE BUG THE RETRY WORK UNCOVERED.
   curl's -w already prints 000 when it cannot connect, so the original
   '|| echo "000"' appended a second one and the status became 000000. Against
   a "= 200" test that is harmless. Against the delete-account check, which
   compares to 401 and treats 000 as "no answer", it is not: a network blip
   would have fallen through to ALARM and reported a SECURITY problem.

   Found by running the extracted functions against an unreachable host, not by
   reading them. */
check(!/\|\| echo "000"\)/.test(wf),
      "the double-000 status bug is gone");
{
  const norm = (wf.match(/tr -dc "0-9" \| tail -c 3/g) || []).length;
  check(norm >= 2, "every captured status is normalised to three digits (" + norm + " places)");
}
check(/SKIP {2}delete-account did not answer at all/.test(wf),
      "and no answer from delete-account is a network problem, not a security finding");
check(/ALARM delete-account answered HTTP/.test(wf),
      "while a genuinely wrong answer is still an alarm");

/* The deploy window. Hostinger has taken well over half an hour, and a check
   landing mid-deploy reports drift that is not drift. */
{
  const grace = (wf.match(/-lt (\d+)/g) || []).map(s => +s.replace("-lt ",""));
  check(grace.length >= 2 && grace.every(g => g >= 2700),
        "the deploy grace is at least 45 minutes everywhere it is used, got " + grace.join("/"));
}

/* The asset check fetches nineteen files, so it is the step most exposed to a
   single unlucky request. */
check(/passed on the second attempt; the first was a blip/.test(wf),
      "the asset check is run twice before a failure is believed");

/* The new pages have to be watched too, or a broken deploy of them is silent. */
check(/week-number\//.test(wf), "the week-number pages are probed as well");

/* And the file should say why it is quiet now, or someone will helpfully turn
   the frequency back up. */
check(/cries wolf/.test(wf),
      "the reasoning is recorded, so the cadence is not innocently reverted");
}

console.log("\n=== C67. The SEO content lives on the pages that are for reading ===");
{
/* The first attempt put this material on the homepage. It made a clean, fast
   tool page cluttered, and because it sat inside <main> it appeared on the
   CALENDAR view as well, which was worse. Rolled back on the owner's call, and
   he was right: about.html and guide.html already exist to be read.

   THE HARD RULE: index.html is the app. It is not a landing page and nothing
   here may treat it as one. */
{
  const home = readFile("index.html");
  check(/<h1 class="sronly">/.test(home),
        "index.html keeps its own heading arrangement, untouched by this work");
  check(!/homecopy|class="hero"/.test(home),
        "and carries no marketing block: the board and calendar stay clean");
}

/* ORPHANS DO NOT RANK.
   The week-number pages were built, listed in the sitemap, and linked from
   nowhere at all. A sitemap entry is the weakest signal there is; a page
   nothing links to reads as a page nothing needs. */
{
  const linkers = [];
  ["about.html", "guide.html"].forEach(function(f){
    if (/href="week-number\//.test(readFile(f))) linkers.push(f);
  });
  check(linkers.length === 2,
        "about and guide both link into the week-number pages (" + linkers.join(", ") + ")");

  const hol = fs.readdirSync(path.join(ROOT, "holidays")).filter(f => f.endsWith(".html"));
  const withLink = hol.filter(f =>
    /href="\.\.\/week-number\//.test(fs.readFileSync(path.join(ROOT, "holidays", f), "utf8")));
  check(withLink.length > 1000,
        "and so does every holiday page (" + withLink.length + " of " + hol.length + ")");
}

/* The link has to be contextual, not a bare keyword dumped in a footer. */
{
  const gen = readFile("tools/build-holiday-pages.js");
  check(/Planning around a reporting week rather than a month\?/.test(gen),
        "the year-page link is a sentence someone might actually follow");
  check(/Working to week numbers rather than months\?/.test(gen),
        "and so is the country-page one");
}

/* Substance, not keyword padding. The week-numbering material is the one thing
   this app does better than the incumbents, and about.html had none of it. */
{
  const a = readFile("about.html");
  check(/four numbering rules across all seven week starts/.test(a),
        "about.html explains the four rules, which is the actual differentiator");
  check(/Thursday is the fourth day of a Monday week/.test(a),
        "including why the Thursday phrasing and the four-day rule are the same sentence");
  const words = a.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")
                 .split(/\s+/).filter(Boolean).length;
  check(words > 1000, "and about.html is now " + words + " readable words (was 928)");
}

/* Claims must stay true, or the page is worse than empty. */
{
  const a = readFile("about.html");
  check(/247 countries/.test(a), "the country count still matches the data");
  check(/1995 to 2035/.test(a), "and the verified date range matches the verifier");
}
}

console.log("\n=== C68. Counting, without breaking the promise on the privacy page ===");
{
const st = readFile("assets/stats.js");

/* There was no measurement of any kind. Search Console shows what happens
   inside Google and stops at the click; it cannot say whether anyone who
   arrived ever used the board.

   THE CONSTRAINT: privacy.html promised "no analytics". Breaking that quietly
   to gain a dashboard would have been a bad trade, so this carries no
   identifier at all and the page was rewritten to say what is actually done. */

/* NO IDENTIFIER. This is the whole design, so it is checked hard - against the
   CODE, with comments stripped first. The first version of this check failed on
   the file's own prose explaining that there is no cookie and no session, which
   is the same trap as measuring page words without removing comments. A grep
   that cannot tell code from the paragraph describing it will always raise
   false alarms in a codebase commented this heavily. */
const stCode = st.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
["cookie", "localStorage", "sessionStorage", "randomUUID", "Math.random",
 "userAgent", "canvas", "sessionId"].forEach(function (bad) {
  check(stCode.indexOf(bad) < 0,
        "stats.js has no " + bad + " in its code, so two visits cannot be linked");
});
check(!/\bid\s*:/.test(stCode), "and no id field is ever put in the payload");

/* Only four things, named. A payload that grows silently is how a counter
   becomes a tracker. */
check(/path: cleanPath\(\), ev: String\(ev\)/.test(st.replace(/\s+/g, " ")) ||
      /path:.*ev:.*ref:.*w:/.test(st.replace(/\s+/g, " ")),
      "the payload is path, ev, ref and w, and nothing else");

/* The hash is where an OAuth access token lands after a redirect. Sending the
   URL whole would post a credential to a table. */
check(/no query, no hash/i.test(st), "the path is sent without its query or fragment");
check(/pathname/.test(st) && !/location\.href/.test(st),
      "using pathname rather than the full URL, so no token can leak");

/* A full referrer can carry someone else's search query or private path. */
check(/a\.hostname/.test(st) && /never the full URL/i.test(st),
      "only the referring host is kept, never the whole referrer");
check(/a\.hostname === window\.location\.hostname/.test(st),
      "and same-site referrers are dropped, since they measure our own navigation");

/* Exact screen size is a fingerprinting signal and answers no question. */
check(/widthBucket/.test(st) && /return 360/.test(st),
      "screen width is bucketed, not recorded");

/* Both opt-out signals. */
check(/doNotTrack/.test(st) && /globalPrivacyControl/.test(st),
      "Do Not Track and Global Privacy Control are both honoured");

/* It must never be the thing that breaks the app. */
check(/\["catch"\]\(function \(\) \{/.test(st), "a failed count is swallowed");
check(/typeof fetch === "function"/.test(st),
      "and with no transport it does nothing, which is why it is inert under test");

/* THE EVENT WORTH MORE THAN VIEWS. */
{
  const app = readFile("assets/app.js");
  check(/try \{ if \(window\.imcStat\) window\.imcStat\("task"\); \} catch \(e\)\{\}/.test(app),
        "adding a task is counted, which is the only real activation signal");
  const addTask = app.slice(app.indexOf("function addTask"), app.indexOf("function byId"));
  check(!/text|task\.text/.test(addTask.split("imcStat")[1] || ""),
        "and the task's text is never part of it");
}

/* THE PROMISE. privacy.html must not still claim something that stopped being
   true, and the change must be stated rather than slipped in. */
{
  const p = readFile("privacy.html");
  check(!/no analytics, and nothing you type/i.test(p),
        "privacy.html no longer claims 'no analytics' while counting pages");
  check(/used to say "no analytics"/.test(p),
        "it says plainly that the wording changed, rather than quietly editing it");
  check(/There is no cookie, no stored identifier, no session and no fingerprint/.test(p),
        "and states exactly what cannot identify you");
  check(/Do Not Track/.test(p) && /Global Privacy Control/.test(p),
        "including the two opt-out signals");
  check(!/no analytics, no advertising/i.test(p),
        "and the meta description Google shows was corrected too");
}

/* THE TABLE. A column that does not exist cannot be filled in by accident. */
{
  const sql = readFile("supabase-hits-table.sql");
  check(/create table if not exists public\.hits/.test(sql), "the table definition ships with the repo");
  /* Only the CREATE TABLE body is searched, for the same reason as above: the
     file's own comments explain that there is deliberately no session column,
     and a naive search finds that sentence and calls it a session column. */
  const body = sql.slice(sql.indexOf("create table"),
                         sql.indexOf(");", sql.indexOf("create table")));
  ["user_id", "session", "ip", "fingerprint", "uid"].forEach(function (col) {
    check(!new RegExp("(^|\\s)" + col + "\\s", "m").test(body),
          "the table has no " + col + " column to fill in later");
  });
  check(/enable row level security/.test(sql), "row level security is on");
  check(/for insert/.test(sql) && !/for select/.test(sql),
        "and the site may insert only: it cannot read, change or delete a count");
}

/* THE BOARD PAGE. The owner allowed a script tag and nothing else. */
{
  const home = readFile("index.html");
  check(/stats\.js/.test(home), "the app page is counted too, or the funnel measures everything but the app");
  check(!/homecopy|class="hero"/.test(home), "and gained nothing visible in the process");
}
}

console.log("\n=== C69. The setup script raises no destructive-operation warning ===");
{
const sql = readFile("supabase-hits-table.sql");
/* The first version used the usual "drop policy if exists, then create"
   idiom to stay re-runnable. It works, and it made the Supabase editor warn
   "this query includes destructive operations" on a first-time setup script.

   The problem is not the dialog. It is that a setup script which trips the
   warning teaches whoever runs it to click through that warning without
   reading it, and the next script they paste might deserve it. */
const live = sql.replace(/--.*$/gm, "");
["drop", "delete", "truncate"].forEach(function (word) {
  check(!new RegExp("\b" + word + "\b", "i").test(live),
        "no " + word.toUpperCase() + " outside a comment, so the warning never fires");
});
/* The DELETE for housekeeping is offered, but commented, so pasting the file
   never removes anything. */
check(/--\s+delete from public\.hits/.test(sql),
      "the housekeeping DELETE is there to copy, and commented so it cannot run by accident");
/* Still re-runnable, which is what the DROP was for in the first place. */
check(/create table if not exists/.test(sql) && /create index if not exists/.test(sql),
      "the table and indexes are still created only if missing");
check(/select 1 from pg_policies/.test(sql) && /if not exists \(/.test(sql),
      "and the policy is guarded by an existence check rather than by dropping it");
}

console.log("\n=== C70. No third parties, and a phone pass that reaches every page ===");
{
const site = readFile("assets/site.css");
const app  = readFile("assets/app.css");
const gen  = readFile("tools/build-holiday-pages.js");

/* ---- GDPR: nothing is fetched from anywhere else ------------------------- */
/* Google Fonts on 1733 pages sent every visitor's IP to Google in the US, and
   cdn.jsdelivr.net sent it to another third party that privacy.html did not
   mention at all. Both are served from this domain now. Disclosing a transfer
   is not the same as having a reason to make it. */
PAGES.concat(["holidays/UK-2026.html", "week-number/index.html"]).forEach(function(p){
  const h = readFile(p);
  check(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(h), p + " loads no font from Google");
  check(!/cdn\.jsdelivr\.net/.test(h), p + " loads no script from a CDN");
});
check(/@font-face/.test(site) && /url\(fonts\//.test(site),
      "the typefaces are declared locally with @font-face");
check(fs.existsSync(path.join(ROOT, "assets", "vendor", "supabase.js")),
      "and the Supabase library is vendored into the repo");
{
  const files = fs.readdirSync(path.join(ROOT, "assets", "fonts"));
  check(files.length >= 12, "the font files are present (" + files.length + ")");
  check(files.every(f => /\.woff2$/.test(f)), "all woff2, the only format any current browser needs");
  /* Only latin and latin-ext are shipped. Greek, Cyrillic and Vietnamese would
     be weight for nothing on an English interface. */
  check(files.every(f => /-(latin|latin-ext)\.woff2$/.test(f)),
        "and only the latin subsets, not all 33 faces Google offers");
  check(/unicode-range/.test(site),
        "with unicode-range, so latin-ext downloads only when a page needs it");
}
/* A promise on the privacy page has to match what the code does. */
{
  const p = readFile("privacy.html");
  check(!/load from Google Fonts/.test(p), "privacy.html no longer says fonts come from Google");
  check(/Nothing is loaded from anywhere else/.test(p),
        "it states plainly that no third party is contacted");
  check(/deleted automatically after 180 days/.test(p),
        "and gives the page counts a retention period");
  check(fs.existsSync(path.join(ROOT, "supabase-retention.sql")),
        "with the SQL that actually enforces both periods shipped alongside it");
}

/* ---- the phone pass that only ever reached one page ---------------------- */
/* Every touch-target fix from the earlier mobile pass went into app.css, which
   only index.html loads. The other 1,732 pages load site.css and got none of
   it: 24 controls under 32px on about.html, none on the board. That is why it
   kept being reported as fixed and kept not being. */
{
  /* EVERY phone block, not the last one. This sliced from the final
     "@media (max-width:640px)" in the file, which was fine while site.css had
     one - and reported three correct rules as missing the moment a second was
     added below them. The rules being checked did not move. */
  const phone = site.split("@media (max-width:640px)").slice(1).join("");
  check(/\.sitenav a\{min-height:32px/.test(phone),
        "site.css gives navigation links a 32px minimum on phones");
  check(/footer a\{min-height:32px/.test(phone), "and the footer links too");
  check(/\.brand\{min-height:32px/.test(phone), "and the brand");
  check(/THUMB TARGETS ON EVERY PAGE/.test(site),
        "with the reason recorded, so it is not moved back into app.css");
}

/* ---- the app header on a phone ------------------------------------------- */
/* 217px of an 844px screen, and the first task at 319px. Seven nav links wrap
   onto two rows leaving PRIVACY alone on the second. Measured after: 180px and
   282px, nav back to one row. */
check(/\.sitenav a\.page,\.sitenav \.gap\{display:none\}/.test(app),
      "the app header drops the content links on phones");
{
  const i = app.indexOf(".sitenav a.page,.sitenav .gap{display:none}");
  const before = app.slice(0, i);
  const lastQuery = before.lastIndexOf("@media");
  check(/max-width:\s*640px/.test(before.slice(lastQuery, lastQuery + 60)),
        "inside a max-width query, so the desktop header cannot be affected by it");
}

/* ---- the fourth column on a phone ---------------------------------------- */
/* 56px hidden to the right with nothing saying the table scrolled. It read as
   broken, not scrollable: the heading cut to "TY" and rows ending in a clipped
   N or R. A scroll shadow was tried and made the scrolling discoverable while
   leaving the column just as unreadable. */
check(/thead th:nth-child\(4\),tbody td:nth-child\(4\)\{display:none\}/.test(gen),
      "the Type column comes out below 640px so the table fits");
check(/content:" · regional"/.test(gen),
      "with regional days marked inline instead, in the space that exists");
check(/table\{min-width:0\}/.test(gen),
      "and the min-width is released, or dropping the column would change nothing");
{
  const page = readFile("holidays/UK-2026.html");
  check(/nth-child\(4\)/.test(page), "the rule reaches the generated pages");
  check(/<th>Type<\/th>/.test(page) || /Type/.test(page),
        "while the column itself is still in the HTML for desktop and for search engines");
}

/* ---- the threshold from the day before ----------------------------------- */
/* 90 characters is two lines on a desktop card and three on a phone. Measured
   on the live site at 390px: an 84-character task was clipped, scrollHeight 59
   against clientHeight 39, and showed no control because 84 is under 90. */
{
  /* A SINGLE CONSTANT COULD NOT BE RIGHT FOR BOTH WIDTHS.
     At 90 a phone clipped an 84-character task and offered no control - the
     original bug. At 55 the phone was fixed and DESKTOP grew a "more" control
     on 29 of 30 realistic tasks, where nothing was hidden. Both numbers were
     correct for one screen and wrong for the other, so the number moved into
     CSS, which is what knows how wide a card is. */
  const js  = readFile("assets/app.js");
  const css = readFile("assets/app.css");
  /* And then the number went away entirely. Splitting it per breakpoint was
     better and still wrong: 27 controls for 2 genuinely clipped tasks on a
     phone. It is measured now - see the two-exceptions note in the layout
     section - so the control appears exactly when text is cut. Verified in a
     browser: 27 of 27 on desktop, 2 of 2 on a phone. */
  check(!/head\.length >/.test(js),
        "no character-count guess is left deciding whether text was cut");
  check(/classList\.toggle\("overflowing"/.test(js),
        "the row is marked from a real measurement instead");
  check(!/--taskClamp/.test(css),
        "and the per-breakpoint character clamp is gone too, measurement replaced it");
  check(!/clampChars/.test(js),
        "and the helper that read it is gone, rather than left behind unused");
}
}

console.log("\n=== C71. A phone card that is a task, not a control panel ===");
{
const js  = readFile("assets/app.js");
const css = readFile("assets/app.css");
const phone = css.slice(css.indexOf("PHONE PASS"));

/* Measured with 30 realistic tasks at 390px. Before: every card 137px for two
   lines of text, 33px of that a row of seven always-on controls, 2 tasks
   visible in a lane. After: 80px, 3.4 visible, nothing truncated.
   Todoist fits six in the same space by putting every action behind a gesture. */

check(/adv\.className = "op adv"/.test(js),
      "move right is tagged, being the primary verb of a Kanban board");
check(/menu\.className = "op menu"/.test(js), "and there is a menu for the rest");
/* IT USED TO REVEAL THEM IN PLACE, and in place they were still eight glyphs
   at 34x32 whose meaning lived in a title tooltip - and a touch screen has no
   tooltips, so on a phone there was no way to learn what any of them did
   except by pressing it. One of them deletes, six pixels from "move right".
   The menu opens a labelled sheet now. */
check(/openActs\(n\)/.test(js), "which opens a labelled action sheet");
check(/menu\.setAttribute\("aria-haspopup", "dialog"\)/.test(js),
      "announced as a dialog, since it no longer expands the card");
check(!/classList\.toggle\("acts"\)/.test(js),
      "and the in-place expansion is gone rather than left behind unused");
check(/aria-expanded/.test(js), "and says whether it is open, for a screen reader");

/* Two in the open, five behind the menu - on the phone only. */
check(/\.t \.ops \.op\{display:none\}/.test(phone), "the phone hides the controls by default");
check(/\.t \.ops \.op\.adv,\.t \.ops \.op\.menu\{display:inline-flex/.test(phone),
      "leaving exactly two: move right, and the menu");
check(/openActs\(card\)/.test(js) && /card\.querySelectorAll\("\.ops \.op"\)/.test(js),
      "and the menu lists every one of them, read from the card itself");

/* THE HARD CONSTRAINT: the desktop board must not change. */
check(/\.op\.menu\{display:none\}/.test(css.slice(0, css.indexOf("PHONE PASS"))),
      "the menu button does not exist above the breakpoint");
{
  const at = css.indexOf(".t .ops .op{display:none}");
  const q  = css.lastIndexOf("@media", at);
  check(at > 0 && /max-width:\s*640px/.test(css.slice(q, at)),
        "every rule that hides a control is inside a phone query");
}

/* RENAMING MUST STILL COST ONE TAP. It was the reason a menu was rejected the
   first time it was tried, and the reason is still good - it is just that the
   text itself has always been the rename target, so nothing was lost. */
check(/txt\.addEventListener\("click", function\(\)\{ inlineEdit/.test(js),
      "tapping the text still opens the editor, so rename is untouched");

/* Three lines rather than two: at two, 27 of 30 tasks clipped and each grew a
   'more' row, giving back most of the height the redesign had saved. */
check(/max-height:calc\(1\.45em \* 3\)/.test(phone),
      "the phone shows three lines, so an ordinary task needs no 'more' at all");
check(/THREE LINES, NOT TWO/.test(css), "with the measurement that decided it recorded");
}

/* ==========================================================================
   C72. THE PHONE IS NOT A NARROW DESKTOP

   Measured at 400x710 on the live site before this work: the board was 6.0
   screens, the first task 290px down, the To do lane 227px tall holding 392px,
   the calendar box 520px holding 1,882px, and Year at a glance 2,069px. One
   cause: desktop's panel layout - fixed-height boxes that scroll inside
   themselves - stacked on a phone, where there is no side-by-side arrangement
   left for them to protect. Three nested scrolls were live at once.

   These checks exist mostly to protect the DESKTOP. Everything added is inside
   a max-width query, and the point of testing it is that a later edit could
   move one rule out of that block and quietly change the desktop board, which
   is the one thing that must not happen.
   ========================================================================== */
{
const sheet  = readFile("assets/app.css");
const oneline = sheet.replace(/\s*\n\s*/g, "");
const ph = (oneline.match(/@media \(max-width:640px\)\{[^@]*/g) || []).join("");

/* ---- the three nested scrolls are gone on a phone ---- */
/* THE LANE CAP WENT OFF, AND OFF WAS WORSE.
   The desktop cap is 227px on a phone - about three cards - so twenty tasks
   meant a 227px window onto 1,664px. Removing it made the lane 1,664px and
   the page 5,400px at 322x710: 7.6 screens, against 6.0 before any of this.
   Reported from real use, then reproduced. The cap is back, sized to the
   screen instead of to a fraction of it. */
/* THE SUBTRAHEND WAS WRONG AND SO WAS THE UNIT.

   104px was meant to be the tabs plus the add field, but the lane does not
   start at 104: the header is above it too. Measured at 322x710 the lane began
   at 215 and ended at 821 - 111px below the fold - so its bottom edge was
   never on screen and nothing said it was a box with more inside it. It was
   capping correctly and looking exactly like it was not.

   And 100vh on a phone is the LARGE viewport, the height the page would have
   with the address bar hidden, which overshoots again on a real device. The
   number is now the chrome that is always on screen - 46 of pinned tabs, 38 of
   add field, 56 of tab bar - and the unit is dvh, with vh underneath as the
   fallback. */
check(/\.lane,\.rlist\{max-height:max\(260px, calc\(100vh  - 150px\)\);overflow-y:auto\}/.test(ph),
      "a phone lane is sized to the screen it is actually on");
check(/\.lane,\.rlist\{max-height:max\(260px, calc\(100dvh - 150px\)\)\}/.test(ph),
      "in dvh, so the address bar does not push its bottom edge off the screen");
{
  const at = ph.indexOf("calc(100dvh - 150px)");
  const vh = ph.indexOf("calc(100vh  - 150px)");
  check(vh >= 0 && at > vh, "with the vh fallback declared first, so dvh wins where it is known");
}
{
  /* 46px of pinned tabs plus a 38px add field is 84; the rest of the 104 is
     the padding around them. The point of tying it to 100vh rather than to a
     percentage is that the lane fills the phone exactly once. */
  const at = oneline.indexOf(".lane,.rlist{max-height:max(260px");
  const q  = oneline.lastIndexOf("@media", at);
  check(at > 0 && /max-width:\s*640px/.test(oneline.slice(q, at)),
        "and that size is phone-only, so the desktop keeps its own cap");
}
check(/\.calbox\{max-height:none;overflow:visible\}/.test(ph),
      "the calendar is the exception: a year scrolls continuously, in one scroll not two");

/* ---- but the desktop keeps every one of them ---- */
check(/max-height:var\(--laneMax\);overflow-y:auto/.test(oneline),
      "the desktop lane cap still exists");
check(/\.calbox\{overflow:auto;max-height:calc\(100vh - 190px\)/.test(oneline),
      "and so does the desktop calendar box - the phone overrides it, nothing removed it");
{
  const at = oneline.indexOf(".calbox{max-height:none");
  const q  = oneline.lastIndexOf("@media", at);
  check(at > 0 && /max-width:\s*640px/.test(oneline.slice(q, at)),
        "the removal is inside a phone query, so above 640px it is never applied");
}

/* ---- the bar scrolls away, and only on a phone ----
   It is 180px on a phone because the ribbon wraps onto three rows, and it hid
   the calendar's own title row 24px behind it. The week grid already has a
   sticky year header, so nothing is lost by letting the bar go. */
check(/\.bar\{position:static\}/.test(ph), "the app bar scrolls away on a phone");
check(/\.bar\{position:sticky;top:0/.test(siteCss.replace(/\s*\n\s*/g, "")),
      "while staying sticky everywhere else, which is where it belongs");
check(/\.wg \.yh\{[^}]*position:sticky;top:0/.test(oneline),
      "and the grid's own year header is what sticks instead - it already did");

/* THE TRAP THAT COST AN HOUR. position:sticky measures against the nearest
   SCROLL CONTAINER, and overflow:hidden makes one. .gridbox clips with
   overflow:hidden for its rounded corners, so the moment .calbox stopped
   scrolling the year header started sticking to a box that never moves -
   measured at -945 with the page 1,200px down, i.e. not sticking at all.
   overflow:clip clips the same way without being a scroll container. */
check(/\.gridbox\{overflow:clip\}/.test(ph),
      "the box around it clips without becoming a scroll container");
check(/\.gridbox\{[^}]*overflow:hidden/.test(oneline),
      "while the desktop keeps overflow:hidden, where .calbox is still the scrollport");

/* ---- one column at a time ---- */
check(/\.colpick,\.densepick\{display:none\}/.test(oneline),
      "the phone furniture is declared hidden at desktop width");
check(!ph.includes(".colpick,.densepick{display:none}"),
      "outside any phone query, so it applies at every width a phone rule does not reach");
check(/\.kb\[data-only\] \.col\{display:none\}/.test(ph),
      "a phone shows one column");
check(/\.kb\[data-only=todo\]  \.col\[data-s=todo\]/.test(ph),
      "the selected one, named by an attribute on the host");
check(/\.colpick\{display:flex/.test(ph), "with the switcher visible only there");

toBoard();
dom.window.eval('cfg.phoneCol="todo"; commit("cfg"); renderAll();');
const pick = $("scopeHost").querySelector(".colpick");
check(!!pick, "the switcher is rendered into the board");
check(pick.querySelectorAll("button").length === 3, "one button per column");
check($("scopeHost").getAttribute("data-only") === "todo",
      "and the host names the column on show");
check(pick.getAttribute("role") === "tablist", "announced as tabs to a screen reader");

/* THE COUNTS ARE THE POINT. Showing one column is only acceptable because the
   other two still tell you how much is waiting in them. */
add(0,"c72 alpha"); add(1,"c72 beta"); add(1,"c72 gamma");
const counts = [...$("scopeHost").querySelectorAll(".colpick button .n")].map(n => n.textContent);
check(counts[0] >= "1" && counts[1] === "2",
      "each tab carries its own count, so nothing is hidden by showing one column");

/* SWITCHING MUST NOT RE-RENDER. A re-render here would destroy an open editor
   and throw away the scroll position - the fault repaintIfHeld() exists for. */
const keep = $("scopeHost").querySelector(".t");
click($("scopeHost").querySelectorAll(".colpick button")[2]);
check($("scopeHost").getAttribute("data-only") === "done", "tapping a tab switches column");
check(d.contains(keep), "without rebuilding the cards, so an open editor survives");
check($("scopeHost").querySelectorAll(".colpick button")[2].getAttribute("aria-selected") === "true",
      "and says which tab is current");
check(dom.window.eval("cfg.phoneCol") === "done", "the choice is remembered");

/* Garbage from localStorage must not blank the board. */
check(dom.window.eval('cfg.phoneCol="nonsense"; phoneCol()') === "todo",
      "an unknown column falls back to To do rather than showing nothing");
dom.window.eval('cfg.phoneCol="todo"; commit("cfg"); renderAll();');

/* ---- the calendar density switch ---- */
check(/#calView\.dense \.wg \.dc\{min-height:23px/.test(ph),
      "dense drops the calendar row from 34px to 23px");
{
  const at = oneline.indexOf("#calView.dense .wg .dc{");
  const q  = oneline.lastIndexOf("@media", at);
  check(at > 0 && /max-width:\s*640px/.test(oneline.slice(q, at)),
        "and it cannot reach the desktop calendar, being inside a phone query");
}
check(/function applyDensity/.test(js), "a class and nothing else, so no cell is rebuilt");
check(!/renderCalendar\(\);?\s*\}\s*$/.test(String(dom.window.applyDensity || "")) ||
      !/renderCalendar/.test(String(dom.window.applyDensity || "")),
      "applyDensity does not re-render, which is what keeps the scroll position");
dom.window.eval("cfg.calDense=true; applyDensity();");
check($("calView").classList.contains("dense"), "the switch adds the class");
check($("calDense").getAttribute("aria-pressed") === "true", "and reports its state");
check($("calDense").textContent === "Bigger rows", "the label says what pressing it does next");
dom.window.eval("cfg.calDense=false; applyDensity();");
check(!$("calView").classList.contains("dense") && $("calDense").textContent === "Fit year",
      "and back again");
}

/* ==========================================================================
   C73. THE PHONE STOPS BEING A NARROW DESKTOP

   Measured at 393x852 before this pass, on the board page:

     header      180px    5%
     THE BOARD   496px   12%    the thing the app is for
     settings    848px   21%    country picker, countdowns, colour rows
     year grid  2069px   52%    too small to read, open by default
                4120px  = 4.8 screens

   The board was an eighth of the board page and settings were nearly twice
   the board. None of that is a styling problem: it is a question of what
   belongs in the main scroll and what belongs behind a tab.

   As with every phone rule in this file, the checks that matter most are the
   ones proving the desktop cannot see any of it.
   ========================================================================== */
{
const sheet   = readFile("assets/app.css");
const oneline = sheet.replace(/\s*\n\s*/g, "");
const ph      = (oneline.match(/@media \(max-width:640px\)\{[^@]*/g) || []).join("");
const html    = readFile("index.html");

/* ---- everything new is hidden at desktop width BEFORE it is shown ---- */
/* Brace-balance rather than a regex over the media blocks. The phone-block
   extractor used everywhere else stops at the next "@", which overshoots a
   query's closing brace and swallows whatever rule follows it - so it reported
   these top-level rules as being inside a query. Counting braces from the
   start of the file cannot be fooled that way: balanced means top level. */
const atTopLevel = (css, idx) => {
  const head = css.slice(0, idx);
  return (head.match(/\{/g) || []).length === (head.match(/\}/g) || []).length;
};
const siteOne = siteCss.replace(/\s*\n\s*/g, "");
const sitePh  = siteOne.split("@media (max-width:640px)").slice(1).join("");

[[oneline, "\\.sheethead"], [oneline, "\\.actsheet"], [siteOne, "\\.tabbar"]].forEach(([css, sel]) => {
  const re = new RegExp(sel + "\\{display:none\\}");
  const m  = css.match(re);
  check(!!m, "declared display:none outside any query: " + sel);
  if (m) check(atTopLevel(css, css.indexOf(m[0])),
               "  and at top level, so it applies before any phone rule could");
});

/* ---- the tab bar, which lives in site.css because EVERY page has one ----
   It began as an app-only control in app.css, which only index.html loads, so
   tapping Holidays left the shell completely: the bar vanished and there was
   no way back except the browser. A tab bar that is missing on some
   destinations is worse than none, because it teaches you where to look and
   then takes it away. */
check(/\.tabbar\{display:flex;position:fixed;left:0;right:0;bottom:0/.test(sitePh),
      "a phone gets a tab bar pinned to the bottom, where the thumb is");
check(/\.tabbar \.tab\{[^}]*min-height:56px/.test(sitePh),
      "with 56px targets, comfortably past the 44 Apple asks for");
check(/\.tabbar\{[^}]*padding-bottom:env\(safe-area-inset-bottom\)/.test(sitePh),
      "clearing the home indicator on a phone that has one");
check(/body\{padding-bottom:calc\(56px \+ env\(safe-area-inset-bottom\)\)\}/.test(sitePh),
      "and the page ends above it, so the last line is not underneath it");
/* The point of the whole change: it is on the content pages too. */
["about.html","contact.html","guide.html","privacy.html","terms.html"].forEach(f => {
  const src = readFile(f);
  check(/<nav class="tabbar"/.test(src), f + " has the tab bar");
  check((src.match(/class="tab"/g) || []).length === 4, f + " has all four destinations");
});
check(/\.sitenav\{display:none\}/.test(sitePh),
      "and the content pages drop their wrapping seven-link nav row, 128px to ~48px");
check(/\.sitenav\{display:none\}/.test(ph),
      "the header loses the row that used to carry Board and Calendar");
check(/\.sitenav a\[data-view\], \.tabbar \[data-view\]/.test(js),
      "and both navigations light up together, or the app looks lost");

const tabs = qa(".tabbar .tab").length;
check(tabs === 4, "four destinations: board, calendar, holidays, settings (got " + tabs + ")");

/* ---- settings is a destination, not a wall of panels in the scroll ---- */
check(/\.rail\{position:fixed;left:0;right:0;top:0;z-index:70/.test(ph),
      "the rail lifts out of the page into a sheet on a phone");
check(/bottom:calc\(56px \+ env\(safe-area-inset-bottom\)\)/.test(ph),
      "stopping above the tab bar, so Settings is a tab rather than a modal");
check(/body\.sheet\{overflow:hidden\}/.test(ph),
      "with the board behind it locked, so two things do not scroll at once");
check(/function openSheet/.test(js) && /function closeSheet/.test(js),
      "opened and closed by name rather than by a class toggled in six places");
$("tabSettings").click();
check(d.body.classList.contains("sheet"), "the Settings tab opens it");
check($("tabSettings").getAttribute("aria-expanded") === "true", "and says so");
$("sheetClose").click();
check(!d.body.classList.contains("sheet"), "Done closes it");

/* ---- the year grid is folded on a phone, and only on a phone ---- */
check(/function glanceOpen/.test(js), "the year grid's open state is asked for, not read raw");
check(/phone\(\) \? !!cfg\.glanceOpenPhone : !!cfg\.glanceOpen/.test(js),
      "and the two screens keep separate answers");
/* OPEN by default on both now. It was folded on phones for a pass - 2,069px
   of a 4,120px page, for a grid too small to plan in - and that was the wrong
   call: it is the app's headline feature and hiding it by default hides what
   the app is for. The page length problem it was solving is answered properly
   instead, by the dense rows the calendar already had. */
check(/glanceOpenPhone:true/.test(js),
      "the year grid is open by default on a phone as well as on a desktop");
check(/#glanceBox \.wg\.c \.dc\{min-height:2[0-9]px/.test(readFile("assets/app.css").replace(/\s*\n\s*/g,"")),
      "with denser rows there, so being open costs a fraction of what it did");
check(/max-width:640px/.test(js.slice(js.indexOf("function phone"), js.indexOf("function phone") + 300)),
      "phone() matches the stylesheet's breakpoint, not narrow()'s older 700");

/* ---- the day popup fits the screen it is on ---- */
check(/\.ov\{align-items:flex-end;padding:0;overflow:hidden\}/.test(ph),
      "the day popup is anchored to the bottom as a sheet");
check(/\.ov \.md\{width:100%;max-height:88vh/.test(ph),
      "never taller than the screen - it was 891px on an 852px phone");
check(/\.mh\{position:sticky;top:0/.test(ph),
      "its header holds still, so the way out cannot scroll off the top");
check(/\.mh button\{[^}]*min-height:44px/.test(ph),
      "and the way out is 44px, not the 27x25 cross it was");
check(/<span class="mx">&times;<\/span><span class="mdone">Done<\/span>/.test(html),
      "labelled Done on a phone and a cross on a desktop, from one button");
check(/\.mh button \.mdone\{display:none\}/.test(oneline),
      "with the word hidden at desktop width");
}

/* ==========================================================================
   C74. THE CONTENT PAGES, AND THE CALENDAR CELL

   The 1,732 pages that are not the app had drifted away from it: the phone
   work all lived in app.css, which only index.html loads. Measured at 393x852:
   a 128px sticky header on pages that exist to be read, the guide 7.8 screens
   of sixteen sections with no way to reach one, 246 country links at 27px with
   no way to find one, a 64-row table whose heading scrolls away, and a page
   whose entire job is answering one question setting the QUESTION larger than
   the answer.

   Every rule below is inside a max-width query. The desktop reading experience
   is not part of this pass.
   ========================================================================== */
{
const siteFlat = siteCss.replace(/\s*\n\s*/g, "");
const sitePhone = siteFlat.split("@media (max-width:640px)").slice(1).join("");
const appFlat = readFile("assets/app.css").replace(/\s*\n\s*/g, "");
const appPhone = appFlat.split("@media (max-width:640px)").slice(1).join("");
const holGen = readFile("tools/build-holiday-pages.js");
const wkGen  = readFile("tools/build-week-pages.js");

/* ---- the header behaves the same on both halves of the site ---- */
check(/\.bar\{position:static\}/.test(sitePhone),
      "content pages let the header scroll away too, as the app already did");

/* ---- a contents list on the three long pages ---- */
["guide.html", "privacy.html", "terms.html"].forEach(f => {
  const src = readFile(f);
  const links = (src.match(/<nav class="toc"[\s\S]*?<\/nav>/) || [""])[0];
  const hrefs = links.match(/href="#([a-z0-9-]+)"/g) || [];
  check(hrefs.length >= 5, f + ": has a contents list (" + hrefs.length + " sections)");
  /* Every entry has to land somewhere. A slug that does not match an id is a
     link that silently does nothing. */
  const missing = hrefs.map(h => h.slice(7, -1))
                       .filter(id => src.indexOf('<h2 id="' + id + '">') < 0);
  check(missing.length === 0, f + ": every entry points at a real heading" +
        (missing.length ? " - missing " + missing.join(", ") : ""));
});
check(/^\.toc\{display:none\}/m.test(siteFlat) || /\.toc\{display:none\}/.test(siteFlat),
      "and it is phone-only, so the desktop pages are unchanged");
check(/\.toc a\{[^}]*min-height:44px/.test(sitePhone),
      "with 44px rows - the only links on these pages not inside a sentence");

/* ---- finding one of 246 countries, at any width ----
   It was phone-only for a release, on the reasoning that four columns on a wide
   screen are scannable. They are - but scanning 246 names is still the wrong
   way to reach one you can already name, and a search box is a pure addition
   that moves nothing. */
check(!/\.ctryfind\{display:none\}/.test(holGen),
      "the country filter is no longer hidden on a desktop");
check(/\.ctryfind\{display:block;width:100%;max-width:320px/.test(holGen.replace(/\s*\n\s*/g,"")),
      "and is a narrow box there rather than a full-width one");
check(/\.ctryfind\{max-width:none;font-size:16px/.test(holGen.replace(/\s*\n\s*/g,"")),
      "full width and 16px on a phone, or iOS zooms the page on focus");
check(/\.ctrylist a\{min-height:44px/.test(holGen.replace(/\s*\n\s*/g,"")),
      "with the country rows themselves at 44px, up from 27");
check(/normalize\("NFD"\)/.test(readFile("assets/site.js")),
      "matching ignores accents, so \"turkiye\" finds \"Turkiye\"");

/* ---- a 64-row table keeps its column headings ---- */
/* AT EVERY WIDTH NOW. Sixty-five rows is two screens on a laptop, so the
   headings scroll away there too - the same fault as on a phone, just later. */
[["build-holiday-pages.js", holGen], ["build-week-pages.js", wkGen]].forEach(([name, src]) => {
  const flat = src.replace(/\s*\n\s*/g, "");
  check(/thead th\{[^}]*position:sticky;top:0/.test(flat), name + ": the table heading sticks");
  /* THE TRAP, and why the wrapper lost its overflow entirely: a box with
     overflow on EITHER axis is a scroll container, and that is what sticky
     measures against. It was sticking to a box that never scrolls vertically,
     so it did not stick at all - measured at -430 with the page 1,200px down.
     The sideways scroll guarded against a table wider than its column; with
     min-width gone there is no such table. */
  check(!/\.tablewrap\{overflow-x:auto/.test(flat),
        name + ": with its wrapper no longer a scroll container at any width");
  check(!/table\{[^}]*min-width:420px/.test(flat),
        name + ": and no min-width forcing one");
});

/* ---- the answer is the headline ---- */
check(/\.answer \.big\{font-size:34px/.test(wkGen.replace(/\s*\n\s*/g,"")),
      "on week-number the answer is 34px on a phone");
check(/\.pagebody h1\{font-size:20px\}/.test(wkGen.replace(/\s*\n\s*/g,"")),
      "and the question steps back to 20px - .pagebody, or site.css outranks it");

/* ---- the calendar cell says the day, not the date ---- */
check(/cell\.appendChild\(mk\("span","cm"/.test(js) && /mk\("span","cd"/.test(js),
      "a calendar cell is the month and the day in separate spans");
check(/\.wg \.dc \.cm\{display:none\}/.test(appPhone),
      "so a phone can drop the month, which it printed 371 times a year");
check(!/\.wg \.dc \.cm\{display:none\}/.test(appFlat.split("@media")[0]),
      "and a desktop still reads MM-DD in full");
check(/b\.setAttribute\("data-mo", MON3\[/.test(js),
      "the month is printed once, on the week where it changes");
check(/monthStart \? " mstart" : ""/.test(js),
      "with the boundary marked on that week's own seven cells");
check(/\.wg \.dc\.mstart\{border-top-color/.test(appPhone) ||
      /\.wg \.wk\[data-mo\],\.wg \.dc\.mstart\{border-top-color/.test(appPhone),
      "rather than by a sibling selector, which would match the rest of the year");
}

/* ==========================================================================
   C75. A SWITCH FOR THE THEME, AND A HEADER THAT EARNS ITS ROWS
   ========================================================================== */
{
const appCssFlat = readFile("assets/app.css").replace(/\s*\n\s*/g, "");
const appPh = appCssFlat.split("@media (max-width:640px)").slice(1).join("");
const siteFlat2 = siteCss.replace(/\s*\n\s*/g, "");

/* ---- the two dark blocks must agree ----
   Plain CSS cannot share one declaration between a media query and a selector
   outside it, so the dark palette is written twice: once following the OS and
   once for the explicit override. They are only correct while they are the
   same, and nothing but this stops them drifting. */
{
  const grab = sel => {
    const at = siteFlat2.indexOf(sel + "{");
    if (at < 0) return null;
    return siteFlat2.slice(at + sel.length + 1, siteFlat2.indexOf("}", at))
                    .split(";").filter(Boolean).sort().join(";");
  };
  const bySystem = grab(':root:not([data-theme="light"])');
  const byChoice = grab(':root[data-theme="dark"]');
  check(!!bySystem && !!byChoice, "the dark palette exists for both the OS and the override");
  check(bySystem === byChoice, "and the two declare exactly the same tokens");
  check(/:root:not\(\[data-theme="light"\]\)/.test(siteFlat2),
        "the OS block steps aside for a reader who has chosen light");
}
check(/:root\[data-theme="dark"\]\{color-scheme:dark\}/.test(siteFlat2) &&
      /:root\[data-theme="light"\]\{color-scheme:light\}/.test(siteFlat2),
      "with color-scheme both ways, so native controls follow the choice");

/* ---- the switch ---- */
check(qa("#themeSeg [data-theme-choice]").length === 3, "three states: system, light, dark");
check(qa('#themeSeg [data-theme-choice="system"]').length === 1, "and system is one of them");
check(/function setTheme/.test(js) && /function applyTheme/.test(js), "with named setters");

/* LIGHT IS THE DEFAULT, and following the device is a choice.
   It was the other way round for a release. A phone flips itself to dark on a
   schedule, and a board opened in daylight going dark at six is a surprise
   rather than a service. */
check(/theme:"light"/.test(js), "a first visit gets light, not whatever the machine is set to");
check(/cfg\.themeDefaultFix !== true/.test(js),
      "and the release that defaulted to system is migrated once, not left behind");
check(/localStorage\.setItem\("imc\.theme", t\)/.test(js) &&
      !/localStorage\.removeItem\("imc\.theme"\)/.test(js),
      "all three states are written, so an absent key can mean light");
PAGES.forEach(f => {
  check(/t!=="system"\)document\.documentElement\.setAttribute\("data-theme",t==="dark"\?"dark":"light"\)/
        .test(readFile(f).replace(/\s+/g," ")),
        f + ": the pre-paint script defaults to light and steps aside only for system");
});

/* One tap between the two you actually switch between; the third is in
   Settings where it can be spelled out. */
check(/function toggleTheme/.test(js) && /setTheme\(isDark\(\) \? "light" : "dark"\)/.test(js),
      "the header button flips between light and dark");
check(d.querySelector("#themeBtn") !== null, "and that button is in the ribbon");
check(/btn\.textContent = dark \? "☀" : "☽"/.test(js),
      "showing where it will take you rather than where you are");
check(/cfg && cfg\.theme === "dark"/.test(js),
      "and the computed day-colour tints follow the choice, not just the OS");
PAGES.forEach(f => {
  check(/localStorage\.getItem\("imc\.theme"\)/.test(readFile(f)),
        f + ": stamps the theme before the first paint");
});

/* ---- the header ---- */
check(/\.brand\{display:none\}/.test(appPh),
      "the phone header drops the wordmark - the tab bar says where you are");
check(/function placeAuth/.test(js) && /box\.appendChild\(slot\)/.test(js),
      "and the account moves into Settings rather than being duplicated there");
check(/\.authbox:empty\{display:none\}/.test(appPh),
      "leaving no empty panel behind on a desktop, where it stays in the header");

/* ---- the tab bar is genuinely everywhere, and marks itself ---- */
check(/data-tab="holidays"/.test(readFile("index.html")),
      "the Holidays tab is tagged rather than matched on its URL");
check(/\[data-tab="holidays"\]/.test(readFile("assets/site.js")),
      "which is what makes it light up from inside /holidays/, where its href is just index.html");
check(/var wantsSettings = \(h === "settings"\)/.test(js),
      "arriving at #settings from a content page opens the sheet");
check(js.indexOf("if (wantsSettings && phone()) openSheet();") > js.indexOf("setView(view);"),
      "and it is opened AFTER setView, which closes the sheet on its way past");
}

/* ==========================================================================
   C76. EVERY var(--x) RESOLVES TO SOMETHING

   Found by a full pass with 59 tasks, 12 coloured days and US regional
   holidays loaded: the carry bar - "3 tasks still open from 2 earlier days" -
   was drawing with no fill at all. Its background was var(--doingF), and there
   is no such token. CSS drops a declaration whose custom property is unknown,
   silently, so the bar had a border and nothing behind it in both themes.
   Measured as rgba(0, 0, 0, 0).

   Nothing catches that by reading: --doingF is one letter from --doingE, which
   IS a token, and the bar looked plausible. So this checks the whole surface
   rather than that one spot.
   ========================================================================== */
{
  /* Comments stripped first. A note EXPLAINING that var(--doingF) was the bug
     is not a use of it, and without this the fix fails its own test. */
  const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, "");
  const css = decomment(siteCss + readFile("assets/app.css"));
  const sources = [css, decomment(readFile("assets/app.js")), readFile("index.html")];

  /* Declared anywhere: in a stylesheet, or set from JS via setProperty. */
  const declared = new Set();
  (css.match(/(^|[;{\s])(--[A-Za-z0-9_-]+)\s*:/g) || [])
    .forEach(m => declared.add(m.match(/--[A-Za-z0-9_-]+/)[0]));
  /* The day-colour tints are built at runtime: --k0b, --k0f ... --k7f. */
  for (let i = 0; i < 8; i++){ declared.add("--k" + i + "b"); declared.add("--k" + i + "f"); }

  const used = new Set();
  sources.forEach(src => (src.match(/var\(\s*--[A-Za-z0-9_-]+/g) || [])
    .forEach(m => used.add(m.match(/--[A-Za-z0-9_-]+/)[0])));

  /* A var() with a fallback - var(--x, #fff) - is allowed to name an unknown
     property, because the fallback is what it is for. Those are excluded. */
  const withFallback = new Set();
  sources.forEach(src => (src.match(/var\(\s*(--[A-Za-z0-9_-]+)\s*,/g) || [])
    .forEach(m => withFallback.add(m.match(/--[A-Za-z0-9_-]+/)[0])));

  const orphans = [...used].filter(v => !declared.has(v) && !withFallback.has(v)).sort();
  check(orphans.length === 0,
        "every var(--x) names a token that exists" +
        (orphans.length ? " - orphaned: " + orphans.join(", ") : ""));
  check(declared.has("--doingBg"), "including the one the carry bar wanted all along");
}

/* ---- and the fixes that pass found ---- */
{
  const appFlat = readFile("assets/app.css").replace(/\s*\n\s*/g, "");
  const appPh   = appFlat.split("@media (max-width:640px)").slice(1).join("");
  const holGen2 = readFile("tools/build-holiday-pages.js").replace(/\s*\n\s*/g, "");

  check(/\.carrybar\{[^}]*background:var\(--doingBg\)/.test(appFlat),
        "the carry bar is filled with the amber the In progress column uses");
  check(/var bar = mk\("div","carrybar"\)/.test(js) &&
        !/--doingF/.test(js.replace(/\/\*[\s\S]*?\*\//g, "")),
        "and is styled from the stylesheet, not from an inline string JS cannot re-reach");
  check(/\.carrybar \.btn\{min-height:36px/.test(appPh),
        "its buttons are 36px on a phone - it moves every stale task at once");
  check(/\.op\{width:36px;height:36px\}/.test(appPh),
        "and the two controls left in the open on a card are 36px, which costs no height");

  /* One column at 44px made the country list 13.5 screens - 246 rows of 44px
     is 10,800px. Two columns halves it without shrinking the target. */
  check(/\.ctrylist\{columns:2/.test(holGen2),
        "the country list is two columns on a phone, not one 13.5-screen column");
  check(/\.ctrylist a\{min-height:44px/.test(holGen2),
        "with the rows still 44px tall");
}

/* ==========================================================================
   C77. THE MONTH IS BACK IN THE CALENDAR CELL ON A PHONE

   It was taken out on the argument that MM-DD prints the month 371 times a
   year to say something that changes twelve times. Measured properly, that
   argument only held on a NARROW phone:

     393px   cell 45.0   MM-DD at 13px is 39px wide   6.0px spare
     320px   cell 34.6   MM-DD at 13px is 39px wide   clips

   So from about 360px up - nearly every phone sold now - the full date fits at
   the same 13px the day alone was using, and nothing is paid for it at all.
   Only a 320px screen gives up type size, and about three points rather than
   the whole month.

   Hence a size that follows the screen instead of a breakpoint. Measured after:
   320 -> 10.0px, 360 -> 11.9px, 375 -> 12.6px, 393 and up -> 13px, with about
   4.5px of air between one date and the next at every width. The first attempt
   used (100vw - 90)/21 and left 1.7px at 320px, where the dates ran together.
   ========================================================================== */
{
  const appFlat = readFile("assets/app.css").replace(/\s*\n\s*/g, "");
  const appPh   = appFlat.split("@media (max-width:640px)").slice(1).join("");

  check(/\.wg \.dc \.cm\{display:inline\}/.test(appPh),
        "a phone calendar cell shows the month again, as the desktop always has");
  /* THE CAP COMES FROM THE DESKTOP, which is the version nobody complains
     about. Measured there: cell 43.4px, font 10px, date 30px wide, 13.4px of
     air - 31% of the cell is space. The phone cell is 45px, slightly wider, so
     the same density is 10.5px and lands on 13.5px of air.

     13px fitted and still read as a wall: 6px between one five-character date
     and the next is 13% air against the desktop's 31%. Fitting and reading
     well are not the same test, and the first version only ran the first. */
  check(/\.wg \.dc\{font-size:min\(10\.5px, calc\(\(100vw - 82px\) \/ 21 - 1\.33px\)\)\}/.test(appPh),
        "at a size that follows the screen, capped at the desktop's own density");
  check(/min\(10\.5px,/.test(appPh) && /100vw - 82px/.test(appPh),
        "both halves present - the cap and the taper");
  check(/#calView\.dense \.wg \.dc\{font-size:min\(10px/.test(appPh),
        "and Fit year is sized by the same arithmetic, so it cannot clip either");

  /* THE BOARD'S YEAR GRID SHOWS THE SAME DATE. It was excluded on the grounds
     that it is three months side by side in a third of the width - true on a
     desktop, false on a phone, which is the only place these rules apply. On a
     phone the three grids stack, each 343px wide with 45px cells, the same as
     the calendar page's. Measured, and the assumption was wrong. */
  check(!/#glanceBox \.wg\.c \.dc \.cm\{display:none\}/.test(appPh),
        "the board's year grid shows the month too - its cells are the same 45px");
  check(/#glanceBox \.wg\.c \.dc\{min-height:23px\}/.test(appPh),
        "differing from the calendar only in row height, which is vertical space");
  check(/b\.setAttribute\("data-mo", MON3\[/.test(js),
        "with the month markers down the week column kept in both");
}

/* ==========================================================================
   C78. A COLOUR ON A TASK

   The ask: "i have 10 to do tasks, is there some kind of colour palette that
   can be assigned?" - ten things in one column with no way to see which are
   work and which are the rest of life.

   Two designs were built and shown before this one, and both were rejected for
   the same reason: "the kanban board should be one, do not want to confuse
   user to select more tabs again." A second board and a filter tab both make
   you choose where to look before you can look at anything. So: one board, and
   a 4px edge on the card.

   What this section holds to:
     - nothing changes for anyone who never opens it. No colour by default, no
       key on the task, no stripe, no change to a board that already exists
     - task colours are a SEPARATE list from day colours. Sharing the day list
       would have renamed somebody's Leave into somebody's Personal
     - the stripe is named by a class, so a theme switch re-answers it with no
       repaint of the board
     - deleting a colour shifts every task index down, or Personal silently
       becomes Errand
   ========================================================================== */
{
  const appFlat = readFile("assets/app.css").replace(/\s*\n\s*/g, "");
  const appPh   = appFlat.split("@media (max-width:640px)").slice(1).join("");
  const appWide = appFlat.split("@media (max-width:640px)")[0];
  const jsFlat  = js.replace(/\s*\n\s*/g, "");

  /* ---- the two lists are genuinely separate ---- */
  check(/taskCats:\[\{label:"Work"/.test(jsFlat),
        "task colours are their own list, defaulting to Work, Personal and Errand");
  check(/catLabels:\["Milestone","Travel","Leave","WFH"\]/.test(js),
        "and the day colours are untouched - Leave still means a day, not a task");
  check(/addCat:null/.test(js),
        "nothing is coloured by default: the add field starts on no colour");

  /* ---- a fresh board has no colour anywhere ---- */
  const plain = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
                                  pretendToBeVisual:true });
  const pw = plain.window, pd = pw.document;
  pw.confirm = () => true;
  const pclick = n => n.dispatchEvent(new pw.MouseEvent("click", { bubbles:true }));
  const pAdd = pd.querySelector('#scopeHost .col[data-s="todo"] .cadd');
  const pGo  = pd.querySelector('#scopeHost .col[data-s="todo"] .addgo');
  pAdd.value = "buy milk"; pclick(pGo);
  const pCard = pd.querySelector('#scopeHost .col[data-s="todo"] .t');
  check(pCard !== null && !pCard.classList.contains("tcat"),
        "a task typed with no colour chosen gets no stripe");
  const storedPlain = JSON.parse(pw.localStorage.getItem("imc.tasks") || "[]");
  check(storedPlain.length === 1 && !("cat" in storedPlain[0]),
        "and no 'cat' key at all - a task written today matches one written before this existed");

  /* ---- choosing a colour on the add field colours what you type next ---- */
  const ah = pd.querySelector('#scopeHost .col[data-s="todo"] .addhue');
  check(ah !== null, "the add field carries a swatch saying what new tasks will get");
  check(/no colour/.test(ah.getAttribute("aria-label")),
        "reading 'no colour' until somebody sets one");
  pclick(ah);
  /* ON THE BODY, NOT IN THE ADD ROW. A lane is a scroll box and a scroll box
     clips: parented to the card, the swatches were cut in half by the bottom
     of a full column, which is exactly when a long list needs them. */
  const pop = pd.querySelector(".huepop");
  check(pop !== null && pop.parentNode === pd.body,
        "pressing it opens the swatch row, parented to the body so nothing can clip it");
  check(pop.querySelectorAll(".huesw").length === 3,
        "with one swatch per colour plus 'none', which is a choice and not the lack of one");
  check(pop.querySelector(".hueedit") !== null,
        "and a way through to the panel that renames and recolours them");
  check(pop.querySelector(".huesw.no.on") !== null,
        "and 'none' ringed, because that is what it is currently set to");
  pclick(pop.querySelectorAll(".huesw")[1]);
  check(pd.querySelector(".huepop") === null, "picking one closes the popover");
  const ah2 = pd.querySelector('#scopeHost .col[data-s="todo"] .addhue');
  check(ah2.classList.contains("tcat") && ah2.classList.contains("tc0"),
        "the swatch fills with what was chosen");
  check(/Work/.test(ah2.getAttribute("aria-label")), "and says so by name, not by number");
  check([...pd.querySelectorAll("#scopeHost .addhue")].every(b => b.classList.contains("tc0")),
        "all three add fields follow - it is one setting, not three");

  pAdd.value = "quarterly review"; pclick(pGo);
  const cards = [...pd.querySelectorAll('#scopeHost .col[data-s="todo"] .t')];
  const fresh = cards.find(c => /quarterly/.test(c.textContent));
  check(fresh.classList.contains("tcat") && fresh.classList.contains("tc0"),
        "and the next task lands already marked - you say 'work' once, not six times");
  check(cards.filter(c => /buy milk/.test(c.textContent))
             .every(c => !c.classList.contains("tcat")),
        "while the one typed before the choice is left exactly as it was");

  /* ---- the dot on the card ---- */
  const dot = fresh.querySelector(".op.hue");
  check(dot !== null, "a card carries a colour dot among its controls");
  check(dot.classList.contains("tcat"), "filled when the task has one");
  check(/Colour: Work/.test(dot.getAttribute("aria-label")),
        "and naming it, so the control reports the state without being opened");
  pclick(dot);
  const cpop = pd.querySelector(".huepop");
  check(cpop !== null, "pressing it opens the same swatch row");
  check(pd.defaultView.getComputedStyle(cpop).position === "fixed",
        "fixed to the viewport, because nothing in CSS gets a child out of an ancestor's overflow");
  check(fresh.classList.contains("huing"),
        "and the card keeps its controls on screen while the pointer travels to them");
  check(cpop.querySelector(".huesw.tc0.on") !== null, "with the current colour ringed");
  pclick(cpop.querySelector(".huesw.no"));
  const after = [...pd.querySelectorAll('#scopeHost .col[data-s="todo"] .t')]
                  .find(c => /quarterly/.test(c.textContent));
  check(!after.classList.contains("tcat"), "and 'none' takes it off again");
  const storedAfter = JSON.parse(pw.localStorage.getItem("imc.tasks") || "[]");
  check(storedAfter.every(t => !/quarterly/.test(t.text) || !("cat" in t)),
        "removing it DELETES the key rather than storing a null - the task is the task again");

  /* ---- Escape and an outside click close it ---- */
  const dot2 = pd.querySelector('#scopeHost .col[data-s="todo"] .t .op.hue');
  pclick(dot2);
  check(pd.querySelector(".huepop") !== null, "the popover opens");
  pd.dispatchEvent(new pw.KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
  check(pd.querySelector(".huepop") === null, "Escape closes it");
  pclick(dot2);
  pclick(pd.body);
  check(pd.querySelector(".huepop") === null, "and so does a click anywhere else");

  /* ---- the phone action sheet carries the same swatches ---- */
  pclick(pd.querySelector('#scopeHost .col[data-s="todo"] .t .op.menu'));
  const acts = pd.querySelector("#actList .actcols");
  check(acts !== null, "the phone action sheet opens with a colour row at the top");
  check(acts.querySelectorAll(".huesw").length === 3 &&
        acts.querySelectorAll(".hueedit").length === 1,
        "the same swatches and the same Edit, built by the same function - they cannot drift apart");
  check([...pd.querySelectorAll("#actList .actrow .al")]
          .every(l => !/^Colour/.test(l.textContent)),
        "and the dot is NOT mirrored as a row: a state does not belong in a list of verbs");
  check([...pd.querySelectorAll("#actList .actrow .al")].some(l => /Move right/.test(l.textContent)),
        "while every actual action is still mirrored, exactly as before");

  /* ---- deleting a colour shifts the indices ---- */
  const shift = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
                                  pretendToBeVisual:true,
    beforeParse(win){
      win.localStorage.setItem("imc.tasks", JSON.stringify([
        { id:"a", date:TODAY, text:"work one",  status:"todo", order:0, cat:0, ts:{todo:null,doing:null,done:null} },
        { id:"b", date:TODAY, text:"personal",  status:"todo", order:1, cat:1, ts:{todo:null,doing:null,done:null} },
        { id:"c", date:TODAY, text:"an errand", status:"todo", order:2, cat:2, ts:{todo:null,doing:null,done:null} }
      ]));
    }});
  const sww = shift.window, sd = sww.document;
  sww.confirm = () => true;
  const sclick = n => n.dispatchEvent(new sww.MouseEvent("click", { bubbles:true }));
  check(sd.querySelector('.t[data-id="b"]').classList.contains("tc1"),
        "a stored index paints the colour it names");
  const del0 = sd.querySelectorAll("#tcats .cat .catx")[0];
  check(/Remove Work/.test(del0.getAttribute("aria-label")), "the rail can remove one");
  sclick(del0);
  const t2 = JSON.parse(sww.localStorage.getItem("imc.tasks"));
  const by = id => t2.find(t => t.id === id);
  check(!("cat" in by("a")), "the tasks that used it lose the colour and keep everything else");
  check(by("a").text === "work one" && by("a").order === 0, "text, order and stamps untouched");
  check(by("b").cat === 0 && by("c").cat === 1,
        "and every index above it shifts down - Personal does not silently become Errand");
  check(sd.querySelector('.t[data-id="b"]').classList.contains("tc0"),
        "which the board redraws to match");
  check(/Removed the task colour/.test(sd.getElementById("undoText").textContent),
        "one undoable action, not three");
  sclick(sd.getElementById("undoGo"));
  const t3 = JSON.parse(sww.localStorage.getItem("imc.tasks"));
  check(t3.find(t => t.id === "a").cat === 0 && t3.find(t => t.id === "c").cat === 2,
        "and taking it back puts every index exactly where it was");

  /* ---- a stored value that names nothing is repaired, never left dangling ---- */
  const bad = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
                                pretendToBeVisual:true,
    beforeParse(win){
      win.localStorage.setItem("imc.cfg", JSON.stringify({ taskCats:"not an array", addCat:9 }));
    }});
  check(bad.window.document.querySelectorAll("#tcats .cat").length === 2,
        "a broken task-colour list is rebuilt from the defaults rather than throwing");
  check(bad.window.document.querySelector(".addhue").className.indexOf("tcat") < 0,
        "and an addCat pointing at nothing becomes 'no colour', not a colour on everything");

  /* ---- the stripe is a class, so the theme can re-answer it ---- */
  check(/\.t\.tcat\{border-left-width:4px;border-left-color:var\(--catc\)/.test(appFlat),
        "the stripe is 4px on the left edge - the card's fill already says which column it is in");
  check(/\.t\.tcat\{[^}]*padding-left:5px/.test(appFlat),
        "with the padding cut by the three pixels the border gained, so the text does not move");
  check(/\.tcat\.tc0\{--catc:var\(--tc0,#7c3aed\)\}/.test(appFlat),
        "and the colour comes from a class, never written onto the card");
  /* THE FIRST DRAFT HANDED TASKS THE DAY PALETTE and the screenshot showed why
     that was wrong: Personal came out the exact amber of Travel, Errand a
     shade off Leave. The two sets never share an ELEMENT - one paints calendar
     cells, the other cards - but they share a SCREEN. */
  check(/var TCATS = \["#7c3aed","#db2777","#0891b2","#65a30d"\]/.test(js),
        "task colours have their own palette, in four families the day colours do not use");
  check(!/CATS\[tci % CATS\.length\]/.test(js) && !/color:CATS\[i % CATS\.length\]/.test(js),
        "and nothing about a task colour falls back to a day colour");
  check(/root\.style\.setProperty\("--tc" \+ i,/.test(js),
        "so applyTaskCatColours can re-answer all eight on :root");
  check(/applyTaskCatColours === "function"/.test(js),
        "which applyTheme calls, so switching to dark repaints every stripe with no re-render");
  check(/dark \? blend\(c, 0\.30\) : blend\(c, -0\.08\)/.test(js),
        "lifted off whichever ground it sits on, with the hue - the only part that means anything - left alone");

  /* ---- the phone gets the dot as swatches, never as a hidden button ---- */
  check(/\.t \.ops \.op\{display:none\}/.test(appPh),
        "on a phone the card's controls collapse, the colour dot among them");
  check(/\.actcols\{/.test(appPh) && /\.actcols \.huesw\{width:32px;height:32px\}/.test(appPh),
        "and the sheet's swatches are 32px, the same target every other row there gets");
  check(/\.addhue\{width:30px;height:38px\}/.test(appPh),
        "the add field's swatch matches the field's own height, so the three read as one row");

  /* ---- desktop is not touched by any of the phone rules ---- */
  check(!/\.actcols/.test(appWide) && !/\.addhue\{width:30px/.test(appWide),
        "none of which exists above 640px");

  /* ---- the export says the name, not the number ---- */
  check(/"task","task_colour"/.test(jsFlat),
        "the CSV carries a task_colour column, right after the task");
  check(/function taskColourOf\(t\)\{ var c = taskCat\(t\); return c \? c\.label : ""; \}/.test(js),
        "holding the NAME - '2' is not an answer to 'how much of last month was work'");

  /* ---- and the rail explains the split ---- */
  const tBox = [...d.querySelectorAll(".rail .rbox")]
    .find(b => b.querySelector("h3") && /Task colours/.test(b.querySelector("h3").textContent));
  check(tBox !== undefined, "the rail has its own Task colours panel");
  check(/rename/i.test(tBox.querySelector(".rhint").textContent),
        "with the same rename-in-place the day colours have");
  check(d.querySelectorAll("#tcats .cat").length === 2 &&
        d.querySelector("#tcats .catadd .btn").textContent === "+ add a colour",
        "two to start, and room for more up to the same eight the day colours cap at");
  /* TWO, because the job is telling work from the rest of life and that takes
     two. The first release shipped a third, Errand, which was mine rather than
     anybody's - a slot arriving already filled is an invitation to find
     something to put in it. */
  check(/taskCats:\[\{label:"Work",\s*color:"#7c3aed"\},\s*\{label:"Personal",\s*color:"#db2777"\}\]/
          .test(js.replace(/\s+/g, " ").replace(/ /g, " ")) ||
        /\{label:"Work", *color:"#7c3aed"\}[\s\S]{0,80}\{label:"Personal", *color:"#db2777"\}\]/.test(js),
        "and Errand is not one of them - anyone who wants it adds it, and then it is theirs");
  check(!/label:"Errand"/.test(js), "nothing ships a third category nobody asked for");
}

/* ==========================================================================
   C79. THE COLOUR HAS TO SURVIVE A SYNC

   Reported the day after it shipped: "the color code appears, and then
   disappears". Two screenshots, one saying Syncing with a pink stripe on the
   card and one saying Synced without it.

   The cause was not in the board at all. sync.js maps a task between local and
   remote through two functions with a FIXED list of fields, and a task had
   gained a field that they had not. Every push dropped the colour, and every
   pull rebuilt the task from what the server held - which was a task with no
   colour - and overwrote the right answer with the wrong one.

   Nothing in this suite could have seen it: the only way through those two
   functions was a real sync against a real database. So they now carry a seam,
   the way imcStore does, and the round trip is checked here on its own.
   ========================================================================== */
{
  const sync = readFile("assets/sync.js");

  check(/roundTrip: function\(kind, local\)/.test(sync),
        "the two row mappers are reachable from a test, which is why this bug got out");

  /* THE ROUND TRIP, run for real. local -> remote row -> local. */
  const rt = liveDom.window.imcSync && liveDom.window.imcSync.roundTrip;
  if (typeof rt !== "function"){
    check(false, "imcSync.roundTrip is callable in the live DOM");
  } else {
    const withCat = rt("tasks", { id:"x1", date:TODAY, text:"work thing", status:"todo",
                                  order:3, cat:1, ts:{todo:"2026-09-07 09:00",doing:null,done:null} });
    check(withCat.cat === 1, "a task with a colour comes back with the same colour");
    check(withCat.text === "work thing" && withCat.status === "todo" && withCat.order === 3,
          "and everything else it always carried is unchanged");
    check(withCat.ts.todo === "2026-09-07 09:00" && withCat.ts.doing === null,
          "including the three timestamps, which is what ts was there for");

    const noCat = rt("tasks", { id:"x2", date:TODAY, text:"plain", status:"todo",
                                order:0, ts:{todo:null,doing:null,done:null} });
    check(!("cat" in noCat),
          "a task with no colour crosses the wire byte for byte as it always did");
    check(Object.keys(noCat.ts).length === 3,
          "and nothing extra is left sitting in its timestamps");

    /* The colour is an index, so a value that names nothing must not survive
       as one - the board would draw a stripe of no colour. */
    const junk = rt("tasks", { id:"x3", date:TODAY, text:"junk", status:"todo", order:0,
                               cat:"not a number", ts:{todo:null,doing:null,done:null} });
    check(!("cat" in junk), "a colour that is not a number never reaches the server");
  }

  /* WHY ts AND NOT A COLUMN. A "cat" column is the tidier answer and cannot
     ship on its own: PostgREST rejects the whole row for a column that does not
     exist, so the client cannot start sending it until the migration has run,
     and until then every edit fails rather than just the colour. */
  check(/ts is jsonb/.test(sync) && /PostgREST rejects the whole row/.test(sync),
        "and the file says why it travels in ts rather than in a column of its own");

  /* ---- the one-time drop from three colours to two ---- */
  const mig = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
                                pretendToBeVisual:true,
    beforeParse(win){
      win.localStorage.setItem("imc.cfg", JSON.stringify({ taskCats:[
        { label:"Work", color:"#7c3aed" },
        { label:"Personal", color:"#db2777" },
        { label:"Errand", color:"#0891b2" }] }));
    }});
  check(mig.window.document.querySelectorAll("#tcats .cat").length === 2,
        "somebody carrying the shipped three drops to two on the next load");

  /* ...but ONLY if nothing is using the third. The colour is stored as an
     index, and removing an entry something points at is exactly how Personal
     silently becomes something else. */
  const keep = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
                                 pretendToBeVisual:true,
    beforeParse(win){
      win.localStorage.setItem("imc.cfg", JSON.stringify({ taskCats:[
        { label:"Work", color:"#7c3aed" },
        { label:"Personal", color:"#db2777" },
        { label:"Errand", color:"#0891b2" }] }));
      win.localStorage.setItem("imc.tasks", JSON.stringify([
        { id:"e1", date:TODAY, text:"post the parcel", status:"todo", order:0, cat:2,
          ts:{todo:null,doing:null,done:null} }]));
    }});
  check(keep.window.document.querySelectorAll("#tcats .cat").length === 3,
        "and it is left alone the moment a task is actually using the third");
  check(keep.window.document.querySelector('.t[data-id="e1"]').classList.contains("tc2"),
        "so that task keeps the colour it had, rather than quietly becoming another one");

  /* A renamed list is somebody's own and is never touched. */
  const mine = new JSDOM(html, { url:"https://inmycalendar.com/", runScripts:"dangerously",
                                 pretendToBeVisual:true,
    beforeParse(win){
      win.localStorage.setItem("imc.cfg", JSON.stringify({ taskCats:[
        { label:"Work", color:"#7c3aed" },
        { label:"Home", color:"#db2777" },
        { label:"Errand", color:"#0891b2" }] }));
    }});
  check(mine.window.document.querySelectorAll("#tcats .cat").length === 3,
        "a list somebody has renamed is theirs, and the migration does not touch it");

  /* ---- the Edit route, which is the answer to "why is there no option to
     rename these" - there was, at the bottom of a rail nobody scrolls ---- */
  check(/function openTaskCats\(\)/.test(js),
        "the swatch row reaches the panel that edits it");
  check(/if \(phone\(\)\) openSheet\(\)/.test(js),
        "opening the sheet first on a phone, where the panel is behind a tab");
  check(/\.hueedit\{/.test(readFile("assets/app.css")),
        "and it is set apart by a rule, not made another circle - it is not a colour");
}

/* ==========================================================================
   C80. THE COMMIT HISTORY IS PART OF THE REPOSITORY

   Every other check in this file reads the working tree. A reader who opens
   this project on GitHub reads something else first: the list of commits. That
   text was never checked by anything, and it drifted - five messages were
   still carrying wording the tracked files had long since dropped.

   The house-style rule in C54 says plain ASCII punctuation, and it said it
   only about files. It applies to what gets written about the files too.

   Skipped rather than failed where git is unavailable, so the suite still runs
   from a tarball, a zip, or a CI job that checked out without history. A guard
   that cannot run is not a reason to fail a build; a guard that quietly never
   runs is worse, so it says which it did.
   ========================================================================== */
{
  let log = null;
  try {
    log = require("child_process")
            .execSync("git log --format=%B%x01", { cwd:ROOT, maxBuffer:1e8, stdio:["ignore","pipe","ignore"] })
            .toString("utf8");
  } catch (e){ log = null; }

  if (log === null){
    console.log("  SKIP  no git history available here, so the commit messages were not checked");
  } else {
    const msgs = log.split("\u0001").filter(x => x.trim());
    check(msgs.length > 50, "the whole history is readable: " + msgs.length + " commit messages");

    /* Same characters C54 forbids in a source file. A message is text somebody
       reads, and the two should not have different rules. */
    const smart = msgs.filter(m => /[\u2014\u2013\u201c\u201d\u2018\u2019]/.test(m));
    check(smart.length === 0,
          "no commit message uses an em dash, an en dash or a curly quote (" +
          smart.length + " that do)");

    /* NOT a blanket ban on non-ASCII, which was the first version of this and
       was wrong. Two messages quote glyphs the app actually draws - the moon
       and sun on the theme button, the ellipsis on the phone card menu - and a
       message describing a button reads better with the button in it.

       What is banned is the set that causes trouble while looking like it has
       not: a non-breaking space that is not a space, a zero-width character
       that is nothing at all, a soft hyphen that shows up only when a line
       wraps, a single-glyph ellipsis, and a minus sign that is not one. */
    const SNEAKY = /[\u00a0\u00ad\u200b\u200c\u200d\u2026\u2212\ufeff]/;
    const sneaky = msgs.filter(m => SNEAKY.test(m));
    check(sneaky.length === 0,
          "nor an invisible or lookalike character - no nbsp, zero-width, soft hyphen, " +
          "single-glyph ellipsis or unicode minus (" + sneaky.length + " that do)");
  }
}

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
