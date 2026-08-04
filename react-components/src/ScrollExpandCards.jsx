import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

// React Bits ScrollExpand pattern (ScrollExpandContainer) ported for the
// SuperHyre stats section: cards stack at the bottom of the viewport
// (sticky bottom), and each card expands to full focus (scale/blur/
// opacity) as it crosses the viewport's vertical center line while
// scrolling. The fixed hint fades once the last card is in focus, then
// the section scrolls away naturally into 01 / THE PROBLEM.

const statsData = [
  {
    id: 1,
    stat: '48HRS',
    title: 'To a vetted shortlist',
    description:
      'Our high-velocity talent matching protocol sources, screens, and delivers fully aligned engineering candidates within two business days.',
  },
  {
    id: 2,
    stat: '3',
    title: 'Screening stages before your desk',
    description:
      'Every profile undergoes algorithmic code verification, live technical architecture defense, and deep culture alignment checks.',
  },
  {
    id: 3,
    stat: '100%',
    title: 'Of our pool is pre-vetted',
    description:
      'No passive resumes or unverified credentials. Every candidate in our ecosystem has active, evaluated performance scores.',
  },
  {
    id: 4,
    stat: '40+',
    title: 'Industries & geographies covered',
    description:
      'From seed-stage startups to enterprise scale, across North America, Europe, and LATAM remote tech hubs.',
  },
];

const ScrollExpandCards = ({ items, scrollHintText = 'Scroll to expand card' }) => {
  const wrapRef = useRef(null);
  const intersecting = useRef(new Set());
  const [activeCard, setActiveCard] = useState(null);
  const [lastCardVisible, setLastCardVisible] = useState(false);
  const [inView, setInView] = useState(false);
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reduced || !wrapRef.current) return;
    const cards = wrapRef.current.querySelectorAll('[data-card]');
    if (!cards.length) return;
    const set = intersecting.current;
    const io = new IntersectionObserver(
      (entries) => {
        let changed = false;
        entries.forEach((entry) => {
          const idx = parseInt(entry.target.dataset.card, 10);
          if (entry.isIntersecting) {
            if (!set.has(idx)) {
              set.add(idx);
              changed = true;
            }
          } else if (set.delete(idx)) {
            changed = true;
          }
        });
        if (!changed) return;
        if (set.size) {
          const top = Math.max(...set);
          setActiveCard(top);
          if (top === items.length - 1) setLastCardVisible(true);
        } else {
          setActiveCard(null);
        }
      },
      { rootMargin: '0px 0px -50% 0px' }
    );
    cards.forEach((card) => io.observe(card));
    return () => {
      io.disconnect();
      set.clear();
    };
  }, [items.length, reduced]);

  useEffect(() => {
    if (reduced || !wrapRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0 }
    );
    io.observe(wrapRef.current);
    return () => io.disconnect();
  }, [reduced]);

  const hintVisible = !reduced && inView && !lastCardVisible;

  return (
    <div className="scroll-expand-wrap" ref={wrapRef}>
      <div className="scroll-expand-frame">
        <div className="scroll-expand-stack">
          {items.map((item, i) => (
            <div
              key={item.id}
              data-card={i}
              className={`scroll-expand-card${activeCard === i ? ' is-active' : ''}${reduced ? ' is-static' : ''}`}
            >
              <span className="scroll-expand-index">{`0${i + 1}`}</span>
              <h3 className="scroll-expand-stat">{item.stat}</h3>
              <p className="scroll-expand-subtitle">{item.title}</p>
              <p className="scroll-expand-desc description-text">
                {item.description}
              </p>
            </div>
          ))}
        </div>
        <p
          className={`scroll-expand-hint${hintVisible ? '' : ' is-hidden'}`}
          aria-hidden="true"
        >
          {scrollHintText}
          <span className="scroll-expand-chev" />
        </p>
      </div>
    </div>
  );
};

export function initScrollExpandCards() {
  const mountNode = document.getElementById('scroll-expand-cards-root');
  if (!mountNode) return;
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <ScrollExpandCards items={statsData} />
    </React.StrictMode>
  );
}

export default ScrollExpandCards;
