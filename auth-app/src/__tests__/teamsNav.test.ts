import { describe, expect, it } from "vitest";
import { can } from "../can";
import type { Standing } from "../can";
import { buildEntries, settingsPages } from "../Palette";
import { footNavFor, FOOT_NAV, hashForStanding, isKnownHash, redirectedHash, ROUTES, routeAllowed, routeFromHash, SETTINGS_SECTIONS, settingsSectionFromHash } from "../nav";

/**
 * Teams sits with Settings and Support in the sidebar, for the organisation's owner and admins only. Members used to
 * be a Settings page; its old address goes to Teams.
 */

const STANDINGS: readonly Standing[] = ["owner", "admin", "recruiter", "personal"];

describe("who has Teams in the sidebar", () => {
  it("shows it to the owner and admins, beside Settings, and to nobody else", () => {
    for (const s of STANDINGS) {
      const ids = footNavFor(s).map((i) => i.id);
      const has = s === "owner" || s === "admin";
      expect(ids.includes("teams"), s).toBe(has);
      expect(ids, s).toContain("settings");
      // Support is a section of Settings, not a row of its own.
      expect(ids, s).not.toContain("support");
    }
    expect(footNavFor("owner").map((i) => i.label)).toEqual(["Teams", "Settings"]);
  });

  it("is the table in can.ts, so the two cannot drift", () => {
    for (const s of STANDINGS) {
      expect(footNavFor(s).some((i) => i.id === "teams"), s).toBe(can(s, "teams.manage"));
      expect(routeAllowed("teams", s), s).toBe(can(s, "teams.manage"));
    }
    expect(can("owner", "teams.create")).toBe(true);
    expect(can("admin", "teams.create")).toBe(false);
  });

  it("leaves nothing out before the person's standing is known", () => {
    expect(footNavFor(null).map((i) => i.id)).toContain("teams");
    expect(routeAllowed("teams", undefined)).toBe(true);
  });

  it("is findable in quick find for an owner and an admin, not for a recruiter", () => {
    expect(buildEntries("Role", "admin").some((e) => e.id === "teams")).toBe(true);
    expect(buildEntries("Role", "recruiter").some((e) => e.id === "teams")).toBe(false);
    expect(FOOT_NAV.find((i) => i.id === "teams")).toMatchObject({ label: "Teams" });
    expect(ROUTES.teams.path).toBe("/teams");
  });

  it("never sends a recruiter anywhere: the page itself says it isn't theirs", () => {
    expect(routeFromHash("#/teams")).toBe("teams");
    expect(hashForStanding("#/teams", "recruiter", "c1")).toBeNull();
    expect(isKnownHash("#/teams")).toBe(true);
  });
});

describe("Members is not a Settings page any more", () => {
  it("sends the old address, and links that still carry it, to Teams", () => {
    expect(redirectedHash("#/settings/members")).toBe("#/teams");
    expect(redirectedHash("#/settings/members/")).toBe("#/teams");
    expect(routeFromHash("#/settings/members")).toBe("teams");
    expect(settingsSectionFromHash("#/settings/members")).toBeNull();
  });

  it("leaves Settings with Profile, Organisation, Connections and Support", () => {
    expect([...SETTINGS_SECTIONS]).toEqual(["profile", "organisation", "connections", "support"]);
    expect(settingsPages(true).map((p) => p.id)).toEqual(["connections", "support"]);
    expect(routeFromHash("#/settings/connections")).toBe("settings");
  });
});
