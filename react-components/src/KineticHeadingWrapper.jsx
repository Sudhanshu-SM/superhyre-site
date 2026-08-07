import React from 'react';
import ReactDOM from 'react-dom/client';
import KineticText from './KineticHeading';

// Splits a heading's child nodes into per-character tokens while
// preserving each source element's class names on every character.
function extractChars(container) {
  const chars = [];
  container.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      const text = child.textContent || '';
      // Preserve a space when the text node starts with whitespace and
      // follows an element ("CALENDAR," + " NOT OURS." -> "CALENDAR, NOT OURS.")
      if (/^\s/.test(text) && chars.length) chars.push({ c: ' ', cls: '' });
      const tokens = text.split(/\s+/).filter(Boolean);
      tokens.forEach((tok, ti) => {
        if (ti > 0 && chars.length) chars.push({ c: ' ', cls: '' });
        for (const c of tok.split('')) chars.push({ c, cls: '' });
      });
      // Preserve a space when the text node ends in whitespace right
      // before an element node ("...IS " + <span>BROKEN.</span> -> "IS BROKEN.")
      if (/\s$/.test(text) && chars.length) chars.push({ c: ' ', cls: '' });
    } else if (child.nodeType === 1) {
      const cls = typeof child.className === 'string' ? child.className : '';
      for (const c of (child.textContent || '').split('')) chars.push({ c, cls });
    }
  });
  while (chars.length && chars[chars.length - 1].c === ' ') chars.pop();
  if (!chars.length) {
    const text =
      container.getAttribute('data-kinetic-heading') ||
      container.innerText ||
      '';
    for (const c of text.split('')) chars.push({ c, cls: '' });
  }
  return chars;
}

// Groups the char tokens into words so layout wraps between words only.
function buildWords(chars) {
  const words = [];
  let cur = [];
  for (const ch of chars) {
    if (ch.c === ' ') {
      if (cur.length) {
        words.push({ chars: cur });
        cur = [];
      }
    } else {
      cur.push(ch);
    }
  }
  if (cur.length) words.push({ chars: cur });
  return words;
}

export function initKineticHeadings() {
  // Entrance animation stays active for every visitor (desktop request and
  // mobile); it degrades to a plain static render only if GSAP or
  // ScrollTrigger failed to load. A mobile "reduce motion" OS setting alone
  // must not kill the reveal, or mobile users never see it.
  const noMotion =
    typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined';
  document.querySelectorAll('[data-kinetic-heading]').forEach((container) => {
    const words = buildWords(extractChars(container));
    const level = container.dataset.level || 'h2';
    const root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <KineticText
          as={level}
          words={words}
          className="kinetic-root"
          staticRender={noMotion}
          entrance={!noMotion}
        />
      </React.StrictMode>
    );
  });
}
