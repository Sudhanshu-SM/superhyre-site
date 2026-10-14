import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { can } from "../can";
import type { Standing } from "../can";
import { CAMPAIGN_NAV, hashForStanding, navFor, routeAllowed, routeFromHash } from "../nav";
import { buildEntries } from "../Palette";
import { pageTitle } from "../pageTitle";

/**
 * Calls has two places and they are for different people: everyone's calls (the top-level page) for the
 * organisation's owner and admins and the one person of a personal workspace; a recruiter's calls are each
 * campaign's own Calls page, under the campaign.
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const STANDINGS: Standing[] = ["personal", "owner", "admin", "recruiter"];
const leaves = (s: Standing | undefined) => navFor(s).flatMap((sec) => sec.items.filter((i) => i.kind === "leaf").map((i) => i.id));

describe("who has everyone's calls", () => {
  it("is for the owner, an admin and a personal workspace's person, and not for a recruiter", () => {
    expect(STANDINGS.map((s) => can(s, "calls.all"))).toEqual([true, true, true, false]);
    for (const s of ["owner", "admin", "personal"] as const) expect(routeAllowed("calls", s)).toBe(true);
    expect(routeAllowed("calls", "recruiter")).toBe(false);
    // The nav and the router say what the one table says.
    for (const s of STANDINGS) expect(routeAllowed("calls", s)).toBe(can(s, "calls.all"));
    // Every other page is as it was, for everyone, and a campaign's own Calls most of all.
    for (const s of STANDINGS) {
      expect(routeAllowed("campaign-calls", s)).toBe(true);
      expect(routeAllowed("home", s)).toBe(true);
      expect(routeAllowed("contacts", s)).toBe(true);
    }
  });

  it("is a row in the sidebar for those three and none for a recruiter, whose Calls sit under each campaign", () => {
    for (const s of ["owner", "admin", "personal"] as const) expect(leaves(s)).toContain("calls");
    expect(leaves("recruiter")).not.toContain("calls");
    // The rest of the sidebar is the same for a recruiter.
    expect(leaves("recruiter")).toEqual(leaves("owner").filter((id) => id !== "calls"));
    expect(CAMPAIGN_NAV.map((n) => n.id)).toContain("campaign-calls");
    // Unknown standing takes nothing away (a first paint, a test): the page and the server decide.
    expect(leaves(undefined)).toContain("calls");
  });

  it("is an entry in quick find for those three, and for a recruiter only the campaign's own", () => {
    // Calls became Outreach; the Analytics page of that name is "Outreach results" in the sidebar and in quick find.
    const calls = (s: Standing) => buildEntries("Senior Backend", s).filter((e) => e.label === "Outreach").map((e) => `${e.group}:${e.id}`);
    expect(calls("owner")).toEqual(["Navigate:calls", "Senior Backend:campaign-calls"]);
    expect(calls("admin")).toEqual(["Navigate:calls", "Senior Backend:campaign-calls"]);
    expect(calls("personal")).toEqual(["Navigate:calls", "Senior Backend:campaign-calls"]);
    expect(calls("recruiter")).toEqual(["Senior Backend:campaign-calls"]);
  });
});

describe("a link to everyone's calls, for a recruiter", () => {
  it("opens their calls on the campaign the link names, else the one they are on, else Home", () => {
    expect(hashForStanding("#/calls", "recruiter", "k1")).toBe("#/campaign/outreach?campaign=k1");
    expect(hashForStanding("#/calls?campaign=k9", "recruiter", "k1")).toBe("#/campaign/outreach?campaign=k9");
    expect(hashForStanding("#/outreach", "recruiter", "k1")).toBe("#/campaign/outreach?campaign=k1");
    expect(hashForStanding("#/calls/", "recruiter", null)).toBe("#/");
    expect(routeFromHash(hashForStanding("#/calls", "recruiter", "k 1")!)).toBe("campaign-calls");
    expect(hashForStanding("#/calls", "recruiter", "k 1")).toBe("#/campaign/outreach?campaign=k%201");
  });

  it("leaves everything else, and everyone else, alone", () => {
    for (const s of ["owner", "admin", "personal"] as const) {
      expect(hashForStanding("#/calls", s, "k1")).toBeNull();
      expect(hashForStanding("#/outreach", s, "k1")).toBeNull();
    }
    expect(hashForStanding("#/campaign/calls?campaign=k1", "recruiter", "k2")).toBeNull();
    expect(hashForStanding("#/campaign/outreach?campaign=k1", "recruiter", "k2")).toBeNull();
    expect(hashForStanding("#/contacts", "recruiter", "k1")).toBeNull();
    expect(hashForStanding("#/", "recruiter", null)).toBeNull();
  });

  it("is what the console does: it waits for the campaigns, then replaces the address, and holds the loader until then", () => {
    const c = src("Console.tsx");
    expect(c).toContain("const routeOk = routeAllowed(route, standing);");
    expect(c).toContain("if (LIVE && !campaignsReady && !campaign.id) return;");
    expect(c).toContain("hashForStanding(window.location.hash, standing, first)");
    expect(c).toContain("window.location.replace(to)");
    expect(c).toContain("routeOk ? <OutreachPage onAgent={(p) => brief(p)} /> : <PageFallback />");
    // The top-level page itself draws nothing, and reads nothing, for a recruiter.
    const page = src("OutreachPage.tsx");
    expect(page).toContain('if (!can(standing, "calls.all")) return null;');
    expect(page.indexOf('if (!can(standing, "calls.all")) return null;')).toBeLessThan(page.indexOf("<OutreachList standing={standing} onSummary={setCounts} onAgent={onAgent} />"));
  });

  it("is a page of its own with a name in the tab: Outreach, then the campaign", () => {
    expect(pageTitle({ route: "campaign-calls", campaign: "Senior Backend" })).toBe("Outreach · Senior Backend · SuperHyre");
    expect(pageTitle({ route: "calls" })).toBe("Outreach · SuperHyre");
  });

  it("serves the one page from the one chunk, so the old link is warm before it is turned", () => {
    const preload = src("build/preload.ts");
    expect(preload.indexOf('{ address: "^#/campaign/(?:outreach|calls)", module: "src/OutreachPage.tsx" }')).toBeGreaterThan(-1);
    expect(preload).toContain('{ address: "^#/(?:outreach|calls)", module: "src/OutreachPage.tsx" }');
  });
});
