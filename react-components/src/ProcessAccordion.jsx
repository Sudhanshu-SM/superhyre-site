import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

// "Hiring Process" hover-expand accordion. Panel 1 (DAY 0) is expanded by
// default; hovering any panel expands it horizontally while the others
// compress; leaving the container entirely resets back to Panel 1. Pure
// CSS flex transitions handle the desktop motion.
//
// Mobile (< 768px): a separate vertical card stack is pinned with
// ScrollTrigger and scrubbed through Card 1 -> Card 4 by scrolling; each
// step collapses the previous card (72px) and expands the next (360px).
// Compressed scroll distance (+=120%), tight scrub (0.3) and a fast
// 0.2s snap keep the transitions quick on touch devices.
// gsap.matchMedia() keeps the two mechanics fully separated. GSAP comes
// from the page CDN (gsap + ScrollTrigger globals), so the bundle
// carries no duplicate GSAP copy.

const processSteps = [
  {
    id: 1,
    tag: 'DAY 0',
    color: '#FF4301',
    title: "WE DON'T START WITH A JOB DESCRIPTION.",
    description:
      'We start by understanding what the role actually needs to accomplish. Alignment on day zero prevents mishires on day thirty.',
  },
  {
    id: 2,
    tag: '48 HOURS',
    color: '#FA7D09',
    title: "A SHORTLIST IN 48 HOURS IS THE BASELINE, NOT THE PITCH.",
    description:
      'From first principles to a decision — a shortlist in 48 hours is the baseline, not the pitch.',
  },
  {
    id: 3,
    tag: 'DAY 7',
    color: '#4A3F35',
    title: 'HIGH-INTENT CONVERSATIONS & TECHNICAL ALIGNMENT.',
    description:
      'Candidates are pre-briefed on your architecture, engineering culture, and roadmap before step one.',
  },
  {
    id: 4,
    tag: 'DAY 14',
    color: '#2F2519',
    title: 'FINAL OFFERS & ZERO-RISK ONBOARDING GUARANTEE.',
    description:
      'Seamless closing support backed by our full replacement guarantee for long-term retention.',
  },
];

const ProcessAccordion = () => {
  const wrapperRef = useRef(null);
  const [active, setActive] = useState(0);

  // Mouse leaving the whole container resets to Panel 1 (DAY 0).
  const handleKey = (e, index) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActive(index);
    }
  };

  // Mobile-only pinned scroll-through: gsap.matchMedia() keeps this
  // completely separate from the desktop hover interaction.
  useEffect(() => {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!gsap || !ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const mm = gsap.matchMedia();
      mm.add('(max-width: 767px)', () => {
        const cards = gsap.utils.toArray('.mobile-accordion-card');
        const overlays = gsap.utils.toArray('.mobile-accordion-card .accordion-collapsed');
        const contents = gsap.utils.toArray('.mobile-accordion-card .accordion-content');
        if (cards.length < 2 || !wrapperRef.current) return;

        const pinTl = gsap.timeline({
          scrollTrigger: {
            trigger: wrapperRef.current,
            start: 'top top',
            end: '+=' + cards.length * 30 + '%',
            pin: true,
            scrub: 0.3,
            snap: {
              snapTo: 1 / (cards.length - 1),
              duration: 0.2,
              ease: 'power1.inOut',
            },
          },
        });

        for (let i = 1; i < cards.length; i++) {
          const label = 'step-' + i;
          pinTl
            .to(cards[i - 1], { height: '72px', duration: 0.35, ease: 'power2.inOut' }, label)
            .to(overlays[i - 1], { opacity: 1, duration: 0.3 }, label)
            .to(contents[i - 1], { opacity: 0, duration: 0.3 }, label)
            .to(cards[i], { height: '360px', duration: 0.35, ease: 'power2.inOut' }, label)
            .to(overlays[i], { opacity: 0, duration: 0.3 }, label)
            .to(contents[i], { opacity: 1, duration: 0.3 }, label);
        }
      });
    }, wrapperRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="accordion-wrapper" ref={wrapperRef}>
      {/* ---------- Desktop hover accordion (>= 768px) ---------- */}
      <div
        className="accordion-container"
        onMouseLeave={() => setActive(0)}
      >
      {processSteps.map((step, index) => {
        const isActive = active === index;
        return (
          <div
            key={step.id}
            className={`accordion-panel${isActive ? ' is-active' : ''}`}
            style={{ backgroundColor: step.color }}
            onMouseEnter={() => setActive(index)}
            onKeyDown={(e) => handleKey(e, index)}
            tabIndex={0}
            role="button"
            aria-expanded={isActive}
            aria-label={`${step.tag}: ${step.title}`}
          >
            {/* Collapsed-state rotated label along the panel edge */}
            <div
              className="accordion-collapsed"
              style={{ opacity: isActive ? 0 : 1, pointerEvents: isActive ? 'none' : 'auto' }}
            >
              <span className="collapsed-tag-text">{step.tag}</span>
            </div>

            {/* Expanded-state content */}
            <div
              className="accordion-content"
              style={{
                opacity: isActive ? 1 : 0,
                transform: isActive ? 'scale(1)' : 'scale(.95)',
              }}
            >
              <span className="accordion-tag">{step.tag}</span>
              <div className="accordion-copy">
                <h3 className="accordion-title">{step.title}</h3>
                <p className="accordion-desc">{step.description}</p>
              </div>
            </div>
          </div>
        );
      })}
      </div>

      {/* ---------- Mobile pinned scroll-through stack (< 768px) ---------- */}
      <div className="mobile-accordion-stack">
        {processSteps.map((step, index) => (
          <div
            key={step.id}
            className="mobile-accordion-card"
            style={{
              height: index === 0 ? '360px' : '72px',
              backgroundColor: step.color,
            }}
          >
            {/* Collapsed-state centered label */}
            <div
              className="accordion-collapsed"
              style={{ opacity: index === 0 ? 0 : 1 }}
            >
              <span className="collapsed-tag-text">{step.tag}</span>
            </div>

            {/* Expanded-state content stack */}
            <div
              className="accordion-content"
              style={{ opacity: index === 0 ? 1 : 0, transform: 'scale(1)' }}
            >
              <span className="accordion-tag">{step.tag}</span>
              <div className="accordion-copy">
                <h3 className="accordion-title">{step.title}</h3>
                <p className="accordion-desc">{step.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export function initProcessAccordion() {
  const mountNode = document.getElementById('process-accordion-root');
  if (!mountNode) return;
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <ProcessAccordion />
    </React.StrictMode>
  );
}

export default ProcessAccordion;