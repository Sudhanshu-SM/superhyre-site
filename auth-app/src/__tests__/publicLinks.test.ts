import { afterEach, describe, expect, it, vi } from "vitest";
import { applyKeyFrom } from "../applyKey";
import { formLinks } from "../FormLinkChip";
import { reviewTokenFrom } from "../reviewKey";

/** The links people share are plain paths on the site, /public/apply/<key> and /public/review/<token>. */
const KEY = "Dz2l_PjAHo8e-GakUASpOYS4";

afterEach(() => vi.unstubAllGlobals());

describe("the shared links", () => {
  it("reads a form key from /public/apply/<key> as well as from the hash", () => {
    expect(applyKeyFrom("", `/public/apply/${KEY}`)).toBe(KEY);
    expect(applyKeyFrom("", `/public/apply/${KEY}/`)).toBe(KEY);
    expect(applyKeyFrom(`#/apply/${KEY}`, "/")).toBe(KEY);
    expect(applyKeyFrom("", "/access/")).toBeNull();
    expect(applyKeyFrom("", "/public/apply/")).toBeNull();
  });

  it("reads a review token from /public/review/<token>", () => {
    expect(reviewTokenFrom("", "/public/review/abc_DEF-123")).toBe("abc_DEF-123");
    expect(reviewTokenFrom("#/review/abc_DEF-123", "/")).toBe("abc_DEF-123");
  });

  it("shows a pasted /public/apply link from this site as a form card", () => {
    vi.stubGlobal("window", { location: { origin: "https://superhyre.com" } });
    const link = `https://superhyre.com/public/apply/${KEY}`;
    expect(formLinks(`Apply here: ${link}`)).toEqual([{ url: link, key: KEY, host: "superhyre.com" }]);
    expect(formLinks(`https://elsewhere.example/public/apply/${KEY}`)).toEqual([]);
  });
});
