import React, { useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// React Bits ScrollExpand (media-frame variant) ported for the
// SuperHyre stats section: a compact rounded frame (42% x 58%,
// 24px radius) pins to the viewport and expands to full bleed via
// clip-path as the page scrolls, with the giant metric fading out
// while the subtitle / narrative / example crossfade in. Four
// frames stack sequentially, then the section hands off to 01.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

const ScrollExpand = ({
  src = '',
  mediaType = 'image',
  poster = '',
  alt = '',
  title = '',
  scrollHint = '',
  startWidth = 42,
  startHeight = 58,
  startRadius = 24,
  endRadius = 0,
  mediaZoom = 1.35,
  scrollDistance = 1.2,
  holdDistance = 0.35,
  smoothing = 0.1,
  overlayScrim = 0.45,
  useWindowScroll = true,
  enabled = true,
  children,
  className = '',
  style,
  ...rest
}) => {
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const mediaRef = useRef(null);
  const titleRef = useRef(null);
  const overlayRef = useRef(null);
  const scrimRef = useRef(null);
  const hintRef = useRef(null);

  const propsRef = useRef({});
  propsRef.current = {
    startWidth,
    startHeight,
    startRadius,
    endRadius,
    mediaZoom,
    scrollDistance,
    holdDistance,
    smoothing,
    overlayScrim,
    useWindowScroll,
    enabled,
  };

  const applyProgress = useCallback((p) => {
    const frame = frameRef.current;
    const media = mediaRef.current;
    if (!frame || !media) return;
    const c = propsRef.current;

    const e = smoothstep(0, 1, p);

    const w = c.startWidth + (100 - c.startWidth) * e;
    const h = c.startHeight + (100 - c.startHeight) * e;
    const ix = Math.max(0, (100 - w) / 2);
    const iy = Math.max(0, (100 - h) / 2);
    const r = c.startRadius + (c.endRadius - c.startRadius) * e;
    frame.style.clipPath = `inset(${iy}% ${ix}% ${iy}% ${ix}% round ${r}px)`;

    media.style.transform = `scale(${c.mediaZoom + (1 - c.mediaZoom) * e})`;

    if (scrimRef.current) scrimRef.current.style.opacity = `${c.overlayScrim * e}`;

    if (titleRef.current) {
      const out = smoothstep(0.4, 0.88, p);
      titleRef.current.style.opacity = `${1 - out}`;
      titleRef.current.style.transform = `translate3d(0, ${-28 * out}px, 0) scale(${1 + 0.06 * out})`;
    }

    if (hintRef.current) {
      const gone = smoothstep(0, 0.12, p);
      hintRef.current.style.opacity = `${1 - gone}`;
      hintRef.current.style.transform = `translate3d(0, ${8 * gone}px, 0)`;
    }

    if (overlayRef.current) {
      const inn = smoothstep(0.68, 1, p);
      overlayRef.current.style.opacity = `${inn}`;
      overlayRef.current.style.transform = `translate3d(0, ${18 * (1 - inn)}px, 0)`;
    }
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    const stage = stageRef.current;
    if (!root || !track || !stage) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let current = 0;
    let target = 0;
    let stageH = 0;
    let running = false;

    const measure = () => {
      const c = propsRef.current;
      stageH = c.useWindowScroll ? window.innerHeight : root.clientHeight;
      if (stageH <= 0) return;
      stage.style.height = `${stageH}px`;
      track.style.height = `${stageH * (1 + Math.max(0, c.scrollDistance) + Math.max(0, c.holdDistance))}px`;

      const w = root.clientWidth || stageH;
      stage.style.setProperty('--se-title-size', `${clamp(w * 0.11, 28, 110)}px`);
    };

    const readProgress = () => {
      const c = propsRef.current;
      if (!c.enabled) return 1;
      const span = stageH * Math.max(0.01, c.scrollDistance);
      if (c.useWindowScroll) {
        const top = track.getBoundingClientRect().top;
        return clamp(-top / span, 0, 1);
      }
      return clamp(root.scrollTop / span, 0, 1);
    };

    const tick = () => {
      const c = propsRef.current;
      const k = c.smoothing <= 0 ? 1 : 1 - Math.exp(-1 / (60 * c.smoothing));
      current += (target - current) * k;
      if (Math.abs(target - current) < 0.0004) {
        current = target;
        running = false;
      }
      applyProgress(current);
      raf = running ? requestAnimationFrame(tick) : 0;
    };

    const kick = () => {
      if (running) return;
      running = true;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onScroll = () => {
      target = readProgress();
      if (propsRef.current.smoothing <= 0 || reduceMotion) {
        current = target;
        applyProgress(current);
        return;
      }
      kick();
    };

    const onResize = () => {
      measure();
      target = readProgress();
      current = target;
      applyProgress(current);
    };

    measure();
    target = readProgress();
    current = target;
    applyProgress(current);

    const scroller = useWindowScroll ? window : root;
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(root);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
    };
  }, [applyProgress, useWindowScroll]);

  const media = src ? (
    mediaType === 'video' ? (
      <video
        ref={mediaRef}
        className="se-media"
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
      />
    ) : (
      <img ref={mediaRef} className="se-media" src={src} alt={alt} draggable={false} />
    )
  ) : (
    <div ref={mediaRef} className="se-media" aria-hidden="true" />
  );

  return (
    <div
      ref={rootRef}
      className={`se-root ${className}`.trim()}
      style={style}
      {...rest}
    >
      <div ref={trackRef} className="se-track">
        <div ref={stageRef} className="se-stage">
          <div ref={frameRef} className="se-frame">
            {media}
            <div ref={scrimRef} className="se-scrim" />
            {children ? (
              <div ref={overlayRef} className="se-overlay">
                {children}
              </div>
            ) : null}
          </div>
          {title ? (
            <div ref={titleRef} className="se-title">
              {title}
            </div>
          ) : null}
          {scrollHint ? (
            <div ref={hintRef} className="se-hint">
              {scrollHint}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const scrollExpandStatsData = [
  {
    id: '01',
    stat: '48HRS',
    subheadingHtml:
      'TO A VET<span class="font-kreol italic font-normal">T</span>ED SHORTL<span class="font-kreol italic font-normal">I</span>ST',
    descriptionHtml:
      'Our high-velocity talent matching protocol bypasses standard resume queuing to <strong>source, screen, and deliver</strong> fully aligned engineering leads within two business days.',
    example:
      'A Series-B fintech client requested two Senior Full-Stack React/Django developers on Monday morning; candidate interviews were locked in by Wednesday.',
  },
  {
    id: '02',
    stat: '3',
    subheadingHtml:
      'SCREEN<span class="font-kreol italic font-normal">I</span>NG STAG<span class="font-kreol italic font-normal">E</span>S BEFORE YOUR DESK',
    descriptionHtml:
      'Every profile undergoes <strong>rigorous algorithmic code checks</strong>, live system architecture defense, and deep culture alignment vetting before you ever review them.',
    example:
      'Out of 150 raw applicants, only 4 candidates pass our strict technical benchmark to reach your calendar.',
  },
  {
    id: '03',
    stat: '100%',
    subheadingHtml:
      'OF OUR P<span class="font-kreol italic font-normal">O</span>OL IS PRE-VET<span class="font-kreol italic font-normal">T</span>ED',
    descriptionHtml:
      'We maintain an active network of top-tier engineers with <strong>verified work histories</strong> and real code assessments—zero unverified PDF resumes.',
    example:
      'Immediate access to engineers who have already solved production scale challenges in high-growth environments.',
  },
  {
    id: '04',
    stat: '40+',
    subheadingHtml:
      'INDUS<span class="font-kreol italic font-normal">T</span>RIES & GEOGR<span class="font-kreol italic font-normal">A</span>PHIES COVERED',
    descriptionHtml:
      'Extensive talent coverage across North America, Europe, and key emerging technology hubs, spanning <strong>Fintech, AI Infrastructure</strong>, SaaS, and HealthTech.',
    example:
      'Seamless hiring across multiple time zones with localized compliance and onboarding support.',
  },
];

const StatOverlay = ({ card }) => (
  <div className="se-content">
    <div className="se-stat">{card.stat}</div>
    <h3
      className="se-subheading font-wf-sans"
      dangerouslySetInnerHTML={{ __html: card.subheadingHtml }}
    />
    <p
      className="se-desc font-wf-sans"
      dangerouslySetInnerHTML={{ __html: card.descriptionHtml }}
    />
    {card.example ? (
      <div className="se-example-block">
        <span className="se-example-label">EXAMPLE</span>
        <p className="se-example font-wf-sans">&ldquo;{card.example}&rdquo;</p>
      </div>
    ) : null}
  </div>
);

export function initScrollExpandCards() {
  const mountNode = document.getElementById('scroll-expand-stats-root');
  if (!mountNode) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <div className="se-section">
        {scrollExpandStatsData.map((card) => (
          <ScrollExpand
            key={card.id}
            title={card.stat}
            scrollHint="Scroll inside the frame to expand"
            useWindowScroll
            enabled={!reduced}
          >
            <StatOverlay card={card} />
          </ScrollExpand>
        ))}
      </div>
    </React.StrictMode>
  );
}

export default ScrollExpand;
