import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The people card: what it draws for each state of a sheet (reading, read, adding, done, failed), and where it is hosted
 * (the chat's view, the paperclip on the composer, the routing of an attached sheet). The reading, the counts and the batches
 * are the rules in peopleSheet.ts, tested there, and the server's reading is tested there.
 */

vi.mock("../api/client", () => {
  class ApiError extends Error {}
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => null, messageOf: (e: Error) => e.message, LONG_REQUEST_TIMEOUT_MS: 170_000 };
});
vi.mock("../campaignStore", () => ({ useCampaignRows: () => [] }));
vi.mock("../campaignRights", () => ({ useMayChangeCampaign: () => true }));
vi.mock("../invalidate", () => ({ invalidate: () => undefined }));
vi.mock("../JdIntake", () => ({ JdIntake: () => null }));

const { PeopleCard } = await import("../liveViews/PeopleImport");
type CardView = import("../liveViews/PeopleImport").CardView;
type PeopleSheet = import("../peopleSheet").PeopleSheet;

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const none = () => undefined;
const on = { onColumn: none, onShortlist: none, onAdd: none, onToggleColumns: none, onRetry: none, onAsRoles: none, onAnother: none, onTab: none, onHidden: none, onRule: none, onFile: none };

const sheet = (over: Partial<PeopleSheet> = {}): PeopleSheet => ({
  kind: "people",
  tabs: [{ name: "Sheet1", rows: 12, people: 10 }],
  tab: "Sheet1",
  headerRow: 1,
  columns: [
    { index: 0, header: "Name", role: "name", confidence: "sure", how: "header", samples: ["Asha Verma"] },
    { index: 1, header: "Page", role: "linkedin", confidence: "likely", how: "content", samples: ["linkedin.com/in/asha"] },
    { index: 2, header: "Added by", role: "addedBy", confidence: "sure", how: "header", samples: ["Neha"] },
  ],
  needsCheck: false,
  counts: { rows: 12, people: 10, toAdd: 7, alreadyHere: 3, onCampaign: 1, repeats: 0, left: 2, namesFromLinks: 0, phonesRebuilt: 0, phonesCut: 0 },
  leftOutBy: { "no-contact": 2 },
  leftOut: [{ row: 4, tab: "Sheet1", why: "no-contact" }, { row: 9, tab: "Sheet1", why: "no-contact" }],
  rows: Array.from({ length: 7 }, (_, i) => ({ row: i + 2, tab: "Sheet1", state: "new" as const, fields: { fullName: `P${i}` } })),
  ...over,
});

const view = (over: Partial<CardView> = {}): CardView => ({
  name: "candidates.xlsx",
  phase: "ready",
  sheet: sheet(),
  shortlist: { id: "c-1", name: "Backend" },
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

describe("a sheet that was read", () => {
  const html = draw(view());

  it("says what it found and how it splits, once each", () => {
    expect(html).toContain("I found 10 people in candidates.xlsx");
    expect(html).toContain("7 new to your candidates");
    expect(html).toContain("3 already in your candidates, kept as they are, 1 already on the Backend shortlist");
  });

  it("says why rows were left out, by row", () => {
    expect(html).toContain("Left out");
    expect(html).toContain("2 rows have no LinkedIn link, email or phone to tell them apart (row 4, row 9)");
  });

  it("has one clear button, naming the shortlist the people go on", () => {
    expect(html).toMatch(/<button[^>]*class="src-btn is-primary mo-small"[^>]*>Add 7 to the Backend shortlist/);
    expect(html.match(/is-primary/g)).toHaveLength(1);
  });

  it("keeps the columns folded while it is sure, with a way to open them", () => {
    expect(html).toContain("How I read your columns");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("pi-col-list");
  });

  it("goes to Candidates, with a campaign to choose, when the chat is on none", () => {
    const general = draw(view({ shortlist: null, choice: { options: [{ id: "c-1", name: "Backend" }, { id: "c-2", name: "Design" }], value: null } }));
    expect(general).toContain("Add 7 to Candidates");
    expect(general).toContain("Also put them on a campaign");
    expect(general).toContain("No, just Candidates");
    expect(general).toContain(">Backend</option>");
    expect(general).toContain(">Design</option>");
  });

  it("has no dot badges, no status pills and no jargon", () => {
    for (const word of ["pill", "badge", "role spec", "JSON", "parse", "schema"]) expect(html.toLowerCase()).not.toContain(word.toLowerCase());
    expect(html).not.toMatch(/\bjob\b/i);
  });
});

describe("the columns, as they were read", () => {
  const open = draw(view({ columnsOpen: true, sheet: sheet({ needsCheck: true, columns: [
    { index: 0, header: "Name", role: "name", confidence: "sure", how: "header", samples: ["Asha Verma"] },
    { index: 1, header: "Page", role: "linkedin", confidence: "guess", how: "content", samples: ["linkedin.com/in/asha"] },
    { index: 2, header: "", role: "phone", confidence: "likely", how: "content", samples: ["98450 12345"] },
    { index: 3, header: "Added by", role: "addedBy", confidence: "sure", how: "header", samples: ["Neha"] },
  ] }) }));

  it("gives each column a dropdown to say what it is, the left-out ones after the rest", () => {
    expect(open).toContain('aria-label="Columns"');
    expect(open).toContain('aria-label="What Name (column A) is"');
    expect(open).toContain('aria-label="What Page (column B) is"');
    expect(open).toContain('aria-label="What Column C is"');
    expect(open.indexOf("What Column C is")).toBeLessThan(open.indexOf("What Added by (column D) is"));
    expect(open).toMatch(/<option value="linkedin" selected="">LinkedIn link<\/option>/);
    // The sheet's own bookkeeping reads as left out, which is a thing a person can say.
    expect(open).toMatch(/<option value="ignore" selected="">Leave out<\/option>/);
    expect(open).toContain("linkedin.com/in/asha");
  });

  it("says what it was unsure of, in plain words, and asks for a look", () => {
    expect(open).toContain("not sure");
    expect(open).toContain("I wasn&#x27;t sure about a column or two");
    expect(open).toContain("Hide the columns");
  });

  it("asks for the columns when it could not tell which hold names or ways to reach people", () => {
    const blind = draw(view({ columnsOpen: true, sheet: sheet({ needsCheck: true, columns: [{ index: 0, header: "Stuff", role: "extra", confidence: "likely", how: "header", samples: [] }] }) }));
    expect(blind).toContain("I couldn&#x27;t tell which column holds LinkedIn links, emails or phone numbers");
    const folded = draw(view({ columnsOpen: false, sheet: sheet({ needsCheck: true, columns: [{ index: 0, header: "Stuff", role: "extra", confidence: "likely", how: "header", samples: [] }] }) }));
    expect(folded).toContain("Check the columns");
  });
});

describe("while it works, and after", () => {
  it("shows the reading of a sheet, with no way to add yet", () => {
    const html = draw(view({ phase: "reading", sheet: null }));
    expect(html).toContain("Reading candidates.xlsx");
    expect(html).not.toContain("is-primary");
  });

  it("says it is reading again after a column was changed, and holds the button until the new reading is in", () => {
    const html = draw(view({ refreshing: true }));
    expect(html).toContain("Reading it again");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add 7 to the Backend shortlist/);
  });

  it("shows how far the adding has got", () => {
    const html = draw(view({ phase: "adding", progress: { done: 300, total: 1200 } }));
    expect(html).toContain("Adding 300 of 1,200");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="300"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?class="ldr is-sm is-inherit".*?Adding<\/button>/);
    expect(html).toContain('aria-busy="true"');
  });

  it("ends on one line of what happened, with where to see them", () => {
    const html = draw(view({
      phase: "done",
      done: { line: "Added 7 people to the Backend shortlist. 3 were already in Candidates and are on the shortlist now.", href: "#/campaign/shortlisted?campaign=c-1", link: "See the shortlist" },
    }));
    expect(html).toContain("Added 7 people to the Backend shortlist.");
    expect(html).toContain('href="#/campaign/shortlisted?campaign=c-1"');
    expect(html).toContain("See the shortlist");
    expect(html).not.toContain("Add 7 to");
    expect(html).toContain("Add another sheet");
  });

  it("says in place of the button that there is nothing to add when everyone is already there", () => {
    const html = draw(view({ sheet: sheet({ rows: [], counts: { ...sheet().counts, toAdd: 0, alreadyHere: 10, onCampaign: 10 } }) }));
    expect(html).toContain("Everyone is already on the Backend shortlist.");
    expect(html).not.toContain("is-primary");
  });

  it("tells a failed reading in the sheet's own words and offers to try again", () => {
    const html = draw(view({ phase: "failed", sheet: null, error: "That is an old Excel file (.xls). Open it and save it as .xlsx or CSV, then attach it again." }));
    expect(html).toContain("old Excel file");
    expect(html).toContain("Try again");
  });

  it("keeps a failed adding in view with what went in and that adding again is safe", () => {
    const html = draw(view({ error: "That took longer than expected. 150 people were added before it stopped. Adding again is safe: nobody is added twice." }));
    expect(html).toContain("Adding again is safe");
    expect(html).toContain("Add 7 to the Backend shortlist");
  });

  it("explains why the people go to Candidates when the campaign cannot take them", () => {
    const html = draw(view({ shortlist: null, note: "You follow Backend but are not on it, so I'll add them to Candidates." }));
    expect(html).toContain("You follow Backend but are not on it");
    expect(html).toContain("Add 7 to Candidates");
  });

  it("lets the person tick the tabs of a workbook that has several, and says which are not added", () => {
    const html = draw(view({ tabs: [{ name: "Backend", people: 5, on: true }, { name: "Archive", people: 40, on: false }] }));
    expect(html).toContain("Tabs to add");
    expect(html).toMatch(/<input type="checkbox"[^>]*checked=""[^>]*\/><span>Backend <small[^>]*>\(5 people\)/);
    expect(html).toMatch(/<input type="checkbox"\/><span>Archive <small[^>]*>\(40 people, not added\)/);
    // One tab alone is nothing to choose, and the last tab ticked can not be taken off.
    expect(draw(view({ tabs: [{ name: "Backend", people: 5, on: true }] }))).not.toContain("Tabs to add");
    expect(html).toMatch(/<input type="checkbox"[^>]*disabled=""[^>]*\/><span>Backend/);
  });

  it("leaves out what the workbook hides, and has one tick to read it", () => {
    const html = draw(view({ hidden: { label: "Include the 2 rows and 1 column the sheet hides", on: false } }));
    expect(html).toMatch(/<input type="checkbox"[^>]*\/><span>Include the 2 rows and 1 column the sheet hides<\/span>/);
    expect(draw(view({ hidden: { label: "Hidden rows and columns are included", on: true } }))).toMatch(/<input type="checkbox" checked=""[^>]*\/><span>Hidden rows and columns are included/);
    expect(draw(view())).not.toContain("hides");
    const left = draw(view({ sheet: sheet({ leftOutBy: { hidden: 2 }, leftOut: [{ row: 3, tab: "Sheet1", why: "hidden" }, { row: 5, tab: "Sheet1", why: "hidden" }] }) }));
    expect(left).toContain("2 rows are hidden in the sheet, so they were left out (row 3, row 5)");
  });

  it("says first what is added, and that nothing else in the file is", () => {
    const html = draw(view({ scope: "Adding people from candidates.xlsx. Nothing else in it is added." }));
    expect(html.indexOf("Adding people from candidates.xlsx. Nothing else in it is added.")).toBeLessThan(html.indexOf("I found 10 people"));
    expect(html).toMatch(/^<div class="pi"[^>]*><p class="pi-scope[^"]*">Adding people from/);
    // The other states open on it as well.
    const scope = "Adding people from candidates.xlsx. Nothing else in it is added.";
    expect(draw(view({ scope, phase: "reading", sheet: null }))).toContain(scope);
    expect(draw(view({ scope, sheet: sheet({ kind: "other" }) }))).toContain(scope);
    expect(draw(view())).not.toContain("Nothing else in it is added");
  });

  it("says the note stays in the chat when the words picked the campaign", () => {
    const html = draw(view({ words: "Your note stays in the chat. I used it to pick Pune Backend." }));
    expect(html).toContain("Your note stays in the chat. I used it to pick Pune Backend.");
  });

  it("never opens the roles import for a file chosen as Candidates: a list of roles gets the plain sentence and a button", () => {
    const html = draw(view({ scope: "Adding people from tenders.xlsx. Nothing else in it is added.", sheet: sheet({ kind: "roles", counts: { ...sheet().counts, people: 0 } }) }));
    expect(html).toContain("I couldn&#x27;t find people in candidates.xlsx");
    expect(html).toContain("Read it as roles");
  });
});

describe("where they go", () => {
  const options = [{ id: "c-1", name: "Backend" }, { id: "c-2", name: "Design" }];

  it("is the campaign the message came from, with Candidates alone always one choice away", () => {
    const html = draw(view({ shortlist: { id: "c-1", name: "Backend" }, choice: { options, value: "c-1" } }));
    expect(html).toContain("Add 7 to the Backend shortlist");
    expect(html).toContain("Also put them on a campaign");
    expect(html).toContain('<option value="">No, just Candidates</option>');
    expect(html).toContain('<option value="c-1" selected="">Backend</option>');
    expect(html).toContain('<option value="c-2">Design</option>');
  });

  it("is Candidates when the person chose that, with the campaign still on offer", () => {
    const html = draw(view({ shortlist: null, choice: { options, value: null } }));
    expect(html).toContain("Add 7 to Candidates");
    expect(html).toContain('<option value="" selected="">No, just Candidates</option>');
    expect(html).toContain('<option value="c-1">Backend</option>');
  });

  it("takes the campaign the message carried as the one it starts on, and Candidates when there is none", () => {
    const card = src("liveViews/PeopleImport.tsx");
    // Not chosen yet: the carried campaign when it may be used, else Candidates. Chosen: what was chosen, null being Candidates.
    // (The model's reading of the words comes between: a campaign they named, which the person's own pick still outranks. It is one function: peopleSheet.ts, whereTheyGo.)
    expect(card).toContain("const { suggested, wanted } = whereTheyGo({ pick, words: !!words, suggests: ids.map((id) => reports[id]?.suggests ?? null), campaigns, onFocus, focusId });");
    expect(card).toContain("choice: campaigns.length ? { options: campaigns, value: shortlistId } : null,");
    expect(card).not.toContain("choice: onFocus ? null");
  });
});

describe("a sheet that is neither people nor roles", () => {
  const other = sheet({ kind: "other", columns: [], needsCheck: false, rows: [], counts: { ...sheet().counts, people: 0, toAdd: 0, alreadyHere: 0 }, leftOutBy: {}, leftOut: [] });

  it("says what a sheet of people needs, and offers to read it as roles instead of ending there", () => {
    const html = draw(view({ sheet: other }));
    expect(html).toContain("I couldn&#x27;t find people in candidates.xlsx");
    expect(html).toContain("a LinkedIn link, an email or a phone number on each row");
    expect(html).toContain("Read it as roles");
    expect(html).not.toContain("is-primary");
    expect(html).not.toMatch(/\bjob\b/i);
  });

  it("has no way on to a next sheet: the files are on the one card, each in its own section", () => {
    const html = draw(view({ sheet: other }));
    expect(html).not.toContain("Next sheet");
    expect(src("liveViews/PeopleImport.tsx")).not.toContain("Next sheet");
  });

  it("goes on to the roles import in place when the person says so, for a file or a link", () => {
    const card = src("liveViews/PeopleImport.tsx");
    expect(card).toContain('((sheet?.kind === "roles" && !scoped) || (sheet && sheet.kind !== "people" && asRoles)) && (source.file || source.link)');
    expect(card).toContain("onAsRoles: () => setAsRoles(true)");
    expect(card).toContain("links: source.link ? [source.link] : []");
  });
});

describe("when a reading fails after one was shown", () => {
  it("keeps adding off, says why in plain words, and offers to read it again", () => {
    const html = draw(view({ stale: true, error: "I couldn't read the sheet again, so Add stays off until I can. Can't reach SuperHyre. Check your connection and try again." }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add 7 to the Backend shortlist/);
    expect(html).toContain("Add stays off until I can");
    expect(html).toMatch(/<button[^>]*>Read it again<\/button>/);
  });

  it("does not offer to read it again while the reading is fine", () => {
    expect(draw(view())).not.toContain("Read it again");
  });

  it("marks the reading as failed only when a reading is shown, and clears it when one works", () => {
    const card = src("liveViews/PeopleImport.tsx");
    expect(card).toContain("setStale(true);");
    expect(card).toContain("setStale(false);");
    expect(card).toContain("stale: stale && !!sheet,");
    expect(card).toContain("if (adding || running.current || busy || stale || !everyone.length) return;");
  });
});

describe("when adding stops short", () => {
  it("says how many went in and that going on is safe, and the button offers who is left", () => {
    const line = "Can't reach SuperHyre. Check your connection and try again. 450 people were added before it stopped. Adding again carries on with the rest, and nobody is added twice.";
    const html = draw(view({ error: line, sheet: sheet({ rows: sheet().rows.slice(0, 4) }) }));
    expect(html).toContain("450 people were added before it stopped");
    expect(html).toContain("Add 4 to the Backend shortlist");
  });

  it("counts across tries, reads the sheet again for who is left, and cuts a batch that is too big", () => {
    const card = src("liveViews/PeopleImport.tsx");
    expect(card).toContain("const before = earlier.current?.for === shortlistId ? earlier.current : null;");
    expect(card).toContain("const now = carryOn(before?.tally ?? NOBODY, tally(run.parts));");
    // What the tries that stopped short already moved is said beside who they added, and carried to the line that ends the adding.
    expect(card).toContain("const placed = carryPlaced(before?.placed ?? null, placedNow);");
    expect(card).toContain("earlier.current = { for: shortlistId, tally: now, placed };");
    expect(card).toContain("setHalt(stoppedLine(messageOf(run.failure.error), now, placed));");
    // Only when somebody went in on the try that stopped: otherwise what is shown is still true (peopleSheet.test.ts, readAgainAfter).
    // Every file on the card reads its sheet again when the count goes up.
    expect(card).toContain("if (readAgainAfter(run)) setAgain((n) => n + 1);");
    expect(card).toContain("}, [chosen, shortlistId, load, again]);");
    expect(card).toContain("doneLine(now, shortlist?.name ?? null, placed)");
  });
});

describe("leaving the card, or asking again", () => {
  const card = src("liveViews/PeopleImport.tsx");

  it("cancels a reading that was asked for again, and answers only for the newest", () => {
    expect(card).toContain("const read = reads.begin();");
    expect(card).toContain("const opts = { campaignId, columns, tabs, hidden, plan: mode === \"read\" ? (kept.current ?? undefined) : undefined, signal: read.signal };");
    expect(card).toContain("if (!read.current()) return;");
    expect(src("api/peopleSheet.ts")).toContain("...cancel(options.signal)");
  });

  it("stops the reading and the adding when the card is left, so nothing keeps posting behind a card that is gone", () => {
    expect(card).toContain("useEffect(() => () => reads.stop(), [reads]);");
    expect(card).toContain("useEffect(() => () => running.current?.abort(), []);");
    // What was done before it stopped is said where the card no longer is, in a line that stays.
    expect(card).toContain('if (run.stopped) { if (run.sent) toast(leftEarlyLine(run.sent, everyone.length), "error"); return; }');
    expect(src("api/peopleSheet.ts")).toContain("cancel(signal),");
  });
});

describe("for the keyboard and a screen reader", () => {
  const dup = draw(view({ columnsOpen: true, sheet: sheet({ needsCheck: true, columns: [
    { index: 0, header: "Name", role: "name", confidence: "sure", how: "header", samples: ["Asha Verma"] },
    { index: 1, header: "Email", role: "email", confidence: "sure", how: "header", samples: ["asha@example.com"] },
    { index: 2, header: "Email", role: "workEmail", confidence: "likely", how: "header", samples: ["asha@work.example"] },
    { index: 3, header: "Notes", role: "notes", confidence: "sure", how: "header", samples: [] },
  ] }) }));

  it("tells two columns with the same header apart by their place", () => {
    expect(dup).toContain('aria-label="What Email (column B) is"');
    expect(dup).toContain('aria-label="What Email (column C) is"');
  });

  it("ties each dropdown to the sample cell beside it, when the column has one", () => {
    const ids = [...dup.matchAll(/<select[^>]*aria-describedby="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(dup).toContain(`id="${id}"`);
    // The column with nothing to show has nothing to describe it.
    expect(dup.match(/<select[^>]*aria-label="What Notes \(column D\) is"[^>]*>/)?.[0]).not.toContain("aria-describedby");
  });

  it("says which list the columns button opens", () => {
    const controls = /aria-controls="([^"]+)"/.exec(dup)?.[1];
    expect(controls).toBeTruthy();
    expect(dup).toContain(`<ul id="${controls}" class="pi-col-list" aria-label="Columns">`);
  });

  it("says in words how far the adding has got, not only in a number", () => {
    const html = draw(view({ phase: "adding", progress: { done: 300, total: 1200 } }));
    expect(html).toContain('aria-valuetext="Adding 300 of 1,200"');
  });

  it("can take focus on the line that says how it went, whether it finished or stopped short", () => {
    const done = draw(view({ phase: "done", done: { line: "Added 7 people to the Backend shortlist.", href: "#/contacts", link: "See the shortlist" } }));
    expect(done).toMatch(/<p[^>]*tabindex="-1"[^>]*class="pi-done[^"]*"[^>]*role="status"/);
    const stopped = draw(view({ error: "Can't reach SuperHyre. 150 people were added before it stopped." }));
    expect(stopped).toMatch(/<p[^>]*tabindex="-1"[^>]*role="alert"/);
  });

  it("moves focus to that line when adding ends", () => {
    const card = src("liveViews/PeopleImport.tsx");
    expect(card).toContain('if (was.current === "adding") (phase === "done" ? result : problem).current?.focus();');
  });
});

describe("where it is hosted", () => {
  it("is a view of the chat, shown when the agent's reply names people-import, and takes the sheets the composer left for it", () => {
    expect(src("liveViews/index.tsx")).toContain('"people-import": lazy(() => import("./PeopleImport"))');
    expect(src("chatViews.ts")).toContain('"people-import"');
    expect(src("liveViews/PeopleImport.tsx")).toContain("takePeople()");
    // A card the paperclip opened takes the files of its own add, by the id in its query, and nobody else's.
    expect(src("liveViews/PeopleImport.tsx")).toContain("(adding ? peekFor(adding) : null)");
  });

  it("reads again for the campaign picked or the column changed, adds in batches to the one import, and refreshes what shows the people", () => {
    const card = src("liveViews/PeopleImport.tsx");
    expect(card).toContain("peopleSheetApi.read(source.file, opts)");
    // The batches are sent by addAndPlace (peopleSheet.ts), which cuts them and halves one that is too big.
    expect(card).toContain("await addAndPlace(everyone, {");
    expect(card).toContain("send: (fields) => peopleSheetApi.send(fields, shortlistId, stop.signal),");
    expect(card).toContain('invalidate(["pipeline", "candidates", "campaign"]');
    const api = src("api/peopleSheet.ts");
    expect(api).toContain("/v1/candidates/sheet/read");
    expect(api).toContain("/v1/candidates/import");
    expect(api).toContain('mode: "skip"');
  });

  it("hands a sheet of roles on to the roles import, in place, only for a sheet the words opened: a file chosen as Candidates never is", () => {
    expect(src("liveViews/PeopleImport.tsx")).toContain("<JdIntake seed=");
    expect(src("liveViews/PeopleImport.tsx")).toContain('((sheet?.kind === "roles" && !scoped) || (sheet && sheet.kind !== "people" && asRoles))');
  });
});

describe("a sheet the page no longer has", () => {
  it("says so, once, in the card's own place, and has a button that opens the paperclip's menu", async () => {
    const { Gone } = await import("../liveViews/Gone");
    const html = renderToStaticMarkup(<Gone what="This sheet" />);
    expect(html).toContain("This sheet isn&#x27;t here any more because the page was reloaded. Add it again with the paperclip. Nobody is added twice.");
    expect(html).toContain(">Add something</button>");
    expect(src("liveViews/Gone.tsx")).toContain("window.dispatchEvent(new CustomEvent(OPEN_ADD_MENU))");
    expect(src("Agent.tsx")).toContain("window.addEventListener(OPEN_ADD_MENU, open);");
  });

  it("says of roles that they are not here, in the plural, and that campaigns already made are in the list: nobody is added twice is a promise about people, not about campaigns", async () => {
    const { Gone } = await import("../liveViews/Gone");
    const html = renderToStaticMarkup(<Gone what="These roles" plural last="Any campaigns already made are in your list, so add only the roles that are left." />);
    expect(html).toContain("These roles aren&#x27;t here any more because the page was reloaded. Add them again with the paperclip. Any campaigns already made are in your list, so add only the roles that are left.");
    expect(html).not.toContain("Nobody is added twice");
  });

  it("is what a card says when it is drawn again after it finished: how it went, the link to see it, and not a word about a reload", async () => {
    const { Finished } = await import("../liveViews/Gone");
    const html = renderToStaticMarkup(<Finished line="Added 7 people to Candidates." href="#/contacts" link="See Candidates" />);
    expect(html).toContain("Added 7 people to Candidates.");
    expect(html).toContain('href="#/contacts">See Candidates</a>');
    expect(html).not.toMatch(/reloaded|Add something/);
  });

  it("is what a card the paperclip opened shows when its files were not kept, instead of the bare picker", () => {
    expect(src("liveViews/PeopleImport.tsx")).toContain('<Gone what="This sheet" />');
    expect(src("liveViews/PeopleImport.tsx")).toContain("{adding && !own ? (");
  });
});

describe("the paperclip", () => {
  const agent = src("Agent.tsx");

  it("does not turn a sheet away for having more people than can be added at once: its chip is ready, and its card reads it with the words", () => {
    // The read at pick time has no words, so it can only say "too many"; a chip that failed there could never reach the card or the plan.
    expect(agent).toContain("const many = tooManyPeople(err);");
    expect(agent).toContain('if (many === null) fail(err);');
    expect(agent).toContain('else patch(id, () => ({ status: "ready", tooMany: many, scope: chosen ?? "candidates" }));');
  });

  it("is one quiet button in the composer's row that opens the menu of what to add, not the picker", () => {
    expect(agent).toContain('className="orc-pin"');
    expect(agent).toContain("PaperclipHorizontal");
    // (Only once the server says it takes the choice: addingFlag.ts. For one that does not, the same button opens the picker at once.)
    expect(agent).toContain("onClick={() => (modern ? setMenuOpen((o) => !o) : openPicker())}");
    expect(agent).not.toContain("onClick={() => picker.current?.click()}");
    expect(agent).toContain('aria-label="Add something"');
    expect(agent).toContain('aria-haspopup={modern ? "menu" : undefined}');
    expect(src("composer.css")).toContain(".orc .orc-composer .orc-pin");
  });

  it("stays on at the limit: the menu says why its rows can not be chosen", () => {
    const pin = agent.slice(agent.indexOf('className="orc-pin"'), agent.indexOf("</button>", agent.indexOf('className="orc-pin"')));
    expect(pin).not.toContain("disabled=");
  });

  it("opens the picker for the kind chosen, in the same press: what it takes and one file or many are set on the input itself", () => {
    expect(agent).toContain("input.accept = row?.accept ?? `${SHEET_TYPES},${ATTACH_ACCEPT}`;");
    expect(agent).toContain("input.multiple = row?.multiple ?? true;");
    expect(agent.indexOf("input.accept =")).toBeLessThan(agent.indexOf("input.click();"));
    expect(agent).toContain("onPick={(row) => { setMenuOpen(false); openPicker(row); }}");
    // The input has no list of its own to start with, and after the dialog the words have focus again.
    expect(agent).not.toContain("accept={`${ATTACH_ACCEPT},${SHEET_ACCEPT}`}");
    expect(agent).toContain("areaRef.current?.focus();");
  });

  it("gives every file the scope that was chosen, as data: a drop or a paste only gets a suggestion, and a sheet is read when it is attached", () => {
    expect(agent).toContain("...(chosen ? { scope: chosen } : { suggested: true }),");
    expect(agent).toContain("readOne(f, forCampaign, (file, opts) => peopleSheetApi.read(file, opts))");
    expect(agent).toContain("scope: chosen ?? suggest({ kind, sheetKind: got.sheet.kind }, here)");
  });

  it("reads sheets two at a time by handing the read back to the queue and filling the chip from what the queue answers, not from inside the job", () => {
    expect(agent).toContain("const readLater = useRef(inTurns(2)).current;");
    expect(agent).toMatch(/readLater\(async \(\) => \{[^]*?return readOne\(f, forCampaign, [^]*?\}\)\.then\(\n\s+\(got\) => patch\(id, /);
    expect(agent).not.toContain("p.running");
  });

  it("sends the choice with the message and keeps each add's files under its id, so two sends keep their own", () => {
    expect(agent).toContain("const plan = LIVE ? (draftApi.current.outgoing?.() ?? null) : null;");
    expect(agent).toContain("stashFor(m.adding.id, {");
    // The words as typed go to the card with its sheets, to be read beside their shapes.
    expect(agent).toContain("words: m.keep.words, picked: m.keep.picked, say: m.keep.say }");
    // (Each message goes with the choice it carries, and a job description's with the work its file waits for: adding.ts partsOf.)
    expect(agent).toContain("sendMessages(partsOf(plan.messages, jdBefore));");
    // A sheet is not routed by what is in it any more: the page has no road that reads it and decides.
    expect(agent).not.toContain("routeSheets(");
    expect(agent).not.toContain("sendSheets");
  });

  it("says on the chip of an old Excel file that a workbook with a password shows the same header, in the words adding.ts keeps", () => {
    expect(agent).toContain("throw oldExcelLine(name);");
    expect(agent).not.toContain("is an old Excel file. Save it as .xlsx or CSV and attach it again.");
  });

  it("is told apart from the bulk chip it replaces: no chip, no group in the docked bar", () => {
    expect(agent).not.toContain("BulkChip");
    expect(agent).not.toContain("BulkList");
    expect(agent).not.toContain("Add in bulk");
  });
});

describe("a Google Sheet's link in the composer", () => {
  const agent = src("Agent.tsx");
  const chips = src("AttachChips.tsx");

  it("is a chip like a sheet that was dropped: read at once, for the campaign in the chat, and suggested what it looks like", () => {
    // What the chip does is run in adding.test.ts (takeLinks); the page only hands it its chips, its read and its note.
    expect(agent).toContain("const addLinks = (urls: readonly string[]) => {");
    expect(agent).toContain("takeLinks(urls, linkDoor);");
    expect(agent).toContain("return readLinkOne(url, forCampaign, (u, opts) => peopleSheetApi.readLink(u, opts));");
    // Two at a time with the sheets that were attached, and what was read is the chip's, so the card does not read it twice.
    expect(agent).toContain("readLater(() => {");
    expect(agent).toContain('suggest: (sheet) => suggest({ kind: "sheet", sheetKind: sheet.kind }, here),');
    expect(agent).toContain("add: (chip, replacing) => setAtts((a) => [...a.filter((x) => !replacing.includes(x.id)), chip]),");
    // The card reads the sheet by the link when it has to (a column set, a rule ticked).
    expect(agent).toContain("link: chip.link ?? null, read: chip.sheet ?? null");
  });

  it("says why it could not be read on the chip, in the server's words, so a sheet that needs a sign-in says so", () => {
    // (The line itself is run in adding.test.ts: a failed read leaves the chip failed with the server's words.)
    expect(agent).toContain("words: messageOf,");
  });

  it("has one door: the page no longer reads a link in the words and sends it on its own", () => {
    expect(agent).not.toContain("const readLink = ");
    expect(agent).not.toContain("routeLink");
    expect(agent).not.toContain("sheetLink:");
    expect(agent).not.toContain("rolesLinkIn");
    // (The files wait for their card unkeyed in one place only: a Send for a server that does not take the paperclip's choice, addingFlag.ts.)
    expect(agent.match(/stashPeople\(/g) ?? []).toHaveLength(1);
    expect(agent).toContain("if (m.keep && !m.adding) {");
    // A link left in the words is made a chip, and the Send is held so the chip is seen before anything goes.
    expect(agent).toContain("if (draftApi.current.liftLinks?.()) return;");
    expect(agent).toContain("return liftLinksFrom(draftNow.current, linkDoor, setDraft);");
  });

  it("is a chip when it is pasted alone into an empty field, and part of the words when it is pasted among them", () => {
    expect(agent).toContain('else if (out.kind === "links") addLinks(out.urls);');
    expect(agent).toContain('if (out.kind === "text" || (out.kind === "links" && draftNow.current.trim())) return;');
  });

  it("is left to the model in a chat that has a campaign open, which may be the team's own candidate sheet to connect", () => {
    // The words go as they were typed: the agent proposes connecting it, and the paperclip's own Connect row is still there.
    expect(agent).toContain("if (!LIVE || campaignName) return false;");
    expect(agent).toContain('footer={adding?.onConnectSheet ? { label: "Connect a Google Sheet"');
  });

  it("is drawn with a link icon, and its caret says sheet where a file's says file", () => {
    expect(chips).toContain('a.origin === "link" ? <LinkSimple size={15} aria-hidden="true" />');
    expect(chips).toContain('chip.origin === "link" ? "sheet" : "file"');
  });
});

describe("placing people by their status", () => {
  const words = [
    { key: "no response", text: "No response", count: "2 people", choice: "contacted" as const, unknown: false },
    { key: "l2 interview scheduled", text: "L2 interview scheduled", count: "1 person", choice: "interviewing" as const, unknown: false },
    { key: "not hired", text: "Not hired", count: "1 person", choice: "shared" as const, unknown: true },
  ];
  const placing = (over: Partial<NonNullable<CardView["placing"]>> = {}): NonNullable<CardView["placing"]> => ({
    on: false,
    words,
    hire: { on: false, label: "2 say they joined. Hiring takes a person off their other campaigns.", names: "Dev and Ila", said: "Their status says Joined (2)." },
    reject: { on: false, label: "1 says rejected. Move them to Rejected?", names: "Tara", said: "Their status says Not interested (1)." },
    unplaced: "1 person has no status to go by, and stays where they are.",
    ...over,
  });

  it("is one tick that is off until the person turns it on, and nothing else of it is drawn while it is off", () => {
    const html = draw(view({ placing: placing() }));
    expect(html).toContain("Put each person on the stage their status says");
    expect(html).toMatch(/<input type="checkbox"[^>]*\/><span>Put each person on the stage their status says/);
    expect(html).not.toMatch(/<input type="checkbox"[^>]*checked[^>]*\/><span>Put each person/);
    expect(html).not.toContain("No response");
    expect(html).not.toContain("Nobody is rejected or hired unless you tick it.");
    expect(html).not.toContain("say they joined");
  });

  it("shows, once on, the sheet's own words with a choice each, and 'I don't know this one' beside the word nobody can place", () => {
    const html = draw(view({ placing: placing({ on: true }) }));
    expect(html).toContain("Nobody is rejected or hired unless you tick it.");
    expect(html).toContain("No response");
    expect(html).toContain("2 people");
    expect(html).toContain('aria-label="Where No response goes"');
    for (const choice of ["Shared", "Contacted", "Replied", "Interviewing", "Offer", "Leave alone"]) expect(html).toContain(`>${choice}</option>`);
    expect(html).toContain('<option value="contacted" selected="">Contacted</option>');
    expect(html).toContain('<option value="shared" selected="">Shared</option>');
    expect(html.match(/I don&#x27;t know this one/g)).toHaveLength(1);
    expect(html).not.toContain(">Hired</option>");
    expect(html).not.toContain(">Rejected</option>");
  });

  it("puts hiring and rejecting in two ticks of their own, off, each with the names of who it would move", () => {
    const html = draw(view({ placing: placing({ on: true }) }));
    expect(html).toContain("2 say they joined. Hiring takes a person off their other campaigns.");
    expect(html).toContain("Dev and Ila");
    expect(html).toContain("1 says rejected. Move them to Rejected?");
    expect(html).toContain("Tara");
    const ticks = html.match(/<input type="checkbox"[^>]*\/>/g) ?? [];
    expect(ticks).toHaveLength(3);
    // The first is the tick that is on; the two that hire and reject are off even then.
    expect(ticks[0]).toContain("checked");
    expect(ticks.slice(1).some((t) => t.includes("checked"))).toBe(false);
  });

  it("shows under each of those two ticks the sheet's own words behind it, each with how many say it, so what is read as a hire can be checked", () => {
    const html = draw(view({ placing: placing({ on: true, hire: { on: false, label: "5 say they joined. Hiring takes a person off their other campaigns.", names: "A, B, C, D and E", said: "Their status says Joined (3), Joined other company (2)." } }) }));
    expect(html).toContain("Their status says Joined (3), Joined other company (2).");
    expect(html).toContain("Their status says Not interested (1).");
  });

  it("leaves out the tick for hiring when no one says they joined, and for rejecting when no one says rejected", () => {
    const html = draw(view({ placing: placing({ on: true, hire: null, reject: null }) }));
    expect(html).not.toContain("say they joined");
    expect(html).not.toContain("Move them to Rejected?");
  });

  it("is not drawn without a status column and a campaign to put them on, nor once the adding is done", () => {
    expect(draw(view())).not.toContain("Put each person on the stage their status says");
    expect(draw(view({ placing: null }))).not.toContain("Put each person on the stage their status says");
    const done = draw(view({ phase: "done", placing: placing({ on: true }), done: { line: "Added 7 people.", href: "#/x", link: "See the shortlist" } }));
    expect(done).not.toContain("Put each person on the stage their status says");
  });

  it("holds its ticks and choices still while the people are being added", () => {
    const html = draw(view({ phase: "adding", placing: placing({ on: true }) }));
    expect(html.match(/<input type="checkbox"[^>]*disabled=""[^>]*\/>/g)).toHaveLength(3);
    expect(html.match(/<select[^>]*disabled=""/g)?.length).toBe(3);
  });

  it("has no dot badges, no status pills and no jargon", () => {
    const html = draw(view({ placing: placing({ on: true }) })).toLowerCase();
    for (const bad of ["pill", "badge", "stage_id", "json", "status column"]) expect(html).not.toContain(bad);
    expect(html).not.toContain("—");
  });

  it("is turned on, and its words and ticks set, through the card's own actions, in a card of one file and in a card of several", () => {
    const card = src("liveViews/PeopleImport.tsx");
    for (const call of ["on.onPlace?.(e.target.checked)", "on.onWord?.(w.key, e.target.value as PlaceChoice)", "on.onHire?.(e.target.checked)", "on.onReject?.(e.target.checked)"]) expect(card).toContain(call);
    // The same four reach the foot of a card of several files and the card of one.
    expect(card.match(/onPlace: shared\.on\.onPlace,/g)).toHaveLength(2);
    expect(card).toContain("onWord: (key, choice) => setMeant((all) => ({ ...all, [key]: choice })),");
    expect(card).toContain("placing: placeShown,");
  });

  it("puts each batch's people on their stages as they go in, by the ticks as they stood when Add was pressed, with nothing kept waiting for a later try", () => {
    const card = src("liveViews/PeopleImport.tsx");
    expect(card).toContain("const [place, setPlace] = useState(false);");
    expect(card).toContain("await addAndPlace(everyone, {");
    expect(card).toContain("place: shortlistId ? (request) => peopleSheetApi.place(shortlistId, request) : undefined,");
    expect(card).toContain("placing: place ? placing : null,");
    expect(card).toContain("ticks: { hire: hireOn, reject: rejectOn },");
    // No moves are kept for a later try (peopleSheet.test.ts, addAndPlace): nothing is owed, so no ticks can go stale.
    for (const gone of ["owed", "placeOwed", "planned.push"]) expect(card).not.toContain(gone);
    expect(card).toContain("doneLine(now, shortlist?.name ?? null, placed)");
    expect(src("api/peopleSheet.ts")).toContain("`/v1/campaigns/${campaignId}/place`");
  });

  it("holds the two ticks that hire and reject only for the people they named, so a sheet read again that names others turns them off", () => {
    const card = src("liveViews/PeopleImport.tsx");
    // What was ticked is what they named then (peopleSheet.test.ts, namedBy): the tick is a string, not a yes.
    expect(card).toContain("const [hire, setHire] = useState<string | null>(null);");
    expect(card).toContain("const [reject, setReject] = useState<string | null>(null);");
    expect(card).toContain("const hireOn = stillHolds(hire, placing?.hireKey);");
    expect(card).toContain("const rejectOn = stillHolds(reject, placing?.rejectKey);");
    expect(card).toContain("placeView(placing, { on: place, hire: hireOn, reject: rejectOn })");
    expect(card).toContain("onHire: (on) => setHire(on && placing ? placing.hireKey : null),");
    expect(card).toContain("onReject: (on) => setReject(on && placing ? placing.rejectKey : null),");
  });

  it("is offered only with a campaign they go on, and counted and named from the people that go in, each once, and not from the rows of the sheets (cardRun.test.tsx runs it)", () => {
    const card = src("liveViews/PeopleImport.tsx");
    expect(card).toContain("const placing = shortlistId ? placingOf([{ rows: everyone, statusWords: sheets.flatMap((s) => s.statusWords ?? []) }], meant) : null;");
    expect(card).not.toContain("placingOf(sheets");
  });
});
