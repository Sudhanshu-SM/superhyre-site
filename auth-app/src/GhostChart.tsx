import { useId } from "react";
import "./ghost.css";

/**
 * A "ghost" of a chart, shown inside its own card when there is nothing to draw yet: a soft, low-contrast
 * picture of the very chart that will appear (stepped funnel, columns, bars, a line, a strip of hours, a
 * donut, table rows), fading out toward the bottom, then the chart's name in a muted voice and one calm line on
 * what will show up here and what to do to get it there.
 *
 * It is drawn in inline SVG from fixed values (the same picture every render) and from the console's own tokens,
 * so the light and the dark theme are the same drawing: the shape fades into whatever the card is, never to a
 * white block. The picture is decoration: the name, the sentence and the action are the text, and they are what
 * a screen reader reads.
 */

export type GhostKind = "funnel" | "bars" | "trend" | "columns" | "heat" | "donut" | "table";

export type GhostAction = { label: string; href: string };

type Props = {
  kind: GhostKind;
  /** The chart's name, muted ("Conversion funnel"). */
  title: string;
  /** One calm sentence: what will appear here, and what to do. */
  line: string;
  action?: GhostAction | null;
  /** A shorter drawing, for a card that sits beside a taller one. */
  compact?: boolean;
};

const W = 480;
const H = 168;

/** A stepped area with rounded shoulders: the funnel's plateaus, left to right. */
export function steppedPath(tops: readonly number[], width: number, floor: number, shoulder: number): { area: string; line: string } {
  const n = tops.length;
  const col = width / n;
  let line = `M0,${tops[0]}`;
  for (let i = 0; i < n; i += 1) {
    const x1 = (i + 1) * col;
    const here = tops[i] as number;
    const next = tops[i + 1];
    if (next === undefined) line += ` L${x1},${here}`;
    else line += ` L${x1 - shoulder},${here} C${x1},${here} ${x1},${next} ${x1 + shoulder},${next}`;
  }
  return { line, area: `M0,${floor} L${line.slice(1)} L${width},${floor} Z` };
}

/** A smooth curve through the points (Catmull-Rom as cubic Béziers), for the line and area ghosts and sparklines. */
export function smoothPath(pts: ReadonlyArray<readonly [number, number]>, clampY?: readonly [number, number]): string {
  const cy = (y: number) => (clampY ? Math.min(clampY[1], Math.max(clampY[0], y)) : y);
  if (pts.length === 0) return "";
  const first = pts[0] as readonly [number, number];
  let d = `M${first[0]},${first[1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)] as readonly [number, number];
    const p1 = pts[i] as readonly [number, number];
    const p2 = pts[i + 1] as readonly [number, number];
    const p3 = pts[Math.min(pts.length - 1, i + 2)] as readonly [number, number];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${cy(c1y).toFixed(1)} ${c2x.toFixed(1)},${cy(c2y).toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function Shapes({ kind }: { kind: GhostKind }): JSX.Element {
  const floor = 150;
  switch (kind) {
    case "funnel": {
      /* Six steps, 100 / 70 / 48 / 30 / 18 / 9 % of the height, rounded risers, a divider between each. */
      const tops = [100, 70, 48, 30, 18, 9].map((p) => floor - (p / 100) * 132);
      const { area, line } = steppedPath(tops, W, floor, 16);
      return (
        <>
          <path className="gh-fill" d={area} />
          <path className="gh-stroke" d={line} />
          {[1, 2, 3, 4, 5].map((i) => <line key={i} className="gh-rule" x1={i * (W / 6)} x2={i * (W / 6)} y1="6" y2={floor} />)}
        </>
      );
    }
    case "columns": {
      const heights = [40, 62, 48, 74, 55, 66];
      return (
        <>
          {[0, 1, 2].map((i) => <line key={i} className="gh-rule" x1="0" x2={W} y1={18 + i * 66} y2={18 + i * 66} />)}
          {heights.map((h, i) => {
            const slot = W / heights.length;
            const hh = (h / 100) * 132;
            return <rect key={h + i} className="gh-fill" x={i * slot + slot / 2 - 11} y={floor - hh} width="22" height={hh} rx="4" />;
          })}
        </>
      );
    }
    case "bars":
      return (
        <>
          {[92, 70, 54, 38, 22].map((w, i) => (
            <g key={w}>
              <rect className="gh-plane" x="0" y={16 + i * 27} width="60" height="9" rx="4.5" />
              <rect className="gh-fill" x="78" y={12 + i * 27} width={(w / 100) * 380} height="17" rx="8.5" />
            </g>
          ))}
        </>
      );
    case "heat": {
      /* One row of 24 hours, a soft band of ink around the working day. */
      const level = (h: number) => Math.max(0, Math.round(3 - Math.abs(h - 11) / 2.6));
      return (
        <>
          {Array.from({ length: 24 }, (_, h) => (
            <rect key={h} className={`gh-fill gh-h${level(h)}`} x={h * (W / 24) + 2} y="52" width={W / 24 - 4} height="52" rx="5" />
          ))}
          {[0, 6, 12, 18].map((h) => <rect key={h} className="gh-plane" x={h * (W / 24) + 2} y="118" width="30" height="7" rx="3.5" />)}
        </>
      );
    }
    case "trend": {
      const pts: Array<readonly [number, number]> = [[0, 108], [80, 92], [160, 100], [240, 60], [320, 76], [400, 40], [480, 54]];
      const curve = smoothPath(pts);
      const second = smoothPath([[0, 128], [80, 120], [160, 124], [240, 108], [320, 114], [400, 98], [480, 104]]);
      return (
        <>
          {[0, 1, 2, 3].map((i) => <line key={i} className="gh-rule" x1="0" x2={W} y1={20 + i * 43} y2={20 + i * 43} />)}
          <path className="gh-fill" d={`${curve} L${W},${floor} L0,${floor} Z`} />
          <path className="gh-stroke" d={curve} />
          <path className="gh-stroke is-dash" d={second} />
        </>
      );
    }
    case "donut": {
      const r = 50;
      const c = 2 * Math.PI * r;
      const parts = [0.46, 0.27, 0.17, 0.1];
      let at = 0;
      return (
        <>
          <g transform="translate(120 82) rotate(-90)">
            {parts.map((p, i) => {
              const len = Math.max(0, p * c - 5);
              const seg = (
                <circle
                  key={p}
                  className={i === 0 ? "gh-ring is-fill" : "gh-ring"}
                  r={r}
                  fill="none"
                  strokeWidth="24"
                  strokeDasharray={`${len.toFixed(1)} ${(c - len).toFixed(1)}`}
                  strokeDashoffset={(-at * c).toFixed(1)}
                />
              );
              at += p;
              return seg;
            })}
          </g>
          {[150, 118, 94, 66].map((w, i) => (
            <g key={w}>
              <circle className={i === 0 ? "gh-fill" : "gh-plane"} cx="244" cy={44 + i * 28} r="6" />
              <rect className="gh-plane" x="262" y={39 + i * 28} width={w} height="10" rx="5" />
            </g>
          ))}
        </>
      );
    }
    case "table":
      return (
        <>
          <rect className="gh-plane" x="0" y="8" width="84" height="8" rx="4" />
          {[228, 306, 384, 452].map((x) => <rect key={x} className="gh-plane" x={x} y="8" width="28" height="8" rx="4" />)}
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <line className="gh-rule" x1="0" x2={W} y1={30 + i * 34} y2={30 + i * 34} />
              <rect className="gh-plane" x="0" y={42 + i * 34} width={128 - (i % 3) * 22} height="11" rx="5.5" />
              <rect className="gh-fill" x="228" y={41 + i * 34} width={30 + ((i * 19) % 44)} height="13" rx="6.5" />
              {[306, 384, 452].map((x, j) => <rect key={x} className="gh-plane" x={x} y={43 + i * 34} width={18 + ((i + j) % 3) * 9} height="10" rx="5" />)}
            </g>
          ))}
        </>
      );
  }
}

export function GhostChart({ kind, title, line, action, compact = false }: Props): JSX.Element {
  const id = useId().replace(/:/g, "");
  return (
    <figure className={`gh gh-${kind}${compact ? " is-compact" : ""}`} data-ghost={kind}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <defs>
          {/* Opaque to 35% of the height (60% for shapes that sit lower), then gone: the picture dissolves into the card. */}
          <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset={kind === "funnel" || kind === "trend" || kind === "donut" ? "0.35" : "0.6"} stopColor="#fff" stopOpacity="1" />
            <stop offset={kind === "funnel" || kind === "trend" || kind === "donut" ? "0.95" : "1"} stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <rect x="0" y="0" width={W} height={H} fill={`url(#${id}-f)`} />
          </mask>
        </defs>
        <g mask={`url(#${id}-m)`}>
          <Shapes kind={kind} />
        </g>
      </svg>
      <figcaption>
        <b className="gh-t">{title}</b>
        <span className="gh-l">{line}</span>
        {action && <a className="gh-a" href={action.href}>{action.label}</a>}
      </figcaption>
    </figure>
  );
}
