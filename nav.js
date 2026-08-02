/* SuperHyre — full-screen nav overlay (shared).
   Toggle: hamburger -> close morph, body scroll lock, ESC to close,
   link click closes. No dependencies. */
(function () {
  var toggle = document.querySelector('.menu-toggle');
  var overlay = document.getElementById('nav-overlay');
  var topbar = document.querySelector('.topbar');
  if (!toggle || !overlay) return;

  function setState(open) {
    overlay.classList.toggle('is-active', open);
    toggle.classList.toggle('is-open', open);
    if (topbar) topbar.classList.toggle('is-open', open);
    document.body.classList.toggle('no-scroll', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      var first = overlay.querySelector('.nav-link');
      if (first) first.focus({ preventScroll: true });
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
