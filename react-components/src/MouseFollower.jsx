import React, { useEffect, useState } from 'react';

export default function MouseFollower() {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [isOrangeBg, setIsOrangeBg] = useState(false);

  useEffect(() => {
    // Guard: touch/coarse-pointer devices and small screens never bind the
    // mouse listener (no render churn, no energy waste). Desktop unchanged.
    const isTouchDevice =
      window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
    if (isTouchDevice) return;

    const handleMouseMove = (e) => {
      const { clientX, clientY } = e;
      setPosition({ x: clientX, y: clientY });

      // Inspect DOM element directly underneath the cursor dot
      const targetElement = document.elementFromPoint(clientX, clientY);

      if (targetElement) {
        // Check if cursor is over the orange section or an element inside it
        const isOverOrangeSection = targetElement.closest(
          '.bg-orange, .section-orange, [data-bg="orange"]'
        );

        setIsOrangeBg(Boolean(isOverOrangeSection));
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        // Switch to White when over Orange section, otherwise default to Orange
        backgroundColor: isOrangeBg ? '#FFFFFF' : '#FF6000',
        transform: `translate3d(${position.x - 11}px, ${position.y - 11}px, 0)`,
        pointerEvents: 'none',
        zIndex: 99999,
        transition: 'transform 0.04s ease-out, background-color 0.2s ease',
      }}
    />
  );
}
