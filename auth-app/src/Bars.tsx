import "./bars.css";

/**
 * Bars — a plain bar chart, vertical or horizontal.
 *
 * Bars grow in from the baseline on arrival, one after another, and the
 * value sits on (or beside) each bar so nothing has to be read off an axis.
 * Hover lifts the bar under the pointer and dims the rest a little.
 * One colour: the brand orange for the series, a pale track behind it.
 */

export type Bar = { label: string; value: number; hint?: string; onClick?: () => void; muted?: boolean; color?: string;
  /** In a distribution, the bar whose count is always shown (the mode). */
  strong?: boolean;
  /** Shown in place of the bare value, e.g. "12 · 60%". */
  shown?: string };

export function Bars({
  data, orient = "vertical", height = 160, unit, emptyNote, variant = "series",
}: {
  /** "series" (over time): the last bar is "now" and is accented. "dist" (a
      distribution): no bar is special by position; colours come from the data. */
  variant?: "series" | "dist";
  data: readonly Bar[];
  orient?: "vertical" | "horizontal";
  height?: number;
  /** Appended to the value in the hover title, e.g. "people". */
  unit?: string;
  emptyNote?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const empty = data.every((d) => d.value === 0);

  if (orient === "horizontal") {
    return (
      <ul className={`bars is-h${empty ? " is-empty" : ""}`}>
        {data.map((d, i) => {
          const Tag = d.onClick ? "button" : "div";
          return (
            <li key={d.label}>
              <Tag type={d.onClick ? "button" : undefined} className={`bars-row${d.onClick ? " is-link" : ""}${d.muted ? " is-muted" : ""}`} onClick={d.onClick} title={d.hint ?? `${d.value}${unit ? ` ${unit}` : ""}`}>
                <span className="bars-l">{d.label}</span>
                <span className="bars-track">
                  <span className="bars-fill" style={{ ["--k" as string]: d.value / max, animationDelay: `${80 + i * 60}ms`, ...(d.color ? { background: d.color } : {}) }} />
                </span>
                <span className="bars-v">{d.shown ?? d.value}</span>
              </Tag>
            </li>
          );
        })}
        {empty && emptyNote && <li className="bars-empty">{emptyNote}</li>}
      </ul>
    );
  }

  return (
    <div className={`bars is-v${variant === "dist" ? " is-dist" : ""}${empty ? " is-empty" : ""}`} style={{ ["--h" as string]: `${height}px` }}>
      <div className="bars-plot">
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className={`bars-col${d.muted ? " is-muted" : ""}${d.strong ? " is-strong" : ""}`} style={{ ["--k" as string]: d.value / max }} title={d.hint ?? `${d.label}: ${d.value}${unit ? ` ${unit}` : ""}`}>
            <span className="bars-colv">{d.value || ""}</span>
            <span className="bars-colbar" style={{ animationDelay: `${60 + i * 35}ms`, ...(d.color ? { background: d.color } : {}) }} />
          </div>
        ))}
      </div>
      <div className="bars-axis">
        {data.map((d, i) => <span key={`${d.label}-${i}`}>{d.label}</span>)}
      </div>
      {empty && emptyNote && <p className="bars-empty">{emptyNote}</p>}
    </div>
  );
}
