"use strict";
/* ===========================================================================
   inmycalendar - sync.js
   Cross-device sync through Supabase. Loads after app.js and auth.js.

   DESIGN RULE, same as auth: the app must stay fully usable signed out and
   fully usable if this file never loads. Nothing here is on the critical path
   for using the board. If the network is down, edits queue in the journal and
   go up next time.

   THE AGREED CONFLICT RULE, which this file implements:
     - merge at TASK level, not day level. Two devices adding different tasks
       to the same day both keep their task.
     - the same task edited in two places: most recent edit wins.
     - deletions travel as markers (deleted = true), never as absent rows. An
       absent row is indistinguishable from a row the other device has not seen
       yet, so it would be re-sent and the task would come back from the dead.

   ORDER OF OPERATIONS IS PULL, MERGE, PUSH - never push first. Pushing first
   would overwrite a newer edit made on another device with our older one,
   which is exactly the case "most recent edit wins" exists to decide.
   =========================================================================== */

(function(){

  /* Local bucket name -> Postgres table. "cfg" is one row per person. */
  var TABLE = { tasks:"tasks", notes:"notes", track:"track", cfg:"settings" };
  var LAST_PULL = "imc.lastPull";
  var syncing = false, queued = false, slot = null, statusEl = null;

  /* THE WATERMARK IS NOT AS TRUSTWORTHY AS IT LOOKS.

     Reported: a colour set on one laptop never appeared on the other, while
     the row itself was sitting on the server, correct, and was the newest row
     in the whole table.

     The pull asks for rows newer than the last one we saw. The trouble is who
     decides what "newer" means. updated_at is written by the CLIENT, from the
     clock of whichever machine made the edit, and two laptops do not agree on
     the time. If this machine's clock runs a minute fast, its own pushes carry
     timestamps a minute in the future, the watermark jumps a minute ahead of
     reality, and every edit the other machine makes in that minute is stamped
     BEHIND the watermark and filtered out of the pull. Not delayed. Filtered
     out, once, and then never asked for again, because the watermark only ever
     moves forwards.

     The clean repair is a database trigger stamping updated_at server-side, so
     one clock decides for everybody. That needs SQL run against the live
     project, which is the owner's to run and not mine, and it would leave the
     bug live until he did.

     So, two things that need nothing but this file:

       FIRST SYNC OF EVERY PAGE LOAD PULLS EVERYTHING. Opening the app on any
       device reconciles it completely against the server, whatever the
       watermark thinks. This is what makes the bug self-healing rather than
       permanent, and it is affordable here: the whole account is a few hundred
       rows, which is one small request, once, on a page that already fetches
       more than that in holiday data.

       EVERY LATER PULL OVERLAPS. Incremental syncs inside a long session ask
       from a few minutes BEFORE the watermark rather than exactly at it, so a
       clock difference smaller than the overlap cannot hide anything. Re-seeing
       a row already held is free: it is compared and written back identical,
       and a row with an unpushed local edit is protected by the conflict rule
       further down, exactly as it was before. */
  var SKEW_MS = 10 * 60 * 1000;    /* how far two clocks may drift and still agree */
  var pulledFullyThisLoad = false;

  /* WHAT TO ASK THE SERVER FOR, as one function with no side effects.

     This is the whole bug in four lines, so it is worth being able to test
     without a browser, a network and two devices. Returning null means "send
     everything"; returning a timestamp means "only what changed after this".

     Everything full-pulls except an ongoing session with a usable watermark,
     and that one case reaches back by SKEW_MS so a clock difference between
     two machines cannot drop an edit into the gap. */
  function sinceFor(mark, fullyPulledThisLoad, needsFull){
    if (needsFull) return null;              /* too much history to replay row by row */
    if (!fullyPulledThisLoad) return null;   /* first sync after a load reconciles fully */
    if (!mark) return null;                  /* never synced here, so there is no gap */
    var t = Date.parse(mark);
    if (isNaN(t)) return null;               /* unreadable, so do not trust it */
    return new Date(t - SKEW_MS).toISOString();
  }

  function store(){ return window.imcStore; }
  function sb(){ return window.imcAuth && window.imcAuth.client; }
  function uid(){
    var u = window.imcAuth && window.imcAuth.user;
    return u ? u.id : null;
  }

  /* ---------- row shapes -------------------------------------------------
     Local and remote are deliberately not identical. "order" is a reserved
     word in SQL, so the column is "pos". Notes are keyed by date rather than
     by an id. Everything crosses through these four pairs of functions and
     nowhere else. */

  function toRemote(kind, id, local, when){
    var row = { user_id: uid(), updated_at: new Date(when).toISOString(), deleted: !local };
    if (kind === "tasks"){
      row.id = id;
      row.date   = local ? local.date : "1970-01-01";
      row.text   = local ? String(local.text || "").slice(0,500) : "";
      row.status = local && /^(todo|doing|done)$/.test(local.status) ? local.status : "todo";
      row.pos    = local && typeof local.order === "number" ? Math.max(0, Math.min(100000, local.order|0)) : 0;
      /* THE COLOUR RIDES IN ts, AND THIS IS WHY.

         Reported: "the color code appears, and then disappears". It did, and
         the two screenshots showed exactly where - the stripe was there while
         the header said Syncing and gone once it said Synced.

         This function and fromRemote() are the only crossing between local and
         remote, and they map a FIXED list of fields. A task gained a colour and
         these did not, so every push dropped it and every pull rebuilt the task
         without it. Local was right, the server was authoritative, and the
         server had never been told.

         The obvious repair is a "cat" column. It is also the one that cannot
         ship on its own: PostgREST rejects the whole row for a column that does
         not exist, so the client cannot start sending it until the migration
         has run, and until then every edit fails instead of just the colour. A
         fix that needs a database change first is a fix that leaves the bug
         live in the meantime.

         ts is jsonb with a default of {}, it already travels whole, and an
         older client reads todo/doing/done out of it and ignores anything else.
         So the colour goes in there: nothing to run, nothing to deploy in
         order, and no version of this app that can be confused by it.

         Written only when there IS one, so a task with no colour crosses the
         wire byte for byte as it always did. */
      var ts = {};
      if (local && local.ts){
        ts.todo  = local.ts.todo  || null;
        ts.doing = local.ts.doing || null;
        ts.done  = local.ts.done  || null;
      }
      if (local && typeof local.cat === "number" && local.cat >= 0 && local.cat < 64)
        ts.cat = local.cat | 0;
      row.ts = ts;
    } else if (kind === "notes"){
      row.date  = id;
      row.color = local && typeof local.color === "number" ? local.color : null;
      row.note  = local ? String(local.note || "").slice(0,4000) : "";
    } else if (kind === "track"){
      row.id     = id;
      row.label  = local ? String(local.label || "").slice(0,200) : "";
      row.date   = local ? local.date : null;
      row.unit   = local ? local.unit : null;
      row.repeat = !!(local && local.repeat);
    } else {
      row.cfg = local || {};
      delete row.deleted;              /* settings are never deleted, only replaced */
    }
    return row;
  }

  function fromRemote(kind, row){
    if (kind === "tasks"){
      var rts = row.ts || {};
      var t = { id:row.id, date:row.date, text:row.text, status:row.status,
                order:row.pos,
                /* Rebuilt rather than passed through, so the colour that
                   travels inside ts is never left sitting in the timestamps. */
                ts:{ todo:rts.todo || null, doing:rts.doing || null, done:rts.done || null } };
      if (typeof rts.cat === "number" && rts.cat >= 0) t.cat = rts.cat | 0;
      return t;
    }
    if (kind === "notes") return { color:(row.color === null ? null : row.color), note:row.note || "" };
    if (kind === "track") return { id:row.id, label:row.label, date:row.date, unit:row.unit, repeat:!!row.repeat };
    return row.cfg || {};
  }

  /* THE KEY A ROW IS FILED UNDER, and the bug that hid here for months.

     Reported: "on this laptop it shows green color, while when i set it on
     another laptop it was pink." Same task, same stored value, two colours.

     A task keeps its colour as a POSITION in cfg.taskCats, which is fine only
     while every device agrees what sits at that position. They did not, and
     this line is why. The settings table is keyed by user_id and has no id
     column at all, so for kind "cfg" this returned undefined; the pulled
     config was filed under the key "undefined"; and writeLocal then read
     map.cfg, which was still the LOCAL copy, and wrote it straight back over
     itself. Settings went up and never came down. Not once, on any device.

     Nothing errored, which is why it lasted. Every device kept its own
     palette, its own day-colour names, its own country and week-start, while
     the indexes stored on tasks and notes synced perfectly - so the numbers
     agreed and the meanings did not. */
  function remoteKey(kind, row){
    if (kind === "notes") return row.date;
    if (kind === "cfg")   return "cfg";    /* one row per person; rowMap agrees */
    return row.id;
  }

  /* SETTINGS THAT DESCRIBE THE DEVICE, NOT THE ACCOUNT.

     Turning the pull on means the whole config arrives, and some of it has no
     business travelling. Dark mode chosen on a phone at night should not black
     out a laptop in the morning. Which day the board is showing, which column
     a phone has open, whether the year grid is folded: those describe the
     screen in front of you.

     Everything NOT on this list is account-level and follows you, which is
     what the colours, the day-colour names, the country and the week rules
     always should have done. */
  function deviceKeys(){
    var k = store() && store().deviceKeys;
    /* The fallback matters: app.js is the owner of this list, and if a build
       ever ships a sync.js newer than its app.js, keeping everything local is
       the safe way to be wrong. */
    return (k && k.length) ? k : ["theme","view","scope","shift","lastDate","phoneCol","calDense",
                                  "glanceOpen","glanceOpenPhone","glancePhoneFix","addCat"];
  }

  function mergeCfg(local, remote){
    var out = {}, k;
    for (k in remote) if (Object.prototype.hasOwnProperty.call(remote, k)) out[k] = remote[k];
    local = local || {};
    var dk = deviceKeys();
    for (var i = 0; i < dk.length; i++){
      var d = dk[i];
      /* Keep this device's answer, and where it has none, drop the other
         device's rather than inheriting it. */
      if (Object.prototype.hasOwnProperty.call(local, d)) out[d] = local[d];
      else delete out[d];
    }
    return out;
  }

  /* ---------- local collections keyed by id ------------------------------ */
  function localMap(kind){
    var v = store().read(kind), out = {}, i, k;
    if (kind === "tasks" || kind === "track"){
      if (!Array.isArray(v)) return out;
      for (i=0;i<v.length;i++) if (v[i] && v[i].id) out[v[i].id] = v[i];
      return out;
    }
    if (kind === "notes"){
      if (!v || typeof v !== "object") return out;
      for (k in v) if (Object.prototype.hasOwnProperty.call(v,k)) out[k] = v[k];
      return out;
    }
    out.cfg = v || {};
    return out;
  }

  function writeLocal(kind, map){
    if (kind === "tasks" || kind === "track"){
      var arr = [], k;
      for (k in map) if (Object.prototype.hasOwnProperty.call(map,k)) arr.push(map[k]);
      store().adopt(kind, arr);
    } else if (kind === "notes"){
      store().adopt(kind, map);
    } else {
      /* map.cfg is what the server sent, since remoteKey files it under "cfg".
         The device-local half is taken from what is here right now. */
      store().adopt("cfg", mergeCfg(store().read("cfg"), map.cfg || {}));
    }
  }

  /* ---------- status ----------------------------------------------------- */
  function status(text, tone){
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.className = "syncst" + (tone ? " " + tone : "");
    statusEl.title = text || "";
  }

  /* ---------- the sync itself -------------------------------------------- */
  function pull(kind, since){
    var q = sb().from(TABLE[kind]).select("*").eq("user_id", uid());
    if (since) q = q.gt("updated_at", since);
    return q;
  }

  function syncNow(reason){
    if (!sb() || !uid() || !store()) return Promise.resolve(false);
    if (syncing){ queued = true; return Promise.resolve(false); }
    syncing = true;
    status("Syncing…");

    var mark = null;
    try { mark = localStorage.getItem(LAST_PULL) || null; } catch (e){}
    var since = sinceFor(mark, pulledFullyThisLoad, store().needsFullSync());

    var kinds = ["tasks","notes","track","cfg"];
    var newest = since;
    var journal = {};
    store().changes().forEach(function(c){ journal[c.kind + ":" + c.id] = c; });

    /* ---- 1. PULL and MERGE ---- */
    var chain = kinds.reduce(function(p, kind){
      return p.then(function(){
        return pull(kind, since).then(function(res){
          if (res.error) throw res.error;
          var rows = res.data || [];
          if (!rows.length) return;
          var map = localMap(kind), touched = false;

          rows.forEach(function(row){
            var id = remoteKey(kind, row);
            if (row.updated_at && (!newest || row.updated_at > newest)) newest = row.updated_at;
            var mine = journal[kind + ":" + id];
            if (mine){
              /* Both sides changed this row. Most recent edit wins. */
              if (new Date(row.updated_at).getTime() > mine.at){
                store().discard(kind, id);          /* our edit is older, drop it */
              } else {
                return;                              /* ours is newer, keep it to push */
              }
            }
            if (row.deleted){ if (map[id]){ delete map[id]; touched = true; } }
            else { map[id] = fromRemote(kind, row); touched = true; }
          });

          if (touched) writeLocal(kind, map);
        });
      });
    }, Promise.resolve());

    /* ---- 2. PUSH whatever is still pending ---- */
    return chain.then(function(){
      var pendingRows = store().changes();
      if (!pendingRows.length) return null;

      var byKind = { tasks:[], notes:[], track:[], cfg:[] };
      pendingRows.forEach(function(c){
        var map = localMap(c.kind);
        var local = map[c.id];
        /* op is what the journal saw; trust the live state over the label, in
           case the row was re-created after being deleted. */
        byKind[c.kind].push(toRemote(c.kind, c.id, local || null, c.at));
      });

      var pushes = Promise.resolve();
      ["tasks","notes","track","cfg"].forEach(function(kind){
        if (!byKind[kind].length) return;
        pushes = pushes.then(function(){
          return sb().from(TABLE[kind]).upsert(byKind[kind]).then(function(res){
            if (res.error) throw res.error;
          });
        });
      });
      return pushes.then(function(){ store().settled(pendingRows); });
    })
    .then(function(){
      if (store().needsFullSync()) store().fullSyncDone();
      /* Only once a sync has actually finished, so a failed first attempt does
         not leave the session believing it is caught up. */
      pulledFullyThisLoad = true;
      try { if (newest) localStorage.setItem(LAST_PULL, newest); } catch (e){}
      store().repaint();
      status("Synced", "ok");
      syncing = false;
      if (queued){ queued = false; setTimeout(function(){ syncNow("queued"); }, 400); }
      return true;
    })
    .catch(function(err){
      syncing = false;
      /* Offline or refused. The journal still holds everything, so nothing is
         lost; it goes up on the next attempt. Say so rather than failing mute. */
      status("Offline, changes saved here", "warn");
      console.warn("[inmycalendar] sync failed (" + (reason||"") + "):", err && (err.message || err));
      return false;
    });
  }

  /* ---------- wiring ------------------------------------------------------ */
  function mountStatus(){
    slot = document.getElementById("authSlot");
    if (!slot || statusEl) return;
    statusEl = document.createElement("span");
    statusEl.className = "syncst";
    slot.parentNode.insertBefore(statusEl, slot);
  }

  function start(){
    if (!window.imcAuth || !window.imcAuth.client || !window.imcStore) return;
    mountStatus();

    var lastUser = null;
    function onUser(u){
      var id = u ? u.id : null;
      if (id === lastUser) return;
      var wasSignedIn = !!lastUser;
      lastUser = id;

      if (id){
        /* Anything made before signing in belongs to this account now, so it
           is left in the journal and pushed rather than discarded. */
        syncNow("sign-in");
      } else if (wasSignedIn){
        /* Signed out. The server keeps everything; this machine keeps nothing,
           which is the point on a shared computer. */
        try { localStorage.removeItem(LAST_PULL); } catch (e){}
        pulledFullyThisLoad = false;   /* the next account starts from nothing */
        store().clearLocal();
        status("");
      }
    }

    /* auth.js owns the session; poll its published user rather than opening a
       second Supabase listener that could disagree with the first. */
    var seen = window.imcAuth.user || null;
    onUser(seen);
    setInterval(function(){
      var now = window.imcAuth.user || null;
      if ((now && now.id) !== (seen && seen.id)){ seen = now; onUser(now); }
    }, 800);

    /* push local edits shortly after they stop arriving */
    var debounce = null;
    window.addEventListener("imc:changed", function(){
      if (!uid()) return;
      clearTimeout(debounce);
      debounce = setTimeout(function(){ syncNow("local-edit"); }, 1500);
    });

    /* and pick up other devices when the tab comes back to the front */
    document.addEventListener("visibilitychange", function(){
      if (!document.hidden && uid()) syncNow("visible");
    });
    window.addEventListener("online", function(){ if (uid()) syncNow("online"); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  /* A SEAM OVER THE TWO ROW MAPPERS, the way imcStore exposes one over the
     journal, and it exists because of a bug that a seam would have caught.

     A task gained a colour; these two functions map a fixed list of fields and
     did not gain it; every push dropped it and every pull put the task back
     without it. Nothing in the suite could see that, because the only way in
     was to run a real sync against a real database. The round trip is now
     testable on its own: hand it a task, get a task back, compare.

     Read-only in effect - both functions are pure, neither touches the network
     or storage, and nothing in the app calls through here. */
  window.imcSync = {
    now: function(){ return syncNow("manual"); },
    roundTrip: function(kind, local){
      return fromRemote(kind, toRemote(kind, local && local.id, local, Date.now()));
    },
    /* Lets a test act like a tab that has already been open a while, which is
       the only state in which the incremental pull runs at all. */
    __settled: function(){ pulledFullyThisLoad = true; },
    /* The pull-window decision, exposed so it can be checked directly rather
       than inferred from driving two browsers through a whole sync. Pure. */
    __sinceFor: sinceFor,
    __skewMs: SKEW_MS
  };
})();
