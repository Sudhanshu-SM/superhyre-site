import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollWhileVisible } from "../livePoll";

/** A screen with no push looks again while it is in front, and only then. */

type Handler = () => void;
let hidden: boolean;
let docHandlers: Record<string, Handler[]>;
let winHandlers: Record<string, Handler[]>;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  docHandlers = {};
  winHandlers = {};
  vi.stubGlobal("document", {
    get hidden() { return hidden; },
    addEventListener: (t: string, h: Handler) => { (docHandlers[t] ??= []).push(h); },
    removeEventListener: (t: string, h: Handler) => { docHandlers[t] = (docHandlers[t] ?? []).filter((x) => x !== h); },
  });
  vi.stubGlobal("window", {
    addEventListener: (t: string, h: Handler) => { (winHandlers[t] ??= []).push(h); },
    removeEventListener: (t: string, h: Handler) => { winHandlers[t] = (winHandlers[t] ?? []).filter((x) => x !== h); },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("pollWhileVisible", () => {
  it("looks every interval while in front, never while hidden, and at once when it comes back", () => {
    const run = vi.fn();
    const stop = pollWhileVisible(run, 15_000);
    vi.advanceTimersByTime(15_000);
    expect(run).toHaveBeenCalledTimes(1);

    hidden = true;
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(1);

    hidden = false;
    for (const h of docHandlers["visibilitychange"] ?? []) h();
    expect(run).toHaveBeenCalledTimes(2);
    for (const h of winHandlers["focus"] ?? []) h();
    expect(run).toHaveBeenCalledTimes(3);

    stop();
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(3);
    expect(docHandlers["visibilitychange"]).toEqual([]);
    expect(winHandlers["focus"]).toEqual([]);
  });
});
