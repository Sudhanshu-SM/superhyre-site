import { useCampaignRow } from "./campaignStore";
import type { Assignable, Session } from "./roleStore";
import { isAssigned, useSession } from "./roleStore";

/**
 * Who may write a campaign's brief, and who only follows it (docs/workspaces-and-orgs.md section 2, "Campaigns").
 *
 * A campaign shared with the whole organisation can be seen by every recruiter, and worked (add, move, pass,
 * shortlist, notes, outreach drafts) by all of them. Its brief and what spends the workspace's credits (the role
 * spec, starting or watching a search, ranking again, contact lookups, its settings) belong to the people on it:
 * its owner, its team and the organisation's owner and admins. This is the server's `requireOnCampaign`, mirrored
 * so the console draws no control that would be refused; the server still refuses it, in the same words.
 */

/** One calm line where the controls would have been. Said once on a screen, never as a toast. */
export const FOLLOWING_LINE =
  "You can follow this campaign. Ask its owner to add you to change the role spec or start a search.";

/** Whether a person may change this campaign. A row not loaded yet is left to the server, which says it too. */
export function mayChangeCampaign(session: Session, row: Assignable | undefined): boolean {
  if (session.role === "admin") return true;
  if (!row) return true;
  return isAssigned(row, session);
}

/** `mayChangeCampaign` for the signed-in person and one campaign, as a hook. */
export function useMayChangeCampaign(campaignId: string | null | undefined): boolean {
  const session = useSession();
  const row = useCampaignRow(campaignId ?? "");
  return mayChangeCampaign(session, campaignId ? row : undefined);
}
