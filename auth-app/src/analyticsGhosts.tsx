import { Shimmer } from "./components/Shimmer";

/**
 * The parts of an Analytics page while it loads, in the real parts' own classes (analytics.css): the card's figures
 * with their real labels, a row of horizontal bars, and a table with its real header. A page puts these inside the
 * real `Panel` (so a card's title and its place in the grid are real), and only the numbers are tiles.
 */

/** The figures card: each one's real label, a tile for its value and one for its note under it. */
export function KpisGhost({ labels }: { labels: readonly string[] }): JSX.Element {
  return (
    <section className="an-kpis" aria-label="Figures" aria-hidden="true">
      <dl>
        {labels.map((l, i) => (
          <div key={l}>
            <dt>{l}</dt>
            <dd><Shimmer h={24} lh={32} w={`${52 + ((i * 11) % 22)}px`} r={8} /></dd>
            <dd className="an-muted"><Shimmer h={11} lh={20} w={`${112 - i * 14}px`} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Horizontal bars: a name, the track, the count. */
export function HBarsGhost({ n = 6, stack = false }: { n?: number; stack?: boolean }): JSX.Element {
  return (
    <ul className={`anc-hb${stack ? " is-stack" : ""}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}>
          <span className="anc-hb-l"><Shimmer h={12} lh={20} w={`${52 + ((i * 17) % 36)}%`} /></span>
          <span className="anc-hb-track"><Shimmer h="100%" r={4} w={`${Math.max(14, 92 - i * 15)}%`} /></span>
          <span className="anc-hb-n"><Shimmer h={12} lh={20} w={44} style={{ marginLeft: "auto" }} /></span>
        </li>
      ))}
    </ul>
  );
}

/** A table with its real header (a label starting with ">" is a right-aligned figure column) and rows of tiles. */
export function TableGhost({ heads, rows = 5 }: { heads: readonly string[]; rows?: number }): JSX.Element {
  return (
    <div className="an-scroll" aria-hidden="true">
      <table className="an-tbl">
        <thead>
          <tr>
            {heads.map((h) => {
              const right = h.startsWith(">");
              return <th key={h} scope="col" className={right ? "is-r" : undefined}>{right ? h.slice(1) : h}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {heads.map((h, c) => {
                const right = h.startsWith(">");
                const tile = <Shimmer h={12} lh={20} w={c === 0 ? `${52 + ((r * 19) % 36)}%` : right ? 28 : `${46 + (((r + c) * 17) % 36)}%`} {...(right ? { style: { marginLeft: "auto" } } : {})} />;
                return c === 0 ? <th key={h} scope="row">{tile}</th> : <td key={h} className={right ? "is-r" : undefined}>{tile}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
