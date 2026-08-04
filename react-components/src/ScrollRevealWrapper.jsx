import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

/* Scroll Reveal — adapted from React Bits ScrollReveal-JS-TW for the
   vanilla-hosted micro-bundle:
   - uses the page's existing GSAP + ScrollTrigger (window.gsap) instead of
     bundling a second copy (single ticker, no double ScrollTrigger registry)
   - hydrates an existing paragraph container: words are split into spans and
     scrub-revealed (opacity + optional blur) as the block crosses the viewport
   - only the triggers created here are killed on cleanup
   - reduced-motion renders crisp text untouched */

const ScrollRevealWrapper = ({
  text,
  className = '',
  baseOpacity = 0.15,
  enableBlur = true,
  blurStrength = 4,
  baseRotation = 3,
  rotationEnd = 'center center',
  wordAnimationEnd = 'center center'
}) => {
  const containerRef = useRef(null);
  const triggersRef = useRef([]);

  const words = text.split(/(\s+)/).map((part, i) =>
    /^\s+$/.test(part)
      ? <span key={i}>{part}</span>
      : <span key={i} className="sr-word">{part}</span>
  );

  useEffect(() => {
    const el = containerRef.current;
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!el || !gsap || !ScrollTrigger) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const rotateTween = gsap.fromTo(
      el,
      { transformOrigin: '0% 50%', rotate: baseRotation },
      {
        ease: 'none', rotate: 0,
        scrollTrigger: {
          trigger: el, start: 'top bottom', end: rotationEnd, scrub: true
        }
      }
    );
    triggersRef.current.push(rotateTween.scrollTrigger);

    const wordEls = el.querySelectorAll('.sr-word');

    const opacityTween = gsap.fromTo(
      wordEls,
      { opacity: baseOpacity },
      {
        ease: 'none', opacity: 1, stagger: 0.05,
        scrollTrigger: {
          trigger: el, start: 'top bottom-=20%', end: wordAnimationEnd, scrub: true
        }
      }
    );
    triggersRef.current.push(opacityTween.scrollTrigger);

    if (enableBlur) {
      const blurTween = gsap.fromTo(
        wordEls,
        { filter: `blur(${blurStrength}px)` },
        {
          ease: 'none', filter: 'blur(0px)', stagger: 0.05,
          scrollTrigger: {
            trigger: el, start: 'top bottom-=20%', end: wordAnimationEnd, scrub: true
          }
        }
      );
      triggersRef.current.push(blurTween.scrollTrigger);
    }

    ScrollTrigger.refresh();

    return () => {
      triggersRef.current.forEach((t) => { if (t) t.kill(); });
      triggersRef.current = [];
    };
  }, [baseOpacity, enableBlur, blurStrength, baseRotation, rotationEnd, wordAnimationEnd]);

  return (
    <span ref={containerRef} className={`sr-block ${className}`}>
      {words}
    </span>
  );
};

export default ScrollRevealWrapper;

/* Hydrates every [data-scroll-reveal] paragraph with the scrub reveal.
   Runs independently of the kinetic heading initializer on DOM ready. */
export function initScrollReveal() {
  document.querySelectorAll('[data-scroll-reveal]').forEach((container) => {
    const text =
      container.getAttribute('data-scroll-reveal') ||
      (container.innerText || '').trim();
    const baseOpacity =
      parseFloat(container.getAttribute('data-base-opacity')) || 0.15;
    const enableBlur =
      (container.getAttribute('data-blur') || 'true') !== 'false';
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
