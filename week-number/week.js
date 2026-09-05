/* Fills in today's week number and highlights its row.
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
      "  \u00b7  US week "+usW.num+"  \u00b7  today is "+isoOf(today);
  }
  var s=isoOf(sow(today,1));
  var row=document.querySelector('tr[data-iso-start="'+s+'"]');
  if (row){ row.className="nowrow"; }
})();
