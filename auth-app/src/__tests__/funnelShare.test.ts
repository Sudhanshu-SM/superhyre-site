import { describe, expect, it } from "vitest";
import { pipelineNumbers } from "../pipelineNumbers";

/** A share of the step before is never over 100: a person who skipped a step is not 133% of it. */
describe("a funnel's step-to-step share", () => {
  it("is capped at 100 whatever the counts say", () => {
    const n = pipelineNumbers(
      [],
      { found: 0, shortlisted: 0, outreach: 3, replied: 4, interviewing: 4, hired: 0 } as never,
      { kept: null, reachedOut: 133, replied: 133, interviewing: 150, hired: 40 } as never,
    );
    expect(n.repliedPct).toBe(100);
    expect(n.conv).toEqual({ outreach: 100, interviewing: 100, hired: 40 });
  });
});
