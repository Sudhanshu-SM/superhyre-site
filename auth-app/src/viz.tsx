import type { Icon } from "@phosphor-icons/react";
import { TrendDown, TrendUp } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Hue } from "./orchestrator";

/**
 * viz — the small representations the bento is built out of.
 *
 * ── WHY THESE EXIST ─────────────────────────────────────────────────────────
 * The first version of the home surface rendered four tiles that each showed a
 * title and a sentence, which is why it read as a wireframe: nothing on the
 * page represented a quantity, a proportion, a direction or a person. A
 * recruiter could not tell from looking whether 61 contacted was good, whether
 * the funnel was narrowing in the wrong place, or who was waiting.
 *
 * So every primitive here answers a question a number alone cannot:
 *
 *   Ring    what fraction of the way through is this
 *   Spark   which direction has it been moving
 *   Delta   by how much, and is that good
 *   Funnel  where does the pipeline actually narrow
 *   Stack   who, as faces rather than a count
 *   Chip    what state is this in
 *   Glyph   what kind of thing is this
 *
 * ── COLOUR RULE ─────────────────────────────────────────────────────────────
 * Every one takes a `hue` and resolves it to the measured --c-* tokens. Hue is
 * never the only carrier of meaning: a Delta ships an arrow as well as a
 * colour, a Chip ships its label, a Funnel ships its counts. Remove colour
 * entirely and all of this still reads, which is the test.
 *
 * ── EACH PRIMITIVE HAS ITS OWN ARRIVAL, AND NONE OF THEM IS THE GLOW ───────
 * The travelling glow belongs to one class of element: a field you are about
 * to type into. Copying it onto cards and numbers would make it mean nothing,
 * which is the trap the research names — an effect reused everywhere stops
 * being a signal and becomes a texture.
 *
 * So the data primitives get a different gesture, and it is the same idea in
 * three forms: **the value reveals itself.** A ring sweeps to its percentage, a
 * spark draws left to right, a number counts to its total. Each animates TO
 * the real datum, once, on mount — so the satisfying part is watching true
 * information arrive rather than watching decoration play. That is the honest
 * version of what the brief asked for; a badge or a streak counter would be
 * the manipulative version.
 *
 * All three are suppressed under `prefers-reduced-motion`, where the value is
 * simply present from the first frame.
 *
 * ── STROKE RULE ─────────────────────────────────────────────────────────────
 * Anything stretched by `preserveAspectRatio="none"` sets
 * `vector-effect="non-scaling-stroke"`, or the stroke is scaled with the box
 * and a 2px line renders as 5px on a wide tile.
 */

/**
 * The one durable contract in this file: how a hue plus a variant becomes a
 * measured CSS custom property. Every primitive below resolves colour through
 * it, so the token naming convention lives in exactly one place — rename
 * `--c-*` and this is the single edit.
 */
/** Read once per mount. Not reactive — a mid-animation OS toggle is not worth
 *  a listener per primitive, and the next mount picks the new value up. */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const tok = (hue: Hue, variant?: "tint" | "line" | "text" | "fill") =>
  `var(--c-${hue}${variant ? `-${variant}` : ""})`;

/* ── glyph: an icon in its category's tinted container ────────────────────── */

export function Glyph({ Icon, hue, size = 30 }: { Icon: Icon; hue: Hue; size?: number }) {
  return (
    <span
      className="vz-glyph"
      style={{
        width: size, height: size,
        background: tok(hue, "tint"), borderColor: tok(hue, "line"), color: tok(hue),
      }}
    >
      <Icon size={Math.round(size * 0.55)} weight="duotone" />
    </span>
  );
}

/* ── ring: a proportion ───────────────────────────────────────────────────── */

/**
 * `pathLength={100}` normalises the circumference so the dash maths is just a
 * percentage. Without it the values depend on the radius, and every change to
 * `size` silently breaks the fill.
 *
 * The numbers are computed here rather than in CSS on purpose: a `calc()` that
 * resolves to a bare number is invalid for `stroke-dasharray`, which fails
 * silently and leaves a full ring.
 */
export function Ring({
  value, max, hue, size = 38, width = 4,
}: { value: number; max: number; hue: Hue; size?: number; width?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const r = (size - width) / 2;
  const arc = useRef<SVGCircleElement>(null);

  /* Sweeps from empty to `pct` on mount. WAAPI rather than a CSS transition
     because `stroke-dasharray` takes a LIST of lengths and a calc resolving to
     a bare number is invalid for it — a trap this file already documents once.
     WAAPI interpolates the two lists directly and cannot silently no-op. */
  useEffect(() => {
    const el = arc.current;
    if (!el || pct <= 0 || prefersReducedMotion()) return;
    const anim = el.animate(
      [{ strokeDasharray: `0 100` }, { strokeDasharray: `${pct} ${100 - pct}` }],
      { duration: 760, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "none" },
    );
    return () => anim.cancel();
  }, [pct]);
  return (
    <span className="vz-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={tok(hue, "line")} strokeWidth={width}
        />
        <circle
          ref={arc}
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={tok(hue)} strokeWidth={width} strokeLinecap="round"
          pathLength={100} strokeDasharray={`${pct} ${100 - pct}`}
          /* -90deg so it starts at twelve o'clock, which is the only start
             position that reads as progress rather than a pie slice. */
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="vz-ring-n" style={{ color: tok(hue, "text") }}>{Math.round(pct)}%</span>
    </span>
  );
}

/* ── spark: a direction ───────────────────────────────────────────────────── */

export function Spark({
  data, hue, w = 100, h = 26, fill = true,
}: { data: readonly number[]; hue: Hue; w?: number; h?: number; fill?: boolean }) {
  const line = useRef<SVGPathElement>(null);

  /* Draws left to right on mount. `pathLength={1}` on the path means the dash
     values are fractions, so this works for a 7-point series and a 60-point
     one without measuring `getTotalLength()`. */
  useEffect(() => {
    const el = line.current;
    if (!el || prefersReducedMotion()) return;
    const anim = el.animate(
      [{ strokeDasharray: "1 1", strokeDashoffset: 1 },
       { strokeDasharray: "1 1", strokeDashoffset: 0 }],
      { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "none" },
    );
    return () => anim.cancel();
  }, [data]);

  /* Hooks must run before the early return, or a series that starts short and
     grows changes the hook count between renders and React throws. */
  if (data.length < 2) return null;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  /* A flat series would divide by zero and collapse to the baseline; giving it
     a span of 1 puts it up the middle instead, which is the truthful shape. */
  const span = hi - lo || 1;
  const pad = 2;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (h - pad * 2);
  const d = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  return (
    <svg
      className="vz-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      aria-hidden="true"
    >
      {fill && (
        <path
          d={`${d} L${w} ${h} L0 ${h} Z`} fill={tok(hue, "tint")} stroke="none"
        />
      )}
      <path
        ref={line}
        d={d} fill="none" stroke={tok(hue)} strokeWidth={1.75}
        strokeLinecap="round" strokeLinejoin="round"
        vector-effect="non-scaling-stroke"
        pathLength={1}
      />
    </svg>
  );
}

/* ── delta: a signed change ───────────────────────────────────────────────── */

/**
 * `invert` is for metrics where down is good. Without it a falling
 * time-to-hire would render red, which is the opposite of the truth — the
 * commonest way a dashboard lies without anyone editing a number.
 */
export function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  if (value === 0) {
    return <span className="vz-delta is-flat">No change</span>;
  }
  const good = invert ? value < 0 : value > 0;
  const hue: Hue = good ? "sage" : "rose";
  const Arrow = value > 0 ? TrendUp : TrendDown;
  return (
    <span
      className="vz-delta"
      style={{ background: tok(hue, "tint"), borderColor: tok(hue, "line"), color: tok(hue, "text") }}
    >
      <Arrow size={11} weight="bold" />
      {value > 0 ? "+" : ""}{value}
    </span>
  );
}

/* ── funnel: where it narrows ─────────────────────────────────────────────── */

export function Funnel({
  stages,
}: {
  /** Each stage brings its own hue — see `Stage.hue` for why it is per-stage. */
  stages: readonly { id: string; label: string; count: number; hue: Hue }[];
}) {
  const top = Math.max(...stages.map((s) => s.count)) || 1;
  return (
    <ul className="vz-funnel">
      {stages.map((s) => {
        const pct = (s.count / top) * 100;
        /* ── NO FADE, AND THAT WAS A CONTRAST FIX ──
           Bars used to fade toward their tint by 14% per step, for "depth".
           Measured, that put bars 2-5 at 2.96 / 2.50 / 2.12 / 1.82:1 on white
           — under the 3:1 a data mark owes — and it was unfixable by tuning,
           because the undiluted mark is itself only ~3.3:1, so ANY dilution
           fails. Depth is carried by the bar WIDTHS, which are the datum.

           ── AND NOT A STACKED BAR ──
           A single segmented bar would be far shorter, and it is wrong: 148
           sourced already CONTAINS the 24 shortlisted, so the five counts are
           nested rather than parts of a whole. Stacking them would draw a
           total that does not exist. Five bars against a shared maximum is
           the honest shape; the height came out of the tile's chrome instead. */
        return (
          <li key={s.id} className="vz-funnel-row">
            <span className="vz-funnel-label">{s.label}</span>
            <span className="vz-funnel-track" style={{ background: tok(s.hue, "tint") }}>
              <span
                className="vz-funnel-bar"
                style={{ width: `${pct}%`, background: tok(s.hue) }}
              />
            </span>
            <span className="vz-funnel-n">{s.count}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── stack: who, as faces ─────────────────────────────────────────────────── */

export function Stack({
  people, max = 4, size = 26,
}: {
  people: readonly { id: string; initial: string; name: string; hue: Hue }[];
  max?: number; size?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="vz-stack" style={{ ["--vz-av" as string]: `${size}px` }}>
      {/* Neutral, deliberately. These carried one hue per person, which meant
          four people rendered as four different colours — eight saturated
          spots for information the initials already carry. That is the colour
          budget's own test failing: a hue every sibling has encodes nothing.
          Identity is not a status, and only status earns the palette.

          `hue` stays on the type because callers use it for the Dot beside a
          name, where it marks a genuine exception. */}
      {shown.map((p) => (
        <span key={p.id} className="vz-av" title={p.name}>
          {p.initial}
        </span>
      ))}
      {rest > 0 && <span className="vz-av is-rest">+{rest}</span>}
    </span>
  );
}

/* ── chip: a state ───────────────────────────────────────────────────────── */

export function Chip({
  label, hue, Icon, solid = false,
}: { label: string; hue: Hue; Icon?: Icon; solid?: boolean }) {
  return (
    <span
      className={`vz-chip${solid ? " is-solid" : ""}`}
      style={
        solid
          ? { background: tok(hue, "fill"), borderColor: tok(hue, "fill"), color: "#fff" }
          : { background: tok(hue, "tint"), borderColor: tok(hue, "line"), color: tok(hue, "text") }
      }
    >
      {Icon && <Icon size={11} weight="bold" />}
      {label}
    </span>
  );
}

/* ── dot: the smallest state marker ──────────────────────────────────────── */

export function Dot({ hue, pulse = false }: { hue: Hue; pulse?: boolean }) {
  return (
    <span
      className={`vz-dot${pulse ? " is-pulse" : ""}`}
      style={{ background: tok(hue) }}
      aria-hidden="true"
    />
  );
}

/* ── counter: a number arriving at its value ─────────────────────────────── */

/**
 * Counts from 0 to `value` on mount.
 *
 * Honest for the same reason the ring and the spark are: it animates to the
 * real figure and lands on it. What it must never do is imply live
 * recalculation — it runs once, on mount, and never again for the same value.
 *
 * `font-variant-numeric: tabular-nums` on the host is REQUIRED, and the caller
 * owns that. Without it every intermediate value has a different width and the
 * whole row jitters for the duration — which is the failure that makes most
 * count-ups feel cheap rather than satisfying.
 */
export function Counter({ value, ms = 900 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));

  useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); return; }
    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / ms);
      /* Ease-out cubic: fast at the start, settling at the end. A linear count
         reads as a loading bar; the deceleration is what makes it read as
         landing on a figure. */
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  /* The accessible value is the FINAL one from the first frame. A screen
     reader announcing "0, 3, 17, 24" would be actively worse than no
     animation, so the live text is hidden and the real number is exposed. */
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </>
  );
}

/* ── the sourced-per-day chart ────────────────────────────────────────────── */

/**
 * A nice axis maximum at or above the peak.
 *
 * Rounding up to a multiple of FOUR rather than the usual five or ten, because
 * the axis gets three lines — nothing, half, full — and a multiple of four is
 * the smallest step that keeps the midpoint a whole number at every scale this
 * chart sees. 21 becomes 24 and the midline reads 12; a multiple of five would
 * make it 25 and the midline 12.5, and half a candidate is not a quantity.
 *
 * It also bounds the headroom to at most 3 units above the peak, so the curve
 * still fills its box instead of cowering under a generous round number.
 */
const niceTop = (hi: number) => Math.max(4, Math.ceil(hi / 4) * 4);

/**
 * Candidates sourced per day: an area curve with a labelled scale.
 *
 * ── NOTHING HERE IS MEASURED, AND THAT IS THE DESIGN ────────────────────────
 * Every coordinate is a PERCENTAGE, so the chart has no idea how wide it is and
 * never needs to find out. Two earlier versions did need to, and both broke:
 *
 *   v1 stretched a 340×104 viewBox with CSS. Fine for a bare curve; wrong once
 *      there was type in it. Glyphs scale with the box, so an 11px axis label
 *      rendered near 19px and CHANGED SIZE when the sidebar collapsed. Filling
 *      a box of another aspect also needs preserveAspectRatio="none", under
 *      which a circle is drawn as an ellipse — the markers squashed.
 *
 *   v2 measured the container with a ResizeObserver and drew at 1:1. Correct in
 *      principle, and it failed twice in practice. The SVG carried a pixel
 *      width attribute, which gave it intrinsic width, which propped its own
 *      container open — so the box never reported shrinking and the chart
 *      ratcheted permanently wider on every sidebar expansion. And once that
 *      was fixed by taking the SVG out of flow, the observer turned out not to
 *      deliver callbacks at all in a headless browser: a freshly constructed
 *      ResizeObserver on the same node reported nothing within 700ms, so the
 *      chart simply never appeared. A component that renders nothing until an
 *      async callback arrives has made its own existence conditional on a
 *      callback it cannot guarantee.
 *
 * So: the SVG holds ONLY the fill and the curve, in a 0–100 square stretched by
 * `preserveAspectRatio="none"` — safe, because a path has no glyphs to distort
 * and `vector-effect="non-scaling-stroke"` holds the line at 2.5px regardless.
 * Everything that must not distort — the labels, the gridlines, the round
 * markers — is HTML positioned in percent. Text keeps its real size, circles
 * stay circular, and the whole thing re-lays-out at any width with no
 * JavaScript involved.
 */
export function Area({
  data, hue, h = 104,
}: {
  data: readonly { day: string; n: number }[];
  hue: Hue;
  h?: number;
}) {
  if (data.length < 2) return null;

  const hi = Math.max(...data.map((d) => d.n));
  const top = niceTop(hi);

  /* Percent, not pixels. The SVG's own 0–100 viewBox uses the same numbers,
     which is why one pair of functions serves both the path and the markers. */
  const px = (i: number) => (i / (data.length - 1)) * 100;
  const py = (n: number) => (1 - n / top) * 100;

  const pts = data.map((d, i) => ({ x: px(i), y: py(d.n), n: d.n, day: d.day, i }));

  /* Tension 0.5 is the standard Catmull-Rom weighting. Anything higher starts
     bowing the curve past its own data points, which on a count that bottoms
     out at 2 over a weekend means drawing candidates that were never sourced.

     Computed in the 0–100 square and then stretched: the horizontal skew that
     introduces changes the tangents, never the knots, so the curve still
     passes exactly through every day's value. */
  const T = 0.5;
  let path = `M${pts[0]!.x.toFixed(3)} ${pts[0]!.y.toFixed(3)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * T;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * T;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * T;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * T;
    path += ` C${c1x.toFixed(3)} ${c1y.toFixed(3)}, ${c2x.toFixed(3)} ${c2y.toFixed(3)}, ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`;
  }

  /* The anchors. A Map because the last point is often also the high or the
     low, and drawing a marker twice at one coordinate doubles its alpha. */
  const peak = pts.reduce((a, b) => (b.n > a.n ? b : a));
  const trough = pts.reduce((a, b) => (b.n < a.n ? b : a));
  const last = pts[pts.length - 1]!;
  const marks = [...new Map([peak, trough, last].map((p) => [p.i, p])).values()];

  /* Top down, because that is the order they are stacked in the axis column.
     Three lines — nothing, half, full. A line per unit would out-ink the curve
     it is there to help read. */
  const ticks = [top, top / 2, 0];

  /* FOUR date labels, evenly spaced and including both ends. Fourteen would
     collide at any width this card has; the guidance is that labels go where
     they carry meaning, and for a date axis that is the range and its interior
     rhythm rather than every tick. */
  const xlabs = [...new Map(
    [0, 1, 2, 3]
      .map((k) => Math.round((k * (data.length - 1)) / 3))
      .map((i) => [i, data[i]?.day ?? ""] as const)
      .filter(([, day]) => day !== ""),
  ).entries()];

  const gid = `area-${hue}`;

  return (
    <div
      className="vz-chart"
      style={{ height: h }}
      role="img"
      aria-label={
        `Candidates sourced per day, ${data[0]!.day} to ${last.day}. `
        + `Scale 0 to ${top}. High ${peak.n} on ${peak.day}, `
        + `low ${trough.n} on ${trough.day}, latest ${last.n} on ${last.day}.`
      }
    >
      <div className="vz-yaxis">
        {ticks.map((t) => <span key={t} className="vz-ax">{t}</span>)}
      </div>

      <div className="vz-plot">
        {ticks.map((t) => (
          <span
            key={t}
            className={`vz-grid${t === 0 ? " is-base" : ""}`}
            style={{ top: `${py(t)}%` }}
          />
        ))}

        {/* aria-hidden: the wrapper already carries the whole description, and
            a second announcement of the same figure is noise. */}
        <svg
          className="vz-area"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            {/* Fades to nothing rather than stopping at a hard edge, so the
                area reads as depth under the line, not a filled block. */}
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tok(hue)} stopOpacity="0.20" />
              <stop offset="100%" stopColor={tok(hue)} stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={`${path} L100 100 L0 100 Z`} fill={`url(#${gid})`} stroke="none" />

          {/* Pale, on purpose: it carries the shape, the markers carry the
              facts. non-scaling-stroke is what keeps it 2.5px in a box that is
              being stretched ~6:1 horizontally. */}
          <path
            d={path}
            fill="none"
            stroke={tok(hue, "line")}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* HTML, not <circle>, so they stay round in a stretched box. The ring
            is the card's own colour, so a marker on the line reads as sitting
            on top of it rather than merged into it. */}
        {marks.map((p) => (
          <span
            key={p.i}
            className="vz-mark"
            style={{ left: `${p.x}%`, top: `${p.y}%`, background: tok(hue) }}
          />
        ))}
      </div>

      <div className="vz-xaxis">
        {xlabs.map(([i, day]) => (
          <span key={i} className="vz-ax" style={{ left: `${px(i)}%` }}>{day}</span>
        ))}
      </div>
    </div>
  );
}
