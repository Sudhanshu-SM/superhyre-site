import type { CampaignRow } from "./campaignsData";
import { joinParts, plainText } from "./displayText";

/** What sits under a campaign's name: its role (when the spec names it differently), the company, the department, the place. */
const sameWords = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export function metaParts(r: CampaignRow): string {
  const role = r.roleTitle && !sameWords(plainText(r.roleTitle), plainText(r.name)) ? plainText(r.roleTitle) : "";
  return joinParts([role, r.client ? plainText(r.client) : "", r.department, r.location]);
}
