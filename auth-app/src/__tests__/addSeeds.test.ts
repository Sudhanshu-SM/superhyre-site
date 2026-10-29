import { describe, expect, it } from "vitest";
import { finishImportFor, finishedImport, madeLine, peekImportFor, stashImportFor } from "../importFiles";
import { SEED_LIFE_MS, addingIdOf, finishFor, finishedFor, passedFor, peekFor, sentFor, stashFor, stashPeople, takePeople } from "../peopleSeed";

/**
 * The files of an add wait for their card under the add's id: two sends keep their own, nothing is looked at by the wrong card, and a
 * card that is drawn again (the chat was left and came back) finds its files until it has finished with them or the time runs out.
 */

const seed = (name: string) => ({ sheets: [{ file: new File(["x"], name), link: null, read: null, campaignId: null }], words: null, picked: null });

describe("the files an add leaves for its card", () => {
  it("are found again by a card drawn again on the same add, until it has finished with them: a remount is not a reload", () => {
    stashFor("add-aaaa0001", seed("one.xlsx"));
    expect(peekFor("add-aaaa0001")?.sheets[0]?.file?.name).toBe("one.xlsx");
    // The chat redraws the card (it was left and came back): the files are still there.
    expect(peekFor("add-aaaa0001")?.sheets[0]?.file?.name).toBe("one.xlsx");
    finishFor("add-aaaa0001");
    expect(peekFor("add-aaaa0001")).toBeNull();
  });

  it("keep two sends in one chat apart", () => {
    stashFor("add-bbbb0001", seed("one.xlsx"));
    stashFor("add-bbbb0002", seed("two.xlsx"));
    expect(peekFor("add-bbbb0002")?.sheets[0]?.file?.name).toBe("two.xlsx");
    expect(peekFor("add-bbbb0001")?.sheets[0]?.file?.name).toBe("one.xlsx");
  });

  it("are not there for a card that was not made for them: an unknown id gets nothing, and the files of the words are not an add's", () => {
    stashFor("add-cccc0001", seed("one.xlsx"));
    expect(peekFor("add-cccc9999")).toBeNull();
    stashPeople([{ file: new File(["x"], "typed.xlsx"), link: null, read: null, campaignId: null }]);
    expect(peekFor("add-cccc0001")?.sheets[0]?.file?.name).toBe("one.xlsx");
    expect(takePeople().map((s) => s.file?.name)).toEqual(["typed.xlsx"]);
  });

  it("let go after ten minutes, so a send that failed leaves nothing for a later card to find", () => {
    const t0 = 1_000_000;
    stashFor("add-dddd0001", seed("late.xlsx"), t0);
    // Looked at inside the ten minutes as often as it likes; the time is counted from the send, not from the last look.
    expect(peekFor("add-dddd0001", t0 + SEED_LIFE_MS - 1)?.sheets).toHaveLength(1);
    expect(peekFor("add-dddd0001", t0 + SEED_LIFE_MS)?.sheets).toHaveLength(1);
    expect(peekFor("add-dddd0001", t0 + SEED_LIFE_MS + 1)).toBeNull();
    // Once it has run out it is gone for good, a look inside the window earlier or not.
    expect(peekFor("add-dddd0001", t0 + 1)).toBeNull();
    stashFor("add-dddd0002", seed("soon.xlsx"), t0);
    expect(peekFor("add-dddd0002", t0 + SEED_LIFE_MS)?.sheets).toHaveLength(1);
    // An old entry is swept the next time anything is stashed.
    stashFor("add-dddd0003", seed("old.xlsx"), t0);
    stashFor("add-dddd0004", seed("new.xlsx"), t0 + SEED_LIFE_MS + 5);
    expect(peekFor("add-dddd0003", t0 + SEED_LIFE_MS + 6)).toBeNull();
  });

  it("hold the resumes' text beside the sheets, for the card that reads them all at once", () => {
    stashFor("add-ffff0001", { ...seed("leads.xlsx"), resumes: [{ id: "a1", name: "priya.pdf", text: "Priya Nair", picture: false }, { id: "a2", name: "scan.jpg", text: "RAVI", picture: true }] });
    const own = peekFor("add-ffff0001");
    expect(own?.resumes?.map((r) => [r.name, r.picture])).toEqual([["priya.pdf", false], ["scan.jpg", true]]);
    expect(own?.sheets).toHaveLength(1);
    // An add of sheets alone has none.
    stashFor("add-ffff0002", seed("only.xlsx"));
    expect(peekFor("add-ffff0002")?.resumes).toBeUndefined();
  });

  it("are the roles' too, by the same id and the same ten minutes, found again by a card drawn again", () => {
    stashImportFor("add-eeee0001", { files: [new File(["x"], "roles.xlsx")] }, 5_000);
    expect(peekImportFor("add-eeee0002", 5_001)).toBeNull();
    expect(peekImportFor("add-eeee0001", 5_001)?.files.map((f) => f.name)).toEqual(["roles.xlsx"]);
    expect(peekImportFor("add-eeee0001", 5_002)?.files.map((f) => f.name)).toEqual(["roles.xlsx"]);
    stashImportFor("add-eeee0003", { texts: [{ label: "Backend", jd: "x" }] }, 5_000);
    expect(peekImportFor("add-eeee0003", 5_000 + 10 * 60_000 + 1)).toBeNull();
  });

  it("is told from a card the words opened by its query", () => {
    expect(addingIdOf("adding:add-aaaa0001")).toBe("add-aaaa0001");
    expect(addingIdOf(null)).toBeNull();
    expect(addingIdOf("something else")).toBeNull();
    expect(addingIdOf("adding:short")).toBeNull();
  });
});

describe("what a finished add leaves for a card drawn again", () => {
  const said = { line: "Added 7 people to Candidates.", href: "#/contacts", link: "See Candidates" };

  it("is how it went, in the words the card said, and never the files: they are let go", () => {
    stashFor("add-gggg0001", seed("one.xlsx"));
    expect(finishedFor("add-gggg0001")).toBeNull();
    finishFor("add-gggg0001", said);
    expect(peekFor("add-gggg0001")).toBeNull();
    expect(finishedFor("add-gggg0001")).toEqual(said);
    // It stays for as long as the page does, however long the card was away (the files only last ten minutes).
    expect(finishedFor("add-gggg0001")).toEqual(said);
  });

  it("is nothing when the card was let go with nothing said, and for an add that was never finished: that is a page that was reloaded", () => {
    stashFor("add-gggg0002", seed("two.xlsx"));
    finishFor("add-gggg0002");
    expect(finishedFor("add-gggg0002")).toBeNull();
    expect(finishedFor("add-gggg9999")).toBeNull();
  });

  it("holds the last few and lets the oldest go, so a long day of adding does not fill the page's memory", () => {
    for (let i = 0; i < 45; i++) finishFor(`add-hhhh${String(i).padStart(4, "0")}`, { ...said, line: `Added ${i}.` });
    expect(finishedFor("add-hhhh0000")).toBeNull();
    expect(finishedFor("add-hhhh0004")).toBeNull();
    expect(finishedFor("add-hhhh0005")?.line).toBe("Added 5.");
    expect(finishedFor("add-hhhh0044")?.line).toBe("Added 44.");
  });
});

describe("an add some of whose people went in", () => {
  const read = { kind: "people", counts: { people: 61 } } as never;
  const withRead = (name: string) => ({ sheets: [{ file: new File(["x"], name), link: null, read, campaignId: "c-1" }], words: "to Pune", picked: "Pune", say: "only Pune" });

  it("keeps its files and its words, and drops what its sheets were read as: that was who was new before anybody went in", () => {
    stashFor("add-iiii0001", { ...withRead("leads.xlsx"), resumes: [{ id: "r1", name: "a.pdf", text: "Asha", picture: false }] });
    expect(peekFor("add-iiii0001")?.sheets[0]?.read).toBe(read);
    sentFor("add-iiii0001");
    const own = peekFor("add-iiii0001");
    expect(own?.sheets[0]?.read).toBeNull();
    expect(own?.sheets[0]?.file?.name).toBe("leads.xlsx");
    expect(own?.sheets[0]?.campaignId).toBe("c-1");
    expect([own?.words, own?.picked, own?.say]).toEqual(["to Pune", "Pune", "only Pune"]);
    expect(own?.resumes).toHaveLength(1);
  });

  it("touches no other add, and does nothing for one that is gone", () => {
    stashFor("add-iiii0002", withRead("one.xlsx"));
    stashFor("add-iiii0003", withRead("two.xlsx"));
    sentFor("add-iiii0002");
    expect(peekFor("add-iiii0003")?.sheets[0]?.read).toBe(read);
    expect(() => sentFor("add-iiii9999")).not.toThrow();
    finishFor("add-iiii0002");
    sentFor("add-iiii0002");
    expect(peekFor("add-iiii0002")).toBeNull();
  });

  it("remembers that the words it was given were passed on, for that add alone, and does not keep its time from the send", () => {
    const t0 = 2_000_000;
    stashFor("add-jjjj0001", withRead("one.xlsx"), t0);
    stashFor("add-jjjj0002", withRead("two.xlsx"), t0);
    expect(peekFor("add-jjjj0001", t0 + 1)?.passed).toBeUndefined();
    passedFor("add-jjjj0001");
    expect(peekFor("add-jjjj0001", t0 + 2)?.passed).toBe(true);
    expect(peekFor("add-jjjj0002", t0 + 2)?.passed).toBeUndefined();
    // Marking it neither lengthens nor shortens its ten minutes.
    expect(peekFor("add-jjjj0001", t0 + SEED_LIFE_MS + 1)).toBeNull();
    expect(() => passedFor("add-jjjj9999")).not.toThrow();
  });
});

describe("the roles an add left for its card", () => {
  it("are let go as the card makes campaigns from them and when it ends, and what became of them is kept to say so", () => {
    stashImportFor("add-kkkk0001", { files: [new File(["x"], "roles.xlsx")] });
    expect(peekImportFor("add-kkkk0001")?.files).toHaveLength(1);
    expect(finishedImport("add-kkkk0001")).toBeNull();
    // The first is made and four roles are still to make: the card is let go of, whatever is left.
    finishImportFor("add-kkkk0001", 1, 4);
    expect(peekImportFor("add-kkkk0001")).toBeNull();
    expect(finishedImport("add-kkkk0001")).toEqual({ made: 1, left: 4 });
    // Told again as more are made: the last numbers stand. At its end nothing is left.
    finishImportFor("add-kkkk0001", 5);
    expect(finishedImport("add-kkkk0001")).toEqual({ made: 5, left: 0 });
    // An add that was never finished is a reload, or the ten minutes: nothing is known of it.
    expect(finishedImport("add-kkkk9999")).toBeNull();
  });

  it("say what they became in the words of the card's own last line, and when roles were left, how many and that they are added again", () => {
    expect(madeLine({ made: 3, left: 0 })).toBe("3 campaigns created. Approve their requirements to start finding people.");
    expect(madeLine({ made: 1, left: 0 })).toBe("1 campaign created. Approve its requirements to start finding people.");
    expect(madeLine({ made: 0, left: 0 })).toBe("Nothing was created.");
    expect(madeLine({ made: 2, left: 3 })).toBe("2 campaigns created, 3 roles left. Add them again with the paperclip.");
    expect(madeLine({ made: 1, left: 1 })).toBe("1 campaign created, 1 role left. Add it again with the paperclip.");
    expect(madeLine({ made: 0, left: 2 })).toBe("Nothing was created yet, 2 roles left. Add them again with the paperclip.");
  });

  it("hold the last few finished and let the oldest go", () => {
    for (let i = 0; i < 45; i++) finishImportFor(`add-llll${String(i).padStart(4, "0")}`, i);
    expect(finishedImport("add-llll0004")).toBeNull();
    expect(finishedImport("add-llll0005")).toEqual({ made: 5, left: 0 });
    expect(finishedImport("add-llll0044")).toEqual({ made: 44, left: 0 });
  });
});
