import { motion } from "motion/react";
import { useMemo } from "react";
import { art } from "./art";

/**
 * A short hand-drawn loop (the generated "breathe" or "pulse" frames) played as a slow cross-fade,
 * not as a flip-book: flipping a handful of frames at a few per second reads as stutter, while
 * fading each frame into the next reads as one soft movement.
 *
 * The frames are stacked, the first one always showing. The others fade in on top of it, one after
 * another, and out again in the reverse order (1 2 3 4 3 2 1 …), so a frame is only ever fading
 * over a frame that is already fully there: nothing dips, nothing double-exposes. Only opacity
 * changes, so it runs on the compositor and costs no layout.
 *
 * With reduced motion, only the first frame is drawn.
 */
export function FrameLoop({
  frames,
  period,
  reduce,
  className,
  style,
}: {
  /** Art keys, in the order of the movement. */
  frames: readonly string[];
  /** Seconds for the whole there-and-back. */
  period: number;
  reduce: boolean;
  /** Put on every picture (they are the same size and sit on top of each other). */
  className: string;
  style?: React.CSSProperties;
}): JSX.Element {
  const n = frames.length;
  const steps = Math.max(1, 2 * (n - 1));
  const keys = useMemo(
    () =>
      frames.slice(1).map((_, k) => {
        const i = k + 1; // this overlay is frame i
        const t = (j: number) => Math.min(1, Math.max(0, j / steps));
        return { times: [0, t(i - 1), t(i), t(steps - i), t(steps - i + 1), 1], values: [0, 0, 1, 1, 0, 0] };
      }),
    [frames, steps],
  );
  const first = frames[0];
  if (!first) return <></>;
  return (
    <>
      <img className={className} style={style} src={art(first)} alt="" draggable={false} />
      {!reduce &&
        frames.slice(1).map((key, k) => (
          <motion.img
            key={key}
            className={className}
            style={{ ...style, opacity: 0 }}
            src={art(key)}
            alt=""
            draggable={false}
            animate={{ opacity: keys[k]?.values ?? 0 }}
            transition={{ duration: period, times: keys[k]?.times, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
          />
        ))}
    </>
  );
}
