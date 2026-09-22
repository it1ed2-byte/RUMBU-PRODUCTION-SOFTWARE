// pwa-install.js
// -----------------------------------------------------------
// Shows an install prompt automatically whenever the site is opened by
// someone who doesn't already have it installed as an app. Included on
// login.html and index.html — the two pages anyone not yet installed is
// most likely to land on.
//
// Browsers do not allow a truly automatic (zero-tap) install — Chrome/
// Edge/Android require one tap on a real button before the native
// install dialog can appear, and iOS Safari has no programmatic install
// at all (Apple only allows Share -> Add to Home Screen by hand). This
// gets as close to "automatic" as each platform allows: the banner
// itself appears with no action needed, and installing takes exactly
// one tap on Android/Chrome/Edge, or the person is shown exactly what
// to tap on iOS.
// -----------------------------------------------------------
(function(){
  function isStandalone(){
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }
  if(isStandalone()) return; // already installed and running as an app — nothing to do

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  let deferredPrompt = null;

  function buildBanner(){
    const bar = document.createElement("div");
    bar.id = "pwaInstallBar";
    bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#12203c;color:#fff;padding:8px 12px;display:flex;align-items:center;gap:10px;box-shadow:0 -4px 16px rgba(0,0,0,.25);font-family:inherit;box-sizing:border-box;min-height:0;";

    const text = document.createElement("div");
    text.style.cssText = "flex:1 1 auto;min-width:0;font-size:12.5px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    text.innerHTML = '<b>Install RumbuApp</b> <span id="pwaInstallText" style="opacity:.8;">— add to home screen</span>';
    bar.appendChild(text);

    const btn = document.createElement("button");
    btn.id = "pwaInstallBtn";
    // Explicit overrides for every property a page's own button{} rule
    // (e.g. login.html's full-width login button) could otherwise leak
    // through onto this one, since unset properties still fall through
    // to the page's stylesheet even with inline styles applied.
    btn.style.cssText = "flex:0 0 auto;width:auto;height:auto;min-height:0;margin:0;background:#c8a34e;color:#12203c;border:0;padding:6px 14px;border-radius:6px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;";
    btn.textContent = "Install";
    bar.appendChild(btn);

    const dismiss = document.createElement("button");
    dismiss.id = "pwaInstallDismiss";
    dismiss.setAttribute("aria-label", "Dismiss");
    dismiss.style.cssText = "flex:0 0 auto;width:auto;height:auto;min-height:0;margin:0;background:transparent;color:#fff;border:0;font-size:17px;line-height:1;cursor:pointer;padding:2px 4px;";
    dismiss.innerHTML = "&times;";
    bar.appendChild(dismiss);

    document.body.appendChild(bar);
    dismiss.onclick = function(){ bar.remove(); };
    return bar;
  }

  if(isIOS){
    // No programmatic install on iOS — show instructions instead, as soon
    // as the page loads, every time, until the person installs it.
    const bar = buildBanner();
    document.getElementById("pwaInstallText").textContent =
      'Tap the Share button, then "Add to Home Screen".';
    document.getElementById("pwaInstallBtn").style.display = "none";
    return;
  }

  // Chrome / Edge / Android: capture the real install prompt the moment
  // the browser offers it, and show the banner immediately — no need to
  // wait for a click anywhere else on the page first.
  window.addEventListener("beforeinstallprompt", function(e){
    e.preventDefault();
    deferredPrompt = e;
    const bar = buildBanner();
    document.getElementById("pwaInstallBtn").onclick = async function(){
      bar.remove();
      if(!deferredPrompt) return;
      deferredPrompt.prompt();
      try{ await deferredPrompt.userChoice; }catch(e){}
      deferredPrompt = null;
    };
  });
})();
