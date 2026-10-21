import type { CampaignStatus } from "./campaignsData";
import type { EmptyArtName } from "./EmptyArt";
import { plainText } from "./displayText";

/**
 * What the Campaigns list says when it has nothing to list, which is one of four different things:
 *
 *   first       there are no campaigns at all (anyone who may open one can make the first)
 *   no-access   there are campaigns, and this person is on none of them
 *   none-yet    a tab with a zero count: nothing is closed yet
 *   no-match    the name search found nothing: the way out is clearing it
 *
 * A zero-count tab is not a search that failed, so it gets neither the magnifier nor a
 * "New campaign" button. The first-campaign state does not repeat the header's button either:
 * `canCreate` says the person may, and the hint says where.
 */
export type CampaignsEmptyKind = "first" | "no-access" | "none-yet" | "no-match";

export type CampaignsEmpty = {
  kind: CampaignsEmptyKind;
  message: string;
  hint?: string;
  art: { name: EmptyArtName; size: number };
  /** "New campaign": only where nothing exists at all and the person may make one. */
  canCreate: boolean;
  /** "Clear search": only where a search is what hides the rest. */
  canClear: boolean;
};

const NONE_YET: Readonly<Record<CampaignStatus, string>> = {
  active: "Nothing is running right now.",
  closed: "Nothing has been closed yet.",
};

export function campaignsEmpty(a: { filter: "all" | CampaignStatus; q: string; total: number; mayCreate: boolean }): CampaignsEmpty {
  const q = a.q.trim();
  if (q) {
    return {
      kind: "no-match",
      message: `No campaign matches “${plainText(q)}”.`,
      art: { name: "empty-search", size: 160 },
      canCreate: false,
      canClear: true,
    };
  }
  if (a.total === 0) {
    return a.mayCreate
      ? {
          kind: "first",
          message: "No campaigns yet.",
          /* The header's "New campaign" is the one way in; the page says where it is rather than repeat it. */
          hint: "Start the first one with New campaign, above.",
          art: { name: "empty-campaigns", size: 220 },
          canCreate: true,
          canClear: false,
        }
      : {
          kind: "no-access",
          message: "You're not on any campaigns yet.",
          hint: "An admin adds you to a campaign, and it shows up here.",
          art: { name: "empty-campaigns", size: 220 },
          canCreate: false,
          canClear: false,
        };
  }
  return {
    kind: "none-yet",
    message: a.filter === "all" ? "No campaigns to show." : NONE_YET[a.filter],
    art: { name: "empty-campaigns", size: 180 },
    canCreate: false,
    canClear: false,
  };
}
