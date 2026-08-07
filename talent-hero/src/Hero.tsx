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

// Mirrors contact.js open(): reveals #contactModal, locks body scroll and
// focuses the close button (contact.js only binds static .contact-link nodes,
// so the React-mounted hero CTA must open the shared modal directly).
function openContactModal() {
  const modal = document.getElementById('contactModal') as HTMLElement | null;
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  const closeBtn = modal.querySelector('.modal-close') as HTMLElement | null;
  closeBtn?.focus();
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
            className="group inline-flex items-center gap-3 rounded-full bg-[#FF6000] px-8 py-4 text-sm font-extrabold uppercase tracking-widest text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-black active:scale-[0.98] sm:text-base"
          >
            <span>LET'S TALK</span>
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            >
              ↗
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}