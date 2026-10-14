import { ArrowRight, Plus } from "@phosphor-icons/react";
import type { CampaignRow } from "./campaignsData";
import "./nocampaign.css";

/**
 * A campaign page with no campaign chosen. It says so plainly, points at the sidebar
 * where the choice lives, and offers the recent campaigns right here so nobody has to
 * go looking. With none at all it says why, and who can start one.
 */
export function NoCampaign({
  rows,
  canCreate,
  onPick,
  onNew,
  onAll,
}: {
  rows: readonly CampaignRow[];
  canCreate: boolean;
  onPick: (row: CampaignRow) => void;
  onNew: () => void;
  onAll: () => void;
}): JSX.Element {
  const recent = recentCampaigns(rows);
  return (
    <div className="con-page nc-page">
      <section className="nc" aria-labelledby="nc-h">
        <WaitingFolder />
        <div className="nc-body">
          <h1 id="nc-h" className="nc-h">No campaign selected</h1>
          <p className="nc-lede">
            {recent.length
              ? "Choose one in the sidebar, or pick up where you left off."
              : canCreate
                ? "There are no campaigns here yet. Start one and the agent can begin finding people."
                : "You're not on any campaigns yet. An admin can add you to one."}
          </p>

          {recent.length > 0 && (
            <ul className="nc-list" aria-label="Recent campaigns">
              {recent.map((r, i) => (
                <li key={r.id} style={{ ["--i" as string]: i }}>
                  <button type="button" className="nc-row" onClick={() => onPick(r)}>
                    <span className="nc-row-main">
                      <span className="nc-row-name">{r.name}</span>
                      <span className="nc-row-sub">{campaignLine(r)}</span>
                    </span>
                    <ArrowRight className="nc-row-go" size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="nc-actions">
            {canCreate && (
              <button type="button" className="ct-btn is-primary" onClick={onNew}>
                <Plus size={14} weight="bold" aria-hidden="true" /> New campaign
              </button>
            )}
            {rows.length > recent.length && (
              <button type="button" className="nc-link" onClick={onAll}>
                See all {rows.length} campaigns
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** Running campaigns first, then the most recently touched, five at most. */
export function recentCampaigns(rows: readonly CampaignRow[], max = 5): CampaignRow[] {
  const rank = (r: CampaignRow) => (r.status === "active" ? 0 : 1);
  return [...rows]
    .sort((a, b) => rank(a) - rank(b) || Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? ""))
    .slice(0, max);
}

/** "Engineering · Bengaluru · Updated 2 days ago", leaving out what isn't known. */
export function campaignLine(r: CampaignRow): string {
  const status = r.status === "active" ? "" : "Closed";
  const updated = r.updatedAgo ? `Updated ${r.updatedAgo.charAt(0).toLowerCase()}${r.updatedAgo.slice(1)}` : "";
  return [r.department, r.location, status, updated].filter(Boolean).join(" · ");
}

/** An empty folder leaning toward the sidebar, where campaigns are chosen. */
function WaitingFolder(): JSX.Element {
  return (
    <svg className="nc-art" viewBox="0 0 180 140" aria-hidden="true" focusable="false">
      <path className="nc-art-trail" d="M58 112 C 34 112, 18 100, 10 82" />
      <path className="nc-art-head" d="M6 90 L10 81 L19 86" />
      <g className="nc-art-folder">
        <path className="nc-art-back" d="M52 34 h28 l9 10 h55 a10 10 0 0 1 10 10 v54 a10 10 0 0 1 -10 10 H62 a10 10 0 0 1 -10 -10 Z" />
        <rect className="nc-art-sheet" x="66" y="30" width="72" height="54" rx="7" />
        <path className="nc-art-line" d="M78 46 h40 M78 56 h28 M78 66 h34" />
        <path className="nc-art-front" d="M50 60 h104 a8 8 0 0 1 8 9 l-5 41 a10 10 0 0 1 -10 8 H62 a10 10 0 0 1 -10 -9 l-6 -40 a8 8 0 0 1 4 -9 Z" />
      </g>
      <path className="nc-art-spark" d="M150 18 c1 6 4 9 10 10 c-6 1 -9 4 -10 10 c-1 -6 -4 -9 -10 -10 c6 -1 9 -4 10 -10 Z" />
    </svg>
  );
}
