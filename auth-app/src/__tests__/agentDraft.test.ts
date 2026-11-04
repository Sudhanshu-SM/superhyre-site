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

describe("the tray under the box", () => {
  const css = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
  const tray = css("composerTray.css");
  const rule = (needle: string) => {
    const at = tray.indexOf(needle);
    return tray.slice(at, tray.indexOf("}", at) + 1);
  };
  const agent = css("Agent.tsx");

  it("is attached to the box: narrower, tucked behind its lower edge, with no top edge of its own", () => {
    const t = rule(".orc.is-agent .orc-tray {");
    expect(t).toMatch(/margin: calc\(var\(--tray-tuck\) \* -1\) 14px 0;/);
    expect(t).toMatch(/border-top: 0;/);
    expect(t).toMatch(/border-radius: 0 0 18px 18px;/);
    expect(t).toMatch(/background: var\(--sub\);/);
    // The box is drawn over it.
    expect(tray).toContain(".orc.is-agent .orc-composer-field { position: relative; z-index: 1; }");
  });

  it("holds the paperclip and the chips, and the box holds only the words and Send", () => {
    const field = agent.indexOf('<div className={`orc-composer-field');
    const trayAt = agent.indexOf('<div className="orc-tray"', field);
    const below = agent.indexOf('<div className="orc-composer-below">', trayAt);
    const box = agent.slice(field, trayAt);
    const inTray = agent.slice(trayAt, below);
    expect(field).toBeGreaterThan(0);
    expect(trayAt).toBeGreaterThan(field);
    expect(box).toContain('className={`orc-send');
    for (const control of ["orc-tray-pin", 'data-tour="jd-slot"', 'data-tour="filters-slot"', "<SourcesChip", "<AddMenu"]) {
      expect(box).not.toContain(control);
      expect(inTray).toContain(control);
    }
    // One tray at rest and docked: there is no second, folded control for the docked bar.
    expect(agent).not.toContain("TuneMenu");
    expect(css("composer.css")).not.toMatch(/\.orc-slots \{ display: none; \}/);
  });

  it("has one quiet button: 30px, 13px/500, no border or circle, the accent on what is set", () => {
    const b = rule(".orc.is-agent .orc-tray-btn {");
    expect(b).toMatch(/height: 30px/);
    expect(b).toMatch(/font: 500 13px\/1 var\(--ui\)/);
    expect(b).toMatch(/border: 0/);
    expect(b).toMatch(/background: transparent/);
    expect(rule(".orc.is-agent .orc-tray-btn.is-on {")).toMatch(/color: var\(--accent-text\)/);
    expect(rule(".orc.is-agent .orc-tray-n {")).toMatch(/background: var\(--accent-fill\)/);
    expect(css("SourcesChip.tsx")).toContain('className={`orc-tray-btn${open ? " is-open" : ""}`}');
  });

  it("lets only the job description's name give way, with an ellipsis, and drops the other labels before it on a narrow tray", () => {
    expect(tray).toContain(".orc.is-agent .orc-tray-btn:has(> .orc-tray-name) { flex: 0 1 auto; min-width: 0; }");
    expect(rule(".orc.is-agent .orc-tray-name {")).toMatch(/text-overflow: ellipsis/);
    const narrow = tray.slice(tray.indexOf("@container (max-width: 420px)"));
    expect(narrow).toMatch(/\.orc-tray-btn:not\(:has\(> \.orc-tray-name\)\) \.orc-tray-l \{ display: none; \}/);
    expect(rule(".orc.is-agent .orc-tray {")).toMatch(/container-type: inline-size/);
  });

  it("makes the dock tall enough for the bar and the tray", () => {
    expect(tray).toContain(".orc.is-agent { --dock: 156px; --dock-under: 32px; }");
    expect(css("composer.css")).toMatch(/\.orc \.orc-stream\.is-live \.orc-composer \.orc-send \{ width: 30px; height: 30px; \}/);
    expect(css("access.css")).toMatch(/\.orc-stream\.is-live \.orc-field-text \{ flex: 1 1 auto; min-width: 0; \}/);
  });
});


describe("the agent page's type is the console's, a step up for the box", () => {
  const css = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

  it("types in the message box at 15px, one and a half lines tall, and the mirror that sizes it says the same", () => {
    expect(css("access.css")).toMatch(/\.orc-input,\s*\.orc-mirror \{[^}]*font: 400 15px\/1\.5/);
  });

  it("has Send 38px in the box and the paperclip 30px in the tray, level with the chips beside it", () => {
    expect(css("composer.css")).toMatch(/\.orc \.orc-composer \.orc-send \{ width: 38px; height: 38px; \}/);
    expect(css("composerTray.css")).toContain(".orc.is-agent .orc-tray-pin { width: 30px; padding: 0; justify-content: center; }");
  });

  it("reads the suggestions above the box at 14px with a 40px row, and the note under it at 13px", () => {
    expect(css("recs.css")).toMatch(/\.orc \.orc-idea \{[^}]*min-height: 40px;[^}]*font: 400 14px\/1\.4/);
    expect(css("agentChat.css")).toMatch(/\.orc-follow \{[^}]*font: 400 13px\/1\.4/);
  });
});

describe("the composer's text box counts in lines of its own leading", () => {
  const css = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

  it("takes a line from the field's computed line-height, and from the stylesheet's own 15px at 1.5 when it has none", () => {
    expect(lineHeightPx("22.5px")).toBe(22.5);
    expect(lineHeightPx("normal")).toBe(FIELD_LINE_H);
    expect(lineHeightPx("")).toBe(FIELD_LINE_H);
    const type = css("access.css").match(/\.orc-input,\s*\.orc-mirror \{[^}]*font: 400 ([\d.]+)px\/([\d.]+) /);
    expect(Number(type?.[1]) * Number(type?.[2])).toBe(FIELD_LINE_H);
  });

  it("rests at two lines, 45px", () => {
    expect(REST_LINES).toBe(2);
    expect(fieldHeight(FIELD_LINE_H, 0, false)).toBe(45);
    expect(fieldHeight(FIELD_LINE_H, 23, false)).toBe(45);
    expect(fieldHeight(FIELD_LINE_H, 0, false)).toBeGreaterThanOrEqual(REST_LINES * FIELD_LINE_H);
  });

  it("does not move when the second line wraps: two lines of words are 45px, which a browser reports as 44 or 45", () => {
    for (const scrollH of [23, 44, 45]) expect(fieldHeight(FIELD_LINE_H, scrollH, false)).toBe(45);
  });

  it("grows with the words from the third line and stops at six, 135px, then it scrolls", () => {
    expect(fieldHeight(FIELD_LINE_H, 68, false)).toBe(68);
    expect(fieldHeight(FIELD_LINE_H, 90, false)).toBe(90);
    expect(MAX_LINES).toBe(6);
    expect(fieldHeight(FIELD_LINE_H, 135, false)).toBe(135);
    expect(fieldHeight(FIELD_LINE_H, 160, false)).toBe(135);
    expect(fieldHeight(FIELD_LINE_H, 5000, false)).toBe(135);
  });

  it("is one line, 23px, once a brief has been sent, and grows the same way", () => {
    expect(fieldHeight(FIELD_LINE_H, 23, true)).toBe(23);
    expect(fieldHeight(FIELD_LINE_H, 45, true)).toBe(45);
    expect(fieldHeight(FIELD_LINE_H, 5000, true)).toBe(135);
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

  it("seats the landing from the resting group's real height, 122px: the box (2 + 32 of border and padding, 45 of text, Send beside it) and the 43px of tray under it", () => {
    const access = css("access.css");
    const tray = css("composerTray.css");
    const field = access.match(/\.orc-composer-field \{[^}]*?padding: (\d+)px;[^}]*?border: (\d+)px solid/);
    const control = css("composer.css").match(/\.orc \.orc-composer \.orc-send \{ width: (\d+)px; height: \1px; \}/);
    const text = fieldHeight(FIELD_LINE_H, 0, false);
    // Send sits beside the words, so it adds no height while the words are taller than it.
    expect(Number(control?.[1])).toBeLessThan(text);
    expect(tray).toMatch(/\.orc-stream:not\(\.is-live\) \.orc-composer \.orc-composer-field \{ display: flex; align-items: flex-end;/);
    const box = 2 * Number(field?.[2]) + 2 * Number(field?.[1]) + text;
    // The tray shows under the box what is not tucked behind it: its padding above and below the 30px buttons, and its border.
    const pad = tray.match(/padding: calc\(var\(--tray-tuck\) \+ (\d+)px\) \d+px (\d+)px;/);
    const btn = tray.match(/\.orc\.is-agent \.orc-tray-btn \{[^}]*?height: (\d+)px;/);
    const under = Number(pad?.[1]) + Number(btn?.[1]) + Number(pad?.[2]) + 1;
    expect(under).toBe(43);
    expect(box + under).toBe(122);
    expect(css("agentHero.css")).toMatch(new RegExp(`--land-h: ${box + under}px;`));
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
