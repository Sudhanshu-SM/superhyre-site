import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The job description in the popup a campaign's header opens: all of the text as it stands, when it was added and by
 * whom, the original file with a Download, and Update for the people on the campaign. A recruiter who only follows the
 * campaign reads it and downloads the file, and is not offered Update. This file pins what the pieces say and where they
 * sit; jobDescriptionPanel.test.ts runs the popup's own states. The server's side is test/campaign-jd.test.ts.
 */

const calls = vi.hoisted(() => ({ api: [] as Array<{ method: string; path: string; body: unknown; init: unknown }>, file: [] as string[] }));
vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: async (method: string, path: string, body?: unknown, init?: unknown) => {
    calls.api.push({ method, path, body, init });
    return { saved: true };
  },
  apiFile: async (path: string) => {
    calls.file.push(path);
    return new Blob(["%PDF-1.7"], { type: "application/pdf" });
  },
}));

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

const { JobDescriptionFailed, JobDescriptionForm, JobDescriptionStale, JobDescriptionView, JobDescriptionWait } = await import("../JobDescriptionPopup");
const campaignJd = await import("../campaignJd");
const { jdApi, logLine } = await import("../api/campaigns");
type Jd = import("../api/campaigns").ApiJobDescription;

const TEXT = "Senior Backend Engineer.\nOwn the payments ledger in Go and Kafka, lead a small team, five to eight years in production backend work.";
const NOW = new Date(2026, 9, 28, 12);
const jd = (over: Partial<Jd> = {}): Jd => ({
  text: TEXT, addedAt: new Date(2026, 9, 2, 12).toISOString(), addedBy: "Ana Rao", source: "pasted", file: null, versions: [], ...over,
});
const view = (over: { jd?: Jd; may?: boolean; refreshFailed?: boolean; file?: import("../campaignJd").FileState } = {}) =>
  renderToStaticMarkup(
    <JobDescriptionView
      jd={over.jd ?? jd()} may={over.may ?? true} refreshFailed={over.refreshFailed ?? false} file={over.file ?? { s: "idle" }} now={NOW}
      onTake={() => {}} onRetry={() => {}} onUpdate={() => {}} onClose={() => {}}
    />,
  );

/** The elements of what a plain component returns when it is called by hand (no DOM), in document order. */
const elementsOf = (node: unknown): Array<{ type: unknown; props: Record<string, any> }> => {
  if (Array.isArray(node)) return node.flatMap(elementsOf);
  if (node && typeof node === "object" && "props" in node) {
    const el = node as { type: unknown; props: Record<string, any> };
    return [el, ...elementsOf(el.props.children)];
  }
  return [];
};

beforeEach(() => { calls.api.length = 0; calls.file.length = 0; });

describe("the popup's text", () => {
  it("shows the whole description under its title, with who added it and when, in the Overview's plain words", () => {
    const html = view();
    expect(html).toContain('<h2 class="t-title">Job description</h2>');
    expect(html).toContain("Senior Backend Engineer.");
    expect(html).toContain("Own the payments ledger in Go and Kafka");
    expect(html).toContain("Added 2 Oct by Ana Rao");
    // The text keeps its line breaks (the stylesheet's pre-line); the markup does not cut it.
    expect(html).toContain('<p class="jdp-text t-body">');
    // No status badge, no dot, no " · ", no dashes or ellipses in what it says.
    expect(html).not.toMatch(/pill|badge|dot/i);
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/ · |—|–|…/);
  });

  it("does not clamp or cut it: a long description is all there, and the middle of the popup is what scrolls", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Line ${i + 1} of a long description.`).join("\n");
    const html = view({ jd: jd({ text: long }) });
    expect(html).toContain("Line 1 of a long description.");
    expect(html).toContain("Line 60 of a long description.");
    expect(html).not.toMatch(/Show all|Show less|aria-expanded/);
    expect(src("campaignJd.ts")).not.toContain("likelyLong");
  });

  it("is a labelled region a keyboard can scroll", () => {
    const html = view();
    expect(html).toMatch(/<div class="jdp-body"[^>]*tabindex="0"[^>]*role="region"[^>]*aria-label="The job description text"/);
  });

  it("says the date with its year when it is not this one, and leaves out what the server did not say", () => {
    expect(campaignJd.addedLine({ addedAt: new Date(2025, 11, 9, 12).toISOString(), addedBy: "Ana Rao" }, NOW)).toBe("Added 9 Dec 2025 by Ana Rao");
    expect(campaignJd.addedLine({ addedAt: new Date(2026, 9, 2, 12).toISOString(), addedBy: null }, NOW)).toBe("Added 2 Oct");
    expect(campaignJd.addedLine({ addedAt: new Date(2026, 9, 2, 12).toISOString(), addedBy: null, source: "agent" }, NOW)).toBe("Added 2 Oct by the agent");
    expect(campaignJd.addedLine({ addedAt: new Date(2026, 9, 2, 12).toISOString(), addedBy: null, source: "extension" }, NOW)).toBe("Added 2 Oct by the Chrome extension");
    expect(campaignJd.addedLine({ addedAt: null, addedBy: "Ana Rao" }, NOW)).toBe("Added by Ana Rao");
    expect(campaignJd.addedLine({ addedAt: null, addedBy: null }, NOW)).toBe("");
    // Nothing to say about when: no line under the title at all.
    expect(view({ jd: jd({ addedAt: null, addedBy: null }) })).not.toContain("rl-dlg-b");
  });
});

describe("the original file", () => {
  const withFile = jd({ file: { name: "Senior-Backend-JD.pdf", size: 52_000, version: 1, specId: "spec-1" }, source: "file" });

  it("is named in the foot with a Download beside it", () => {
    const html = view({ jd: withFile });
    const foot = html.slice(html.indexOf("<footer"));
    expect(foot).toContain("Senior-Backend-JD.pdf");
    expect(foot).toMatch(/<button[^>]*class="hp-link jdp-take"[^>]*>Download<\/button>/);
  });

  it("has no file line for a pasted description", () => {
    const html = view();
    expect(html).not.toContain("jdp-file");
    expect(html).not.toContain("Download");
  });

  it("says Downloading while it is fetched, and why when it could not be", () => {
    expect(view({ jd: withFile, file: { s: "working" } })).toMatch(/aria-busy="true"[^>]*disabled|disabled[^>]*aria-busy="true"/);
    const failed = view({ jd: withFile, file: { s: "failed", message: "That file is not there any more." } });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("That file is not there any more.");
  });

  it("is offered to a follower as well: Download is not behind the rights check", () => {
    expect(view({ jd: withFile, may: false })).toContain(">Download<");
  });

  it("is fetched with the person's token, for the very version it was read for, and saved under its own name", async () => {
    const saved: Array<[Blob, string]> = [];
    const asked: Array<[string, string]> = [];
    const done = await campaignJd.takeJdFile("c1", { name: "Senior-Backend-JD.pdf", specId: "spec-1" }, {
      fetchFile: async (id, specId) => { asked.push([id, specId]); return new Blob(["%PDF"], { type: "application/pdf" }); },
      save: (file, name) => { saved.push([file, name]); },
    });
    /* A teammate replacing the description meanwhile cannot hand over another file under this one's name: the version is named. */
    expect(asked).toEqual([["c1", "spec-1"]]);
    expect(done).toEqual({ s: "idle" });
    expect(saved).toHaveLength(1);
    expect(saved[0]![1]).toBe("Senior-Backend-JD.pdf");
    expect(saved[0]![0].type).toBe("application/pdf");
  });

  it("turns a refusal into the sentence the server wrote, never a thrown error", async () => {
    const { ApiError } = await import("../api/client");
    const done = await campaignJd.takeJdFile("c1", { name: "x.pdf", specId: "spec-1" }, {
      fetchFile: async () => { throw new ApiError(404, "not_found", "Not found."); },
      save: () => { throw new Error("must not save"); },
    });
    expect(done).toEqual({ s: "failed", message: "Not found." });
  });
});

describe("with no description, and while it is on its way", () => {
  const none = jd({ text: null, addedAt: null, addedBy: null });
  const buttons = (html: string) => (html.match(/<button/g) ?? []).length;

  it("says so calmly, with one action for the people who may and only Close for a follower", () => {
    const mine = view({ jd: none });
    expect(mine).toContain("No job description yet.");
    expect(mine).toContain(">Add job description<");
    expect(mine).toContain(">Close<");
    expect(buttons(mine)).toBe(2);
    const follower = view({ jd: none, may: false });
    expect(follower).toContain("No job description yet.");
    expect(follower).not.toContain("Add job description");
    expect(buttons(follower)).toBe(1);
    expect(follower).not.toMatch(/sorry|oops|nothing here/i);
    // Nothing to scroll, so the middle is not a tab stop.
    expect(mine).not.toContain("tabindex");
  });

  it("offers Update beside Close when there is a text, to the people who may, and a follower only Close", () => {
    const mine = view();
    expect(mine).toMatch(/<button type="button" class="ct-btn is-primary"[^>]*>Update<\/button>/);
    expect(buttons(mine)).toBe(2);
    const follower = view({ may: false });
    expect(follower).not.toContain("Update");
    expect(buttons(follower)).toBe(1);
  });

  it("has a loading state with the real title, lines where the text will be, and only Close", () => {
    const html = renderToStaticMarkup(<JobDescriptionWait onClose={() => {}} />);
    expect(html).toContain('<h2 class="t-title">Job description</h2>');
    expect(html).toContain("shm");
    expect(html).toContain('role="status"');
    expect(html).toContain('<span class="sr-only">Loading the job description</span>');
    expect(buttons(html)).toBe(1);
  });

  it("keeps focus inside the popup when asking again brings the waiting state in over the button that was pressed: its Close takes focus", () => {
    /* Try again is gone the moment the popup waits; without this the focus falls to the page behind. (autoFocus is not in the markup, so the element is read.) */
    const buttonsOf = elementsOf(JobDescriptionWait({ onClose: () => {} })).filter((e) => e.type === "button");
    expect(buttonsOf).toHaveLength(1);
    expect(buttonsOf[0]!.props).toMatchObject({ children: "Close", autoFocus: true });
  });

  it("has a failed state that says so once, with a way to ask again and Close", () => {
    const html = renderToStaticMarkup(<JobDescriptionFailed onRetry={() => {}} onClose={() => {}} />);
    expect(html).toContain('<h2 class="t-title">Job description</h2>');
    expect(html).toContain("Try again");
    expect(html).toContain(">Close<");
    expect(html).not.toContain("Update");
  });
});

describe("updating it", () => {
  it("is for the people on the campaign: Update is theirs, and the form is reached from nothing else", () => {
    const popup = src("JobDescriptionPopup.tsx");
    expect(popup).toContain("const may = useMayChangeCampaign(campaignId);");
    expect(popup).toContain("{may && <button");
    expect(popup).toContain("onUpdate={update}");
    expect(popup.match(/setEditing\(true\)/g)).toHaveLength(1);
    /* A download asks for the file it was shown for. */
    expect(popup).toContain("takeJdFile(campaignId, jd.file)");
    // Nothing else is offered here: this popup never approves anything.
    expect(popup).not.toMatch(/specApi|>Approve|Approve and/);
  });

  it("pastes text through the one endpoint that keeps a description, and says the requirements stay", async () => {
    const saved: Array<[string, string]> = [];
    const said = await campaignJd.replaceJd("c1", { text: `  ${TEXT}  ` }, {
      upload: async () => { throw new Error("must not upload"); },
      save: async (id, text) => { saved.push([id, text]); return { saved: true }; },
    });
    expect(saved).toEqual([["c1", TEXT]]);
    expect(said).toBe(campaignJd.SAVED_TEXT);
    expect(said).toContain("requirements");
  });

  it("uploads a file through the endpoint that drafts from one, with the type the server checks, and says new requirements are drafted", async () => {
    const uploads: Array<[string, string, string]> = [];
    const file = new File(["%PDF"], "jd.pdf", { type: "application/pdf" });
    const said = await campaignJd.replaceJd("c1", { file }, {
      upload: async (id, f, type) => { uploads.push([id, f.name, type]); return { id: "s1", version: 2 }; },
      save: async () => { throw new Error("must not save text"); },
    });
    expect(uploads).toEqual([["c1", "jd.pdf", "application/pdf"]]);
    expect(said).toBe(campaignJd.SAVED_FILE);
    expect(said).toContain("requirements");
  });

  it("takes only what the server reads: PDF, Word, text, pictures, under 10 MB", () => {
    const f = (name: string, type: string, size = 1000) => ({ name, type, size });
    expect(campaignJd.jdFileRefusal(f("jd.pdf", "application/pdf"))).toBeNull();
    expect(campaignJd.jdFileRefusal(f("jd.docx", ""))).toBeNull();
    expect(campaignJd.jdFileRefusal(f("jd.txt", "text/plain"))).toBeNull();
    expect(campaignJd.jdFileRefusal(f("page.png", "image/png"))).toBeNull();
    expect(campaignJd.jdFileRefusal(f("empty.pdf", "application/pdf", 0))).toBe("empty.pdf is empty.");
    expect(campaignJd.jdFileRefusal(f("big.pdf", "application/pdf", 11 * 1024 * 1024))).toContain("over 10 MB");
    expect(campaignJd.jdFileRefusal(f("old.doc", "application/msword"))).toContain("old Word file");
    expect(campaignJd.jdFileRefusal(f("notes.md", "text/markdown"))).toContain("Upload a PDF, Word");
    expect(campaignJd.jdFileRefusal(f("sheet.xlsx", ""))).toContain("not sheet.xlsx");
  });

  it("saves pasted text only when the server will take it: its length, and nothing else", () => {
    expect(campaignJd.pasteOk("too short")).toBe(false);
    expect(campaignJd.pasteOk(TEXT)).toBe(true);
    expect(campaignJd.pasteOk("x".repeat(30_001))).toBe(false);
    /* The server's minimum is the one drafting needs, 80: the box and the server say the same number. */
    expect(campaignJd.JD_MIN_CHARS).toBe(80);
    expect(campaignJd.pasteOk("x".repeat(79))).toBe(false);
    expect(campaignJd.pasteOk(`  ${"x".repeat(80)}  `)).toBe(true);
    /* A real description ends with an address to send a CV to and carries an equal-opportunity line: both are fine. */
    expect(campaignJd.pasteOk(`${TEXT} Send your CV to careers@cobalt.example. We hire regardless of race, religion, gender or disability.`)).toBe(true);
  });

  it("says why Save is not on yet, in one calm line, and says nothing while the box is empty", () => {
    expect(campaignJd.pasteHint("")).toBeNull();
    expect(campaignJd.pasteHint("   ")).toBeNull();
    expect(campaignJd.pasteHint("too short")).toBe("A little more, please. The job description needs at least 80 characters.");
    expect(campaignJd.pasteHint(TEXT)).toBeNull();
    expect(campaignJd.pasteHint("x".repeat(30_001))).toBe("That is more than we keep. The most is 30,000 characters.");
  });
});

describe("the form", () => {
  const form = (over: Partial<Parameters<typeof JobDescriptionForm>[0]> = {}) =>
    renderToStaticMarkup(
      <JobDescriptionForm
        saved={TEXT} text="" busy="" problem="" areaId="jd-area" hintId="jd-hint"
        onText={() => {}} onFile={() => {}} onSave={() => {}} onCancel={() => {}} {...over}
      />,
    );

  it("says Update for a description that is there and Add for one that is not, and puts the cursor in the box", () => {
    const update = form({ saved: TEXT });
    expect(update).toContain("Update the job description");
    expect(update).toContain("Change the text, or upload a new file.");
    const add = form({ saved: "" });
    expect(add).toContain("Add the job description");
    expect(add).toContain("Paste the text, or upload the file.");
    expect(form()).not.toContain("Replace the job description");
    expect(src("JobDescriptionPopup.tsx")).toMatch(/<textarea[^>]*autoFocus/);
  });

  it("holds the text it is given in the box, so an update is a change to what is there and not a new paste", () => {
    expect(form({ text: TEXT })).toContain(`>${TEXT}</textarea>`);
  });

  it("keeps Save off while the text is the one that is already kept, however it is spaced, and on for any change", () => {
    const off = /<button type="button" class="ct-btn is-primary"[^>]*disabled=""/;
    expect(form({ text: TEXT })).toMatch(off);
    expect(form({ text: `  ${TEXT}\n` })).toMatch(off);
    expect(form({ text: `${TEXT} Send your CV to careers@cobalt.example.` })).not.toMatch(off);
    /* Where nothing is kept yet, any text the server takes can be saved. */
    expect(form({ saved: "", text: TEXT })).not.toMatch(off);
  });

  it("has Upload a file as a real button: a tab stop a keyboard and a screen reader reach, which opens the file picker", () => {
    const html = form();
    expect(html).toMatch(/<button type="button" class="ct-btn jdp-pick"[^>]*aria-describedby="jd-hint"[^>]*>.*Upload a file<\/button>/);
    /* Not a label around a hidden input, which nothing can tab to: the input stays out of sight and out of the tab order. */
    expect(html).not.toMatch(/<label[^>]*jdp-pick/);
    expect(html).toMatch(/<input[^>]*type="file"[^>]*hidden=""[^>]*tabindex="-1"|<input[^>]*type="file"[^>]*tabindex="-1"[^>]*hidden=""/);
    expect(html).toContain('accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"');
    /* It opens the picker through that input. */
    expect(src("JobDescriptionPopup.tsx")).toContain("onClick={() => fileRef?.current?.click()}");
    expect(src("jobDescription.css")).not.toContain(":has(input:focus-visible)");
  });

  it("shows Reading the file on that button while a file is read, and cannot be pressed again", () => {
    const html = form({ busy: "file" });
    expect(html).toMatch(/<button type="button" class="ct-btn jdp-pick"[^>]*disabled=""[^>]*aria-busy="true"|<button type="button" class="ct-btn jdp-pick"[^>]*aria-busy="true"[^>]*disabled=""/);
    expect(html).toContain("Reading the file");
    expect(html).toMatch(/<input[^>]*type="file"[^>]*disabled=""/);
  });

  it("keeps Save off until the text is one the server takes, and says what is missing instead of cutting what was pasted", () => {
    const off = form({ text: "Backend engineer wanted" });
    expect(off).toMatch(/<button type="button" class="ct-btn is-primary"[^>]*disabled=""/);
    expect(off).toContain("A little more, please. The job description needs at least 80 characters.");
    const empty = form();
    expect(empty).toMatch(/<button type="button" class="ct-btn is-primary"[^>]*disabled=""/);
    expect(empty).not.toContain("A little more");
    const ready = form({ text: `${TEXT} Send your CV to careers@cobalt.example.` });
    expect(ready).not.toMatch(/<button type="button" class="ct-btn is-primary"[^>]*disabled=""/);
    expect(ready).not.toContain("A little more");
    /* A box with a limit would cut a longer paste off without a word: it takes it, and says it is too long. */
    expect(form({ text: "x".repeat(30_001) })).toContain("That is more than we keep.");
    expect(ready).not.toMatch(/maxlength/i);
  });

  it("names the refusal in words when the server turns the text down", () => {
    expect(form({ problem: "That job description is too short. Paste at least 80 characters of it." })).toMatch(/role="alert"[^>]*>That job description is too short/);
  });

  it("says why Save is off to a screen reader too: the line is part of what the box is described by, and the box is invalid while it shows", () => {
    const area = (html: string) => html.match(/<textarea[^>]*>/)![0];
    for (const text of ["Backend engineer wanted", "x".repeat(30_001)]) {
      const html = form({ text });
      expect(area(html)).toContain('aria-describedby="jd-hint jd-hint-short"');
      expect(area(html)).toContain('aria-invalid="true"');
      /* The id the box points at is the one the line carries. */
      expect(html).toContain('<p id="jd-hint-short" class="jdp-hint is-short t-body-sm">');
    }
    /* Nothing typed yet, or a text the server takes: the one hint describes the box, and it is not called invalid. */
    for (const text of ["", TEXT]) {
      const html = form({ text });
      expect(area(html)).toContain('aria-describedby="jd-hint"');
      expect(area(html)).not.toContain("aria-invalid");
      expect(html).not.toContain("jd-hint-short");
    }
  });

  it("gives the box a ref, so the cursor can go back to it after a write or a file was turned down", () => {
    expect(src("JobDescriptionPopup.tsx")).toMatch(/<textarea[^>]*ref=\{areaRef\}/);
  });

  it("says plainly, in the one place for what went wrong, that someone else changed the description meanwhile and that the text is still there", () => {
    const said = campaignJd.CHANGED_MEANWHILE;
    expect(said).toMatch(/^Someone else changed the job description while you were editing\. /);
    expect(said).toContain("Your own text is still in the box");
    expect(said).toContain("Save will replace theirs");
    expect(said).not.toMatch(/ · |—|–|…|\.\.\.|role spec/i);
    expect(form({ problem: said, text: TEXT })).toMatch(/role="alert"[^>]*>Someone else changed the job description while you were editing\./);
  });

  it("does not promise that the old text is kept when nothing was drafted from it", () => {
    const html = form();
    expect(html).toContain("Requirements already drafted keep the text they were drafted from.");
    expect(html).not.toContain("stays with the requirements drafted from it");
    expect(form({ saved: "" })).not.toContain("already drafted keep");
  });
});

describe("a description that may be out of date", () => {
  it("keeps the last one that was read and says it may be out of date, with a way to ask again", () => {
    const ready = { jd: jd(), status: "ready" as const, refreshFailed: false };
    expect(campaignJd.afterFailedRead(ready)).toEqual({ jd: ready.jd, status: "ready", refreshFailed: true });
    /* A first read that failed has nothing to show: it says it could not load, not that it may be out of date. */
    expect(campaignJd.afterFailedRead({ jd: null, status: "loading", refreshFailed: false })).toEqual({ jd: null, status: "failed", refreshFailed: false });
    const html = renderToStaticMarkup(<JobDescriptionStale onRetry={() => {}} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Couldn&#x27;t check for changes, so this may be out of date.");
    expect(html).toMatch(/<button type="button" class="hp-link"[^>]*>Try again<\/button>/);
    expect(view({ refreshFailed: true })).toContain("Couldn&#x27;t check for changes");
    expect(view()).not.toContain("Couldn&#x27;t check for changes");
    /* The hook leaves it that way when a read fails, and clears it when one comes back, each for the campaign it was read for. */
    expect(src("campaignJd.ts")).toContain("setHeld((h) => ({ campaignId, ...afterFailedRead(heldFor(h, campaignId)) }))");
    expect(src("campaignJd.ts")).toContain('setHeld({ campaignId, jd, status: "ready", refreshFailed: false })');
  });

  it("never shows one campaign's description under another: a page that stays mounted as the chat moves between campaigns holds what it read per campaign", () => {
    const read = { jd: jd({ text: "Campaign A's description." }), status: "ready" as const, refreshFailed: false, campaignId: "a" };
    expect(campaignJd.heldFor(read, "a")).toBe(read);
    /* Campaign B has read nothing yet: the page shows what it knows itself (liveJdTextOf), not A's text, and a failed read of B's has nothing of A's to keep. */
    const none = { jd: null, status: "loading", refreshFailed: false };
    expect(campaignJd.heldFor(read, "b")).toEqual(none);
    expect(campaignJd.heldFor(null, "b")).toEqual(none);
    expect(campaignJd.afterFailedRead(campaignJd.heldFor(read, "b"))).toEqual({ jd: null, status: "failed", refreshFailed: false });
    /* With no campaign in focus (an empty id) nothing is held, whatever was read before. */
    expect(campaignJd.heldFor(read, "")).toEqual(none);
    expect(campaignJd.liveJdTextOf(campaignJd.heldFor(read, "b").jd, "  B's own text.  ")).toBe("B's own text.");
  });

  it("is read for the Agent page's dialog from the server too, so it never shows the text of older requirements", () => {
    const now = jd({ text: "The newer text, pasted on the Overview." });
    expect(campaignJd.liveJdTextOf(now, "The older text of the approved requirements.")).toBe("The newer text, pasted on the Overview.");
    /* Before the first read, and when it cannot be read, the page's own knowledge stands in. */
    expect(campaignJd.liveJdTextOf(null, "  The older text.  ")).toBe("The older text.");
    expect(campaignJd.liveJdTextOf(jd({ text: null }), "Something stale")).toBe("");
    const agent = src("Agent.tsx");
    expect(agent).toContain("const liveJdRead = useCampaignJd(liveCampaignId, liveRow?.setup?.jd ?? \"\");");
    expect(agent).toContain("const liveJdText = liveJdTextOf(liveJdRead.jd, specNow?.jdText ?? liveRow?.setup?.jd ?? \"\");");
    /* With no campaign in focus there is nothing to read. */
    expect(src("campaignJd.ts")).toContain("if (!LIVE || !campaignId) return undefined;");
  });
});

describe("the calls it makes", () => {
  it("reads the description, and one version of it, from the campaign's jd route", async () => {
    await jdApi.read("c1");
    await jdApi.read("c1", "s 1");
    expect(calls.api.map((c) => [c.method, c.path])).toEqual([
      ["GET", "/v1/campaigns/c1/jd"],
      ["GET", "/v1/campaigns/c1/jd?specId=s%201"],
    ]);
  });

  it("uploads the file as its bytes, its type as the content type and its name in the query, so the server can keep it", async () => {
    const file = new File(["%PDF"], "Senior Backend JD.pdf", { type: "application/pdf" });
    await jdApi.upload("c1", file, "application/pdf");
    const call = calls.api[0]!;
    expect(call.method).toBe("POST");
    expect(call.path).toBe("/v1/campaigns/c1/spec/draft-from-file?name=Senior%20Backend%20JD.pdf");
    expect(call.body).toBe(file);
    expect(call.init).toEqual({ headers: { "content-type": "application/pdf" } });
    // The requirements page's own upload says the name too.
    expect(src("api/agent.ts")).toContain("/spec/draft-from-file?name=${encodeURIComponent(file.name)}");
  });

  it("downloads through the authenticated file fetch, never a bare link, for the version it is asked for", async () => {
    const blob = await jdApi.file("c1");
    await jdApi.file("c1", "s 1");
    expect(calls.file).toEqual(["/v1/campaigns/c1/jd/file", "/v1/campaigns/c1/jd/file?specId=s%201"]);
    expect(blob.type).toBe("application/pdf");
    expect(src("api/campaigns.ts")).toContain("apiFile(`/v1/campaigns/${campaignId}/jd/file");
    expect(src("JobDescriptionPopup.tsx")).not.toMatch(/<a [^>]*href=/);
    expect(src("campaignJd.ts")).toContain('import { download } from "./exportTable";');
  });
});

describe("the history line", () => {
  const line = (data: Record<string, unknown>, actorKind: "user" | "agent" = "user") =>
    logLine({ id: "1", subjectKind: "campaign", subjectId: "c1", subjectName: "Backend", verb: "updated", actorKind, actorId: "u1", actorName: "Ana Rao", data, at: new Date().toISOString() }, "me", () => undefined);

  it("says a description was added or replaced, not that the campaign was edited", () => {
    expect(line({ fields: ["jd"], jd: "added" })).toMatchObject({ actor: "Ana Rao", verb: "added the job description" });
    expect(line({ fields: ["jd"], jd: "replaced" })).toMatchObject({ verb: "replaced the job description" });
    expect(line({ fields: ["jd"] })).toMatchObject({ verb: "added the job description" });
    // Any other edit is still "edited the campaign".
    expect(line({ fields: ["name"] })).toMatchObject({ verb: "edited the campaign" });
    expect(line({ fields: ["jd", "name"] })).toMatchObject({ verb: "edited the campaign" });
  });
});

describe("where it is", () => {
  const page = src("CampaignWorkspace.tsx");
  const popup = src("JobDescriptionPopup.tsx");

  it("is a button in the campaign's header, right before Requirements, and no longer a card on the Overview", () => {
    expect(page).toMatch(
      /<CampaignHeader ctx=\{ctx\} meta=\{meta\}>\s*\{\/\*[^]*?\*\/\}\s*\{LIVE && <JobDescriptionButton key=\{resolveCampaignId\(ctx\.campaignId\)\} campaignId=\{resolveCampaignId\(ctx\.campaignId\)\} \/>\}\s*\{LIVE && <button type="button" className="cw-btn" onClick=\{\(\) => setSpecOpen\(true\)\}><ListChecks/,
    );
    expect(page).not.toMatch(/JobDescriptionCard|JobDescriptionGhost/);
    // Hires, Tasks and Activity keep the row they had, straight under the funnel and the days, loaded or loading.
    expect(page).toMatch(/<\/section>\s*<div className="ov4-low">/);
    expect(page).toMatch(/<\/section>\s*<div className="ov4-low" aria-hidden="true">/);
  });

  it("is open to everyone who can see the campaign (Update inside is the people on it), and reads nothing until it is opened", () => {
    expect(page).not.toMatch(/mayChange && <JobDescriptionButton/);
    /* The content is the dialog's child, made when the popup opens and dropped when it has left. */
    expect(popup).toMatch(/<Dialog open=\{open\} onClose=\{leave\} label="Job description" size="md">\s*<JobDescriptionPanel/);
    const [before, panel] = popup.split("export function JobDescriptionPanel");
    expect(panel).toContain("useCampaignJd(campaignId");
    expect(before).not.toContain("useCampaignJd(");
    /* A page that has several campaigns in turn keeps no draft from one under the next. */
    expect(page).toContain("<JobDescriptionButton key={resolveCampaignId(ctx.campaignId)}");
  });

  it("uses the Requirements dialog's own anatomy and the type scale, and calls the drafted criteria requirements", () => {
    expect(popup).toContain('className="rl-dlg jdp"');
    for (const word of ["t-title", "t-body", "t-body-sm"]) expect(popup).toContain(word);
    for (const file of ["JobDescriptionPopup.tsx", "campaignJd.ts", "jobDescription.css"]) {
      expect(src(file), file).not.toMatch(/role spec/i);
    }
    expect(src("campaignJd.ts")).toContain("requirements");
  });

  it("keeps nothing of the card that was on the Overview: no file size line either, the popup names the file and nothing more", () => {
    expect("fileSize" in campaignJd).toBe(false);
    expect(src("campaignJd.ts")).not.toContain("fileSize");
    expect(popup).not.toContain("fileSize");
  });

  it("scrolls the text in the middle of the popup, with a floor of height so loading and text are about the same size", () => {
    const css = src("jobDescription.css");
    expect(css).toMatch(/\.jdp-body \{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.jdp-body \{[^}]*min-height: min\(11rem, 36dvh\)/);
    expect(css).toMatch(/\.jdp-text \{[^}]*white-space: pre-line/);
    expect(css).not.toMatch(/line-clamp/);
    // The card's rules went with the card.
    expect(css).not.toMatch(/\.jdc|--jdc-lines|\.ov4-low/);
  });
});
