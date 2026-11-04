import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isFirstMessageTitle } from "../chatTitle";

describe("the chat's header name", () => {
  it("is not the first message repeated: the default name, cut or whole, is left out", () => {
    const first = "Here is the job description for Staff Platform Engineer. Start a new campaign from it.";
    expect(isFirstMessageTitle("Here is the job description for Staff Platform Engineer", first)).toBe(true);
    expect(isFirstMessageTitle("Here is the job description for Staff Platform Engineer.", "Here is the job description for Staff Platform Engineer.")).toBe(true);
    expect(isFirstMessageTitle("here is the JOB description", first)).toBe(true);
  });
  it("is shown when somebody chose it, and when there is nothing to compare", () => {
    expect(isFirstMessageTitle("Kestrel platform hire", "Here is the job description for Staff Platform Engineer.")).toBe(false);
    expect(isFirstMessageTitle("Kestrel platform hire", undefined)).toBe(false);
    expect(isFirstMessageTitle("", "Anything")).toBe(false);
  });
  it("is decided by the page from the chat's first message, and waits for it", () => {
    const page = readFileSync(join(__dirname, "..", "Agent.tsx"), "utf8");
    expect(page).toContain("live.turns.length > 0 && !isFirstMessageTitle(openChatRow.title, live.turns[0]?.said)");
  });
});
