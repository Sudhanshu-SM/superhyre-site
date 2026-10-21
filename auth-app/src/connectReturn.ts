/**
 * Where a person was when they left for Google to connect or reconnect Gmail in this same window (the pop-up was
 * blocked), so they come back to the same page and chat rather than to Settings. Held in this tab only, and used
 * once; a connection made in a pop-up never reads it (that window closes itself instead).
 */
const KEY = "sh.connect.return";

/** Remembers the page the person is on, unless it is the connections page itself. */
export function rememberReturn(hash: string = window.location.hash): void {
  try {
    if (hash && !hash.startsWith("#/settings/connections")) window.sessionStorage.setItem(KEY, hash);
  } catch {
    /* no storage: they land on Settings, as before */
  }
}

/** The page they left from, once; null when they left from nowhere or it was already used. */
export function takeReturn(): string | null {
  try {
    const hash = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return hash && hash.startsWith("#/") ? hash : null;
  } catch {
    return null;
  }
}
