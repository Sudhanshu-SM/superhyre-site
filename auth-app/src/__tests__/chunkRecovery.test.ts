import { describe, expect, it, vi } from "vitest";
import { recoverFromMissingChunks } from "../chunkRecovery";

/**
 * After a deploy a page that is cached or left open can ask for a file that is gone. It reloads once onto the current
 * build, and never twice inside a minute, so a real outage is not turned into a loop.
 */

function harness(initial: string | null = null) {
  let handler: (e?: { preventDefault?: () => void }) => void = () => undefined;
  const win = { addEventListener: (_: string, fn: typeof handler) => { handler = fn; }, location: { reload: vi.fn() } };
  const data = new Map<string, string>(initial ? [["sh-chunk-reload", initial]] : []);
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  let clock = 1_000_000;
  recoverFromMissingChunks(win, store, () => clock);
  return { fire: () => { const e = { preventDefault: vi.fn() }; handler(e); return e; }, win, advance: (ms: number) => { clock += ms; } };
}

describe("a missing screen file after a deploy", () => {
  it("reloads the page once, and says the error is handled", () => {
    const h = harness();
    const e = h.fire();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(h.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload again within a minute, so it can never loop", () => {
    const h = harness();
    h.fire();
    h.advance(20_000);
    h.fire();
    h.fire();
    expect(h.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again later, for a deploy that comes another time", () => {
    const h = harness();
    h.fire();
    h.advance(120_000);
    h.fire();
    expect(h.win.location.reload).toHaveBeenCalledTimes(2);
  });

  it("still reloads when storage is unavailable", () => {
    let handler: (e?: { preventDefault?: () => void }) => void = () => undefined;
    const win = { addEventListener: (_: string, fn: typeof handler) => { handler = fn; }, location: { reload: vi.fn() } };
    recoverFromMissingChunks(win, null);
    handler();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
  });
});
