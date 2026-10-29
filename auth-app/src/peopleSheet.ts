/**
 * A recruiter's own sheet of people, in the chat. Everything here is pure: what the server's reading of the sheet says
 * in words, what the button offers, how the people are cut into batches, what the result says, and where a sheet goes
 * (the people card, or the existing roles import). The card (liveViews/PeopleImport.tsx) only draws it.
 * Server: modules/candidates/sheet-import.ts.
 */

import { type AssistUnusedWhy, type ClientPlanWire, type PlaceStage, type PlaceStep, type SheetRole, type WhereField, type WhereOp, contentWords, fold } from "./attachContract";
import { campaignHref } from "./chatCards";

/* ── what the server says ── */

/** What a column may be taken for: one list, shared with the server (attachContract.ts). */
export type Role = SheetRole;

export type Confidence = "sure" | "likely" | "guess";

export type SheetColumn = {
  /** Its place in the sheet, counting from 0. */
  index: number;
  header: string;
  role: Role;
  confidence: Confidence;
  /** "plan": worked out from the layout and the words typed beside the sheet, and checked; the person's own choice still wins. */
  how: "header" | "content" | "chosen" | "plan";
  /** Up to two cells, so a person can tell what the column is. */
  samples: string[];
};

/** What the import takes for one person. */
export type SheetFields = {
  fullName?: string;
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  moreEmails?: string[];
  morePhones?: string[];
  /** Of the numbers, the ones that are a company's line: they reach the person and never tell two people apart. */
  linePhones?: string[];
  workEmail?: string;
  title?: string;
  company?: string;
  location?: string;
  yearsOfExperience?: number;
  skills?: string[];
  notes?: string;
};

export type RowToSend = {
  row: number;
  tab: string;
  state: "new" | "here";
  fields: SheetFields;
  /** What the sheet's status column says of them, as it says it: placing them by it is a tick on the card. */
  status?: string;
  /** What the same person's later rows say, when it differs (a tracker lists someone again as they move on): placing them goes by each in turn, as a link to the sheet does. */
  alsoSaid?: string[];
};

export type Stage = PlaceStage;
export type Step = PlaceStep;
/** Where a status puts someone: a stage, and in the two that have steps, the step. */
export type Wanted = { stage: Stage; step?: Step };

/** One thing the sheet's status column says, how many of the people to add say it, and where the server's rules put it (null: nobody can place it). */
export type StatusWord = { text: string; n: number; want: Wanted | null; word: string | null };

/* ── what the server did with the words typed beside the sheet ── */

export type { WhereField, WhereOp };

/** One choosing of people the words asked for, with how many of the sheet's people it keeps. */
export type AssistLine = {
  field: WhereField;
  op: WhereOp;
  values: string[];
  n?: number;
  kept: number;
  of: number;
  on: boolean;
  /** Made from words that say "not" or "except": it starts off, for the person to tick, with their own words beside it. */
  negated?: boolean;
  phrase?: string;
};

/** Why part of the words was not applied, as the card is told (the plan it keeps holds all but "unavailable"). */
export type UnusedWhy = AssistUnusedWhy;

/** What the card keeps of a plan and sends back with a rule ticked or a tab chosen: the server reads the sheet again, with no model. One shape, shared with the server (attachContract.ts). */
export type ClientPlan = ClientPlanWire;

export type Assist = {
  /** Why the reading was worth a second look: a column was a guess, it is not people, tabs that are not all people. */
  gate: Array<"check" | "other" | "tabs" | "say">;
  used?: boolean;
  source?: "model" | "cache" | "none";
  why?: "quota" | "busy" | "invalid" | "off" | "vetoed";
  before?: { people: number };
  changed?: Array<{ tab: string; col: number; header: string; from: Role; to: Role; why?: "protected" }>;
  lines?: AssistLine[];
  unused?: Array<{ said: string; why: UnusedWhy }>;
  vetoes?: Array<{ tab: string; col: number; header: string; why: "someone_else" | "papers" | "no_support" | "name_taken" }>;
  campaign?: { id: string; name: string } | null;
  ask?: "which_tab" | "which_name_column" | null;
  protected?: boolean;
  plan?: ClientPlan;
};

export type LeftOut = { row: number; tab: string; why: string; who?: string; reasons?: string[] };

export type PeopleSheet = {
  kind: "people" | "roles" | "other";
  /** `used: false`: a tab with people in it that was not read this time (the main tab alone is read by default). */
  tabs: Array<{ name: string; rows: number; people: number; used?: false }>;
  /** What the workbook hides in the tabs read, left out unless `included`. Absent from an older server. */
  hidden?: { rows: number; columns: number; included: boolean };
  tab: string | null;
  headerRow: number | null;
  columns: SheetColumn[];
  needsCheck: boolean;
  counts: {
    rows: number;
    people: number;
    toAdd: number;
    alreadyHere: number;
    onCampaign: number;
    repeats: number;
    left: number;
    namesFromLinks: number;
    phonesRebuilt: number;
    phonesCut: number;
    /** Only when rules from the words were applied: the people they left out. `people` counts them. */
    filtered?: number;
  };
  leftOutBy: Record<string, number>;
  leftOut: LeftOut[];
  rows: RowToSend[];
  /** Only when the sheet was worth a second look or the words asked for more than adding. A sheet that needed none says nothing of it. */
  assist?: Assist;
  /** Only when some of the people to add have a status: the sheet's words for it. They are for the person to choose by, and go nowhere else. */
  statusWords?: StatusWord[];
};

/* ── the columns, and what a person may say one is ── */

/** What the dropdown offers, in the order a person thinks of them. The server's `date` and `addedBy` are "leave out". */
export const ROLE_CHOICES: ReadonlyArray<readonly [Role, string]> = [
  ["name", "Full name"],
  ["firstName", "First name"],
  ["middleName", "Middle name"],
  ["lastName", "Last name"],
  ["linkedin", "LinkedIn link"],
  ["email", "Email"],
  ["workEmail", "Work email"],
  ["phone", "Phone"],
  ["contacts", "Emails and numbers together"],
  ["title", "Job title"],
  ["company", "Company"],
  ["location", "Location"],
  ["years", "Years of experience"],
  ["skills", "Skills"],
  ["notes", "Notes"],
  ["about", "About them"],
  ["education", "Education"],
  ["history", "Work history"],
  ["status", "Status"],
  ["extra", "Keep as a note"],
  ["ignore", "Leave out"],
];

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  ...(Object.fromEntries(ROLE_CHOICES) as Record<Role, string>),
  date: "Leave out",
  addedBy: "Leave out",
};

/** The dropdown's value for a role: the sheet's own bookkeeping reads as left out. */
export const selectValue = (role: Role): Role => (role === "date" || role === "addedBy" ? "ignore" : role);

/** Whether a column is read at all (a person sees these first; the rest are under "left out"). */
export const isUsed = (c: SheetColumn): boolean => c.role !== "ignore" && c.role !== "date" && c.role !== "addedBy";

const letters = (i: number): string => {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

/** What a column is called: its header, or "Column C" when the sheet has none. */
export const columnName = (c: Pick<SheetColumn, "header" | "index">): string => c.header.trim() || `Column ${letters(c.index)}`;

/** A column by its header and its place, "Email (column C)", so two columns with the same header are not the same name. */
export const columnLabel = (c: Pick<SheetColumn, "header" | "index">): string => {
  const header = c.header.trim();
  return header ? `${header} (column ${letters(c.index)})` : `Column ${letters(c.index)}`;
};

/** What a column's dropdown is called to someone who cannot see the rest of the row: "What Email (column C) is". */
export const columnQuestion = (c: Pick<SheetColumn, "header" | "index">): string => `What ${columnLabel(c)} is`;

/** The columns a person has set by hand, as the server takes them: "3:phone,5:email". Nothing when none. */
export function columnsParam(chosen: Readonly<Record<number, Role>>): string | undefined {
  const parts = Object.entries(chosen)
    .map(([i, role]) => [Number(i), role] as const)
    .filter(([i]) => Number.isInteger(i) && i >= 0)
    .sort((a, b) => a[0] - b[0])
    .map(([i, role]) => `${i}:${role}`);
  return parts.length ? parts.join(",") : undefined;
}

/** What `chosen` becomes when a column is set: setting it to what the sheet already said clears the choice. */
export function choose(
  chosen: Readonly<Record<number, Role>>,
  column: Pick<SheetColumn, "index" | "role" | "how">,
  role: Role,
): Record<number, Role> {
  const next = { ...chosen };
  if (column.how !== "chosen" && selectValue(column.role) === role) delete next[column.index];
  else next[column.index] = role;
  return next;
}

/* ── what is said, in words ── */

const n = (v: number): string => v.toLocaleString("en-IN");
const plural = (v: number, one: string, many = `${one}s`): string => `${n(v)} ${v === 1 ? one : many}`;

export function headline(p: Pick<PeopleSheet, "counts">, fileName: string): string {
  const people = p.counts.people;
  if (!people) return `I couldn't find anyone to add in ${fileName}`;
  return `I found ${plural(people, "person", "people")} in ${fileName}`;
}

/** What the sheet holds, a line each, nothing that is zero. `onCampaignName`: the shortlist asked about. */
export function factLines(p: PeopleSheet, shortlistName: string | null): string[] {
  const c = p.counts;
  const out: string[] = [];
  if (c.toAdd) out.push(`${n(c.toAdd)} new to your candidates`);
  if (c.alreadyHere) {
    const onIt = shortlistName && c.onCampaign ? `, ${n(c.onCampaign)} already on the ${shortlistName} shortlist` : "";
    // The import skips whoever is here: what the sheet says of them does not change what is already kept.
    out.push(`${n(c.alreadyHere)} already in your candidates, kept as they are${onIt}`);
  }
  if (c.repeats) out.push(`${plural(c.repeats, "row")} for someone who is in the sheet more than once, joined into one`);
  if (c.namesFromLinks) out.push(`${plural(c.namesFromLinks, "name")} taken from the LinkedIn link or email, as the sheet has none`);
  if (c.phonesRebuilt) out.push(`${plural(c.phonesRebuilt, "phone number")} that Excel had turned into a long number, put back`);
  // A date is never read as anything: said only when the sheet has such a column, so a sheet without one is not told of it.
  if (p.columns.some((col) => col.role === "date")) out.push(DATES_LINE);
  return out;
}

export const DATES_LINE = "Dates in the sheet are not used.";

const WHY: Record<string, (v: number) => string> = {
  "no-contact": (v) => `${v === 1 ? "has" : "have"} no LinkedIn link, email or phone to tell them apart`,
  "bad-link": (v) => `${v === 1 ? "has a link that isn't" : "have links that aren't"} a profile, like a company page`,
  "bad-phone": (v) => `${v === 1 ? "has a phone number" : "have phone numbers"} I couldn't use, and nothing else to go on`,
  "cut-phone": (v) => `${v === 1 ? "has a phone number" : "have phone numbers"} that Excel cut short, which I didn't use`,
  "no-name": (v) => `${v === 1 ? "has" : "have"} no name, and none I could take from the link or email`,
  invalid: (v) => `${v === 1 ? "has" : "have"} something I couldn't read`,
  hidden: (v) => `${v === 1 ? "is" : "are"} hidden in the sheet, so ${v === 1 ? "it was" : "they were"} left out`,
  filtered: (v) => `${v === 1 ? "is" : "are"} not among the people your words ask for`,
};

/** How many rows to name beside a reason before "and N more". */
const NAMED = 3;

/** Why rows were left out, in plain words: "2 rows have no LinkedIn link, email or phone (row 5, row 9)". */
export function leftOutLines(p: PeopleSheet): string[] {
  const manyTabs = p.tabs.filter((t) => t.people > 0 || t.rows > 0).length > 1;
  return Object.entries(p.leftOutBy)
    .filter(([, v]) => v > 0)
    .map(([why, v]) => {
      const rows = p.leftOut.filter((l) => l.why === why);
      const named = rows.slice(0, NAMED).map((l) => `${manyTabs ? `${l.tab} ` : ""}row ${l.row}`);
      const more = v - named.length;
      const where = named.length ? ` (${named.join(", ")}${more > 0 ? ` and ${n(more)} more` : ""})` : "";
      const say = WHY[why] ?? WHY.invalid;
      return `${n(v)} ${v === 1 ? "row" : "rows"} ${say ? say(v) : ""}${where}`;
    });
}

/** The line above the columns when they need a look: what is not known, or what was only a guess. */
export function lookLine(p: PeopleSheet): string | null {
  if (!p.needsCheck) return null;
  const reach = p.columns.some((c) => ["linkedin", "email", "workEmail", "phone", "contacts"].includes(c.role));
  if (!reach) return "I couldn't tell which column holds LinkedIn links, emails or phone numbers. Choose them below.";
  if (!p.columns.some((c) => ["name", "firstName", "lastName"].includes(c.role)))
    return "I couldn't tell which column holds the names. Choose it below.";
  return "I wasn't sure about a column or two. Have a quick look before adding.";
}

/** The columns a person sees first, and the ones read as left out. */
export function splitColumns(p: PeopleSheet): { used: SheetColumn[]; left: SheetColumn[] } {
  return { used: p.columns.filter(isUsed), left: p.columns.filter((c) => !isUsed(c)) };
}

/* ── what is added, said first ── */

/**
 * The first line of the card: what is being added from the file, and that nothing else in it is. When more than one tab holds
 * people and some were not chosen, it says which tabs these are from, so the line is true.
 */
export function scopeLine(p: Pick<PeopleSheet, "tabs"> | null, fileName: string): string {
  const used = p ? p.tabs.filter((t) => t.people > 0 && t.used !== false) : [];
  const skipped = p ? p.tabs.some((t) => t.people > 0 && t.used === false) : false;
  const from = skipped && used.length
    ? `the ${used.map((t) => t.name).join(" and ")} ${used.length === 1 ? "tab" : "tabs"} of ${fileName}`
    : fileName;
  return `Adding people from ${from}. Nothing else in it is added.`;
}

/** The tabs a person can tick: the ones with people in them. More than one, or there is nothing to choose. */
export const tabChoices = (p: Pick<PeopleSheet, "tabs">): PeopleSheet["tabs"] => (p.tabs.filter((t) => t.people > 0).length > 1 ? p.tabs.filter((t) => t.people > 0) : []);

/**
 * Every tab with something in it, as a line to tick: the ones with people, and the ones read as no people, which are shown so the
 * person knows they are there and cannot be ticked. Nothing to choose when only one tab has people and the rest hold nothing to add.
 */
export function tabRows(p: Pick<PeopleSheet, "tabs">): Array<{ name: string; people: number; rows: number; on: boolean; readable: boolean }> {
  const withPeople = p.tabs.filter((t) => t.people > 0);
  if (withPeople.length <= 1) return [];
  return p.tabs
    .filter((t) => t.rows > 0)
    .map((t) => ({ name: t.name, people: t.people, rows: t.rows, on: t.people > 0 && t.used !== false, readable: t.people > 0 }));
}

/** The names ticked, as the sheet was read: every tab with people that was used. */
export const tickedTabs = (p: Pick<PeopleSheet, "tabs">): string[] => p.tabs.filter((t) => t.people > 0 && t.used !== false).map((t) => t.name);

/** What the tick for the rows and columns a sheet hides says: what is left out, or that it is read. */
export function hiddenLabel(h: { rows: number; columns: number; included: boolean }): string {
  if (h.included) return "Hidden rows and columns are included";
  const parts = [h.rows ? plural(h.rows, "row") : "", h.columns ? plural(h.columns, "column") : ""].filter(Boolean);
  return `Include the ${parts.join(" and ")} the sheet hides`;
}

/** Whether there is anything hidden to choose about. */
export const hasHidden = (p: Pick<PeopleSheet, "hidden">): boolean => !!p.hidden && (p.hidden.rows > 0 || p.hidden.columns > 0 || p.hidden.included);

/* ── what the words typed beside the sheet did, said in the card's own words ── */

const ROLE_NOW: Partial<Record<Role, string>> = { ignore: "is left out", extra: "is kept as a note", date: "is left out", addedBy: "is left out" };

/** What one column became, "Mob is now Phone", "Src is left out". */
const becomes = (c: { header: string; col: number; to: Role }): string =>
  `${columnName({ header: c.header, index: c.col })} ${ROLE_NOW[c.to] ?? `is now ${ROLE_LABEL[c.to]}`}`;

/**
 * The line that says the columns were checked and what changed, with the people before and after when that moved them. Absent when
 * nothing changed (the model looked and the reader was right) or the sheet was not looked at.
 */
export function changedLine(p: Pick<PeopleSheet, "assist" | "counts">): string | null {
  const a = p.assist;
  const changes = (a?.changed ?? []).filter((c) => c.why !== "protected");
  if (!a?.used || !changes.length) return null;
  const shown = changes.slice(0, 6).map(becomes);
  const more = changes.length - shown.length;
  const people = p.counts.people;
  const before = a.before?.people;
  const moved = before !== undefined && before !== people ? ` ${plural(people, "person", "people")}, ${n(before)} before.` : "";
  return `I checked the columns and changed ${changes.length}: ${shown.join(", ")}${more > 0 ? ` and ${n(more)} more` : ""}.${moved}`;
}

/** The columns left out because they are about who someone is (age, gender, marital status…), in one sentence. */
export function protectedColumnsLine(a: Assist | undefined): string | null {
  const cols = (a?.changed ?? []).filter((c) => c.why === "protected");
  if (!cols.length) return null;
  const names = cols.map((c) => columnName({ header: c.header, index: c.col }));
  return `I left out ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`}: ${names.length === 1 ? "it is" : "they are"} about who someone is, not what they have done.`;
}

const list = (values: readonly string[]): string => {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
};

/** A rule in the card's words, with what it keeps: "Only people in Pune: 18 of 61". */
export function ruleText(l: AssistLine): string {
  const v = list(l.values);
  const head = ((): string => {
    switch (l.field) {
      case "location":
        return l.op === "not_any_of" ? `Leaving out people in ${v}` : `Only people in ${v}`;
      case "title":
        return l.op === "not_any_of" ? `Leaving out titles with ${v}` : `Only titles with ${v}`;
      case "company":
        return l.op === "not_any_of" ? `Leaving out people at ${v}` : `Only people at ${v}`;
      case "skills":
        return l.op === "not_any_of" ? `Leaving out people with ${v}` : `Only people with ${v}`;
      case "status":
        return l.op === "not_any_of" ? `Leaving out people marked ${v}` : `Only people marked ${v}`;
      case "years":
        if (l.op === "blank") return "Only people with no years of experience given";
        if (l.op === "not_blank") return "Only people with years of experience given";
        return `${l.op === "gte" ? "At least" : "At most"} ${l.n ?? 0} ${l.n === 1 ? "year" : "years"} of experience`;
    }
  })();
  const named = l.op === "blank" ? `Only people with no ${FIELD_NAME[l.field]}` : l.op === "not_blank" ? `Only people with a ${FIELD_NAME[l.field]}` : head;
  return `${named}: ${n(l.kept)} of ${n(l.of)}`;
}

const FIELD_NAME: Record<WhereField, string> = { location: "location", title: "title", company: "company", years: "years of experience", skills: "skills", status: "status" };

export type RuleLine = { key: string; text: string; on: boolean; phrase: string | null };

/** The rules the words made, each a line with its own tick; one made from "except" or "not" starts off and carries the person's words. */
export function ruleLines(a: Assist | undefined): RuleLine[] {
  return (a?.lines ?? []).map((l, i) => ({ key: `${i}:${l.field}:${l.op}`, text: ruleText(l), on: l.on, phrase: l.negated && l.phrase ? l.phrase : null }));
}

/** Whether `said` is a piece of `typed`, as far as spaces and capitals go: only a person's own words are ever quoted back to them. */
export const isPieceOf = (typed: string, said: string): boolean => {
  const flat = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  const piece = flat(said);
  return piece.length > 0 && flat(typed).includes(piece);
};

/** Said when the words were worth reading and the reading could not be had (the assistant was busy, or the request did not get through): never silent. */
export const unavailableLine = (said: string): string => `I couldn't use '${said}' this time. Add them as they are, or say it again once they are in.`;

/**
 * What could not be done with the words, in the person's own quoted words (and only if they are theirs). The word "protected" is the
 * one sentence for everything left out for being about who someone is. `inAlready`: everyone is in already, so there is nobody to add and
 * a next step goes on at once, not after an adding.
 */
export function unusedLines(a: Assist | undefined, typed: string | null, inAlready = false): string[] {
  if (!a?.unused?.length || !typed) return [];
  const out: string[] = [];
  for (const u of a.unused) {
    if (u.why === "protected" || !isPieceOf(typed, u.said)) continue;
    const said = u.said.trim();
    switch (u.why) {
      case "no_column":
        out.push(`I couldn't apply '${said}': no column says it.`);
        break;
      case "next_step":
        out.push(inAlready ? `'${said}' is a next step. They are in already, so I'm passing it on now.` : `I'll add them. '${said}' is a next step: I'll pass it on once they're in.`);
        break;
      case "unclear":
        out.push(`I couldn't tell whether '${said}' was to keep people or leave them out, so I didn't apply it.`);
        break;
      case "unavailable":
        out.push(unavailableLine(said));
        break;
    }
  }
  return out;
}

/**
 * The parts of the words that are a next step ("start outreach to the ones who replied"), as the person typed them: what the card hands
 * to the agent once the people are in, and nothing else. What no column says, what was unclear and what was left out for being about
 * who someone is stay on the card, and nothing of the words ever goes to the agent before the people are added.
 */
export function nextStepsOf(unused: ReadonlyArray<{ said: string; why: UnusedWhy }> | undefined, typed: string | null): string[] {
  if (!unused?.length || !typed) return [];
  const out: string[] = [];
  for (const u of unused) {
    const said = u.said.replace(/\s+/g, " ").trim();
    if (u.why === "next_step" && isPieceOf(typed, said) && !out.includes(said)) out.push(said);
  }
  return out.slice(0, 3);
}

/**
 * Said when the words typed beside the files were not read: what is left of them, once the words of adding and the campaign they name
 * are taken out, is one word, which is not something a sheet can be told. Nothing was asked about it, so it is said, in the person's own word.
 */
export function unreadLine(typed: string | null, campaignNames: readonly string[] = []): string | null {
  if (!typed) return null;
  const left = contentWords(typed, campaignNames);
  if (left.length !== 1) return null;
  const word = (typed.match(/[\p{L}\p{N}]+/gu) ?? []).find((w) => fold(w) === left[0]);
  return `I didn't use '${(word ?? left[0] ?? "").slice(0, 60)}'. Add them as they are, or say it again once they are in.`;
}

/** Said once when part of the words asked for people by who they are. */
export const PROTECTED_LINE =
  "I don't pick people by age, gender, religion, caste, marital status, health or where they're from, so I left that out. The rest of your words are applied.";

/** Said when the model's help was worth asking for about the columns and was not had; a reading that is simply plain says nothing about it. */
export function fallbackLine(a: Assist | undefined): string | null {
  if (!a || a.used !== false || !a.why || a.why === "off") return null;
  if (!a.gate.some((g) => g === "check" || g === "other" || g === "tabs")) return null;
  const check = "Check the columns before adding.";
  if (a.why === "quota") return `I can't ask for help with columns again this hour, so I read the sheet the standard way. ${check}`;
  if (a.why === "vetoed") return `I wasn't sure what to change, so I read the sheet the standard way. ${check}`;
  return `The assistant is busy, so I read the sheet the standard way. ${check}`;
}

const VETO_WHY: Record<NonNullable<Assist["vetoes"]>[number]["why"], (name: string) => string> = {
  someone_else: (name) => `I didn't use my reading of ${name}. It looks like someone else's, so it stays a note.`,
  papers: (name) => `I didn't use my reading of ${name}. It looks like an ID or a date, so it is left out.`,
  no_support: (name) => `I didn't use my reading of ${name}: its cells don't look like it. It stays a note.`,
  name_taken: (name) => `I didn't use my reading of ${name}: another column already holds the names.`,
};

export const vetoLines = (a: Assist | undefined): string[] =>
  (a?.vetoes ?? []).map((v) => VETO_WHY[v.why](columnName({ header: v.header, index: v.col })));

/** The one question the model could not answer for itself, as a line to act on. */
export const askLine = (a: Assist | undefined): string | null =>
  a?.ask === "which_tab"
    ? "I couldn't tell which tab holds the people. Tick it below."
    : a?.ask === "which_name_column"
      ? "I couldn't tell which column holds the names. Choose it below."
      : null;

/** The campaign the model took the words to name, from a reading of the sheet. Every reading carries it, the first answer's and the ones after a tick. */
export const suggestedBy = (sheet: Pick<PeopleSheet, "assist"> | null): { id: string; name: string } | null => sheet?.assist?.campaign ?? null;

/**
 * Where the people go until the person chooses: what they chose (a campaign, or Candidates alone: null), else the campaign the model
 * took their words to name (when the console's own match of the words found none), else the one the chat is on, if they may use it.
 */
export function whereTheyGo(a: {
  pick: string | null | undefined;
  /** The console's own match of the words found a campaign. */
  words: boolean;
  suggests: ReadonlyArray<{ id: string; name: string } | null>;
  campaigns: ReadonlyArray<{ id: string }>;
  onFocus: boolean;
  focusId: string | null;
}): { suggested: { id: string; name: string } | null; wanted: string | null } {
  const suggested = a.words ? null : (a.suggests.find((s) => s && a.campaigns.some((c) => c.id === s.id)) ?? null);
  const wanted = a.pick === undefined ? (suggested ? suggested.id : a.onFocus ? a.focusId : null) : a.pick;
  return { suggested, wanted };
}

/** The plan, with the rules ticked as the card has them: what is sent back so the server reads the sheet again. */
export function planWith(plan: ClientPlan, ticks: readonly boolean[]): ClientPlan {
  return { ...plan, where: plan.where.map((w, i) => ({ ...w, on: ticks[i] ?? w.on })) };
}

/** The plan with one tab read or left. A tab the plan did not name is added to it. */
export function planWithTab(plan: ClientPlan, name: string, use: "people" | "skip"): ClientPlan {
  const has = plan.tabs.some((t) => t.name === name);
  return { ...plan, tabs: has ? plan.tabs.map((t) => (t.name === name ? { ...t, use } : t)) : [...plan.tabs, { name, use }] };
}

/** Whether the sheet is worth a plan: it said so (a column was a guess, it is not people, tabs that are not all people), or the words ask for more. */
export const worthAPlan = (p: Pick<PeopleSheet, "assist"> | null, wordsAsk: boolean): boolean => wordsAsk || (p?.assist?.gate.length ?? 0) > 0;

/**
 * What a file does the first time it looks at itself: use the reading it came with, ask for the model's help, or read again. The
 * reading it came with is used as it is when it was made for the place the people go and nothing has been asked of it since; it is
 * the model's turn when that reading says it is worth it (or the words ask for more than adding) and it has not had it.
 */
export function firstStep(a: {
  start: boolean;
  read: PeopleSheet | null;
  readFor: string | null;
  campaignId: string | null;
  columns: string | undefined;
  tabs: readonly string[] | undefined;
  hidden: boolean;
  /** A plan was already kept from an answer: a reading is the next thing. */
  kept: boolean;
  /** The help was already asked for. */
  planned: boolean;
  wordsAsk: boolean;
}): "use" | "plan" | "read" {
  // No reading came with the file (the paperclip's own read gave up: too many people to add at once, which words can leave most of out)
  // and the words ask for more: the help reads the sheet itself, where a plain reading would stop at the number.
  if (a.start && !a.read && !a.kept && !a.planned && a.wordsAsk) return "plan";
  const known = a.start && !!a.read && a.readFor === a.campaignId && !a.columns && !a.tabs && !a.hidden && !a.kept;
  if (!known) return "read";
  return a.planned || !worthAPlan(a.read, a.wordsAsk) ? "use" : "plan";
}

/** Whether a reading that has just come in is to be followed by the model's help: once, when it says it is worth it. */
export const planAfter = (read: PeopleSheet, how: "read" | "plan", planned: boolean, wordsAsk: boolean): boolean =>
  how === "read" && !planned && worthAPlan(read, wordsAsk);

/* ── the button, and the batches behind it ── */

/** The people the button adds: the new ones, and (on a campaign) the ones already here that are not on its shortlist. */
export const toSend = (p: PeopleSheet): number => p.rows.length;

/** The button's words for this many people, or null when there are none. */
export function addLabelOf(total: number, shortlistName: string | null): string | null {
  if (!total) return null;
  return shortlistName ? `Add ${n(total)} to the ${shortlistName} shortlist` : `Add ${n(total)} to Candidates`;
}

/** What the button adds, said for a screen reader beside it: "212 people will be added to Candidates." Null when it adds nobody. */
export const countLine = (total: number, shortlistName: string | null): string | null =>
  total ? `${plural(total, "person", "people")} will be added ${shortlistName ? `to the ${shortlistName} shortlist` : "to Candidates"}.` : null;

/**
 * What the people of several files come to together: a person who is in more than one file is one, and the rows that were joined
 * into another are said plainly. "212 people from 3 files. 18 rows joined, because the same person is in more than one file."
 */
export function totalsLine(people: number, files: number, joined: number): string {
  const head = `${plural(people, "person", "people")} from ${plural(files, "file")}.`;
  return joined > 0 ? `${head} ${plural(joined, "row")} joined, because the same person is in more than one file.` : head;
}

/** The button's words, or null when there is nothing to add. */
export const addLabel = (p: PeopleSheet, shortlistName: string | null): string | null => addLabelOf(toSend(p), shortlistName);

/** What is said in place of the button when everyone is already where they would go. */
export function nothingToAdd(p: PeopleSheet, shortlistName: string | null): string {
  if (!p.counts.people) return "There is nobody to add. Check the columns above, or try another sheet.";
  const filtered = p.counts.filtered ?? 0;
  if (filtered >= p.counts.people) return "Nobody in the sheet matches your words. Untick a line under From your words to add them anyway.";
  // Some were left out by the words: of the rest, everyone is already there.
  if (filtered) return shortlistName ? `Everyone your words ask for is already on the ${shortlistName} shortlist.` : "Everyone your words ask for is already in your candidates.";
  return shortlistName ? `Everyone is already on the ${shortlistName} shortlist.` : "Everyone in the sheet is already in your candidates.";
}

/** The same for the card of several files, from the readings of the files that are ticked. */
export function nothingInFiles(sheets: readonly PeopleSheet[], shortlistName: string | null): string {
  if (!sheets.length) return "There is nobody to add. Tick a file above, or check its columns.";
  const people = sheets.reduce((sum, s) => sum + s.counts.people, 0);
  const filtered = sheets.reduce((sum, s) => sum + (s.counts.filtered ?? 0), 0);
  if (people && filtered >= people) return "Nobody in these files matches your words. Untick a line under From your words to add them anyway.";
  const here = shortlistName ? `on the ${shortlistName} shortlist` : "in your candidates";
  return filtered ? `Everyone your words ask for is already ${here}.` : `Everyone ${shortlistName ? "" : "in these files "}is already ${here}.`;
}

/**
 * Most people in a request, and the most it may weigh: a person's notes can run long, and a request has a ceiling (the
 * import takes 2 MB). Bytes, not characters: a Devanagari or CJK letter is three of them, so a batch of such notes that
 * is under the ceiling in characters can be well over it in the request.
 */
export const BATCH_ROWS = 150;
export const BATCH_BYTES = 1_500_000;

const encoder = new TextEncoder();
const weigh = (row: unknown): number => encoder.encode(JSON.stringify(row)).length;

export function batchesOf<T>(rows: readonly T[], size = BATCH_ROWS, bytes = BATCH_BYTES): T[][] {
  const out: T[][] = [];
  let part: T[] = [];
  let used = 0;
  for (const r of rows) {
    const cost = weigh(r);
    if (part.length && (part.length >= size || used + cost > bytes)) {
      out.push(part);
      part = [];
      used = 0;
    }
    part.push(r);
    used += cost;
  }
  if (part.length) out.push(part);
  return out;
}

/** How many people a sheet has when the server says it has more than can be added at once (a reading with no words, which could have left most out); null for any other failure. */
export function tooManyPeople(e: unknown): number | null {
  const people = typeof e === "object" && e !== null ? (e as { details?: { people?: unknown; limit?: unknown } }).details : undefined;
  return typeof people?.people === "number" && typeof people.limit === "number" && people.people > people.limit ? people.people : null;
}

/** Whether the server refused a request for its size (413): sent again in smaller parts, it may well go. */
export const isTooBig = (e: unknown): boolean =>
  typeof e === "object" && e !== null && ((e as { status?: unknown }).status === 413 || (e as { code?: unknown }).code === "too_large");

/** What a run of batches came to: the answers, how many people went in, whether it was told to stop, and why it failed (if it did). */
export type Run = { parts: BatchResult[]; sent: number; stopped: boolean; failure: { error: unknown } | null };

/**
 * Sends the people a batch at a time, in order. It stops at the first batch that fails (what was sent is counted, and `sent`
 * says where it got to, so the rest can go again: the import skips whoever is already there). A batch the server finds too
 * big is cut in half and each half sent, again if need be, so a sheet of long notes never fails for ever on its size. A
 * stop (the card was left, `signal`) sends nothing more and is not a failure.
 */
export async function sendBatches<T>(
  rows: readonly T[],
  send: (batch: readonly T[]) => Promise<BatchResult>,
  opts: { signal?: AbortSignal | undefined; onProgress?: ((sent: number) => void) | undefined; size?: number; bytes?: number } = {},
): Promise<Run> {
  const { signal, onProgress } = opts;
  const queue = batchesOf(rows, opts.size, opts.bytes);
  const parts: BatchResult[] = [];
  let sent = 0;
  for (;;) {
    const batch = queue.shift();
    if (!batch) return { parts, sent, stopped: false, failure: null };
    if (signal?.aborted) return { parts, sent, stopped: true, failure: null };
    try {
      parts.push(await send(batch));
      sent += batch.length;
      onProgress?.(sent);
    } catch (error) {
      if (signal?.aborted) return { parts, sent, stopped: true, failure: null };
      if (isTooBig(error) && batch.length > 1) {
        const half = Math.ceil(batch.length / 2);
        queue.unshift(batch.slice(0, half), batch.slice(half));
        continue;
      }
      return { parts, sent, stopped: false, failure: { error } };
    }
  }
}

/**
 * Whether the sheet is read again after an adding that stopped short: when somebody went in, since what is shown (who is
 * left, the button's count) is no longer true. When nobody did it still is, and a reading that fails too (the same outage)
 * would only keep Add off for nothing.
 */
export const readAgainAfter = (run: Pick<Run, "sent">): boolean => run.sent > 0;

/** One reading at a time: starting another cancels the one before it, and only the newest may answer. */
export function latestRead(): {
  begin: () => { signal: AbortSignal; current: () => boolean };
  stop: () => void;
} {
  let turn = 0;
  let control: AbortController | null = null;
  return {
    begin() {
      control?.abort();
      const mine = (turn += 1);
      const own = new AbortController();
      control = own;
      return { signal: own.signal, current: () => mine === turn && !own.signal.aborted };
    },
    /** The card is left: what is being read is no longer wanted. */
    stop() {
      control?.abort();
      control = null;
      turn += 1;
    },
  };
}

/* ── what happened ── */

/** The import's answer for one batch (api/candidates.ts, ImportResult). */
export type BatchResult = {
  created: number;
  skipped: number;
  errors: ReadonlyArray<{ row: number; reasons: string[] }>;
  /** One answer a person sent, numbered from 2 within the batch; `candidateId` is who they are on the campaign. */
  rows?: ReadonlyArray<{ row: number; kind: string; candidateId?: string }>;
};

export type Tally = { added: number; already: number; failed: number };

export const tally = (parts: readonly BatchResult[]): Tally =>
  parts.reduce<Tally>(
    (t, p) => ({ added: t.added + p.created, already: t.already + p.skipped, failed: t.failed + p.errors.length }),
    { added: 0, already: 0, failed: 0 },
  );

/**
 * The tally of an adding that took more than one try: what went in on each try, and the people who could not be added
 * only from the last, since they are sent again with the rest.
 */
export const carryOn = (before: Tally, now: Tally): Tally => ({
  added: before.added + now.added,
  already: before.already + now.already,
  failed: now.failed,
});

/** What is said when the adding stopped short: why (the server's own words), who did go in and what their statuses did, and that going on is safe. */
export function stoppedLine(why: string, t: Pick<Tally, "added">, placed: PlacedTally | null = null): string {
  const went = t.added ? ` ${plural(t.added, "person", "people")} ${t.added === 1 ? "was" : "were"} added before it stopped.` : "";
  const moved = placed ? placedLines(placed).map((l) => ` ${l}`).join("") : "";
  return `${why.trim()}${went}${moved} Adding again carries on with the rest, and nobody is added twice.`;
}

/** What is said when the card was left in the middle of adding (it is gone, so the page says it): how far it got, and that going on is safe. */
export const leftEarlyLine = (sent: number, total: number): string =>
  `Adding stopped when you left, after ${n(sent)} of ${n(total)} people. Attach the sheet again to carry on: nobody is added twice.`;

/** "Adding 300 of 1,200": while the batches go. */
export const progressLine = (done: number, total: number): string => `Adding ${n(done)} of ${n(total)}`;

/** One line for what was done. `shortlistName`: the campaign they went on, if one. `placed`: what placing them by their status did, if it was ticked. */
export function doneLine(t: Tally, shortlistName: string | null, placed: PlacedTally | null = null): string {
  const where = shortlistName ? `the ${shortlistName} shortlist` : "Candidates";
  const parts: string[] = [];
  if (t.added) parts.push(`Added ${plural(t.added, "person", "people")} to ${where}.`);
  if (t.already) {
    parts.push(
      shortlistName
        ? `${n(t.already)} ${t.already === 1 ? "was" : "were"} already in Candidates and ${t.already === 1 ? "is" : "are"} on the shortlist now.`
        : `${n(t.already)} ${t.already === 1 ? "was" : "were"} already here.`,
    );
  }
  if (t.failed) parts.push(`${plural(t.failed, "person", "people")} couldn't be added.`);
  if (placed) parts.push(...placedLines(placed));
  return parts.length ? parts.join(" ") : "Nobody was added.";
}

/* ── placing people by what the sheet says of them ── */

/** The same words in other capitals or spacing are one word (the server groups them the same way: modules/campaigns/sheet-sync.ts, statusKey). */
export const statusKey = (text: string): string => text.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * What a person may say a status word means. Hired and Rejected are not here: they are two ticks of their own, with the names
 * of who they would move. Shared and Leave alone both move no one (a sheet only ever moves people forward).
 */
export type PlaceChoice = "shared" | "contacted" | "replied" | "interviewing" | "offer" | "leave";

export const PLACE_CHOICES: ReadonlyArray<readonly [PlaceChoice, string]> = [
  ["shared", "Shared"],
  ["contacted", "Contacted"],
  ["replied", "Replied"],
  ["interviewing", "Interviewing"],
  ["offer", "Offer"],
  ["leave", "Leave alone"],
];

/** Where each choice puts someone; null: nowhere new. */
const MOVE_OF: Readonly<Record<PlaceChoice, Wanted | null>> = {
  shared: null,
  leave: null,
  contacted: { stage: "outreach", step: "waiting" },
  replied: { stage: "outreach", step: "replied" },
  interviewing: { stage: "interviewing", step: "loop" },
  offer: { stage: "interviewing", step: "offer" },
};

/** What a word starts as: the choice its rule reads, or one of the two moves that are the person's own tick. A word no rule can place stays on Shared. */
export function kindOf(want: Wanted | null): PlaceChoice | "hire" | "reject" {
  if (!want) return "shared";
  switch (want.stage) {
    case "hired":
      return "hire";
    case "passed":
      return "reject";
    case "shortlisted":
      return "shared";
    case "outreach":
      return want.step === "replied" ? "replied" : "contacted";
    case "interviewing":
      return want.step === "offer" ? "offer" : "interviewing";
  }
}

export type Placing = {
  /** The words to choose for, the ones the rules know first, in the order of the funnel. */
  words: Array<{ key: string; text: string; n: number; choice: PlaceChoice; unknown: boolean }>;
  /** What each word does now, by its key: a choice, or one of the two ticks. */
  kind: Readonly<Record<string, PlaceChoice | "hire" | "reject">>;
  /** The people whose words say joined, and rejected: the names to show beside their ticks. */
  hire: string[];
  reject: string[];
  /** The sheet's own words behind those two ticks, each with how many say it: what the person agrees to can be checked against the sheet. */
  hireWords: Array<{ text: string; n: number }>;
  rejectWords: Array<{ text: string; n: number }>;
  /** What each of the two ticks names (the people and the words that put them there), to tell whether a tick given earlier still holds. */
  hireKey: string;
  rejectKey: string;
  /** People to add with no status, or one the list does not carry: they stay where they are. */
  unplaced: number;
};

/** Whether a tick given for what `given` named still holds for what the sheet names now (`namedBy`): nothing given, or another set, is off. */
export const stillHolds = (given: string | null, named: string | undefined): boolean => given !== null && given === named;

/**
 * What a tick that hires or rejects names: the people and the words that put them there, in no order. A tick given for one set of
 * people is not given for another: when the sheet is read again and the set changes (a tab ticked, a rule, another file), it is off.
 */
export const namedBy = (names: readonly string[], words: ReadonlyArray<{ text: string; n: number }>): string =>
  JSON.stringify([[...names].sort(), words.map((w) => [statusKey(w.text), w.n]).sort()]);

const ORDER: ReadonlyArray<PlaceChoice> = ["shared", "contacted", "replied", "interviewing", "offer", "leave"];

/**
 * What the card offers for placing the people about to be added, from the readings of the files that are ticked: the sheet's own
 * words with how many say each, the choice for each (the rules' reading unless the person chose), and who would be hired or
 * rejected. Nothing when no one has a status. `chosen` is the person's own choices, by word. The rows are the people that will go in, each
 * once (the card hands over the list that joinPeople left, not the sheets' own rows), so what is counted and named is who is moved.
 */
export function placingOf(
  sheets: ReadonlyArray<{
    rows: ReadonlyArray<{ fields: SheetFields; status?: string | undefined; alsoSaid?: readonly string[] | undefined }>;
    statusWords?: PeopleSheet["statusWords"];
  }>,
  chosen: Readonly<Record<string, PlaceChoice>>,
): Placing | null {
  const known = new Map<string, StatusWord>();
  for (const sheet of sheets) for (const w of sheet.statusWords ?? []) if (!known.has(statusKey(w.text))) known.set(statusKey(w.text), w);
  if (!known.size) return null;
  const count = new Map<string, number>();
  const hire: string[] = [];
  const reject: string[] = [];
  const hireSaid = new Map<string, { text: string; n: number }>();
  const rejectSaid = new Map<string, { text: string; n: number }>();
  const say = (said: Map<string, { text: string; n: number }>, key: string, text: string) => {
    const seen = said.get(key);
    if (seen) seen.n += 1;
    else said.set(key, { text, n: 1 });
  };
  let unplaced = 0;
  for (const sheet of sheets) {
    for (const r of sheet.rows) {
      /* A person the sheet lists again is placed by each of their rows in turn, so each word they have is counted, and they are named once for a hire and once for a rejection. */
      let placed = false;
      let hires = false;
      let rejects = false;
      for (const status of [r.status, ...(r.alsoSaid ?? [])]) {
        const key = status ? statusKey(status) : "";
        const word = key ? known.get(key) : undefined;
        if (!word) continue;
        placed = true;
        count.set(key, (count.get(key) ?? 0) + 1);
        const kind = kindOf(word.want);
        if (kind === "hire") { hires = true; say(hireSaid, key, word.text); }
        else if (kind === "reject") { rejects = true; say(rejectSaid, key, word.text); }
      }
      if (!placed) unplaced += 1;
      if (hires) hire.push(r.fields.fullName ?? "Someone");
      if (rejects) reject.push(r.fields.fullName ?? "Someone");
    }
  }
  const kind: Record<string, PlaceChoice | "hire" | "reject"> = {};
  const words: Placing["words"] = [];
  for (const [key, word] of known) {
    const rule = kindOf(word.want);
    const effective = rule === "hire" || rule === "reject" ? rule : (chosen[key] ?? rule);
    kind[key] = effective;
    if (effective !== "hire" && effective !== "reject" && count.has(key)) {
      words.push({ key, text: word.text, n: count.get(key) ?? 0, choice: effective, unknown: word.want === null });
    }
  }
  words.sort((a, b) => Number(a.unknown) - Number(b.unknown) || ORDER.indexOf(a.choice) - ORDER.indexOf(b.choice) || b.n - a.n);
  const hireWords = [...hireSaid.values()].sort((a, b) => b.n - a.n);
  const rejectWords = [...rejectSaid.values()].sort((a, b) => b.n - a.n);
  return { words, kind, hire, reject, hireWords, rejectWords, hireKey: namedBy(hire, hireWords), rejectKey: namedBy(reject, rejectWords), unplaced };
}

/** One person's move, as the card resolves it when it adds them. */
export type PlannedMove = { kind: "move" | "hire" | "reject"; stage: Stage; step: Step | null; word: string };

/**
 * Where a person's status puts them, or null when it puts them nowhere new (no status, a word the list does not carry, Shared or
 * Leave alone) or when it is a hire or a rejection and that was not ticked.
 */
export function moveFor(status: string | undefined, placing: Placing, ticks: { hire: boolean; reject: boolean }): PlannedMove | null {
  const key = status ? statusKey(status) : "";
  const kind = key ? placing.kind[key] : undefined;
  if (!status || !kind) return null;
  if (kind === "hire") return ticks.hire ? { kind: "hire", stage: "hired", step: null, word: status } : null;
  if (kind === "reject") return ticks.reject ? { kind: "reject", stage: "passed", step: null, word: status } : null;
  const want = MOVE_OF[kind];
  return want ? { kind: "move", stage: want.stage, step: want.step ?? null, word: status } : null;
}

/** A person's move, with who they are on the campaign. */
export type OwedMove = PlannedMove & { candidateId: string };

/**
 * The moves a batch's answer asks for: for each person the import says is now on the campaign (new, or already a candidate), where
 * their status puts them. `batch` is what was sent, in order: the import numbers its answers from 2 within it.
 */
export function movesFrom(
  answer: Pick<BatchResult, "rows">,
  batch: ReadonlyArray<{ status?: string | undefined; alsoSaid?: readonly string[] | undefined }>,
  placing: Placing,
  ticks: { hire: boolean; reject: boolean },
): OwedMove[] {
  const out: OwedMove[] = [];
  for (const r of answer.rows ?? []) {
    if (!r.candidateId || (r.kind !== "new" && r.kind !== "duplicate")) continue;
    const sent = batch[r.row - 2];
    /* A person the sheet lists again is moved by each of their rows in turn: the server judges each against where the one before left them. */
    for (const status of [sent?.status, ...(sent?.alsoSaid ?? [])]) {
      const move = moveFor(status, placing, ticks);
      if (move) out.push({ ...move, candidateId: r.candidateId });
    }
  }
  return out;
}

/** What the server is asked for: the moves, and the ids ticked to be hired and to be rejected (it refuses either move for anyone else). */
export type PlaceRequest = {
  moves: Array<{ candidateId: string; stage: Stage; step?: Step | null; word: string }>;
  hire: string[];
  reject: string[];
};

/** The server takes this many moves in a request (modules/campaigns/sheet-place.ts, MAX_MOVES): each is a transaction, about half a second apiece, so more would not finish in the time a request has. */
export const PLACE_BATCH = 100;

/** The moves cut into requests, each carrying the ticked ids of its own moves. */
export function placeRequests(moves: readonly OwedMove[], size = PLACE_BATCH): PlaceRequest[] {
  const out: PlaceRequest[] = [];
  for (let at = 0; at < moves.length; at += size) {
    const part = moves.slice(at, at + size);
    out.push({
      moves: part.map((m) => ({ candidateId: m.candidateId, stage: m.stage, ...(m.step ? { step: m.step } : {}), word: m.word })),
      hire: part.filter((m) => m.kind === "hire").map((m) => m.candidateId),
      reject: part.filter((m) => m.kind === "reject").map((m) => m.candidateId),
    });
  }
  return out;
}

/** The server's answer to a request to place people (modules/campaigns/sheet-place.ts). */
export type PlaceAnswer = {
  moved: Record<string, number>;
  kept: number;
  waiting: ReadonlyArray<unknown>;
  refused: ReadonlyArray<unknown>;
};

/** What placing came to, across the requests: who moved (by the stage they are in), whose hire waits for a yes, who could not be moved. */
export type PlacedTally = { moved: Record<string, number>; waiting: number; refused: number };

/**
 * Makes the moves, a request at a time. A request that fails leaves the people in it where they are, and they are counted as not
 * moved (with the rest still to go), so the line that ends the adding says so and nobody is lost without a word. Null: no moves.
 */
export async function placeAll(
  moves: readonly OwedMove[],
  place: (request: PlaceRequest) => Promise<PlaceAnswer>,
  signal?: AbortSignal,
): Promise<PlacedTally | null> {
  if (!moves.length) return null;
  const requests = placeRequests(moves);
  let total = NOBODY_PLACED;
  for (const [i, request] of requests.entries()) {
    try {
      total = addPlaced(total, placedOf(await place(request)));
    } catch {
      if (signal?.aborted) return total;
      const left = requests.slice(i).reduce((sum, r) => sum + r.moves.length, 0);
      return addPlaced(total, { moved: {}, waiting: 0, refused: left });
    }
  }
  return total;
}

export const NOBODY_PLACED: PlacedTally = { moved: {}, waiting: 0, refused: 0 };

export const placedOf = (a: PlaceAnswer): PlacedTally => ({ moved: a.moved, waiting: a.waiting.length, refused: a.refused.length });

/** What placing came to across tries of an adding: what the earlier tries did and what this one did (none: null). */
export const carryPlaced = (before: PlacedTally | null, now: PlacedTally | null): PlacedTally | null =>
  before && now ? addPlaced(before, now) : (before ?? now);

export function addPlaced(a: PlacedTally, b: PlacedTally): PlacedTally {
  const moved = { ...a.moved };
  for (const [stage, count] of Object.entries(b.moved)) moved[stage] = (moved[stage] ?? 0) + count;
  return { moved, waiting: a.waiting + b.waiting, refused: a.refused + b.refused };
}

/**
 * Adds the people a batch at a time (`sendBatches`) and puts each batch's people on the stages their status says as they go in, by the
 * ticks as they stood when Add was pressed. Nothing is kept waiting for a later try: a try that stops short has placed whoever it added
 * and says so (`placed`), and a try after it, under other ticks, reaches only the people it adds. The batch in flight is placed even
 * when `signal` stops the rest. `place` absent: nowhere to put them. `placing` absent: nobody is to be placed by their status.
 */
export async function addAndPlace<T extends { fields: SheetFields; status?: string | undefined; alsoSaid?: readonly string[] | undefined }>(
  rows: readonly T[],
  how: {
    send: (fields: readonly SheetFields[]) => Promise<BatchResult>;
    place?: ((request: PlaceRequest) => Promise<PlaceAnswer>) | undefined;
    placing?: Placing | null | undefined;
    ticks: { hire: boolean; reject: boolean };
    signal?: AbortSignal | undefined;
    onProgress?: ((sent: number) => void) | undefined;
  },
): Promise<{ run: Run; placed: PlacedTally | null }> {
  const parts: PlacedTally[] = [];
  const run = await sendBatches(
    rows,
    async (batch) => {
      const answer = await how.send(batch.map((r) => r.fields));
      if (how.place && how.placing) {
        const made = await placeAll(movesFrom(answer, batch, how.placing, how.ticks), how.place);
        if (made) parts.push(made);
      }
      return answer;
    },
    { signal: how.signal, onProgress: how.onProgress },
  );
  return { run, placed: parts.reduce<PlacedTally | null>(carryPlaced, null) };
}

/** What the stages are called where people are told where they went. */
const STAGE_NAME: Readonly<Record<string, string>> = { outreach: "In outreach", interviewing: "Interviewing", hired: "Hired", passed: "Rejected" };

/** "3 moved to Interviewing, 2 to Rejected." then who waits for a yes, then who could not be moved. Nothing for nothing. */
export function placedLines(p: PlacedTally): string[] {
  const out: string[] = [];
  const moved = Object.keys(STAGE_NAME)
    .filter((stage) => (p.moved[stage] ?? 0) > 0)
    .map((stage, i) => `${i === 0 ? `${n(p.moved[stage] ?? 0)} moved to` : `${n(p.moved[stage] ?? 0)} to`} ${STAGE_NAME[stage]}`);
  if (moved.length) out.push(`${moved.join(", ")}.`);
  if (p.waiting) out.push(`${n(p.waiting)} ${p.waiting === 1 ? "needs" : "need"} your yes because they are on another campaign.`);
  if (p.refused) out.push(`${plural(p.refused, "person", "people")} couldn't be moved.`);
  return out;
}

/* ── what the card says of placing ── */

export const PLACE_LABEL = "Put each person on the stage their status says";
export const PLACE_HELP = "Nobody is rejected or hired unless you tick it.";
export const UNKNOWN_WORD = "I don't know this one";

/** The names beside a tick: the first few, then how many more. */
export function namesLine(names: readonly string[], shown = 5): string {
  const first = names.slice(0, shown);
  const more = names.length - first.length;
  if (more > 0) return `${first.join(", ")} and ${n(more)} more`;
  return first.length > 1 ? `${first.slice(0, -1).join(", ")} and ${first[first.length - 1]}` : (first[0] ?? "");
}

/** The sheet's own words behind a tick, each with how many say it, so a word that was read as a hire or a rejection can be seen for what it is. */
export function saidLine(words: ReadonlyArray<{ text: string; n: number }>, shown = 5): string {
  const first = words.slice(0, shown).map((w) => `${w.text.trim().slice(0, 60)} (${n(w.n)})`);
  const more = words.length - first.length;
  return `Their status says ${first.join(", ")}${more > 0 ? ` and ${n(more)} more` : ""}.`;
}

export const hireLabel = (count: number): string => `${n(count)} ${count === 1 ? "says" : "say"} they joined. Hiring takes a person off their other campaigns.`;
export const rejectLabel = (count: number): string => `${n(count)} ${count === 1 ? "says" : "say"} rejected. Move them to Rejected?`;

/** In place of nothing, for the people the words do not reach. */
export const unplacedLine = (count: number): string =>
  `${plural(count, "person", "people")} ${count === 1 ? "has" : "have"} no status to go by, and ${count === 1 ? "stays" : "stay"} where they are.`;

/** What the card draws of placing: the tick, the words each with a choice, and the two ticks of their own. */
export type PlaceView = {
  on: boolean;
  words: ReadonlyArray<{ key: string; text: string; count: string; choice: PlaceChoice; unknown: boolean }>;
  hire: { on: boolean; label: string; names: string; said: string } | null;
  reject: { on: boolean; label: string; names: string; said: string } | null;
  unplaced: string | null;
};

export function placeView(p: Placing, state: { on: boolean; hire: boolean; reject: boolean }): PlaceView {
  return {
    on: state.on,
    words: p.words.map((w) => ({ key: w.key, text: w.text, count: plural(w.n, "person", "people"), choice: w.choice, unknown: w.unknown })),
    hire: p.hire.length ? { on: state.hire, label: hireLabel(p.hire.length), names: namesLine(p.hire), said: saidLine(p.hireWords) } : null,
    reject: p.reject.length ? { on: state.reject, label: rejectLabel(p.reject.length), names: namesLine(p.reject), said: saidLine(p.rejectWords) } : null,
    unplaced: p.unplaced > 0 ? unplacedLine(p.unplaced) : null,
  };
}

/* ── where a sheet goes ── */

/** The card for a sheet's content, by what the server found in it: people, a sheet of roles (the existing import), or neither. */
export function routeOf(p: Pick<PeopleSheet, "kind">): "people" | "roles" | "other" {
  return p.kind;
}

/** Where a person goes to see who was added: the campaign's shortlist, or Candidates. */
export const seeThemHref = (campaignId: string | null): string =>
  campaignId ? campaignHref(campaignId, "shortlisted") : "#/contacts";

export const SEE_THEM = (campaignId: string | null): string => (campaignId ? "See the shortlist" : "See Candidates");

/** The message that opens the card, and what the composer sends with a sheet of people. */
export const PEOPLE_MESSAGE = "Add the people in this sheet";
