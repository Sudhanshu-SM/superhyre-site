import { describe, expect, it, vi } from "vitest";
import { ChoiceCard } from "../agentCards/ChoiceCard";
import type { Question } from "../liveChat";

/**
 * The agent's question of which client a campaign is for is built from the server's data. For someone with no client to
 * choose from it is one choice, "A new client", which asks for its company name inside the card; there is no "No client".
 * The console has no DOM to mount a component in, so below is a tiny hook runtime (the one jobDescriptionPanel.test.ts
 * uses): enough to render the card, press what it draws, and see what it draws next.
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

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useState: rt.useState, useEffect: rt.useEffect, useRef: rt.useRef, useId: rt.useId,
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

/** What the server sends someone with no client to choose from. */
const ONLY_NEW: Question = {
  kind: "client", text: "Which client is this for?", runId: "r1", seq: 4,
  choices: [{ id: "new", name: "A new client", text: "The client is {value}, who isn't in Clients yet", input: { label: "Client name", placeholder: "Company name", tag: "new" } }],
};

const radio = (tree: unknown) => find(tree, (el) => el.type === "button" && el.props.role === "radio")!;
const nameField = (tree: unknown) => find(tree, (el) => el.type === "input" && el.props.type === "text");
const go = (tree: unknown) => find(tree, (el) => el.type === "button" && el.props.className === "rep-commit")!;

describe("a client question with only 'A new client'", () => {
  it("is that one choice, with Continue waiting and no name field yet, and no way out", () => {
    const { tree } = mount(ChoiceCard, { question: ONLY_NEW, onAnswer: () => {} });
    expect(all(tree, (el) => el.type === "button" && el.props.role === "radio").map(textOf)).toEqual(["A new client"]);
    expect(radio(tree).props["aria-checked"]).toBe(false);
    expect(nameField(tree)).toBeUndefined();
    expect(go(tree).props.disabled).toBe(true);
    expect(textOf(go(tree))).toBe("Continue");
    expect(all(tree, (el) => el.type === "button").map(textOf)).toEqual(["A new client", "Continue"]);
  });

  it("asks for the company's name inside the card once it is picked, and Continue waits for a name", () => {
    const m = mount(ChoiceCard, { question: ONLY_NEW, onAnswer: () => {} });
    radio(m.tree).props.onClick();
    expect(radio(m.tree).props["aria-checked"]).toBe(true);
    const field = nameField(m.tree)!;
    expect(field.props.placeholder).toBe("Company name");
    expect(field.props.maxLength).toBe(120);
    expect(field.props.autoComplete).toBe("off");
    expect(textOf(find(m.tree, (el) => el.type === "span" && el.props.className === "ch-field-l"))).toBe("Client name");
    expect(go(m.tree).props.disabled).toBe(true);
    // Spaces are not a name.
    nameField(m.tree)!.props.onChange({ target: { value: "   " } });
    expect(go(m.tree).props.disabled).toBe(true);
  });

  it("sends the choice and the name typed, trimmed, on Continue", () => {
    const sent: Array<[string[], string | undefined]> = [];
    const m = mount(ChoiceCard, { question: ONLY_NEW, onAnswer: (ids: string[], value?: string) => sent.push([ids, value]) });
    radio(m.tree).props.onClick();
    nameField(m.tree)!.props.onChange({ target: { value: "  Orbit Labs " } });
    expect(go(m.tree).props.disabled).toBe(false);
    go(m.tree).props.onClick();
    expect(sent).toEqual([[["new"], "Orbit Labs"]]);
  });

  it("sends it on Enter in the name field, once there is a name", () => {
    const sent: Array<[string[], string | undefined]> = [];
    const m = mount(ChoiceCard, { question: ONLY_NEW, onAnswer: (ids: string[], value?: string) => sent.push([ids, value]) });
    radio(m.tree).props.onClick();
    const enter = { key: "Enter", nativeEvent: { isComposing: false }, preventDefault: vi.fn() };
    nameField(m.tree)!.props.onKeyDown(enter);
    expect(sent).toEqual([]);
    nameField(m.tree)!.props.onChange({ target: { value: "Orbit Labs" } });
    nameField(m.tree)!.props.onKeyDown(enter);
    expect(sent).toEqual([[["new"], "Orbit Labs"]]);
  });

  it("holds the card while the answer is going", () => {
    const sent: unknown[] = [];
    const m = mount(ChoiceCard, { question: { ...ONLY_NEW, sending: true }, onAnswer: (...a: unknown[]) => sent.push(a) });
    expect(radio(m.tree).props.disabled).toBe(true);
    expect(go(m.tree).props.disabled).toBe(true);
    expect(textOf(go(m.tree))).toBe("Continuing");
    go(m.tree).props.onClick();
    expect(sent).toEqual([]);
  });
});
