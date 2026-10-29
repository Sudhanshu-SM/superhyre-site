import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { menuFor } from "../adding";

/**
 * The job description dialog beside the composer takes one description for the next campaign, by upload or by paste. Several of them,
 * or a sheet of roles, are the paperclip's (Job descriptions, with a campaign in focus More roles): a second door to the roles import
 * from this dialog was unkeyed, sent a fixed phrase, and was not scoped, so it is gone.
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("the job description dialog", () => {
  const dialog = src("JdDialog.tsx");

  it("has no way to hand many files, a sheet or a link on to the roles import", () => {
    for (const gone of ["onMany", "ACCEPT_MANY", "takeMany", "isSheetFile", "SheetNeeds", "sheetLinkIn", "Google Sheet", "pick several", "Upload files", "Drop the JDs here", "Read the sheet"]) {
      expect(dialog, gone).not.toContain(gone);
    }
    // One file at a time, for one description.
    expect(dialog).not.toContain("multiple");
    expect(dialog).toContain('(["upload", "paste"] as const)');
    expect(dialog).toContain("Upload a file");
    expect(dialog).toContain("Drop the JD here, or browse");
  });

  it("is not given one by the composer, and sends nothing that opens the roles import", () => {
    const agent = src("Agent.tsx");
    expect(agent).not.toContain("onMany");
    expect(agent).not.toContain('sendMessage("Add roles in bulk"');
    // The one place the fixed phrase is still used is a pasted list of job descriptions with no file chosen, which has no chip to ask.
    expect(agent.match(/"Add roles in bulk"/g)).toHaveLength(1);
  });

  it("leaves the paperclip as the door to many descriptions and to a sheet of roles, in every chat", () => {
    for (const ctx of [
      { campaign: null, mayChange: false, closed: false, canStart: true, count: 0 },
      { campaign: "Senior Backend", mayChange: true, closed: false, canStart: true, count: 0 },
    ]) {
      const roles = menuFor(ctx).find((r) => r.scope === "roles");
      expect(roles?.multiple).toBe(true);
      expect(roles?.accept.split(",")).toEqual(expect.arrayContaining([".xlsx", ".csv", ".pdf", ".docx"]));
      expect(roles?.disabled).toBeUndefined();
    }
  });
});

describe("the paperclip's comment in the composer's styles", () => {
  it("says it opens the menu of what to add, and that the picker follows the choice, not that it opens the picker", () => {
    const css = src("composer.css");
    expect(css).toContain("a quiet icon that opens the menu of what to add (the picker follows the choice)");
    expect(css).not.toContain("a quiet icon that opens the file picker");
  });
});
