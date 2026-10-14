import { ArrowRight } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { EmptyArt, type EmptyArtName } from "../../EmptyArt";
import { Loader } from "../../components/Loader";
import { art, STAR_PATH, useArtReady, warm } from "./art";
import { Head, headMs, Quiet, TextAction } from "./Voice";
import "./lean.css";
import "./side.css";

/**
 * The screens around set-up that are not the questions themselves: an invite, "your team is already
 * here", "waiting for approval", "use your work email", and an account that would not load. They
 * share the set-up's canvas (sky, hills, her words typed on the left) with a single picture on the
 * right where she would stand, so the whole sign-up feels like one place.
 */
export type SidePicture = { kind: "empty"; name: EmptyArtName } | { kind: "prop"; key: string } | { kind: "hero"; key: string };

type Action = { label: string; onClick: () => void; busy?: boolean };

type Props = {
  picture: SidePicture;
  head: string[];
  quiet?: ReactNode;
  primary?: Action;
  secondary?: Action[];
  problem?: string | null;
  /** Small text at the top right, e.g. "Sign out". */
  corner?: Action;
  /** Which of the four skies. */
  field?: 1 | 2 | 3 | 4;
  /** A line to answer, in place of the primary button (which it carries itself). */
  ask?: ReactNode;
};

const CRITICAL = ["scenery/field-1", "scenery/hill-far", "scenery/hill-mid", "scenery/hill-near", "props/cloud"];

export function SideScreen({ picture, head, quiet, primary, secondary = [], problem, corner, field = 1, ask }: Props): JSX.Element {
  const reduce = useReducedMotion() ?? false;
  const ready = useArtReady(picture.kind === "empty" ? CRITICAL : [...CRITICAL, picture.key], 1800);
  useEffect(() => {
    if (ready) warm(["props/leaf-l", "props/leaf-m", "scenery/field-2", "scenery/field-3", "scenery/field-4"]);
  }, [ready]);
  const [shown, setShown] = useState(reduce);
  if (!ready) return <div className="lx-loading"><Loader size="lg" label="Getting things ready" /></div>;

  const h = reduce ? 0 : headMs(head);
  return (
    <div className="lx lx-side">
      <div className="nx">
        <div className="nx-sky">
          {([1, 2, 3, 4] as const).map((n) => (
            <img key={n} className="nx-plate" src={art(`scenery/field-${n}`)} alt="" style={{ opacity: n === field ? 1 : 0 }} draggable={false} />
          ))}
        </div>
        <div className="nx-up nx-up-cloud">
          <img className="nx-cloud nx-cloud-a" src={art("props/cloud")} alt="" draggable={false} />
          <img className="nx-cloud nx-cloud-b" src={art("props/cloud")} alt="" draggable={false} />
        </div>
        {(["far", "mid", "near"] as const).map((r, i) => (
          <div key={r} className={`nx-up nx-up-${i + 1}`}>
            <div className={`nx-ridge nx-ridge-${r}`}>
              <img src={art(`scenery/hill-${r}`)} alt="" draggable={false} />
            </div>
          </div>
        ))}
        <div className="nx-world">
          <span className="nx-aura" />
          <motion.div className={`sd-pic is-${picture.kind}`} initial={reduce ? false : { opacity: 0, y: 16, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, delay: reduce ? 0 : 0.35, ease: [0.23, 1, 0.32, 1] }} aria-hidden="true">
            <span className={`sd-float${reduce ? " is-still" : ""}`}>
              {picture.kind === "empty" ? <EmptyArt name={picture.name} size={560} className="sd-img" /> : <img className="sd-img" src={art(picture.key)} alt="" draggable={false} />}
            </span>
            <span className="sd-ground" />
          </motion.div>
        </div>
        <img className="nx-leaf nx-leaf-l" src={art("props/leaf-l")} alt="" draggable={false} />
        <img className="nx-leaf nx-leaf-r" src={art("props/leaf-m")} alt="" draggable={false} />
      </div>

      <header className="nx-top sd-top">
        <span className="bp-logo nx-logo">
          <svg className="bp-mark" viewBox="0 0 34 35" fill="none" aria-hidden="true" focusable="false">
            <path d={STAR_PATH} fill="currentColor" stroke="currentColor" strokeMiterlimit="10" />
          </svg>
          <span className="bp-word">superhyre</span>
        </span>
        <span />
        {corner ? (
          <span className="sd-corner">
            <TextAction onClick={corner.onClick}>{corner.label}</TextAction>
          </span>
        ) : (
          <span />
        )}
      </header>

      <main className="nx-voice sd-voice">
        <section className="nx-turn">
          <Head lines={head} reduce={reduce} onDone={() => setShown(true)} />
          {quiet && (
            <Quiet delay={h + 120} reduce={reduce}>
              {quiet}
            </Quiet>
          )}
          <div className="nx-after sd-actions" style={{ "--delay": `${h + 360}ms` } as React.CSSProperties} aria-live="polite">
            {ask}
            {!ask && primary && (
              <button type="button" className="nx-cta" onClick={primary.onClick} disabled={primary.busy || !shown}>
                {primary.busy ? "One moment" : primary.label} {!primary.busy && <ArrowRight size={16} weight="bold" aria-hidden="true" />}
              </button>
            )}
            {problem && (
              <p className="sd-problem" role="alert">
                {problem}
              </p>
            )}
            {secondary.length > 0 && (
              <span className="sd-more">
                {secondary.map((a) => (
                  <TextAction key={a.label} onClick={a.onClick}>
                    {a.label}
                  </TextAction>
                ))}
              </span>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
