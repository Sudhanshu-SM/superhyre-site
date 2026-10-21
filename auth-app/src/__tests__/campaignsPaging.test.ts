import { describe, expect, it } from "vitest";
import { arrangeCampaigns, CAMPAIGNS_PER_PAGE, clampOffset } from "../CampaignsPage";
import type { CampaignRow } from "../campaignsData";

const row = (i: number, over: Partial<CampaignRow> = {}): CampaignRow => ({
  id: `c${i}`, name: `Role ${String(i).padStart(2, "0")}`, department: "Eng", location: "Remote", owner: "Ann", status: "active",
  updatedAgo: `${i}h`, target: 2, funnel: { hired: 0 }, ...over,
}) as unknown as CampaignRow;

describe("campaigns paging", () => {
  it("cuts the arranged rows into pages", () => {
    const rows = Array.from({ length: 23 }, (_, i) => row(i));
    const all = arrangeCampaigns(rows, "all", "", "name");
    expect(all).toHaveLength(23);
    expect(all.slice(20, 20 + CAMPAIGNS_PER_PAGE)).toHaveLength(3);
  });

  it("filters before it pages, and puts a fresh copy first", () => {
    const rows = [row(1), row(2, { status: "closed" }), row(3)];
    expect(arrangeCampaigns(rows, "closed", "", "name").map((r) => r.id)).toEqual(["c2"]);
    expect(arrangeCampaigns(rows, "all", "role 03", "name").map((r) => r.id)).toEqual(["c3"]);
    expect(arrangeCampaigns(rows, "all", "", "name", "c3")[0]?.id).toBe("c3");
  });

  it("clamps an offset left past the end when the list shrinks", () => {
    expect(clampOffset(30, 23, 10)).toBe(20);
    expect(clampOffset(20, 10, 10)).toBe(0);
    expect(clampOffset(10, 11, 10)).toBe(10);
    expect(clampOffset(5, 0, 10)).toBe(0);
    // A new page size lands on the page that holds the first row that was on screen.
    expect(clampOffset(30, 60, 20)).toBe(20);
    expect(clampOffset(30, 60)).toBe(30);
  });
});
