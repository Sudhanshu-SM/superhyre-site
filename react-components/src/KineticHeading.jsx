import React, { useEffect, useRef } from 'react';

// Magic UI KineticText (hover-based variable font stretch cascade),
// ported to plain CSS classes. Characters are grouped into word
// containers (.kinetic-word-container) so wrapping can only happen
// between words, never mid-word. All typography (family, size,
// weight, tracking) is inherited from the native heading CSS.
//
// Entrance animation matches Magic UI <TextAnimate animation="blurInUp"
// by="character" once />: every character starts below with a blur and
// staggers up into place once when the heading scrolls into view. Runs
// in useEffect (after React commits) and composes with the hover
// cascade, the hero pinned-scale tween (which targets the outer
// container) and the card roll reveals (untouched).

const KineticText = ({
  words,
  as: Tag = 'h1',
  className = '',
  style,
  staticRender = false,
  entrance = true,
}) => {
  const tagRef = useRef(null);
  const mergedStyle = {
    '--hover-padding': 'calc(1em / 12)',
    '--text-stroke-width': 'calc(1em * 125 / 6000)',
    ...(style || {}),
  };
  const fullText = words.flatMap((w) => w.chars.map((x) => x.c)).join('');

  useEffect(() => {
    if (!entrance || staticRender) return;
    const el = tagRef.current;
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!el || !gsap || !ScrollTrigger) return;
    const letters = el.querySelectorAll('.kinetic-letter');
    if (!letters.length) return;
    gsap.registerPlugin(ScrollTrigger);
    const tween = gsap.fromTo(
      letters,
      {
        opacity: 0,
        y: 10,
        filter: 'blur(4px)',
      },
      {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.5,
        ease: 'power2.out',
        stagger: 0.02,
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none reverse',
        },
      }
    );
    return () => {
      if (tween.scrollTrigger) tween.scrollTrigger.kill();
      tween.kill();
    };
  }, [entrance, staticRender]);

  return (
    <Tag
      ref={tagRef}
      className={className}
      style={mergedStyle}
      aria-label={fullText}
    >
      {words.map((word, wi) => (
        <span key={wi} className="kinetic-word-container">
          {word.chars.map((x, i) => (
            <span
              key={i}
              className={
                staticRender
                  ? x.cls || undefined
                  : `kinetic-letter ${x.cls || ''}`.trim()
              }
            >
              {x.c === ' ' ? '\u00A0' : x.c}
            </span>
          ))}
        </span>
      ))}
      {staticRender ? null : <span className="sr-only">{fullText}</span>}
    </Tag>
  );
};

export default KineticText;
