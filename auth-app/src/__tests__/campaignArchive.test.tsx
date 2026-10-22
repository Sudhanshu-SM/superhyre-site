import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { type ApiCampaign, rowFromApi } from "../api/campaigns";
import { CAMPAIGN_ROWS, type CampaignRow } from "../campaignsData";
import { archiveCampaign, campaignRowsNow, deleteCampaign, resetCampaignRows } from "../campaignStore";
import { campaignsEmpty } from "../campaignsEmpty";
import { arrangeCampaigns, readRemembered } from "../CampaignsPage";

/**
 * Archive and delete on the Campaigns page: Active is what opens, a closed campaign can be put away (and brought
 * back), and deleting a closed one removes it. In the demo (no server) the store moves the rows the same way.
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const closed = (): CampaignRow => (CAMPAIGN_ROWS.find((r) => r.status === "closed") ?? CAMPAIGN_ROWS[0]) as CampaignRow;

beforeEach(() => resetCampaignRows());

describe("the Campaigns tabs", () => {
  it("open on Active, then Closed, All and Archived", () => {
    expect(readRemembered({}).filter).toBe("active");
    const labels = [...src("CampaignsPage.tsx").matchAll(/\{ id: "(\w+)", label: "(\w+)" \}/g)].map((m) => m[2]);
    expect(labels).toEqual(["Active", "Closed", "All", "Archived"]);
  });

  it("show every archived row on the Archived tab whatever it says about its status", () => {
    const rows = CAMPAIGN_ROWS.slice(0, 3);
    expect(arrangeCampaigns(rows, "archived", "", "name")).toHaveLength(3);
    expect(arrangeCampaigns(rows, "active", "", "name").every((r) => r.status === "active")).toBe(true);
  });

  it("say what an empty Archived tab means without calling it a first campaign", () => {
    const e = campaignsEmpty({ filter: "archived", q: "", total: 0, mayCreate: true });
    expect(e.kind).toBe("none-yet");
    expect(e.message).toMatch(/Archive a closed campaign/);
  });
});

describe("a row from the server", () => {
  const api = (over: Partial<ApiCampaign>): ApiCampaign =>
    ({
      id: "c1", name: "Backend", status: "closed", department: null, location: null, priority: "normal", visibility: "team",
      client: null, owner: null, team: [], funnel: { sourced: 0, shortlisted: 0, outreach: 0, interviewing: 0, hired: 0, passed: 0 },
      hired: 0, target: 1, agents: 0, openedAt: null, closedAt: null, createdAt: "2026-10-01", updatedAt: "2026-10-02", ...over,
    }) as unknown as ApiCampaign;

  it("is archived when the server says when, and not otherwise", () => {
    expect(rowFromApi(api({ archivedAt: "2026-10-20T10:00:00Z" })).archived).toBe(true);
    expect(rowFromApi(api({ archivedAt: null })).archived).toBeUndefined();
    expect(rowFromApi(api({})).archived).toBeUndefined();
  });
});

describe("the store, in the demo", () => {
  it("puts a campaign away and brings it back", async () => {
    const row = closed();
    expect(campaignRowsNow().some((r) => r.id === row.id)).toBe(true);
    expect(await archiveCampaign(row.id, true)).toBe(true);
    expect(campaignRowsNow().some((r) => r.id === row.id)).toBe(false);
    expect(await archiveCampaign(row.id, false)).toBe(true);
    expect(campaignRowsNow().some((r) => r.id === row.id)).toBe(true);
  });

  it("deletes a campaign", async () => {
    const row = closed();
    expect(await deleteCampaign(row.id)).toBe(true);
    expect(campaignRowsNow().some((r) => r.id === row.id)).toBe(false);
  });
});

describe("the row menu", () => {
  const page = src("CampaignsPage.tsx");
  it("offers Archive and Delete only on a closed campaign, and Bring back on an archived one, to whoever may close it", () => {
    expect(page).toContain('{mayClose && status === "closed" && !archived && item("Archive", onArchive)}');
    expect(page).toContain('{mayClose && archived && item("Bring back", onUnarchive)}');
    expect(page).toContain('{mayClose && status === "closed" && item("Delete campaign", onDelete, "danger")}');
  });

  it("asks for the campaign's name before deleting, and Undo is offered after archiving", () => {
    expect(src("DeleteCampaignDialog.tsx")).toContain("Type the campaign");
    expect(src("DeleteCampaignDialog.tsx")).toContain("disabled={!matches}");
    expect(page).toMatch(/Undo/);
  });
});
