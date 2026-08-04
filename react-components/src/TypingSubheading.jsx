import React, { useState, useRef, useEffect } from 'react';

/* Typewriter subheading — wrapper pattern from the project scaffold combined
   with the Magic UI typing-animation behavior (char-by-char interval reveal,
   start-on-view, optional blinking cursor). Tailwind utilities removed in
   favour of plain CSS; reduced-motion shows the full text instantly. */

const TYPING_SPEED = 75;

export default function TypingSubheading({
  text,
  className,
  speed = TYPING_SPEED,
  showCursor = true
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [typed, setTyped] = useState('');
  const [started, setStarted] = useState(false);
  const elementRef = useRef(null);

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started || reduceMotion) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(text.substring(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [started, text, speed, reduceMotion]);

  const done = typed.length >= text.length;
  const showText = reduceMotion ? text : started ? typed : '';

  return (
    <div
      ref={elementRef}
      className={className}
      style={{ opacity: isVisible || reduceMotion ? 1 : 0 }}
    >
      <span>{showText}</span>
      {showCursor && !reduceMotion && isVisible && !done && (
        <span
          className="typewriter-cursor"
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '2px',
            height: '0.9em',
            background: '#E45325',
            marginLeft: '2px',
            verticalAlign: '-0.08em',
            animation: 'typewriter-blink 1s steps(1) infinite'
          }}
        />
      )}
    </div>
  );
}
