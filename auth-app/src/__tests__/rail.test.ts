import { describe, expect, it } from "vitest";
import { BRIEFS, CHANNELS } from "../orchestrator";
import { CONFIG, RECENT_FEW, searchBriefs } from "../Rail";
import { ROUTES } from "../nav";

/**
 * Rail — the orchestrator's right column.
 *
 * These assert RELATIONS, never fixture values, so adding a brief or
 * connecting a channel does not break a test that was never about that. The
 * one place a literal appears is the inline cap, which is a design decision
 * with a reason (see below) rather than a consequence of the data.
 */

describe("brief search", () => {
  it("returns everything when the query is empty or blank", () => {
    for (const q of ["", "   ", "\t"]) {
      expect(searchBriefs(BRIEFS, q).total).toBe(BRIEFS.length);
    }
  });

  /* THE FOLD. Same principle the overview's totals are pinned by: the parts
     sum to the whole. A brief that matches has to land in exactly one group,
     so a future change to `isRecent` cannot silently drop or duplicate a row —
     the count would stop matching the groups. */
  it("splits every survivor into exactly one group", () => {
    for (const q of ["", "e", "engineers", "platform", "zzzz"]) {
      const { recent, earlier, total } = searchBriefs(BRIEFS, q);
      expect(recent.length + earlier.length).toBe(total);
      const ids = [...recent, ...earlier].map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  /* The reason the filter reads two fields instead of one: you look for a
     brief by the campaign it belonged to, and the campaign is usually absent
     from the title. Asserted as "such a brief exists and is found by its
     campaign", so it holds without naming one. */
  it("matches on campaign, not only on title", () => {
    const byCampaignOnly = BRIEFS.find(
      (b) => !b.title.toLowerCase().includes(b.campaign.toLowerCase()),
    );
    expect(byCampaignOnly).toBeDefined();
    const hit = searchBriefs(BRIEFS, byCampaignOnly!.campaign);
    expect([...hit.recent, ...hit.earlier].map((b) => b.id)).toContain(byCampaignOnly!.id);
  });

  it("is case-insensitive and ignores surrounding whitespace", () => {
    const first = BRIEFS.at(0);
    expect(first).toBeDefined();
    const term = first!.campaign;
    const plain = searchBriefs(BRIEFS, term).total;
    expect(searchBriefs(BRIEFS, term.toUpperCase()).total).toBe(plain);
    expect(searchBriefs(BRIEFS, term.toLowerCase()).total).toBe(plain);
    expect(searchBriefs(BRIEFS, `  ${term}  `).total).toBe(plain);
  });

  /* An emptied group must vanish, not render its header over nothing — which
     is only true because the groups are derived from the FILTERED set. */
  it("empties both groups when nothing matches", () => {
    const none = searchBriefs(BRIEFS, "qqzzxx");
    expect(none.total).toBe(0);
    expect(none.recent).toHaveLength(0);
    expect(none.earlier).toHaveLength(0);
  });
});

describe("the inline history slice", () => {
  /* Three-to-five is the researched range for a truncated list in a
     space-constrained column; four is where this 340px rail stops paying for
     another row. The literal is the decision. */
  it("shows between three and five rows", () => {
    expect(RECENT_FEW.length).toBeGreaterThanOrEqual(3);
    expect(RECENT_FEW.length).toBeLessThanOrEqual(5);
  });

  /* `View all N` is only honest when rows are actually hidden. With four of
      four shown it would open a dialog containing the same four. */
  it("leaves rows for the dialog to reveal", () => {
    expect(BRIEFS.length).toBeGreaterThan(RECENT_FEW.length);
  });

  /* A prefix, so the rail shows the most recent briefs rather than an
     arbitrary subset — BRIEFS is authored newest-first. */
  it("is a prefix of the full list", () => {
    expect(RECENT_FEW.map((b) => b.id)).toEqual(BRIEFS.slice(0, RECENT_FEW.length).map((b) => b.id));
  });
});

describe("the configuration panel", () => {
  /* No row may render blank. Each is either a fact or the action that would
     make it one, and a row with neither is an empty value cell beside a label
     that promises something. */
  it("gives every row either a value or an action", () => {
    for (const row of CONFIG) {
      const hasValue = row.value !== undefined && row.value.length > 0;
      const hasAction = row.action !== undefined;
      expect(hasValue || hasAction).toBe(true);
      /* Never both: the value position holds one or the other, and a row
         carrying each would have to choose at render time. */
      expect(hasValue && hasAction).toBe(false);
    }
  });

  /* THE HONESTY CONSTRAINT. An affordance that reads as a control has to go
     somewhere, and "somewhere" means a route the hash router actually
     honours — not a `#` placeholder and not a dead path. */
  it("points every unset field at a real route", () => {
    const real = new Set(Object.values(ROUTES).map((r) => `#${r.path}`));
    const unset = CONFIG.filter((r) => r.action);
    expect(unset.length).toBeGreaterThan(0);
    for (const row of unset) {
      expect(real).toContain(row.action!.href);
    }
  });

  /* Phrased as the action, not as the absence. "Link ATS job" tells you what
     you would do; "None" or "—" tells you only that you cannot. */
  it("phrases unset fields as an action", () => {
    for (const row of CONFIG.filter((r) => r.action)) {
      expect(row.action!.label).toMatch(/^(Add|Link|Create|Connect|Invite|Set)\b/);
    }
  });

  it("labels every row uniquely", () => {
    const labels = CONFIG.map((r) => r.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("the channels row", () => {
  const channels = CONFIG.find((r) => r.marks);

  /* Only connected channels get a mark, which is what lets the marks carry no
     on/off encoding of their own: every logo present is a logo that works. */
  it("marks the connected channels and only those", () => {
    expect(channels).toBeDefined();
    expect(channels!.marks!.every((c) => c.connected)).toBe(true);
    expect(channels!.marks!.length).toBe(CHANNELS.filter((c) => c.connected).length);
  });

  /* The marks say what IS connected; the row's real question is whether
     anything is missing, which only the count can answer. */
  it("states the count beside them", () => {
    expect(channels!.value).toBe(`${channels!.marks!.length} of ${CHANNELS.length}`);
  });

  it("gives every channel a brand colour to render", () => {
    for (const c of CHANNELS) {
      expect(c.brand).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
