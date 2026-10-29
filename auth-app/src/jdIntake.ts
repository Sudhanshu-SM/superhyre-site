import { type CampaignDraft, blankDraft, draftProblems } from "./campaignDraft";
import { companyIn } from "./campaignAsk";

/**
 * Adding a role from its job description. The description is read into the facts it states (server:
 * `POST /v1/campaigns/jd/read`); what it does not state is asked for, one question at a time, and only what is
 * missing: a description that says everything is created without a single question. The questions are the filters a
 * search needs (client, how it is worked, where, experience, notice, pay), each skippable but the client, which every
 * campaign has, and an answer can stand for the rest of a batch. Nothing here touches the network or the page: it is the
 * rules, kept apart so they are tested.
 */

export type WorkMode = "onsite" | "hybrid" | "remote";

/** What the server read from one description. Anything it did not find is null (or an empty list). */
export type JdFacts = {
  title: string;
  client: string | null;
  department: string | null;
  seniority: string | null;
  employment: "full-time" | "contract" | "intern" | null;
  workMode: WorkMode | null;
  locations: string[];
  openings: number | null;
  expMin: number | null;
  expMax: number | null;
  /** Annual pay as stated: lakhs per annum for INR, thousands for another currency. */
  comp: { currency: string; min: number | null; max: number | null } | null;
  notice: string | null;
  mustHave: string[];
  niceToHave: string[];
  education: string | null;
};

/** One row of a sheet, or one file: a description and what its own columns said beside it. */
export type RoleSource = { label: string; jd: string; hints: Record<string, string> };

export type AskKey = "client" | "workMode" | "locations" | "experience" | "notice" | "comp";
export const ASK_ORDER: readonly AskKey[] = ["client", "workMode", "locations", "experience", "notice", "comp"];

export type Answers = {
  /** A client of the workspace, by id. */
  clientId?: string;
  /** A company that is not a client yet, by name: the client is added (or the one of that name used). */
  newClient?: string;
  workMode?: WorkMode;
  locations?: string[];
  exp?: { min: number | null; max: number | null };
  notice?: string;
  comp?: { min: number | null; max: number | null };
  /** Questions the person chose not to answer: they are not asked again (for this role, or for the batch). */
  skipped?: AskKey[];
};

export type AskOption = { id: string; label: string; hint?: string };
export type Ask = {
  key: AskKey;
  text: string;
  options: AskOption[];
  /** Cannot be skipped: every campaign has a client, so that question is asked until it is answered. */
  required?: true;
  /** A box to type an answer in, beside the options. */
  input?: { label: string; placeholder: string };
};

export type ClientLite = { id: string; name: string; status?: string };

/** Which client the description names: one the workspace has, one it does not, or none. */
export type ClientSaid = { kind: "match"; id: string; name: string } | { kind: "named"; name: string } | { kind: "none" };

export function clientSaid(named: string | null, clients: readonly ClientLite[]): ClientSaid {
  const name = named?.trim();
  if (!name) return { kind: "none" };
  const there = companyIn(name, clients);
  return there ? { kind: "match", id: there.id, name: there.name } : { kind: "named", name };
}

const CLIENT_OPTIONS_SHOWN = 8;
export const EXPERIENCE_OPTIONS: ReadonlyArray<AskOption & { min: number; max: number | null }> = [
  { id: "0-2", label: "0–2 years", min: 0, max: 2 },
  { id: "2-5", label: "2–5 years", min: 2, max: 5 },
  { id: "5-8", label: "5–8 years", min: 5, max: 8 },
  { id: "8+", label: "8+ years", min: 8, max: null },
];
export const NOTICE_CHOICES = ["Immediate", "Up to 30 days", "Up to 60 days", "Up to 90 days"] as const;

export type AskContext = {
  clients: readonly ClientLite[];
  /** Answers that stand for every role that lacks them (set by "use this for the rest"). */
  defaults: Answers;
  /** Cities already given in this batch, offered again. */
  cities: readonly string[];
};

const has = (v: unknown) => v !== undefined;
const effectiveMode = (facts: JdFacts, a: Answers): WorkMode | null => a.workMode ?? facts.workMode;

/**
 * The questions this role still needs asked, in order: what the description did not state and no answer (its own
 * or one that stands for the batch) has already given. The client is asked unless the description names one the
 * workspace has: every campaign is for a client, so there is no skipping it, and a company that is not a client yet
 * is typed by name.
 */
export function asksFor(facts: JdFacts, answers: Answers, ctx: AskContext): Ask[] {
  const out: Ask[] = [];
  const merged: Answers = { ...ctx.defaults, ...answers };
  const said = clientSaid(facts.client, ctx.clients);

  if (said.kind !== "match" && !has(merged.clientId) && !has(merged.newClient)) {
    const pickable = ctx.clients.filter((c) => c.status !== "inactive");
    out.push({
      key: "client",
      text: said.kind === "named" ? `${said.name} isn't one of your clients yet.` : "Which client is this role for?",
      options: [
        ...(said.kind === "named" ? [{ id: "new", label: `Add ${said.name} as a client` }] : []),
        ...pickable.slice(0, CLIENT_OPTIONS_SHOWN).map((c) => ({ id: `client:${c.id}`, label: c.name })),
      ],
      /* A company that is not listed is typed: by name alone, whoever the person is. */
      input: { label: pickable.length || said.kind === "named" ? "Another client" : "The client's company name", placeholder: "Type the company's name" },
      required: true,
    });
  }
  if (!facts.workMode && !has(merged.workMode)) {
    out.push({
      key: "workMode",
      text: "How is this role worked?",
      options: [{ id: "onsite", label: "In the office" }, { id: "hybrid", label: "Hybrid" }, { id: "remote", label: "Remote" }],
    });
  }
  if (!facts.locations.length && !has(merged.locations) && effectiveMode(facts, merged) !== "remote") {
    out.push({
      key: "locations",
      text: "Where should the person be based?",
      options: ctx.cities.slice(0, 4).map((c) => ({ id: `city:${c}`, label: c })),
      input: { label: "City", placeholder: "Bengaluru, Pune" },
    });
  }
  if (facts.expMin == null && facts.expMax == null && !has(merged.exp)) {
    out.push({
      key: "experience",
      text: "How much experience should they have?",
      options: EXPERIENCE_OPTIONS.map(({ id, label }) => ({ id, label })),
      input: { label: "Years", placeholder: "4-7" },
    });
  }
  if (!facts.notice && !has(merged.notice)) {
    out.push({ key: "notice", text: "What notice period is acceptable?", options: NOTICE_CHOICES.map((n) => ({ id: n, label: n })) });
  }
  if (!facts.comp && !has(merged.comp)) {
    out.push({
      key: "comp",
      text: "What is the pay range?",
      options: [],
      input: { label: "Lakhs per annum", placeholder: "20-30" },
    });
  }
  const skipped = new Set([...(ctx.defaults.skipped ?? []), ...(answers.skipped ?? [])]);
  return out.filter((a) => a.required || !skipped.has(a.key));
}

/* ── what people type ── */

const num = (s: string): number | null => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;

/** "4-7", "4 to 7 years", "5+", "at least 5", "up to 3", "5": years, or null when it is not a number of them. */
export function parseRange(text: string): { min: number | null; max: number | null } | null {
  const s = text.toLowerCase().replace(/[₹$,]/g, "").replace(/\b(?:years?|yrs?|y|lpa|lakhs?|l|ctc|per annum|pa)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  let m = new RegExp(`^${NUMBER}\\s*(?:-|–|—|to)\\s*${NUMBER}$`).exec(s);
  if (m) {
    const a = num(m[1] as string);
    const b = num(m[2] as string);
    if (a === null || b === null) return null;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  m = new RegExp(`^(?:at least|minimum|min|over|above|more than|>=?)?\\s*${NUMBER}\\s*\\+?$`).exec(s);
  if (m) {
    const a = num(m[1] as string);
    if (a === null) return null;
    return /\+$/.test(s) || /^(?:at least|minimum|min|over|above|more than|>)/.test(s) ? { min: a, max: null } : { min: a, max: a };
  }
  m = new RegExp(`^(?:up to|upto|max|maximum|below|under|less than|<=?)\\s*${NUMBER}$`).exec(s);
  if (m) {
    const b = num(m[1] as string);
    return b === null ? null : { min: null, max: b };
  }
  return null;
}

/** Experience in years: a range, bounded to what a career can be. */
export function parseExperience(text: string): { min: number | null; max: number | null } | null {
  const r = parseRange(text);
  if (!r) return null;
  if ((r.min ?? 0) > 40 || (r.max ?? 0) > 40) return null;
  return r;
}

/** Pay in lakhs per annum: a range, and above zero. */
export function parseComp(text: string): { min: number | null; max: number | null } | null {
  const r = parseRange(text);
  if (!r || ((r.min ?? 1) <= 0 && (r.max ?? 1) <= 0)) return null;
  return r;
}

/** "Bengaluru, Pune & Delhi NCR" as places. */
export function parseCities(text: string): string[] {
  return [...new Set(text.split(/[,;/&\n]|\band\b/i).map((c) => c.trim()).filter(Boolean))].slice(0, 5).map((c) => c.slice(0, 120));
}

/* ── the campaign ── */

const asText = (n: number | null | undefined): string => (n == null ? "" : String(n));

/** The facts, with the answers over them, as the draft a campaign is made from. */
export function draftFromIntake(args: {
  facts: JdFacts;
  jd: string;
  answers: Answers;
  defaults: Answers;
  owner: string;
  /** The client's id once it is known (a match, a pick or one just added). */
  clientId: string;
  /** A company the server is to add with the campaign, when no client id is known (anyone but an admin adding one). */
  newClient?: string;
}): CampaignDraft {
  const { facts, jd, clientId } = args;
  const a: Answers = { ...args.defaults, ...args.answers };
  const exp = a.exp ?? { min: facts.expMin, max: facts.expMax };
  const comp = a.comp ?? (facts.comp ? { min: facts.comp.min, max: facts.comp.max } : { min: null, max: null });
  const base = blankDraft(args.owner);
  const mode = a.workMode ?? facts.workMode ?? base.workMode;
  const draft: CampaignDraft = {
    ...base,
    name: facts.title.trim().slice(0, 120),
    clientId,
    newClient: clientId ? "" : (args.newClient ?? "").trim(),
    department: facts.department ?? "",
    seniority: facts.seniority ?? "",
    employment: facts.employment ?? "full-time",
    workMode: mode,
    locations: (a.locations ?? facts.locations).slice(0, 20),
    openings: facts.openings ?? 1,
    currency: facts.comp?.currency ?? "INR",
    compMin: asText(comp.min),
    compMax: asText(comp.max),
    expMin: asText(exp.min),
    expMax: asText(exp.max),
    mustHave: facts.mustHave,
    niceToHave: facts.niceToHave,
    education: facts.education ?? "",
    notice: a.notice ?? facts.notice ?? "",
    jd,
    // The screening form is a separate step on the campaign: nothing here asked for one.
    screening: "none",
  };
  return draft;
}

/** What is wrong with the draft as it would be created, in the server's and form's own words; empty when it is fine. */
export const problemsOf = (d: CampaignDraft): string[] => Object.values(draftProblems(d)).filter((p): p is string => typeof p === "string");

/** The facts as one line for the person to check what was found, under the role's name: "Winspire · Senior · Bengaluru · 4–8 yrs". */
export function factLine(facts: JdFacts, answers: Answers = {}, client?: string | null): string {
  const a = answers;
  const exp = a.exp ?? { min: facts.expMin, max: facts.expMax };
  const comp = a.comp ?? facts.comp;
  const range = (r: { min: number | null; max: number | null } | null, unit: string) =>
    !r || (r.min == null && r.max == null) ? null : r.min != null && r.max != null ? (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`) + unit : r.min != null ? `${r.min}+${unit}` : `up to ${r.max}${unit}`;
  const sym = facts.comp && facts.comp.currency !== "INR" ? `${facts.comp.currency} ` : "₹";
  const pay = range(comp, " LPA");
  // A level the role's own name already says ("QA Lead", "Senior Backend Engineer") is not said twice.
  const level = facts.seniority && !facts.title.toLowerCase().includes(facts.seniority.toLowerCase()) ? facts.seniority : null;
  return [
    client ?? facts.client,
    level,
    (a.locations ?? facts.locations).join(", ") || null,
    (a.workMode ?? facts.workMode) === "remote" ? "Remote" : (a.workMode ?? facts.workMode) === "hybrid" ? "Hybrid" : (a.workMode ?? facts.workMode) === "onsite" ? "In office" : null,
    range(exp, " yrs"),
    pay ? `${sym}${pay}` : null,
    a.notice ?? facts.notice,
  ].filter(Boolean).join(" · ");
}

/** Which file names are spreadsheets, which the server reads into one role a row. */
export const isSheetFile = (f: Pick<File, "name" | "type">): boolean =>
  /\.(xlsx|csv|tsv)$/i.test(f.name) || f.type === "text/csv" || f.type === "text/tab-separated-values" || f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
