/**
 * What the agent's composer hands to the import card: files that are really a list of roles (a spreadsheet, or several
 * job descriptions), job descriptions already read out of attachments, and a Google Sheet's link typed in the message.
 * They wait here for the moment it takes the chat to answer with the card, which takes them, once. In memory only.
 */
export type ImportSeed = {
  files: File[];
  /** Job descriptions already read (attached in the composer and classified as one). */
  texts: Array<{ label: string; jd: string }>;
  links: string[];
};

const EMPTY = (): ImportSeed => ({ files: [], texts: [], links: [] });
let held: ImportSeed = EMPTY();

export const hasSeed = (s: ImportSeed): boolean => s.files.length + s.texts.length + s.links.length > 0;

export function stashImport(seed: Partial<ImportSeed>): void {
  held = {
    files: [...held.files, ...(seed.files ?? [])],
    texts: [...held.texts, ...(seed.texts ?? [])],
    links: [...held.links, ...(seed.links ?? [])],
  };
}

export function takeImport(): ImportSeed {
  const out = held;
  held = EMPTY();
  return out;
}

/** A Google Sheets address in the words, if there is one. */
export const SHEET_LINK = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}[^\s)>\]"']*/i;
export const sheetLinkIn = (text: string): string | null => SHEET_LINK.exec(text)?.[0] ?? null;

const EVERY_SHEET_LINK = new RegExp(SHEET_LINK.source, "gi");

/** Every different Google Sheets address in the words, in the order they come. */
export const sheetLinksIn = (text: string): string[] => [...new Set(text.match(EVERY_SHEET_LINK) ?? [])];

/** The words with their Google Sheets addresses taken out and the space they left closed: a link that became a chip is not also left in the draft. */
export const withoutSheetLinks = (text: string): string =>
  text.replace(EVERY_SHEET_LINK, " ").replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+|[ \t]+$/gm, "").trim();

/** Whether the text is nothing but Google Sheets addresses, one to a line (what a paste of a link is). */
export function sheetLinksAlone(text: string): string[] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const links = lines.map((l) => (sheetLinksIn(l).length === 1 && withoutSheetLinks(l) === "" ? l : null));
  return links.every((l) => l !== null) ? [...new Set(links as string[])] : null;
}

/* The first version of this module held only files. */
export const stashImportFiles = (files: readonly File[]): void => stashImport({ files: [...files] });
export const takeImportFiles = (): File[] => takeImport().files;

/** The roles one add left for its card, by the add's id (see peopleSeed.ts): kept until the time runs out, so a card drawn again finds them; nothing when they are gone. */
const keptRoles = new Map<string, { seed: ImportSeed; at: number }>();
const ROLES_LIFE_MS = 10 * 60_000;

export function stashImportFor(id: string, seed: Partial<ImportSeed>, now = Date.now()): void {
  for (const [k, v] of keptRoles) if (now - v.at > ROLES_LIFE_MS) keptRoles.delete(k);
  keptRoles.set(id, { seed: { files: seed.files ?? [], texts: seed.texts ?? [], links: seed.links ?? [] }, at: now });
}

export function peekImportFor(id: string, now = Date.now()): ImportSeed | null {
  const own = keptRoles.get(id);
  if (!own) return null;
  if (now - own.at <= ROLES_LIFE_MS) return own.seed;
  keptRoles.delete(id);
  return null;
}

/** What the roles of an add became (campaigns made, roles still to make), for the card that is drawn again after they were let go. Small, and kept until the page is reloaded. */
export type MadeFrom = { made: number; left: number };
const madeFrom = new Map<string, MadeFrom>();
const MADE_KEPT = 40;

/**
 * The roles card has done what a second go would repeat (a campaign is made from them), or has come to its end: the roles are let go, so a
 * card drawn again does not read them again and make the campaigns twice. Called again as more are made, with how many there are and how
 * many roles are still to be made (none at its end).
 */
export function finishImportFor(id: string, made: number, left = 0): void {
  keptRoles.delete(id);
  madeFrom.delete(id);
  madeFrom.set(id, { made, left });
  if (madeFrom.size > MADE_KEPT) madeFrom.delete(madeFrom.keys().next().value as string);
}

/** What the roles of this add became, once the card has let them go; null for an add that was never finished (a reload, or the time ran out). */
export const finishedImport = (id: string): MadeFrom | null => madeFrom.get(id) ?? null;

/**
 * What a roles card that was drawn again says of the campaigns its roles became: the same words as its own last line when it came to its
 * end, and when it was left with roles still to make, how many, and that those are added again (the ones made are in the list).
 */
export function madeLine({ made, left }: MadeFrom): string {
  const campaigns = `${made} ${made === 1 ? "campaign" : "campaigns"}`;
  if (left > 0) return `${made > 0 ? `${campaigns} created` : "Nothing was created yet"}, ${left} ${left === 1 ? "role" : "roles"} left. Add ${left === 1 ? "it" : "them"} again with the paperclip.`;
  return made > 0 ? `${campaigns} created. Approve ${made === 1 ? "its" : "their"} requirements to start finding people.` : "Nothing was created.";
}

