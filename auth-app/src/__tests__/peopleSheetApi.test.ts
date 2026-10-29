import { describe, expect, it, vi } from "vitest";

/**
 * What is asked of the server for a sheet of people. A reading the card no longer wants (another was asked for, or the
 * card was left) and an adding that is left are cancelled in flight, so the signal has to reach the request.
 */

type Asked = { method: string; path: string; body: unknown; init: { signal?: AbortSignal; timeoutMs?: number } | undefined };
const asked: Asked[] = [];

vi.mock("../api/client", () => ({
  LONG_REQUEST_TIMEOUT_MS: 170_000,
  api: async (method: string, path: string, body?: unknown, init?: Asked["init"]) => {
    asked.push({ method, path, body, init });
    return {};
  },
}));

const { peopleSheetApi } = await import("../api/peopleSheet");

describe("a sheet of people, over the API", () => {
  it("lets a reading of a file be cancelled, and keeps the signal out of what is sent", async () => {
    asked.length = 0;
    const stop = new AbortController();
    await peopleSheetApi.read(new Blob(["x"]), { campaignId: "c-1", columns: "2:phone", signal: stop.signal });
    expect(asked[0]?.init?.signal).toBe(stop.signal);
    expect(asked[0]?.path).toBe("/v1/candidates/sheet/read?campaignId=c-1&columns=2%3Aphone");
    expect(asked[0]?.init?.timeoutMs).toBe(170_000);
  });

  it("lets a reading of a Google Sheet's link be cancelled, and keeps the signal out of the body", async () => {
    asked.length = 0;
    const stop = new AbortController();
    const url = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit";
    await peopleSheetApi.readLink(url, { campaignId: "c-1", signal: stop.signal });
    expect(asked[0]?.init?.signal).toBe(stop.signal);
    expect(asked[0]?.body).toEqual({ url, campaignId: "c-1" });
  });

  it("lets an adding be cancelled between batches and in the one that is in flight", async () => {
    asked.length = 0;
    const stop = new AbortController();
    await peopleSheetApi.send([{ fullName: "Asha Verma" }], "c-1", stop.signal);
    expect(asked[0]?.init?.signal).toBe(stop.signal);
    expect(asked[0]?.body).toEqual({ rows: [{ fullName: "Asha Verma" }], mode: "skip", campaignId: "c-1" });
  });

  it("says which tabs to add and whether to read what the workbook hides, in the query", async () => {
    asked.length = 0;
    await peopleSheetApi.read(new Blob(["x"]), { campaignId: "c-1", tabs: ["Candidates", "Q3, late"], hidden: true });
    const path = asked[0]?.path ?? "";
    const params = new URL(path, "http://x.test").searchParams;
    expect(JSON.parse(params.get("tabs") ?? "[]")).toEqual(["Candidates", "Q3, late"]);
    expect(params.get("hidden")).toBe("include");
    asked.length = 0;
    await peopleSheetApi.read(new Blob(["x"]), { campaignId: "c-1" });
    expect(asked[0]?.path).toBe("/v1/candidates/sheet/read?campaignId=c-1");
  });

  it("asks as it always did when there is no signal", async () => {
    asked.length = 0;
    await peopleSheetApi.read(new Blob(["x"]));
    await peopleSheetApi.readLink("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit");
    await peopleSheetApi.send([], null);
    for (const call of asked) expect(call.init && "signal" in call.init).toBeFalsy();
    expect(asked[2]?.body).toEqual({ rows: [], mode: "skip" });
  });
});
