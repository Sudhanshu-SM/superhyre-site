/**
 * Resumes as candidates, in the chat. Everything here is pure: what the server's reading of the attached resumes says in
 * words, which lines are ticked, what the button adds, and the little the composer can tell of a resume before it is sent. The
 * card (liveViews/ResumeImport.tsx) only draws it, and the people it names go to the same import a sheet's do (peopleSheet.ts).
 * Server: modules/candidates/resume-read.ts.
 */

import type { Attachment } from "./attachments";
import { type PeopleSheet, type SheetFields, addLabel } from "./peopleSheet";

/* ── what the server says ── */

export type ResumeLineState = "ready" | "check" | "no-contact" | "no-name" | "invalid" | "same";

export type ResumeLine = {
  /** `<file id>:<n>`: the file, and which of the people read from it. */
  key: string;
  fileId: string;
  file: string;
  state: ResumeLineState;
  /** The sentence under a line that is not simply ready, or a note on one that is (a picture's reading). */
  why: string | null;
  /** new: not in your candidates. here: in them, to go on the shortlist. already: in them and on it (or no shortlist asked). */
  verdict: "new" | "here" | "already" | null;
  picture: boolean;
  name: string | null;
  title: string | null;
  company: string | null;
  fields: SheetFields | null;
};

export type ResumeFile = {
  id: string;
  name: string;
  state: "read" | "job-description" | "failed" | "empty";
  reason: string | null;
  people: number;
};

/** What the model read out of a file; kept as it came and sent back with the person's typing so a file is not read twice. */
export type ResumeFacts = { list: boolean; people: Array<Record<string, unknown>> };

export type ResumeReading = {
  sheet: PeopleSheet;
  files: ResumeFile[];
  lines: ResumeLine[];
  read: Record<string, ResumeFacts>;
};

/**
 * A resume the composer holds for its card: the text the document reader gave, whether it was read off a picture, and whether the
 * person kept it as a resume against the line that said it reads like a job description (the server then reads it as one).
 */
export type ResumeSeed = { id: string; name: string; text: string; picture: boolean; kept?: boolean };

/** A resume chip as the card takes it: the text the document reader gave, which the card sends to be read with the others in one go. */
export const resumeSeedOf = (chip: Attachment): ResumeSeed => ({
  id: chip.id,
  name: chip.name,
  text: chip.text,
  picture: chip.picture === true,
  ...(chip.kept ? { kept: true } : {}),
});

/* ── the request ── */

export type ResumeRequest = {
  files: Array<{ id: string; name: string; text: string; picture?: true; kept?: true; read?: ResumeFacts }>;
  typed?: Array<{ key: string; contact: string }>;
  campaignId?: string;
};

/** The request for a reading: the files, what was read of them before (so they are not read again), and what the person typed. */
export function requestFor(
  seeds: readonly ResumeSeed[],
  opts: { campaignId: string | null; read: Readonly<Record<string, ResumeFacts>>; typed: Readonly<Record<string, string>> },
): ResumeRequest {
  const typed = Object.entries(opts.typed).filter(([, v]) => v.trim()).map(([key, contact]) => ({ key, contact: contact.trim() }));
  return {
    files: seeds.map((s) => ({
      id: s.id,
      name: s.name,
      text: s.text,
      ...(s.picture ? { picture: true as const } : {}),
      ...(s.kept ? { kept: true as const } : {}),
      ...(opts.read[s.id] ? { read: opts.read[s.id] } : {}),
    })),
    ...(typed.length ? { typed } : {}),
    ...(opts.campaignId ? { campaignId: opts.campaignId } : {}),
  };
}

/* ── the lines, and which are ticked ── */

/** Whether the line can be ticked at all: a person with a way to reach them, not already where they would go, not joined to another line. */
export const canTick = (l: ResumeLine): boolean => (l.state === "ready" || l.state === "check") && l.verdict !== "already" && l.fields !== null;

/** Ticked to begin with: every line that can be added, except the ones to look at first (a contact found away from the person's own part). */
export const defaultTicks = (r: ResumeReading): Set<string> => new Set(r.lines.filter((l) => l.state === "ready" && canTick(l)).map((l) => l.key));

/**
 * The ticks after a new reading: the person's own choices stay where the line is still there and can still be ticked, a line
 * that has just become ready (they typed its contact) is ticked, and anything that cannot be added is not.
 */
export function ticksAfter(next: ResumeReading, before: ReadonlySet<string>, known: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const l of next.lines) {
    if (!canTick(l)) continue;
    if (known.has(l.key) ? before.has(l.key) : l.state === "ready") out.add(l.key);
  }
  return out;
}

/** What goes to the import: the ticked lines that can be added, in order. */
export const fieldsToSend = (r: ResumeReading, ticked: ReadonlySet<string>): SheetFields[] =>
  r.lines.flatMap((l) => (ticked.has(l.key) && canTick(l) && l.fields ? [l.fields] : []));

/** The button's words for what is ticked, or null when nothing is. */
export function buttonFor(r: ResumeReading, ticked: ReadonlySet<string>, shortlistName: string | null): string | null {
  const rows = fieldsToSend(r, ticked).map((fields, i) => ({ row: i + 2, tab: "", state: "new" as const, fields }));
  return addLabel({ ...r.sheet, rows }, shortlistName);
}

const n = (v: number): string => v.toLocaleString("en-IN");
const plural = (v: number, one: string, many = `${one}s`): string => `${n(v)} ${v === 1 ? one : many}`;

/** The first line of the card: what is added, and that nothing else in the files is. */
export function scopeLine(files: ReadonlyArray<Pick<ResumeFile, "name">>): string {
  return files.length === 1
    ? `Adding people from ${files[0]?.name ?? "your file"}. Nothing else in it is added.`
    : `Adding people from ${plural(files.length, "file")}. Nothing else in them is added.`;
}

/** The heading: how many people were found, in how many files. */
export function headlineOf(r: Pick<ResumeReading, "lines" | "files">): string {
  const people = r.lines.length;
  const files = r.files.length;
  if (!people) return files === 1 ? `I couldn't find anyone to add in ${r.files[0]?.name ?? "that file"}` : "I couldn't find anyone to add in these files";
  return `I found ${plural(people, "person", "people")} in ${plural(files, "file")}`;
}

/** "Backend Engineer at Acme", "Backend Engineer", "Acme" or nothing: what the person does, as the resume said. */
export function whatTheyDo(l: Pick<ResumeLine, "title" | "company">): string {
  if (l.title && l.company) return `${l.title} at ${l.company}`;
  return l.title ?? l.company ?? "";
}

/** How to reach a person, as the card shows it to them (their own file): the address, the number and the link's last part. */
export function reachLine(f: SheetFields | null): string {
  if (!f) return "";
  const link = f.linkedinUrl ? f.linkedinUrl.replace(/^https?:\/\/(?:www\.)?/i, "") : "";
  return [f.email, f.phone, link].filter(Boolean).join("  ·  ");
}

/** What the card says of a line beside the name, in plain muted words; empty when there is nothing to add to the name. */
export function verdictLine(l: ResumeLine, shortlistName: string | null): string {
  if (l.state === "same") return "";
  if (l.verdict === "new") return "New to your candidates";
  if (l.verdict === "here") return shortlistName ? `Already in your candidates. Goes on the ${shortlistName} shortlist.` : "Already in your candidates.";
  if (l.verdict === "already") return shortlistName ? `Already in your candidates and on the ${shortlistName} shortlist.` : "Already in your candidates.";
  return "";
}

/** The lines that need an answer in the card: a file that could not be read or is not a resume, with what to do about it. */
export const problemFiles = (r: Pick<ResumeReading, "files">): ResumeFile[] => r.files.filter((f) => f.state !== "read" || f.reason !== null);

/** The files the model could not read this time, to be tried again. */
export const retryable = (r: Pick<ResumeReading, "files">): string[] => r.files.filter((f) => f.state === "failed").map((f) => f.id);

/* ── what the composer can tell of a resume before it is sent ── */

const HEADING = /^(?:r[eé]sum[eé]|curriculum vitae|cv|profile|summary|objective|contact|contact details|personal details|bio ?data|name|page \d+|about me)$/i;
const NAME_LINE = /^[\p{Lu}][\p{L}.'’-]*(?: [\p{Lu}][\p{L}.'’-]*){1,3}$/u;

const tidy = (s: string): string =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s.'’-])(\p{L})/gu, (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`) : s;

/**
 * The name at the top of a resume, when its first line is plainly one ("Priya Nair", "RAVI KUMAR"); else null. A guess to
 * show on the chip so the person sees whose file it is: the card shows what was actually read.
 */
export function resumeHeadline(text: string): string | null {
  for (const raw of text.split(/\r?\n/).slice(0, 8)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || HEADING.test(line)) continue;
    return line.length <= 40 && NAME_LINE.test(line) ? tidy(line) : null;
  }
  return null;
}
