import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { art, HERO_RATIO } from "./art";
import { FrameLoop } from "./FrameLoop";
import type { Pose } from "./steps";

const POSES: Record<Pose, string> = {
  idle: "hero/hero-idle",
  tap: "hero/hero-tap",
  watch: "hero/hero-watch",
  think: "hero/hero-think",
  tablet: "hero/hero-tablet",
  laptop: "hero/hero-laptop-sit",
  door: "hero/hero-door",
  rise: "hero/hero-rise",
};

/** The tablet pose breathes through four frames that were drawn to line up with it (see build-signup-art.py). */
export const BREATH = ["hero/hero-tablet", "hero/hero-tablet-b2", "hero/hero-tablet-b3", "hero/hero-tablet-b4"] as const;
export const EYES = ["hero/hero-tablet-eyes-2", "hero/hero-tablet-eyes-3"] as const;

/**
 * Her, small and sharp. Poses cross-fade into each other. In the tablet pose, where she spends most of
 * the set-up, she breathes through the drawn frames and blinks now and then (every few seconds, and
 * sometimes twice); in the others she breathes by a hair, as a whole. The eyes are small patches on top
 * of the breath, not a swapped picture, so a blink never moves anything else.
 */
export function Hero({ pose, reduce }: { pose: Pose; reduce: boolean }): JSX.Element {
  const [blink, setBlink] = useState(0);
  useEffect(() => {
    if (reduce || pose !== "tablet") return;
    let t = 0;
    const later = (ms: number, f: () => void) => {
      t = window.setTimeout(f, ms);
    };
    const next = () =>
      later(3800 + Math.random() * 3600, () => {
        setBlink((n) => n + 1);
        if (Math.random() < 0.22)
          later(420, () => {
            setBlink((n) => n + 1);
            next();
          });
        else next();
      });
    next();
    return () => window.clearTimeout(t);
  }, [pose, reduce]);

  return (
    <div className={`nx-hero-art${pose === "tablet" ? " has-frames" : ""}`}>
      <span className="nx-ground" aria-hidden="true" />
      <AnimatePresence initial={false}>
        <motion.div
          key={pose}
          className="nx-hero-pose"
          style={{ aspectRatio: HERO_RATIO }}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.2, ease: "linear" } }}
          transition={{ duration: reduce ? 0 : 0.2, ease: "linear" }}
        >
          {pose === "tablet" ? (
            <>
              <FrameLoop frames={BREATH} period={6} reduce={reduce} className="nx-hero-img" />
              {blink > 0 && !reduce && (
                <>
                  <motion.img key={`a${blink}`} className="nx-hero-img" src={art(EYES[0])} alt="" draggable={false} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 0.26, times: [0, 0.3, 0.7, 1], ease: "linear" }} />
                  <motion.img key={`b${blink}`} className="nx-hero-img" src={art(EYES[1])} alt="" draggable={false} initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1, 1, 0, 0] }} transition={{ duration: 0.26, times: [0, 0.24, 0.4, 0.6, 0.76, 1], ease: "linear" }} />
                </>
              )}
            </>
          ) : (
            <img className="nx-hero-img" src={art(POSES[pose])} alt="" draggable={false} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
