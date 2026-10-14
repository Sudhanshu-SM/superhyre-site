import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BASIC_ORDER, advancedSetCount, basicCategories, isBasic, openAdvanced } from "../filters";

// The dialog's own shell (a portal) is not what is under test.
vi.mock("../ui", () => ({
  Dialog: ({ open, children }: { open: boolean; children: unknown }) => (open ? <div role="dialog">{children as never}</div> : null),
}));
const { FiltersDialog } = await import("../FiltersDialog");

const html = (initial: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <FiltersDialog open onClose={() => {}} initial={initial as never} prefilled={[]} onApply={() => {}} live {...extra} />,
  );

describe("the filters that come first", () => {
  it("are where, which job, how many years, which skills, which industry", () => {
    expect([...BASIC_ORDER]).toEqual(["cities", "titles", "years", "must", "industry"]);
    const cats = basicCategories();
    expect(cats.map((c) => c.id)).toEqual(["location", "role", "experience", "skills", "company"]);
    expect(cats.map((c) => c.filters.map((f) => f.id))).toEqual([["cities"], ["titles"], ["years"], ["must"], ["industry"]]);
    expect(isBasic("years")).toBe(true);
    expect(isBasic("ctc")).toBe(false);
  });

  it("leave what is set beyond them in view, whole group by group, and count it", () => {
    const set = { cities: ["Pune"], workMode: ["Remote"], excludeCo: ["Infosys"] };
    expect(advancedSetCount(set)).toBe(2);
    expect(openAdvanced(set).map((c) => c.id)).toEqual(["location", "company"]);
    expect(openAdvanced(set)[0]!.filters.every((f) => !isBasic(f.id))).toBe(true);
    expect(advancedSetCount({ cities: ["Pune"], years: [4, 8] })).toBe(0);
    expect(openAdvanced({})).toEqual([]);
  });
});

describe("the filters dialog", () => {
  it("opens on the basics alone, with a way to the rest", () => {
    const out = html({});
    for (const label of ["Cities", "Job titles", "Total experience", "Must have", "Industry"]) expect(out).toContain(label);
    expect(out).toContain("View more filters");
    expect(out).not.toContain("View more filters (");
    for (const hidden of ["Current CTC", "Notice period", "Has public code", "Graduated", "Exclude companies"]) expect(out).not.toContain(hidden);
    // the list of groups on the left belongs to the full catalogue
    expect(out).not.toContain("fd-nav");
    // order: where, job, years, skills, industry
    const at = (s: string) => out.indexOf(s);
    expect(at("Cities")).toBeLessThan(at("Job titles"));
    expect(at("Job titles")).toBeLessThan(at("Total experience"));
    expect(at("Total experience")).toBeLessThan(at("Must have"));
    expect(at("Must have")).toBeLessThan(at("Industry"));
  });

  it("shows what is set beyond the basics at once and counts it on the button", () => {
    const out = html({ cities: ["Pune"], excludeCo: ["Infosys"], github: true });
    expect(out).toContain("View more filters (2 set)");
    expect(out).toContain("Exclude companies");
    expect(out).toContain("Has public code");
    expect(out).not.toContain("Current CTC");
  });

  it("keeps the same actions and says how many are set", () => {
    const out = html({ cities: ["Pune"], years: [4, 8] });
    expect(out).toContain("Save filters");
    expect(out).toContain("Clear all");
    expect(out).toContain("2 filters set");
  });
});
