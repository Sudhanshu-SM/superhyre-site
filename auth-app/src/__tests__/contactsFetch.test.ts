import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactPerson, ContactsResult, ContactsStatus } from "../contactsModel";
import { recount, STILL_LOOKING, contactWords } from "../contactsModel";

/**
 * The contact store: one status per campaign that the table, a person's sheet and the profile sidebar share. The
 * API is a small stand-in whose answers the test moves; time is the fake clock, and the tab is "in front" unless
 * the test hides it.
 */

const { server, hooks } = vi.hoisted(() => ({
  server: {
    calls: [] as string[],
    bodies: [] as unknown[],
    status: null as unknown,
    post: ((_b: unknown): unknown => undefined) as (b: unknown) => unknown,
    fail: null as null | { status: number; code: string; message: string },
    failRead: false,
    hold: null as null | Promise<void>,
  },
  hooks: {
    invalidated: [] as Array<{ effects: string[]; campaignId: string | null | undefined }>,
    onInvalidate: null as null | ((effects: ReadonlySet<string>, campaigns: ReadonlySet<string | null>) => void),
    onWorkspace: null as null | (() => void),
  },
}));

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
    get retryAt() { return null; }
  }
  return {
    LIVE: true,
    ApiError,
    messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
    api: async (method: string, path: string, body?: unknown) => {
      server.calls.push(`${method} ${path}`);
      if (body !== undefined) server.bodies.push(body);
      await server.hold;
      if (server.failRead && method === "GET") throw new ApiError(500, "internal", "Something went wrong.");
      if (server.fail && method === "POST") throw new ApiError(server.fail.status, server.fail.code, server.fail.message);
      return method === "GET" ? server.status : server.post(body);
    },
  };
});
vi.mock("../api/identity", () => ({ onWorkspaceChange: (fn: () => void) => { hooks.onWorkspace = fn; return () => {}; } }));
vi.mock("../campaignStore", () => ({ campaignRow: () => undefined, pipelineNow: () => [], resolveCampaignId: (id: string) => id }));
vi.mock("../invalidate", () => ({
  invalidate: (effects: string[], opts: { campaignId?: string | null } = {}) => { hooks.invalidated.push({ effects, campaignId: opts.campaignId }); },
  onInvalidate: (fn: typeof hooks.onInvalidate) => { hooks.onInvalidate = fn; return () => {}; },
}));

const store = await import("../contactsFetch");

const person = (n: number, over: Partial<ContactPerson> = {}): ContactPerson => ({
  campaignCandidateId: `cc-${n}`, candidateId: `cand-${n}`, personId: `p-${n}`, stage: "shortlisted",
  email: "none", phone: "none", lookupable: true, ...over,
});
const status = (people: ContactPerson[], over: Partial<ContactsStatus> = {}): ContactsStatus => ({
  campaignId: "c1", closed: false, creditsLeft: 38, perRequest: 50, available: { email: true, phone: true },
  people, counts: recount(people), ...over,
});
const result = (people: ContactsResult["people"], over: Partial<ContactsResult> = {}): ContactsResult => ({
  campaignId: "c1", mode: "both", people,
  counts: { asked: people.length, emails: 0, phones: 0, notFound: 0, looking: 0, had: 0, skipped: 0, failed: 0 },
  creditsUsed: 0, creditsLeft: 38, remaining: 0, notice: null, summary: "", ...over,
});
const row = (n: number, email: ContactsResult["people"][number]["email"], phone: ContactsResult["people"][number]["phone"]) =>
  ({ campaignCandidateId: `cc-${n}`, candidateId: `cand-${n}`, personId: `p-${n}`, email, phone });

let hidden = false;
/** Every screen a test mounts, so a failed assertion cannot leave one watching for the next test. */
const stops: Array<() => void> = [];
const watch = (id: string) => {
  const stop = store.watchContacts(id, () => {});
  stops.push(stop);
  return stop;
};
const reads = () => server.calls.filter((c) => c === "GET /v1/campaigns/c1/contacts/status").length;
const flush = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); };

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  const win = new EventTarget();
  vi.stubGlobal("window", win);
  const doc = new EventTarget();
  Object.defineProperty(doc, "hidden", { get: () => hidden });
  Object.defineProperty(doc, "visibilityState", { get: () => (hidden ? "hidden" : "visible") });
  vi.stubGlobal("document", doc);
  server.calls.length = 0;
  server.bodies.length = 0;
  server.fail = null;
  server.failRead = false;
  server.hold = null;
  server.status = status([person(1), person(2)]);
  server.post = () => result([]);
  hooks.invalidated.length = 0;
  store.resetContacts();
});
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  store.resetContacts();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reading a campaign's contact state", () => {
  it("asks once however many screens show it, and again only when it has gone stale", async () => {
    const stopA = watch("c1");
    const stopB = watch("c1");
    await flush();
    expect(reads()).toBe(1);
    expect(store.contactsNow("c1").ready).toBe(true);
    expect(store.contactsNow("c1").people).toHaveLength(2);
    // Another screen mounting a moment later is not another read.
    const stopC = watch("c1");
    await flush();
    expect(reads()).toBe(1);
    stopA(); stopB(); stopC();
    // Coming back after the status has gone stale reads it again.
    await flush(30_000);
    const stopD = watch("c1");
    await flush();
    expect(reads()).toBe(2);
    stopD();
  });

  it("finds a person by campaign candidate or by candidate, with the buttons' rules from the same read", async () => {
    server.status = status([person(1, { email: "found" }), person(2)], { creditsLeft: 0, closed: false });
    const stop = watch("c1");
    await flush();
    const v = store.contactsNow("c1");
    expect(v.of("cc-1")?.email).toBe("found");
    expect(v.ofCandidate("cand-2")?.campaignCandidateId).toBe("cc-2");
    expect(v.creditsLeft).toBe(0);
    expect(v.perRequest).toBe(50);
    stop();
  });

  it("keeps what it has when a later read fails, and says failed only when it never had anything", async () => {
    const stop = watch("c1");
    await flush();
    server.failRead = true;
    await store.load("c1");
    expect(store.contactsNow("c1").people).toHaveLength(2);
    expect(store.contactsNow("c1").failed).toBe(false);
    stop();

    store.resetContacts();
    const again = watch("c1");
    await flush();
    expect(store.contactsNow("c1").ready).toBe(false);
    expect(store.contactsNow("c1").failed).toBe(true);
    again();
  });
});

describe("asking for people's details", () => {
  it("shows them as working while it runs, then lays the answer over the table, and sends only what was asked", async () => {
    server.status = status([person(1), person(2), person(3)], { creditsLeft: 38 });
    const stop = watch("c1");
    await flush();
    let release!: () => void;
    server.hold = new Promise<void>((r) => { release = r; });
    server.post = () => result(
      [row(1, "found", "found"), row(2, "not_found", "looking")],
      { counts: { asked: 2, emails: 1, phones: 1, notFound: 1, looking: 1, had: 0, skipped: 0, failed: 0 }, creditsUsed: 1, creditsLeft: 37 },
    );
    const done = store.getContacts("c1", ["cc-1", "cc-2", "cc-1"], "both");
    await flush();
    // Working: the two people asked about, nobody else.
    expect(store.contactsNow("c1").busy("cc-1")).toBe("both");
    expect(store.contactsNow("c1").busy("cc-2")).toBe("both");
    expect(store.contactsNow("c1").busy("cc-3")).toBeNull();
    expect(store.contactsNow("c1").anyBusy).toBe(true);
    server.hold = null;
    release();
    const out = await done;
    expect(out.counts.emails).toBe(1);
    const v = store.contactsNow("c1");
    expect(v.anyBusy).toBe(false);
    expect(v.of("cc-1")).toMatchObject({ email: "found", phone: "found" });
    expect(v.of("cc-2")).toMatchObject({ email: "not_found", phone: "looking" });
    expect(v.of("cc-3")).toMatchObject({ email: "none", phone: "none" });
    expect(v.creditsLeft).toBe(37);
    // One request, each person once, in the shape the API takes.
    expect(server.bodies).toContainEqual({ campaignCandidateIds: ["cc-1", "cc-2"], mode: "both" });
    expect(server.calls).toContain("POST /v1/campaigns/c1/contacts");
    stop();
  });

  it("puts the calm sentence in front of the caller when the server refuses, and leaves the table as it was", async () => {
    const stop = watch("c1");
    await flush();
    server.fail = { status: 409, code: "conflict", message: "Contact details are already being fetched for this campaign." };
    await expect(store.getContacts("c1", ["cc-1"], "email")).rejects.toThrow("already being fetched");
    expect(store.contactsNow("c1").anyBusy).toBe(false);
    expect(store.contactsNow("c1").of("cc-1")?.email).toBe("none");
    stop();
  });

  it("says a failure in words, never naming a data provider", async () => {
    const { ApiError } = await import("../api/client");
    expect(store.errorLine(new ApiError(503, "unavailable", "Contact lookups aren't set up yet."))).toBe("Contact lookups aren't set up yet.");
    expect(store.errorLine(new ApiError(503, "unavailable", "SalesQL isn't connected, and Apollo too."))).toBe("The lookup service isn't connected, and the lookup service too.");
    expect(store.errorLine(new Error("boom"))).toBe("Couldn't get contact details. Try again in a moment.");
  });
});

describe("a phone that takes minutes", () => {
  it("is asked about again every few seconds, flips to found by itself, and then the board is read again and polling stops", async () => {
    server.status = status([person(1, { phone: "looking" }), person(2)]);
    const stop = watch("c1");
    await flush();
    expect(reads()).toBe(1);
    await flush(6000);
    expect(reads()).toBe(2);
    await flush(6000);
    expect(reads()).toBe(3);
    expect(hooks.invalidated).toEqual([]);

    // The number arrives.
    server.status = status([person(1, { phone: "found" }), person(2)]);
    await flush(6000);
    expect(reads()).toBe(4);
    expect(store.contactsNow("c1").of("cc-1")?.phone).toBe("found");
    expect(hooks.invalidated).toEqual([{ effects: ["pipeline", "candidates"], campaignId: "c1" }]);
    // Nobody is looking any more: it stops asking.
    await flush(60_000);
    expect(reads()).toBe(4);
    stop();
  });

  it("stops after ten minutes and says it will show when it arrives", async () => {
    server.status = status([person(1, { phone: "looking" })]);
    const stop = watch("c1");
    await flush();
    await flush(10 * 60_000);
    const after = reads();
    expect(store.contactsNow("c1").stalled).toBe(true);
    await flush(5 * 60_000);
    expect(reads()).toBe(after);
    const v = store.contactsNow("c1");
    expect(contactWords(v.of("cc-1")!.email, v.of("cc-1")!.phone, { stalled: v.stalled })).toBe(STILL_LOOKING);
    stop();
  });

  it("does not ask while the tab is hidden, and asks at once when it comes back", async () => {
    server.status = status([person(1, { phone: "looking" })]);
    const stop = watch("c1");
    await flush();
    expect(reads()).toBe(1);
    hidden = true;
    await flush(30_000);
    expect(reads()).toBe(1);
    hidden = false;
    (document as unknown as EventTarget).dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(reads()).toBe(2);
    stop();
  });

  it("stops asking when nobody is looking at the campaign any more", async () => {
    server.status = status([person(1, { phone: "looking" })]);
    const stop = watch("c1");
    await flush();
    stop();
    await flush(60_000);
    expect(reads()).toBe(1);
  });
});

describe("when something else changed who has details", () => {
  it("reads the campaigns on screen again for the campaign named, for every one when none is, and not for others", async () => {
    const stop = watch("c1");
    await flush();
    expect(reads()).toBe(1);
    hooks.onInvalidate?.(new Set(["candidates"]), new Set(["c9"]));
    await flush();
    expect(reads()).toBe(1);
    hooks.onInvalidate?.(new Set(["sourcing"]), new Set(["c1"]));
    await flush();
    expect(reads()).toBe(1);
    hooks.onInvalidate?.(new Set(["candidates"]), new Set(["c1"]));
    await flush();
    expect(reads()).toBe(2);
    hooks.onInvalidate?.(new Set(["pipeline"]), new Set([null]));
    await flush();
    expect(reads()).toBe(3);
    stop();
  });

  it("forgets everything when the workspace changes", async () => {
    const stop = watch("c1");
    await flush();
    expect(store.contactsNow("c1").ready).toBe(true);
    hooks.onWorkspace?.();
    expect(store.contactsNow("c1").ready).toBe(false);
    expect(store.contactsNow("c1").people).toEqual([]);
    stop();
  });
});
