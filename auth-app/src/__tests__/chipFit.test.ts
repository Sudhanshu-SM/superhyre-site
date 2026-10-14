import { describe, expect, it } from "vitest";
import type { CampaignRow } from "../campaignsData";
import { CHIP_PAD, chipLimit, compactLabel, fitChips, generalIdeas, ideasFromCampaigns, liveIdeas, pickChips } from "../recs";

/**
 * With a campaign in focus the chips read "Start a new c...", "Senior Data Engineer: find ..." and "What needs m..."
 * (1280, 1440 and 390 wide): the row is one line, so a chip was squeezed until it was cut mid-word. A chip is now
 * said whole: in fewer words when the usual ones do not fit, and there are fewer chips when even those do not.
 */

const row = (id: string, name: string, over: Partial<CampaignRow> = {}): CampaignRow => ({
  id, name, department: "", location: "", status: "active", owner: "A", team: [],
  funnel: { sourced: 56, shortlisted: 8, contacted: 3, replied: 1, interviews: 0, hired: 0 },
  trend: Array.from({ length: 14 }, () => 1), target: 1, agents: [], updatedAgo: "", createdAgo: "", ...over,
});

/** One px per 6.7 characters is what the page assumes without a canvas; the measure here is a little wider on purpose. */
const WIDE = (text: string) => text.length * 7.2;
const room = (labels: readonly string[]) => labels.reduce((n, l) => n + Math.ceil(WIDE(l)) + CHIP_PAD, 0) + 6 * (labels.length - 1) + 38;

describe("chips are said whole", () => {
  const focused = [row("c1", "Senior Data Engineer"), row("c2", "Product Designer")];
  // The set the tester saw with a campaign in focus: a general idea and the campaign's own two.
  const page = [
    ...generalIdeas({ canCreate: true, hasCampaigns: true }).filter((i) => i.id === "g-new"),
    ...ideasFromCampaigns([focused[0]!]),
  ];

  it("keeps the usual words, three chips on one line, where the row holds them", () => {
    const usual = page.map((i) => i.short ?? i.prompt);
    const wide = Math.ceil(room(usual)) + 4;
    const got = fitChips(page, wide, WIDE);
    expect(got.map((g) => g.label)).toEqual(usual);
  });

  it("says them in fewer words on a 1280 laptop row rather than cutting them", () => {
    const got = fitChips(page, 596, WIDE);
    expect(got).toHaveLength(3);
    const labels = got.map((g) => g.label);
    expect(labels).toEqual(page.map(compactLabel));
    expect(room(labels)).toBeLessThanOrEqual(596);
    // Whole words only: no ellipsis made by the row, and the campaign still tells the two chips apart.
    expect(labels.join("|")).not.toMatch(/\.\.\./);
    expect(new Set(labels).size).toBe(3);
  });

  it("drops to the chips that fit on a phone, each whole, never a stub", () => {
    const attention = generalIdeas({ canCreate: true, hasCampaigns: true });
    const got = fitChips(attention.slice(0, 3), 348, WIDE);
    expect(got.length).toBeGreaterThanOrEqual(1);
    expect(room(got.map((g) => g.label))).toBeLessThanOrEqual(348);
    for (const g of got) expect(g.label).not.toMatch(/…|\.\.\./);
  });

  it("shows the first chip in its fewest words when the row is narrower than any of them", () => {
    const got = fitChips(page, 120, WIDE);
    expect(got).toHaveLength(1);
    expect(got[0]!.label).toBe(compactLabel(page[0]!));
  });

  it("is the usual labels when the row has not been measured", () => {
    expect(fitChips(page, null).map((g) => g.label)).toEqual(page.map((i) => i.short ?? i.prompt));
    expect(fitChips(page, undefined)).toHaveLength(3);
  });

  it("gives every campaign chip a short form that still names the campaign", () => {
    const own = ideasFromCampaigns([focused[0]!, focused[1]!]);
    for (const idea of own) {
      expect(idea.compact).toBeTruthy();
      expect((idea.compact ?? "").length).toBeLessThan((idea.short ?? "").length);
    }
    expect(own.map((i) => i.compact)).toContain("Senior Data…: find more");
  });

  it("never offers a row more chips than the floor allows, nor fewer than one", () => {
    for (const w of [120, 300, 348, 470, 596, 640, 1000]) {
      const shown = fitChips(pickChips(liveIdeas(focused, { canCreate: true }), { visit: 1, width: w }), w, WIDE);
      expect(shown.length).toBeGreaterThanOrEqual(1);
      expect(shown.length).toBeLessThanOrEqual(chipLimit(w));
    }
  });
});
