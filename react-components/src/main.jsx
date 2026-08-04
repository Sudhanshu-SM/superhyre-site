import React from 'react';
import ReactDOM from 'react-dom/client';
import MouseFollower from './MouseFollower';
import TypingSubheading from './TypingSubheading';

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
