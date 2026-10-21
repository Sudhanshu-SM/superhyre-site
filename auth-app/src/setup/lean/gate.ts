import type { Me } from "../../api/identity";
import type { Setup } from "../../api/onboarding";

/**
 * Whether this person is walked through set-up now.
 *
 * Everyone who has not finished it and is not in an organisation: a work address or a personal one
 * alike (the team question inside set-up is what differs). Not for someone who is already in an
 * organisation (invited, approved), who chose to stay in Personal, who was removed from one (so it
 * is not offered back), or whose account could not be read (`setupInfo` null: better to show the
 * console than to put an existing account back through the questions).
 *
 * The one exception to "in an organisation": its owner, when the set-up that made it did not finish.
 */
export function needsSetup(
  me: Pick<Me, "workspaces" | "scope" | "onboarding">,
  setupInfo: { setup: Setup | null } | null | undefined,
  declined: boolean,
): boolean {
  if (!setupInfo || declined) return false;
  const setup = setupInfo.setup;
  if (setup?.completedAt || setup?.step === "done") return false;
  const org = me.workspaces.find((w) => w.kind === "org");
  if (org) return !!setup?.organizationId && org.role === "owner";
  if (me.onboarding.memberOf || me.onboarding.staysPersonal) return false;
  return true;
}

/**
 * Where the console opens when the set-up ends. The first campaign is in the organisation the set-up made, or
 * in Personal. It opens on that campaign's chat when the person is in the workspace that holds it, and on
 * Home otherwise: an approval can land while they were still answering, which makes the organisation the one
 * they are in, and a link to a Personal campaign would show a campaign that is not there.
 *
 * `activeOrganisationId` is the workspace the account says they are in (null for Personal); undefined when
 * the account could not be read, which keeps the link.
 */
export function landingPlace(
  done: { organisationId: string | null },
  activeOrganisationId: string | null | undefined,
): "campaign" | "home" {
  if (activeOrganisationId === undefined) return "campaign";
  return done.organisationId === activeOrganisationId ? "campaign" : "home";
}

/**
 * What the set-up hands the console when it ends: the new campaign's chat, so the role spec to approve is the first thing
 * seen, or Home when there is no campaign (the person carried on without a first role).
 */
export function finishedFrom(made: { campaignId: string | null; conversationId: string | null; organisationId: string | null }): {
  hash: string;
  conversationId: string | null;
  organisationId: string | null;
} {
  return {
    hash: made.campaignId ? `#/agent?campaign=${made.campaignId}` : "#/",
    conversationId: made.campaignId ? made.conversationId : null,
    organisationId: made.organisationId,
  };
}
