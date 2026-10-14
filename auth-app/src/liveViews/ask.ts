import type { Ask } from "../Clarify";
import type { Question } from "../clarify";
import type { ViewCard } from "../chatViews";
import type { CampaignRow } from "../campaignsData";
import type { MomentCtx } from "../moments";

/**
 * Asking which campaign, for the live views that need one. The question is the console's own
 * (`Clarified`: tiles, one press, remembered for the session); only its options are real. A
 * campaign the agent already named, or one answered earlier, is never asked again.
 */

/** The campaign a view is about: the one the agent named, else the answer to "which campaign". */
export function resolvedCampaignId(card: Pick<ViewCard, "campaignId">, ctx: Pick<MomentCtx, "answers">): string | null {
  return card.campaignId ?? ctx.answers?.campaignId ?? null;
}

/** Live campaign tiles for a "which campaign" question, open ones first. */
export function campaignQuestion(
  rows: readonly Pick<CampaignRow, "id" | "name" | "department" | "location" | "status">[],
  opts: { found?: string; ask?: string; current?: string | null; remember?: string },
): Question {
  const open = rows.filter((r) => r.status !== "closed");
  const list = open.length ? open : rows;
  const preset = opts.current && list.some((r) => r.id === opts.current) ? opts.current : undefined;
  return {
    id: "campaign",
    found: opts.found ?? (list.length === 1 ? "There is one open campaign" : `${list.length} campaigns are open`),
    ask: opts.ask ?? "Which campaign is this for?",
    options: list.map((r) => ({ id: r.id, label: r.name, meta: [r.department, r.location].filter(Boolean).join(" · ") })),
    dense: true,
    ...(list.length > 6 ? { filter: "Find a campaign" } : {}),
    step: "Campaign",
    ...(preset ? { preset } : {}),
    ...(opts.remember ? { remember: opts.remember } : {}),
    apply: ([id]) => ({ answers: { campaignId: id ?? "" } }),
  };
}

/**
 * A `Clarified` question function that asks which campaign when the request didn't say, and
 * nothing else. Views with more to ask compose it: ask their own question once this is answered.
 */
export function campaignAsk(
  card: Pick<ViewCard, "campaignId">,
  rows: readonly Pick<CampaignRow, "id" | "name" | "department" | "location" | "status">[],
  opts: { ask?: string; remember?: string } = {},
  then?: (campaignId: string, said: string, ctx: MomentCtx) => Question | null,
): Ask {
  return (_kind, said, ctx) => {
    const id = resolvedCampaignId(card, ctx);
    if (!id) return campaignQuestion(rows, { ...opts, current: ctx.campaign?.id ?? null });
    return then ? then(id, said, ctx) : null;
  };
}
