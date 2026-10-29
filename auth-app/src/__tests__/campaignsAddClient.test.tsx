import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddClient, Row } from "../CampaignsPage";
import { ClientPicker } from "../ClientPicker";
import { withClientName } from "../campaignMeta";
import type { CampaignRow } from "../campaignsData";

/**
 * A campaign with no client says so on the Campaigns list: a quiet "Add client" where the client's name would be, for
 * the people who may set it, which opens the client picker in a small popover. Once a client is picked, or a company
 * named, the row shows its name. The console has no DOM to mount a component in, so below is a tiny hook runtime (the
 * one jobDescriptionPanel.test.ts uses, with useCallback).
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
    useCallback: (fn: unknown): unknown => { r.at++; return fn; },
  };
  return r;
});

const net = vi.hoisted(() => ({
  saves: [] as Array<{ kind: "id" | "name"; campaignId: string; value: string; answer: (ok: boolean) => void }>,
  toasts: [] as string[],
}));

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useState: rt.useState, useRef: rt.useRef, useCallback: rt.useCallback,
}));
vi.mock("../Contacts", async (orig) => ({ ...(await orig<typeof import("../Contacts")>()), useToast: () => (said: string) => { net.toasts.push(said); } }));
vi.mock("../campaignStore", async (orig) => ({
  ...(await orig<typeof import("../campaignStore")>()),
  clientById: (id: string) => ({ cl2: { id: "cl2", name: "Orbit Labs" } })[id],
  setCampaignClient: (campaignId: string, value: string) => new Promise<boolean>((answer) => { net.saves.push({ kind: "id", campaignId, value, answer }); }),
  setCampaignClientByName: (campaignId: string, value: string) => new Promise<boolean>((answer) => { net.saves.push({ kind: "name", campaignId, value, answer }); }),
}));

type El = { type: unknown; props: Record<string, any> };

function mount<P, R>(component: (props: P) => R, first: P) {
  const props = first;
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
  return { get tree() { return tree as R; } };
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
const textOf = (node: unknown): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node && typeof node === "object" && "props" in node ? textOf((node as El).props?.children) : "";
};
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };

const button = (tree: unknown) => find(tree, (el) => el.type === "button")!;
const popover = (tree: unknown) => find(tree, (el) => typeof el.type === "function" && "anchor" in el.props)!;

beforeEach(() => { net.saves.length = 0; net.toasts.length = 0; });

describe("Add client, on a campaign with no client", () => {
  it("is a quiet text button that says what it adds and for which campaign, with the popover shut", () => {
    const { tree } = mount(AddClient, { campaignId: "camp1", name: "Backend Engineer" });
    const b = button(tree);
    expect(textOf(b)).toBe("Add client");
    expect(b.props.className).toBe("cg-client-add");
    expect(b.props["aria-label"]).toBe("Add the client for Backend Engineer");
    expect(b.props["aria-expanded"]).toBe(false);
    expect(b.props.type).toBe("button");
    expect(popover(tree).props.open).toBe(false);
  });

  it("opens the client picker in a small popover, asking, with the select in focus", () => {
    const m = mount(AddClient, { campaignId: "camp1", name: "Backend Engineer" });
    button(m.tree).props.onClick();
    expect(button(m.tree).props["aria-expanded"]).toBe(true);
    expect(popover(m.tree).props.open).toBe(true);
    expect(popover(m.tree).props.width).toBe(280);
    const picker = find(m.tree, (el) => el.type === ClientPicker)!;
    expect(picker.props).toMatchObject({ value: "", autoFocus: true, busy: false, label: "Client for Backend Engineer" });
    // It is not marked: the row says it is missing, and the person came here to fix it.
    expect(picker.props.invalid).toBeUndefined();
  });

  it("does not let a click in the popover reach the row, which would open the campaign", () => {
    const m = mount(AddClient, { campaignId: "camp1", name: "Backend Engineer" });
    button(m.tree).props.onClick();
    const inside = find(m.tree, (el) => el.type === "div" && el.props.className === "cg-client-pop")!;
    const click = { stopPropagation: vi.fn() };
    inside.props.onClick(click);
    expect(click.stopPropagation).toHaveBeenCalled();
  });

  it("sets the client picked, and closes with the name said once the server has agreed", async () => {
    const m = mount(AddClient, { campaignId: "camp1", name: "Backend Engineer" });
    button(m.tree).props.onClick();
    find(m.tree, (el) => el.type === ClientPicker)!.props.onPick("cl2");
    expect(net.saves).toHaveLength(1);
    expect(net.saves[0]).toMatchObject({ kind: "id", campaignId: "camp1", value: "cl2" });
    expect(find(m.tree, (el) => el.type === ClientPicker)!.props.busy).toBe(true);
    expect(net.toasts).toEqual([]);
    net.saves[0]!.answer(true);
    await settle();
    expect(popover(m.tree).props.open).toBe(false);
    expect(net.toasts).toEqual(["Orbit Labs is now the client"]);
  });

  it("names a company that is not a client by its name, and says it by that name", async () => {
    const m = mount(AddClient, { campaignId: "camp1", name: "Backend Engineer" });
    button(m.tree).props.onClick();
    find(m.tree, (el) => el.type === ClientPicker)!.props.onAddByName("Zorblax Studios");
    expect(net.saves[0]).toMatchObject({ kind: "name", campaignId: "camp1", value: "Zorblax Studios" });
    net.saves[0]!.answer(true);
    await settle();
    expect(popover(m.tree).props.open).toBe(false);
    expect(net.toasts).toEqual(["Zorblax Studios is now the client"]);
  });

  it("stays open and says nothing when the server turns the client down (the store has put the row back and said why)", async () => {
    const m = mount(AddClient, { campaignId: "camp1", name: "Backend Engineer" });
    button(m.tree).props.onClick();
    find(m.tree, (el) => el.type === ClientPicker)!.props.onPick("cl2");
    net.saves[0]!.answer(false);
    await settle();
    expect(popover(m.tree).props.open).toBe(true);
    expect(find(m.tree, (el) => el.type === ClientPicker)!.props.busy).toBe(false);
    expect(net.toasts).toEqual([]);
  });
});

describe("the name beside a campaign's", () => {
  const row = (over: Partial<CampaignRow> = {}): CampaignRow => ({
    id: "c1", name: "Backend Engineer", department: "", location: "", status: "active", owner: "Asha", team: ["Asha"],
    funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 }, trend: [], target: 1, agents: [],
    updatedAgo: "now", createdAgo: "now", ...over,
  });
  const clients = [{ id: "cl1", name: "Acme Fintech" }];

  it("is the one the server gave, when the row has it", () => {
    const r = row({ client: "Winspire" });
    expect(withClientName(r, clients, { c1: "cl1" })).toBe(r);
  });

  it("is the client's from the clients when the row does not carry one (a demo campaign, or one being made), so it is not offered a client to add", () => {
    expect(withClientName(row(), clients, { c1: "cl1" }).client).toBe("Acme Fintech");
  });

  it("is the company named for a campaign still being made", () => {
    const making = row({ setup: { newClient: "Orbit Labs" } });
    expect(withClientName(making, clients, {}).client).toBe("Orbit Labs");
  });

  it("is nothing for a campaign with no client, which is then the one that is offered Add client", () => {
    const r = row();
    expect(withClientName(r, clients, {})).toBe(r);
    expect(withClientName(r, clients, { c1: "unknown-client" }).client).toBeUndefined();
  });
});

describe("the row of a campaign with no client", () => {
  const campaign = (over: Partial<CampaignRow> = {}): CampaignRow => ({
    id: "c1", name: "Backend Engineer", department: "", location: "", status: "active", owner: "Asha", team: ["Asha"],
    funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 }, trend: [], target: 1, agents: [],
    updatedAgo: "now", createdAgo: "now", ...over,
  });
  const drawn = (r: CampaignRow, mayClient = true) => Row({
    r, fresh: false, admin: true, mayClose: true, mayAssign: true, mayClient,
    onOpen: () => {}, onArchive: () => {}, onUnarchive: () => {}, onDelete: () => {}, onAssign: () => {}, onClose: () => {}, onReopen: () => {}, onDuplicate: () => {},
  });
  const offered = (r: CampaignRow, mayClient = true) => find(drawn(r, mayClient), (el) => el.type === AddClient) !== undefined;

  it("offers Add client, to a person who may set it", () => {
    expect(offered(campaign())).toBe(true);
    expect(offered(campaign(), false)).toBe(false);
  });

  it("does not offer Add client on an archived campaign, which the store has no way to save a client on (it would do nothing and say nothing)", () => {
    expect(offered(campaign({ archived: true, status: "closed" }))).toBe(false);
  });

  it("does not offer it on a campaign that has a client, or one still being made", () => {
    expect(offered(campaign({ client: "Winspire" }))).toBe(false);
    expect(offered(campaign({ loading: true }))).toBe(false);
  });
});

describe("where it sits in the row", () => {
  const page = readFileSync(resolve(__dirname, "..", "CampaignsPage.tsx"), "utf8");
  const css = readFileSync(resolve(__dirname, "..", "campaigns-page.css"), "utf8");

  it("is drawn right after the client's name, only for a campaign that has none, that is not still being made or put away, to the people who may set it", () => {
    expect(page).toContain("{!r.client && mayClient && !r.loading && !r.archived && <AddClient campaignId={r.id}");
    expect(page.indexOf("<AddClient campaignId={r.id}")).toBeGreaterThan(page.indexOf('className="cg-client"'));
    expect(page.indexOf("<AddClient campaignId={r.id}")).toBeLessThan(page.indexOf('className="cg-meta"'));
    // The same rule the server holds, for a campaign that has no client yet.
    expect(page).toContain("mayClient={mayChangeCampaignClient(session, r, !!r.client)}");
    // A row's own names are resolved first, in the list and in the Archived tab, so a campaign that has a client is never offered one.
    expect(page.match(/withClientName\(r, clients, clientOf\)/g)).toHaveLength(2);
  });

  it("is a quiet text button, not a pill or a filled one, in the row's own small type", () => {
    const rule = css.match(/\.cg-client-add \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/background: none/);
    expect(rule).toMatch(/border: 0/);
    expect(rule).toMatch(/font: 400 13px\/1\.3 var\(--ui\)/);
    expect(rule).toMatch(/color: var\(--ink-3\)/);
    expect(rule).not.toMatch(/border-radius|box-shadow/);
    expect(css).toMatch(/\.cg-client-add:hover \{[^}]*color: var\(--accent-text\)/);
    expect(css).toMatch(/\.cg-client-add:focus-visible \{[^}]*outline: 2px solid var\(--focus\)/);
  });
});
