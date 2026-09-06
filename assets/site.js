"use strict";
/* Content pages only. There is no hidden menu any more - every nav link is
   visible in the ribbon at all widths - so this just marks the current page. */
(function(){
  var here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var links = document.querySelectorAll(".sitenav a[href]");
  for (var i = 0; i < links.length; i++){
    var href = (links[i].getAttribute("href") || "").split("#")[0].toLowerCase();
    if (href && href === here) links[i].classList.add("on");
  }
})();

/* FINDING A COUNTRY on the holidays index.

   246 links in a multi-column list, 4.7 screens of it on a phone, and no way
   to reach one except to scan for it. The input is phone-only - it is
   display:none above 640px, where four columns on a wide screen are scannable
   and the desktop page is deliberately not being changed - but the behaviour
   is harmless everywhere and lives here rather than inlined into a generated
   page, so there is one copy of it.

   Matching is case- and accent-insensitive so that typing "turkiye" finds
   "Turkiye" and "cote" finds "Cote d'Ivoire", which is most of the point on a
   phone keyboard. */
(function(){
  var box = document.getElementById("ctryFind");
  var list = document.getElementById("ctryList");
  var out = document.getElementById("ctryCount");
  if (!box || !list) return;

  var links = list.querySelectorAll("a");
  var keys = [];
  function fold(s){
    s = String(s).toLowerCase();
    /* Strip diacritics where the browser can; harmless where it cannot. */
    if (s.normalize) s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return s;
  }
  for (var i=0;i<links.length;i++) keys.push(fold(links[i].textContent));

  function apply(){
    var q = fold(box.value.trim());
    var shown = 0;
    for (var i=0;i<links.length;i++){
      var hit = !q || keys[i].indexOf(q) >= 0;
      links[i].classList.toggle("nomatch", !hit);
      if (hit) shown++;
    }
    if (out) out.textContent = q ? (shown + (shown === 1 ? " country" : " countries")) : "";
  }
  box.addEventListener("input", apply);
  /* A search input's own clear button fires "search", not "input", in Safari. */
  box.addEventListener("search", apply);
})();

/* WHICH TAB YOU ARE ON.
   The same job the site nav already does above, for the bar at the bottom.
   Holidays is the only content destination in the bar, and every holiday page
   lives under /holidays/, so the match is on the directory rather than on the
   filename - a country page should light the Holidays tab too. */
(function(){
  /* Matched on data-tab, not on the href. The Holidays tab points at
     "holidays/index.html" from the root, "../holidays/index.html" from
     /week-number/, and plain "index.html" from inside /holidays/ itself - so a
     URL comparison was always going to miss one of the three, and did: on every
     country page no tab lit up at all.

     The section is the directory, so a country page lights Holidays too. */
  var tab = document.querySelector('.tabbar [data-tab="holidays"]');
  if (tab && location.pathname.toLowerCase().indexOf("/holidays/") >= 0)
    tab.classList.add("on");
})();

/* LAND ON THE YEAR YOU ARE READING.
   The year strip runs 2015 to 2045 and scrolls sideways on a phone, so without
   this you arrive looking at 2015 with the year you asked for somewhere off to
   the right. Horizontal only - scrollIntoView would also scroll the PAGE down
   to it, which is the last thing wanted on arrival. */
(function(){
  var nav = document.querySelector(".yearnav");
  var now = nav && nav.querySelector(".on");
  if (!nav || !now) return;
  if (nav.scrollWidth <= nav.clientWidth) return;      /* it all fits; nothing to do */
  nav.scrollLeft = now.offsetLeft - (nav.clientWidth - now.offsetWidth) / 2;
})();
