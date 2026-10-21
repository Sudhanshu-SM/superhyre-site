import { inlineList } from "./replyLists";

/**
 * **bold** (and __bold__), and `code` as plain text: no mark is ever shown as the characters that make it. A mark that
 * was never closed ("**Good fit (2)") loses its asterisks rather than showing them.
 */
export function inline(text: string): Array<string | JSX.Element> {
  return text
    .split(/(\*\*[^\n]+?\*\*|__[^\n]+?__)/g)
    .map((part, i) =>
      /^(\*\*|__)[^\n]+(\*\*|__)$/.test(part) && part.length > 4 ? (
        <strong key={i}>{part.slice(2, -2).replace(/\*\*/g, "")}</strong>
      ) : (
        part.replace(/\*\*/g, "").replace(/`([^`]+)`/g, "$1")
      ),
    );
}

type Part = { kind: "text" | "ul" | "ol" | "head"; lines: string[]; start?: number; subs?: Record<number, string[]> };

const BULLET = /^\s*[-*•]\s+/;
/** A bullet indented under another: its line, one level down. */
const SUB_BULLET = /^\s{2,}[-*•]\s+/;
const NUMBER = /^\s*(\d{1,2})[.)]\s+/;
const HEADING = /^\s{0,3}#{1,6}\s+/;
const RULE = /^\s*(?:[-*_=]\s*){3,}$/;

/** The lines of a reply as paragraphs, headings, bullet lists and numbered lists. A rule line (---) is not shown. */
function parts(text: string): Part[] {
  const out: Part[] = [];
  let current: Part | null = null;
  let gap = false;
  for (const line of text.trim().split("\n")) {
    if (RULE.test(line)) {
      current = null;
      continue;
    }
    if (!line.trim()) {
      gap = true;
      continue;
    }
    if (SUB_BULLET.test(line) && current?.kind === "ul" && current.lines.length > 0) {
      const at = current.lines.length - 1;
      (current.subs ??= {})[at] = [...(current.subs[at] ?? []), line.replace(BULLET, "").trim()];
      gap = false;
      continue;
    }
    const num = NUMBER.exec(line);
    // "1. a? 2. b? 3. c?" on one line is the model's list run together: it is read as a paragraph and split below.
    const runTogether = (num || BULLET.test(line)) && inlineList(line) !== null;
    const kind: Part["kind"] = runTogether ? "text" : HEADING.test(line) ? "head" : BULLET.test(line) ? "ul" : num ? "ol" : "text";
    // A blank line between two items of one list does not end the list; between anything else it ends the paragraph.
    const continues = current !== null && current.kind === kind && (kind === "ul" || kind === "ol" || (kind === "text" && !gap));
    if (!continues) {
      current = { kind, lines: [], ...(kind === "ol" ? { start: Number(num?.[1] ?? 1) } : {}) };
      out.push(current);
    }
    gap = false;
    current?.lines.push(line.replace(kind === "head" ? HEADING : kind === "ul" ? BULLET : kind === "ol" ? NUMBER : /^$/, "").trim());
  }
  return out;
}

/**
 * Paragraphs, headings, "- " lists, numbered lists and **bold**: all the formatting the agent is asked to use, and
 * all of it shown as what it means. Lines of one paragraph keep their line breaks. A list the model wrote on one
 * line ("1. a 2. b 3. c") is shown as a list too, with its lead-in kept as the paragraph above it.
 */
export function Prose({ text }: { text: string }): JSX.Element {
  const shown: Part[] = [];
  for (const part of parts(text)) {
    const found = part.kind === "text" && part.lines.length === 1 ? inlineList(part.lines[0] ?? "") : null;
    if (!found) {
      shown.push(part);
      continue;
    }
    if (found.lead) shown.push({ kind: "text", lines: [found.lead] });
    shown.push({ kind: found.ordered ? "ol" : "ul", lines: found.items });
  }
  return (
    <>
      {shown.map((part, i) =>
        part.kind === "text" || part.kind === "head" ? (
          <p key={i} className="rep-para">
            {part.lines.flatMap((l, j) => [...(j ? [<br key={`b${j}`} />] : []), ...(part.kind === "head" ? [<strong key={`s${j}`}>{inline(l)}</strong>] : inline(l))])}
          </p>
        ) : part.kind === "ol" ? (
          <ol key={i} className="lt-list lt-list-ol" {...(part.start && part.start > 1 ? { start: part.start } : {})}>
            {part.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}
          </ol>
        ) : (
          <ul key={i} className="lt-list">
            {part.lines.map((l, j) => (
              <li key={j}>
                {inline(l)}
                {part.subs?.[j] && <ul className="lt-list lt-sub">{part.subs[j]!.map((x, k) => <li key={k}>{inline(x)}</li>)}</ul>}
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}
