/**
 * Where a person left each section: the page, the search, the filters, the sort, the tab, the groups they opened and
 * how far they had scrolled. Kept in this browser tab only (sessionStorage), so a new tab or a new visit starts clean,
 * and so that going away and coming back (to another section, into a campaign and Back) finds the list as it was.
 *
 * Rules the pages rely on:
 *   - Keyed by workspace and section (and the campaign, where a section belongs to one): another organisation never
 *     reads this one's, and switching organisation or signing out clears all of it.
 *   - Versioned: a shape this code does not know is ignored, never half-read.
 *   - Never trusted: every reader gets the raw object and has to say what it accepts (`take`), so an unknown filter,
 *     a page past the end or a corrupt value falls back to the default instead of landing the person in a list that
 *     cannot exist.
 *   - Quiet: storage that is missing, full or refused is the same as nothing remembered. Nothing here throws.
 *   - An explicit link (a hash query, "N need you", a deep link into a record) is the page's to honour first: the pages
 *     ask `hasDeepLink()` and, when it is true, start from what the link says and not from this.
 */

const VERSION = 1;
const PREFIX = "sh.section.v1.";
/** Other keys this module's reset also owns (their key is workspace-scoped through `sectionScope`). */
const OWNED = [PREFIX, "sh.analytics.filters."] as const;

let scope = "local";

/** Which workspace the keys belong to. Called when the tab learns its workspace; a different one clears what was kept. */
export function setSectionScope(id: string | null): void {
  const next = id ?? "personal";
  if (next === scope) return;
  const first = scope === "local";
  scope = next;
  // The first answer (boot) keeps what this tab already had for it; a real switch starts over.
  if (!first) resetSectionState();
}

export const sectionScope = (): string => scope;

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export const sectionKey = (section: string, forScope: string = scope): string => `${PREFIX}${forScope}.${section}`;

/** Forgets every remembered section (an organisation switch, a sign-out). Never throws. */
export function resetSectionState(store: Storage | null = session()): void {
  if (!store) return;
  try {
    for (const key of Object.keys(store)) if (OWNED.some((p) => key.startsWith(p))) store.removeItem(key);
  } catch {
    /* nothing kept, nothing to forget */
  }
}

/** What was kept for a section, read through `parse`; the fallback when nothing usable was. */
export function loadSection<T>(section: string, parse: (raw: Record<string, unknown>) => T, fallback: T, store: (Pick<Storage, "getItem"> & Partial<Pick<Storage, "removeItem">>) | null = session()): T {
  try {
    const text = store?.getItem(sectionKey(section));
    if (!text) return fallback;
    const wrap: unknown = JSON.parse(text);
    if (!isRecord(wrap) || wrap.v !== VERSION || !isRecord(wrap.s)) return fallback;
    return parse(wrap.s);
  } catch {
    // A saved state that cannot be read must not be there next time either.
    try { store?.removeItem?.(sectionKey(section)); } catch { /* nothing to forget */ }
    return fallback;
  }
}

export function saveSection(section: string, state: object, store: Pick<Storage, "setItem"> | null = session()): void {
  try {
    store?.setItem(sectionKey(section), JSON.stringify({ v: VERSION, s: state }));
  } catch {
    /* a browser that refuses storage just forgets */
  }
}

export function forgetSection(section: string, store: Pick<Storage, "removeItem"> | null = session()): void {
  try {
    store?.removeItem(sectionKey(section));
  } catch {
    /* nothing to forget */
  }
}

/** Whether the address asks for something of its own (a hash query such as `?open=` or `?channel=`): then nothing is restored over it. */
export function hasDeepLink(hash: string = typeof window === "undefined" ? "" : window.location.hash): boolean {
  const i = hash.indexOf("?");
  return i >= 0 && i < hash.length - 1;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Readers for the raw values: each says what it accepts and gives the fallback for anything else. */
export const take = {
  str: (v: unknown, fallback = "", max = 200): string => (typeof v === "string" ? v.slice(0, max) : fallback),
  int: (v: unknown, fallback = 0, min = 0, max = 1_000_000): number =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback,
  bool: (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : fallback),
  oneOf: <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.find((a) => a === v) ?? fallback),
  strs: (v: unknown, max = 200): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 200).slice(0, max) : []),
  /** An object of booleans (the groups a person opened or shut), as far as it is one. */
  flags: (v: unknown, max = 200): Record<string, boolean> => {
    if (!isRecord(v)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, x] of Object.entries(v).slice(0, max)) if (typeof x === "boolean") out[k] = x;
    return out;
  },
  /** The raw object itself, for a nested piece the caller reads with `take` again. */
  rec: (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {}),
};

/** A remembered offset held inside the list as it is now: never past the last page, never negative, always the first row of a page. */
export function clampedOffset(offset: number, total: number | null, limit: number): number {
  if (!(limit > 0) || !Number.isFinite(offset)) return 0;
  const top = total === null ? Number.MAX_SAFE_INTEGER : Math.floor((Math.max(total, 1) - 1) / limit) * limit;
  return Math.max(0, Math.min(Math.floor(offset / limit) * limit, top));
}

/**
 * The page a list is on, from the row a person left it at. Until the list's total is known nothing is written back (a
 * remembered page must not be rounded against a size that has not been measured, or a total that has not arrived);
 * once it is, `fix` is the offset to put in state when the remembered one does not fit the list as it is now.
 */
export function settledOffset(wanted: number, total: number | null, size: number): { offset: number; fix: number | null } {
  const offset = clampedOffset(wanted, total, size);
  return { offset, fix: total !== null && offset !== wanted ? offset : null };
}
