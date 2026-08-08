/* SuperHyre — full-screen nav overlay (index.html).
   Toggle: hamburger -> open morph, body + root-scroller scroll lock,
   Lenis frozen while open (revived on close), ESC to close, link click
   closes. No dependencies. */
(function () {
  var toggle = document.querySelector('.menu-toggle');
  var overlay = document.getElementById('nav-overlay');
  var topbar = document.querySelector('.topbar');
  if (!toggle || !overlay) return;
  var lenisWasRunning = false;
  // Lenis 1.3.x exposes isStopped both as boolean prop and (newer) as fn
  function lenisStopped(l) {
    if (!l) return true;
    if (typeof l.isStopped === 'function') return !!l.isStopped();
    return l.isStopped === true;
  }
  function stopLenis() {
    var l = window.__lenis;
    if (l && typeof l.stop === 'function' && !lenisStopped(l)) {
      lenisWasRunning = true;
      l.stop();
    }
  }
  function resumeLenis() {
    var l = window.__lenis;
    if (lenisWasRunning && l && lenisStopped(l) && typeof l.start === 'function') {
      l.start();
    }
    lenisWasRunning = false;
  }

  function setState(open) {
    overlay.classList.toggle('is-active', open);
    toggle.classList.toggle('is-open', open);
    if (topbar) topbar.classList.toggle('is-open', open);
    document.body.classList.toggle('no-scroll', open);
    document.documentElement.classList.toggle('no-scroll', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      stopLenis();
      var first = overlay.querySelector('.nav-link');
      if (first) first.focus({ preventScroll: true });
    } else {
      // Release focus from the (now invisible) overlay so no focus fix-up
      // can jump the page when the lock releases — same lesson as the
      // contact modal. Return focus to the menu button instead.
      if (overlay.contains(document.activeElement)) {
        if (document.activeElement.blur) document.activeElement.blur();
      }
      toggle.focus({ preventScroll: true });
      resumeLenis();
    }
  }

  toggle.addEventListener('click', function () {
    setState(!overlay.classList.contains('is-active'));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('is-active')) setState(false);
  });

  Array.prototype.forEach.call(overlay.querySelectorAll('a'), function (a) {
    a.addEventListener('click', function () { setState(false); });
  });
})();