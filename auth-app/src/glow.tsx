/**
 * The travelling border glow.
 *
 * ── WHY THIS IS NOW SHARED ──────────────────────────────────────────────────
 * It was local to `Nav.tsx`, lighting the quick-find field and the switcher's
 * search field. That was the whole problem: the glow had become a *feature of
 * one component* rather than the product's answer to "this is a field you are
 * about to type into". The composer — the single most important input on the
 * surface — did not have it, and a reviewer noticed the absence before
 * noticing anything else.
 *
 * Interaction consistency is the point. A surface where one field glows and
 * the next does not has no rhythm; the user cannot learn what the light means,
 * so it reads as decoration on a favourite element rather than as a signal.
 * The rule is now: **every field the user is about to type into gets this, and
 * nothing else does.**
 *
 * ── HOW IT WORKS ────────────────────────────────────────────────────────────
 * Sixteen nested dashes on one rect, swept by `stroke-dashoffset`. The falloff
 * is sampled from a curve rather than hand-tuned in three steps, because a
 * dash cannot fade toward its own ends — so the softness has to be built out
 * of many ends close together.
 *
 * Geometry, the dash maths and the sweep keyframe live in `access.css` under
 * `.glow-ring`; only the per-layer falloff is here. Two traps are documented
 * there and both cost a session: a `calc()` resolving to a bare number is
 * invalid for `stroke-dasharray`, and centring by per-frame `calc()` over an
 * inherited variable drifts out of phase (the fix is a negative
 * `animation-delay`).
 *
 * ── HOSTS ───────────────────────────────────────────────────────────────────
 * A host needs `position: relative`, and must opt its own ring in via an
 * opacity rule (see the `.glow-ring` trigger list in `access.css`). A host
 * whose radius is not a pill sets `--glow-ry` to its own radius less half its
 * border width, since the stroke rides the border's centreline.
 */

const GLOW_LAYERS = Array.from({ length: 16 }, (_, i) => {
  const t = i / 15; // 0 = outermost and faintest, 1 = the core
  return {
    /** Dash length, in the normalised pathLength=100 units. */
    len: +(26 - 17 * t).toFixed(2),
    /* Thinned twice on review, both times because it read as thick rather than
       as light: widths began at 7px and the peak alpha at 0.16. Sixteen layers
       composite as 1 - product(1 - a), so the visible result is much stronger
       than any single number here suggests — which is exactly how a ramp like
       this creeps into looking heavy. */
    width: +(5 - 4 * t).toFixed(2),
    /* Quadratic, so brightness collects in the middle few layers instead of
       spreading evenly and washing the whole streak out. */
    opacity: +(0.018 + 0.072 * t * t).toFixed(3),
    blur: +(3 - 2.85 * t).toFixed(2),
  };
});

export function BorderGlow() {
  return (
    <svg className="glow-ring" aria-hidden="true" focusable="false">
      {GLOW_LAYERS.map((layer, i) => (
        <rect
          key={i}
          pathLength={100}
          style={{
            // @ts-expect-error -- custom property, read by the shared
            // dash/offset rule in access.css.
            "--len": layer.len,
            strokeWidth: `${layer.width}px`,
            strokeOpacity: layer.opacity,
            filter: `blur(${layer.blur}px)`,
          }}
        />
      ))}
    </svg>
  );
}
