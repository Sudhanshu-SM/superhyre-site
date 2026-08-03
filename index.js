/* SuperHyre — home page motion (GSAP ScrollTrigger).
   All effects degrade gracefully: without GSAP (or with reduced
   motion) every section stays fully visible and static. */
(function () {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  var mm = gsap.matchMedia();

  /* ---------- quote carousel (shared with talent.html) ---------- */
  (function carousel() {
    var quotes = [
      {
        t: "I noticed that the dynamic range between what an average person could accomplish and what the best person could accomplish was 50 or 100 to 1. Given that, you're well advised to go after the cream of the cream.",
        who: "Steve Jobs", org: "Apple"
      },
      {
        t: "The most important thing you can do in the early stages of a startup is hire great people.",
        who: "Paul Graham", org: "Y Combinator"
      }
    ];

    var i = 0, n = quotes.length;
    var t = document.getElementById('q-text'),  w = document.getElementById('q-who'),  o = document.getElementById('q-org');
    var lt = document.getElementById('ql-text'), lw = document.getElementById('ql-who'), lo = document.getElementById('ql-org');
    var rt = document.getElementById('qr-text'), rw = document.getElementById('qr-who'), ro = document.getElementById('qr-org');
    var dots = document.getElementById('q-dots');
    var prev = document.querySelector('.q-prev'), next = document.querySelector('.q-next');
    if (!t || !dots || !prev || !next) return;

    quotes.forEach(function (_, idx) {
      var b = document.createElement('button');
      b.setAttribute('aria-label', 'Quote ' + (idx + 1));
      b.addEventListener('click', function () { i = idx; render(); });
      dots.appendChild(b);
    });

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function render() {
      var q = quotes[i], p = quotes[(i - 1 + n) % n], nx = quotes[(i + 1) % n];
      if (reduceMotion) {
        paint(q, p, nx);
      } else {
        gsap.to('.quote', { opacity: 0, y: 14, duration: 0.18, onComplete: function () {
          paint(q, p, nx);
          gsap.to('.quote', { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
        }});
      }
      Array.prototype.forEach.call(dots.children, function (d, idx) { d.className = idx === i ? 'on' : ''; });
    }

    function paint(q, p, nx) {
      t.textContent = '\u201C' + q.t + '\u201D'; w.textContent = q.who; o.textContent = q.org;
      lt.textContent = '\u201C' + p.t + '\u201D'; lw.textContent = p.who; lo.textContent = p.org;
      rt.textContent = '\u201C' + nx.t + '\u201D'; rw.textContent = nx.who; ro.textContent = nx.org;
    }

    prev.addEventListener('click', function () { i = (i - 1 + n) % n; render(); });
    next.addEventListener('click', function () { i = (i + 1) % n; render(); });
    render();
  })();

  /* ---------- scroll reveals (all viewports) ---------- */
  gsap.utils.toArray('[data-reveal]').forEach(function (el) {
    gsap.from(el, {
      opacity: 0, y: 34,
      duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%' }
    });
  });

  /* ---------- stat count-up ---------- */
  gsap.utils.toArray('.stat').forEach(function (stat) {
    var num = stat.querySelector('[data-count]');
    if (!num) return;
    var target = parseFloat(num.getAttribute('data-count')) || 0;
    var suffix = num.getAttribute('data-suffix') || '';
    var obj = { v: 0 };
    ScrollTrigger.create({
      trigger: stat, start: 'top 88%', once: true,
      onEnter: function () {
        gsap.to(obj, {
          v: target, duration: 1.6, ease: 'power2.out',
          onUpdate: function () {
            num.textContent = Math.round(obj.v) + suffix;
          }
        });
      }
    });
  });

  /* ---------- hero intro ---------- */
  mm.add('(prefers-reduced-motion: no-preference)', function () {
    var heroEl = document.querySelector('.hero-section');
    if (!heroEl || !document.querySelector('.hero-headline')) return;

    var intro = gsap.timeline({ defaults: { ease: 'power4.out' } });
    intro
      .from('.hero-headline', { y: 44, opacity: 0, duration: 0.9 })
      .from('.hero-description', { y: 22, opacity: 0, duration: 0.7 }, '-=0.5');

    gsap.to(['.hero-headline', '.hero-description'], {
      yPercent: -14, opacity: 0, ease: 'none',
      scrollTrigger: { trigger: heroEl, start: 'top top', end: 'bottom 25%', scrub: 0.6 }
    });
  });

  /* ---------- process: progress line ---------- */
  mm.add('(prefers-reduced-motion: no-preference)', function () {
    var line = document.querySelector('.process-line i');
    if (!line) return;
    gsap.to(line, {
      scaleY: 1, ease: 'none',
      scrollTrigger: {
        trigger: '.process-stack', start: 'top 70%', end: 'bottom 30%', scrub: 0.6
      }
    });
  });

  /* ---------- features: horizontal pan (desktop only) ---------- */
  mm.add('(min-width: 861px) and (prefers-reduced-motion: no-preference)', function () {
    var wrap = document.querySelector('.pan-wrap');
    var track = document.querySelector('.pan-track');
    if (!wrap || !track) return;

    gsap.to(track, {
      x: function () { return -(track.scrollWidth - wrap.clientWidth); },
      ease: 'none',
      scrollTrigger: {
        trigger: wrap,
        start: 'top top',
        end: function () { return '+=' + (track.scrollWidth - wrap.clientWidth); },
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true
      }
    });
  });

  ScrollTrigger.refresh();
})();
