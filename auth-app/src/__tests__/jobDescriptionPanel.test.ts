import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, slowFailure, SLOW_WRITE_MESSAGE } from "../api/client";
import { CHANGED_MEANWHILE } from "../campaignJd";
import {
  JobDescriptionButton, JobDescriptionFailed, JobDescriptionForm, JobDescriptionPanel, JobDescriptionPopup, JobDescriptionView, JobDescriptionWait,
} from "../JobDescriptionPopup";
import type { Draft } from "../JobDescriptionPopup";

/**
 * The job description popup, run: what it shows while the text is on its way, how Update opens the form and Save puts the
 * text back, what holds it open, what stands in for the old text while a save is read again, what happens when the text
 * changes under an open form, and what is read again and where the cursor goes when a write is turned down. The console has
 * no DOM to mount a component in, so below is a tiny hook runtime (the one capturesNudge.test.ts uses, with refs and ids):
 * enough to render a component, call the handlers it hands its children, and let the server's answers settle. The server is
 * in the test's hands: every call waits until the test answers it. The markup and the wording are in jobDescriptionPopup.test.tsx.
 */

const rt = vi.hoisted(() => {
  type Slot = { value?: unknown; ref?: { current: unknown }; deps?: readonly unknown[] | undefined; cleanup?: unknown };
  const r = {
    slots: [] as Slot[],
    at: 0,
    effects: [] as Array<() => void>,
    rendering: false,
    dirty: false,
    schedule: () => {},
    useState: (initial: unknown): [unknown, (next: unknown) => void] => {
      const i = r.at++;
      if (!(i in r.slots)) r.slots[i] = { value: typeof initial === "function" ? (initial as () => unknown)() : initial };
      const s = r.slots[i]!;
      return [s.value, (next) => { s.value = typeof next === "function" ? (next as (cur: unknown) => unknown)(s.value) : next; r.schedule(); }];
    },
    useRef: (initial: unknown): { current: unknown } => {
      const i = r.at++;
      if (!(i in r.slots)) r.slots[i] = { ref: { current: initial } };
      return r.slots[i]!.ref!;
    },
    useId: (): string => `id${r.at++}`,
    useEffect: (fn: () => unknown, deps?: readonly unknown[]): void => {
      const i = r.at++;
      if (!(i in r.slots)) r.slots[i] = {};
      const s = r.slots[i]!;
      const changed = !deps || !s.deps || deps.length !== s.deps.length || deps.some((d, k) => !Object.is(d, s.deps![k]));
      if (changed) r.effects.push(() => { if (typeof s.cleanup === "function") s.cleanup(); s.cleanup = fn(); s.deps = deps; });
    },
  };
  return r;
});

type Read = { jd: unknown; status: "loading" | "ready" | "failed"; refreshFailed: boolean; rereading: boolean; reload: () => void };
const net = vi.hoisted(() => ({
  read: { jd: null, status: "loading", refreshFailed: false, rereading: false, reload: () => {} } as unknown,
  may: true,
  replace: [] as Array<{ campaignId: string; input: unknown; resolve: (said: string) => void; reject: (e: unknown) => void }>,
  taken: [] as unknown[][],
  /** What a Download comes back as. */
  takeResult: { s: "idle" } as unknown,
  toasts: [] as string[],
  invalidated: [] as unknown[],
  reads: [] as Array<{ campaignId: string; resolve: (v: unknown) => void; reject: (e: unknown) => void }>,
}));

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useState: rt.useState, useEffect: rt.useEffect, useRef: rt.useRef, useId: rt.useId,
}));
vi.mock("../api/client", async (orig) => ({ ...(await orig<typeof import("../api/client")>()), LIVE: true }));
vi.mock("../api/campaigns", async (orig) => {
  const real = await orig<typeof import("../api/campaigns")>();
  return { ...real, jdApi: { ...real.jdApi, read: (campaignId: string) => new Promise((resolve, reject) => { net.reads.push({ campaignId, resolve, reject }); }) } };
});
vi.mock("../campaignJd", async (orig) => ({
  ...(await orig<typeof import("../campaignJd")>()),
  useCampaignJd: () => net.read,
  replaceJd: (campaignId: string, input: unknown) => new Promise<string>((resolve, reject) => { net.replace.push({ campaignId, input, resolve, reject }); }),
  takeJdFile: async (...args: unknown[]) => { net.taken.push(args); return net.takeResult; },
}));
vi.mock("../campaignRights", () => ({ useMayChangeCampaign: () => net.may }));
vi.mock("../campaignStore", () => ({ useCampaignRow: () => undefined }));
vi.mock("../toast", () => ({ useToast: () => (said: string) => { net.toasts.push(said); } }));
vi.mock("../invalidate", () => ({ invalidate: (...args: unknown[]) => { net.invalidated.push(args); } }));

/* ── a tiny runtime ── */

type El = { type: unknown; props: Record<string, any> };

function mount<P, R>(component: (props: P) => R, first: P) {
  let props = first;
  let tree: R | undefined;
  const pump = () => {
    if (rt.rendering) { rt.dirty = true; return; }
    rt.rendering = true;
    try {
      do {
        rt.dirty = false; rt.at = 0; rt.effects = [];
        tree = component(props);
        for (const run of rt.effects) run();
      } while (rt.dirty);
    } finally { rt.rendering = false; }
  };
  rt.slots = [];
  rt.schedule = pump;
  pump();
  return {
    get tree() { return tree as R; },
    set(next: P) { props = next; pump(); },
    unmount() { for (const s of rt.slots) if (s && typeof s.cleanup === "function") { s.cleanup(); s.cleanup = undefined; } },
  };
}

/** Lets the promises that are already answered run their handlers. */
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

const jd = (over: Record<string, unknown> = {}) => ({
  text: "Senior Backend Engineer. Own the payments ledger in Go and Kafka, lead a small team, five to eight years in production backend work.",
  addedAt: new Date(2026, 9, 2, 12).toISOString(), addedBy: "Ana Rao", source: "pasted", file: null, versions: [], ...over,
});
const withFile = () => jd({ file: { name: "Senior-Backend-JD.pdf", size: 52_000, version: 1, specId: "spec-1" }, source: "file" });
const ready = (j: unknown, over: Partial<Read> = {}): Read => ({ jd: j, status: "ready", refreshFailed: false, rereading: false, reload: () => {}, ...over });
const PASTED = "x".repeat(120);
/** The description every test starts from. */
const SAVED = jd().text;

type PanelProps = Parameters<typeof JobDescriptionPanel>[0];
/** The panel as the popup holds it: the draft lives outside it, and handing it a new one renders it again. */
function panel(draft: Draft | null = null) {
  const seen = { drafts: [] as Array<Draft | null>, closed: 0, working: { current: false } };
  let props: PanelProps;
  const m = mount(JobDescriptionPanel, (props = {
    campaignId: "c1", draft, working: seen.working, onClose: () => { seen.closed += 1; },
    onDraft: (d: Draft | null) => { seen.drafts.push(d); props = { ...props, draft: d }; m.set(props); },
  }));
  return { ...seen, drafts: seen.drafts, working: seen.working, get closed() { return seen.closed; }, get el() { return m.tree as unknown as El; }, set: () => m.set(props), unmount: m.unmount };
}

beforeEach(() => {
  net.read = { jd: null, status: "loading", refreshFailed: false, rereading: false, reload: () => {} };
  net.may = true;
  net.takeResult = { s: "idle" };
  net.replace.length = 0; net.taken.length = 0; net.toasts.length = 0; net.reads.length = 0; net.invalidated.length = 0;
});

describe("what the popup shows", () => {
  it("waits, with the real title, while the first read is on its way, and only Close can be pressed", () => {
    const p = panel();
    expect(p.el.type).toBe(JobDescriptionWait);
    p.el.props.onClose();
    expect(p.closed).toBe(1);
  });

  it("shows the description once it is read, for the people who may update it, and for a follower with no Update", () => {
    const text = jd();
    net.read = ready(text);
    const mine = panel();
    expect(mine.el.type).toBe(JobDescriptionView);
    expect(mine.el.props).toMatchObject({ jd: text, may: true, refreshFailed: false, back: false });
    net.may = false;
    const theirs = panel();
    expect(theirs.el.props.may).toBe(false);
  });

  it("says it could not be read, with a way to ask again, when the first read failed", () => {
    const reload = () => {};
    net.read = ready(null, { status: "failed", reload });
    const p = panel();
    expect(p.el.type).toBe(JobDescriptionFailed);
    expect(p.el.props.onRetry).toBe(reload);
  });

  it("keeps the last description it read, marked as possibly out of date, when a later read failed", () => {
    net.read = ready(jd(), { refreshFailed: true });
    const p = panel();
    expect(p.el.type).toBe(JobDescriptionView);
    expect(p.el.props.refreshFailed).toBe(true);
  });

  it("downloads the file of the version it shows, and does nothing where there is no file", async () => {
    const withIt = withFile();
    net.read = ready(withIt);
    const p = panel();
    p.el.props.onTake();
    await settle();
    expect(net.taken).toEqual([["c1", (withIt as { file: unknown }).file]]);
    net.taken.length = 0;
    net.read = ready(jd());
    const none = panel();
    none.el.props.onTake();
    await settle();
    expect(net.taken).toEqual([]);
  });
});

describe("updating it", () => {
  it("opens the form on Update with the text as it stands, to be changed, and nothing is kept as a draft until something is typed", () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    expect(p.el.type).toBe(JobDescriptionForm);
    expect(p.el.props).toMatchObject({ saved: SAVED, text: SAVED, busy: "", problem: "" });
    expect(p.drafts).toEqual([]);
  });

  it("brings back what was changed and not saved, while the text is still the one it was changed over", () => {
    net.read = ready(jd());
    const p = panel({ text: PASTED, basedOn: SAVED });
    p.el.props.onUpdate();
    expect(p.el.props).toMatchObject({ saved: SAVED, text: PASTED });
  });

  it("does not bring back changes made over a text that has since been replaced: a teammate's newer text is not written over", () => {
    net.read = ready(jd());
    const p = panel({ text: PASTED, basedOn: "An older description, before a teammate changed it." });
    p.el.props.onUpdate();
    expect(p.el.props).toMatchObject({ saved: SAVED, text: SAVED });
  });

  it("opens the form as Add, and empty, where there is no description yet", () => {
    net.read = ready(jd({ text: null, addedAt: null, addedBy: null }));
    const p = panel();
    p.el.props.onUpdate();
    expect(p.el.props).toMatchObject({ saved: "", text: "" });
  });

  it("keeps what is typed as a draft over the text it was typed over", () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    expect(p.el.props.text).toBe(PASTED);
    expect(p.drafts).toEqual([{ text: PASTED, basedOn: SAVED }]);
  });

  it("sends the changed text on Save, holds the popup open while it goes, then shows the text again with what was said, and the draft cleared", async () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    expect(net.replace).toHaveLength(1);
    expect(net.replace[0]!.campaignId).toBe("c1");
    expect(net.replace[0]!.input).toEqual({ text: PASTED });
    expect(p.el.props.busy).toBe("text");
    /* A save on its way keeps Escape, the scrim and the close button from closing the popup (the popup reads this flag). */
    expect(p.working.current).toBe(true);
    /* And Cancel waits too. */
    p.el.props.onCancel();
    expect(p.drafts).toEqual([{ text: PASTED, basedOn: SAVED }]);
    net.replace[0]!.resolve("Job description saved. The requirements stay as they are.");
    await settle();
    expect(net.toasts).toEqual(["Job description saved. The requirements stay as they are."]);
    expect(p.drafts).toEqual([{ text: PASTED, basedOn: SAVED }, null]);
    expect(p.working.current).toBe(false);
    expect(p.el.type).toBe(JobDescriptionView);
    /* Focus goes back to Update, where it was. */
    expect(p.el.props.back).toBe(true);
  });

  it("shows the server's own words, in the form, when it turns the text down, and keeps what was typed", async () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    net.replace[0]!.reject(new ApiError(422, "invalid", "That job description is too short. Paste at least 80 characters of it."));
    await settle();
    expect(p.el.type).toBe(JobDescriptionForm);
    expect(p.el.props).toMatchObject({ busy: "", text: PASTED, problem: "That job description is too short. Paste at least 80 characters of it." });
    expect(p.drafts).toEqual([{ text: PASTED, basedOn: SAVED }]);
    expect(p.working.current).toBe(false);
    expect(net.toasts).toEqual([]);
    /* Typing again clears it. */
    p.el.props.onText(`${PASTED}y`);
    expect(p.el.props.problem).toBe("");
    expect(p.drafts.at(-1)).toEqual({ text: `${PASTED}y`, basedOn: SAVED });
  });

  it("says something calm, never an error's own text, when the call fails some other way", async () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    net.replace[0]!.reject(new TypeError("Failed to fetch"));
    await settle();
    expect(p.el.props.problem).toBe("Something went wrong.");
  });

  it("refuses a file the server would not read before anything is sent, and says why", () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onFile(new File(["x"], "sheet.xlsx", { type: "" }));
    expect(net.replace).toEqual([]);
    expect(p.el.props.problem).toContain("not sheet.xlsx");
    expect(p.el.props.busy).toBe("");
  });

  it("sends a file as the file, says it is reading it, and shows the text again once it is in", async () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    const file = new File(["%PDF"], "jd.pdf", { type: "application/pdf" });
    p.el.props.onFile(file);
    expect(net.replace[0]!.input).toEqual({ file });
    expect(p.el.props.busy).toBe("file");
    expect(p.working.current).toBe(true);
    net.replace[0]!.resolve("Job description saved. New requirements are drafted from it, for you to review.");
    await settle();
    expect(p.el.type).toBe(JobDescriptionView);
    expect(p.working.current).toBe(false);
    expect(net.toasts).toEqual(["Job description saved. New requirements are drafted from it, for you to review."]);
  });

  it("goes back to the text on Cancel and drops what was typed", () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    p.el.props.onCancel();
    expect(p.el.type).toBe(JobDescriptionView);
    expect(p.drafts.at(-1)).toBeNull();
    expect(p.el.props.back).toBe(true);
  });

  it("does not show the old text while the new one is being read: it waits, and the text that comes is the one that was kept", async () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    /* What replaceJd does before it answers: ask for the text again. */
    net.read = ready(jd(), { rereading: true });
    net.replace[0]!.resolve("Job description saved. The requirements stay as they are.");
    await settle();
    expect(p.el.type).toBe(JobDescriptionWait);
    net.read = ready(jd({ text: PASTED }));
    p.set();
    expect(p.el.type).toBe(JobDescriptionView);
    expect(p.el.props.jd).toMatchObject({ text: PASTED });
  });
});

/** What a teammate (or the agent) saved while a form was open. */
const THEIRS = "A teammate's newer description, saved while this form was open: own the hiring plan, run the loop, five years of recruiting.";

/** Stands in for the box's element, which the runtime has none of: counts the times the panel puts the cursor in it. */
function cursorIn(form: El) {
  const seen = { moved: 0 };
  (form.props.areaRef as { current: unknown }).current = { focus: () => { seen.moved += 1; } };
  return seen;
}

describe("when the text changes under an open form", () => {
  /** What the hook does when the server's text changes while the form is open: it holds the new one. */
  const theirsArrives = (p: ReturnType<typeof panel>, over: Partial<Read> = {}) => { net.read = ready(jd({ text: THEIRS }), over); p.set(); };

  it("stays over the text it was opened on: Save is not turned on by it, and Update or Add is not decided by it", () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    theirsArrives(p);
    expect(p.el.type).toBe(JobDescriptionForm);
    /* The form's `saved` is what unchanged and Update-or-Add are read from: it is still the text the box was opened on. */
    expect(p.el.props).toMatchObject({ saved: SAVED, text: SAVED });
  });

  it("stamps what is typed with the text the form was opened over, so a reopen over their text does not bring it back", () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    theirsArrives(p);
    p.el.props.onText(PASTED);
    expect(p.drafts).toEqual([{ text: PASTED, basedOn: SAVED }]);
    /* The popup hands the draft back when it is opened again: over their text, it is not brought back to be saved over it. */
    const again = panel(p.drafts[0]!);
    again.el.props.onUpdate();
    expect(again.el.props).toMatchObject({ saved: THEIRS, text: THEIRS });
  });

  it("does not send a text over one saved meanwhile: Save says so, keeps what was typed, puts the cursor in the box, and a second press goes through", async () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    const cursor = cursorIn(p.el);
    p.el.props.onText(PASTED);
    theirsArrives(p);
    p.el.props.onSave();
    /* Nothing was sent, nothing is busy, and the popup is not held open. */
    expect(net.replace).toEqual([]);
    expect(p.working.current).toBe(false);
    expect(p.el.type).toBe(JobDescriptionForm);
    expect(p.el.props).toMatchObject({ busy: "", text: PASTED, saved: THEIRS, problem: CHANGED_MEANWHILE });
    expect(cursor.moved).toBe(1);
    expect(net.toasts).toEqual([]);
    /* Their text is what the form is measured against now, so the second press is the person's own choice. */
    p.el.props.onSave();
    expect(net.replace).toHaveLength(1);
    expect(net.replace[0]!.input).toEqual({ text: PASTED });
    expect(p.el.props).toMatchObject({ busy: "text", problem: "" });
    net.replace[0]!.resolve("Job description saved. The requirements stay as they are.");
    await settle();
    expect(p.el.type).toBe(JobDescriptionView);
  });

  it("lets the person type on after being told: the sentence goes, the draft is over their text now, and Save goes through", () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    theirsArrives(p);
    p.el.props.onSave();
    expect(p.el.props.problem).toBe(CHANGED_MEANWHILE);
    p.el.props.onText(`${PASTED}y`);
    expect(p.el.props.problem).toBe("");
    expect(p.drafts.at(-1)).toEqual({ text: `${PASTED}y`, basedOn: THEIRS });
    p.el.props.onSave();
    expect(net.replace).toHaveLength(1);
    expect(net.replace[0]!.input).toEqual({ text: `${PASTED}y` });
  });

  it("is the same when Update was pressed on a text that may have been out of date: the form is over what was on screen", () => {
    net.read = ready(jd(), { refreshFailed: true });
    const p = panel();
    expect(p.el.type).toBe(JobDescriptionView);
    expect(p.el.props.refreshFailed).toBe(true);
    p.el.props.onUpdate();
    expect(p.el.props.saved).toBe(SAVED);
    /* The read that had failed comes back, with what really stands. */
    theirsArrives(p);
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    expect(net.replace).toEqual([]);
    expect(p.el.props).toMatchObject({ text: PASTED, saved: THEIRS, problem: CHANGED_MEANWHILE });
  });

  it("turns an Add form into an Update one only when Save finds that a description was added meanwhile, and does not write over it", () => {
    net.read = ready(jd({ text: null, addedAt: null, addedBy: null }));
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    theirsArrives(p);
    expect(p.el.props.saved).toBe("");
    p.el.props.onSave();
    expect(net.replace).toEqual([]);
    expect(p.el.props).toMatchObject({ saved: THEIRS, problem: CHANGED_MEANWHILE });
  });

  it("does not call its own save someone else's: after a save that timed out and had gone through, Save is simply sent again", async () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    net.replace[0]!.reject(slowFailure("PUT", "/v1/campaigns/c1/jd", 15_000));
    await settle();
    /* The read it asked for comes back with the very text that was sent. */
    net.read = ready(jd({ text: PASTED }));
    p.set();
    p.el.props.onSave();
    expect(net.replace).toHaveLength(2);
    expect(p.el.props).toMatchObject({ busy: "text", problem: "" });
  });
});

describe("a write that is turned down", () => {
  it("asks for the text again, and for the views a text touches, since a timeout says it may have gone through, and keeps the sentence in the form", async () => {
    let reloads = 0;
    net.read = ready(jd(), { reload: () => { reloads += 1; } });
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    expect(reloads).toBe(0);
    const slow = slowFailure("PUT", "/v1/campaigns/c1/jd", 15_000);
    expect(slow.details).toMatchObject({ maybeDone: true });
    net.replace[0]!.reject(slow);
    await settle();
    expect(reloads).toBe(1);
    expect(net.invalidated).toEqual([[["campaign"], { campaignId: "c1" }]]);
    expect(p.el.type).toBe(JobDescriptionForm);
    expect(p.el.props).toMatchObject({ busy: "", text: PASTED, problem: SLOW_WRITE_MESSAGE });
  });

  it("does so for any failure of a write, a refusal and a file as well: a file touches the requirements", async () => {
    let reloads = 0;
    net.read = ready(jd(), { reload: () => { reloads += 1; } });
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    net.replace[0]!.reject(new ApiError(422, "invalid", "That job description is too short. Paste at least 80 characters of it."));
    await settle();
    expect(reloads).toBe(1);
    expect(net.invalidated).toEqual([[["campaign"], { campaignId: "c1" }]]);
    p.el.props.onFile(new File(["%PDF"], "jd.pdf", { type: "application/pdf" }));
    net.replace[1]!.reject(new TypeError("Failed to fetch"));
    await settle();
    expect(reloads).toBe(2);
    expect(net.invalidated).toEqual([[["campaign"], { campaignId: "c1" }], [["spec"], { campaignId: "c1" }]]);
    expect(p.el.props).toMatchObject({ busy: "", problem: "Something went wrong." });
  });

  it("asks for nothing when nothing was sent: a file refused before it goes, and a text that was not saved because someone else changed it", () => {
    let reloads = 0;
    net.read = ready(jd(), { reload: () => { reloads += 1; } });
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onFile(new File(["x"], "sheet.xlsx", { type: "" }));
    p.el.props.onText(PASTED);
    net.read = ready(jd({ text: THEIRS }), { reload: () => { reloads += 1; } });
    p.set();
    p.el.props.onSave();
    expect(net.replace).toEqual([]);
    expect(reloads).toBe(0);
    expect(net.invalidated).toEqual([]);
  });

  it("shows what stands, not the old text, when the form is cancelled after a write that may have gone through", async () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    net.replace[0]!.reject(slowFailure("PUT", "/v1/campaigns/c1/jd", 15_000));
    await settle();
    /* What the hook does once asked: the text is being read again. The form, and its sentence, stay. */
    net.read = ready(jd(), { rereading: true });
    p.set();
    expect(p.el.type).toBe(JobDescriptionForm);
    p.el.props.onCancel();
    expect(p.el.type).toBe(JobDescriptionWait);
    net.read = ready(jd({ text: PASTED }));
    p.set();
    expect(p.el.type).toBe(JobDescriptionView);
    expect(p.el.props.jd).toMatchObject({ text: PASTED });
  });

  it("waits, with a Close that is there to be pressed, when Try again asks for a description that could not be read", () => {
    net.read = ready(null, { status: "failed" });
    const p = panel();
    expect(p.el.type).toBe(JobDescriptionFailed);
    net.read = ready(null, { status: "failed", rereading: true });
    p.set();
    expect(p.el.type).toBe(JobDescriptionWait);
    p.el.props.onClose();
    expect(p.closed).toBe(1);
  });
});

describe("the Download state", () => {
  const refused = { s: "failed", message: "That file is not there any more." };

  it("keeps a failed Download's sentence while the same file stands, and forgets it when another file does, or none", async () => {
    net.read = ready(withFile());
    const p = panel();
    net.takeResult = refused;
    p.el.props.onTake();
    await settle();
    expect(p.el.props.file).toEqual(refused);
    /* The description is read again and the very same file stands. */
    net.read = ready(withFile());
    p.set();
    expect(p.el.props.file).toEqual(refused);
    /* A teammate replaced it with another file (another version of the requirements). */
    const another = jd({ file: { name: "New-JD.pdf", size: 41_000, version: 2, specId: "spec-2" }, source: "file" });
    net.read = ready(another);
    p.set();
    expect(p.el.props.file).toEqual({ s: "idle" });
    /* And the same when the file goes altogether (the description is pasted text now). */
    p.el.props.onTake();
    await settle();
    expect(p.el.props.file).toEqual(refused);
    net.read = ready(jd());
    p.set();
    expect(p.el.props.file).toEqual({ s: "idle" });
  });

  it("forgets it when a replacement is saved, so the red line does not outlive the file it was about", async () => {
    net.read = ready(withFile());
    const p = panel();
    net.takeResult = refused;
    p.el.props.onTake();
    await settle();
    expect(p.el.props.file).toEqual(refused);
    p.el.props.onUpdate();
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    net.replace[0]!.resolve("Job description saved. The requirements stay as they are.");
    await settle();
    expect(p.el.type).toBe(JobDescriptionView);
    expect(p.el.props.file).toEqual({ s: "idle" });
  });
});

describe("where the cursor goes", () => {
  it("returns to the box when a save is turned down, and not while the controls are off, nor once the person types again", async () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    const cursor = cursorIn(p.el);
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    /* Everything is disabled while it goes: nothing to move focus to. */
    expect(p.el.props.busy).toBe("text");
    expect(cursor.moved).toBe(0);
    net.replace[0]!.reject(new ApiError(422, "invalid", "That job description is too short. Paste at least 80 characters of it."));
    await settle();
    expect(p.el.props.problem).not.toBe("");
    expect(cursor.moved).toBe(1);
    /* Typing clears the sentence and leaves the cursor where the person is. */
    p.el.props.onText(`${PASTED}y`);
    expect(p.el.props.problem).toBe("");
    p.el.props.onText(`${PASTED}yz`);
    expect(cursor.moved).toBe(1);
  });

  it("returns to the box when a file is refused, and when an upload is turned down", async () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    const cursor = cursorIn(p.el);
    p.el.props.onFile(new File(["x"], "sheet.xlsx", { type: "" }));
    expect(p.el.props.problem).toContain("not sheet.xlsx");
    expect(cursor.moved).toBe(1);
    p.el.props.onFile(new File(["%PDF"], "jd.pdf", { type: "application/pdf" }));
    expect(p.el.props).toMatchObject({ busy: "file", problem: "" });
    expect(cursor.moved).toBe(1);
    net.replace[0]!.reject(new ApiError(502, "bad_gateway", "We could not read that file."));
    await settle();
    expect(p.el.props).toMatchObject({ busy: "", problem: "We could not read that file." });
    expect(cursor.moved).toBe(2);
  });

  it("does not move anything when the write goes well", async () => {
    net.read = ready(jd());
    const p = panel();
    p.el.props.onUpdate();
    const cursor = cursorIn(p.el);
    p.el.props.onText(PASTED);
    p.el.props.onSave();
    net.replace[0]!.resolve("Job description saved. The requirements stay as they are.");
    await settle();
    expect(p.el.type).toBe(JobDescriptionView);
    expect(cursor.moved).toBe(0);
  });
});

describe("the popup that holds it", () => {
  const popup = (open = true) => {
    const seen = { closed: 0 };
    const m = mount(JobDescriptionPopup, { open, onClose: () => { seen.closed += 1; }, campaignId: "c1" });
    return { m, seen, get dialog() { return m.tree as unknown as El; }, get inside() { return (m.tree as unknown as El).props.children as El; } };
  };

  it("is a dialog called Job description with the panel as its content, for the campaign it was opened on", () => {
    const p = popup();
    expect(p.dialog.props).toMatchObject({ open: true, label: "Job description", size: "md" });
    expect(p.inside.type).toBe(JobDescriptionPanel);
    expect(p.inside.props).toMatchObject({ campaignId: "c1", draft: null });
  });

  it("closes on Escape, the scrim and the close button, and on the panel's own Close, which are all the same call", () => {
    const p = popup();
    expect(p.inside.props.onClose).toBe(p.dialog.props.onClose);
    p.dialog.props.onClose();
    expect(p.seen.closed).toBe(1);
  });

  it("does not close over a save that is on its way, and closes again once it has answered", () => {
    const p = popup();
    p.inside.props.working.current = true;
    p.dialog.props.onClose();
    expect(p.seen.closed).toBe(0);
    p.inside.props.working.current = false;
    p.dialog.props.onClose();
    expect(p.seen.closed).toBe(1);
  });

  it("keeps what was changed and not saved for the next time it is opened, until it is saved or cancelled", () => {
    const p = popup();
    p.inside.props.onDraft({ text: "a description half changed", basedOn: "the text it was changed over" });
    expect(p.inside.props.draft).toEqual({ text: "a description half changed", basedOn: "the text it was changed over" });
    p.inside.props.onDraft(null);
    expect(p.inside.props.draft).toBeNull();
  });

  it("has a header button that opens it and closes it again", () => {
    const m = mount(JobDescriptionButton, { campaignId: "c1" });
    const parts = () => ((m.tree as unknown as El).props.children as El[]);
    const [button, dialog] = parts();
    expect(button!.type).toBe("button");
    expect(button!.props.className).toBe("cw-btn");
    expect(dialog!.type).toBe(JobDescriptionPopup);
    expect(dialog!.props).toMatchObject({ open: false, campaignId: "c1" });
    button!.props.onClick();
    expect(parts()[1]!.props.open).toBe(true);
    parts()[1]!.props.onClose();
    expect(parts()[1]!.props.open).toBe(false);
  });
});

describe("a description that is asked for again", () => {
  it("says it is asking again from a save until the new read answers, one way or the other, and not for the first read", async () => {
    const real = await vi.importActual<typeof import("../campaignJd")>("../campaignJd");
    const m = mount(() => real.useCampaignJd("c1", ""), undefined);
    expect(net.reads).toHaveLength(1);
    expect(m.tree).toMatchObject({ status: "loading", rereading: false });
    net.reads[0]!.resolve(jd());
    await settle();
    expect(m.tree).toMatchObject({ status: "ready", rereading: false, jd: jd() });

    /* What replaceJd does once the server has the new text. The old text stays held, and the flag says it is being replaced. */
    real.reloadCampaignJd("c1");
    expect(net.reads).toHaveLength(2);
    expect(m.tree).toMatchObject({ status: "ready", rereading: true, jd: jd() });
    net.reads[1]!.resolve(jd({ text: "The text that was kept." }));
    await settle();
    expect(m.tree).toMatchObject({ status: "ready", rereading: false, refreshFailed: false });
    expect((m.tree as { jd: { text: string } }).jd.text).toBe("The text that was kept.");

    /* A read that does not come back ends the waiting too, and says the text may be out of date. */
    real.reloadCampaignJd("c1");
    expect((m.tree as { rereading: boolean }).rereading).toBe(true);
    net.reads[2]!.reject(new Error("down"));
    await settle();
    expect(m.tree).toMatchObject({ status: "ready", rereading: false, refreshFailed: true });
    expect((m.tree as { jd: { text: string } }).jd.text).toBe("The text that was kept.");
    m.unmount();
  });

  it("waits for the newest of two asks, not the first to come back", async () => {
    const real = await vi.importActual<typeof import("../campaignJd")>("../campaignJd");
    const m = mount(() => real.useCampaignJd("c1", ""), undefined);
    net.reads[0]!.resolve(jd());
    await settle();
    real.reloadCampaignJd("c1");
    real.reloadCampaignJd("c1");
    /* The first ask was dropped when the second was made: only the last one answers for the page. */
    expect(net.reads).toHaveLength(3);
    net.reads[1]!.resolve(jd({ text: "Dropped." }));
    await settle();
    expect(m.tree).toMatchObject({ rereading: true });
    net.reads[2]!.resolve(jd({ text: "The one that counts." }));
    await settle();
    expect(m.tree).toMatchObject({ rereading: false });
    expect((m.tree as { jd: { text: string } }).jd.text).toBe("The one that counts.");
    m.unmount();
  });

  it("never says it is asking again with no campaign to ask about", async () => {
    const real = await vi.importActual<typeof import("../campaignJd")>("../campaignJd");
    const m = mount(() => real.useCampaignJd("", ""), undefined);
    real.reloadCampaignJd("");
    expect(net.reads).toEqual([]);
    expect((m.tree as { rereading: boolean }).rereading).toBe(false);
    m.unmount();
  });
});
