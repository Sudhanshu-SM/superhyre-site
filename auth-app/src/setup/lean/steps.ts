/**
 * The set-up as plain data and pure functions: the beats and their order, what counts as an answer,
 * the chapters and the words. No React and no network, so every rule here is tested on its own and the
 * screen only draws it.
 *
 * Mind asks, one question at a time, starting with what to call the person. Nobody is asked to name a
 * workspace: everyone starts in Personal, which is theirs alone. What is asked about is their team (an
 * organisation to join, or to create), then the first role, its job description and, if it is for a
 * client, the client's name. Nothing is fetched from the web, and no link is opened.
 */

import { fileRefusal } from "../../attachments";
import { clientInJd } from "../../campaignAsk";

export type Beat = "name" | "team" | "role" | "jd" | "client" | "powers" | "finish";
export type Chapter = "you" | "role" | "powers";

/** What the person chose at "your team". Joining ends the set-up, so it is never an answer here. */
export type Team =
  /** A new organisation, made when the set-up finishes; they are its owner. */
  | { kind: "create"; name: string }
  /** They asked to join one and carry on in Personal while an admin decides. */
  | { kind: "asked"; name: string }
  /** Just them: Personal. */
  | { kind: "personal" };

/**
 * The first role: a job title, or "later" when the person carried on without one. Nothing is made for a role that
 * is not there (no campaign, no description to ask for, no client): it is added from the console when they have it.
 */
export type RoleTitle = { kind: "title"; title: string };
export type RoleAnswer = RoleTitle | { kind: "later" };
export const ROLE_LATER: RoleAnswer = { kind: "later" };

export type Answers = {
  /** What to call the person: the first thing asked, offered from the account (Google) when it is known. */
  name: string;
  team: Team | null;
  role: RoleAnswer | null;
  /** The job description as text; null when it was skipped (or not reached yet). */
  jd: string | null;
  /** null until asked; true when the role is for a client. */
  forClient: boolean | null;
  /** The client's company name. Nothing else about a client is asked. */
  client: string | null;
};

export const EMPTY: Answers = { name: "", team: null, role: null, jd: null, forClient: null, client: null };

export const CHAPTERS: readonly { id: Chapter; numeral: string; title: string }[] = [
  { id: "you", numeral: "I", title: "About you" },
  { id: "role", numeral: "II", title: "First role" },
  { id: "powers", numeral: "III", title: "Your powers" },
];

export const CHAPTER_OF: Record<Beat, Chapter> = {
  name: "you",
  team: "you",
  role: "role",
  jd: "role",
  client: "role",
  powers: "powers",
  finish: "powers",
};

/* ── what is kept between visits ────────────────────────────────────────── */

/** What the server keeps while set-up is under way (the answers so far, and where the person was). */
export type Saved = {
  beat: Beat;
  /** The opening (she touches the star) has played: it is shown once per account. */
  opened?: boolean;
  name?: string;
  team?: Team | null;
  role?: RoleAnswer | null;
  jd?: string | null;
  forClient?: boolean | null;
  client?: string | null;
};

export function toSaved(beat: Beat, a: Answers, opened: boolean): Saved {
  return { beat, opened, name: a.name, team: a.team, role: a.role, jd: a.jd, forClient: a.forClient, client: a.client };
}

const BEATS: readonly Beat[] = ["name", "team", "role", "jd", "client", "powers", "finish"];
/** Beats an earlier build kept, and where they land now. */
const LEGACY_BEATS: Record<string, Beat> = { workspace: "team", company: "role", sender: "powers" };

const isTeam = (v: unknown): v is Team => {
  const o = v as { kind?: unknown; name?: unknown } | null;
  if (!o || typeof o !== "object") return false;
  if (o.kind === "personal") return true;
  return (o.kind === "create" || o.kind === "asked") && typeof o.name === "string" && o.name.trim().length >= 1;
};
const isRole = (v: unknown): v is RoleAnswer => {
  const o = v as RoleAnswer | null;
  if (!o || typeof o !== "object") return false;
  return o.kind === "later" || (o.kind === "title" && typeof o.title === "string");
};

/**
 * Reads what the server kept, defensively (it may be from an older shape), and says where to
 * resume: the beat that was reached, pulled back to the first one whose earlier answers are missing.
 */
export function fromSaved(raw: unknown): { beat: Beat; answers: Answers; opened: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  // An earlier build kept the client as a link: its name is what is kept now.
  const legacyClient = (r.client && typeof r.client === "object" ? (r.client as { label?: unknown }).label : null) ?? null;
  const client = text(typeof r.client === "string" ? r.client : legacyClient, 80);
  const answers: Answers = {
    ...EMPTY,
    name: text(r.name, 120),
    team: isTeam(r.team) ? r.team : null,
    role: isRole(r.role) ? r.role : null,
    jd: typeof r.jd === "string" && r.jd.trim() ? r.jd.slice(0, 30_000) : null,
    forClient: typeof r.forClient === "boolean" ? r.forClient : null,
    client: client || null,
  };
  if (!answers.name && !answers.team && !answers.role) return null;
  const settled = settle(answers);
  const saved = typeof r.beat === "string" ? r.beat : "";
  const wanted = BEATS.find((b) => b === saved) ?? LEGACY_BEATS[saved] ?? "team";
  return { beat: reachable(wanted, settled), answers: settled, opened: r.opened === true || settled.name !== "" };
}

/** The furthest beat these answers allow: you cannot be asked about a client before there is a role. */
export function reachable(want: Beat, a: Answers): Beat {
  const needs: [Beat, boolean][] = [
    ["team", a.name !== ""],
    ["role", a.name !== "" && a.team !== null],
    ["jd", a.role !== null],
    ["client", a.role !== null],
    ["powers", a.role !== null && a.team !== null && a.name !== ""],
    ["finish", a.role !== null && a.team !== null && a.name !== ""],
  ];
  let best: Beat = "name";
  for (const b of BEATS) {
    const need = needs.find(([n]) => n === b);
    if (need && !need[1]) break;
    best = b;
    if (b === want) break;
  }
  // Without a role there is no description or client beat: land on the next one there is.
  const have = beatsFor(a);
  if (have.includes(best)) return best;
  return have.find((b) => BEATS.indexOf(b) > BEATS.indexOf(best)) ?? "finish";
}

/** What the server is told when the set-up ends. Null when something it needs is missing. */
export function finishBody(a: Answers): { fullName: string; organisation: string | null; role: RoleTitle | null; jd: string | null; client: string | null } | null {
  if (!a.name || !a.role || !a.team) return null;
  // No role yet: only the person (and the organisation, if one was chosen) is set up. There is no campaign to
  // hold a description or a client.
  const role = a.role.kind === "title" ? a.role : null;
  return {
    fullName: a.name,
    organisation: a.team.kind === "create" ? a.team.name : null,
    role,
    jd: role ? a.jd : null,
    client: role && a.forClient === true ? a.client : null,
  };
}

/** True when the person carried on without a first role. */
export const roleSkipped = (a: Pick<Answers, "role">): boolean => a.role?.kind === "later";

/** The beats this person will have: a skipped role has no description and no client to ask about. */
export function beatsFor(a?: Answers): Beat[] {
  return a && roleSkipped(a) ? BEATS.filter((b) => b !== "jd" && b !== "client") : [...BEATS];
}

export function nextBeat(from: Beat, a: Answers): Beat {
  const b = beatsFor(a);
  return b[Math.min(b.indexOf(from) + 1, b.length - 1)] ?? "finish";
}

/** The first beat of a chapter, where a finished chapter's name takes you back to. */
export const firstBeatOf = (c: Chapter): Beat => ({ you: "name", role: "role", powers: "powers" } as const)[c];

/** What forgets what: an answer to an earlier beat can make later answers meaningless. */
export function settle(a: Answers): Answers {
  // Without a role there is no description, and the role is not for anyone.
  if (roleSkipped(a)) return { ...a, jd: null, forClient: null, client: null };
  return a.forClient === true ? a : { ...a, client: null };
}

/** How far through, for the hills: 0 at the start, 1 at the end. */
export function progressOf(beat: Beat, a: Answers): number {
  const b = beatsFor(a);
  return b.length <= 1 ? 0 : b.indexOf(beat) / (b.length - 1);
}

/* ── what counts as an answer ───────────────────────────────────────────── */

/** A bare address: one token that is a link. Nothing here opens links, so it is not a job description. */
const BARE_URL = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+$|^[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/i;
export const isBareUrl = (text: string): boolean => BARE_URL.test(text.trim());

/** A job title. A link is not one: the job description has its own step, and nothing here opens links. */
export function parseRole(input: string): RoleTitle | null {
  const raw = input.trim().replace(/\s+/g, " ");
  if (raw.length < 2 || raw.length > 80 || isBareUrl(raw)) return null;
  return { kind: "title", title: raw };
}

/** Why a role could not be taken, for the line under the answer. */
export function roleProblem(input: string): string {
  const raw = input.trim().replace(/\s+/g, " ");
  if (isBareUrl(raw)) return "That looks like a link. Type the job title, like Data Engineer. The description comes next.";
  if (raw.length > 80) return "Keep the title under 80 characters.";
  return "Add a job title, like Data Engineer.";
}

/** The shortest text that can be a job description: below this it is a title or a note, not a description. */
export const JD_MIN = 30;
/** The longest one kept. Past it the person is told, with the count: nothing is cut without a word. */
export const JD_MAX = 30_000;

const grouped = (n: number): string => n.toLocaleString("en-US");

/** What the file picker offers for a job description: the formats the server's reader takes (it does the reading). */
export const JD_FILE_ACCEPT = ".pdf,.docx,.txt,.md";

/** Why a picked file is not taken as a job description, in one calm line, or null when it is. */
export function jdFileProblem(file: Pick<File, "name" | "type" | "size">): string | null {
  const refused = fileRefusal(file);
  if (refused) return refused;
  if (!/\.(pdf|docx|txt|md|markdown)$/i.test(file.name)) return "I can read a PDF, Word (.docx) or text file here.";
  return null;
}

export type JdCheck = { ok: true; text: string } | { ok: false; problem: string };

/** The pasted job description: text, not a link (nothing here opens links), and long enough to be one. */
export function checkJd(input: string): JdCheck {
  const text = input.trim();
  if (!text) return { ok: false, problem: "Paste the whole job description, or add it later." };
  if (isBareUrl(text)) return { ok: false, problem: "That's a link, and I can't open links. Paste the text of the job description instead." };
  if (text.length < JD_MIN) return { ok: false, problem: "Paste the whole job description, or add it later." };
  if (text.length > JD_MAX) {
    return { ok: false, problem: `That's ${grouped(text.length)} characters, and the limit is ${grouped(JD_MAX)}. Trim it to the part that describes the role.` };
  }
  return { ok: true, text };
}

/**
 * Whether Continue is there to press: as soon as anything is typed, even when it is not enough yet. Pressing
 * it then says what is needed (`checkJd`'s line) instead of the button being gone and the page silent.
 */
export const jdTryable = (input: string): boolean => input.trim().length > 0;

export const NAME_MAX = 120;

export const validName = (s: string): string | null => {
  const v = s.trim().replace(/\s+/g, " ");
  return v.length >= 1 && v.length <= NAME_MAX ? v : null;
};

/** Why a name was not taken, for the line under the answer. */
export const nameProblem = (s: string): string =>
  s.trim().length > NAME_MAX ? `That's ${s.trim().length} characters. Keep your name under ${NAME_MAX}.` : "Tell me what to call you.";

/** An organisation's or a client's company name: 2 to 80 characters, and a name, not an address. */
export const validCompany = (s: string): string | null => {
  const v = s.trim().replace(/\s+/g, " ");
  return v.length >= 2 && v.length <= 80 && !isBareUrl(v) ? v : null;
};

/** Why a company name was not taken. */
export const companyProblem = (s: string, what: "organisation" | "client"): string => {
  const v = s.trim();
  if (v && isBareUrl(v)) return `Just the ${what === "client" ? "company's" : "organisation's"} name, like Acme. No link needed.`;
  if (v.length > 80) return `That's ${v.length} characters. Keep it under 80.`;
  if (v.length === 1) return "Use at least 2 characters.";
  return what === "client" ? "Add the client's company name." : "Add the name of your company or agency.";
};

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? "";

export const initialsOf = (s: string): string =>
  s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? "")
    .join("") || "·";

/** "acme-hire.co.in" becomes "Acme Hire": a starting point for an organisation's name, which they edit. */
export function nameFromDomain(domain: string | null): string {
  const label = domain?.split(".")[0] ?? "";
  return label.split(/[-_]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** What to call the client in a sentence. */
export const clientLabel = (a: Answers): string => a.client || "your client";

export const roleText = (r: RoleAnswer | null): string | null => (r?.kind === "title" ? r.title : null);

/** The organisation's name when one was chosen or asked for, else null: Personal has no name to show. */
export const organisationOf = (a: Answers): string | null => (a.team && a.team.kind !== "personal" ? a.team.name : null);

/** Common starting points, so the first role is one tap. Plain suggestions, not read from anywhere. */
export const ROLE_SUGGESTIONS = ["Software Engineer", "Product Designer", "Data Analyst", "Sales Manager"] as const;

/* ── which pose, which field, which power ───────────────────────────────── */

export type Pose = "idle" | "tap" | "watch" | "think" | "tablet" | "laptop" | "door" | "rise";

export const POSE: Record<Beat, Pose> = {
  name: "idle",
  team: "tablet",
  role: "tablet",
  jd: "tablet",
  client: "tablet",
  powers: "watch",
  finish: "laptop",
};

export const FIELD: Record<Beat, 1 | 2 | 3 | 4> = { name: 1, team: 1, role: 2, jd: 2, client: 3, powers: 3, finish: 4 };

export type PowerId = "mind" | "reach" | "voice" | "forms" | "insight" | "memory";

export const POWERS: readonly { id: PowerId; segment: 1 | 2 | 3 | 4 | 5 | 6; title: string; feature: string; line: string }[] = [
  { id: "mind", segment: 1, title: "Mind", feature: "Search agents", line: "Agents that source, shortlist and keep watching for new people." },
  { id: "reach", segment: 2, title: "Reach", feature: "Contact finder", line: "Save any LinkedIn profile and get a number or email in one click." },
  { id: "voice", segment: 3, title: "Voice", feature: "Follow-up agents", line: "Follow-ups written for you, and nothing goes out until you approve it." },
  { id: "forms", segment: 4, title: "Forms", feature: "Specialised forms", line: "Application forms and screening, in your client's look." },
  { id: "insight", segment: 5, title: "Insight", feature: "Analytics", line: "See what's working: sourcing, replies and time to hire." },
  { id: "memory", segment: 6, title: "Memory", feature: "Agency memory", line: "Mind remembers each client's likes and no's." },
];

/* ── the words: Mind's lines for each beat, `*word*` is emphasised ── */

/** A headline of one or two lines, typed out, and one quiet line under it that fades up after. */
export type Words = { head: string[]; quiet: string | null };

/** What the screen is doing within a beat, where the words change with it. */
export type WordsState = { askingClient?: boolean; hasJd?: boolean; /** The client the job description names, offered to confirm. */ foundClient?: string | null };

/**
 * The client the job description names, for the person to confirm: never their own organisation (or the one they
 * are creating), and null when the description names no one or there is none.
 */
export function foundClientOf(a: Answers, domainName = ""): string | null {
  if (!a.jd || a.role?.kind !== "title") return null;
  const own = [a.team?.kind === "create" || a.team?.kind === "asked" ? a.team.name : "", domainName];
  return clientInJd(a.jd, own);
}

export function words(beat: Beat, a: Answers, s: WordsState = {}): Words {
  switch (beat) {
    case "name":
      return { head: ["Hi, I'm *Mind*.", "What should I call you?"], quiet: "I find, shortlist and follow up with candidates. You approve everything I send." };
    case "team":
      return { head: ["Let me see if your *team* is here."], quiet: null };
    case "role":
      return { head: ["Which role should we start with?"], quiet: "A job title is enough. The description comes next." };
    case "jd":
      return { head: ["Paste the *job description*."], quiet: "Mind reads it and drafts the role spec. You approve it before anything starts." };
    case "client":
      if (s.foundClient && !s.askingClient)
        return { head: [`The client is *${s.foundClient}*.`, "Right?"], quiet: "It's in the job description. Change it if that's not right." };
      return s.askingClient
        ? { head: [`Who is *${roleText(a.role) ?? "this role"}* for?`], quiet: "Just the client's company name. That's all I need." }
        : { head: [`Is *${roleText(a.role) ?? "this role"}* for a client?`], quiet: "Each client's roles and preferences stay separate, so nothing gets mixed up." };
    case "powers":
      return { head: ["Here's what you've *unlocked*."], quiet: "Six powers, switched on for you." };
    case "finish":
      if (roleSkipped(a)) {
        const org = a.team?.kind === "create" ? a.team.name : null;
        return { head: [org ? `Setting up *${org}*.` : "Setting up *Personal*."], quiet: "This takes a few seconds." };
      }
      return { head: ["Setting up your *first campaign*."], quiet: s.hasJd ? "Mind starts on the job description as soon as this is ready." : "This takes a few seconds." };
  }
}

/** The team step's words, by what it is asking. */
export type TeamAsk = "create" | "ask" | "loading";

/**
 * No greeting here: the story just before it said "Nice to meet you", and saying it twice in a row reads as a
 * script. `a` is kept for callers that pass what they know.
 */
export function teamWords(ask: TeamAsk, _a: Answers, domainName: string): Words {
  switch (ask) {
    case "ask":
      return { head: ["Which *organisation* do you work with?"], quiet: null };
    case "create":
      return {
        head: [domainName ? `Is this for *${domainName}*, or just you?` : "Is this for a *team*, or just you?"],
        quiet: "Create it and you're its owner. Or start in Personal, which only you can see.",
      };
    case "loading":
      return { head: ["Let me see if your *team* is here."], quiet: null };
  }
}

/** The button that makes the organisation: it says which one, so there is no doubt what is being made. */
export function createLabel(name: string | null): string {
  const n = (name ?? "").trim().replace(/\s+/g, " ");
  if (!n) return "Create";
  const shown = n.length > 26 ? `${n.slice(0, 25).trimEnd()}…` : n;
  return `Create ${shown}`;
}

/** What Mind says when everything is made. Says what role the person holds, and that Personal is private. */
export function readyWords(a: Answers): Words {
  const first = firstName(a.name);
  const head = [first ? `You're set, *${first}*.` : "You're set."];
  const org = a.team?.kind === "create" ? a.team.name : null;
  if (roleSkipped(a)) {
    return { head, quiet: org ? `You're the owner of ${org}. You can invite your team and add your first role whenever you're ready.` : "Personal is yours alone, so only you can see what's in it. Tell Mind which role to start with whenever you're ready." };
  }
  if (org) return { head, quiet: `You're the owner of ${org}. You can invite your team, assign work and see every campaign.` };
  if (a.jd) return { head, quiet: "Mind is reading the job description and drafting your first role spec for you to approve. Personal is yours alone, so only you can see what's in it." };
  return { head, quiet: "Your first campaign is ready. Mind will ask for the job description. Personal is yours alone, so only you can see what's in it." };
}

/** The line Mind says while the story plays after the name: she has just woken Mind. */
export const AWAKE = (name: string): string[] => [firstName(name) ? `Nice to meet you, *${firstName(name)}*.` : "Nice to meet you."];

/** What the person's answer reads like once it has moved up to the top of the next turn. */
export function answerText(beat: Beat, a: Answers): string | null {
  switch (beat) {
    case "name":
      return a.name || null;
    case "team":
      return a.team?.kind === "personal" ? "Just me" : (a.team?.name ?? null);
    case "role":
      return roleText(a.role);
    case "jd":
      return a.jd ? "Job description added" : null;
    case "client":
      return a.forClient === true ? (a.client ?? "A client") : a.forClient === false ? "My own company" : null;
    default:
      return null;
  }
}
