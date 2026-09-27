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

/* ── WHY THE GLOW IS NO LONGER SIXTEEN BLURRED SVG STROKES ──
   The previous ring animated `stroke-dashoffset` on sixteen stacked, blurred
   rects. That property is painted on the main thread, and sixteen blurs per
   frame is an expensive paint: whenever the page was busy — typing, the live
   band ticking, a moment animating in — frames were dropped and the light
   visibly stalled partway round, which is how it was reported.

   Now it is a conic gradient on an oversized square that ROTATES, masked
   down to a thin ring on the host's border (and a softer, blurred ring just
   outside it for the bloom). Rotation is a transform, which the compositor
   runs on its own thread: the light keeps moving at full rate no matter what
   the page is doing, and it never stops mid-lap. `border-radius: inherit`
   follows any host shape, so no per-host radius variable is needed. */
export function BorderGlow() {
  return (
    <span className="glow-ring is-conic" aria-hidden="true">
      <span className="gr-bloom"><i /></span>
      <span className="gr-band"><i /></span>
    </span>
  );
}
