import { useEffect, useState } from 'react';
import { useTypewriter } from './useTypewriter';

const EMAIL = 'hello@superhyre.com';

const WHITE_PILLS = ['Hire Senior Engineers', '48-Hour Pipeline', 'Send a brief hello', 'See how we operate'];

const INTRO_LINES = ['Hey there, meet A.R.I.A,', "SuperHyre's Adaptive Response Interface Agent"];

const CORE_TEXT =
  'Glad you stopped in. High-growth technical teams tend to find us. Now, what are we building for you?';

function Pill({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-[0.2em] mb-[0.4em] inline-flex items-center justify-center whitespace-nowrap rounded-full border border-black/10 bg-white px-4 py-[0.3em] text-[13px] text-black transition-colors duration-200 hover:bg-black hover:text-white sm:px-5 sm:text-[15px]"
    >
      {children}
    </button>
  );
}

export function Hero() {
  const { displayed, done } = useTypewriter(CORE_TEXT, 38, 600);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <main className="relative z-[1] flex h-screen flex-col justify-end overflow-hidden px-5 pb-12 sm:px-8 md:justify-center md:pb-0 md:px-10">
      <div className="relative z-10 max-w-2xl">
        {/* Blurred Intro Label */}
        <div
          className="pointer-events-none mb-5 select-none sm:mb-6"
          style={{ fontSize: 'clamp(18px, 4vw, 26px)', lineHeight: 1.3 }}
        >
          <p
            className="text-black"
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              color: 'rgba(0, 0, 0, 0.85)'
            }}
          >
            {INTRO_LINES[0]}
          </p>
          <p
            className="text-black"
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              color: 'rgba(0, 0, 0, 0.85)'
            }}
          >
            {INTRO_LINES[1]}
          </p>
        </div>

        {/* Typewriter Core Text */}
        <p
          className="mb-5 text-black sm:mb-6"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'clamp(18px, 4vw, 26px)',
            lineHeight: 1.35,
            minHeight: '54px'
          }}
        >
          {displayed}
          {!done && (
            <span
              className="typewriter-cursor ml-[2px] inline-block h-[1.1em] w-[2px] bg-black align-middle"
              aria-hidden="true"
            />
          )}
        </p>

        {/* Action Pill Buttons */}
        <div
          className={`flex flex-wrap gap-y-1 transition-all duration-400 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          }`}
          style={{ transitionTimingFunction: 'ease', transitionDuration: '0.4s' }}
        >
          {WHITE_PILLS.map((label) => (
            <Pill key={label}>{label}</Pill>
          ))}

          {/* Outline Email Copy Pill */}
          <button
            type="button"
            onClick={copyEmail}
            className="mx-[0.2em] mb-[0.4em] inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-white bg-transparent px-4 py-[0.3em] text-[13px] text-white transition-colors duration-200 hover:bg-white hover:text-black sm:gap-3 sm:px-5 sm:text-[15px]"
          >
            <span>
              Reach us: <span className="underline underline-offset-1">{EMAIL}</span>
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              aria-hidden="true"
            >
              <rect x="4" y="1.5" width="6.5" height="6.5" rx="1" />
              <path d="M8 4.5h-4.5a1.5 1.5 0 0 0-1.5 1.5v4.5" />
            </svg>
            <span className="sr-only">{copied ? 'Copied' : 'Copy email'}</span>
          </button>
        </div>
      </div>
    </main>
  );
}