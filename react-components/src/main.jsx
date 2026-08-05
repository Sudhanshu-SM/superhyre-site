import React from 'react';
import ReactDOM from 'react-dom/client';
import MouseFollower from './MouseFollower';
import TypingSubheading from './TypingSubheading';
import { initKineticHeadings } from './KineticHeadingWrapper';
import { initScrollReveal } from './ScrollRevealWrapper';
import { initScrollExpandCards } from './ScrollExpandCards';
import { initScrollStackCards } from './ScrollStackCards';
import { initHorizontalWhyItWorks } from './HorizontalWhyItWorks';

const rootElement = document.getElementById('react-cursor-root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <MouseFollower />
    </React.StrictMode>
  );
}

document.querySelectorAll('.typewriter-subheading').forEach((el) => {
  const text = (el.textContent || '').trim();
  const root = ReactDOM.createRoot(el);
  root.render(
    <React.StrictMode>
      <TypingSubheading text={text} className="" />
    </React.StrictMode>
  );
});

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Mount kinetic text on main section headings only (h1/h2)
    initKineticHeadings();
    // 2. Mount scroll reveals on description copy
    initScrollReveal();
    // 3. Mount the React Bits scroll-expand stats cards
    initScrollExpandCards();
    // 4. Mount the React Bits scroll-stack problem cards
    initScrollStackCards();
    // 5. Mount the horizontal why-it-works rows (GSAP clip-path wipe)
    initHorizontalWhyItWorks();
  });
}
