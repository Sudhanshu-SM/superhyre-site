import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listPath } from "../api/candidates";
import { modeLabel } from "../ContactsFetch";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("getting everyone's contact details from the Shortlisted table", () => {
  it("says plainly what each choice gets: all emails, all phone numbers, or everything", () => {
    expect(modeLabel("email", true)).toBe("Get all emails");
    expect(modeLabel("phone", true)).toBe("Get all phone numbers");
    expect(modeLabel("both", true)).toBe("Get everything (emails and phones)");
    expect(modeLabel("email", false)).toBe("Get emails");
  });

  it("offers Select all beside the menu, picking everyone listed on every page", () => {
    const src = read("CampaignWorkspace.tsx");
    expect(src).toContain("Select all {rows.length}");
    expect(src).toContain("setPicked(new Set(rows.map((p) => p.id)))");
  });

  it("reads the values of the people hired too: the list leaves them out unless it is asked for the Hired stage", () => {
    expect(listPath({ campaignId: "c1", sort: "recent", limit: 100, stage: "hired" })).toContain("stage=hired");
    expect(listPath({ campaignId: "c1", sort: "recent", limit: 100 })).not.toContain("stage=");
    expect(read("contactValues.ts")).toContain("readStage(campaignId, true, next)");
  });

  it("draws a cell with nothing fetched as the button alone, with no \"Not fetched\" beside it", () => {
    const src = read("ContactsFetch.tsx");
    expect(src).toContain('cell.state === "not_fetched" && cell.get');
    expect(src).toContain('kind === "email" ? "Get email" : "Get phone"');
    // The words are no longer drawn for that cell: a dash where it cannot be asked for, "No profile" where there is none.
    expect(src).not.toMatch(/<span>\{cell\.words\}<\/span>\s*\{cell\.get/);
  });
});
