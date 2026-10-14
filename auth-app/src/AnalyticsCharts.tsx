import { fmt } from "./analyticsView";

/**
 * The one chart the Analytics pages draw: horizontal bars on one start line, so lengths compare. Plain HTML, no
 * chart library. Every bar is a warm neutral; at most one row of a chart is the brand orange (the hired step).
 * The number is written beside every bar and a screen reader reads the list as words, so the bar is only a
 * picture of what the text already says.
 */

export type HBar = {
  id: string;
  label: string;
  /** Length of the bar. */
  value: number;
  /** What is written at the end: the count, or a share. */
  count?: string;
  /** Muted words under the label ("27 waiting longer than usual"). */
  note?: string | null;
  /** A second muted figure beside the count ("39%"). */
  share?: string | null;
  /** The one row that is orange. */
  accent?: boolean;
  title?: string;
};

export function HBars({ rows, label, max, stack = false }: { rows: readonly HBar[]; label: string; max?: number; stack?: boolean }): JSX.Element {
  const top = Math.max(1, max ?? 0, ...rows.map((r) => r.value));
  return (
    <ul className={`anc-hb${stack ? " is-stack" : ""}`} aria-label={label}>
      {rows.map((r) => (
        <li key={r.id} title={r.title}>
          <span className="anc-hb-l">
            <span className="an-cut">{r.label}</span>
            {r.note && <span className="anc-hb-note">{r.note}</span>}
          </span>
          <span className="anc-hb-track" aria-hidden="true">
            {r.value > 0 && <i className={r.accent ? "is-accent" : undefined} style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%` }} />}
          </span>
          <span className="anc-hb-n">
            {r.count ?? fmt(r.value)}
            {r.share && <span className="anc-hb-share">{r.share}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
