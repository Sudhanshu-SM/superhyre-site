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

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

  /* vanilla fill: fallback when GSAP is absent or reduced motion is on */
  if (!hasGsap || reducedMotion) {
    window.addEventListener('scroll', function () {
      var rect = timelineWrapper.getBoundingClientRect();
      var totalHeight = rect.height;
      var currentScroll = window.innerHeight / 2 - rect.top;
      var progress = Math.min(Math.max(currentScroll / totalHeight, 0), 1);
      if (timelineProgress) {
        timelineProgress.style.height = (progress * 100) + '%';
      }
    });
  }

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

/* ---------- ethos quote carousel (vanilla — index only) ---------- */
(function () {
  var slides = document.querySelectorAll('.ethos-slide');
  var prevBtn = document.getElementById('prevSlide');
  var nextBtn = document.getElementById('nextSlide');
  var counter = document.getElementById('slideCounter');
  if (!slides.length || !nextBtn || !prevBtn) return;

  var currentSlide = 0;
  var totalSlides = slides.length;

  function updateSlide(index) {
    slides.forEach(function (slide, i) {
      slide.classList.toggle('active', i === index);
    });
    if (counter) {
      counter.textContent = '0' + (index + 1) + ' / 0' + totalSlides;
    }
  }

  nextBtn.addEventListener('click', function () {
    currentSlide = (currentSlide + 1) % totalSlides;
    updateSlide(currentSlide);
  });

  prevBtn.addEventListener('click', function () {
    currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
    updateSlide(currentSlide);
  });
})();

document.addEventListener('DOMContentLoaded', function () {
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

  /* ---------- hero intro: masked line rise + pinned-hero scale ---------- */
  mm.add('(prefers-reduced-motion: no-preference)', function () {
    var heroEl = document.querySelector('.hero-section');
    var headline = document.querySelector('.hero-headline');
    if (!heroEl || !headline) return;

    var intro = gsap.timeline({ defaults: { ease: 'power4.out' } });
    intro
      .from('.hero-section .mask-line-inner', { yPercent: 110, duration: 0.95, stagger: 0.12 }, 0.1)
      .from('.hero-description', { y: 22, opacity: 0, duration: 0.7 }, '-=0.45');

    var isMobile = window.matchMedia('(max-width: 768px)').matches;
    gsap.to(headline, {
      scale: isMobile ? 1.3 : 1.6, opacity: 0.1, ease: 'none',
      scrollTrigger: { trigger: heroEl, start: 'top top', end: 'bottom top', scrub: true }
    });
    gsap.to('.hero-description', {
      opacity: 0, ease: 'none',
      scrollTrigger: { trigger: heroEl, start: 'top top', end: 'bottom 25%', scrub: true }
    });
  });

  /* ---------- scroll-driven motion (all viewports, no reduced motion) ---------- */
  mm.add('(prefers-reduced-motion: no-preference)', function () {

    /* masked line reveals (section titles, index + talent) */
    gsap.utils.toArray('.mask-line-inner').forEach(function (line) {
      if (line.closest('.hero-section')) return;
      gsap.from(line, {
        yPercent: 110, duration: 0.85, ease: 'power3.out',
        scrollTrigger: { trigger: line.closest('.mask-line'), start: 'top 88%', once: true }
      });
    });

    /* seam line sweep on the Why It Works section */
    var seam = document.querySelector('.section-line');
    if (seam) {
      gsap.from(seam, {
        scaleX: 0, transformOrigin: 'left center', ease: 'none',
        scrollTrigger: { trigger: '.why-it-works-section', start: 'top 92%', end: 'top 35%', scrub: true }
      });
    }

    /* footer marquee: gentle counter-drift while the footer enters */
    var footerMarquee = document.querySelector('.footer-marquee-track');
    if (footerMarquee) {
      gsap.to(footerMarquee, {
        yPercent: -25, ease: 'none',
        scrollTrigger: { trigger: '.site-footer', start: 'top bottom', end: 'bottom bottom', scrub: true }
      });
    }

    /* timeline progress fill: GSAP scrub (vanilla fill stays as fallback) */
    var tLine = document.getElementById('timelineProgress');
    if (tLine) {
      tLine.style.transition = 'none';
      gsap.to(tLine, {
        height: '100%', ease: 'none',
        scrollTrigger: { trigger: '.timeline-wrapper', start: 'top 75%', end: 'bottom 75%', scrub: true }
      });
    }
  });

  /* ---------- scroll reveals (all viewports) ---------- */
  mm.add('(prefers-reduced-motion: no-preference)', function () {
    gsap.utils.toArray('[data-reveal]').forEach(function (el) {
      gsap.from(el, {
        opacity: 0, y: 24,
        duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%' }
      });
    });

    /* ---------- dark sections: staggered reveals ---------- */
    gsap.utils.toArray('.stat-card').forEach(function (el) {
      gsap.from(el, {
        opacity: 0, y: 24, scale: 0.94, duration: 0.7, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%' }
      });
    });
    gsap.from('.problem-header', {
      opacity: 0, y: 24, duration: 0.8, ease: 'power3.out',
      scrollTrigger: { trigger: '.problem-header', start: 'top 88%' }
    });
    gsap.utils.toArray('.problem-card').forEach(function (el) {
      gsap.from(el, {
        opacity: 0, y: 32, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });

    /* ---------- why it works: header + card reveals ---------- */
    gsap.from('.why-title-wrapper', {
      opacity: 0, y: 24, duration: 0.8, ease: 'power3.out',
      scrollTrigger: { trigger: '.why-header', start: 'top 88%' }
    });
    gsap.from('.why-header .btn-primary-orange', {
      opacity: 0, y: 16, duration: 0.7, ease: 'power3.out', delay: 0.15,
      scrollTrigger: { trigger: '.why-header', start: 'top 88%' }
    });
    gsap.from('.why-card', {
      opacity: 0, y: 32, duration: 0.8, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: '.why-cards-grid', start: 'top 85%' }
    });
  });

  ScrollTrigger.refresh();
})();
});
