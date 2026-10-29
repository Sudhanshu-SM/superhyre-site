import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ATTACH_EVERY_MS, attachedLine, CapturesNudge, ownersLine } from "../CapturesNudge";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

/* The console has no DOM to mount a component in, so below is a tiny hook runtime: enough to render the note, give the same instance
   other props, and let its effects and the server's answers settle. The server is in the test's hands: every call waits until the
   test answers it. */
const rt = vi.hoisted(() => {
  type Slot = { value?: unknown; current?: unknown; deps?: readonly unknown[] | undefined; cleanup?: unknown };
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

type Person = { name: string; title: string | null; company: string | null; owner: string | null };
type Attached = { added: number; people: Person[]; remaining: number };
const net = vi.hoisted(() => ({
  calls: [] as Array<{ campaignId: string; resolve: (v: unknown) => void; reject: (e: unknown) => void }>,
  who: { may: true, row: undefined as { status: string } | undefined },
  invalidated: [] as unknown[],
}));

vi.mock("react", async (orig) => {
  const real = await orig<typeof import("react")>();
  return { ...real, useState: rt.useState, useEffect: rt.useEffect };
});
vi.mock("../api/client", () => ({ LIVE: true }));
vi.mock("../api/candidates", () => ({
  attachCaptures: (campaignId: string) => new Promise((resolve, reject) => { net.calls.push({ campaignId, resolve, reject }); }),
}));
vi.mock("../campaignRights", () => ({ useMayChangeCampaign: () => net.who.may }));
vi.mock("../campaignStore", () => ({ useCampaignRow: () => net.who.row }));
vi.mock("../invalidate", () => ({ invalidate: (...args: unknown[]) => { net.invalidated.push(args); } }));

describe("what is said about people saved from LinkedIn who were put on the shortlist", () => {
  it("says what was done, as a fact and not a question", () => {
    expect(attachedLine(1, "BD Executive")).toBe("Added 1 person saved from LinkedIn to BD Executive's shortlist.");
    expect(attachedLine(5, "BD Executive", "Ravi 5")).toBe("Added 5 people saved from LinkedIn (Ravi 5) to BD Executive's shortlist.");
  });

  it("says whose they are, most first, by first name, by the whole name where two people share a first name, and at most four", () => {
    expect(ownersLine([{ owner: "Archi Hayaran" }, { owner: "Archi Hayaran" }, { owner: "Punith Reddy" }, { owner: null }])).toBe("Archi 2, Punith 1");
    expect(ownersLine([])).toBe("");
    expect(ownersLine([{ owner: "Archi Hayaran" }, { owner: "Archi Rao" }, { owner: "Archi Rao" }])).toBe("Archi Rao 2, Archi Hayaran 1");
    const five = ["A One", "B Two", "C Three", "D Four", "E Five"].map((owner) => ({ owner }));
    expect(ownersLine(five).split(", ")).toHaveLength(4);
  });

  it("is on the Shortlisted page and on the Candidates page once one campaign is chosen, a note of its own for each campaign, and asks nothing", () => {
    expect(read("CampaignWorkspace.tsx")).toContain("<CapturesNudge campaignId={ctx.campaignId}");
    expect(read("Contacts.tsx")).toContain("<CapturesNudge key={camp} campaignId={camp} name={campName(camp)} flush />");
    const src = read("CapturesNudge.tsx");
    expect(src).toContain("attachCaptures(campaignId)");
    // No button that adds, no question: the people are put on the shortlist by the page, and the note says so.
    expect(src).not.toContain("addToCampaign");
    expect(src).not.toMatch(/Add all|Add the first|Not now/);
    expect(src).not.toContain("useFollowingLine");
    expect(src).not.toMatch(/crust|salesql|apollo/i);
    // Only someone who may change the campaign, and never a closed one.
    expect(src).toMatch(/closed \|\| !may/);
  });
});

/* ── the note itself, run ── */

let next = 0;
/** A campaign id nobody has opened yet: a campaign opened twice in a breath is looked at once, so each case takes a fresh one. */
const fresh = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;

type Props = { campaignId: string; name: string; flush?: boolean };
type El = { type?: unknown; props?: Record<string, unknown> };

function mount(first: Props) {
  let props = first;
  let tree: unknown = null;
  const pump = () => {
    if (rt.rendering) { rt.dirty = true; return; }
    rt.rendering = true;
    try {
      do {
        rt.dirty = false; rt.at = 0; rt.effects = [];
        tree = CapturesNudge(props);
        for (const run of rt.effects) run();
      } while (rt.dirty);
    } finally { rt.rendering = false; }
  };
  rt.slots = [];
  rt.schedule = pump;
  pump();
  return {
    get tree() { return tree; },
    set(nextProps: Props) { props = nextProps; pump(); },
    unmount() { for (const s of rt.slots) if (s && typeof s.cleanup === "function") { s.cleanup(); s.cleanup = undefined; } },
  };
}
type View = ReturnType<typeof mount>;

const walk = (node: unknown, visit: (el: El) => void): void => {
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (node && typeof node === "object" && "props" in node) { const el = node as El; visit(el); walk(el.props?.children, visit); }
};
const textOf = (node: unknown): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node && typeof node === "object" && "props" in node ? textOf((node as El).props?.children) : "";
};
const labels = (view: View): string[] => {
  const out: string[] = [];
  walk(view.tree, (el) => { if (el.type === "button") out.push(textOf(el.props?.children)); });
  return out;
};
const press = (view: View, label: string) => {
  let hit: (() => void) | undefined;
  walk(view.tree, (el) => { if (el.type === "button" && textOf(el.props?.children) === label) hit = el.props?.onClick as () => void; });
  expect(hit, `a button "${label}" in ${labels(view).join(" | ") || "nothing"}`).toBeTruthy();
  hit!();
};
const said = (view: View) => textOf(view.tree);

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const people = (owner: string, n: number): Person[] => Array.from({ length: n }, (_, i) => ({ name: `${owner} person ${i + 1}`, title: "Engineer", company: "Acme", owner }));
const result = (list: Person[], remaining = 0): Attached => ({ added: list.length, people: list, remaining });
/** The server answers the nth call it was made for this campaign. */
const answer = async (campaignId: string, reply: Attached, nth = 0) => {
  const asked = net.calls.filter((c) => c.campaignId === campaignId)[nth];
  expect(asked, `a call for ${campaignId}`).toBeTruthy();
  asked!.resolve(reply);
  await flush();
};
const callsFor = (campaignId: string) => net.calls.filter((c) => c.campaignId === campaignId).length;

beforeEach(() => {
  net.calls.length = 0; net.invalidated.length = 0;
  net.who.may = true; net.who.row = undefined;
});

describe("opening a campaign puts the people saved from LinkedIn who fit it on its shortlist", () => {
  it("does it by itself, says what it did with who and a way to read the names, and refreshes the lists", async () => {
    const id = fresh();
    const view = mount({ campaignId: id, name: "BD Executive" });
    expect(callsFor(id)).toBe(1);
    expect(said(view)).toBe("");
    await answer(id, result([...people("Archi Hayaran", 3), ...people("Ravi Iyer", 2)]));
    expect(said(view)).toContain("Added 5 people saved from LinkedIn (Archi 3, Ravi 2) to BD Executive's shortlist.");
    // Nothing to press to add them: only a way to read who, and to put the note away.
    expect(labels(view)).toEqual(["Show who", "Dismiss"]);
    expect(net.invalidated).toEqual([[["pipeline", "candidates"], { campaignId: id }]]);
    press(view, "Show who");
    expect(said(view)).toContain("Archi Hayaran person 1");
    expect(said(view)).toContain("Engineer · Acme");
    press(view, "Dismiss");
    expect(said(view)).toBe("");
  });

  it("says nothing and refreshes nothing when nobody fit", async () => {
    const id = fresh();
    const view = mount({ campaignId: id, name: "BD Executive" });
    await answer(id, result([]));
    expect(said(view)).toBe("");
    expect(net.invalidated).toEqual([]);
  });

  it("asks nothing for someone who may not change the campaign, nor for a closed one", () => {
    const a = fresh();
    net.who.may = false;
    mount({ campaignId: a, name: "Backend" });
    expect(callsFor(a)).toBe(0);
    net.who.may = true;
    net.who.row = { status: "closed" };
    const b = fresh();
    mount({ campaignId: b, name: "Backend" });
    expect(callsFor(b)).toBe(0);
  });

  it("keeps going while more are waiting, so a long list is on the shortlist by the end of the visit", async () => {
    const id = fresh();
    const view = mount({ campaignId: id, name: "Sales Manager" });
    await answer(id, result(people("Cyrus Jason", 200), 50), 0);
    expect(callsFor(id)).toBe(2);
    await answer(id, result(people("Cyrus Jason", 50), 0), 1);
    expect(callsFor(id)).toBe(2);
    expect(said(view)).toContain("Added 250 people saved from LinkedIn (Cyrus 250) to Sales Manager's shortlist.");
    expect(said(view)).not.toContain("waiting");
  });

  it("says how many are still waiting when a visit's rounds ran out", async () => {
    const id = fresh();
    const view = mount({ campaignId: id, name: "Sales Manager" });
    for (let i = 0; i < 5; i++) await answer(id, result(people("Cyrus Jason", 200), 100), i);
    expect(callsFor(id)).toBe(5);
    expect(said(view)).toContain("100 more are waiting: open this again to bring them.");
  });

  it("looks at a campaign opened twice in a breath once, and again after a while", async () => {
    const id = fresh();
    mount({ campaignId: id, name: "BD Executive" });
    mount({ campaignId: id, name: "BD Executive" });
    expect(callsFor(id)).toBe(1);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + ATTACH_EVERY_MS + 1000);
      mount({ campaignId: id, name: "BD Executive" });
      expect(callsFor(id)).toBe(2);
    } finally { vi.useRealTimers(); }
  });

  it("says plainly when it could not, offers the one thing that mends it, and asks the server again when pressed", async () => {
    const id = fresh();
    const view = mount({ campaignId: id, name: "BD Executive" });
    net.calls[0]?.reject(new Error("offline"));
    await flush();
    expect(said(view)).toContain("Couldn't add the people you saved from LinkedIn just now.");
    expect(labels(view)).toEqual(["Try again"]);
    press(view, "Try again");
    expect(callsFor(id)).toBe(2);
    await answer(id, result(people("Archi Hayaran", 1)), 1);
    expect(said(view)).toContain("Added 1 person saved from LinkedIn (Archi 1) to BD Executive's shortlist.");
  });

  it("belongs to one campaign: a note for the first is never drawn under the second, and an answer that comes late refreshes the lists but says nothing to the wrong page", async () => {
    const a = fresh();
    const b = fresh();
    const view = mount({ campaignId: a, name: "Backend Engineer" });
    view.set({ campaignId: b, name: "Sales Lead" });
    expect(net.calls.map((c) => c.campaignId)).toEqual([a, b]);
    await answer(b, result(people("Ravi Iyer", 2)));
    expect(said(view)).toContain("to Sales Lead's shortlist");
    await answer(a, result(people("Archi Hayaran", 4)));
    expect(said(view)).toContain("to Sales Lead's shortlist");
    expect(said(view)).not.toContain("Backend Engineer");
    // The late answer still changed the first campaign's people, so its lists are refreshed.
    expect(net.invalidated).toEqual([[["pipeline", "candidates"], { campaignId: b }], [["pipeline", "candidates"], { campaignId: a }]]);
  });

  it("lets go when the page takes it away before the server answers: the lists are still refreshed", async () => {
    const id = fresh();
    const view = mount({ campaignId: id, name: "BD Executive" });
    view.unmount();
    await answer(id, result(people("Archi Hayaran", 2)));
    expect(said(view)).toBe("");
    expect(net.invalidated).toEqual([[["pipeline", "candidates"], { campaignId: id }]]);
  });

  it("is in the page's grid without a margin of its own when it is told so", async () => {
    const id = fresh();
    const view = mount({ campaignId: id, name: "BD Executive", flush: true });
    await answer(id, result(people("Archi Hayaran", 1)));
    expect((view.tree as El).props?.style).toEqual({ margin: 0 });
  });
});
