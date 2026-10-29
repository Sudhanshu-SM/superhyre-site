import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Nothing on the screen waits for ever. A request that gets no answer ends in a calm line with a way to try again; a
 * dead event line is noticed and made again; a card or a loader that has waited too long says so, once, at its
 * limits. Time is fake here, so a minute is a moment.
 */

vi.mock("../supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } },
}));
vi.stubEnv("VITE_API_URL", "http://api.test");
vi.stubEnv("VITE_DEV_API_TOKEN", "dev-token");

const text = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A fetch that never answers unless it is cancelled, as a hung connection behaves. */
function hangingFetch() {
  const seen: Array<{ url: string; aborted: () => boolean }> = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const signal = init.signal as AbortSignal;
    seen.push({ url, aborted: () => signal.aborted });
    return new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  });
  return seen;
}

describe("a request that gets no answer", () => {
  let client: typeof import("../api/client");
  let states: typeof import("../ErrorStates");
  beforeEach(async () => {
    vi.resetModules();
    client = await import("../api/client");
    states = await import("../ErrorStates");
    client.setTabWorkspace(null);
  });

  it("ends at 30 seconds with the calm line, cancels the request, and leaves no timer running", async () => {
    vi.useFakeTimers();
    const seen = hangingFetch();
    const run = client.api("GET", "/v1/campaigns").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(seen[0]?.aborted()).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    const err = (await run) as InstanceType<typeof client.ApiError>;
    expect(err).toBeInstanceOf(client.ApiError);
    expect(err).toMatchObject({ status: 504, code: "timeout", message: client.SLOW_MESSAGE });
    expect(seen[0]?.aborted()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    // It reads as "slow", not as a dropped connection or a fault of ours, and offers Try again.
    expect(client.lastFailureKind()).toBe("timeout");
    expect(states.errorKindOf(err)).toBe("slow");
    expect(states.errorCopy("slow").text).toBe("Nothing was changed. Try again.");
  });

  it("does not claim a write changed nothing", async () => {
    vi.useFakeTimers();
    hangingFetch();
    const run = client.api("POST", "/v1/outreach/messages/approve", { ids: ["a"] }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(await run).toMatchObject({ code: "timeout", message: client.SLOW_WRITE_MESSAGE, details: { maybeDone: true } });
  });

  it("gives a slow-by-nature request its longer time, and a stream or an explicit limit its own", async () => {
    vi.useFakeTimers();
    hangingFetch();
    const long = client.api("POST", "/v1/attachments/read", new ArrayBuffer(2)).catch((e: unknown) => e);
    const own = client.api("GET", "/v1/slowish", undefined, { timeoutMs: 5_000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await own).toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(60_000);
    let settled = false;
    void long.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(110_000);
    expect(await long).toMatchObject({ code: "timeout" });
    expect(client.timeoutFor("/v1/campaigns")).toBe(client.REQUEST_TIMEOUT_MS);
    expect(client.timeoutFor("/v1/campaigns", false)).toBeNull();
    expect(client.timeoutFor("/v1/campaigns/x/draft-from-file")).toBe(client.LONG_REQUEST_TIMEOUT_MS);
    // Putting a sheet's people on their stages is a transaction a person, so a hundred of them take far more than 30 seconds.
    for (const slowByNature of ["/v1/runs/r1/approvals/3", "/v1/campaigns/c1/spec/draft", "/v1/contacts/fetch", "/v1/campaigns/c1/export/sheets", "/v1/campaigns/c1/place"]) {
      expect(client.timeoutFor(slowByNature)).toBe(client.LONG_REQUEST_TIMEOUT_MS);
    }
  });

  it("is cut off even when the body never ends", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, text: () => new Promise<string>(() => {}) }));
    const run = client.api("GET", "/v1/me").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(await run).toMatchObject({ code: "timeout" });
  });

  it("reads the server's own 504 as the same thing", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { code: "timeout", message: "That took longer than expected. Nothing was changed. Try again." } }), { status: 504, headers: { "content-type": "application/json" } }));
    const err = await client.api("GET", "/v1/me").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 504, code: "timeout" });
    expect(client.lastFailureKind()).toBe("timeout");
    expect(states.errorKindOf(err)).toBe("slow");
  });

  it("keeps a dropped connection a dropped connection, and the caller's own stop theirs", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    expect(await client.api("GET", "/v1/me").catch((e: unknown) => e)).toMatchObject({ status: 0, code: "network" });
    const seen = hangingFetch();
    const mine = new AbortController();
    const run = client.api("GET", "/v1/me", undefined, { signal: mine.signal }).catch((e: unknown) => e);
    mine.abort();
    expect(await run).toMatchObject({ code: "network" });
    expect(seen[0]?.aborted()).toBe(true);
  });
});

describe("a wait that has gone on too long", () => {
  it("is ok, then slow, then stuck, at its limits", async () => {
    const { slowLevel, watchSlow } = await import("../slowState");
    expect(slowLevel(null, 1_000)).toBe("ok");
    expect(slowLevel(1_000, 1_000 + 14_999)).toBe("ok");
    expect(slowLevel(1_000, 1_000 + 15_000)).toBe("slow");
    expect(slowLevel(1_000, 1_000 + 60_000)).toBe("stuck");
    expect(slowLevel(0, 20_000, { soft: 30_000, hard: 90_000 })).toBe("ok");
    expect(slowLevel(0, 95_000, { soft: 30_000, hard: 90_000 })).toBe("stuck");

    vi.useFakeTimers();
    const seen: string[] = [];
    const stop = watchSlow(Date.now(), { soft: 10_000, hard: 40_000 }, (l) => seen.push(l));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(seen).toEqual(["ok"]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(seen).toEqual(["ok", "slow"]);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(seen).toEqual(["ok", "slow", "stuck"]);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts where it already is for a card that mounts late, and clears its timers when the wait ends", async () => {
    const { watchSlow } = await import("../slowState");
    vi.useFakeTimers();
    const seen: string[] = [];
    const stop = watchSlow(Date.now() - 30_000, {}, (l) => seen.push(l));
    expect(seen).toEqual(["slow"]);
    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("says nothing while the wait is young, one calm line when slow, and a way on when over", async () => {
    const { SlowNote } = await import("../components/SlowNote");
    expect(renderToStaticMarkup(<SlowNote level="ok" />)).toBe("");
    const slow = renderToStaticMarkup(<SlowNote level="slow" onCancel={() => {}} onRetry={() => {}} />);
    expect(text(slow)).toBe("Taking longer than usual. Try again Cancel");
    expect(slow).toContain('role="status"');
    const stuck = renderToStaticMarkup(<SlowNote level="stuck" what="Your requirements" onRetry={() => {}} />);
    expect(text(stuck)).toBe("Your requirements didn't finish. Nothing was changed. Try again");
    expect(stuck).toContain('role="alert"');
    // Never red, never an exclamation mark.
    expect(slow + stuck).not.toContain("!");
  });
});

describe("an email going out", () => {
  it("says which one it is on, so a card that is slow by design never looks hung", async () => {
    vi.resetModules();
    const { EmailOutcome } = await import("../agentCards/EmailOutcome");
    const outcome = { tone: "done" as const, summary: "Sent 1 of 3.", counts: "", next: [], email: { failures: [], again: false, settled: false, help: null, reconnect: false, notes: [] } };
    const approval = {
      seq: 1, summary: "", action: "send_email", detail: {}, campaignId: null, campaignName: null, people: [], deciding: false, error: null,
      notes: [], capability: null, wontDo: [], emails: [],
      decided: { decision: "approve" as const, outcome: { counts: { total: 3, sent: 1, waiting: 2, failed: 0, held: 0 }, settled: false } },
    };
    const out = renderToStaticMarkup(<EmailOutcome turnKey="t" approval={approval as never} outcome={outcome} campaignId={null} />);
    expect(text(out)).toContain("Sending 2 of 3, one at a time");
    const one = renderToStaticMarkup(
      <EmailOutcome turnKey="t" approval={{ ...approval, decided: { decision: "approve", outcome: { counts: { total: 1, sent: 0, waiting: 1, failed: 0, held: 0 }, settled: false } } } as never} outcome={outcome} campaignId={null} />,
    );
    expect(text(one)).toContain("Going out");
    expect(text(one)).not.toContain("of 1");
  });
});
