import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { composerChips, keepsDraft, slotsFor } from "../agentDraft";

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
  it("is 32px tall with a 20px circle, a 12px glyph, a 13px/500 label and an 18px round count, 8px apart", () => {
    const chip = rule(".orc.is-agent .orc-composer .orc-slots .orc-gslot.orc-ctx {");
    expect(chip).toMatch(/height: 32px/);
    expect(chip).toMatch(/gap: 8px/);
    expect(chip).toMatch(/padding: 0 12px 0 10px/);
    expect(chip).toMatch(/align-items: center/);
    expect(chip).toMatch(/font: 500 13px\/1/);
    expect(chip).toMatch(/box-shadow: none/);
    expect(css).toMatch(/\.orc-ctx-ico svg \{ width: 12px; height: 12px; \}/);
    const n = rule(".orc-ctx-n {");
    expect(n).toMatch(/width: 18px/);
    expect(n).toMatch(/height: 18px/);
    expect(n).toMatch(/border-radius: 50%/);
    expect(n).toMatch(/font: 600 11px\/1/);
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
