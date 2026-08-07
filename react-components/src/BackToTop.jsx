import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Floating "Back to Top" trigger — Uiverse minimal text-button design.
// Same markup/CSS as the styled-components version, but the styles are
// inlined in a scoped <style> so no runtime CSS-in-JS library is shipped
// (keeps cursor-bundle lean). Scoped under .back-to-top-wrap.

const BackToTop = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => setIsVisible(window.scrollY > 400);
    window.addEventListener('scroll', toggleVisibility, { passive: true });
    toggleVisibility();
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    const lenis = window.__lenis || window.lenis;
    if (lenis && typeof lenis.scrollTo === 'function') {
      lenis.scrollTo(0, { duration: 1.2 });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className={`back-to-top-wrap${isVisible ? '' : ' is-hidden'}`}>
      <button type="button" aria-label="Back to top" onClick={scrollToTop} tabIndex={isVisible ? 0 : -1}>
        <div className="text">
          <span>Back</span>
          <span>to</span>
          <span>top</span>
        </div>
        <div className="clone">
          <span>Back</span>
          <span>to</span>
          <span>top</span>
        </div>
        <svg strokeWidth={2} stroke="currentColor" viewBox="0 0 24 24" fill="none" className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" width="20px" aria-hidden="true">
          <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </button>

      {/* Scoped CSS (mirrors the styled-components rules verbatim) */}
      <style>{`
        .back-to-top-wrap {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 40;
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
          transition: opacity 0.3s ease, transform 0.3s ease, visibility 0.3s;
        }

        .back-to-top-wrap.is-hidden {
          opacity: 0;
          visibility: hidden;
          transform: translateY(12px);
          pointer-events: none;
        }

        .back-to-top-wrap button {
          width: 140px;
          height: 56px;
          overflow: hidden;
          border: none;
          color: #fff;
          background: none;
          position: relative;
          padding-bottom: 2em;
          cursor: pointer;
        }

        .back-to-top-wrap button > div,
        .back-to-top-wrap button > svg {
          position: absolute;
          width: 100%;
          height: 100%;
          display: flex;
        }

        .back-to-top-wrap button:before {
          content: "";
          position: absolute;
          height: 2px;
          bottom: 0;
          left: 0;
          width: 100%;
          transform: scaleX(0);
          transform-origin: bottom right;
          background: currentColor;
          transition: transform 0.25s ease-out;
        }

        .back-to-top-wrap button:hover:before {
          transform: scaleX(1);
          transform-origin: bottom left;
        }

        .back-to-top-wrap button .clone > *,
        .back-to-top-wrap button .text > * {
          opacity: 1;
          font-size: 1.3rem;
          transition: 0.2s;
          margin-left: 4px;
        }

        .back-to-top-wrap button .clone > * {
          transform: translateY(60px);
        }

        .back-to-top-wrap button:hover .clone > * {
          opacity: 1;
          transform: translateY(0px);
          transition: all 0.2s cubic-bezier(0.215, 0.61, 0.355, 1) 0s;
        }

        .back-to-top-wrap button:hover .text > * {
          opacity: 1;
          transform: translateY(-60px);
          transition: all 0.2s cubic-bezier(0.215, 0.61, 0.355, 1) 0s;
        }

        .back-to-top-wrap button:hover .clone > :nth-child(1) { transition-delay: 0.15s; }
        .back-to-top-wrap button:hover .clone > :nth-child(2) { transition-delay: 0.2s; }
        .back-to-top-wrap button:hover .clone > :nth-child(3) { transition-delay: 0.25s; }
        .back-to-top-wrap button:hover .clone > :nth-child(4) { transition-delay: 0.3s; }

        /* icon style and hover */
        .back-to-top-wrap button svg {
          width: 20px;
          right: 0;
          top: 50%;
          transform: translateY(-50%) rotate(-50deg);
          transition: 0.2s ease-out;
        }

        .back-to-top-wrap button:hover svg {
          transform: translateY(-50%) rotate(-90deg);
        }
      `}</style>
    </div>
  );
};

export function initBackToTop() {
  const mountNode = document.getElementById('back-to-top-root');
  if (!mountNode) return;
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <BackToTop />
    </React.StrictMode>
  );
}

export default BackToTop;