import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SOURCES, SOURCE_MODES, sourceModeOf } from "../sources";
import { SourcesChip, SourcesList } from "../SourcesChip";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("where searches look", () => {
  it("reads the mode from a campaign's setup, and anything else as both", () => {
    expect(sourceModeOf({ sources: "database" })).toBe("database");
    expect(sourceModeOf({ sources: "external" })).toBe("external");
    for (const odd of [undefined, null, {}, { sources: "crustdata" }, { sources: 3 }, "database"]) expect(sourceModeOf(odd)).toBe("both");
  });

  it("offers the three choices, in the order a person thinks of them, and says each as a place", () => {
    expect(SOURCE_MODES).toEqual(["database", "both", "external"]);
    expect(SOURCES.database.label).toBe("DB only");
    expect(SOURCES.both.label).toBe("DB + external");
    expect(SOURCES.external.label).toBe("External only");
  });

  it("never names the provider: it says external", () => {
    for (const file of ["sources.ts", "SourcesChip.tsx", "sources.css"]) expect(read(file)).not.toMatch(/crust/i);
    expect(JSON.stringify(SOURCES)).not.toMatch(/crust/i);
  });

  it("shows what it is set to on the chip, and ticks that choice in the menu", () => {
    const chip = renderToStaticMarkup(createElement(SourcesChip, { value: "external", onChange: () => {} }));
    expect(chip).toContain("External only");
    expect(chip).toContain("external sources only");
    const list = renderToStaticMarkup(createElement(SourcesList, { value: "database", onPick: () => {} }));
    expect(list.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(list).toMatch(/aria-checked="true"[^>]*class="src-opt is-on"/);
    expect(list).toContain("DB + external");
  });

  it("is on the composer only where the person may change it: a chat about no campaign, or a campaign they can change", () => {
    const src = read("Agent.tsx");
    expect(src).toContain("{...(LIVE && (!focused || mayChange) ? { sources: { value: sourcesValue, onChange: changeSources } } : {})}");
  });
});
