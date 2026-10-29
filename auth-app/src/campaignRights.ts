import { canSetStatus } from "./can";
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
  "You can follow this campaign. Ask its owner or the team lead to add you to change the requirements or start a search.";

/** The line that fits the person reading it. An admin is told nothing: an admin changes every campaign, so there is nothing to explain. */
export function useFollowingLine(): string {
  return useSession().role === "admin" ? "" : FOLLOWING_LINE;
}

/** Whether a person may change this campaign. A row not loaded yet is left to the server, which says it too. */
export function mayChangeCampaign(session: Session, row: Assignable | undefined): boolean {
  if (!row) return true;
  /* The server says it for every live row; an admin otherwise changes any (fixtures, older servers). */
  if (row.canManage !== undefined) return row.canManage;
  if (session.role === "admin") return true;
  return isAssigned(row, session);
}

/**
 * Whether a person may close or reopen this campaign: an admin (who changes every campaign, whatever team it is on) or
 * its owner. A row the server has marked (`canManage`) is believed, so the control is not offered only to be refused.
 */
export function mayCloseCampaign(session: Session, row: Assignable | undefined): boolean {
  const own = canSetStatus(session, { ownerId: row?.ownerId }) || (!row?.ownerId && !!row && row.owner === session.name);
  return own && mayChangeCampaign(session, row);
}

/** `mayChangeCampaign` for the signed-in person and one campaign, as a hook. */
export function useMayChangeCampaign(campaignId: string | null | undefined): boolean {
  const session = useSession();
  const row = useCampaignRow(campaignId ?? "");
  return mayChangeCampaign(session, campaignId ? row : undefined);
}

/**
 * Whether a person may set or change this campaign's client. While it has none, anyone who may change the campaign sets it
 * (every campaign has a client, and an older one without is not left waiting for an admin); once it has one, changing it is
 * an admin's or the campaign's owner's. The server's rule, so no control is drawn that it would turn down.
 */
export function mayChangeCampaignClient(session: Session, row: Assignable | undefined, hasClient: boolean): boolean {
  return mayChangeCampaign(session, row) && (!hasClient || mayCloseCampaign(session, row));
}

/** `mayChangeCampaignClient` for the signed-in person and one campaign, as a hook. */
export function useMayChangeCampaignClient(campaignId: string | null | undefined, hasClient: boolean): boolean {
  const session = useSession();
  const row = useCampaignRow(campaignId ?? "");
  return mayChangeCampaignClient(session, campaignId ? row : undefined, hasClient);
}
