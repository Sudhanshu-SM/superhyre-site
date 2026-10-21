import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { art, HERO_RATIO, HERO_SPOT } from "./art";
import { Hero } from "./Companion";
import { Pad, padBeat } from "./Pad";
import { FrameLoop } from "./FrameLoop";
import { type Answers, type Beat, FIELD, type Pose, POSE, POWERS, roleSkipped } from "./steps";

/**
 * The whole screen is the canvas: sky, hills and her fill it edge to edge, the questions are typed
 * straight onto the left of it, and the story plays on the right.
 *
 *   name       she waits, looking at the star; once she has given her name she touches it and it
 *              wakes at her wrist, the six powers rise round her and go in
 *   team...    she writes on her pad (the name, the organisation if there is one, the role, its job
 *              description, who it is for), a line at a time, as she is told
 *   powers     she checks her watch while the six powers are listed plainly on the left
 *   finish     the pad turns to the campaign Mind is putting together; at the end she opens the door
 *
 * Nothing slides across the screen as a cut-out. Things grow into their place, then move only by a
 * hair (a few pixels, a few seconds), and the layers lean slightly with the pointer.
 */
export type Draft = { name?: string; organisation?: string; role?: string; jd?: string; client?: string };

const EASE = [0.23, 1, 0.32, 1] as const;
const STAR = { x: HERO_SPOT.fingertip.x, y: HERO_SPOT.fingertip.y - 0.0856 };
const WRIST = HERO_SPOT.wrist;
const STAR_PULSE = [1, 2, 3, 4].map((n) => `sprites/sprite-star-pulse-${n}`);
const TWINKLE_FRAMES = [1, 2, 3, 4].map((n) => `sprites/sprite-twinkle-${n}`);
const TWINKLES = [
  { x: 52, y: 14, period: 4.6 },
  { x: 91, y: 12, period: 3.8 },
  { x: 97, y: 44, period: 5.4 },
  { x: 41, y: 9, period: 6.1 },
] as const;

/** When each part of the opening plays, in milliseconds after the name is given. */
export const AWAKEN = { fly: 1000, powers: 1700, absorb: 2800, done: 3400 } as const;

const ring = (i: number, r: number, cx: number, cy: number, squash = 1) => {
  const a = (-90 + i * 60) * (Math.PI / 180);
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * squash };
};

type Phase = "wait" | "tap" | "fly" | "powers" | "absorb";

type Props = {
  beat: Beat;
  /** The story after the name is playing. */
  awaken: boolean;
  onAwakened: () => void;
  /** The workspace is made: she opens the door. */
  ready: boolean;
  leaving: boolean;
  /** The last step could not be made (no connection): the pad stops saying Mind is working. */
  stalled?: boolean;
  answers: Answers;
  draft: Draft;
  progress: number;
  reduce: boolean;
};

export function Stage({ beat, awaken, onAwakened, ready, leaving, stalled = false, answers, draft, progress, reduce }: Props): JSX.Element {
  const [boot] = useState(!reduce);
  const [phase, setPhase] = useState<Phase>("wait");
  const done = useRef(onAwakened);
  done.current = onAwakened;

  useEffect(() => {
    if (!awaken) {
      setPhase("wait");
      return;
    }
    if (reduce) {
      setPhase("absorb");
      const t = window.setTimeout(() => done.current(), 700);
      return () => window.clearTimeout(t);
    }
    setPhase("tap");
    const ts = [
      window.setTimeout(() => setPhase("fly"), AWAKEN.fly),
      window.setTimeout(() => setPhase("powers"), AWAKEN.powers),
      window.setTimeout(() => setPhase("absorb"), AWAKEN.absorb),
      window.setTimeout(() => done.current(), AWAKEN.done),
    ];
    return () => {
      for (const t of ts) window.clearTimeout(t);
    };
  }, [awaken, reduce]);

  // The layers lean a few pixels away from the pointer, the far ones least: depth, not motion.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || reduce || window.matchMedia("(pointer: coarse)").matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const move = (e: PointerEvent) => {
      x = (e.clientX / window.innerWidth) * 2 - 1;
      y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.setProperty("--mx", x.toFixed(3));
          el.style.setProperty("--my", y.toFixed(3));
        });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  const base: Pose = leaving ? "rise" : ready ? "door" : POSE[beat];
  const pose: Pose = beat === "name" && awaken ? (phase === "tap" ? "tap" : "watch") : base;
  const field = FIELD[beat];

  // Without a role there is no first campaign for the page to turn to.
  const padOn = (padBeat(beat) || (beat === "finish" && !roleSkipped(answers))) && !leaving;

  const starOn = beat === "name" && (!awaken || phase === "tap");
  const flying = beat === "name" && awaken && phase === "fly";
  const orbiting = beat === "name" && awaken && (phase === "powers" || phase === "absorb");

  return (
    <div ref={root} className={`nx${boot ? " is-boot" : ""}`} data-beat={beat} data-phase={awaken ? phase : "rest"} style={{ "--p": progress } as CSSProperties} aria-hidden="true">
      <div className="nx-sky">
        {([1, 2, 3, 4] as const).map((n) => (
          <img key={n} className="nx-plate" src={art(`scenery/field-${n}`)} alt="" style={{ opacity: n === field ? 1 : 0 }} draggable={false} />
        ))}
      </div>
      <div className="nx-up nx-up-twinkle">
        {TWINKLES.map((t) => (
          <span key={`${t.x}-${t.y}`} className="nx-twinkle" style={{ left: `${t.x}%`, top: `${t.y}%` }}>
            <FrameLoop frames={TWINKLE_FRAMES} period={t.period} reduce={reduce} className="nx-star-img" />
          </span>
        ))}
      </div>
      <div className="nx-up nx-up-cloud">
        <img className="nx-cloud nx-cloud-a" src={art("props/cloud")} alt="" draggable={false} />
        <img className="nx-cloud nx-cloud-b" src={art("props/cloud")} alt="" draggable={false} />
      </div>
      {(["far", "mid", "near"] as const).map((h, i) => (
        <div key={h} className={`nx-up nx-up-${i + 1}`}>
          <div className={`nx-ridge nx-ridge-${h}`}>
            <img src={art(`scenery/hill-${h}`)} alt="" draggable={false} />
          </div>
        </div>
      ))}

      {/* the story: on the right of the screen */}
      <div className="nx-world">
        <span className="nx-aura" />
        {/* her */}
        <div className={`nx-hero${leaving ? " is-rise" : ""}${ready ? " is-door" : ""}`} style={{ aspectRatio: HERO_RATIO }}>
          <motion.div className="nx-hero-in" initial={boot ? { opacity: 0, y: 14, filter: "blur(10px)" } : false} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: boot ? 1.2 : 0.4, delay: boot ? 0.45 : 0, ease: EASE }}>
            {/* her pad: it grows out of her tablet and is written on as she is told things */}
            <AnimatePresence>{padOn && <Pad key="pad" beat={beat} answers={answers} draft={draft} reduce={reduce} campaign={beat === "finish"} working={!ready && !stalled} stalled={stalled} />}</AnimatePresence>
            <Hero pose={pose} reduce={reduce} />

            {/* the star she looks at, and then touches */}
            {starOn && (
              <div className="nx-star" style={{ left: `${STAR.x * 100}%`, top: `${STAR.y * 100}%` }}>
                <motion.span className="nx-star-beat" initial={reduce ? false : { scale: 0.2, opacity: 0 }} animate={phase === "tap" ? { scale: [1, 1.24, 1.1], opacity: 1 } : { scale: 1, opacity: 1 }} transition={{ duration: phase === "tap" ? 0.5 : 0.9, delay: boot && phase === "wait" ? 1.3 : 0, ease: EASE }}>
                  <span className={`nx-bob${reduce ? " is-still" : ""}`}>
                    <FrameLoop frames={STAR_PULSE} period={2.8} reduce={reduce} className="nx-star-img" />
                  </span>
                </motion.span>
                {phase === "tap" &&
                  !reduce &&
                  [0, 1, 2].map((n) => (
                    <motion.img key={n} className="nx-ripple" src={art(`star-dial/ripple-${n + 1}`)} alt="" draggable={false} initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 1.8 + n * 0.5, opacity: 0 }} transition={{ duration: 0.8, delay: n * 0.12, ease: "easeOut" }} />
                  ))}
              </div>
            )}

            {/* it goes into the watch */}
            {flying && !reduce && (
              <>
                <motion.img className="nx-flying" src={art("star-dial/star")} alt="" draggable={false} style={{ x: "-50%", y: "-50%" }} initial={{ left: `${STAR.x * 100}%`, top: `${STAR.y * 100}%`, scale: 1, opacity: 1 }} animate={{ left: `${WRIST.x * 100}%`, top: `${WRIST.y * 100}%`, scale: 0.22, opacity: [1, 1, 0] }} transition={{ duration: 0.85, ease: [0.5, 0, 0.2, 1], opacity: { times: [0, 0.85, 1], duration: 0.85 } }} />
                <motion.img className="nx-burst" src={art("effects/glow")} alt="" draggable={false} style={{ left: `${WRIST.x * 100}%`, top: `${WRIST.y * 100}%`, x: "-50%", y: "-50%" }} initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 0, 2.6, 3.2], opacity: [0, 0, 0.9, 0] }} transition={{ duration: 1.5, times: [0, 0.5, 0.7, 1], ease: "easeOut" }} />
              </>
            )}

            {/* the six powers rise round her, then go into the watch */}
            {orbiting &&
              POWERS.map((p, i) => {
                const home = ring(i, 0.4, 0.5, 0.36, 0.7);
                const gone = phase === "absorb";
                return (
                  <motion.img
                    key={p.id}
                    className="nx-power"
                    src={art(`powers/power-${p.id}-lit`)}
                    alt=""
                    draggable={false}
                    style={{ x: "-50%", y: "-50%" }}
                    initial={reduce ? false : { left: `${WRIST.x * 100}%`, top: `${WRIST.y * 100}%`, scale: 0, opacity: 0 }}
                    animate={gone ? { left: `${WRIST.x * 100}%`, top: `${WRIST.y * 100}%`, scale: 0.1, opacity: 0 } : { left: `${home.x * 100}%`, top: `${home.y * 100}%`, scale: 1, opacity: 1 }}
                    transition={gone ? { duration: 0.5, delay: i * 0.04, ease: [0.5, 0, 0.75, 0] } : { type: "spring", stiffness: 120, damping: 15, delay: 0.1 + i * 0.08 }}
                  />
                );
              })}
          </motion.div>
        </div>
      </div>

      <img className="nx-leaf nx-leaf-l" src={art("props/leaf-l")} alt="" draggable={false} />
      <img className="nx-leaf nx-leaf-r" src={art("props/leaf-m")} alt="" draggable={false} />
    </div>
  );
}
