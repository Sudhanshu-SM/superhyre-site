/* SuperHyre — shared contact modal (index.html + talent.html).
   Opens from any .contact-link; closes on the close button, backdrop click, or Escape.
   Closing must NOT move the page: after the modal hides, browsers can still
   perform a delayed scroll (focus fix-up, scroll-anchoring, Lenis glide).
   A rAF watchdog repairs any drift against the position captured at open,
   re-arming on every drift until the page has been still for a quiet period.
   The first genuine user input (wheel/touch/key/pointer) cancels it for good. */
(function () {
  var modal = document.getElementById('contactModal');
  if (!modal) return;
  var closeBtn = modal.querySelector('.modal-close');
  var links = document.querySelectorAll('.contact-link');
  var lastFocus = null;
  var lockedScrollY = 0;
  var pinRaf = null;
  var quietSince = 0;
  var userBackInControl = false;
  var pinTimers = [];
  var guardedEl = null; // element whose overflowAnchor we lock during the guard
  var lenisWasRunning = false;

  function scrollY() {
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function setScroll(y) {
    // While the settle-guard is active we stop Lenis, so drift repair is
    // always a plain native write — it cannot fight a Lenis animation.
    var l = window.__lenis;
    var lenisActive = typeof l !== 'undefined' && l && typeof l.scrollTo === 'function' && !lenisStopped(l);
    if (lenisActive) {
      l.scrollTo(y, { immediate: true });
      return;
    }
    // Lenis absent or stopped → native path
    // Bypass html{scroll-behavior:smooth} so the restore is instant
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    document.documentElement.style.scrollBehavior = '';
  }

  // Lenis 1.3.x exposes isStopped both as boolean prop and (newer) as fn
  function lenisStopped(l) {
    if (!l) return true;
    if (typeof l.isStopped === 'function') return !!l.isStopped();
    return l.isStopped === true;
  }

  // The close-time yank is Lenis's own rendering loop or something it
  // re-syncs from. Freeze Lenis BEFORE the modal hides and keep it frozen
  // for the settle window so nothing can drive the page away from the
  // locked position; revive it on the first user input or when the guard
  // stands down.
  function stopLenisForSettle() {
    lenisWasRunning = false;
    var l = window.__lenis;
    if (l && typeof l.stop === 'function' && !lenisStopped(l)) {
      lenisWasRunning = true;
      l.stop();
    }
  }
  function resumeLenisIfNeeded() {
    if (!lenisWasRunning) return;
    var l = window.__lenis;
    if (l && lenisStopped(l) && typeof l.start === 'function') {
      l.start();
    }
    lenisWasRunning = false;
  }

  function open(e) {
    if (e) e.preventDefault();
    lockedScrollY = scrollY();
    lastFocus = document.activeElement;
    reopenModal();
    document.body.classList.add('modal-open');
    closeBtn.focus({ preventScroll: true });
  }

  function close(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    cancelPin();
    restoreAnchorLock();
    stopLenisForSettle(); // freeze the page BEFORE the browser fix-up yank
    // Release focus BEFORE the modal turns invisible: when a focused element
    // becomes invisible the browser resets focus to the body and, on some
    // browsers (notably mobile Chrome/Safari), scrolls the document to the
    // top as part of that fix-up. Blurring first makes it a no-op.
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    // Do NOT display:none yet. Hiding (layout + scroll-anchoring + focus
    // fix-up) is what lets browsers jump the page. Turn the overlay invisible
    // instead (it keeps its layout box), so nothing reflows while the page
    // settles; the DOM hide happens later in the quiet branch of the guard.
    if (modal.style) {
      modal.style.visibility = 'hidden';
      modal.style.pointerEvents = 'none';
    }
    document.body.classList.remove('modal-open');
    startPin();
  }

  function hideModalCompletely() {
    if (!modal) return;
    modal.hidden = true;
    if (modal.style) {
      modal.style.visibility = '';
      modal.style.pointerEvents = '';
    }
  }

  function reopenModal() {
    if (!modal) return;
    modal.hidden = false;
    if (modal.style) modal.style.visibility = '';
    if (modal.style) modal.style.pointerEvents = '';
  }

  // Chrome's scroll-anchoring can adjust the scroll when the fixed-overlay
  // layout disappears (it "preserves" what it thinks is the anchor element).
  // Disabling it during the settle window removes the browser's own yank.
  function lockAnchor() {
    var el = document.scrollingElement || document.documentElement;
    guardedEl = el;
    if (el.style) el.style.overflowAnchor = 'none';
  }
  function restoreAnchorLock() {
    if (!guardedEl || !guardedEl.style) return;
    guardedEl.style.overflowAnchor = '';
    guardedEl = null;
  }

  // Re-pin the page to the position it had when the modal opened. The browser
  // can yank the scroll a few frames AFTER the modal hides (focus fix-up,
  // reflow) — watch every frame for a short window and correct instantly.
  // The FIRST genuine user scroll (wheel/touch/key) cancels the watchdog for
  // good, so it can never fight or hold a manual scroll.
  function onUserInput() {
    userBackInControl = true;
    cancelPin();
    restoreAnchorLock();
    resumeLenisIfNeeded();
  }
  ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'].forEach(function (t) {
    window.addEventListener(t, onUserInput, { capture: true, passive: true });
  });

  function startPin() {
    cancelPin();
    userBackInControl = false;
    lockAnchor();
    // Some browsers/deceleration kick in a smooth-glide scroll to the top a
    // second or two after the modal hides (focus fix-up + scroll-behavior).
    // Watch every frame until the page has been STILL (no drift vs the locked
    // position) for a full quiet period — any late drift simply re-arms the
    // watch, so a glide can never outlive the guard. rAF can be throttled
    // (background tabs, some mobile browsers), so mirror the check with a
    // plain timer as well.
    quietSince = Date.now();
    var delays = [150, 400, 800, 1500, 2500, 3900];
    for (var i = 0; i < delays.length; i++) {
      (function (d) {
        pinTimers.push(setTimeout(function () {
          if (userBackInControl) return;
          if (Math.abs(scrollY() - lockedScrollY) > 2) {
            setScroll(lockedScrollY);
            quietSince = Date.now(); // late yank → keep guarding
          } else if (Date.now() - quietSince > 2500) {
            hideModalCompletely(); // layout teardown while page is settled
            restoreAnchorLock();
            resumeLenisIfNeeded();
          }
        }, d));
      })(delays[i]);
    }
    tickPin();
  }
  function tickPin() {
    pinRaf = null;
    if (userBackInControl) return;
    var y = scrollY();
    if (Math.abs(y - lockedScrollY) > 2) {
      setScroll(lockedScrollY);
      quietSince = Date.now(); // any drift re-arms the guard
    } else if (Date.now() - quietSince > 2500) {
      hideModalCompletely(); // layout teardown while page is settled
      restoreAnchorLock();
      resumeLenisIfNeeded();
      return; // page settled — done
    }
    pinRaf = requestAnimationFrame(tickPin);
  }
  function cancelPin() {
    if (pinRaf !== null) { cancelAnimationFrame(pinRaf); pinRaf = null; }
    while (pinTimers.length) { clearTimeout(pinTimers.pop()); }
  }

  Array.prototype.forEach.call(links, function (el) { el.addEventListener('click', open); });
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.key === 'Esc') && !modal.hidden) close();
  });
})();