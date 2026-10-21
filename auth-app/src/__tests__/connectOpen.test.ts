import { describe, expect, it } from "vitest";
import { OPEN_MS, watchOpened } from "../connectOpen";
import type { OpenEnv } from "../connectOpen";

/** Did the sign-in window really open: a window that took focus did; a page still in front after 3 seconds says it didn't. */

function fakeEnv(over: { focus?: boolean; hidden?: boolean } = {}) {
  let blur: (() => void) | null = null;
  let timer: (() => void) | null = null;
  let waited = 0;
  const env: OpenEnv = {
    onBlur: (fn) => { blur = fn; return () => { blur = null; }; },
    hasFocus: () => over.focus ?? true,
    hidden: () => over.hidden ?? false,
    later: (fn, ms) => { timer = fn; waited = ms; return () => { timer = null; }; },
  };
  return { env, loseFocus: () => blur?.(), tick: () => timer?.(), waited: () => waited, armed: () => timer !== null };
}

describe("watching for the sign-in window", () => {
  it("waits three seconds, and says nothing opened when the page never lost focus", () => {
    const f = fakeEnv();
    let said = 0;
    watchOpened(() => { said += 1; }, OPEN_MS, f.env);
    expect(f.waited()).toBe(3_000);
    f.tick();
    expect(said).toBe(1);
  });

  it("is satisfied when a window took focus, or the page went to the back", () => {
    const took = fakeEnv();
    let said = 0;
    watchOpened(() => { said += 1; }, OPEN_MS, took.env);
    took.loseFocus();
    took.tick();
    const hidden = fakeEnv({ hidden: true });
    watchOpened(() => { said += 1; }, OPEN_MS, hidden.env);
    hidden.tick();
    const behind = fakeEnv({ focus: false });
    watchOpened(() => { said += 1; }, OPEN_MS, behind.env);
    behind.tick();
    expect(said).toBe(0);
  });

  it("can be stopped, and then never speaks", () => {
    const f = fakeEnv();
    let said = 0;
    const stop = watchOpened(() => { said += 1; }, OPEN_MS, f.env);
    stop();
    f.tick();
    expect(f.armed()).toBe(false);
    expect(said).toBe(0);
  });
});
