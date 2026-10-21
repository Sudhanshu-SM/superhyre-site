import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExportRow } from "../api/exports";
import { shortlistTable } from "../exportTable";
import { tabName, toXLSX } from "../xlsx";

/**
 * An Excel file made from a list is named for the list, not for the first export that was ever made, and its Tier
 * column says Strong, Good or Partial fit.
 */

const row = (tier: string | null): ExportRow => ({ name: "Asha Verma", tier } as unknown as ExportRow);
const text = async (b: Blob) => new TextDecoder("latin1").decode(new Uint8Array(await b.arrayBuffer()));

describe("the worksheet's tab", () => {
  it("is Shortlist or Pipeline for those lists, and Responses only for a form's answers", async () => {
    expect(shortlistTable([row("A")], ["name", "tier"]).name).toBe("Shortlist");
    expect(shortlistTable([row("A")], ["name", "tier"], "pipeline").name).toBe("Pipeline");
    const sheet = await text(toXLSX(shortlistTable([row("A")], ["name", "tier"], "pipeline")));
    expect(sheet).toContain('<sheet name="Pipeline"');
    expect(sheet).not.toContain('name="Responses"');
    expect(await text(toXLSX({ headers: ["a"], rows: [["b"]], widths: [8] }))).toContain('<sheet name="Responses"');
  });

  it("is a name Excel accepts", () => {
    expect(tabName("Shortlist: Senior/Backend [A]?")).toBe("Shortlist Senior Backend A");
    expect(tabName("x".repeat(60))).toHaveLength(31);
    expect(tabName(undefined)).toBe("Responses");
  });
});

describe("the Tier column", () => {
  it("says the fit in words, never the letter", () => {
    const t = shortlistTable([row("A"), row("B"), row("C"), row(null)], ["name", "tier"]);
    const at = t.headers.indexOf("Tier");
    expect(t.rows.map((r) => r[at])).toEqual(["Strong fit", "Good fit", "Partial fit", ""]);
  });

  it("the server writes the same words, in the list and in the file: the one resolved state, not the stored letter", () => {
    const server = join(__dirname, "..", "..", "..", "..", "superhyre-platform", "server", "src", "modules");
    const rows = readFileSync(join(server, "sheets", "rows.ts"), "utf8");
    const exported = readFileSync(join(server, "exports", "service.ts"), "utf8");
    expect(exported).toContain("displaysFor(");
    expect(rows).toContain("tier: r.tier,");
    expect(rows).toContain("tier: r.display.label,");
    expect(rows).not.toContain("TIER_WORDS[");
  });
});

describe("the pipeline's fit words", () => {
  it("are Strong, Good and Partial fit, the same as the sheets and the chat", () => {
    const board = readFileSync(join(__dirname, "..", "CampaignWorkspace.tsx"), "utf8");
    expect(board).toContain("label: TIER_LABEL.A");
    expect(board).not.toMatch(/label: "(Strong|Good|Partial) match"/);
  });
});
