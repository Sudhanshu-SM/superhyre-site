import type { MatchDisplay } from "./api/agent";
import type { ClientVerdict } from "./api/stages";
import type { Contact } from "./contacts";
import { MEMBERS, contactNames, makePeople } from "./contacts";
import { CAMPAIGN_ROWS } from "./campaignsData";

/**
 * One campaign's working data: its pipeline, its screening forms and their
 * responses, and its calls.
 *
 * Fixture data from fixed seeds. The pipeline's column counts are derived
 * from the same funnel numbers the Campaigns list prints, so a campaign reads
 * the same on both pages.
 */

/* ── pipeline ── */

/* Four stages on the board. A person who is passed on leaves the board
   ("passed") but still counts, so the campaign can say how many it turned
   down. `step` keeps the finer detail inside a stage: replied (vs waiting)
   during outreach, offer (vs interviewing) during interviews. */
export type StageId = "shortlisted" | "outreach" | "interviewing" | "hired" | "passed";
export type BoardStage = Exclude<StageId, "passed">;

export const STAGES: readonly { id: BoardStage; label: string; hint: string }[] = [
  { id: "shortlisted", label: "Shortlisted", hint: "Picked, not yet contacted" },
  { id: "outreach", label: "In outreach", hint: "Contacted; some have replied" },
  { id: "interviewing", label: "Interviewing", hint: "In the loop, offers included" },
  { id: "hired", label: "Hired", hint: "Offer accepted" },
];

export type Step = "waiting" | "replied" | "loop" | "offer" | null;

/**
 * A status a person can be put at: a stage, or Replied. Replied is not a stage of its own: the board keeps
 * someone who has answered inside In outreach (the outreach stage at its replied step), and one definition
 * counts them (the server's counts.ts). So choosing Replied is a move to outreach at the replied step.
 */
export type StatusId = StageId | "replied";

/** The statuses in the order every menu lists them: Replied sits between In outreach and Interviewing. */
export const STATUSES: readonly { id: StatusId; label: string }[] = [
  { id: "shortlisted", label: "Not contacted" },
  { id: "outreach", label: "In outreach" },
  { id: "replied", label: "Replied" },
  { id: "interviewing", label: "Interviewing" },
  { id: "hired", label: "Hired" },
  { id: "passed", label: "Rejected" },
];

/**
 * What the board's own menus (a card's, a row's, the person's dialog) offer: the board's columns, with Replied
 * under In outreach. Passing is its own row there, so it is not in this list.
 */
export const BOARD_STATUSES: readonly { id: StatusId; label: string }[] = [
  { id: "shortlisted", label: "Shortlisted" },
  { id: "outreach", label: "In outreach" },
  { id: "replied", label: "Replied" },
  { id: "interviewing", label: "Interviewing" },
  { id: "hired", label: "Hired" },
];

/** The status a person is at now. */
export const statusIdOf = (p: { stage: StageId; step: Step }): StatusId =>
  p.stage === "outreach" && p.step === "replied" ? "replied" : p.stage;

/**
 * What a move to a status asks of the server. In outreach says its step too, so that someone who has replied
 * can be put back to waiting; for someone arriving from another stage that is the step they would get anyway.
 */
export const moveTarget = (to: StatusId): { stage: StageId; step?: Step } =>
  to === "replied" ? { stage: "outreach", step: "replied" }
    : to === "outreach" ? { stage: "outreach", step: "waiting" }
      : { stage: to };

/**
 * Where a move goes: a status (a kind of stage, Replied included), or one of the campaign's own stages by id.
 * Moving by kind lands in the first stage of that kind; moving by stage id lands in exactly that column.
 */
export type MoveTo = StatusId | { stageId: string };

/** Whether moving this person to `to` would change anything. */
export const wouldMove = (p: { stage: StageId; step: Step }, to: StatusId): boolean => {
  const t = moveTarget(to);
  return p.stage !== t.stage || (t.step !== undefined && p.step !== t.step);
};

export type Source = "Agent search" | "Extension" | "Referral" | "Added by hand" | "Form" | "Import";

export type PipelinePerson = Contact & {
  /** The kind of stage they are in (what every count and analytic goes by). */
  stage: StageId;
  step: Step;
  /** The campaign's own column they are in. Absent from fixtures and older servers: then the first stage of their kind. */
  stageId?: string;
  /** What the client said on their review page, when they did. */
  clientVerdict?: ClientVerdict | null;
  /** Days in the current stage. */
  inStage: number;
  owner: string;
  /** Live rows: the owner by user id, which is what "You" goes by (names can repeat). */
  ownerId?: string | null;
  source: Source;
  /** The last thing that happened with them, in a few words. */
  last: string;
  /** How well they match the campaign's criteria, out of 3; null until someone rates them. */
  fit: 1 | 2 | 3 | null;
  /** How they match the role now (the server's one resolved state); the stored `fit` is only the older server's. */
  display?: MatchDisplay;
  /** The candidate behind this pipeline entry, when it came from the API. */
  candidateId?: string;
  /** A reply was logged at some point (from the API); the step alone forgets it once they move on. */
  replied?: boolean;
  /** On the do-not-contact list (from the API): nothing is drafted, approved or scheduled for them. */
  doNotContact?: boolean;
  /** Why they were passed, in the words given then (from the API). */
  passReason?: string;
  /** Whether an email or phone is on file, when the value itself is not sent. */
  reach?: { email: boolean; phone: boolean };
  /** Joining date for a hire, when known ("2026-10-14"). Not seeded yet, so
      nothing reads it: the Overview's Hires panel will group by it ("Joining
      14 Oct") once real data carries it. */
  startsOn?: string;
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAST: Readonly<Record<string, readonly string[]>> = {
  shortlisted: ["Shortlisted by the agent", "Saved from LinkedIn", "Added from a past search"],
  waiting: ["Email sent", "WhatsApp sent", "Follow-up sent", "LinkedIn note sent"],
  replied: ["Replied: keen to talk", "Replied: asked about the role", "Replied: free next week"],
  loop: ["Tech round booked", "Hiring manager round next", "Panel feedback in"],
  offer: ["Offer drafted", "Offer sent, awaiting reply"],
  hired: ["Accepted the offer"],
  passed: ["Rejected after screening", "Not the right level", "Withdrew"],
};

function plan(id: string): { stage: StageId; step: Step; key: string; n: number }[] {
  const row = CAMPAIGN_ROWS.find((r) => r.id === id);
  const f = row?.funnel ?? { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 };
  const offer = f.interviews >= 3 ? 1 : 0;
  return [
    { stage: "shortlisted", step: null, key: "shortlisted", n: f.shortlisted },
    { stage: "outreach", step: "waiting", key: "waiting", n: Math.max(0, f.contacted - f.replied) },
    { stage: "outreach", step: "replied", key: "replied", n: Math.max(0, f.replied - f.interviews) },
    { stage: "interviewing", step: "loop", key: "loop", n: Math.max(0, f.interviews - offer) },
    { stage: "interviewing", step: "offer", key: "offer", n: offer },
    { stage: "hired", step: null, key: "hired", n: f.hired },
    { stage: "passed", step: null, key: "passed", n: Math.round(f.contacted * 0.3) },
  ];
}

const PIPELINES = new Map<string, PipelinePerson[]>();

/** Everyone in a campaign's pipeline, each at their current stage. */
export function pipelineFor(campaignId: string): PipelinePerson[] {
  const hit = PIPELINES.get(campaignId);
  if (hit) return hit;
  const groups = plan(campaignId);
  const total = groups.reduce((a, g) => a + g.n, 0);
  const seed = [...campaignId].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const people = makePeople(seed, [{ campaign: campaignId, count: total }], `pp-${campaignId}`, contactNames());
  const r = rng(seed ^ 0x5eed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const out: PipelinePerson[] = [];
  let i = 0;
  for (const g of groups) {
    for (let k = 0; k < g.n; k++) {
      const p = people[i++]!;
      out.push({
        ...p,
        stage: g.stage,
        step: g.step,
        inStage: Math.floor(r() * (g.key === "waiting" ? 9 : 6)),
        owner: pick(MEMBERS),
        source: pick(["Agent search", "Agent search", "Extension", "Referral"] as const),
        last: pick(LAST[g.key]!),
        fit: (r() > 0.55 ? 3 : r() > 0.4 ? 2 : 1) as 1 | 2 | 3,
      });
    }
  }
  PIPELINES.set(campaignId, out);
  return out;
}

/* ── the funnel, as "reached this stage or beyond" ──
   The raw `funnel{}` fields are each stage's CURRENT headcount (13 shortlisted,
   33 contacted…), so drawn as a funnel they would grow. A funnel bar has to be
   cumulative: everyone who got at least this far. Passed people were
   contacted first (plan() derives them from `contacted`), so they count up to
   outreach and never beyond. `found` is lifetime ("all-time"). */
export type Reached = {
  found: number; shortlisted: number; outreach: number; replied: number; interviewing: number; hired: number;
  target: number; offerOut: number; passed: number; waiting: number; repliesToAnswer: number;
};

export function reachedFrom(people: readonly PipelinePerson[], sourced: number, target: number): Reached {
  let passed = 0, waiting = 0, replied = 0, loop = 0, offer = 0, hired = 0;
  for (const p of people) {
    if (p.stage === "passed") passed++;
    else if (p.stage === "hired") hired++;
    else if (p.step === "offer") offer++;
    else if (p.stage === "interviewing") loop++;
    else if (p.step === "replied") replied++;
    else if (p.stage === "outreach") waiting++;
  }
  const interviewing = loop + offer + hired;
  return {
    found: Math.max(sourced, people.length),
    shortlisted: people.length,
    outreach: waiting + replied + interviewing + passed,
    replied: replied + interviewing,
    interviewing,
    hired,
    target: Math.max(1, target),
    offerOut: offer,
    passed,
    waiting,
    repliesToAnswer: replied,
  };
}

/** A campaign's cumulative funnel from its seeded pipeline. */
export function funnelReached(campaignId: string): Reached {
  const row = CAMPAIGN_ROWS.find((r) => r.id === campaignId);
  return reachedFrom(pipelineFor(campaignId), row?.funnel.sourced ?? 0, row?.target ?? 1);
}

/** Days in stage after which a person is worth a nudge. */
export const STALL_DAYS = 5;

/* ── forms ── */

export type QType = "short" | "long" | "choice" | "multi" | "dropdown" | "number" | "yesno" | "scale" | "link" | "date";

export const Q_TYPES: readonly { id: QType; label: string; hint: string }[] = [
  { id: "short", label: "Short answer", hint: "A line of text" },
  { id: "long", label: "Long answer", hint: "A paragraph" },
  { id: "choice", label: "Single choice", hint: "Pick one" },
  { id: "multi", label: "Multiple choice", hint: "Pick any" },
  { id: "dropdown", label: "Dropdown", hint: "Pick one from a long list" },
  { id: "number", label: "Number", hint: "Years, notice days, salary" },
  { id: "yesno", label: "Yes / No", hint: "A quick filter" },
  { id: "scale", label: "Rating", hint: "1 to 5" },
  { id: "link", label: "Link", hint: "GitHub, portfolio, resume" },
  { id: "date", label: "Date", hint: "Start date, availability" },
];

/** A form item: a question, or a section break that groups the questions after it. */
export type ItemType = QType | "section";
export type TintKey = "ember" | "sand" | "sage" | "slate" | "ink";
export type WorkType = "Full-time" | "Part-time" | "Contract" | "Internship";

export type Question = {
  id: string;
  type: ItemType;
  /** For a section: the section heading. */
  title: string;
  /** For a section: its description. */
  help?: string;
  /** Sections: always false. */
  required: boolean;
  options?: string[];
  /** Legacy: the one answer that flags (fixtures use it). Prefer `accept`. */
  knockout?: string;
  /** Must-have: the answers that pass. Any other answer is "missed". Only on yesno and choice. */
  accept?: string[];
  placeholder?: string;
  unit?: string;
  scale?: { low: string; high: string };
  /** Must-have on a number: answers below this are "missed". */
  atLeast?: number;
  /** Choice, multiple choice and dropdown: an "Other" answer the applicant writes in. */
  allowOther?: boolean;
  /**
   * Sections only: what follows this section's page. "next" (the default) goes on to the next section; "submit"
   * ends the form here and the sections after it are not shown.
   */
  after?: "next" | "submit";
};

/** How the public page behaves, beyond its questions. Applies as soon as it's saved. */
export type FormPage = {
  /** The last day applications are taken (YYYY-MM-DD); the form closes at the end of it. */
  closesOn?: string | null;
  /** What an applicant reads once their application is in. */
  successMessage?: string | null;
  /** What a visitor reads once the form has closed. */
  closedMessage?: string | null;
  /** One line the team stands behind, under the title. */
  promise?: string | null;
};

export type RoleDetails = {
  about: string;
  responsibilities: string[];
  requirements: string[];
  team?: string;
  location?: string;
  workType?: WorkType;
  /** The three section headings, when the recruiter renamed them. */
  labels?: { about?: string; doing?: string; wanted?: string };
};

export type Form = {
  id: string;
  campaign: string;
  /** Internal name, shown in the console. */
  name: string;
  status: "live" | "draft";
  sent: number;
  questions: Question[];
  /** Kept for compat; = TINTS[theme].fill. */
  accent: string;
  /** Public headline on the candidate page. */
  title?: string;
  description?: string;
  role?: RoleDetails;
  theme?: TintKey;
  page?: FormPage;
  origin?: "seed" | "template" | "chat";
  createdAt?: number;
  updatedAt?: number;
};

export const isSection = (q: Question) => q.type === "section";
export const answerable = (f: Pick<Form, "questions">) => f.questions.filter((q) => !isSection(q));

/** Accepted answers for a must-have question, or null if it has none. */
export function mustHaveOf(q: Question): string[] | null {
  if (q.type === "number") return typeof q.atLeast === "number" ? [`${q.atLeast}+${q.unit ? ` ${q.unit}` : ""}`] : null;
  /* A dropdown is a single pick, like a choice: the builder lets a must-have sit on it and the server keeps it. */
  if (q.type !== "yesno" && q.type !== "choice" && q.type !== "dropdown") return null;
  if (q.accept?.length) return q.accept;
  if (q.knockout) return (q.type === "yesno" ? ["Yes", "No"] : q.options ?? []).filter((o) => o !== q.knockout);
  return null;
}
export type Miss = { q: Question; answer: string; accepted: string[] };
/** Must-haves this response missed. A skipped answer is NOT a miss (we can't infer it). */
export function missedMustHaves(form: Pick<Form, "questions">, answers: Record<string, Answer>): Miss[] {
  const out: Miss[] = [];
  for (const q of form.questions) {
    const accepted = mustHaveOf(q);
    if (!accepted) continue;
    const a = answers[q.id];
    if (a === undefined || a === "" || (Array.isArray(a) && !a.length)) continue;
    const answer = Array.isArray(a) ? a.join(", ") : typeof a === "boolean" ? (a ? "Yes" : "No") : String(a);
    if (!meetsMustHave(q, a)) out.push({ q, answer, accepted });
  }
  return out;
}
export const mustHaves = (f: Pick<Form, "questions">) => f.questions.filter((q) => mustHaveOf(q));
/** Whether one answer meets a question's must-have (true when it has none). */
export function meetsMustHave(q: Question, a: Answer | undefined): boolean {
  const accepted = mustHaveOf(q);
  if (!accepted || a === undefined) return true;
  if (q.type === "number") { const n = Number(a); return !Number.isFinite(n) || n >= (q.atLeast ?? 0); }
  const answer = Array.isArray(a) ? a.join(", ") : typeof a === "boolean" ? (a ? "Yes" : "No") : String(a);
  return accepted.includes(answer);
}

export type Answer = string | number | string[] | boolean;

export type FormResponse = {
  id: string;
  form: string;
  person: Pick<Contact, "id" | "name" | "hue" | "title" | "company">;
  /** Minutes ago. */
  at: number;
  /** Seconds taken. */
  took: number;
  answers: Record<string, Answer>;
  flagged: boolean;
  /** What the candidate typed on the form. Every form asks for it, so it is
      the address to reply to even when the pipeline has none enriched. */
  email?: string;
  linkedin?: string;
  /** The number they typed, in one spelling (E.164). */
  phone?: string;
  /** They typed the code we emailed, so the address is theirs. */
  emailVerified?: boolean;
  /** They asked to stay in the talent network. */
  consent?: boolean;
  /** Where they came from: the ?src= on the link, or the site that sent them. */
  source?: string;
};

const BACKEND_FORM: Question[] = [
  { id: "q1", type: "number", title: "How many years have you worked on backend systems?", required: true },
  { id: "q2", type: "multi", title: "Which of these have you run in production?", required: true, options: ["Postgres", "Kafka", "Redis", "Kubernetes", "gRPC"] },
  { id: "q3", type: "choice", title: "What is your notice period?", required: true, options: ["Immediate", "15 days", "30 days", "60 days", "90 days"] },
  { id: "q4", type: "yesno", title: "Are you open to working from Bangalore three days a week?", required: true, knockout: "No" },
  { id: "q5", type: "scale", title: "How excited are you about payments infrastructure?", required: false },
  { id: "q6", type: "link", title: "Link to your GitHub or a project you are proud of", required: false },
  { id: "q7", type: "long", title: "Tell us about a system you scaled and what broke first.", required: false },
];

const GENERIC_FORM = (role: string): Question[] => [
  { id: "q1", type: "number", title: `How many years of ${role.toLowerCase()} experience do you have?`, required: true },
  { id: "q2", type: "choice", title: "What is your notice period?", required: true, options: ["Immediate", "15 days", "30 days", "60 days", "90 days"] },
  { id: "q3", type: "yesno", title: "Are you comfortable with the role's location?", required: true, knockout: "No" },
  { id: "q4", type: "scale", title: "How well does this role match what you want next?", required: false },
  { id: "q5", type: "long", title: "What would you want to own in your first six months?", required: false },
];

const FORMS = new Map<string, Form[]>();

export function formsFor(campaignId: string): Form[] {
  const hit = FORMS.get(campaignId);
  if (hit) return hit;
  const row = CAMPAIGN_ROWS.find((r) => r.id === campaignId);
  const live = row && row.funnel.contacted > 0;
  const list: Form[] = live
    ? [{
        id: `${campaignId}-screen`,
        campaign: campaignId,
        name: `${row!.name} screening`,
        status: "live",
        sent: row!.funnel.contacted,
        questions: campaignId === "backend-snr" ? BACKEND_FORM : GENERIC_FORM(row!.department),
        accent: "#ea5a1e",
      }]
    : [];
  FORMS.set(campaignId, list);
  return list;
}

const RESPONSES = new Map<string, FormResponse[]>();

/** Responses to a form, from people in the campaign who were contacted. */
export function responsesFor(form: Form): FormResponse[] {
  if (!form.sent) return [];
  const hit = RESPONSES.get(form.id);
  if (hit) return hit;
  const people = pipelineFor(form.campaign).filter((p) => p.stage !== "shortlisted" && p.stage !== "passed");
  const r = rng([...form.id].reduce((a, ch) => a * 33 + ch.charCodeAt(0), 11) >>> 0);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const out: FormResponse[] = people.slice(0, Math.round(people.length * 0.6)).map((p, i) => {
    const answers: Record<string, Answer> = {};
    for (const q of form.questions) {
      if (q.type === "section") continue;
      if (!q.required && r() < 0.2) continue;
      switch (q.type) {
        case "number": answers[q.id] = Math.max(1, p.years - Math.floor(r() * 2)); break;
        case "choice": answers[q.id] = pick(q.options ?? []); break;
        case "multi": answers[q.id] = (q.options ?? []).filter(() => r() > 0.45); break;
        case "yesno": answers[q.id] = r() > 0.18 ? "Yes" : "No"; break;
        case "scale": answers[q.id] = 2 + Math.floor(r() * 4); break;
        case "link": answers[q.id] = `github.com/${p.name.split(" ")[0]!.toLowerCase()}${Math.floor(r() * 90)}`; break;
        case "short": answers[q.id] = p.title; break;
        case "long": answers[q.id] = pick([
          `Scaled our ${p.skills[0]} setup from a single node to a cluster; connection limits broke first, then our migrations.`,
          `Took a monolith at ${p.company} to services. The first thing to break was observability, not throughput.`,
          `Led a rewrite of the ingestion path; the queue was fine, the retries were what melted.`,
        ]); break;
      }
    }
    return {
      id: `${form.id}-r${i}`,
      form: form.id,
      person: { id: p.id, name: p.name, hue: p.hue, title: p.title, company: p.company },
      at: Math.floor(r() * r() * 60 * 24 * 6),
      took: 70 + Math.floor(r() * 260),
      answers,
      flagged: missedMustHaves(form, answers).length > 0,
      email: p.email?.value ?? `${p.name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@${["gmail.com", "outlook.com", "proton.me"][i % 3]}`,
      linkedin: `linkedin.com/in/${p.name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`,
    };
  }).sort((a, b) => a.at - b.at);
  RESPONSES.set(form.id, out);
  return out;
}

/* ── calls ── */

export type CallOutcome = "connected" | "voicemail" | "no-answer" | "scheduled";

export const OUTCOME_LABEL: Readonly<Record<CallOutcome, string>> = {
  connected: "Connected", voicemail: "Voicemail", "no-answer": "No answer", scheduled: "Call back booked",
};

export type Call = {
  id: string;
  person: Pick<Contact, "id" | "name" | "hue" | "title" | "company">;
  by: string;
  outcome: CallOutcome;
  /** Seconds. */
  duration: number;
  /** Minutes ago. */
  at: number;
  note?: string;
  /** Seconds of recorded audio. Absent when nothing was recorded (no answer,
      a call back that has not happened, a voicemail the dialer did not keep). */
  recording?: number;
  /** What was said, in order. Fixture calls carry a generated script; an
      uploaded transcript replaces it (see callMedia.ts). */
  transcript?: CallTurn[];
};

/** One turn of a call. `who` drives the default speaker label; `speaker`
    overrides it when a transcript arrived with its own names. */
export type CallTurn = { at: number; who: "recruiter" | "candidate" | "other"; text: string; speaker?: string };

/** The signed-in recruiter, for "my calls". A fixture, like the rest. */
export const ME = "Punith S";

const CALLS = new Map<string, Call[]>();

export function callsFor(campaignId: string): Call[] {
  const hit = CALLS.get(campaignId);
  if (hit) return hit;
  const people = pipelineFor(campaignId).filter((p) => p.stage !== "shortlisted" && p.stage !== "passed" && p.phone);
  const r = rng([...campaignId].reduce((a, ch) => a * 37 + ch.charCodeAt(0), 13) >>> 0);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const notes: Readonly<Record<CallOutcome, readonly string[]>> = {
    connected: ["Keen; wants the comp band before the next round", "Strong on systems, booked the tech round", "Interested, notice is 60 days", "Asked for the JD on email"],
    voicemail: ["Left a voicemail with the role summary"],
    "no-answer": [""],
    scheduled: ["Asked to be called back Thursday evening", "Call back after 6pm"],
  };
  const out: Call[] = [];
  people.forEach((p, i) => {
    const n = 1 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const outcome = pick(["connected", "connected", "voicemail", "no-answer", "scheduled"] as const);
      out.push({
        id: `${campaignId}-call-${i}-${k}`,
        person: { id: p.id, name: p.name, hue: p.hue, title: p.title, company: p.company },
        by: r() > 0.45 ? ME : pick(MEMBERS),
        outcome,
        duration: outcome === "connected" ? 90 + Math.floor(r() * 900) : outcome === "voicemail" ? 25 + Math.floor(r() * 20) : 0,
        at: Math.floor(r() * r() * 60 * 24 * 14),
        note: pick(notes[outcome]) || undefined,
      });
    }
  });
  out.sort((a, b) => a.at - b.at);
  /* Recordings and transcripts come from their own seed per call, AFTER the
     calls are drawn: the shared rng above is untouched, so every call keeps
     the person, outcome and time it had before transcripts existed. */
  const byId = new Map(people.map((p) => [p.id, p]));
  const row = CAMPAIGN_ROWS.find((x) => x.id === campaignId);
  for (const c of out) {
    const p = byId.get(c.person.id);
    if (p) Object.assign(c, scriptFor(c, p, row?.name ?? "role", row?.location ?? "Bangalore"));
  }
  CALLS.set(campaignId, out);
  return out;
}

/* ── call scripts ──
   A believable conversation for each fixture call, built from what the call
   is about: the role, the candidate's company and skills, their notice
   period, salary, and the round the recruiter booked. Seeded from the call
   id, so a call always says the same thing. */

const hashOf = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 2166136261);
const firstOf = (name: string) => name.split(" ")[0] ?? name;

function scriptFor(c: Call, p: PipelinePerson, campaignName: string, location: string): Pick<Call, "recording" | "transcript"> {
  const r = rng(hashOf(c.id));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const me = firstOf(c.by), them = firstOf(p.name);
  const role = campaignName.replace(/(\w+)s$/, "$1");
  const where = /remote/i.test(location) ? "remote, with a week in Bangalore every quarter" : `in ${location}, three days a week in the office`;
  /* "Distributed systems" reads as "distributed systems" mid-sentence; Go, AWS and gRPC stay as they are */
  const lower = (x: string) => (/^[A-Z][a-z]+( [a-z&]+)+$/.test(x) ? x[0]!.toLowerCase() + x.slice(1) : x);
  const [s0 = "the stack", s1 = "the rest"] = p.skills.map(lower);

  if (c.outcome === "voicemail") {
    if (r() < 0.3) return {};
    const lines: [CallTurn["who"], string][] = [
      ["recruiter", `Hi ${them}, this is ${me} from SuperHyre.`],
      ["recruiter", `I'm calling about a ${role} role ${where}. Your ${s0} work at ${p.company} looks like a close match.`],
      ["recruiter", "I'll send a short note on WhatsApp as well. Call me back on this number whenever it suits you. Thanks!"],
    ];
    const seconds = Math.max(c.duration, 20);
    return { recording: seconds, transcript: spread(lines, seconds) };
  }
  if (c.outcome !== "connected") return {};

  const noteNotice = /notice is (\d+)/.exec(c.note ?? "");
  const notice = noteNotice ? +noteNotice[1]! : pick([15, 30, 30, 60, 90]);
  const now = Math.round(6 + p.years * 3.2 + r() * 6);
  const ask = Math.round(now * (1.25 + r() * 0.15));
  const day = pick(["Tuesday", "Wednesday", "Thursday", "Friday"]);
  const time = pick(["11 AM", "12:30 PM", "3 PM", "4:30 PM"]);
  const note = c.note ?? "";

  const L: [CallTurn["who"], string][] = [
    ["recruiter", `Hi ${them}, this is ${me} from SuperHyre. Is now a good time for ten minutes?`],
    ["candidate", pick([`Hi ${me}. Yes, go ahead, I have a few minutes.`, "Sure, I'm between meetings. Go ahead.", `Hey ${me}, yes, I saw your message on LinkedIn.`])],
    ["recruiter", `Thanks. I'm hiring a ${role} for a client team ${where}. Your ${s0} work at ${p.company} is why I reached out.`],
    ["candidate", pick(["Okay. What does the team look like?", "Sounds interesting. Who would I be working with?", "Alright. How big is the team?"])],
    ["recruiter", pick([
      "About ten people. You'd own a good part of the roadmap from the first month, not just tickets.",
      "It's a small group, eight or nine people, and they need someone senior who can set direction.",
    ])],
    ["candidate", `That's useful. I've been at ${p.company} for a while now, ${p.years} years in total, mostly ${s0} and ${s1}.`],
    ["recruiter", "What's your notice period right now?"],
    ["candidate", notice >= 60 ? `${notice} days. I could try to bring it down, but I can't promise anything.` : `${notice} days, and my manager knows I'm looking, so that should be fine.`],
    ["recruiter", "And where are you on compensation, roughly?"],
  ];
  if (/comp band/.test(note)) {
    L.push(["candidate", `I'm at about ${now} lakhs fixed. Before I do another round, could you share the band? I'd rather not waste anyone's time.`]);
    L.push(["recruiter", "That's fair. I'll get the band from the client and email it to you today."]);
  } else {
    L.push(["candidate", `I'm at ${now} lakhs fixed right now. I'd be looking at something around ${ask}.`]);
    L.push(["recruiter", `Okay, ${ask} is within what they've budgeted, so that works.`]);
  }
  if (/tech round/.test(note)) {
    L.push(["recruiter", `Would ${day} at ${time} work for a technical round with two of their engineers?`]);
    L.push(["candidate", `${day} at ${time} is fine. Is it a coding round or more of a design discussion?`]);
    L.push(["recruiter", `Mostly system design, around an hour. I'll send the invite with the details right after this.`]);
  } else if (/JD on email/.test(note)) {
    L.push(["candidate", "Could you send me the JD on email? I'd like to read it properly before we go further."]);
    L.push(["recruiter", "Of course. I'll email it in the next few minutes, and we can pick a time once you've read it."]);
  } else {
    L.push(["recruiter", "I'll share your profile with the hiring manager and come back to you this week with next steps."]);
    L.push(["candidate", "Sounds good. WhatsApp is the easiest way to reach me."]);
  }
  L.push(["candidate", `Thanks, ${me}.`]);
  L.push(["recruiter", "Thank you. Talk soon."]);
  return { recording: c.duration, transcript: spread(L, c.duration) };
}

/** Lays turns out across a recording, each taking time in proportion to its length. */
function spread(lines: readonly [CallTurn["who"], string][], seconds: number): CallTurn[] {
  const total = lines.reduce((a, [, t]) => a + t.length + 40, 0);
  const span = Math.max(1, seconds - 2);
  let acc = 0;
  return lines.map(([who, text]) => {
    const at = Math.round((acc / total) * span * 10) / 10 + (acc ? 0 : 0.5);
    acc += text.length + 40;
    return { at, who, text };
  });
}

/** "12m ago", "3h ago", "2d ago". */
export function agoLabel(min: number): string {
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}h ago`;
  return `${Math.floor(min / 60 / 24)}d ago`;
}

export function durationLabel(sec: number): string {
  if (!sec) return "–";
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
