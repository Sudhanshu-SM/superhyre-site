import { describe, expect, it } from "vitest";
import { isAboutExperience, similarToReject } from "../sourcedSimilar";

const people = [
  { id: "a", totalYears: 14 },
  { id: "b", totalYears: 12 },
  { id: "c", totalYears: 9 },
  { id: "d", totalYears: 15 },
  { id: "e", totalYears: 11 },
];

describe("rejecting for experience past the role's ceiling", () => {
  it("offers the others still to review who are past it too", () => {
    expect(similarToReject(people, {}, 10, people[0], "Experience")).toEqual(["b", "d", "e"]);
  });
  it("leaves out anyone already decided", () => {
    expect(similarToReject(people, { b: "shortlisted", a: "rejected" }, 10, people[0], "Experience: too senior")).toEqual(["d", "e"]);
  });
  it("offers nothing when the reason is not experience, there is no ceiling, or they were within it", () => {
    expect(similarToReject(people, {}, 10, people[0], "Location")).toEqual([]);
    expect(similarToReject(people, {}, null, people[0], "Experience")).toEqual([]);
    expect(similarToReject(people, {}, 10, people[2], "Experience")).toEqual([]);
    expect(similarToReject(people, {}, 10, undefined, "Experience")).toEqual([]);
  });
  it("reads experience in the reason", () => {
    expect(isAboutExperience("Experience")).toBe(true);
    expect(isAboutExperience("Wants a more senior role")).toBe(true);
    expect(isAboutExperience("Notice period")).toBe(false);
    expect(isAboutExperience(undefined)).toBe(false);
  });
});
