import { describe, expect, it } from "vitest";
import { CAMPAIGN_NAV, FOOT_NAV, GROUP_OF, NAV, ROUTES, routeFromHash } from "../nav";
import type { RouteId } from "../nav";

/* The nav model is the one place a link and a page can disagree, so these
   tests are about that agreement rather than about rendering. */

describe("routeFromHash", () => {
  it("resolves every declared route from its own path", () => {
    // Guards the nav/router contract wholesale: add a route and forget its
    // path, and this fails rather than shipping a row that lands on Overview.
    for (const route of Object.values(ROUTES)) {
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
    expect(routeFromHash("#/analytics/usage/")).toBe("analytics-usage");
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
  /* The campaign's own row is built in Nav.tsx, not in the nav model, because
     its label is the selected campaign's name rather than a static string. It
     is still a linked route, so it counts as reachable — declared here so the
     reachability check does not have to be loosened to accommodate it. */
  leaves.push("campaign-overview");

  const reachable = [...leaves, ...children];

  it("makes every route reachable from the sidebar", () => {
    // The other half of the contract: a page nothing links to is dead code.
    const declared = Object.keys(ROUTES) as RouteId[];
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
