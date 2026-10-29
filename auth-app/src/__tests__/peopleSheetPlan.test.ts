import { describe, expect, it } from "vitest";
import {
  type Assist,
  type AssistLine,
  type ClientPlan,
  type PeopleSheet,
  PROTECTED_LINE,
  addLabelOf,
  askLine,
  changedLine,
  fallbackLine,
  firstStep,
  isPieceOf,
  leftOutLines,
  nextStepsOf,
  planAfter,
  planWith,
  protectedColumnsLine,
  ruleLines,
  ruleText,
  suggestedBy,
  tabRows,
  unreadLine,
  unusedLines,
  vetoLines,
  whereTheyGo,
  worthAPlan,
} from "../peopleSheet";

/**
 * What the model's help did to a sheet and to the words typed beside it, said in the card's own words. Everything here is pure:
 * no model text ever reaches the card, only the closed words the server sends, and the person's own words quoted back.
 */

const counts = { rows: 61, people: 61, toAdd: 40, alreadyHere: 21, onCampaign: 0, repeats: 0, left: 0, namesFromLinks: 0, phonesRebuilt: 0, phonesCut: 0 };
const sheet = (assist?: Assist, over: Partial<PeopleSheet> = {}): PeopleSheet => ({
  kind: "people",
  tabs: [{ name: "Candidates", rows: 61, people: 61 }],
  tab: "Candidates",
  headerRow: 1,
  columns: [],
  needsCheck: false,
  counts,
  leftOutBy: {},
  leftOut: [],
  rows: [],
  ...(assist ? { assist } : {}),
  ...over,
});
const used = (over: Partial<Assist> = {}): Assist => ({ gate: ["check"], used: true, source: "model", ...over });

describe("the line that says the columns were checked", () => {
  const changed = [
    { tab: "Sheet1", col: 1, header: "Mob", from: "extra" as const, to: "phone" as const },
    { tab: "Sheet1", col: 0, header: "Cand", from: "extra" as const, to: "name" as const },
    { tab: "Sheet1", col: 2, header: "Src", from: "extra" as const, to: "ignore" as const },
  ];

  it("names each column and what it became, with the people before and after when that moved them", () => {
    const line = changedLine(sheet(used({ changed, before: { people: 40 } }), { counts: { ...counts, people: 61 } }));
    expect(line).toBe("I checked the columns and changed 3: Mob is now Phone, Cand is now Full name, Src is left out. 61 people, 40 before.");
  });

  it("says nothing of the people when the count did not move, and 'column C' for a column with no header", () => {
    const line = changedLine(sheet(used({ changed: [{ tab: "Sheet1", col: 2, header: "", from: "extra", to: "extra" }], before: { people: 61 } })));
    expect(line).toBe("I checked the columns and changed 1: Column C is kept as a note.");
  });

  it("is absent when nothing changed, when the help was not used, and for a column left out only because of who it is about", () => {
    expect(changedLine(sheet(used({ changed: [] })))).toBeNull();
    expect(changedLine(sheet({ gate: ["check"], used: false, why: "busy" }))).toBeNull();
    expect(changedLine(sheet())).toBeNull();
    expect(changedLine(sheet(used({ changed: [{ tab: "T", col: 0, header: "Gender", from: "extra", to: "ignore", why: "protected" }] })))).toBeNull();
  });

  it("says in one sentence which columns were left out for being about who someone is", () => {
    const a = used({
      changed: [
        { tab: "T", col: 2, header: "Gender", from: "extra", to: "ignore", why: "protected" },
        { tab: "T", col: 3, header: "Marital Status", from: "extra", to: "ignore", why: "protected" },
        { tab: "T", col: 4, header: "Age", from: "extra", to: "ignore", why: "protected" },
      ],
    });
    expect(protectedColumnsLine(a)).toBe("I left out Gender, Marital Status and Age: they are about who someone is, not what they have done.");
    expect(protectedColumnsLine(used({ changed: [{ tab: "T", col: 2, header: "Gender", from: "extra", to: "ignore", why: "protected" }] }))).toBe(
      "I left out Gender: it is about who someone is, not what they have done.",
    );
    expect(protectedColumnsLine(used())).toBeNull();
  });
});

describe("the choosing of people the words asked for", () => {
  const line = (over: Partial<AssistLine>): AssistLine => ({ field: "location", op: "any_of", values: ["Pune"], kept: 18, of: 61, on: true, ...over });

  it("is a line each, with how many of how many it keeps", () => {
    expect(ruleText(line({}))).toBe("Only people in Pune: 18 of 61");
    expect(ruleText(line({ op: "not_any_of", values: ["Pune", "Delhi"], kept: 43 }))).toBe("Leaving out people in Pune or Delhi: 43 of 61");
    expect(ruleText(line({ field: "title", values: ["Engineer"] }))).toBe("Only titles with Engineer: 18 of 61");
    expect(ruleText(line({ field: "company", values: ["Acme"] }))).toBe("Only people at Acme: 18 of 61");
    expect(ruleText(line({ field: "skills", values: ["Go", "Rust", "Zig"] }))).toBe("Only people with Go, Rust or Zig: 18 of 61");
    expect(ruleText(line({ field: "status", values: ["replied"] }))).toBe("Only people marked replied: 18 of 61");
    expect(ruleText(line({ field: "years", op: "gte", values: [], n: 5 }))).toBe("At least 5 years of experience: 18 of 61");
    expect(ruleText(line({ field: "years", op: "lte", values: [], n: 1 }))).toBe("At most 1 year of experience: 18 of 61");
    expect(ruleText(line({ op: "blank", values: [] }))).toBe("Only people with no location: 18 of 61");
    expect(ruleText(line({ field: "title", op: "not_blank", values: [] }))).toBe("Only people with a title: 18 of 61");
  });

  it("starts a rule made from 'except' or 'not' off, with the person's own words beside it", () => {
    const lines = ruleLines(used({ lines: [line({}), line({ op: "not_any_of", on: false, negated: true, phrase: "except the Pune ones", kept: 43 })] }));
    expect(lines.map((l) => [l.text, l.on, l.phrase])).toEqual([
      ["Only people in Pune: 18 of 61", true, null],
      ["Leaving out people in Pune: 43 of 61", false, "except the Pune ones"],
    ]);
    // Words are beside a rule only when the rule came from them being said as "not".
    expect(ruleLines(used({ lines: [line({ phrase: "only Pune" })] }))[0]?.phrase).toBeNull();
    expect(ruleLines(undefined)).toEqual([]);
  });
});

describe("what could not be done, in the person's own words", () => {
  const typed = "only the ones in Pune, and the ones who replied, then send them an email";

  it("quotes only what they typed, however it was spaced or capitalised", () => {
    expect(isPieceOf(typed, "the ones who replied")).toBe(true);
    expect(isPieceOf(typed, "The  ONES who   replied")).toBe(true);
    expect(isPieceOf(typed, "the ones who never replied")).toBe(false);
    expect(isPieceOf(typed, "")).toBe(false);
  });

  it("says each, in its own sentence", () => {
    const a = used({
      unused: [
        { said: "the ones who replied", why: "no_column" },
        { said: "send them an email", why: "next_step" },
        { said: "in Pune", why: "unclear" },
      ],
    });
    expect(unusedLines(a, typed)).toEqual([
      "I couldn't apply 'the ones who replied': no column says it.",
      "I'll add them. 'send them an email' is a next step: I'll pass it on once they're in.",
      "I couldn't tell whether 'in Pune' was to keep people or leave them out, so I didn't apply it.",
    ]);
  });

  it("says of a next step, when everyone is in already, that it goes on now and not after an adding: there is nobody to add", () => {
    const a = used({ unused: [{ said: "send them an email", why: "next_step" }, { said: "the ones who replied", why: "no_column" }] });
    expect(unusedLines(a, typed, true)).toEqual([
      "'send them an email' is a next step. They are in already, so I'm passing it on now.",
      "I couldn't apply 'the ones who replied': no column says it.",
    ]);
    expect(unusedLines(a, typed, false)).toEqual(unusedLines(a, typed));
  });

  it("hands the agent the next steps alone, as typed, once the people are in: not what no column says, what was unclear, or what is about who someone is", () => {
    const typed2 = "add these and start outreach to the ones who replied, only the good ones, only women";
    const unused: NonNullable<Assist["unused"]> = [
      { said: "start outreach to the ones who replied", why: "next_step" },
      { said: "only the good ones", why: "no_column" },
      { said: "in Pune", why: "unclear" },
      { said: "only women", why: "protected" },
      { said: "add these", why: "unavailable" },
    ];
    expect(nextStepsOf(unused, typed2)).toEqual(["start outreach to the ones who replied"]);
    // Only the person's own words, spaces and capitals aside, and each once.
    expect(nextStepsOf([{ said: "send them an email", why: "next_step" }], "add these")).toEqual([]);
    expect(nextStepsOf([{ said: "Start  Outreach", why: "next_step" }, { said: "Start Outreach", why: "next_step" }], "please start outreach")).toEqual(["Start Outreach"]);
    expect(nextStepsOf(undefined, typed2)).toEqual([]);
    expect(nextStepsOf(unused, null)).toEqual([]);
  });

  it("says a single word was not used, in the person's own word, and nothing when the words only say to add or ask for more than one word", () => {
    expect(unreadLine("add these, urgent")).toBe("I didn't use 'urgent'. Add them as they are, or say it again once they are in.");
    expect(unreadLine("Add these to the Pune Backend campaign, URGENT", ["Pune Backend"])).toBe("I didn't use 'URGENT'. Add them as they are, or say it again once they are in.");
    expect(unreadLine("add these to the Pune Backend campaign", ["Pune Backend"])).toBeNull();
    expect(unreadLine("only the ones who replied")).toBeNull();
    expect(unreadLine("")).toBeNull();
    expect(unreadLine(null)).toBeNull();
  });

  it("never quotes words the person did not type, and says the protected part once, elsewhere", () => {
    const a = used({
      unused: [
        { said: "the good ones", why: "no_column" },
        { said: "only women", why: "protected" },
      ],
    });
    expect(unusedLines(a, typed)).toEqual([]);
    expect(unusedLines(a, null)).toEqual([]);
    expect(PROTECTED_LINE).toMatch(/I don't pick people by age, gender, religion, caste, marital status, health or where they're from/);
    expect(PROTECTED_LINE).toMatch(/The rest of your words are applied\.$/);
  });

  it("says, when the help was not to be had, that their words were not used and that adding them as they are is open", () => {
    const a: Assist = { gate: ["say"], used: false, source: "none", why: "busy", unused: [{ said: "only the ones in Pune", why: "unavailable" }] };
    expect(unusedLines(a, "only the ones in Pune")).toEqual([
      "I couldn't use 'only the ones in Pune' this time. Add them as they are, or say it again once they are in.",
    ]);
  });
});

describe("when the model's help was not had", () => {
  it("says the sheet was read the standard way and that the columns want a look, but only for a sheet that was worth the help", () => {
    const busy = (gate: Assist["gate"], why: NonNullable<Assist["why"]>): Assist => ({ gate, used: false, source: "none", why });
    expect(fallbackLine(busy(["check"], "busy"))).toBe("The assistant is busy, so I read the sheet the standard way. Check the columns before adding.");
    expect(fallbackLine(busy(["tabs"], "invalid"))).toBe("The assistant is busy, so I read the sheet the standard way. Check the columns before adding.");
    expect(fallbackLine(busy(["other"], "quota"))).toMatch(/again this hour, so I read the sheet the standard way\. Check the columns/);
    expect(fallbackLine(busy(["check"], "vetoed"))).toMatch(/I wasn't sure what to change, so I read the sheet the standard way/);
    // Words alone: the line about their words is enough. Switched off: nothing to say about the machinery.
    expect(fallbackLine(busy(["say"], "busy"))).toBeNull();
    expect(fallbackLine(busy(["check"], "off"))).toBeNull();
    expect(fallbackLine({ gate: ["check"], used: true, source: "model" })).toBeNull();
    expect(fallbackLine(undefined)).toBeNull();
  });

  it("uses no vendor or model word", () => {
    const all = [
      fallbackLine({ gate: ["check"], used: false, why: "busy" }),
      fallbackLine({ gate: ["check"], used: false, why: "quota" }),
      fallbackLine({ gate: ["check"], used: false, why: "vetoed" }),
      PROTECTED_LINE,
      ...vetoLines({ gate: [], vetoes: (["someone_else", "papers", "no_support", "name_taken"] as const).map((why) => ({ tab: "T", col: 0, header: "X", why })) }),
    ].join(" ");
    for (const word of ["model", "AI", "LLM", "Claude", "GPT", "prompt", "JSON", "schema", "plan", "—"]) expect(all, word).not.toContain(word);
  });
});

describe("a reading of a column that was not used", () => {
  it("says why, by the column's name, and that it stays a note or is left out", () => {
    const a: Assist = {
      gate: ["check"],
      vetoes: [
        { tab: "T", col: 2, header: "Recruiter Email", why: "someone_else" },
        { tab: "T", col: 3, header: "DOB Date", why: "papers" },
        { tab: "T", col: 4, header: "Src", why: "no_support" },
        { tab: "T", col: 5, header: "", why: "name_taken" },
      ],
    };
    expect(vetoLines(a)).toEqual([
      "I didn't use my reading of Recruiter Email. It looks like someone else's, so it stays a note.",
      "I didn't use my reading of DOB Date. It looks like an ID or a date, so it is left out.",
      "I didn't use my reading of Src: its cells don't look like it. It stays a note.",
      "I didn't use my reading of Column F: another column already holds the names.",
    ]);
  });

  it("asks the one question it could not answer for itself", () => {
    expect(askLine({ gate: ["tabs"], ask: "which_tab" })).toBe("I couldn't tell which tab holds the people. Tick it below.");
    expect(askLine({ gate: ["check"], ask: "which_name_column" })).toBe("I couldn't tell which column holds the names. Choose it below.");
    expect(askLine({ gate: ["check"], ask: null })).toBeNull();
  });
});

describe("keeping the plan between readings", () => {
  const plan: ClientPlan = {
    tabs: [{ name: "Candidates", use: "people" }],
    changes: [{ tab: "Candidates", col: 1, role: "phone" }],
    where: [
      { field: "location", op: "any_of", values: ["Pune"], n: null, on: true },
      { field: "title", op: "not_any_of", values: ["Intern"], n: null, on: false },
    ],
  };

  it("sends back the same plan with the rules ticked as the card has them", () => {
    const next = planWith(plan, [false, true]);
    expect(next.where.map((w) => w.on)).toEqual([false, true]);
    expect(next.tabs).toEqual(plan.tabs);
    expect(next.changes).toEqual(plan.changes);
    expect(plan.where.map((w) => w.on)).toEqual([true, false]);
    expect(planWith(plan, [true]).where.map((w) => w.on)).toEqual([true, false]);
  });

  it("asks for the model's help when the sheet says it is worth it or the words ask for more, and not otherwise", () => {
    expect(worthAPlan(sheet(), false)).toBe(false);
    expect(worthAPlan(null, false)).toBe(false);
    expect(worthAPlan(sheet(), true)).toBe(true);
    expect(worthAPlan(sheet({ gate: ["check"] }), false)).toBe(true);
    expect(worthAPlan(sheet({ gate: [] }), false)).toBe(false);
  });
});

describe("the first look a file takes at itself", () => {
  const at = { start: true, readFor: "c-1", campaignId: "c-1", columns: undefined, tabs: undefined, hidden: false, kept: false, planned: false, wordsAsk: false };

  it("uses the reading it came with when it was made for where the people go and the sheet needs nothing", () => {
    expect(firstStep({ ...at, read: sheet() })).toBe("use");
  });

  it("asks for the model's help when the reading says it is worth it, or the words ask for more than adding", () => {
    expect(firstStep({ ...at, read: sheet({ gate: ["check"] }) })).toBe("plan");
    expect(firstStep({ ...at, read: sheet(), wordsAsk: true })).toBe("plan");
  });

  it("asks for it once only, and not again once a plan is kept", () => {
    expect(firstStep({ ...at, read: sheet({ gate: ["tabs"] }), planned: true })).toBe("use");
    expect(firstStep({ ...at, read: sheet({ gate: ["tabs"] }), kept: true })).toBe("read");
  });

  it("reads again when the reading was made for another place, or the person has since changed a column, a tab or the hidden rows, or it is not the first look", () => {
    const read = sheet({ gate: ["check"] });
    expect(firstStep({ ...at, read, readFor: "c-2" })).toBe("read");
    expect(firstStep({ ...at, read, columns: "2:phone" })).toBe("read");
    expect(firstStep({ ...at, read, tabs: ["Backend"] })).toBe("read");
    expect(firstStep({ ...at, read, hidden: true })).toBe("read");
    expect(firstStep({ ...at, read, start: false })).toBe("read");
    expect(firstStep({ ...at, read: null })).toBe("read");
  });

  it("asks for the help at once when the file came with no reading and the words ask for more: a sheet with too many people to add whole is read by it", () => {
    expect(firstStep({ ...at, read: null, wordsAsk: true })).toBe("plan");
    expect(firstStep({ ...at, read: null, wordsAsk: false })).toBe("read");
    // Once asked, once a plan is kept, or after the first look: a reading.
    expect(firstStep({ ...at, read: null, wordsAsk: true, planned: true })).toBe("read");
    expect(firstStep({ ...at, read: null, wordsAsk: true, kept: true })).toBe("read");
    expect(firstStep({ ...at, read: null, wordsAsk: true, start: false })).toBe("read");
  });

  it("follows a reading with the help once, when that reading says it is worth it", () => {
    expect(planAfter(sheet({ gate: ["other"] }), "read", false, false)).toBe(true);
    expect(planAfter(sheet(), "read", false, true)).toBe(true);
    expect(planAfter(sheet({ gate: ["other"] }), "read", true, false)).toBe(false);
    expect(planAfter(sheet({ gate: ["other"] }), "plan", false, false)).toBe(false);
    expect(planAfter(sheet(), "read", false, false)).toBe(false);
  });
});

describe("where the people go until the person chooses", () => {
  const pune = { id: "c-pune", name: "Pune Backend" };
  const base = { pick: undefined, words: false, suggests: [pune], campaigns: [{ id: "c-pune" }, { id: "c-focus" }], onFocus: true, focusId: "c-focus" };

  it("is the campaign the model took the words to name, over the one the chat is on", () => {
    expect(whereTheyGo(base)).toEqual({ suggested: pune, wanted: "c-pune" });
    // Without it, as when a reading of the sheet did not carry it, the people go back to the chat's campaign.
    expect(whereTheyGo({ ...base, suggests: [null] })).toEqual({ suggested: null, wanted: "c-focus" });
    expect(whereTheyGo({ ...base, suggests: [null], onFocus: false })).toEqual({ suggested: null, wanted: null });
  });

  it("is what the person chose, Candidates alone included, and the console's own match of the words is not overruled by the model's", () => {
    expect(whereTheyGo({ ...base, pick: "c-focus" }).wanted).toBe("c-focus");
    expect(whereTheyGo({ ...base, pick: null }).wanted).toBeNull();
    expect(whereTheyGo({ ...base, words: true })).toEqual({ suggested: null, wanted: "c-focus" });
  });

  it("is not a campaign the person may not change, and is the first file's that names one", () => {
    expect(whereTheyGo({ ...base, campaigns: [{ id: "c-focus" }] }).suggested).toBeNull();
    const other = { id: "c-focus", name: "Design" };
    expect(whereTheyGo({ ...base, suggests: [null, other, pune] }).suggested).toEqual(other);
  });

  it("reads the campaign from the reading of the sheet, and from every reading of it that carries it", () => {
    expect(suggestedBy(sheet({ gate: [], campaign: pune }))).toEqual(pune);
    expect(suggestedBy(sheet({ gate: [] }))).toBeNull();
    expect(suggestedBy(sheet())).toBeNull();
    expect(suggestedBy(null)).toBeNull();
  });
});

describe("the plan the card keeps", () => {
  it("keeps, with a rule ticked, what the first answer said of the words: the destination, the question, the parts not applied, and the words beside a rule", () => {
    const plan: ClientPlan = {
      tabs: [],
      changes: [],
      where: [{ field: "location", op: "not_any_of", values: ["Pune"], on: false, negated: true, phrase: "except Pune" }],
      campaign: "c-1",
      ask: "which_tab",
      unused: [{ said: "the good ones", why: "no_column" }],
    };
    expect(planWith(plan, [true])).toEqual({ ...plan, where: [{ ...plan.where[0], on: true }] });
  });
});

describe("the tabs to tick", () => {
  it("lists every tab with something in it, and shows the ones read as no people without letting them be ticked", () => {
    const rows = tabRows({
      tabs: [
        { name: "Candidates", rows: 130, people: 130 },
        { name: "Pipeline", rows: 82, people: 82 },
        { name: "Archive", rows: 400, people: 400, used: false },
        { name: "Notes", rows: 3, people: 0, used: false },
        { name: "Empty", rows: 0, people: 0 },
      ],
    });
    expect(rows).toEqual([
      { name: "Candidates", people: 130, rows: 130, on: true, readable: true },
      { name: "Pipeline", people: 82, rows: 82, on: true, readable: true },
      { name: "Archive", people: 400, rows: 400, on: false, readable: true },
      { name: "Notes", people: 0, rows: 3, on: false, readable: false },
    ]);
  });

  it("is nothing to choose when only one tab holds people", () => {
    expect(tabRows({ tabs: [{ name: "Candidates", rows: 130, people: 130 }, { name: "Notes", rows: 3, people: 0 }] })).toEqual([]);
  });
});

describe("the button, for the people of all the files ticked", () => {
  it("names the place they go and how many, and is nothing when there are none", () => {
    expect(addLabelOf(212, "Senior Backend")).toBe("Add 212 to the Senior Backend shortlist");
    expect(addLabelOf(1, null)).toBe("Add 1 to Candidates");
    expect(addLabelOf(0, null)).toBeNull();
  });
});

describe("rows the words left out", () => {
  it("are listed among what was left out, with their rows, in their own reason", () => {
    const p = sheet(undefined, {
      leftOutBy: { "no-contact": 1, filtered: 3 },
      leftOut: [{ row: 5, tab: "Candidates", why: "no-contact" }, ...[7, 9, 12].map((row) => ({ row, tab: "Candidates", why: "filtered", who: "X" }))],
    });
    expect(leftOutLines(p)).toEqual([
      "1 row has no LinkedIn link, email or phone to tell them apart (row 5)",
      "3 rows are not among the people your words ask for (row 7, row 9, row 12)",
    ]);
  });
});
