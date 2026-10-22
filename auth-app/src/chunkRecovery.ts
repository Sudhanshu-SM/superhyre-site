/**
 * A deploy replaces the console's files, and browsers keep the page that names them for a while (and tabs stay open for
 * days), so a screen's file can be asked for after it is gone. The deploy keeps the last few builds' files so that is
 * rare; when it still happens the page reloads once, onto the current build, instead of staying broken. Never in a
 * loop: a second failure inside a minute is left to the error screen.
 */
const KEY = "sh-chunk-reload";
const WITHIN_MS = 60_000;

type Store = Pick<Storage, "getItem" | "setItem">;
type Win = {
  addEventListener: (type: string, fn: (e?: { preventDefault?: () => void }) => void) => void;
  location: { reload: () => void };
};

export function recoverFromMissingChunks(win: Win = window, store: Store | null = safeStore(), now: () => number = Date.now): void {
  win.addEventListener("vite:preloadError", (event) => {
    event?.preventDefault?.();
    try {
      const last = Number(store?.getItem(KEY) ?? 0);
      if (last && now() - last < WITHIN_MS) return;
      store?.setItem(KEY, String(now()));
    } catch {
      // Storage unavailable: reload once per page load below is all that can be promised.
    }
    win.location.reload();
  });
}

function safeStore(): Store | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}
