import type { CampaignRow } from "./campaignsData";
import { joinParts, plainText } from "./displayText";

/** What sits under a campaign's name: its role (when the spec names it differently), the company, the department, the place. */
const sameWords = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export function metaParts(r: CampaignRow, options: { client?: boolean } = {}): string {
  const role = r.roleTitle && !sameWords(plainText(r.roleTitle), plainText(r.name)) ? plainText(r.roleTitle) : "";
  // The Campaigns page draws the client beside the name, so it leaves it out of this line (said once).
  return joinParts([role, r.client && options.client !== false ? plainText(r.client) : "", r.department, r.location]);
}

/**
 * The row with its client's name on it. A live row carries the name the server gave; one that does not (a demo campaign, or
 * one still being made, whose client was picked or named a moment ago) gets it from the clients, so a campaign that has a
 * client is never offered one to add.
 */
export function withClientName(
  r: CampaignRow,
  clients: ReadonlyArray<{ id: string; name: string }>,
  clientOf: Readonly<Record<string, string>>,
): CampaignRow {
  if (r.client) return r;
  const name = clients.find((c) => c.id === clientOf[r.id])?.name ?? r.setup?.newClient;
  return name ? { ...r, client: name } : r;
}
