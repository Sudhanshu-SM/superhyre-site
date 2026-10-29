import { describe, expect, it } from "vitest";
import { SHEET_ROLES } from "../attachContract";
import {
  BATCH_BYTES,
  BATCH_ROWS,
  PEOPLE_MESSAGE,
  ROLE_CHOICES,
  ROLE_LABEL,
  type BatchResult,
  type PeopleSheet,
  type Role,
  type SheetColumn,
  addLabel,
  batchesOf,
  carryOn,
  choose,
  columnName,
  columnQuestion,
  columnsParam,
  countLine,
  doneLine,
  factLines,
  hasHidden,
  headline,
  hiddenLabel,
  isTooBig,
  isUsed,
  latestRead,
  leftEarlyLine,
  leftOutLines,
  lookLine,
  nothingInFiles,
  nothingToAdd,
  progressLine,
  readAgainAfter,
  routeOf,
  scopeLine,
  seeThemHref,
  selectValue,
  sendBatches,
  splitColumns,
  stoppedLine,
  tabChoices,
  tally,
  tickedTabs,
  tooManyPeople,
  PLACE_BATCH,
  PLACE_CHOICES,
  type PlaceAnswer,
  type PlaceRequest,
  type RowToSend,
  type StatusWord,
  addAndPlace,
  addPlaced,
  carryPlaced,
  kindOf,
  moveFor,
  movesFrom,
  namedBy,
  namesLine,
  placeAll,
  placeRequests,
  placeView,
  placedLines,
  placedOf,
  placingOf,
  saidLine,
  statusKey,
  stillHolds,
} from "../peopleSheet";

const col = (index: number, header: string, role: Role, over: Partial<SheetColumn> = {}): SheetColumn => ({
  index, header, role, confidence: "sure", how: "header", samples: [], ...over,
});

const sheet = (over: Partial<PeopleSheet> = {}, counts: Partial<PeopleSheet["counts"]> = {}): PeopleSheet => ({
  kind: "people",
  tabs: [{ name: "Sheet1", rows: 12, people: 10 }],
  tab: "Sheet1",
  headerRow: 1,
  columns: [col(0, "Name", "name"), col(1, "LinkedIn", "linkedin"), col(2, "Added by", "addedBy"), col(3, "", "ignore", { how: "content" })],
  needsCheck: false,
  counts: { rows: 12, people: 10, toAdd: 7, alreadyHere: 3, onCampaign: 1, repeats: 0, left: 0, namesFromLinks: 0, phonesRebuilt: 0, phonesCut: 0, ...counts },
  leftOutBy: {},
  leftOut: [],
  rows: [],
  ...over,
});

describe("what a person may say a column is", () => {
  it("has words for every role the server reads, and offers the ones that are not bookkeeping", () => {
    // The roles the server reads (the shared list, attachContract.ts): each must have words on the card.
    for (const role of SHEET_ROLES) expect(ROLE_LABEL[role], role).toBeTruthy();
    const offered = ROLE_CHOICES.map(([role]) => role);
    expect(offered).not.toContain("date");
    expect(offered).not.toContain("addedBy");
    expect(new Set(offered).size).toBe(offered.length);
    expect(ROLE_LABEL.linkedin).toBe("LinkedIn link");
  });

  it("reads the sheet's own bookkeeping (dates, who added) as left out, in the dropdown and in the lists", () => {
    expect(selectValue("date")).toBe("ignore");
    expect(selectValue("addedBy")).toBe("ignore");
    expect(selectValue("phone")).toBe("phone");
    const { used, left } = splitColumns(sheet());
    expect(used.map((c) => c.header)).toEqual(["Name", "LinkedIn"]);
    expect(left.map((c) => c.index)).toEqual([2, 3]);
    expect(isUsed(col(0, "x", "company"))).toBe(true);
  });

  it("names a column by its header, or by its letter when it has none", () => {
    expect(columnName(col(0, "Mobile", "phone"))).toBe("Mobile");
    expect(columnName(col(2, "  ", "phone"))).toBe("Column C");
    expect(columnName(col(27, "", "phone"))).toBe("Column AB");
  });

  it("names each column's dropdown by its header and its place, so two with the same header are told apart", () => {
    expect(columnQuestion(col(0, "Email", "email"))).toBe("What Email (column A) is");
    expect(columnQuestion(col(2, "Email", "email"))).toBe("What Email (column C) is");
    expect(columnQuestion(col(3, "  ", "phone"))).toBe("What Column D is");
    expect(columnQuestion(col(27, "Phone", "phone"))).toBe("What Phone (column AB) is");
  });

  it("sends only what the person changed, in the way the server reads it", () => {
    expect(columnsParam({})).toBeUndefined();
    expect(columnsParam({ 5: "email", 2: "phone" })).toBe("2:phone,5:email");
  });

  it("keeps a choice, and drops it when the column is set back to what the sheet said", () => {
    const phone = col(2, "Alt", "phone");
    const set = choose({}, phone, "notes");
    expect(set).toEqual({ 2: "notes" });
    expect(choose(set, { ...phone, how: "chosen", role: "notes" }, "phone")).toEqual({ 2: "phone" });
    expect(choose({ 2: "notes" }, phone, "phone")).toEqual({});
    expect(choose({}, col(3, "Added by", "addedBy"), "ignore")).toEqual({});
  });
});

describe("what the card says", () => {
  it("counts the people it found, in the Indian way, and says when it found none", () => {
    expect(headline(sheet({}, { people: 1234 }), "export.xlsx")).toBe("I found 1,234 people in export.xlsx");
    expect(headline(sheet({}, { people: 1 }), "one.csv")).toBe("I found 1 person in one.csv");
    expect(headline(sheet({}, { people: 0 }), "empty.csv")).toBe("I couldn't find anyone to add in empty.csv");
  });

  it("states each number once, leaves out what is zero, and names the shortlist only when there is one", () => {
    expect(factLines(sheet(), null)).toEqual(["7 new to your candidates", "3 already in your candidates, kept as they are"]);
    expect(factLines(sheet(), "Backend")).toEqual([
      "7 new to your candidates",
      "3 already in your candidates, kept as they are, 1 already on the Backend shortlist",
    ]);
    const all = factLines(sheet({}, { toAdd: 0, alreadyHere: 0, repeats: 4, namesFromLinks: 2, phonesRebuilt: 1 }), null);
    expect(all).toEqual([
      "4 rows for someone who is in the sheet more than once, joined into one",
      "2 names taken from the LinkedIn link or email, as the sheet has none",
      "1 phone number that Excel had turned into a long number, put back",
    ]);
  });

  it("says that people already here are kept as they are, whether or not there is a shortlist, and only when someone is", () => {
    for (const name of [null, "Backend"]) {
      const lines = factLines(sheet(), name);
      expect(lines.find((l) => l.includes("already in your candidates"))).toContain("kept as they are");
    }
    expect(factLines(sheet({}, { alreadyHere: 0 }), null).join(" ")).not.toContain("kept as they are");
  });

  it("says that dates are not used only when the sheet has a date-like column, and then once", () => {
    expect(factLines(sheet(), null)).not.toContain("Dates in the sheet are not used.");
    const withDate = sheet({ columns: [col(0, "Name", "name"), col(1, "Date added", "date")] });
    expect(factLines(withDate, null).filter((l) => l === "Dates in the sheet are not used.")).toHaveLength(1);
    // The person's own bookkeeping column that is not a date says nothing of dates.
    expect(factLines(sheet({ columns: [col(0, "Added by", "addedBy")] }), null)).not.toContain("Dates in the sheet are not used.");
  });

  it("says in one sentence for the ear what the button adds, to where, and nothing when it adds nobody", () => {
    expect(countLine(212, null)).toBe("212 people will be added to Candidates.");
    expect(countLine(1, "Backend")).toBe("1 person will be added to the Backend shortlist.");
    expect(countLine(0, "Backend")).toBeNull();
  });

  it("says why rows were left out, with where, in plain words", () => {
    const p = sheet({
      leftOutBy: { "no-contact": 5, "bad-link": 1, "cut-phone": 2, invalid: 1 },
      leftOut: [
        { row: 4, tab: "Sheet1", why: "no-contact" },
        { row: 9, tab: "Sheet1", why: "no-contact" },
        { row: 11, tab: "Sheet1", why: "no-contact" },
        { row: 12, tab: "Sheet1", why: "no-contact" },
        { row: 15, tab: "Sheet1", why: "bad-link", who: "Acme Page" },
        { row: 20, tab: "Sheet1", why: "cut-phone" },
        { row: 22, tab: "Sheet1", why: "cut-phone" },
      ],
    });
    expect(leftOutLines(p)).toEqual([
      "5 rows have no LinkedIn link, email or phone to tell them apart (row 4, row 9, row 11 and 2 more)",
      "1 row has a link that isn't a profile, like a company page (row 15)",
      "2 rows have phone numbers that Excel cut short, which I didn't use (row 20, row 22)",
      "1 row has something I couldn't read",
    ]);
    expect(leftOutLines(sheet())).toEqual([]);
  });

  it("puts the tab's name before a row's number when the file has several tabs", () => {
    const p = sheet({
      tabs: [{ name: "Backend", rows: 3, people: 2 }, { name: "Design", rows: 3, people: 2 }],
      leftOutBy: { "no-contact": 1 },
      leftOut: [{ row: 6, tab: "Design", why: "no-contact" }],
    });
    expect(leftOutLines(p)).toEqual(["1 row has no LinkedIn link, email or phone to tell them apart (Design row 6)"]);
  });

  it("asks for a look at the columns when it was unsure, and says what about", () => {
    expect(lookLine(sheet())).toBeNull();
    expect(lookLine(sheet({ needsCheck: true }))).toMatch(/quick look/);
    expect(lookLine(sheet({ needsCheck: true, columns: [col(0, "Name", "name")] }))).toMatch(/LinkedIn links, emails or phone numbers/);
    expect(lookLine(sheet({ needsCheck: true, columns: [col(1, "Link", "linkedin")] }))).toMatch(/names/);
  });
});

describe("the one button", () => {
  const rows = (n: number): PeopleSheet["rows"] => Array.from({ length: n }, (_, i) => ({ row: i + 2, tab: "Sheet1", state: "new", fields: { fullName: `P ${i}` } }));

  it("adds to the campaign's shortlist when the chat is on one, and to Candidates otherwise", () => {
    expect(addLabel(sheet({ rows: rows(480) }), "Backend Engineer")).toBe("Add 480 to the Backend Engineer shortlist");
    expect(addLabel(sheet({ rows: rows(1200) }), null)).toBe("Add 1,200 to Candidates");
  });

  it("is not there when nobody is left to add, and says why instead", () => {
    const none = sheet({ rows: [] });
    expect(addLabel(none, "Backend")).toBeNull();
    expect(nothingToAdd(none, "Backend")).toBe("Everyone is already on the Backend shortlist.");
    expect(nothingToAdd(none, null)).toBe("Everyone in the sheet is already in your candidates.");
    expect(nothingToAdd(sheet({}, { people: 0 }), null)).toMatch(/nobody to add/);
  });

  it("does not say everyone is already there when the words left everyone out", () => {
    const out = sheet({ rows: [] }, { people: 5, toAdd: 0, alreadyHere: 0, filtered: 5 });
    expect(nothingToAdd(out, "Backend")).toBe("Nobody in the sheet matches your words. Untick a line under From your words to add them anyway.");
    expect(nothingToAdd(out, null)).not.toMatch(/already/);
    // Some stayed, and all of those are here: that is what is true of them.
    const part = sheet({ rows: [] }, { people: 5, toAdd: 0, alreadyHere: 2, filtered: 3 });
    expect(nothingToAdd(part, "Backend")).toBe("Everyone your words ask for is already on the Backend shortlist.");
    expect(nothingToAdd(part, null)).toBe("Everyone your words ask for is already in your candidates.");
  });

  it("says the same across several files, from the ones that are ticked", () => {
    const nobody = sheet({ rows: [] }, { people: 5, toAdd: 0, alreadyHere: 0, filtered: 5 });
    const here = sheet({ rows: [] }, { people: 4, toAdd: 0, alreadyHere: 4 });
    expect(nothingInFiles([], null)).toBe("There is nobody to add. Tick a file above, or check its columns.");
    expect(nothingInFiles([here], "Backend")).toBe("Everyone is already on the Backend shortlist.");
    expect(nothingInFiles([here, here], null)).toBe("Everyone in these files is already in your candidates.");
    expect(nothingInFiles([nobody, nobody], null)).toBe("Nobody in these files matches your words. Untick a line under From your words to add them anyway.");
    expect(nothingInFiles([nobody, here], "Backend")).toBe("Everyone your words ask for is already on the Backend shortlist.");
  });

  it("knows a sheet with more people than can be added at once, by the numbers the server sends, and no other failure", () => {
    expect(tooManyPeople({ details: { people: 12_000, limit: 10_000 } })).toBe(12_000);
    expect(tooManyPeople({ details: { people: 9_000, limit: 10_000 } })).toBeNull();
    expect(tooManyPeople({ details: {} })).toBeNull();
    expect(tooManyPeople(new Error("That sheet has 12,000 people."))).toBeNull();
    expect(tooManyPeople("old Excel")).toBeNull();
    expect(tooManyPeople(null)).toBeNull();
  });

  it("cuts the people into batches of a size a request takes, and by what they weigh", () => {
    const many = rows(BATCH_ROWS * 2 + 30);
    expect(batchesOf(many).map((b) => b.length)).toEqual([BATCH_ROWS, BATCH_ROWS, 30]);
    expect(batchesOf(many).flat()).toEqual(many);
    expect(batchesOf([])).toEqual([]);
    // Long notes: a batch ends when its text would pass the limit, however few rows it holds.
    const heavy = Array.from({ length: 10 }, (_, i) => ({ i, notes: "x".repeat(400) }));
    expect(batchesOf(heavy, 150, 1000).map((b) => b.length)).toEqual([2, 2, 2, 2, 2]);
    // One person larger than the limit still goes, alone.
    expect(batchesOf([{ notes: "x".repeat(5000) }, { notes: "y" }], 150, 1000).map((b) => b.length)).toEqual([1, 1]);
  });

  it("budgets a batch by the bytes it will weigh, not its characters: a Devanagari or CJK letter is three", () => {
    // 1,000 Devanagari letters are about 3,000 bytes, so two fit under 7,000; the same count of Latin letters weighs a third.
    const hindi = Array.from({ length: 6 }, (_, i) => ({ i, notes: "\u0915".repeat(1000) }));
    expect(batchesOf(hindi, 150, 7000).map((b) => b.length)).toEqual([2, 2, 2]);
    const latin = Array.from({ length: 10 }, (_, i) => ({ i, notes: "x".repeat(1000) }));
    expect(batchesOf(latin, 150, 7000).map((b) => b.length)).toEqual([6, 4]);
    // And the budget it keeps is under the 2 MB a request to the import may carry.
    expect(BATCH_BYTES).toBeLessThan(2 * 1024 * 1024);
  });

  it("says how far it has got", () => {
    expect(progressLine(300, 1200)).toBe("Adding 300 of 1,200");
  });
});

describe("sending the batches", () => {
  const ok = (rows: readonly unknown[]): BatchResult => ({ created: rows.length, skipped: 0, errors: [] });
  const people = (n: number) => Array.from({ length: n }, (_, i) => ({ i }));
  const tooBig = Object.assign(new Error("That's more than we accept in one request."), { status: 413, code: "too_large" });

  it("sends everyone, a batch at a time, and says how far it has got", async () => {
    const seen: number[] = [];
    const sizes: number[] = [];
    const run = await sendBatches(people(BATCH_ROWS * 2 + 5), async (b) => { sizes.push(b.length); return ok(b); }, { onProgress: (n) => seen.push(n) });
    expect(sizes).toEqual([BATCH_ROWS, BATCH_ROWS, 5]);
    expect(seen).toEqual([BATCH_ROWS, BATCH_ROWS * 2, BATCH_ROWS * 2 + 5]);
    expect(run).toMatchObject({ sent: BATCH_ROWS * 2 + 5, stopped: false, failure: null });
    expect(tally(run.parts).added).toBe(BATCH_ROWS * 2 + 5);
  });

  it("stops at the first batch that fails, with what went in counted and where it got to, so the rest can be sent again", async () => {
    let n = 0;
    const boom = new Error("Can't reach SuperHyre.");
    const rows = people(BATCH_ROWS * 3);
    const run = await sendBatches(rows, async (b) => { n += 1; if (n === 2) throw boom; return ok(b); });
    expect(run.failure).toEqual({ error: boom });
    expect(run.stopped).toBe(false);
    expect(run.sent).toBe(BATCH_ROWS);
    expect(tally(run.parts).added).toBe(BATCH_ROWS);
    expect(n).toBe(2);
    // What is left is exactly the rest, in order.
    expect(rows.slice(run.sent)[0]).toEqual({ i: BATCH_ROWS });
  });

  it("cuts a batch the server found too big in half, and again, until it goes, instead of failing for ever", async () => {
    const limit = 40;
    const went: number[] = [];
    const run = await sendBatches(people(150), async (b) => {
      if (b.length > limit) throw tooBig;
      went.push(...b.map((r) => r.i));
      return ok(b);
    });
    expect(run.failure).toBeNull();
    expect(run.sent).toBe(150);
    expect(tally(run.parts).added).toBe(150);
    // In order, each person once.
    expect(went).toEqual(Array.from({ length: 150 }, (_, i) => i));
    // 150 is cut to 75 and 75, then to 38, 37, 38, 37: every part is under the limit.
    expect(run.parts.every((p) => p.created <= limit)).toBe(true);
  });

  it("gives up, saying why, on one person who is too big alone", async () => {
    const run = await sendBatches(people(3), async () => { throw tooBig; });
    expect(run.failure?.error).toBe(tooBig);
    expect(run.sent).toBe(0);
    expect(run.stopped).toBe(false);
  });

  it("stops when it is told to, sending nothing more, and that is not a failure", async () => {
    const stop = new AbortController();
    let n = 0;
    const run = await sendBatches(people(BATCH_ROWS * 3), async (b) => { n += 1; if (n === 2) stop.abort(); return ok(b); }, { signal: stop.signal });
    expect(n).toBe(2);
    expect(run).toMatchObject({ stopped: true, failure: null, sent: BATCH_ROWS * 2 });
  });

  it("sends nothing at all when it was told to stop before it began", async () => {
    const stop = new AbortController();
    stop.abort();
    let n = 0;
    const run = await sendBatches(people(10), async (b) => { n += 1; return ok(b); }, { signal: stop.signal });
    expect(n).toBe(0);
    expect(run).toMatchObject({ stopped: true, failure: null, sent: 0 });
  });

  it("takes a request that was cancelled while it was away for a stop, not a failure", async () => {
    const stop = new AbortController();
    const run = await sendBatches(people(10), async () => { stop.abort(); throw new Error("Can't reach SuperHyre."); }, { signal: stop.signal });
    expect(run).toMatchObject({ stopped: true, failure: null, sent: 0 });
  });

  it("knows a refusal for size by its status or its code, and nothing else", () => {
    expect(isTooBig(tooBig)).toBe(true);
    expect(isTooBig({ status: 413 })).toBe(true);
    expect(isTooBig({ code: "too_large" })).toBe(true);
    for (const other of [new Error("x"), { status: 500 }, { code: "timeout" }, null, undefined, "413"]) expect(isTooBig(other)).toBe(false);
  });
});

describe("a sheet added in more than one try", () => {
  it("counts what went in on each try, and the people who could not be added only from the last, since they are sent again", () => {
    expect(carryOn({ added: 450, already: 10, failed: 2 }, { added: 600, already: 5, failed: 1 })).toEqual({ added: 1050, already: 15, failed: 1 });
    expect(carryOn({ added: 0, already: 0, failed: 0 }, { added: 3, already: 0, failed: 0 })).toEqual({ added: 3, already: 0, failed: 0 });
  });

  it("says what happened when it stops short: why, how many went in, and that adding again is safe", () => {
    expect(stoppedLine("Can't reach SuperHyre. Check your connection and try again.", { added: 450 })).toBe(
      "Can't reach SuperHyre. Check your connection and try again. 450 people were added before it stopped. Adding again carries on with the rest, and nobody is added twice.",
    );
    expect(stoppedLine("That took longer than expected.", { added: 1 })).toBe(
      "That took longer than expected. 1 person was added before it stopped. Adding again carries on with the rest, and nobody is added twice.",
    );
    expect(stoppedLine("Something went wrong.", { added: 0 })).toBe(
      "Something went wrong. Adding again carries on with the rest, and nobody is added twice.",
    );
  });
});

describe("after an adding that stopped short", () => {
  it("reads the sheet again for who is left only when somebody went in, since only then is what is shown no longer true", () => {
    expect(readAgainAfter({ sent: 450 })).toBe(true);
    expect(readAgainAfter({ sent: 1 })).toBe(true);
    // The first batch failed: the same outage would fail the reading too, and keep Add off for nothing.
    expect(readAgainAfter({ sent: 0 })).toBe(false);
  });

  it("is told by what sendBatches reports", async () => {
    const people = Array.from({ length: BATCH_ROWS * 2 }, (_, i) => ({ i }));
    const ok = (rows: readonly unknown[]): BatchResult => ({ created: rows.length, skipped: 0, errors: [] });
    const first = await sendBatches(people, async () => { throw new Error("down"); });
    expect(first.failure).not.toBeNull();
    expect(readAgainAfter(first)).toBe(false);
    let n = 0;
    const second = await sendBatches(people, async (b) => { n += 1; if (n === 2) throw new Error("down"); return ok(b); });
    expect(second.failure).not.toBeNull();
    expect(readAgainAfter(second)).toBe(true);
  });
});

describe("leaving in the middle of adding", () => {
  it("says how far it got and that carrying on is safe, since the card that showed it is gone", () => {
    expect(leftEarlyLine(450, 1050)).toBe("Adding stopped when you left, after 450 of 1,050 people. Attach the sheet again to carry on: nobody is added twice.");
    expect(leftEarlyLine(1, 3)).toBe("Adding stopped when you left, after 1 of 3 people. Attach the sheet again to carry on: nobody is added twice.");
  });
});

describe("one reading at a time", () => {
  it("cancels the reading before it when another starts, and only the newest may answer", () => {
    const reads = latestRead();
    const first = reads.begin();
    expect(first.current()).toBe(true);
    const second = reads.begin();
    expect(first.signal.aborted).toBe(true);
    expect(first.current()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.current()).toBe(true);
  });

  it("cancels what is being read when the card is left", () => {
    const reads = latestRead();
    const r = reads.begin();
    reads.stop();
    expect(r.signal.aborted).toBe(true);
    expect(r.current()).toBe(false);
  });
});

describe("what happened", () => {
  const part = (created: number, skipped: number, errors = 0) => ({
    created,
    skipped,
    errors: Array.from({ length: errors }, (_, i) => ({ row: i + 2, reasons: ["x"] })),
  });

  it("adds the batches up", () => {
    expect(tally([part(150, 10, 1), part(150, 0), part(20, 5, 2)])).toEqual({ added: 320, already: 15, failed: 3 });
    expect(tally([])).toEqual({ added: 0, already: 0, failed: 0 });
  });

  it("says it in a line: where they went, who was already here, who could not be added", () => {
    expect(doneLine({ added: 420, already: 60, failed: 0 }, "Backend")).toBe(
      "Added 420 people to the Backend shortlist. 60 were already in Candidates and are on the shortlist now.",
    );
    expect(doneLine({ added: 1, already: 1, failed: 1 }, null)).toBe(
      "Added 1 person to Candidates. 1 was already here. 1 person couldn't be added.",
    );
    expect(doneLine({ added: 0, already: 3, failed: 0 }, "Backend")).toBe(
      "3 were already in Candidates and are on the shortlist now.",
    );
    expect(doneLine({ added: 0, already: 0, failed: 0 }, null)).toBe("Nobody was added.");
  });

  it("links to where they are: the campaign's shortlist, or Candidates", () => {
    expect(seeThemHref("c-1")).toBe("#/campaign/shortlisted?campaign=c-1");
    expect(seeThemHref(null)).toBe("#/contacts");
  });
});

describe("where a sheet goes", () => {
  it("is the people card for people, the roles import for roles, and the people card (which says why) for neither", () => {
    expect(routeOf({ kind: "people" })).toBe("people");
    expect(routeOf({ kind: "roles" })).toBe("roles");
    expect(routeOf({ kind: "other" })).toBe("other");
  });

  it("opens the card with the words the server turns into the people view", () => {
    // packages/shared/src/views.ts: classifyBrief("Add the people in this sheet") is "people-import" (tested there).
    expect(PEOPLE_MESSAGE).toBe("Add the people in this sheet");
  });
});

describe("what the card says it is adding", () => {
  const sheetOf = (tabs: Array<{ name: string; rows: number; people: number; used?: false }>) => ({ tabs });

  it("is one line first: the file, and that nothing else in it is added", () => {
    expect(scopeLine(sheetOf([{ name: "Sheet1", rows: 10, people: 10 }]), "leads.xlsx")).toBe("Adding people from leads.xlsx. Nothing else in it is added.");
    expect(scopeLine(null, "your sheet")).toBe("Adding people from your sheet. Nothing else in it is added.");
  });

  it("names the tabs when some with people were not chosen, so the line is true", () => {
    const tabs = [{ name: "Candidates", rows: 130, people: 130 }, { name: "Archive", rows: 400, people: 400, used: false as const }];
    expect(scopeLine(sheetOf(tabs), "leads.xlsx")).toBe("Adding people from the Candidates tab of leads.xlsx. Nothing else in it is added.");
    expect(scopeLine(sheetOf([{ name: "A", rows: 1, people: 1 }, { name: "B", rows: 1, people: 1 }, { name: "C", rows: 1, people: 1, used: false }]), "x.xlsx")).toBe(
      "Adding people from the A and B tabs of x.xlsx. Nothing else in it is added.",
    );
  });

  it("offers the tabs to tick only when more than one has people, and knows which were read", () => {
    const tabs = [{ name: "Candidates", rows: 130, people: 130 }, { name: "Archive", rows: 400, people: 400, used: false as const }, { name: "Cover", rows: 1, people: 0 }];
    expect(tabChoices(sheetOf(tabs)).map((t) => t.name)).toEqual(["Candidates", "Archive"]);
    expect(tickedTabs(sheetOf(tabs))).toEqual(["Candidates"]);
    expect(tabChoices(sheetOf([{ name: "Only", rows: 3, people: 3 }, { name: "Cover", rows: 1, people: 0 }]))).toEqual([]);
  });

  it("offers one tick for what the workbook hides, and says what it would read", () => {
    expect(hasHidden({ hidden: { rows: 2, columns: 1, included: false } })).toBe(true);
    expect(hasHidden({ hidden: { rows: 0, columns: 0, included: false } })).toBe(false);
    expect(hasHidden({ hidden: { rows: 0, columns: 0, included: true } })).toBe(true);
    expect(hasHidden({})).toBe(false);
    expect(hiddenLabel({ rows: 2, columns: 1, included: false })).toBe("Include the 2 rows and 1 column the sheet hides");
    expect(hiddenLabel({ rows: 1, columns: 0, included: false })).toBe("Include the 1 row the sheet hides");
    expect(hiddenLabel({ rows: 0, columns: 0, included: true })).toBe("Hidden rows and columns are included");
  });

  it("says rows left out for being hidden, by row, like any other reason", () => {
    const p = { tabs: [], leftOutBy: { hidden: 2 }, leftOut: [{ row: 3, tab: "S", why: "hidden" }, { row: 5, tab: "S", why: "hidden" }] } as never;
    expect(leftOutLines(p)).toEqual(["2 rows are hidden in the sheet, so they were left out (row 3, row 5)"]);
  });
});

/* ── placing the people by what the sheet says of them ── */

const word = (text: string, n: number, want: StatusWord["want"]): StatusWord => ({ text, n, want, word: null });
const person = (name: string, status?: string): RowToSend => ({ row: 2, tab: "T", state: "new", fields: { fullName: name }, ...(status ? { status } : {}) });
/** A tracker as the server reads it: the words, and each person with the words they were given. */
const tracker = (): Pick<PeopleSheet, "rows" | "statusWords"> => ({
  statusWords: [
    word("No response", 2, { stage: "outreach", step: "waiting" }),
    word("L2 interview scheduled", 1, { stage: "interviewing", step: "loop" }),
    word("Joined", 2, { stage: "hired" }),
    word("Not interested", 1, { stage: "passed" }),
    word("Not hired", 1, null),
    word("Interested", 1, { stage: "outreach", step: "replied" }),
  ],
  rows: [
    person("Asha", "No response"),
    person("Sana", "no response"),
    person("Meera", "L2 interview scheduled"),
    person("Dev", "Joined"),
    person("Ila", "Joined"),
    person("Tara", "Not interested"),
    person("Ravi", "Not hired"),
    person("Kiran", "Interested"),
    person("Hema"),
  ],
});

describe("a sheet's status words", () => {
  it("are one word whatever the capitals or spacing, as the server groups them", () => {
    expect(statusKey("  No   RESPONSE ")).toBe("no response");
    expect(statusKey("no response")).toBe(statusKey("No Response"));
  });

  it("start on what the rules read: a funnel stage for most, a tick of its own for joined and rejected, Shared for what nobody can place", () => {
    expect(kindOf({ stage: "outreach", step: "waiting" })).toBe("contacted");
    expect(kindOf({ stage: "outreach" })).toBe("contacted");
    expect(kindOf({ stage: "outreach", step: "replied" })).toBe("replied");
    expect(kindOf({ stage: "interviewing", step: "loop" })).toBe("interviewing");
    expect(kindOf({ stage: "interviewing", step: "offer" })).toBe("offer");
    expect(kindOf({ stage: "shortlisted" })).toBe("shared");
    expect(kindOf({ stage: "hired" })).toBe("hire");
    expect(kindOf({ stage: "passed" })).toBe("reject");
    expect(kindOf(null)).toBe("shared");
  });

  it("offer six choices for a word, and Hired and Rejected are not among them", () => {
    expect(PLACE_CHOICES.map(([, text]) => text)).toEqual(["Shared", "Contacted", "Replied", "Interviewing", "Offer", "Leave alone"]);
  });
});

describe("what the card offers for placing", () => {
  it("lists the sheet's own words with how many say each, the ones the rules know first in the order of the funnel, and the one nobody can place last", () => {
    const placing = placingOf([tracker()], {});
    expect(placing?.words.map((w) => [w.text, w.n, w.choice, w.unknown])).toEqual([
      ["No response", 2, "contacted", false],
      ["Interested", 1, "replied", false],
      ["L2 interview scheduled", 1, "interviewing", false],
      ["Not hired", 1, "shared", true],
    ]);
  });

  it("keeps joined and rejected out of the words: they are two ticks of their own, with the names of who they would move", () => {
    const placing = placingOf([tracker()], {});
    expect(placing?.words.some((w) => w.text === "Joined" || w.text === "Not interested")).toBe(false);
    expect(placing?.hire).toEqual(["Dev", "Ila"]);
    expect(placing?.reject).toEqual(["Tara"]);
  });

  it("never lists a word that denies a hire as a hire: 'Not hired' is a word nobody can place and stays on Shared", () => {
    const placing = placingOf([tracker()], {});
    expect(placing?.hire).not.toContain("Ravi");
    expect(placing?.kind[statusKey("Not hired")]).toBe("shared");
  });

  it("takes the person's choice for a word over the rules' reading, and never lets a choice turn a hire or a rejection on", () => {
    const placing = placingOf([tracker()], { [statusKey("No response")]: "leave", [statusKey("Joined")]: "interviewing", [statusKey("Not hired")]: "replied" });
    expect(placing?.kind[statusKey("No response")]).toBe("leave");
    expect(placing?.kind[statusKey("Not hired")]).toBe("replied");
    expect(placing?.kind[statusKey("Joined")]).toBe("hire");
  });

  it("counts the people it does not reach: no status, or a word the list does not carry", () => {
    const rows = [...tracker().rows, person("Odd", "Called twice, will think")];
    expect(placingOf([{ ...tracker(), rows }], {})?.unplaced).toBe(2);
  });

  it("is nothing at all when no one has a status", () => {
    expect(placingOf([{ rows: [person("Asha")] }], {})).toBeNull();
  });

  it("puts the words of several files together, each counted over every file's people", () => {
    const second = { statusWords: [word("no response", 1, { stage: "outreach", step: "waiting" })], rows: [person("Zed", "NO RESPONSE")] };
    const placing = placingOf([tracker(), second], {});
    expect(placing?.words.find((w) => w.key === statusKey("No response"))?.n).toBe(3);
    expect(placing?.words.filter((w) => w.key === statusKey("No response"))).toHaveLength(1);
  });

  it("draws as a tick, with a name for each of the two that hire and reject, and the count in the person's words", () => {
    const placing = placingOf([tracker()], {});
    const view = placeView(placing as NonNullable<typeof placing>, { on: true, hire: false, reject: false });
    expect(view.hire).toEqual({ on: false, label: "2 say they joined. Hiring takes a person off their other campaigns.", names: "Dev and Ila", said: "Their status says Joined (2)." });
    expect(view.reject).toEqual({ on: false, label: "1 says rejected. Move them to Rejected?", names: "Tara", said: "Their status says Not interested (1)." });
    expect(view.words[0]).toMatchObject({ text: "No response", count: "2 people", choice: "contacted" });
    expect(view.unplaced).toBe("1 person has no status to go by, and stays where they are.");
  });

  it("lists the sheet's own words behind the hire and reject ticks, each with how many say it, most said first, so the person can see what is being read as a hire", () => {
    const sheet = {
      statusWords: [word("Joined", 3, { stage: "hired" }), word("Hired by us", 2, { stage: "hired" }), word("Rejected", 1, { stage: "passed" })],
      rows: [person("Ana", "Joined"), person("Ben", "joined"), person("Cy", "Joined"), person("Dee", "Hired by us"), person("Eli", "Hired  by us"), person("Fay", "Rejected")],
    };
    const placing = placingOf([sheet], {}) as NonNullable<ReturnType<typeof placingOf>>;
    expect(placing.hireWords).toEqual([{ text: "Joined", n: 3 }, { text: "Hired by us", n: 2 }]);
    expect(placing.rejectWords).toEqual([{ text: "Rejected", n: 1 }]);
    const view = placeView(placing, { on: true, hire: false, reject: false });
    expect(view.hire?.said).toBe("Their status says Joined (3), Hired by us (2).");
    expect(view.reject?.said).toBe("Their status says Rejected (1).");
  });

  it("says the first few of those words and how many more, and clips a long one", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ text: `Word ${i}`, n: 7 - i }));
    expect(saidLine(many)).toBe("Their status says Word 0 (7), Word 1 (6), Word 2 (5), Word 3 (4), Word 4 (3) and 2 more.");
    expect(saidLine([{ text: `  ${"x".repeat(80)}  `, n: 1 }])).toBe(`Their status says ${"x".repeat(60)} (1).`);
  });

  it("holds a tick only for the people and words it named: the same set in another order is the same, and any other set is not", () => {
    const base = placingOf([tracker()], {}) as NonNullable<ReturnType<typeof placingOf>>;
    const turned = placingOf([{ ...tracker(), rows: [...tracker().rows].reverse() }], {}) as NonNullable<typeof base>;
    expect(turned.hireKey).toBe(base.hireKey);
    expect(turned.rejectKey).toBe(base.rejectKey);
    // A second tab ticked, a rule, another file: the sheet is read again and 'Joined' now names another person too.
    const more = placingOf([{ ...tracker(), rows: [...tracker().rows, person("Zed", "Joined"), person("Yan", "Not interested")] }], {}) as NonNullable<typeof base>;
    expect(more.hireKey).not.toBe(base.hireKey);
    expect(more.rejectKey).not.toBe(base.rejectKey);
    // What a word the rules read as something else is set to does not change who is hired.
    const chosen = placingOf([tracker()], { [statusKey("No response")]: "leave" }) as NonNullable<typeof base>;
    expect(chosen.hireKey).toBe(base.hireKey);
    expect(stillHolds(base.hireKey, base.hireKey)).toBe(true);
    expect(stillHolds(base.hireKey, more.hireKey)).toBe(false);
    expect(stillHolds(base.hireKey, undefined)).toBe(false);
    expect(stillHolds(null, base.hireKey)).toBe(false);
    expect(namedBy(["B", "A"], [{ text: "Joined", n: 2 }])).toBe(namedBy(["A", "B"], [{ text: "joined", n: 2 }]));
    expect(namedBy(["A", "B"], [{ text: "Joined", n: 2 }])).not.toBe(namedBy(["A", "B"], [{ text: "Hired", n: 2 }]));
  });

  it("names the first few, then how many more", () => {
    expect(namesLine(["A", "B"])).toBe("A and B");
    expect(namesLine(["A"])).toBe("A");
    expect(namesLine(["A", "B", "C", "D", "E", "F", "G"])).toBe("A, B, C, D, E and 2 more");
  });
});

describe("where a person's status puts them", () => {
  const placing = placingOf([tracker()], {}) as NonNullable<ReturnType<typeof placingOf>>;
  const off = { hire: false, reject: false };

  it("moves them to the stage and step their word's choice says, and writes the sheet's word as the reason", () => {
    expect(moveFor("No response", placing, off)).toEqual({ kind: "move", stage: "outreach", step: "waiting", word: "No response" });
    expect(moveFor("NO  response", placing, off)).toMatchObject({ stage: "outreach", step: "waiting" });
    expect(moveFor("L2 interview scheduled", placing, off)).toMatchObject({ stage: "interviewing", step: "loop" });
    expect(moveFor("Interested", placing, off)).toMatchObject({ stage: "outreach", step: "replied" });
  });

  it("moves no one for Shared, Leave alone, no status, or a word the list does not carry", () => {
    expect(moveFor("Not hired", placing, off)).toBeNull();
    expect(moveFor(undefined, placing, off)).toBeNull();
    expect(moveFor("Called twice, will think", placing, off)).toBeNull();
    const left = placingOf([tracker()], { [statusKey("No response")]: "leave" }) as NonNullable<typeof placing>;
    expect(moveFor("No response", left, off)).toBeNull();
  });

  it("hires and rejects only when that tick is on, each on its own", () => {
    expect(moveFor("Joined", placing, off)).toBeNull();
    expect(moveFor("Not interested", placing, off)).toBeNull();
    expect(moveFor("Joined", placing, { hire: true, reject: false })).toEqual({ kind: "hire", stage: "hired", step: null, word: "Joined" });
    expect(moveFor("Not interested", placing, { hire: true, reject: false })).toBeNull();
    expect(moveFor("Not interested", placing, { hire: false, reject: true })).toEqual({ kind: "reject", stage: "passed", step: null, word: "Not interested" });
    expect(moveFor("Joined", placing, { hire: false, reject: true })).toBeNull();
  });
});

describe("the moves, once the import has said who is on the campaign", () => {
  const placing = placingOf([tracker()], {}) as NonNullable<ReturnType<typeof placingOf>>;

  it("pairs each answer with the person sent in that place (the import numbers from 2) and leaves out the ones it did not add", () => {
    const batch = [{ status: "No response" }, { status: "Joined" }, { status: "Interested" }, { status: "L2 interview scheduled" }, { status: "No response" }];
    const answer = { rows: [
      { row: 2, kind: "new", candidateId: "c-a" },
      { row: 3, kind: "duplicate", candidateId: "c-b" },
      { row: 4, kind: "error" },
      { row: 5, kind: "repeat" },
      { row: 6, kind: "new" },
    ] };
    const moves = movesFrom(answer, batch, placing, { hire: true, reject: false });
    expect(moves.map((m) => [m.candidateId, m.kind, m.stage])).toEqual([["c-a", "move", "outreach"], ["c-b", "hire", "hired"]]);
    expect(movesFrom(answer, batch, placing, { hire: false, reject: false }).map((m) => m.candidateId)).toEqual(["c-a"]);
    expect(movesFrom({}, batch, placing, { hire: true, reject: true })).toEqual([]);
  });

  it("moves a person the sheet lists again by each of their rows in turn, as a link to the sheet does, so the last row is where they end", () => {
    const tara = { ...person("Tara", "No response"), alsoSaid: ["L2 interview scheduled", "Joined"] };
    const sheet = { statusWords: tracker().statusWords, rows: [tara, person("Ravi", "Interested")] };
    const again = placingOf([sheet], {}) as NonNullable<ReturnType<typeof placingOf>>;
    const answer = { rows: [{ row: 2, kind: "new", candidateId: "c-tara" }, { row: 3, kind: "new", candidateId: "c-ravi" }] };
    const batch = [{ status: tara.status, alsoSaid: tara.alsoSaid }, { status: "Interested" }];
    expect(movesFrom(answer, batch, again, { hire: false, reject: false }).map((m) => [m.candidateId, m.stage, m.step])).toEqual([
      ["c-tara", "outreach", "waiting"],
      ["c-tara", "interviewing", "loop"],
      ["c-ravi", "outreach", "replied"],
    ]);
    // Her later row says she joined: that is a hire, and only when the hire tick is on.
    const hired = movesFrom(answer, batch, again, { hire: true, reject: false });
    expect(hired.map((m) => [m.candidateId, m.kind])).toEqual([["c-tara", "move"], ["c-tara", "move"], ["c-tara", "hire"], ["c-ravi", "move"]]);
    expect(placeRequests(hired)[0]?.hire).toEqual(["c-tara"]);
  });

  it("offers the words and the names of a person the sheet lists again from every row they have, once each", () => {
    const sheet = {
      statusWords: tracker().statusWords,
      rows: [
        { ...person("Tara", "No response"), alsoSaid: ["Joined", "Not interested"] },
        { ...person("Meera", "L2 interview scheduled"), alsoSaid: ["Joined", "Joined (again)"] },
        person("Hema"),
      ],
    };
    const placing = placingOf([sheet], {}) as NonNullable<ReturnType<typeof placingOf>>;
    expect(placing.hire).toEqual(["Tara", "Meera"]);
    expect(placing.reject).toEqual(["Tara"]);
    expect(placing.words.map((w) => [w.text, w.n])).toEqual([["No response", 1], ["L2 interview scheduled", 1]]);
    // "Joined (again)" is a word the list does not carry, so it places no one; Hema has no status at all.
    expect(placing.unplaced).toBe(1);
  });

  it("cuts into requests that each list the ids ticked for hiring and for rejecting among their own moves", () => {
    const moves = Array.from({ length: PLACE_BATCH + 3 }, (_, i) => ({
      candidateId: `c-${i}`,
      kind: (i === 0 ? "hire" : i === PLACE_BATCH ? "reject" : "move") as "hire" | "reject" | "move",
      stage: (i === 0 ? "hired" : i === PLACE_BATCH ? "passed" : "outreach") as "hired" | "passed" | "outreach",
      step: i === 0 || i === PLACE_BATCH ? null : ("waiting" as const),
      word: "w",
    }));
    const requests = placeRequests(moves);
    expect(requests.map((r) => r.moves.length)).toEqual([PLACE_BATCH, 3]);
    expect(requests[0]?.hire).toEqual(["c-0"]);
    expect(requests[0]?.reject).toEqual([]);
    expect(requests[1]?.reject).toEqual([`c-${PLACE_BATCH}`]);
    expect(requests[1]?.hire).toEqual([]);
    expect(requests[0]?.moves[0]).toEqual({ candidateId: "c-0", stage: "hired", word: "w" });
    expect(requests[0]?.moves[1]).toEqual({ candidateId: "c-1", stage: "outreach", step: "waiting", word: "w" });
  });
});

describe("making the moves", () => {
  const answer = (over: Partial<PlaceAnswer> = {}): PlaceAnswer => ({ moved: {}, kept: 0, waiting: [], refused: [], ...over });
  const moves = (count: number) => Array.from({ length: count }, (_, i) => ({ candidateId: `c-${i}`, kind: "move" as const, stage: "outreach" as const, step: "waiting" as const, word: "w" }));

  it("adds up what each request did, and does nothing at all when there is nothing to move", async () => {
    const sent: PlaceRequest[] = [];
    const total = await placeAll(moves(PLACE_BATCH + 1), async (r) => {
      sent.push(r);
      return answer({ moved: { outreach: r.moves.length }, waiting: sent.length === 1 ? [{}] : [] });
    });
    expect(sent).toHaveLength(2);
    expect(total).toEqual({ moved: { outreach: PLACE_BATCH + 1 }, waiting: 1, refused: 0 });
    expect(await placeAll([], async () => answer())).toBeNull();
  });

  it("counts the people it could not reach as not moved when a request fails, with the ones after it, and says nothing of the ones before", async () => {
    let calls = 0;
    const total = await placeAll(moves(PLACE_BATCH * 2 + 5), async (r) => {
      calls += 1;
      if (calls === 2) throw new Error("down");
      return answer({ moved: { outreach: r.moves.length } });
    });
    expect(calls).toBe(2);
    expect(total).toEqual({ moved: { outreach: PLACE_BATCH }, waiting: 0, refused: PLACE_BATCH + 5 });
  });

  it("stops without counting when the card was left", async () => {
    const stop = new AbortController();
    const total = await placeAll(moves(3), async () => { stop.abort(); throw new Error("cancelled"); }, stop.signal);
    expect(total).toEqual({ moved: {}, waiting: 0, refused: 0 });
  });

  it("takes the server's answer as people moved by stage, hires waiting for a yes, and moves refused", () => {
    expect(placedOf(answer({ moved: { interviewing: 3 }, waiting: [{}, {}], refused: [{}] }))).toEqual({ moved: { interviewing: 3 }, waiting: 2, refused: 1 });
    expect(addPlaced({ moved: { passed: 1 }, waiting: 1, refused: 0 }, { moved: { passed: 1, hired: 2 }, waiting: 0, refused: 1 })).toEqual({ moved: { passed: 2, hired: 2 }, waiting: 1, refused: 1 });
  });
});

describe("the line that says what placing did", () => {
  const added = { added: 42, already: 6, failed: 0 };

  it("extends the line for the adding: who moved to which stage, who waits for a yes", () => {
    expect(doneLine(added, "Senior Backend", { moved: { interviewing: 3, passed: 2 }, waiting: 2, refused: 0 })).toBe(
      "Added 42 people to the Senior Backend shortlist. 6 were already in Candidates and are on the shortlist now. 3 moved to Interviewing, 2 to Rejected. 2 need your yes because they are on another campaign.",
    );
  });

  it("names the stages in the order of the funnel, with the first as 'moved to' and the rest as 'to'", () => {
    expect(placedLines({ moved: { passed: 1, outreach: 4, hired: 1, interviewing: 2 }, waiting: 0, refused: 0 })).toEqual(["4 moved to In outreach, 2 to Interviewing, 1 to Hired, 1 to Rejected."]);
    expect(placedLines({ moved: { outreach: 1 }, waiting: 1, refused: 0 })).toEqual(["1 moved to In outreach.", "1 needs your yes because they are on another campaign."]);
  });

  it("says who could not be moved, and says nothing of placing when nothing was asked or done", () => {
    expect(placedLines({ moved: {}, waiting: 0, refused: 2 })).toEqual(["2 people couldn't be moved."]);
    expect(placedLines({ moved: {}, waiting: 0, refused: 0 })).toEqual([]);
    expect(doneLine(added, "Senior Backend")).toBe(doneLine(added, "Senior Backend", null));
    expect(doneLine(added, "Senior Backend", { moved: {}, waiting: 0, refused: 0 })).toBe(doneLine(added, "Senior Backend"));
  });

  it("ends on the moves alone when no one was new", () => {
    expect(doneLine({ added: 0, already: 0, failed: 0 }, "Backend", { moved: { passed: 1 }, waiting: 0, refused: 0 })).toBe("1 moved to Rejected.");
  });
});

describe("a request to place people stays inside the time a request is given", () => {
  const move = (i: number) => ({ candidateId: `c-${i}`, kind: "move" as const, stage: "outreach" as const, step: "waiting" as const, word: "w" });

  it("carries no more moves than the server takes (each is a transaction of its own, about half a second at a remote database)", () => {
    expect(PLACE_BATCH).toBeLessThanOrEqual(100);
    const requests = placeRequests(Array.from({ length: 120 }, (_, i) => move(i)));
    expect(requests.length).toBeGreaterThan(1);
    for (const r of requests) expect(r.moves.length).toBeLessThanOrEqual(100);
  });
});

describe("adding people and placing them as they go in", () => {
  const placing = placingOf([tracker()], {}) as NonNullable<ReturnType<typeof placingOf>>;
  /** The import's answer for a batch: everyone is new, and is who the card calls c-<place in the sheet>. */
  const answerFor = (start: number, count: number): BatchResult => ({
    created: count,
    skipped: 0,
    errors: [],
    rows: Array.from({ length: count }, (_, i) => ({ row: i + 2, kind: "new", candidateId: `c-${start + i}` })),
  });
  /** A sheet a little longer than a batch: the first of each batch says Joined, the rest say No response. */
  const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ fields: { fullName: `P${i}` }, status: i % BATCH_ROWS === 0 ? "Joined" : "No response" }));
  const server = () => {
    const requests: PlaceRequest[] = [];
    return {
      requests,
      place: async (r: PlaceRequest): Promise<PlaceAnswer> => {
        requests.push(r);
        return { moved: { outreach: r.moves.length - r.hire.length, ...(r.hire.length ? { hired: r.hire.length } : {}) }, kept: 0, waiting: [], refused: [] };
      },
    };
  };

  it("puts the people of each batch on their stages as the batch goes in, so a try that stops at the second has placed everyone it added", async () => {
    const { requests, place } = server();
    let sent = 0;
    const { run, placed } = await addAndPlace(rows(BATCH_ROWS + 5), {
      send: async (fields) => {
        if (sent > 0) throw new Error("down");
        const answer = answerFor(sent, fields.length);
        sent += fields.length;
        return answer;
      },
      place,
      placing,
      ticks: { hire: true, reject: false },
    });
    expect(run.failure).not.toBeNull();
    expect(run.sent).toBe(BATCH_ROWS);
    // The batch's moves go in requests of their own size; none is for anyone in the batch that failed.
    expect(requests.flatMap((r) => r.moves)).toHaveLength(BATCH_ROWS);
    expect(requests.flatMap((r) => r.moves.map((m) => m.candidateId)).every((id) => Number(id.slice(2)) < BATCH_ROWS)).toBe(true);
    expect(requests.flatMap((r) => r.hire)).toEqual(["c-0"]);
    expect(placed).toEqual({ moved: { outreach: BATCH_ROWS - 1, hired: 1 }, waiting: 0, refused: 0 });
  });

  it("owes nothing to a later try: one made under other ticks places only the people it adds, and hires nobody the person has since refused", async () => {
    const first = server();
    const before = await addAndPlace(rows(BATCH_ROWS + 5), {
      send: async (fields) => {
        if (first.requests.length > 0) throw new Error("down");
        return answerFor(0, fields.length);
      },
      place: first.place,
      placing,
      ticks: { hire: true, reject: false },
    });
    // The person takes the hire tick off, and the card, read again, offers only who is left (the first is already on the campaign).
    const second = server();
    const left = rows(BATCH_ROWS + 5).slice(BATCH_ROWS);
    const after = await addAndPlace(left, {
      send: async (fields) => answerFor(1_000, fields.length),
      place: second.place,
      placing,
      ticks: { hire: false, reject: false },
    });
    expect(before.placed?.moved.hired).toBe(1);
    // The first of them says Joined, which is no longer ticked, so it moves nobody; the other four do.
    expect(second.requests.flatMap((r) => r.moves.map((m) => m.candidateId))).toEqual(Array.from({ length: 4 }, (_, i) => `c-${1_001 + i}`));
    expect(second.requests.flatMap((r) => r.hire)).toEqual([]);
    expect(after.placed).toEqual({ moved: { outreach: 4 }, waiting: 0, refused: 0 });
    // What the card says is what each try did, added up.
    expect(carryPlaced(before.placed, after.placed)).toEqual({ moved: { outreach: BATCH_ROWS - 1 + 4, hired: 1 }, waiting: 0, refused: 0 });
  });

  it("places the batch that went in even when the card is left meanwhile, and sends no batch after it", async () => {
    const { requests, place } = server();
    const stop = new AbortController();
    const { run, placed } = await addAndPlace(rows(BATCH_ROWS + 5), {
      send: async (fields) => {
        stop.abort();
        return answerFor(0, fields.length);
      },
      place,
      placing,
      ticks: { hire: false, reject: false },
      signal: stop.signal,
    });
    expect(run.stopped).toBe(true);
    expect(run.sent).toBe(BATCH_ROWS);
    expect(requests.flatMap((r) => r.moves)).toHaveLength(BATCH_ROWS - 1);
    expect(placed?.moved.outreach).toBe(BATCH_ROWS - 1);
  });

  it("places no one when nobody asked for it or there is nowhere to put them, and still adds them", async () => {
    const { requests, place } = server();
    const send = async (fields: readonly unknown[]) => answerFor(0, fields.length);
    const off = await addAndPlace(rows(3), { send, place, placing: null, ticks: { hire: true, reject: true } });
    const nowhere = await addAndPlace(rows(3), { send, placing, ticks: { hire: true, reject: true } });
    expect(requests).toEqual([]);
    expect([off.placed, nowhere.placed]).toEqual([null, null]);
    expect([off.run.sent, nowhere.run.sent]).toEqual([3, 3]);
  });

  it("counts the moves a failing request could not make, in the line, and goes on adding", async () => {
    const { run, placed } = await addAndPlace(rows(3), {
      send: async (fields) => answerFor(0, fields.length),
      place: async () => { throw new Error("down"); },
      placing,
      ticks: { hire: false, reject: false },
    });
    expect(run.failure).toBeNull();
    expect(placed).toEqual({ moved: {}, waiting: 0, refused: 2 });
  });

  it("adds up across tries, and says nothing of placing when there was none", () => {
    expect(carryPlaced(null, null)).toBeNull();
    const a = { moved: { hired: 1 }, waiting: 0, refused: 0 };
    expect(carryPlaced(a, null)).toBe(a);
    expect(carryPlaced(null, a)).toBe(a);
    expect(carryPlaced(a, { moved: { hired: 2, passed: 1 }, waiting: 1, refused: 1 })).toEqual({ moved: { hired: 3, passed: 1 }, waiting: 1, refused: 1 });
  });

  it("says what the tries that stopped short placed, beside who they added", () => {
    const line = stoppedLine("Can't reach SuperHyre. Check your connection and try again.", { added: 150 }, { moved: { interviewing: 3, passed: 2 }, waiting: 1, refused: 0 });
    expect(line).toBe(
      "Can't reach SuperHyre. Check your connection and try again. 150 people were added before it stopped. 3 moved to Interviewing, 2 to Rejected. 1 needs your yes because they are on another campaign. Adding again carries on with the rest, and nobody is added twice.",
    );
    expect(stoppedLine("Stopped.", { added: 1 }, null)).toBe(stoppedLine("Stopped.", { added: 1 }));
    expect(stoppedLine("Stopped.", { added: 1 }, { moved: {}, waiting: 0, refused: 0 })).toBe(stoppedLine("Stopped.", { added: 1 }));
  });
});
