/**
 * Alerts in the browser itself (the Notification API) for when the tab is not in front: asked for once, from
 * the bell's panel, never on load, and never again after it is answered or dismissed.
 */

const KEY = "superhyre.browserAlerts.dismissed";

const supported = (): boolean => typeof window !== "undefined" && "Notification" in window;

const read = (): boolean => {
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
};

export type AlertState = "ask" | "granted" | "denied" | "hidden";

/** `ask`: show the row. `granted` and `denied` are answered; `hidden` is dismissed or not supported. */
export function browserAlertState(): AlertState {
  if (!supported()) return "hidden";
  const p = Notification.permission;
  if (p === "granted") return "granted";
  if (p === "denied") return "denied";
  return read() ? "hidden" : "ask";
}

export function dismissBrowserAlerts(): void {
  try { window.localStorage.setItem(KEY, "1"); } catch { /* the row stays until answered */ }
}

/** Asks the browser. Resolves to what it said; a browser that never answers leaves the row as it was. */
export async function enableBrowserAlerts(): Promise<NotificationPermission | "unsupported"> {
  if (!supported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** One alert, only when allowed and the tab is not in front (a person looking at the page needs no pop-up). */
export function announce(body: string, tag?: string): void {
  if (!supported() || Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && !document.hidden) return;
  try {
    const n = new Notification("SuperHyre", { body, tag, icon: undefined });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* some browsers only allow this from a service worker; the bell still has it */ }
}
