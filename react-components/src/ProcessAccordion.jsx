import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

// "Hiring Process" hover-expand accordion. Panel 1 (DAY 0) is expanded by
// default; hovering any panel expands it horizontally while the others
// compress; leaving the container entirely resets back to Panel 1. Pure
// CSS flex transitions handle the motion, so no GSAP is required here.

const processSteps = [
  {
    id: 1,
    tag: 'DAY 0',
    color: '#003049',
    title: "WE DON'T START WITH A JOB DESCRIPTION.",
    description:
      'We start by understanding what the role actually needs to accomplish. Alignment on day zero prevents mishires on day thirty.',
  },
  {
    id: 2,
    tag: '48 HOURS',
    color: '#D62828',
    title: "A SHORTLIST IN 48 HOURS IS THE BASELINE, NOT THE PITCH.",
    description:
      'From first principles to a decision — a shortlist in 48 hours is the baseline, not the pitch.',
  },
  {
    id: 3,
    tag: 'DAY 7',
    color: '#F77F00',
    title: 'HIGH-INTENT CONVERSATIONS & TECHNICAL ALIGNMENT.',
    description:
      'Candidates are pre-briefed on your architecture, engineering culture, and roadmap before step one.',
  },
  {
    id: 4,
    tag: 'DAY 14',
    color: '#FCBF49',
    title: 'FINAL OFFERS & ZERO-RISK ONBOARDING GUARANTEE.',
    description:
      'Seamless closing support backed by our full replacement guarantee for long-term retention.',
  },
];

const ProcessAccordion = () => {
  const containerRef = useRef(null);
  const [active, setActive] = useState(0);

  // Mouse leaving the whole container resets to Panel 1 (DAY 0).
  const handleKey = (e, index) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActive(index);
    }
  };

  return (
    <div
      className="accordion-container"
      ref={containerRef}
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
              <span>{step.tag}</span>
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
                <p className="accordion-desc" style={{ marginTop: '1rem' }}>
                  {step.description}
                </p>
              </div>
            </div>
          </div>
        );
      })}
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