import type { Ask } from "../Clarify";
import type { Question } from "../clarify";
import { questionFor } from "../clarify";
import type { CampaignRow } from "../campaignsData";
import type { ViewCard } from "../chatViews";
import type { RoleFacts } from "../formKit";
import type { MomentCtx } from "../moments";
import { campaignAsk } from "./ask";
import { peekRole, warmRole } from "./roleFacts";

/**
 * The questions a screening form asks before it is drafted, for a connected campaign. They are the
 * console's own form questions (kind of role, stack, ideal hire, one tile or line each); what
 * changes is that the campaign is a real one, and a role the spec already names is not asked
 * again. Which campaign comes first, when the request didn't say.
 */

const and = (xs: readonly string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The ideal-hire question, said in terms of what the role spec already holds. */
export function tuneQuestion(q: Question, facts: RoleFacts | null, campaignName?: string): Question {
  if (q.id === "form-ideal" && facts?.musts.length) {
    return {
      ...q,
      ...(campaignName ? { found: `For ${campaignName}` } : {}),
      why: `The role spec already has ${and(facts.musts.map((m) => m.text))} as must-haves, and I'll use them. Add a line to refine it, or skip.`,
    };
  }
  return q;
}

export function formAsk(card: Pick<ViewCard, "campaignId">, rows: readonly Pick<CampaignRow, "id" | "name" | "department" | "location" | "status">[]): Ask {
  return campaignAsk(card, rows, { ask: "Which campaign is this form for?" }, (campaignId: string, said: string, ctx: MomentCtx) => {
    warmRole(campaignId);
    const role = peekRole(campaignId);
    const facts = role.state === "ready" ? role.facts : null;
    /* The console's questions read the campaign (and a typed role) from these answers. The role the spec names stands in for
       a typed one, so "what's the role?" isn't asked of a campaign that has a title. */
    const answers = {
      ...ctx.answers,
      campaign: campaignId,
      ...(facts?.title && !ctx.answers?.roleText ? { roleText: facts.title } : {}),
    };
    const asked = Object.create(ctx, { answers: { value: answers, enumerable: true } }) as MomentCtx;
    const q = questionFor("form", said, asked);
    return q ? tuneQuestion(q, facts, rows.find((r) => r.id === campaignId)?.name) : null;
  });
}
