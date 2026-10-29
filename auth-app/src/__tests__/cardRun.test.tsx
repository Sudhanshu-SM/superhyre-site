import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The people card, run: its files read, joined and added, the words typed beside them, and what it leaves behind for a card drawn again.
 * The console has no DOM to mount a component in, so it is drawn with the tree runtime of hookTree.ts, which (unlike a draw to a string)
 * runs the effects: the files report to the card, the card joins their people, the button adds them, and what it asked the agent goes
 * out. The server is in the test's hands: every call is answered here. The markup and the wording are in peopleImportCard.test.tsx.
 */

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), ...(await import("./hookTree")).hooks }));

const net = vi.hoisted(() => {
  const answerAll = (rows: unknown[]) => ({ created: rows.length, skipped: 0, errors: [], rows: rows.map((_, i) => ({ row: i + 2, kind: "new", candidateId: `cand-${i}` })) });
  return {
    answerAll,
    reads: [] as Array<{ name: string; campaignId: string | null | undefined }>,
    plans: [] as Array<{ name: string; say: string }>,
    sends: [] as Array<{ rows: Array<Record<string, unknown>>; campaignId: string | null }>,
    places: [] as Array<{ campaignId: string; request: { moves: unknown[]; hire: string[]; reject: string[] } }>,
    toasts: [] as string[],
    follows: [] as Array<{ text: string; label: string; campaignId: string | undefined }>,
    /** What a read of a file answers, by the file's name; a plan answers the same unless it has an answer of its own. */
    sheets: {} as Record<string, unknown>,
    planned: {} as Record<string, unknown>,
    /** The people the resumes on the card hold (the part of the card that reads them is mocked). */
    resumePeople: [] as unknown[],
    /** How a batch is answered; none: every batch goes in. */
    send: null as null | ((rows: unknown[], call: number) => Promise<unknown>),
  };
});

vi.mock("../api/client", () => {
  class ApiError extends Error {}
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => null, messageOf: (e: Error) => e.message, LONG_REQUEST_TIMEOUT_MS: 170_000 };
});
vi.mock("../api/peopleSheet", () => ({
  peopleSheetApi: {
    read: async (file: File, opts: { campaignId?: string | null }) => {
      net.reads.push({ name: file.name, campaignId: opts.campaignId });
      return net.sheets[file.name];
    },
    readLink: async () => {
      throw new Error("no links here");
    },
    plan: async (file: File, say: string) => {
      net.plans.push({ name: file.name, say });
      return net.planned[file.name] ?? net.sheets[file.name];
    },
    planLink: async () => {
      throw new Error("no links here");
    },
    send: (rows: unknown[], campaignId: string | null) => {
      net.sends.push({ rows: [...rows] as Array<Record<string, unknown>>, campaignId });
      return net.send ? net.send(rows, net.sends.length) : Promise.resolve(net.answerAll(rows));
    },
    place: async (campaignId: string, request: { moves: unknown[]; hire: string[]; reject: string[] }) => {
      net.places.push({ campaignId, request });
      const moved: Record<string, number> = {};
      for (const m of request.moves as Array<{ stage: string }>) moved[m.stage] = (moved[m.stage] ?? 0) + 1;
      return { moved, kept: 0, waiting: [], refused: [] };
    },
  },
}));
const CAMPAIGNS = vi.hoisted(() => [{ id: "c-1", name: "Senior Backend", status: "active", canManage: true }]);
vi.mock("../campaignStore", () => ({ useCampaignRows: () => CAMPAIGNS }));
vi.mock("../campaignRights", () => ({ useMayChangeCampaign: () => true }));
vi.mock("../invalidate", () => ({ invalidate: () => undefined }));
vi.mock("../toast", () => ({ useToast: () => (text: string) => { net.toasts.push(text); } }));
vi.mock("../liveChat", () => ({
  sendAction: (text: string, label: string, campaignId?: string) => {
    net.follows.push({ text, label, campaignId });
    return "key";
  },
}));
vi.mock("../JdIntake", () => ({ JdIntake: () => null }));
/* The resumes' part of the card reads them by its own route (resumeImportCard.test.tsx): here it only says whom it holds. */
vi.mock("../liveViews/ResumeImport", async () => {
  const { useEffect } = await import("react");
  return {
    ResumeImport: () => null,
    ResumeSection: ({ seeds, report }: { seeds: unknown[]; report: (r: unknown) => void }) => {
      useEffect(() => {
        report({ people: net.resumePeople, files: seeds.length, ready: true, busy: false, stale: false });
      }, [seeds, report]);
      return null;
    },
  };
});

const { mount, find, walk, textOf, settle } = await import("./hookTree");
const { default: PeopleImportView, PeopleImport } = await import("../liveViews/PeopleImport");
const { stashFor, peekFor } = await import("../peopleSeed");
type Mounted = import("./hookTree").Mounted;
type PeopleSheet = import("../peopleSheet").PeopleSheet;

/* ── what the server would say ── */

const person = (fullName: string, email: string, over: Record<string, unknown> = {}) => ({ row: 2, tab: "Sheet1", state: "new", fields: { fullName, email }, ...over });

/** A sheet of people as the server reads it: `rows` are the people to add; `here` more are in already (counted, not sent). */
const sheetOf = (rows: unknown[], over: Record<string, unknown> = {}, here = 0): PeopleSheet =>
  ({
    kind: "people",
    tabs: [{ name: "Sheet1", rows: rows.length + here, people: rows.length + here }],
    tab: "Sheet1",
    headerRow: 1,
    columns: [],
    needsCheck: false,
    counts: { rows: rows.length + here, people: rows.length + here, toAdd: rows.length, alreadyHere: here, onCampaign: here, repeats: 0, left: 0, namesFromLinks: 0, phonesRebuilt: 0, phonesCut: 0 },
    leftOutBy: {},
    leftOut: [],
    hidden: { rows: 0, columns: 0, included: false },
    rows,
    ...over,
  }) as unknown as PeopleSheet;

const many = (n: number) => Array.from({ length: n }, (_, i) => person(`Person ${i}`, `p${i}@example.com`, { row: i + 2 }));

/** What the words ask beside adding, as the plan route says it: a next step, which no column of the sheet can do. */
const assistWith = (unused: Array<{ said: string; why: string }>) => ({ gate: ["say"], used: true, source: "model", unused });

const START = "start outreach to the ones who replied";
const WORDS = `add these and ${START}`;

const seedOf = (name: string, read: PeopleSheet | null) => ({ file: new File(["x"], name), link: null, read, campaignId: "c-1" });
const file = (name: string) => new File(["x"], name);

const card = (id: string) => ({ kind: "view", key: `view:people-import:c-1:${id}`, view: "people-import", campaignId: "c-1", campaignName: "Senior Backend", query: `adding:${id}` });
const drawView = (id: string): Mounted => mount(<PeopleImportView card={card(id) as never} ctx={{ onGrow: () => undefined } as never} />);

const pressText = (m: Mounted, label: string | RegExp): void => {
  const hit = find(m.tree, (el) => el.type === "button" && (typeof label === "string" ? textOf(el.props.children) === label : label.test(textOf(el.props.children))));
  expect(hit, `a button ${String(label)} among ${buttons(m).join(" | ") || "none"}`).toBeTruthy();
  (hit?.props.onClick as () => void)();
};
const buttons = (m: Mounted): string[] => {
  const out: string[] = [];
  walk(m.tree, (el) => {
    if (el.type === "button") out.push(textOf(el.props.children));
  });
  return out;
};
const tick = (m: Mounted, label: RegExp, checked: boolean): void => {
  const hit = find(m.tree, (el) => el.type === "label" && label.test(textOf(el.props.children)));
  const box = find(hit, (el) => el.type === "input");
  expect(box, `a tick ${String(label)}`).toBeTruthy();
  (box?.props.onChange as (e: unknown) => void)({ target: { checked } });
};
const said = (m: Mounted): string => textOf(m.tree).replace(/\s+/g, " ");
const count = (text: string, part: string): number => text.split(part).length - 1;

let n = 0;
/** An add id nobody has used, so the files one test kept are not found by another. */
const fresh = (): string => `add-run${String(++n).padStart(5, "0")}`;

beforeEach(() => {
  net.reads.length = 0;
  net.plans.length = 0;
  net.sends.length = 0;
  net.places.length = 0;
  net.toasts.length = 0;
  net.follows.length = 0;
  net.sheets = {};
  net.planned = {};
  net.resumePeople = [];
  net.send = null;
});

describe("a person who is in a sheet and in a resume", () => {
  const asha = { fullName: "Asha Verma", email: "asha@example.com", phone: "+919845012345", title: "Backend Engineer" };

  it("is one person: the card counts the rows that were joined and sends each person once, with what both files said of them", async () => {
    net.resumePeople = [{ fields: asha, file: "resume:r1" }];
    const sheet = sheetOf([person("Asha V", "ASHA@example.com", { fields: { fullName: "Asha V", email: "ASHA@example.com", location: "Pune", notes: "Source: Naukri" } }), person("Ravi Kumar", "ravi@example.com", { row: 3 })]);
    const m = mount(
      <PeopleImport seeds={[seedOf("leads.xlsx", sheet)]} resumes={[{ id: "r1", name: "asha.pdf", text: "Asha Verma", picture: false }]} focusId="c-1" focusName="Senior Backend" scoped />,
    );
    await settle();
    expect(said(m)).toContain("2 people from 2 files. 1 row joined, because the same person is in more than one file.");
    pressText(m, "Add 2 to the Senior Backend shortlist");
    await settle();
    expect(net.sends).toHaveLength(1);
    expect(net.sends[0]?.rows).toEqual([
      { ...asha, location: "Pune", notes: "Source: Naukri" },
      { fullName: "Ravi Kumar", email: "ravi@example.com" },
    ]);
    expect(said(m)).toContain("Added 2 people to the Senior Backend shortlist.");
    m.unmount();
  });

  it("keeps the status the sheet gives her, so the people the card says it will move are the ones it moves", async () => {
    net.resumePeople = [{ fields: asha, file: "resume:r1" }];
    const tracker = sheetOf(
      [person("Asha Verma", "asha@example.com", { status: "Rejected" }), person("Ravi Kumar", "ravi@example.com", { row: 3, status: "Replied" })],
      { statusWords: [{ text: "Rejected", n: 1, want: { stage: "passed" }, word: "rejected" }, { text: "Replied", n: 1, want: { stage: "outreach", step: "replied" }, word: "replied" }] },
    );
    const m = mount(
      <PeopleImport seeds={[seedOf("tracker.xlsx", tracker)]} resumes={[{ id: "r1", name: "asha.pdf", text: "Asha Verma", picture: false }]} focusId="c-1" focusName="Senior Backend" scoped />,
    );
    await settle();
    tick(m, /Put each person on the stage their status says/, true);
    // Counted and named once, as the one person she is.
    const ticked = said(m);
    expect(ticked).toContain("1 says rejected. Move them to Rejected?");
    expect(count(ticked, "Asha Verma")).toBe(1);
    tick(m, /says rejected\. Move them to Rejected\?/, true);
    pressText(m, "Add 2 to the Senior Backend shortlist");
    await settle();
    // She is the first of the two sent, and the sheet's word for her went with her through the join.
    expect(net.places).toHaveLength(1);
    expect(net.places[0]?.request).toEqual({
      moves: [
        { candidateId: "cand-0", stage: "passed", word: "Rejected" },
        { candidateId: "cand-1", stage: "outreach", step: "replied", word: "Replied" },
      ],
      hire: [],
      reject: ["cand-0"],
    });
    expect(said(m)).toContain("1 moved to In outreach, 1 to Rejected.");
    m.unmount();
  });

  it("is counted and named once when two sheets both call her rejected: what the tick says it moves is who is moved, and not the rows of the sheets", async () => {
    const rejected = { statusWords: [{ text: "Rejected", n: 1, want: { stage: "passed" }, word: "rejected" }] };
    const first = sheetOf([person("Asha Verma", "asha@example.com", { status: "Rejected" })], rejected);
    const second = sheetOf([person("Asha Verma", "ASHA@example.com", { status: "Rejected" }), person("Ravi Kumar", "ravi@example.com", { row: 3 })], rejected);
    const m = mount(<PeopleImport seeds={[seedOf("first.xlsx", first), seedOf("second.xlsx", second)]} focusId="c-1" focusName="Senior Backend" scoped />);
    await settle();
    expect(said(m)).toContain("2 people from 2 files. 1 row joined, because the same person is in more than one file.");
    tick(m, /Put each person on the stage their status says/, true);
    const ticked = said(m);
    expect(ticked).toContain("1 says rejected. Move them to Rejected?");
    expect(count(ticked, "Asha Verma")).toBe(1);
    m.unmount();
  });
});

describe("the words typed beside the sheet", () => {
  it("say, in their own word, the one word the card could not ask a model about, once the files have been read", async () => {
    const m = mount(<PeopleImport seeds={[seedOf("leads.xlsx", sheetOf(many(2)))]} focusId="c-1" focusName="Senior Backend" scoped say="add these, urgent" />);
    await settle();
    expect(count(said(m), "I didn't use 'urgent'. Add them as they are, or say it again once they are in.")).toBe(1);
    expect(net.plans).toHaveLength(0);
    m.unmount();
  });

  it("are not said to be unused when the help was asked about the sheet's columns and they were read with it: they were read, and the line is for words nothing read", async () => {
    net.planned["leads.xlsx"] = sheetOf(many(2), { assist: { gate: ["check"], used: true, source: "model" } });
    const guessed = sheetOf(many(2), { assist: { gate: ["check"] } });
    const m = mount(<PeopleImport seeds={[seedOf("leads.xlsx", guessed)]} focusId="c-1" focusName="Senior Backend" scoped say="add these, urgent" />);
    await settle();
    expect(net.plans).toEqual([{ name: "leads.xlsx", say: "add these, urgent" }]);
    expect(said(m)).not.toContain("I didn't use");
    m.unmount();
  });

  describe("that ask for more than adding", () => {
    const planned = () => {
      net.sheets["leads.xlsx"] = sheetOf(many(2));
      net.planned["leads.xlsx"] = sheetOf(many(2), { assist: assistWith([{ said: START, why: "next_step" }]) });
    };
    const log: string[] = [];
    const watch = {
      onFinish: () => { log.push("finish"); },
      onSent: () => { log.push("sent"); },
      follow: (text: string, campaignId: string | null) => { log.push(`follow ${campaignId}: ${text}`); },
    };
    beforeEach(() => { log.length = 0; });

    it("are read by the card once, and reach the agent only after the people are in, and once: after the adding is over, in that order", async () => {
      planned();
      const m = mount(<PeopleImport seeds={[seedOf("leads.xlsx", sheetOf(many(2)))]} focusId="c-1" focusName="Senior Backend" scoped say={WORDS} {...watch} />);
      await settle();
      expect(net.plans).toEqual([{ name: "leads.xlsx", say: WORDS }]);
      expect(said(m)).toContain(`I'll add them. '${START}' is a next step: I'll pass it on once they're in.`);
      // Nothing of the words goes anywhere while the person has not pressed Add.
      expect(log).toEqual([]);
      pressText(m, "Add 2 to the Senior Backend shortlist");
      await settle();
      expect(log).toEqual(["sent", "finish", `follow c-1: The people are added. Answer only what I asked besides adding: ${START}`]);
      m.unmount();
    });

    it("are not passed on when the adding stopped short, and are passed on once, when the next try ends it", async () => {
      planned();
      net.send = () => Promise.reject(new Error("The server stopped."));
      const m = mount(<PeopleImport seeds={[seedOf("leads.xlsx", sheetOf(many(2)))]} focusId="c-1" focusName="Senior Backend" scoped say={WORDS} {...watch} />);
      await settle();
      pressText(m, "Add 2 to the Senior Backend shortlist");
      await settle();
      expect(said(m)).toContain("The server stopped. Adding again carries on with the rest, and nobody is added twice.");
      // Nobody went in, so nothing is let go and nothing passed on.
      expect(log).toEqual([]);
      net.send = null;
      pressText(m, "Add 2 to the Senior Backend shortlist");
      await settle();
      expect(log).toEqual(["sent", "finish", `follow c-1: The people are added. Answer only what I asked besides adding: ${START}`]);
      m.unmount();
    });

    it("are passed on at once when everyone is in already and there is no button to press: the card promised it", async () => {
      net.planned["leads.xlsx"] = sheetOf([], { assist: assistWith([{ said: START, why: "next_step" }]) }, 3);
      const m = mount(<PeopleImport seeds={[seedOf("leads.xlsx", sheetOf([], {}, 3))]} focusId="c-1" focusName="Senior Backend" scoped say={WORDS} {...watch} />);
      await settle();
      const text = said(m);
      expect(text).toContain("Everyone is already on the Senior Backend shortlist.");
      // It does not say it will add them, nor that it waits for them to be in: they are, and it is going on now.
      expect(text).toContain(`'${START}' is a next step. They are in already, so I'm passing it on now.`);
      expect(text).not.toContain("I'll add them.");
      expect(buttons(m).some((b) => /^Add \d/.test(b))).toBe(false);
      expect(log).toEqual([`follow c-1: The people are added. Answer only what I asked besides adding: ${START}`]);
      m.unmount();
    });

    it("are not passed on when they left everybody out: nobody is in, so there is nothing to go on with", async () => {
      net.planned["leads.xlsx"] = sheetOf([], { assist: assistWith([{ said: START, why: "next_step" }]), counts: { rows: 3, people: 3, toAdd: 0, alreadyHere: 0, onCampaign: 0, repeats: 0, left: 3, namesFromLinks: 0, phonesRebuilt: 0, phonesCut: 0, filtered: 3 } });
      const m = mount(<PeopleImport seeds={[seedOf("leads.xlsx", sheetOf([], {}, 0))]} focusId="c-1" focusName="Senior Backend" scoped say={WORDS} {...watch} />);
      await settle();
      expect(log).toEqual([]);
      m.unmount();
    });

    it("do not go with the next sheet: another sheet is read as it is, asked nothing of them, and passes nothing on a second time", async () => {
      planned();
      net.sheets["leads2.xlsx"] = sheetOf([person("Meera Iyer", "meera@example.com")]);
      const m = mount(<PeopleImport seeds={[seedOf("leads.xlsx", sheetOf(many(2)))]} focusId="c-1" focusName="Senior Backend" scoped say={WORDS} {...watch} />);
      await settle();
      pressText(m, "Add 2 to the Senior Backend shortlist");
      await settle();
      expect(log.filter((l) => l.startsWith("follow"))).toHaveLength(1);
      pressText(m, "Add another sheet");
      const input = find(m.tree, (el) => el.type === "input" && el.props.type === "file");
      expect(input, "the picker's file input").toBeTruthy();
      (input?.props.onChange as (e: unknown) => void)({ target: { files: [file("leads2.xlsx")], value: "" } });
      await settle();
      // Read as it is: no help asked for the words again, and nothing of them said on the new card.
      expect(net.plans).toHaveLength(1);
      expect(net.reads.map((r) => r.name)).toEqual(["leads2.xlsx"]);
      expect(said(m)).not.toContain("is a next step");
      pressText(m, "Add 1 to the Senior Backend shortlist");
      await settle();
      expect(said(m)).toContain("Added 1 person to the Senior Backend shortlist.");
      expect(log.filter((l) => l.startsWith("follow"))).toHaveLength(1);
      m.unmount();
    });
  });
});

describe("a card drawn again on the same add (the chat was left and came back)", () => {
  const kept = (read: PeopleSheet, extra: Record<string, unknown> = {}) => {
    const id = fresh();
    stashFor(id, { sheets: [seedOf("leads.xlsx", read)], words: null, picked: null, ...extra });
    return id;
  };

  it("passes the words on once for the add, not once for each time it is drawn: everyone was in already, and the second drawing says nothing", async () => {
    net.planned["leads.xlsx"] = sheetOf([], { assist: assistWith([{ said: START, why: "next_step" }]) }, 3);
    const id = kept(sheetOf([], {}, 3), { say: WORDS });
    const first = drawView(id);
    await settle();
    expect(net.follows).toEqual([{ text: `The people are added. Answer only what I asked besides adding: ${START}`, label: "Your note on what you added", campaignId: "c-1" }]);
    first.unmount();
    const again = drawView(id);
    await settle();
    expect(said(again)).toContain("Everyone is already on the Senior Backend shortlist.");
    expect(net.follows).toHaveLength(1);
    expect(peekFor(id)?.passed).toBe(true);
    again.unmount();
  });

  it("says how the adding went when it finished, and not that the page was reloaded: nobody is asked to add the sheet again", async () => {
    const id = kept(sheetOf(many(2)));
    const first = drawView(id);
    await settle();
    pressText(first, "Add 2 to the Senior Backend shortlist");
    await settle();
    expect(said(first)).toContain("Added 2 people to the Senior Backend shortlist.");
    // Its files are let go as it finishes.
    expect(peekFor(id)).toBeNull();
    first.unmount();
    const again = drawView(id);
    await settle();
    const text = said(again);
    expect(text).toContain("Added 2 people to the Senior Backend shortlist.");
    expect(text).toContain("See the shortlist");
    expect(text).not.toContain("reloaded");
    expect(net.sends).toHaveLength(1);
    again.unmount();
  });

  it("reads the sheet again when an earlier drawing added some of the people and stopped, so its numbers are who is left and not who was there", async () => {
    const id = kept(sheetOf(many(151)));
    // After 150 went in, the sheet has one person who is not in.
    net.sheets["leads.xlsx"] = sheetOf([person("Person 150", "p150@example.com", { row: 152 })], {}, 150);
    net.send = (rows, call) => (call === 1 ? Promise.resolve(net.answerAll(rows)) : Promise.reject(new Error("The server stopped.")));
    const first = drawView(id);
    await settle();
    pressText(first, "Add 151 to the Senior Backend shortlist");
    await settle();
    expect(said(first)).toContain("The server stopped. 150 people were added before it stopped.");
    // Its files stay (going on with the rest is what they are for), but what they were read as is dropped.
    expect(peekFor(id)?.sheets[0]?.file).toBeTruthy();
    expect(peekFor(id)?.sheets[0]?.read).toBeNull();
    first.unmount();
    const reads = net.reads.length;
    const again = drawView(id);
    await settle();
    expect(net.reads.length).toBe(reads + 1);
    const text = said(again);
    expect(text).toContain("Add 1 to the Senior Backend shortlist");
    expect(text).not.toContain("Add 151");
    again.unmount();
  });

  it("does the same when the person left in the middle of adding: the page says how far it got, and the card they come back to reads the sheet again", async () => {
    const id = kept(sheetOf(many(151)));
    net.sheets["leads.xlsx"] = sheetOf([person("Person 150", "p150@example.com", { row: 152 })], {}, 150);
    let finishFirst: (v: unknown) => void = () => undefined;
    net.send = (rows) => new Promise((resolve) => { finishFirst = () => resolve(net.answerAll(rows)); });
    const first = drawView(id);
    await settle();
    pressText(first, "Add 151 to the Senior Backend shortlist");
    await settle();
    // The chat is left while the first batch is on its way; the batch lands, and no other is sent.
    first.unmount();
    finishFirst(null);
    await settle();
    expect(net.sends).toHaveLength(1);
    expect(net.toasts).toEqual(["Adding stopped when you left, after 150 of 151 people. Attach the sheet again to carry on: nobody is added twice."]);
    expect(peekFor(id)?.sheets[0]?.read).toBeNull();
    const again = drawView(id);
    await settle();
    expect(said(again)).toContain("Add 1 to the Senior Backend shortlist");
    again.unmount();
  });
});
