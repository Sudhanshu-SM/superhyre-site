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

/* ---------- hero background video: autoplay + reduced-motion ---------- */
(function () {
  var v = document.querySelector('.hero-bg-video');
  if (!v) return;
  v.muted = true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    v.pause();
    return;
  }
  var tried = 0;
  function tryPlay() {
    if (tried >= 6) return;
    tried++;
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
    setTimeout(tryPlay, 600);
  }
  v.addEventListener('loadeddata', tryPlay);
  tryPlay();
})();

/* ---------- ethos quote carousel (GSAP text swap — index only) ---------- */
(function () {
  var slides = document.querySelectorAll('.ethos-slide');
  var prevBtn = document.getElementById('prevSlide');
  var nextBtn = document.getElementById('nextSlide');
  var counter = document.getElementById('slideCounter');
  if (!slides.length || !nextBtn || !prevBtn) return;

  var activeSlide = document.querySelector('.ethos-slide.active');
  var currentIndex = activeSlide ? Array.prototype.indexOf.call(slides, activeSlide) : 0;
  if (!activeSlide) slides[0].classList.add('active');
  var totalSlides = slides.length;
  var animating = false;

  function swapTo(nextIndex) {
    var current = slides[currentIndex];
    var next = slides[nextIndex];

    function revealNext() {
      current.classList.remove('active');
      next.classList.add('active');
      currentIndex = nextIndex;
      if (counter) {
        counter.textContent = '0' + (currentIndex + 1) + ' / 0' + totalSlides;
      }
      if (typeof gsap !== 'undefined') {
        gsap.fromTo(next.querySelectorAll('.slide-element'), { y: 40, opacity: 0 }, {
          y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: 'power3.out',
          onComplete: function () { animating = false; }
        });
      } else {
        animating = false;
      }
    }

    if (typeof gsap === 'undefined') { revealNext(); return; }

    animating = true;
    gsap.to(current.querySelectorAll('.slide-element'), {
      y: -20, opacity: 0, duration: 0.3, stagger: 0.05, ease: 'power2.in',
      onComplete: revealNext
    });
  }

  function changeSlide(direction) {
    if (animating) return;
    var nextIndex = (currentIndex + (direction === 'next' ? 1 : -1) + totalSlides) % totalSlides;
    swapTo(nextIndex);
  }

  nextBtn.addEventListener('click', function () { changeSlide('next'); });
  prevBtn.addEventListener('click', function () { changeSlide('prev'); });
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
      .from('.hero-eyebrow', { y: 22, opacity: 0, duration: 0.7 }, 0.1)
      .from('.status-badge', { y: 12, opacity: 0, duration: 0.5 }, '-=0.45')
      .from('.hero-pills .hero-pill', { scale: 0.8, opacity: 0, transformOrigin: 'top center', duration: 0.5, ease: 'back.out(1.6)', stagger: 0.07 }, '-=0.3');

    var isMobile = window.matchMedia('(max-width: 768px)').matches;
    gsap.to(headline, {
      scale: isMobile ? 1.3 : 1.6, opacity: 0.1, ease: 'none',
      scrollTrigger: { trigger: heroEl, start: 'top top', end: 'bottom top', scrub: true }
    });
    /* eyebrow: reversible fade-out as the hero scrolls away (created after
       the intro finishes so the two tweens never fight over the same props) */
    intro.eventCallback('onComplete', function () {
      gsap.to('.hero-eyebrow', {
        opacity: 0, y: -30, ease: 'none',
        scrollTrigger: {
          trigger: heroEl, start: 'top top', end: 'bottom top',
          scrub: true, toggleActions: 'play reverse play reverse'
        }
      });
    });
  });

  /* ---------- scroll-driven motion (all viewports, no reduced motion) ---------- */
  mm.add('(prefers-reduced-motion: no-preference)', function () {

    /* background-first reveals: the section's own bg sweeps up, then content strikes */
    gsap.utils.toArray('[data-bg-reveal]').forEach(function (sec) {
      var bg = sec.querySelector('.section-bg');
      if (!bg) return;
      gsap.from(bg, {
        scaleY: 0, transformOrigin: 'bottom center', duration: 1.05, ease: 'power3.inOut',
        scrollTrigger: { trigger: sec, start: 'top 78%', once: true }
      });
    });

    /* 3D roll headings: auto-split .roll-heading into .roll-inner words and
       roll them up in a stagger on scroll (index page) */
    var rollHeadings = gsap.utils.toArray('.roll-heading');
    rollHeadings.forEach(function (heading) {
      var parts = [];
      function collect(node) {
        if (node.nodeType === 3) {
          node.textContent.trim().split(/\s+/).forEach(function (w) {
            if (w) parts.push({ t: w, c: '' });
          });
        } else if (node.nodeType === 1 && node.textContent.trim()) {
          var cls = typeof node.className === 'string' ? node.className : '';
          node.textContent.trim().split(/\s+/).forEach(function (w) {
            if (w) parts.push({ t: w, c: cls });
          });
        }
      }
      heading.childNodes.forEach(collect);
      var html = '';
      parts.forEach(function (p, i) {
        var punct = /^[.,!?;:]+$/.test(p.t);
        if (i > 0 && !punct) html += ' ';
        html += '<span class="roll-text-line"><span class="roll-inner' +
          (p.c ? ' ' + p.c : '') + '">' + p.t + '</span></span>';
      });
      heading.innerHTML = html;

      gsap.fromTo(heading.querySelectorAll('.roll-inner'),
        { y: '120%', rotateX: -75, opacity: 0 },
        {
          y: '0%', rotateX: 0, opacity: 1,
          duration: 0.85, ease: 'power3.out', stagger: 0.06,
          scrollTrigger: {
            trigger: heading,
            start: 'top 85%',
            toggleActions: 'play none none reverse'
          }
        }
      );
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
        scrollTrigger: { trigger: el, start: 'top 66%' }
      });
    });
    gsap.utils.toArray('.problem-card').forEach(function (el) {
      gsap.from(el, {
        opacity: 0, y: 70, scale: 0.96, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 24%', once: true }
      });
    });

    /* ---------- why it works: header + card reveals ---------- */
    gsap.from('.why-title-wrapper', {
      opacity: 0, y: 24, duration: 0.8, ease: 'power3.out',
      scrollTrigger: { trigger: '.why-header', start: 'top 66%' }
    });
    gsap.from('.why-header .btn-primary-orange', {
      opacity: 0, y: 16, duration: 0.7, ease: 'power3.out', delay: 0.15,
      scrollTrigger: { trigger: '.why-header', start: 'top 66%' }
    });
    gsap.from('.why-card', {
      opacity: 0, y: 32, duration: 0.8, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: '.why-cards-grid', start: 'top 66%' }
    });

    /* ---------- cta: buttons strike in after the orange bg sweep ---------- */
    gsap.from('.cta-actions .btn-cta-dark, .cta-actions .btn-cta-outline', {
      opacity: 0, y: 24, duration: 0.7, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: '.cta-banner-section', start: 'top 50%' }
    });
  });

  /* ---------- text-level reveals: eyebrows, word masks, subtitles ---------- */
  mm.add('(prefers-reduced-motion: no-preference)', function () {

    /* word splitter: wraps every word in .t-word > .t-word-inner (masked) */
    function splitWords(el) {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var nodes = [];
      while (walker.nextNode()) {
        if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
      }
      nodes.forEach(function (node) {
        var frag = document.createDocumentFragment();
        node.nodeValue.split(/(\s+)/).forEach(function (chunk) {
          if (!chunk) return;
          if (/^\s+$/.test(chunk)) { frag.appendChild(document.createTextNode(chunk)); return; }
          var w = document.createElement('span');
          w.className = 't-word';
          var wi = document.createElement('span');
          wi.className = 't-word-inner';
          wi.textContent = chunk;
          w.appendChild(wi);
          frag.appendChild(w);
        });
        node.parentNode.replaceChild(frag, node);
      });
    }

    /* section eyebrows: strike in first */
    gsap.utils.toArray('[data-eyebrow]').forEach(function (el) {
      gsap.from(el, {
        opacity: 0, y: 14, duration: 0.6, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 70%', once: true }
      });
    });

    /* word-by-word masked reveals on headlines */
    gsap.utils.toArray('[data-word-reveal]').forEach(function (el) {
      var st = { trigger: el, start: 'top 64%', once: true };
      splitWords(el);
      gsap.fromTo(el.querySelectorAll('.t-word-inner'), { yPercent: 110 }, {
        yPercent: 0, duration: 0.85, ease: 'power4.out', stagger: 0.045,
        scrollTrigger: st
      });
    });

    /* subtitles: fade + rise after their titles */
    gsap.utils.toArray('[data-reveal-late]').forEach(function (el) {
      gsap.from(el, {
        opacity: 0, y: 20, duration: 0.8, ease: 'power3.out', delay: 0.1,
        scrollTrigger: { trigger: el, start: 'top 55%', once: true }
      });
    });

    /* ethos: initial quote entrance when the carousel scrolls into view */
    var firstQuote = document.querySelector('.ethos-slide.active .ethos-quote');
    if (firstQuote) {
      gsap.fromTo('.ethos-slide.active .slide-element', { y: 40, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: 'power3.out',
        scrollTrigger: { trigger: '.ethos-carousel', start: 'top bottom', once: true }
      });
    }

    /* footer: columns + marquee + bottom stagger in */
    gsap.from('.site-footer > *', {
      opacity: 0, y: 24, duration: 0.8, ease: 'power3.out', stagger: 0.08,
      scrollTrigger: { trigger: '.site-footer', start: 'top 88%', once: true }
    });
  });

  ScrollTrigger.refresh();
})();
});
