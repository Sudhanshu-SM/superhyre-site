import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CallGroup } from "../api/calls";
import { byCaller, glanceOf, mergeNamed, namesCampaign, openGroups, orderGroups, outcomeLine } from "../callsView";
import { valueCell } from "../contactsModel";
import { MAX_CAMPAIGN_ROWS } from "../HomeCards";
import { readHidden, SL_COLUMNS } from "../SlColumns";

/** Four owner items of 13 Oct: Home's campaigns card, the Shortlisted table's Email and Phone, Calls by campaign. */

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("Home: the active campaigns card", () => {
  it("shows as many rows as fit (4 to 10), the rest behind one quiet link (13 Oct six, then the owner asked for the card to be filled)", () => {
    expect(MAX_CAMPAIGN_ROWS).toBe(10);
    const code = src("HomeCards.tsx");
    expect(code).toContain("Math.min(MAX_CAMPAIGN_ROWS, fit)");
    expect(code).toContain('<li className="hm-cl-more"><a href="#/campaigns">+{hidden} more<span>View all</span></a></li>');
  });

  it("is a three-column row of 58px with a 96px bar, tabular hires, a hairline rule and 24px padding", () => {
    const css = src("home.css");
    const v2 = css.slice(css.indexOf("active campaigns, v2"));
    expect(v2).toMatch(/\.hm-camps \{ --hm-tx: 24px;/);
    expect(v2).toMatch(/\.hm-camps > \.hm-th::after \{ display: none; \}/);
    expect(v2).toMatch(/\.hm-camps \.hm-cl \{ margin: 16px 0 12px;/);
    expect(v2).toMatch(/grid-template-columns: minmax\(0, 1fr\) 96px 80px;/);
    expect(v2).toMatch(/min-height: 58px; padding: 12px var\(--hm-ix\) 12px var\(--hm-ix\)/);
    expect(v2).toMatch(/\.hm-camps \.hm-cl-t strong \{ font: 500 15px\/18px/);
    expect(v2).toMatch(/\.hm-camps \.hm-cl-bar \{ width: 96px;/);
    expect(v2).toMatch(/\.hm-camps \.hm-cl-n \{ text-align: right; font-variant-numeric: tabular-nums;/);
  });
});

describe("Shortlisted: an Email column and a Phone column", () => {
  const base = { held: null, side: "none" as const, busy: false, known: true, valuesReady: true, lookupable: true, offered: true };

  it("shows the value itself when it is held", () => {
    expect(valueCell({ ...base, held: "asha@zlice.com", side: "found" })).toEqual({ state: "value", value: "asha@zlice.com" });
  });

  it("says Not fetched with a Get for someone nobody has asked about, and Get is only there when offered", () => {
    expect(valueCell(base)).toEqual({ state: "not_fetched", words: "Not fetched", get: true });
    expect(valueCell({ ...base, offered: false })).toEqual({ state: "not_fetched", words: "Not fetched", get: false });
    expect(valueCell({ ...base, lookupable: false, offered: false })).toEqual({ state: "not_fetched", words: "No profile", get: false });
  });

  it("says Looking while it is being asked for, and Not found when the lookup missed", () => {
    expect(valueCell({ ...base, side: "looking" })).toEqual({ state: "looking", words: "Looking" });
    expect(valueCell({ ...base, busy: true })).toEqual({ state: "looking", words: "Looking" });
    expect(valueCell({ ...base, side: "not_found" })).toEqual({ state: "not_found", words: "Not found" });
  });

  it("says On file (or Loading, until the values arrive) when it is found and not yet shown", () => {
    expect(valueCell({ ...base, side: "found" })).toEqual({ state: "on_file", words: "On file" });
    expect(valueCell({ ...base, side: "found", valuesReady: false })).toEqual({ state: "on_file", words: "Loading" });
  });

  it("stays blank until the board says who has what", () => {
    expect(valueCell({ ...base, known: false })).toEqual({ state: "blank" });
  });

  it("has Email and Phone in the column chooser, shown by default, 200px each", () => {
    expect(SL_COLUMNS.map((c) => c.id)).toEqual(expect.arrayContaining(["email", "phone"]));
    expect(readHidden(null).size).toBe(0);
    expect([...readHidden(JSON.stringify(["phone", "nope", 3]))]).toEqual(["phone"]);
    expect(readHidden("not json").size).toBe(0);
    const css = src("contactsFetch.css");
    expect(css).toMatch(/\.sl-c-email, \.sl-c-phone \{ width: 200px; \}/);
    const table = src("CampaignWorkspace.tsx");
    expect(table).toContain('<th className="sl-c-email">Email</th>');
    expect(table).toContain('<th className="sl-c-phone">Phone</th>');
    expect(table).not.toContain("Contact details</th>");
  });

  it("takes the values from the workspace's own candidate rows, never from the shared pool", () => {
    const code = src("contactValues.ts");
    expect(code).toContain("listCandidates({ campaignId");
    expect(code).toContain("next.set(r.id, { email: r.email, phone: r.phone })");
  });
});

describe("Calls by campaign", () => {
  const g = (id: string | null, name: string, count: number, lastAt: string, client: string | null = null): CallGroup => ({
    campaign: id ? { id, name, client } : null, count, lastAt,
  });

  it("matches a word against the campaign's name and its client, without caring for case or accents", () => {
    expect(namesCampaign("backend", { name: "fn4 Backend Engineer" })).toBe(true);
    expect(namesCampaign("ZLICE", { name: "Data Analyst", client: "Zlice Pvt Limited" })).toBe(true);
    expect(namesCampaign("crème", { name: "Creme brûlée chef" })).toBe(true);
    expect(namesCampaign("designer", { name: "Data Analyst", client: "Zlice" })).toBe(false);
    expect(namesCampaign("", { name: "x" })).toBe(false);
    expect(namesCampaign("x", null)).toBe(false);
  });

  it("adds the campaigns a word names to the ones with a matching call, with all their calls", () => {
    const found = [g("a", "Data Analyst", 1, "2026-10-12T10:00:00Z")];
    const all = [
      g("a", "Data Analyst", 4, "2026-10-12T10:00:00Z"),
      g("b", "Backend Engineer", 6, "2026-10-11T10:00:00Z", "Zlice"),
      g("c", "Designer", 2, "2026-10-10T10:00:00Z"),
    ];
    const r = mergeNamed(found, all, "backend");
    expect(r.groups.map((x) => x.campaign?.id)).toEqual(["a", "b"]);
    expect(r.groups.find((x) => x.campaign?.id === "b")?.count).toBe(6);
    expect([...r.byName]).toEqual(["b"]);
    // A word that names a campaign which already has matching calls shows all of that campaign's calls.
    const again = mergeNamed(found, all, "data analyst");
    expect(again.groups.find((x) => x.campaign?.id === "a")?.count).toBe(4);
    expect([...again.byName]).toEqual(["a"]);
    // No word, or no wider answer: what the server said.
    expect(mergeNamed(found, all, "").groups).toEqual(found);
    expect(mergeNamed(found, null, "backend").groups).toEqual(found);
  });

  it("keeps the most recent group open and the calls on no campaign last", () => {
    const groups = [g(null, "", 3, "2026-10-13T10:00:00Z"), g("a", "A", 1, "2026-10-01T10:00:00Z"), g("b", "B", 2, "2026-10-12T10:00:00Z")];
    expect(orderGroups(groups).map((x) => x.campaign?.id ?? "none")).toEqual(["b", "a", "none"]);
    expect(openGroups(groups, {})).toEqual({ b: true, a: false, none: false });
    // What the person chose is kept.
    expect(openGroups(groups, { a: true, b: false })).toEqual({ b: false, a: true, none: false });
  });

  it("says a group's outcomes in plain words, and nothing when there is nothing to say", () => {
    expect(outcomeLine({ connected: 3, callBack: 2 })).toBe("3 connected, 2 to call back");
    expect(outcomeLine({ connected: 1, callBack: 0 })).toBe("1 connected");
    expect(outcomeLine({ connected: 0, callBack: 0 })).toBe("");
    expect(outcomeLine(undefined)).toBe("");
  });

  it("opens a campaign's page with its figures: total, connected rate, average length, last call", () => {
    const rows = [{ durationSeconds: 42 }, { durationSeconds: 54 }, { durationSeconds: null }];
    expect(glanceOf({ total: 4, connected: 3, rows, lastAt: "2026-10-12T10:00:00Z" })).toEqual({
      total: 4, connectedPct: 75, averageSeconds: 48, lastAt: "2026-10-12T10:00:00Z",
    });
    // Calm when empty, and a rate is not guessed when one outcome is picked.
    expect(glanceOf({ total: 0, connected: 0, rows: [], lastAt: null })).toEqual({ total: 0, connectedPct: null, averageSeconds: null, lastAt: null });
    expect(glanceOf({ total: 5, connected: null, rows, lastAt: "x" }).connectedPct).toBeNull();
  });

  it("lists the callers most calls first, by first name", () => {
    const callers = [
      { id: "u2", name: "Anand Rao", count: 2, mine: false },
      { id: "u1", name: "Meera Shah", count: 5, mine: true },
      { id: "u3", name: null, count: 1, mine: false },
    ];
    expect(byCaller(callers)).toEqual([
      { id: "u1", name: "Meera", count: 5 },
      { id: "u2", name: "Anand", count: 2 },
      { id: "u3", name: "A", count: 1 },
    ]);
  });

  it("searches by campaign too, and opens the groups it finds while searching", () => {
    const page = src("CallsPage.tsx");
    expect(page).toContain("Search by name, campaign, note or what was said");
    expect(page).toContain("const searching = Boolean(dq) && !flat;");
    expect(page).toContain("searching ? Object.fromEntries(data.groups.map((g) => [groupKey(g), !searchShut.has(groupKey(g))])) : opened");
    expect(page).toContain('className="kl-glance"');
    expect(src("useCalls.ts")).toContain("mergeNamed(g.groups, all?.groups ?? null, word ?? \"\")");
  });
});
