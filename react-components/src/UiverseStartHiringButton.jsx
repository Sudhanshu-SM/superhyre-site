import React from 'react';
import ReactDOM from 'react-dom/client';

// "START HIRING" gooey button (Uiverse, refined). Drop-in slot for custom
// Uiverse CSS. The gooey SVG filter lives on an INSIDE layer (goo-container)
// while a rigid outer container with overflow:hidden keeps the rectangle's
// edges clean — no bulge, sag, or warp on hover.

function UiverseStartHiringButton({ redirectUrl = 'talent.html' }) {
  return (
    <>
      {/* SVG Gooey Filter Definition (Invisible) */}
      <svg className="hidden absolute" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
        <defs>
          <filter id="gooey-clean">
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

      {/* Real <a> link: guarantees redirect to talent.html */}
      <a href={redirectUrl} className="clean-goo-btn group">
        <span className="goo-container">
          <span className="goo-bubble" />
          <span className="goo-bubble" />
        </span>
        <span className="btn-text">START HIRING →</span>
      </a>

      {/* Scoped CSS Rules */}
      <style>{`
        /* Primary Rigid Container - Prevents Outer Edge Bulging */
        .clean-goo-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 18px 36px;
          background-color: #000000;
          color: #ffffff;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          text-decoration: none; /* <a> render: no underline */
          border: none;
          border-radius: 0px; /* Rigid sharp rectangle as per Uiverse ref */
          overflow: hidden; /* CRITICAL: clips liquid blur inside bounds */
          cursor: pointer;
          isolation: isolate;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .clean-goo-btn:hover {
          transform: translateY(-2px);
        }

        /* Inner Liquid Layer with Goo Filter Applied */
        .goo-container {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          filter: url('#gooey-clean');
          pointer-events: none;
          z-index: 1;
        }

        /* Liquid Circles: HIGH CONTRAST WHITE FILL */
        .goo-bubble {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 100%;
          padding-bottom: 100%;
          border-radius: 50%;
          background-color: #FFFFFF; /* White fill prevents orange-on-orange clashing */
          transform: translate(-50%, -50%) scale(0);
          transition: transform 0.9s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .clean-goo-btn:hover .goo-bubble {
          transform: translate(-50%, -50%) scale(1.85);
        }

        /* Dynamic Text Color Transition */
        .clean-goo-btn .btn-text {
          position: relative;
          z-index: 2;
          color: #FFFFFF; /* Default white text */
          transition: color 0.9s ease;
        }

        /* Inverts text to Black on Hover as White Liquid Covers Container */
        .clean-goo-btn:hover .btn-text {
          color: #000000;
        }
      `}</style>
    </>
  );
}

export function initUiverseStartHiringButton() {
  const mountNode = document.getElementById('uiverse-start-hiring-root');
  if (!mountNode) return;
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <UiverseStartHiringButton />
    </React.StrictMode>
  );
}

export default UiverseStartHiringButton;