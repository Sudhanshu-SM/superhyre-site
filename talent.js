/* SuperHyre — talent page: testimonial carousel.
   Shows the active quote centred, with the previous/next quotes faded on each side. */
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
  if (!t) return;

  quotes.forEach(function (_, idx) {
    var b = document.createElement('button');
    b.setAttribute('aria-label', 'Quote ' + (idx + 1));
    b.addEventListener('click', function () { i = idx; render(); });
    dots.appendChild(b);
  });

  function render() {
    var q = quotes[i], p = quotes[(i - 1 + n) % n], nx = quotes[(i + 1) % n];
    t.textContent = '“' + q.t + '”'; w.textContent = q.who; o.textContent = q.org;
    lt.textContent = '“' + p.t + '”'; lw.textContent = p.who; lo.textContent = p.org;
    rt.textContent = '“' + nx.t + '”'; rw.textContent = nx.who; ro.textContent = nx.org;
    Array.prototype.forEach.call(dots.children, function (d, idx) { d.className = idx === i ? 'on' : ''; });
  }

  document.querySelector('.q-prev').addEventListener('click', function () { i = (i - 1 + n) % n; render(); });
  document.querySelector('.q-next').addEventListener('click', function () { i = (i + 1) % n; render(); });
  render();
})();
