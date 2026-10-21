import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * How the campaign's own stages are wired into the pages that use them. These read the sources, the way the
 * console's other wiring tests do, so a refactor that quietly drops one of them fails here.
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const ws = src("CampaignWorkspace.tsx");
const css = src("boardStages.css");
const hues = src("stageHues.css");

describe("the board", () => {
  it("draws the campaign's columns, not a fixed list, and moves a card by the column it is dropped on", () => {
    expect(ws).toContain("const columns = columnsOf(stages);");
    expect(ws).toContain("data-drop={s.id}");
    expect(ws).toContain("land(p, { stageId: d.over as string })");
    expect(ws).not.toMatch(/const stages = focus \? STAGES\.filter/);
  });

  it("writes each column's name as coloured text in its own tone, with the count beside it, never a pill", () => {
    expect(ws).toContain("<span {...stageText(s, columns.indexOf(s))}>{s.name}</span><span className=\"pl-col-n\" key={all.length}>{all.length}</span>");
    // the column takes its colour, by its place on the board, from the same place the title does
    expect(ws).toContain('data-sc={stageText(s, columns.indexOf(s))["data-sc"]}');
  });

  it("holds about six cards before a column grows, never a long empty strip on a wide window", () => {
    expect(css).toMatch(/\.cw-board \.cw-col \{ min-height: clamp\(420px, 55vh, 620px\); \}/);
    expect(ws).not.toContain("useColumnHeight");
  });

  it("keeps the effects: the lifted card, the landing slot, the bin, the arrival moment", () => {
    for (const bit of ["pl-ghost", "pl-slot", "data-drop=\"trash\"", "setArrived({ id: p.id, stage: kind })", "is-lifted", "setGulp"]) expect(ws).toContain(bit);
  });

  it("gives every stage a normal width whatever the number, never stretching one across the page, and scrolls sideways past what fits", () => {
    expect(css).toMatch(/\.cw-board \.cw-cols \{\s*grid-auto-columns: clamp\(240px, calc\(\(100% - 4 \* 14px\) \/ 5\), 340px\); justify-content: start;/);
    expect(css).not.toContain("is-many");
    expect(css).toMatch(/scroll-snap-type: none/);
    expect(css).toMatch(/@media \(min-width: 561px\)/);
    expect(css).toContain(".cw-board .cw-cols.has-right {");
  });

  it("shows all the campaign's stages, with no way to hide the others", () => {
    expect(ws).toContain("const shownCols = columns;");
    expect(ws).not.toContain("Show all stages");
    expect(ws).not.toContain("onFocus: (s: string | null)");
    expect(ws).not.toContain("is-focus");
    expect(ws).toContain('<div className="pl-col-t">');
  });

  it("scrolls the board while a card is held near its edge, and lets go on drop, on leaving and on Escape", () => {
    expect(ws).toContain("startEdgeScroll({");
    expect(ws).toContain("scroller.scrollLeft = left");
    expect(ws).toContain('document.documentElement.addEventListener("pointerleave", leaveH)');
    expect(ws).toContain('window.addEventListener("keydown", keyH)');
    expect(ws).toContain('if (ev.key !== "Escape") return;');
    // every listener a drag adds is removed in the one place that ends it
    const cleanup = ws.slice(ws.indexOf("const cleanup = () => {"), ws.indexOf("const leaveH"));
    for (const bit of ["pointermove", "pointerup", "pointercancel", "keydown", "blur", "pointerleave", "stopScroll?.()"]) expect(cleanup).toContain(bit);
  });
});

describe("the header", () => {
  it("has Stages for the people who may change the campaign, and the client line under the toolbar", () => {
    expect(ws).toContain("const mayChange = useMayChangeCampaign(ctx.campaignId);");
    expect(ws).toContain('{mayChange && <button type="button" className="cw-btn" onClick={() => setStagesOpen(true)}><Kanban size={14} /> Stages</button>}');
    expect(ws).toContain("<ClientBar campaignId={ctx.campaignId} stages={stages} people={live} mayChange={mayChange && !closed} />");
    expect(ws).toMatch(/\{mayChange && \(\s*<StagesDialog/);
  });

  it("shows what the client said on a card, in the table and in the person's detail", () => {
    expect(ws.match(/verdictLabel\(p\.clientVerdict\.verdict\)/g)!.length).toBeGreaterThanOrEqual(2);
    expect(ws).toContain("function ClientWord({ v }: { v: ClientVerdict })");
    expect(ws.match(/<ClientWord v=\{/g)!.length).toBe(2);
  });

  it("draws the Overview's funnel from the campaign's own stages, one bar each", () => {
    expect(ws).toContain("const bars = funnelBars(stages, people, m.r.found, m.r);");
    expect(ws).not.toContain('{ key: "rep", label: "Replied"');
    expect(ws).not.toContain("ownName(");
  });
});

describe("New campaign", () => {
  const nc = src("NewCampaign.tsx");
  it("has an optional Pipeline step that starts as Standard and only saves stages when they were changed", () => {
    expect(nc).toContain('{ id: "pipeline", label: "Pipeline" }');
    expect(nc).toContain('presetRows("standard")');
    expect(nc).toContain('if (chosen !== "standard") {');
    expect(nc).toContain("adoptIds(pipeline, have)");
  });
});

describe("the strip over the board", () => {
  it("is one slim bar and one quiet line: no icons, no per-stage counts, no conversion figures, no wrapping labels", () => {
    const strip = ws.slice(ws.indexOf("function PipelineStats("), ws.indexOf("function FilterMenu("));
    expect(strip).toContain("pipelineStrip(stages, people, hires)");
    for (const gone of ["<img", "pl-jsteps", "pl-jconv", "pl-jn", "Num n=", "shownConversion", "ArrowRight"]) expect(strip, gone).not.toContain(gone);
    expect(strip).toContain('className="pl-jtip" role="tooltip"');
    expect(css).not.toMatch(/\.pl-jsteps|minmax\(150px/);
    expect(css).toMatch(/\.pl-jtrack\.is-empty \.pl-jseg \{ opacity: 0\.22; \}/);
    expect(css).toMatch(/\.pl-jseg \{[^}]*min-width: 14px;/);
  });
  it("lets a column's title wrap instead of running under its count", () => {
    expect(css).toMatch(/\.pl-col-t strong \{ flex-wrap: wrap;/);
  });
});

describe("custom stages named where they are counted", () => {
  it("labels the Campaigns row's third figure In progress for a campaign with stages of its own, Interviewing otherwise", () => {
    const page = src("CampaignsPage.tsx");
    expect(page.match(/\[interviewWord\(r\.stages\)/g)).toHaveLength(2);
    expect(page).toContain('import { interviewWord } from "./boardStages";');
  });
  it("shows a column's kind words only under the default columns, and the funnel's tips by stage name for a campaign's own", () => {
    expect(ws).toContain("const sub = columnNote(s, all, hiredAll);");
    expect(ws).toContain("b.kind === \"found\" || isDefaultSet(stages)");
  });
  it("leaves room after the funnel's last bar and reads its ends again once the bars have grown in", () => {
    expect(css).toContain("padding-inline-end: 36px; scroll-padding-inline: 36px;");
    expect(ws).toContain("window.setTimeout(read, 900)");
    expect(ws).toContain("watch?.observe(el);");
  });
});

describe("polish", () => {
  it("separates a quiet note from the stage's name in the table, and lets a filter chip wrap instead of cutting it", () => {
    expect(ws).toContain('{p.doNotContact && " "}{listed(p)}</td>');
    expect(css).toContain(".cw-table td span.cw-muted { margin-left: 6px; }");
    const access = readFileSync(resolve(__dirname, "../access.css"), "utf8");
    expect(access).toMatch(/\.fchip-t \{ min-width: 0; white-space: normal; overflow-wrap: anywhere;/);
    expect(access).not.toMatch(/\.fchip-t \{[^}]*text-overflow: ellipsis/);
  });
  it("celebrates a first hire only when the organisation has none before", () => {
    expect(ws.match(/!orgHasEarlierHire\(cid\)/g)).toHaveLength(3);
  });
});

describe("the Overview's funnel row", () => {
  it("keeps each bar at least 88px and scrolls sideways when there are more than fit, with a fade at the edge that has more, no vertical scrollbar, and the keyboard", () => {
    expect(css).toMatch(/\.ov2-funnel\[style\*="--n"\] \{\s*grid-template-columns: repeat\(var\(--n\), minmax\(88px, 1fr\)\);\s*overflow-x: auto; overflow-y: hidden; scroll-behavior: smooth;/);
    expect(css).toContain(".ov2-funnel.has-right {");
    expect(css).toContain(".ov2-funnel.has-left {");
    expect(css).toMatch(/\.ov2-funnel\[style\*="--n"\]:focus-visible/);
    expect(ws).toContain("const edges = useScrollEdges(scroller, bars.length);");
    expect(ws).toMatch(/ref=\{scroller\} className=\{`ov2-funnel[^`]*`\} role="list" tabIndex=\{0\}/);
  });
  it("draws no grey: no slate rule is left in the board's stylesheet", () => {
    expect(css).not.toContain('data-sc="slate"');
  });
});

describe("the stylesheet", () => {
  it("colours stage names and columns from the console's own hue set, and draws no coloured edge on one side", () => {
    for (const hue of ["blue", "teal", "green", "amber", "orange", "rose", "violet"]) {
      expect(hues).toContain(`html .sc[data-sc="${hue}"]`);
      expect(css).toContain(`.cw-board .cw-col[data-sc="${hue}"]`);
    }
    // no one-sided border, and no colour of its own on text: it all comes from the tokens
    expect(css).not.toMatch(/border-(left|inline-start)/);
    expect(css.match(/(^|[;{\s])color:\s*[^;}]*/g)!.every((c) => /var\(--/.test(c))).toBe(true);
  });
});

describe("Home's lists", () => {
  it("scroll without a bar", () => {
    const home = src("home.css");
    expect(home).not.toMatch(/scrollbar-width: thin/);
    expect(home).toContain(".hm-today-b::-webkit-scrollbar");
    expect(home).toMatch(/\.hm-today-b \{[^}]*overflow-y: auto/);
  });
});
