import { describe, expect, it } from "vitest";
import type { CampaignKey } from "../orchestrator";
import {
  DAYS, SCOPED, STALE_DAYS, TASKS, campaignName, campaignsFor, isScoped,
  sourcedFor, stepsFor,
} from "../orchestrator";

/**
 * The overview fold.
 *
 * These tests exist for ONE invariant: the "All campaigns" view is the sum of
 * the per-campaign views. That is what makes the filter trustworthy, and it is
 * exactly the kind of property that breaks silently — someone edits one
 * campaign's fixture, the header keeps reporting a number that no longer equals
 * the sum of its own parts, and nothing fails. No type catches it. A test does.
 *
 * Deliberately NOT asserted: that the total is 148, that there are three
 * campaigns, or that Thursday's peak is 21. Those are the current fixture, not
 * behaviour, and pinning them would mean this file has to be edited every time
 * a number changes — which trains everyone to update tests without reading
 * them. Every assertion below is a RELATION that must hold whatever the
 * fixtures say.
 */

const sum = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0);

describe("sourcedFor", () => {
  it("folds the campaigns day by day, not just in total", () => {
    const all = sourcedFor("all");
    const parts = SCOPED.map((k) => sourcedFor(k));

    // Day by day, because two series can sum to the right total and still be
    // wrong on every individual day.
    all.forEach((day, i) => {
      expect(day.n).toBe(sum(parts.map((p) => p[i]!.n)));
    });
    expect(sum(all.map((d) => d.n))).toBe(sum(parts.map((p) => sum(p.map((d) => d.n)))));
  });

  it("gives every scope the same days in the same order", () => {
    for (const scope of ["all", ...SCOPED] as const) {
      expect(sourcedFor(scope).map((d) => d.day)).toEqual([...DAYS]);
    }
  });

  it("never reports a negative day", () => {
    for (const scope of ["all", ...SCOPED] as const) {
      expect(sourcedFor(scope).every((d) => d.n >= 0)).toBe(true);
    }
  });
});

describe("stepsFor", () => {
  it("folds every step across campaigns", () => {
    const all = stepsFor("all");
    const parts = SCOPED.map((k) => stepsFor(k));

    all.forEach((step, i) => {
      expect(step.n).toBe(sum(parts.map((p) => p[i]!.n)));
      // The denominators have to fold too. A correct numerator over a stale
      // denominator is the version that prints a plausible wrong percentage.
      expect(step.of).toBe(sum(parts.map((p) => p[i]!.of)));
    });
  });

  it("denominates each step by the step it came from", () => {
    for (const scope of ["all", ...SCOPED] as const) {
      const [shortlisted, contacted, replied, interviews] = stepsFor(scope);
      const sourced = sum(sourcedFor(scope).map((d) => d.n));

      // The first two are shares of everyone sourced...
      expect(shortlisted!.of).toBe(sourced);
      expect(contacted!.of).toBe(sourced);
      // ...and from there each is a share of its predecessor, which is the
      // only honest funnel denominator.
      expect(replied!.of).toBe(contacted!.n);
      expect(interviews!.of).toBe(replied!.n);
    }
  });

  it("keeps every step inside its own denominator", () => {
    // A step larger than the pool it came from means the bar renders past
    // 100% and the card is reporting an impossibility.
    for (const scope of ["all", ...SCOPED] as const) {
      for (const s of stepsFor(scope)) {
        expect(s.n).toBeLessThanOrEqual(s.of);
      }
    }
  });
});

describe("campaignsFor", () => {
  it("lists every campaign for all, and exactly one when scoped", () => {
    expect(campaignsFor("all").map((c) => c.id)).toEqual([...SCOPED]);
    for (const k of SCOPED) {
      expect(campaignsFor(k).map((c) => c.id)).toEqual([k]);
    }
  });

  it("derives live from the contacted step rather than storing it", () => {
    // `live` used to be its own fixture field, and for one campaign it held
    // the same value as the OVERALL contacted count — two unrelated numbers
    // that happened to match. Deriving it is what stops this card and the
    // Progress card drifting apart.
    for (const k of SCOPED) {
      const [camp] = campaignsFor(k);
      const contacted = stepsFor(k).find((s) => s.id === "contacted");
      expect(camp!.live).toBe(contacted!.n);
    }
  });

  it("names campaigns from the canonical list, not from its own copy", () => {
    for (const c of campaignsFor("all")) {
      expect(c.name).toBe(campaignName(c.id));
      expect(c.name).not.toBe(c.id);
    }
  });
});

describe("scope", () => {
  it("treats all as the only unscoped value", () => {
    expect(isScoped("all")).toBe(false);
    for (const k of SCOPED) expect(isScoped(k)).toBe(true);
  });
});

describe("tasks", () => {
  it("points every task at a campaign that has data", () => {
    // A task on a campaign outside SCOPED would be unreachable: the campaign
    // filter only offers scoped campaigns, so the row could never be shown
    // except under All.
    for (const t of TASKS) {
      expect(SCOPED).toContain(t.campaignId as CampaignKey);
    }
  });

  it("has work in every window the filter offers", () => {
    // Each option must be able to return something, or the control offers a
    // guaranteed empty state. Overdue included, since Today is `<= 0` and the
    // overdue row is the one most worth not hiding.
    expect(TASKS.some((t) => t.dueInDays < 0)).toBe(true);
    expect(TASKS.some((t) => t.dueInDays === 0)).toBe(true);
    expect(TASKS.some((t) => t.dueInDays > 0 && t.dueInDays <= 7)).toBe(true);
  });

  it("agrees with the stale threshold about which campaign has stalled", () => {
    // The Campaigns card colours a row rose off `quietFor >= STALE_DAYS`. If
    // no fixture ever crosses it, the alert path is never exercised by anyone
    // looking at the page.
    expect(campaignsFor("all").some((c) => c.quietFor >= STALE_DAYS)).toBe(true);
    expect(campaignsFor("all").some((c) => c.quietFor < STALE_DAYS)).toBe(true);
  });
});
