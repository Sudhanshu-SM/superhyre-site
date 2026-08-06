import React from 'react';
import ReactDOM from 'react-dom/client';
import { TalentHeroApp } from './TalentHeroApp';
import { TalentTrustSection } from './TalentTrustSection';

const mount = document.getElementById('talent-hero-root');

if (mount) {
  ReactDOM.createRoot(mount).render(
    <React.StrictMode>
      <TalentHeroApp />
    </React.StrictMode>
  );
}

const trustMount = document.getElementById('talent-trust-root');

if (trustMount) {
  ReactDOM.createRoot(trustMount).render(
    <React.StrictMode>
      <TalentTrustSection />
    </React.StrictMode>
  );
}