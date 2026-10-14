import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openerNow, restoreFocus, trapTab, wrapTarget } from "../components/focusTrap";

/**
 * Dialogs held no focus: Tab from the last button went into the sidebar behind them, and Escape left focus on
 * the page's first link. These pin the rule (wrapTarget), the keydown handler against a small fake page (trapTab)
 * and that every overlay of the console uses it.
 */

describe("where Tab goes inside an overlay", () => {
  const stops = ["a", "b", "c"];
  it("goes round: the last stop forwards is the first, the first backwards is the last", () => {
    expect(wrapTarget(stops, "c", false)).toBe("a");
    expect(wrapTarget(stops, "a", true)).toBe("c");
  });
  it("leaves the browser's own step alone while it stays inside", () => {
    expect(wrapTarget(stops, "a", false)).toBeNull();
    expect(wrapTarget(stops, "b", true)).toBeNull();
  });
  it("pulls focus in from outside, at the end it came from", () => {
    expect(wrapTarget(stops, null, false)).toBe("a");
    expect(wrapTarget(stops, "elsewhere", true)).toBe("c");
  });
  it("has nowhere to go with no stops", () => {
    expect(wrapTarget([], null, false)).toBeNull();
  });
});

/* A page as small as the rule needs: an overlay with some controls, a sidebar behind it, and a portalled menu. */
type El = {
  id: string; tabIndex: number; focused: number; inside: Set<El>; hidden?: boolean;
  focus: () => void; contains: (o: unknown) => boolean; closest: () => null; getClientRects: () => unknown[];
  querySelectorAll?: () => El[];
};
function el(id: string, hidden = false): El {
  const e: El = {
    id, tabIndex: 0, focused: 0, inside: new Set(), hidden,
    focus() { page.active = e; e.focused += 1; },
    contains(o) { return o === e || e.inside.has(o as El); },
    closest: () => null,
    getClientRects: () => (hidden ? [] : [{}]),
  };
  return e;
}
const page: { active: El | null; root: El; byId: Record<string, El> } = { active: null, root: el("root"), byId: {} };

function setup() {
  const first = el("first"), mid = el("mid"), last = el("last"), gone = el("gone", true);
  const panel = el("panel");
  panel.querySelectorAll = () => [first, mid, gone, last];
  panel.inside = new Set([first, mid, gone, last]);
  const sidebar = el("sidebar-home");
  const menu = el("portal-menu");
  page.root = el("root");
  page.root.inside = new Set([sidebar]);
  page.byId = { root: page.root };
  vi.stubGlobal("document", {
    get activeElement() { return page.active; },
    body: { id: "body" },
    documentElement: {},
    getElementById: (id: string) => page.byId[id] ?? null,
    addEventListener: () => {},
  });
  vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible" }));
  return { first, mid, last, panel, sidebar, menu };
}
const tab = (shift = false) => {
  const e = { key: "Tab", shiftKey: shift, altKey: false, ctrlKey: false, metaKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  return e as unknown as KeyboardEvent & { defaultPrevented: boolean };
};

describe("trapTab", () => {
  afterEach(() => { vi.unstubAllGlobals(); page.active = null; });

  it("sends Tab from the last control back to the first, and Shift+Tab from the first to the last", () => {
    const p = setup();
    page.active = p.last;
    const e = tab();
    expect(trapTab(p.panel as unknown as HTMLElement, e)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(page.active).toBe(p.first);
    page.active = p.first;
    expect(trapTab(p.panel as unknown as HTMLElement, tab(true))).toBe(true);
    expect(page.active).toBe(p.last);
  });

  it("does not count a hidden control as a stop", () => {
    const p = setup();
    page.active = p.mid;
    expect(trapTab(p.panel as unknown as HTMLElement, tab())).toBe(false);
    page.active = p.last;
    trapTab(p.panel as unknown as HTMLElement, tab());
    expect(page.active).toBe(p.first);
  });

  it("pulls focus back from the sidebar behind the overlay", () => {
    const p = setup();
    page.active = p.sidebar;
    expect(trapTab(p.panel as unknown as HTMLElement, tab())).toBe(true);
    expect(page.active).toBe(p.first);
  });

  it("leaves focus alone while it is in a menu or a second dialog opened above it", () => {
    const p = setup();
    page.active = p.menu; // outside the app's root: a portal
    const e = tab();
    expect(trapTab(p.panel as unknown as HTMLElement, e)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
    expect(page.active).toBe(p.menu);
  });

  it("ignores every other key", () => {
    const p = setup();
    page.active = p.last;
    const e = { ...tab(), key: "a" } as unknown as KeyboardEvent;
    expect(trapTab(p.panel as unknown as HTMLElement, e)).toBe(false);
  });
});

describe("what opened it", () => {
  afterEach(() => { vi.unstubAllGlobals(); page.active = null; });

  it("goes back to the opener, and to the page's main area when the opener has gone", () => {
    const opener = Object.assign(el("opener"), { isConnected: true });
    restoreFocus(opener as unknown as HTMLElement);
    expect(opener.focused).toBe(1);

    const main = el("con-main");
    vi.stubGlobal("document", { getElementById: (id: string) => (id === "con-main" ? main : null) });
    restoreFocus(Object.assign(el("detached"), { isConnected: false }) as unknown as HTMLElement);
    expect(main.focused).toBe(1);
    restoreFocus(null);
    expect(main.focused).toBe(2);
  });

  it("is the focused control, or none when the page body has focus and nothing was clicked", () => {
    const button = el("btn");
    vi.stubGlobal("document", { activeElement: button, body: {}, documentElement: {} });
    expect(openerNow()).toBe(button);
    const body = {};
    vi.stubGlobal("document", { activeElement: body, body, documentElement: {} });
    expect(openerNow()).toBeNull();
  });
});

describe("every overlay holds focus", () => {
  const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
  it("is wired into the dialog, the quick find, the profile sheet and the history dialog", () => {
    expect(src("ui.tsx")).toContain("trapTab(panel.current, e)");
    expect(src("ui.tsx")).toContain("restoreFocus(returnTo.current");
    // The opener is taken while the render that mounts the dialog is made: an `autoFocus` field inside takes focus
    // during the commit and used to be remembered as the opener (so Escape left focus at the top of the page).
    expect(src("ui.tsx")).toContain("useState<Element | null>(() => (open ? openerNow() : null))");
    expect(src("Palette.tsx")).toContain("useFocusTrap(palRef, open");
    expect(src("ProfileSidebar.tsx")).toContain("trapTab(panelRef.current, e)");
    expect(src("Rail.tsx")).toContain("useFocusTrap(dialog, true)");
    expect(src("Console.tsx")).toContain("restoreFocus(paletteOpener.current)");
  });
});
