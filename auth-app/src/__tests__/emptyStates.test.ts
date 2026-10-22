import { describe, expect, it } from "vitest";
import { usageIsIdle } from "../analytics";
import { ApiError } from "../api/client";
import type { GoogleConnection, OrgConnection } from "../api/identity";
import type { ConnectionsState } from "../connectionsStore";
import { EMPTY_ART } from "../EmptyArt";
import { celebratesFirstHire, connectionNotice, isFirstHire, listEmptyArt, shortlistEmpty, signedOutTitle } from "../emptyStates";
import type { ErrorKind } from "../ErrorStates";
import { errorCopy, errorKindOf, kindOfLastFailure } from "../ErrorStates";
import { channelsRow, integrationsOf } from "../railConfig";
import { loadFailedText } from "../ui";

/**
 * Which picture a state gets. The pictures are decoration, so these tests are what keeps a
 * list that is empty for two different reasons from showing the same one for both.
 */

describe("a list that is empty shows its own picture, a list that is filtered shows the magnifier", () => {
  it("uses the page's picture when nothing exists, sized for a page", () => {
    expect(listEmptyArt("campaigns", false)).toEqual({ name: "empty-campaigns", size: 220 });
    expect(listEmptyArt("candidates", false)).toEqual({ name: "empty-candidates", size: 220 });
    expect(listEmptyArt("calls", false)).toEqual({ name: "empty-calls", size: 200 });
    expect(listEmptyArt("clients", false)).toEqual({ name: "empty-clients", size: 200 });
    expect(listEmptyArt("shortlist", false)).toEqual({ name: "empty-shortlist", size: 180 });
  });

  it("uses the same smaller magnifier for every list when a search or filter hides what exists", () => {
    for (const k of ["campaigns", "candidates", "calls", "clients", "shortlist"] as const) {
      expect(listEmptyArt(k, true)).toEqual({ name: "empty-search", size: 160 });
    }
  });

  it("only names pictures that exist", () => {
    for (const k of ["campaigns", "candidates", "calls", "clients", "shortlist"] as const) {
      for (const narrowed of [true, false]) expect(EMPTY_ART).toContain(listEmptyArt(k, narrowed).name);
    }
  });
});

describe("the shortlist table's empty states", () => {
  it("is empty when the pipeline has nobody", () => {
    expect(shortlistEmpty({ total: 0, passed: 0, status: null, narrowed: false })).toBe("none");
    expect(shortlistEmpty({ total: 0, passed: 0, status: "passed", narrowed: false })).toBe("none");
  });

  it("is the Passed picture when that filter is on and nobody has been passed on", () => {
    expect(shortlistEmpty({ total: 6, passed: 0, status: "passed", narrowed: false })).toBe("passed");
  });

  it("is a plain no-match once a search narrows it, or when people were passed on", () => {
    expect(shortlistEmpty({ total: 6, passed: 0, status: "passed", narrowed: true })).toBe("no-match");
    expect(shortlistEmpty({ total: 6, passed: 2, status: "passed", narrowed: false })).toBe("no-match");
    expect(shortlistEmpty({ total: 6, passed: 0, status: "hired", narrowed: false })).toBe("no-match");
    expect(shortlistEmpty({ total: 6, passed: 0, status: null, narrowed: true })).toBe("no-match");
  });
});

describe("the first hire", () => {
  const ps = [
    { id: "a", stage: "shortlisted" },
    { id: "b", stage: "interviewing" },
    { id: "c", stage: "hired" },
  ];

  it("is the first only when nobody else is hired yet", () => {
    expect(isFirstHire(ps.slice(0, 2), ps[1]!, "hired")).toBe(true);
    expect(isFirstHire(ps, ps[1]!, "hired")).toBe(false);
  });

  it("is not a hire when the move is to another stage, or the person was already hired", () => {
    expect(isFirstHire(ps.slice(0, 2), ps[1]!, "outreach")).toBe(false);
    expect(isFirstHire(ps, ps[2]!, "hired")).toBe(false);
  });

  it("is celebrated on the Hires card only while it is the one hire and recent", () => {
    expect(celebratesFirstHire([{ inStage: 1 }])).toBe(true);
    expect(celebratesFirstHire([{ inStage: 3 }])).toBe(true);
    expect(celebratesFirstHire([{ inStage: 9 }])).toBe(false);
    expect(celebratesFirstHire([{ inStage: 0 }, { inStage: 1 }])).toBe(false);
    expect(celebratesFirstHire([])).toBe(false);
  });
});

describe("errors get a calm picture and sentence by what went wrong", () => {
  const KINDS: ErrorKind[] = ["network", "server", "session", "rate-limit", "no-access", "connector"];

  it("has a picture, a title and a sentence for every kind, and no alarm words", () => {
    for (const k of KINDS) {
      const c = errorCopy(k);
      expect(EMPTY_ART, k).toContain(c.art.name);
      expect(c.art.name.startsWith("err-"), k).toBe(true);
      expect(c.title.length, k).toBeGreaterThan(0);
      expect(c.text.length, k).toBeGreaterThan(0);
      expect(`${c.title} ${c.text}`, k).not.toMatch(/[!]|error|failed|fatal|oops|sorry/i);
    }
  });

  it("maps a failed request to the kind that says whose move it is", () => {
    expect(errorKindOf(new ApiError(0, "network", "x"))).toBe("network");
    expect(errorKindOf(new ApiError(401, "unauthenticated", "x"))).toBe("session");
    expect(errorKindOf(new ApiError(403, "forbidden", "x"))).toBe("no-access");
    expect(errorKindOf(new ApiError(429, "rate_limited", "x"))).toBe("rate-limit");
    expect(errorKindOf(new ApiError(500, "error", "x"))).toBe("server");
    expect(errorKindOf(new ApiError(503, "unavailable", "x"))).toBe("server");
  });

  it("leaves a refusal with its own sentence alone", () => {
    expect(errorKindOf(new ApiError(400, "bad_request", "Name is required."))).toBeNull();
    expect(errorKindOf(new ApiError(404, "not_found", "No such form."))).toBeNull();
    expect(errorKindOf(new Error("boom"))).toBeNull();
    expect(errorKindOf("nope")).toBeNull();
  });

  it("reads the client's last failure as a kind, and calls anything unknown ours", () => {
    expect(kindOfLastFailure("network")).toBe("network");
    expect(kindOfLastFailure("limited")).toBe("rate-limit");
    expect(kindOfLastFailure("session")).toBe("session");
    expect(kindOfLastFailure("access")).toBe("no-access");
    expect(kindOfLastFailure("server")).toBe("server");
    expect(kindOfLastFailure(null)).toBe("server");
  });

  it("says a signed-out session and a refusal in the failed-load sentence", () => {
    expect(loadFailedText("Your clients", "session")).toBe("Your clients didn't load. Your session has ended; sign in again.");
    expect(loadFailedText("Your clients", "access")).toBe("Your clients didn't load. You don't have access to this.");
  });
});

describe("what is connected", () => {
  const google = (over: Partial<GoogleConnection> = {}): GoogleConnection => ({
    available: true, status: "disconnected", accountEmail: null, scopes: [], products: [], connectedAt: null, ...over,
  });
  const org = (provider: "slack" | "notion", over: Partial<OrgConnection> = {}): OrgConnection => ({
    provider, status: "connected", accountName: "bot", workspaceName: "Acme", connectedBy: { id: "u", name: "Asha" },
    connectedAt: "2026-10-09T00:00:00Z", lastUsedAt: null, lastError: null, scopes: [], settings: {}, ...over,
  });
  const conns = (over: Partial<ConnectionsState> = {}): ConnectionsState => ({
    status: "ready", google: google(), slack: null, notion: null, oauth: { slack: false, notion: false }, error: null, at: 0, ...over,
  });

  it("is the empty picture when nothing is connected, and says nothing otherwise", () => {
    expect(connectionNotice(integrationsOf(conns(), []))).toEqual({ kind: "none" });
    expect(connectionNotice(integrationsOf(conns({ slack: org("slack") }), []))).toBeNull();
    expect(connectionNotice([])).toBeNull();
  });

  it("names what is signed out, ahead of 'nothing connected'", () => {
    const n = connectionNotice(integrationsOf(conns({ slack: org("slack", { status: "expired" }), notion: org("notion", { status: "expired" }) }), []));
    expect(n).toEqual({ kind: "signed-out", names: ["Slack", "Notion"] });
    expect(signedOutTitle(["Slack"])).toBe("Slack is signed out");
    expect(signedOutTitle(["Slack", "Notion"])).toBe("Slack and Notion are signed out");
    expect(signedOutTitle(["Google", "Slack", "Notion"])).toBe("Google, Slack and Notion are signed out");
  });

  it("keeps the Agent page's Channels row to text: no picture, with the connect links under it", () => {
    const viewer = { role: "admin" as const };
    const none = channelsRow(conns(), viewer, () => {}, []);
    expect(none).not.toHaveProperty("art");
    expect(none).toMatchObject({ value: "None connected", notes: [{ text: "Connect Google, Slack and Notion", href: "#/settings/connections" }] });
    expect(channelsRow(conns({ slack: org("slack") }), viewer, () => {}, [])).not.toHaveProperty("art");
    expect(channelsRow(conns({ status: "loading" }), viewer, () => {})).toMatchObject({ pending: true });
  });
});

describe("usage with nothing used", () => {
  const day = (n: number) => ({ day: `2026-10-0${n}`, messages: 0, searches: 0, specs: 0, profiles: 0, exports: 0 });
  it("is idle when every day is zero in every series", () => {
    expect(usageIsIdle([day(1), day(2), day(3)])).toBe(true);
    expect(usageIsIdle([])).toBe(true);
  });
  it("is not idle once anything was used", () => {
    expect(usageIsIdle([day(1), { ...day(2), exports: 1 }])).toBe(false);
  });
});
