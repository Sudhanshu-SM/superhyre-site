import { describe, expect, it } from "vitest";
import type { RoleSpec } from "../api/agent";
import { diffFilters, filtersLine, seniorityOf, summariseFilters, valuesFromSetup, valuesFromSpec, withSaved } from "../liveFilters";
import { searchRows } from "../railConfig";

const spec: RoleSpec = {
  title: "Backend Engineer", seniority: "Senior", yearsMin: 5, yearsMax: 9, locations: ["Bengaluru"], remoteOk: false,
  requirements: [
    { id: "r1", kind: "skill", text: "Go", importance: "knockout", weight: 1, skill: "Go" },
    { id: "r2", kind: "skill", text: "Kafka", importance: "nice", weight: 0.3, skill: "Kafka" },
  ],
  avoid: [],
};

describe("the campaign's filters, as the dialog shows them", () => {
  it("reads the role spec the way the search does", () => {
    expect(valuesFromSpec(spec)).toEqual({
      seniority: ["Senior"], cities: ["Bengaluru"], years: [5, 9], must: ["Go"], nice: ["Kafka"],
    });
    expect(valuesFromSpec({ ...spec, remoteOk: true }).cities).toBeUndefined();
  });

  it("falls back to the brief before there is a spec", () => {
    expect(valuesFromSetup({ seniority: "Staff", locations: ["Pune"], expMin: 4, mustHave: ["Go"] })).toEqual({
      seniority: ["Senior"], cities: ["Pune"], years: [4, 25], must: ["Go"],
    });
    expect(valuesFromSetup(undefined)).toEqual({});
  });

  it("puts what the recruiter saved over the spec, and an empty value takes the spec's away", () => {
    const merged = withSaved(valuesFromSpec(spec), { cities: ["Pune"], must: [], current: ["Razorpay"] });
    expect(merged).toMatchObject({ cities: ["Pune"], years: [5, 9], current: ["Razorpay"] });
    expect(merged.must).toBeUndefined();
  });

  it("saves only what differs from the spec, so a new job description still moves the rest", () => {
    const base = valuesFromSpec(spec);
    const dialog = { ...base, cities: ["Pune"], excludeCo: ["Infosys"], must: [] as string[] };
    expect(diffFilters(base, dialog)).toEqual({ cities: ["Pune"], excludeCo: ["Infosys"], must: [] });
    expect(diffFilters(base, base)).toEqual({});
  });

  it("says it in a few words", () => {
    expect(summariseFilters({ cities: ["Pune"], years: [4, 8], must: ["Go", "Kafka"], excludeCo: ["Infosys"] })).toBe("Pune, 4 to 8 years, 2 more");
    expect(summariseFilters({ years: [4, 25] })).toBe("4+ years");
    expect(summariseFilters({ cities: ["Pune", "Mumbai"] })).toBe("Pune +1");
    expect(summariseFilters({})).toBeNull();
    expect(seniorityOf("Principal Engineer")).toBe("Senior");
    expect(seniorityOf("")).toBeNull();
  });
});

describe("the Configuration panel's job description and filters rows", () => {
  const open = { onJd: () => {}, onFilters: () => {} };
  it("offers the next step to someone on the campaign", () => {
    const [jd, filters] = searchRows({ jd: false, filters: null, mayChange: true, ...open });
    expect(jd).toMatchObject({ label: "Job description", act: { label: "Add job description" } });
    expect(filters).toMatchObject({ label: "Filters", act: { label: "Set up filters" } });
    const [jd2, filters2] = searchRows({ jd: true, filters: "Pune, 4 to 8 years, 2 more", mayChange: true, ...open });
    expect(jd2).toMatchObject({ value: "Added", notes: [{ text: "Replace" }] });
    expect(filters2).toMatchObject({ value: "Pune, 4 to 8 years, 2 more", notes: [{ text: "Edit" }] });
  });

  it("shows the values and no actions to someone who only follows the campaign", () => {
    const [jd, filters] = searchRows({ jd: false, filters: null, mayChange: false, ...open });
    expect(jd).toEqual({ label: "Job description", value: "None yet" });
    expect(filters).toEqual({ label: "Filters", value: "None set" });
    const [jd2] = searchRows({ jd: true, filters: "Pune", mayChange: false, ...open });
    expect(jd2?.notes?.[0]?.text).toBe("View");
    expect(jd2?.act).toBeUndefined();
  });

  it("holds its place while the description is still arriving", () => {
    expect(searchRows({ jd: null, filters: null, mayChange: true, ...open })[0]).toEqual({ label: "Job description", pending: true });
  });
});

describe("the filters for the next campaign", () => {
  it("are one short line the agent reads with the message", () => {
    expect(filtersLine({ cities: ["Pune"], years: [4, 8], must: ["Go", "Kafka"], excludeCo: ["Infosys"] })).toBe(
      "Search filters: Cities Pune; Total experience 4 to 8 yrs; Must have Go, Kafka; Exclude companies Infosys.",
    );
    expect(filtersLine({ years: [4, 25], relocate: true })).toBe("Search filters: Total experience 4+ yrs; Open to relocating.");
    expect(filtersLine({})).toBeNull();
    expect((filtersLine({ must: Array.from({ length: 40 }, (_, i) => `Skill number ${i}`) }) ?? "").length).toBeLessThanOrEqual(400);
  });

  it("show in the All campaigns panel as prompts for the next campaign", () => {
    const open = { onJd: () => {}, onFilters: () => {}, forNext: true };
    const [jd, filters] = searchRows({ jd: false, filters: null, mayChange: true, ...open });
    expect(jd).toMatchObject({ label: "Job description", act: { label: "Add one for the next campaign" } });
    expect(filters).toMatchObject({ label: "Filters", act: { label: "Set up for the next campaign" } });
    const [jd2, filters2] = searchRows({ jd: true, filters: "Pune, 4 to 8 years", mayChange: true, ...open });
    expect(jd2).toMatchObject({ value: "Ready for the next campaign" });
    expect(filters2).toMatchObject({ value: "Pune, 4 to 8 years" });
  });
});
