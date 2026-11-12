import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DEFAULT_SOURCE_MODE, SOURCES, SOURCE_MODES, sourceModeOf } from "../sources";
import { SourcesChip, SourcesList } from "../SourcesChip";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("where searches look", () => {
  it("reads the mode from a campaign's setup, and anything else as external, the default", () => {
    expect(sourceModeOf({ sources: "database" })).toBe("database");
    expect(sourceModeOf({ sources: "external" })).toBe("external");
    expect(sourceModeOf({ sources: "both" })).toBe("both");
    expect(sourceModeOf({ sources: "apollo" })).toBe("apollo");
    for (const odd of [undefined, null, {}, { sources: "crustdata" }, { sources: 3 }, "database"]) expect(sourceModeOf(odd)).toBe("external");
  });

  it("offers DB-1 and DB-2 as separate sources, the default first, then our DB with DB-1, and our DB only", () => {
    expect(SOURCE_MODES).toEqual(["external", "apollo", "both", "database"]);
    expect(SOURCE_MODES[0]).toBe(DEFAULT_SOURCE_MODE);
    expect(SOURCES.external.label).toBe("DB-1");
    expect(SOURCES.apollo.label).toBe("DB-2");
    expect(SOURCES.both.label).toBe("Our DB + DB-1");
    expect(SOURCES.database.label).toBe("Our DB only");
  });

  it("never names a provider to the person: it says DB-1 and DB-2", () => {
    for (const file of ["SourcesChip.tsx", "sources.css"]) expect(read(file)).not.toMatch(/crust|apollo/i);
    for (const s of Object.values(SOURCES)) expect(`${s.label} ${s.hint} ${s.says}`).not.toMatch(/crust|apollo/i);
  });

  it("shows DB-1 on the chip when nobody has chosen, and starts a new campaign's search on it", () => {
    const chip = renderToStaticMarkup(createElement(SourcesChip, { value: sourceModeOf(undefined), onChange: () => {} }));
    expect(chip).toContain("DB-1");
    expect(read("Agent.tsx")).toContain("useState<SourceMode>(DEFAULT_SOURCE_MODE)");
  });

  it("shows what it is set to on the chip, and ticks that choice in the menu", () => {
    const chip = renderToStaticMarkup(createElement(SourcesChip, { value: "apollo", onChange: () => {} }));
    expect(chip).toContain("DB-2");
    const list = renderToStaticMarkup(createElement(SourcesList, { value: "database", onPick: () => {} }));
    expect(list.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(list).toMatch(/aria-checked="true"[^>]*class="src-opt is-on"/);
    expect(list).toContain("DB-1");
    expect(list).toContain("DB-2");
  });

  it("is on the composer only where the person may change it: a chat about no campaign, or a campaign they can change", () => {
    const src = read("Agent.tsx");
    expect(src).toContain("{...(LIVE && (!focused || mayChange) ? { sources: { value: sourcesValue, onChange: changeSources } } : {})}");
  });
});
