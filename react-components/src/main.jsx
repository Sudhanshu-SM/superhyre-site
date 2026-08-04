import React from 'react';
import ReactDOM from 'react-dom/client';
import MouseFollower from './MouseFollower';
import TypingSubheading from './TypingSubheading';
import ScrollRevealWrapper from './ScrollRevealWrapper';
import { initKineticHeadings } from './KineticHeadingWrapper';

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

function initScrollReveal() {
  document.querySelectorAll('[data-scroll-reveal]').forEach((container) => {
    const text =
      container.getAttribute('data-scroll-reveal') ||
      (container.innerText || '').trim();
    const baseOpacity = parseFloat(container.getAttribute('data-base-opacity')) || 0.15;
    const enableBlur = (container.getAttribute('data-blur') || 'true') !== 'false';
    const root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <ScrollRevealWrapper
          text={text.trim()}
          baseOpacity={baseOpacity}
          enableBlur={enableBlur}
        />
      </React.StrictMode>
    );
  });
}

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initKineticHeadings);
  document.addEventListener('DOMContentLoaded', initScrollReveal);
}
