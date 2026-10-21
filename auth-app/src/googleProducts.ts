import type { GoogleConnection, GoogleProduct, GoogleProductState } from "./api/identity";
import { addAccessLabel } from "./connectStates";

/**
 * The parts of one Google connection, as plain data for the Connections card: each with what it does for the person
 * and where it stands, in words. One sign-in, grown by asking only for what is missing; the card never says "Google"
 * four times, and a part Google refused says why and where the fix is.
 */

/** The order the card lists them in, and what each one does. */
export const PRODUCT_ROWS: ReadonlyArray<{ product: GoogleProduct; name: string; use: string }> = [
  { product: "gmail", name: "Email", use: "Sends the outreach you approve, from your own address." },
  { product: "calendar", name: "Calendar", use: "Finds free time and sends interview invitations from your own calendar." },
  { product: "tasks", name: "Tasks", use: "Puts a reminder in your Google Tasks when you ask for one." },
  { product: "sheets", name: "Files", use: "Drive and Sheets: where shortlists go when you export them." },
];

export type ProductRow = {
  product: GoogleProduct;
  name: string;
  use: string;
  /** `quiet` before there is a sign-in to speak of. */
  state: GoogleProductState["state"] | "quiet";
  /** Said beside the name: "On", "Needs access", or the reason Google said no. */
  text: string;
  /** The page that switches an API on in the Google project, when that is the trouble. */
  help: string | null;
};

const TEXT: Record<GoogleProductState["state"], string> = {
  on: "On",
  needs_access: "Needs access",
  api_disabled: "",
  reconnect: "Reconnect to use it",
};

/** What the card lists, in order. A server that predates the parts reads each from the products it lists. */
export function productRows(g: GoogleConnection): ProductRow[] {
  const signedIn = g.status !== "disconnected";
  return PRODUCT_ROWS.map(({ product, name, use }): ProductRow => {
    if (!signedIn) return { product, name, use, state: "quiet", text: "", help: null };
    const given = g.productStates?.find((s) => s.product === product);
    const state: GoogleProductState["state"] =
      given?.state ?? (g.status !== "connected" ? "reconnect" : g.products.includes(product) ? "on" : "needs_access");
    return {
      product,
      name,
      use,
      state,
      text: state === "api_disabled" ? (given?.message ?? `Google ${name} isn't switched on for the Google project yet.`) : TEXT[state],
      help: state === "api_disabled" ? (given?.help ?? null) : null,
    };
  });
}

export type AccessAction = { label: string; products: GoogleProduct[]; kind: "connect" | "add" | "reconnect" };

/**
 * The one button: connect when there is no sign-in, reconnect when it ran out, and when it is live but lacks Calendar
 * or Tasks, "Add Calendar & Tasks access", which asks Google only for those. Nothing when every part is on.
 */
export function accessAction(g: GoogleConnection): AccessAction | null {
  const all = PRODUCT_ROWS.map((r) => r.product);
  if (g.status === "disconnected") return { label: "Connect Google", products: all, kind: "connect" };
  if (g.status !== "connected") return { label: "Reconnect", products: all, kind: "reconnect" };
  const lacking = productRows(g).filter((r) => r.state === "needs_access").map((r) => r.product);
  if (!lacking.length) return null;
  const scheduling = lacking.filter((p): p is "calendar" | "tasks" => p === "calendar" || p === "tasks");
  if (scheduling.length === lacking.length) return { label: addAccessLabel(scheduling), products: scheduling, kind: "add" };
  return { label: "Reconnect", products: all, kind: "reconnect" };
}

/** Whether any part is held up by the Google project, so "Check again" is worth offering. */
export const hasProjectTrouble = (rows: readonly ProductRow[]): boolean => rows.some((r) => r.state === "api_disabled");

/** The line under the connection's name. */
export function connectionLine(g: GoogleConnection): string {
  if (!g.available) return g.reason ?? "Not available yet.";
  if (g.status === "connected") return g.accountEmail ? `Connected as ${g.accountEmail}` : "Connected";
  if (g.status === "expired" || g.status === "failed") return "Signed out. Reconnect to keep sending and scheduling.";
  if (g.status === "revoked") return "Access was removed in Google. Connect again to use it.";
  return "Not connected";
}
