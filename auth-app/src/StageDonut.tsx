import { useLayoutEffect, useRef } from "react";
import type { CSSProperties, RefObject } from "react";
import { Sparkle } from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import type { CampaignStage } from "./campaignsData";
import { DONUT_RADIUS, arcsOf, rejectedOf, ringWidth, shortCount, stageHue, stageMuted, stagesLine, totalOf } from "./stageDonut";
import "./stageDonut.css";

/**
 * A small ring of how a campaign's people are spread across its pipeline stages, one arc per stage that has
 * someone in it, coloured by stage (stageDonut.ts says how), the total in the middle. Plain SVG, no chart library.
 *
 * It is one picture with one sentence for a screen reader ("5 people: 3 Shortlisted, 1 Interviewing, 1 Hired").
 * Nobody yet is a calm faint ring and no number. The arcs draw in gently when it first appears, and not at all for
 * someone who asked for less motion (stageDonut.css).
 */

/* The ring is drawn on a 40 by 40 canvas and scaled to `size`; its thickness and the gaps between arcs are set in
   pixels (stageDonut.ts), so a small ring and a large one are the same kind of line. */
const CANVAS = 40;
const C = CANVAS / 2;

export function StageDonut({ stages, size = 40, delay = 0 }: { stages: readonly CampaignStage[]; size?: number; delay?: number }) {
  const total = totalOf(stages);
  const w = ringWidth(size);
  return (
    <span
      className={size >= 72 ? "sd is-lg" : "sd"} role="img" aria-label={stagesLine(stages)} data-empty={total === 0 ? "" : undefined}
      style={{ "--sd": `${size}px` } as CSSProperties}
    >
      <svg viewBox={`0 0 ${CANVAS} ${CANVAS}`} aria-hidden="true" focusable="false">
        <circle className="sd-track" cx={C} cy={C} r={DONUT_RADIUS} strokeWidth={w} pathLength={100} />
        <g transform={`rotate(-90 ${C} ${C})`}>
          {arcsOf(stages, size).map((a, i) => (
            <circle
              key={`${a.id}-${i}`} className="sd-arc" data-hue={a.hue} data-muted={a.muted ? "" : undefined}
              cx={C} cy={C} r={DONUT_RADIUS} strokeWidth={w} pathLength={100} strokeDasharray={`${a.len} ${100 - a.len}`} strokeDashoffset={-a.start}
              style={{ animationDelay: `${delay + i * 80}ms` }}
            />
          ))}
        </g>
      </svg>
      <b className={total > 0 ? "sd-n" : "sd-n is-zero"} style={{ animationDelay: `${delay + 200}ms` }}>
        {/* A large ring with nobody in it is a dotted ring with the brand's spark in it, waiting: never a dead 0. */}
        {total === 0 && size >= 72 ? <Sparkle weight="fill" size={Math.round(size * 0.3)} aria-hidden="true" /> : shortCount(total)}
      </b>
    </span>
  );
}

/**
 * The little card that says it in words: each stage on the board that has someone in it, its name in its colour and the
 * count, then the rejected apart ("5 rejected"); "No one yet" when nobody is; an optional heading above (the client's name, say). It is drawn on the page itself,
 * fixed over the thing it points at and centred on it (a list that clips or scrolls cannot cut it off), under it when
 * there is no room above, and it ignores the pointer so it never gets between a person and the cell. Whoever shows
 * it hides it again on scroll, resize and Escape. Hidden from screen readers: the ring already says all of this.
 */
export function StagePop({ stages, anchor, heading }: { stages: readonly CampaignStage[]; anchor: RefObject<Element | null>; heading?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const pop = ref.current;
    const at = anchor.current;
    if (!pop || !at) return;
    const a = at.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    /* Over the ring when there is room above it (so the name under it stays readable), else under it. */
    const below = a.top < h + 14;
    pop.style.top = `${Math.round(below ? a.bottom + 6 : a.top - h - 6)}px`;
    pop.style.left = `${Math.round(Math.max(8, Math.min(a.left + a.width / 2 - w / 2, window.innerWidth - w - 8)))}px`;
    pop.dataset.side = below ? "below" : "above";
  }, [stages, anchor, heading]);
  const shown = stages.filter((s) => s.count > 0 && s.kind !== "passed");
  const rejected = rejectedOf(stages);
  return createPortal(
    <div ref={ref} className="sd-pop" aria-hidden="true">
      {heading && <small>{heading}</small>}
      {shown.length ? (
        <ul>
          {shown.map((s, i) => (
            <li key={`${s.id}-${i}`}>
              <span className="sd-name" data-hue={stageHue(s, stages.indexOf(s))} data-muted={stageMuted(s) ? "" : undefined}>{s.name}</span>
              <b>{s.count}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p>{rejected > 0 ? "No one on the board" : "No one yet"}</p>
      )}
      {rejected > 0 && <p className="sd-rej">{rejected} rejected</p>}
    </div>,
    document.body,
  );
}
