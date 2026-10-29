import { useEffect, useState } from "react";
import { agentApi } from "./api/agent";
import { LIVE } from "./api/client";
import { DailySearchDialog } from "./DailySearchDialog";

/**
 * "Daily search" in the Campaigns page header: a text button that opens the daily search itself (docs/plans/daily-search.md, Phase 2):
 * whether it is on, the morning, the campaigns it holds, how each one is doing. It is also how the bell's row about the daily search gets
 * there: that link is the Campaigns page with `daily-search=open` in it, which opens the popup once and is then taken off the address.
 * Setting it up in words to the agent still works and brings the same question; this is the place to see it and steer it.
 *
 * It is there only while the server has the daily search switched on: a button that answers "not switched on yet" is not shown.
 */

let known: Promise<boolean> | null = null;
/** Whether the server has the daily search on; asked once, and asked again after a failure. */
export function dailySearchOn(): Promise<boolean> {
  if (!LIVE) return Promise.resolve(false);
  known ??= agentApi
    .dailySearch()
    .then((r) => r.on === true)
    .catch(() => {
      known = null;
      return false;
    });
  return known;
}
/** For tests: forget what was asked. */
export const forgetDailySearch = () => {
  known = null;
};

/** Whether an address asks for the daily search to be opened (the bell's link). */
export const wantsDailySearch = (hash: string): boolean => /[?&]daily-search=open(?:&|$)/.test(hash);

/** The address without the ask, so a reload or a back does not open it again. Nothing else in it is touched. */
export function withoutDailySearch(hash: string): string {
  const [path = "", query = ""] = hash.split("?");
  const rest = query.split("&").filter((p) => p && p !== "daily-search=open");
  return rest.length ? `${path}?${rest.join("&")}` : path;
}

export function DailySearchButton({ on: given }: {
  /** Known already (a test, or a page that asked): not asked again. */
  on?: boolean;
}): JSX.Element | null {
  const [asked, setAsked] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (given !== undefined) return;
    let live = true;
    void dailySearchOn().then((on) => live && setAsked(on));
    return () => {
      live = false;
    };
  }, [given]);
  const on = given ?? asked;
  /* The bell's link opens it, on arriving and while the page is already open. */
  useEffect(() => {
    if (!on) return;
    const look = () => {
      if (!wantsDailySearch(window.location.hash)) return;
      window.history.replaceState(null, "", withoutDailySearch(window.location.hash) || "#/campaigns");
      setOpen(true);
    };
    look();
    window.addEventListener("hashchange", look);
    return () => window.removeEventListener("hashchange", look);
  }, [on]);
  if (!on) return null;
  return (
    <>
      <button type="button" className="cg-daily" onClick={() => setOpen(true)}>
        Daily search
      </button>
      <DailySearchDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
