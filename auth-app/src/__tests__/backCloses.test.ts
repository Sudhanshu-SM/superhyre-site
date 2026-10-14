import { describe, expect, it } from "vitest";
import { closeOnBack } from "../ui";

/** A browser history small enough to reason about: a stack, a cursor and popstate. */
function fakeHost() {
  const stack: unknown[] = [null];
  let at = 0;
  const listeners = new Set<() => void>();
  return {
    host: {
      location: { href: "http://app/#/candidates" },
      history: {
        get state() { return stack[at]; },
        pushState(state: unknown) { stack.splice(at + 1); stack.push(structuredClone(state)); at = stack.length - 1; },
        back() { if (at > 0) { at--; for (const l of [...listeners]) l(); } },
      },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    } as never,
    depth: () => at,
    pressBack: () => { if (at > 0) { at--; for (const l of [...listeners]) l(); } },
  };
}

describe("Back with a dialog open", () => {
  it("closes the dialog and leaves the page where it was", () => {
    const h = fakeHost();
    let closed = 0;
    const dispose = closeOnBack(h.host, () => { closed++; });
    expect(h.depth()).toBe(1);
    h.pressBack();
    expect(closed).toBe(1);
    expect(h.depth()).toBe(0);
    dispose();
    expect(h.depth()).toBe(0);
  });

  it("removes its history entry when the dialog closes another way", () => {
    const h = fakeHost();
    const dispose = closeOnBack(h.host, () => {});
    dispose();
    expect(h.depth()).toBe(0);
  });

  it("can stay open to keep a draft, and Back still works afterwards", () => {
    const h = fakeHost();
    let asks = 0;
    const dispose = closeOnBack(h.host, () => { asks++; return false; });
    h.pressBack();
    expect(asks).toBe(1);
    expect(h.depth()).toBe(1);
    dispose();
    expect(h.depth()).toBe(0);
  });
});
