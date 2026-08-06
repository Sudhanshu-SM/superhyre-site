import { useEffect, useState } from 'react';
import { useTypewriter } from './useTypewriter';

const EMAIL = 'hello@superhyre.com';

const CAPABILITY_TAGS = ['Senior Engineers', '48-Hour Shortlist', 'Full-Stack & Systems', 'Direct Team Access'];

const HEADLINE =
  'Glad you stopped in. High-growth technical teams tend to find us. Which engineering roles are we shortlisting for you?';

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

        {/* Capability Tags + Reach Us */}
        <div
          className={`flex flex-wrap items-center gap-2.5 transition-all duration-400 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          }`}
          style={{ transitionTimingFunction: 'ease', transitionDuration: '0.4s' }}
        >
          {CAPABILITY_TAGS.map((tag) => (
            <span
              key={tag}
              className="sh-tag-pill cursor-pointer rounded-full border border-black/15 bg-white/90 px-4 py-2 text-xs font-bold text-black shadow-sm backdrop-blur-sm transition-all hover:border-black hover:bg-black hover:text-white sm:text-sm"
            >
              {tag}
            </span>
          ))}

          <a
            href={`mailto:${EMAIL}`}
            className="sh-reach-pill flex items-center gap-2 rounded-full border border-black bg-black/80 px-4 py-2 text-xs font-bold text-white backdrop-blur-sm transition-all hover:border-[#FF6000] hover:bg-[#FF6000] sm:text-sm"
          >
            Reach us: <span className="underline">{EMAIL}</span>
          </a>
        </div>
      </div>
    </main>
  );
}