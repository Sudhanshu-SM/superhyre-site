import type { Ask } from "../Clarify";
import type { Question } from "../clarify";
import { questionFor } from "../clarify";
import type { CampaignRow } from "../campaignsData";
import type { ViewCard } from "../chatViews";
import type { Family, RoleFacts } from "../formKit";
import { inferFamily, inferSub, roleTitle } from "../formKit";
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

/**
 * The form the server already made for this card (the agent's create_form), named in the card's query as `form:<id>`:
 * the card then shows that form as it stands, with its link and answers, instead of asking for one to be drafted.
 */
export const madeFormOf = (query: string | null | undefined): string | null =>
  /^form:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(query ?? "")?.[1] ?? null;

/** What the campaign already says about itself, for the questions that would otherwise ask it. */
export type CampaignKnown = {
  name?: string | undefined;
  department?: string | undefined;
  /** The kind of role, once it is known (answered, or assumed from the campaign). */
  family?: string | undefined;
  /** Where the role's must-haves came from. */
  source?: "spec" | "setup" | "none" | undefined;
};

/**
 * The questions, put in terms of what the campaign already holds. What it states is answered for the
 * recruiter and shown as a line they can change, never asked: the kind of role from its department or
 * title (the generic role when they place it nowhere), the stack when the title names it, the role's name
 * from the campaign's, and the ideal hire from the must-haves its role spec already has. Only what the
 * campaign leaves open is a question.
 */
export function tuneQuestion(q: Question, facts: RoleFacts | null, campaignName?: string, known: CampaignKnown = {}): Question {
  const name = campaignName ?? known.name;
  const words = [facts?.title, name];
  if (q.id === "form-family") {
    /* A campaign with a title is never asked what kind of role it is: what the department and title don't
       place is the generic role, named from the campaign (the question after this one is answered the same way). */
    const named = !!(facts?.title?.trim() || name?.trim());
    const family = inferFamily(known.department, ...words) ?? (named ? "other" : null);
    return family ? { ...q, preset: family, presetNote: "from the campaign" } : q;
  }
  if (q.id === "form-sub") {
    /* Preset only when a title clearly names the stack; otherwise it is asked, never guessed. */
    const sub = known.family && known.family !== "other" ? inferSub(known.family as Family, ...words) : null;
    return sub && q.options.some((o) => o.id === sub) ? { ...q, preset: sub, presetNote: "from the role" } : q;
  }
  if (q.id === "form-role" && name?.trim()) {
    return { ...q, preset: roleTitle(name), presetNote: "from the campaign" };
  }
  if (q.id === "form-ideal" && facts?.musts.length) {
    const where = known.source === "setup" ? "campaign" : "role spec";
    return {
      ...q,
      ...(name ? { found: `For ${name}` } : {}),
      why: `The role spec already has ${and(facts.musts.map((m) => m.text))} as must-haves, and I'll use them. Add a line to refine it, or skip.`,
      /* Nothing left to ask: the must-haves stand, and Change opens the line for anything to add. */
      preset: "",
      presetNote: `from the ${where}`,
      ...(q.input ? { input: { ...q.input, skipped: `Using the ${where}'s must-haves` } } : {}),
    };
  }
  return q;
}

export function formAsk(card: Pick<ViewCard, "campaignId">, rows: readonly Pick<CampaignRow, "id" | "name" | "department" | "location" | "status">[]): Ask {
  return campaignAsk(card, rows, { ask: "Which campaign is this form for?" }, (campaignId: string, said: string, ctx: MomentCtx) => {
    warmRole(campaignId);
    const role = peekRole(campaignId);
    /* The role is still being read: its answers aren't known yet, so nothing is asked on its behalf (the draft
       says it is reading the spec). The question arrives, or is answered, once it lands. */
    if (role.state === "loading") return null;
    const facts = role.facts;
    const row = rows.find((r) => r.id === campaignId);
    /* The console's questions read the campaign (and a typed role) from these answers. The role the spec names stands in for
       a typed one, so "what's the role?" isn't asked of a campaign that has a title. */
    const answers: Record<string, string> = {
      ...ctx.answers,
      campaign: campaignId,
      ...(facts?.title && !ctx.answers?.roleText ? { roleText: facts.title } : {}),
    };
    const asked = Object.create(ctx, { answers: { value: answers, enumerable: true } }) as MomentCtx;
    const q = questionFor("form", said, asked);
    return q ? tuneQuestion(q, facts, row?.name, { name: row?.name, department: row?.department, family: answers.family, source: role.source }) : null;
  });
}
