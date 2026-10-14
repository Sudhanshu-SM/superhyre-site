import { useEffect, useState } from "react";
import type { ApiActivity } from "../api/campaigns";
import { loadOlderActivity, useActivityHasOlder, useCampaignActivity } from "../campaignStore";

/** A page is up to a hundred lines; this many pages is plenty for a fortnight and stops a runaway log. */
const MAX_PAGES = 8;

/**
 * A campaign's log back to a moment: the console's own store, paged further back until it
 * reaches that time, runs out, or has read enough. `covered` is true once what is loaded is
 * all the period has (or all that can be loaded), so a count over it is complete.
 */
export function useCampaignLog(id: string, since: number): { items: readonly ApiActivity[] | undefined; covered: boolean } {
  const items = useCampaignActivity(id);
  const older = useActivityHasOlder(id);
  const [pages, setPages] = useState(0);
  const oldest = items?.[items.length - 1];
  const covered = !!items && (!older || (oldest !== undefined && Date.parse(oldest.at) <= since) || pages >= MAX_PAGES);

  useEffect(() => {
    if (!items || covered) return;
    setPages((p) => p + 1);
    void loadOlderActivity(id);
  }, [items, covered, id]);

  return { items, covered };
}
