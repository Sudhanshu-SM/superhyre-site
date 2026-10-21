/**
 * Holding a card near the side of the board scrolls the board that way.
 *
 * `edgeScrollSpeed` is the whole rule, as a pure function: how far to scroll this frame for a pointer here over a
 * board there. The nearer the edge the faster; nothing in the middle, and nothing once the pointer has left the
 * board's height (the bin under it, the page above it). `startEdgeScroll` runs it once a frame for as long as a drag
 * lasts; the scheduler is handed in, so a test steps the frames itself and nothing waits on a clock.
 */

export type Box = { left: number; right: number; top: number; bottom: number };
export type Point = { x: number; y: number };

export type EdgeOptions = {
  /** How wide each edge zone is, at most; a narrow board uses a fifth of its width instead. */
  zone?: number;
  /** The most it moves in one frame, at the very edge. */
  max?: number;
  /** The least it moves once inside the zone, so entering it is felt at once. */
  min?: number;
};

export const EDGE_ZONE = 96;
export const EDGE_MAX = 20;
export const EDGE_MIN = 2;

/**
 * Pixels to scroll this frame: negative for left, positive for right, 0 for none. Speed grows smoothly with how far
 * into the zone the pointer is (a pointer past the edge counts as at it); a pointer above or below the board is not
 * over it, so it stands still.
 */
export function edgeScrollSpeed(p: Point, box: Box, opts: EdgeOptions = {}): number {
  const width = box.right - box.left;
  if (!(width > 0) || p.y < box.top || p.y > box.bottom) return 0;
  const zone = Math.min(opts.zone ?? EDGE_ZONE, width / 5);
  const max = opts.max ?? EDGE_MAX;
  const min = Math.min(opts.min ?? EDGE_MIN, max);
  const depth = (edge: number) => {
    const t = Math.min(1, Math.max(0, edge / zone));
    return min + (max - min) * t * t;
  };
  const intoLeft = box.left + zone - p.x;
  if (intoLeft > 0) return -Math.round(depth(intoLeft));
  const intoRight = p.x - (box.right - zone);
  if (intoRight > 0) return Math.round(depth(intoRight));
  return 0;
}

/** Where the scroll lands after moving by `by`, held between the start and the far end of what can scroll. */
export const scrolledTo = (left: number, by: number, max: number): number => Math.min(Math.max(0, max), Math.max(0, left + by));

/** The frames of a drag: how one is asked for and how it is let go. A page gives requestAnimationFrame; a test gives its own. */
export type Frames = { request: (cb: () => void) => number; cancel: (id: number) => void };

export type EdgeScroll = {
  /** The board's box now, or null once it is gone. */
  box: () => Box | null;
  /** Where the pointer is now, or null while there is none. */
  pointer: () => Point | null;
  /** The scroller's position and reach. */
  position: () => { left: number; max: number };
  /** Moves the scroller to this position. */
  scrollTo: (left: number) => void;
  /** Told after a frame that moved the board: what is under a still pointer has changed. */
  moved?: () => void;
  frames: Frames;
  options?: EdgeOptions;
};

/** Starts watching; the returned function stops it (on drop, on leaving, on Escape). */
export function startEdgeScroll(a: EdgeScroll): () => void {
  let id: number | null = null;
  let live = true;
  const frame = () => {
    id = null;
    if (!live) return;
    const box = a.box();
    const at = a.pointer();
    if (box && at) {
      const speed = edgeScrollSpeed(at, box, a.options);
      if (speed !== 0) {
        const { left, max } = a.position();
        const to = scrolledTo(left, speed, max);
        if (to !== left) {
          a.scrollTo(to);
          a.moved?.();
        }
      }
    }
    id = a.frames.request(frame);
  };
  id = a.frames.request(frame);
  return () => {
    live = false;
    if (id !== null) a.frames.cancel(id);
    id = null;
  };
}
