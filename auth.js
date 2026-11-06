// ============================================================
// SHARED AUTH HELPER — include this on every page that needs
// to know who is logged in (index.html and, later, modules).
// Requires the Supabase JS library to be loaded first:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//
// PHASE 2 (KWP) ADDITIONS — both are no-ops for every existing,
// non-KWP account:
//   1. must_change_password gate: if the signed-in profile has
//      must_change_password = true (set when a KWP manager issues a
//      temporary password), requireAuth() redirects to
//      force-change-password.html instead of the caller's page.
//   2. Inactive KWP staff block: if the signed-in profile is linked to
//      a kwp_staff row (kwp_staff.profile_id) whose status is not
//      'Active', the session is signed out and the caller is sent back
//      to login.html. Accounts with no kwp_staff link are unaffected.
// ============================================================

// Which database: live on rumbu.vercel.app, the TEST database on preview links and local copies (see window.RUMBU_DB).
const SUPABASE_URL = (window.RUMBU_DB = window.RUMBU_DB || (function(){var h = String(location.hostname || "");var test = h !== "rumbu.vercel.app" && (/\.vercel\.app$/.test(h) || h === "localhost" || /^127\./.test(h) || h === "" || location.protocol === "file:");return test ? { env: "test", url: "https://cbityajrnwmdjymzhgzt.supabase.co", key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiaXR5YWpybndtZGp5bXpoZ3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3ODA5OTcsImV4cCI6MjEwOTM1Njk5N30.ZJWt4-No17YZhmjFOJ8yedGC0TiD4uOeE7arlAu9T_k" } : { env: "live", url: "https://betfhunzmhtdzgvufmfk.supabase.co", key: "sb_publishable_AfDp1FlHghu9TOfqEUj20Q_Pke7GlTp" };})()).url;
const SUPABASE_ANON_KEY = (window.RUMBU_DB = window.RUMBU_DB || (function(){var h = String(location.hostname || "");var test = h !== "rumbu.vercel.app" && (/\.vercel\.app$/.test(h) || h === "localhost" || /^127\./.test(h) || h === "" || location.protocol === "file:");return test ? { env: "test", url: "https://cbityajrnwmdjymzhgzt.supabase.co", key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiaXR5YWpybndtZGp5bXpoZ3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3ODA5OTcsImV4cCI6MjEwOTM1Njk5N30.ZJWt4-No17YZhmjFOJ8yedGC0TiD4uOeE7arlAu9T_k" } : { env: "live", url: "https://betfhunzmhtdzgvufmfk.supabase.co", key: "sb_publishable_AfDp1FlHghu9TOfqEUj20Q_Pke7GlTp" };})()).key;

// ============================================================
// RUMBU UI: logo, loading screens and friendly error messages
// ------------------------------------------------------------
// Shared by every page that loads auth.js. No page needs editing:
//  - No network: a banner says so, and a second one says when it is back.
//  - Server not reachable: a short banner, with Try again.
//  - Session ended: a box asks the person to sign in again.
//  - #connStatus lines: "Connected..." is no longer shown, "Loading..." shows
//    the animated logo, and an error is turned into a plain message with
//    Try again and the technical details folded away.
// Inside the app (a page in the shell's frame) the banners and the
// session box are shown once, by the shell, not by every frame.
// ============================================================
var RumbuUI = (function(){
  "use strict";
  var ROOT = (function(){
    try{ var s = document.currentScript && document.currentScript.src; if(s) return new URL(".", s).href; }catch(e){}
    try{ var el = document.querySelector('script[src*="auth.js"]'); if(el) return new URL(".", el.src).href; }catch(e){}
    return "/";
  })();
  var LOGIN = ROOT + "login.html";
  var BLUE = "#0B2DB4";

  // ---- the logo ----------------------------------------------------------
  // A clean drawing of the Rumbu logo. animated=true adds the loading motion:
  // the roof lines light up one after another, the body fills left to right
  // and the wheels roll.
  function logoSvg(animated, cls){
    var a = !!animated;
    return '<svg class="rs-logo' + (a ? ' rs-anim' : '') + (cls ? ' ' + cls : '') + '" viewBox="140 128 974 1028" aria-hidden="true" focusable="false">' +
      '<g class="rs-cart" fill="none" stroke="' + BLUE + '" stroke-linecap="round" stroke-linejoin="round">' +
      (a ? '<rect class="rs-fill" x="306" y="500" width="641" height="490" fill="#d9e2ff" stroke="none"/>' : '') +
      '<rect x="587" y="148" width="81" height="64" rx="8" fill="' + BLUE + '" stroke="none"/>' +
      '<path d="M180 466 L596 200 H658 L1074 466" stroke-width="31"/>' +
      '<path class="rs-ch rs-ch1" d="M316 465 L627 237 L938 465" stroke-width="19" stroke-linecap="butt"/>' +
      '<path class="rs-ch rs-ch2" d="M410 465 L627 303 L844 465" stroke-width="19" stroke-linecap="butt"/>' +
      '<path class="rs-ch rs-ch3" d="M494 465 L627 364 L760 465" stroke-width="19" stroke-linecap="butt"/>' +
      '<path class="rs-ch rs-ch4" d="M573 465 L627 422 L681 465" stroke-width="19" stroke-linecap="butt"/>' +
      '<path d="M288.5 482 V992 M964.5 482 V992" stroke-width="35"/>' +
      '<path d="M288.5 1003 H964.5" stroke-width="32"/>' +
      '<path d="M390 500 V990 M483.5 500 V990 M579 500 V990 M674 500 V990 M769 500 V990 M862 500 V990" stroke-width="14" stroke-linecap="butt"/>' +
      '<path d="M306 581 H947 M306 667 H947 M306 753 H947 M306 839 H947 M306 923.5 H947" stroke-width="13" stroke-linecap="butt"/>' +
      '<path d="M180 482 H1074" stroke-width="36"/>' +
      '<circle cx="389" cy="1038" r="111" fill="#fff" stroke="none"/><circle cx="864" cy="1038" r="111" fill="#fff" stroke="none"/>' +
      '<circle cx="389" cy="1038" r="80" stroke-width="34" fill="#fff"/><circle cx="864" cy="1038" r="80" stroke-width="34" fill="#fff"/>' +
      (a ? '<circle class="rs-roll" cx="389" cy="1038" r="80" stroke="#fff" stroke-width="12" stroke-dasharray="30 473"/><circle class="rs-roll" cx="864" cy="1038" r="80" stroke="#fff" stroke-width="12" stroke-dasharray="30 473"/>' : '') +
      '<circle cx="389" cy="1038" r="22" fill="' + BLUE + '" stroke="none"/><circle cx="864" cy="1038" r="22" fill="' + BLUE + '" stroke="none"/>' +
      '</g></svg>';
  }

  // ---- styles (added once) -------------------------------------------------
  var CSS = [
    ".rs-logo{display:block;width:100%;height:100%;}",
    ".rs-tile{display:inline-flex;align-items:center;justify-content:center;background:#fff;border-radius:22%;box-shadow:0 1px 2px rgba(0,0,0,.08);padding:0;box-sizing:border-box;overflow:hidden;}",
    ".rs-tile > .rs-logo{width:82%;height:82%;}",
    ".rs-anim .rs-ch{animation:rsCh 1.6s ease-in-out infinite;}",
    ".rs-anim .rs-ch4{animation-delay:0s}.rs-anim .rs-ch3{animation-delay:.15s}.rs-anim .rs-ch2{animation-delay:.3s}.rs-anim .rs-ch1{animation-delay:.45s}",
    "@keyframes rsCh{0%,100%{opacity:.25}35%{opacity:1}}",
    ".rs-anim .rs-fill{transform-box:fill-box;transform-origin:left center;animation:rsFill 1.6s ease-in-out infinite;}",
    "@keyframes rsFill{0%{transform:scaleX(0);opacity:1}70%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}",
    ".rs-anim .rs-roll{transform-box:fill-box;transform-origin:center;animation:rsRoll 1.1s linear infinite;}",
    "@keyframes rsRoll{to{transform:rotate(360deg)}}",
    ".rs-anim .rs-cart{animation:rsBob 1.6s ease-in-out infinite;}",
    "@keyframes rsBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}",
    "@media (prefers-reduced-motion:reduce){.rs-anim *{animation:none!important}.rs-anim .rs-fill{opacity:0}}",
    ".rs-loader{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;color:var(--muted,#64748b);font:600 13.5px/1.4 var(--sans,'Segoe UI',Roboto,Arial,sans-serif);}",
    ".rs-loader .rs-tile{width:84px;height:84px;}",
    ".rs-loader.rs-sm{flex-direction:row;gap:10px;justify-content:flex-start;}",
    ".rs-loader.rs-sm .rs-tile{width:30px;height:30px;padding:3px;border-radius:8px;}",
    ".rs-dots::after{content:'';display:inline-block;width:1.2em;text-align:left;animation:rsDots 1.2s steps(4,end) infinite;}",
    "@keyframes rsDots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}",
    ".rs-card{display:flex;gap:12px;align-items:flex-start;border:1px solid #f1c4c8;background:#fdf1f2;color:#7a1f2a;border-radius:10px;padding:12px 14px;margin:6px 0 12px;text-align:left;font:13px/1.5 var(--sans,'Segoe UI',Roboto,Arial,sans-serif);}",
    ".rs-card.rs-net{border-color:#f5d48a;background:#fff8e6;color:#6b4a00;}",
    ".rs-card.rs-perm{border-color:#c9d6f2;background:#f1f5fd;color:#1d3a7a;}",
    ".rs-card .rs-ico{flex:0 0 22px;font-size:18px;line-height:22px;}",
    ".rs-card .rs-body{flex:1;min-width:0;}",
    ".rs-card b{display:block;font-size:13.5px;margin-bottom:2px;}",
    ".rs-card .rs-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:center;}",
    ".rs-btn{width:auto!important;margin:0!important;padding:6px 12px!important;border-radius:7px!important;border:1px solid currentColor!important;background:transparent!important;color:inherit!important;font:700 12.5px var(--sans,'Segoe UI',Roboto,Arial,sans-serif)!important;cursor:pointer;opacity:1!important;}",
    ".rs-btn.rs-solid{background:" + BLUE + "!important;border-color:" + BLUE + "!important;color:#fff!important;}",
    ".rs-card details{margin-top:6px;font-size:11.5px;opacity:.85;}",
    ".rs-card details summary{cursor:pointer;}",
    ".rs-card details code{display:block;white-space:pre-wrap;word-break:break-word;margin-top:4px;font-size:11px;}",
    ".rs-info{font:12.5px/1.5 var(--sans,'Segoe UI',Roboto,Arial,sans-serif);color:var(--muted,#64748b);margin:0 0 10px;}",
    "#rsBanners{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:100000;display:flex;flex-direction:column;gap:8px;width:min(560px,calc(100vw - 20px));pointer-events:none;}",
    ".rs-banner{pointer-events:auto;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;font:600 13px/1.4 var(--sans,'Segoe UI',Roboto,Arial,sans-serif);box-shadow:0 8px 24px rgba(0,0,0,.18);animation:rsIn .18s ease-out;}",
    ".rs-banner .rs-msg{flex:1;min-width:0;}",
    ".rs-banner .rs-x{background:none!important;border:0!important;color:inherit!important;font-size:18px!important;line-height:1!important;cursor:pointer;padding:2px 6px!important;width:auto!important;margin:0!important;opacity:.8;}",
    ".rs-banner.rs-off{background:#3b1d1d;color:#ffe2e2;}",
    ".rs-banner.rs-srv{background:#4a3500;color:#fff1cc;}",
    ".rs-banner.rs-ok{background:#123d24;color:#d9ffe7;}",
    ".rs-banner .rs-btn{border-color:rgba(255,255,255,.6)!important;}",
    "@keyframes rsIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}",
    "#rsSession{position:fixed;inset:0;z-index:100001;background:rgba(10,18,35,.55);display:flex;align-items:center;justify-content:center;padding:20px;}",
    "#rsSession .rs-box{background:#fff;color:#12203c;border-radius:14px;max-width:380px;width:100%;padding:26px 24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.3);font:14px/1.5 var(--sans,'Segoe UI',Roboto,Arial,sans-serif);}",
    "#rsSession .rs-tile{width:64px;height:64px;margin-bottom:10px;}",
    "#rsSession h2{margin:0 0 6px;font-size:17px;color:#12203c;}",
    "#rsSession p{margin:0 0 16px;color:#52627d;font-size:13px;}",
    "#rsSession .rs-btn{padding:10px 18px!important;font-size:13.5px!important;}"
  ].join("\n");
  function addCss(){
    if(document.getElementById("rsCss")) return;
    var st = document.createElement("style"); st.id = "rsCss"; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function esc(t){ return String(t == null ? "" : t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function loaderHtml(text, small){
    addCss();
    return '<div class="rs-loader' + (small ? ' rs-sm' : '') + '" role="status" aria-live="polite"><span class="rs-tile">' + logoSvg(true) + '</span>' +
      '<span class="rs-dots">' + esc(text || "Loading") + '</span></div>';
  }

  // ---- which kind of problem is this? -------------------------------------
  var NET_RE = /failed to fetch|networkerror|network request failed|load failed|err_internet|err_network|net::|offline|timed? ?out|timeout|connection (was )?(reset|refused|closed|lost)|could not reach|unable to reach|fetch failed|typeerror: fetch/i;
  var SESSION_RE = /jwt (expired|is expired)|invalid jwt|jwt.*expired|session (has )?expired|session not found|auth session missing|not signed in|not logged in|refresh token|pgrst30[13]|invalid claim/i;
  var PERM_RE = /permission denied|row[- ]level security|violates row-level|42501|not allowed|not authori[sz]ed|forbidden|insufficient privilege/i;
  function explain(err){
    var raw = err == null ? "" : (typeof err === "string" ? err : (err.message || err.error_description || err.msg || String(err)));
    raw = String(raw).replace(/^\s*(❌|✖|⚠️?)\s*/, "");
    if(!navigator.onLine || NET_RE.test(raw)) return { kind:"network", title: navigator.onLine ? "Can't reach the server" : "No internet connection", msg: navigator.onLine ? "The page could not reach the Rumbu server. Check the network, then try again." : "This device is offline. Reconnect to Wi-Fi or mobile data, then try again.", raw: raw };
    if(SESSION_RE.test(raw)) return { kind:"session", title:"Your session has ended", msg:"Sign in again to continue.", raw: raw };
    if(PERM_RE.test(raw)) return { kind:"permission", title:"You don't have access to this", msg:"Your account is not allowed to do this. Ask IT to check your access if you need it.", raw: raw };
    return { kind:"other", title:"Something went wrong", msg:"The page could not finish loading. Try again. If it keeps happening, send IT the details below.", raw: raw };
  }

  // ---- where to show things: the shell (top window) when we are inside it --
  function host(){
    try{ if(window.top !== window && window.top.RumbuUI && window.top.RumbuUI._isHost) return window.top.RumbuUI; }catch(e){}
    return null;
  }

  // ---- banners -------------------------------------------------------------
  var shown = {};
  function bannerBox(){
    var b = document.getElementById("rsBanners");
    if(!b){ addCss(); b = document.createElement("div"); b.id = "rsBanners"; b.setAttribute("aria-live","assertive"); document.body.appendChild(b); }
    return b;
  }
  function banner(key, cls, html, opts){
    opts = opts || {};
    if(!document.body){ document.addEventListener("DOMContentLoaded", function(){ banner(key, cls, html, opts); }, { once:true }); return; }
    closeBanner(key);
    var el = document.createElement("div");
    el.className = "rs-banner " + cls; el.setAttribute("role", cls === "rs-ok" ? "status" : "alert");
    el.innerHTML = '<span class="rs-msg">' + html + '</span>' + (opts.retry ? '<button class="rs-btn" data-ro="1" data-act="retry">Try again</button>' : '') + (opts.sticky ? '' : '<button class="rs-x" data-ro="1" aria-label="Dismiss" data-act="x">&times;</button>');
    el.addEventListener("click", function(e){
      var a = e.target && e.target.getAttribute && e.target.getAttribute("data-act");
      if(a === "x") closeBanner(key);
      if(a === "retry") retryAll();
    });
    bannerBox().appendChild(el);
    shown[key] = el;
    if(opts.ms) setTimeout(function(){ if(shown[key] === el) closeBanner(key); }, opts.ms);
  }
  function closeBanner(key){ var el = shown[key]; if(el && el.parentNode) el.parentNode.removeChild(el); delete shown[key]; }
  // Try again: reload the page in the frame (or this page if it stands alone).
  function retryAll(){
    try{
      var f = document.getElementById("moduleFrame");
      if(f && f.offsetParent !== null && f.src && f.src !== "about:blank" && typeof window.refreshModule === "function"){ window.refreshModule(); closeBanner("srv"); return; }
    }catch(e){}
    location.reload();
  }

  var lastSrv = 0;
  function setOffline(){ closeBanner("back"); closeBanner("srv"); banner("off", "rs-off", "📡 <b>No internet connection.</b> Changes will not save until this device is back online.", { sticky:true }); }
  function setOnline(){ if(shown.off){ closeBanner("off"); banner("back", "rs-ok", "✅ Back online.", { ms:3500 }); } }
  function networkProblem(){
    var h = host(); if(h) return h.networkProblem();
    if(!navigator.onLine) return setOffline();
    var now = Date.now(); if(now - lastSrv < 4000) return; lastSrv = now;
    banner("srv", "rs-srv", "⚠️ <b>Can't reach the server.</b> Check the network, then try again.", { retry:true, ms:12000 });
  }

  // ---- session ended ----------------------------------------------------
  var HAD_SESSION = false;
  function markSession(){ HAD_SESSION = true; try{ localStorage.setItem("rumbu_had_session", "1"); }catch(e){} }
  function loggingOut(){ try{ return !!(window.top.__rumbuLoggingOut || window.__rumbuLoggingOut); }catch(e){ return !!window.__rumbuLoggingOut; } }
  function sessionExpired(){
    var h = host(); if(h) return h.sessionExpired();
    if(loggingOut() || document.getElementById("rsSession")) return;
    if(/\/login\.html$/i.test(location.pathname)) return;
    if(!document.body){ document.addEventListener("DOMContentLoaded", sessionExpired, { once:true }); return; }
    addCss();
    var o = document.createElement("div"); o.id = "rsSession"; o.setAttribute("role","alertdialog"); o.setAttribute("aria-modal","true"); o.setAttribute("aria-labelledby","rsSessT");
    o.innerHTML = '<div class="rs-box"><span class="rs-tile">' + logoSvg(false) + '</span><h2 id="rsSessT">Your session has ended</h2>' +
      '<p>For your security you were signed out. Sign in again to carry on. Anything not yet saved on this page is lost.</p>' +
      '<button class="rs-btn rs-solid" data-ro="1" id="rsSessBtn">Sign in again</button></div>';
    document.body.appendChild(o);
    var btn = document.getElementById("rsSessBtn");
    btn.addEventListener("click", function(){ (window.top || window).location.href = LOGIN + "?expired=1"; });
    try{ btn.focus(); }catch(e){}
  }

  // ---- fetch: notice network failures and an ended session ---------------
  function wrapFetch(base){
    return async function(input, init){
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var res, f = base || window.fetch;   // looked up on each call, never at load
      try{ res = await f.call(window, input, init); }
      catch(e){ if(!(e && e.name === "AbortError")) networkProblem(); throw e; }
      try{
        if(res.status === 401 && HAD_SESSION && url.indexOf("/rest/v1/") >= 0){
          var t = await res.clone().text();
          if(SESSION_RE.test(t)) sessionExpired();
        } else if((res.status === 400 || res.status === 401) && HAD_SESSION && /\/auth\/v1\/token\?grant_type=refresh_token/.test(url)){
          sessionExpired();
        }
      }catch(e){}
      return res;
    };
  }

  // ---- #connStatus: hide "Connected", animate "Loading", explain errors ---
  var LOADING_RE = /^(loading|checking|connecting|please wait|fetching|signing|opening|preparing)/i;
  var CONNECTED_RE = /^(✔\s*|✅\s*)?connected\b/i;
  var ERROR_RE = /^(❌|✖|⚠)|\b(error|failed|could not|couldn'?t|unable|denied|not allowed|exception)\b/i;
  function renderStatus(src, box){
    var t = (src.textContent || "").replace(/\s+/g, " ").trim();
    if(box.__last === t) return; box.__last = t;
    if(!t || CONNECTED_RE.test(t)){ box.innerHTML = ""; box.style.display = "none"; return; }
    box.style.display = "";
    if(LOADING_RE.test(t)){ box.innerHTML = loaderHtml(t.replace(/[.…\s]+$/, ""), true); return; }
    if(ERROR_RE.test(t)){
      var x = explain(t);
      if(x.kind === "session") sessionExpired();
      if(x.kind === "network") networkProblem();
      box.innerHTML = errorCardHtml(x);
      return;
    }
    box.innerHTML = '<div class="rs-info">' + esc(t) + '</div>';
  }
  // A friendly error box: what happened, what to do, Try again, and the technical text folded away.
  function errorCardHtml(err, opts){
    opts = opts || {};
    addCss();
    var x = (err && err.kind && err.title) ? err : explain(err);
    {
      var cls = x.kind === "network" ? "rs-card rs-net" : x.kind === "permission" ? "rs-card rs-perm" : "rs-card";
      var ico = x.kind === "network" ? "📡" : x.kind === "permission" ? "🔒" : x.kind === "session" ? "🔑" : "⚠️";
      var acts = x.kind === "session"
        ? '<button class="rs-btn rs-solid" data-ro="1" onclick="(window.top||window).location.href=\'' + LOGIN + '?expired=1\'">Sign in again</button>'
        : (x.kind === "permission" ? "" : '<button class="rs-btn" data-ro="1" onclick="location.reload()">Try again</button>');
      return '<div class="' + cls + '" role="alert"><span class="rs-ico" aria-hidden="true">' + ico + '</span><div class="rs-body"><b>' + esc(opts.title || x.title) + '</b>' + esc(x.msg) +
        (acts ? '<div class="rs-acts">' + acts + '</div>' : '') + (x.raw ? '<details><summary>Details</summary><code>' + esc(x.raw) + '</code></details>' : '') + '</div></div>';
    }
  }
  function watchStatus(src){
    if(!src || src.__rsWatched) return; src.__rsWatched = true;
    addCss();
    var box = document.createElement("div"); box.className = "rs-status"; box.setAttribute("aria-live","polite");
    src.parentNode.insertBefore(box, src.nextSibling);
    src.style.display = "none";
    src.setAttribute("aria-hidden", "true");
    renderStatus(src, box);
    new MutationObserver(function(){ renderStatus(src, box); }).observe(src, { childList:true, characterData:true, subtree:true });
  }

  // ---- start ---------------------------------------------------------------
  var api = {
    _isHost: false, ROOT: ROOT, LOGIN: LOGIN,
    logoSvg: logoSvg, loaderHtml: loaderHtml, explain: explain, errorCardHtml: errorCardHtml, addCss: addCss,
    networkProblem: networkProblem, sessionExpired: sessionExpired, markSession: markSession,
    wrapFetch: wrapFetch, watchStatus: watchStatus, banner: banner, closeBanner: closeBanner,
    hadSession: function(){ return HAD_SESSION; },
    hadSessionBefore: function(){ try{ return localStorage.getItem("rumbu_had_session") === "1"; }catch(e){ return false; } },
    forgetSession: function(){ try{ localStorage.removeItem("rumbu_had_session"); }catch(e){} }
  };
  var inFrame = false; try{ inFrame = window.top !== window; }catch(e){ inFrame = true; }
  api._isHost = !inFrame;
  if(!inFrame){
    window.addEventListener("offline", setOffline);
    window.addEventListener("online", setOnline);
    if(!navigator.onLine) setOffline();
  }
  window.addEventListener("unhandledrejection", function(e){
    var r = e && e.reason, m = r && (r.message || String(r));
    if(m && NET_RE.test(m)) networkProblem();
  });
  // Inside the app the header already has the back arrow, so a page's own "← Back" button
  // (the ones that call closeModule) is hidden there. Opened on its own, the page keeps it.
  function hideOwnBackButtons(){
    var inApp = false;
    try{ inApp = window.top !== window && typeof window.top.closeModule === "function"; }catch(e){}
    if(!inApp) return;
    document.querySelectorAll('[onclick*="closeModule"]').forEach(function(el){
      if(el.getAttribute("data-keep") === "1") return;
      el.style.display = "none"; el.setAttribute("aria-hidden", "true");
    });
  }
  function boot(){ addCss(); document.querySelectorAll("#connStatus").forEach(watchStatus); hideOwnBackButtons(); }
  window.addEventListener("load", hideOwnBackButtons);
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once:true }); else boot();
  return api;
})();
// ============================================================

// Every request goes through RumbuUI.wrapFetch, so a lost connection or an ended session is
// noticed and explained wherever it happens, without each page having to check.
// If the Supabase library itself could not be downloaded (no connection), sb stays null and
// requireAuth() reports it as a connection problem instead of the page breaking silently.
// On a preview link or a local copy the app uses the TEST database. Say so on screen, so nobody
// mistakes test records for live ones (top window only; pages inside the app share the one banner).
(function(){
  try{
    if(!window.RUMBU_DB || window.RUMBU_DB.env !== "test" || window.top !== window) return;
    const show = function(){
      if(document.getElementById("rumbuTestBanner")) return;
      const b = document.createElement("div");
      b.id = "rumbuTestBanner"; b.setAttribute("role", "status");
      b.style.cssText = "position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:99999;background:#b45309;color:#fff;font:700 12px/1.3 Inter,'Segoe UI',Arial,sans-serif;padding:6px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none;letter-spacing:.3px";
      b.textContent = "TEST DATABASE · changes here do not touch live data";
      document.body.appendChild(b);
    };
    if(document.body) show(); else document.addEventListener("DOMContentLoaded", show);
  }catch(e){}
})();

const sb = (typeof supabase !== "undefined" && supabase.createClient)
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: RumbuUI.wrapFetch() } })
  : null;
if (!sb) RumbuUI.networkProblem();

// Signed out without pressing Log Out (the session ran out, or was ended elsewhere): say so.
try{
  sb.auth.onAuthStateChange(function(event, session){
    if(session) RumbuUI.markSession();
    if(event === "SIGNED_OUT" && RumbuUI.hadSession()) RumbuUI.sessionExpired();
  });
}catch(e){}
// ---- Database requests sent with the public key are sent as the signed-in user -------------
// Many pages call the database directly with fetch() and the public (anon) key. Tables that only
// answer signed-in users would then refuse them. This upgrades any such request to the signed-in
// user's session automatically, so those pages keep working with no change of their own.
// Requests that already carry a user's token, requests to other sites, and pages with nobody
// signed in are left exactly as they are.
(function(){
  if(!sb || !window.fetch || window.__rumbuFetchUpgraded) return;
  window.__rumbuFetchUpgraded = true;
  const original = window.fetch.bind(window);
  const REST = SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/";
  const ANON_BEARER = "Bearer " + SUPABASE_ANON_KEY;
  let TOKEN = null, ready = null;
  function load(){
    if(!ready) ready = sb.auth.getSession()
      .then(function(r){ TOKEN = (r && r.data && r.data.session && r.data.session.access_token) || null; })
      .catch(function(){ TOKEN = null; });
    return ready;
  }
  load();
  try{ sb.auth.onAuthStateChange(function(event, session){ TOKEN = session ? session.access_token : null; ready = Promise.resolve(); }); }catch(e){}

  function anonAuthKey(headers){
    if(!headers) return null;
    if(typeof Headers !== "undefined" && headers instanceof Headers) return headers.get("Authorization") === ANON_BEARER ? "headers" : null;
    if(Array.isArray(headers)) return null;
    for(const k in headers){ if(k.toLowerCase() === "authorization" && headers[k] === ANON_BEARER) return k; }
    return null;
  }
  window.fetch = async function(input, init){
    try{
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const key = url.indexOf(REST) === 0 && init ? anonAuthKey(init.headers) : null;
      if(key){
        await load();
        if(TOKEN){
          if(key === "headers"){ const hd = new Headers(init.headers); hd.set("Authorization", "Bearer " + TOKEN); init = Object.assign({}, init, { headers: hd }); }
          else { const hd = Object.assign({}, init.headers); hd[key] = "Bearer " + TOKEN; init = Object.assign({}, init, { headers: hd }); }
        }
      }
    }catch(e){ /* on any doubt, send the request unchanged */ }
    return original(input, init);
  };
})();

// Coming back to the app after a while (screen locked, other app): check the session is still good.
if(RumbuUI._isHost){
  document.addEventListener("visibilitychange", async function(){
    if(!sb || document.visibilityState !== "visible" || !RumbuUI.hadSession() || !navigator.onLine) return;
    try{
      let { data } = await sb.auth.getSession();
      if(!data || !data.session){ const r = await sb.auth.refreshSession(); data = r && r.data; }
      if(!data || !data.session) RumbuUI.sessionExpired();
    }catch(e){ /* offline or server busy: the network banner covers it */ }
  });
}

// Derives the force-change-password page path from whatever loginPath
// the caller passed in (e.g. "login.html" -> "force-change-password.html",
// "../../login.html" -> "../../force-change-password.html"), so no
// calling page needs to be edited individually.
function _kwpForceChangePath(loginPath){
  return loginPath.replace(/login\.html$/, "force-change-password.html");
}

// Redirects to loginPath.html if not signed in. Otherwise resolves with the
// full profile: { id, username, role, super_admin_type, section_id,
// section_name, department_ids, department_names }
// Throws a descriptive Error on any failure — callers should wrap this in
// try/catch and show err.message somewhere visible, rather than letting
// it fail silently.
// ── System Audit Log ─────────────────────────────────────────────────────────
// Sign-ins, sign-outs and screens opened are written to public.audit_log (system_audit_log.sql).
// Changes to data are recorded by the database itself. Logging never blocks or breaks a page.
function rumbuAudit(kind, page, details){
  try{
    return Promise.race([
      sb.rpc("log_event", { p_kind: kind, p_page: page || null, p_details: details || null }).then(() => {}, () => {}),
      new Promise(r => setTimeout(r, 1500))
    ]);
  }catch(e){ return Promise.resolve(); }
}
window.rumbuAudit = rumbuAudit;
function _rumbuAuditPage(){
  if(window.__rumbuPageLogged) return;
  window.__rumbuPageLogged = true;
  const path = location.pathname;
  if(/(^|\/)(index\.html)?$/.test(path) || /login\.html$/.test(path)) return;  // the shell itself: covered by the sign-in
  const q = location.search.length > 1 && location.search.length < 200 ? location.search : "";
  let title = document.title || "";
  try{ const cp = window.top !== window && window.top.document.getElementById("crumbPage"); if(cp && cp.textContent.trim()) title = cp.textContent.trim(); }catch(e){}
  rumbuAudit("page", path + q, { title: title.replace(/\s*·\s*RumbuApp\s*$/, "") });
}
// ─────────────────────────────────────────────────────────────────────────────

async function requireAuth(loginPath) {
  loginPath = loginPath || "login.html";
  if (!sb) throw new Error("Could not reach the server: the app could not load its connection library. Check your internet connection.");

  let session;
  try {
    const sessRes = await sb.auth.getSession();
    session = sessRes.data.session;
  } catch (e) {
    throw new Error("Could not reach Supabase Auth: " + e.message);
  }

  // getSession() returns null on mobile when the browser suspended the tab
  // and Supabase's background refresh timer never ran (screen lock, app switch).
  // Before redirecting to login, attempt one explicit token refresh — if the
  // refresh token is still valid (Supabase default: 7 days) the session is
  // silently restored and the user never sees an unexpected logout.
  if (!session) {
    try {
      const { data: rd } = await sb.auth.refreshSession();
      session = rd?.session || null;
    } catch (_) { /* refresh genuinely failed — fall through to redirect */ }
  }

  if (!session) {
    // Signed in on this device before: tell the login page the session ended, so it can say so.
    (window.top||window).location.href = loginPath + (RumbuUI.hadSessionBefore() ? "?expired=1" : "");
    return null;
  }

  const PROFILE_COLS = "id, username, role, super_admin_type, section_id, can_self_manage_todos, must_change_password, last_open_module";
  let { data: profile, error: profErr } = await sb
    .from("profiles")
    .select(PROFILE_COLS + ", is_head_of_it")
    .eq("id", session.user.id)
    .single();
  // Before head_of_it_marker.sql has been run the column does not exist yet: load without it.
  let headMarkerMissing = false;
  if (profErr && /is_head_of_it/i.test(profErr.message || "")) {
    headMarkerMissing = true;
    ({ data: profile, error: profErr } = await sb.from("profiles").select(PROFILE_COLS).eq("id", session.user.id).single());
  }

  if (profErr || !profile) {
    if (profErr && /jwt|session/i.test(profErr.message || "")) RumbuUI.sessionExpired();
    throw new Error("Could not load profile: " + (profErr ? profErr.message : "no profile row for this account"));
  }
  RumbuUI.markSession();

  // --- KWP Phase 2: forced password change ---
  if (profile.must_change_password) {
    (window.top||window).location.href = _kwpForceChangePath(loginPath);
    return null;
  }

  // --- KWP Phase 2: inactive/suspended KWP staff cannot use the system ---
  // No-op for every account that isn't linked to an employees row with a
  // kwp_staff assignment. kwp_staff_current always reflects `employees`
  // live (per the KWP Employee Master Rule) rather than a stored copy.
  try {
    const { data: kwpLink } = await sb
      .from("kwp_staff_current")
      .select("status")
      .eq("linked_profile_id", profile.id)
      .maybeSingle();
    if (kwpLink && kwpLink.status !== "Active") {
      window.__rumbuLoggingOut = true; RumbuUI.forgetSession();
      await rumbuAudit("sign_out", null, { reason: "Signed out: staff record not active" });
      await sb.auth.signOut();
      (window.top||window).location.href = loginPath + "?blocked=inactive";
      return null;
    }
  } catch (e) {
    // Non-fatal: if this lookup fails for some reason, fall through
    // rather than lock every user (KWP or not) out of the whole app.
    console.warn("KWP status check failed (non-fatal):", e);
  }

  let sectionIds = [];
  let sectionNames = [];
  const { data: ps, error: psErr } = await sb.from("profile_sections").select("section_id, app_sections(name)").eq("profile_id", profile.id);
  if (psErr) throw new Error("Could not load Section assignments: " + psErr.message);
  sectionIds = (ps || []).map(r => r.section_id);
  sectionNames = (ps || []).map(r => r.app_sections ? r.app_sections.name : null).filter(Boolean);

  let departmentIds = [];
  let departmentNames = [];
  // Non-fatal by design, same reasoning as the KWP check above: if this
  // lookup ever fails (wrong table name, missing data, anything) it must
  // not block login for every "user"-role account — degrade to empty
  // department info rather than throwing.
  if (profile.role === "user") {
    try {
      const { data: ud, error: udErr } = await sb.from("user_departments").select("department_id").eq("profile_id", profile.id);
      if (udErr) throw udErr;
      departmentIds = (ud || []).map(r => r.department_id);
      if (departmentIds.length) {
        const { data: depts, error: deptErr } = await sb.from("app_departments").select("id,name").in("id", departmentIds);
        if (deptErr) throw deptErr;
        departmentNames = (depts || []).map(d => d.name);
      }
    } catch (e) {
      console.warn("Department assignment lookup failed (non-fatal):", e);
    }
  }

  // The Head of IT is the system IT administrator with full elevated access. It is the one account
  // marked profiles.is_head_of_it (set only in the database, see head_of_it_marker.sql), so it no
  // longer depends on the login name; the old name check is used only until that SQL has been run.
  // A "Super Admin (full access)" is a super_admin whose type is exactly "full". Only the Head of IT can assign
  // it (enforced by the swift-handler edge function and a database guard), and it can change data across
  // the system but cannot manage other Super Admin accounts: that stays with the Head of IT.
  // Every other super_admin account is Viewer-only (read-only across the system). Any other type value,
  // including "management" and "technical", stays read-only, so existing accounts are unchanged.
  const isHeadOfIt = profile.role === "super_admin" &&
    (profile.is_head_of_it === true || (headMarkerMissing && profile.username === "itops3"));
  const isItops = isHeadOfIt;   // older pages ask for isItops
  const isFullSuperAdmin = profile.role === "super_admin" && profile.super_admin_type === "full";
  // A Developer (IT) is a Super Admin of type "technical": view-only on live, enforced by the database
  // (developer_role.sql) as well as by the screens. Manage Accounts is closed to them apart from
  // changing their own password and reading the activity log.
  const isDeveloper = profile.role === "super_admin" && profile.super_admin_type === "technical" && !isHeadOfIt;
  const readOnly = profile.role === "super_admin" && !isItops && !isFullSuperAdmin;
  if(isDeveloper && /\/modules\/admin\//.test(location.pathname)){
    const sec = new URLSearchParams(location.search).get("section") || "";
    if(sec !== "change-password" && sec !== "activity-log"){
      const stop = () => { document.body.innerHTML = '<div style="max-width:520px;margin:12vh auto;padding:28px;border:1px solid #d8dee8;border-radius:14px;background:#fff;font:14px/1.6 Inter,Segoe UI,Arial,sans-serif;color:#1f2430;text-align:center">' +
        '<h2 style="margin:0 0 8px;color:#1F3864;font-size:18px">Not available to Developer accounts</h2>' +
        'Accounts, branches, modules and access are managed by the Head of IT. You can still change your own password and read the activity log.</div>'; };
      if(document.body) stop(); else document.addEventListener("DOMContentLoaded", stop);
      throw new Error("Developer accounts cannot open this Manage Accounts screen.");
    }
  }

  if(readOnly) _scheduleReadOnly();
  setTimeout(_rumbuAuditPage, 400);

  return {
    id: profile.id,
    username: profile.username,
    role: profile.role,
    superAdminType: profile.super_admin_type,
    sectionId: sectionIds.length ? sectionIds[0] : null,
    sectionName: sectionNames.length ? sectionNames.join(", ") : null,
    sectionIds: sectionIds,
    sectionNames: sectionNames,
    departmentIds: departmentIds,
    departmentNames: departmentNames,
    canSelfManageTodos: !!profile.can_self_manage_todos,
    lastOpenModule: profile.last_open_module || null,
    isHeadOfIt: isHeadOfIt,
    isDeveloper: isDeveloper,
    isItops: isItops,
    isFullSuperAdmin: isFullSuperAdmin,
    readOnly: readOnly
  };
}

// ── Read-Only Enforcement ─────────────────────────────────────────────────────
// Called automatically when a viewer super_admin logs in. Uses a MutationObserver
// so it applies to every element the module renders dynamically — no module
// file changes required. Allows filters, searches, downloads, and exports.
// Blocks all add / save / submit / approve / delete / edit operations.

function _scheduleReadOnly(){
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", ()=>setTimeout(_applyReadOnly, 300));
  } else {
    setTimeout(_applyReadOnly, 300);
  }
}

// Button text that signals a write action — block these
const _RO_WRITE = /^(save|submit|add\b|create|delete|remove|approve|reject|complete|generate label|upload|confirm|send|record|log entry|initiate|offload|dispatch|update|change|archive|assign|link|grant|revoke|switch operator|correct|reset password|mark as|close lot|open lot|set|apply changes|done|finish|process|pick|unlock|release|re-run|rerun|retest)/i;
// Button text that signals a safe read action — always allow these
const _RO_SAFE  = /^(search|filter|find|look|download|export|print|view|refresh|load|show|back|close|cancel|ok|got it|open report|preview|scan|lookup|check|select|go to|open detail|see|toggle|collapse|expand|branch|all branches|today|last|this week|this month|date|range|from|to|clear filter)/i;

function _applyReadOnly(){
  if(document.getElementById("rumbu-ro-active")) return; // already applied

  // Silent marker — no visible banner
  const marker = document.createElement("span");
  marker.id = "rumbu-ro-active";
  marker.style.display = "none";
  document.body.appendChild(marker);

  // MutationObserver watches for dynamically rendered content
  new MutationObserver(_roSweep).observe(document.body,{childList:true,subtree:true});
  _roSweep();
}

function _roSweep(){
  // Buttons
  document.querySelectorAll("button:not([data-ro]),input[type=submit]:not([data-ro]),input[type=button]:not([data-ro])").forEach(el=>{
    el.setAttribute("data-ro","1");
    const txt = (el.textContent||el.value||el.innerText||"").trim();
    const cls = el.className||"";
    if(_RO_SAFE.test(txt)) return; // explicitly safe — leave alone
    if(
      _RO_WRITE.test(txt)            // write keyword in text
      || /\bdanger\b/.test(cls)      // red/danger class
      || /\bdelete\b/.test(cls)
      || /\bsubmit\b/.test(cls)
    ){
      _roBlock(el);
    }
  });

  // Text / number / date inputs — make readonly unless they are clearly a filter
  document.querySelectorAll(
    "input[type=text]:not([data-ro]),input[type=number]:not([data-ro]),"
   +"input[type=email]:not([data-ro]),input[type=password]:not([data-ro]),"
   +"input[type=date]:not([data-ro]),input[type=datetime-local]:not([data-ro]),"
   +"input[type=time]:not([data-ro]),textarea:not([data-ro])"
  ).forEach(el=>{
    el.setAttribute("data-ro","1");
    const id  = (el.id||"").toLowerCase();
    const ph  = (el.placeholder||"").toLowerCase();
    const nm  = (el.name||"").toLowerCase();
    // Allow filter / search / date-range inputs
    if(/search|filter|find|from|to_date|rep_|date_from|date_to|range/.test(id+ph+nm)) return;
    el.setAttribute("readonly","");
    el.style.cssText += ";background:var(--bg,#f5f7fa)!important;cursor:default;";
  });

  // Selects — disable unless they are clearly a filter or branch picker
  document.querySelectorAll("select:not([data-ro])").forEach(el=>{
    el.setAttribute("data-ro","1");
    const id = (el.id||"").toLowerCase();
    if(/branch|section|filter|search|range|rep_|from|to\b|date|period|status_filter|grade_filter|lot_filter/.test(id)) return;
    el.disabled = true;
    el.style.cssText += ";opacity:.5;cursor:default;";
  });

  // File inputs — disable upload
  document.querySelectorAll("input[type=file]:not([data-ro])").forEach(el=>{
    el.setAttribute("data-ro","1");
    el.disabled = true;
  });
}

function _roBlock(el){
  el.disabled = true;
  el.style.cssText += ";opacity:.3;cursor:not-allowed;";
  el.title = "Read-only access — changes are not permitted";
  el.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();},true);
}
// ─────────────────────────────────────────────────────────────────────────────

async function logout(loginPath) {
  // A chosen sign-out: no "session has ended" message, and the login page does not show one either.
  window.__rumbuLoggingOut = true;
  try{ window.top.__rumbuLoggingOut = true; }catch(e){}
  RumbuUI.forgetSession();
  await rumbuAudit("sign_out", null, null);
  try{ await sb.auth.signOut(); }catch(e){ /* offline: the local sign-out still happens */ }
  (window.top||window).location.href = loginPath || "login.html";
}

// Blur any focused number input when the user scrolls — prevents the
// browser's default behaviour of changing the field's value on scroll.
document.addEventListener("wheel", function(){
  if(document.activeElement && document.activeElement.type === "number"){
    document.activeElement.blur();
  }
}, { passive: true });
