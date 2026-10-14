import { useMemo } from "react";
import type { ReactNode } from "react";
import { campaignAsk } from "./ask";
import type { Ask } from "../Clarify";
import { Clarified } from "../Clarify";
import { useCampaignRows, useCampaignsReady } from "../campaignStore";
import type { CampaignRow } from "../campaignsData";
import type { ViewCard } from "../chatViews";
import { ALL, asksForAll } from "../liveReports";
import type { MomentCtx, MomentKind } from "../moments";

/**
 * Which campaign a view is about, asked the console's way when the request didn't say. The agent's
 * own pick, the campaign named in the words, or the one the recruiter has open are never asked
 * again; "all campaigns" is an answer for the views that can roll them up.
 */

type Row = Pick<CampaignRow, "id" | "name" | "department" | "location" | "status">;

/** The question for a view that can also cover every campaign. */
export function scopeAsk(card: Pick<ViewCard, "campaignId">, rows: readonly Row[], opts: { all?: boolean; ask?: string }): Ask {
  const base = campaignAsk(card, rows, opts.ask ? { ask: opts.ask } : {});
  return (kind, said, ctx) => {
    const q = base(kind, said, ctx);
    if (!q || !opts.all) return q;
    return { ...q, options: [{ id: ALL, label: "All campaigns", meta: `${q.options.length} open` }, ...q.options] };
  };
}

/** The scope this request resolves to without asking: the one named, or every campaign when the words say so. */
export function scopeNamed(card: Pick<ViewCard, "campaignId">, ctx: Pick<MomentCtx, "said" | "answers">, all: boolean): string | null {
  if (all && asksForAll(ctx.said)) return ALL;
  return card.campaignId ?? ctx.answers?.campaignId ?? null;
}

export function ScopeGate({
  kind, card, ctx, all = false, ask, children,
}: {
  kind: MomentKind;
  card: ViewCard;
  ctx: MomentCtx;
  /** Offer "All campaigns" as an answer, and understand a request for them. */
  all?: boolean;
  ask?: string;
  children: (scope: string, ctx: MomentCtx) => ReactNode;
}): JSX.Element {
  const rows = useCampaignRows();
  const ready = useCampaignsReady();
  const asker = useMemo(() => scopeAsk(card, rows, { all, ...(ask ? { ask } : {}) }), [card, rows, all, ask]);

  if (!ready) return <p className="orc-stage" aria-live="polite">Opening your campaigns</p>;
  if (rows.length === 0 && !card.campaignId) return <p className="lt-note">There are no campaigns here yet. Start one from Campaigns and I can report on it.</p>;
  if (all && asksForAll(ctx.said)) return <>{children(ALL, ctx)}</>;
  return <Clarified kind={kind} ctx={ctx} ask={asker}>{(c) => children(scopeNamed(card, c, all) ?? "", c)}</Clarified>;
}
