import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTES } from "../nav";
import type { RouteId } from "../nav";
import { pageTitle, SET_UP_TITLE, SIGN_IN_TITLE } from "../pageTitle";

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("the tab title", () => {
  it("says the page, then SuperHyre, for every page of the console", () => {
    expect(pageTitle({ route: "home" })).toBe("Home · SuperHyre");
    expect(pageTitle({ route: "campaigns" })).toBe("Campaigns · SuperHyre");
    expect(pageTitle({ route: "contacts" })).toBe("Candidates · SuperHyre");
    expect(pageTitle({ route: "clients" })).toBe("Clients · SuperHyre");
    expect(pageTitle({ route: "agent" })).toBe("Agent · SuperHyre");
    expect(pageTitle({ route: "support" })).toBe("Support · SuperHyre");
  });

  it("names every Settings section, and the analytics pages by what they are called in the sidebar", () => {
    expect(pageTitle({ route: "settings", section: "members" })).toBe("Members · Settings · SuperHyre");
    expect(pageTitle({ route: "settings", section: "connections" })).toBe("Connections · Settings · SuperHyre");
    expect(pageTitle({ route: "settings", section: null })).toBe("Profile · Settings · SuperHyre");
    expect(pageTitle({ route: "analytics-overview" })).toBe("Overview · Analytics · SuperHyre");
    expect(pageTitle({ route: "analytics-campaigns" })).toBe("Campaigns · Analytics · SuperHyre");
    expect(pageTitle({ route: "analytics-pipeline" })).toBe("Pipeline · Analytics · SuperHyre");
    expect(pageTitle({ route: "analytics-outreach" })).toBe("Outreach · Analytics · SuperHyre");
    // The people page is "Recruiters" to a team lead and "My work" to someone on their own, in the tab as in the sidebar.
    expect(pageTitle({ route: "analytics-recruiters" })).toBe("Recruiters · Analytics · SuperHyre");
    expect(pageTitle({ route: "analytics-recruiters", mine: true })).toBe("My work · Analytics · SuperHyre");
  });

  it("leads a campaign's own page with its name, and a working page with the page and then whose it is", () => {
    expect(pageTitle({ route: "campaign-overview", campaign: "Senior Android Engineer" })).toBe("Senior Android Engineer · SuperHyre");
    expect(pageTitle({ route: "campaign-candidates", campaign: "Senior Android Engineer" })).toBe("Pipeline · Senior Android Engineer · SuperHyre");
    expect(pageTitle({ route: "campaign-shortlisted", campaign: null })).toBe("Shortlisted · SuperHyre");
  });

  it("says when a link goes nowhere", () => {
    expect(pageTitle({ route: "home", unknown: true })).toBe("Page not found · SuperHyre");
  });

  it("gives every route a distinct title with no em dash", () => {
    const ids = Object.keys(ROUTES) as RouteId[];
    const titles = ids.map((r) => pageTitle({ route: r, campaign: "X" }));
    expect(new Set(titles).size).toBe(ids.length);
    for (const t of [...titles, SIGN_IN_TITLE, SET_UP_TITLE]) expect(t).not.toContain("—");
  });

  it("titles the sign-in and the set-up in their own words", () => {
    expect(SIGN_IN_TITLE).toBe("Sign in · SuperHyre");
    expect(SET_UP_TITLE).toBe("Welcome · SuperHyre");
    const app = src("App.tsx");
    expect(app).toContain("<DocTitle title={SIGN_IN_TITLE} />");
    expect(app.match(/<DocTitle title=\{SET_UP_TITLE\} \/>/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("is stated by the console for every page but Settings, which knows its own section", () => {
    expect(src("Console.tsx")).toMatch(/route !== "settings" && \(\s*<DocTitle/);
    expect(src("Settings.tsx")).toContain('<DocTitle title={pageTitle({ route: "settings", section })} />');
  });
});

describe("a title that something open puts back", () => {
  // The form's own title is on the tab; the form page then unmounts after a lazy page has already named itself.
  const FORM = "X4 screening form · Forms & responses · Senior Data Engineer · SuperHyre";
  const PAGE = "Forms & responses · Senior Data Engineer · SuperHyre";

  it("puts the page's title back when the form closes and nothing else has spoken", async () => {
    const { restoreTitle } = await import("../components/DocTitle");
    const doc = { title: FORM };
    restoreTitle(doc, FORM, PAGE);
    expect(doc.title).toBe(PAGE);
  });

  it("leaves the next page's title alone when the form unmounts after it was named (Candidates, from the sidebar)", async () => {
    const { restoreTitle } = await import("../components/DocTitle");
    const doc = { title: "Candidates · SuperHyre" };
    restoreTitle(doc, FORM, PAGE);
    expect(doc.title).toBe("Candidates · SuperHyre");
  });
});
