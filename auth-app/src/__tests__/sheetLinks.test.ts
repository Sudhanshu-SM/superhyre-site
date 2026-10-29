import { describe, expect, it } from "vitest";
import { sheetLinkIn, sheetLinksAlone, sheetLinksIn, withoutSheetLinks } from "../importFiles";

const A = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing";
const B = "https://docs.google.com/spreadsheets/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210/edit#gid=5";

describe("the Google Sheets links in the words", () => {
  it("finds each different one once, in the order they come", () => {
    expect(sheetLinksIn(`first ${A} and ${B} and again ${A}`)).toEqual([A, B]);
    expect(sheetLinksIn("no link here")).toEqual([]);
    expect(sheetLinksIn("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789")).toEqual([]);
    expect(sheetLinkIn(`see ${B}`)).toBe(B);
  });

  it("takes them out of the words and closes the space, so a link that became a chip is not also left in the draft", () => {
    expect(withoutSheetLinks(`Add the candidates from this sheet ${A} please`)).toBe("Add the candidates from this sheet please");
    expect(withoutSheetLinks(`${A} ${B}`)).toBe("");
    expect(withoutSheetLinks(`line one\n${A}\nline three`)).toBe("line one\n\nline three");
    expect(withoutSheetLinks("nothing to take out")).toBe("nothing to take out");
  });

  it("are a paste of links only when there is nothing else in it, one to a line", () => {
    expect(sheetLinksAlone(A)).toEqual([A]);
    expect(sheetLinksAlone(`${A}\n\n${B}\n`)).toEqual([A, B]);
    expect(sheetLinksAlone(`${A}\n${A}`)).toEqual([A]);
    expect(sheetLinksAlone(`${A} ${B}`)).toBeNull();
    expect(sheetLinksAlone(`please add ${A}`)).toBeNull();
    expect(sheetLinksAlone(`${A}\nthanks`)).toBeNull();
    expect(sheetLinksAlone("")).toBeNull();
    expect(sheetLinksAlone("   \n  ")).toBeNull();
  });
});
