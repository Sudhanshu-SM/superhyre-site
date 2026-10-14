import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScheduledItem } from "../api/schedules";
import { List } from "../ComingUp";
import { COMING_UP_SHOWN } from "../HomeComing";
import type { Feed } from "../schedulesStore";
import { UPCOMING } from "../schedulesStore";

/**
 * Coming up on Home: the agent's reminders and follow-ups, the next five, soonest first, each with a way to change
 * its time or call it off (the same rows as the full list). It replaces the section that used to sit under
 * Settings, Memory, which is not a Settings page any more.
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

const NOW = Date.parse("2026-10-10T09:00:00Z");
const at = (n: number) => new Date(NOW + n * 3_600_000).toISOString();
const item = (n: number): ScheduledItem => ({
  id: `s${n}`, kind: "reminder", title: `Reminder ${n}`, status: "scheduled", runAt: at(n), nextRunAt: at(n),
  timezone: "Asia/Kolkata", repeat: "none", until: null, occurrencesDone: 0, summary: `Reminder: 'Call person ${n}'`, campaign: null,
  candidate: null, createdBy: { kind: "user", id: "u1", name: "Asha Rao" }, approvedBy: null, lastError: null, lastRunAt: null,
  result: null, canCancel: true,
});
const feed = (items: ScheduledItem[], next: string | null = null): Feed => ({ phase: "ready", items, next, more: "idle", at: NOW });

const render = (f: Feed, over: { filtered?: boolean } = {}) =>
  renderToStaticMarkup(
    <List
      feed={f} query={UPCOMING} empty="upcoming" filtered={over.filtered ?? false} viewerId="u1" zone="Asia/Kolkata" now={NOW}
      onClear={() => undefined} limit={COMING_UP_SHOWN} compact
    />,
  );

describe("Coming up on Home", () => {
  it("shows the next five, soonest first, and offers the rest", () => {
    // Arrived out of order, as a feed with a repeating item can.
    const html = render(feed([item(30), item(2), item(9), item(4), item(1), item(20), item(6)]));
    const rows = html.match(/class="sc-row/g) ?? [];
    expect(rows).toHaveLength(5);
    expect(COMING_UP_SHOWN).toBe(5);
    expect(html.indexOf("person 1&#x27;")).toBeLessThan(html.indexOf("person 2&#x27;"));
    expect(html).toContain("Call person 9");
    expect(html).not.toContain("Call person 20");
    expect(html).not.toContain("Call person 30");
    expect(html).toContain("Show all 7");
  });

  it("gives each one a way to change its time and to call it off", () => {
    const html = render(feed([item(1)]));
    expect(html).toContain("Change time");
    expect(html).toContain(">Cancel<");
    expect(html).not.toContain("Show all");
  });

  it("stacks its rows for a narrow tile", () => {
    expect(render(feed([item(1)]))).toContain('class="sc-list is-compact"');
  });

  it("is the same empty card as every other on Home when nothing is coming up: picture, headline, one line, one action", () => {
    const html = render(feed([]));
    expect(html).toContain('class="hm-es is-short"');
    expect(html).toContain("Nothing coming up");
    expect(html).toContain("Ask the agent to remind you of something, or to follow up later.");
    expect(html).toContain('href="#/agent"');
    expect(html).toMatch(/<img[^>]*empty-schedules/);
    expect(render(feed([]), { filtered: true })).toContain("Nothing coming up for this campaign");
  });

  it("is on Home when the console is live, under the same scope as the page", () => {
    expect(src("Home.tsx")).toMatch(/\{LIVE && <ComingUpCard scope=\{scope\} timeZone=\{timeZone \?\? browserZone\(\)\} \/>\}/);
    expect(src("HomeComing.tsx")).toContain("isScoped(scope) ? scope : null");
    // The My tasks tile's group of later work is not a second "Coming up" on the same screen.
    expect(src("HomeCards.tsx")).not.toContain('title: "Coming up"');
    expect(src("HomeCards.tsx")).toContain('title: "Later"');
  });
});

describe("Do not contact is reached from a person, not from Settings", () => {
  it("offers 'Do not contact' in a person's menu, and 'Allow contact again' to an admin once they are listed", () => {
    const menu = src("CampaignWorkspace.tsx");
    expect(menu).toContain('{listed ? "Allow contact again" : "Do not contact"}');
    expect(menu).toContain("(!listed || mayAllowAgain)");
    expect(menu).toContain('useCan("contact.allowAgain")');
  });

  it("has no Settings entry, palette entry or page title for Memory or Do not contact", () => {
    for (const f of ["Settings.tsx", "Palette.tsx", "pageTitle.ts"]) {
      const s = src(f);
      expect(s, f).not.toMatch(/"do-not-contact"|"memory"|id: "memory"/);
    }
  });
});
