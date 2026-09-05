/* COUNTING, NOT TRACKING.
   ---------------------------------------------------------------------------
   There was no measurement of any kind on this site. Search Console shows what
   happens inside Google - impressions, clicks, which pages got indexed - and
   stops at the click. It cannot say whether anyone who arrived ever used the
   board. Without that, "did this change work" is unanswerable, and every
   decision about what to build next is a guess.

   THE CONSTRAINT THAT SHAPED THIS FILE

   privacy.html promises "no analytics". Breaking that quietly to gain a
   dashboard would be a bad trade: the promise is worth more than the numbers.

   So this carries NO IDENTIFIER OF ANY KIND. No cookie. No stored id. No
   session. No fingerprint. Two visits from the same person are indistinguishable
   from two visits by different people, by construction, because there is
   nothing in the payload that could tell them apart. That is the same standard
   errors.js already meets and privacy.html already describes for crash
   reports: "no stored identifier, cannot follow you between visits".

   WHAT IS GIVEN UP BY THAT
   Unique visitors and returning visitors. Both need visits linked to each
   other, which needs exactly the identifier this refuses to create. What is
   left is counts: how many views a page got, roughly where they came from, and
   how often the board was actually used. That is enough to answer the question
   that matters, and it is honest.

   WHAT IS SENT
     path   the page, without query or hash - the hash can hold an OAuth token
     ref    the referring HOST only, never the full URL, and never for links
            from this site to itself
     ev     "view", or an app event such as "task"
     w      screen width rounded to a bucket, for the mobile-vs-desktop split
   Nothing else. No user agent string, no screen fingerprint, no timings.

   IT MUST NEVER BREAK THE APP. Every path is wrapped, a failure is swallowed,
   and if there is no transport it does nothing at all. jsdom implements
   neither fetch nor sendBeacon, so under test this file is inert - which is
   deliberate, so the suite never posts anything anywhere.
   --------------------------------------------------------------------------- */
(function () {
  "use strict";

  /* Do Not Track and Global Privacy Control are requests not to be counted.
     Honouring them costs a little accuracy and is the whole point of the
     paragraph above. */
  try {
    var n = window.navigator || {};
    if (n.doNotTrack === "1" || n.globalPrivacyControl === true ||
        window.doNotTrack === "1" || n.msDoNotTrack === "1") return;
  } catch (e) { return; }

  function endpoint() {
    var url = window.IMC_SUPABASE_URL, key = window.IMC_SUPABASE_ANON_KEY;
    if (!url || !key || String(key).indexOf("PASTE_") === 0) return null;
    return { url: url + "/rest/v1/hits", key: key };
  }

  /* Width buckets, not the width. 390 is a phone and 1440 is a desktop; the
     exact pixel count is a fingerprinting signal and answers no question. */
  function widthBucket() {
    try {
      var w = window.innerWidth || 0;
      if (!w) return null;
      if (w < 480) return 360;
      if (w < 768) return 640;
      if (w < 1100) return 900;
      return 1400;
    } catch (e) { return null; }
  }

  /* The referring host only. A full referrer URL can carry a search query or a
     private path from the site someone came from, which is not ours to keep.
     Same-site referrers are dropped: they measure our own navigation, not
     where anyone came from. */
  function refHost() {
    try {
      if (!document.referrer) return null;
      var a = document.createElement("a");
      a.href = document.referrer;
      if (!a.hostname || a.hostname === window.location.hostname) return null;
      return a.hostname.slice(0, 120);
    } catch (e) { return null; }
  }

  /* No query, no hash. The hash is where an OAuth access token lands after a
     redirect, so sending it would be sending a credential to a table. */
  function cleanPath() {
    try {
      var p = window.location.pathname || "/";
      return p.slice(0, 200);
    } catch (e) { return "/"; }
  }

  function send(ev) {
    var e = endpoint();
    if (!e) return;
    var row = { path: cleanPath(), ev: String(ev).slice(0, 40),
                ref: refHost(), w: widthBucket() };
    var body = JSON.stringify([row]);
    var headers = {
      "apikey": e.key,
      "Authorization": "Bearer " + e.key,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    };
    try {
      if (typeof fetch === "function") {
        /* keepalive so a count survives the page closing, which is when a
           bounce is recorded and exactly the case worth knowing about. */
        fetch(e.url, { method: "POST", keepalive: true, headers: headers, body: body })
          ["catch"](function () { /* a failed count must never surface */ });
      }
    } catch (err) { /* nor must the attempt to send one */ }
  }

  /* One view per page load. Not per hash change: this app switches between the
     board and the calendar by changing the hash, and counting that as a new
     page would inflate every number and measure nothing real. */
  try { send("view"); } catch (e) {}

  /* The hook app.js uses for the one event that matters more than views:
     somebody actually put a task on the board. Guarded so that calling it can
     never be the thing that breaks the app. */
  window.imcStat = function (ev) {
    try { send(ev); } catch (e) {}
  };
})();
