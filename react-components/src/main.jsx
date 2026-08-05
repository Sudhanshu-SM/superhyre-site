import React from 'react';
import ReactDOM from 'react-dom/client';
import MouseFollower from './MouseFollower';
import TypingSubheading from './TypingSubheading';
import { initKineticHeadings } from './KineticHeadingWrapper';
import { initScrollReveal } from './ScrollRevealWrapper';
import { initScrollExpandCards } from './ScrollExpandCards';
import { initScrollStackCards } from './ScrollStackCards';
import { initHorizontalWhyItWorks } from './HorizontalWhyItWorks';
import { initProcessAccordion } from './ProcessAccordion';
import { initUiverseStartHiringButton } from './UiverseStartHiringButton';
import { initUiverseLetsTalkButton } from './UiverseLetsTalkButton';

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
    // 6. Mount the hiring-process hover-expand accordion
    initProcessAccordion();
    // 7. Mount the Uiverse "START HIRING" gooey button (Section 05 CTA)
    initUiverseStartHiringButton();
    // 8. Mount the Uiverse "LET'S TALK" button (Section 05 CTA)
    initUiverseLetsTalkButton();
  });
}
