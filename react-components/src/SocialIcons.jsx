import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';

// Clean standalone social icon block: gap-4 flex row (no overlap), crisp
// circular bases, brand-color fill with a Uiverse rising-wipe transition on
// hover, and a pill tooltip that slides in above the active icon.

const socialData = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/company/superhyre01/about/',
    brandColor: '#0077B5',
    svg: (
      <svg className="sh-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
      </svg>
    ),
  },
  {
    id: 'twitter',
    name: 'X / Twitter',
    url: 'https://x.com',
    brandColor: '#000000',
    svg: (
      <svg className="sh-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://github.com',
    brandColor: '#171515',
    svg: (
      <svg className="sh-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z" />
      </svg>
    ),
  },
];

function SocialIcons() {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <div className="sh-social-row">
      {socialData.map((item) => {
        const isHovered = hoveredId === item.id;
        return (
          <div key={item.id} className="sh-social-item">
            {/* Tooltip Pill */}
            <div
              style={{ backgroundColor: item.brandColor }}
              className={`sh-tooltip ${isHovered ? 'sh-tooltip-show' : ''}`}
            >
              {item.name}
              <div
                style={{ backgroundColor: item.brandColor }}
                className="sh-tooltip-arrow"
              />
            </div>

            {/* Circular Base */}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={item.name}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`sh-circle ${isHovered ? 'sh-circle-hover' : ''}`}
              style={{ '--brand': item.brandColor }}
            >
              <span className="sh-filled" aria-hidden="true" />
              {item.svg}
            </a>
          </div>
        );
      })}

      <style>{`
        /* Clean flex row: distinct, non-overlapping breathing room */
        .sh-social-row {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 1rem;
          padding: 1rem 0;
          position: relative;
        }

        .sh-social-item {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 0;
          padding: 0;
        }

        /* Tooltip Pill (above icon) */
        .sh-tooltip {
          position: absolute;
          top: -40px;
          left: 50%;
          transform: translateX(-50%) translateY(8px) scale(0.9);
          opacity: 0;
          padding: 4px 12px;
          border-radius: 6px;
          font-family: 'Kumbh Sans', 'Inter', sans-serif;
          font-size: 11px;
          font-weight: 700;
          color: #ffffff;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
          transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
          pointer-events: none;
          z-index: 20;
        }

        .sh-tooltip-show {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }

        .sh-tooltip-arrow {
          position: absolute;
          bottom: -4px;
          left: 50%;
          transform: translateX(-50%) rotate(45deg);
          width: 8px;
          height: 8px;
        }

        /* Crisp 48px circular base */
        .sh-circle {
          position: relative;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background-color: #1f1f1f;
          color: rgba(255, 255, 255, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          text-decoration: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .sh-svg {
          position: relative;
          z-index: 1;
          width: 20px;
          height: 20px;
          transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), color 0.3s ease;
        }

        /* Uiverse rising fill: wipes up from bottom in the brand color */
        .sh-filled {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 0;
          background-color: var(--brand, #000000);
          transition: height 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .sh-circle-hover {
          color: #ffffff;
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        }

        .sh-circle-hover .sh-filled {
          height: 100%;
        }

        .sh-circle-hover .sh-svg {
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}

export function initSocialIcons() {
  const mountNode = document.getElementById('social-tooltips-root');
  if (!mountNode) return;
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <SocialIcons />
    </React.StrictMode>
  );
}

export default SocialIcons;