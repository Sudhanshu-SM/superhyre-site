import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The people card when the model's help was asked for: the lines that say what it did, the choosing of people the words asked
 * for with a tick each, a section for each of several files with its tick and one button for all, and the sheet that is not read
 * as people but still shows its columns.
 */

vi.mock("../api/client", () => {
  class ApiError extends Error {}
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => null, messageOf: (e: Error) => e.message, LONG_REQUEST_TIMEOUT_MS: 170_000 };
});
vi.mock("../campaignStore", () => ({ useCampaignRows: () => [] }));
vi.mock("../campaignRights", () => ({ useMayChangeCampaign: () => true }));
vi.mock("../invalidate", () => ({ invalidate: () => undefined }));
vi.mock("../JdIntake", () => ({ JdIntake: () => null }));

const { PeopleCard, PeopleFooter } = await import("../liveViews/PeopleImport");
const { unavailableLine } = await import("../peopleSheet");
type CardView = import("../liveViews/PeopleImport").CardView;
type PeopleSheet = import("../peopleSheet").PeopleSheet;

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const none = () => undefined;
const on = { onColumn: none, onShortlist: none, onAdd: none, onToggleColumns: none, onRetry: none, onAsRoles: none, onAnother: none, onTab: none, onHidden: none, onRule: none, onFile: none };

const sheet = (over: Partial<PeopleSheet> = {}): PeopleSheet => ({
  kind: "people",
  tabs: [{ name: "Sheet1", rows: 61, people: 61 }],
  tab: "Sheet1",
  headerRow: 1,
  columns: [
    { index: 0, header: "Cand", role: "name", confidence: "likely", how: "plan", samples: ["Asha Verma"] },
    { index: 1, header: "Mob", role: "phone", confidence: "likely", how: "plan", samples: ["98450 12345"] },
    { index: 2, header: "Mail", role: "email", confidence: "sure", how: "header", samples: ["asha@example.com"] },
  ],
  needsCheck: false,
  counts: { rows: 61, people: 61, toAdd: 40, alreadyHere: 21, onCampaign: 0, repeats: 0, left: 0, namesFromLinks: 0, phonesRebuilt: 0, phonesCut: 0 },
  leftOutBy: {},
  leftOut: [],
  rows: Array.from({ length: 40 }, (_, i) => ({ row: i + 2, tab: "Sheet1", state: "new" as const, fields: { fullName: `P${i}` } })),
  ...over,
});

const noLines = { changed: null, protectedColumns: null, protected: null, fallback: null, ask: null, vetoes: [], unused: [] };
const view = (over: Partial<CardView> = {}): CardView => ({
  name: "leads.xlsx",
  phase: "ready",
  sheet: sheet(),
  shortlist: null,
  choice: null,
  note: null,
  error: null,
  progress: null,
  done: null,
  columnsOpen: false,
  refreshing: false,
  stale: false,
  scope: null,
  words: null,
  tabs: [],
  hidden: null,
  ...over,
});
const draw = (v: CardView) => renderToStaticMarkup(<PeopleCard view={v} on={on} />);

describe("what the model's help did, said under the heading", () => {
  it("says what it changed and what it did not use, each in a line of its own", () => {
    const html = draw(view({
      lines: {
        ...noLines,
        changed: "I checked the columns and changed 2: Mob is now Phone, Cand is now Full name. 61 people, 40 before.",
        vetoes: ["I didn't use my reading of Recruiter Email. It looks like someone else's, so it stays a note."],
        unused: ["I couldn't apply 'the good ones': no column says it."],
      },
    }));
    expect(html).toContain("I checked the columns and changed 2: Mob is now Phone, Cand is now Full name. 61 people, 40 before.");
    expect(html).toContain("I didn&#x27;t use my reading of Recruiter Email.");
    expect(html).toContain("I couldn&#x27;t apply &#x27;the good ones&#x27;: no column says it.");
    expect(html.indexOf("I found 61 people")).toBeLessThan(html.indexOf("I checked the columns"));
  });

  it("says nothing of it for a sheet that needed none", () => {
    const html = draw(view({ lines: noLines }));
    expect(html).not.toContain("I checked");
    expect(html).not.toContain("From your words");
    expect(draw(view())).not.toContain("From your words");
  });

  it("says the help is being asked for, and holds Add until it is in", () => {
    const html = draw(view({ checking: "Reading your words…", refreshing: true }));
    expect(html).toContain("Reading your words…");
    expect(html).not.toContain("Reading it again");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add 40 to Candidates/);
  });

  it("marks the columns it worked out as checked, beside the sheet's own", () => {
    const html = draw(view({ columnsOpen: true }));
    expect(html.match(/<small class="pi-guess"> checked<\/small>/g)).toHaveLength(2);
  });
});

describe("the choosing of people the words asked for", () => {
  const rules = [
    { key: "0", text: "Only people in Pune: 18 of 61", on: true, phrase: null },
    { key: "1", text: "Leaving out people in Delhi: 50 of 61", on: false, phrase: "except the Delhi ones" },
  ];

  it("is a tick each, under 'From your words', the one made from 'except' off and with their words beside it", () => {
    const html = draw(view({ rules }));
    expect(html).toContain("From your words");
    expect(html).toMatch(/<input type="checkbox" checked=""[^>]*\/><span>Only people in Pune: 18 of 61<\/span>/);
    expect(html).toMatch(/<input type="checkbox"\/><span>Leaving out people in Delhi: 50 of 61<small[^>]*> You said &#x27;except the Delhi ones&#x27;\.<\/small>/);
  });

  it("holds the ticks while it is adding", () => {
    expect(draw(view({ rules, phase: "adding" }))).toMatch(/<fieldset class="pi-tabs-pick" disabled="">\s*<legend[^>]*>From your words/);
  });

  it("shows the people the words left out among what was left out", () => {
    const html = draw(view({
      sheet: sheet({ counts: { ...sheet().counts, filtered: 43, left: 43 }, leftOutBy: { filtered: 43 }, leftOut: [{ row: 5, tab: "Sheet1", why: "filtered", who: "X" }] }),
    }));
    expect(html).toContain("43 rows are not among the people your words ask for (row 5");
  });
});

describe("when the words leave out everyone", () => {
  const everyoneOut = sheet({
    rows: [],
    counts: { ...sheet().counts, people: 5, toAdd: 0, alreadyHere: 0, filtered: 5, left: 5 },
    leftOutBy: { filtered: 5 },
    leftOut: [{ row: 2, tab: "Sheet1", why: "filtered", who: "X" }],
  });

  it("does not say they are already in your candidates: it says nobody matches, and where to untick", () => {
    const html = draw(view({ sheet: everyoneOut, rules: [{ key: "0", text: "Only people in Nowhere Land: 0 of 5", on: true, phrase: null }] }));
    expect(html).toContain("Nobody in the sheet matches your words. Untick a line under From your words to add them anyway.");
    expect(html).not.toContain("already in your candidates");
    expect(html).not.toContain("is-primary");
  });

  it("says, when some stayed and are all here already, that everyone the words ask for is here", () => {
    const html = draw(view({ shortlist: null, sheet: sheet({ rows: [], counts: { ...sheet().counts, people: 5, toAdd: 0, alreadyHere: 2, filtered: 3 } }) }));
    expect(html).toContain("Everyone your words ask for is already in your candidates.");
  });
});

describe("the tabs, with the ones read as no people", () => {
  it("shows them unticked and not to be ticked, with how many rows they hold", () => {
    const html = draw(view({
      tabs: [
        { name: "Candidates", people: 130, on: true, rows: 130, readable: true },
        { name: "Archive", people: 400, on: false, rows: 400, readable: true },
        { name: "Notes", people: 0, on: false, rows: 3, readable: false },
      ],
    }));
    expect(html).toMatch(/<input type="checkbox"\/><span>Archive <small[^>]*>\(400 people, not added\)/);
    expect(html).toMatch(/<input type="checkbox" disabled=""\/><span>Notes <small[^>]*>\(3 rows, not read as people\)/);
  });
});

describe("one of several files", () => {
  const file = { on: true, label: "leads.xlsx, 61 people" };

  it("has a tick for the file, and no foot of its own and no first line", () => {
    const html = draw(view({ file, scope: "Adding people from leads.xlsx. Nothing else in it is added." }));
    expect(html).toMatch(/<label class="pi-tick pi-file-t t-body"><input type="checkbox" checked=""[^>]*\/><span>leads\.xlsx, 61 people<\/span><\/label>/);
    expect(html).not.toContain("is-primary");
    expect(html).not.toContain("<footer");
    expect(html).not.toContain("Nothing else in it is added");
    expect(html).toContain("I found 61 people in leads.xlsx");
  });

  it("is only its tick and 'Not added.' when it is taken off the card", () => {
    const html = draw(view({ file: { on: false, label: "leads.xlsx, 61 people" } }));
    expect(html).toContain("Not added.");
    expect(html).not.toContain("I found 61 people");
    expect(html).toMatch(/<input type="checkbox"\/><span>leads\.xlsx, 61 people/);
  });

  it("keeps its tick for the adding to hold", () => {
    expect(draw(view({ file, phase: "adding" }))).toMatch(/<input type="checkbox" disabled="" checked=""/);
  });
});

describe("the one foot of a card with several files", () => {
  const foot = (over: Partial<CardView> = {}) =>
    renderToStaticMarkup(<PeopleFooter view={view({ sheet: null, name: "2 files", total: 212, ...over })} on={on} />);

  it("has one button for the people of all the files ticked, naming where they go", () => {
    expect(foot()).toMatch(/<button[^>]*class="src-btn is-primary mo-small"[^>]*>Add 212 to Candidates/);
    expect(foot({ shortlist: { id: "c-1", name: "Senior Backend" } })).toContain("Add 212 to the Senior Backend shortlist");
  });

  it("holds the button while any file is reading or waiting for the help, or could not be read again", () => {
    for (const over of [{ refreshing: true }, { stale: true }, { checking: "Checking your columns…" }])
      expect(foot(over)).toMatch(/<button[^>]*disabled=""[^>]*>Add 212/);
  });

  it("says in place of the button that there is nobody to add, in the card's words for the files", () => {
    const html = foot({ total: 0, nothing: "There is nobody to add. Tick a file above, or check its columns." });
    expect(html).toContain("There is nobody to add. Tick a file above, or check its columns.");
    expect(html).not.toContain("is-primary");
  });

  it("ends on one line of what happened, with a way to add another sheet, and shows a halt", () => {
    const done = foot({ phase: "done", done: { line: "Added 212 people to Candidates.", href: "#/contacts", link: "See Candidates" } });
    expect(done).toContain("Added 212 people to Candidates.");
    expect(done).toContain("Add another sheet");
    expect(foot({ error: "Can't reach SuperHyre. 150 people were added before it stopped. Adding again carries on with the rest, and nobody is added twice." })).toContain("Adding again carries on");
  });
});

describe("a sheet that is not read as people", () => {
  const other = sheet({
    kind: "other",
    counts: { ...sheet().counts, people: 0, toAdd: 0, alreadyHere: 0 },
    rows: [],
    columns: [
      { index: 0, header: "Role", role: "title", confidence: "likely", how: "header", samples: ["Asha Verma"] },
      { index: 1, header: "Contact", role: "extra", confidence: "likely", how: "header", samples: ["asha@example.com"] },
    ],
  });

  it("shows its columns with a dropdown each, so a person can say which is the names, and still offers it as roles", () => {
    const html = draw(view({ sheet: other }));
    expect(html).toContain("I couldn&#x27;t find people in leads.xlsx");
    expect(html).toContain("tell me which column is which below");
    expect(html).toContain('aria-label="What Role (column A) is"');
    expect(html).toContain('aria-label="What Contact (column B) is"');
    expect(html).toContain("Read it as roles");
    expect(html).not.toContain("is-primary");
  });

  it("says above its columns that the sheet was read the standard way when the help was not to be had", () => {
    const line = "The assistant is busy, so I read the sheet the standard way. Check the columns before adding.";
    const html = draw(view({ sheet: other, lines: { ...noLines, fallback: line } }));
    expect(html).toContain("The assistant is busy, so I read the sheet the standard way.");
    expect(html.indexOf("The assistant is busy")).toBeLessThan(html.indexOf("tell me which column is which"));
  });

  it("is as it was when the server sent no columns: the sentence and the one button", () => {
    const html = draw(view({ sheet: { ...other, columns: [] } }));
    expect(html).not.toContain("tell me which column is which");
    expect(html).toContain("Read it as roles");
  });
});

describe("how the card asks for the help, and keeps the plan", () => {
  const card = src("liveViews/PeopleImport.tsx");

  it("asks the model's help once for a file, when the sheet says it is worth it or the words ask for more than adding", () => {
    expect(card).toContain("const asks = !!say && hasInstruction(say, campaignsIn(say, campaigns).map((c) => c.name));");
    expect(card).toContain("if (step === \"use\") return;");
    expect(card).toContain('setChecking(live.current.asks ? "Reading your words…" : "Checking your columns…");');
    expect(card).toContain("if (planAfter(s, mode, planned.current, live.current.asks)) loader.current(columns, campaignId, false, \"plan\");");
  });

  it("asks for the help of one file at a time, so several files do not take every answer a team has", () => {
    expect(card).toContain("const helpTurn = inTurns(1);");
    expect(card).toContain("? helpTurn(() => (source.file ? peopleSheetApi.plan(source.file, live.current.say ?? \"\", opts) : peopleSheetApi.planLink(");
  });

  it("goes on with the plain reading, which was good, when the help cannot be had, and says the words it was to read were not used", () => {
    expect(card).toContain('if (mode === "plan" && have.current) {');
    // Words that ask for more than adding and could not be read are never dropped without a word, one file or several.
    expect(card).toContain("if (live.current.asks) setLost(true);");
    expect(card).toContain("lost && say ? [unavailableLine(say.trim().slice(0, 80))] : []");
    expect(card).toContain("ids.some((id) => reports[id]?.lost)");
    expect(unavailableLine("only the Pune ones")).toBe("I couldn't use 'only the Pune ones' this time. Add them as they are, or say it again once they are in.");
  });

  it("keeps what the first answer said and sends it back with every reading after, and ticking a rule reads again with it", () => {
    expect(card).toContain("if (s.assist?.plan) kept.current = s.assist.plan;");
    expect(card).toContain("kept.current = planWith(base, (a?.lines ?? []).map((l, i) => (i === index ? on : l.on)));");
    expect(card).toContain("setTicked((v) => v + 1);");
    // Not on the words or on whether they ask for more: those change as the campaigns load, and would read the sheet again for it.
    expect(card).toContain("[source, reads, tabs, hidden, ticked],");
  });

  it("sends the words as they were typed, not a fixed phrase, and a campaign the model understood never outranks the person's own pick", () => {
    expect(card).toContain("peopleSheetApi.plan(source.file, live.current.say ?? \"\", opts)");
    expect(card).toContain("say={own?.say ?? null}");
    // The pick, then the campaign the console matched by name (the card's own words), then the model's, then the chat's: one function (peopleSheet.ts, whereTheyGo).
    expect(card).toContain("const { suggested, wanted } = whereTheyGo({ pick, words: !!words, suggests: ids.map((id) => reports[id]?.suggests ?? null), campaigns, onFocus, focusId });");
  });

  it("takes the campaign the words named from each reading of the sheet, and not from the first alone", () => {
    // A reading that did not carry it would send the people back to the chat's campaign, and read the sheet again for it.
    expect(card).toContain("suggests: suggestedBy(sheet),");
  });

  it("says the files hold nobody the words ask for in the footer, where it used to say everyone was already there", () => {
    expect(card).toContain("nothing: nothingInFiles(sheets, shortlist?.name ?? null),");
  });

  it("adds the people of the files ticked and ready, in the order they were attached, in one run", () => {
    expect(card).toContain("const mine = ids.filter((id) => !off.has(id) && reports[id]?.ready);");
    // Each with what its sheet says of them, for the moves a ticked placing makes once they are in; the same person in two files is one (joinPeople.ts).
    expect(card).toContain("joinPeople<Person>([");
    expect(card).toContain(".map((r) => ({ fields: r.fields, file: id, status: r.status, alsoSaid: r.alsoSaid }))");
  });

  it("holds Add while any file is reading, reading again, or waiting for the help", () => {
    expect(card).toContain("busy: refreshing || !!checking || phase === \"reading\",");
    expect(card).toContain("const busy = ids.some((id) => reports[id]?.busy) || !!resumed?.busy;");
  });
});
