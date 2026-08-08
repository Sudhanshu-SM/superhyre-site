import { useEffect, useState } from 'react';
import { useTypewriter } from './useTypewriter';

const HERO_POINTS = [
  'Elite Software Engineers',
  '48-Hour Pipeline',
  'Precision Shortlists',
  'Direct Client Communication'
];

const HEADLINE =
  'Glad you stopped in. High-growth technical teams tend to find us. Which engineering roles are we shortlisting for you?';

// contact.js only binds static .contact-link nodes, so the React-mounted hero
// CTA must open the shared modal through the same canonical entry point:
// close() leaves visibility/pointer-events hidden, so re-opening REQUIRES the
// real open() (clears those styles, cancels the settle-pin, re-locks scroll).
function openContactModal() {
  const modal = document.getElementById('contactModal') as HTMLElement | null;
  if (!modal) return;
  if (typeof (window as any).openContactModal === 'function') {
    (window as any).openContactModal();
    return;
  }
  // Fallback (no contact.js yet — theoretically unreachable in load order):
  // mirror open()'s effect so the button still works.
  modal.hidden = false;
  if (modal.style) {
    modal.style.visibility = '';
    modal.style.pointerEvents = '';
  }
  document.body.classList.add('modal-open');
  modal.querySelector('.modal-close')?.focus();
}

export function Hero() {
  const { displayed, done } = useTypewriter(HEADLINE, 38, 600);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="relative z-[1] min-h-screen overflow-hidden px-5 pb-16 pt-28 sm:px-8 sm:pt-32 md:px-10">
      {/* Gooey filter defs for the LET'S TALK hover liquid (START HIRING parity) */}
      <svg
        aria-hidden="true"
        focusable="false"
        width="0"
        height="0"
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      >
        <defs>
          <filter id="sh-gooey">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <div className="relative z-10 flex min-h-[calc(100vh-7rem)] max-w-2xl flex-col justify-center">
        {/* Recruitment Label (no AI-agent references) */}
        <div className="pointer-events-none mb-6 select-none">
          <p
            className="font-body text-lg font-extrabold uppercase tracking-widest text-black sm:text-xl"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            DIRECT TECHNICAL RECRUITMENT.
          </p>
          <p
            className="font-body mt-1 text-sm font-medium text-neutral-600 sm:text-base"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Human-vetted engineering talent delivered directly to hiring leaders.
          </p>
        </div>

        {/* Typewriter Headline */}
        <p
          className="font-body mb-8 min-h-[60px] text-xl leading-relaxed text-black sm:text-3xl"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {displayed}
          {!done && (
            <span
              className="typewriter-cursor ml-[2px] inline-block h-[1.1em] w-[2px] bg-black align-middle"
              aria-hidden="true"
            />
          )}
        </p>

        {/* Hero Feature Highlights (unique vs. trust cards) + Reach Us */}
        <div
          className={`flex flex-wrap items-center gap-x-6 gap-y-3 pt-2 transition-all duration-400 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          }`}
          style={{ transitionTimingFunction: 'ease', transitionDuration: '0.4s' }}
        >
          {HERO_POINTS.map((point) => (
            <div key={point} className="flex items-center gap-2">
              <span className="text-sm font-black text-[#FF6000]" aria-hidden="true">
                ✓
              </span>
              <span className="text-sm font-bold tracking-tight text-black/90 sm:text-base">{point}</span>
            </div>
          ))}
        </div>

        {/* Relocated Primary CTA — below the bullets, opens contact modal */}
        <div
          className={`mt-6 transition-all duration-400 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          }`}
          style={{ transitionTimingFunction: 'ease', transitionDuration: '0.4s' }}
        >
          <button
            type="button"
            onClick={openContactModal}
            className="sh-lt-btn group inline-flex items-center gap-3 overflow-hidden rounded-full bg-[#FF6000] px-8 py-4 text-sm font-extrabold uppercase tracking-widest text-white shadow-lg active:scale-[0.98] sm:text-base"
          >
            <span className="sh-goo-container" aria-hidden="true">
              <span className="sh-goo-bubble" />
              <span className="sh-goo-bubble sh-goo-bubble--b" />
            </span>
            <span className="sh-lt-text flex items-center gap-3">
              <span>LET'S TALK</span>
              <span
                aria-hidden="true"
                className="inline-block transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              >
                ↗
              </span>
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}