import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddList, ScopeList } from "../AddMenu";
import { AttachChips } from "../AttachChips";
import { menuFor } from "../adding";
import type { Attachment } from "../attachments";
import type { PeopleSheet } from "../peopleSheet";

/** The paperclip's menu as it is drawn, the list a chip's scope opens, and the chips with their scope and the one line. */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const none = () => {};
const MINE = { campaign: "Senior Backend", mayChange: true, closed: false, canStart: true, count: 0 };

describe("the menu", () => {
  const html = renderToStaticMarkup(<AddList rows={menuFor(MINE)} onPick={none} footer={{ label: "Connect a Google Sheet", onPick: none }} />);

  it("is captioned with the question, and its rows are a menu of items named for what they add", () => {
    expect(html).toContain("What are you adding?");
    expect(html).toContain('role="menu" aria-labelledby="am-cap"');
    expect((html.match(/role="menuitem"/g) ?? []).length).toBe(5);
    for (const label of ["Candidates", "Job description", "More roles", "Something to read", "Connect a Google Sheet"]) expect(html).toContain(label);
    expect(html).toContain("They go on the Senior Backend shortlist.");
  });

  it("looks as the other composer menus do: the same rows, an icon, a bold label and one line of help", () => {
    expect(html).toContain('class="bulk-list"');
    expect(html).toMatch(/<button[^>]*class="bulk-item am-item"[^>]*data-scope="candidates"/);
    expect(html).toContain('class="bulk-ico"');
    expect(html).toMatch(/<b>Candidates<\/b><small>/);
  });

  it("says why a row can not be chosen where its help would be, and does not offer it as a press", () => {
    const off = renderToStaticMarkup(<AddList rows={menuFor({ ...MINE, count: 10 })} onPick={none} />);
    expect((off.match(/aria-disabled="true"/g) ?? []).length).toBe(4);
    expect(off).toContain("Up to 10 files go in one message. Remove one to add more.");
    expect(off).not.toContain("They go on the Senior Backend shortlist.");
    expect(renderToStaticMarkup(<AddList rows={menuFor({ ...MINE, count: 3 })} onPick={none} />)).not.toContain("aria-disabled");
  });

  it("has no footer when there is nothing to connect", () => {
    expect(renderToStaticMarkup(<AddList rows={menuFor(MINE)} onPick={none} />)).not.toContain("am-foot");
  });

  it("is a portal above the paperclip that closes on Escape and gives focus back, and moves between rows with the arrow keys", () => {
    const menu = src("AddMenu.tsx");
    expect(menu).toContain("createPortal(");
    expect(menu).toContain('e.key === "Escape"');
    expect(menu).toContain("anchor.current?.focus()");
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) expect(menu).toContain(`"${key}"`);
  });

  it("keeps its own classes to itself and takes its colours from the tokens", () => {
    const css = src("addMenu.css");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    for (const m of css.matchAll(/(?:^|[}\n])\s*\.([a-z][\w-]*)/g)) expect(m[1]).toMatch(/^(am-|bulk-)/);
  });
});

describe("the list a chip's scope opens", () => {
  it("is a radio list with a tick on the current one", () => {
    const html = renderToStaticMarkup(
      <ScopeList options={[{ scope: "candidates", label: "Candidates" }, { scope: "roles", label: "More roles" }]} value="roles" onPick={none} />,
    );
    expect(html).toContain('role="menuitemradio" aria-checked="true" class="am-opt is-on"');
    expect((html.match(/aria-checked="false"/g) ?? []).length).toBe(1);
    expect((html.match(/<svg/g) ?? []).length).toBe(1);
  });
});

const sheet = (kind: PeopleSheet["kind"], people = 0): PeopleSheet =>
  ({ kind, tabs: [], tab: null, headerRow: null, columns: [], needsCheck: false, counts: { rows: people, people, toAdd: people, alreadyHere: 0, onCampaign: 0, repeats: 0, left: 0, namesFromLinks: 0, phonesRebuilt: 0, phonesCut: 0 }, leftOutBy: {}, leftOut: [], rows: [] }) as PeopleSheet;
const chip = (over: Partial<Attachment> = {}): Attachment => ({
  id: "a", name: "leads.xlsx", origin: "file", size: 1000, status: "ready", text: "", kind: "sheet", scope: "candidates", sheet: sheet("people", 61), ...over,
});
const scopes = { ctx: { campaign: "Senior Backend", mayChange: true, closed: false }, onScope: none, onKeep: none };
const draw = (items: Attachment[], extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<AttachChips items={items} cut={new Set()} onView={none} onRemove={none} scopes={scopes} {...extra} />);

describe("a chip that was chosen as something", () => {
  it("says what it is as muted text with a caret that opens the kinds it can be, and what the sheet held", () => {
    const html = draw([chip()]);
    expect(html).toContain("leads.xlsx");
    expect(html).toMatch(/<button[^>]*class="am-scope"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*>Candidates<svg/);
    expect(html).toContain("61 people");
    expect(html).toContain('aria-label="Remove leads.xlsx"');
    expect(html).not.toContain("KB");
  });

  it("says Reading… while a sheet is read, and a suggestion in other words than a choice", () => {
    expect(draw([chip({ status: "reading", sheet: undefined })])).toContain("Reading…");
    const dropped = draw([chip({ suggested: true })]);
    expect(dropped).toContain("Looks like candidates");
    expect(dropped).toContain("Suggested from the file. Change it here.");
  });

  it("draws no scope for a failed file, pasted text or the next campaign's job description, which are just files", () => {
    const failed = draw([chip({ status: "failed", note: "x" })]);
    expect(failed).not.toContain("am-scope");
    const pasted = draw([chip({ id: "p", origin: "pasted", name: "Pasted text", kind: undefined, scope: undefined, sheet: undefined, text: "word ".repeat(10) })]);
    expect(pasted).not.toContain("am-scope");
    // Without the scopes (the demo, or an older caller) every chip is as it was.
    expect(renderToStaticMarkup(<AttachChips items={[chip()]} cut={new Set()} onView={none} onRemove={none} />)).not.toContain("am-scope");
  });

  it("says a file looks like something else in the one line, with its buttons, and the chip is told to wait", () => {
    const html = draw([chip({ name: "tenders.xlsx", sheet: sheet("roles") })]);
    expect((html.match(/orc-attached-err/g) ?? []).length).toBe(1);
    expect(html).toContain("tenders.xlsx reads like a list of roles, not people.");
    expect(html).toMatch(/<button type="button">Use as more roles<\/button>/);
    // A roles sheet may be kept as candidates, the way on for a people sheet with odd headers: its card asks which column is which.
    expect(html).toMatch(/<button type="button">Keep as candidates<\/button>/);
    expect((html.match(/orc-attached-err/g) ?? []).length).toBe(1);
    // Once kept, the line is gone and the chip says it needs a look, not that it is roles.
    const kept = draw([chip({ name: "tenders.xlsx", sheet: sheet("roles"), kept: true })]);
    expect(kept).not.toContain("orc-attached-err");
    expect(kept).toContain("Needs a look");
  });

  it("keeps exactly one line: a file that could not be read comes before one that looks like something else", () => {
    const html = draw([
      chip({ id: "a", name: "tenders.xlsx", sheet: sheet("roles") }),
      chip({ id: "b", name: "bad.xlsx", status: "failed", scope: undefined, sheet: undefined, note: "That file is damaged." }),
    ]);
    expect((html.match(/orc-attached-err/g) ?? []).length).toBe(1);
    expect(html).toContain("bad.xlsx: That file is damaged.");
    expect(html).not.toContain("reads like a list of roles");
  });

  it("says a job description chosen for one campaign is waiting when the chat has moved to another, with the button that puts it on the one open", () => {
    const moved = { ...scopes, ctx: { campaign: "Product Designer", campaignId: "c-2", mayChange: true, closed: false } };
    const jd = chip({ id: "jd", name: "jd.pdf", kind: "document", scope: "job_description", sheet: undefined, file: new File(["x"], "jd.pdf"), onCampaign: { id: "c-1", name: "Senior Backend" } });
    const html = draw([jd], { scopes: moved });
    expect((html.match(/orc-attached-err/g) ?? []).length).toBe(1);
    expect(html).toContain("jd.pdf was chosen for Senior Backend, and Product Designer is open now.");
    expect(html).toMatch(/<button type="button">Put it on Product Designer<\/button>/);
    // Still on the campaign it was chosen for: no line.
    expect(draw([jd], { scopes: { ...scopes, ctx: { campaign: "Senior Backend", campaignId: "c-1", mayChange: true, closed: false } } })).not.toContain("orc-attached-err");
  });

  it("counts the others that need a look, and says a sheet read to a screen reader", () => {
    const html = draw([
      chip({ id: "a", name: "t1.xlsx", sheet: sheet("roles") }),
      chip({ id: "b", name: "t2.xlsx", sheet: sheet("roles") }),
    ]);
    expect(html).toContain("1 more need a look too.");
    expect(draw([chip()])).toMatch(/aria-live="polite">leads\.xlsx: 61 people</);
  });

  it("takes a focused chip off with Backspace or Delete", () => {
    expect(src("AttachChips.tsx")).toContain('(e.key === "Backspace" || e.key === "Delete") && e.target instanceof HTMLButtonElement');
  });
});

describe("the message in the transcript", () => {
  it("shows the person's words and one chip for each file the paperclip added: its name, what it was chosen as, and what it held", async () => {
    const { Prompt } = await import("../Reply");
    const html = renderToStaticMarkup(
      <Prompt
        text="Add the people in leads.xlsx"
        files={[{ name: "leads.xlsx", scope: "candidates", detail: "61 people" }, { name: "brief.pdf", scope: "read" }]}
      />,
    );
    expect(html).toContain("Add the people in leads.xlsx");
    expect(html).toMatch(/<b>leads\.xlsx<\/b><small>Candidates, 61 people<\/small>/);
    expect(html).toMatch(/<b>brief\.pdf<\/b><small>To read<\/small>/);
    expect((html.match(/rep-prompt-file/g) ?? []).length).toBe(2);
  });

  it("shows a file whose text rode in the message once, with what it was chosen as beside its words", async () => {
    const { Prompt } = await import("../Reply");
    const html = renderToStaticMarkup(
      <Prompt
        text={"Read what I attached and tell me what it says.\n\n[Attached: brief.pdf]\nOne two three four five\n[End of attachment]"}
        files={[{ name: "brief.pdf", scope: "read" }]}
      />,
    );
    expect((html.match(/rep-prompt-file/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<b>brief\.pdf<\/b><small>5 words, To read<\/small>/);
    expect(html).not.toContain("One two three");
  });

  it("is as it was for a message with no files chosen", async () => {
    const { Prompt } = await import("../Reply");
    expect(renderToStaticMarkup(<Prompt text="hello" />)).not.toContain("rep-prompt-file");
  });
});
