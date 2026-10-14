import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { callDetailOf, callRowOf, groupsOf } from "../api/calls";
import { CallLine } from "../CallLine";
import { CallsHead, CallsToolbar } from "../CallsPage";
import {
  activeLine, followTarget, initialPlayer, linkUsable, playerReducer, RATES, rateOf, seekFromPointer, shouldFollow,
  FOLLOW_PAUSE_MS,
} from "../callPlayer";
import {
  byCaller, byLine, callCount, callerChoices, callerFirstName, campaignInitials, connectedPercent, connectedShare, GROUP_ROWS,
  groupKey, lengthLabel, lineOf, openGroups, orderGroups, OUTCOME_LABEL, OUTCOME_TONE, personOf, rangeOf, readRemembered,
  segmentsFromTurns, seesEveryone, stepIndex, subtitleOf, summaryLine, whenLabel, writeRemembered,
} from "../callsView";
import { effectsOfWrite } from "../invalidate";

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

/** A Monday, 12 Oct 2026, 16:40 India time. */
const NOW = Date.parse("2026-10-12T11:10:00Z");
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

describe("how a call's time reads", () => {
  it("says today, yesterday, the weekday within the week, then the date, always in India time", () => {
    expect(whenLabel(iso(30), NOW)).toBe("Today, 4:10 pm");
    expect(whenLabel(iso(60 * 20), NOW)).toBe("Yesterday, 8:40 pm");
    expect(whenLabel(iso(60 * 24 * 3), NOW)).toBe("Fri, 4:40 pm");
    expect(whenLabel(iso(60 * 24 * 12), NOW)).toMatch(/^30 Sep\w*, 4:40 pm$/);
    expect(whenLabel("not a time", NOW)).toBe("");
  });

  it("is the Indian day, not the server's: late evening in India is already tomorrow in UTC terms", () => {
    // 23:30 IST on the 11th is 18:00 UTC on the 11th; 00:30 IST on the 12th is 19:00 UTC on the 11th.
    expect(whenLabel("2026-10-11T19:00:00Z", NOW)).toBe("Today, 12:30 am");
    expect(whenLabel("2026-10-11T18:00:00Z", NOW)).toBe("Yesterday, 11:30 pm");
  });

  it("gives a length in words, and nothing for none", () => {
    expect(lengthLabel(45)).toBe("45 s");
    expect(lengthLabel(262)).toBe("4 min");
    expect(lengthLabel(3900)).toBe("1 h 5 min");
    expect(lengthLabel(null)).toBe("");
    expect(lengthLabel(0)).toBe("");
    expect(callCount(1)).toBe("1 call");
    expect(callCount(12)).toBe("12 calls");
  });
});

describe("whose calls the page is", () => {
  it("says Everyone's for an owner or admin, and Your calls for a recruiter or Personal", () => {
    expect(subtitleOf("owner")).toBe("Everyone's calls");
    expect(subtitleOf("admin")).toBe("Everyone's calls");
    expect(subtitleOf("recruiter")).toBe("Your calls");
    expect(subtitleOf("personal")).toBe("Your calls");
    expect(seesEveryone("admin")).toBe(true);
    expect(seesEveryone("recruiter")).toBe(false);
    expect(seesEveryone("personal")).toBe(false);
  });

  it("puts everyone, then me, then each caller in the picker, and drops me from the list of others", () => {
    const callers = [
      { id: "u-ana", name: "Ana Rao", count: 4, mine: false },
      { id: "u-me", name: "Olivia Owner", count: 3, mine: true },
      { id: "u-gone", name: null, count: 1, mine: false },
    ];
    expect(callerChoices(callers, "u-me")).toEqual([
      { value: "", label: "Everyone" },
      { value: "u-me", label: "Me" },
      { value: "u-ana", label: "Ana Rao" },
      { value: "u-gone", label: "A former teammate" },
    ]);
  });

  it("draws the heading and the caller filter by who is looking", () => {
    expect(renderToStaticMarkup(<CallsHead standing="owner" />)).toContain("Everyone&#x27;s calls");
    expect(renderToStaticMarkup(<CallsHead standing="admin" />)).toContain("Everyone&#x27;s calls");
    const recruiter = renderToStaticMarkup(<CallsHead standing="recruiter" />);
    expect(recruiter).toContain("Your calls");
    expect(recruiter).not.toContain("Everyone&#x27;s calls");
    expect(renderToStaticMarkup(<CallsHead standing="personal" />)).toContain("Your calls");

    const props = {
      q: "", onQ: () => {}, outcome: "" as const, onOutcome: () => {}, preset: "any" as const, onPreset: () => {},
      custom: { from: "", to: "" }, onCustom: () => {}, caller: "", onCaller: () => {},
      callers: callerChoices([{ id: "u-ana", name: "Ana Rao", count: 2, mine: false }], "u-me"),
    };
    const owner = renderToStaticMarkup(<CallsToolbar {...props} showCaller />);
    expect(owner).toContain('aria-label="Caller"');
    expect(owner).toContain("Everyone");
    expect(owner).toContain("Ana Rao");
    const recruiterBar = renderToStaticMarkup(<CallsToolbar {...props} showCaller={false} />);
    expect(recruiterBar).not.toContain('aria-label="Caller"');
    expect(recruiterBar).toContain('aria-label="Outcome"');
    expect(recruiterBar).toContain('aria-label="Date range"');
    expect(recruiterBar).toContain('aria-label="Search calls"');
  });
});

describe("a row's words", () => {
  const base = { summary: null, preview: null, summaryState: "none" as const, outcomeText: null, hasTranscript: false };
  it("prefers the model's line, then the start of the transcript, then what a dialer wrote", () => {
    expect(lineOf({ ...base, summary: "Wants 28 LPA, call back Friday" })).toEqual({ text: "Wants 28 LPA, call back Friday", quiet: false });
    expect(lineOf({ ...base, preview: "Hi Asha, this is Olivia from" })).toEqual({ text: "Hi Asha, this is Olivia from", quiet: true });
    expect(lineOf({ ...base, outcomeText: "Asked to call back next week" }).text).toBe("Asked to call back next week");
    expect(lineOf({ ...base, summaryState: "pending" }).text).toBe("Writing a summary");
    expect(lineOf(base).text).toBe("");
  });

  it("names the person, or the number when the candidate is not theirs to see", () => {
    expect(personOf({ candidate: { id: "c", name: "Asha Verma", title: null, company: null }, phone: "+919845012345" })).toBe("Asha Verma");
    expect(personOf({ candidate: null, phone: "+919845012345" })).toBe("+919845012345");
    expect(personOf({ candidate: null, phone: "" })).toBe("Unknown number");
    expect(callerFirstName({ id: "u", name: "Ana Rao", mine: false })).toBe("Ana");
    expect(callerFirstName({ id: null, name: null, mine: false })).toBe("Former teammate");
  });
});

describe("campaign groups", () => {
  const g = (id: string | null, minutes: number) => ({
    campaign: id ? { id, name: id, client: null } : null,
    count: 1,
    lastAt: iso(minutes),
  });

  it("orders by the latest call, the calls on no campaign last", () => {
    const ordered = orderGroups([g(null, 1), g("old", 600), g("new", 5), g("mid", 90)]);
    expect(ordered.map(groupKey)).toEqual(["new", "mid", "old", "none"]);
  });

  it("opens the most recent campaign when the person has chosen nothing", () => {
    const groups = [g("old", 600), g("new", 5), g(null, 1)];
    expect(openGroups(groups, {})).toEqual({ new: true, old: false, none: false });
  });

  it("keeps what they chose, including everything shut, and leaves a campaign they have not seen closed", () => {
    const groups = [g("old", 600), g("new", 5), g("fresh", 1)];
    expect(openGroups(groups, { old: true, new: false })).toEqual({ old: true, new: false, fresh: false });
    expect(openGroups(groups, { old: false, new: false, fresh: false })).toEqual({ old: false, new: false, fresh: false });
  });

  it("remembers per person, in this browser, and tolerates what it cannot read", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    writeRemembered(storage, "u1", { a: true, b: false });
    writeRemembered(storage, "u2", { a: false });
    expect(readRemembered(storage, "u1")).toEqual({ a: true, b: false });
    expect(readRemembered(storage, "u2")).toEqual({ a: false });
    expect(readRemembered(storage, "u3")).toEqual({});
    store.set("superhyre.calls.groups.u1", "{not json");
    expect(readRemembered(storage, "u1")).toEqual({});
    store.set("superhyre.calls.groups.u1", JSON.stringify({ a: "yes", b: true }));
    expect(readRemembered(storage, "u1")).toEqual({ b: true });
    expect(readRemembered(null, "u1")).toEqual({});
    expect(readRemembered(storage, undefined)).toEqual({});
  });
});

describe("the keyboard and the dates", () => {
  it("steps one row, stopping at the ends, from the first or last when nothing is chosen", () => {
    expect(stepIndex(-1, 1, 5)).toBe(0);
    expect(stepIndex(-1, -1, 5)).toBe(4);
    expect(stepIndex(2, 1, 5)).toBe(3);
    expect(stepIndex(4, 1, 5)).toBe(4);
    expect(stepIndex(0, -1, 5)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(-1);
  });

  it("turns a preset into India dates, both ends included", () => {
    expect(rangeOf("any", NOW)).toEqual({});
    expect(rangeOf("today", NOW)).toEqual({ from: "2026-10-12", to: "2026-10-12" });
    expect(rangeOf("7d", NOW)).toEqual({ from: "2026-10-06", to: "2026-10-12" });
    expect(rangeOf("30d", NOW)).toEqual({ from: "2026-09-13", to: "2026-10-12" });
  });
});

describe("the recording player", () => {
  const ready = playerReducer(playerReducer(initialPlayer(), { type: "open" }), { type: "ready", duration: 45 });

  it("goes from idle to loading to ready, taking the audio's own length", () => {
    expect(initialPlayer().status).toBe("idle");
    expect(playerReducer(initialPlayer(), { type: "open" }).status).toBe("loading");
    expect(ready).toMatchObject({ status: "ready", duration: 45, time: 0 });
  });

  it("plays, pauses and toggles, and takes the clock only while it is going", () => {
    const playing = playerReducer(ready, { type: "play" });
    expect(playing.status).toBe("playing");
    expect(playerReducer(playing, { type: "tick", time: 12.5 }).time).toBe(12.5);
    const paused = playerReducer(playing, { type: "toggle" });
    expect(paused.status).toBe("paused");
    expect(playerReducer(paused, { type: "toggle" }).status).toBe("playing");
    expect(playerReducer(ready, { type: "tick", time: 9 }).time).toBe(0);
  });

  it("holds a seek inside the recording, and playing from a seek plays", () => {
    expect(playerReducer(ready, { type: "seek", time: 99 }).time).toBe(45);
    expect(playerReducer(ready, { type: "seek", time: -4 }).time).toBe(0);
    const clicked = playerReducer(ready, { type: "seek", time: 20, play: true });
    expect(clicked).toMatchObject({ status: "playing", time: 20 });
  });

  it("starts again from the beginning at the end, and a seek in an ended call leaves it paused", () => {
    const ended = playerReducer(playerReducer(ready, { type: "play" }), { type: "ended" });
    expect(ended).toMatchObject({ status: "ended", time: 45 });
    expect(playerReducer(ended, { type: "play" })).toMatchObject({ status: "playing", time: 0 });
    expect(playerReducer(ended, { type: "seek", time: 10 })).toMatchObject({ status: "paused", time: 10 });
  });

  it("offers 1x, 1.25x, 1.5x and 2x, and nothing in between", () => {
    expect([...RATES]).toEqual([1, 1.25, 1.5, 2]);
    expect(playerReducer(ready, { type: "rate", rate: 1.5 }).rate).toBe(1.5);
    expect(rateOf(1.3)).toBe(1.25);
    expect(rateOf(7)).toBe(2);
    expect(rateOf(0.2)).toBe(1);
  });

  it("pauses when the address runs out, says so, and goes on from the same place with a new one", () => {
    const playing = playerReducer(playerReducer(ready, { type: "play" }), { type: "tick", time: 30 });
    const out = playerReducer(playing, { type: "expired" });
    expect(out).toMatchObject({ status: "paused", expired: true, time: 30 });
    expect(playerReducer(out, { type: "relinked" })).toMatchObject({ expired: false, time: 30 });
  });

  it("can fail, and will not play after", () => {
    const failed = playerReducer(ready, { type: "failed", message: "This recording couldn't be played." });
    expect(failed).toMatchObject({ status: "failed", message: "This recording couldn't be played." });
    expect(playerReducer(failed, { type: "play" }).status).toBe("failed");
    expect(playerReducer(failed, { type: "open" }).status).toBe("loading");
  });

  it("knows when a link is worth using", () => {
    expect(linkUsable(NOW + 5 * 60_000, NOW)).toBe(true);
    expect(linkUsable(NOW + 10_000, NOW)).toBe(false);
    expect(linkUsable(NOW - 1, NOW)).toBe(false);
  });
});

describe("the transcript following the playhead", () => {
  const starts = [0, 4.5, 9.5, 16.5, 24.5];

  it("lights the line that has started, none before the first, and the last past the end", () => {
    expect(activeLine(starts, 0)).toBe(0);
    expect(activeLine(starts, 4.4)).toBe(0);
    expect(activeLine(starts, 4.5)).toBe(1);
    expect(activeLine(starts, 17)).toBe(3);
    expect(activeLine(starts, 999)).toBe(4);
    expect(activeLine([5, 9], 2)).toBe(-1);
    expect(activeLine([], 3)).toBe(-1);
  });

  it("follows unless somebody scrolled it themselves a moment ago", () => {
    expect(shouldFollow(null, 10_000)).toBe(true);
    expect(shouldFollow(10_000, 10_000 + FOLLOW_PAUSE_MS - 1)).toBe(false);
    expect(shouldFollow(10_000, 10_000 + FOLLOW_PAUSE_MS)).toBe(true);
  });

  it("scrolls only when the line is out of view, to a third of the way down", () => {
    const box = { scrollTop: 100, clientHeight: 300 };
    expect(followTarget(box, { offsetTop: 200, offsetHeight: 40 })).toBeNull();
    expect(followTarget(box, { offsetTop: 480, offsetHeight: 40 })).toBe(380);
    expect(followTarget(box, { offsetTop: 40, offsetHeight: 40 })).toBe(0);
  });

  it("puts the playhead where the pointer is on the bar", () => {
    expect(seekFromPointer(150, 100, 200, 60)).toBe(15);
    expect(seekFromPointer(50, 100, 200, 60)).toBe(0);
    expect(seekFromPointer(900, 100, 200, 60)).toBe(60);
    expect(seekFromPointer(150, 100, 0, 60)).toBe(0);
  });
});

describe("a transcript added by hand", () => {
  const turns = [
    { at: 0, speaker: "Priya", text: "Hi Asha, is this a good time?" },
    { at: 5, speaker: "Asha", text: "Yes, go ahead." },
    { at: 11, speaker: "Her manager", text: "Sorry, one second." },
  ];

  it("takes the first speaker as the caller, the second as the candidate, anyone else by name", () => {
    expect(segmentsFromTurns(turns, { seconds: 30 })).toEqual([
      { start: 0, text: "Hi Asha, is this a good time?", speaker: "caller" },
      { start: 5, text: "Yes, go ahead.", speaker: "candidate" },
      { start: 11, text: "Sorry, one second.", speaker: "Her manager" },
    ]);
  });

  it("can have the candidate speak first", () => {
    const out = segmentsFromTurns(turns, { seconds: 30, firstIsCandidate: true });
    expect(out.map((s) => s.speaker)).toEqual(["candidate", "caller", "Her manager"]);
  });

  it("spreads lines with no times over the call, in order", () => {
    const untimed = [
      { at: -1, speaker: "A", text: "One" },
      { at: -1, speaker: "B", text: "Two" },
      { at: -1, speaker: "A", text: "Three" },
    ];
    const out = segmentsFromTurns(untimed, { seconds: 60 });
    expect(out[0]?.start).toBe(0);
    expect(out.every((s, i) => i === 0 || s.start > (out[i - 1]?.start ?? 0))).toBe(true);
    expect(out.at(-1)?.start ?? 99).toBeLessThan(60);
  });
});

describe("what the API sends, read carefully", () => {
  it("reads a row and drops what cannot be one", () => {
    const row = callRowOf({
      id: "c1", at: "2026-10-12T10:00:00.000Z", durationSeconds: 300, direction: "outbound", outcome: "call_back",
      phone: "+919845012345", candidate: { id: "p1", name: "Asha Verma", title: "SDE", company: "Zepto" },
      caller: { id: "u1", name: "Ana Rao", mine: false }, campaign: { id: "k1", name: "Backend", client: "Acme" },
      summary: "Call back Friday", preview: null, summaryState: "ready", hasRecording: true, hasTranscript: true,
    });
    expect(row).toMatchObject({ id: "c1", outcome: "call_back", candidate: { name: "Asha Verma" }, campaign: { client: "Acme" }, summaryState: "ready" });
    expect(callRowOf({ id: "c2" })).toBeNull();
    expect(callRowOf(null)).toBeNull();
    expect(callRowOf({ id: "c3", at: "2026-10-12T10:00:00Z", outcome: "mystery" })?.outcome).toBe("connected");
  });

  it("reads a call with its lines and summary, and groups with their callers", () => {
    const detail = callDetailOf({
      id: "c1", at: "2026-10-12T10:00:00Z", outcome: "connected", notes: "Wants 28 LPA", canEdit: true,
      summaryDetail: { text: "Open to a move.", points: ["Notice 60 days", 7, ""], nextStep: "Call Friday", at: "2026-10-12T10:05:00Z" },
      segments: [{ start: 0, end: 3, role: "caller", name: "Priya", text: "Hello" }, { start: "x", text: "bad" }],
      recording: { available: true, mime: "audio/wav", seconds: 45 },
    });
    expect(detail?.summaryDetail?.points).toEqual(["Notice 60 days"]);
    expect(detail?.segments).toHaveLength(1);
    expect(detail).toMatchObject({ canEdit: true, recording: { available: true, seconds: 45 } });

    const groups = groupsOf({
      groups: [{ campaign: { id: "k1", name: "Backend", client: null }, count: 3, lastAt: "2026-10-12T10:00:00Z" }, { count: 1 }],
      total: 3, canSeeEveryone: true, callers: [{ id: "u1", name: "Ana", count: 3, mine: false }],
    });
    expect(groups.groups).toHaveLength(1);
    expect(groups).toMatchObject({ canSeeEveryone: true, total: 3 });
  });

  it("tells the shared refresh that a write to a call changed the calls", () => {
    expect(effectsOfWrite("PATCH", "/v1/calls/c1")).toEqual({ effects: ["calls"], campaignId: null });
    expect(effectsOfWrite("POST", "/v1/calls/c1/transcript")).toEqual({ effects: ["calls"], campaignId: null });
    expect(effectsOfWrite("PUT", "/v1/calls/c1/recording")).toEqual({ effects: ["calls"], campaignId: null });
    expect(effectsOfWrite("GET", "/v1/calls/c1")).toBeNull();
  });
});

describe("every campaign is the same quiet card", () => {
  it("has the same neutral chip, whatever the campaign is called: its letters, in muted ink, on a plain surface", () => {
    expect(campaignInitials("G32 Platform Engineer")).toBe("GP");
    expect(campaignInitials("VP Engineering (confidential)")).toBe("VE");
    expect(campaignInitials("  data   analyst ")).toBe("DA");
    const css = src("calls.css");
    expect(css).toMatch(/\.kl-gchip \{[^}]*width: 36px; height: 36px; border-radius: 10px;[^}]*border: 1px solid var\(--rule\); background: var\(--sub\); color: var\(--ink-2\);/);
    // No campaign has a colour of its own: nothing derives one from its name, and no hue class is left.
    expect(css).not.toMatch(/kl-hue/);
    expect(css).not.toMatch(/--h-tint|--h-text|var\(--h\)/);
    expect(src("callsView.ts")).not.toMatch(/hueOf|hueClass|HUES/);
    expect(src("CallsPage.tsx")).not.toMatch(/hue/i);
    expect(src("CallsModal.tsx")).not.toMatch(/hue/i);
  });

  it("is told from the next by structure: a card each, eight pixels apart, one header height, a name over its client", () => {
    const css = src("calls.css");
    expect(css).toMatch(/\.kl-groups \{[^}]*display: grid; gap: 8px; \}/);
    expect(css).toMatch(/\.kl-group \{\s*position: relative; border: 1px solid var\(--hairline\); border-radius: 12px; background: var\(--card\);/);
    expect(css).toMatch(/\.kl-gbtn \{[^}]*min-height: 60px;/);
    expect(css).toMatch(/\.kl-gname \{ font: 600 15px\/1\.35 var\(--ui\);/);
    expect(css).toMatch(/\.kl-gclient \{ font: var\(--type-body-sm\);[^}]*color: var\(--ink-2\); \}/);
    // The count is plain muted words, not a chip; no shadow, wash or gradient on a card.
    expect(css).toMatch(/\.kl-gcount \{ color: var\(--ink-2\); \}/);
    expect(css).not.toMatch(/linear-gradient|radial-gradient/);
    expect(css).not.toMatch(/\.kl-group[^{]*\{[^}]*box-shadow/);
  });

  it("marks the open card by a stronger neutral border and a soft wash on its header, with no bar on one side", () => {
    const css = src("calls.css");
    expect(css).toMatch(/\.kl-group\.is-open \{ border-color: var\(--rule\); \}/);
    expect(css).toMatch(/\.kl-group\.is-open > \.kl-ghead \{[^}]*background: color-mix\(in srgb, var\(--ink\) 3%, transparent\); \}/);
    expect(css).not.toMatch(/kl-gfx/);
    expect(src("CallsPage.tsx")).not.toContain("kl-gfx");
    // The chosen row is a plane and a ring all round.
    expect(css).toMatch(/\.kl-row\.is-on \{ background: var\(--sub\); box-shadow: inset 0 0 0 1px var\(--rule\); \}/);
    // The list (from its groups to its links) and the dialog carry orange only in thin lines and the band labels:
    // the lines' tokens, the labels' colour and the search's own highlight. No fill, no thick edge.
    const list = css.slice(css.indexOf("/* ── groups ──"), css.indexOf("/* ── buttons and links ── */")) + css.slice(css.indexOf("all of a campaign's calls"));
    for (const line of list.split("\n").filter((l) => /--accent/.test(l))) expect(line).toMatch(/kl-hit|\.kl-band \{[^}]*color: var\(--accent-text\)/);
    expect(css).toMatch(/\.kl-gbtn:focus-visible \{ outline: 2px solid var\(--focus\);/);
  });

  it("shows a thin neutral bar of how much connected, in two tones of the ink", () => {
    const css = src("calls.css");
    expect(css).toMatch(/\.kl-gbar \{[^}]*height: 3px;[^}]*background: var\(--rule\); \}/);
    expect(css).toMatch(/\.kl-gbar > i \{[^}]*background: var\(--ink-2\); \}/);
    expect(connectedShare(6, 14)).toBe(43);
    expect(connectedShare(undefined, 14)).toBeNull();
    expect(connectedShare(3, 0)).toBeNull();
    expect(src("CallsPage.tsx")).toContain("{connected} of {g.count} connected");
  });

  it("reads an outcome in one of two tones of the ink: what happened with a person, and what did not", () => {
    const tones = new Set(Object.values(OUTCOME_TONE));
    expect([...tones].sort()).toEqual(["ink", "muted"]);
    expect(OUTCOME_TONE.connected).toBe("ink");
    expect(OUTCOME_TONE.call_back).toBe("ink");
    for (const o of ["no_answer", "voicemail", "not_interested", "failed"] as const) expect(OUTCOME_TONE[o]).toBe("muted");
    // The word is always written, never only a colour.
    expect(OUTCOME_LABEL.no_answer).toBe("No answer");
  });
});

describe("the page's figures", () => {
  it("are one plain line: calls, campaigns and how many connected, in singular where there is one", () => {
    expect(summaryLine({ calls: 96, campaigns: 10, connectedPct: 48 })).toBe("96 calls, 10 campaigns, 48% connected");
    expect(summaryLine({ calls: 1, campaigns: 1, connectedPct: 0 })).toBe("1 call, 1 campaign, 0% connected");
    // Nothing is made up when a figure cannot be said.
    expect(summaryLine({ calls: 3, campaigns: 0, connectedPct: null })).toBe("3 calls");
    expect(summaryLine({ calls: 1200, campaigns: 2, connectedPct: null })).toBe("1,200 calls, 2 campaigns");
  });

  it("sit under the title as text, with no tiles, and the header is without them until there is something to count", () => {
    const html = renderToStaticMarkup(<CallsHead standing="owner" totals={{ calls: 96, campaigns: 10, connectedPct: 48 }} />);
    expect(html).toContain('<p class="kl-total">96 calls, 10 campaigns, 48% connected</p>');
    expect(html).not.toContain("kl-tile");
    expect(renderToStaticMarkup(<CallsHead standing="owner" totals={null} />)).not.toContain("kl-total");
    const css = src("calls.css");
    expect(css).not.toMatch(/\.kl-tile/);
  });

  it("give the whole share across groups, and nothing when a group's count is missing", () => {
    expect(connectedPercent([3, 1], 8)).toBe(50);
    expect(connectedPercent([3, undefined], 8)).toBeNull();
    expect(connectedPercent([], 0)).toBeNull();
  });

  it("name two callers with the same first name by their whole names, and one alone by hers", () => {
    expect(byCaller([
      { id: "a", name: "Fn3 Admin", count: 4, mine: false },
      { id: "b", name: "Fn3 Owner", count: 2, mine: true },
      { id: "c", name: "Meera Shah", count: 3, mine: false },
    ])).toEqual([
      { id: "a", name: "Fn3 Admin", count: 4 },
      { id: "c", name: "Meera", count: 3 },
      { id: "b", name: "Fn3 Owner", count: 2 },
    ]);
  });
});

describe("a call's line", () => {
  const row = {
    id: "c1", at: new Date(NOW - 30 * 60_000).toISOString(), durationSeconds: 57, direction: "outbound" as const, outcome: "connected" as const,
    outcomeText: null, phone: "+919845012345", candidate: { id: "p1", name: "Bhavana Pillai", title: null, company: null },
    caller: { id: "u1", name: "Meera Shah", mine: false }, campaign: null, summary: "Open to the role, 90 day notice",
    preview: null, summaryState: "none" as const, hasRecording: false, hasTranscript: false,
  };

  it("has a chip with the candidate's initials, the name over what it was about, and the outcome as a plain word", () => {
    const html = renderToStaticMarkup(<CallLine r={row} on={false} showCaller hit="" onOpen={() => {}} />);
    expect(html).toContain('class="kl-av" aria-hidden="true">BP<');
    expect(html).toContain("Bhavana Pillai");
    expect(html).toContain("Open to the role, 90 day notice");
    expect(html).toContain('data-st="ink"');
    expect(html).toContain("by Meera");
    expect(html).toContain("57 s");
    expect(byLine({ id: null, name: null, mine: false })).toBe("by a former teammate");
    // A call that was not answered is the muted tone.
    const quiet = renderToStaticMarkup(<CallLine r={{ ...row, outcome: "no_answer" }} on={false} showCaller={false} hit="" onOpen={() => {}} />);
    expect(quiet).toContain('data-st="muted"');
  });

  it("is only the person and the outcome when nothing was written, and a phone for a number with no name", () => {
    const html = renderToStaticMarkup(<CallLine r={{ ...row, summary: null, candidate: null }} on showCaller={false} hit="" onOpen={() => {}} />);
    expect(html).not.toContain("kl-sum");
    expect(html).not.toContain("kl-by");
    expect(html).toContain("kl-av is-number");
    expect(html).toContain("+919845012345");
    expect(html).toContain('aria-pressed="true"');
  });

  it("has a neutral chip, and a chosen row is a neutral plane with a ring", () => {
    const css = src("calls.css");
    expect(css).toMatch(/\.kl-av \{[^}]*width: 34px; height: 34px; border-radius: 50%;\s*background: var\(--sub\); color: var\(--ink-2\);/);
    expect(css).toMatch(/\.kl-row\.is-on \{ background: var\(--sub\); box-shadow: inset 0 0 0 1px var\(--rule\); \}/);
    expect(css).toMatch(/\.kl-row:hover \{ background: var\(--sub\); \}/);
  });
});

describe("a campaign's card and its dialog", () => {
  const page = src("CallsPage.tsx");
  const modal = src("CallsModal.tsx");
  const css = src("calls.css");

  it("shows at most eight calls and then the way to all of them, in a dialog", () => {
    expect(GROUP_ROWS).toBe(8);
    expect(page).toContain("rowsOf.items.slice(0, GROUP_ROWS)");
    expect(page).toContain("g.count > GROUP_ROWS");
    expect(page).toContain("View all {g.count} calls");
    expect(page).toContain('aria-haspopup="dialog"');
    // The calls on no campaign have a dialog too (the server's "none").
    expect(page).toContain("setAll({ id: key,");
    expect(page).not.toContain("disabled={!g.campaign}");
  });

  it("has its own search and outcome filter, a header with the campaign, client and count, and its own scroll", () => {
    expect(modal).toContain('aria-label="Search these calls"');
    expect(modal).toContain('aria-label="Outcome"');
    expect(modal).toContain('<h2 className="klm-title');
    expect(modal).toContain("callCount(group.count)");
    expect(modal).toContain("group.client");
    expect(modal).toContain('className="klm-body"');
    expect(css).toMatch(/\.klm-body \{[^}]*overflow-y: auto;/);
    // The dialog is the console's own: Esc, a focus trap and the whole screen on a phone.
    expect(modal).toContain('import { Dialog } from "./ui"');
    expect(css).toMatch(/@media \(max-width: 700px\) \{\s*\.klm \{ height: 100%; \}/);
    // As quiet as the list: the neutral chip and a plain count, no colour of its own.
    expect(modal).toContain('<span className="kl-gchip" aria-hidden="true">');
    expect(css).toMatch(/\.klm-count \{ font-variant-numeric: tabular-nums; \}/);
  });

  it("walks the lines with Up and Down (Down from the search box goes in), and Enter opens the call in the sheet", () => {
    expect(modal).toContain('e.key === "ArrowDown" && rows[0]');
    expect(modal).toContain('if (e.key === "ArrowUp" && at === 0)');
    expect(modal).toContain("onOpen={onOpen}");
    // The sheet's own stepping leaves a call opened from the dialog alone (it is not one of the page's lines).
    expect(page).toContain("apartRow?.id === openId && !rows.some((r) => r.id === openId)");
  });

  it("comes back, where it was, when the call opened from it is closed", () => {
    expect(page).toContain("if (back) { setAll(back.group); return; }");
    expect(page).toContain("focusId={back?.id ?? null}");
    expect(modal).toContain('data-kl-row="${CSS.escape(focusId)}"');
  });

  it("pages a campaign's own calls by fifty, and the list never pages in the card", () => {
    const hook = src("useCalls.ts");
    expect(hook).toContain("const OWN_PAGE = 50;");
    expect(hook).toContain("limit: campaignId ? OWN_PAGE : PAGE");
    expect(page).toContain("flat && rowsOf.next");
    expect(page).toContain("data.loadMore(key)");
    expect(page).toContain('"Load more"');
  });

  it("reads one count more than the groups, not three: how many connected", () => {
    const hook = src("useCalls.ts");
    expect(hook).toContain('readGroups({ ...filters, outcome: "connected" })');
    expect(hook).not.toContain("not_interested");
    expect(hook).not.toContain('"call_back"');
  });

  it("keeps the labels where the calls move from today to this week to earlier, in the brand's text colour with a faint orange line", () => {
    expect(page).toContain("BAND_LABEL[band]");
    // 13px at 600 in the accent text token (4.5:1 on the page in both themes), and a 1px line in the accent at 28 percent.
    expect(css).toMatch(/\.kl-band \{[^}]*font: 600 13px\/1\.3 var\(--ui\);[^}]*color: var\(--accent-text\); \}\s*\.kl-band::after \{ content: ""; flex: 1; height: 1px; background: var\(--kl-band-line\); \}/);
    expect(css).toMatch(/--kl-band-line: color-mix\(in srgb, var\(--accent-fill\) 28%, transparent\);/);
    expect(css).not.toMatch(/\.kl-band::before/);
  });

  it("draws the thin lines of the list and the dialog in a faint warm orange: between rows, under a header, above a foot", () => {
    expect(css).toMatch(/--kl-line: color-mix\(in srgb, var\(--accent-fill\) 14%, transparent\);/);
    for (const rule of [
      /\.kl-rows > li \+ li \{ border-top: 1px solid var\(--kl-line\); \}/,
      /\.kl-group\.is-open > \.kl-ghead \{ border-bottom: 1px solid var\(--kl-line\); \}/,
      /\.kl-gfoot \{[^}]*border-top: 1px solid var\(--kl-line\);/,
      /\.klm-head \{[^}]*border-bottom: 1px solid var\(--kl-line\);/,
      /\.klm-bar \{[^}]*border-bottom: 1px solid var\(--kl-line\); \}/,
    ]) expect(css).toMatch(rule);
    // The same rows are the campaign page's and the dialog's: one class, one line. Card borders stay neutral.
    expect(css).toMatch(/\.kl-group \{\s*position: relative; border: 1px solid var\(--hairline\);/);
    expect(css).toMatch(/\.kl-group\.is-open \{ border-color: var\(--rule\); \}/);
  });
});

describe("the page is wired in", () => {
  it("has its own route in the nav, a campaign's page, and reads writes through invalidate", () => {
    const nav = src("nav.ts");
    expect(nav).toContain('{ kind: "leaf", id: "calls", label: OUTREACH_LABEL, Icon: PaperPlaneTilt }');
    expect(nav).toContain('export const OUTREACH_LABEL = "Outreach";');
    expect(src("Console.tsx")).toContain('route === "calls" ? (');
    expect(src("Console.tsx")).toContain('route === "campaign-calls" ? (');
    expect(src("useCalls.ts")).toContain('effects.has("calls")');
    // No second store of recordings in the browser: they come from the API.
    expect(src("callMedia.ts")).not.toContain("useSyncExternalStore");
  });
});
