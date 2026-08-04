import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// React Bits ScrollStack pattern ported for the SuperHyre problem
// section: the section header pins at the top of the viewport while
// each problem card sticks below it, fanned with a slight vertical
// offset per card. Cards arriving later overlap the previous ones,
// which scale down and darken for depth. When the section's scroll
// range ends, the whole pinned stack releases and scrolls up out of
// view, revealing the next section.

const problemCardsData = [
  {
    number: '/01',
    title: 'WRONG CHANNELS',
    description:
      'Most hiring relies on generic job boards flooded with passive, unvetted applications. You waste weeks filtering through noise, receiving identical candidates, and getting identical mediocre results.',
  },
  {
    number: '/02',
    title: 'GENERIC OUTREACH',
    description:
      'Automated mail-merge messages yield automated rejections or radio silence. High-caliber talent ignores copy-paste spam, leaving your pipeline starved of top-tier engineering leads.',
  },
  {
    number: '/03',
    title: 'SUPERFICIAL RESUME MATCHING',
    description:
      'Traditional recruiters match buzzwords on paper rather than evaluating real architectural capabilities, leading to costly late-stage technical interview failures.',
  },
  {
    number: '/04',
    title: 'EXPENSIVE DELAYS',
    description:
      'Every week an open engineering role sits vacant costs real product momentum, stretches existing team bandwidth to breaking point, and inflates hiring overhead.',
  },
];

const STACK_OFFSET = 48;

const ScrollStackCards = ({ cards }) => {
  const listRef = useRef(null);
  const pinTopRef = useRef(0);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const header = document.querySelector('.problem-header');
    const measure = () => {
      pinTopRef.current = header ? header.offsetHeight : 0;
      list.style.setProperty('--pin-top', `${pinTopRef.current}px`);
    };
    measure();
    const ro = header ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(header);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return () => (ro ? ro.disconnect() : undefined);

    const cardEls = Array.from(list.querySelectorAll('.scroll-stack-card'));
    const offsets = cardEls.map((_, i) => i * STACK_OFFSET);
    let ticking = false;

    const update = () => {
      ticking = false;
      let topPinned = -1;
      cardEls.forEach((card, i) => {
        const pinned = card.getBoundingClientRect().top <= pinTopRef.current + offsets[i] + 2;
        if (pinned) topPinned = i;
      });
      cardEls.forEach((card, i) => {
        card.classList.toggle('is-covered', topPinned > i);
      });
    };
    const request = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    request();

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
    };
  }, []);

  return (
    <div className="scroll-stack-list" ref={listRef}>
      {cards.map((card, i) => (
        <div
          key={card.number}
          className="scroll-stack-card"
          style={{ top: `calc(var(--pin-top, 0px) + ${i * STACK_OFFSET}px)` }}
        >
          <span className="scroll-stack-number">{card.number}</span>
          <h3 className="scroll-stack-title">{card.title}</h3>
          <p className="scroll-stack-desc description-text">{card.description}</p>
        </div>
      ))}
    </div>
  );
};

export function initScrollStackCards() {
  const mountNode = document.getElementById('scroll-stack-problem-root');
  if (!mountNode) return;
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <ScrollStackCards cards={problemCardsData} />
    </React.StrictMode>
  );
}

export default ScrollStackCards;
