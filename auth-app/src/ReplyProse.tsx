import { inlineList } from "./replyLists";

/** **bold**: the one inline mark the agent is asked to use. */
export function inline(text: string): Array<string | JSX.Element> {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

type Part = { kind: "text" | "ul" | "ol"; lines: string[] };

/**
 * Paragraphs, "- " lists, numbered lists and **bold**: all the formatting the agent is asked to use. A list can
 * follow its lead-in line without a blank line between them, so each block is split into runs of list lines and
 * runs of text. A list the model wrote on one line ("1. a 2. b 3. c") is shown as a list too, with its lead-in
 * kept as the paragraph above it.
 */
export function Prose({ text }: { text: string }): JSX.Element {
  const parts: Part[] = [];
  for (const block of text.trim().split(/\n{2,}/)) {
    let current: Part | null = null;
    for (const line of block.split("\n")) {
      const list = /^\s*[-*•] /.test(line);
      const kind = list ? "ul" : "text";
      if (!current || current.kind !== kind) {
        current = { kind, lines: [] };
        parts.push(current);
      }
      current.lines.push(list ? line.replace(/^\s*[-*•] /, "") : line);
    }
    current = null;
  }
  const shown: Part[] = [];
  for (const part of parts) {
    const found = part.kind === "text" && part.lines.length === 1 ? inlineList(part.lines[0] ?? "") : null;
    if (!found) { shown.push(part); continue; }
    if (found.lead) shown.push({ kind: "text", lines: [found.lead] });
    shown.push({ kind: found.ordered ? "ol" : "ul", lines: found.items });
  }
  return (
    <>
      {shown.map((part, i) =>
        part.kind === "text" ? (
          <p key={i} className="rep-para">{inline(part.lines.join("\n"))}</p>
        ) : part.kind === "ol" ? (
          <ol key={i} className="lt-list lt-list-ol">
            {part.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}
          </ol>
        ) : (
          <ul key={i} className="lt-list">
            {part.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}
          </ul>
        ),
      )}
    </>
  );
}
