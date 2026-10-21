/**
 * What this browser keeps for the person using it (chat, drafts, search runs, form builder state) and
 * must not hand to whoever signs in next on the same tab or profile. Only display state lives here
 * (the API refuses every fetch for someone else's ids), but a person must never see another's chat,
 * candidate names or half-written campaign.
 *
 * Kept on purpose: an invite link waiting to be accepted, and the interface preferences that are not
 * about anyone (the collapsed sidebar, the board view, light or dark).
 */
const KEEP = new Set(["superhyre.invite", "superhyre.nav.railed", "cw-view", "superhyre.theme"]);
const MINE = (key: string) => (key.startsWith("sh.") || key.startsWith("sh-") || key.startsWith("superhyre:") || key.startsWith("superhyre.")) && !KEEP.has(key) && !key.startsWith("superhyre.tour.seen.");

function sweep(store: Storage | null): void {
  if (!store) return;
  try {
    for (const key of Object.keys(store)) if (MINE(key)) store.removeItem(key);
  } catch {
    /* a browser that refuses storage has nothing kept in it */
  }
}

export function clearPersonalCaches(stores?: readonly (Storage | null)[]): void {
  if (stores) {
    for (const store of stores) sweep(store);
    return;
  }
  if (typeof window === "undefined") return;
  try {
    sweep(window.localStorage);
    sweep(window.sessionStorage);
  } catch {
    /* storage is not available */
  }
}
