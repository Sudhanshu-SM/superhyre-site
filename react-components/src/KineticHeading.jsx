import React from 'react';

// Magic UI KineticText (hover-based variable-font stretch cascade),
// ported to plain CSS classes. Characters are grouped into word
// containers (.kinetic-word-container) so wrapping can only happen
// between words, never mid-word. All typography (family, size,
// weight, tracking) is inherited from the native heading CSS.

const KineticText = ({
  words,
  as: Tag = 'h1',
  className = '',
  style,
  staticRender = false,
}) => {
  const mergedStyle = {
    '--hover-padding': 'calc(1em / 12)',
    '--text-stroke-width': 'calc(1em * 125 / 6000)',
    ...(style || {}),
  };
  const fullText = words.flatMap((w) => w.chars.map((x) => x.c)).join('');
  return (
    <Tag className={className} style={mergedStyle} aria-label={fullText}>
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
