/* SuperHyre — home page motion (GSAP ScrollTrigger).
   All effects degrade gracefully: without GSAP (or with reduced
   motion) every section stays fully visible and static. */

/* ---------- bento stat count-up (vanilla — runs without GSAP) ---------- */
(function () {
  var statElements = document.querySelectorAll('.stat-number');
  if (!statElements.length) return;

  function startCountAnimation(el) {
    var target = parseInt(el.getAttribute('data-target'), 10);
    var unit = el.getAttribute('data-unit') || '';
    var duration = 1500;
    var startTime = performance.now();

    function updateCount(currentTime) {
      var progress = Math.min((currentTime - startTime) / duration, 1);
      var eased = 1 - (1 - progress) * (1 - progress);
      var currentVal = Math.floor(eased * target);

      el.innerHTML = currentVal + '<span class="stat-unit">' + unit + '</span>';

      if (progress < 1) {
        requestAnimationFrame(updateCount);
      } else {
        el.innerHTML = target + '<span class="stat-unit">' + unit + '</span>';
      }
    }

    requestAnimationFrame(updateCount);
  }

  var observer = new IntersectionObserver(
    function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          startCountAnimation(entry.target);
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  statElements.forEach(function (stat) { observer.observe(stat); });
})();

/* ---------- process timeline: line fill + card highlight (vanilla — runs without GSAP) ---------- */
(function () {
  var timelineWrapper = document.querySelector('.timeline-wrapper');
  var timelineProgress = document.getElementById('timelineProgress');
  if (!timelineWrapper) return;

  window.addEventListener('scroll', function () {
    var rect = timelineWrapper.getBoundingClientRect();
    var totalHeight = rect.height;
    var currentScroll = window.innerHeight / 2 - rect.top;
    var progress = Math.min(Math.max(currentScroll / totalHeight, 0), 1);
    if (timelineProgress) {
      timelineProgress.style.height = (progress * 100) + '%';
    }
  });

  var timelineCards = document.querySelectorAll('.timeline-card');

  function revealCards() {
    timelineCards.forEach(function (card) {
      if (card.getBoundingClientRect().top < window.innerHeight) {
        card.classList.add('is-active');
      }
    });
  }

  if (!('IntersectionObserver' in window)) {
    timelineCards.forEach(function (card) { card.classList.add('is-active'); });
    return;
  }

  var observerOptions = {
    root: null,
    rootMargin: '0px 0px -10% 0px',
    threshold: 0.15
  };

  var cardObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-active');
        }
      });
    },
    observerOptions
  );

  timelineCards.forEach(function (card) {
    cardObserver.observe(card);
  });

  setTimeout(revealCards, 100);
})();

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

  /* ---------- dark sections: staggered reveals ---------- */
  gsap.utils.toArray('.stat-card').forEach(function (el) {
    gsap.from(el, {
      opacity: 0, y: 34, duration: 0.7, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%' }
    });
  });
  gsap.from('.problem-header', {
    opacity: 0, y: 30, duration: 0.8, ease: 'power3.out',
    scrollTrigger: { trigger: '.problem-header', start: 'top 88%' }
  });
  gsap.utils.toArray('.problem-card').forEach(function (el) {
    gsap.from(el, {
      opacity: 0, y: 40, duration: 0.8, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' }
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

  /* ---------- why it works: header + card reveals ---------- */
  gsap.from('.why-title-wrapper', {
    opacity: 0, y: 30, duration: 0.8, ease: 'power3.out',
    scrollTrigger: { trigger: '.why-header', start: 'top 88%' }
  });
  gsap.from('.why-header .btn-primary-orange', {
    opacity: 0, y: 20, duration: 0.7, ease: 'power3.out', delay: 0.15,
    scrollTrigger: { trigger: '.why-header', start: 'top 88%' }
  });
  gsap.from('.why-card', {
    opacity: 0, y: 40, duration: 0.8, ease: 'power3.out', stagger: 0.12,
    scrollTrigger: { trigger: '.why-cards-grid', start: 'top 85%' }
  });

  ScrollTrigger.refresh();
})();
