import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADD_CLIENT, ClientNameAdd, ClientPicker, addedAs, clientChoices } from "../ClientPicker";

/**
 * The client picker: a select of the clients the person can see, "Add a new client…", and a one-field add for a company
 * that is not there. A campaign always has a client, so nowhere in it is there a choice of none. The console has no DOM
 * to mount a component in, so below is a tiny hook runtime (the one jobDescriptionPanel.test.ts uses): enough to render
 * a component, call the handlers it hands its children, and see what it draws next.
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

type Listed = { id: string; name: string; status?: "active" | "prospect" | "inactive" };
const store = vi.hoisted(() => ({ clients: [] as Array<{ id: string; name: string; status?: string }> }));

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useState: rt.useState, useEffect: rt.useEffect, useRef: rt.useRef, useId: rt.useId,
}));
vi.mock("../campaignStore", () => ({ useClients: () => ({ clients: store.clients, clientOf: {} }) }));

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
  };
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
const options = (tree: unknown) => all(tree, (el) => el.type === "option").map((o) => ({ value: o.props.value as string, label: textOf(o), disabled: o.props.disabled === true }));
const select = (tree: unknown) => find(tree, (el) => el.type === "select")!;
const change = (el: El, value: string) => el.props.onChange({ target: { value } });
const press = (key: string) => ({ key, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), stopPropagation: vi.fn() });
/** The markup of a component under the fake hooks, each render starting from nothing. */
const html = (node: JSX.Element) => { rt.slots = []; rt.at = 0; rt.effects = []; return renderToStaticMarkup(node); };

const ACME: Listed = { id: "cl1", name: "Acme Fintech", status: "active" };
const ORBIT: Listed = { id: "cl2", name: "Orbit Labs", status: "prospect" };
const OLD: Listed = { id: "cl3", name: "Old Co", status: "inactive" };

const props = (over: Partial<Parameters<typeof ClientPicker>[0]> = {}): Parameters<typeof ClientPicker>[0] => ({
  value: "", onPick: () => {}, onAddByName: () => {}, ...over,
});

beforeEach(() => { store.clients = [ORBIT, OLD, ACME]; });

describe("the choices", () => {
  it("are the active clients, then the prospects named as such, each by name, with one gone quiet left out", () => {
    expect(clientChoices([ORBIT, OLD, { id: "cl4", name: "Aster Pay", status: "active" }, ACME])).toEqual([
      { id: "cl1", label: "Acme Fintech" }, { id: "cl4", label: "Aster Pay" }, { id: "cl2", label: "Orbit Labs (prospect)" },
    ]);
  });

  it("keep a client that has gone quiet when it is the one picked", () => {
    expect(clientChoices([ACME, OLD], "cl3").map((c) => c.id)).toEqual(["cl1", "cl3"]);
    expect(clientChoices([ACME, OLD]).map((c) => c.id)).toEqual(["cl1"]);
  });

  it("show a company just named for the campaign by the name it was given, until it is in the list", () => {
    expect(clientChoices([ACME], "named:Orbit", "Orbit")).toEqual([{ id: "named:Orbit", label: "Orbit" }, { id: "cl1", label: "Acme Fintech" }]);
    // Once it is in the list it is listed once, as itself.
    expect(clientChoices([ACME], "cl1", "Acme Fintech")).toEqual([{ id: "cl1", label: "Acme Fintech" }]);
  });
});

describe("a typed company name", () => {
  it("is a client already listed when it is the same company, however it is written", () => {
    expect(addedAs("acme fintech", store.clients)).toEqual({ kind: "pick", id: "cl1" });
    expect(addedAs("  Acme   Fintech Pvt Ltd ", store.clients)).toEqual({ kind: "pick", id: "cl1" });
  });

  it("is a name for the server to add otherwise, trimmed and with its spaces closed up", () => {
    expect(addedAs("  Zorblax   Studios ", store.clients)).toEqual({ kind: "name", name: "Zorblax Studios" });
  });

  it("is turned back, in plain words, when it is too short to be a name or too long to keep", () => {
    expect(addedAs("", store.clients)).toEqual({ kind: "problem", text: "Add the company's name." });
    expect(addedAs(" a ", store.clients)).toEqual({ kind: "problem", text: "Add the company's name." });
    expect(addedAs("x".repeat(121), store.clients)).toEqual({ kind: "problem", text: "Keep the name under 120 letters." });
    expect(addedAs("x".repeat(120), store.clients).kind).toBe("name");
  });
});

describe("the select", () => {
  it("asks the person to choose while nothing is picked, and has no choice of no client anywhere", () => {
    const { tree } = mount(ClientPicker, props());
    const opts = options(tree);
    expect(opts[0]).toEqual({ value: "", label: "Choose a client", disabled: true });
    expect(opts.map((o) => o.value)).toEqual(["", "cl1", "cl2", ADD_CLIENT]);
    expect(opts.map((o) => o.label)).toEqual(["Choose a client", "Acme Fintech", "Orbit Labs (prospect)", "Add a new client…"]);
    expect(opts.map((o) => o.label).join(" ")).not.toMatch(/no client|none|internal/i);
    expect(select(tree).props.value).toBe("");
  });

  it("shows the client picked, without asking", () => {
    const { tree } = mount(ClientPicker, props({ value: "cl1" }));
    expect(select(tree).props.value).toBe("cl1");
    expect(options(tree).map((o) => o.value)).toEqual(["cl1", "cl2", ADD_CLIENT]);
  });

  it("asks rather than show some other client when the value is not in the list", () => {
    const { tree } = mount(ClientPicker, props({ value: "gone" }));
    expect(select(tree).props.value).toBe("");
    expect(options(tree)[0]?.label).toBe("Choose a client");
  });

  it("is marked, and says what to do, only when it is invalid and has a hint to say", () => {
    const plain = mount(ClientPicker, props()).tree;
    expect(select(plain).props["aria-invalid"]).toBeUndefined();
    expect(find(plain, (el) => el.type === "small")).toBeUndefined();
    // A hint with nothing wrong is not shown.
    const fine = mount(ClientPicker, props({ hint: "Choose one, or add a new client." })).tree;
    expect(find(fine, (el) => el.type === "small")).toBeUndefined();
    expect(select(fine).props["aria-describedby"]).toBeUndefined();

    const marked = mount(ClientPicker, props({ invalid: true, hint: "Choose one, or add a new client." })).tree;
    expect(select(marked).props["aria-invalid"]).toBe(true);
    const hint = find(marked, (el) => el.type === "small")!;
    expect(textOf(hint)).toBe("Choose one, or add a new client.");
    // The select is described by it.
    expect(select(marked).props["aria-describedby"]).toBe(hint.props.id);

    // Marked without a hint: nothing to say.
    const bare = mount(ClientPicker, props({ invalid: true })).tree;
    expect(find(bare, (el) => el.type === "small")).toBeUndefined();
    expect(select(bare).props["aria-describedby"]).toBeUndefined();
  });

  it("waits while a save is under way, with the loader beside it, and when it is disabled", () => {
    const busy = mount(ClientPicker, props({ value: "cl1", busy: true })).tree;
    expect(select(busy).props.disabled).toBe(true);
    expect(select(busy).props["aria-busy"]).toBe(true);
    expect(html(<ClientPicker {...props({ value: "cl1", busy: true })} />)).toContain("Saving the client");
    const off = mount(ClientPicker, props({ disabled: true })).tree;
    expect(select(off).props.disabled).toBe(true);
    expect(select(off).props["aria-busy"]).toBeUndefined();
    const free = mount(ClientPicker, props()).tree;
    expect(select(free).props.disabled).toBe(false);
  });

  it("tells nobody which client it lands on while the person arrows through the list: a closed select changes on every arrow key", () => {
    const picked: string[] = [];
    const m = mount(ClientPicker, props({ onPick: (id) => picked.push(id) }));
    change(select(m.tree), "cl1");
    change(select(m.tree), "cl2");
    change(select(m.tree), "");
    expect(picked).toEqual([]);
    // The select shows where the person got to, and Save is there to keep it.
    expect(select(m.tree).props.value).toBe("cl2");
    expect(all(m.tree, (el) => el.type === "button").map(textOf)).toEqual(["Save"]);
  });

  it("tells which client was picked, once, when Save is pressed", () => {
    const picked: string[] = [];
    const m = mount(ClientPicker, props({ onPick: (id) => picked.push(id) }));
    change(select(m.tree), "cl1");
    change(select(m.tree), "cl2");
    const save = find(m.tree, (el) => el.type === "button")!;
    expect(save.props.type).toBe("button");
    save.props.onClick();
    expect(picked).toEqual(["cl2"]);
  });

  it("has no Save until a client other than the saved one is chosen", () => {
    const none = mount(ClientPicker, props({ value: "cl1" }));
    expect(find(none.tree, (el) => el.type === "button")).toBeUndefined();
    change(select(none.tree), "cl2");
    expect(find(none.tree, (el) => el.type === "button")).toBeDefined();
    // Back on the saved one: nothing to save.
    change(select(none.tree), "cl1");
    expect(find(none.tree, (el) => el.type === "button")).toBeUndefined();
    expect(find(mount(ClientPicker, props()).tree, (el) => el.type === "button")).toBeUndefined();
  });

  it("holds Save out of the way while the choice is being saved, and brings it back, with the choice, if the save was refused", () => {
    const m = mount(ClientPicker, props());
    change(select(m.tree), "cl2");
    m.set(props({ busy: true }));
    expect(find(m.tree, (el) => el.type === "button")).toBeUndefined();
    expect(select(m.tree).props.value).toBe("cl2");
    m.set(props({ busy: false }));
    expect(select(m.tree).props.value).toBe("cl2");
    expect(all(m.tree, (el) => el.type === "button").map(textOf)).toEqual(["Save"]);
  });

  it("drops a choice that was not saved once the saved client has changed under it", () => {
    const m = mount(ClientPicker, props());
    change(select(m.tree), "cl2");
    m.set(props({ value: "cl1" }));
    expect(select(m.tree).props.value).toBe("cl1");
    expect(find(m.tree, (el) => el.type === "button")).toBeUndefined();
  });

  it("does not take a keystroke on the empty choice for a client", () => {
    const picked: string[] = [];
    const m = mount(ClientPicker, props({ onPick: (id) => picked.push(id) }));
    change(select(m.tree), "");
    expect(find(m.tree, (el) => el.type === "button")).toBeUndefined();
    expect(picked).toEqual([]);
  });

  it("is a native select with a name, so the keyboard and a screen reader work as they do everywhere", () => {
    const markup = html(<ClientPicker {...props({ label: "Client for Backend Engineer" })} />);
    expect(markup).toMatch(/<select[^>]*aria-label="Client for Backend Engineer"/);
    expect(html(<ClientPicker {...props()} />)).toMatch(/<select[^>]*aria-label="Client"/);
    expect(html(<ClientPicker {...props({ autoFocus: true })} />)).toMatch(/<select[^>]*autoFocus|<select[^>]*autofocus/i);
    expect(html(<ClientPicker {...props()} />)).not.toMatch(/autofocus/i);
  });
});

describe("adding by name", () => {
  it("opens the one-field add on 'Add a new client…', picking nothing, and Cancel goes back to the select", () => {
    const picked: string[] = [];
    const named: string[] = [];
    const m = mount(ClientPicker, props({ onPick: (id) => picked.push(id), onAddByName: (n) => named.push(n) }));
    change(select(m.tree), ADD_CLIENT);
    const add = find(m.tree, (el) => el.type === ClientNameAdd)!;
    expect(add).toBeDefined();
    expect(find(m.tree, (el) => el.type === "select")).toBeUndefined();
    add.props.onCancel();
    expect(find(m.tree, (el) => el.type === "select")).toBeDefined();
    expect(find(m.tree, (el) => el.type === ClientNameAdd)).toBeUndefined();
    expect(picked).toEqual([]);
    expect(named).toEqual([]);
  });

  it("hands a company that is not listed on by its name, and goes back to the select", () => {
    const picked: string[] = [];
    const named: string[] = [];
    const m = mount(ClientPicker, props({ onPick: (id) => picked.push(id), onAddByName: (n) => named.push(n) }));
    change(select(m.tree), ADD_CLIENT);
    find(m.tree, (el) => el.type === ClientNameAdd)!.props.onDone({ kind: "name", name: "Zorblax Studios" });
    expect(named).toEqual(["Zorblax Studios"]);
    expect(picked).toEqual([]);
    expect(find(m.tree, (el) => el.type === "select")).toBeDefined();
  });

  it("picks the listed client instead when the name is one of them", () => {
    const picked: string[] = [];
    const named: string[] = [];
    const m = mount(ClientPicker, props({ onPick: (id) => picked.push(id), onAddByName: (n) => named.push(n) }));
    change(select(m.tree), ADD_CLIENT);
    find(m.tree, (el) => el.type === ClientNameAdd)!.props.onDone({ kind: "pick", id: "cl1" });
    expect(picked).toEqual(["cl1"]);
    expect(named).toEqual([]);
  });
});

describe("the one-field add", () => {
  const addProps = (over: Partial<Parameters<typeof ClientNameAdd>[0]> = {}): Parameters<typeof ClientNameAdd>[0] => ({
    clients: store.clients, onDone: () => {}, onCancel: () => {}, ...over,
  });
  const typeInto = (tree: unknown, text: string) => find(tree, (el) => el.type === "input")!.props.onChange({ target: { value: text } });

  it("asks for the company's name, with Add and Cancel", () => {
    const { tree } = mount(ClientNameAdd, addProps());
    expect(textOf(find(tree, (el) => el.type === "label"))).toBe("Company name");
    const input = find(tree, (el) => el.type === "input")!;
    expect(input.props.placeholder).toBe("e.g. Acme Fintech");
    expect(input.props.maxLength).toBe(120);
    expect(input.props.autoFocus).toBe(true);
    // The label belongs to the field.
    expect(find(tree, (el) => el.type === "label")!.props.htmlFor).toBe(input.props.id);
    expect(all(tree, (el) => el.type === "button").map(textOf)).toEqual(["Cancel", "Add"]);
  });

  it("says what is wrong and sends nothing for a name too short, then clears the line as soon as it is typed over", () => {
    const done = vi.fn();
    const m = mount(ClientNameAdd, addProps({ onDone: done }));
    typeInto(m.tree, "a");
    find(m.tree, (el) => el.type === "button" && textOf(el) === "Add")!.props.onClick();
    expect(done).not.toHaveBeenCalled();
    const problem = find(m.tree, (el) => el.type === "small")!;
    expect(textOf(problem)).toBe("Add the company's name.");
    expect(problem.props.role).toBe("alert");
    expect(find(m.tree, (el) => el.type === "input")!.props["aria-invalid"]).toBe(true);
    typeInto(m.tree, "ab");
    expect(find(m.tree, (el) => el.type === "small")).toBeUndefined();
  });

  it("adds the name typed on Add, and on Enter, without letting a form around it submit", () => {
    const done = vi.fn();
    const m = mount(ClientNameAdd, addProps({ onDone: done }));
    typeInto(m.tree, "  Zorblax Studios ");
    find(m.tree, (el) => el.type === "button" && textOf(el) === "Add")!.props.onClick();
    expect(done).toHaveBeenLastCalledWith({ kind: "name", name: "Zorblax Studios" });

    const enter = press("Enter");
    find(m.tree, (el) => el.type === "input")!.props.onKeyDown(enter);
    expect(done).toHaveBeenCalledTimes(2);
    expect(enter.preventDefault).toHaveBeenCalled();
    // A key in the middle of composing a character is not Enter.
    const composing = { ...press("Enter"), nativeEvent: { isComposing: true } };
    find(m.tree, (el) => el.type === "input")!.props.onKeyDown(composing);
    expect(done).toHaveBeenCalledTimes(2);
  });

  it("is not a form of its own, since the new campaign form it is drawn in would be submitted by Enter", () => {
    const { tree } = mount(ClientNameAdd, addProps());
    expect(find(tree, (el) => el.type === "form")).toBeUndefined();
    expect(all(tree, (el) => el.type === "button").every((b) => b.props.type === "button")).toBe(true);
  });

  it("cancels on Escape and does not pass it on, so the dialog around it stays open", () => {
    const cancel = vi.fn();
    const { tree } = mount(ClientNameAdd, addProps({ onCancel: cancel }));
    const esc = press("Escape");
    find(tree, (el) => el.type === "input")!.props.onKeyDown(esc);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(esc.stopPropagation).toHaveBeenCalled();
    const other = press("a");
    find(tree, (el) => el.type === "input")!.props.onKeyDown(other);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(other.stopPropagation).not.toHaveBeenCalled();
  });

  it("holds both buttons and the field while it is saving, and shows the loader in Add", () => {
    const done = vi.fn();
    const { tree } = mount(ClientNameAdd, addProps({ busy: true, onDone: done }));
    expect(find(tree, (el) => el.type === "input")!.props.disabled).toBe(true);
    const buttons = all(tree, (el) => el.type === "button");
    expect(buttons.map((b) => b.props.disabled)).toEqual([true, true]);
    expect(buttons[1]!.props["aria-busy"]).toBe(true);
    expect(textOf(buttons[1])).toBe("Adding");
    expect(html(<ClientNameAdd {...addProps({ busy: true })} />)).toContain('class="ldr is-sm is-inherit"');
    // Pressing it again while it is saving sends nothing, even with a name in the field.
    const m = mount(ClientNameAdd, addProps({ onDone: done }));
    typeInto(m.tree, "Zorblax Studios");
    m.set(addProps({ onDone: done, busy: true }));
    find(m.tree, (el) => el.type === "input")!.props.onKeyDown(press("Enter"));
    find(m.tree, (el) => el.type === "button" && textOf(el) === "Adding")!.props.onClick();
    expect(done).not.toHaveBeenCalled();
  });
});
