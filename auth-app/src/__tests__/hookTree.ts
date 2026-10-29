/**
 * The console has no DOM to mount a component in, so this is a tiny hook runtime that renders a whole tree of function components, each
 * with its own state, and runs their effects (the tests that draw a card to a string never do). It is the runtime the single-component
 * tests (capturesNudge.test.ts and others) carry inline, taught to hold children: `mount` renders a root element, expands every function
 * component in it by where it sits, keeps each one's hooks between renders, runs effects child first after each pass, runs a component's
 * clean-ups when it leaves the tree, and renders again for as long as a state was changed. A host element, and anything that is not a plain
 * function (an icon), is walked for its children and left as it is. The server is in the test's hands: it mocks the calls.
 *
 * A test mocks "react" with `hooks` (a factory that imports this file, since it runs before the test's own imports):
 *   vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), ...(await import("./hookTree")).hooks }));
 * and mounts with `const { mount } = await import("./hookTree")`. This file imports nothing, so the mock can load it.
 */

type Slot = { init?: boolean; value?: unknown; ref?: { current: unknown }; deps?: readonly unknown[] | undefined; cleanup?: unknown; set?: (next: unknown) => void };
type Instance = { slots: Slot[]; at: number; effects: Array<() => void> };
type El = { type: unknown; key: string | null; props: Record<string, unknown> };

const rt = {
  insts: new Map<string, Instance>(),
  cur: null as Instance | null,
  /** Effects to run once the pass is drawn, children before the parents that hold them. */
  pending: [] as Array<() => void>,
  rendering: false,
  dirty: false,
  schedule: (): void => undefined,
  ids: 0,
};

const slot = (): Slot => {
  const inst = rt.cur;
  if (!inst) throw new Error("a hook was called outside a component that mount() is drawing");
  const i = inst.at++;
  return (inst.slots[i] ??= {});
};

const changed = (deps: readonly unknown[] | undefined, was: readonly unknown[] | undefined): boolean =>
  !deps || !was || deps.length !== was.length || deps.some((d, i) => !Object.is(d, was[i]));

function effect(fn: () => unknown, deps?: readonly unknown[]): void {
  const s = slot();
  const inst = rt.cur;
  if (!changed(deps, s.deps)) return;
  inst?.effects.push(() => {
    if (typeof s.cleanup === "function") s.cleanup();
    s.cleanup = fn();
    s.deps = deps;
  });
}

export const hooks = {
  useState(initial: unknown): [unknown, (next: unknown) => void] {
    const s = slot();
    if (!s.init) {
      s.init = true;
      s.value = typeof initial === "function" ? (initial as () => unknown)() : initial;
      s.set = (next) => {
        const v = typeof next === "function" ? (next as (cur: unknown) => unknown)(s.value) : next;
        if (Object.is(v, s.value)) return;
        s.value = v;
        rt.schedule();
      };
    }
    return [s.value, s.set as (next: unknown) => void];
  },
  useRef(initial: unknown): { current: unknown } {
    const s = slot();
    return (s.ref ??= { current: initial });
  },
  useMemo(fn: () => unknown, deps?: readonly unknown[]): unknown {
    const s = slot();
    if (!s.init || changed(deps, s.deps)) {
      s.init = true;
      s.value = fn();
      s.deps = deps;
    }
    return s.value;
  },
  useCallback(fn: unknown, deps?: readonly unknown[]): unknown {
    const s = slot();
    if (!s.init || changed(deps, s.deps)) {
      s.init = true;
      s.value = fn;
      s.deps = deps;
    }
    return s.value;
  },
  useId(): string {
    const s = slot();
    if (!s.init) {
      s.init = true;
      s.value = `:r${rt.ids++}:`;
    }
    return s.value as string;
  },
  useEffect: effect,
  useLayoutEffect: effect,
};

/** What a tree draws: a host element with its children, the function components in it already replaced by what they drew. */
export type Drawn = { type: unknown; props: Record<string, unknown> & { children?: unknown } };

function draw(node: unknown, path: string, seen: Set<string>): unknown {
  if (Array.isArray(node)) return node.map((c, i) => draw(c, `${path}/${i}`, seen));
  if (!node || typeof node !== "object" || !("props" in node)) return node;
  const el = node as El;
  if (typeof el.type === "function") {
    const id = `${path}/${el.key ?? ""}<${el.type.name}>`;
    seen.add(id);
    let inst = rt.insts.get(id);
    if (!inst) rt.insts.set(id, (inst = { slots: [], at: 0, effects: [] }));
    const outer = rt.cur;
    rt.cur = inst;
    inst.at = 0;
    inst.effects = [];
    const out = (el.type as (props: unknown) => unknown)(el.props);
    rt.cur = outer;
    const inside = draw(out, id, seen);
    rt.pending.push(...inst.effects);
    return inside;
  }
  const kids = el.props?.children;
  return { type: el.type, props: { ...el.props, children: kids === undefined ? undefined : draw(kids, `${path}/${String(el.type)}`, seen) } };
}

export type Mounted = {
  /** What was last drawn. */
  readonly tree: unknown;
  /** The same tree, drawn again with other props for the root. */
  set(element: unknown): void;
  /** Leaves the tree: every component's clean-ups run, as they do when a card is left. */
  unmount(): void;
};

export function mount(element: unknown): Mounted {
  rt.insts.clear();
  let root = element;
  let tree: unknown = null;
  let live = true;
  const pump = () => {
    if (!live) return;
    if (rt.rendering) {
      rt.dirty = true;
      return;
    }
    rt.rendering = true;
    try {
      do {
        rt.dirty = false;
        rt.pending = [];
        const seen = new Set<string>();
        tree = draw(root, "root", seen);
        for (const [id, inst] of rt.insts) {
          if (seen.has(id)) continue;
          for (const s of inst.slots) if (s && typeof s.cleanup === "function") s.cleanup();
          rt.insts.delete(id);
        }
        for (const run of rt.pending) run();
      } while (rt.dirty && live);
    } finally {
      rt.rendering = false;
    }
  };
  rt.schedule = pump;
  pump();
  return {
    get tree() {
      return tree;
    },
    set(next) {
      root = next;
      pump();
    },
    unmount() {
      live = false;
      for (const inst of rt.insts.values()) for (const s of inst.slots) if (s && typeof s.cleanup === "function") s.cleanup();
      rt.insts.clear();
    },
  };
}

/* ── reading what was drawn ── */

export const walk = (node: unknown, visit: (el: Drawn) => void): void => {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit);
    return;
  }
  if (node && typeof node === "object" && "props" in node) {
    const el = node as Drawn;
    visit(el);
    walk(el.props.children, visit);
  }
};

export const find = (node: unknown, ok: (el: Drawn) => boolean): Drawn | undefined => {
  let hit: Drawn | undefined;
  walk(node, (el) => {
    if (!hit && ok(el)) hit = el;
  });
  return hit;
};

export const textOf = (node: unknown): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node && typeof node === "object" && "props" in node ? textOf((node as Drawn).props.children) : "";
};

/** Lets what the test mocked answer, and what that sets going: a few turns of the event loop. */
export const settle = async (turns = 8): Promise<void> => {
  for (let i = 0; i < turns; i++) await new Promise((r) => setTimeout(r, 0));
};
