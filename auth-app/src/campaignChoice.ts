/**
 * The campaign a person picked, kept across a refresh. The sidebar's campaign is chosen in the console's own state,
 * which a reload empties: without this the page came back on the default (the most recent campaign) whatever they
 * had been working on. One entry per person, by their id; a campaign that is gone or no longer theirs is not used.
 * localStorage throws in some privacy modes, so every read and write is allowed to fail quietly.
 */

const key = (userId: string) => `superhyre.campaign.${userId}`;

export function rememberedCampaign(userId: string): string | null {
  if (!userId) return null;
  try {
    return window.localStorage.getItem(key(userId)) || null;
  } catch {
    return null;
  }
}

export function rememberCampaign(userId: string, campaignId: string): void {
  if (!userId || !campaignId) return;
  try {
    window.localStorage.setItem(key(userId), campaignId);
  } catch {
    /* not worth failing over */
  }
}
