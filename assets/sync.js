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

  function remoteKey(kind, row){ return kind === "notes" ? row.date : row.id; }

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
      store().adopt("cfg", map.cfg || {});
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

    var since = null;
    try { since = localStorage.getItem(LAST_PULL) || null; } catch (e){}
    if (store().needsFullSync()) since = null;   /* too much history to replay row by row */

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
    }
  };
})();
