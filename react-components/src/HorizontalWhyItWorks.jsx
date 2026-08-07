import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// Webflow Conf "What's in it for you" pattern ported for the SuperHyre
// "Why It Works" section: stacked horizontal split-rows. Each row is a
// 50/50 split — a solid color banner on the left (revealed by an
// authentic pixel-block dissolve: a grid of section-bg cells that fade
// out in a left-to-right column wave, matching the reference site) and
// a dark description panel on the right (fades + slides in just after
// the banner completes). GSAP comes from the page CDN (gsap +
// ScrollTrigger globals), so the bundle carries no duplicate GSAP copy.

const PIXEL_COLS = 8;
const PIXEL_ROWS = 5;
const PIXEL_BG = '#0D0D0D';

const whyItWorksRows = [
  {
    id: '01',
    leftTitle: 'DEPTH VETTING',
    bannerClass: 'cc-orange cc-dark textured-banner-1',
    eyebrow: 'SCREENING & TECHNICAL DEFENSE',
    rightTitle: 'VETTING PAST THE RESUME',
    descriptionHtml:
      'Multi-stage screening before anyone reaches your desk. We <strong>validate technical depth and architecture defense</strong> long before your first interview.',
    example:
      'Candidates solve real architecture challenges specific to your stack rather than generic LeetCode drills.',
  },
  {
    id: '02',
    leftTitle: 'VELOCITY',
    bannerClass: 'cc-blue cc-dark',
    eyebrow: 'FAST PIPELINE ASSURANCE',
    rightTitle: 'SPEED THAT DOESN\'T CUT CORNERS',
    descriptionHtml:
      'A vetted shortlist within 48 hours is our baseline. We build our talent matching protocol <strong>around your hiring calendar</strong>, eliminating dead wait time.',
    example:
      'Active candidate pipelines are pre-allocated so interviews can launch within 48 hours of intake.',
  },
  {
    id: '03',
    leftTitle: 'QUALITY CONTROL',
    bannerClass: 'cc-gold cc-light',
    eyebrow: 'HIGH-INTENT TALENT POOL',
    rightTitle: 'CURATED ACTIVE TALENT POOL',
    descriptionHtml:
      'We don\'t scrape public job boards. Our talent pool consists of <strong>pre-vetted, high-intent engineers</strong> ready to make immediate production impact.',
    example:
      '92% of delivered shortlists result in a final technical interview offer within 5 business days.',
  },
  {
    id: '04',
    leftTitle: 'ALIGNMENT',
    bannerClass: 'cc-pink cc-dark textured-banner-4',
    eyebrow: 'DOMAIN & CULTURE FIT',
    rightTitle: 'ARCHITECTURAL & CULTURE FIT',
    descriptionHtml:
      'We evaluate communication clarity, asynchronous ownership, and <strong>domain-specific expertise</strong> alongside core software engineering capability.',
    example:
      'Candidates arrive with clear context on your product roadmap, team structure, and stack expectations.',
  },
  {
    id: '05',
    leftTitle: 'GUARANTEE',
    bannerClass: 'cc-cyan cc-light',
    eyebrow: 'ZERO-RISK PLACEMENT',
    rightTitle: 'ZERO-RISK PLACEMENT ASSURANCE',
    descriptionHtml:
      'Every hire comes backed by our <strong>full replacement guarantee</strong>, ensuring complete peace of mind as you scale your engineering organization.',
    example:
      'If a candidate isn\'t a perfect fit within the trial window, we replace the role at zero extra cost.',
  },
];

const HorizontalWhyItWorks = () => {
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!gsap || !ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const ctx = gsap.context(() => {
      list.querySelectorAll('.row-item').forEach((row) => {
        const leftBanner = row.querySelector('.left-banner');
        const rightContent = row.querySelector('.right-content');
        if (!leftBanner || !rightContent) return;

        // Pixel-block overlay: grid of section-bg cells covering the banner
        const overlay = document.createElement('div');
        overlay.className = 'pixel-cell-overlay';
        overlay.style.cssText =
          'position:absolute;inset:0;display:grid;z-index:2;pointer-events:none;' +
          'grid-template-columns:repeat(' + PIXEL_COLS + ',1fr);' +
          'grid-template-rows:repeat(' + PIXEL_ROWS + ',1fr);';

        const columns = [];
        for (let c = 0; c < PIXEL_COLS; c++) columns[c] = [];
        for (let r = 0; r < PIXEL_ROWS; r++) {
          for (let c = 0; c < PIXEL_COLS; c++) {
            const cell = document.createElement('div');
            cell.style.backgroundColor = PIXEL_BG;
            overlay.appendChild(cell);
            columns[c].push(cell);
          }
        }
        leftBanner.appendChild(overlay);

        // Random vertical order inside each column (reference site behavior)
        columns.forEach((col) => col.sort(() => Math.random() - 0.5));

        // Touch devices: the pixel dissolve is driven straight off the row's
        // live geometry (scroll-scrubbed), so it advances with the finger no
        // matter how fast the fling, and it is immune to ScrollTrigger's
        // cached positions drifting under the sticky hero on small viewports.
        // Desktop keeps the original GSAP timed play-out untouched.
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        if (coarse) {
          const DUR = PIXEL_COLS * 0.55 / PIXEL_COLS + (PIXEL_ROWS - 1) * 0.015 + 0.05;
          const beginAt = window.innerHeight * 0.85;
          const endAt = window.innerHeight * 0.25;
          let ticking = false;
          const paint = () => {
            ticking = false;
            let p = (beginAt - row.getBoundingClientRect().top) / (beginAt - endAt);
            if (p < 0) p = 0;
            else if (p > 1) p = 1;
            const time = p * DUR;
            for (let c = 0; c < PIXEL_COLS; c++) {
              const colDelay = (c / PIXEL_COLS) * 0.55;
              for (let i = 0; i < PIXEL_ROWS; i++) {
                let v = (time - (colDelay + i * 0.015)) / 0.05;
                if (v < 0) v = 0;
                else if (v > 1) v = 1;
                columns[c][i].style.opacity = String(1 - v);
              }
            }
            rightContent.style.opacity = String(p);
            rightContent.style.transform = 'translateX(' + (25 * (1 - p)) + 'px)';
          };
          const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(paint); } };
          window.addEventListener('scroll', onScroll, { passive: true });
          paint();
          return; // coarse path handled; skip the GSAP timeline below
        }

        const rowTl = gsap.timeline({
          scrollTrigger: {
            trigger: row,
            start: 'top 85%',
            end: 'top 35%',
            toggleActions: 'play none none reverse',
          },
        });

        // 1. Left banner: pixel-block dissolve, left to right column wave
        for (let c = 0; c < PIXEL_COLS; c++) {
          const colDelay = (c / PIXEL_COLS) * 0.55;
          for (let i = 0; i < columns[c].length; i++) {
            rowTl.to(columns[c][i], { opacity: 0, duration: 0.05 }, colDelay + i * 0.015);
          }
        }

        // 2. Right text block: fade + slide in with a slight overlap
        rowTl.fromTo(
          rightContent,
          { opacity: 0, x: 25 },
          { opacity: 1, x: 0, duration: 0.45, ease: 'power2.out' },
          '-=0.15'
        );
      });
    }, list);

    return () => ctx.revert();
  }, []);

  return (
    <div className="why-cards-grid" ref={listRef}>
      {whyItWorksRows.map((item) => (
        <div key={item.id} className="row-item">
          <div className={`left-banner ${item.bannerClass}`}>
            <h3 className="banner-title">{item.leftTitle}</h3>
          </div>
          <div className="right-content">
            <span className="row-eyebrow">{item.eyebrow}</span>
            <h4 className="row-title">{item.rightTitle}</h4>
            <p
              className="section-description"
              dangerouslySetInnerHTML={{ __html: item.descriptionHtml }}
            />
            {item.example && (
              <p className="row-example">&ldquo;{item.example}&rdquo;</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export function initHorizontalWhyItWorks() {
  const mountNode = document.getElementById('why-it-works-rows-root');
  if (!mountNode) return;
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <HorizontalWhyItWorks />
    </React.StrictMode>
  );
}

export default HorizontalWhyItWorks;
