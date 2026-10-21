import { describe, expect, it } from "vitest";
import type { GoogleConnection, GoogleProductState } from "../api/identity";
import { googleHint } from "../googleSetup";
import { accessAction, connectionLine, hasProjectTrouble, productRows } from "../googleProducts";

/** The parts of one Google connection, each with a plain state, and the one button that grows the sign-in. */

const g = (over: Partial<GoogleConnection> = {}): GoogleConnection => ({
  available: true, status: "connected", accountEmail: "ana@hirewell.in", scopes: [], products: ["gmail", "sheets"], connectedAt: "2026-10-21T00:00:00Z", ...over,
});
const states = (...s: Array<[GoogleProductState["product"], GoogleProductState["state"], Partial<GoogleProductState>?]>): GoogleProductState[] =>
  s.map(([product, state, more]) => ({ product, label: product, state, ...more }));

describe("what the card lists", () => {
  it("is the four parts in order, named for what they do, and says nothing of state before there is a sign-in", () => {
    const rows = productRows(g({ status: "disconnected", accountEmail: null, products: [] }));
    expect(rows.map((r) => r.name)).toEqual(["Email", "Calendar", "Tasks", "Files"]);
    expect(rows.every((r) => r.state === "quiet" && r.text === "")).toBe(true);
    expect(rows[1]?.use).toBe("Finds free time and sends interview invitations from your own calendar.");
  });

  it("says On, and Needs access for what was not allowed", () => {
    const rows = productRows(g({ productStates: states(["gmail", "on"], ["calendar", "needs_access"], ["tasks", "needs_access"], ["sheets", "on"]) }));
    expect(rows.map((r) => [r.name, r.state, r.text])).toEqual([
      ["Email", "on", "On"], ["Calendar", "needs_access", "Needs access"], ["Tasks", "needs_access", "Needs access"], ["Files", "on", "On"],
    ]);
  });

  it("says a switched-off API in the server's words, with the page that switches it on", () => {
    const help = "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com";
    const message = "Google Calendar isn't switched on for the Google project this app signs in with yet. Someone with access to that Google Cloud project has to enable the Google Calendar API there, then try again.";
    const rows = productRows(g({ productStates: states(["gmail", "on"], ["calendar", "api_disabled", { message, help }], ["tasks", "on"], ["sheets", "on"]) }));
    const calendar = rows.find((r) => r.product === "calendar");
    expect(calendar).toMatchObject({ state: "api_disabled", text: message, help });
    expect(hasProjectTrouble(rows)).toBe(true);
    expect(hasProjectTrouble(productRows(g()))).toBe(false);
  });

  it("reads a server that predates Calendar and Tasks from the products it lists", () => {
    const rows = productRows(g());
    expect(rows.map((r) => r.state)).toEqual(["on", "needs_access", "needs_access", "on"]);
  });

  it("says reconnect for every part when the sign-in itself ran out", () => {
    const rows = productRows(g({ status: "expired", products: [] }));
    expect(rows.every((r) => r.state === "reconnect" && r.text === "Reconnect to use it")).toBe(true);
  });
});

describe("the one button", () => {
  it("connects when there is nothing, and reconnects when the sign-in ran out, asking for every part", () => {
    expect(accessAction(g({ status: "disconnected", products: [] }))).toEqual({ label: "Connect Google", products: ["gmail", "calendar", "tasks", "sheets"], kind: "connect" });
    expect(accessAction(g({ status: "expired" }))).toMatchObject({ label: "Reconnect", kind: "reconnect" });
  });

  it("adds Calendar and Tasks by asking for only those", () => {
    expect(accessAction(g())).toEqual({ label: "Add Calendar & Tasks access", products: ["calendar", "tasks"], kind: "add" });
    expect(accessAction(g({ productStates: states(["gmail", "on"], ["calendar", "on"], ["tasks", "needs_access"], ["sheets", "on"]) }))).toEqual({
      label: "Add Tasks access", products: ["tasks"], kind: "add",
    });
    expect(accessAction(g({ productStates: states(["gmail", "on"], ["calendar", "needs_access"], ["tasks", "on"], ["sheets", "on"]) }))?.label).toBe("Add Calendar access");
  });

  it("offers nothing when every part is on, and does not ask again for one the Google project has off", () => {
    expect(accessAction(g({ productStates: states(["gmail", "on"], ["calendar", "on"], ["tasks", "on"], ["sheets", "on"]) }))).toBeNull();
    expect(accessAction(g({ productStates: states(["gmail", "on"], ["calendar", "api_disabled"], ["tasks", "on"], ["sheets", "on"]) }))).toBeNull();
  });

  it("reconnects, rather than adds, when Gmail or Files itself is missing", () => {
    expect(accessAction(g({ products: [], productStates: states(["gmail", "needs_access"], ["calendar", "needs_access"], ["tasks", "on"], ["sheets", "on"]) }))?.kind).toBe("reconnect");
  });
});

describe("the line under the name", () => {
  it("says who it is connected as, and why it can't be when it can't", () => {
    expect(connectionLine(g())).toBe("Connected as ana@hirewell.in");
    expect(connectionLine(g({ status: "expired" }))).toBe("Signed out. Reconnect to keep sending and scheduling.");
    expect(connectionLine(g({ status: "revoked" }))).toBe("Access was removed in Google. Connect again to use it.");
    expect(connectionLine(g({ status: "disconnected", accountEmail: null }))).toBe("Not connected");
    expect(connectionLine(g({ available: false, reason: "Google sign-in isn't set up on this server yet." }))).toBe("Google sign-in isn't set up on this server yet.");
  });
});

describe("the hint under a page that needs a part of Google", () => {
  it("says what is missing for Calendar and Tasks in the same plain words as for Gmail", () => {
    expect(googleHint(null, "calendar")).toBeNull();
    expect(googleHint(g(), "gmail")).toBeNull();
    expect(googleHint(g(), "calendar")).toBe("Add Calendar access in Settings → Connections to schedule meetings.");
    expect(googleHint(g(), "tasks")).toBe("Add Tasks access in Settings → Connections to put reminders in Google Tasks.");
    expect(googleHint(g({ status: "disconnected", products: [] }), "gmail")).toBe("Connect Gmail in Settings → Connections before these can be sent.");
    expect(googleHint(g({ available: false }), "calendar")).toBe("Google Calendar and Tasks aren't set up on this server yet.");
  });

  it("says the Google project's switched-off API in its own words", () => {
    const message = "Google Calendar isn't switched on for the Google project this app signs in with yet.";
    const calendar = g({ products: ["gmail", "sheets", "calendar"], productStates: states(["calendar", "api_disabled", { message }]) });
    expect(googleHint(calendar, "calendar")).toBe(message);
  });
});
