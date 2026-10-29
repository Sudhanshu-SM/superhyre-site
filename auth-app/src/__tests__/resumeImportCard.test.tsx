import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The card for resumes attached as Candidates: what it draws while the files are read, for each line (ready, to look at, with no
 * way to reach them, already here), for a file that did not read or is not a resume, and when adding is done. The reading, the
 * ticks and the button's words are the rules in resumeSheet.ts, tested there; the server's reading is tested there too.
 */

vi.mock("../api/client", () => {
  class ApiError extends Error {}
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => null, messageOf: (e: Error) => e.message, LONG_REQUEST_TIMEOUT_MS: 170_000 };
});
vi.mock("../campaignStore", () => ({ useCampaignRows: () => [] }));
vi.mock("../campaignRights", () => ({ useMayChangeCampaign: () => true }));
vi.mock("../invalidate", () => ({ invalidate: () => undefined }));

const { ResumeCard } = await import("../liveViews/ResumeImport");
type ResumeCardView = import("../liveViews/ResumeImport").ResumeCardView;
type ResumeLine = import("../resumeSheet").ResumeLine;
type ResumeReading = import("../resumeSheet").ResumeReading;

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const none = () => undefined;
const on = { onTick: none, onTyped: none, onShortlist: none, onAdd: none, onRetry: none };

const line = (key: string, over: Partial<ResumeLine> = {}): ResumeLine => ({
  key,
  fileId: key.split(":")[0] ?? key,
  file: `${key.split(":")[0]}.pdf`,
  state: "ready",
  why: null,
  verdict: "new",
  picture: false,
  name: "Priya Nair",
  title: "Backend Engineer",
  company: "Acme",
  fields: { fullName: "Priya Nair", email: "priya@example.com", phone: "+919876543210" },
  ...over,
});
const file = (id: string, over: Partial<ResumeReading["files"][number]> = {}) => ({ id, name: `${id}.pdf`, state: "read" as const, reason: null, people: 1, ...over });

const reading = (lines: ResumeLine[], files = [file("a"), file("b"), file("c")]): ResumeReading => ({
  sheet: { kind: "people", tabs: [], tab: null, headerRow: null, columns: [], needsCheck: false, counts: {}, leftOutBy: {}, leftOut: [], hidden: { rows: 0, columns: 0, included: false }, rows: [] } as unknown as ResumeReading["sheet"],
  files,
  lines,
  read: {},
});

const view = (over: Partial<ResumeCardView> = {}): ResumeCardView => ({
  phase: "ready",
  names: ["a.pdf", "b.pdf", "c.pdf"],
  reading: reading([
    line("a:0"),
    line("b:0", { name: "Ravi Kumar", title: "Senior Developer", company: null, fields: { fullName: "Ravi Kumar", phone: "+919845012345" }, picture: true, why: "Read from a picture: check the contact details before adding." }),
    line("c:0", { name: "Lakshmi Narayan", title: "HR Executive", company: "Titan", state: "no-contact", verdict: null, why: "c.pdf: no email, phone or LinkedIn found, so I can't add them.", fields: { fullName: "Lakshmi Narayan" } }),
  ]),
  ticked: new Set(["a:0", "b:0"]),
  shortlist: null,
  choice: null,
  note: null,
  words: null,
  error: null,
  progress: null,
  done: null,
  refreshing: false,
  ...over,
});

const draw = (v: ResumeCardView) => renderToStaticMarkup(<ResumeCard view={v} on={on} />);

describe("while the files are read", () => {
  it("says which, and that it takes a few seconds, under the line that says what is added", () => {
    const html = draw(view({ phase: "reading", reading: null }));
    expect(html).toContain("Adding people from 3 files. Nothing else in them is added.");
    expect(html).toContain("Reading 3 resumes. This takes a few seconds.");
    expect(draw(view({ phase: "reading", reading: null, names: ["priya.pdf"] }))).toContain("Reading priya.pdf. This takes a few seconds.");
  });

  it("offers a try again when nothing came back, with what went wrong", () => {
    const html = draw(view({ phase: "failed", reading: null, error: "That's a lot of resumes in an hour. Try again a little later." }));
    expect(html).toContain("That&#x27;s a lot of resumes in an hour");
    expect(html).toContain("Try again");
  });
});

describe("the people found", () => {
  const html = draw(view());

  it("says how many, in how many files, and what is added from them first", () => {
    expect(html).toContain("Adding people from 3 files. Nothing else in them is added.");
    expect(html).toContain("I found 3 people in 3 files");
  });

  it("gives each person a line with a tick, the name, what they do, and how to reach them", () => {
    expect(html).toContain("Priya Nair");
    expect(html).toContain("Backend Engineer at Acme");
    expect(html).toContain("priya@example.com  ·  +919876543210");
    expect(html).toContain("Senior Developer");
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(3);
  });

  it("ticks the ones that can be added and leaves the one with no way to reach them off, with the reason under it", () => {
    const boxes = [...html.matchAll(/<input type="checkbox"([^>]*)>/g)].map((m) => m[1] ?? "");
    expect(boxes[0]).toContain('checked=""');
    expect(boxes[1]).toContain('checked=""');
    expect(boxes[2]).not.toContain('checked=""');
    expect(boxes[2]).toContain('disabled=""');
    expect(html).toContain("c.pdf: no email, phone or LinkedIn found, so I can&#x27;t add them.");
  });

  it("gives that person a field to type a contact in", () => {
    expect(html).toContain('placeholder="Email, phone or LinkedIn link"');
    expect(html).toContain("An email, a phone number or a LinkedIn link for Lakshmi Narayan");
    expect(html).toContain("Use this");
    // One field, for the one line that needs it.
    expect((html.match(/placeholder="Email, phone or LinkedIn link"/g) ?? []).length).toBe(1);
  });

  it("says what was read from a picture, beside the person, in plain words and the accent colour, while the person stays ticked", () => {
    expect(html).toContain('<p class="t-caption rsm-look">Read from a picture: check the contact details before adding.</p>');
    const ravi = [...html.matchAll(/<input type="checkbox"([^>]*)>/g)][1]?.[1] ?? "";
    expect(ravi).toContain('checked=""');
  });

  it("says a person joined into another line is so, in the muted words", () => {
    const same = draw(view({ reading: reading([line("a:0"), line("b:0", { state: "same", verdict: null, why: "Priya Nair is in another file too, so the two are joined into one." })]), ticked: new Set(["a:0"]) }));
    expect(same).toContain('<p class="t-caption">Priya Nair is in another file too, so the two are joined into one.</p>');
  });

  it("has one clear button, counting the ticks", () => {
    expect(html).toMatch(/<button[^>]*class="src-btn is-primary mo-small"[^>]*>Add 2 to Candidates/);
    expect(html.match(/is-primary/g)).toHaveLength(1);
  });

  it("says whether each is new, and where an existing candidate goes", () => {
    expect(html).toContain("New to your candidates");
    const onList = draw(view({ shortlist: { id: "c-1", name: "Backend" }, reading: reading([line("a:0", { verdict: "here" }), line("b:0", { verdict: "already", name: "Ravi Kumar" })]) , ticked: new Set(["a:0"]) }));
    expect(onList).toContain("Already in your candidates. Goes on the Backend shortlist.");
    expect(onList).toContain("Already in your candidates and on the Backend shortlist.");
    expect(onList).toContain("Add 1 to the Backend shortlist");
    // One who is already where they would go has nothing to tick.
    const ravi = [...onList.matchAll(/<input type="checkbox"([^>]*)>/g)][1]?.[1] ?? "";
    expect(ravi).toContain('disabled=""');
    expect(ravi).not.toContain('checked=""');
  });

  it("marks a contact to look at in the card's own accent words, never red, and not as a badge", () => {
    const look = draw(view({ reading: reading([line("a:0", { state: "check", why: "The contact was lower down in the file, not in its own part: check it is theirs." })]), ticked: new Set() }));
    expect(look).toContain('class="t-caption rsm-look"');
    expect(look).toContain("The contact was lower down in the file");
    for (const word of ["pill", "badge", "dot", "JSON", "schema", "model", "OCR"]) expect(look.toLowerCase()).not.toContain(word.toLowerCase());
    expect(look).not.toContain("—");
  });

  it("says to tick someone when nothing is ticked, and that nobody can be added yet when no line can", () => {
    expect(draw(view({ ticked: new Set() }))).toContain("Tick the people to add.");
    const stuck = draw(view({ reading: reading([line("c:0", { state: "no-contact", verdict: null })]), ticked: new Set() }));
    expect(stuck).toContain("Nobody here can be added yet. Type an email, a phone number or a LinkedIn link for them above.");
    expect(draw(view({ reading: reading([], [file("a", { people: 0 })]), ticked: new Set() }))).toContain("There is nobody to add. Try other files.");
  });
});

describe("the resumes as one part of a card that holds other files too", () => {
  const withSheets = view({ embedded: true, choice: { options: [{ id: "c-1", name: "Backend" }], value: null } });
  const alone = draw(view({ choice: { options: [{ id: "c-1", name: "Backend" }], value: null } }));
  const part = draw(withSheets);

  it("has the people and their ticks, and none of what the card has once: not the first line, the destination or the button", () => {
    expect(part).toContain("I found 3 people in 3 files");
    expect(part).toContain("Priya Nair");
    expect(part).toContain('type="checkbox"');
    expect(part).not.toContain("pi-scope");
    expect(part).not.toContain("Also put them on a campaign");
    expect(part).not.toContain("pi-foot");
    expect(part).not.toContain("Add 2 to Candidates");
    // Alone, it has all three.
    expect(alone).toContain("pi-scope");
    expect(alone).toContain("Also put them on a campaign");
    expect(alone).toContain("Add 2 to Candidates");
  });

  it("still says what went wrong in reading the files, and holds the lines still while the card adds", () => {
    const failing = draw(view({ embedded: true, error: "I couldn't read the files again, so Add stays off until I can. Try later." }));
    expect(failing).toContain('role="alert"');
    expect(draw(view({ embedded: true, phase: "adding" }))).toContain("disabled");
  });
});

describe("files that were not read as people", () => {
  const problems = reading([line("a:0")], [
    file("a"),
    file("b", { state: "failed", people: 0, reason: "The assistant is busy right now. Try again in a moment." }),
    file("c", { state: "job-description", people: 0, reason: "c.pdf reads like a job description, not a resume." }),
  ]);
  const html = draw(view({ reading: problems, ticked: new Set(["a:0"]) }));

  it("says why for each, in one line, in the list of what was left out", () => {
    expect(html).toContain("Left out");
    expect(html).toContain("The assistant is busy right now. Try again in a moment.");
    expect(html).toContain("c.pdf reads like a job description, not a resume.");
  });

  it("offers to read again only the ones that failed, not the job description", () => {
    expect(html).toContain("Try the others again");
    const onlyJd = draw(view({ reading: reading([line("a:0")], [file("a"), file("c", { state: "job-description", people: 0, reason: "c.pdf reads like a job description, not a resume." })]), ticked: new Set(["a:0"]) }));
    expect(onlyJd).not.toContain("Try the others again");
  });
});

describe("while a contact is looked up again, while adding, and when done", () => {
  it("holds the button off and says it is reading again", () => {
    const html = draw(view({ refreshing: true }));
    expect(html).toContain("Reading again");
    expect(html).toMatch(/<button[^>]*class="src-btn is-primary mo-small"[^>]*disabled=""/);
  });

  it("shows the progress of the batches with a bar, and the button as busy", () => {
    const html = draw(view({ phase: "adding", progress: { done: 40, total: 100 } }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Adding 40 of 100");
    expect(html).toContain("aria-busy");
  });

  it("says how it went and where to see them, and offers nothing more to press", () => {
    const html = draw(view({ phase: "done", done: { line: "Added 2 people to Candidates.", href: "#/contacts", link: "See Candidates" } }));
    expect(html).toContain("Added 2 people to Candidates.");
    expect(html).toContain('href="#/contacts"');
    expect(html).not.toContain("is-primary");
  });

  it("keeps what an adding that stopped short has to say, where it can be read as an alert", () => {
    const html = draw(view({ error: "The server was busy. 1 person was added before it stopped. Adding again carries on with the rest, and nobody is added twice." }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Adding again carries on with the rest");
  });
});

describe("where the card is hosted", () => {
  it("opens from the people card's view for the add that carried resumes: alone when there are no sheets, and as a part of the one card when there are", () => {
    const view_ = src("liveViews/PeopleImport.tsx");
    expect(view_).toContain("own?.resumes ?? []");
    // A card with only resumes does not offer to choose a sheet.
    expect(view_).toContain("resumes.length > 0 && seeds.length === 0");
    expect(view_).toContain("<ResumeImport seeds={resumes}");
    // With sheets, the resumes are a section of the sheets' card, which has the one destination and the one button (and not a card of their own above it).
    expect(view_).toContain("<ResumeSection seeds={resumes}");
    expect(view_).toContain("resumes={resumes}");
    expect(view_).not.toContain("{resumes.length > 0 && <ResumeImport");
  });

  it("is given the resumes by the composer under the add's own id, and a picture's reading by the file reader", () => {
    const agent = src("Agent.tsx");
    expect(agent).toContain("resumes: m.keep.resumes.map(resumeSeedOf)");
    expect(agent).toContain("...(r.picture ? { picture: true } : {})");
    expect(src("AttachChips.tsx")).toContain('a.kind === "sheet" || a.scope === "candidates" ? resultWord(a)');
  });

  it("is read together by one request to the server, sending back what was read so a typed contact costs no second reading", () => {
    const flow = src("liveViews/ResumeImport.tsx");
    expect(flow).toContain("resumeApi.read(requestFor(seeds");
    expect(flow).toContain("read: facts.current");
    expect(src("api/resumes.ts")).toContain('"/v1/candidates/resumes/read"');
  });
});
