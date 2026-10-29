import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The daily search in the console (docs/plans/daily-search.md, Phases 1 and 2): a text button on the Campaigns page that opens the Daily
 * search popup (dailySearchDialog.test.tsx), shown only while the server has the search switched on; the agent's question is the ordinary choice card, with
 * several picks and "All open campaigns" as the way out to take; its approval card says what it will not do itself; a campaign of it
 * has no end to show.
 */

const on = { value: true };
vi.mock("../api/client", async (orig) => ({ ...(await orig<typeof import("../api/client")>()), LIVE: true }));
vi.mock("../api/agent", async (orig) => {
  const m = await orig<typeof import("../api/agent")>();
  return { ...m, agentApi: { ...m.agentApi, dailySearch: vi.fn(async () => ({ on: on.value })) } };
});

import { agentApi } from "../api/agent";
import { ChoiceCard, pickChoice, readyToContinue } from "../agentCards/ChoiceCard";
import { wontDo } from "../agentCards/outcome";
import { DailySearchButton, dailySearchOn, forgetDailySearch } from "../DailySearchButton";
import { questionChoices, type Question } from "../liveChat";
import { stepsOf, type WatchAgent } from "../liveAgents";

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

beforeEach(() => {
  forgetDailySearch();
  on.value = true;
  vi.mocked(agentApi.dailySearch).mockClear();
});

describe("the Daily search button on the Campaigns page", () => {
  it("is a text button that opens the daily search popup, in the page's header beside the new-campaign button", () => {
    const html = renderToStaticMarkup(<DailySearchButton on />);
    expect(html).toBe('<button type="button" class="cg-daily">Daily search</button>');
    expect(src("DailySearchButton.tsx")).toContain("onClick={() => setOpen(true)}");
    expect(src("DailySearchButton.tsx")).toContain("<DailySearchDialog open={open} onClose={() => setOpen(false)} />");
    expect(src("CampaignsPage.tsx")).toContain("{mayCreate && <DailySearchButton />}");
  });

  it("is not there while the server has the daily search off", () => {
    expect(renderToStaticMarkup(<DailySearchButton on={false} />)).toBe("");
  });

  it("asks the server once whether it is on, and asks again after a failure rather than hiding the button for good", async () => {
    expect(await dailySearchOn()).toBe(true);
    expect(await dailySearchOn()).toBe(true);
    expect(agentApi.dailySearch).toHaveBeenCalledTimes(1);
    forgetDailySearch();
    vi.mocked(agentApi.dailySearch).mockRejectedValueOnce(new Error("offline"));
    expect(await dailySearchOn()).toBe(false);
    expect(await dailySearchOn()).toBe(true);
  });

  it("is in the header's own group, with a text style that is not the filled button's", () => {
    const css = src("campaigns-page.css");
    expect(css).toMatch(/\.cg-head-acts \{[^}]*display: flex/);
    expect(css).toMatch(/\.cg-daily \{[^}]*background: none/);
  });
});

describe("the question about which campaigns", () => {
  const picks = Array.from({ length: 51 }, (_, i) => ({ id: `c${i}`, name: `Role ${i}, Pune: 4 found`, text: "Search every morning for the campaigns I picked" }));
  const ask: Question = {
    kind: "watch_setup", text: "Which campaigns should I search every morning?", runId: "r1", seq: 2,
    note: "36 need their requirements approved.", multi: { min: 1, max: 60 },
    choices: [
      ...picks,
      { id: "all", name: "All open campaigns", text: "Search every morning for all my open campaigns", quiet: true, lead: true },
      { id: "not_now", name: "Not now", text: "Not now", quiet: true },
    ],
  };

  it("is the ordinary choice card: several picks up to 60, a search box above 8, the note under the question", () => {
    const html = renderToStaticMarkup(<ChoiceCard question={ask} onAnswer={() => {}} />);
    expect(html).toContain("Which campaigns should I search every morning?");
    expect(html).toContain("36 need their requirements approved.");
    expect(html).toContain('type="search"');
    expect(html).toContain('role="group"');
    expect(html.match(/role="checkbox"/g)).toHaveLength(51);
    expect(html).toContain(">Continue<");
    // Several can be picked, and up to sixty of them are one answer.
    let chosen: string[] = [];
    for (const p of picks) chosen = pickChoice(ask, chosen, p.id);
    expect(chosen).toHaveLength(51);
    expect(readyToContinue(ask, chosen, "")).toBe(true);
    expect(readyToContinue(ask, [], "")).toBe(false);
  });

  it("offers 'All open campaigns' as the way out to take, in the accent, and 'Not now' as a quiet skip", () => {
    const html = renderToStaticMarkup(<ChoiceCard question={ask} onAnswer={() => {}} />);
    expect(html).toMatch(/class="ch-lead"[^>]*>All open campaigns<\/button>/);
    expect(html).toMatch(/class="ch-skip"[^>]*>Not now<\/button>/);
    expect(src("agentCards/choiceCard.css")).toMatch(/\.ch-lead \{[^}]*color: var\(--accent-text\)/);
  });

  it("is read from the server's question with its lead choice and its limits", () => {
    const read = questionChoices([
      { id: "all", name: "All open campaigns", text: "x", quiet: true, lead: true },
      { id: "not_now", name: "Not now", text: "y", quiet: true },
      { id: "a", name: "A", text: "z" },
    ]);
    expect(read).toEqual([
      { id: "all", name: "All open campaigns", text: "x", quiet: true, lead: true },
      { id: "not_now", name: "Not now", text: "y", quiet: true },
      { id: "a", name: "A", text: "z" },
    ]);
  });
});

describe("its card and its place in the rail", () => {
  it("says what it will not do in its own notes, and the watch's old line about stopping at the limit stays off it", () => {
    const daily = { action: "start_watch", wontDo: [], detail: { sweep: { scope: { all: true } } } };
    expect(wontDo(daily)).toEqual([]);
    // The watch with an end still says it stops by itself.
    expect(wontDo({ action: "start_watch", wontDo: [], detail: { campaignId: "c1", config: {} } })).toEqual([
      "It won't contact anyone, and it stops by itself at the limit.",
    ]);
    expect(wontDo({ action: "start_watch", wontDo: [] })).toHaveLength(1);
  });

  it("names a campaign of the daily search by what it does, not by an end it does not have", () => {
    const base: Pick<WatchAgent, "state" | "config"> = { state: "running", config: { stop: {}, cadence: "daily" } };
    expect(stepsOf(base)).toEqual(["Started", "Looking for people", "Finishes"]);
    expect(stepsOf({ ...base, config: { ...base.config, standing: { sweepId: "s1", perDay: 5 } } })).toEqual([
      "Started", "Looking for people", "Looks again every morning",
    ]);
  });
});
