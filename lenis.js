/* SuperHyre — Lenis smooth scroll (shared: index.html + talent.html).
   Loaded with `defer` in the head, after GSAP/ScrollTrigger, so it can
   check for them at execution time. Only activates when Lenis AND
   GSAP/ScrollTrigger are available and the user has not requested
   reduced motion — everything else keeps native scrolling. */
(function () {
  if (typeof Lenis === 'undefined') return;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.documentElement.classList.add('js-motion');

  var lenis = new Lenis({
    duration: 1.2,
    easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
    smoothWheel: true
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
  gsap.ticker.lagSmoothing(0);

  /* Route in-page anchors through Lenis so the smoothing never fights a native jump. */
  document.addEventListener('click', function (e) {
    var anchor = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!anchor) return;
    var hash = anchor.getAttribute('href');
    if (!hash || hash.length < 2) return;
    var target = document.querySelector(hash);
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: 0, duration: 1.4 });
  });

  window.__lenis = lenis;
})();
