"use strict";
/* -----------------------------------------------------------------
   ORDERING RULE: every binding is declared here, above every function.
   init() is the only top-level call and it is the last line of the file.
   ----------------------------------------------------------------- */
var LS = { tasks:"imc.tasks", notes:"imc.notes", track:"imc.track", cfg:"imc.cfg",
           pending:"imc.pending" };
var MS_DAY = 86400000;
var CAP = 20;
/* Unsynced history has to stop growing somewhere. See markPending(). */
var PENDING_CAP = 5000;
var ST = [
  { k:"todo",  label:"To do",       cls:"c-todo"  },
  { k:"doing", label:"In progress", cls:"c-doing" },
  { k:"done",  label:"Done",        cls:"c-done"  }
];
var DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
var MON3 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var CATS = ["#dc2626","#d97706","#059669","#2563eb"];
/* ISO code + name for every country the holiday data covers. The per-country
   holiday files live in assets/holidays/<CODE>.js and are loaded on demand -
   4 MB in total, but only ~16 KB ever reaches the browser. They are .js rather
   than .json so they also work when index.html is opened straight from disk. */
var COUNTRIES = [["AF","Afghanistan"],["AL","Albania"],["DZ","Algeria"],["AS","American Samoa"],["AD","Andorra"],["AO","Angola"],["AI","Anguilla"],["AQ","Antarctica"],["AG","Antigua and Barbuda"],["AR","Argentina"],["AM","Armenia"],["AW","Aruba"],["AU","Australia"],["AT","Austria"],["AZ","Azerbaijan"],["BS","Bahamas"],["BH","Bahrain"],["BD","Bangladesh"],["BB","Barbados"],["BY","Belarus"],["BE","Belgium"],["BZ","Belize"],["BJ","Benin"],["BM","Bermuda"],["BT","Bhutan"],["BO","Bolivia, Plurinational State of"],["BQ","Bonaire, Sint Eustatius and Saba"],["BA","Bosnia and Herzegovina"],["BW","Botswana"],["BR","Brazil"],["BN","Brunei Darussalam"],["BG","Bulgaria"],["BF","Burkina Faso"],["BI","Burundi"],["CV","Cabo Verde"],["KH","Cambodia"],["CM","Cameroon"],["CA","Canada"],["KY","Cayman Islands"],["CF","Central African Republic"],["TD","Chad"],["CL","Chile"],["CN","China"],["CX","Christmas Island"],["CC","Cocos (Keeling) Islands"],["CO","Colombia"],["KM","Comoros"],["CG","Congo"],["CD","Congo, The Democratic Republic of the"],["CK","Cook Islands"],["CR","Costa Rica"],["HR","Croatia"],["CU","Cuba"],["CW","Curaçao"],["CY","Cyprus"],["CZ","Czechia"],["CI","Côte d'Ivoire"],["DK","Denmark"],["DJ","Djibouti"],["DM","Dominica"],["DO","Dominican Republic"],["EC","Ecuador"],["EG","Egypt"],["SV","El Salvador"],["GQ","Equatorial Guinea"],["ER","Eritrea"],["EE","Estonia"],["SZ","Eswatini"],["ET","Ethiopia"],["FK","Falkland Islands (Malvinas)"],["FO","Faroe Islands"],["FJ","Fiji"],["FI","Finland"],["FR","France"],["GF","French Guiana"],["PF","French Polynesia"],["TF","French Southern Territories"],["GA","Gabon"],["GM","Gambia"],["GE","Georgia"],["DE","Germany"],["GH","Ghana"],["GI","Gibraltar"],["GR","Greece"],["GL","Greenland"],["GD","Grenada"],["GP","Guadeloupe"],["GU","Guam"],["GT","Guatemala"],["GG","Guernsey"],["GN","Guinea"],["GW","Guinea-Bissau"],["GY","Guyana"],["HT","Haiti"],["VA","Holy See (Vatican City State)"],["HN","Honduras"],["HK","Hong Kong"],["HU","Hungary"],["IS","Iceland"],["IN","India"],["ID","Indonesia"],["IR","Iran, Islamic Republic of"],["IQ","Iraq"],["IE","Ireland"],["IM","Isle of Man"],["IL","Israel"],["IT","Italy"],["JM","Jamaica"],["JP","Japan"],["JE","Jersey"],["JO","Jordan"],["KZ","Kazakhstan"],["KE","Kenya"],["KI","Kiribati"],["KP","Korea, Democratic People's Republic of"],["KR","Korea, Republic of"],["XK","Kosovo"],["KW","Kuwait"],["KG","Kyrgyzstan"],["LA","Lao People's Democratic Republic"],["LV","Latvia"],["LB","Lebanon"],["LS","Lesotho"],["LR","Liberia"],["LY","Libya"],["LI","Liechtenstein"],["LT","Lithuania"],["LU","Luxembourg"],["MO","Macao"],["MG","Madagascar"],["MW","Malawi"],["MY","Malaysia"],["MV","Maldives"],["ML","Mali"],["MT","Malta"],["MH","Marshall Islands"],["MQ","Martinique"],["MR","Mauritania"],["MU","Mauritius"],["YT","Mayotte"],["MX","Mexico"],["FM","Micronesia, Federated States of"],["MD","Moldova, Republic of"],["MC","Monaco"],["MN","Mongolia"],["ME","Montenegro"],["MS","Montserrat"],["MA","Morocco"],["MZ","Mozambique"],["MM","Myanmar"],["NA","Namibia"],["NR","Nauru"],["NP","Nepal"],["NL","Netherlands"],["NC","New Caledonia"],["NZ","New Zealand"],["NI","Nicaragua"],["NE","Niger"],["NG","Nigeria"],["NU","Niue"],["NF","Norfolk Island"],["MK","North Macedonia"],["MP","Northern Mariana Islands"],["NO","Norway"],["OM","Oman"],["PK","Pakistan"],["PW","Palau"],["PS","Palestine, State of"],["PA","Panama"],["PG","Papua New Guinea"],["PY","Paraguay"],["PE","Peru"],["PH","Philippines"],["PN","Pitcairn"],["PL","Poland"],["PT","Portugal"],["PR","Puerto Rico"],["QA","Qatar"],["RO","Romania"],["RU","Russian Federation"],["RW","Rwanda"],["RE","Réunion"],["BL","Saint Barthélemy"],["SH","Saint Helena, Ascension and Tristan da Cunha"],["KN","Saint Kitts and Nevis"],["LC","Saint Lucia"],["MF","Saint Martin (French part)"],["PM","Saint Pierre and Miquelon"],["VC","Saint Vincent and the Grenadines"],["WS","Samoa"],["SM","San Marino"],["ST","Sao Tome and Principe"],["SA","Saudi Arabia"],["SN","Senegal"],["RS","Serbia"],["SC","Seychelles"],["SL","Sierra Leone"],["SG","Singapore"],["SX","Sint Maarten (Dutch part)"],["SK","Slovakia"],["SI","Slovenia"],["SB","Solomon Islands"],["SO","Somalia"],["ZA","South Africa"],["GS","South Georgia and the South Sandwich Islands"],["SS","South Sudan"],["ES","Spain"],["LK","Sri Lanka"],["SD","Sudan"],["SR","Suriname"],["SJ","Svalbard and Jan Mayen"],["SE","Sweden"],["CH","Switzerland"],["SY","Syrian Arab Republic"],["TW","Taiwan, Province of China"],["TJ","Tajikistan"],["TZ","Tanzania, United Republic of"],["TH","Thailand"],["TL","Timor-Leste"],["TG","Togo"],["TK","Tokelau"],["TO","Tonga"],["TT","Trinidad and Tobago"],["TN","Tunisia"],["TM","Turkmenistan"],["TC","Turks and Caicos Islands"],["TV","Tuvalu"],["TR","Türkiye"],["UG","Uganda"],["UA","Ukraine"],["AE","United Arab Emirates"],["GB","United Kingdom"],["US","United States"],["UM","United States Minor Outlying Islands"],["UY","Uruguay"],["UZ","Uzbekistan"],["VU","Vanuatu"],["VE","Venezuela, Bolivarian Republic of"],["VN","Viet Nam"],["VG","Virgin Islands, British"],["VI","Virgin Islands, U.S."],["WF","Wallis and Futuna"],["EH","Western Sahara"],["YE","Yemen"],["ZM","Zambia"],["ZW","Zimbabwe"],["AX","Åland Islands"]];
var HOL = {};                 /* code -> { "2026": { "0101": [name, 0|1] } } */
var holWanted = null;

var DEF = { holRegional:false, weekRule:"thursday", weekStart:0, back:1, fwd:1, shift:0, view:"board", scope:"day", ads:false,
            catLabels:["Milestone","Travel","Leave","WFH"] };

var cfg = null, tasks = null, notes = null, track = null;
var shadow = { tasks:null, notes:null, track:null, cfg:null };
var pending = { full:false, n:0, rows:{} };
var pendingSeq = 0;
var sel = null, mDate = null, glanceYear = null, dragId = null, carryHidden = {};
var el = {};

/* ---------- helpers ---------- */
function $(id){ return document.getElementById(id); }
function mk(tag, cls, txt){
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined && txt !== null) n.textContent = txt;
  return n;
}
function uid(){ return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function p2(n){ return n < 10 ? "0" + n : "" + n; }
function iso(d){ return d.getFullYear() + "-" + p2(d.getMonth()+1) + "-" + p2(d.getDate()); }
function mmdd(d){ return p2(d.getMonth()+1) + "-" + p2(d.getDate()); }
function parseISO(s){
  if (typeof s !== "string") return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  var y = +m[1], mo = +m[2], da = +m[3];
  var d = new Date(y, mo-1, da); d.setHours(0,0,0,0);
  if (d.getFullYear() !== y || d.getMonth() !== mo-1 || d.getDate() !== da) return null;
  return d;
}
function today(){ var d = new Date(); d.setHours(0,0,0,0); return d; }
function addDays(d,n){ var x = new Date(d.getTime()); x.setDate(x.getDate()+n); x.setHours(0,0,0,0); return x; }
function comma(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function stamp(){ var d = new Date(); return iso(d) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()); }
function load(k,f){
  try { var r = localStorage.getItem(k); if (!r) return f;
        var v = JSON.parse(r); return (v === null || v === undefined) ? f : v; }
  catch (e){ return f; }
}
/* ---------------------------------------------------------------------------
   THE SAVE CHOKE POINT

   Every durable write goes through commit(). writeRaw() is the only thing in
   the app that touches localStorage. This exists before any sync code does,
   for two reasons:

   1. Sync has to know WHAT changed, not merely that something did. The agreed
      rule merges at task level, so re-sending the whole array on every
      keystroke would throw away exactly the information that makes "most
      recent edit wins" resolvable.
   2. Deletions have to survive as markers. A row that is simply dropped is
      invisible to the other device, which re-sends the task and resurrects it.

   commit() works out what changed by diffing against a shadow copy of what was
   last written, rather than asking each call site to declare it. Forty call
   sites each remembering to name the row they touched is forty chances to get
   it wrong, and that class of mistake surfaces weeks later as missing data.
   --------------------------------------------------------------------------- */
function writeRaw(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e){} }
function has(o,k){ return Object.prototype.hasOwnProperty.call(o,k); }

/* The live value behind a bucket name. commit() looks the state up itself, so
   no call site can pass a mismatched key and value the way save(k,v) allowed. */
function stateOf(kind){
  if (kind === "tasks") return tasks;
  if (kind === "notes") return notes;
  if (kind === "track") return track;
  return cfg;
}

/* A bucket flattened to row id -> serialised row, which is the unit sync
   merges. Settings are one row per user, so they collapse to a single key. */
function rowMap(kind, value){
  var out = {}, i, r, k;
  if (kind === "tasks" || kind === "track"){
    if (!Array.isArray(value)) return out;
    for (i=0;i<value.length;i++){ r = value[i]; if (r && r.id) out[r.id] = JSON.stringify(r); }
    return out;
  }
  if (kind === "notes"){
    if (!value || typeof value !== "object") return out;
    for (k in value) if (has(value,k)) out[k] = JSON.stringify(value[k]);
    return out;
  }
  out.cfg = JSON.stringify(value || {});
  return out;
}

function markPending(kind, id, op){
  if (pending.full) return;
  var key = kind + ":" + id;
  if (!has(pending.rows, key)) pending.n += 1;
  /* at + seq identify this exact version of the row. settled() below clears a
     row only if both still match, so an edit made while a push is in flight is
     not silently dropped. */
  pending.rows[key] = { kind:kind, id:id, op:op, at:Date.now(), seq:++pendingSeq };
  if (pending.n > PENDING_CAP) pending = { full:true, n:0, rows:{} };
}

/* Called once, first thing in init(). The baseline is what is ON DISK, so a
   change made during startup - the catLabels migration - is recorded like any
   other. The journal persists across reloads; the shadow does not need to,
   because anything changed before a reload is already in the journal. */
function openStore(){
  var p = load(LS.pending, null);
  pending = (p && typeof p === "object" && p.rows) ? p : { full:false, n:0, rows:{} };
  if (typeof pending.n !== "number") pending.n = Object.keys(pending.rows).length;
  shadow.tasks = rowMap("tasks", load(LS.tasks, []));
  shadow.notes = rowMap("notes", load(LS.notes, {}));
  shadow.track = rowMap("track", load(LS.track, []));
  shadow.cfg   = rowMap("cfg",   load(LS.cfg, {}));

  /* The seam the sync layer attaches to, kept deliberately small: read the
     journal, and report which rows have landed. app.js never learns that sync
     exists, and the app keeps working identically if it never ships. */
  window.imcStore = {
    changes: function(){
      var out = [], k;
      for (k in pending.rows) if (has(pending.rows,k)) out.push(pending.rows[k]);
      return out;
    },
    settled: function(rows){
      if (!rows || !rows.length) return;
      for (var i=0;i<rows.length;i++){
        var r = rows[i], key = r.kind + ":" + r.id, cur = pending.rows[key];
        if (cur && cur.at === r.at && cur.seq === r.seq){ delete pending.rows[key]; pending.n -= 1; }
      }
      writeRaw(LS.pending, pending);
    },
    needsFullSync: function(){ return !!pending.full; },
    fullSyncDone: function(){ pending = { full:false, n:0, rows:{} }; writeRaw(LS.pending, pending); }
  };
}

function commit(kind){
  var value = stateOf(kind);
  writeRaw(LS[kind], value);
  var now = rowMap(kind, value), was = shadow[kind] || {}, k;
  for (k in now) if (has(now,k) && now[k] !== was[k]) markPending(kind, k, "upsert");
  for (k in was) if (has(was,k) && !has(now,k)) markPending(kind, k, "delete");
  shadow[kind] = now;
  writeRaw(LS.pending, pending);
}
function stIndex(k){ for (var i=0;i<ST.length;i++) if (ST[i].k === k) return i; return 0; }
function monthSpan(weeks){
  // the dominant months this block of weeks covers, e.g. "Jan" or "Mar-Apr"
  if (!weeks || !weeks.length) return "";
  var counts = {}, order = [];
  for (var w=0;w<weeks.length;w++){
    for (var d=0;d<weeks[w].days.length;d++){
      var dd = weeks[w].days[d];
      if (dd.getFullYear() !== weeks[w].year) continue;
      var m = dd.getMonth();
      if (counts[m] === undefined){ counts[m] = 0; order.push(m); }
      counts[m]++;
    }
  }
  order.sort(function(a,b){ return a-b; });
  if (!order.length) return "";
  var first = order[0], last = order[order.length-1];
  return first === last ? MON3[first] : MON3[first] + "\u2013" + MON3[last];
}
function narrow(){ return (window.innerWidth || 1200) <= 700; }
/* the on-demand country files call this when they finish loading */
window.__imcHol = function(code, data){
  HOL[code] = data || {};
  if (code === cfg.country) renderAll();
};
function loadHolidays(code){
  if (!code){ renderAll(); return; }
  if (HOL[code]){ renderAll(); return; }
  if (holWanted === code) return;          /* already in flight */
  holWanted = code;
  var sc = document.createElement("script");
  sc.src = "assets/holidays/" + code + ".js";
  sc.async = true;
  sc.onerror = function(){ HOL[code] = {}; renderAll(); };   /* fail quietly */
  document.head.appendChild(sc);
}
/* [name, 0] = national · [name, 1] = regional · null = ordinary day */
function holidayOn(ds){
  var c = cfg.country;
  if (!c || !HOL[c]) return null;
  var yr = HOL[c][ds.slice(0,4)];
  var h = yr ? (yr[ds.slice(5,7) + ds.slice(8,10)] || null) : null;
  /* a country like the US has hundreds of regional days - showing them all
     buries the national ones, so they are opt-in */
  if (h && h[1] === 1 && !cfg.holRegional) return null;
  return h;
}

/* ---------- week maths ---------- */
function sow(d){
  var x = new Date(d.getTime());
  x.setDate(x.getDate() - ((x.getDay() - cfg.weekStart + 7) % 7));
  x.setHours(0,0,0,0); return x;
}
function dowLabels(){ var o=[]; for (var i=0;i<7;i++) o.push(DOW[(cfg.weekStart+i)%7]); return o; }
/* ---------------------------------------------------------------------------
   WEEK NUMBERING

   Two rules, because organisations genuinely differ:

   "thursday" (default) - week 1 is the week containing the year's first
      Thursday. This is the logic ISO 8601 uses, but applied to whatever day
      the user starts their week on. It is what most payroll, retail and
      reporting calendars use. A year has 52 or 53 weeks, and the first days
      of January often belong to the previous year's last week.

   "jan1" - week 1 is simply the week containing 1 January. Easier to explain,
      but it produces a 53rd week far more often and splits the year oddly.

   Worked example with weeks starting Sunday: 1 Jan 2026 is a Thursday, so
   week 1 of 2026 starts Sunday 28 Dec 2025 - which means 31 Dec 2025 is in
   week 1 of 2026, not week 53 of 2025. For 2027, the first Thursday is 7 Jan,
   so week 1 starts Sunday 3 Jan 2027.
   --------------------------------------------------------------------------- */
function firstThursday(y){
  var d = new Date(y,0,1); d.setHours(0,0,0,0);
  while (d.getDay() !== 4) d.setDate(d.getDate()+1);
  return d;
}
function week1Start(y){
  return sow(cfg.weekRule === "jan1" ? new Date(y,0,1) : firstThursday(y));
}
function weeksForYear(y){
  var start = week1Start(y), out = [], n;
  if (cfg.weekRule === "jan1"){
    /* keep the original behaviour: run to the week containing 31 December */
    n = Math.round((sow(new Date(y,11,31)) - start) / (7*MS_DAY)) + 1;
  } else {
    /* the year ends exactly where the next one's week 1 begins */
    n = Math.round((week1Start(y+1) - start) / (7*MS_DAY));
  }
  if (!(n > 0) || n > 60) n = 52;                 /* never emit a broken grid */
  for (var i=0;i<n;i++){
    var cur = addDays(start, i*7), days = [];
    for (var j=0;j<7;j++) days.push(addDays(cur,j));
    out.push({ num:i+1, year:y, start:cur, days:days });
  }
  return out;
}
function weekOf(ds){
  var d = parseISO(ds); if (!d) return null;
  /* a late-December date can belong to next year's week 1, and an early
     January date to last year's final week - so check the neighbours too */
  var s = sow(d).getTime(), y = d.getFullYear(), yy = [y-1,y,y+1];
  for (var c=0;c<yy.length;c++){
    var ws = weeksForYear(yy[c]);
    for (var i=0;i<ws.length;i++) if (ws[i].start.getTime() === s) return ws[i];
  }
  return null;
}
function daysOfMonth(ds){
  var d = parseISO(ds), out = [];
  var last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  for (var i=1;i<=last;i++) out.push(iso(new Date(d.getFullYear(), d.getMonth(), i)));
  return out;
}

/* ---------- calendar-accurate diffs ---------- */
function wholeMonths(a,b){
  var m = (b.getFullYear()-a.getFullYear())*12 + (b.getMonth()-a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return m;
}
/* Sign convention: past = positive elapsed, future = negative remaining. */
function signedDays(s){ var t = parseISO(s); return t ? Math.round((today()-t)/MS_DAY) : 0; }
function nextOcc(s){
  var t = parseISO(s); if (!t) return null;
  var n = today();
  var c = new Date(n.getFullYear(), t.getMonth(), t.getDate()); c.setHours(0,0,0,0);
  if (c.getTime() < n.getTime()) c = new Date(n.getFullYear()+1, t.getMonth(), t.getDate());
  c.setHours(0,0,0,0); return c;
}
function entryDays(e){ return e.repeat ? Math.round((today()-nextOcc(e.date))/MS_DAY) : signedDays(e.date); }
function countText(e){
  var days = entryDays(e);
  if (days === 0) return "today";
  var past = days > 0, tgt = e.repeat ? nextOcc(e.date) : parseISO(e.date);
  var a = past ? tgt : today(), b = past ? today() : tgt;
  var u = e.unit || "days", mag;
  if (u === "weeks") mag = Math.floor(Math.abs(days)/7);
  else if (u === "months") mag = wholeMonths(a,b);
  else if (u === "years") mag = Math.floor(wholeMonths(a,b)/12);
  else mag = Math.abs(days);
  if (mag === 1) u = u.slice(0,-1);
  return (past ? "" : "-") + comma(mag) + " " + u + " " + (past ? "elapsed" : "left");
}

/* ---------- task model ---------- */
function lane(ds,status){
  return tasks.filter(function(t){ return t.date === ds && t.status === status; })
              .sort(function(a,b){ return (a.order-b.order) || (a.id < b.id ? -1 : 1); });
}
function renumber(ds,status){
  var l = lane(ds,status);
  for (var i=0;i<l.length;i++) l[i].order = i;
}
function addTask(ds,text,status){
  var t = { id:uid(), date:ds, text:text, status:status,
            order:lane(ds,status).length, ts:{todo:null,doing:null,done:null} };
  t.ts[status] = stamp();
  tasks.push(t); commit("tasks");
  return t;
}
function byId(id){ for (var i=0;i<tasks.length;i++) if (tasks[i].id === id) return tasks[i]; return null; }
/* one primitive: status change and reordering are the same operation */
function placeTask(id,status,index){
  var t = byId(id); if (!t) return;
  var from = t.status, fromDate = t.date;
  var l = lane(t.date,status).filter(function(x){ return x.id !== id; });
  if (index === null || index === undefined || index > l.length) index = l.length;
  if (index < 0) index = 0;
  l.splice(index,0,t);
  t.status = status;
  if (!t.ts[status]) t.ts[status] = stamp();
  for (var i=0;i<l.length;i++) l[i].order = i;
  if (from !== status) renumber(fromDate,from);
  commit("tasks");
}
function nudge(id,delta){
  var t = byId(id); if (!t) return;
  var l = lane(t.date,t.status), to = l.indexOf(t) + delta;
  if (to < 0 || to >= l.length) return;
  placeTask(id,t.status,to);
}
function shiftStatus(id,dir){
  var t = byId(id); if (!t) return;
  var to = stIndex(t.status) + dir;
  if (to < 0 || to >= ST.length) return;
  placeTask(id, ST[to].k, null);
}
/* Move a task to a different day, keeping its column. Tasks were previously
   welded to the date they were created on, which is wrong - work slips. */
function moveTaskToDate(id, newDate){
  var t = byId(id);
  if (!t || !parseISO(newDate) || newDate === t.date) return;
  var oldDate = t.date, st = t.status;
  t.date = newDate;
  t.order = 99999;                 /* drop it at the bottom of the target lane */
  renumber(oldDate, st);
  renumber(newDate, st);
  commit("tasks");
}
/* ---------------------------------------------------------------------------
   RECURRING TASKS

   A repeating task is an ordinary task carrying repeat:"d"|"w"|"m". Instances
   are written into the task list as real tasks the first time their day is
   viewed, so drag, reorder, move and delete all behave normally with no special
   cases. The template records which dates it has already produced, so deleting
   an instance does not make it come back.
   --------------------------------------------------------------------------- */
function delTask(id){
  var t = byId(id); if (!t) return;
  var d = t.date, s = t.status;
  tasks = tasks.filter(function(x){ return x.id !== id; });
  renumber(d,s); commit("tasks");
}

/* ---------- KANBAN ---------- */
function renderKanban(host, ds){
  host.className = "kb";
  host.innerHTML = "";
  for (var s=0;s<ST.length;s++){
    (function(st){
      var col = mk("div","col");
      col.setAttribute("data-s", st.k);
      var h = mk("div","ch " + st.cls);
      h.appendChild(mk("span", null, st.label));
      var l = lane(ds, st.k);
      h.appendChild(mk("span","n", String(l.length)));
      col.appendChild(h);

      /* Enter still works, but a phone keyboard often has no Enter that
         submits, so the field carries a visible button doing the same thing. */
      var addRow = mk("div","addrow");
      var inp = document.createElement("input");
      inp.type = "text"; inp.className = "cadd"; inp.placeholder = "+ add";
      inp.setAttribute("aria-label","Add a task to " + st.label);
      inp.setAttribute("data-add", st.k);
      function submitAdd(){
        var v = inp.value.trim(); if (!v) return;
        addTask(ds, v, st.k); inp.value = ""; refresh();
        var again = host.querySelector('.cadd[data-add="' + st.k + '"]');
        if (again && again.focus) again.focus();
      }
      inp.addEventListener("keydown", function(e){
        if (e.key === "Enter") submitAdd();
      });
      var addGo = mk("button","addgo","+");
      addGo.type = "button";
      addGo.title = "Add to " + st.label;
      addGo.setAttribute("aria-label","Add to " + st.label);
      addGo.addEventListener("click", submitAdd);
      addRow.appendChild(inp); addRow.appendChild(addGo);
      col.appendChild(addRow);

      var wrap = mk("div","lane");
      wrap.setAttribute("data-s", st.k);
      wrap.addEventListener("dragover", function(e){ e.preventDefault(); wrap.classList.add("over"); });
      wrap.addEventListener("dragleave", function(){ wrap.classList.remove("over"); });
      wrap.addEventListener("drop", function(e){
        e.preventDefault(); wrap.classList.remove("over");
        var id = dragId || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
        if (!id) return;
        placeTask(id, st.k, dropIndex(wrap, e.clientY));
        dragId = null; refresh();
      });
      if (!l.length) wrap.appendChild(mk("div","none","nothing yet"));
      for (var i=0;i<l.length;i++) wrap.appendChild(taskRow(l[i], st, i, l.length));
      col.appendChild(wrap);
      host.appendChild(col);
    })(ST[s]);
  }
}
function dropIndex(wrap,y){
  var rows = wrap.querySelectorAll(".t");
  for (var i=0;i<rows.length;i++){
    var r = rows[i].getBoundingClientRect ? rows[i].getBoundingClientRect() : null;
    if (r && y < r.top + r.height/2) return i;
  }
  return rows.length;
}
function taskRow(task, st, idx, total){
  var n = mk("div","t s-" + st.k);
  n.setAttribute("draggable","true");
  n.setAttribute("data-id", task.id);
  n.style.transform = "rotate(" + tilt(task.id) + "deg)";
  n.addEventListener("dragstart", function(e){
    dragId = task.id; n.classList.add("dragging");
    if (e.dataTransfer){ e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; }
  });
  n.addEventListener("dragend", function(){ n.classList.remove("dragging"); dragId = null; });
  n.appendChild(mk("span","grip","\u2807"));

  var txt = mk("span","txt", task.text);
  txt.title = task.text + "\nTo do: " + (task.ts.todo || "-") +
              "  |  In progress: " + (task.ts.doing || "-") + "  |  Done: " + (task.ts.done || "-");
  /* click the text to rename. The old behaviour was double-click only, which
     is undiscoverable, and on touch it did nothing at all. */
  txt.addEventListener("click", function(){ inlineEdit(n, txt, task); });
  /* txt is appended AFTER ops, further down. The controls are a right-hand
     float, and a line box only flows around a float that precedes it in the
     source. With the old order the controls narrowed every line of the task
     instead of just the first, so line two stopped short of the right edge for
     no reason. Source order here is grip, ops, txt; the float puts ops back in
     the top right visually. */

  var ops = mk("div","ops");
  ops.appendChild(opBtn("\u270e","Rename", false, function(){ inlineEdit(n, txt, task); }));
  ops.appendChild(opBtn("\u25b2","Move up",   idx === 0,       function(){ nudge(task.id,-1); refresh(); }));
  ops.appendChild(opBtn("\u25bc","Move down", idx === total-1, function(){ nudge(task.id, 1); refresh(); }));
  ops.appendChild(opBtn("\u2190","Move left", st.k === "todo", function(){ shiftStatus(task.id,-1); refresh(); }));
  ops.appendChild(opBtn("\u2192","Move right",st.k === "done", function(){ shiftStatus(task.id, 1); refresh(); }));
  ops.appendChild(opBtn("\u{1F4C5}","Move to another day", false, function(){
    var inp = document.createElement("input");
    inp.type = "date"; inp.value = task.date;
    inp.style.cssText = "position:absolute;opacity:0;width:1px;height:1px;pointer-events:none";
    n.appendChild(inp);
    inp.addEventListener("change", function(){
      if (inp.value){ moveTaskToDate(task.id, inp.value); refresh(); }
    });
    if (inp.showPicker){ try { inp.showPicker(); return; } catch (e){} }
    inp.click();
  }));
  var x = opBtn("\u00d7","Delete", false, function(){ delTask(task.id); refresh(); });
  x.className = "op x";
  ops.appendChild(x);
  n.appendChild(ops);
  n.appendChild(txt);   /* after ops, so the text flows around the float */
  return n;
}
function opBtn(label,title,disabled,fn){
  var b = mk("button","op",label);
  b.type = "button"; b.title = title; b.setAttribute("aria-label", title);
  b.disabled = !!disabled;
  b.addEventListener("click", fn);
  return b;
}
function tilt(id){
  var h = 0;
  for (var i=0;i<id.length;i++) h = (h*31 + id.charCodeAt(i))|0;
  return ((((h % 1000)+1000)%1000)/1000*2 - 1).toFixed(2);
}
function inlineEdit(row, txt, task){
  var inp = document.createElement("input");
  inp.type = "text"; inp.className = "edit"; inp.value = task.text;
  row.replaceChild(inp, txt);
  if (inp.focus) inp.focus();
  function done(keep){
    var v = inp.value.trim();
    if (keep && v){ task.text = v; commit("tasks"); }
    refresh();
  }
  inp.addEventListener("blur", function(){ done(true); });
  inp.addEventListener("keydown", function(e){
    if (e.key === "Enter") done(true);
    if (e.key === "Escape") done(false);
  });
}

/* ---------- READ-ONLY week / month ---------- */
function renderReadOnly(host, dates){
  host.className = "ro";
  host.innerHTML = "";
  var nowISO = iso(today());
  for (var s=0;s<ST.length;s++){
    var st = ST[s];
    var c = mk("div","rc");
    c.setAttribute("data-s", st.k);
    var h = mk("div","rh " + st.cls);
    h.appendChild(mk("span", null, st.label));
    var cnt = mk("span","n","0");
    h.appendChild(cnt); c.appendChild(h);
    var list = mk("div","rlist");        /* scrolls at the same height as a kanban lane */
    c.appendChild(list);
    var n = 0;
    for (var i=0;i<dates.length;i++){
      var l = lane(dates[i], st.k);
      for (var j=0;j<l.length;j++){
        (function(task, ds){
          var r = mk("button","rr" + (ds === nowISO ? " now" : ""));
          r.type = "button"; r.title = "Open " + ds + " on the day board";
          r.appendChild(mk("span","d", ds.slice(5)));
          var t2 = mk("span","t2", task.text); t2.title = task.text;
          r.appendChild(t2);
          r.addEventListener("click", function(){ setScope("day"); setDate(ds); });
          list.appendChild(r);
        })(l[j], dates[i]);
        n++;
      }
    }
    cnt.textContent = String(n);
    if (!n) list.appendChild(mk("div","none","nothing yet"));
    host.appendChild(c);
  }
}

/* ---------- WEEK GRID: one component, two densities, identical cells ---------- */
function renderWeekGrid(o){
  var g = mk("div","wg " + (o.compact ? "c" : "full"));
  var yh = mk("div","yh", o.label || "");
  if (o.monthHint){ var mo = mk("span","mo", o.monthHint); yh.appendChild(mo); }
  if (o.sublabel){ var sl = mk("span","sub", o.sublabel); yh.appendChild(sl); }
  g.appendChild(yh);
  g.appendChild(mk("div","dh","Wk"));
  var lab = dowLabels();
  for (var i=0;i<7;i++){
    var dow = (cfg.weekStart + i) % 7;               // 0=Sun .. 6=Sat
    var dh = mk("div","dh" + (dow === 0 || dow === 6 ? " wknd" : ""), lab[i]);
    g.appendChild(dh);
  }
  var nowISO = iso(today());
  /* count tasks per date once, not once per cell - a 3-year calendar is ~1100 cells */
  var tally = {};
  for (var q=0;q<tasks.length;q++){
    var td = tasks[q].date;
    (tally[td] || (tally[td] = [])).push(tasks[q].text);
  }
  for (var w=0;w<o.weeks.length;w++){
    (function(week){
      var b = mk("button","wk", String(week.num));
      b.type = "button";
      b.title = "Week " + week.num + " of " + week.year + " - open it on the board";
      b.addEventListener("click", function(){ openWeek(week); });
      g.appendChild(b);
      for (var d=0;d<7;d++){
        (function(day){
          var ds = iso(day);
          var dow = day.getDay();
          var cell = mk("button","dc" + (dow === 0 || dow === 6 ? " wknd" : ""), mmdd(day));
          cell.type = "button";
          var rec = notes[ds];
          var hasCat = rec && rec.color !== null && rec.color !== undefined;
          if (hasCat) cell.className += " k" + rec.color;      /* whole cell takes the colour */
          if (day.getFullYear() !== week.year && !hasCat) cell.className += " out";
          if (ds === nowISO) cell.className += " now";
          var tc = tally[ds] ? tally[ds].length : 0;
          if (tc) cell.appendChild(mk("span","task"));
          if (rec && rec.note) cell.appendChild(mk("span","pen","\u270e"));
          var hol = holidayOn(ds);
          if (hol) cell.className += (hol[1] === 0 ? " hol-nat" : " hol-reg");
          var tip = [ds];
          if (hol) tip.push(hol[0] + (hol[1] === 0 ? "" : " (regional)"));
          if (hasCat) tip.push(cfg.catLabels[rec.color]);
          if (rec && rec.note) tip.push("\u270e " + rec.note);
          if (tc){
            var names = tally[ds].slice(0,4);
            tip.push(names.map(function(n){ return "\u2022 " + n; }).join("\n") +
                     (tc > 4 ? "\n\u2026 and " + (tc-4) + " more" : ""));
          }
          cell.title = tip.join("\n");
          cell.addEventListener("click", function(){ openDay(ds); });
          g.appendChild(cell);
        })(week.days[d]);
      }
    })(o.weeks[w]);
  }
  return g;
}

/* ---------- BOARD ---------- */
function renderDayNote(){
  if (!el.bnote) return;
  var show = (cfg.scope === "day");
  el.bnoteWrap.classList.toggle("hidden", !show);
  if (!show) return;
  var rec = notes[sel];
  el.bnote.value = (rec && rec.note) || "";
  el.bnoteWrap.classList.toggle("filled", !!el.bnote.value);
}
function renderBoard(){
  el.isoOut.textContent = sel;
  el.dInput.value = sel;
  renderCarry();
  var d = parseISO(sel), wk = weekOf(sel);
  if (cfg.scope === "day"){
    el.metaOut.textContent = DOW[d.getDay()] + (wk ? " · Week " + wk.num : "");
    renderKanban(el.scopeHost, sel);
  } else if (cfg.scope === "week"){
    var ds = [];
    for (var i=0;i<7;i++) ds.push(iso(addDays(sow(d), i)));
    el.metaOut.textContent = (wk ? "Week " + wk.num + " · " : "") + "read-only";
    renderReadOnly(el.scopeHost, ds);
  } else {
    el.metaOut.textContent = MON3[d.getMonth()] + " " + d.getFullYear() + " · read-only";
    renderReadOnly(el.scopeHost, daysOfMonth(sel));
  }
  renderDayNote();
  renderGlance();
}
function renderCarry(){
  el.carryHost.innerHTML = "";
  var nowISO = iso(today());
  if (sel !== nowISO || carryHidden[nowISO] || cfg.scope !== "day") return;
  var prev = iso(addDays(today(),-1));
  var open = tasks.filter(function(t){ return t.date === prev && t.status !== "done"; });
  if (!open.length) return;
  var bar = mk("div");
  bar.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;" +
    "padding:5px 9px;background:var(--doingF);border:1px solid var(--doingE);border-left:3px solid var(--doing)";
  bar.appendChild(mk("span", null, open.length + (open.length === 1 ? " task" : " tasks") +
                                   " still open from " + prev));
  var move = mk("button","btn","Move to today"); move.type = "button";
  move.addEventListener("click", function(){
    /* Set the date first, THEN renumber. Reading lane() inside the loop counted
       the task that had just been moved in, handing two tasks the same order. */
    for (var i=0;i<open.length;i++){
      open[i].date = nowISO;
      open[i].order = 99999 + i;      /* keep their relative order, park at the end */
    }
    renumber(prev,"todo");   renumber(prev,"doing");
    renumber(nowISO,"todo"); renumber(nowISO,"doing");
    commit("tasks"); refresh();
  });
  var no = mk("button","btn","Dismiss"); no.type = "button";
  no.addEventListener("click", function(){ carryHidden[nowISO] = true; renderCarry(); });
  bar.appendChild(move); bar.appendChild(no);
  el.carryHost.appendChild(bar);
}
function renderGlance(){
  el.glanceBox.classList.toggle("folded", !cfg.glanceOpen);
  el.glFold.textContent = cfg.glanceOpen ? "\u25be" : "\u25b8";
  el.glFold.setAttribute("aria-expanded", cfg.glanceOpen ? "true" : "false");
  el.gyLabel.textContent = String(glanceYear);
  if (!cfg.glanceOpen){ el.glance.innerHTML = ""; return; }
  var wks = weeksForYear(glanceYear), size = Math.ceil(wks.length/3);
  el.gyLabel.textContent = String(glanceYear);
  var cy = today().getFullYear();
  el.gyPrev.disabled = glanceYear <= cy - CAP;
  el.gyNext.disabled = glanceYear >= cy + CAP;
  el.glance.innerHTML = "";
  for (var c=0;c<3;c++){
    var slice = wks.slice(c*size, (c+1)*size);
    if (!slice.length) continue;
    el.glance.appendChild(renderWeekGrid({
      label: monthSpan(slice),
      sublabel: "Wk " + slice[0].num + "\u2013" + slice[slice.length-1].num,
      weeks: slice, compact:true
    }));
  }
}

/* ---------- CALENDAR ---------- */
var calFocus = null;   /* the single year a narrow screen shows */
function calYears(){
  var cy = today().getFullYear();
  /* On a phone only one year is shown, so the range IS that year. Rendering
     three and hiding two left the arrows apparently dead: they moved the range
     while the focused year stayed put. */
  if (narrow()){
    var f = (calFocus === null) ? cy : calFocus;
    f = Math.min(cy+CAP, Math.max(cy-CAP, f));
    return { from:f, to:f };
  }
  return { from:Math.max(cy-CAP, cy-cfg.back+cfg.shift), to:Math.min(cy+CAP, cy+cfg.fwd+cfg.shift) };
}
function stepGlance(d){
  var cy = today().getFullYear();
  glanceYear = Math.min(cy+CAP, Math.max(cy-CAP, glanceYear + d));
  renderGlance();
}
function stepCal(d){
  var cy = today().getFullYear();
  if (narrow()){
    var f = ((calFocus === null) ? cy : calFocus) + d;
    calFocus = Math.min(cy+CAP, Math.max(cy-CAP, f));
    renderCalendar();
    return;
  }
  var r = calYears();
  if (d < 0 && r.from <= cy-CAP) return;
  if (d > 0 && r.to   >= cy+CAP) return;
  cfg.shift = Math.min(CAP, Math.max(-CAP, cfg.shift + d));
  commit("cfg"); renderCalendar();
}
function renderCalendar(){
  var r = calYears(), cy = today().getFullYear();
  el.cyLabel.textContent = r.from === r.to ? String(r.from) : (r.from + "-" + r.to);
  el.cyPrev.disabled = r.from <= cy-CAP;
  el.cyNext.disabled = r.to   >= cy+CAP;
  el.rail.innerHTML = "";
  /* A phone shows ONE year (CSS hides the rest) - three stacked years is
     unusable, and reordering them produced a nonsense 2026/2025/2027 sequence.
     Focus the current year when it is in range; otherwise the middle of the
     range, so panning with the arrows never leaves the view blank. */
  var focus = (cy >= r.from && cy <= r.to) ? cy : Math.floor((r.from + r.to) / 2);
  for (var y=r.from;y<=r.to;y++){
    var g = renderWeekGrid({ label:String(y), weeks:weeksForYear(y), compact:false,
                             monthHint:"Jan\u2013Dec" });
    if (y === focus) g.className += " focusyear";
    el.rail.appendChild(g);
  }
}

/* ---------- RIGHT RAIL ---------- */
/* --------------------------------------------------------------------------
   SEARCH - lives in an overlay so it costs no permanent screen space.
   Opens with the magnifier or the "/" key.
   -------------------------------------------------------------------------- */
function openSearch(){
  el.sov.classList.remove("hidden");
  el.sInput.value = ""; el.sOut.innerHTML = "";
  if (el.sInput.focus) el.sInput.focus();
}
function closeSearch(){ el.sov.classList.add("hidden"); }
function runSearch(){
  var q = (el.sInput.value || "").trim().toLowerCase();
  el.sOut.innerHTML = "";
  if (q.length < 2){
    el.sOut.appendChild(mk("div","none","Type at least two characters."));
    return;
  }
  var hits = [];
  for (var i=0;i<tasks.length && hits.length<200;i++)
    if ((tasks[i].text || "").toLowerCase().indexOf(q) > -1)
      hits.push({ date:tasks[i].date, kind:ST[stIndex(tasks[i].status)].label, text:tasks[i].text });
  Object.keys(notes).forEach(function(ds){
    var n = notes[ds] && notes[ds].note;
    if (n && n.toLowerCase().indexOf(q) > -1) hits.push({ date:ds, kind:"Day note", text:n });
  });
  hits.sort(function(a,b){ return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  if (!hits.length){
    el.sOut.appendChild(mk("div","none","Nothing found for \u201c" + q + "\u201d."));
    return;
  }
  el.sOut.appendChild(mk("div","scount", hits.length + (hits.length===1?" result":" results")));
  for (var h=0;h<hits.length;h++){
    (function(hit){
      var r = mk("button","srow"); r.type = "button";
      r.appendChild(mk("span","sdate", hit.date));
      r.appendChild(mk("span","skind", hit.kind));
      var tx = mk("span","stext", hit.text); tx.title = hit.text;
      r.appendChild(tx);
      r.addEventListener("click", function(){
        closeSearch(); setScope("day"); setView("board"); setDate(hit.date);
      });
      el.sOut.appendChild(r);
    })(hits[h]);
  }
}
function renderRail(){
  el.cats.innerHTML = "";
  for (var i=0;i<CATS.length;i++){
    (function(idx){
      var row = mk("div","cat");
      var dot = mk("i"); dot.style.background = CATS[idx];
      var inp = document.createElement("input");
      inp.type = "text"; inp.value = cfg.catLabels[idx];
      inp.setAttribute("aria-label","Rename category " + (idx+1) + " (currently " + cfg.catLabels[idx] + ")");
      inp.title = "Click to rename";
      inp.addEventListener("change", function(){
        cfg.catLabels[idx] = inp.value.trim() || DEF.catLabels[idx];
        commit("cfg"); renderCalendar(); renderGlance();
      });
      row.appendChild(dot); row.appendChild(inp);
      row.appendChild(mk("span","pen","\u270e"));
      el.cats.appendChild(row);
    })(i);
  }
  renderTracked();
}
function renderTracked(){
  el.tkList.innerHTML = "";
  if (!track.length) return;   /* the form below is self-explanatory */
  var soon = null;
  for (var j=0;j<track.length;j++){
    var dd = entryDays(track[j]);
    if (dd <= 0 && (soon === null || dd > entryDays(soon))) soon = track[j];
  }
  var sorted = track.slice().sort(function(a,b){ return entryDays(b) - entryDays(a); });
  for (var i=0;i<sorted.length;i++){
    (function(e){
      var box = mk("div","tk" + (soon && e.id === soon.id ? " next" : ""));
      var lb = document.createElement("input");
      lb.type = "text"; lb.className = "tkl"; lb.value = e.label;
      lb.title = e.date + " - click to rename";
      lb.setAttribute("aria-label","Rename countdown " + e.label);
      lb.addEventListener("change", function(){
        var v = lb.value.trim();
        if (v){ e.label = v; } else { lb.value = e.label; }
        commit("track"); renderTracked();
      });
      lb.addEventListener("keydown", function(ev){
        if (ev.key === "Enter") lb.blur();
        if (ev.key === "Escape"){ lb.value = e.label; lb.blur(); }
      });
      box.appendChild(lb);
      var row = mk("div","tkr");
      row.appendChild(mk("span","tkc" + (entryDays(e) < 0 ? " fut" : ""), countText(e)));
      var sel2 = document.createElement("select");
      sel2.setAttribute("aria-label","Count " + e.label + " in");
      ["days","weeks","months","years"].forEach(function(u){
        var o = document.createElement("option");
        o.value = u; o.textContent = u;
        if ((e.unit || "days") === u) o.selected = true;
        sel2.appendChild(o);
      });
      sel2.addEventListener("change", function(){ e.unit = sel2.value; commit("track"); renderTracked(); });
      row.appendChild(sel2);
      var x = mk("button","x","\u00d7"); x.type = "button"; x.title = "Remove " + e.label;
      x.addEventListener("click", function(){
        track = track.filter(function(t){ return t.id !== e.id; });
        commit("track"); renderTracked();
      });
      row.appendChild(x);
      box.appendChild(row);
      el.tkList.appendChild(box);
    })(sorted[i]);
  }
}
function addTracked(){
  var lb = el.tLabel.value.trim(), dt = el.tDate.value.trim();
  el.tErr.classList.add("hidden");
  if (!lb){ el.tErr.textContent = "Add a label first."; el.tErr.classList.remove("hidden"); return; }
  if (!parseISO(dt)){ el.tErr.textContent = "Use yyyy-mm-dd.";
                      el.tErr.classList.remove("hidden"); return; }
  track.push({ id:uid(), label:lb, date:dt,
               unit:el.tUnit.value });
  commit("track");
  el.tLabel.value = ""; el.tDate.value = "";
  renderTracked();
}

/* ---------- day popup ---------- */
function openDay(ds){
  mDate = ds; sel = ds; cfg.lastDate = ds; commit("cfg");
  var d = parseISO(ds), wk = weekOf(ds);
  el.mDate.textContent = ds;
  var hol = holidayOn(ds);
  el.mWk.textContent = DOW[d.getDay()] + (wk ? "  ·  Week " + wk.num + ", " + wk.year : "") +
                       (hol ? "  ·  " + hol[0] + (hol[1] === 1 ? " (regional)" : "") : "");
  renderSw();
  el.mNote.value = (notes[ds] && notes[ds].note) || "";
  /* snapshot so Cancel has something to restore */
  var nrec = notes[ds] || { color:null, note:"" };
  nrec.noteBefore = nrec.note || "";
  notes[ds] = nrec;
  renderKanban(el.mKb, ds);
  el.ov.classList.remove("hidden");
}
function closeDay(){ el.ov.classList.add("hidden"); mDate = null; refresh(); }
function renderSw(){
  el.mSw.innerHTML = "";
  var rec = notes[mDate] || {};
  for (var i=0;i<CATS.length;i++){
    (function(idx){
      var b = mk("button","dab" + (rec.color === idx ? " on" : ""));
      b.type = "button"; b.style.background = CATS[idx];
      b.title = cfg.catLabels[idx];
      b.setAttribute("aria-label","Mark as " + cfg.catLabels[idx]);
      b.addEventListener("click", function(){
        var r = notes[mDate] || { color:null, note:"" };
        r.color = (r.color === idx) ? null : idx;
        notes[mDate] = r; commit("notes"); renderSw();
      });
      el.mSw.appendChild(b);
      el.mSw.appendChild(mk("span","none", cfg.catLabels[idx]));
    })(i);
  }
  var c = mk("button","btn","No colour"); c.type = "button";
  c.addEventListener("click", function(){
    var r = notes[mDate] || { color:null, note:"" };
    r.color = null; notes[mDate] = r; commit("notes"); renderSw();
  });
  el.mSw.appendChild(c);
}

/* ---------- navigation ---------- */
function setView(v){
  cfg.view = v; commit("cfg");
  var b = (v === "board");
  el.boardView.classList.toggle("hidden", !b);
  el.calView.classList.toggle("hidden", b);
  el.scopeSeg.classList.toggle("hidden", !b);   /* day/week/month means nothing on the calendar */
  el.metaOut.classList.toggle("hidden", !b);
  var links = document.querySelectorAll(".sitenav a[data-view]");
  for (var i=0;i<links.length;i++)
    links[i].classList.toggle("on", links[i].getAttribute("data-view") === v);
  viewHash(v);
  if (b) renderBoard(); else renderCalendar();
}
function setScope(s){ cfg.scope = s; commit("cfg"); segOn(el.scopeSeg,"scope",s); renderBoard(); }
function setDate(ds){
  if (!parseISO(ds)) return;
  sel = ds; cfg.lastDate = ds; commit("cfg"); renderBoard();
}
function knownCountry(code){
  for (var i=0;i<COUNTRIES.length;i++) if (COUNTRIES[i][0] === code) return true;
  return false;
}
function setCountry(code){
  cfg.country = code || ""; commit("cfg");
  loadHolidays(cfg.country);
  if (cfg.view === "calendar") viewHash("calendar");
}
/* The address bar mirrors what is on screen, so copying it shares that view. */
function viewHash(v){
  var suffix = (v === "calendar" && cfg.country) ? "/" + cfg.country : "";
  var curHash = window.location.hash || "";
  if (curHash.indexOf("access_token") >= 0 || curHash.indexOf("error_description") >= 0) return;
  try { history.replaceState(null, "", "#" + v + suffix); } catch (e){}
}
function setWeekStart(v){
  v = parseInt(v,10); if (isNaN(v) || v < 0 || v > 6) v = 0;
  cfg.weekStart = v; commit("cfg");
  el.wsSel.value = String(cfg.weekStart);
  renderAll();
}
function segOn(host,attr,val){
  var b = host.children;
  for (var i=0;i<b.length;i++) b[i].classList.toggle("on", b[i].getAttribute("data-"+attr) === val);
}
function openWeek(week){
  var t = today();
  var inWeek = t >= week.start && t <= addDays(week.start,6);
  sel = iso(inWeek ? t : week.start); cfg.lastDate = sel;
  cfg.scope = "week"; commit("cfg");
  segOn(el.scopeSeg,"scope","week");
  setView("board");
}
function refresh(){
  renderBoard();
  if (mDate) renderKanban(el.mKb, mDate);
  if (!el.calView.classList.contains("hidden")) renderCalendar();
  renderRail();
}
function renderAll(){ renderBoard(); renderCalendar(); renderRail(); }

/* ---------- data actions ---------- */
function download(name,text,mime){
  try {
    var url = URL.createObjectURL(new Blob([text],{type:mime}));
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  } catch (e){ alert("This browser blocked the download."); }
}
function cell(v){ return '"' + String(v === null || v === undefined ? "" : v).replace(/"/g,'""') + '"'; }
function exportCsv(){
  var rows = [["date","status","priority","task","entered_todo","entered_in_progress",
               "entered_done","day_colour","day_note"]];
  var s = tasks.slice().sort(function(a,b){
    return a.date < b.date ? -1 : a.date > b.date ? 1 :
           stIndex(a.status)-stIndex(b.status) || a.order-b.order; });
  var seen = {};
  function noteOf(ds){ var r = notes[ds]; return r && r.note ? r.note : ""; }
  function colourOf(ds){
    var r = notes[ds];
    return (r && r.color !== null && r.color !== undefined) ? cfg.catLabels[r.color] : "";
  }
  for (var i=0;i<s.length;i++){
    seen[s[i].date] = 1;
    rows.push([s[i].date, s[i].status, s[i].order+1, s[i].text, s[i].ts.todo, s[i].ts.doing,
               s[i].ts.done, colourOf(s[i].date), noteOf(s[i].date)]);
  }
  /* a day can carry a note or a colour with no tasks at all - still export it */
  var extra = Object.keys(notes).filter(function(ds){
    return !seen[ds] && (noteOf(ds) || colourOf(ds));
  }).sort();
  for (var e=0;e<extra.length;e++)
    rows.push([extra[e],"","","","","","", colourOf(extra[e]), noteOf(extra[e])]);
  download("inmycalendar-tasks-" + iso(today()) + ".csv",
           rows.map(function(r){ return r.map(cell).join(","); }).join("\r\n"), "text/csv");
}
function exportJson(){
  download("inmycalendar-backup-" + iso(today()) + ".json",
    JSON.stringify({ app:"inmycalendar", version:4, exported:iso(today()),
                     cfg:cfg, tasks:tasks, notes:notes, track:track }, null, 2), "application/json");
}
function importJson(file){
  var r = new FileReader();
  r.onload = function(){
    var data;
    try { data = JSON.parse(String(r.result)); }
    catch (e){ alert("That file isn't valid JSON, so nothing was changed."); return; }
    var nT = Array.isArray(data.tasks) ? data.tasks.length : 0;
    var nN = data.notes ? Object.keys(data.notes).length : 0;
    var nK = Array.isArray(data.track) ? data.track.length : 0;
    if (!confirm("Replace what's here with " + nT + " tasks, " + nN + " day notes and " +
                 nK + " tracked dates from this file?")) return;
    if (Array.isArray(data.tasks)){ tasks = data.tasks; migrate(); commit("tasks"); }
    if (data.notes && typeof data.notes === "object"){ notes = data.notes; commit("notes"); }
    if (Array.isArray(data.track)){ track = data.track; commit("track"); }
    if (data.cfg && typeof data.cfg === "object"){
      cfg = Object.assign({}, DEF, data.cfg); commit("cfg");
      el.wsSel.value = String(cfg.weekStart);
    }
    renderAll(); setView(cfg.view === "calendar" ? "calendar" : "board");
  };
  r.readAsText(file);
}
function wipe(){
  if (!confirm("Delete every task, note and tracked date in this browser? This can't be undone.")) return;
  tasks = []; notes = {}; track = []; carryHidden = {};
  commit("tasks"); commit("notes"); commit("track");
  renderAll(); setView(cfg.view);
}
function rangeLabel(){
  if (el.rgLabel) el.rgLabel.textContent = "Showing " + (cfg.back + cfg.fwd + 1) + " years (limit ±" + CAP + ")";
  el.rgBack.disabled = cfg.back >= CAP;
  el.rgFwd.disabled  = cfg.fwd  >= CAP;
}
function applyAds(){
  el.adRail.classList.toggle("hidden", !cfg.ads);
  el.adFoot.classList.toggle("hidden", !cfg.ads);
  el.adAnchor.classList.toggle("hidden", !cfg.ads);
}
function migrate(){
  for (var i=0;i<tasks.length;i++){
    var t = tasks[i];
    if (!t.ts) t.ts = { todo:null, doing:null, done:null };
    if (typeof t.order !== "number") t.order = i;
  }
}

/* ---------- boot ---------- */
function cacheEls(){
  var ids = ["dPrev","dPick","dInput","isoOut","dNext","dToday","metaOut","scopeSeg",
    "wsSel","wkRule","ctrySel","holReg","rgLabel","rgBack","rgFwd","rgReset","adToggle","expCsv","expJson","impJson","impFile","wipe",
    "boardView","calView","carryHost","scopeHost","gyPrev","gyLabel","gyNext","glance",
    "cyPrev","cyLabel","cyNext","rail","cats","tkList","glanceBox","glFold","bnote","bnoteWrap","bnoteDone","bnoteClear","bnoteCancel","bnoteX","tLabel","tDate","tUnit","tPick","tNative","tAdd","tErr",
    "ov","mDate","mWk","mClose","mDone","mCancel","mClear","sov","sInput","sOut","sClose","searchBtn","mClear","mSw","mNote","mKb","adRail","adFoot","adAnchor"];
  for (var i=0;i<ids.length;i++) el[ids[i]] = $(ids[i]);
}
function typing(e){
  var n = e.target;
  return n && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT");
}
function wire(){
  el.dPrev.addEventListener("click", function(){ setDate(iso(addDays(parseISO(sel),-1))); });
  el.dNext.addEventListener("click", function(){ setDate(iso(addDays(parseISO(sel), 1))); });
  el.dToday.addEventListener("click", function(){ setDate(iso(today())); });
  el.dPick.addEventListener("click", function(){
    if (el.dInput.showPicker){ try { el.dInput.showPicker(); return; } catch (e){} }
    el.dInput.click();
  });
  el.dInput.addEventListener("change", function(){ setDate(el.dInput.value); });
  el.scopeSeg.addEventListener("click", function(e){
    var s = e.target.getAttribute && e.target.getAttribute("data-scope");
    if (s) setScope(s);
  });
  /* Board/Calendar now live in the site nav next to About/Contact/Privacy */
  document.querySelector(".sitenav").addEventListener("click", function(e){
    var v = e.target.getAttribute && e.target.getAttribute("data-view");
    if (!v) return;
    e.preventDefault(); setView(v);
  });

  el.glFold.addEventListener("click", function(){
    cfg.glanceOpen = !cfg.glanceOpen; commit("cfg"); renderGlance();
  });
  el.isoOut.addEventListener("click", function(){
    if (el.dInput.showPicker){ try { el.dInput.showPicker(); return; } catch (e){} }
    el.dInput.click();
  });
  el.gyPrev.addEventListener("click", function(){ stepGlance(-1); });
  el.gyNext.addEventListener("click", function(){ stepGlance( 1); });
  el.cyPrev.addEventListener("click", function(){ stepCal(-1); });
  el.cyNext.addEventListener("click", function(){ stepCal( 1); });


  el.wsSel.addEventListener("change", function(){ setWeekStart(el.wsSel.value); });
  el.ctrySel.addEventListener("change", function(){ setCountry(el.ctrySel.value); });
  el.wkRule.addEventListener("change", function(){
    cfg.weekRule = el.wkRule.value === "jan1" ? "jan1" : "thursday";
    commit("cfg"); renderAll();
  });
  el.holReg.addEventListener("change", function(){
    cfg.holRegional = el.holReg.checked; commit("cfg"); renderAll();
  });
  el.rgBack.addEventListener("click", function(){
    if (cfg.back < CAP) cfg.back += 1; commit("cfg"); rangeLabel(); renderCalendar();
  });
  el.rgFwd.addEventListener("click", function(){
    if (cfg.fwd < CAP) cfg.fwd += 1; commit("cfg"); rangeLabel(); renderCalendar();
  });
  el.rgReset.addEventListener("click", function(){
    cfg.back = 1; cfg.fwd = 1; cfg.shift = 0; commit("cfg"); rangeLabel(); renderCalendar();
  });

  el.expCsv.addEventListener("click", exportCsv);
  el.expJson.addEventListener("click", exportJson);
  el.impJson.addEventListener("click", function(){ el.impFile.click(); });
  el.impFile.addEventListener("change", function(){
    if (el.impFile.files && el.impFile.files[0]) importJson(el.impFile.files[0]);
    el.impFile.value = "";
  });
  el.wipe.addEventListener("click", wipe);

  el.tPick.addEventListener("click", function(){
    if (el.tNative.showPicker){ try { el.tNative.showPicker(); return; } catch (e){} }
    el.tNative.click();
  });
  el.tNative.addEventListener("change", function(){
    if (el.tNative.value) el.tDate.value = el.tNative.value;
  });
  el.tAdd.addEventListener("click", addTracked);
  el.tDate.addEventListener("keydown", function(e){ if (e.key === "Enter") addTracked(); });

  el.searchBtn.addEventListener("click", openSearch);
  el.sClose.addEventListener("click", closeSearch);
  el.sov.addEventListener("click", function(e){ if (e.target === el.sov) closeSearch(); });
  el.sInput.addEventListener("input", runSearch);
  el.sInput.addEventListener("keydown", function(e){
    if (e.key === "Enter"){ var f = el.sOut.querySelector(".srow"); if (f) f.click(); }
    if (e.key === "Escape") closeSearch();
  });
  el.mClose.addEventListener("click", closeDay);
  el.mDone.addEventListener("click", closeDay);
  el.mClear.addEventListener("click", function(){
    if (!mDate) return;
    var r = notes[mDate] || { color:null, note:"" };
    r.note = ""; notes[mDate] = r; commit("notes");
    el.mNote.value = "";
  });
  el.mCancel.addEventListener("click", function(){
    if (mDate){
      var r = notes[mDate];
      if (r && r.noteBefore !== undefined){
        r.note = r.noteBefore; delete r.noteBefore; commit("notes");
      }
    }
    closeDay();
  });
  el.mClear.addEventListener("click", function(){
    if (!mDate) return;
    el.mNote.value = "";
    var r = notes[mDate] || { color:null, note:"" };
    r.note = ""; notes[mDate] = r; commit("notes");
    el.mNote.focus();
  });
  el.ov.addEventListener("click", function(e){ if (e.target === el.ov) closeDay(); });
  el.bnote.addEventListener("input", function(){
    var r = notes[sel] || { color:null, note:"" };
    r.note = el.bnote.value; notes[sel] = r; commit("notes");
    el.bnoteWrap.classList.toggle("filled", !!el.bnote.value);
  });
  el.bnote.addEventListener("focus", function(){
    el.bnoteWrap.classList.add("editing");
    /* remember the text as it was, so Cancel has something to restore */
    var r = notes[sel] || { color:null, note:"" };
    r.noteBefore = r.note || "";
    notes[sel] = r;
  });
  el.bnote.addEventListener("blur", function(){
    /* keep the controls up if the click that blurred us was one of them */
    setTimeout(function(){
      var a = document.activeElement;
      if (a !== el.bnoteDone && a !== el.bnoteClear &&
          a !== el.bnoteCancel && a !== el.bnoteX) el.bnoteWrap.classList.remove("editing");
    }, 120);
    renderAll();
  });
  function closeNote(){ el.bnoteWrap.classList.remove("editing"); el.bnote.blur(); renderAll(); }
  /* Mouse users need mousedown: blur fires between mousedown and click, so a
     click-only handler reached a button the re-render had already replaced -
     that is why Done had to be pressed twice. Keyboard users only ever get a
     click (Enter on a focused button), so bind both and de-duplicate. */
  function onPress(node, fn){
    var last = 0;
    node.addEventListener("mousedown", function(e){ e.preventDefault(); last = Date.now(); fn(); });
    node.addEventListener("click", function(){ if (Date.now() - last > 400) fn(); });
  }
  /* mousedown, not click: blur fires between mousedown and click, and the old
     click handler was reaching a button the re-render had already replaced -
     which is why Done had to be pressed twice. */
  onPress(el.bnoteDone, closeNote);
  onPress(el.bnoteX, closeNote);
  /* Cancel puts back whatever was saved before this edit, then closes */
  onPress(el.bnoteCancel, function(){
    var rec = notes[sel];
    el.bnote.value = (rec && rec.noteBefore !== undefined) ? rec.noteBefore : ((rec && rec.note) || "");
    if (rec && rec.noteBefore !== undefined){
      rec.note = rec.noteBefore; delete rec.noteBefore; commit("notes");
    }
    closeNote();
  });
  onPress(el.bnoteClear, function(){
    el.bnote.value = "";
    var r = notes[sel] || { color:null, note:"" };
    r.note = ""; notes[sel] = r; commit("notes");
    el.bnoteWrap.classList.remove("filled");
    el.bnote.focus();
  });
  el.mNote.addEventListener("input", function(){
    if (!mDate) return;
    var r = notes[mDate] || { color:null, note:"" };
    r.note = el.mNote.value; notes[mDate] = r; commit("notes");
  });

  var wasNarrow = narrow();
  window.addEventListener("resize", function(){
    var n = narrow();
    if (n !== wasNarrow){ wasNarrow = n; renderAll(); }
  });
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape" && !el.sov.classList.contains("hidden")){ closeSearch(); return; }
    if (e.key === "Escape" && !el.ov.classList.contains("hidden")){ closeDay(); return; }
    if (e.key === "/" && !typing(e)){ openSearch(); e.preventDefault(); return; }
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k === "ArrowLeft"){ setDate(iso(addDays(parseISO(sel),-1))); e.preventDefault(); }
    else if (k === "ArrowRight"){ setDate(iso(addDays(parseISO(sel),1))); e.preventDefault(); }
    else if (k === "t" || k === "T") setDate(iso(today()));
    else if (k === "n" || k === "N"){
      setScope("day");
      var f = el.scopeHost.querySelector(".cadd");
      if (f && f.focus) f.focus();
      e.preventDefault();
    }
    else if (k === "1") setScope("day");
    else if (k === "2") setScope("week");
    else if (k === "3") setScope("month");
    else if (k === "b" || k === "B") setView("board");
    else if (k === "c" || k === "C") setView("calendar");
  });
}
function init(){
  openStore();   /* baseline the change journal before anything can commit */
  cfg = Object.assign({}, DEF, load(LS.cfg, {}));
  if (!Array.isArray(cfg.catLabels) || cfg.catLabels.length !== 4) cfg.catLabels = DEF.catLabels.slice();
  // one-time migration: replace the OLD placeholder defaults with the new ones,
  // but never touch labels the user actually customised.
  var OLD_SETS = [["Category 1","Category 2","Category 3","Category 4"],
                  ["Work","Personal","Travel","Important"],
                  ["Deadline","Travel","Leave","WFH"]];
  for (var oi=0; oi<OLD_SETS.length; oi++){
    if (cfg.catLabels.every(function(l,i){ return l === OLD_SETS[oi][i]; })){
      cfg.catLabels = DEF.catLabels.slice(); commit("cfg"); break;
    }
  }
  cfg.back  = Math.min(CAP, Math.max(0, cfg.back|0));
  cfg.fwd   = Math.min(CAP, Math.max(0, cfg.fwd|0));
  cfg.shift = 0;   /* the calendar opens on today, exactly as the glance does */
  if (typeof cfg.glanceOpen !== "boolean") cfg.glanceOpen = true;
  if (["day","week","month"].indexOf(cfg.scope) < 0) cfg.scope = "day";

  tasks = load(LS.tasks, []); if (!Array.isArray(tasks)) tasks = [];
  notes = load(LS.notes, {}); if (!notes || typeof notes !== "object") notes = {};
  track = load(LS.track, []); if (!Array.isArray(track)) track = [];
  migrate();
  sel = parseISO(cfg.lastDate) ? cfg.lastDate : iso(today());
  glanceYear = today().getFullYear();

  /* arriving from About/Contact/Privacy via index.html#board or #calendar */
  /* The Kanban Board is the landing page. A returning visitor whose last view
     was the Calendar should still arrive on the board - the board is what the
     app is for. An explicit #calendar link still opens the calendar. */
  /* #calendar/JP opens the calendar already showing Japan's holidays, so a
     link can be shared without a covering note saying "now pick your country
     from the dropdown". The country is the only part of the view worth putting
     in a link: everything else is personal data that lives on the device. */
  var h = (window.location.hash || "").replace("#","");
  var hashParts = h.split("/");
  var view = (hashParts[0] === "board" || hashParts[0] === "calendar") ? hashParts[0] : "board";
  var hashCountry = (hashParts[1] || "").toUpperCase();
  if (/^[A-Z]{2}$/.test(hashCountry) && knownCountry(hashCountry)) cfg.country = hashCountry;

  cacheEls();
  el.wsSel.value = String(cfg.weekStart);
  var opt = document.createElement("option");
  opt.value = ""; opt.textContent = "None";
  el.ctrySel.appendChild(opt);
  for (var ci=0; ci<COUNTRIES.length; ci++){
    var o = document.createElement("option");
    o.value = COUNTRIES[ci][0]; o.textContent = COUNTRIES[ci][1];
    el.ctrySel.appendChild(o);
  }
  el.ctrySel.value = cfg.country || "";
  el.holReg.checked = !!cfg.holRegional;
  el.wkRule.value = cfg.weekRule === "jan1" ? "jan1" : "thursday";
  wire();
  rangeLabel();
  applyAds();
  segOn(el.scopeSeg,"scope",cfg.scope);
  renderAll();
  setView(view);
  if (cfg.country) loadHolidays(cfg.country);
}

init();   /* only top-level call, and the last line - every binding above already exists */
