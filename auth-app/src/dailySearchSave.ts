import { dailySearchApi } from "./api/dailySearch";
import type { DailyRow, DailySearch } from "./api/dailySearch";
import { changesOf, scopeOf, validClock } from "./dailySearchView";
import type { Draft } from "./dailySearchView";

/**
 * What Save in the Daily search popup does. A change to which campaigns it holds (or starting it) is one `PUT`, the person's yes; a change
 * of the morning or of the room alone is a `PATCH` that leaves the campaigns as they are. Saving changes what the search holds, not
 * whether it looks: a search that was paused stays paused, which the same `PUT` is asked to keep (a second call to pause it again would
 * leave a window in which it is on, and lose the end of its pause). It answers how it went, and how many ready campaigns the search could
 * not hold (past the most one search takes), which the popup says in a line after Save.
 */
export async function saveDraft(
  search: DailySearch | null,
  draft: Draft,
  /** The campaigns the popup lists: a ticked one that is ready and not in the search yet is saved in. */
  rows: readonly DailyRow[],
  calls: Pick<typeof dailySearchApi, "save" | "setClock" | "setRoom"> = dailySearchApi,
  /** The most campaigns one search holds: a search that holds that many has no room to bring another in, so a change of the morning is only that. */
  cap: number = Number.POSITIVE_INFINITY,
): Promise<{ how: "started" | "saved"; held: number }> {
  const time = validClock(draft.runAt);
  if (!time) throw new Error("Say the time as a clock time, like 7:00 am.");
  const change = changesOf(search, draft, rows, cap);
  const fresh = !search || search.status === "off";
  // The campaigns a yes could not take in, for the line after Save (only the save of the campaigns can leave any out).
  let held = 0;
  if (change.selection) {
    const saved = await calls.save({
      scope: scopeOf(draft.sel),
      mode: "replace",
      runAt: time,
      repeat: draft.repeat,
      reserve: draft.reserve,
      waitingCap: draft.waitingCap,
      perCampaign: draft.perCampaign,
      ...(search?.status === "paused" ? { keepPaused: true } : {}),
    });
    held = saved.started?.held?.length ?? 0;
  } else {
    if (change.clock) await calls.setClock({ runAt: time, repeat: draft.repeat });
    if (change.room) await calls.setRoom({ reserve: draft.reserve, waitingCap: draft.waitingCap, perCampaign: draft.perCampaign });
  }
  return { how: fresh ? "started" : "saved", held };
}
