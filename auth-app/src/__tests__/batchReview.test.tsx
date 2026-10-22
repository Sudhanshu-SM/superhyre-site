import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { standingWords } from "../BatchReview";
import { SheetNeeds } from "../SheetNeeds";

/**
 * After a bulk add, each role says where it stands in a few words (waiting for approval, searching with a count, done),
 * and everywhere a sheet is asked for says what it needs the same short way.
 */

const role = (spec?: "drafting" | "drafted" | "failed") => ({ id: "c1", name: "Backend Engineer", spec });

describe("where a role stands", () => {
  it("says the role spec is being drafted, or did not come through", () => {
    expect(standingWords(role("drafting"), undefined)).toBe("Drafting the role spec");
    expect(standingWords(role("failed"), undefined)).toBe("Role spec not drafted");
  });

  it("says it needs approval until the spec is approved", () => {
    expect(standingWords(role("drafted"), { approved: false, searching: false, found: null })).toBe("Needs your approval");
  });

  it("says a search is running, with how many it has found, and how many it found when it is over", () => {
    expect(standingWords(role("drafted"), { approved: true, searching: true, found: 34 })).toBe("Searching, 34 found so far");
    expect(standingWords(role("drafted"), { approved: true, searching: true, found: null })).toBe("Searching");
    expect(standingWords(role("drafted"), { approved: true, searching: false, found: 50 })).toBe("50 found");
    expect(standingWords(role("drafted"), { approved: true, searching: false, found: null })).toBe("Approved");
  });

  it("does not guess before the server has said", () => {
    expect(standingWords(role("drafted"), undefined)).toBe("Checking");
  });
});

describe("what a sheet needs", () => {
  it("is said in a few labelled lines: permission, rows, the required column, the optional ones and the limit", () => {
    const html = renderToStaticMarkup(<SheetNeeds />);
    for (const label of ["Permission", "Rows", "Required", "Optional", "Limit"]) expect(html).toContain(`<dt>${label}</dt>`);
    expect(html).toContain("Anyone with the link");
    expect(html).toContain("Job description");
    for (const column of ["Role", "Client", "Location", "Experience", "CTC", "Openings", "Notice"]) expect(html).toContain(column);
    expect(html).toContain("50 roles");
  });

  it("leaves out the permission for a file, which has no sharing to set", () => {
    const html = renderToStaticMarkup(<SheetNeeds file />);
    expect(html).not.toContain("Permission");
    expect(html).toContain("Job description");
  });
});
