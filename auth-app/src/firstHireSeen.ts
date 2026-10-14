/**
 * The campaign's first-hire moment is said once: a dialog with its picture. Hiring someone, moving
 * them back and hiring again is the same first hire, so it is remembered per campaign (in this
 * browser only; it is a courtesy, not a record).
 */

type Store = Pick<Storage, "getItem" | "setItem">;

const key = (campaignId: string) => `sh.first-hire.${campaignId}`;

function browserStore(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function firstHireSeen(campaignId: string, store: Store | null = browserStore()): boolean {
  try {
    return store?.getItem(key(campaignId)) === "1";
  } catch {
    return false;
  }
}

export function rememberFirstHire(campaignId: string, store: Store | null = browserStore()): void {
  try {
    store?.setItem(key(campaignId), "1");
  } catch { /* blocked or full: the dialog may come again, which is harmless */ }
}
