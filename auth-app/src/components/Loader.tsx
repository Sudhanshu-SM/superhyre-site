import { LOGO_PATH } from "../logo";
import "./loader.css";

export type LoaderSize = "sm" | "md" | "lg";

/**
 * The one loading indicator: the SuperHyre mark with a thin ring travelling round it.
 *
 * `sm` sits inline (a button, a line of text, a row that is working), `md` fills a panel, `lg` is a page.
 * With a `label` it is a status the screen reader announces; without one it is decoration beside words that
 * already say what is happening. `block` centres it in the room it is given, which is what a panel or a page
 * wants. `tone="inherit"` takes the colour of the text around it, for a button that is busy.
 *
 * It replaces every spinner, skeleton and "Loading" line the console had, so waiting looks like one thing.
 * Reduced motion holds the ring still and lets it breathe instead.
 */
export function Loader({ size = "md", label, tone = "accent", block = false }: {
  size?: LoaderSize;
  label?: string;
  tone?: "accent" | "inherit";
  block?: boolean;
}): JSX.Element {
  const mark = (
    <span
      className={`ldr is-${size}${tone === "inherit" ? " is-inherit" : ""}`}
      {...(label ? { role: "status" } : { "aria-hidden": true })}
    >
      <svg className="ldr-ring" viewBox="0 0 32 32" focusable="false" aria-hidden="true">
        <circle className="ldr-track" cx="16" cy="16" r="14.5" />
        {/* pathLength makes the dashes percentages of the circle, whatever its size. */}
        <circle className="ldr-arc" cx="16" cy="16" r="14.5" pathLength={100} />
      </svg>
      <svg className="ldr-mark" viewBox="0 0 34 35" focusable="false" aria-hidden="true">
        <path d={LOGO_PATH} fill="currentColor" stroke="currentColor" strokeMiterlimit="10" />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
  return block ? <div className={`ldr-block is-${size}`}>{mark}</div> : mark;
}
