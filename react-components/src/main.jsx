import React from 'react';
import ReactDOM from 'react-dom/client';
import MouseFollower from './MouseFollower';

const rootElement = document.getElementById('react-cursor-root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <MouseFollower />
    </React.StrictMode>
  );
}
