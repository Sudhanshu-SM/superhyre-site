import { describe, expect, it } from "vitest";
import {
  type AddContext,
  FOLLOW_UP_LABEL,
  type LinkDoor,
  LIMIT_LINE,
  MAX_FILES,
  SHOW_REQUIREMENTS,
  campaignNamedIn,
  campaignsIn,
  canBe,
  contentWords,
  filesOfAdding,
  filesOfArtifact,
  fits,
  followUpAfter,
  followUpOf,
  hasInstruction,
  inTurns,
  isOldExcel,
  jdFailureLine,
  jdRead,
  jdReading,
  kindOf,
  liftLinksFrom,
  linkName,
  menuFor,
  mismatch,
  oldExcelLine,
  outgoing,
  placeholderFor,
  readingNote,
  refusalFor,
  resultWord,
  rolesSeedOf,
  scopesFor,
  sendable,
  sheetRefusal,
  shortName,
  suggest,
  takeLinks,
} from "../adding";
import type { Attachment } from "../attachments";
import type { PeopleSheet } from "../peopleSheet";
import { requestFor, resumeSeedOf } from "../resumeSheet";

/**
 * What the paperclip adds: the rows of its menu for the chat the person is in, what a file may be chosen as, what a dropped one is
 * suggested to be, the line that says a file looks like something else, the limits, and how the chips become messages. All pure.
 */

const NONE: AddContext = { campaign: null, mayChange: false, closed: false, canStart: true, count: 0 };
const MINE: AddContext = { campaign: "Senior Backend", mayChange: true, closed: false, canStart: true, count: 0 };
const FOLLOWING: AddContext = { ...MINE, mayChange: false };
const CLOSED: AddContext = { ...MINE, closed: true };

const rows = (ctx: AddContext) => menuFor(ctx).map((r) => r.scope);

describe("the menu: What are you adding?", () => {
  it("has three rows when no campaign is in the chat, and says what each does", () => {
    const menu = menuFor(NONE);
    expect(menu.map((r) => [r.scope, r.label])).toEqual([
      ["candidates", "Candidates"],
      ["roles", "Job descriptions"],
      ["read", "Something to read"],
    ]);
    expect(menu[0]?.help).toBe("A sheet of people, or resumes. They go to your Candidates.");
    expect(menu[1]?.help).toBe("One or many, or a sheet of roles. Each becomes a campaign.");
    expect(menu[2]?.help).toBe("A brief, notes or any document. Nothing is added.");
  });

  it("has four rows for a campaign the person may change, and names the campaign in the help", () => {
    const menu = menuFor(MINE);
    expect(menu.map((r) => [r.scope, r.label])).toEqual([
      ["candidates", "Candidates"],
      ["job_description", "Job description"],
      ["roles", "More roles"],
      ["read", "Something to read"],
    ]);
    expect(menu[0]?.help).toBe("A sheet of people, or resumes. They go on the Senior Backend shortlist.");
    expect(menu[1]?.help).toBe("Replaces the one on Senior Backend. The old one is kept.");
    expect(menu[2]?.help).toBe("Job descriptions or a sheet of roles. Each becomes a new campaign.");
  });

  it("has no job description row for a campaign the person only follows or that is closed, and says where the people go instead", () => {
    for (const ctx of [FOLLOWING, CLOSED]) {
      expect(rows(ctx)).toEqual(["candidates", "roles", "read"]);
      expect(menuFor(ctx)[0]?.help).toBe("A sheet of people, or resumes. They go to your Candidates, not to Senior Backend.");
      expect(menuFor(ctx)[1]?.label).toBe("Job descriptions");
    }
  });

  it("takes the picker only as far as the kind: one job description, documents alone to read, and a sheet is never offered as .xls", () => {
    const by = Object.fromEntries(menuFor(MINE).map((r) => [r.scope, r]));
    expect(by.job_description).toMatchObject({ multiple: false });
    expect(by.job_description?.accept.split(",")).not.toContain(".xlsx");
    expect(by.read?.accept.split(",")).not.toContain(".xlsx");
    expect(by.read?.accept.split(",")).not.toContain(".csv");
    for (const scope of ["candidates", "roles"] as const) {
      expect(by[scope]?.multiple).toBe(true);
      const types = by[scope]?.accept.split(",") ?? [];
      expect(types).toEqual(expect.arrayContaining([".xlsx", ".csv", ".tsv", ".pdf", ".docx"]));
      expect(types).not.toContain(".xls");
    }
  });

  it("says why the rows that start campaigns can not be chosen by someone who may not start them", () => {
    const menu = menuFor({ ...NONE, canStart: false });
    expect(menu.find((r) => r.scope === "roles")?.disabled).toBe("Only owners and admins can start campaigns.");
    expect(menu.find((r) => r.scope === "candidates")?.disabled).toBeUndefined();
    // A job description for a campaign they may change needs no right to start one.
    const mine = menuFor({ ...MINE, canStart: false });
    expect(mine.find((r) => r.scope === "job_description")?.disabled).toBeUndefined();
    expect(mine.find((r) => r.scope === "roles")?.disabled).toBe("Only owners and admins can start campaigns.");
  });

  it("is still there at the limit, with every row off and the one sentence for it", () => {
    expect(MAX_FILES).toBe(10);
    for (const r of menuFor({ ...MINE, count: MAX_FILES })) expect(r.disabled).toBe("Up to 10 files go in one message. Remove one to add more.");
    expect(menuFor({ ...MINE, count: MAX_FILES - 1 }).every((r) => !r.disabled)).toBe(true);
  });
});

describe("what a file may be", () => {
  it("tells a sheet from a document by its name or type", () => {
    expect(kindOf({ name: "leads.xlsx", type: "" })).toBe("sheet");
    expect(kindOf({ name: "x", type: "text/csv" })).toBe("sheet");
    expect(kindOf({ name: "brief.pdf", type: "application/pdf" })).toBe("document");
  });

  it("is never a sheet read by the agent or one job description: a spreadsheet is candidates or roles", () => {
    expect(canBe("sheet", "candidates")).toBe(true);
    expect(canBe("sheet", "roles")).toBe(true);
    expect(canBe("sheet", "read")).toBe(false);
    expect(canBe("sheet", "job_description")).toBe(false);
    for (const scope of ["candidates", "roles", "job_description", "read"] as const) expect(canBe("document", scope)).toBe(true);
    expect(scopesFor("sheet", MINE)).toEqual(["candidates", "roles"]);
    expect(scopesFor("document", MINE)).toEqual(["candidates", "job_description", "roles", "read"]);
    expect(scopesFor("document", FOLLOWING)).toEqual(["candidates", "roles", "read"]);
  });

  it("says why a sheet can not be read, and does not refuse what can be", () => {
    expect(refusalFor({ name: "a.xlsx", type: "" }, "read")).toMatch(/spreadsheet, which I can't read here/);
    expect(refusalFor({ name: "a.xlsx", type: "" }, "job_description")).toMatch(/choose More roles/);
    expect(refusalFor({ name: "a.xlsx", type: "" }, "candidates")).toBeNull();
    expect(refusalFor({ name: "a.pdf", type: "application/pdf" }, "read")).toBeNull();
  });

  it("refuses a sheet that is empty or over 10 MB before anything is sent", () => {
    expect(sheetRefusal({ name: "a.csv", size: 0 })).toBe("a.csv is empty.");
    expect(sheetRefusal({ name: "big.xlsx", size: 11 * 1024 * 1024 })).toBe("big.xlsx is over 10 MB. Attach a smaller file.");
    expect(sheetRefusal({ name: "ok.xlsx", size: 3 * 1024 * 1024 })).toBeNull();
  });

  it("knows an old Excel file by its first four bytes, which the server only turns away after the whole upload", () => {
    expect(isOldExcel(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0]))).toBe(true);
    expect(isOldExcel(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
  });

  it("says on the chip that it is an old Excel file or a workbook with a password, since both show the same header, and what to do about either", () => {
    const line = oldExcelLine("leads.xls");
    expect(line).toBe("leads.xls is an old Excel file, or a workbook with a password. Open it, save it as .xlsx or CSV with no password, and attach it again.");
    expect(line).toContain("a workbook with a password");
    expect(line).not.toMatch(/—|–/);
  });
});

const chip = (over: Partial<Attachment> = {}): Attachment => ({ id: "a1", name: "leads.xlsx", origin: "file", size: 1000, status: "ready", text: "", ...over });
const sheetOf = (kind: PeopleSheet["kind"], people = 0): PeopleSheet =>
  ({
    kind,
    tabs: [],
    tab: null,
    headerRow: null,
    columns: [],
    needsCheck: false,
    counts: { rows: people, people, toAdd: people, alreadyHere: 0, onCampaign: 0, repeats: 0, left: 0, namesFromLinks: 0, phonesRebuilt: 0, phonesCut: 0 },
    leftOutBy: {},
    leftOut: [],
    rows: [],
  }) as PeopleSheet;
const people = (id: string, over: Partial<Attachment> = {}) =>
  chip({ id, name: `${id}.xlsx`, kind: "sheet", scope: "candidates", sheet: sheetOf("people", 61), ...over });
const doc = (id: string, scope: Attachment["scope"], over: Partial<Attachment> = {}) =>
  chip({ id, name: `${id}.pdf`, kind: "document", scope, text: `Text of ${id}`, docKind: "document", ...over });

describe("a dropped file is suggested, never chosen for the person", () => {
  it("is candidates for a sheet of people (and for one that is neither, the card says so), roles for a sheet of roles", () => {
    expect(suggest({ kind: "sheet", sheetKind: "people" }, MINE)).toBe("candidates");
    expect(suggest({ kind: "sheet", sheetKind: "other" }, MINE)).toBe("candidates");
    expect(suggest({ kind: "sheet", sheetKind: "roles" }, MINE)).toBe("roles");
  });

  it("is a job description only when the reader called it one and the person may put one on the campaign; else roles", () => {
    expect(suggest({ kind: "document", docKind: "job_description" }, MINE)).toBe("job_description");
    expect(suggest({ kind: "document", docKind: "job_description" }, NONE)).toBe("roles");
    expect(suggest({ kind: "document", docKind: "job_description" }, FOLLOWING)).toBe("roles");
  });

  it("is a candidate for a resume, which the card shows before anything is added, and something to read for any other document", () => {
    expect(suggest({ kind: "document", docKind: "resume" }, MINE)).toBe("candidates");
    expect(suggest({ kind: "document", docKind: "resume" }, NONE)).toBe("candidates");
    expect(suggest({ kind: "document", docKind: "document" }, MINE)).toBe("read");
  });
});

describe("the limits, counted over every chip", () => {
  const full = (n: number) => Array.from({ length: n }, (_, i) => chip({ id: `f${i}`, name: `f${i}.pdf`, size: 10 + i }));

  it("is ten files in all, the next campaign's job description among them", () => {
    expect(fits(full(9), { name: "x.pdf", size: 1 }, { kind: "document", scope: "read" })).toBeNull();
    expect(fits(full(10), { name: "x.pdf", size: 1 }, { kind: "document", scope: "read" })).toBe(LIMIT_LINE);
    expect(fits([...full(9), chip({ id: "next-jd" })], { name: "x.pdf", size: 1 }, { kind: "document", scope: "read" })).toBe(LIMIT_LINE);
  });

  it("is five sheets, and five files to read", () => {
    const sheets = Array.from({ length: 5 }, (_, i) => people(`s${i}`, { size: 5 + i }));
    expect(fits(sheets, { name: "six.xlsx", size: 99 }, { kind: "sheet", scope: "candidates" })).toBe("Up to 5 sheets go in one message.");
    const reads = Array.from({ length: 5 }, (_, i) => doc(`r${i}`, "read", { size: 5 + i }));
    expect(fits(reads, { name: "six.pdf", size: 99 }, { kind: "document", scope: "read" })).toBe("Up to 5 files can be read at once.");
    expect(fits(reads, { name: "six.pdf", size: 99 }, { kind: "document", scope: "roles" })).toBeNull();
  });

  it("is one job description for a campaign, many resumes, and the same file twice is told", () => {
    expect(fits([doc("jd", "job_description")], { name: "b.pdf", size: 5 }, { kind: "document", scope: "job_description" })).toBe(
      "One job description for this campaign. Choose More roles for several.",
    );
    expect(fits([chip({ id: "next-jd" })], { name: "b.pdf", size: 5 }, { kind: "document", scope: "job_description" })).toMatch(/One job description/);
    const resumes = Array.from({ length: 9 }, (_, i) => doc(`cv${i}`, "candidates", { size: 20 + i }));
    expect(fits(resumes, { name: "b.pdf", size: 5 }, { kind: "document", scope: "candidates" })).toBeNull();
    expect(fits(resumes, { name: "c.docx", size: 6 }, { kind: "sheet", scope: "candidates" })).toBeNull();
    expect(fits([people("a", { name: "leads.xlsx", size: 7 })], { name: "leads.xlsx", size: 7 }, { kind: "sheet", scope: "candidates" })).toBe("leads.xlsx is already added.");
  });
});

describe("a file that looks like something else", () => {
  it("is a list of roles chosen as Candidates: said once, with the way to read it as roles and the way to keep it as candidates", () => {
    const m = mismatch(people("tenders", { name: "tenders.xlsx", sheet: sheetOf("roles") }), MINE);
    expect(m?.line).toBe("tenders.xlsx reads like a list of roles, not people.");
    expect(m?.actions).toEqual([{ label: "Use as more roles", scope: "roles" }, { label: "Keep as candidates", keep: true }]);
    expect(mismatch(people("tenders", { name: "tenders.xlsx", sheet: sheetOf("roles") }), NONE)?.actions[0]?.label).toBe("Use as job descriptions");
  });

  it("is settled by keeping a roles sheet as candidates: the line goes, the chip is sent as candidates, and says it needs a look rather than that it is roles", () => {
    const kept = people("tenders", { name: "tenders.xlsx", sheet: sheetOf("roles"), kept: true });
    expect(mismatch(kept, MINE)).toBeNull();
    expect(sendable(kept, MINE)).toBe(true);
    expect(resultWord(kept)).toBe("Needs a look");
    // Left as chosen and unsettled, it is a roles sheet to the person: the word says so, and the chip is not sent.
    expect(resultWord(people("tenders", { sheet: sheetOf("roles") }))).toBe("Roles");
    const out = outgoing([kept], "", NOW);
    expect(out?.messages[0]?.adding?.groups[0]).toMatchObject({ scope: "candidates", files: [{ name: "tenders.xlsx", kind: "sheet" }] });
  });

  it("is a list of people chosen as Roles, which the person may keep", () => {
    const m = mismatch(people("p", { scope: "roles", sheet: sheetOf("people", 4) }), MINE);
    expect(m?.line).toBe("p.xlsx reads like a list of people, not roles.");
    expect(m?.actions).toEqual([{ label: "Use as candidates", scope: "candidates" }, { label: "Keep as roles", keep: true }]);
    expect(mismatch(people("p", { scope: "roles", sheet: sheetOf("people", 4), kept: true }), MINE)).toBeNull();
  });

  it("is a resume chosen as a job description, and a job description chosen as a candidate", () => {
    expect(mismatch(doc("cv", "job_description", { docKind: "resume" }), MINE)?.line).toBe("cv.pdf reads like a resume, not a job description.");
    expect(mismatch(doc("cv", "job_description", { docKind: "resume" }), MINE)?.actions.map((a) => a.label)).toEqual(["Use as something to read", "Keep as job description"]);
    expect(mismatch(doc("jd", "candidates", { docKind: "job_description" }), MINE)?.line).toBe(
      "jd.pdf reads like a job description. Candidates need a name and a LinkedIn link, email or phone.",
    );
  });

  it("is nothing for a file that fits, one still being read, or one that failed", () => {
    expect(mismatch(people("ok"), MINE)).toBeNull();
    expect(mismatch(people("busy", { status: "reading", sheet: undefined }), MINE)).toBeNull();
    expect(mismatch(people("bad", { status: "failed", sheet: sheetOf("roles") }), MINE)).toBeNull();
    expect(mismatch(doc("n", "read", { docKind: "resume" }), MINE)).toBeNull();
  });

  it("says on the chip what the sheet held", () => {
    expect(resultWord(people("a"))).toBe("61 people");
    expect(resultWord(people("a", { sheet: sheetOf("people", 1) }))).toBe("1 person");
    expect(resultWord(people("a", { sheet: sheetOf("roles") }))).toBe("Roles");
    expect(resultWord(people("a", { sheet: sheetOf("other") }))).toBe("Needs a look");
    expect(resultWord(people("a", { status: "reading", sheet: undefined }))).toBe("Reading…");
    // A sheet with more people than can be added at once has no reading, and says how many it holds.
    expect(resultWord(people("a", { sheet: undefined, tooMany: 12_000 }))).toBe("12,000 people");
    expect(resultWord(people("a", { sheet: undefined }))).toBe("");
    expect(resultWord(doc("d", "read"))).toBe("");
  });
});

const CAMPAIGNS = [
  { id: "c-1", name: "Senior Backend" },
  { id: "c-2", name: "Pune Backend" },
  { id: "c-3", name: "Sales" },
  { id: "c-4", name: "Backend" },
];

describe("the campaign the words name", () => {
  it("is the one named as where the people go: to, into, onto or on, then its whole name", () => {
    expect(campaignNamedIn("add these to the Pune Backend campaign", CAMPAIGNS)).toEqual(CAMPAIGNS[1]);
    expect(campaignNamedIn("put them onto Senior Backend", CAMPAIGNS)).toEqual(CAMPAIGNS[0]);
    expect(campaignNamedIn("ADD THESE INTO our Sales shortlist", CAMPAIGNS)).toEqual(CAMPAIGNS[2]);
  });

  it("is not a name that only appears: 'the ones in sales' is a filter, and 'for Sales' is not a destination either", () => {
    expect(campaignNamedIn("add only the ones in sales", CAMPAIGNS)).toBeNull();
    expect(campaignNamedIn("add the ones for Sales", CAMPAIGNS)).toBeNull();
    expect(campaignsIn("add only the ones in sales", CAMPAIGNS)).toEqual([CAMPAIGNS[2]]);
  });

  it("is the longer name where one holds the other, and none when two campaigns are named", () => {
    expect(campaignNamedIn("add these to Senior Backend", CAMPAIGNS)).toEqual(CAMPAIGNS[0]);
    expect(campaignNamedIn("add these to Backend", CAMPAIGNS)).toEqual(CAMPAIGNS[3]);
    expect(campaignNamedIn("add these to Sales and Pune Backend", CAMPAIGNS)).toBeNull();
  });
});

describe("words that ask for more than adding", () => {
  it("are at least two words, for a reading that costs a model call, once the words of adding and the campaign named are taken out", () => {
    expect(hasInstruction("add these to the Pune Backend campaign", ["Pune Backend"])).toBe(false);
    expect(hasInstruction("add these")).toBe(false);
    // One word left over is a manner of speaking, not an instruction.
    expect(hasInstruction("add these quickly")).toBe(false);
    expect(hasInstruction("add these quickly please")).toBe(false);
    expect(hasInstruction("please add them to the shortlist")).toBe(false);
    expect(hasInstruction("add these, only the ones who replied", [])).toBe(true);
    expect(hasInstruction("add these to Pune Backend and start outreach to the ones who replied", ["Pune Backend"])).toBe(true);
    expect(contentWords("add these to the Pune Backend campaign, only Pune ones", ["Pune Backend"])).toEqual(["only", "ones"]);
  });

  it("go to the agent as they were typed, with what was attached said to be on the card and nothing yet added", () => {
    expect(followUpOf("add these to Pune Backend and start outreach to the ones who replied", ["Pune Backend"])).toBe(
      "What I attached is on the card above. Nothing is added until I press its button. Answer only what I asked besides adding: add these to Pune Backend and start outreach to the ones who replied",
    );
    expect(followUpOf("add these to Pune Backend", ["Pune Backend"])).toBeNull();
    expect(followUpOf("add these quickly please")).toBeNull();
  });

  it("are answered when a single word is left, since 'email them' unanswered would sit in the chat as an ask nobody read", () => {
    for (const words of ["email them", "reject all", "message everyone", "  email them  "]) {
      expect(hasInstruction(words, [], 1)).toBe(true);
      expect(followUpOf(words)).toMatch(/^What I attached is on the card above\./);
      expect(followUpOf(words)?.endsWith(`: ${words.trim()}`)).toBe(true);
    }
  });
});

describe("what the agent hears once the people are added", () => {
  it("is the next steps alone, as typed, said to be for after the adding; and nothing when there are none, so a bare add costs no turn", () => {
    expect(followUpAfter(["start outreach to the ones who replied"])).toBe(
      "The people are added. Answer only what I asked besides adding: start outreach to the ones who replied",
    );
    expect(followUpAfter(["email them", "book a call"])).toBe("The people are added. Answer only what I asked besides adding: email them; book a call");
    expect(followUpAfter([])).toBeNull();
  });
});

const NOW = { campaign: { id: "c-1", name: "Senior Backend" }, mayChange: true, closed: false, campaigns: CAMPAIGNS, id: "add-0001abcd" };

describe("what a Send makes of the files", () => {
  it("is nothing when no file was chosen: the message goes as it always did", () => {
    expect(outgoing([], "hello", NOW)).toBeNull();
    expect(outgoing([chip({ id: "p", origin: "pasted", name: "Pasted text", text: "x".repeat(2000) })], "", NOW)).toBeNull();
  });

  it("is one message for a sheet of people: default words marked as the product's, the campaign in the chat, no file text", () => {
    const out = outgoing([people("leads")], "", NOW);
    expect(out?.messages).toHaveLength(1);
    const [m] = out?.messages ?? [];
    expect(m?.text).toBe("Add the people in leads.xlsx");
    expect(m?.campaignId).toBe("c-1");
    expect(m?.adding).toEqual({
      id: "add-0001abcd",
      defaulted: true,
      groups: [{ scope: "candidates", files: [{ name: "leads.xlsx", kind: "sheet", detail: "61 people" }] }],
    });
    expect(m?.keep?.people.map((c) => c.id)).toEqual(["leads"]);
    expect(out?.taken).toEqual(["leads"]);
    expect(out?.usedBrief).toBe(false);
  });

  it("keeps the person's own words as the message, never a fixed phrase in their place", () => {
    const out = outgoing([people("leads")], "these came from the Hyderabad meetup", NOW);
    expect(out?.messages[0]?.text).toBe("these came from the Hyderabad meetup");
    expect(out?.messages[0]?.adding?.defaulted).toBe(false);
  });

  it("uses the campaign the words name as where they go, and says so on the card; the page's campaign otherwise", () => {
    const out = outgoing([people("leads")], "add these to the Pune Backend campaign", NOW);
    expect(out?.messages).toHaveLength(1);
    expect(out?.messages[0]?.campaignId).toBe("c-2");
    expect(out?.messages[0]?.keep).toMatchObject({ words: "add these to the Pune Backend campaign", picked: "Pune Backend" });
    // A name that only appears is not a destination.
    const filter = outgoing([people("leads")], "only the ones in sales", NOW);
    expect(filter?.messages[0]?.campaignId).toBe("c-1");
    expect(filter?.messages[0]?.keep?.picked).toBeNull();
  });

  it("hands the card the words as typed, to be read beside the sheets' shapes, whether or not they name a campaign, and none when nothing was typed", () => {
    expect(outgoing([people("leads")], "only the ones in Pune", NOW)?.messages[0]?.keep?.say).toBe("only the ones in Pune");
    expect(outgoing([people("leads")], "add these to the Pune Backend campaign", NOW)?.messages[0]?.keep?.say).toBe("add these to the Pune Backend campaign");
    expect(outgoing([people("leads")], "", NOW)?.messages[0]?.keep?.say).toBeNull();
    // A pasted description rides with the words: they are still the sheets' to read.
    const withBrief = outgoing([people("leads"), chip({ id: "p", origin: "pasted", name: "Pasted text", text: "x".repeat(2000) })], "only the ones in Pune", NOW);
    expect(withBrief?.messages[0]?.keep?.say).toBe("only the ones in Pune");
  });

  it("leaves what else the words asked to the sheet's card, the one reader of them: no turn of the agent goes with a sheet of people, and the words stay the add's own message", () => {
    const words = "add these to Pune Backend and start outreach to the ones who replied";
    const out = outgoing([people("leads")], words, NOW);
    // One message: a second would be a run slot and a model call that cannot see the card, sent before anyone is added.
    expect(out?.messages).toHaveLength(1);
    expect(out?.messages[0]?.adding).toBeDefined();
    expect(out?.messages[0]?.text).toBe(words);
    // The card gets the words as typed, to read beside the sheet's shapes.
    expect(out?.messages[0]?.keep?.say).toBe(words);
    expect(out?.messages.some((m) => m.quiet !== undefined)).toBe(false);
  });

  it("sends no turn for a single word either with a sheet of people ('email them', 'urgent'): the card says it did not use it, and nothing is asked of a model", () => {
    for (const words of ["email them", "urgent", "reject all", "  email them  "]) {
      const out = outgoing([people("leads")], words, NOW);
      expect(out?.messages, words).toHaveLength(1);
      expect(out?.messages[0]?.keep?.say, words).toBe(words.trim());
    }
    // With resumes beside the sheet it is the same: the sheet's card reads the words, not the resumes' text.
    const mixed = outgoing([people("leads"), doc("cv", "candidates", { docKind: "resume", text: "Priya Nair" })], "start outreach to the ones who replied", NOW);
    expect(mixed?.messages).toHaveLength(1);
    expect(mixed?.messages[0]?.keep?.say).toBe("start outreach to the ones who replied");
    expect(JSON.stringify(mixed?.messages)).not.toContain("[Attached:");
    // Words that only say to add send nothing more, as before.
    const only = outgoing([people("leads")], "add these to the Pune Backend campaign", NOW);
    expect(only?.messages).toHaveLength(1);
    expect(only?.messages[0]?.quiet).toBeUndefined();
  });

  it("still answers the words in a turn of their own where no card reads them: a sheet of roles, and resumes alone", () => {
    const roles = people("r", { scope: "roles", sheet: sheetOf("roles") });
    const asked = outgoing([roles], "email them", NOW);
    expect(asked?.messages.map((m) => !!m.adding)).toEqual([true, false]);
    expect(asked?.messages[1]).toMatchObject({ quiet: FOLLOW_UP_LABEL, campaignId: "c-1" });
    expect(asked?.messages[1]?.text).toContain("email them");
    const cv = outgoing([doc("cv", "candidates", { docKind: "resume", text: "Priya Nair" })], "is she a good fit?", NOW);
    expect(cv?.messages[1]).toMatchObject({ quiet: FOLLOW_UP_LABEL });
  });

  it("still sends the words typed beside a file that could not be read or is waiting on its line: they are the message, as they always were", () => {
    const failed = people("old", { name: "old.xls", status: "failed", note: "It is an old Excel file.", sheet: undefined });
    const odd = people("tenders", { sheet: sheetOf("roles") });
    for (const items of [[failed], [odd], [failed, odd]]) {
      expect(outgoing(items, "what is the status of Pune?", NOW)).toEqual({
        messages: [{ text: "what is the status of Pune?", campaignId: "c-1" }],
        taken: [],
        usedBrief: true,
      });
    }
    // With no campaign open, the filters set for the next one go at its end, as with any message about no campaign.
    const none = { ...NOW, campaign: null, mayChange: false, tail: "Filters: Pune" };
    expect(outgoing([failed], "find me Go developers", none)?.messages[0]?.text).toBe("find me Go developers\n\nFilters: Pune");
    // Nothing typed: nothing to send, the chip keeps its line.
    expect(outgoing([failed], "", NOW)).toEqual({ messages: [], taken: [], usedBrief: false });
  });

  it("cuts a file name longer than the server takes, keeping its ending, in every group, so the message is not refused", () => {
    const long = `${"Candidates_Export_Senior_Backend_Engineer_".repeat(6)}final.xlsx`;
    expect(long.length).toBeGreaterThan(120);
    const out = outgoing([people("a", { name: long }), people("r", { scope: "roles", name: long.replace("Candidates", "Roles"), sheet: sheetOf("roles") }), doc("brief", "read", { name: `${long}.pdf` })], "", NOW);
    const names = (out?.messages ?? []).flatMap((m) => (m.adding?.groups ?? []).flatMap((g) => g.files.map((f) => f.name)));
    expect(names).toHaveLength(3);
    for (const name of names) expect(name.length).toBeLessThanOrEqual(120);
    expect(names[0]?.startsWith("Roles_Export_")).toBe(true);
    expect(names[0]?.endsWith(".xlsx")).toBe(true);
    expect(names[2]?.endsWith(".pdf")).toBe(true);
    // The words that stand for the files use the cut name too.
    expect(out?.messages[0]?.text.length).toBeLessThan(300);
  });

  it("is a campaign the person only follows: the people go to Candidates, no campaign is sent", () => {
    const out = outgoing([people("leads")], "", { ...NOW, mayChange: false });
    expect(out?.messages[0]?.campaignId).toBeUndefined();
  });

  it("puts sheets of people and roles in one message, roles first, and several sheets in one group", () => {
    const out = outgoing([people("a"), people("b"), people("r", { scope: "roles", name: "roles.xlsx", sheet: sheetOf("roles") })], "", NOW);
    expect(out?.messages).toHaveLength(1);
    expect(out?.messages[0]?.adding?.groups.map((g) => [g.scope, g.files.map((f) => f.name)])).toEqual([
      ["roles", ["roles.xlsx"]],
      ["candidates", ["a.xlsx", "b.xlsx"]],
    ]);
    expect(out?.messages[0]?.text).toBe("Add the roles in roles.xlsx and the people in a.xlsx and b.xlsx");
    expect(out?.messages[0]?.keep?.roles.map((c) => c.id)).toEqual(["r"]);
  });

  it("sends a job description chosen for the campaign by its own route, never as a message the agent reads: the file goes up, then the ask to show the requirements", () => {
    const file = new File(["jd bytes"], "jd.pdf", { type: "application/pdf" });
    const out = outgoing([doc("jd", "job_description", { docKind: "job_description", file })], "", NOW);
    expect(out?.messages).toHaveLength(1);
    const [m] = out?.messages ?? [];
    // The person's turn is the product's ask, marked as not theirs, with the chip beside it; the agent answers it in code.
    expect(m?.text).toBe(SHOW_REQUIREMENTS);
    expect(m?.adding).toEqual({ id: "add-0001abcd-job_description", defaulted: true, groups: [{ scope: "job_description", files: [{ name: "jd.pdf", kind: "document" }] }] });
    expect(m?.campaignId).toBe("c-1");
    expect(m?.jd).toEqual({ file, name: "jd.pdf", campaignId: "c-1", then: null });
    // Nothing of the file's text rides in the message, and no frame is there to be saved with a description.
    expect(m?.text).not.toContain("Attached");
    expect(m?.text).not.toContain("Text of jd");
    expect(out?.taken).toEqual(["jd"]);
    expect(out?.usedBrief).toBe(false);
  });

  it("sends the words typed beside a job description as they were typed, and asks for the requirements after them", () => {
    const file = new File(["jd bytes"], "jd.pdf", { type: "application/pdf" });
    const out = outgoing([people("leads"), doc("jd", "job_description", { file })], "this replaces the old one", NOW);
    // The sheet is answered at once, its default words the product's; the words go with the job description.
    expect(out?.messages.map((m) => m.text)).toEqual(["Add the people in leads.xlsx", "this replaces the old one"]);
    const jd = out?.messages[1];
    expect(jd?.adding?.defaulted).toBe(false);
    expect(jd?.jd).toEqual({ file, name: "jd.pdf", campaignId: "c-1", then: { text: SHOW_REQUIREMENTS, label: SHOW_REQUIREMENTS } });
    // Only the job description waits for a route: the sheet's message does not.
    expect(out?.messages[0]?.jd).toBeUndefined();
  });

  it("does not send a job description when the chat has no campaign it can go on: it asks, and the file goes nowhere on its own", () => {
    const file = new File(["jd bytes"], "jd.pdf");
    const none = { ...NOW, campaign: null, mayChange: false };
    const chipJd = doc("jd", "job_description", { file });
    expect(mismatch(chipJd, { campaign: null, mayChange: false, closed: false })?.line).toBe("There is no campaign open to put jd.pdf on.");
    expect(mismatch(chipJd, { campaign: "Senior Backend", mayChange: false, closed: false })?.actions.map((a) => a.scope)).toEqual(["roles", "read"]);
    expect(mismatch(chipJd, { campaign: "Senior Backend", mayChange: true, closed: true })).not.toBeNull();
    expect(mismatch(chipJd, { campaign: "Senior Backend", mayChange: true, closed: false })).toBeNull();
    expect(outgoing([chipJd], "", none)).toEqual({ messages: [], taken: [], usedBrief: false });
    // Keeping it is no way round it.
    expect(mismatch({ ...chipJd, kept: true }, { campaign: null, mayChange: false, closed: false })).not.toBeNull();
  });

  it("asks before a job description chosen for one campaign goes to another: the chat moved on after the file was chosen", () => {
    const file = new File(["jd bytes"], "jd.pdf");
    const chosen = doc("jd", "job_description", { file, onCampaign: { id: "c-1", name: "Senior Backend" } });
    const open = { campaign: "Product Designer", campaignId: "c-2", mayChange: true, closed: false };
    const m = mismatch(chosen, open);
    expect(m?.line).toBe("jd.pdf was chosen for Senior Backend, and Product Designer is open now.");
    expect(m?.actions).toEqual([{ label: "Put it on Product Designer", scope: "job_description" }, { label: "Use as something to read", scope: "read" }]);
    // It goes to neither campaign until that is settled.
    expect(sendable(chosen, open)).toBe(false);
    const there = { ...NOW, campaign: { id: "c-2", name: "Product Designer" } };
    expect(outgoing([chosen], "", there)).toEqual({ messages: [], taken: [], usedBrief: false });
    // The campaign it was chosen for is the one open: it goes there, as it did.
    expect(mismatch(chosen, { campaign: "Senior Backend", campaignId: "c-1", mayChange: true, closed: false })).toBeNull();
    expect(outgoing([chosen], "", NOW)?.messages[0]?.jd).toMatchObject({ campaignId: "c-1" });
    // Said yes to the other one (setting its scope again puts it there): it goes there.
    const aimed = { ...chosen, onCampaign: { id: "c-2", name: "Product Designer" } };
    expect(outgoing([aimed], "", there)?.messages[0]?.jd).toMatchObject({ campaignId: "c-2" });
  });

  it("asks before a dropped file the reader called a job description goes on the campaign: a suggestion is never the one that writes", () => {
    const file = new File(["jd bytes"], "jd.pdf");
    const dropped = doc("jd", "job_description", { file, suggested: true, docKind: "job_description" });
    const m = mismatch(dropped, MINE);
    expect(m?.line).toBe("jd.pdf looks like a job description. Put it on Senior Backend?");
    expect(m?.actions).toEqual([{ label: "Use as job description", scope: "job_description" }, { label: "Use as something to read", scope: "read" }]);
    // Until it is said yes to, it is not sent, and it stays where it is.
    expect(outgoing([dropped], "", NOW)).toEqual({ messages: [], taken: [], usedBrief: false });
    // The click that says yes is the choice (the page clears `suggested` when the scope is set), and then it goes.
    const out = outgoing([{ ...dropped, suggested: false }], "", NOW);
    expect(out?.messages[0]?.jd).toMatchObject({ name: "jd.pdf", campaignId: "c-1" });
    // A job description chosen from the menu was asked for: no question.
    expect(mismatch(doc("jd", "job_description", { file }), MINE)).toBeNull();
  });

  it("waits on a job description whose file it does not have: there is nothing to put on the campaign", () => {
    const noFile = doc("jd", "job_description", {});
    expect(sendable(noFile, MINE)).toBe(false);
    expect(outgoing([noFile], "", NOW)).toEqual({ messages: [], taken: [], usedBrief: false });
  });

  it("says what the turn of a job description shows while it works, and what a failure is: the file is unchanged unless the request ran out of time", () => {
    expect(jdReading("jd.pdf")).toBe("Reading jd.pdf and drafting the requirements. This takes about a minute.");
    expect(jdRead("jd.pdf")).toBe("Read jd.pdf");
    expect(jdFailureLine("jd.pdf", "We couldn't read enough text from that file. Paste the JD instead.")).toBe(
      "Couldn't save jd.pdf: We couldn't read enough text from that file. Paste the JD instead. The job description is unchanged.",
    );
    expect(jdFailureLine("jd.pdf", "Something went wrong")).toBe("Couldn't save jd.pdf: Something went wrong. The job description is unchanged.");
    const slow = "That took longer than expected. It may have gone through, so check before you try again.";
    expect(jdFailureLine("jd.pdf", slow, true)).toBe(slow);
    // Any other outcome nobody knows (a dropped connection, a page that is not the server's) is said as unknown, never as unchanged.
    expect(jdFailureLine("jd.pdf", "Can't reach SuperHyre. Check your connection and try again.", true)).toBe(
      "Couldn't confirm that jd.pdf was saved. It may have gone through, so check the job description before you try again.",
    );
  });

  it("sends job descriptions chosen as roles to the roles import as the texts already read, and a sheet of roles as the file: the agent reads none of them", () => {
    const none = { ...NOW, campaign: null, mayChange: false };
    const sheet = new File(["Role,Description"], "roles.xlsx");
    const out = outgoing(
      [
        doc("backend", "roles", { name: "Backend JD.pdf", text: "Senior Backend Engineer. Own the payments ledger in Go." }),
        doc("design", "roles", { name: "Design.docx", text: "Product Designer. Own the design system." }),
        people("r", { name: "roles.xlsx", scope: "roles", sheet: sheetOf("roles"), file: sheet }),
      ],
      "",
      none,
    );
    expect(out?.messages).toHaveLength(1);
    const [m] = out?.messages ?? [];
    expect(m?.adding?.groups).toEqual([
      { scope: "roles", files: [{ name: "Backend JD.pdf", kind: "document" }, { name: "Design.docx", kind: "document" }, { name: "roles.xlsx", kind: "sheet", detail: "Roles" }] },
    ]);
    // Answered by the roles card, for no campaign; nothing of the files' text is in the message.
    expect(m?.campaignId).toBeUndefined();
    expect(m?.jd).toBeUndefined();
    expect(m?.text).not.toContain("Own the payments ledger");
    expect(m?.text).not.toContain("[Attached");
    // What the card is handed: the descriptions as read (one role each) and the sheet as the file, so no document is read twice.
    expect(rolesSeedOf(m?.keep?.roles ?? [])).toEqual({
      files: [sheet],
      links: [],
      texts: [
        { label: "Backend JD", jd: "Senior Backend Engineer. Own the payments ledger in Go." },
        { label: "Design", jd: "Product Designer. Own the design system." },
      ],
    });
  });

  it("opens the roles import on one role for a single job description chosen with no campaign open", () => {
    const none = { ...NOW, campaign: null, mayChange: false };
    const out = outgoing([doc("backend", "roles", { name: "Backend JD.pdf", text: "Senior Backend Engineer. Own the payments ledger in Go." })], "", none);
    expect(out?.messages).toHaveLength(1);
    expect(rolesSeedOf(out?.messages[0]?.keep?.roles ?? []).texts).toHaveLength(1);
    expect(rolesSeedOf(out?.messages[0]?.keep?.roles ?? []).files).toEqual([]);
    expect(out?.messages[0]?.text).toBe("Add the roles in Backend JD.pdf");
  });

  it("sends files to read with a note that nothing is to be added from them", () => {
    const out = outgoing([doc("brief", "read")], "", NOW);
    const [m] = out?.messages ?? [];
    expect(m?.text.startsWith("Read what I attached and tell me what it says.")).toBe(true);
    expect(m?.text).toContain("These files are for reading only. Nothing is to be added from them.");
    expect(m?.adding?.groups).toEqual([{ scope: "read", files: [{ name: "brief.pdf", kind: "document" }] }]);
    expect(m?.campaignId).toBe("c-1");
  });

  it("sends resumes chosen as Candidates as people, in the one message with the sheets, and keeps their text for the card", () => {
    const cv = (id: string) => doc(id, "candidates", { docKind: "resume", text: `Priya Nair\n${id}` });
    const out = outgoing([cv("a"), people("leads"), cv("b")], "", NOW);
    expect(out?.messages).toHaveLength(1);
    const [m] = out?.messages ?? [];
    expect(m?.adding?.groups).toEqual([{ scope: "candidates", files: [{ name: "leads.xlsx", kind: "sheet", detail: "61 people" }, { name: "a.pdf", kind: "document", detail: "Priya Nair" }, { name: "b.pdf", kind: "document", detail: "Priya Nair" }] }]);
    expect(m?.keep?.resumes.map((c) => c.id)).toEqual(["a", "b"]);
    expect(m?.keep?.people.map((c) => c.id)).toEqual(["leads"]);
    expect(m?.campaignId).toBe("c-1");
    // The text of a resume is the card's to send for reading, not the message's, and no agent turn is made of it.
    expect(m?.text).toBe("Add the people in leads.xlsx, a.pdf and 1 more");
    expect(m?.text).not.toContain("Priya Nair");
    expect(out?.taken.sort()).toEqual(["a", "b", "leads"]);
  });

  it("says resumes when only resumes are added, sends no framed message to the agent, and goes to the campaign the words name", () => {
    const cv = doc("cv", "candidates", { docKind: "resume", text: "Priya Nair\npriya@x.com" });
    const out = outgoing([cv], "add these to Pune Backend", NOW);
    expect(out?.messages).toHaveLength(1);
    const [m] = out?.messages ?? [];
    expect(m?.text).toBe("add these to Pune Backend");
    expect(m?.adding).toMatchObject({ defaulted: false, groups: [{ scope: "candidates", files: [{ kind: "document" }] }] });
    expect(m?.campaignId).toBe("c-2");
    expect(m?.keep).toMatchObject({ picked: "Pune Backend", words: "add these to Pune Backend" });
    expect(outgoing([cv], "", NOW)?.messages[0]?.text).toBe("Add the resumes in cv.pdf");
    expect(outgoing([cv], "", NOW)?.messages[0]?.adding?.defaulted).toBe(true);
    for (const message of outgoing([cv], "", NOW)?.messages ?? []) expect(message.text).not.toMatch(/Here is a candidate's resume/);
  });

  it("leaves a resume the reader called a job description where it is, with its line, and sends the rest", () => {
    const jd = doc("jd", "candidates", { docKind: "job_description" });
    const out = outgoing([people("leads"), jd], "", NOW);
    expect(out?.messages[0]?.adding?.groups[0]?.files.map((f) => f.name)).toEqual(["leads.xlsx"]);
    expect(out?.messages[0]?.keep?.resumes).toEqual([]);
    expect(out?.taken).toEqual(["leads"]);
  });

  it("leaves a file with a line still to settle where it is, and sends the rest", () => {
    const odd = people("tenders", { name: "tenders.xlsx", sheet: sheetOf("roles") });
    const out = outgoing([people("leads"), odd], "", NOW);
    expect(out?.messages[0]?.adding?.groups[0]?.files.map((f) => f.name)).toEqual(["leads.xlsx"]);
    expect(out?.taken).toEqual(["leads"]);
    expect(outgoing([odd], "", NOW)).toEqual({ messages: [], taken: [], usedBrief: false });
  });

  it("never lets a sheet's cells into a message: sheets are not composed, only documents are", () => {
    const sheet = people("leads", { text: "SECRET CELL TEXT" });
    const out = outgoing([sheet, doc("brief", "read")], "", NOW);
    expect(out?.messages.every((m) => !m.text.includes("SECRET CELL TEXT"))).toBe(true);
    expect(out?.messages.some((m) => m.text.includes("[Attached: leads.xlsx]"))).toBe(false);
  });

  it("sends pasted text as it always did, with the words in front of it, beside the sheet's add", () => {
    const pasted = chip({ id: "p", origin: "pasted", name: "Pasted text", kind: undefined, text: "Backend engineer, five years of Go. ".repeat(60) });
    const out = outgoing([people("leads"), pasted], "also this", { ...NOW, campaign: null, mayChange: false });
    expect(out?.messages).toHaveLength(2);
    expect(out?.messages[0]?.text).toBe("Add the people in leads.xlsx");
    expect(out?.messages[1]?.text.startsWith("also this")).toBe(true);
    expect(out?.usedBrief).toBe(true);
  });
});

describe("a file's name as the server takes it", () => {
  it("is left alone when it fits (120 characters at most) and cut in the middle, ending kept, when it does not", () => {
    expect(shortName("leads.xlsx")).toBe("leads.xlsx");
    expect(shortName(`${"a".repeat(116)}.csv`)).toBe(`${"a".repeat(116)}.csv`);
    const cut = shortName(`${"a".repeat(200)}.xlsx`);
    expect(cut).toBe(`${"a".repeat(114)}….xlsx`);
    expect(cut).toHaveLength(120);
    expect(shortName("b".repeat(300))).toHaveLength(120);
    expect(shortName("   ")).toBe("file");
  });
});

describe("sheets read in turns", () => {
  const later = () => {
    let done!: (v: string) => void;
    let fail!: (e: Error) => void;
    const promise = new Promise<string>((res, rej) => {
      done = res;
      fail = rej;
    });
    return { promise, done, fail };
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("starts two at a time and the next only when a place is free, in the order they came", async () => {
    const run = inTurns(2);
    const jobs = Array.from({ length: 5 }, later);
    const started: number[] = [];
    const answers = jobs.map((j, i) => run(() => (started.push(i), j.promise)));
    expect(started).toEqual([0, 1]);
    jobs[1]?.done("b");
    await settle();
    expect(started).toEqual([0, 1, 2]);
    jobs[0]?.done("a");
    jobs[2]?.done("c");
    await settle();
    expect(started).toEqual([0, 1, 2, 3, 4]);
    jobs[3]?.done("d");
    jobs[4]?.done("e");
    expect(await Promise.all(answers)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("holds a place until the work the job hands back is over, not until the job returns", async () => {
    const run = inTurns(1);
    const first = later();
    let second = false;
    const a = run(async () => first.promise);
    const b = run(async () => (second = true, "b"));
    await settle();
    expect(second).toBe(false);
    first.done("a");
    expect(await Promise.all([a, b])).toEqual(["a", "b"]);
    expect(second).toBe(true);
  });

  it("gives each caller its own job's answer or failure, and a failure frees its place", async () => {
    const run = inTurns(1);
    const bad = later();
    const a = run(() => bad.promise);
    const b = run(async () => "fine");
    bad.fail(new Error("It did not read."));
    await expect(a).rejects.toThrow("It did not read.");
    await expect(b).resolves.toBe("fine");
    await expect(run(() => { throw new Error("at once"); })).rejects.toThrow("at once");
    await expect(run(async () => "after")).resolves.toBe("after");
  });
});

describe("what the composer says while it works", () => {
  it("says what Enter does once a sheet is ready: review, never add, and what the count includes is not promised", () => {
    expect(placeholderFor([people("a")], "Senior Backend")).toBe("Press Enter to review 61 people for Senior Backend, or say more first.");
    expect(placeholderFor([people("a")], null)).toBe("Press Enter to review 61 people, or say more first.");
    expect(placeholderFor([people("a"), people("b")], null)).toBe("Press Enter to review 122 people, or say more first.");
    expect(placeholderFor([people("a"), doc("d", "read")], null)).toBe("Press Enter to review what you attached, or say more first.");
    // A job description is not reviewed on a card: Enter reads it and drafts the requirements, and the line says so.
    expect(placeholderFor([doc("jd", "job_description")], "Senior Backend")).toBe("Press Enter to draft the requirements for Senior Backend from jd.pdf, or say more first.");
    expect(placeholderFor([doc("jd", "job_description"), people("a")], "Senior Backend")).toBe("Press Enter to review what you attached, or say more first.");
    expect(placeholderFor([doc("jd", "job_description", { suggested: true })], "Senior Backend")).toBeNull();
    expect(placeholderFor([people("a", { status: "reading", sheet: undefined })], null)).toBeNull();
    expect(placeholderFor([], null)).toBeNull();
  });

  it("says what Enter does for resumes: review them on the card, and the word for one", () => {
    const cv = (id: string) => doc(id, "candidates", { docKind: "resume", text: "Priya Nair\npriya@x.com" });
    expect(placeholderFor([cv("a")], null)).toBe("Press Enter to review this resume, or say more first.");
    expect(placeholderFor([cv("a"), cv("b"), cv("c")], "Senior Backend")).toBe("Press Enter to review these 3 resumes for Senior Backend, or say more first.");
    expect(placeholderFor([cv("a"), people("s")], null)).toBe("Press Enter to review what you attached, or say more first.");
  });

  it("shows whose a resume is on its chip when its first line is a name, and just that it is a resume when it is not", () => {
    expect(resultWord(doc("a", "candidates", { docKind: "resume", text: "Priya Nair\nBackend Engineer" }))).toBe("Priya Nair");
    expect(resultWord(doc("b", "candidates", { docKind: "resume", text: "priya.nair@example.com\nPriya" }))).toBe("Resume");
    expect(resultWord(doc("c", "candidates", { docKind: "resume", text: "Priya Nair", status: "reading" }))).toBe("Reading…");
    // A document chosen as something else keeps its size on the chip; a job description chosen as Candidates has a line, not a name.
    expect(resultWord(doc("d", "read", { text: "Priya Nair" }))).toBe("");
    expect(resultWord(doc("e", "candidates", { docKind: "job_description", text: "Senior Backend Engineer" }))).toBe("");
  });

  it("says how far a batch of files has read", () => {
    const batch = (reading: number) => Array.from({ length: 8 }, (_, i) => chip({ id: `f${i}`, name: `f${i}.pdf`, status: i < reading ? "reading" : "ready" }));
    expect(readingNote(batch(4))).toBe("Reading 4 of 8 files…");
    expect(readingNote(batch(0))).toBeNull();
    expect(readingNote(batch(1).slice(0, 2))).toBeNull();
  });
});

describe("the files of a message, in the transcript", () => {
  it("are read from what was sent, and from what the server kept after a reload", () => {
    const adding = { id: "add-0001abcd", defaulted: false, groups: [{ scope: "candidates" as const, files: [{ name: "leads.xlsx", kind: "sheet" as const, detail: "61 people" }] }] };
    expect(filesOfAdding(adding)).toEqual([{ name: "leads.xlsx", scope: "candidates", detail: "61 people" }]);
    expect(filesOfArtifact({ kind: "adding", files: [{ name: "leads.xlsx", scope: "candidates", detail: "61 people" }, { name: "x", scope: "everything" }, 7] })).toEqual([
      { name: "leads.xlsx", scope: "candidates", detail: "61 people" },
    ]);
    expect(filesOfArtifact({ kind: "action", label: "x" })).toEqual([]);
    expect(filesOfArtifact(null)).toEqual([]);
    expect(filesOfAdding(undefined)).toEqual([]);
  });
});

describe("resumes sent with a question about them", () => {
  const cv = (id: string) => doc(id, "candidates", { docKind: "resume", suggested: true, text: `Priya Nair\nBackend Engineer\n${id}` });
  const ASK = "is she a good fit for the Backend role?";

  it("go to the agent beside the question, for reading only, so it can answer about the file it would otherwise not see", () => {
    const out = outgoing([cv("a")], ASK, NOW);
    expect(out?.messages).toHaveLength(2);
    const [add, ask] = out?.messages ?? [];
    // The card still opens, with the resume's text on it for the reading; the question's own turn carries the text the card does not.
    expect(add?.adding?.groups[0]?.scope).toBe("candidates");
    expect(add?.text).not.toContain("Priya Nair");
    expect(ask).toMatchObject({ quiet: FOLLOW_UP_LABEL, campaignId: "c-1" });
    expect(ask?.text).toContain(ASK);
    expect(ask?.text).toContain("[Attached: a.pdf]\nPriya Nair\nBackend Engineer\na\n[End of attachment]");
    expect(ask?.text).toContain("Nothing is to be added from them.");
    expect(ask?.adding).toEqual({
      id: "add-0001abcd-follow",
      defaulted: false,
      groups: [{ scope: "read", files: [{ name: "a.pdf", kind: "document", detail: "Priya Nair" }] }],
    });
    // Words that only say to add send nothing to read, and a sheet of people has no turn at all: its card reads the words.
    expect(JSON.stringify(outgoing([cv("a")], "add these to Pune Backend", NOW)?.messages)).not.toContain("[Attached:");
    expect(outgoing([people("leads")], "email them", NOW)?.messages).toHaveLength(1);
  });

  it("are no more than the five the server reads at once, and the turn says how many of them are there", () => {
    const out = outgoing(["a", "b", "c", "d", "e", "f", "g"].map(cv), ASK, NOW);
    const ask = out?.messages[1];
    expect(ask?.adding?.groups[0]?.files).toHaveLength(5);
    expect(ask?.text).toContain("Only the first 5 of 7 resumes are here.");
    expect(ask?.text).not.toContain("[Attached: f.pdf]");
    // All seven are still on the card.
    expect(out?.messages[0]?.keep?.resumes).toHaveLength(7);
  });
});

describe("a resume the person kept against the line that says it looks like a job description", () => {
  it("is sent for reading as a resume, and the others are not", () => {
    const text = "Anil Menon\nanil@example.com\nRoles and Responsibilities\nQualifications\nNotice period: 30 days";
    const kept = doc("naukri", "candidates", { docKind: "job_description", text });
    // Until it is kept, the line is there and the file is left out of Send.
    expect(mismatch(kept, MINE)?.actions.map((a) => a.label)).toEqual(["Use as something to read", "Keep as candidate"]);
    expect(outgoing([kept], "", NOW)).toEqual({ messages: [], taken: [], usedBrief: false });
    const out = outgoing([{ ...kept, kept: true }, doc("plain", "candidates", { docKind: "resume", text: "Priya Nair\npriya@example.com" })], "", NOW);
    const seeds = (out?.messages[0]?.keep?.resumes ?? []).map(resumeSeedOf);
    const files = requestFor(seeds, { campaignId: null, read: {}, typed: {} }).files;
    expect(files.map((f) => [f.id, f.kept])).toEqual([
      ["naukri", true],
      ["plain", undefined],
    ]);
    expect(files[0]?.text).toBe(text);
  });
});

describe("a Google Sheet's link as a chip", () => {
  const URL_A = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit";
  const URL_B = "https://docs.google.com/spreadsheets/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210/edit#gid=5";
  const link = (id: string, url: string, over: Partial<Attachment> = {}) =>
    people(id, { name: "Google Sheet", origin: "link", link: url, size: 0, ...over });

  it("is called by what it is, and told from another link's chip by the end of its address", () => {
    expect(linkName(URL_A, [])).toBe("Google Sheet");
    expect(linkName(URL_B, [link("a", URL_A)])).toBe("Google Sheet …3210");
    expect(linkName(URL_B, [people("x")])).toBe("Google Sheet");
  });

  it("is not added twice: the same address says so, and every link counts toward the ten files and the five sheets", () => {
    expect(fits([link("a", URL_A)], { name: "Google Sheet", size: 0, link: URL_A }, { kind: "sheet", scope: "candidates" })).toBe("That sheet is already added.");
    expect(fits([link("a", URL_A)], { name: "Google Sheet …3210", size: 0, link: URL_B }, { kind: "sheet", scope: "candidates" })).toBeNull();
    const five = Array.from({ length: 5 }, (_, i) => link(`l${i}`, `${URL_A}?n=${i}`));
    expect(fits(five, { name: "x", size: 0, link: URL_B }, { kind: "sheet", scope: "candidates" })).toBe("Up to 5 sheets go in one message.");
    const ten = Array.from({ length: 10 }, (_, i) => chip({ id: `f${i}`, name: `f${i}.pdf`, size: 10 + i }));
    expect(fits(ten, { name: "x", size: 0, link: URL_B }, { kind: "sheet", scope: "candidates" })).toBe(LIMIT_LINE);
  });

  it("goes in the same message as a sheet that was attached, by its name, with the chip kept for its card to read", () => {
    const out = outgoing([people("leads"), link("sheet", URL_A)], "", NOW);
    expect(out?.messages).toHaveLength(1);
    const [m] = out?.messages ?? [];
    expect(m?.adding?.groups).toEqual([
      { scope: "candidates", files: [{ name: "leads.xlsx", kind: "sheet", detail: "61 people" }, { name: "Google Sheet", kind: "sheet", detail: "61 people" }] },
    ]);
    expect(m?.keep?.people.map((c) => [c.id, c.link ?? null])).toEqual([["leads", null], ["sheet", URL_A]]);
  });

  it("reads like a sheet of roles when it is one: the mismatch line names it, and chosen as roles it goes to the roles import by its address", () => {
    const roles = link("sheet", URL_A, { sheet: sheetOf("roles") });
    expect(mismatch(roles, MINE)).toMatchObject({ line: "Google Sheet reads like a list of roles, not people." });
    const asRoles = link("sheet", URL_A, { scope: "roles", sheet: sheetOf("roles") });
    expect(mismatch(asRoles, MINE)).toBeNull();
    expect(rolesSeedOf([asRoles, people("file", { file: new File(["x"], "r.xlsx") })])).toMatchObject({ links: [URL_A] });
    expect(rolesSeedOf([asRoles])).toMatchObject({ files: [], links: [URL_A] });
    const out = outgoing([asRoles], "", NOW);
    expect(out?.messages[0]?.adding?.groups).toEqual([{ scope: "roles", files: [{ name: "Google Sheet", kind: "sheet", detail: "Roles" }] }]);
    expect(out?.messages[0]?.keep?.roles.map((c) => c.link)).toEqual([URL_A]);
  });

  it("is counted in the note on how far a batch has read, as a file is", () => {
    const batch = [link("a", URL_A, { status: "reading" }), ...Array.from({ length: 2 }, (_, i) => chip({ id: `f${i}`, name: `f${i}.pdf` }))];
    expect(readingNote(batch)).toBe("Reading 2 of 3 files…");
  });

  it("is not turned away as already added when the chip of the same address failed: it can be added again once the sharing is changed", () => {
    const failed = link("a", URL_A, { status: "failed", note: "That sheet needs a sign-in." });
    expect(fits([failed], { name: "Google Sheet", size: 0, link: URL_A }, { kind: "sheet", scope: "candidates" })).toBeNull();
    for (const status of ["reading", "ready"] as const) {
      expect(fits([link("a", URL_A, { status })], { name: "Google Sheet", size: 0, link: URL_A }, { kind: "sheet", scope: "candidates" })).toBe("That sheet is already added.");
    }
  });
});

/** The composer's side of the door for a link, in memory: its chips, what it said, and the reads that are waiting to be answered. */
function page(start: Attachment[] = [], over: Partial<LinkDoor> = {}) {
  const store = {
    chips: [...start],
    said: [] as Array<string | null>,
    reads: [] as Array<{ url: string; done: (r: { sheet: PeopleSheet; campaignId: string | null }) => void; fail: (e: unknown) => void }>,
    n: 0,
  };
  const door: LinkDoor = {
    chips: () => store.chips,
    add: (c, replacing) => {
      store.chips = [...store.chips.filter((x) => !replacing.includes(x.id)), c];
    },
    patch: (id, change) => {
      store.chips = store.chips.map((x) => (x.id === id ? { ...x, ...change } : x));
    },
    read: (url) => new Promise((done, fail) => store.reads.push({ url, done, fail })),
    suggest: (sheet) => (sheet.kind === "roles" ? "roles" : "candidates"),
    id: () => `l${(store.n += 1)}`,
    say: (line) => {
      store.said.push(line);
    },
    words: (e) => (e instanceof Error ? e.message : "Something went wrong."),
    ...over,
  };
  return { store, door };
}
const settled = () => new Promise<void>((done) => setTimeout(done, 0));

describe("a Google Sheet's link taken into the composer", () => {
  const URL_A = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit";
  const SIGN_IN = "That sheet needs a sign-in to open. Set its sharing to Anyone with the link, then add the link again.";

  it("is a chip at once, reading, and then holds the sheet it read and the scope the sheet looks like", async () => {
    const { store, door } = page();
    takeLinks([URL_A], door);
    expect(store.chips).toMatchObject([{ id: "l1", name: "Google Sheet", origin: "link", link: URL_A, status: "reading", kind: "sheet", suggested: true }]);
    store.reads[0]?.done({ sheet: sheetOf("roles", 3), campaignId: "c-1" });
    await settled();
    expect(store.chips[0]).toMatchObject({ status: "ready", readFor: "c-1", scope: "roles" });
    expect(store.chips[0]?.sheet?.kind).toBe("roles");
  });

  it("says on its chip, in the server's words, that the sheet needs a sign-in, and the chip is left failed with that line", async () => {
    const { store, door } = page();
    takeLinks([URL_A], door);
    store.reads[0]?.fail(new Error(SIGN_IN));
    await settled();
    expect(store.chips[0]).toMatchObject({ status: "failed", note: SIGN_IN });
  });

  it("is not turned away for a sheet too big to add at once: its card reads it with the words typed", async () => {
    const { store, door } = page();
    takeLinks([URL_A], door);
    store.reads[0]?.fail(Object.assign(new Error("too many"), { details: { people: 12_000, limit: 10_000 } }));
    await settled();
    expect(store.chips[0]).toMatchObject({ status: "ready", tooMany: 12_000, scope: "candidates" });
  });

  it("can be added again after it failed: the same address is read once more, the failed chip gives way, and nothing says it is already added", async () => {
    const { store, door } = page();
    takeLinks([URL_A], door);
    store.reads[0]?.fail(new Error(SIGN_IN));
    await settled();
    takeLinks([URL_A], door);
    expect(store.chips.map((c) => [c.id, c.status, c.name])).toEqual([["l2", "reading", "Google Sheet"]]);
    expect(store.reads.map((r) => r.url)).toEqual([URL_A, URL_A]);
    expect(store.said.filter((line) => line !== null)).toEqual([]);
    store.reads[1]?.done({ sheet: sheetOf("people", 61), campaignId: null });
    await settled();
    expect(store.chips).toMatchObject([{ id: "l2", status: "ready", scope: "candidates" }]);
  });

  it("is not counted twice toward the ten files while its failed chip is replaced", () => {
    const nine = Array.from({ length: 9 }, (_, i) => chip({ id: `f${i}`, name: `f${i}.pdf`, size: 10 + i }));
    const { store, door } = page([...nine, people("old", { name: "Google Sheet", origin: "link", link: URL_A, size: 0, status: "failed", note: SIGN_IN })]);
    takeLinks([URL_A], door);
    expect(store.chips).toHaveLength(10);
    expect(store.chips.some((c) => c.id === "old")).toBe(false);
    expect(store.said.filter((line) => line !== null)).toEqual([]);
  });

  it("is still turned away as already added while its chip is reading, and a new note takes the old one away", () => {
    const { store, door } = page();
    takeLinks([URL_A], door);
    takeLinks([URL_A], door);
    expect(store.chips).toHaveLength(1);
    expect(store.reads).toHaveLength(1);
    expect(store.said).toEqual([null, null, "That sheet is already added."]);
  });

  it("is lifted out of the words at Send: a chip for the link, the words without it, and the Send held", async () => {
    const { store, door } = page();
    let words = "";
    expect(liftLinksFrom(`Add the people from ${URL_A} please`, door, (t) => { words = t; })).toBe(true);
    expect(words).toBe("Add the people from please");
    expect(store.chips).toMatchObject([{ link: URL_A, status: "reading" }]);
    store.reads[0]?.fail(new Error(SIGN_IN));
    await settled();
    expect(store.chips[0]).toMatchObject({ status: "failed", note: SIGN_IN });
  });

  it("leaves words with no link alone: no chip, the words untouched, and the Send goes on", () => {
    const { store, door } = page();
    let touched = false;
    expect(liftLinksFrom("Add the people from my sheet please", door, () => { touched = true; })).toBe(false);
    expect(touched).toBe(false);
    expect(store.chips).toEqual([]);
  });
});
