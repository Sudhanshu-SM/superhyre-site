import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FIELD_LINE_H, MAX_LINES, REST_LINES, composerChips, fieldHeight, keepsDraft, lineHeightPx, slotsFor } from "../agentDraft";

describe("a draft belongs to one conversation", () => {
  it("stays on the first resume, on the first message, and in the same chat", () => {
    expect(keepsDraft(null, "c1")).toBe(true);
    expect(keepsDraft(null, null)).toBe(true);
    expect(keepsDraft("c1", "c1")).toBe(true);
  });

  it("goes when the person moves to another conversation, or to a new one", () => {
    expect(keepsDraft("c1", "c2")).toBe(false);
    expect(keepsDraft("c1", null)).toBe(false);
  });
});

describe("what the slots show", () => {
  const jd = { name: "jd.pdf" };
  it("is the campaign's own job description and filters while one is in focus, never the last chat's", () => {
    expect(slotsFor({ focused: true, campaignJd: jd, campaignFilters: 3, nextJd: null, nextFilters: 0 })).toEqual({ jd, filters: 3 });
    // a campaign with no job description and no filters says nothing, even with a draft left behind
    expect(slotsFor({ focused: true, campaignJd: null, campaignFilters: 0, nextJd: jd, nextFilters: 4 })).toEqual({ jd: null, filters: 0 });
  });

  it("is the next brief's, and empty after a new chat, when no campaign is in focus", () => {
    expect(slotsFor({ focused: false, campaignJd: jd, campaignFilters: 4, nextJd: null, nextFilters: 0 })).toEqual({ jd: null, filters: 0 });
    expect(slotsFor({ focused: false, campaignJd: null, campaignFilters: 0, nextJd: jd, nextFilters: 2 })).toEqual({ jd, filters: 2 });
  });
});

describe("a new chat starts empty", () => {
  const agent = readFileSync(resolve(__dirname, "../Agent.tsx"), "utf8");
  const start = agent.slice(agent.indexOf("const startNew = () => {"));
  const body = start.slice(0, start.indexOf("areaRef.current?.focus();"));

  it("empties the words, the files, the job description, the filters and the open dialogs, and drops the campaign focus", () => {
    expect(body).toMatch(/draftApi\.current\.set\(""\)/);
    expect(body).toMatch(/setNextJd\(null\)/);
    expect(body).toMatch(/setNextFilters\(\{\}\)/);
    expect(body).toMatch(/setJdOpen\(false\)/);
    expect(body).toMatch(/setLiveFiltersOpen\(false\)/);
    expect(body).toMatch(/onNewChat\?\.\(\)/);
  });

  it("is told to the console, which stops treating the last campaign as in focus", () => {
    const console_ = readFileSync(resolve(__dirname, "../Console.tsx"), "utf8");
    expect(console_).toMatch(/onNewChat=\{\(\) => setCampaignChosen\(false\)\}/);
  });

  it("empties the draft when the conversation changes, through the one rule", () => {
    expect(agent).toMatch(/keepsDraft\(prev, live\.conversationId\)/);
    expect(agent).toMatch(/slotsFor\(\{/);
  });
});

describe("the two chips have one anatomy", () => {
  const css = readFileSync(resolve(__dirname, "../chat.css"), "utf8");
  const rule = (needle: string) => {
    const at = css.indexOf(needle);
    return css.slice(at, css.indexOf("}", at) + 1);
  };
  it("is 38px tall with a 24px circle, a 14px glyph, a 15px/500 label and a 21px round count, 9px apart", () => {
    const chip = rule(".orc.is-agent .orc-composer .orc-slots .orc-gslot.orc-ctx {");
    expect(chip).toMatch(/height: 38px/);
    expect(chip).toMatch(/gap: 9px/);
    expect(chip).toMatch(/padding: 0 15px 0 12px/);
    expect(chip).toMatch(/align-items: center/);
    expect(chip).toMatch(/font: 500 15px\/1/);
    expect(chip).toMatch(/box-shadow: none/);
    expect(css).toMatch(/\.orc-ctx-ico svg \{ width: 14px; height: 14px; \}/);
    const n = rule(".orc-ctx-n {");
    expect(n).toMatch(/width: 21px/);
    expect(n).toMatch(/height: 21px/);
    expect(n).toMatch(/border-radius: 50%/);
    expect(n).toMatch(/font: 600 12\.5px\/1/);
    expect(n).toMatch(/tabular-nums/);
  });
  it("shows selected as the accent border and its tint only", () => {
    const on = rule(".orc.is-agent .orc-composer .orc-slots .orc-gslot.orc-ctx.is-on:hover {");
    expect(on).toMatch(/background: var\(--accent-tint\)/);
    expect(on).toMatch(/border-color: var\(--accent-line\)/);
    expect(on).toMatch(/font-weight: 500/);
    // the circle does not change when selected
    expect(css).toMatch(/\.orc-gslot\.orc-ctx\.is-on \.orc-ctx-ico,[\s\S]*?background: var\(--sub\)/);
  });
});

describe("the agent page's type is the larger one", () => {
  const css = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

  it("types in the message box at 16.5px, one and a half lines tall, and the mirror that sizes it says the same", () => {
    expect(css("access.css")).toMatch(/\.orc-input,\s*\.orc-mirror \{[^}]*font: 400 16\.5px\/1\.5/);
  });

  it("has the paperclip and the send button 38px, level with the chips beside them", () => {
    const composer = css("composer.css");
    expect(composer).toMatch(/\.orc \.orc-composer \.orc-send \{ width: 38px; height: 38px; \}/);
    expect(composer).toMatch(/\.orc \.orc-composer \.orc-pin \{[^}]*width: 38px;[^}]*height: 38px;/);
  });

  it("reads the suggestions under the box at 15.5px with a 40px row, and the note under it at 14.5px", () => {
    expect(css("recs.css")).toMatch(/\.orc \.orc-idea \{[^}]*min-height: 40px;[^}]*font: 400 15\.5px\/1\.4/);
    expect(css("agentChat.css")).toMatch(/\.orc-follow \{[^}]*font: 400 14\.5px\/1\.4/);
  });
});

describe("the composer's text box counts in lines of its own leading", () => {
  const css = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

  it("takes a line from the field's computed line-height, and from the stylesheet's own 16.5px at 1.5 when it has none", () => {
    expect(lineHeightPx("24.75px")).toBe(24.75);
    expect(lineHeightPx("normal")).toBe(FIELD_LINE_H);
    expect(lineHeightPx("")).toBe(FIELD_LINE_H);
    const type = css("access.css").match(/\.orc-input,\s*\.orc-mirror \{[^}]*font: 400 ([\d.]+)px\/([\d.]+) /);
    expect(Number(type?.[1]) * Number(type?.[2])).toBe(FIELD_LINE_H);
  });

  it("rests at two lines, 50px: not the 44 a written-down 22px line made, which was 1.8 of them", () => {
    expect(REST_LINES).toBe(2);
    expect(fieldHeight(FIELD_LINE_H, 0, false)).toBe(50);
    expect(fieldHeight(FIELD_LINE_H, 25, false)).toBe(50);
    expect(fieldHeight(FIELD_LINE_H, 0, false)).toBeGreaterThanOrEqual(REST_LINES * FIELD_LINE_H);
  });

  it("does not move when the second line wraps: two lines of words are 49.5px, which a browser reports as 49 or 50", () => {
    for (const scrollH of [25, 49, 50]) expect(fieldHeight(FIELD_LINE_H, scrollH, false)).toBe(50);
  });

  it("grows with the words from the third line and stops at six, 149px, then it scrolls", () => {
    expect(fieldHeight(FIELD_LINE_H, 74, false)).toBe(74);
    expect(fieldHeight(FIELD_LINE_H, 99, false)).toBe(99);
    expect(MAX_LINES).toBe(6);
    expect(fieldHeight(FIELD_LINE_H, 149, false)).toBe(149);
    expect(fieldHeight(FIELD_LINE_H, 174, false)).toBe(149);
    expect(fieldHeight(FIELD_LINE_H, 5000, false)).toBe(149);
  });

  it("is one line, 25px, once a brief has been sent, and grows the same way", () => {
    expect(fieldHeight(FIELD_LINE_H, 25, true)).toBe(25);
    expect(fieldHeight(FIELD_LINE_H, 50, true)).toBe(50);
    expect(fieldHeight(FIELD_LINE_H, 5000, true)).toBe(149);
  });

  it("follows the line it is given, so a change of type moves the box with it", () => {
    expect(fieldHeight(21.75, 0, false)).toBe(44);
    expect(fieldHeight(30, 0, false)).toBe(60);
    expect(fieldHeight(30, 9999, false)).toBe(180);
  });

  it("is sized from the field's own line and from no number kept beside it", () => {
    const agent = css("Agent.tsx");
    expect(agent).toMatch(/lineHeightPx\(getComputedStyle\(el\)\.lineHeight\)/);
    expect(agent).toMatch(/el\.style\.height = `\$\{fieldHeight\(line, el\.scrollHeight, started\)\}px`/);
    expect(agent).not.toMatch(/\bLINE_H\b/);
  });

  it("seats the landing from the field's real resting height, 130px: 2 + 32 of border and padding, 50 of text, 8 + 38 of row", () => {
    const access = css("access.css");
    const field = access.match(/\.orc-composer-field \{[^}]*?padding: (\d+)px;[^}]*?border: (\d+)px solid/);
    const row = access.match(/\.orc-composer-row \{[^}]*?margin-top: (\d+)px;/);
    const control = css("composer.css").match(/\.orc \.orc-composer \.orc-send \{ width: (\d+)px; height: \1px; \}/);
    const rest = 2 * Number(field?.[2]) + 2 * Number(field?.[1]) + fieldHeight(FIELD_LINE_H, 0, false) + Number(row?.[1]) + Number(control?.[1]);
    expect(rest).toBe(130);
    expect(css("agentHero.css")).toMatch(new RegExp(`--land-h: ${rest}px;`));
  });
});

describe("the composer's row keeps its one line", () => {
  const css = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
  const chat = css("chat.css");
  const composer = css("composer.css");
  /** What is between the braces of the at-rule that opens with `head`, the rules inside it included. */
  const block = (src: string, head: string) => {
    const open = src.indexOf("{", src.indexOf(head));
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
    }
    return "";
  };
  const STEPS = [612, 480];
  const at = (w: number) => `@container (max-width: ${w}px) {`;
  /** How many classes a selector carries: what a hiding rule has to match to beat the rule that shows. */
  const weight = (selector: string) => selector.match(/\.[a-z][\w-]*/gi)?.length ?? 0;
  const CIRCLE = "{ width: 38px; padding: 0; justify-content: center; border-radius: 50%; }";

  it("measures the row against the field, which is the container, and keeps one set of steps, beside the chip sizes", () => {
    expect(composer).toMatch(/\.orc \.orc-composer \.orc-composer-field \{ container-type: inline-size; \}/);
    expect(composer).not.toMatch(/@container \(max-width: 480px\)/);
    for (const w of STEPS) expect(chat).toContain(at(w));
  });

  it("takes its steps widest first: External only at 612, then every chip at 480", () => {
    expect(chat.indexOf(at(612))).toBeLessThan(chat.indexOf(at(480)));
    const rule = ".orc.is-agent .orc-composer .orc-slots .orc-gslot.orc-ctx";
    const mid = block(chat, at(612));
    const narrow = block(chat, at(480));
    expect(mid).toContain(`${rule}.src-chip ${CIRCLE}`);
    expect(narrow).toMatch(new RegExp(`${rule.replace(/\./g, "\\.")} \\{ flex: none; width: 38px; padding: 0; justify-content: center; border-radius: 50%; \\}`));
    // Each step takes only its own chip: the job description and Filters keep their labels until the circles.
    expect(mid).not.toMatch(/\.orc-ctx \{/);
    expect(narrow).toMatch(/\.orc-ctx \.orc-ctx-n \{\s*position: absolute; top: -6px; right: -6px;/);
    // The chip that steps first is named by the class its component carries. (Add in bulk was the other one, and is gone:
    // the paperclip's menu holds what it did.)
    expect(css("SourcesChip.tsx")).toContain("orc-gslot orc-ctx src-chip");
    expect(chat).not.toContain("bulk-chip");
  });

  it("hides each label with a rule as heavy as the one that shows it, and after it (a lighter one lost, and the label stayed)", () => {
    const shown = ".orc.is-agent .orc-composer .orc-slots .orc-gslot.orc-ctx .orc-chip-l";
    expect(chat).toContain(`${shown} {\n  display: inline-flex;`);
    for (const w of STEPS) {
      const hide = block(chat, at(w)).match(/([^{}]+) \{ display: none; \}/);
      expect(hide).not.toBeNull();
      expect(weight(hide![1]!.trim())).toBeGreaterThanOrEqual(weight(shown));
      expect(chat.indexOf(at(w))).toBeGreaterThan(chat.indexOf(shown));
    }
  });

  it("lets only the job description's name give way, with an ellipsis, so the row can never push Send out", () => {
    expect(chat).toMatch(/\.orc-gslot\.orc-ctx \{[^}]*flex: none;/);
    expect(chat).toContain(".orc-gslot.orc-ctx:where(:has(> .orc-chip-name)) { flex: 0 1 auto; min-width: 0; }");
    expect(chat).toContain(".orc-gslot.orc-ctx .orc-chip-name { display: block; min-width: 0; line-height: 1.3; }");
    expect(chat).toContain(".orc-chip-name { max-width: 16ch; overflow: hidden; text-overflow: ellipsis; }");
    expect(composer).toContain(".orc .orc-composer .orc-slots { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }");
    // It is the circles' rule that comes last, so a circle never shrinks.
    expect(chat.indexOf(":where(:has(> .orc-chip-name))")).toBeLessThan(chat.indexOf(at(480)));
  });

  it("gives each step the width the state above it needs: 612 and 496, and 218 for the circles", () => {
    // The parts, each pinned in this file or in composer.css: the paperclip and Send 38 each, 8px between the row's items and
    // 6px between chips; a chip is border 1 + padding 12 + circle 24 + gap 9 + padding 15 + border 1, then its label at 15px/500
    // (Inter, measured and rounded up), and a count is a 9px gap and 21px.
    expect(composer).toMatch(/\.orc \.orc-composer \.orc-composer-row \{ align-items: center; gap: 8px; \}/);
    const PIN = 38, SEND = 38, ROW_GAP = 8, CHIP_GAP = 6, CHROME = 1 + 12 + 24 + 9 + 15 + 1, COUNT = 9 + 21, CIRCLE_W = 38;
    const LABEL = { jd: 111, filters: 45, sources: 92 };
    const NAME = 155; // a file's name at the 16ch cap: 16 x 9.69px
    const row = (chips: number[]) => PIN + ROW_GAP + chips.reduce((a, b) => a + b, 0) + CHIP_GAP * (chips.length - 1) + ROW_GAP + SEND;
    const chips = (o: { name?: boolean; count?: boolean; sources?: boolean }) => [
      CHROME + (o.name ? NAME : LABEL.jd),
      CHROME + LABEL.filters + (o.count ? COUNT : 0),
      o.sources ? CIRCLE_W : CHROME + LABEL.sources,
    ];
    const worst = { name: true, count: true };

    expect(row(chips({}))).toBe(538);
    expect(row(chips({ count: true }))).toBe(568);
    expect(row(chips(worst))).toBe(612);
    expect(row(chips({ ...worst, sources: true }))).toBe(496);
    expect(row([CIRCLE_W, CIRCLE_W, CIRCLE_W])).toBe(218);

    // Every label shows from 612 up, and External only keeps its own down to 481, in the fullest state.
    expect(row(chips(worst))).toBeLessThanOrEqual(STEPS[0]!);
    // A label is only dropped because the width above it needs it.
    expect(row(chips(worst))).toBeGreaterThan(STEPS[1]!);
    // The last step before the circles runs a little short in the fullest state, and the name gives that, never more than half.
    expect(row(chips({ ...worst, sources: true })) - (STEPS[1]! + 1)).toBeLessThanOrEqual(NAME / 2);
    // The circles fit, with room to spare.
    expect(row([CIRCLE_W, CIRCLE_W, CIRCLE_W])).toBeLessThan(STEPS[1]!);
  });

  it("fits docked as well: the modes and the chips leave the bar for the tune button, so it is the 34px paperclip, that and the 30px send", () => {
    expect(composer).toMatch(/\.orc \.orc-stream\.is-live \.orc-composer \.orc-modes,\s*\.orc \.orc-stream\.is-live \.orc-composer \.orc-slots \{ display: none; \}/);
    expect(composer).toMatch(/\.orc \.orc-stream\.is-live \.orc-composer \.orc-pin \{ width: 34px; height: 34px; \}/);
    expect(composer).toMatch(/\.orc \.orc-stream\.is-live \.orc-composer \.orc-send \{ width: 30px; height: 30px; \}/);
    expect(composer).toMatch(/\.orc \.orc-stream\.is-live \.orc-composer \.orc-composer-row \{ gap: 6px; \}/);
    // 34 + 6 + the tune button (10 + 14 + 10 + 2 = 36) + 6 + 30 = 112px, in a field the text takes the rest of.
    expect(css("access.css")).toMatch(/\.orc-stream\.is-live \.orc-field-text \{ flex: 1 1 auto; min-width: 0; \}/);
  });
});

describe("which composer chips show", () => {
  it("a chat about no campaign offers both the job description and the filters, from the first blank screen", () => {
    expect(composerChips({ live: true, inCampaign: false })).toEqual({ jd: true, filters: true });
  });

  it("shows neither in a campaign's chat: the campaign's set-up is in the header and on its cards", () => {
    expect(composerChips({ live: true, inCampaign: true })).toEqual({ jd: false, filters: false });
  });

  it("keeps both in the prototype, which is never connected", () => {
    expect(composerChips({ live: false, inCampaign: false })).toEqual({ jd: true, filters: true });
    expect(composerChips({ live: false, inCampaign: true })).toEqual({ jd: true, filters: true });
  });
});
