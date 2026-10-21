import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { askedYears, FitMark } from "../CandidateBits";

describe("a years requirement said against the person's own years", () => {
  it.each([
    ["5 to 8 years", 10, "10 years, asked 5 to 8"],
    ["5-8 years", 6, "6 years, asked 5 to 8"],
    ["5+ years", 7, "7 years, asked 5+"],
    ["5 years of experience", 1, "1 year, asked 5"],
    ["Python", 10, null],
    ["5 to 8 years", null, null],
    ["5 to 8 years", 0, null],
  ])("%j with %j", (label, have, out) => {
    expect(askedYears(label, have)).toBe(out);
  });

  it("is the mark's words, and an unjudged person still reads Not scored yet", () => {
    expect(renderToStaticMarkup(<FitMark met label="5 to 8 years" years={10} />)).toContain("10 years, asked 5 to 8");
    expect(renderToStaticMarkup(<FitMark met label="5 to 8 years" />)).toContain("Meets: 5 to 8 years");
    expect(renderToStaticMarkup(<FitMark met={false} label="5 to 8 years" years={10} unscored />)).toContain("Not scored yet: 5 to 8 years");
  });
});
