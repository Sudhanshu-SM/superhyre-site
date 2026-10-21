import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Brief } from "../orchestrator";
import { BRIEFS } from "../orchestrator";
import { HISTORY_SLOTS, Rail } from "../Rail";
import type { ConfigRow } from "../railConfig";
import { CAMPAIGN_SLOTS, NOT_SET, WORKSPACE_SLOTS, railSlots } from "../railConfig";

/**
 * The Agent page's rail never changes its top or its height: it draws the same panels, the same seven
 * Configuration rows and the same three history slots whatever is set, still arriving or missing. Geometry is
 * the stylesheet's (pinned below); what these pin is that the markup is the same shape in every state.
 */

const css = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const campaign = { id: "c1", name: "Data Analyst", role: "" };
const noop = () => {};

const render = (props: Partial<Parameters<typeof Rail>[0]> = {}) =>
  renderToStaticMarkup(
    <Rail campaign={campaign} activeBriefId={null} onNewBrief={noop} onPickBrief={noop} {...props} />,
  );
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const rowsIn = (html: string) => count(html, /class="rail-row[ "]/g);
const slotsIn = (html: string) => count(html, /class="rail-brief(?:-slot)?[ "]/g);

const chats = (n: number): Brief[] => Array.from({ length: n }, (_, i) => ({ ...BRIEFS[0]!, id: `b${i}`, title: `Chat ${i}` }));
const pending = (label: string): ConfigRow => ({ label, pending: true });
const set = (label: string, value: string): ConfigRow => ({ label, value });

describe("the Configuration rows", () => {
  it("are the same seven for a campaign and for the workspace, always in this order", () => {
    expect(CAMPAIGN_SLOTS).toEqual(["Owner", "Collaborators", "Visibility", "Job description", "Filters", "Channels", "Intake"]);
    expect(WORKSPACE_SLOTS).toEqual(["Owner", "Team", "Campaigns", "Job description", "Filters", "Channels", "Intake"]);
    expect(CAMPAIGN_SLOTS).toHaveLength(WORKSPACE_SLOTS.length);
  });

  it("fill every slot whatever rows came: none, some, or all still on their way", () => {
    const states: ConfigRow[][] = [
      [],
      [set("Owner", "Asha")],
      CAMPAIGN_SLOTS.map(pending),
      CAMPAIGN_SLOTS.map((l) => set(l, "x")),
    ];
    for (const rows of states) {
      for (const layout of ["campaign", "workspace"] as const) {
        const slots = railSlots(layout, rows, { inOrg: true });
        expect(slots.map((s) => s.label)).toEqual(layout === "campaign" ? [...CAMPAIGN_SLOTS] : [...WORKSPACE_SLOTS]);
      }
    }
  });

  it("says Not set in muted text for a field with nothing in it, and holds a loading row's place", () => {
    const [owner, , , jd] = railSlots("campaign", [pending("Owner")], { inOrg: true });
    expect(owner).toMatchObject({ loading: true, label: "Owner" });
    expect(jd).toMatchObject({ value: NOT_SET, empty: true, loading: false });
  });

  it("makes the Channels row two lines tall in every state, and no other row", () => {
    const states = [[], [pending("Channels")], [{ label: "Channels", value: "2 of 3", notes: [{ text: "Reconnect Slack", href: "#/settings/connections" }] } as ConfigRow]];
    for (const rows of states) {
      const slots = railSlots("campaign", rows, { inOrg: true });
      expect(slots.filter((s) => s.twoLine).map((s) => s.label)).toEqual(["Channels"]);
    }
    const channels = railSlots("campaign", states[2]!, { inOrg: true }).find((s) => s.label === "Channels");
    expect(channels).toMatchObject({ value: "2 of 3", note: "Reconnect Slack" });
    expect(channels?.name).toBe("Channels, 2 of 3. Reconnect Slack");
  });

  it("gives every row somewhere to go, and a row that failed goes to its retry", () => {
    const retry = vi.fn();
    const slots = railSlots(
      "workspace",
      [{ label: "Campaigns", value: "Couldn't load", failed: true, retry }],
      { inOrg: true },
    );
    for (const s of slots) expect("href" in s.go || typeof s.go.onClick === "function", s.label).toBe(true);
    const campaigns = slots.find((s) => s.label === "Campaigns")!;
    expect(campaigns.value).toMatch(/Couldn't load/);
    expect("onClick" in campaigns.go && campaigns.go.onClick).toBe(retry);
  });

  it("sends the rows where their names say: members, campaigns, connections, and a dialog when one is given", () => {
    const open = vi.fn();
    const slots = railSlots("workspace", [], { inOrg: true, go: { "Job description": { onClick: open } } });
    const by = Object.fromEntries(slots.map((s) => [s.label, s.go]));
    expect(by.Owner).toEqual({ href: "#/teams" });
    expect(by.Team).toEqual({ href: "#/teams" });
    expect(by.Campaigns).toEqual({ href: "#/campaigns" });
    expect(by.Channels).toEqual({ href: "#/settings/connections" });
    expect(by["Job description"]).toEqual({ onClick: open });
  });

  it("says what Personal has instead of a blank: just you, only you", () => {
    const slots = railSlots("campaign", [], { inOrg: false });
    expect(slots.find((s) => s.label === "Collaborators")).toMatchObject({ value: "Just you", empty: false });
    expect(slots.find((s) => s.label === "Visibility")).toMatchObject({ value: "Only you", empty: false });
  });
});

describe("the rail's markup", () => {
  it("has seven whole-row targets and three history slots with a View all row, in every state", () => {
    const states: Array<Partial<Parameters<typeof Rail>[0]>> = [
      {},
      { statsState: "loading", history: "ready", briefs: [] },
      { statsState: "failed", history: "failed", briefs: [] },
      { briefs: chats(1), config: { scope: "All campaigns", rows: [], layout: "workspace" } },
      { briefs: chats(2), config: { scope: "Data Analyst", rows: CAMPAIGN_SLOTS.map(pending), layout: "campaign" } },
      { briefs: chats(90), config: { scope: "All campaigns", rows: [set("Owner", "You")], layout: "workspace" } },
    ];
    const loaded = states.slice(0, 1).concat(states.slice(3));
    for (const s of loaded) {
      const html = render(s);
      expect(rowsIn(html)).toBe(7);
      expect(slotsIn(html)).toBe(HISTORY_SLOTS);
      expect(html).toContain("rail-more");
    }
    // Still arriving or failed: the same seven rows; the history holds its body's height instead of its slots.
    for (const s of states.slice(1, 3)) {
      const html = render(s);
      expect(rowsIn(html)).toBe(7);
      expect(html).toContain("rail-hist-body");
      expect(html).toContain("rail-more");
    }
  });

  it("renders every Configuration row as one link or button, not a text link inside a row", () => {
    const html = render({ config: { scope: "All campaigns", rows: [], layout: "workspace" } });
    const rows = html.match(/<(a|button)[^>]*class="rail-row[^>]*>[\s\S]*?<\/\1>/g) ?? [];
    expect(rows).toHaveLength(7);
    for (const r of rows) expect(r, r.slice(0, 60)).not.toMatch(/<a [^>]*rail-config-act|<button[^>]*rail-config-act/);
  });

  it("puts a fixed 90px week where the week is, loading, failed or ready", () => {
    for (const statsState of ["loading", "failed", "ready"] as const) {
      const html = render({ statsState });
      expect(html).toMatch(/rail-stats(-wait)?/);
    }
    const sheet = css("chat.css");
    expect(sheet).toMatch(/--rail-stats: 90px;/);
    expect(sheet).toMatch(/\.orc-rail \.rail-stats,\s*\.orc\.is-agent \.orc-rail \.rail-stats-wait \{[^}]*height: var\(--rail-stats\)/);
  });

  it("keeps the agents' panel above the week, so what comes and goes never moves the three fixed panels", () => {
    const html = render({ agents: <section className="rail-sec" id="watching">watching</section> });
    expect(html.indexOf("watching")).toBeLessThan(html.indexOf("Last 7 days"));
  });
});

describe("the rail's measurements", () => {
  const sheet = css("chat.css");

  it("fixes the row heights: 40px, and 60px for the two-line Channels row", () => {
    expect(sheet).toMatch(/--rail-row: 40px;/);
    expect(sheet).toMatch(/--rail-row-two: 60px;/);
    expect(sheet).toMatch(/\.orc-rail \.rail-row \{[^}]*height: var\(--rail-row\)/);
    expect(sheet).toMatch(/\.orc-rail \.rail-row\.is-two \{ height: var\(--rail-row-two\); \}/);
  });

  it("makes every row a hover wash with a focus ring and a pointer", () => {
    expect(sheet).toMatch(/\.orc-rail \.rail-row \{[^}]*cursor: pointer/);
    expect(sheet).toMatch(/\.orc-rail \.rail-row:hover \{ background: var\(--sub\); \}/);
    expect(sheet).toMatch(/\.orc-rail \.rail-row:focus-visible \{ outline: 2px solid var\(--focus\)/);
  });

  it("fixes the history: three slots of one height, one View all row", () => {
    expect(HISTORY_SLOTS).toBe(3);
    expect(sheet).toMatch(/--rail-slot: 48px;/);
    expect(sheet).toMatch(/\.orc-rail \.rail-hist-body \{ height: calc\(var\(--rail-slot\) \* 3\)/);
    expect(sheet).toMatch(/\.orc-rail \.rail-briefs\.is-inline > li \{ height: var\(--rail-slot\); \}/);
    expect(sheet).toMatch(/--rail-more: 36px;/);
  });
});
