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
    var who = el("span","who", label);
    who.title = (full ? full + "\n" : "") + email;
    var outBtn = el("button","btn signout","Sign out");
    outBtn.addEventListener("click", function(){
      outBtn.disabled = true;
      sb.auth.signOut().then(function(){ paint(null); });
    });
    slot.appendChild(who);
    slot.appendChild(outBtn);
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
    if (mail.focus) mail.focus();
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
