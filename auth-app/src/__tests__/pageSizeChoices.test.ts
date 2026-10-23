import { describe, expect, it } from "vitest";
import { effectiveSize, pageSizeChoices } from "../usePageSize";

describe("which page sizes a list offers", () => {
  it("offers nothing until there is more than the smallest page", () => {
    expect(pageSizeChoices(null)).toEqual([]);
    expect(pageSizeChoices(0)).toEqual([]);
    expect(pageSizeChoices(25)).toEqual([]);
  });

  it("offers only sizes smaller than the list, so a size never means 'everything at once' by accident", () => {
    expect(pageSizeChoices(26)).toEqual([25]);
    expect(pageSizeChoices(60)).toEqual([25, 50]);
    expect(pageSizeChoices(100)).toEqual([25, 50]);
  });

  it("caps a list of 266 at pages of 100", () => {
    expect(pageSizeChoices(266)).toEqual([25, 50, 100]);
    expect(pageSizeChoices(500)).toEqual([25, 50, 100]);
  });

  it("offers 500 once there are more than 500, and 1,000 once there are more than 1,000", () => {
    expect(pageSizeChoices(501)).toEqual([25, 50, 100, 500]);
    expect(pageSizeChoices(1000)).toEqual([25, 50, 100, 500]);
    expect(pageSizeChoices(1001)).toEqual([25, 50, 100, 500, 1000]);
    expect(pageSizeChoices(25_000)).toEqual([25, 50, 100, 500, 1000]);
  });
});

describe("the size a list uses", () => {
  it("is the window's size on Auto, and the chosen size otherwise", () => {
    expect(effectiveSize("auto", 14, [25, 50, 100])).toBe(14);
    expect(effectiveSize(50, 14, [25, 50, 100])).toBe(50);
  });

  it("is cut to what the list's count allows (a remembered 1,000 on a list of 266 is 100)", () => {
    expect(effectiveSize(1000, 14, [25, 50, 100])).toBe(100);
    expect(effectiveSize(500, 14, [25])).toBe(25);
  });

  it("keeps the chosen size while the count is not known yet, so the first read asks for it", () => {
    expect(effectiveSize(500, 14, [])).toBe(500);
  });
});
