import React from 'react';
import ReactDOM from 'react-dom/client';

// "LET'S TALK" secondary CTA with a dual-axis border-draw hover: four black
// border segments expand along the perimeter (top/bottom scaleX, left/right
// scaleY) to close a crisp rectangular frame. Keeps .contact-link so the
// shared contact modal still opens (contact.js binds .contact-link at load;
// the React mount happens on DOMContentLoaded, so a local handler is needed).

function openContactModal(e) {
  if (e) e.preventDefault();
  const modal = document.getElementById('contactModal');
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  const closeBtn = modal.querySelector('.modal-close');
  if (closeBtn) closeBtn.focus();
}

function UiverseLetsTalkButton({ href = '#contact' }) {
  return (
    <>
      <a href={href} className="border-draw-btn contact-link" onClick={openContactModal}>
        <span className="btn-text">LET'S TALK</span>
        <span className="border-line line-top" />
        <span className="border-line line-right" />
        <span className="border-line line-bottom" />
        <span className="border-line line-left" />
      </a>

      <style>{`
        /* Base Container */
        .border-draw-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 18px 32px;
          background-color: transparent;
          color: #000000;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          text-decoration: none;
          cursor: pointer;
          box-sizing: border-box;
          transition: background-color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease;
        }

        .border-draw-btn:hover {
          background-color: rgba(255, 255, 255, 0.15); /* Subtle crisp background lift */
          box-shadow: 0 12px 24px -6px rgba(0, 0, 0, 0.25); /* Deep shadow effect */
          transform: translateY(-2px);
        }

        .border-draw-btn .btn-text {
          position: relative;
          z-index: 2;
          color: #000000;
        }

        /* Border Line Elements (3px Black Frame) */
        .border-line {
          position: absolute;
          background-color: #000000; /* Solid Black Border */
          transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }

        /* Top & Bottom Lines (Animate Horizontally) */
        .line-top, .line-bottom {
          width: 100%;
          height: 3px;
          transform: scaleX(0);
        }

        .line-top {
          top: 0;
          left: 0;
          transform-origin: left;
        }

        .line-bottom {
          bottom: 0;
          right: 0;
          transform-origin: right;
        }

        /* Left & Right Lines (Animate Vertically) */
        .line-left, .line-right {
          width: 3px;
          height: 100%;
          transform: scaleY(0);
        }

        .line-left {
          top: 0;
          left: 0;
          transform-origin: bottom;
        }

        .line-right {
          top: 0;
          right: 0;
          transform-origin: top;
        }

        /* Trigger Expansion on Hover */
        .border-draw-btn:hover .line-top,
        .border-draw-btn:hover .line-bottom {
          transform: scaleX(1);
        }

        .border-draw-btn:hover .line-left,
        .border-draw-btn:hover .line-right {
          transform: scaleY(1);
        }
      `}</style>
    </>
  );
}

export function initUiverseLetsTalkButton() {
  const mountNode = document.getElementById('uiverse-lets-talk-root');
  if (!mountNode) return;
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <UiverseLetsTalkButton />
    </React.StrictMode>
  );
}

export default UiverseLetsTalkButton;