/**
 * When and where the card on a task opens (TaskHover.tsx). Plain numbers in, a place out, so the rules can be tested without a browser.
 */

/** How long a person rests on a task before its card opens: a pointer passing over a list opens nothing. */
export const HOVER_DELAY_MS = 350;
export const CARD_WIDTH = 400;

/** The least space kept between the card and the window's edge, and between the card and the task. */
const EDGE = 12;
const GAP = 8;

export type CardAt = { left: number; top: number };

/**
 * Where the card goes once it has been drawn and its height is known: under the task, its left edge a little before the pointer so it
 * opens where the eye is; over the task when it would not fit below and does fit above; otherwise held inside the window. With no
 * pointer (the task was tabbed to) it lines up with the task's left edge.
 */
export function placeCard(
  row: { left: number; top: number; bottom: number },
  pointerX: number | null,
  card: { height: number },
  view: { width: number; height: number },
): CardAt {
  const start = pointerX === null ? row.left : pointerX - 24;
  const left = Math.max(EDGE, Math.min(start, view.width - CARD_WIDTH - EDGE));
  const below = row.bottom + GAP;
  if (below + card.height <= view.height - EDGE) return { left, top: below };
  const above = row.top - GAP - card.height;
  if (above >= EDGE) return { left, top: above };
  return { left, top: Math.max(EDGE, view.height - EDGE - card.height) };
}
