import type { PeopleSheet } from "./peopleSheet";
import type { ResumeSeed } from "./resumeSheet";

/**
 * Sheets of people the composer hands to the people card. The composer reads a sheet before it decides where it goes
 * (people, or the roles import), so what it read travels with the sheet and the card does not read it twice. They wait
 * here for the moment the chat answers with the card, which takes them, once. In memory only.
 */
export type SheetSeed = {
  /** The file that was attached; none when the sheet is a Google Sheet, which comes by its link. */
  file: File | null;
  /** A Google Sheet's link typed or pasted in the composer; none for a file. */
  link: string | null;
  /** What reading it found, for the campaign in the chat at the time; the card reads again if that has changed. */
  read: PeopleSheet | null;
  /** The campaign the chat was on when it was read. */
  campaignId: string | null;
};

let held: SheetSeed[] = [];

export const stashPeople = (seeds: readonly SheetSeed[]): void => {
  held = [...held, ...seeds];
};

export function takePeople(): SheetSeed[] {
  const out = held;
  held = [];
  return out;
}

/**
 * What one add (the paperclip's choice) left for its card, kept by the add's id. Two sends in one chat keep their own files, a
 * send that failed leaves an entry that only expires, and the next card never takes it: a card looks at what is its own, or nothing.
 * The files stay until the card has finished with them or the time runs out, so a card that is drawn again (the chat was left and
 * came back) finds them; only a real reload, or the time running out, takes them.
 */
export type AddSeed = {
  sheets: SheetSeed[];
  /** Resumes attached as Candidates: their text, which the card sends to be read in one go. */
  resumes?: ResumeSeed[];
  /** The words that came with the files, when they named the campaign the people went to: the card says they were used. */
  words: string | null;
  /** The name of the campaign they named. */
  picked: string | null;
  /** The words typed beside the files, as typed: read with the sheets' shapes when they ask for more than adding. */
  say?: string | null;
  /** What the words asked besides adding was passed on to the agent: a card drawn again does not pass it on a second time. */
  passed?: boolean;
};

/** How long a card has to open on its files before they are let go: more than a slow send, far less than a day. */
export const SEED_LIFE_MS = 10 * 60_000;

const kept = new Map<string, { seed: AddSeed; at: number }>();

export function stashFor(id: string, seed: AddSeed, now = Date.now()): void {
  for (const [k, v] of kept) if (now - v.at > SEED_LIFE_MS) kept.delete(k);
  kept.set(id, { seed, at: now });
}

/** The files of one add, as often as a card asks until it lets them go; nothing when they are gone (the page was reloaded, or the time ran out). */
export function peekFor(id: string, now = Date.now()): AddSeed | null {
  const own = kept.get(id);
  if (!own) return null;
  if (now - own.at <= SEED_LIFE_MS) return own.seed;
  kept.delete(id);
  return null;
}

/** What a card that came to its end said of how it went, in its own words: the line, and where "See them" goes. Never the files. */
export type FinishedAdd = { line: string; href: string; link: string };

const ended = new Map<string, FinishedAdd>();
const ENDED_KEPT = 40;

/**
 * The card has finished with the files of its add: they are let go. What it said of how it went is kept (a few words, until the page is
 * reloaded), so a card drawn again on the same add says it, and does not say the page was reloaded.
 */
export function finishFor(id: string, said?: FinishedAdd): void {
  kept.delete(id);
  if (!said) return;
  ended.delete(id);
  ended.set(id, said);
  if (ended.size > ENDED_KEPT) ended.delete(ended.keys().next().value as string);
}

/** How an add that was finished went, for a card drawn again on it; null for an add that was never finished (a reload, or the time ran out). */
export const finishedFor = (id: string): FinishedAdd | null => ended.get(id) ?? null;

/**
 * Some of the people went in from this add (a batch was sent): what its sheets were read as before no longer says who is new, so a card
 * drawn again reads them again. The files stay: going on with the rest is what the card is for.
 */
export function sentFor(id: string): void {
  const own = kept.get(id);
  if (own) own.seed = { ...own.seed, sheets: own.seed.sheets.map((s) => ({ ...s, read: null })) };
}

/** The card passed on what the words asked besides adding: a card drawn again on this add does not pass it on a second time. */
export function passedFor(id: string): void {
  const own = kept.get(id);
  if (own) own.seed = { ...own.seed, passed: true };
}

/** The id an add's card was asked to open on (`adding:<id>`), or null for a card the words opened. */
export const addingIdOf = (query: string | null | undefined): string | null => {
  const m = /^adding:(.{8,64})$/.exec(query ?? "");
  return m?.[1] ?? null;
};

