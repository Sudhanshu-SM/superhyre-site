import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RoleSpec, SpecRow } from "../api/agent";
import { ClientPicker } from "../ClientPicker";
import { CLIENT_FIRST, RoleSpecPanel, SpecClient } from "../RoleSpecPanel";
import { mayChangeCampaignClient } from "../campaignRights";
import type { Assignable, Session } from "../roleStore";
import { SpecEditor } from "../agentCards";

/**
 * The Requirements dialog and who the role is for. A campaign always has a client, so the dialog opens with a Client
 * row above the requirements: a picker for the people who may set it (saved on Save), plain text for the rest. While
 * the campaign has none, the approval waits and says why. The console has no DOM to mount a component in, so below
 * is a tiny hook runtime (the one jobDescriptionPanel.test.ts uses).
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

const net = vi.hoisted(() => ({
  /** May the person change the campaign (the spec), and may they set its client. */
  may: true,
  mayClient: true,
  client: null as { id: string; name: string } | null,
  spec: {} as Record<string, unknown>,
  /** Each save to the store, answered when the test says. */
  saves: [] as Array<{ kind: "id" | "name"; campaignId: string; value: string; answer: (ok: boolean) => void }>,
  toasts: [] as string[],
}));

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useState: rt.useState, useEffect: rt.useEffect, useRef: rt.useRef, useId: rt.useId,
}));
vi.mock("../specDraft", async (orig) => ({ ...(await orig<typeof import("../specDraft")>()), useCampaignSpec: () => net.spec }));
vi.mock("../campaignRights", async (orig) => ({
  ...(await orig<typeof import("../campaignRights")>()),
  useMayChangeCampaign: () => net.may,
  useMayChangeCampaignClient: (_id: string, _has: boolean) => net.mayClient,
  useFollowingLine: () => "",
}));
vi.mock("../campaignStore", async (orig) => ({
  ...(await orig<typeof import("../campaignStore")>()),
  useCampaignClient: () => net.client,
  useClients: () => ({ clients: [{ id: "cl1", name: "Acme Fintech", status: "active" }, { id: "cl2", name: "Orbit Labs", status: "active" }], clientOf: {} }),
  clientById: (id: string) => ({ cl1: { id: "cl1", name: "Acme Fintech" }, cl2: { id: "cl2", name: "Orbit Labs" } })[id],
  setCampaignClient: (campaignId: string, value: string) => new Promise<boolean>((answer) => { net.saves.push({ kind: "id", campaignId, value, answer }); }),
  setCampaignClientByName: (campaignId: string, value: string) => new Promise<boolean>((answer) => { net.saves.push({ kind: "name", campaignId, value, answer }); }),
  refreshCampaign: () => {},
  refreshCampaignAgents: () => {},
}));
vi.mock("../toast", async (orig) => ({ ...(await orig<typeof import("../toast")>()), useToast: () => (said: string) => { net.toasts.push(said); } }));

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
  return { get tree() { return tree as R; }, set(next: P) { props = next; pump(); } };
}

const walk = (node: unknown, visit: (el: El) => void): void => {
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (node && typeof node === "object" && "props" in node) { const el = node as El; visit(el); walk(el.props?.children, visit); }
};
const find = (node: unknown, ok: (el: El) => boolean): El | undefined => {
  let hit: El | undefined;
  walk(node, (el) => { if (!hit && ok(el)) hit = el; });
  return hit;
};
const all = (node: unknown, ok: (el: El) => boolean): El[] => {
  const out: El[] = [];
  walk(node, (el) => { if (ok(el)) out.push(el); });
  return out;
};
const textOf = (node: unknown): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node && typeof node === "object" && "props" in node ? textOf((node as El).props?.children) : "";
};
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };

const SPEC: RoleSpec = {
  title: "Senior Backend Engineer", seniority: "Senior", yearsMin: 5, locations: ["Pune"], remoteOk: false, avoid: [],
  requirements: [{ id: "r1", kind: "skill", text: "Go", importance: "must", weight: 0.9 }],
};
const row = (over: Partial<SpecRow> = {}): SpecRow => ({ id: "s1", version: 1, spec: SPEC, jdText: null, approvedAt: null, createdAt: "2026-10-20T10:00:00Z", ...over });
const ready = (over: Record<string, unknown> = {}) => ({
  ready: true, latest: row(), approved: null, drafting: false, failed: false, reload: async () => {}, ...over,
});
const approve = (tree: unknown) => find(tree, (el) => el.type === "button" && textOf(el) === "Approve and start matching");
const note = (tree: unknown, text: string) => find(tree, (el) => el.type === "p" && textOf(el) === text);
const clientRow = (tree: unknown) => find(tree, (el) => el.type === SpecClient);

beforeEach(() => {
  net.may = true;
  net.mayClient = true;
  net.client = null;
  net.spec = ready();
  net.saves.length = 0;
  net.toasts.length = 0;
});

describe("the client row in the Requirements dialog", () => {
  it("sits above the requirements themselves, in the spec's own dialog", () => {
    const { tree } = mount(RoleSpecPanel, { campaignId: "camp1" });
    const row = clientRow(tree)!;
    expect(row.props.campaignId).toBe("camp1");
    const order: unknown[] = [];
    walk(tree, (el) => { if (el.type === SpecClient || el.type === SpecEditor) order.push(el.type); });
    expect(order).toEqual([SpecClient, SpecEditor]);
  });

  it("is there while the requirements are still being drafted, and when there are none yet, for the people who may and the people who may not", () => {
    net.spec = ready({ latest: null, drafting: true });
    expect(clientRow(mount(RoleSpecPanel, { campaignId: "camp1" }).tree)).toBeDefined();
    net.spec = ready({ latest: null });
    expect(clientRow(mount(RoleSpecPanel, { campaignId: "camp1" }).tree)).toBeDefined();
    net.may = false;
    expect(clientRow(mount(RoleSpecPanel, { campaignId: "camp1" }).tree)).toBeDefined();
    net.may = true;
    // Not while the dialog is still loading.
    net.spec = ready({ ready: false });
    expect(clientRow(mount(RoleSpecPanel, { campaignId: "camp1" }).tree)).toBeUndefined();
  });
});

describe("who the role is for", () => {
  it("is a picker for a person who may set it: asking while there is none, and marked", () => {
    const { tree } = mount(SpecClient, { campaignId: "camp1", onSaving: () => {} });
    expect(textOf(find(tree, (el) => el.type === "span"))).toBe("Client");
    const picker = find(tree, (el) => el.type === ClientPicker)!;
    expect(picker.props).toMatchObject({ value: "", valueName: "", invalid: true, busy: false, hint: "Choose one, or add a new client." });
  });

  it("shows the client it has, in the picker, not marked", () => {
    net.client = { id: "cl1", name: "Acme Fintech" };
    const picker = find(mount(SpecClient, { campaignId: "camp1", onSaving: () => {} }).tree, (el) => el.type === ClientPicker)!;
    expect(picker.props).toMatchObject({ value: "cl1", valueName: "Acme Fintech", invalid: false });
  });

  it("is plain text for a person who may not set it, and says so when there is none yet", () => {
    net.mayClient = false;
    net.client = { id: "cl1", name: "Acme Fintech" };
    const named = mount(SpecClient, { campaignId: "camp1", onSaving: () => {} }).tree;
    expect(find(named, (el) => el.type === ClientPicker)).toBeUndefined();
    expect(textOf(find(named, (el) => el.type === "p"))).toBe("Acme Fintech");
    net.client = null;
    const none = mount(SpecClient, { campaignId: "camp1", onSaving: () => {} }).tree;
    expect(textOf(find(none, (el) => el.type === "p"))).toBe("Not added yet");
  });

  it("saves the pick the picker hands on, holds the picker while it goes, and says so once the server has said yes", async () => {
    const saving: boolean[] = [];
    const m = mount(SpecClient, { campaignId: "camp1", onSaving: (s: boolean) => saving.push(s) });
    find(m.tree, (el) => el.type === ClientPicker)!.props.onPick("cl2");
    expect(net.saves).toHaveLength(1);
    expect(net.saves[0]).toMatchObject({ kind: "id", campaignId: "camp1", value: "cl2" });
    expect(find(m.tree, (el) => el.type === ClientPicker)!.props.busy).toBe(true);
    expect(saving).toEqual([true]);
    // Nothing is said until the server has agreed.
    expect(net.toasts).toEqual([]);
    net.saves[0]!.answer(true);
    await settle();
    expect(find(m.tree, (el) => el.type === ClientPicker)!.props.busy).toBe(false);
    expect(saving).toEqual([true, false]);
    expect(net.toasts).toEqual(["Orbit Labs is now the client"]);
  });

  it("says nothing when the server turns the client down: the store has put it back and said why", async () => {
    const saving: boolean[] = [];
    const m = mount(SpecClient, { campaignId: "camp1", onSaving: (s: boolean) => saving.push(s) });
    find(m.tree, (el) => el.type === ClientPicker)!.props.onPick("cl1");
    net.saves[0]!.answer(false);
    await settle();
    expect(net.toasts).toEqual([]);
    expect(saving).toEqual([true, false]);
    expect(find(m.tree, (el) => el.type === ClientPicker)!.props.busy).toBe(false);
  });

  it("adds a company that is not a client by its name, for anyone who may set the client, and says so by that name", async () => {
    const m = mount(SpecClient, { campaignId: "camp1", onSaving: () => {} });
    find(m.tree, (el) => el.type === ClientPicker)!.props.onAddByName("Zorblax Studios");
    expect(net.saves[0]).toMatchObject({ kind: "name", campaignId: "camp1", value: "Zorblax Studios" });
    net.saves[0]!.answer(true);
    await settle();
    expect(net.toasts).toEqual(["Zorblax Studios is now the client"]);
  });
});

describe("approving the requirements", () => {
  it("waits for a client: the button is off, and a short note says why", () => {
    const { tree } = mount(RoleSpecPanel, { campaignId: "camp1" });
    expect(approve(tree)?.props.disabled).toBe(true);
    expect(note(tree, CLIENT_FIRST)).toBeDefined();
    expect(CLIENT_FIRST).toBe("Pick the client this role is for first.");
  });

  it("is open once the campaign has a client, with no note", () => {
    net.client = { id: "cl1", name: "Acme Fintech" };
    const { tree } = mount(RoleSpecPanel, { campaignId: "camp1" });
    expect(approve(tree)?.props.disabled).toBe(false);
    expect(note(tree, CLIENT_FIRST)).toBeUndefined();
  });

  it("holds while the client is being saved, so nothing is approved over one the server may turn down", () => {
    net.client = { id: "cl1", name: "Acme Fintech" };
    const m = mount(RoleSpecPanel, { campaignId: "camp1" });
    clientRow(m.tree)!.props.onSaving(true);
    expect(approve(m.tree)?.props.disabled).toBe(true);
    // The client is there, so the note is not.
    expect(note(m.tree, CLIENT_FIRST)).toBeUndefined();
    clientRow(m.tree)!.props.onSaving(false);
    expect(approve(m.tree)?.props.disabled).toBe(false);
  });

  it("has no note, and no button, for a person who may not change the campaign, and none once it is approved", () => {
    net.may = false;
    const follower = mount(RoleSpecPanel, { campaignId: "camp1" }).tree;
    expect(approve(follower)).toBeUndefined();
    expect(note(follower, CLIENT_FIRST)).toBeUndefined();
    net.may = true;
    net.spec = ready({ approved: row() });
    const done = mount(RoleSpecPanel, { campaignId: "camp1" }).tree;
    expect(approve(done)).toBeUndefined();
    expect(note(done, CLIENT_FIRST)).toBeUndefined();
  });

  it("does not hold back saving a change to the requirements: only the approval needs the client", () => {
    const m = mount(RoleSpecPanel, { campaignId: "camp1" });
    const editor = find(m.tree, (el) => el.type === SpecEditor)!;
    editor.props.onChange({ ...SPEC, title: "Staff Backend Engineer" });
    const save = find(m.tree, (el) => el.type === "button" && textOf(el) === "Save changes");
    expect(save?.props.disabled).toBe(false);
    expect(approve(m.tree)).toBeUndefined();
    expect(note(m.tree, CLIENT_FIRST)).toBeUndefined();
    expect(all(m.tree, (el) => el.type === "button").length).toBeGreaterThan(0);
  });
});

describe("who may set or change a campaign's client", () => {
  const admin: Session = { role: "admin", name: "Asha", userId: "u-admin", standing: "admin" };
  const recruiter: Session = { role: "recruiter", name: "Riya", userId: "u-riya", standing: "recruiter" };
  const owner: Session = { role: "recruiter", name: "Dev", userId: "u-dev", standing: "recruiter" };
  const campaign = (over: Partial<Assignable> = {}): Assignable => ({ id: "c1", owner: "Dev", team: ["Dev", "Riya"], ownerId: "u-dev", teamIds: ["u-dev", "u-riya"], canManage: true, ...over });

  it("is anyone who may change the campaign, while it has no client", () => {
    expect(mayChangeCampaignClient(recruiter, campaign(), false)).toBe(true);
    expect(mayChangeCampaignClient(owner, campaign(), false)).toBe(true);
    expect(mayChangeCampaignClient(admin, campaign(), false)).toBe(true);
  });

  it("is only an admin or the campaign's owner once it has one, as the server holds", () => {
    expect(mayChangeCampaignClient(recruiter, campaign(), true)).toBe(false);
    expect(mayChangeCampaignClient(owner, campaign(), true)).toBe(true);
    expect(mayChangeCampaignClient(admin, campaign(), true)).toBe(true);
  });

  it("is nobody who may not change the campaign at all, client or no client", () => {
    expect(mayChangeCampaignClient(recruiter, campaign({ canManage: false }), false)).toBe(false);
    expect(mayChangeCampaignClient(admin, campaign({ canManage: false }), false)).toBe(false);
    expect(mayChangeCampaignClient(admin, campaign({ canManage: false }), true)).toBe(false);
  });
});
