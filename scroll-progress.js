/* Custom scroll-progress bar for index.html + talent.html.
   Replaces the native scrollbar with a slim fixed progress line on the
   right edge. On index.html (#decision present) the fill inverts to white
   while the orange CTA banner is on screen; everywhere else it stays the
   accent orange. Runs with Lenis without interference (native scroll is
   still the real scroller; Lenis only smooths it). */
(function () {
  'use strict';

  var ORANGE = '#EA5A1E';
  var WHITE = '#FFFFFF';
  var SHADOW_ORANGE = '0 0 10px rgba(234,90,30,.6)';
  var SHADOW_WHITE = '0 0 10px rgba(255,255,255,.8)';

  var bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  var fill = document.createElement('div');
  fill.className = 'scroll-progress-fill';
  bar.appendChild(fill);
  document.body.appendChild(bar);

  // Only index.html has the orange #decision banner -> invert there.
  var decision = document.getElementById('decision');
  var invert = !!decision;

  function inOrange() {
    if (!invert) return false;
    var r = decision.getBoundingClientRect();
    return r.top <= window.innerHeight * 0.5 && r.bottom >= window.innerHeight * 0.1;
  }

  function update() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var max =
      (document.documentElement.scrollHeight || document.body.scrollHeight) -
      window.innerHeight;
    var p = max > 0 ? Math.min(Math.max(y / max, 0), 1) : 0;
    fill.style.transform = 'scaleY(' + p + ')';

    var white = inOrange();
    fill.style.backgroundColor = white ? WHITE : ORANGE;
    fill.style.boxShadow = white ? SHADOW_WHITE : SHADOW_ORANGE;
  }

  // rAF loop: tracks Lenis' smoothed position every frame, no event gaps
  requestAnimationFrame(function tick() {
    update();
    requestAnimationFrame(tick);
  });

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
})();