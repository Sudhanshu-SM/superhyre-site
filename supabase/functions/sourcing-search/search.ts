// The pipeline: JD -> filters (Claude) -> paged ContactOut search -> dedupe -> store.
// Every step reports progress through `emit` so the browser can stream it live.
// Ported from sourcing/lib/search.js; the only structural change is that
// store.js's local SQLite calls become db.ts's RPC calls, forwarding the
// caller's JWT so the seen-list and run history live in Postgres, shared by
// the whole team, instead of one laptop's file.

import { extractFilters, relaxations } from "./extract.ts";
import { searchPage, PAGE_SIZE } from "./contactout.ts";
import type { Candidate } from "./contactout.ts";
import { scoreCandidates } from "./score.ts";
import type { Scored } from "./score.ts";
import * as db from "./db.ts";

export type Emit = (event: Record<string, unknown>) => void;

export async function runSearch(opts: {
  jd: string; comments?: string; count: number; revealInfo?: boolean; dataTypes?: string[];
  fastForward?: boolean; broaden?: boolean; score?: boolean; model?: string; maxPages: number;
}, jwt: string, emit: Emit): Promise<void> {
  const {
    jd, comments = "", count, revealInfo = false, dataTypes = [],
    fastForward = true, broaden = true, score = true, model, maxPages,
  } = opts;

  const started = await db.start({ jd, comments, requested: count }, jwt);
  const seen = new Set(started.seenUrls);

  emit({
    type: "start", runId: started.runId, jdHash: started.jdHash,
    previousRuns: started.previousRuns, previouslySeen: seen.size,
  });

  let scanned = 0;
  let skipped = 0;
  let pageBudget = maxPages;
  const collected: Scored[] = [];
  const taken = new Set<string>();

  try {
    emit({ type: "stage", stage: "extract", message: "Reading the JD…" });
    const plan = await extractFilters({ jd, comments, model });
    await db.attachPlan(
      { runId: started.runId, filters: plan.filters, locked: plan.locked, summary: plan.roleSummary },
      jwt,
    );
    emit({ type: "plan", ...plan });

    // Attempt 1 is the model's filters; later attempts progressively drop the
    // most over-narrowing constraint. All attempts share one page budget, so
    // broadening can never multiply the credit spend.
    const attempts = [{ filters: plan.filters, removed: [] as string[] }];
    if (broaden) attempts.push(...relaxations(plan.filters, plan.locked));

    for (const [index, attempt] of attempts.entries()) {
      if (collected.length >= count || pageBudget <= 0) break;

      if (index > 0) {
        emit({
          type: "stage", stage: "broaden",
          message: `Only ${collected.length} of ${count} so far — dropping ${attempt.removed.join(", ")} and searching wider.`,
          removed: attempt.removed,
        });
      }

      // Results for a JD come back in a stable order, so on a repeat run the
      // first N pages are people already delivered. Skipping straight past them
      // saves a search credit per profile we would only have thrown away.
      let page = fastForward && index === 0 ? Math.floor(seen.size / PAGE_SIZE) + 1 : 1;
      let total: number | null = null;

      while (collected.length < count && pageBudget > 0) {
        const res = await searchPage({ filters: attempt.filters, page, revealInfo, dataTypes });
        pageBudget--;
        total = res.total;
        scanned += res.profiles.length;

        // Rewind if fast-forward overshot the end of a smaller result set.
        if (!res.profiles.length && page > 1 && scanned === 0) {
          page = 1;
          continue;
        }

        const fresh: (Candidate & { matchedAfterDropping: string[] })[] = [];
        for (const p of res.profiles) {
          if (seen.has(p.url) || taken.has(p.url)) { skipped++; continue; }
          if (collected.length + fresh.length >= count) break;
          // Record which constraints had to go to surface this person, so the
          // result can never pass itself off as an exact match.
          fresh.push({ ...p, matchedAfterDropping: attempt.removed });
          taken.add(p.url);
        }
        collected.push(...fresh);

        emit({
          type: "page", page, total, scanned,
          fetched: res.profiles.length, kept: fresh.length,
          collected: collected.length, skipped, budget: pageBudget,
        });

        if (!res.profiles.length) break;
        if (total && page * PAGE_SIZE >= total) break;
        page++;
      }
    }

    let ranked: Scored[] = collected;
    if (score && collected.length) {
      emit({ type: "stage", stage: "score", message: `Scoring ${collected.length} profiles against the JD…` });
      ranked = await scoreCandidates(
        { candidates: collected, jd, comments, mustHaves: plan.mustHaves, model },
        (p) => emit({ type: "stage", stage: "score", message: `Scoring ${p.from}-${p.to} of ${p.total}…` }),
      );
    }

    await db.saveCandidates({ runId: started.runId, jdHash: started.jdHash, candidates: ranked }, jwt);
    await db.finish({ runId: started.runId, returned: ranked.length, skipped, scanned }, jwt);

    emit({
      type: "done", runId: started.runId, candidates: ranked,
      requested: count, returned: collected.length,
      skippedSeen: skipped, scanned, budgetLeft: pageBudget,
      exhausted: collected.length < count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Whatever we did collect is still worth keeping — it also stays out of the
    // next run's results, which is exactly what the caller already paid for.
    if (collected.length) {
      await db.saveCandidates(
        { runId: started.runId, jdHash: started.jdHash, candidates: collected },
        jwt,
      ).catch(() => undefined);
    }
    await db.finish(
      { runId: started.runId, returned: collected.length, skipped, scanned, status: "error", error: message },
      jwt,
    ).catch(() => undefined);
    emit({ type: "error", runId: started.runId, message, partial: collected.length });
  }
}
