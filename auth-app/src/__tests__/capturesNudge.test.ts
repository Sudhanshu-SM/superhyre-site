import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capturesLine, ownersLine } from "../CapturesNudge";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("people saved from LinkedIn who are on no campaign", () => {
  it("says how many fit the campaign and are not on its shortlist", () => {
    expect(capturesLine(1, "BD Executive")).toBe("1 person you saved from LinkedIn fits BD Executive and isn't on its shortlist yet.");
    expect(capturesLine(12, "BD Executive")).toBe("12 people you saved from LinkedIn fit BD Executive and aren't on its shortlist yet.");
  });

  it("says to an owner or admin whose they are, most first, and still reads plainly for one person's own", () => {
    expect(ownersLine([{ owner: "Archi Hayaran" }, { owner: "Archi Hayaran" }, { owner: "Punith Reddy" }, { owner: null }])).toBe("Archi 2, Punith 1");
    expect(ownersLine([])).toBe("");
    expect(capturesLine(30, "BD Executive", true, "Archi 30")).toBe("30 people saved from LinkedIn (Archi 30) fit BD Executive and aren't on its shortlist yet.");
    expect(capturesLine(1, "BD Executive", true)).toBe("1 person saved from LinkedIn fits BD Executive and isn't on its shortlist yet.");
  });

  it("is offered on the Shortlisted page, puts them on it as extension captures, and is quiet for someone who only follows", () => {
    expect(read("CampaignWorkspace.tsx")).toContain("<CapturesNudge campaignId={ctx.campaignId}");
    const src = read("CapturesNudge.tsx");
    expect(src).toContain('addToCampaign(campaignId, ids, "extension")');
    expect(src).toContain("if (!(may || manager) || away || people.length === 0) return null;");
    // The press is only for someone who may change the campaign; an admin who may not is told why.
    expect(src).toContain("{may && <button");
    expect(src).toContain("{!may && <p className=\"cn-nudge-n");
    expect(src).not.toMatch(/crust|salesql|apollo/i);
  });
});
