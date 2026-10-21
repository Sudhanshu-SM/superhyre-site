import type { ChatCard } from "../api/agent";
import { campaignHref } from "../chatCards";
import "./countsCard.css";

type Counts = Extract<ChatCard, { kind: "counts" }>;

/**
 * How many people are at each stage on each campaign: one compact table on the canvas, a row a campaign and a totals row.
 * Each row ends in its own total. Where a campaign has stages of its own with people in them ("Client review 2") they are
 * small figures under its name, only when above zero. The Hired cell reads "2 of 3" when the campaign has a target of hires.
 */
export function CountsCard({ card }: { card: Counts }): JSX.Element | null {
  if (!card.rows.length) return <p className="ct-none" role="status">No campaigns to count yet.</p>;
  return (
    <table className="ctt" aria-label="People on each campaign">
      <thead>
        <tr>
          <th scope="col" className="ctt-name">Campaign</th>
          {card.columns.map((c) => <th key={c} scope="col" className="ctt-n">{c}</th>)}
          <th scope="col" className="ctt-n ctt-total">Total</th>
        </tr>
      </thead>
      <tbody>
        {card.rows.map((r) => {
          const total = r.cells.reduce((a, b) => a + b, 0);
          return (
            <tr key={r.id}>
              <th scope="row" className="ctt-name">
                <a href={campaignHref(r.id, "pipeline")}>{r.name}</a>
                {r.extras.length > 0 && <small>{r.extras.map((e) => `${e.name} ${e.people}`).join(" · ")}</small>}
              </th>
              {card.columns.map((c, i) => (
                <td key={c} className="ctt-n">
                  {c === "Hired" && r.hiresWanted ? `${r.cells[i] ?? 0} of ${r.hiresWanted}` : (r.cells[i] ?? 0)}
                </td>
              ))}
              <td className="ctt-n ctt-total">{total}</td>
            </tr>
          );
        })}
      </tbody>
      {card.rows.length > 1 && (
        <tfoot>
          <tr>
            <th scope="row" className="ctt-name">All campaigns</th>
            {card.columns.map((c, i) => <td key={c} className="ctt-n">{card.totals[i] ?? 0}</td>)}
            <td className="ctt-n ctt-total">{card.totals.reduce((a, b) => a + b, 0)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
