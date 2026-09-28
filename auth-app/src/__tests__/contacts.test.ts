import { describe, expect, it } from "vitest";
import { CONTACTS, EMPTY_FILTERS, activeFilterCount, matches, sortContacts } from "../contacts";

describe("contacts", () => {
  it("is stable across loads", () => expect(CONTACTS.map((c) => c.name).slice(0, 3)).toEqual([...CONTACTS].map((c) => c.name).slice(0, 3)));
  it("has unique ids and names", () => {
    expect(new Set(CONTACTS.map((c) => c.id)).size).toBe(CONTACTS.length);
    expect(new Set(CONTACTS.map((c) => c.name)).size).toBe(CONTACTS.length);
  });
  it("filters by contact details", () => {
    const f = { ...EMPTY_FILTERS, contact: ["phone", "verified"] as const };
    expect(CONTACTS.filter((c) => matches(c, f, "")).every((c) => c.phone && c.email?.verified)).toBe(true);
    expect(activeFilterCount(f)).toBe(2);
  });
  it("searches across name, company and skills", () => {
    const c = CONTACTS[0]!;
    expect(matches(c, EMPTY_FILTERS, c.company.toLowerCase())).toBe(true);
    expect(matches(c, EMPTY_FILTERS, `${c.name.split(" ")[0]} ${c.skills[0]}`)).toBe(true);
    expect(matches(c, EMPTY_FILTERS, "zzzz")).toBe(false);
  });
  it("sorts by experience", () => {
    const ys = sortContacts(CONTACTS, "experience").map((c) => c.years);
    expect(ys).toEqual([...ys].sort((a, b) => b - a));
  });
});
