import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientField, pickClient } from "../NewCampaign";
import { ClientNameAdd } from "../ClientPicker";
import { blankDraft, withNewClient } from "../campaignDraft";

/**
 * The client in the New campaign form. A campaign is always for a client, so there is no "No client, an internal hire":
 * the select asks until one is picked, the form says so in its own error style, an admin adds a client with all its
 * details as before, and anyone else names the company and the server adds it with the campaign. The console has no DOM
 * to mount a component in, so below is a tiny hook runtime (the one jobDescriptionPanel.test.ts uses).
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
  };
  return r;
});

const net = vi.hoisted(() => ({
  clients: [] as Array<Record<string, unknown>>,
  saved: [] as Array<Record<string, unknown>>,
}));

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), useState: rt.useState }));
vi.mock("../campaignStore", async (orig) => ({
  ...(await orig<typeof import("../campaignStore")>()),
  useClients: () => ({ clients: net.clients, clientOf: {} }),
  saveClient: (c: Record<string, unknown>) => { net.saved.push(c); return { ...c, id: "cl-made" }; },
  clientById: (id: string) => net.clients.find((c) => c.id === id),
}));

type El = { type: unknown; props: Record<string, any> };

function mount<P, R>(component: (props: P) => R, first: P) {
  let props = first;
  let tree: R | undefined;
  const pump = () => {
    if (rt.rendering) { rt.dirty = true; return; }
    rt.rendering = true;
    try {
      do {
        rt.dirty = false; rt.at = 0;
        tree = component(props);
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
const options = (tree: unknown) => all(find(tree, (el) => el.type === "select" && el.props["aria-label"] === "Client"), (el) => el.type === "option").map((o) => ({ value: o.props.value as string, label: textOf(o) }));
const clientSelect = (tree: unknown) => find(tree, (el) => el.type === "select" && el.props["aria-label"] === "Client")!;

const ACME = { id: "cl1", name: "Acme Fintech", status: "active", manager: "", email: "", phone: "", notes: "" };
const ORBIT = { id: "cl2", name: "Orbit Labs", status: "prospect", manager: "", email: "", phone: "", notes: "" };
const OLD = { id: "cl3", name: "Old Co", status: "inactive", manager: "", email: "", phone: "", notes: "" };

const draft = (over: Partial<ReturnType<typeof blankDraft>> = {}) => ({ ...blankDraft("Asha"), name: "Backend Engineer", ...over });
const props = (over: Partial<Parameters<typeof ClientField>[0]> = {}): Parameters<typeof ClientField>[0] => ({
  d: draft(), onPick: () => {}, onName: () => {}, mayAdd: false, ...over,
});

beforeEach(() => { net.clients = [ACME, ORBIT, OLD]; net.saved.length = 0; });

describe("the client select", () => {
  it("asks until a client is picked, and has no choice of no client, for an admin or anyone else", () => {
    for (const mayAdd of [true, false]) {
      const { tree } = mount(ClientField, props({ mayAdd }));
      const opts = options(tree);
      expect(opts[0]).toEqual({ value: "", label: "Choose a client" });
      expect(find(clientSelect(tree), (el) => el.type === "option" && el.props.value === "")!.props.disabled).toBe(true);
      expect(opts.map((o) => o.label)).toEqual(["Choose a client", "Acme Fintech", "Orbit Labs (prospect)", "Add a new client…"]);
      expect(opts.map((o) => o.label).join(" ")).not.toMatch(/no client|internal/i);
      expect(clientSelect(tree).props.value).toBe("");
    }
  });

  it("is drawn for someone who may not add a client even when they can see none: the field is never left out", () => {
    net.clients = [];
    const { tree } = mount(ClientField, props({ mayAdd: false }));
    expect(clientSelect(tree)).toBeDefined();
    expect(options(tree).map((o) => o.label)).toEqual(["Choose a client", "Add a new client…"]);
  });

  it("shows the client picked, and a company only named, by its name with (new) after it", () => {
    expect(clientSelect(mount(ClientField, props({ d: draft({ clientId: "cl1" }) })).tree).props.value).toBe("cl1");
    const named = mount(ClientField, props({ d: withNewClient(draft(), "Zorblax Studios") })).tree;
    expect(clientSelect(named).props.value).toBe("named");
    expect(options(named).map((o) => o.label)).toEqual(["Acme Fintech", "Orbit Labs (prospect)", "Zorblax Studios (new)", "Add a new client…"]);
  });

  it("says a client is needed in the form's own error style, until one is picked", () => {
    const plain = mount(ClientField, props()).tree as El;
    expect(plain.props.className).toBe("ncx-f");
    expect(find(plain, (el) => el.type === "small")).toBeUndefined();
    expect(clientSelect(plain).props["aria-invalid"]).toBeUndefined();

    const needed = mount(ClientField, props({ error: "Pick the client this campaign is for, or add one." })).tree as El;
    expect(needed.props.className).toBe("ncx-f is-bad");
    const line = find(needed, (el) => el.type === "small")!;
    expect(line.props.className).toBe("ncx-err");
    expect(textOf(line)).toBe("Pick the client this campaign is for, or add one.");
    expect(clientSelect(needed).props["aria-invalid"]).toBe(true);
  });

  it("tells which client was picked", () => {
    const picked: string[] = [];
    const { tree } = mount(ClientField, props({ onPick: (id) => picked.push(id) }));
    clientSelect(tree).props.onChange({ target: { value: "cl2" } });
    expect(picked).toEqual(["cl2"]);
  });
});

describe("adding a client from the form", () => {
  const open = (mayAdd: boolean, over: Partial<Parameters<typeof ClientField>[0]> = {}) => {
    const m = mount(ClientField, props({ mayAdd, ...over }));
    clientSelect(m.tree).props.onChange({ target: { value: "+" } });
    return m;
  };

  it("asks an admin for the company with all its details, as before: company, website, industry, hiring manager, email, fee", () => {
    const m = open(true);
    expect(find(m.tree, (el) => el.type === ClientNameAdd)).toBeUndefined();
    const labels = all(m.tree, (el) => el.type === "span" && el.props.className === "ncx-l").map(textOf);
    expect(labels).toEqual(["Client", "Company", "Website", "Industry", "Hiring manager", "Their email", "Fee terms"]);
    expect(all(m.tree, (el) => el.type === "button").map(textOf)).toEqual(["Cancel", "Add client"]);
  });

  it("adds the admin's client as before: it is saved at once and picked under its working id", () => {
    const picked: string[] = [];
    const m = open(true, { onPick: (id) => picked.push(id) });
    find(m.tree, (el) => el.type === "input" && el.props.placeholder === "e.g. Acme Fintech")!.props.onChange({ target: { value: "Zorblax Studios" } });
    find(m.tree, (el) => el.type === "button" && textOf(el) === "Add client")!.props.onClick();
    expect(net.saved).toHaveLength(1);
    expect(net.saved[0]).toMatchObject({ name: "Zorblax Studios", status: "active" });
    expect(picked).toEqual(["cl-made"]);
    // Back to the select.
    expect(clientSelect(m.tree)).toBeDefined();
  });

  it("asks anyone else for the company's name alone", () => {
    const m = open(false);
    expect(find(m.tree, (el) => el.type === ClientNameAdd)).toBeDefined();
    expect(all(m.tree, (el) => el.type === "span" && el.props.className === "ncx-l").map(textOf)).toEqual(["Client"]);
  });

  it("names the company for the campaign, with nothing saved to Clients (the server adds it with the campaign), and goes back to the select", () => {
    const named: string[] = [];
    const m = open(false, { onName: (n) => named.push(n) });
    find(m.tree, (el) => el.type === ClientNameAdd)!.props.onDone({ kind: "name", name: "Zorblax Studios" });
    expect(named).toEqual(["Zorblax Studios"]);
    expect(net.saved).toEqual([]);
    expect(clientSelect(m.tree)).toBeDefined();
  });

  it("picks the client instead when the name typed is one of the clients", () => {
    const picked: string[] = [];
    const named: string[] = [];
    const m = open(false, { onPick: (id) => picked.push(id), onName: (n) => named.push(n) });
    find(m.tree, (el) => el.type === ClientNameAdd)!.props.onDone({ kind: "pick", id: "cl1" });
    expect(picked).toEqual(["cl1"]);
    expect(named).toEqual([]);
  });

  it("comes back to the select on Cancel, with nothing picked or named", () => {
    const picked: string[] = [];
    const named: string[] = [];
    const m = open(false, { onPick: (id) => picked.push(id), onName: (n) => named.push(n) });
    find(m.tree, (el) => el.type === ClientNameAdd)!.props.onCancel();
    expect(clientSelect(m.tree)).toBeDefined();
    expect(picked).toEqual([]);
    expect(named).toEqual([]);
  });
});

describe("a company named for the campaign, in the draft", () => {
  it("is dropped when a client is picked instead, and the client's contact and fee come with it", () => {
    const named = withNewClient(draft(), "Zorblax Studios");
    expect(named).toMatchObject({ clientId: "", newClient: "Zorblax Studios" });
    const picked = pickClient(named, "cl1");
    // The client is read from the store as it is now: the one the mock holds.
    expect(picked).toMatchObject({ clientId: "cl1", newClient: "" });
  });
});

describe("the form's source", () => {
  const form = readFileSync(resolve(__dirname, "..", "NewCampaign.tsx"), "utf8");

  it("has no option of no client, and the client is one of the problems the form jumps to", () => {
    expect(form).not.toMatch(/No client/);
    expect(form).not.toMatch(/internal hire/i);
    expect(form).toContain('clientId: "basics"');
    expect(form).toContain("error={problems.clientId}");
  });
});
