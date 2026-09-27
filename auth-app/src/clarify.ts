import type { MomentCtx, MomentKind } from "./moments";
import {
  CAMPAIGNS_OF, CRITERIA_FOR, MEETS_FOR, campaignIn, candidatesIn, roleIn,
} from "./moments";
import type { CampaignKey } from "./orchestrator";
import { FLEET, SCOPED, campaignName } from "./orchestrator";
import { CANDIDATES } from "./sourcing";

/**
 * Clarify — when the agent asks before it acts.
 *
 * ── THE FRAMEWORK ───────────────────────────────────────────────────────────
 * A question is asked only when the answer changes what the agent does, and
 * only when the agent cannot work it out itself. Every question:
 *
 *   says what it found     "Priya and Anika are both in two campaigns"
 *   offers real options    each one a thing the agent can do right now,
 *                          with enough context to choose without checking
 *   costs one press        a tile, or a number key
 *   can be remembered      "use this for the rest of the session", after
 *                          which the agent says what it assumed and keeps a
 *                          way to change it
 *   folds away             once answered it shrinks to one line, and the
 *                          work carries on beneath it
 *
 * Answers do not bypass the moments: each one is written back into the
 * request ("… for Platform SRE"), so a moment reads a clarified request the
 * same way it reads a clear one.
 */

export type Option = { id: string; label: string; meta?: string };

export type Question = {
  id: string;
  /** What the agent noticed, shown as the phase line's finding. */
  found: string;
  ask: string;
  why?: string;
  options: readonly Option[];
  /** Pick several. `min` enables the continue button. */
  multi?: { min: number; max: number; verb: string };
  /** Session preference key; present means the answer can be remembered. */
  remember?: string;
  /** How an answer rewrites the request. */
  apply: (ids: readonly string[]) => { said?: string; answers?: Record<string, string> };
};

const nameOf = (id: string) => CANDIDATES.find((c) => c.id === id)!.name;
const firstOf = (id: string) => nameOf(id).split(" ")[0]!;
const list = (xs: readonly string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

const campaignOption = (id: CampaignKey, meta: string): Option => ({ id, label: campaignName(id), meta });
const forCampaign = (said: string, id: string) =>
  id === "all" ? `${said} across all campaigns` : `${said} for ${campaignName(id)}`;

/**
 * The next question for a request, or null when it is clear. Called again
 * after every answer, so questions chain: pick two people, then pick the
 * campaign to compare them in.
 */
export function questionFor(kind: MomentKind, said: string, ctx: MomentCtx): Question | null {
  const camp = campaignIn(said);
  const acrossAll = /across all campaigns|all campaigns|every campaign/i.test(said);

  if (kind === "compare") {
    let ids = candidatesIn(said);
    if (ids.length < 2) {
      const short = CANDIDATES.filter((c) => ctx.verdicts[c.id] === "shortlisted").map((c) => c.id);
      if (short.length >= 2 && short.length <= 3) ids = short;
    }
    if (ids.length < 2) {
      const pool = CANDIDATES.filter((c) => ctx.verdicts[c.id] !== "rejected").slice(0, 8);
      return {
        id: "compare-who",
        found: "The request doesn't name who to compare",
        ask: "Who should I compare?",
        why: "Pick two or three. The comparison lines up their full profiles side by side.",
        options: pool.map((c) => ({
          id: c.id,
          label: c.name,
          meta: `${c.jobs[0]!.roles[0]!.title} · ${c.jobs[0]!.org.name}${ctx.verdicts[c.id] === "shortlisted" ? " · shortlisted" : ""}`,
        })),
        multi: { min: 2, max: 3, verb: "Compare" },
        apply: (picked) => ({ said: `${said} ${picked.map(firstOf).join(" and ")}` }),
      };
    }
    if (!camp) {
      const shared = SCOPED.filter((k) => ids.every((id) => (CAMPAIGNS_OF[id] ?? []).includes(k)));
      if (shared.length > 1) {
        return {
          id: "compare-campaign",
          found: `${list(ids.map(firstOf))} are both in ${shared.length} campaigns`,
          ask: "Which campaign should I compare them for?",
          why: "Each campaign ranks on different criteria, so the comparison changes with it.",
          options: shared.map((k) => campaignOption(k, `Ranks on ${CRITERIA_FOR[k].join(", ").toLowerCase()}`)),
          remember: "compare.campaign",
          apply: ([k]) => ({ said: forCampaign(said, k!) }),
        };
      }
    }
    return null;
  }

  if (kind === "status") {
    const role = roleIn(said);
    if (role && !camp && !acrossAll) {
      const with_ = SCOPED.filter((k) => FLEET.some((a) => a.campaignId === k && a.role === role));
      if (with_.length > 1) {
        return {
          id: "status-campaign",
          found: `${role} is running on ${with_.length} campaigns`,
          ask: `Which ${role.toLowerCase()} agent do you mean?`,
          options: [
            ...with_.map((k) => {
              const a = FLEET.find((x) => x.campaignId === k && x.role === role)!;
              return campaignOption(k, a.doing);
            }),
            { id: "all", label: "All of them", meta: `${with_.length} agents, side by side` },
          ],
          remember: `status.${role}`,
          apply: ([k]) => ({ said: forCampaign(said, k!) }),
        };
      }
    }
    return null;
  }

  if (kind === "report" && !camp) {
    const role = roleIn(said) ?? "Outreach";
    const with_ = SCOPED.filter((k) => FLEET.some((a) => a.campaignId === k && a.role === role));
    if (with_.length > 1) {
      return {
        id: "report-campaign",
        found: `${role} has run on ${with_.length} campaigns this week`,
        ask: "Which campaign's week should I report on?",
        options: with_.map((k) => campaignOption(k, FLEET.find((a) => a.campaignId === k && a.role === role)!.doing)),
        remember: "report.campaign",
        apply: ([k]) => ({ said: forCampaign(said, k!) }),
      };
    }
  }

  if (kind === "campaign" && !camp && !acrossAll) {
    return {
      id: "campaign-scope",
      found: "Three campaigns are running",
      ask: "Which campaign should I chart?",
      options: [
        ...SCOPED.map((k) => campaignOption(k, `${FLEET.filter((a) => a.campaignId === k).length} agents`)),
        { id: "all", label: "All campaigns", meta: "Side by side, then combined" },
      ],
      remember: "campaign.scope",
      apply: ([k]) => ({ said: forCampaign(said, k!) }),
    };
  }

  if (kind === "outreach") {
    const short = CANDIDATES.filter((c) => ctx.verdicts[c.id] === "shortlisted");
    if (short.length === 0 && !ctx.answers?.audience) {
      const fits = CANDIDATES.filter((c) => (MEETS_FOR["backend-snr"][c.id] ?? []).every(Boolean));
      const open = CANDIDATES.filter((c) => c.openToWork);
      return {
        id: "outreach-who",
        found: "Nobody is shortlisted yet",
        ask: "Who should I reach out to?",
        why: "Every message is still yours to review before it sends.",
        options: [
          { id: "top", label: "The top 4 ranked", meta: list(CANDIDATES.slice(0, 4).map((c) => firstOf(c.id))) },
          { id: "fit", label: `Everyone who meets all 3 criteria`, meta: `${fits.length} people` },
          { id: "open", label: "Only people open to work", meta: list(open.map((c) => firstOf(c.id))) },
        ],
        apply: ([k]) => ({ answers: { audience: k! } }),
      };
    }
    return null;
  }

  if (kind === "schedule" && candidatesIn(said).length === 0) {
    const pool = CANDIDATES.filter((c) => ctx.verdicts[c.id] === "shortlisted");
    const from = pool.length ? pool : CANDIDATES.slice(0, 4);
    return {
      id: "schedule-who",
      found: "The request doesn't say who the call is with",
      ask: "Who should I book?",
      options: from.map((c) => ({ id: c.id, label: c.name, meta: c.headline })),
      apply: ([id]) => ({ said: `${said} ${firstOf(id!)}` }),
    };
  }

  if (kind === "assign" && !roleIn(said)) {
    const gaps = (["Sourcing", "Outreach", "Screening"] as const).map((r) => ({
      r,
      where: SCOPED.filter((k) => !FLEET.some((a) => a.campaignId === k && a.role === r)),
    }));
    return {
      id: "assign-role",
      found: "The request doesn't say which kind of agent",
      ask: "What should the new agent do?",
      options: gaps.map(({ r, where }) => ({
        id: r,
        label: r,
        meta: where.length ? `Missing on ${list(where.map(campaignName))}` : "Every campaign has one",
      })),
      apply: ([r]) => ({ said: `${said} ${r!.toLowerCase()}` }),
    };
  }

  return null;
}

/** The criteria and fit a comparison should use, for a campaign. */
export function criteriaFor(camp: CampaignKey) {
  return { criteria: CRITERIA_FOR[camp], meets: MEETS_FOR[camp] };
}
