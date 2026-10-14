/**
 * A model sometimes writes a list on one line: "1. One task for both? 2. What should it say? 3. When is it due?"
 * or "Options: - A - B", or with bullets on one line. This finds those and gives back the lead-in and the items,
 * so the reply can show a real list. It is deliberately strict: a number has to be a marker (start of the text or
 * after a space, then "." or ")" and a space), the numbers have to run 1, 2, 3, and "1.5" or "v2.0 is out" or a
 * dash used as punctuation are sentences, not lists. Code and tables are never touched.
 */

export type InlineList = { lead: string; items: string[]; ordered: boolean };

const MARKER = /(?:^|\s)(\d{1,2})[.)]\s+(?=\S)/g;

/** Items of "1. a 2. b 3. c" (at least two, numbered from 1 in order), with whatever leads into them. */
function numbered(text: string): InlineList | null {
  const hits: Array<{ n: number; start: number; end: number }> = [];
  for (const m of text.matchAll(MARKER)) {
    const start = m.index ?? 0;
    hits.push({ n: Number(m[1]), start: start + (m[0].startsWith(" ") || /^\s/.test(m[0]) ? 1 : 0), end: start + m[0].length });
  }
  // the run that counts: 1, 2, 3 ... in order; anything else numeric in the text is part of a sentence
  const run: typeof hits = [];
  for (const h of hits) {
    if (h.n === run.length + 1) run.push(h);
  }
  if (run.length < 2) return null;
  const items = run.map((h, i) => text.slice(h.end, i + 1 < run.length ? run[i + 1]!.start : text.length).trim());
  if (items.some((x) => x.length === 0)) return null;
  return { lead: text.slice(0, run[0]!.start).trim(), items, ordered: true };
}

/** "• a • b" (a bullet character used inline), or "Lead: - a - b - c" (a dash list that a colon introduces). */
function bulleted(text: string): InlineList | null {
  const dots = text.split(/\s+•\s+/);
  if (dots.length >= 3 || (dots.length === 2 && /^•\s/.test(text.trimStart()))) {
    const first = dots[0]!.replace(/^•\s+/, "").trim();
    const lead = /^•\s/.test(text.trimStart()) ? "" : first;
    const items = (lead ? dots.slice(1) : [first, ...dots.slice(1)]).map((x) => x.trim()).filter(Boolean);
    if (items.length >= 2) return { lead, items, ordered: false };
  }
  const m = /^(.*?:)\s+-\s+(.+)$/s.exec(text);
  if (m) {
    const items = (m[2] ?? "").split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
    if (items.length >= 2) return { lead: (m[1] ?? "").trim(), items, ordered: false };
  }
  return null;
}

/** Whether a text is code or a table, which are left exactly as written. */
const verbatim = (text: string) => /`/.test(text) || /^\s*\|.*\|\s*$/m.test(text);

/** The list a single line or paragraph of text contains, or null when it is a sentence. */
export function inlineList(text: string): InlineList | null {
  const t = text.trim();
  if (!t || t.length > 4000 || verbatim(t) || t.includes("\n")) return null;
  return numbered(t) ?? bulleted(t);
}
