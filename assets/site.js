"use strict";
/* Content pages only. There is no hidden menu any more — every nav link is
   visible in the ribbon at all widths — so this just marks the current page. */
(function(){
  var here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var links = document.querySelectorAll(".sitenav a[href]");
  for (var i = 0; i < links.length; i++){
    var href = (links[i].getAttribute("href") || "").split("#")[0].toLowerCase();
    if (href && href === here) links[i].classList.add("on");
  }
})();
