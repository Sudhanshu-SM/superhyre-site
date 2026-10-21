import { describe, expect, it } from "vitest";
import type { Box, Frames, Point } from "../boardAutoScroll";
import { EDGE_MAX, EDGE_MIN, edgeScrollSpeed, scrolledTo, startEdgeScroll } from "../boardAutoScroll";

/**
 * Holding a dragged card near the side of the board scrolls it that way: faster nearer the edge, never in the
 * middle, never once the pointer has left the board's height. The rule is one pure function; the loop that applies
 * it every frame takes its frames from the caller, so nothing here waits on a clock.
 */

const box: Box = { left: 100, right: 1100, top: 200, bottom: 800 };
const at = (x: number, y = 400): Point => ({ x, y });

describe("how fast the board scrolls", () => {
  it("does not scroll while the card is in the middle", () => {
    expect(edgeScrollSpeed(at(600), box)).toBe(0);
    expect(edgeScrollSpeed(at(100 + 96), box)).toBe(0);
    expect(edgeScrollSpeed(at(1100 - 96), box)).toBe(0);
  });

  it("scrolls left near the left edge and right near the right edge", () => {
    expect(edgeScrollSpeed(at(130), box)).toBeLessThan(0);
    expect(edgeScrollSpeed(at(1070), box)).toBeGreaterThan(0);
  });

  it("goes faster the nearer the edge, from a gentle start to the most", () => {
    const speeds = [190, 170, 150, 130, 110, 100].map((x) => -edgeScrollSpeed(at(x), box));
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]!).toBeGreaterThanOrEqual(speeds[i - 1]!);
    expect(speeds[0]!).toBeGreaterThanOrEqual(EDGE_MIN);
    expect(speeds[speeds.length - 1]!).toBe(EDGE_MAX);
    expect(speeds[speeds.length - 1]!).toBeGreaterThan(speeds[0]! * 3);
  });

  it("treats a pointer past the edge as at it", () => {
    expect(edgeScrollSpeed(at(20), box)).toBe(-EDGE_MAX);
    expect(edgeScrollSpeed(at(1500), box)).toBe(EDGE_MAX);
  });

  it("stands still once the pointer has left the board's height (the bin, the page above)", () => {
    expect(edgeScrollSpeed(at(110, 150), box)).toBe(0);
    expect(edgeScrollSpeed(at(1090, 850), box)).toBe(0);
    expect(edgeScrollSpeed(at(110, 200), box)).toBeLessThan(0);
    expect(edgeScrollSpeed(at(1090, 800), box)).toBeGreaterThan(0);
  });

  it("uses a fifth of a narrow board for each edge, and honours the options", () => {
    const narrow: Box = { left: 0, right: 200, top: 0, bottom: 100 };
    expect(edgeScrollSpeed(at(60, 50), narrow)).toBe(0);
    expect(edgeScrollSpeed(at(10, 50), narrow)).toBeLessThan(0);
    // 190 of a 200px zone in, at most 40: two pixels to start, then the square of how far in.
    expect(edgeScrollSpeed(at(1090), box, { max: 40, zone: 200 })).toBe(36);
    expect(edgeScrollSpeed(at(5), { left: 0, right: 0, top: 0, bottom: 0 })).toBe(0);
  });
});

describe("where the scroll lands", () => {
  it("never goes before the start or past the far end", () => {
    expect(scrolledTo(10, -30, 500)).toBe(0);
    expect(scrolledTo(490, 30, 500)).toBe(500);
    expect(scrolledTo(100, 20, 500)).toBe(120);
    expect(scrolledTo(0, 20, 0)).toBe(0);
  });
});

/** Frames the test steps by hand. */
function manualFrames() {
  const queue = new Map<number, () => void>();
  let n = 0;
  const frames: Frames = {
    request: (cb) => { queue.set(++n, cb); return n; },
    cancel: (id) => { queue.delete(id); },
  };
  const step = () => { const [id, cb] = [...queue][0] ?? []; if (id === undefined || !cb) return false; queue.delete(id); cb(); return true; };
  return { frames, step, pending: () => queue.size };
}

describe("the loop that runs for as long as a card is held", () => {
  function rig(pointer: Point | null, left = 300, max = 800) {
    const f = manualFrames();
    const state = { left, pointer, moved: 0, box: box as Box | null };
    const stop = startEdgeScroll({
      box: () => state.box, pointer: () => state.pointer, position: () => ({ left: state.left, max }),
      scrollTo: (l) => { state.left = l; }, moved: () => { state.moved += 1; }, frames: f.frames,
    });
    return { f, state, stop };
  }

  it("scrolls a little every frame while the card is held near the right edge, and tells the board each time", () => {
    const { f, state } = rig(at(1090));
    f.step(); f.step(); f.step();
    expect(state.left).toBe(300 + 3 * edgeScrollSpeed(at(1090), box));
    expect(state.moved).toBe(3);
  });

  it("scrolls left near the left edge", () => {
    const { f, state } = rig(at(100));
    f.step();
    expect(state.left).toBe(300 - EDGE_MAX);
  });

  it("does nothing in the middle, with no pointer (it left the window), or with no board", () => {
    const mid = rig(at(600));
    mid.f.step(); mid.f.step();
    expect(mid.state.left).toBe(300);
    expect(mid.state.moved).toBe(0);

    const gone = rig(null);
    gone.f.step();
    expect(gone.state.left).toBe(300);

    const noBoard = rig(at(1090));
    noBoard.state.box = null;
    noBoard.f.step();
    expect(noBoard.state.left).toBe(300);
  });

  it("stops at the end of what can scroll without pretending it moved", () => {
    const { f, state } = rig(at(1090), 795, 800);
    f.step(); f.step();
    expect(state.left).toBe(800);
    expect(state.moved).toBe(1);
  });

  it("follows the pointer as it moves, and stops for good when told to (drop, leave, Escape)", () => {
    const { f, state, stop } = rig(at(1090));
    f.step();
    state.pointer = at(600);
    const held = state.left;
    f.step();
    expect(state.left).toBe(held);
    state.pointer = at(1090);
    f.step();
    expect(state.left).toBeGreaterThan(held);

    stop();
    expect(f.pending()).toBe(0);
    const after = state.left;
    f.step();
    expect(state.left).toBe(after);
  });

  it("asks for one frame at a time", () => {
    const { f } = rig(at(1090));
    expect(f.pending()).toBe(1);
    f.step();
    expect(f.pending()).toBe(1);
  });
});
