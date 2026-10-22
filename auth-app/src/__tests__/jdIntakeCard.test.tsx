import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The add-roles card as it first opens, and where it is hosted: the New campaign button, the chat's import view and a
 * spreadsheet dropped in the composer. (The flow itself, read then ask then make, is the rules in jdIntake.ts,
 * tested there, and the server's reading, tested there.)
 */

vi.mock("../api/client", () => {
  class ApiError extends Error {}
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => null, messageOf: (e: Error) => e.message };
});

/* The workspace's stores read from the server; here there is nobody to ask, so they answer with nothing. */
vi.mock("../campaignStore", () => ({
  useClients: () => ({ clients: [] }),
  useTeam: () => [],
  memberName: () => undefined,
  addCampaignRow: async () => true,
  resolveCampaignId: (id: string) => id,
  saveClient: () => ({ id: "x" }),
  setCampaignClient: () => undefined,
}));

const { JdIntake } = await import("../JdIntake");
const { stashImportFiles, takeImportFiles } = await import("../importFiles");

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("the add-roles card", () => {
  const html = renderToStaticMarkup(<JdIntake onManual={() => undefined} onClose={() => undefined} />);

  it("starts from the job description: paste it, attach files or a spreadsheet, or give a Google Sheet's link", () => {
    expect(html).toContain("Paste a job description");
    expect(html).toContain("Attach files or a spreadsheet");
    expect(html).toContain("Or a Google Sheet");
    expect(html).toContain("docs.google.com/spreadsheets");
    expect(html).toMatch(/accept="[^"]*\.xlsx[^"]*\.csv/);
  });

  it("says what a sheet needs, and keeps the long form one click away", () => {
    expect(html).toContain("Anyone with the link can view");
    expect(html).toContain("Job description");
    expect(html).toContain("Fill in the details yourself");
  });

  it("cannot be started with nothing to read", () => {
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Read it/);
  });
});

describe("where it is hosted", () => {
  it("is what the New campaign button opens on a connected workspace, with the long form behind it", () => {
    const page = src("CampaignsPage.tsx");
    expect(page).toContain("<NewCampaignIntake");
    expect(page).toContain("open={LIVE ? manual : creating}");
    expect(src("NewCampaignIntake.tsx")).toContain("onManual={onManual}");
  });

  it("is the chat's import view, which takes the files a spreadsheet drop left for it", () => {
    expect(src("liveViews/index.tsx")).toContain('"campaign-import": lazy(() => import("./Import"))');
    expect(src("liveViews/Import.tsx")).toContain("takeImportFiles()");
    stashImportFiles([new File(["a"], "roles.xlsx")]);
    expect(takeImportFiles().map((f) => f.name)).toEqual(["roles.xlsx"]);
    expect(takeImportFiles()).toEqual([]);
  });

  it("is where a spreadsheet dropped in the composer goes, instead of being refused", () => {
    const agent = src("Agent.tsx");
    expect(agent).toContain("stashImportFiles(sheets)");
    expect(agent).toContain('sendMessage("Add these roles in bulk"');
  });
});
