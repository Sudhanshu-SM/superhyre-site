/* SuperHyre — shared contact modal (index.html + talent.html).
   Opens from any .contact-link; closes on the close button, backdrop click, or Escape. */
(function () {
  var modal = document.getElementById('contactModal');
  if (!modal) return;
  var closeBtn = modal.querySelector('.modal-close');
  var links = document.querySelectorAll('.contact-link');
  var lastFocus = null;

  function open(e) {
    if (e) e.preventDefault();
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    closeBtn.focus();
  }
  function close() {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  Array.prototype.forEach.call(links, function (el) { el.addEventListener('click', open); });
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.key === 'Esc') && !modal.hidden) close();
  });
})();
