/**
 * pwa-install.js
 *
 * Suppresses the browser's automatic "Add to Home Screen" / install popup.
 * The install prompt is stored and triggered only when the user explicitly
 * clicks the "Install App" button in the sidebar (#pwa-install-btn).
 *
 * Applied to the entire app via index.html — covers all modules.
 */
(function () {
  var _deferred = null;

  // Intercept the native prompt — prevent it from auto-appearing
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    _deferred = e;
    // Reveal the sidebar install button now that we know the app is installable
    var btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'flex';
  });

  // Once installed, hide the button and clear the stored prompt
  window.addEventListener('appinstalled', function () {
    _deferred = null;
    var btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
  });

  // Called by the sidebar button onclick
  window.triggerPWAInstall = function () {
    if (!_deferred) return;
    _deferred.prompt();
    _deferred.userChoice.then(function (result) {
      _deferred = null;
      if (result.outcome === 'accepted') {
        var btn = document.getElementById('pwa-install-btn');
        if (btn) btn.style.display = 'none';
      }
    });
  };
})();
