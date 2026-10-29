import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * One card for what one add held: a group of sheets and resumes is one card with one destination and one button, the files it was
 * given are still there when the card is drawn again, the button's count is read out beside it, and the words typed beside the files are
 * read once, by the card, and said back when they were not. What the card does when it runs (it joins the people of its files, adds them,
 * lets its files go, passes the words on) is in cardRun.test.tsx, which runs it; a draw to a string, as here, never runs an effect.
 */

vi.mock("../api/client", () => {
  class ApiError extends Error {}
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => null, messageOf: (e: Error) => e.message, LONG_REQUEST_TIMEOUT_MS: 170_000 };
});
vi.mock("../campaignStore", () => ({ useCampaignRows: () => [{ id: "c-1", name: "Senior Backend", status: "active", canManage: true }] }));
vi.mock("../campaignRights", () => ({ useMayChangeCampaign: () => true }));
vi.mock("../invalidate", () => ({ invalidate: () => undefined }));
vi.mock("../JdIntake", () => ({ JdIntake: () => null }));

const { default: PeopleImportView, PeopleFooter } = await import("../liveViews/PeopleImport");
const { stashFor, finishFor } = await import("../peopleSeed");
type CardView = import("../liveViews/PeopleImport").CardView;
type PeopleSheet = import("../peopleSheet").PeopleSheet;

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const none = () => undefined;

const sheet = (): PeopleSheet =>
  ({
    kind: "people",
    tabs: [{ name: "Sheet1", rows: 12, people: 10 }],
    tab: "Sheet1",
    headerRow: 1,
    columns: [{ index: 0, header: "Name", role: "name", confidence: "sure", how: "header", samples: ["Asha Verma"] }],
    needsCheck: false,
    counts: { rows: 12, people: 10, toAdd: 7, alreadyHere: 3, onCampaign: 0, repeats: 0, left: 0, namesFromLinks: 0, phonesRebuilt: 0, phonesCut: 0 },
    leftOutBy: {},
    leftOut: [],
    rows: [],
  }) as unknown as PeopleSheet;

const seed = (over: Record<string, unknown> = {}) => ({
  sheets: [{ file: new File(["x"], "leads.xlsx"), link: null, read: sheet(), campaignId: "c-1" }],
  words: null,
  picked: null,
  ...over,
});

const draw = (id: string) =>
  renderToStaticMarkup(
    <PeopleImportView
      card={{ kind: "view", key: `view:people-import:c-1:${id}`, view: "people-import", campaignId: "c-1", campaignName: "Senior Backend", query: `adding:${id}` } as never}
      ctx={{ onGrow: none } as never}
    />,
  ).replaceAll("<!-- -->", "");

const count = (html: string, what: string | RegExp): number => (typeof what === "string" ? html.split(what).length - 1 : (html.match(what) ?? []).length);

describe("a card that is drawn again on the same add", () => {
  it("still has its files while the adding is not over, and says the page was reloaded only when it really was: for an add that was never made here", () => {
    stashFor("add-card0001", seed());
    for (let draws = 0; draws < 3; draws += 1) {
      const html = draw("add-card0001");
      expect(html).not.toContain("isn&#x27;t here any more");
      expect(html).toContain("Adding people from leads.xlsx. Nothing else in it is added.");
    }
    // An add that was never made on this page is a reload, as before.
    expect(draw("add-card9999")).toContain("isn&#x27;t here any more because the page was reloaded");
  });

  it("says how the adding went once it is over, in the words it said then, and not that the page was reloaded: the files are let go, and nothing is to be added again", () => {
    stashFor("add-card0005", seed());
    finishFor("add-card0005", { line: "Added 7 people to Candidates. 3 were already here.", href: "#/contacts", link: "See Candidates" });
    const html = draw("add-card0005");
    expect(html).toContain("Added 7 people to Candidates. 3 were already here.");
    expect(html).toContain('<a class="cn-link" href="#/contacts">See Candidates</a>');
    expect(html).not.toContain("reloaded");
    expect(html).not.toContain("Adding people from leads.xlsx");
    // An add that was let go with nothing said of it (a reload cannot have said it) is still the page that was reloaded.
    stashFor("add-card0006", seed());
    finishFor("add-card0006");
    expect(draw("add-card0006")).toContain("isn&#x27;t here any more because the page was reloaded");
  });
});

describe("a group of sheets and resumes", () => {
  const group = () => seed({ resumes: [{ id: "r1", name: "priya.pdf", text: "Priya Nair\npriya@example.com", picture: false }, { id: "r2", name: "ravi.pdf", text: "Ravi Kumar", picture: false }] });

  it("is one card: one line for what is added from all the files, one destination and one foot, not a card for the resumes above the sheet's", () => {
    stashFor("add-card0002", group());
    const html = draw("add-card0002");
    expect(count(html, 'class="pi-scope')).toBe(1);
    expect(html).toContain("Adding people from 3 files. Nothing else in them is added.");
    expect(count(html, "Also put them on a campaign")).toBe(1);
    expect(count(html, 'class="pi-foot')).toBe(1);
    // The sheet has its tick, as one of several files does; the resumes are a part of the same card, with no scope line or foot of their own.
    expect(html).toContain("leads.xlsx, 10 people");
    expect(html).toContain("Reading 2 resumes");
    expect(html).not.toContain("Adding people from 2 files");
  });

  it("is a card of the resumes alone when there are no sheets, and of the sheets alone when there are no resumes", () => {
    stashFor("add-card0003", seed({ sheets: [], resumes: [{ id: "r1", name: "priya.pdf", text: "Priya Nair", picture: false }] }));
    expect(draw("add-card0003")).toContain("Adding people from priya.pdf. Nothing else in it is added.");
    stashFor("add-card0004", seed());
    const sheets = draw("add-card0004");
    expect(sheets).not.toContain("resumes");
    expect(count(sheets, 'class="pi-scope')).toBe(1);
  });

  it("reads the resumes by their own route, asked for once, whether they are alone or in the card of the sheets (the one list the one button sends is in cardRun.test.tsx)", () => {
    expect(src("liveViews/ResumeImport.tsx").match(/resumeApi\.read\(/g)).toHaveLength(1);
    expect(src("liveViews/PeopleImport.tsx").match(/await addAndPlace\(/g)).toHaveLength(1);
  });
});

describe("the button's count, said where a screen reader finds it", () => {
  const view = (over: Partial<CardView> = {}): CardView => ({
    name: "leads.xlsx", phase: "ready", sheet: null, shortlist: { id: "c-1", name: "Senior Backend" }, choice: null, note: null, error: null,
    progress: null, done: null, columnsOpen: false, refreshing: false, stale: false, scope: null, words: null, tabs: [], hidden: null, total: 212, ...over,
  });
  const on = { onColumn: none, onShortlist: none, onAdd: none, onToggleColumns: none, onRetry: none, onAsRoles: none, onAnother: none, onTab: none, onHidden: none };

  it("is a sentence in a polite live region that the Add button is described by, heard and not drawn on a card of one file", () => {
    const html = renderToStaticMarkup(<PeopleFooter view={view()} on={on} />);
    const said = /<p id="([^"]+)" class="sr-only" aria-live="polite">([^<]*)<\/p>/.exec(html);
    expect(said?.[2]).toBe("212 people will be added to the Senior Backend shortlist.");
    expect(html).toContain(`aria-describedby="${said?.[1]}"`);
    expect(html).toContain("Add 212 to the Senior Backend shortlist");
  });

  it("is the totals line itself on a card of several files, in view, with the rows that were joined said plainly", () => {
    const html = renderToStaticMarkup(<PeopleFooter view={view({ shortlist: null, totals: "212 people from 3 files. 18 rows joined, because the same person is in more than one file." })} on={on} />);
    const said = /<p id="([^"]+)" class="pi-totals t-body-sm" aria-live="polite">([^<]*)<\/p>/.exec(html);
    expect(said?.[2]).toContain("18 rows joined");
    expect(html).toContain(`aria-describedby="${said?.[1]}"`);
    expect(html).not.toContain("sr-only");
  });

  it("is not there when nobody is to be added, nor once the adding is done", () => {
    expect(renderToStaticMarkup(<PeopleFooter view={view({ total: 0 })} on={on} />)).not.toContain("aria-live");
    expect(renderToStaticMarkup(<PeopleFooter view={view({ phase: "done", done: { line: "Added 3.", href: "#", link: "See" } })} on={on} />)).not.toContain("aria-live");
  });
});

describe("the words typed beside the files", () => {
  it("are asked of the agent from one place only (the order, the once, and what goes are in cardRun.test.tsx, which runs the card)", () => {
    const card = src("liveViews/PeopleImport.tsx");
    expect(card.match(/follow\?\.\(/g)).toHaveLength(1);
    expect(card.match(/sendAction\(/g)).toHaveLength(1);
    expect(src("Agent.tsx")).not.toContain("FOLLOW_UP_LABEL");
  });

  it("are said back when they were not read: one word of them is nothing the card asks a model about, and is said in a line under the files' heading", () => {
    const card = src("liveViews/PeopleImport.tsx");
    expect(card).toContain("unreadLine(say, campaignsIn(say, campaigns).map((c) => c.name))");
    // Only for files the model's help was not asked about: where it was, the words were read there and say what became of them.
    expect(card).toContain("!reports[id]?.asked");
    expect(card).toContain("asked: planned.current,");
    expect(card).toContain("{view.unread && <p className=\"pi-note t-body-sm\">{view.unread}</p>}");
  });
});
