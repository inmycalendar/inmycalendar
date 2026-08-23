/* Client-side error reporting.
   ---------------------------------------------------------------------------
   WHY THIS EXISTS
   A JavaScript error in a visitor's browser used to be invisible here. The
   board would stop responding, the person would close the tab, and nothing
   anywhere recorded it. The only detection mechanism was somebody bothering to
   send an email. This turns that into a row in a table.

   WHAT IT DELIBERATELY DOES NOT DO
   It is not analytics. It records errors, never page views, never clicks, and
   never anything about what a person wrote on their board.

   LOAD IT FIRST.
   This script has to be the first one on the page, because it can only report
   errors thrown after its handlers are installed. It has no dependencies for
   exactly that reason - it reads Supabase's URL and anon key off the window if
   auth.js has already defined them, and quietly does nothing if it has not.

   IN TESTS IT IS INERT.
   jsdom implements neither fetch nor sendBeacon, so send() finds no transport
   and stops. The queueing, scrubbing and capping logic is still reachable and
   tested through window.imcErrors.                                          */

(function () {
  "use strict";

  /* One page load produces at most this many reports. A page stuck in a loop
     that throws on every animation frame would otherwise file thousands. */
  var MAX_PER_LOAD = 8;

  /* Same error, twice, is one fact. Keyed on message+line so a genuinely
     different failure still gets through. */
  var seen  = {};
  var sent  = 0;
  var queue = [];
  var timer = null;

  /* Random per page load, kept in memory and never written to storage: it ties
     together the reports from one visit without identifying anybody, and
     without becoming a stored identifier that needs a consent banner. */
  var LOAD_ID = "L" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  /* The version this page was served with, taken from this script's own ?v=
     tag, so it cannot drift out of step with a hand-maintained constant. */
  var VERSION = (function () {
    try {
      var s = document.currentScript && document.currentScript.src;
      var m = s && s.match(/[?&]v=([^&]+)/);
      return m ? m[1].slice(0, 20) : "";
    } catch (e) { return ""; }
  })();

  /* --- scrubbing -----------------------------------------------------------
     Everything below leaves the browser, so everything below is cleaned first. */

  /* Path only. NEVER the query string and NEVER the fragment: after an OAuth
     round trip the fragment holds a live access_token, and logging the full
     URL would copy session tokens into a table. */
  function scrubUrl(href) {
    if (!href) return "";
    var s = String(href);
    var hash = s.indexOf("#"); if (hash >= 0) s = s.slice(0, hash);
    var q    = s.indexOf("?"); if (q    >= 0) s = s.slice(0, q);
    return s.slice(0, 300);
  }

  /* Error text is written by whatever threw, including third-party code, so it
     can carry a token or an address. Strip both before it is stored. */
  function scrubText(t, cap) {
    if (t === null || t === undefined) return "";
    var s = String(t);
    s = s.replace(/(access_token|refresh_token|apikey|api_key|token|password)=[^&\s"']+/gi, "$1=[removed]");
    s = s.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, "[jwt removed]");
    s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email removed]");
    return s.slice(0, cap);
  }

  /* --- queueing ----------------------------------------------------------- */

  function record(row) {
    if (sent >= MAX_PER_LOAD) return false;

    var key = row.kind + "|" + row.message + "|" + row.line;
    if (seen[key]) return false;
    seen[key] = true;

    sent++;
    queue.push({
      kind:        row.kind === "unhandledrejection" ? "unhandledrejection" : "error",
      message:     scrubText(row.message, 500) || "(no message)",
      source:      scrubUrl(row.source),
      line:        Math.max(0, Math.min(10000000, parseInt(row.line, 10) || 0)),
      col:         Math.max(0, Math.min(10000000, parseInt(row.col,  10) || 0)),
      stack:       scrubText(row.stack, 4000),
      page:        scrubUrl(location.href),
      ua:          String(navigator.userAgent || "").slice(0, 300),
      app_version: VERSION,
      load_id:     LOAD_ID
    });

    if (!timer) timer = setTimeout(flush, 1000);   /* batch a burst into one POST */
    return true;
  }

  /* --- sending ------------------------------------------------------------ */

  function flush() {
    timer = null;
    if (!queue.length) return;

    var url = window.IMC_SUPABASE_URL, key = window.IMC_SUPABASE_ANON_KEY;
    if (!url || !key || key.indexOf("PASTE_") === 0) { queue.length = 0; return; }
    if (typeof fetch !== "function") { queue.length = 0; return; }

    var batch = queue.slice();
    queue.length = 0;

    try {
      /* keepalive so a report survives the page being closed, which is exactly
         when the interesting errors happen. Reports are filed unattributed:
         the anon key means auth.uid() is null, and the table's policy only
         accepts a null user_id from it. */
      fetch(url + "/rest/v1/client_errors", {
        method: "POST",
        keepalive: true,
        headers: {
          "apikey":        key,
          "Authorization": "Bearer " + key,
          "Content-Type":  "application/json",
          "Prefer":        "return=minimal"
        },
        body: JSON.stringify(batch)
      })["catch"](function () { /* a failed report must never become an error */ });
    } catch (e) { /* nor must the attempt to send one */ }
  }

  /* --- hooks -------------------------------------------------------------- */

  window.addEventListener("error", function (e) {
    try {
      record({
        kind:    "error",
        message: e && e.message,
        source:  e && e.filename,
        line:    e && e.lineno,
        col:     e && e.colno,
        stack:   e && e.error && e.error.stack
      });
    } catch (ignored) {}
  });

  window.addEventListener("unhandledrejection", function (e) {
    try {
      var r = e && e.reason;
      record({
        kind:    "unhandledrejection",
        message: (r && r.message) || r,
        stack:   r && r.stack
      });
    } catch (ignored) {}
  });

  /* Send whatever is still queued when the page goes away. */
  window.addEventListener("pagehide", flush);

  /* The seam the tests drive, matching window.imcStore's shape. */
  window.imcErrors = {
    record:   record,
    flush:    flush,
    scrubUrl: scrubUrl,
    scrubText: scrubText,
    pending:  function () { return queue.slice(); },
    capacity: function () { return MAX_PER_LOAD - sent; },
    loadId:   function () { return LOAD_ID; },
    version:  function () { return VERSION; }
  };
})();
