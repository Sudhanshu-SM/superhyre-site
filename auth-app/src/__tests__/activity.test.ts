import { describe, expect, it } from "vitest";
import {
  activitySchema, contactFound, MIN_RATE_N, orderStages, STAGE_ORDER, TERMINAL_STAGES,
} from "../activity";
import type { Activity } from "../activity";

/* These encode the research decisions, which is exactly the kind of thing that
   gets "simplified" back into a bug six months later. */

const reveals = (o: Partial<Activity["reveals"]>): Activity["reveals"] => ({
  total: 0, found: 0, cached: 0, not_found: 0, errored: 0, unique_profiles: 0, ...o,
});

describe("contactFound", () => {
  it("counts a cache hit as a find", () => {
    // A cached hit IS a successful lookup, just a free one. 05_console.sql
    // reports it separately so the saving stays visible, not because it is a
    // different kind of success.
    const r = contactFound(reveals({ total: 40, found: 20, cached: 20 }));
    expect(r.hits).toBe(40);
    expect(r.attempts).toBe(40);
    expect(r.pct).toBe(100);
  });

  it("excludes our own failures from the denominator", () => {
    // failed / needs_setup / rate_limited are the provider chain breaking. If
    // they counted as attempts, an outage would look like candidates having no
    // phone number, and the rate would drop for a reason nobody can act on.
    const r = contactFound(reveals({ total: 100, found: 30, cached: 0, not_found: 10, errored: 60 }));
    expect(r.attempts).toBe(40);
    expect(r.pct).toBe(75);
  });

  it("does not let an outage change the rate at all", () => {
    const clean = contactFound(reveals({ total: 40, found: 30, not_found: 10 }));
    const withOutage = contactFound(reveals({ total: 90, found: 30, not_found: 10, errored: 50 }));
    expect(withOutage.pct).toBe(clean.pct);
  });

  it("suppresses a percentage under the minimum sample and reports the fraction", () => {
    const r = contactFound(reveals({ total: 3, found: 1, not_found: 2 }));
    expect(r.attempts).toBe(3);
    expect(r.pct).toBeNull();
    expect(r.hits).toBe(1);
  });

  it("shows a percentage exactly at the threshold", () => {
    const r = contactFound(reveals({ total: MIN_RATE_N, found: MIN_RATE_N }));
    expect(r.pct).toBe(100);
  });

  it("returns null rather than NaN when there were no attempts", () => {
    const r = contactFound(reveals({ total: 5, errored: 5 }));
    expect(r.attempts).toBe(0);
    expect(r.pct).toBeNull();
  });
});

describe("orderStages", () => {
  it("orders by the pipeline, not by count", () => {
    const out = orderStages([
      { stage: "hired", n: 50 },
      { stage: "sourced", n: 1 },
      { stage: "offer", n: 9 },
    ]);
    expect(out.map((r) => r.stage)).toEqual(["sourced", "offer", "hired"]);
  });

  it("keeps a stage the schema does not know about", () => {
    // <tenant>.candidates.stage has no CHECK constraint, so an unknown value is
    // possible. Dropping it would make the bars disagree with the total.
    const out = orderStages([
      { stage: "on_hold", n: 4 },
      { stage: "sourced", n: 2 },
    ]);
    expect(out.map((r) => r.stage)).toEqual(["sourced", "on_hold"]);
    expect(out.reduce((s, r) => s + r.n, 0)).toBe(6);
  });

  it("does not mutate its input", () => {
    const input = [{ stage: "hired", n: 1 }, { stage: "sourced", n: 2 }];
    orderStages(input);
    expect(input.map((r) => r.stage)).toEqual(["hired", "sourced"]);
  });

  it("treats every known stage as orderable", () => {
    const out = orderStages(STAGE_ORDER.map((s, i) => ({ stage: s, n: i })));
    expect(out.map((r) => r.stage)).toEqual([...STAGE_ORDER]);
  });
});

describe("TERMINAL_STAGES", () => {
  it("closes only hired and rejected", () => {
    const open = STAGE_ORDER.filter((s) => !TERMINAL_STAGES[s]);
    expect(open).toEqual(["sourced", "contacted", "shortlisted", "interviewing", "offer"]);
  });
});

describe("activitySchema", () => {
  const base = {
    scope: "tenant", view: "mine", role: "recruiter", can_view_team: false,
    days: 30, since: "2026-08-07T00:00:00+00:00",
    quota: { used: 1, cap: 100, remaining: 99 },
    reveals: { total: 1, found: 1, cached: 0, not_found: 0, failed: 0, unique_profiles: 1 },
    saved: { total: 1, in_window: 1, with_phone: 1, with_email: 0, source_filtered: true },
    uncontacted: { tracked: true, total: 0, d0_2: 0, d3_7: 0, d8_30: 0, d30p: 0, oldest_days: 0 },
  };

  it("accepts a payload with the optional arrays absent", () => {
    // A brand-new recruiter must get a dashboard, not a parse failure.
    const out = activitySchema.parse(base);
    expect(out.daily).toEqual([]);
    expect(out.funnel).toEqual([]);
    expect(out.recent).toEqual([]);
    expect(out.finds_by_provider).toEqual([]);
  });

  it("keeps the solo untracked branch distinguishable from zero", () => {
    const out = activitySchema.parse({
      ...base, scope: "solo", role: null,
      saved: { ...base.saved, source_filtered: false },
      uncontacted: { tracked: false },
    });
    // A personal workspace cannot narrow to extension-created rows, and says so.
    expect(out.saved.source_filtered).toBe(false);
    expect(out.uncontacted.tracked).toBe(false);
    // The point of the discriminator: `total` is not readable, so no code path
    // can render a 0 that actually means "no such table".
    if (out.uncontacted.tracked === false) {
      expect("total" in out.uncontacted).toBe(false);
    }
  });

  it("rejects a payload missing a required block", () => {
    const { reveals: _drop, ...broken } = base;
    expect(() => activitySchema.parse(broken)).toThrow();
  });

  it("rejects an unknown scope rather than rendering it", () => {
    expect(() => activitySchema.parse({ ...base, scope: "everything" })).toThrow();
  });
});
