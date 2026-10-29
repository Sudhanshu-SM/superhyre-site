import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contentWords as fromAdding, hasInstruction as askedByAdding, MAX_FILES, MAX_READ, MAX_SHEETS, shortName } from "../adding";
import { ADDING_LIMITS, SHEET_ROLES, contentWords, hasInstruction, PLAN_UNUSED_WHY } from "../attachContract";
import { ROLE_CHOICES } from "../peopleSheet";

/**
 * What the console and the server both say about adding and about a sheet's plan is one definition, on the server's side
 * (superhyre-platform/packages/shared/src/attach-contract.ts). The console is its own repository and build and cannot reach that
 * package, so it holds the same file, byte for byte (src/attachContract.ts); this fails when the two differ, and the files that
 * used to keep a list of their own (the Adding types and limits, the stop words, the roles, a plan's shape) take it from there.
 */

const here = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const SHARED = resolve(__dirname, "..", "..", "..", "..", "superhyre-platform", "packages", "shared", "src", "attach-contract.ts");

describe("the console's copy of the shared contract", () => {
  it("is the server's file, byte for byte", () => {
    expect(here("attachContract.ts")).toBe(readFileSync(SHARED, "utf8"));
  });

  it("imports nothing, so it can be the same file on both sides", () => {
    expect(here("attachContract.ts")).not.toMatch(/^\s*(import|export)\b[^\n]*\bfrom\b/m);
  });
});

describe("what used to be written twice is taken from it", () => {
  it("the limits of an add are the contract's, and the longest name the server takes is the contract's too", () => {
    expect([MAX_FILES, MAX_SHEETS, MAX_READ]).toEqual([ADDING_LIMITS.files, ADDING_LIMITS.sheets, ADDING_LIMITS.read]);
    expect(shortName("n".repeat(ADDING_LIMITS.name + 30)).length).toBe(ADDING_LIMITS.name);
    expect(shortName("n".repeat(ADDING_LIMITS.name)).length).toBe(ADDING_LIMITS.name);
  });

  it("the words of adding are the contract's: the same function, so the console and the server ask the same way", () => {
    expect(askedByAdding).toBe(hasInstruction);
    expect(fromAdding).toBe(contentWords);
    expect(here("adding.ts")).not.toContain("quickly asap");
    expect(here("adding.ts")).not.toMatch(/new Set\(\s*\(?\s*"add these/);
  });

  it("the roles a column may be are the contract's, every one has words on the card, and the Add types are not typed again", () => {
    const offered = new Set(ROLE_CHOICES.map(([role]) => role));
    for (const role of SHEET_ROLES) expect(offered.has(role) || role === "date" || role === "addedBy", role).toBe(true);
    expect(here("peopleSheet.ts")).not.toContain('"workEmail" | "phone"');
    expect(here("api/agent.ts")).not.toMatch(/scope: "candidates" \| "roles"/);
    expect(here("attachments.ts")).not.toMatch(/AddScope = "candidates"/);
  });

  it("a plan the card keeps holds the reasons a plan keeps, and not the one the card alone is told", () => {
    expect([...PLAN_UNUSED_WHY]).toEqual(["no_column", "next_step", "protected", "unclear"]);
    expect(here("peopleSheet.ts")).toContain("export type ClientPlan = ClientPlanWire;");
  });
});
