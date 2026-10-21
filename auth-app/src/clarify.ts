import type { MomentCtx, MomentKind } from "./moments";
import {
  CAMPAIGNS_OF, CRITERIA_FOR, MEETS_FOR, campaignIn, candidatesIn, roleIn,
} from "./moments";
import type { CampaignKey } from "./orchestrator";
import { FLEET, SCOPED, campaignName } from "./orchestrator";
import { CANDIDATES } from "./sourcing";
import { CAMPAIGN_ROWS } from "./campaignsData";
import type { Family } from "./formKit";
import { FAMILIES, SUBTYPES, cap, inferFamily } from "./formKit";
import { campaignById, listCampaignStubs } from "./formsStore";
import { formCampaignIn } from "./moments";
import { can, standingOf } from "./can";
import { getSession } from "./roleStore";
import { getClients } from "./campaignStore";
import { clientNameIn } from "./clients";
import { COUNT_CLAUSE, MODE_CLAUSE, companyIn, companySaid, departmentFor, splitPossessive, takeBehalf, takeCtc, takeExperience, takeLabelled, takeSkills } from "./campaignAsk";
import { DEPARTMENTS } from "./campaignsData";
import type { WorkMode } from "./campaignsData";
import { COUNT_WORD_PATTERN, JD_MAX_CHARS, MOST_OPENINGS, canonicalCity, knownCity, parseOpenings } from "./campaignDraft";

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
  /** A free-text answer instead of tiles: `options` is empty and `apply`
      receives `[text]`, or `[""]` when skipped. */
  input?: {
    placeholder: string; verb: string; optional?: boolean; max?: number; rows?: number;
    /** What the log says in place of the answer when it is skipped ("Skipped" if not said). */
    skipped?: string;
    /** Looks at the text before it is taken: a sentence says what is wrong with it, null lets it through. */
    check?: (text: string) => string | null;
    /** A number is expected: the phone shows its number pad. */
    numeric?: boolean;
  };
  /**
   * A document to paste or upload, or to leave for later (the job description). The tiles are `options`
   * (`paste`, `upload`, `later`); the answer is `[text, source]`: `source` is the file's name, "" when it was
   * pasted, and both are "" for later.
   */
  document?: { placeholder: string; verb: string; accept: string; max: number; min: number };
  /** What the log says for an answer whose ids are not words (a pasted document), one line. */
  say?: (ids: readonly string[]) => string;
  /** The live phase line while the agent looks, and how long it looks. */
  reading?: string;
  ms?: number;
  /** An option id answered for the recruiter (the campaign they have open),
      shown as an assumption they can change. For a typed answer it is the
      text itself: "" is "nothing to add", asked normally after Change. */
  preset?: string;
  /** Where a preset came from, in the log's words ("from the campaign"). Defaults to the campaign the recruiter has open. */
  presetNote?: string;
  /** A preset that applies itself is not logged as a row: the card that follows is the one place it is shown. */
  silent?: boolean;
  /** The step's name once answered ("Campaign"), so the log reads as one
      row per step: "Campaign: Senior Backend Engineers · Change". */
  step?: string;
  /** Compact one-line tiles, for long lists such as campaigns. */
  dense?: boolean;
  /**
   * A last tile, "Other", for an answer no tile holds (a number of hires, a city). Choosing it opens a field under the
   * tiles and the card's Continue answers with the text, as a tile's own id would: `apply` receives `[text]`. It is
   * never an answer of its own, so the log shows one row with the final value.
   */
  other?: { placeholder: string; label?: string; max?: number; numeric?: boolean; check?: (text: string) => string | null };
  /** A filter field above the tiles, with this placeholder. */
  filter?: string;
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

  if (kind === "form") return formQuestion(said, ctx);
  /* Adding a client is a manager's; a recruiter gets the reply straight away, with nothing asked first. Anyone
     opens a campaign (a recruiter's is their own), so it is asked of everyone who may. */
  if (kind === "client") return mayAddClient() ? clientQuestion(said, ctx) : null;
  if (kind === "campaign-new") return can(standingOf(getSession()), "campaign.create") ? newCampaignQuestion(said, ctx) : null;

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

/* ── the form flow ─────────────────────────────────────────────────────────
   Answers live in ctx.answers, never in the request: "Backend" or "Platform"
   written into `said` would read as a campaign to everything downstream. */

/* Short enough to show whole in the field, at any width the chat runs at. */
const IDEAL_PLACEHOLDER: Record<Family, string> = {
  engineering: "e.g. 5+ yrs Go/Java, Postgres at scale",
  sales: "e.g. Closed ₹50L+ SaaS deals, based in Mumbai",
  design: "e.g. Strong systems portfolio, fintech a plus",
  other: "e.g. Qualified CA, has run month-end close",
};

const SUB_ASK: Record<Exclude<Family, "other">, string> = {
  engineering: "Which part of the stack?",
  sales: "What kind of sales role?",
  design: "What kind of design work?",
};

/** "12m ago" → minutes, for ordering by recent activity. */
const agoMinutes = (s: string) => {
  const m = /(\d+)\s*(m|h|d|w|mo)\b/.exec(s);
  if (!m) return /just now/i.test(s) ? 0 : Number.MAX_SAFE_INTEGER;
  const unit: Record<string, number> = { m: 1, h: 60, d: 1440, w: 10080, mo: 43200 };
  return Number(m[1]) * unit[m[2]!]!;
};

/** Campaigns a form can be for: every one that isn't closed (most recently
    active first), then ones started in chat. */
function formCampaigns() {
  const rows = CAMPAIGN_ROWS.filter((r) => r.status !== "closed")
    .slice()
    .sort((a, b) => agoMinutes(a.updatedAgo) - agoMinutes(b.updatedAgo))
    .map((r) => ({
      id: r.id, name: r.name, department: r.department, location: r.location, contacted: r.funnel.contacted,
    }));
  const stubs = listCampaignStubs()
    .filter((c) => !rows.some((r) => r.id === c.id))
    .map((c) => ({ id: c.id, name: c.name, department: c.department, location: c.location, contacted: 0 }));
  return [...rows, ...stubs];
}

function formQuestion(said: string, ctx: MomentCtx): Question | null {
  const A: Record<string, string> = { ...(ctx.answers ?? {}) };
  /* A campaign named in the message counts as answered. */
  const named = formCampaignIn(said);
  if (!A.campaign && named) A.campaign = named;
  const set = (k: string) => ([v]: readonly string[]) => ({ answers: { [k]: v ?? "" } });

  const all = formCampaigns();
  const metaOf = (c: (typeof all)[number]) => `${c.department}, ${c.location}${c.contacted ? `, ${c.contacted} contacted` : ", draft"}`;

  if (!A.campaign) {
    const open = ctx.campaign ?? null;
    const openRow = open ? all.find((c) => c.id === open.id) : undefined;
    const ordered = openRow ? [openRow, ...all.filter((c) => c !== openRow)] : all;
    /* Four is enough to recognise yours; the rest sit behind a filter. */
    const top = ordered.slice(0, 4);
    const more = ordered.length - top.length;
    return {
      id: "form-campaign",
      step: "Campaign",
      reading: "Reading your request",
      found: "The request doesn't name a campaign",
      ask: "Which campaign is this form for?",
      why: "Responses land in that campaign's pipeline, matched to people by email.",
      dense: true,
      options: [
        ...top.map((c) => ({ id: c.id, label: c.name, meta: c === openRow ? `Current, ${metaOf(c)}` : metaOf(c) })),
        ...(more > 0 ? [{ id: "another", label: "Another campaign…", meta: `${more} more` }] : []),
        { id: "new", label: "A new campaign", meta: "Set up as a draft" },
      ],
      preset: openRow?.id,
      apply: set("campaign"),
    };
  }

  if (A.campaign === "another") {
    return {
      id: "form-campaign-all",
      step: "Campaign",
      ms: 350,
      found: "Looking further",
      ask: "Which one?",
      dense: true,
      filter: "Filter campaigns",
      options: all.map((c) => ({ id: c.id, label: c.name, meta: metaOf(c) })),
      apply: set("campaign"),
    };
  }

  if (A.campaign === "new" && !A.newName) {
    return {
      id: "form-new-name",
      step: "New campaign",
      ms: 350,
      found: "Starting a new campaign",
      ask: "What's the role called?",
      options: [],
      input: { placeholder: "e.g. Staff Data Engineer", verb: "Continue", max: 80 },
      apply: set("newName"),
    };
  }

  const camp = A.campaign === "new" ? undefined : campaignById(A.campaign);
  const campName = A.campaign === "new" ? A.newName! : camp?.name ?? A.campaign;

  if (!A.family) {
    const lead = camp ? inferFamily(camp.department, camp.name) : null;
    const fams = lead ? [...FAMILIES.filter((f) => f.id === lead), ...FAMILIES.filter((f) => f.id !== lead)] : FAMILIES;
    return {
      id: "form-family",
      step: "Kind of role",
      reading: `Looking at ${campName}`,
      ms: 350,
      found: `For ${campName}`,
      ask: "What kind of role is it?",
      why: "I'll pick questions that actually separate good candidates for it.",
      options: fams.map((f) => ({ id: f.id, label: f.label, meta: f.meta })),
      apply: set("family"),
    };
  }

  const family = A.family as Family;
  const famLabel = FAMILIES.find((f) => f.id === family)?.label ?? family;

  if (family !== "other" && !A.sub) {
    return {
      id: "form-sub",
      step: family === "engineering" ? "Stack" : family === "sales" ? "Sales role" : "Design work",
      ms: 350,
      found: `${famLabel} role`,
      ask: SUB_ASK[family],
      options: SUBTYPES[family].map((o) => ({ id: o.id, label: o.label, meta: o.meta })),
      apply: set("sub"),
    };
  }

  /* A new campaign's name already says what the role is. */
  if ((family === "other" || A.sub === "other") && !A.roleText && A.campaign === "new" && A.newName) A.roleText = A.newName;

  if ((family === "other" || A.sub === "other") && !A.roleText) {
    return {
      id: "form-role",
      step: "Role",
      ms: 350,
      found: "Not one of the usual shapes",
      ask: "What's the role, in a few words?",
      options: [],
      input: { placeholder: "e.g. Embedded firmware engineer", verb: "Continue", max: 80 },
      apply: set("roleText"),
    };
  }

  if (A.ideal === undefined) {
    const subLabel = family !== "other" && A.sub !== "other"
      ? SUBTYPES[family].find((o) => o.id === A.sub)?.label
      : undefined;
    const what = subLabel ?? A.roleText ?? famLabel;
    const same = what.trim().toLowerCase() === String(campName).trim().toLowerCase();
    return {
      id: "form-ideal",
      step: "Ideal hire",
      ms: 350,
      found: same ? `For ${campName}` : `${cap(what)} role, for ${campName}`,
      ask: "In one line, who's the ideal hire?",
      why: "I'll turn it into must-haves and the role description. Skip it and I'll work from the campaign.",
      options: [],
      input: { placeholder: IDEAL_PLACEHOLDER[family], verb: "Draft the form", optional: true },
      apply: set("ideal"),
    };
  }

  return null;
}

/* ── adding a client ───────────────────────────────────────────────────────
   One question: the company's name. Everything else (website, industry,
   contact, fee terms) is optional and added later on the Clients page, so a
   client is never held up by what is not known yet. The answers live in
   ctx.answers; the card at the end makes the client. */

export const FEE_OPTIONS = ["15% of first-year CTC", "18% of first-year CTC", "20% of first-year CTC", "A flat fee per hire"] as const;

/** The add-client answers, with what the message itself said filled in. */
export function clientAnswers(said: string, answers: Readonly<Record<string, string>> = {}): Record<string, string> {
  const A: Record<string, string> = { ...answers };
  const named = clientNameIn(said);
  if (!A.company && named) A.company = named;
  return A;
}

/** The next add-client question, or null when nothing is left to ask: only the name is. */
export function clientQuestion(said: string, ctx: MomentCtx): Question | null {
  const A = clientAnswers(said, ctx.answers);
  const set = (k: string) => ([v]: readonly string[]) => ({ answers: { [k]: v ?? "" } });

  if (!A.company?.trim()) {
    return {
      id: "client-company", step: "Company", reading: "Reading your request",
      found: "Adding a client", ask: "What's the company called?",
      why: "That's all I need. Website, contact and fee terms can be added on the Clients page later.",
      options: [], input: { placeholder: "e.g. Acme Fintech", verb: "Continue", max: 60 },
      apply: set("company"),
    };
  }
  return null;
}

/** "Neha Kapoor, neha@acme.in" → name and email, in either order. */
export function parseContact(text: string): { name: string; email: string } {
  const email = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/.exec(text)?.[0] ?? "";
  const name = text.replace(email, "").replace(/[<>()]/g, "").replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim();
  return { name, email };
}

/* ── setting up a campaign ─────────────────────────────────────────────────
   The key fields of the New campaign form, one at a time: role, client,
   team, work mode, city, hires, the job description, then pay, skills and
   agents. What the message already says is taken as answered. */

const CAMPAIGN_NAMED = /\bcampaign\s*(?:(?:called|named|for|to\s+(?:hire|recruit|find)|hiring)\s+|[:\-–—]\s*)(?:an?\s+)?["“]?(.+?)["”]?\s*$/i;


/**
 * Whether the signed-in person may add a client: a manager's (the server's `requireAdmin` on clients). A recruiter
 * picks from the clients they can already see, or none, and is never offered "Add X as a new client".
 */
export const mayAddClient = (): boolean => can(standingOf(getSession()), "client.manage");

/** The answer to "Who is it for?" that adds the company the person named as a new client. */
export const NEW_CLIENT = "new";

/* ── reading the message ── */

/** A bullet or a numbered line. */
const LIST_LINE = /^\s*(?:[-*•–·]|\d{1,2}[.)])\s+\S/;
/** What follows the request, longer than this, is a job description pasted with it. */
const JD_BLOCK_CHARS = 400;

/**
 * The request and what was pasted with it. The request is the first line (or, in a long single line, its first
 * sentence); the rest is a job description when it is long or a list of bullets, and otherwise only more of the
 * request, said over more than one line.
 */
export function briefParts(said: string): { head: string; body: string; jd: string } {
  const text = said.replace(/\r\n?/g, "\n").trim();
  const lines = text.split("\n");
  let head = text;
  let body = "";
  if (lines.length > 1) {
    head = lines[0]!.trim();
    body = lines.slice(1).join("\n").trim();
  } else if (text.length > JD_BLOCK_CHARS) {
    const cut = /^(.{12,300}?[.:!?])\s+(?=\S)/.exec(text);
    if (cut?.[1]) {
      head = cut[1];
      body = text.slice(cut[0].length).trim();
    }
  }
  const bullets = body.split("\n").filter((l) => LIST_LINE.test(l)).length;
  const jd = body.length > JD_BLOCK_CHARS || bullets >= 2 ? body : "";
  if (!jd && body) {
    head = text.replace(/\s*\n+\s*/g, " ");
    body = "";
  }
  return { head, body, jd: jd.slice(0, JD_MAX_CHARS) };
}

const NUM = `(?:${COUNT_WORD_PATTERN})`;
const MODE_WORDS = String.raw`(?:fully\s+)?(?:remote(?:ly)?|hybrid|on[\s-]?site|wfh|work\s+from\s+home|work\s+from\s+office)`;
const OPENING_UNITS = String.raw`(?:open(?:ing)?s?|positions?|hires?|vacanc(?:y|ies)|seats?|slots?|headcount)`;

/** The role as it is said, without the words about how many or where they work: "hiring 3 DevOps engineers, remote". */
function tidy(text: string): string {
  let t = text.trim();
  for (let i = 0; i < 4; i++) {
    const was = t;
    t = t
      .replace(/^(?:to\s+)?(?:hire|hiring|recruit(?:ing)?)\s+/i, "")
      .replace(new RegExp(`[\\s,;:(\\-–—]+${MODE_WORDS}\\)?$`, "i"), "")
      .replace(new RegExp(`[\\s,;(\\-–—]+(?:for\\s+)?${NUM}\\s+${OPENING_UNITS}\\)?$`, "i"), "")
      .replace(new RegExp(`[\\s,;(\\-–—]+(?:to\\s+)?(?:hire|hiring|need|needs)\\s+${NUM}(?:\\s+(?:people|hires?))?\\)?$`, "i"), "")
      .replace(new RegExp(`^${NUM}\\s+${OPENING_UNITS}\\s+(?:for|of|as|in)?\\s*`, "i"), "")
      .replace(new RegExp(`^${NUM}\\s+(?=[A-Za-z])`, "i"), "")
      .trim();
    if (t === was) break;
  }
  return t;
}

/** "remote", "WFH", "hybrid", "on-site" said in the request; null when it says none, or says more than one. */
export function workModeIn(text: string): WorkMode | null {
  const found = new Set<WorkMode>();
  if (/\b(?:remote(?:ly)?|wfh|work(?:ing)?\s+from\s+home|work\s+from\s+anywhere)\b/i.test(text)) found.add("remote");
  if (/\bhybrid\b/i.test(text)) found.add("hybrid");
  if (/\b(?:on[\s-]?site|in[\s-]?office|work\s+from\s+office|wfo|office[\s-]based)\b/i.test(text)) found.add("onsite");
  return found.size === 1 ? [...found][0]! : null;
}

/** Times a figure is a unit of something else ("5 years", "30 LPA", "3 days"), which is not a number of hires. */
const NOT_HIRES = String.raw`(?!\s*(?:\+|-|to\b|years?\b|yrs?\b|yoe\b|lpa\b|lakhs?\b|l\b|k\b|%|days?\b|months?\b|weeks?\b|x\b))`;
const OPENINGS_SAID: readonly RegExp[] = [
  /* "hire 3 DevOps engineers", "need two", "looking for 4" */
  new RegExp(String.raw`\b(?:hire|hiring|recruit(?:ing)?|need|needs|want|wants|looking\s+for|find|source)\s+(?:for\s+)?(${NUM})\b${NOT_HIRES}`, "i"),
  /* "5 openings", "2 hires" */
  new RegExp(String.raw`\b(${NUM})\s+${OPENING_UNITS}\b`, "i"),
  /* "openings: 3", "headcount of 4" */
  new RegExp(String.raw`\b(?:openings?|headcount|vacanc(?:y|ies)|positions?)\s*(?:of|:|=|-)?\s*(${NUM})\b${NOT_HIRES}`, "i"),
  /* "campaign for 3 DevOps engineers" */
  new RegExp(String.raw`\bcampaign\s+(?:called|named|for|to\s+(?:hire|recruit|find)|hiring)\s+(?:for\s+)?(?:hiring\s+)?(${NUM})\s+(?=[A-Za-z])`, "i"),
];

/** The number of hires the request says ("hire 3 DevOps engineers"), 1 to 99; null when it says none. */
export function openingsIn(text: string): number | null {
  for (const re of OPENINGS_SAID) {
    const n = parseOpenings(re.exec(text)?.[1] ?? "");
    if (n !== null) return n;
  }
  return null;
}

/** What the request says besides the role, the client and the city: how they work, how many, the job description. */
export type CampaignHints = { mode: WorkMode | null; openings: number | null; jd: string };

export function campaignHintsIn(said: string): CampaignHints {
  const { head, jd } = briefParts(said);
  return { mode: workModeIn(head), openings: openingsIn(head), jd };
}

/**
 * What a "create a campaign called ..." message names: the role, the client as it was said, and the city.
 * "Data Analyst for the client Orchid Bank in Pune" is the role Data Analyst, the client Orchid Bank and
 * the city Pune, never one long title. A client is only cut from the title when the words say it is one
 * ("for the client X", "for Razorpay" with Razorpay a client already); a city when it is one we know, said in
 * any of its spellings and returned under the one name the console uses ("from Bangalore" is Bengaluru).
 */
export function campaignBriefIn(said: string): { role: string | null; client: string | null; city: string | null } {
  const { role, client, city } = campaignAskIn(said);
  return { role, client, city };
}

/** "5-8 yrs", "30 to 45 LPA", "40" as the range the draft reads ("5 to 8", "40"); null when there is no figure. */
function rangeText(text: string | undefined): string | null {
  const ns = (text?.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 2);
  return ns.length ? ns.join(" to ") : null;
}

/** Everything a request to start a campaign says besides how they work and how many: the brief, with the figures. */
export type CampaignAsk = {
  role: string | null; client: string | null; city: string | null;
  /** Years of experience as the draft reads them ("5 to 8", "5"), the pay in lakhs ("30 to 45"), the must-haves as typed. */
  exp: string | null; comp: string | null; skills: string | null;
  /** "up to 60 LPA": the top of the pay range alone. */
  compTop: string | null;
};

/**
 * What a request to start a campaign says: the role, the client, the city, and the experience, pay and must-haves,
 * from the ways people put it: "for a Backend Engineer at Cobalt Payments", "for Cobalt Payments' Backend Engineer",
 * "on behalf of Cobalt Payments", "client: Cobalt Payments, role: Backend Engineer", "from Cobalt Payments". A client
 * is matched to the workspace's by its name however it is capitalised, spaced or ended ("Pvt Ltd", "Technologies").
 */
export function campaignAskIn(said: string): CampaignAsk {
  const none: CampaignAsk = { role: null, client: null, city: null, exp: null, comp: null, skills: null, compTop: null };
  const known = getClients().clients;
  const clientNamed = (text: string) => companyIn(text, known);
  /* A company that is not one of the clients is a client to add only for someone who may add it; for a recruiter
     it stays in the role's words, so nothing they said is lost and nothing offers to add it. */
  const asClient = (text: string | undefined | null): string | null => {
    const t = (text ?? "").trim();
    if (!t) return null;
    const match = clientNamed(t);
    return match ? match.name : mayAddClient() ? t : null;
  };
  /* A place we know (the common cities, and wherever one of the workspace's clients is): "in Fintech" or
     "in Data Science" is part of the role, not a city. */
  const clientPlaces = new Set(known.map((c) => (c.location ?? "").trim().toLowerCase()).filter(Boolean));
  const placeOf = (text: string): string | null => {
    const t = text.trim();
    return knownCity(t) ?? (clientPlaces.has(t.toLowerCase()) ? canonicalCity(t) : null);
  };

  const labelled = takeLabelled(briefParts(said).head.replace(/[.!?:]+$/, ""));
  const lf = labelled.fields;
  const withSkills = takeSkills(labelled.rest);
  const withExp = takeExperience(withSkills.rest);
  const withCtc = takeCtc(withExp.rest);
  const behalf = takeBehalf(withCtc.rest);
  const figures = {
    exp: rangeText(lf.exp) ?? withExp.exp,
    comp: rangeText(lf.comp) ?? withCtc.comp,
    compTop: withCtc.top,
    skills: lf.skills ?? withSkills.skills,
  };
  const given = { client: asClient(lf.client) ?? asClient(behalf.client), role: lf.role?.trim() || null, city: lf.city ? placeOf(lf.city) ?? canonicalCity(lf.city) : null };

  const m = CAMPAIGN_NAMED.exec(behalf.rest);
  let rest = tidy(m?.[1] ?? "");
  /* What follows the role after commas ("..., Cobalt Payments, Pune, hybrid, 2 openings"): a client we have, a city we
     know, how they work and how many are each said once and taken out; anything else stays in its place. */
  let fromClause: string | null = null;
  let cityClause: string | null = null;
  if (rest.includes(",") || rest.includes(";")) {
    const [first = "", ...others] = rest.split(/\s*[,;]\s*/);
    const kept: string[] = [];
    for (const clause of others) {
      const c = clause.trim();
      if (!c) continue;
      if (MODE_CLAUSE.test(c) || COUNT_CLAUSE.test(c)) continue;
      const known = clientNamed(c);
      if (known && !fromClause) { fromClause = known.name; continue; }
      const place = placeOf(c);
      if (place && !cityClause) { cityClause = place; continue; }
      kept.push(c);
    }
    if (first.trim()) rest = tidy([first.trim(), ...kept].join(", "));
  }
  if (rest.length < 2) {
    return { ...none, ...figures, role: given.role, client: given.client, city: given.city };
  }
  /* "for Razorpay" names the client, not the role. */
  const whole = clientNamed(rest);
  if (whole && !given.role) return { ...none, ...figures, role: null, client: whole.name, city: given.city };

  let city: string | null = given.city ?? cityClause;
  const PLACE = String.raw`[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,2}`;
  const where = new RegExp(String.raw`^(.*\S)\s+(?:in|at|from|near|based in|based out of|located in)\s+(${PLACE})$`, "i").exec(rest);
  const there = where?.[2] ? placeOf(where[2]) : null;
  if (where?.[1] && there) {
    city = city ?? there;
    rest = tidy(where[1]);
  } else {
    /* "DevOps Engineer, Bangalore": the city after a comma or a dash. */
    const tail = new RegExp(String.raw`^(.*\S)\s*[,\-–—]\s*(${PLACE})$`).exec(rest);
    const named = tail?.[2] ? placeOf(tail[2]) : null;
    if (tail?.[1] && named) {
      city = city ?? named;
      rest = tidy(tail[1]);
    }
  }
  let client: string | null = given.client ?? fromClause;
  /* "Cobalt Payments' Senior Backend Engineer": the company's own role. */
  const own = splitPossessive(rest);
  if (!client && own && (clientNamed(own.client) || mayAddClient())) {
    client = asClient(own.client);
    if (client) rest = own.role;
  }
  /* "the client Cobalt Payments, a Backend Engineer", "Cobalt Payments, a Backend Engineer": the company first. */
  const first = !client ? /^(?:the\s+client\s+|client\s+)?(.+?)\s*[,:;]\s*(?:an?\s+)?(.+)$/i.exec(rest) : null;
  if (first?.[1] && first[2] && (clientNamed(first[1]) || (/^(?:the\s+)?client\s/i.test(rest) && mayAddClient()))) {
    client = asClient(first[1]);
    if (client) rest = first[2].trim();
  }
  const forClient = /^(.*\S)\s+for\s+(?:the\s+)?(client\s+)?(.+)$/i.exec(rest);
  if (!client && forClient?.[1] && forClient[3]) {
    const named = forClient[3].trim();
    const match = clientNamed(named);
    if (match || (forClient[2] && mayAddClient())) {
      client = match?.name ?? named;
      rest = forClient[1].trim();
    }
  }
  /* "Backend Engineer at Zorblax Studios", "... from Zorblax Studios": a place that is not a city we know, said after
     "at" or "from", is the company hiring (a client, like "for the client X"), never part of the role. Lower-case words
     ("at scale", "at night") are not a company unless it is one of the workspace's clients. */
  if (!client) {
    const at = /^(.*\S)\s+(?:at|from)\s+(.+)$/i.exec(rest);
    const company = at?.[2]?.trim() ?? "";
    if (at?.[1] && company) {
      const match = clientNamed(company);
      if (match || (mayAddClient() && /^[A-Z0-9]/.test(company) && company.split(/\s+/).length <= 4)) {
        client = match?.name ?? company;
        rest = at[1].trim();
      }
    }
  }
  /* "Data Engineer for Orbit Labs": a capitalised company after "for" is the client too, for someone who may add one;
     "for the Payments team" is a team of the same company, and stays in the role. */
  if (!client) {
    const forCo = /^(.*\S)\s+for\s+([A-Z0-9][\p{L}0-9&.'-]*(?:\s+[A-Z0-9][\p{L}0-9&.'-]*){0,3})$/u.exec(rest);
    const company = forCo?.[2]?.trim() ?? "";
    /* Two or more capitalised words, none of them a field or a team ("Orbit Labs", not "Payments" or "Data Science"). */
    const DOMAIN = /\b(?:teams?|department|division|group|squad|desk|org|organi[sz]ation|data|science|payments?|platform|infrastructure|engineering|product|design|sales|marketing|finance|security|growth|operations|support|research|analytics|ai|ml|devops|cloud|mobile|web|backend|frontend|fullstack)\b/i;
    if (forCo?.[1] && company && company.split(/\s+/).length >= 2 && mayAddClient() && !DOMAIN.test(company)) {
      client = asClient(company);
      if (client) rest = forCo[1].trim();
    }
  }
  /* A title that long is a sentence, not a role: it is asked for. */
  const role = given.role ?? (rest.length < 2 || rest.length > 120 ? null : rest);
  return { ...none, ...figures, role, client, city };
}

export function campaignNameIn(said: string): string | null {
  return campaignBriefIn(said).role;
}

/**
 * The new-campaign answers, with what the message named: the role, client and city, how they work, how many
 * hires, and a job description pasted with it. Only what was not answered is filled in.
 */
export function newCampaignAnswers(said: string, answers: Readonly<Record<string, string>> = {}): Record<string, string> {
  const A: Record<string, string> = { ...answers };
  const brief = campaignAskIn(said);
  if (!A.role && brief.role) A.role = brief.role;
  const clients = getClients().clients;
  const named = (brief.client ? companyIn(brief.client, clients) : undefined) ?? companySaid(said, clients);
  if (!A.client && named) A.client = named.id;
  /* "Add X as a new client" was the answer and X is in Clients now (Create added it): the campaign is for that
     client, by its own id, so the card that stays on screen names it and does not fall back to "Internal hire". */
  if (A.client === NEW_CLIENT && named) A.client = named.id;
  /* A client the message names that is not in Clients yet is a new client, by its name alone: it is added with the
     campaign and not asked about. It stays named once it is the answer (`client` is then NEW_CLIENT), because the
     card and the create read the name from here: dropping it is what made a campaign an "Internal hire". */
  if (!named && brief.client && (!A.client || A.client === NEW_CLIENT)) {
    A.newClient = brief.client;
    A.client = NEW_CLIENT;
  }
  if (A.location === undefined && brief.city) A.location = brief.city;
  if (A.exp === undefined && brief.exp) A.exp = brief.exp;
  if (A.comp === undefined && brief.comp) A.comp = brief.comp;
  /* "up to 60 LPA" is the top of the range and nothing else: the pay is then said, and not asked. */
  if (A.comp === undefined && brief.compTop) { A.comp = ""; A.compTop = brief.compTop; }
  if (A.skills === undefined && brief.skills) A.skills = brief.skills;
  const hints = campaignHintsIn(said);
  if (!A.mode && hints.mode) A.mode = hints.mode;
  if (!A.openings && hints.openings) A.openings = String(hints.openings);
  if (A.jd === undefined && hints.jd) A.jd = hints.jd;
  return A;
}

/**
 * The company to add with the campaign: set when "Add X as a new client" was the answer to "Who is it for?", empty
 * otherwise. The card names it ("For X, a new client") and Create adds it, by its name alone, active.
 */
export const newClientOf = (a: Readonly<Record<string, string>>): string =>
  a.client === NEW_CLIENT ? (a.newClient ?? "").trim() : "";

/** The number tiles, and a number the message named that is not one of them. */
const COUNT_TILES = [1, 2, 3, 5];
const COUNT_NAME: Readonly<Record<number, string>> = { 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten" };

export function openingsOptions(named = 0): Option[] {
  const counts = named >= 1 && named <= MOST_OPENINGS && !COUNT_TILES.includes(named) ? [...COUNT_TILES, named].sort((a, b) => a - b) : COUNT_TILES;
  return counts.map((n) => ({ id: String(n), label: COUNT_NAME[n] ?? String(n) }));
}

/** The tiles of "Do you have the job description?": `paste` opens a box, `upload` a file picker, `later` is no text. */
const JD_TILES = ["paste", "upload", "later"] as const;

const wordsIn = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * "Do you have the job description?": paste it, upload a file, or add it later. The answer is `[text, source]`.
 * Asked once while a campaign is set up, and inline on the campaign's card when its role spec is asked for without one.
 */
export function jdQuestion(role: string): Question {
  return {
    id: "nc-jd", step: "Job description", ms: 350, found: role, ask: "Do you have the job description?",
    why: "I'll draft the role spec from it.",
    options: [
      { id: "paste", label: "Paste it", meta: "Opens a box for the text" },
      { id: "upload", label: "Upload a file", meta: "PDF, Word or text" },
      { id: "later", label: "I'll add it later", meta: "It can be added on the campaign" },
    ],
    document: { placeholder: "Paste the job description", verb: "Use this", accept: ".pdf,.docx,.txt,.md", max: JD_MAX_CHARS, min: 40 },
    say: ([text = "", source = ""]) => (text.trim() && !(JD_TILES as readonly string[]).includes(text) ? `${source || "Pasted"}, ${wordsIn(text)} words` : "I'll add it later"),
    apply: ([text = ""]) => {
      /* A tile's own id is not text (the way a walker through the tiles answers): nothing to add. */
      const jd = (JD_TILES as readonly string[]).includes(text) ? "" : text.trim().slice(0, JD_MAX_CHARS);
      return { answers: { jd } };
    },
  };
}

/** One optional line of "5 to 8 years, 30 to 45 LPA, Go and Kafka" as the three answers it holds; each is answered, said or not. */
export function moreFrom(text: string): Record<string, string> {
  const withSkills = takeSkills(text);
  const withExp = takeExperience(withSkills.rest);
  const withCtc = takeCtc(withExp.rest);
  /* What is left after the figures are the must-haves, unless "must have" said so already. */
  const left = withCtc.rest.replace(/^[\s,;.]+|[\s,;.]+$/g, "");
  const skills = withSkills.skills ?? left;
  return {
    exp: withExp.exp ?? "",
    comp: withCtc.comp ?? "",
    ...(withCtc.top ? { compTop: withCtc.top } : {}),
    skills,
  };
}

/** The next new-campaign question, or null when nothing is left to ask (the connected chat builds on it). */
export function newCampaignQuestion(said: string, ctx: MomentCtx): Question | null {
  /* What was answered, and what the message says besides: a question is asked only for what neither has. What
     the message says is still put as an answer (a preset), so it is shown as one and can be changed. */
  const raw = ctx.answers ?? {};
  const A = newCampaignAnswers(said, raw);
  const set = (k: string) => ([v]: readonly string[]) => ({ answers: { [k]: v ?? "" } });
  const { clients } = getClients();
  const fromMessage = "from your message";

  if (!A.role?.trim()) {
    return {
      id: "nc-role", step: "Role", reading: "Reading your request", found: "Setting up a campaign",
      ask: "What's the role?", options: [], input: { placeholder: "e.g. Senior Backend Engineer", verb: "Continue", max: 80 },
      apply: set("role"),
    };
  }
  const role = A.role.trim();
  if (!A.client) {
    const open = clients.filter((c) => c.status !== "inactive");
    const adding = A.newClient?.trim();
    const top = open.slice(0, adding ? 3 : 4);
    return {
      id: "nc-client", step: "Client", ms: 350, found: role, ask: "Who is it for?", dense: true,
      options: [
        /* The company the message named, not in Clients yet: added by its name alone, with the campaign. */
        ...(adding ? [{ id: NEW_CLIENT, label: `Add ${adding} as a new client`, meta: "Just the name. The rest can wait." }] : []),
        ...top.map((c) => ({ id: c.id, label: c.name, meta: [c.industry, c.location].filter(Boolean).join(", ") })),
        ...(open.length > top.length ? [{ id: "another", label: "Another client…", meta: `${open.length - top.length} more` }] : []),
        { id: "none", label: "No client", meta: "An internal hire" },
      ],
      apply: set("client"),
    };
  }
  if (A.client === "another") {
    return {
      id: "nc-client-all", step: "Client", ms: 300, found: "Looking further", ask: "Which client?", dense: true, filter: "Filter clients",
      options: clients.filter((c) => c.status !== "inactive").map((c) => ({ id: c.id, label: c.name, meta: [c.industry, c.location].filter(Boolean).join(", ") })),
      apply: set("client"),
    };
  }
  if (!A.dept) {
    /* The role's own words usually say it ("Backend Engineer" is Engineering): taken, shown, and one press to change. */
    const inferred = departmentFor(role);
    return {
      id: "nc-dept", step: "Department", ms: 350, found: role, ask: "Which department is it in?",
      options: DEPARTMENTS.slice(0, 6).map((d) => ({ id: d, label: d })), apply: set("dept"),
      ...(inferred ? { preset: inferred, presetNote: "from the role", silent: true } : {}),
    };
  }
  if (!raw.mode) {
    return {
      id: "nc-mode", step: "Work mode", ms: 350, found: role, ask: "Where will they work?",
      options: [
        { id: "onsite", label: "On-site", meta: "In the office every day" },
        { id: "hybrid", label: "Hybrid", meta: "Three days in the office" },
        { id: "remote", label: "Remote", meta: "Anywhere in India" },
      ],
      /* Said in the message ("remote", "WFH", "hybrid"): taken, shown, and one press to change. */
      ...(A.mode ? { preset: A.mode, presetNote: fromMessage, silent: true } : {}),
      apply: set("mode"),
    };
  }
  if (raw.location === undefined) {
    const city = clients.find((c) => c.id === A.client)?.location;
    /* The city the message named, said in any spelling and shown under the one name: "Location: Bengaluru". */
    const named = A.location?.trim() ?? "";
    return {
      id: "nc-location", step: "Location", ms: 350, found: role,
      ask: A.mode === "remote" ? "Any city they should be near?" : "Which city?",
      why: city && A.mode !== "remote" ? `Skip it to use ${city}, where the client is.` : undefined,
      options: [], input: { placeholder: city ? `e.g. ${city}` : "e.g. Bengaluru", verb: "Continue", optional: A.mode === "remote" || !!city, max: 60 },
      ...(named ? { preset: named, presetNote: fromMessage, silent: true } : {}),
      apply: ([v]) => ({ answers: { location: canonicalCity(v) } }),
    };
  }
  if (!raw.openings) {
    const named = Number(A.openings) || 0;
    return {
      id: "nc-openings", step: "Openings", ms: 350, found: role, ask: "How many hires?",
      options: openingsOptions(named),
      ...(named ? { preset: String(named), presetNote: fromMessage, silent: true } : {}),
      apply: set("openings"),
    };
  }
  /* The job description, asked once: what the role spec is drafted from. A message that carried one has answered. */
  if (A.jd === undefined) return jdQuestion(role);
  /* Experience, pay and must-haves, in one optional line, and only when nothing of them was said and there is no
     job description to say them: three questions in a row for what can wait is what makes a set-up feel long. */
  if (A.exp === undefined && A.comp === undefined && A.skills === undefined && !A.jd.trim()) {
    return {
      id: "nc-more", step: "Experience, CTC, must-haves", ms: 350, found: role, ask: "Anything to add on experience, CTC or must-haves?",
      why: "Say them in one line, like 5 to 8 years, 30 to 45 LPA, Go and Kafka. Skip it if it can wait.",
      options: [], input: { placeholder: "e.g. 5 to 8 years, 30 to 45 LPA, Go and Kafka", verb: "Continue", optional: true, max: 240 },
      apply: ([text = ""]) => ({ answers: moreFrom(text) }),
    } as Question;
  }
  if (A.agents === undefined) {
    return {
      id: "nc-agents", step: "Agents", ms: 350, found: role, ask: "Which agents should start?",
      why: "Pick any. Nothing starts until you create it.",
      options: [
        { id: "Sourcing", label: "Sourcing", meta: "Finds and ranks people" },
        { id: "Outreach", label: "Outreach", meta: "Drafts messages for you to approve" },
        { id: "Screening", label: "Screening", meta: "Sends the screening form" },
      ],
      multi: { min: 1, max: 3, verb: "Continue" },
      apply: (ids) => ({ answers: { agents: ids.join(",") } }),
    };
  }
  return null;
}

/** The criteria and fit a comparison should use, for a campaign. */
export function criteriaFor(camp: CampaignKey) {
  return { criteria: CRITERIA_FOR[camp], meets: MEETS_FOR[camp] };
}
