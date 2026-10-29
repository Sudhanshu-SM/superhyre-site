import { describe, expect, it } from "vitest";
import type { PeopleSheet } from "../peopleSheet";
import { ROLE_WORDS, isSheetName, readLinkOne, readOne, routeSheets } from "../sheetRoute";

const file = (name: string, type = "") => new File(["x"], name, { type });
const read = (kind: PeopleSheet["kind"]): PeopleSheet => ({
  kind,
  tabs: [],
  tab: null,
  headerRow: null,
  columns: [],
  needsCheck: false,
  counts: { rows: 0, people: 0, toAdd: 0, alreadyHere: 0, onCampaign: 0, repeats: 0, left: 0, namesFromLinks: 0, phonesRebuilt: 0, phonesCut: 0 },
  leftOutBy: {},
  leftOut: [],
  rows: [],
});

describe("which files are spreadsheets", () => {
  it("is decided by the name or the type, since a pasted or Windows-saved one often has the wrong type", () => {
    for (const f of [file("a.xlsx"), file("a.XLS"), file("a.csv"), file("a.tsv"), file("noext", "text/csv"), file("a", "application/vnd.ms-excel")])
      expect(isSheetName(f), f.name).toBe(true);
    for (const f of [file("jd.pdf", "application/pdf"), file("cv.docx"), file("notes.txt", "text/plain"), file("pic.png", "image/png")])
      expect(isSheetName(f), f.name).toBe(false);
  });
});

describe("where an attached sheet goes", () => {
  it("sends what is in it to the people card or to the roles import, each sheet by itself", async () => {
    const kinds: Record<string, PeopleSheet["kind"]> = { "people.xlsx": "people", "roles.csv": "roles", "prices.csv": "other" };
    const asked: Array<[string, string | null]> = [];
    const out = await routeSheets([file("people.xlsx"), file("roles.csv"), file("prices.csv")], "c-1", async (f, o) => {
      asked.push([f.name, o.campaignId ?? null]);
      return read(kinds[f.name] ?? "other");
    });
    // A sheet that is neither goes to the people card, which says what a sheet of people needs and offers it to the roles import.
    expect(out.people.map((p) => p.file?.name)).toEqual(["people.xlsx", "prices.csv"]);
    expect(out.roles.map((f) => f.name)).toEqual(["roles.csv"]);
    expect(out.failed).toEqual([]);
    // Read for the campaign the chat is on, and what was read travels with the file.
    expect(asked).toEqual([["people.xlsx", "c-1"], ["roles.csv", "c-1"], ["prices.csv", "c-1"]]);
    expect(out.people[0]).toMatchObject({ campaignId: "c-1", link: null, read: { kind: "people" } });
  });

  it("reads again for Candidates when the campaign will not take it (closed, or not theirs), rather than refusing the sheet", async () => {
    const calls: Array<string | null> = [];
    const out = await routeSheets([file("people.csv")], "c-closed", async (_f, o) => {
      calls.push(o.campaignId ?? null);
      if (o.campaignId) throw new Error("That campaign is closed.");
      return read("people");
    });
    expect(calls).toEqual(["c-closed", null]);
    expect(out.people).toHaveLength(1);
    expect(out.people[0]?.campaignId).toBeNull();
  });

  it("says which sheet could not be read, and still sends the others", async () => {
    const boom = new Error("That is an old Excel file (.xls).");
    const out = await routeSheets([file("old.xls"), file("ok.csv")], null, async (f) => {
      if (f.name === "old.xls") throw boom;
      return read("people");
    });
    expect(out.failed).toEqual([{ name: "old.xls", error: boom }]);
    expect(out.people.map((p) => p.file?.name)).toEqual(["ok.csv"]);
  });

  it("does not ask twice when there was no campaign to blame", async () => {
    let n = 0;
    const out = await routeSheets([file("a.csv")], null, async () => {
      n += 1;
      throw new Error("down");
    });
    expect(n).toBe(1);
    expect(out.failed).toHaveLength(1);
  });
});

const LINK = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing";

describe("a Google Sheet's link read as it is pasted", () => {
  it("is read for the campaign the chat is on, as a sheet file is, and what was read goes with the chip", async () => {
    const asked: Array<[string, string | null]> = [];
    const got = await readLinkOne(LINK, "c-1", async (u, o) => {
      asked.push([u, o.campaignId ?? null]);
      return read("people");
    });
    expect(asked).toEqual([[LINK, "c-1"]]);
    expect(got).toMatchObject({ campaignId: "c-1", sheet: { kind: "people" } });
  });

  it("reads again for Candidates when the campaign will not take it (closed, or not theirs), rather than refusing the sheet", async () => {
    const calls: Array<string | null> = [];
    const got = await readLinkOne(LINK, "c-closed", async (_u, o) => {
      calls.push(o.campaignId ?? null);
      if (o.campaignId) throw new Error("That campaign is closed.");
      return read("roles");
    });
    expect(calls).toEqual(["c-closed", null]);
    expect(got).toMatchObject({ campaignId: null, sheet: { kind: "roles" } });
  });

  it("says why it could not be read, in the server's words, and does not ask twice when there was no campaign to blame", async () => {
    let n = 0;
    const boom = new Error("That sheet needs a sign-in to open. In Google Sheets choose Share and set General access to Anyone with the link.");
    await expect(
      readLinkOne(LINK, null, async () => {
        n += 1;
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(n).toBe(1);
  });
});

describe("the words that mean a list of roles", () => {
  it("are taken from what is typed, and say nothing of the people", () => {
    expect(ROLE_WORDS.test("add the candidates from this sheet")).toBe(false);
    expect(ROLE_WORDS.test("create campaigns from this sheet")).toBe(true);
  });
});

describe("one sheet read as it is attached", () => {
  it("is read for the campaign the chat is on, and for Candidates when that campaign refuses it", async () => {
    const asked: Array<string | null | undefined> = [];
    const got = await readOne(file("people.xlsx"), "c-closed", async (_f, o) => {
      asked.push(o.campaignId);
      if (o.campaignId) throw new Error("closed");
      return read("people");
    });
    expect(asked).toEqual(["c-closed", null]);
    expect(got.campaignId).toBeNull();
    expect(got.sheet.kind).toBe("people");
  });

  it("keeps the campaign it was read for when that works", async () => {
    const got = await readOne(file("people.xlsx"), "c-1", async () => read("people"));
    expect(got.campaignId).toBe("c-1");
  });

  it("says why when it can not be read at all, so the chip can", async () => {
    await expect(readOne(file("old.xls"), null, async () => { throw new Error("That is an old Excel file."); })).rejects.toThrow("old Excel file");
  });
});
