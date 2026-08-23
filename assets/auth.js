"use strict";
/* ===========================================================================
   inmycalendar - auth.js
   Google sign-in via Supabase.

   Design rule: the app must stay FULLY usable signed out. Sign-in is an
   upgrade (sync across devices), never a gate. If this file cannot load its
   library - offline, opened from disk, or not configured yet - it hides the
   button and the app carries on exactly as before.
   =========================================================================== */

/* ===========================================================================
   STEP 1 OF 1 TO TURN SIGN-IN ON
   Supabase dashboard -> Settings -> API Keys -> copy the "anon public" key
   and paste it as IMC_SUPABASE_ANON_KEY below. Nothing else is needed.
   Until then the Sign in button stays hidden and the app works normally.
   =========================================================================== */
/* --- CONFIG: paste your anon key below. -----------------------------------
   The anon key is DESIGNED to be public and belongs in this file; it is
   restricted by Row Level Security on the database side. The service_role
   key is the dangerous one and must never appear anywhere in this repo. */
var IMC_SUPABASE_URL = "https://zkedkgzguhrrnsvetinl.supabase.co";
var IMC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprZWRrZ3pndWhycm5zdmV0aW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NjU2MTEsImV4cCI6MjEwMjA0MTYxMX0.caxz9LM6QjJ5IRor5DnQ2wLMIpBQ4-W2SZEXivhtnD8";
/* ------------------------------------------------------------------------- */

window.imcAuth = { user:null, client:null, ready:false };

(function(){
  var slot = document.getElementById("authSlot");
  if (!slot) return;

  function configured(){
    return IMC_SUPABASE_ANON_KEY.indexOf("PASTE_") !== 0 && IMC_SUPABASE_ANON_KEY.length > 20;
  }
  /* No library (offline / file://) or no key yet: the app still works, but say
     WHY in the console. Failing silently is what made "sign-in never appears"
     impossible to diagnose. */
  if (!window.supabase || !window.supabase.createClient){
    slot.classList.add("hidden");
    console.warn("[inmycalendar] Sign-in hidden: the Supabase library did not load. " +
                 "It comes from a CDN, so this is expected when opening index.html " +
                 "directly from disk (file://). Test sign-in on the live site.");
    return;
  }
  if (!configured()){
    slot.classList.add("hidden");
    console.warn("[inmycalendar] Sign-in hidden: no Supabase anon key set. " +
                 "Open assets/auth.js and replace PASTE_YOUR_ANON_PUBLIC_KEY_HERE " +
                 "with the anon public key from Supabase > Settings > API Keys.");
    return;
  }

  var sb = window.supabase.createClient(IMC_SUPABASE_URL, IMC_SUPABASE_ANON_KEY);
  window.imcAuth.client = sb;
  window.imcAuth.ready = true;

  function el(tag, cls, txt){
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  }

  function paint(user){
    window.imcAuth.user = user || null;
    slot.innerHTML = "";
    slot.classList.remove("hidden");

    if (!user){
      var inBtn = el("button","btn signin","Sign in");
      inBtn.title = "Sign in to sync across your devices";
      inBtn.addEventListener("click", function(e){ e.stopPropagation(); openMenu(inBtn); });
      slot.appendChild(inBtn);
      return;
    }

    /* Initials, not a first name. A first name has no length limit, so it is
       either cut off mid-word or the pill grows until it shoves Sign out off a
       narrow ribbon. Two letters always fit and never lie. The full name and
       the email live in the tooltip.
       Google and Microsoft both hand back a display name; a magic link does
       not, so the email's first letter is the fallback. */
    var email = (user.email || "").toLowerCase();
    var meta = user.user_metadata || {};
    var full = (meta.full_name || meta.name || meta.preferred_username || "").trim();
    var label;
    if (full){
      var parts = full.split(/\s+/).filter(function(p){ return !!p; });
      label = (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length-1].charAt(0) : "")).toUpperCase();
    } else {
      label = (email.charAt(0) || "?").toUpperCase();
    }
    /* A name the person chose beats one a provider guessed at. Stored in
       settings, so it travels with the account rather than living on one
       machine. Only the app page has a store; the content pages just show
       whatever the provider gave. */
    var chosen = "";
    try { chosen = ((window.imcStore && window.imcStore.read("cfg")) || {}).displayName || ""; } catch (e){}
    var shown = (chosen || full).trim();
    if (shown){
      var bits = shown.split(/\s+/).filter(function(p){ return !!p; });
      label = (bits[0].charAt(0) + (bits.length > 1 ? bits[bits.length-1].charAt(0) : "")).toUpperCase();
    }

    var who = el("button","who", label);
    who.type = "button";
    who.title = (shown ? shown + "\n" : "") + email + "\nClick for your account settings";
    who.setAttribute("aria-label", "Account settings for " + (shown || email));
    who.addEventListener("click", function(e){ e.stopPropagation(); openProfile(who, user, shown, email); });

    var outBtn = el("button","btn signout","Sign out");
    outBtn.addEventListener("click", function(){ signOut(outBtn); });
    slot.appendChild(who);
    slot.appendChild(outBtn);
  }

  function signOut(btn){
    if (btn) btn.disabled = true;
    /* Warn only when there is something to lose. Anything still in the journal
       has not reached the server, and signing out clears this device. */
    var unsent = 0;
    try { unsent = (window.imcStore ? window.imcStore.changes().length : 0); } catch (e){}
    if (unsent > 0){
      var ok = window.confirm(
        unsent + (unsent === 1 ? " change has" : " changes have") + " not reached your account yet, " +
        "probably because you are offline.\n\nSigning out clears this device. Those changes would be lost.\n\n" +
        "Sign out anyway?");
      if (!ok){ if (btn) btn.disabled = false; return; }
    }
    sb.auth.signOut().then(function(){ paint(null); })
      .catch(function(){ if (btn) btn.disabled = false; });
  }

  /* ---------------------------------------------------------------------
     Account settings. It hangs off the initials rather than living on its
     own page: it is four fields, and a whole page for four fields is a page
     nobody visits. Same reasoning as "no settings gear" on the board.
     --------------------------------------------------------------------- */
  function openProfile(anchor, user, shown, email){
    var old = document.getElementById("authMenu");
    if (old){ old.remove(); return; }

    var menu = el("div","authmenu profile");
    menu.id = "authMenu";
    menu.addEventListener("click", function(e){ e.stopPropagation(); });

    menu.appendChild(el("div","amsep","Signed in as"));
    var who = el("div","pfemail", email);
    menu.appendChild(who);

    var hasStore = !!(window.imcStore && window.imcStore.read);
    if (hasStore){
      menu.appendChild(el("label","pflabel","Display name"));
      var nameIn = document.createElement("input");
      nameIn.type = "text"; nameIn.className = "aminput"; nameIn.maxLength = 60;
      nameIn.value = shown || "";
      nameIn.placeholder = "How your name appears";
      nameIn.setAttribute("aria-label","Display name");
      var hint = el("div","amnote","Your initials come from this.");
      function saveName(){
        var v = nameIn.value.replace(/\s+/g," ").trim().slice(0,60);
        var cfg = window.imcStore.read("cfg") || {};
        if ((cfg.displayName || "") === v) return;
        cfg.displayName = v;
        try { window.commit("cfg"); } catch (e){}
        hint.textContent = v ? "Saved. Initials updated." : "Cleared. Using the name from your provider.";
        paint(user);
      }
      nameIn.addEventListener("blur", saveName);
      nameIn.addEventListener("keydown", function(e){ if (e.key === "Enter"){ e.preventDefault(); saveName(); menu.remove(); } });
      menu.appendChild(nameIn);
      menu.appendChild(hint);

      menu.appendChild(el("div","amsep","Sync"));
      var pend = 0;
      try { pend = window.imcStore.changes().length; } catch (e){}
      menu.appendChild(el("div","amnote", pend ? (pend + " change" + (pend===1?"":"s") + " waiting to upload")
                                               : "Everything on this device is on your account."));
      var syncBtn = el("button","amsend","Sync now");
      syncBtn.addEventListener("click", function(){
        syncBtn.disabled = true; syncBtn.textContent = "Syncing…";
        var p = (window.imcSync && window.imcSync.now) ? window.imcSync.now() : Promise.resolve(false);
        p.then(function(ok){
          syncBtn.textContent = ok ? "Synced" : "Could not reach your account";
          setTimeout(function(){ syncBtn.disabled = false; syncBtn.textContent = "Sync now"; }, 1800);
        });
      });
      menu.appendChild(syncBtn);
    }

    /* Reminders. OFF unless the person deliberately turns them on, and the
       wording says so, because unasked-for mail is how a young domain earns a
       permanent place in spam filters. Stored in settings, so the preference
       syncs with everything else and the server can read it. */
    if (hasStore){
      menu.appendChild(el("div","amsep","Reminders"));
      var cfgNow = window.imcStore.read("cfg") || {};

      var remRow = el("label","pfcheck");
      var remOn = document.createElement("input");
      remOn.type = "checkbox";
      remOn.checked = !!cfgNow.reminderOn;
      remRow.appendChild(remOn);
      remRow.appendChild(el("span", null, "Email me a summary"));
      menu.appendChild(remRow);

      var freq = document.createElement("select");
      freq.className = "sel pffreq";
      [["daily","Every weekday morning"],
       ["weekly","Monday mornings"],
       ["monthly","First of the month"]].forEach(function(p){
        var o = document.createElement("option");
        o.value = p[0]; o.textContent = p[1];
        if ((cfgNow.reminderFreq || "weekly") === p[0]) o.selected = true;
        freq.appendChild(o);
      });
      freq.disabled = !remOn.checked;
      menu.appendChild(freq);

      var remNote = el("div","amnote",
        remOn.checked ? "Sent to " + email + ". Turn it off here any time."
                      : "Off. Nothing is sent unless you switch this on.");
      menu.appendChild(remNote);

      function saveRem(){
        var c = window.imcStore.read("cfg") || {};
        c.reminderOn = !!remOn.checked;
        c.reminderFreq = freq.value;
        try { window.commit("cfg"); } catch (e){}
        freq.disabled = !remOn.checked;
        remNote.textContent = remOn.checked
          ? "Saved. Sent to " + email + ". Turn it off here any time."
          : "Off. Nothing is sent unless you switch this on.";
        /* push immediately: a person who just switched reminders OFF should
           not have to wait for a debounce before that reaches the server. */
        if (window.imcSync && window.imcSync.now) window.imcSync.now();
      }
      remOn.addEventListener("change", saveRem);
      freq.addEventListener("change", saveRem);
    }

    var out = el("button","amrow signoutrow","Sign out");
    out.addEventListener("click", function(){ menu.remove(); signOut(null); });
    menu.appendChild(out);

    /* -----------------------------------------------------------------
       Deleting the account. The privacy policy used to answer "delete my
       data" with "email hello@inmycalendar.com", which is a promise about
       somebody remembering rather than a mechanism. This is the mechanism.

       It is two steps on purpose. The first click only reveals the second,
       which will not arm until the word DELETE is typed, because there is
       no undo and no backup to restore from afterwards.
       ----------------------------------------------------------------- */
    menu.appendChild(el("div","amsep","Danger zone"));

    var delOpen = el("button","amrow deleterow","Delete account");
    menu.appendChild(delOpen);

    var delBox = el("div","delbox");
    delBox.style.display = "none";
    delBox.appendChild(el("div","amnote",
      "This deletes your account and everything on it - tasks, day notes, " +
      "countdowns and settings - on every device. It cannot be undone, and " +
      "there is no copy to restore from. Export or Backup first if you want one."));

    var delType = document.createElement("input");
    delType.type = "text";
    delType.className = "aminput";
    delType.placeholder = "Type DELETE to confirm";
    delType.setAttribute("aria-label", "Type DELETE to confirm");

    var delGo = el("button","amsend deletego","Delete my account");
    delGo.disabled = true;
    var delNote = el("div","amnote","");

    delType.addEventListener("input", function(){
      delGo.disabled = delType.value.trim().toUpperCase() !== "DELETE";
    });

    delOpen.addEventListener("click", function(){
      var showing = delBox.style.display !== "none";
      delBox.style.display = showing ? "none" : "block";
      delOpen.textContent = showing ? "Delete account" : "Never mind, keep my account";
      if (!showing && delType.focus) delType.focus();
    });

    delGo.addEventListener("click", function(){
      if (delType.value.trim().toUpperCase() !== "DELETE") return;
      delGo.disabled = true; delGo.textContent = "Deleting…"; delNote.textContent = "";

      /* The server takes the account to delete from the session token, never
         from anything sent in the body, so this cannot be pointed at anyone
         else even by editing the request. */
      sb.auth.getSession().then(function(r){
        var token = r && r.data && r.data.session && r.data.session.access_token;
        if (!token) throw new Error("You appear to be signed out already.");
        return fetch(IMC_SUPABASE_URL + "/functions/v1/delete-account", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + token,
            "apikey": IMC_SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ confirm: "DELETE" })
        });
      }).then(function(res){
        return res.json().then(function(body){ return { ok: res.ok, body: body }; });
      }).then(function(r){
        if (!r.ok || !r.body || !r.body.deleted){
          throw new Error((r.body && r.body.error) || "Could not delete the account.");
        }
        /* Gone on the server. Clear this device too, so closing the tab does
           not leave a copy of everything sitting in local storage. */
        try { if (window.imcStore) window.imcStore.clearLocal(); } catch (e){}
        try { sb.auth.signOut(); } catch (e){}
        menu.remove();
        window.alert("Your account and all of its data have been deleted.");
        window.location.reload();
      })["catch"](function(e){
        delGo.disabled = false; delGo.textContent = "Delete my account";
        delNote.textContent = (e && e.message) ? e.message
          : "Could not delete the account. Email hello@inmycalendar.com.";
      });
    });

    delBox.appendChild(delType);
    delBox.appendChild(delGo);
    delBox.appendChild(delNote);
    menu.appendChild(delBox);

    slot.appendChild(menu);
    if (hasStore && menu.querySelector(".aminput")) menu.querySelector(".aminput").focus();
  }


  /* ---------------------------------------------------------------------
     Providers. Google, Microsoft and GitHub are OAuth; email is a magic
     link, so there is no password for anyone to forget or for us to store.
     Apple is deliberately absent - it needs a paid developer account.
     Each one must ALSO be enabled in Supabase before it will work.
     --------------------------------------------------------------------- */
  var PROVIDERS = [
    { id:"google", label:"Continue with Google" },
    { id:"azure",  label:"Continue with Microsoft" },
    { id:"github", label:"Continue with GitHub" }
  ];

  function oauth(provider, done){
    sb.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: window.location.origin + window.location.pathname }
    }).catch(function(){ if (done) done(); });
  }

  function openMenu(anchor){
    var old = document.getElementById("authMenu");
    if (old){ old.remove(); return; }

    var menu = el("div","authmenu");
    menu.id = "authMenu";
    menu.addEventListener("click", function(e){ e.stopPropagation(); });

    PROVIDERS.forEach(function(p){
      var b = el("button","amrow", p.label);
      b.addEventListener("click", function(){
        b.textContent = "Opening\u2026";
        oauth(p.id, function(){ b.textContent = p.label; });
      });
      menu.appendChild(b);
    });

    menu.appendChild(el("div","amsep","or use your email"));
    var mail = document.createElement("input");
    mail.type = "email"; mail.className = "aminput"; mail.placeholder = "you@example.com";
    mail.setAttribute("aria-label","Email address");
    var send = el("button","amsend","Email me a link");
    var note = el("div","amnote","");

    function sendLink(){
      var v = (mail.value || "").trim();
      if (v.indexOf("@") < 1 || v.indexOf(".") < 0){ note.textContent = "That email looks incomplete."; return; }
      send.disabled = true; send.textContent = "Sending\u2026";
      sb.auth.signInWithOtp({
        email: v,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      }).then(function(r){
        if (r && r.error){ note.textContent = r.error.message || "Could not send. Try again."; }
        else { note.textContent = "Check your inbox for the sign-in link."; }
      }).catch(function(){ note.textContent = "Could not send. Try again."; })
        .then(function(){ send.disabled = false; send.textContent = "Email me a link"; });
    }
    send.addEventListener("click", sendLink);
    mail.addEventListener("keydown", function(e){ if (e.key === "Enter") sendLink(); });

    menu.appendChild(mail); menu.appendChild(send); menu.appendChild(note);
    slot.appendChild(menu);

    /* Focusing the email box is a convenience on a desktop and a problem on a
       phone: it raises the keyboard the instant the menu opens, shrinking the
       viewport and presenting "type your address" as the main action while the
       three one-tap provider buttons sit above it. Let the person choose. */
    var narrow = window.matchMedia && window.matchMedia("(max-width:640px)").matches;
    if (!narrow && mail.focus) mail.focus();
  }

  document.addEventListener("click", function(){
    var m = document.getElementById("authMenu"); if (m) m.remove();
  });
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape"){ var m = document.getElementById("authMenu"); if (m) m.remove(); }
  });

  /* current session on load, then react to sign-in / sign-out */
  sb.auth.getSession().then(function(res){
    paint(res && res.data && res.data.session ? res.data.session.user : null);
  }).catch(function(){ paint(null); });

  sb.auth.onAuthStateChange(function(_evt, session){
    paint(session ? session.user : null);
  });
})();
