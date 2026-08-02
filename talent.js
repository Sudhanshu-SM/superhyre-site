/* SuperHyre — talent page: testimonial carousel + scroll reveals.
   Degrades gracefully: without GSAP the page stays fully visible. */
(function () {
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

  var hasGsap = typeof gsap !== 'undefined';

  function render() {
    var q = quotes[i], p = quotes[(i - 1 + n) % n], nx = quotes[(i + 1) % n];
    if (hasGsap) {
      gsap.to('.quote', { opacity: 0, y: 14, duration: 0.18, onComplete: function () {
        paint(q, p, nx);
        gsap.to('.quote', { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
      }});
    } else {
      paint(q, p, nx);
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

  if (hasGsap && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray('[data-reveal]').forEach(function (el) {
      gsap.from(el, {
        opacity: 0, y: 34,
        duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%' }
      });
    });
  }
})();
