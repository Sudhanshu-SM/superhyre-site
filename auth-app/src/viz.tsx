import type { Icon } from "@phosphor-icons/react";
import { TrendDown, TrendUp } from "@phosphor-icons/react";
import type { MouseEvent, ReactNode } from "react";
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
  value, max, hue, size = 38, width = 4, color, track,
}: {
  value: number; max: number; hue: Hue; size?: number; width?: number;
  /**
   * Overrides the ARC colour only — the label keeps its hue token.
   *
   * Exists because the conversion card draws three rings that must differ
   * from each other while staying one family. Passing three different `hue`s
   * would have changed the label colour three times too, which is three
   * colours where the intent was one colour at three steps. The label
   * deliberately does NOT follow: the lighter steps of a tint ramp sit under
   * the 4.5:1 body floor, and the number inside the ring is text, not a data
   * mark.
   */
  color?: string;
  /**
   * Overrides the TRACK colour.
   *
   * Measured, not cosmetic. An arc has to be legible against the track it
   * sits on, and the hue's own `line` token is a mid tint — `--accent` on
   * `--c-brand-line` is only 2.39:1, so a ring in the brand family had the
   * WORST arc/track separation of any hue while looking the heaviest. Handing
   * the track down to the much paler `--accent-tint` lifts the same arc to
   * 3.02:1. Lightening the track is what buys the arcs room to be tints
   * rather than burnt shades: the contrast that decides whether you can see
   * where the arc ends is arc-against-track, not arc-against-card.
   */
  track?: string;
}) {
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
          stroke={track ?? tok(hue, "line")} strokeWidth={width}
        />
        <circle
          ref={arc}
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color ?? tok(hue)} strokeWidth={width} strokeLinecap="round"
          pathLength={100} strokeDasharray={`${pct} ${100 - pct}`}
          /* -90deg so it starts at twelve o'clock, which is the only start
             position that reads as progress rather than a pie slice. */
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {/* Proportional, not fixed: this primitive was unused everywhere until
          the conversion card asked for it at 76px, double the 38px default,
          and a font sized for the small ring would sit lost in the middle of
          the bigger one. 0.24 of size keeps the centred number reading as
          "the ring's own label" at any size the caller picks, rather than a
          fixed value that only happened to look right at 38px. */}
      <span
        className="vz-ring-n"
        style={{ color: tok(hue, "text"), fontSize: Math.round(size * 0.24) }}
      >
        {Math.round(pct)}%
      </span>
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
        vectorEffect="non-scaling-stroke"
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

/* ── funnel: where it narrows ───────────────────────────────────────────────

   ── THE SHAPE LOOKED BROKEN BECAUSE THE SEQUENCE WAS NOT ONE ──
   Three visual passes failed on this card before the real fault turned up in
   the data shape. `stepsFor` denominates Shortlisted against SOURCED and
   Contacted against SOURCED — two parallel judgements over one pool, not one
   stage feeding the next. Drawing them as consecutive needed a
   reorder-by-count hack and still produced a step in the middle: a funnel
   whose second segment is wider than its first is not a funnel.

   The honest chain is the one the denominators already describe, and every
   stage in it is a strict subset of the one before:

       Sourced 148  ->  Contacted 61  ->  Replied 17  ->  Interviews 6
                        (of sourced)      (of contacted)  (of replied)

   ── THE LAYOUT IS THE REFERENCE'S, THE COLOUR IS OURS ──
   Built against a supplied reference, which gets three things right that the
   previous version had backwards:

     LABELS AND COUNTS GO ON TOP. They were underneath, which put the reading
     order the wrong way round — you met an unexplained shape and then found
     out what it was. Name first, shape second: the numbers are the fact and
     the ribbon is the illustration of it.

     THE PERCENTAGES FLOAT ABOVE THE EDGE. Each stage's conversion sits at the
     top of its own column, in the white space the descending top edge opens
     up. Nothing overlaps, because the first stage — the only one whose shape
     reaches the top of the box — is also the only one with no percentage to
     print: it is the pool everything else is measured against, so "100% of
     itself" would be noise. The geometry and the omission fit each other
     exactly.

     THIN DIVIDERS, NOT SEAMS. One hairline per boundary, running the full
     height of the plot and continuing up through the header row, so the
     columns read as columns. The ribbon underneath stays completely unbroken;
     the divider is drawn over it rather than cut out of it.

   The gradient is cool -> pale -> warm rather than four separate hues, which
   is the reference's move and a better one: a single sweep through a light
   midpoint reads as one object, and it puts the brand's own orange at the
   END, on the stage that is actually the win. Four saturated hues is what
   made every earlier version read as a default chart. Warm-at-the-finish also
   resolves a tension the earlier note got wrong — the accent is not "spoken
   for" by the rings above, it is the colour this product means to arrive at,
   and a funnel that warms as it converges says that.                        */
export function Funnel({
  stages,
}: {
  /** Display order left to right, widest first. Each stage's `of` is the
   *  stage it is denominated against — see the chain above. */
  stages: readonly { id: string; label: string; n: number; of: number }[];
}) {
  if (stages.length < 2) return null;

  const top = stages[0]!.n || 1;
  /* ── EXACT, AND IT WAS NOT ──
     This floored every stage at 9% of the box "for legibility", which made
     the last one a lie: 6 of 148 is 4.05%, and rendering it at 9% drew it
     2.22x taller than the data. The other three were exact, so the chart was
     right about three quarters of itself and silently wrong about the number
     a funnel exists to show — the one at the bottom.

     The floor is now 1.5%, which only keeps a genuinely EMPTY stage from
     vanishing to nothing rather than reshaping a real one. Interviews draws
     at 3.4px of an 84px box, and a 4% conversion SHOULD look like a thin
     spout; that is the story. Legibility is the printed count's job, which is
     why the count sits in the header above it. */
  const halfOf = (n: number) => Math.max(1.5, Math.min(100, (n / top) * 100)) / 2;
  const colW = 100 / stages.length;

  /* One boundary per segment edge, plus a final one equal to the last so the
     funnel closes flat — a spout, not a fabricated point tapering to zero. */
  const bounds = [
    ...stages.map((s) => halfOf(s.n)),
    halfOf(stages[stages.length - 1]!.n),
  ];

  const smooth = (pts: readonly { x: number; y: number }[]) => {
    const T = 0.5;
    let d = `M${pts[0]!.x.toFixed(3)} ${pts[0]!.y.toFixed(3)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1.x + ((p2.x - p0.x) / 6) * T;
      const c1y = p1.y + ((p2.y - p0.y) / 6) * T;
      const c2x = p2.x - ((p3.x - p1.x) / 6) * T;
      const c2y = p2.y - ((p3.y - p1.y) / 6) * T;
      d += ` C${c1x.toFixed(3)} ${c1y.toFixed(3)}, ${c2x.toFixed(3)} ${c2y.toFixed(3)},`
        + ` ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`;
    }
    return d;
  };

  const xAt = (i: number) => Math.min(100, i * colW);

  /* ── THE WIGGLE, AND WHY IT CANNOT TOUCH A KNOT ──
     Fixed offsets, not random: a value that changes every render is not a
     shape, it is a flicker, and it would also shift under React's
     re-rendering on every scope change.

     They are applied ONLY at segment midpoints — never at a boundary, where
     the height IS the datum. The edge still passes exactly through every
     stage's true proportion; it just does not travel between them in a
     straight line. Same principle as the Sourced curve: knots exact,
     tangents interpolated.

     Top and bottom carry different offsets on purpose. Mirrored values would
     make the ribbon breathe symmetrically, which still reads as machined;
     letting the centre line drift a little is what makes it read as poured.
     Magnitudes are ~2 units of 100 — under 2px at this height, which is the
     line between "natural" and "wobbly". */
  const WIG_TOP = [1.7, -2.0, 1.1, -1.4, 0.8];
  const WIG_BOT = [-1.8, 1.3, -1.6, 1.2, -0.7];

  const edge = (sign: 1 | -1, wig: readonly number[]) => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < bounds.length; i++) {
      pts.push({ x: xAt(i), y: 50 + sign * bounds[i]! });
      if (i < bounds.length - 1) {
        const midHalf = (bounds[i]! + bounds[i + 1]!) / 2;
        pts.push({
          x: (xAt(i) + xAt(i + 1)) / 2,
          /* Added to y directly rather than to the half-height, so a positive
             offset always means "lower" for both edges and the two drift
             independently instead of pinching in unison. */
          y: 50 + sign * midHalf + (wig[i] ?? 0),
        });
      }
    }
    return pts;
  };

  const topPts = edge(-1, WIG_TOP);
  const botPts = edge(1, WIG_BOT);
  const d = `${smooth(topPts)} ${smooth([...botPts].reverse()).replace(/^M/, "L")} Z`;

  return (
    <div className="vz-funnel-wrap">
      <ul className="vz-funnel-head">
        {stages.map((s) => (
          <li key={s.id} className="vz-funnel-hcell">
            <span className="vz-funnel-item-label">{s.label}</span>
            <span className="vz-funnel-item-n">{s.n}</span>
          </li>
        ))}
      </ul>

      <div className="vz-funnel-plot">
        <svg
          className="vz-funnel-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            {/* Horizontal: one sweep, cool to warm through a pale middle. The
                pale midpoint is what stops this reading as a stack of
                coloured blocks — the eye follows one object changing
                temperature rather than four objects abutting. */}
            <linearGradient id="fn-ribbon" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--c-blue)" />
              <stop offset="34%" stopColor="#c3d4ea" />
              <stop offset="58%" stopColor="#f2ddcb" />
              <stop offset="82%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--accent)" />
            </linearGradient>

            {/* Vertical: the light. Painted over the SAME path because one
                gradient cannot run two axes. The middle stop is fully
                transparent, so the hue underneath stays exactly itself
                through the body and only the edges are shaped by light. */}
            <linearGradient id="fn-sheen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.30" />
              <stop offset="48%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="100%" stopColor="#3a2317" stopOpacity="0.14" />
            </linearGradient>
          </defs>

          <path className="vz-funnel-band" d={d} fill="url(#fn-ribbon)" />
          <path className="vz-funnel-sheen" d={d} fill="url(#fn-sheen)" />
        </svg>

        {/* Overlaid on the plot rather than stacked above it, so the dividers
            run the full height of the ribbon and the percentages sit in the
            air the descending edge opens up. */}
        <ul className="vz-funnel-pcts">
          {stages.map((s, i) => (
            <li key={s.id} className="vz-funnel-pcell">
              {i > 0 && (
                <span className="vz-funnel-pct">
                  {s.of > 0 ? Math.round((s.n / s.of) * 100) : 0}%
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
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
  data, hue, h = 104, labels = 4, noun = "", accent, total,
}: {
  data: readonly { day: string; n: number }[];
  /** Drives the PANEL and the GRIDLINES — the chart's furniture. */
  hue: Hue;
  h?: number;
  /** How many x-axis date labels to show, evenly spaced including both ends. */
  labels?: number;
  /** What one unit is, for the hover readout. Omitted, the tooltip prints the
   *  bare number rather than inventing a word for it. */
  noun?: string;
  /**
   * The CURVE's colour — line, fill and markers. Separate from `hue` because
   * the furniture and the data want opposite ends of the same family: the
   * panel has to stay pale enough to sit under everything, and the line has to
   * be dark enough to read on top of it. One token cannot be both, and using
   * the hue's base for the line is what left the old curve looking washed out
   * against its own panel. Defaults to the hue, so callers that do not care
   * are unaffected.
   */
  accent?: string;
  /**
   * The series total, rendered as a card INSIDE the panel's top-right.
   *
   * A node rather than a number, so the caller keeps ownership of how it is
   * composed — `Counter` has to stay on the calling side or the count-up
   * animation would have to be reimplemented in here.
   *
   * It lives inside the plot because that is what it is the total OF. It was
   * previously a 32px number stacked above the chart in the card header,
   * which cost a whole row (measured: the panel sat 74px from the card's top
   * edge against 17px on the right) and gave the figure no container — a big
   * number floating in white space reads as a leftover, not as a summary.
   */
  total?: ReactNode;
}) {
  /* Before the early return, so the hook count never changes between renders
     of the same component. */
  const [hover, setHover] = useState<number | null>(null);

  if (data.length < 2) return null;

  const ink = accent ?? tok(hue);
  const hi = Math.max(...data.map((d) => d.n));
  const top = niceTop(hi);

  /* ── THE BOX, AND WHY IT IS FOUR BOXES ──
     The previous version had the value labels in a 22px gutter and the plot
     starting at 31px, with both pinned to the same top and bottom. That put
     the topmost label centred ON the panel's own top edge — it read as
     floating outside the chart — and left the curve touching the panel's
     edges with no air at all.

     So the panel, the data area, the value gutter and the date row are now
     four separately-positioned boxes:

       GX  the value gutter's width. The labels live entirely to the LEFT of
           the panel, which is what makes them read as a scale for it rather
           than as text inside it.
       PT  air between the panel's top edge and the highest the curve can go.
       PB  the same at the bottom. Without these the line's own stroke width
           clips against the panel's rounded corners.
       XH  the date row, below the panel entirely. */
  /* 34, not 42. The widest label this scale produces is two digits, and the
     gutter was sized for room it never used — which pushed the panel's left
     inset to 59px against 17px on the right. An axis gutter is always wider
     than the opposite margin, but not three times wider. */
  const GX = 34;
  /* 30, up from 24. The dates were centred in a 24px row, which left their
     glyph tops about 6px under the panel — close enough that they read as
     hanging off the chart rather than labelling it. The extra 6px buys the
     row real separation without moving the panel's other three edges. */
  const XH = 30;
  const PT = 18;
  const PB = 14;
  const plotH = h - PT - XH - PB;

  const px = (i: number) => (i / (data.length - 1)) * 100;
  const py = (n: number) => (1 - n / top) * 100;
  /* Percent within the data area -> pixels from the chart's top, for the
     things positioned against the whole chart rather than inside the plot. */
  const yPx = (pctDown: number) => PT + (pctDown / 100) * plotH;

  const pts = data.map((d, i) => ({ x: px(i), y: py(d.n), n: d.n, day: d.day, i }));

  /* Tension 0.5 is the standard Catmull-Rom weighting. Anything higher starts
     bowing the curve past its own data points, which on a count that bottoms
     out at 2 over a weekend means drawing candidates that were never sourced. */
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

  const peak = pts.reduce((a, b) => (b.n > a.n ? b : a));
  const trough = pts.reduce((a, b) => (b.n < a.n ? b : a));
  const last = pts[pts.length - 1]!;
  const marks = [...new Map([peak, trough, last].map((p) => [p.i, p])).values()];

  /* FIVE ticks, up from three, and DASHED RULES ARE BACK.
     Removing them last pass went too far: a panel tells you where the chart
     is, but it cannot tell you what a height MEANS, so three floating numbers
     on the left were a scale with nothing to measure against. The reference
     carries both — a tinted panel AND faint dashed rules — and it is right.
     Dashed rather than solid because a dash reads as a reference line and a
     solid line reads as data; there is already one solid line in here.

     Five works because niceTop always lands on a multiple of four, so every
     quarter is a whole number at every scale this chart sees: 24 -> 0/6/12/
     18/24, and scoped to one campaign 8 -> 0/2/4/6/8. */
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f)).reverse();

  const xlabs = [...new Map(
    Array.from({ length: labels }, (_, k) => k)
      .map((k) => Math.round((k * (data.length - 1)) / (labels - 1)))
      .map((i) => [i, data[i]?.day ?? ""] as const)
      .filter(([, day]) => day !== ""),
  ).entries()];

  const gid = `area-${hue}`;
  const hovered = hover === null ? null : pts[hover] ?? null;
  /* Maps a data-area x percentage onto the whole chart's width, since the
     guide and the readout are positioned against the chart, not the plot. */
  const atX = (xPct: number) => `calc(${GX}px + (100% - ${GX}px) * ${xPct / 100})`;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    const rel = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1)))));
  };

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
      <span
        className="vz-panel"
        style={{ left: GX, bottom: XH, background: tok(hue, "tint") }}
      />

      {ticks.map((t) => (
        <span
          key={t}
          className="vz-grid"
          style={{
            left: GX,
            top: yPx(py(t)),
            backgroundImage:
              `repeating-linear-gradient(to right, ${tok(hue, "line")} 0 4px, transparent 4px 10px)`,
          }}
        />
      ))}

      {/* Vertical rules at the labelled dates, so a reading can be traced down
          to its own day rather than eyeballed across. Same dash and the same
          --line token as the horizontal set: these are one grid seen in two
          directions, and giving either axis more weight would imply one
          matters more.

          The first and last are skipped. Their x lands exactly on the panel's
          own left and right edges, where a dashed rule reads as a broken
          border rather than as part of the grid. */}
      {xlabs.map(([i]) => (
        i === 0 || i === data.length - 1 ? null : (
          <span
            key={`v${i}`}
            className="vz-vgrid"
            style={{
              left: atX(px(i)),
              bottom: XH,
              backgroundImage:
                `repeating-linear-gradient(to bottom, ${tok(hue, "line")} 0 4px, transparent 4px 10px)`,
            }}
          />
        )
      ))}

      {/* Entirely left of the panel, each label centred on its own rule. */}
      {ticks.map((t) => (
        <span
          key={t}
          className="vz-ax is-y"
          style={{ width: GX - 12, top: yPx(py(t)) }}
        >
          {t}
        </span>
      ))}

      <div
        className="vz-plot"
        style={{ left: GX, top: PT, bottom: XH + PB }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          className="vz-area"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ink} stopOpacity="0.30" />
              <stop offset="45%" stopColor={ink} stopOpacity="0.12" />
              <stop offset="100%" stopColor={ink} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          <path d={`${path} L100 100 L0 100 Z`} fill={`url(#${gid})`} stroke="none" />

          {/* non-scaling-stroke keeps it 3px in a box stretched ~6:1
              horizontally — without it the line would be six times thicker
              across than it is down. */}
          <path
            d={path}
            fill="none"
            stroke={ink}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Hidden while hovering: two kinds of marker on one curve at once
            reads as two datasets. */}
        {!hovered && marks.map((p) => (
          <span
            key={p.i}
            className={`vz-mark${p.i === last.i ? " is-last" : ""}`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, background: ink }}
          />
        ))}

        {hovered && (
          <span
            className="vz-hov"
            style={{ left: `${hovered.x}%`, top: `${hovered.y}%`, background: ink }}
          />
        )}
      </div>

      {/* Spans the PANEL's full height rather than dropping from the point,
          which is what ties the readout to the date beneath it. Positioned
          against the chart so it can cross the plot's padding. */}
      {hovered && (
        <span
          className="vz-guide"
          style={{
            left: atX(hovered.x),
            bottom: XH,
            /* The hover guide takes the DATA's colour, not the grid's. With
               static vertical rules now on the chart, a guide in --line would
               be a fourth identical dashed line and the reader would have to
               work out which one was following the cursor. */
            backgroundImage:
              `repeating-linear-gradient(to bottom, ${ink} 0 4px, transparent 4px 9px)`,
          }}
        />
      )}

      {hovered && (
        <div
          className="vz-tip"
          style={{ left: atX(hovered.x), top: yPx(hovered.y) - 50 }}
          aria-hidden="true"
        >
          <span className="vz-tip-n" style={{ color: ink }}>
            {hovered.n}{noun ? ` ${noun}` : ""}
          </span>
          <span className="vz-tip-d">{hovered.day}</span>
        </div>
      )}

      {/* Hidden while hovering, and that is the whole interaction: at rest
          the chart states its total, and under the cursor it states one day.
          Two figures visible at once would be two answers to one question —
          and the readout tracks the pointer, so at the right-hand end of the
          series it would collide with this anyway. */}
      {total && !hovered && (
        <div className="vz-total" aria-hidden="true">{total}</div>
      )}

      <div className="vz-xaxis" style={{ left: GX, height: XH }}>
        {xlabs.map(([i, day]) => (
          <span key={i} className="vz-ax" style={{ left: `${px(i)}%` }}>{day}</span>
        ))}
      </div>
    </div>
  );
}
