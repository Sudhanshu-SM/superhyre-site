import { describe, expect, it } from "vitest";
import { GROUP_OF, NAV, ROUTES, routeFromHash } from "../routes";
import type { RouteId } from "../routes";

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
    expect(routeFromHash("#/people/")).toBe("people");
    expect(routeFromHash("#/dialer/calls/")).toBe("dialer-calls");
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

  it("gives every unbuilt page a backing table to name", () => {
    // The placeholder states which table the page will read; an empty string
    // would render "this page reads ." — the honesty is the feature.
    for (const route of Object.values(ROUTES)) {
      if (route.id === "home") continue;
      expect(route.backing.length).toBeGreaterThan(0);
      expect(route.blurb.length).toBeGreaterThan(0);
    }
  });
});
