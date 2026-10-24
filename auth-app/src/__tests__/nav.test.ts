import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_NAV, COMING_UP_HREF, FOOT_NAV, GROUP_OF, MY_WORK, NAV, ROUTES, clientFromHash, hashAfterWorkspaceChange, isKnownHash, navLabel, redirectedHash, routeFromHash, settingsSectionFromHash,
} from "../nav";
import type { RouteId } from "../nav";

/* The nav model is the one place a link and a page can disagree, so these
   tests are about that agreement rather than about rendering. */

describe("routeFromHash", () => {
  it("resolves every declared route from its own path", () => {
    // Guards the nav/router contract wholesale: add a route and forget its
    // path, and this fails rather than shipping a row that lands on Overview.
    for (const route of Object.values(ROUTES)) {
      // Support is a section of Settings now: its old address lands there.
      if (route.id === "support") {
        expect(routeFromHash("#/support")).toBe("settings");
        continue;
      }
      expect(routeFromHash(`#${route.path}`)).toBe(route.id);
    }
  });

  it.each([
    ["empty", ""],
    ["bare hash", "#"],
    ["root", "#/"],
    ["unknown path", "#/does-not-exist"],
    ["a half-typed path", "#/candi"],
    ["something that is not a path at all", "#access_token=abc"],
  ])("falls back to home for %s", (_label, hash) => {
    // The hash is user-editable and survives in bookmarks, so anything
    // unrecognised has to land somewhere real instead of rendering blank.
    expect(routeFromHash(hash)).toBe("home");
  });

  it("tolerates a trailing slash", () => {
    expect(routeFromHash("#/contacts/")).toBe("contacts");
    expect(routeFromHash("#/analytics/campaigns/")).toBe("analytics-campaigns");
  });

  it("still resolves root when the trailing slash is the whole path", () => {
    // Regression: stripping trailing slashes unconditionally turns "/" into ""
    // and loses the home route.
    expect(routeFromHash("#/")).toBe("home");
  });
});

describe("nav tree", () => {
  const leaves: RouteId[] = [];
  const children: RouteId[] = [];
  for (const section of NAV) {
    for (const item of section.items) {
      if (item.kind === "leaf") leaves.push(item.id);
      else for (const child of item.children) children.push(child.id);
    }
  }
  /* The sidebar renders from three sources, not one: the product nav, the
     campaign-scoped list, and the pinned foot pair. Walking only NAV would let
     a campaign route be declared, never linked, and still pass. */
  for (const item of CAMPAIGN_NAV) leaves.push(item.id);
  for (const item of FOOT_NAV) leaves.push(item.id);
  /* The campaign's Overview is now a row in CAMPAIGN_NAV itself; the name
     row above it no longer counts as a second link to the same route. */

  const reachable = [...leaves, ...children];

  it("makes every route reachable from the sidebar", () => {
    // The other half of the contract: a page nothing links to is dead code.
    // (Support is reached through Settings, not the sidebar.)
    // (Support is reached through Settings, and Clients through the profile menu.)
    const declared = (Object.keys(ROUTES) as RouteId[]).filter((id) => id !== "support" && id !== "clients");
    expect([...reachable].sort()).toEqual([...declared].sort());
  });

  it("lists no route twice", () => {
    expect(new Set(reachable).size).toBe(reachable.length);
  });

  it("maps every group child back to its group", () => {
    // Console seeds the open group from GROUP_OF, so a missing entry means
    // deep-linking a child shows it highlighted inside a collapsed parent.
    for (const id of children) expect(GROUP_OF[id]).toBeTruthy();
  });

  it("claims no group for a top-level route", () => {
    for (const id of leaves) expect(GROUP_OF[id]).toBeUndefined();
  });

  /* Pages that are not a view of a table. Listed by id rather than skipped by
     a truthiness check, so adding a route with no backing is a decision
     someone has to record here instead of an omission the suite waves through. */
  const NOT_TABLE_BACKED = new Set<RouteId>(["home", "support"]);

  it("gives every unbuilt page a backing table to name", () => {
    // The placeholder states which table the page will read; an empty string
    // would render "this page reads ." — the honesty is the feature.
    for (const route of Object.values(ROUTES)) {
      if (NOT_TABLE_BACKED.has(route.id)) continue;
      expect(route.backing.length).toBeGreaterThan(0);
      expect(route.blurb.length).toBeGreaterThan(0);
    }
  });

  it("still explains itself on the pages with no table behind them", () => {
    // Exempt from `backing`, not from saying what they are for. Home is the
    // exception to the exception: it renders its own component, never the
    // placeholder, so it has no blurb to show.
    for (const id of NOT_TABLE_BACKED) {
      if (id === "home") continue;
      expect(ROUTES[id].blurb.length).toBeGreaterThan(0);
    }
  });
});

const mainIds = () => NAV.flatMap((s) => s.items.map((i) => i.id));

describe("clients", () => {
  it("is in the profile menu, beside Sign out, not in the sidebar list: what a person may do on it is the page's to say", () => {
    expect(mainIds()).not.toContain("clients");
  });

  it("routes one client, and its tab, to the Clients page", () => {
    expect(routeFromHash("#/clients/cl-razorpay")).toBe("clients");
    expect(routeFromHash("#/clients/cl-razorpay/contacts")).toBe("clients");
    expect(clientFromHash("#/clients/cl-razorpay/contacts")).toEqual({ id: "cl-razorpay", tab: "contacts" });
    expect(clientFromHash("#/clients")).toBeNull();
  });
});

describe("pages that no longer exist", () => {
  it("has no Scheduled or Extension row, and no route behind either", () => {
    expect(mainIds()).not.toContain("schedules");
    expect(mainIds()).not.toContain("integrations");
    expect(Object.keys(ROUTES)).not.toContain("schedules");
    expect(Object.keys(ROUTES)).not.toContain("integrations");
  });

  it("has no Usage or Agent activity page in the navigation, and sends a link to either to the Analytics entry", () => {
    const labels = NAV.flatMap((s) => s.items.flatMap((i) => (i.kind === "group" ? i.children.map((c) => c.label) : [i.label])));
    expect(labels).not.toContain("Usage");
    expect(labels).not.toContain("Agent activity");
    // The five Analytics pages, in the order a question comes up.
    expect(labels).toEqual(expect.arrayContaining(["Overview", "Recruiters", "Outreach", "Pipeline", "Campaigns"]));
    expect(labels).not.toContain("Projects");
    expect(Object.keys(ROUTES)).not.toContain("analytics-usage");
    expect(Object.keys(ROUTES)).not.toContain("analytics-agent");
    for (const hash of ["#/analytics/usage", "#/analytics/usage/", "#/analytics/agent", "#/analytics/agent?x=1"]) {
      expect(redirectedHash(hash), hash).toBe("#/analytics");
      expect(routeFromHash(hash), hash).toBe("analytics-overview");
      expect(isKnownHash(hash), hash).toBe(true);
    }
    expect(redirectedHash("#/analytics/outreach")).toBeNull();
    expect(redirectedHash("#/analytics")).toBeNull();
  });

  it("sends a link to Scheduled to Coming up on Home, filters and all", () => {
    expect(redirectedHash("#/schedules")).toBe(COMING_UP_HREF);
    expect(redirectedHash("#/scheduled")).toBe(COMING_UP_HREF);
    expect(redirectedHash("#/schedules/")).toBe(COMING_UP_HREF);
    expect(redirectedHash("#/schedules?campaignId=c1")).toBe(`${COMING_UP_HREF}&campaignId=c1`);
    expect(routeFromHash("#/schedules")).toBe("home");
    expect(settingsSectionFromHash("#/schedules?campaignId=c1")).toBeNull();
    expect(COMING_UP_HREF).toBe("#/?section=coming-up");
    expect(routeFromHash(COMING_UP_HREF)).toBe("home");
    expect(isKnownHash("#/schedules")).toBe(true);
  });

  it("sends the old sub-paths of Settings and a campaign where their content went", () => {
    expect(redirectedHash("#/settings/integrations")).toBe("#/settings/connections");
    expect(redirectedHash("#/settings/integrations/")).toBe("#/settings/connections");
    expect(redirectedHash("#/settings/extension")).toBe("#/settings");
    expect(redirectedHash("#/settings/schedules")).toBe(COMING_UP_HREF);
    expect(redirectedHash("#/settings/scheduled")).toBe(COMING_UP_HREF);
    expect(redirectedHash("#/campaign/schedules")).toBe(COMING_UP_HREF);
    expect(redirectedHash("#/campaign/scheduled?campaign=c1")).toBe(`${COMING_UP_HREF}&campaign=c1`);
    // They open a page that exists (not "That page isn't here").
    expect(routeFromHash("#/settings/integrations")).toBe("settings");
    expect(settingsSectionFromHash("#/settings/integrations")).toBe("connections");
    expect(routeFromHash("#/settings/schedules")).toBe("home");
    expect(isKnownHash("#/settings/extension")).toBe(true);
    expect(isKnownHash("#/campaign/schedules")).toBe(true);
    // Real pages are left alone.
    expect(redirectedHash("#/settings/connections")).toBeNull();
    expect(redirectedHash("#/campaign/pipeline")).toBeNull();
  });

  it("sends a link to the Extension page home, and leaves every other address alone", () => {
    expect(redirectedHash("#/integrations")).toBe("#/");
    expect(redirectedHash("#/extension")).toBe("#/");
    expect(isKnownHash("#/integrations")).toBe(true);
    expect(redirectedHash("#/campaigns")).toBeNull();
    expect(redirectedHash("#/")).toBeNull();
    expect(redirectedHash("#/?section=coming-up")).toBeNull();
  });
});

describe("where a page goes when the workspace changes under it", () => {
  it("drops a campaign that belongs to the workspace that was left, and keeps any other page", () => {
    // A campaign link means nothing in the new workspace: the agent page stays, without the campaign.
    expect(hashAfterWorkspaceChange("#/agent?campaign=abc")).toBe("#/agent");
    expect(hashAfterWorkspaceChange("#/?section=coming-up&campaign=abc")).toBe("#/?section=coming-up");
    // A campaign's own pages go to the list of campaigns in the new workspace.
    expect(hashAfterWorkspaceChange("#/campaign")).toBe("#/campaigns");
    expect(hashAfterWorkspaceChange("#/campaign/shortlisted?campaign=abc")).toBe("#/campaigns");
    expect(hashAfterWorkspaceChange("#/campaign/forms/f1/build")).toBe("#/campaigns");
    // Everything else is as good in the new workspace.
    expect(hashAfterWorkspaceChange("#/")).toBeNull();
    expect(hashAfterWorkspaceChange("#/campaigns")).toBeNull();
    expect(hashAfterWorkspaceChange("#/settings/members")).toBeNull();
    expect(hashAfterWorkspaceChange("#/contacts")).toBeNull();
  });
});

describe("the Analytics group", () => {
  const group = NAV.flatMap((s) => s.items).find((i) => i.kind === "group" && i.id === "analytics");
  const children = group && group.kind === "group" ? group.children : [];

  it("is five pages, in the order a question comes up, and nothing else", () => {
    expect(children.map((c) => c.label)).toEqual(["Overview", "Recruiters", "Outreach results", "Pipeline", "Campaigns"]);
    expect(children.map((c) => ROUTES[c.id].path)).toEqual([
      "/analytics", "/analytics/recruiters", "/analytics/outreach", "/analytics/pipeline", "/analytics/campaigns",
    ]);
  });

  it("lands on the Overview", () => {
    expect(routeFromHash("#/analytics")).toBe("analytics-overview");
    expect(routeFromHash("#/analytics/")).toBe("analytics-overview");
    expect(routeFromHash("#/analytics/overview")).toBe("analytics-overview");
    expect(isKnownHash("#/analytics")).toBe(true);
  });

  it("keeps a page's filters in the address without changing which page it is", () => {
    for (const [hash, id] of [
      ["#/analytics?days=90", "analytics-overview"],
      ["#/analytics/recruiters?days=7&userId=u1", "analytics-recruiters"],
      ["#/analytics/outreach?from=2026-09-01&to=2026-09-30", "analytics-outreach"],
      ["#/analytics/pipeline?campaignId=c1", "analytics-pipeline"],
      ["#/analytics/campaigns?clientId=cl1", "analytics-campaigns"],
    ] as const) {
      expect(routeFromHash(hash), hash).toBe(id);
      expect(redirectedHash(hash), hash).toBeNull();
    }
  });

  it("sends the old Projects address to Campaigns, and Usage and Agent activity to the Overview", () => {
    expect(redirectedHash("#/analytics/projects")).toBe("#/analytics/campaigns");
    expect(redirectedHash("#/analytics/projects/")).toBe("#/analytics/campaigns");
    expect(redirectedHash("#/analytics/projects?days=7")).toBe("#/analytics/campaigns?days=7");
    expect(routeFromHash("#/analytics/projects")).toBe("analytics-campaigns");
    expect(redirectedHash("#/analytics/usage")).toBe("#/analytics");
    expect(redirectedHash("#/analytics/agent")).toBe("#/analytics");
  });

  it("opens its group when one of its pages is open", () => {
    for (const c of children) expect(GROUP_OF[c.id]).toBe("analytics");
  });

  it("calls the people page My work for a recruiter and for someone on their own, Recruiters for a lead", () => {
    const id = "analytics-recruiters" as const;
    expect(navLabel(id, "Recruiters", "owner")).toBe("Recruiters");
    expect(navLabel(id, "Recruiters", "admin")).toBe("Recruiters");
    expect(navLabel(id, "Recruiters", "recruiter")).toBe(MY_WORK);
    expect(navLabel(id, "Recruiters", "personal")).toBe(MY_WORK);
    // Only that page is renamed.
    expect(navLabel("analytics-outreach", "Outreach", "recruiter")).toBe("Outreach");
  });

  it("does not take over the address a campaign link uses", () => {
    // `?campaign=` opens a campaign; the filters use campaignId, so a filtered address is not a campaign link.
    expect(hashAfterWorkspaceChange("#/analytics/pipeline?days=90")).toBeNull();
  });
});
