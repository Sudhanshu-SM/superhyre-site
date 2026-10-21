import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Suppression } from "../api/suppressions";
import { redirectedHash, SETTINGS_SECTIONS, settingsSectionFromHash } from "../nav";
import { suppressionOf, suppressionPageOf } from "../api/suppressions";
import {
  addedBy, canRemove, dateLabel, emailProblem, metaLine, peopleLabel, reasonWords, removeHelp, sinceLabel, suppressedNotice, untilLabel,
} from "../dncView";

/**
 * The do-not-contact list: its words, who may lift an entry, the store behind Settings (with the API
 * connected) and the notice when approving outreach leaves people out. The shapes are the server's
 * (modules/suppressions, modules/outreach `approveMessages`).
 */

const { server, problems } = vi.hoisted(() => ({
  server: {
    handle: (_m: string, _p: string, _b: unknown): unknown => undefined,
    hold: null as null | Promise<void>,
    fail: null as null | { match: RegExp; status: number; message: string },
    calls: [] as string[],
  },
  problems: [] as string[],
}));

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    LIVE: true,
    API_URL: "http://api.test",
    ApiError,
    messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
    api: async (method: string, path: string, body?: unknown) => {
      server.calls.push(`${method} ${path}`);
      if (server.hold && method !== "GET") await server.hold;
      await Promise.resolve();
      if (server.fail && server.fail.match.test(`${method} ${path}`)) {
        const f = server.fail;
        server.fail = null;
        throw new ApiError(f.status, "error", f.message);
      }
      return server.handle(method, path, body);
    },
  };
});
vi.mock("../problems", () => ({ reportProblem: (t: string) => { problems.push(t); } }));

const store = await import("../dncStore");
const identity = await import("../api/identity");

const NOW = Date.parse("2026-10-10T09:00:00Z");

let n = 0;
const entry = (over: Partial<Suppression> = {}): Suppression => ({
  id: `d${++n}`, reason: "do_not_contact", until: null, expired: false, source: "user", label: `Person ${n}`, note: null,
  createdBy: { kind: "user", id: "u1", name: "Asha Rao" }, createdAt: "2026-10-08T10:00:00.000Z", ...over,
});

describe("what an entry says", () => {
  it("gives the reason in words", () => {
    expect(reasonWords("do_not_contact")).toBe("Asked not to be contacted");
    expect(reasonWords("unsubscribed")).toBe("Unsubscribed");
    expect(reasonWords("bounced")).toBe("Email address bounced");
    expect(reasonWords("manual")).toBe("Added by hand");
  });

  it("says who added it", () => {
    expect(addedBy(entry(), "u1")).toBe("Added by you");
    expect(addedBy(entry(), "u2")).toBe("Added by Asha Rao");
    expect(addedBy(entry({ createdBy: { kind: "user", id: "u9", name: null } }), "u2")).toBe("Added by a teammate");
    expect(addedBy(entry({ source: "agent", createdBy: { kind: "agent", id: null, name: null } }), "u1")).toBe("Added by SuperHyre");
    expect(addedBy(entry({ source: "system", createdBy: { kind: "system", id: null, name: null } }), "u1")).toBe("Added automatically");
  });

  it("says since when, in a few words", () => {
    expect(sinceLabel("2026-10-10T01:00:00Z", NOW)).toBe("today");
    expect(sinceLabel("2026-10-09T12:00:00Z", NOW)).toBe("yesterday");
    expect(sinceLabel("2026-10-04T12:00:00Z", NOW)).toBe("4 Oct");
    expect(sinceLabel("2025-10-04T12:00:00Z", NOW)).toBe("4 Oct 2025");
    expect(sinceLabel("", NOW)).toBe("");
    expect(dateLabel("2027-01-04T12:00:00Z", NOW)).toBe("4 Jan 2027");
  });

  it("says until when, or nothing when it stays until someone lifts it", () => {
    expect(untilLabel({ until: "2026-12-04T12:00:00Z", expired: false }, NOW)).toBe("Until 4 Dec");
    expect(untilLabel({ until: "2026-09-04T12:00:00Z", expired: true }, NOW)).toBe("Ended 4 Sep");
    expect(untilLabel({ until: null, expired: false }, NOW)).toBeNull();
  });

  it("puts it on one line", () => {
    expect(metaLine(entry({ createdAt: "2026-10-04T12:00:00Z", until: "2026-12-04T12:00:00Z" }), "u1", NOW)).toBe(
      "Asked not to be contacted · Since 4 Oct · Added by you · Until 4 Dec",
    );
    expect(metaLine(entry({ reason: "unsubscribed", source: "system", createdBy: { kind: "system", id: null, name: null }, createdAt: "2026-10-10T01:00:00Z" }), "u1", NOW)).toBe(
      "Unsubscribed · Since today · Added automatically",
    );
  });

  it("counts people", () => {
    expect(peopleLabel(1)).toBe("1 person");
    expect(peopleLabel(3)).toBe("3 people");
  });
});

describe("who may lift one", () => {
  it("is an owner or admin; everyone else is told to ask", () => {
    expect(canRemove({ manages: true })).toBe(true);
    expect(removeHelp({ manages: true })).toBeNull();
    expect(canRemove({ manages: false })).toBe(false);
    expect(removeHelp({ manages: false })).toBe("Ask an admin to remove");
  });
});

describe("adding by email", () => {
  it("wants something that looks like an address", () => {
    expect(emailProblem("")).toBe("Type the email address.");
    expect(emailProblem("   ")).toBe("Type the email address.");
    expect(emailProblem("asha")).toBe("That doesn't look like an email address.");
    expect(emailProblem("asha@")).toBe("That doesn't look like an email address.");
    expect(emailProblem("a b@c.com")).toBe("That doesn't look like an email address.");
    expect(emailProblem(" asha@acme.com ")).toBeNull();
  });
});

describe("approving outreach when some people are on the list", () => {
  it("says how many were left out", () => {
    expect(suppressedNotice([])).toBeNull();
    expect(suppressedNotice([{ reason: "Asha Verma is marked do not contact." }])).toBe("1 person is on the do-not-contact list, so they were left out.");
    expect(suppressedNotice([{ reason: "a" }, { reason: "b" }, { reason: "c" }])).toBe("3 people are on the do-not-contact list, so they were left out.");
  });

  it("has no Settings page of its own: the agent and a candidate's menu manage the list", () => {
    expect(SETTINGS_SECTIONS).not.toContain("do-not-contact");
    expect(settingsSectionFromHash("#/settings/do-not-contact")).toBeNull();
    expect(redirectedHash("#/settings/do-not-contact")).toBe("#/settings");
    expect(redirectedHash("#/settings/dnc")).toBe("#/settings");
  });
});

describe("reading what the server sends", () => {
  it("reads an entry, and a page of them", () => {
    const raw = {
      id: "d1", reason: "unsubscribed", until: "2026-12-04T00:00:00.000Z", expired: false, source: "agent", label: "a***@acme.com", note: "Wrote back",
      createdBy: { kind: "agent", id: null, name: null }, createdAt: "2026-10-08T10:00:00.000Z",
    };
    expect(suppressionOf(raw)).toEqual({ ...raw, until: "2026-12-04T00:00:00.000Z", address: null });
    /* The whole address, when the server sends it to someone who may see it. */
    expect(suppressionOf({ ...raw, address: "asha@acme.com" })?.address).toBe("asha@acme.com");
    expect(suppressionPageOf({ items: [raw, { nope: 1 }, null], nextCursor: "c" }).items.map((i) => i.id)).toEqual(["d1"]);
    expect(suppressionPageOf({ items: [raw], nextCursor: "c" }).nextCursor).toBe("c");
    expect(suppressionPageOf(null)).toEqual({ items: [], nextCursor: null });
  });

  it("falls back for what an older or newer server leaves out", () => {
    expect(suppressionOf({ id: "d2", reason: "something_new" })).toMatchObject({ reason: "do_not_contact", until: null, expired: false, label: "Someone", note: null });
    expect(suppressionOf({ reason: "bounced" })).toBeNull();
  });
});

describe("the store behind Settings", () => {
  let list: Suppression[];
  let pages: Record<string, { items: Suppression[]; nextCursor: string | null }>;

  beforeEach(() => {
    n = 0;
    list = [entry({ id: "d1", label: "Asha Verma" }), entry({ id: "d2", label: "Ravi Iyer" })];
    pages = {};
    server.fail = null;
    server.hold = null;
    server.calls = [];
    problems.length = 0;
    server.handle = (method, path, body) => {
      const u = new URL(`http://x${path}`);
      if (method === "GET" && u.pathname === "/v1/suppressions") {
        const cursor = u.searchParams.get("cursor");
        if (cursor && pages[cursor]) return pages[cursor];
        return { items: list, nextCursor: pages.first && !cursor ? "first" : null };
      }
      if (method === "POST") {
        const b = body as { email?: string; candidateId?: string };
        const label = b.email ? `${b.email[0]}***@${b.email.split("@")[1]}` : "A Candidate";
        return entry({ id: "new-1", label, source: "user" });
      }
      return undefined;
    };
    store.resetDnc();
  });

  const settle = () => new Promise<void>((r) => setTimeout(r, 0));

  it("loads the list", async () => {
    await store.openDnc();
    expect(store.dncNow()).toMatchObject({ phase: "ready", next: null, unavailable: false });
    expect(store.dncNow().items.map((i) => i.id)).toEqual(["d1", "d2"]);
    expect(server.calls).toEqual(["GET /v1/suppressions?limit=50"]);
  });

  it("pages", async () => {
    pages.first = { items: [entry({ id: "d2" }), entry({ id: "d3" })], nextCursor: null };
    await store.openDnc();
    await store.loadMoreDnc();
    expect(store.dncNow().items.map((i) => i.id)).toEqual(["d1", "d2", "d3"]);
    expect(store.dncNow().next).toBeNull();
  });

  it("says it couldn't load, tries again, and reads a server without the routes as unavailable", async () => {
    server.fail = { match: /GET/, status: 500, message: "x" };
    await store.openDnc();
    expect(store.dncNow().phase).toBe("failed");
    await store.openDnc();
    expect(store.dncNow().phase).toBe("ready");
    store.resetDnc();
    server.fail = { match: /GET/, status: 404, message: "Not found." };
    await store.openDnc();
    expect(store.dncNow()).toMatchObject({ phase: "failed", unavailable: true });
  });

  it("adds an address to the top of the list", async () => {
    await store.openDnc();
    expect(await store.addByEmail(" asha@acme.com ", " Wrote back ")).toEqual({ ok: true });
    expect(store.dncNow().items[0]).toMatchObject({ id: "new-1", label: "a***@acme.com" });
    expect(server.calls).toContain("POST /v1/suppressions");
  });

  it("doesn't list someone twice when they were already there", async () => {
    await store.openDnc();
    server.handle = () => entry({ id: "d1", label: "Asha Verma" });
    await store.addByEmail("asha@acme.com");
    expect(store.dncNow().items.map((i) => i.id)).toEqual(["d1", "d2"]);
  });

  it("says why an address was refused, for the form to show", async () => {
    await store.openDnc();
    server.fail = { match: /POST/, status: 400, message: "That doesn't look like an email address." };
    expect(await store.addByEmail("nope")).toEqual({ ok: false, message: "That doesn't look like an email address." });
    expect(store.dncNow().items).toHaveLength(2);
  });

  it("adds a candidate from the pipeline, and shows them if the list is open", async () => {
    expect(await store.addForCandidate("c1")).toEqual({ ok: true });
    expect(store.dncNow().items).toEqual([]);
    await store.openDnc();
    await store.addForCandidate("c1");
    expect(store.dncNow().items[0]?.id).toBe("new-1");
    server.fail = { match: /POST/, status: 400, message: "That person has no email on file." };
    expect(await store.addForCandidate("c2")).toEqual({ ok: false, message: "That person has no email on file." });
  });

  it("takes someone off at once, and puts them back with a line saying why when refused", async () => {
    await store.openDnc();
    let release!: () => void;
    server.hold = new Promise<void>((r) => { release = r; });
    const p = store.removeEntry("d1");
    await settle();
    expect(store.dncNow().items.map((i) => i.id)).toEqual(["d2"]);
    expect(store.dncNow().working).toEqual(["d1"]);
    release();
    expect(await p).toEqual({ ok: true });
    expect(store.dncNow().working).toEqual([]);

    server.hold = null;
    server.fail = { match: /DELETE/, status: 403, message: "Only an admin can take someone off the list." };
    const r = await store.removeEntry("d2");
    expect(r).toEqual({ ok: false, message: "Only an admin can take someone off the list." });
    expect(store.dncNow().items.map((i) => i.id)).toEqual(["d2"]);
    expect(problems).toEqual(["Ravi Iyer wasn't taken off the list. Only an admin can take someone off the list."]);
  });

  it("puts someone back in the place they were", async () => {
    await store.openDnc();
    server.fail = { match: /DELETE/, status: 500, message: "x" };
    await store.removeEntry("d1");
    expect(store.dncNow().items.map((i) => i.id)).toEqual(["d1", "d2"]);
  });

  it("takes a person off by name from their menu, and says so when the server refuses", async () => {
    expect(await store.allowContactAgain("asha verma")).toEqual({ ok: true });
    expect(server.calls).toEqual(["GET /v1/suppressions?limit=200", "DELETE /v1/suppressions/d1"]);
    expect(await store.allowContactAgain("Nobody Here")).toEqual({ ok: false, message: "Nobody Here isn't on the list." });
    server.fail = { match: /DELETE/, status: 403, message: "Only an admin can take someone off the list." };
    expect(await store.allowContactAgain("Ravi Iyer")).toEqual({ ok: false, message: "Only an admin can take someone off the list." });
  });

  it("doesn't guess between two entries with one name", async () => {
    list = [entry({ id: "d1", label: "Asha Verma" }), entry({ id: "d9", label: "Asha Verma" })];
    const r = await store.allowContactAgain("Asha Verma");
    expect(r.ok).toBe(false);
    expect(server.calls.some((c) => c.startsWith("DELETE"))).toBe(false);
  });

  it("forgets everything when the workspace changes", async () => {
    await store.openDnc();
    identity.workspaceChanged();
    expect(store.dncNow()).toMatchObject({ phase: "idle", items: [] });
  });
});
