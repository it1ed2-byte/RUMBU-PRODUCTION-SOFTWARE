// pwa-install.js
// -----------------------------------------------------------
// Shows a centred install modal after login (index.html).
// One tap on Android/Chrome/Edge installs the app directly.
// iOS users see Share → Add to Home Screen instructions.
// Already-installed (standalone) users never see it.
// -----------------------------------------------------------
(function(){
  function isStandalone(){
    return window.matchMedia("(display-mode: standalone)").matches ||
           window.navigator.standalone === true;
  }
  if(isStandalone()) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  let deferredPrompt = null;

  function buildModal(onInstall){
    // Backdrop
    const overlay = document.createElement("div");
    overlay.id = "pwaOverlay";
    overlay.style.cssText = [
      "position:fixed;inset:0;z-index:99998",
      "background:rgba(0,0,0,.55)",
      "display:flex;align-items:center;justify-content:center",
      "padding:20px;box-sizing:border-box"
    ].join(";");

    // Card
    const card = document.createElement("div");
    card.style.cssText = [
      "position:relative",
      "background:#fff;border-radius:14px",
      "padding:32px 28px 24px",
      "max-width:360px;width:100%",
      "box-shadow:0 8px 40px rgba(0,0,0,.28)",
      "text-align:center;font-family:inherit",
      "box-sizing:border-box"
    ].join(";");

    // Close ×
    const close = document.createElement("button");
    close.setAttribute("aria-label","Close");
    close.style.cssText = [
      "position:absolute;top:10px;right:12px",
      "background:none;border:none;cursor:pointer",
      "font-size:22px;line-height:1;color:#666",
      "padding:4px 6px;margin:0;width:auto;height:auto"
    ].join(";");
    close.innerHTML = "&times;";
    close.onclick = () => overlay.remove();

    // Icon
    const icon = document.createElement("img");
    icon.src = "icon-192.png";
    icon.alt = "";
    icon.style.cssText = "width:64px;height:64px;border-radius:14px;margin-bottom:14px;display:block;margin-left:auto;margin-right:auto;";
    icon.onerror = () => { icon.style.display="none"; };

    // Heading
    const h = document.createElement("h3");
    h.style.cssText = "margin:0 0 8px;font-size:17px;color:#1F3864;font-weight:800;";
    h.textContent = "Install RumbuApp";

    // Body text
    const p = document.createElement("p");
    p.id = "pwaModalMsg";
    p.style.cssText = "margin:0 0 20px;font-size:13px;color:#555;line-height:1.5;";

    if(isIOS){
      p.innerHTML = 'Tap the <b>Share</b> button in your browser, then choose <b>"Add to Home Screen"</b> to install RumbuApp.';
    } else {
      p.textContent = "Add RumbuApp to your home screen for quick access — works offline and feels like a native app.";
    }

    // Install button
    const btn = document.createElement("button");
    btn.style.cssText = [
      "display:block;width:100%;margin:0",
      "background:#1F3864;color:#fff",
      "border:none;border-radius:8px",
      "padding:12px 0;font-size:14px;font-weight:700",
      "cursor:pointer;letter-spacing:.3px"
    ].join(";");

    if(isIOS){
      btn.textContent = "Got it";
      btn.onclick = () => overlay.remove();
    } else {
      btn.textContent = "Install App";
      btn.onclick = async () => {
        overlay.remove();
        if(!deferredPrompt) return;
        deferredPrompt.prompt();
        try{ await deferredPrompt.userChoice; }catch(e){}
        deferredPrompt = null;
      };
    }

    card.appendChild(close);
    card.appendChild(icon);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(btn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Close on backdrop click
    overlay.addEventListener("click", e => { if(e.target === overlay) overlay.remove(); });
  }

  if(isIOS){
    buildModal();
    return;
  }

  window.addEventListener("beforeinstallprompt", function(e){
    e.preventDefault();
    deferredPrompt = e;
    buildModal();
  });
})();
