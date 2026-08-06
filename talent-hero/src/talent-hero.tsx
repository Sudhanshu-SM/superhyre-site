import React from 'react';
import ReactDOM from 'react-dom/client';
import { TalentHeroApp } from './TalentHeroApp';

const mount = document.getElementById('talent-hero-root');

if (mount) {
  ReactDOM.createRoot(mount).render(
    <React.StrictMode>
      <TalentHeroApp />
    </React.StrictMode>
  );
}