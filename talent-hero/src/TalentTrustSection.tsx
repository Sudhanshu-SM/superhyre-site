import { useState } from 'react';

interface AssuranceCard {
  stat: string;
  statColor: string;
  title: string;
  description: string;
  footerTag: string;
}

const ASSURANCES: AssuranceCard[] = [
  {
    stat: '1\u00A0:\u00A01',
    statColor: '#FF6000',
    title: 'PRACTITIONER VETTING',
    description:
      "Your candidates aren't screened by keyword-matching HR reps. Every profile is evaluated directly by senior software engineers who test production-grade system design and code quality.",
    footerTag: 'TECHNICAL RIGOR'
  },
  {
    stat: '0%',
    statColor: '#000000',
    title: 'ZERO CODEBASE NOISE',
    description:
      "We don't send raw resume stacks hoping something sticks. You receive candidates engineered to seamlessly integrate into your existing tech stack, Git workflow, and team culture from day one.",
    footerTag: 'CULTURE & CODE ALIGNED'
  },
  {
    stat: '3-5',
    statColor: '#FF6000',
    title: 'HIGH-SIGNAL SHORTLIST',
    description:
      'Traditional recruitment agencies flood your inbox with dozens of unvetted profiles. We deliver a focused shortlist of 3 to 5 top-tier engineers who match your exact technical requirements.',
    footerTag: 'PRECISION SELECTION'
  }
];

function FlipCardItem({ item }: { item: AssuranceCard }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      className={`sh-flip-card ${isFlipped ? 'sh-flip-card-flipped' : ''}`}
      onClick={() => setIsFlipped((v) => !v)}
    >
      <div className="sh-flip-card-inner">
        {/* FRONT SIDE */}
        <div className="sh-flip-card-front">
          <div className="flex h-full flex-col justify-between p-8">
            <div>
              <span
                className="mb-4 block text-5xl font-black tracking-tight sm:text-6xl"
                style={{ color: item.statColor }}
              >
                {item.stat}
              </span>
              <h3 className="text-lg font-extrabold uppercase tracking-tight text-black">{item.title}</h3>
            </div>
            <div className="sh-flip-card-divider flex items-center justify-between pt-6 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              <span>TAP OR HOVER TO FLIP</span>
              <span className="text-sm text-[#FF6000]" aria-hidden="true">
                ↻
              </span>
            </div>
          </div>
        </div>

        {/* BACK SIDE */}
        <div className="sh-flip-card-back">
          <div className="flex h-full flex-col justify-between p-8 text-left">
            <div>
              <span className="mb-3 block text-xs font-extrabold uppercase tracking-widest text-[#FF6000]">
                OPERATIONAL STANDARD
              </span>
              <h4 className="mb-3 text-sm font-black uppercase leading-tight tracking-wider text-black">
                {item.title}
              </h4>
              <p className="text-sm leading-relaxed text-neutral-700">{item.description}</p>
            </div>
            <div className="sh-flip-card-divider flex items-center justify-between pt-6 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              <span>{item.footerTag}</span>
              <span className="text-[#FF6000]">✓</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TalentTrustSection() {
  return (
    <section
      className="relative z-20 w-full bg-white px-6 py-20 text-black md:px-16"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-[#FF6000]">
            Why Hiring Managers Choose Us
          </span>
          <h2 className="mb-4 text-3xl font-black uppercase leading-tight tracking-tight sm:text-5xl">
            Recruitment Engineered for Results.
          </h2>
          <p className="text-base font-medium text-neutral-600 sm:text-lg">
            We removed traditional agency friction. Tap or hover over each pillar to reveal our operational standards.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {ASSURANCES.map((item) => (
            <FlipCardItem key={item.title} item={item} />
          ))}
        </div>
      </div>

      <style>{`
        /* 3D flip mechanics adapted from the Uiverse card snippet, with
           WebKit unblur hardening: -webkit-font-smoothing subpixel +
           translateZ(1px) + prefixed backface/preserve rules keep rotated
           card text crisp on iOS/Safari. The site-wide style.css ships
           border:none !important, so face borders and dividers are
           re-asserted here with !important. */
        .sh-flip-card {
          background-color: transparent;
          width: 100%;
          min-height: 330px;
          height: 100%;
          perspective: 1000px;
          cursor: pointer;
          user-select: none;
        }
        .sh-flip-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          text-align: left;
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          transform-style: preserve-3d;
          -webkit-transform-style: preserve-3d;
        }
        /* Hover flip applies only on fine-pointer devices — on touch,
           sticky :hover would fight the click-state toggle. */
        @media (hover: hover) {
          .sh-flip-card:hover .sh-flip-card-inner {
            transform: rotateY(180deg);
            -webkit-transform: rotateY(180deg);
          }
        }
        .sh-flip-card-flipped .sh-flip-card-inner {
          transform: rotateY(180deg);
          -webkit-transform: rotateY(180deg);
        }
        .sh-flip-card-front,
        .sh-flip-card-back {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          -webkit-backface-visibility: hidden !important;
          backface-visibility: hidden !important;
          border-radius: 1.25rem;
          border: 1px solid rgba(0, 0, 0, 0.1) !important;
          -webkit-font-smoothing: subpixel-antialiased;
          transform: translateZ(1px);
          -webkit-transform: translateZ(1px);
        }
        .sh-flip-card-front {
          background-color: #fafafa;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
        }
        .sh-flip-card-back {
          background-color: #ffffff;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
          transform: rotateY(180deg) translateZ(1px);
          -webkit-transform: rotateY(180deg) translateZ(1px);
        }
        .sh-flip-card-divider {
          border-top: 1px solid rgba(0, 0, 0, 0.1) !important;
        }
      `}</style>
    </section>
  );
}