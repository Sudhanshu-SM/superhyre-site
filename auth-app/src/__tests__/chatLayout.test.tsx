import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STACK_AT, TRANSCRIPT_TAIL, agentLayout, orcClass, tailPadding } from "../agentLayout";
import { composeMessage } from "../attachments";
import { Prompt } from "../Reply";

const css = readFileSync(resolve(__dirname, "../chat.css"), "utf8");
const block = (needle: string): string => {
  const at = css.indexOf(needle);
  if (at < 0) throw new Error(`no rule: ${needle}`);
  return css.slice(at, css.indexOf("}", at) + 1);
};

describe("where the rail is", () => {
  it("meets the composer while chatting beside it, as before otherwise", () => {
    expect(agentLayout(1440, true)).toBe("rail-meets-composer");
    expect(agentLayout(2000, true)).toBe("rail-meets-composer");
    expect(agentLayout(1280, false)).toBe("home");
    expect(agentLayout(STACK_AT, true)).toBe("stacked");
    expect(agentLayout(390, true)).toBe("stacked");
    expect(orcClass(true)).toBe("orc is-agent is-chat");
    expect(orcClass(false)).toBe("orc is-agent");
  });

  const wide = css.slice(css.indexOf("@media (min-width: 1101px) {\n  .orc.is-agent.is-chat { grid-template-rows"));

  it("is one place in every state: above a dock of fixed height, at the end of the rows over it", () => {
    // both states end in the same fixed row, so the rail (which ends on it) cannot move between them
    expect(wide).toMatch(/\.orc\.is-agent\.is-chat \{ grid-template-rows: minmax\(0, 1fr\) var\(--dock\); \}/);
    expect(wide).toMatch(/\.orc\.is-agent:not\(\.is-chat\) \{ grid-template-rows: var\(--config-top, 36dvh\) auto minmax\(0, 1fr\) var\(--dock\); \}/);
    const rail = wide.slice(wide.indexOf(".orc.is-agent > .orc-rail {"));
    expect(rail).toMatch(/grid-row: 1 \/ -2;\s*grid-column: 2;\s*align-self: end;/);
    // 24px of clearance at the top; taller than that it scrolls inside itself
    expect(rail).toMatch(/max-height: calc\(100% - 24px\);/);
    expect(rail).toMatch(/overflow-y: auto;/);
    // nothing in the rail's own rules depends on whether a chat is open
    expect(rail.slice(0, rail.indexOf("}"))).not.toMatch(/is-chat/);
    // outside that query (the stacked page) none of it applies
    expect(css.slice(0, css.indexOf("@media (min-width: 1101px) {\n  .orc.is-agent.is-chat { grid-template-rows"))).not.toMatch(/\.orc\.is-agent\.is-chat/);
    expect(css).not.toMatch(/\.rail-stats[^}]*display: none/);
  });

  it("puts the composer on the Configuration panel's top at rest, and on the dock in a chat", () => {
    // home: row 1 is as tall as the line the panel rests on, the composer is the row under it
    expect(wide).toMatch(/\.orc\.is-agent:not\(\.is-chat\) > \.orc-main > \.orc-stream > \.orc-composer \{\s*grid-row: 2;\s*align-self: start;/);
    // chat: the dock row, the input's top is the dock's top; what is under it hangs from it
    expect(wide).toMatch(/\.orc\.is-agent\.is-chat > \.orc-main > \.orc-stream > \.orc-composer \{\s*grid-row: 2;\s*align-self: end;/);
    expect(wide).toMatch(/\.orc\.is-agent\.is-chat \.orc-composer-below \{\s*position: absolute;\s*top: 100%;/);
    const src = readFileSync(resolve(__dirname, "../Agent.tsx"), "utf8");
    expect(src).toMatch(/--config-top/);
    // the suggestions are for the page before a conversation, and only that
    expect(src).toMatch(/LIVE\s*\? !started/);
  });

  it("holds what is attached inside the composer's own box, not above it", () => {
    const src = readFileSync(resolve(__dirname, "../Agent.tsx"), "utf8");
    const field = src.indexOf('<div className={`orc-composer-field');
    const chips = src.indexOf("<AttachChips", field);
    const row = src.indexOf('<div className="orc-composer-row">', field);
    expect(field).toBeGreaterThan(0);
    expect(chips).toBeGreaterThan(field);
    expect(chips).toBeLessThan(row);
    expect(src).toMatch(/<div className="orc-composer-below">/);
    expect(css).toMatch(/\.orc-composer-field \.orc-attached \{\s*order: -1;\s*flex: 1 0 100%;/);
  });
});

describe("the transcript", () => {
  it("puts the person's message in a bubble on the right, in the agent's size", () => {
    const rule = block(".orc-turn .rep-prompt {");
    expect(rule).toMatch(/margin: 0 0 10px auto/);
    expect(rule).toMatch(/background: var\(--sub\)/);
    expect(rule).toMatch(/border: 0/);
    expect(rule).toMatch(/max-width: min\(70%/);
    expect(rule).toMatch(/font: 400 15px\/1\.65/);
    expect(css).toMatch(/@media \(max-width: 640px\) \{ \.orc-turn \.rep-prompt \{ max-width: 85%; \} \}/);
  });

  it("has no rule between turns, and one rhythm", () => {
    expect(block(".orc.is-agent .orc-log > .orc-turn + .orc-turn {")).toMatch(/border-top: 0/);
    expect(block(".orc.is-agent .orc-log > .orc-turn {")).toMatch(/padding: 0/);
    expect(block(".orc.is-agent .orc-stream .orc-log {")).toMatch(/gap: 28px/);
    expect(block(".orc.is-agent .orc-stream.is-live .orc-log {")).toMatch(/--log-tail: 28px; padding-bottom: var\(--log-tail\); scroll-padding-bottom: var\(--log-tail\)/);
    expect(css).not.toMatch(/<hr|border-bottom: 1px solid var\(--nav-rule\)/);
  });

  it("follows the live turn to 28px above the composer, a few lines at once, a long jump as a glide", () => {
    const src = readFileSync(resolve(__dirname, "../Agent.tsx"), "utf8");
    // small growth is closed before paint, a long jump (a whole answer arriving) glides
    expect(src).toMatch(/d0 >= 1 && d0 <= 240/);
    expect(src).toMatch(/reduce \|\| d <= 240 \? d : Math\.max\(1, Math\.ceil\(d \* 0\.18\)\)/);
    // the stacked page's target is the same number the stylesheet pads the log by
    expect(src).toMatch(/\+ TRANSCRIPT_TAIL;\s*\}, \[\]\);/);
    expect(css).toMatch(new RegExp(`--log-tail: ${TRANSCRIPT_TAIL}px;`));
    expect(TRANSCRIPT_TAIL).toBe(28);
  });

  it("leaves 28px under the last line and no more, whatever the turn did", () => {
    const src = readFileSync(resolve(__dirname, "../Agent.tsx"), "utf8");
    // nothing is held back as padding for a turn that got shorter, and the log's padding is only ever the tail
    expect(src).not.toMatch(/setHold|letGo|basePad/);
    expect(src).not.toMatch(/style\.paddingBottom/);
    expect(src).not.toMatch(/orc-mark\.is-working/);
    expect(css).not.toMatch(/\.orc-log[^{]*\{[^}]*padding-bottom: ?(\d{3}|[3-9]\d)px/);
    // the padding that makes the distance to the input 28px, from where the input's top is against the log's foot
    expect(tailPadding(0)).toBe(28);
    expect(tailPadding(-14)).toBe(42);
    expect(tailPadding(24)).toBe(4);
    expect(tailPadding(60)).toBe(0);
    expect(src).toMatch(/--log-tail/);
  });

  it("has the goal tracker in the flow, over nothing and under nothing", () => {
    const stg = readFileSync(resolve(__dirname, "../stages.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = stg.slice(stg.indexOf(".stg {"), stg.indexOf("}", stg.indexOf(".stg {")) + 1);
    expect(rule).toMatch(/position: static/);
    expect(rule).not.toMatch(/sticky|z-index|top:|margin(-top)?: -/);
    expect(stg).not.toMatch(/position: sticky/);
    // a run laid out as `justify-items: start` still gives it the column's width
    expect(rule).toMatch(/justify-self: stretch/);
  });

  it("renders the message as a bubble, with a file named instead of its text", () => {
    const plain = renderToStaticMarkup(<Prompt text="Hi there" />);
    expect(plain).toContain('class="rep-prompt"');
    expect(plain).toContain("Hi there");
    expect(plain).not.toContain("<hr");
    const { text } = composeMessage("Please read this", [
      { id: "a", name: "Job Description.pdf", origin: "file", size: 9, status: "ready", text: "Senior engineer, Go and Postgres.", docKind: "job_description" },
    ]);
    const sent = renderToStaticMarkup(<Prompt text={text} />);
    expect(sent).toContain("Please read this");
    expect(sent).toContain("Job Description.pdf");
    expect(sent).not.toContain("Senior engineer, Go and Postgres.");
    expect(sent).not.toContain("[Attached");
  });

  it("folds a long message until asked for it", () => {
    const html = renderToStaticMarkup(<Prompt text={"We are hiring a backend engineer. ".repeat(60)} />);
    expect(html).toContain("Show more");
    expect(html).toContain("…");
  });
});

describe("the chips of what is attached", () => {
  const none = () => {};
  const file = (over: Record<string, unknown> = {}) => ({
    id: "a", name: "Job Description.pdf", origin: "file" as const, size: 212 * 1024, status: "ready" as const, text: "x", ...over,
  });

  it("names each file with its size, in one design, and can take each off", async () => {
    const { AttachChips } = await import("../AttachChips");
    const items = [
      file(),
      file({ id: "b", name: "cv.pdf", size: 90 * 1024, status: "reading", text: "" }),
      file({ id: "d", name: "Pasted text", origin: "pasted", size: 40, text: "word ".repeat(420) }),
    ];
    const html = renderToStaticMarkup(<AttachChips items={items} cut={new Set()} onView={none} onRemove={none} />);
    expect(html).toContain("Job Description.pdf");
    expect(html).toContain("212 KB");
    expect(html).toContain("Reading…");
    expect(html).toContain("Pasted text, 420 words");
    expect(html).toContain('aria-label="Remove cv.pdf"');
    expect(html).toContain('aria-label="View Pasted text, 420 words"');
    expect((html.match(/orc-file-x/g) ?? []).length).toBe(3);
    expect(html).not.toContain("orc-attached-err");
    expect(renderToStaticMarkup(<AttachChips items={[]} cut={new Set()} onView={none} onRemove={none} />)).toBe("");
  });

  it("says what could not be read in one calm line under the chips, not inside a chip", async () => {
    const { AttachChips } = await import("../AttachChips");
    const html = renderToStaticMarkup(
      <AttachChips
        items={[
          file({ id: "x", name: "Investor Deck.pdf", status: "failed", text: "", note: "I couldn't read that file. It may be longer than 15 pages, or damaged." }),
          file({ id: "y", name: "scan.png", status: "failed", text: "", note: "There's no text in that file I could read." }),
        ]}
        cut={new Set()} onView={none} onRemove={none}
      />,
    );
    const list = html.slice(0, html.indexOf("</ul>"));
    expect(list).toContain("Investor Deck.pdf");
    expect(list).not.toContain("15 pages");
    const line = html.slice(html.indexOf("orc-attached-err"));
    expect(line).toContain("Investor Deck.pdf: I couldn&#x27;t read that file. It may be longer than 15 pages, or damaged.");
    expect(line).toContain("1 more couldn&#x27;t be read either.");
    expect((html.match(/orc-attached-err/g) ?? []).length).toBe(1);
  });

  it("shows four and then +N more, and the job description by its name and the filters by their count", async () => {
    const { AttachChips, CHIPS_SHOWN } = await import("../AttachChips");
    const many = Array.from({ length: 6 }, (_, i) => file({ id: `f${i}`, name: `file-${i}.pdf` }));
    const html = renderToStaticMarkup(<AttachChips items={many} cut={new Set()} onView={none} onRemove={none} />);
    expect(CHIPS_SHOWN).toBe(4);
    expect(html).toContain("file-3.pdf");
    expect(html).not.toContain("file-4.pdf");
    expect(html).toContain("+2 more");
    const next = renderToStaticMarkup(
      <AttachChips
        items={[file({ id: "next-jd", label: "Job description: jd.pdf", name: "jd.pdf" })]}
        cut={new Set()} onView={none} onRemove={none}
        filters={{ count: 3, onOpen: none, onRemove: none }}
      />,
    );
    expect(next).toContain("Job description: jd.pdf");
    expect(next).toContain("Filters: 3");
  });
});


describe("the Agent page's layout does not reach other pages", () => {
  /** Every selector of every rule in a stylesheet (media queries unwrapped), as written. */
  const selectors = (sheet: string): string[] => {
    const out: string[] = [];
    const flat = sheet.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of flat.matchAll(/([^{}@][^{}]*)\{/g)) {
      const head = (m[1] ?? "").trim();
      if (!head || /^\d|^from|^to\b/.test(head)) continue;
      for (const sel of head.split(",")) out.push(sel.trim());
    }
    return out;
  };

  it("scopes every rule that touches the page's grid, the column, the stream, the rail or the transcript to .is-agent", () => {
    const shared = /\.orc(?![\w-])|\.orc-(main|stream|rail|log|turn|composer)(?![\w-])/;
    const loose = selectors(css).filter((sel) => shared.test(sel) && !/\.is-agent|\.orc-composer-field|\.orc-composer-below|\.orc-turn \.rep-prompt|\.orc-attached|\.orc-composer\b.*\.orc-attached/.test(sel));
    expect(loose).toEqual([]);
  });

  it("is switched on by the Agent page's root alone: Home's root is not it", () => {
    const home = readFileSync(resolve(__dirname, "../Home.tsx"), "utf8");
    const agent = readFileSync(resolve(__dirname, "../Agent.tsx"), "utf8");
    expect(home).toMatch(/className="orc is-solo"/);
    expect(home).not.toMatch(/is-agent|orcClass/);
    expect(agent).toMatch(/orcClass\(started\)/);
    expect(orcClass(false)).toContain("is-agent");
    // Home is an `.orc` too: no rule here may match `.orc` or `.orc.is-solo` on its own
    expect(selectors(css).filter((sel) => /^\.orc(\.is-solo)?(\s|$|>|:)/.test(sel) && !/is-agent/.test(sel))).toEqual([]);
  });
});
