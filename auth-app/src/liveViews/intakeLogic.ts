import type { Requirement, RoleSpec } from "../api/agent";

/**
 * Turning call notes into a role: what counts as notes, how a drafted spec reads back as
 * "what I understood", and what the notes leave open. Pure, so the card is only layout.
 */

/** The API refuses a draft from fewer characters than this, and reads no more than the second. */
export const MIN_NOTES = 80;
export const MAX_NOTES = 30_000;

/**
 * The notes in a request, or null when it only asks for them. "Notes from the call with the
 * hiring manager: we need a senior ..." is the notes after its lead-in (up to the colon; a line
 * break is never taken for one, since the first line of pasted notes is notes); a long pasted
 * brief is all notes. Fewer words than the API can draft from are not notes.
 */
export function notesIn(said: string): string | null {
  const text = said.trim();
  const lead = text.match(/^([^:\n]{0,90}(?:notes?|intake|call|brief|manager|spec|role|jd|said|told)[^:\n]{0,60}):\s*([\s\S]+)$/i);
  const body = (lead?.[2] ?? text).trim();
  if (lead && body.length >= MIN_NOTES) return body.slice(0, MAX_NOTES);
  if (text.length >= 200) return text.slice(0, MAX_NOTES);
  return null;
}

/** Whether pasted text is long enough for the API to draft from. */
export const enough = (notes: string): boolean => notes.trim().length >= MIN_NOTES;

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** What the spec says about the role itself, as short label and value pairs. */
export function factsOf(spec: RoleSpec): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  if (spec.seniority) facts.push({ label: "Level", value: cap(spec.seniority) });
  const { yearsMin: lo, yearsMax: hi } = spec;
  if (lo != null && hi != null) facts.push({ label: "Experience", value: lo === hi ? `${lo} years` : `${lo} to ${hi} years` });
  else if (lo != null) facts.push({ label: "Experience", value: `${lo}+ years` });
  else if (hi != null) facts.push({ label: "Experience", value: `Up to ${hi} years` });
  const place = spec.locations.join(", ");
  if (place || spec.remoteOk) facts.push({ label: "Location", value: place ? (spec.remoteOk ? `${place} or remote` : place) : "Remote" });
  return facts;
}

export type Group = { id: "knockout" | "must" | "nice" | "avoid"; label: string; items: string[] };

/** The requirements by how much they matter, heaviest first within each; empty groups left out. */
export function groupsOf(spec: RoleSpec): Group[] {
  const by = (importance: Requirement["importance"]) =>
    spec.requirements.filter((r) => r.importance === importance).sort((a, b) => b.weight - a.weight).map((r) => r.text);
  const groups: Group[] = [
    { id: "knockout", label: "Required, or they're out", items: by("knockout") },
    { id: "must", label: "Must have", items: by("must") },
    { id: "nice", label: "Nice to have", items: by("nice") },
    { id: "avoid", label: "Avoid", items: [...spec.avoid] },
  ];
  return groups.filter((g) => g.items.length > 0);
}

const MONEY = /\b(ctc|lpa|lakhs?|salary|budget|compensation|package|pay band|rupees?)\b|₹|\$\s?\d|\b\d+\s?k\b/i;

export type Open = { ask: string; because: string };

/** What the notes leave open: the question a recruiter would put to the hiring manager, and why it is open. */
export function missingOf(spec: RoleSpec, notes: string): Open[] {
  const out: Open[] = [];
  if (!spec.seniority && spec.yearsMin == null) out.push({ ask: "How senior should they be?", because: "The notes don't say." });
  if (spec.yearsMin == null && spec.yearsMax == null) out.push({ ask: "How many years of experience should they have?", because: "The notes give no range." });
  if (!spec.locations.length && !spec.remoteOk) out.push({ ask: "Where should they be based, or is remote fine?", because: "The notes don't say." });
  if (spec.remoteOk && spec.locations.length) out.push({ ask: `Does remote include people outside ${spec.locations.join(" or ")}?`, because: "The notes say remote is fine." });
  if (!spec.requirements.some((r) => r.importance === "must" || r.importance === "knockout")) {
    out.push({ ask: "What must they be able to do?", because: "Nothing in the notes reads as a must-have." });
  }
  if (!MONEY.test(notes)) out.push({ ask: "What's the budget?", because: "It isn't in the notes." });
  return out.slice(0, 4);
}

/** A message to the hiring manager that asks the chosen questions; only ever put in the composer. */
export function questionsMessage(role: string, picked: readonly string[]): string {
  return `Write a short message to the hiring manager for ${role}, asking:\n${picked.map((q) => `- ${q}`).join("\n")}`;
}
