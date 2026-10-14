/**
 * A chat's name in the rail and the history, as words. Pure, so the cuts are pinned by tests.
 *
 * The server names a chat from its first message and cuts a long one with "..." wherever the
 * count lands, often in the middle of a word. A name here never ends in an ellipsis and never
 * ends in half a word: it stops at the last whole word, and the row's own width does the rest.
 */

export const UNTITLED = "New chat";

/** How long a name is allowed to run before it is cut at a word. */
const MAX = 60;

/** Cut at the last whole word that fits, with no mark where it was cut. */
export function cutAtWord(text: string, max = MAX): string {
  const line = (text.trim().split("\n")[0] ?? "").replace(/\s+/g, " ");
  if (line.length <= max) return line;
  const head = line.slice(0, max);
  /* The next character already starts a new word: the cut fell between words, nothing is half. */
  const whole = /\s/.test(line.charAt(max));
  const at = whole ? head.length : head.lastIndexOf(" ");
  return (at > 0 ? head.slice(0, at) : head).replace(/[\s,;:–—-]+$/u, "");
}

/** The name to show for a chat the server titled `raw` (null until its first message names it). */
export function chatTitle(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return UNTITLED;
  /* A name the server cut itself: "..." or "…" after half a word. Drop the mark and the half word. */
  const cut = /(?:\.{3}|…)$/u.exec(t);
  if (!cut) return cutAtWord(t, 120) || UNTITLED;
  const body = t.slice(0, cut.index).trimEnd();
  const at = body.lastIndexOf(" ");
  const whole = at > 0 ? body.slice(0, at) : body;
  return whole.replace(/[\s,;:–—-]+$/u, "") || UNTITLED;
}

/** What a chat will be called from its first message, for the one that is open before the server has said. */
export function titleFromMessage(text: string): string {
  return cutAtWord(text) || UNTITLED;
}
