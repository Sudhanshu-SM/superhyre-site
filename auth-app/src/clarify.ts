import type { MomentCtx, MomentKind } from "./moments";
import {
  CAMPAIGNS_OF, CRITERIA_FOR, MEETS_FOR, campaignIn, candidatesIn, roleIn,
} from "./moments";
import type { CampaignKey } from "./orchestrator";
import { FLEET, SCOPED, campaignName } from "./orchestrator";
import { CANDIDATES } from "./sourcing";
import { CAMPAIGN_ROWS } from "./campaignsData";
import type { Family } from "./formKit";
import { FAMILIES, SUBTYPES, cap, familyForDepartment } from "./formKit";
import { campaignById, listCampaignStubs } from "./formsStore";
import { formCampaignIn } from "./moments";
import { getSession } from "./roleStore";
import { getClients } from "./campaignStore";
import { clientNameIn } from "./clients";
import { DEPARTMENTS } from "./campaignsData";

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
  input?: { placeholder: string; verb: string; optional?: boolean; max?: number; rows?: number; /** What the log says in place of the answer when it is skipped ("Skipped" if not said). */ skipped?: string };
  /** The live phase line while the agent looks, and how long it looks. */
  reading?: string;
  ms?: number;
  /** An option id answered for the recruiter (the campaign they have open),
      shown as an assumption they can change. */
  preset?: string;
  /** The step's name once answered ("Campaign"), so the log reads as one
      row per step: "Campaign: Senior Backend Engineers · Change". */
  step?: string;
  /** Compact one-line tiles, for long lists such as campaigns. */
  dense?: boolean;
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
  /* Adding clients and campaigns is an admin's; a recruiter gets the reply
     straight away, with nothing asked first. */
  if (kind === "client") return getSession().role === "admin" ? clientQuestion(said, ctx) : null;
  if (kind === "campaign-new") return getSession().role === "admin" ? newCampaignQuestion(said, ctx) : null;

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
    const lead = camp ? familyForDepartment(camp.department) : null;
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
   team, work mode, location, openings, pay, skills, agents. The rest (dates,
   recruiters, channels, the JD) are in the full form. */

const CAMPAIGN_NAMED = /\bcampaign\s+(?:called|named|for)\s+(?:an?\s+)?["“]?(.+?)["”]?\s*$/i;

/** Cities people name when they open a campaign, so "in Pune" is a place and "in Cloud Platform" is not. */
const CITIES = [
  "bengaluru", "bangalore", "pune", "mumbai", "delhi", "new delhi", "gurgaon", "gurugram", "noida", "hyderabad", "chennai",
  "kolkata", "ahmedabad", "jaipur", "kochi", "coimbatore", "indore", "chandigarh", "thiruvananthapuram",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The answer to "Who is it for?" that adds the company the person named as a new client. */
export const NEW_CLIENT = "new";

/**
 * What a "create a campaign called ..." message names: the role, the client as it was said, and the city.
 * "Data Analyst for the client Orchid Bank in Pune" is the role Data Analyst, the client Orchid Bank and
 * the city Pune, never one long title. A client is only cut from the title when the words say it is one
 * ("for the client X", "for Razorpay" with Razorpay a client already); a city when it is one we know.
 */
export function campaignBriefIn(said: string): { role: string | null; client: string | null; city: string | null } {
  const m = CAMPAIGN_NAMED.exec(said.trim().replace(/[.!?]+$/, ""));
  let rest = m?.[1]?.trim() ?? "";
  if (rest.length < 2) return { role: null, client: null, city: null };
  const known = getClients().clients;
  const clientNamed = (text: string) => known.find((c) => c.name.trim().toLowerCase() === text.trim().toLowerCase());
  /* "for Razorpay" names the client, not the role. */
  const whole = clientNamed(rest);
  if (whole) return { role: null, client: whole.name, city: null };

  let city: string | null = null;
  const where = /^(.*\S)\s+(?:in|at|based in|located in)\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,2})$/.exec(rest);
  if (where?.[1] && where[2]) {
    const place = where[2].trim();
    // A place we know (the common cities, and wherever one of the workspace's clients is): "in Fintech" or
    // "in Data Science" is part of the role, not a city.
    const knownPlaces = new Set([...CITIES, ...known.map((c) => (c.location ?? "").trim().toLowerCase()).filter(Boolean)]);
    if (knownPlaces.has(place.toLowerCase())) {
      city = place.replace(/\b([a-z])/g, (c) => c.toUpperCase());
      rest = where[1].trim();
    }
  }
  let client: string | null = null;
  const forClient = /^(.*\S)\s+for\s+(?:the\s+)?(client\s+)?(.+)$/i.exec(rest);
  if (forClient?.[1] && forClient[3]) {
    const named = forClient[3].trim();
    const match = clientNamed(named);
    if (match || forClient[2]) {
      client = match?.name ?? named;
      rest = forClient[1].trim();
    }
  }
  /* "Backend Engineer at Zorblax Studios": a place that is not a city we know, said after "at", is the company
     hiring (offered as a client, like "for the client X"), never part of the role. Lower-case words ("at scale",
     "at night") are not a company unless it is one of the workspace's clients. */
  if (!client) {
    const at = /^(.*\S)\s+at\s+(.+)$/i.exec(rest);
    const company = at?.[2]?.trim() ?? "";
    if (at?.[1] && company) {
      const match = clientNamed(company);
      if (match || (/^[A-Z0-9]/.test(company) && company.split(/\s+/).length <= 4)) {
        client = match?.name ?? company;
        rest = at[1].trim();
      }
    }
  }
  if (rest.length < 2) return { role: null, client, city };
  return { role: rest, client, city };
}

export function campaignNameIn(said: string): string | null {
  return campaignBriefIn(said).role;
}

/** The new-campaign answers, with the role, client and city the message named. */
export function newCampaignAnswers(said: string, answers: Readonly<Record<string, string>> = {}): Record<string, string> {
  const A: Record<string, string> = { ...answers };
  const brief = campaignBriefIn(said);
  if (!A.role && brief.role) A.role = brief.role;
  const clients = getClients().clients;
  const named =
    clients.find((c) => brief.client !== null && c.name.trim().toLowerCase() === brief.client.trim().toLowerCase()) ??
    clients.find((c) => new RegExp(`\\b${escapeRe(c.name)}\\b`, "i").test(said));
  if (!A.client && named) A.client = named.id;
  /* "Add X as a new client" was the answer and X is in Clients now (Create added it): the campaign is for that
     client, by its own id, so the card that stays on screen names it and does not fall back to "Internal hire". */
  if (A.client === NEW_CLIENT && named) A.client = named.id;
  /* A client the message names that is not in Clients yet is not dropped: it is offered as a new client, by its name
     alone. It stays named once "Add X as a new client" is the answer (`client` is then NEW_CLIENT), because the card
     and the create read the name from here: dropping it at that point is what made the campaign an "Internal hire". */
  if (!named && brief.client && (!A.client || A.client === NEW_CLIENT)) A.newClient = brief.client;
  if (A.location === undefined && brief.city) A.location = brief.city;
  return A;
}

/**
 * The company to add with the campaign: set when "Add X as a new client" was the answer to "Who is it for?", empty
 * otherwise. The card names it ("For X, a new client") and Create adds it, by its name alone, as a prospect.
 */
export const newClientOf = (a: Readonly<Record<string, string>>): string =>
  a.client === NEW_CLIENT ? (a.newClient ?? "").trim() : "";

/** The next new-campaign question, or null when nothing is left to ask (the connected chat builds on it). */
export function newCampaignQuestion(said: string, ctx: MomentCtx): Question | null {
  const A = newCampaignAnswers(said, ctx.answers);
  const set = (k: string) => ([v]: readonly string[]) => ({ answers: { [k]: v ?? "" } });
  const { clients } = getClients();

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
    return {
      id: "nc-dept", step: "Team", ms: 350, found: role, ask: "Which team is it in?",
      options: DEPARTMENTS.slice(0, 6).map((d) => ({ id: d, label: d })), apply: set("dept"),
    };
  }
  if (!A.mode) {
    return {
      id: "nc-mode", step: "Work mode", ms: 350, found: role, ask: "Where will they work?",
      options: [
        { id: "onsite", label: "On-site", meta: "In the office every day" },
        { id: "hybrid", label: "Hybrid", meta: "Three days in the office" },
        { id: "remote", label: "Remote", meta: "Anywhere in India" },
      ],
      apply: set("mode"),
    };
  }
  if (A.location === undefined) {
    const city = clients.find((c) => c.id === A.client)?.location;
    return {
      id: "nc-location", step: "Location", ms: 350, found: role,
      ask: A.mode === "remote" ? "Any city they should be near?" : "Which city?",
      why: city && A.mode !== "remote" ? `Skip it to use ${city}, where the client is.` : undefined,
      options: [], input: { placeholder: city ? `e.g. ${city}` : "e.g. Bengaluru", verb: "Continue", optional: A.mode === "remote" || !!city, max: 60 },
      apply: set("location"),
    };
  }
  if (!A.openings) {
    return {
      id: "nc-openings", step: "Openings", ms: 350, found: role, ask: "How many hires?",
      options: ["1", "2", "3", "5"].map((n) => ({ id: n, label: n === "1" ? "One" : n === "2" ? "Two" : n === "3" ? "Three" : "Five" })),
      apply: set("openings"),
    };
  }
  if (A.comp === undefined) {
    return {
      id: "nc-comp", step: "CTC range", ms: 350, found: role, ask: "What's the CTC range, in lakhs?",
      why: "Kept between you and the client unless you choose to show it.",
      options: [], input: { placeholder: "e.g. 30 to 45", verb: "Continue", optional: true, max: 40 },
      apply: set("comp"),
    };
  }
  if (A.skills === undefined) {
    return {
      id: "nc-skills", step: "Must-haves", ms: 350, found: role, ask: "What must a candidate have?",
      why: "Separate them with commas. Candidates without them rank lower.",
      options: [], input: { placeholder: "e.g. Go, Postgres at scale", verb: "Continue", optional: true, max: 200 },
      apply: set("skills"),
    };
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
