import { describe, expect, it } from "vitest";
import { missedMustHaves, pipelineFor, responsesFor } from "../campaign";
import { filterResponses, responseTable, slug, toCSV, toTSV, toXLSX } from "../exportTable";
import { formsFor } from "../campaign";
import { col, crc32 } from "../xlsx";

const t = (rows: (string | number | null)[][]) => ({ headers: ["A", "B"], rows, widths: [10, 10] });

describe("export", () => {
  it("TSV (the copy button) guards formulas like CSV does, and leaves numbers alone", () => {
    const s = toTSV(t([['=HYPERLINK("http://evil.example","x")', 42], ["+91 98765", "@cmd"]]));
    const lines = s.split("\n");
    expect(lines[1]).toBe(`'=HYPERLINK("http://evil.example","x")\t42`);
    expect(lines[2]).toBe("'+91 98765\t'@cmd");
  });

  it("CSV starts with a BOM and quotes what needs quoting", () => {
    const s = toCSV(t([['a"b', "line\nbreak"]]));
    expect(s.startsWith("﻿")).toBe(true);
    expect(s).toContain('"a""b"');
    expect(s).toContain('"line\nbreak"');
    expect(s.endsWith("\r\n")).toBe(true);
  });
  it("guards formula injection on strings only", () => {
    const s = toCSV(t([["=SUM(A1)", -3]]));
    expect(s).toContain("'=SUM(A1)");
    expect(s).toContain(",-3\r\n");
  });
  it("TSV keeps tabs out of cells", () => {
    const s = toTSV(t([["a\tb", "c\nd"]]));
    expect(s.split("\n")[1]!.split("\t")).toEqual(["a b", "c d"]);
  });
  it("crc32 and column letters", () => {
    expect(crc32(new TextEncoder().encode("abc"))).toBe(0x352441c2);
    expect([col(1), col(26), col(27), col(52)]).toEqual(["A", "Z", "AA", "AZ"]);
  });
  it("writes a zip", async () => {
    const b = toXLSX(t([["x", 1]]));
    const u = new Uint8Array(await b.arrayBuffer());
    expect(String.fromCharCode(u[0]!, u[1]!)).toBe("PK");
  });
  it("the missed filter exports only responses that missed a must-have", () => {
    const form = formsFor("backend-snr")[0]!;
    const all = responsesFor(form);
    const rows = filterResponses(form, all, { must: "missed", answer: null, search: "" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => missedMustHaves(form, r.answers).length > 0)).toBe(true);
    const people = new Map(pipelineFor("backend-snr").map((p) => [p.id, p]));
    const table = responseTable(form, rows, people);
    expect(table.rows).toHaveLength(rows.length);
    expect(table.headers).toContain("Must-haves");
    expect(table.rows.every((r) => String(r[table.headers.indexOf("Must-haves")]).startsWith("Missed:"))).toBe(true);
    expect(slug("Senior Backend screening")).toBe("senior-backend-screening");
  });
});
