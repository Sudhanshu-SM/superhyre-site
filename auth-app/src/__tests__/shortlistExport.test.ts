import { describe, expect, it } from "vitest";
import { shortlistName, shortlistTable, tookLabel } from "../exportTable";

describe("shortlistTable", () => {
  it("keeps the plan's column order, and leaves missing contacts empty", () => {
    const t = shortlistTable([
      { id: "cc1", candidateId: "c1", phone: null, name: "Asha Verma", email: "asha@x.in", addedOn: "2026-10-04T08:00:00.000Z", experienceYears: 7 },
    ], ["phone", "name", "email", "experienceYears", "addedOn"]);
    expect(t.headers).toEqual(["Name", "Experience (yrs)", "Email", "Phone", "Added on"]);
    expect(t.rows[0]).toEqual(["Asha Verma", 7, "asha@x.in", "", "2026-10-04"]);
  });
  it("names the file after the campaign", () => {
    expect(shortlistName("Backend Engineers", "shortlist", "xlsx", new Date(2026, 9, 4))).toBe("backend-engineers-shortlist-2026-10-04.xlsx");
  });
});

describe("tookLabel", () => {
  it("shows a dash for an untimed response", () => {
    expect(tookLabel(95)).toBe("1m 35s");
    expect(tookLabel(Number.NaN)).toBe("—");
  });
});
