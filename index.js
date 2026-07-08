/* SuperHyre — home page: pinned horizontal scroll for the features section.
   While the section is pinned, vertical scroll is translated into horizontal
   movement of the cards; once the cards reach the end, vertical scroll resumes. */
(function () {
  var features = document.querySelector('.features');
  if (!features) return;
  var sticky = features.querySelector('.features__sticky');
  var track = features.querySelector('.features__track');
  var MOBILE = 860;

  function onScroll() {
    if (window.innerWidth <= MOBILE) return;
    var dist = track.scrollWidth - sticky.clientWidth;
    if (dist <= 0) { track.style.transform = 'translateX(0)'; return; }
    var top = features.getBoundingClientRect().top;
    var total = features.offsetHeight - sticky.offsetHeight;
    var p = Math.min(1, Math.max(0, (-top) / total));
    track.style.transform = 'translateX(' + (-p * dist) + 'px)';
  }

  function layout() {
    if (window.innerWidth <= MOBILE) {
      features.style.height = '';
      track.style.transform = '';
      return;
    }
    var dist = track.scrollWidth - sticky.clientWidth;
    if (dist < 0) dist = 0;
    features.style.height = (sticky.offsetHeight + dist) + 'px';
    onScroll();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', layout);
  window.addEventListener('load', layout);
  layout();
})();
