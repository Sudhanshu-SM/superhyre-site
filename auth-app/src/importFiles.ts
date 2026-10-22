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

/* The first version of this module held only files. */
export const stashImportFiles = (files: readonly File[]): void => stashImport({ files: [...files] });
export const takeImportFiles = (): File[] => takeImport().files;
