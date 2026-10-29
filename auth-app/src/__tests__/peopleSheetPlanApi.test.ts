import { describe, expect, it, vi } from "vitest";

/**
 * What is asked of the server when the model's help is wanted for a sheet, and when a plan the card kept is sent back: the
 * person's words and the plan travel in headers, so a request log never holds them, and a reading with neither asks as it always did.
 */

type Asked = { method: string; path: string; body: unknown; init: { headers?: Record<string, string>; signal?: AbortSignal; timeoutMs?: number } | undefined };
const asked: Asked[] = [];

vi.mock("../api/client", () => ({
  LONG_REQUEST_TIMEOUT_MS: 170_000,
  api: async (method: string, path: string, body?: unknown, init?: Asked["init"]) => {
    asked.push({ method, path, body, init });
    return {};
  },
}));

const { peopleSheetApi, planHeader } = await import("../api/peopleSheet");
type ClientPlan = import("../peopleSheet").ClientPlan;

const PLAN: ClientPlan = {
  tabs: [{ name: "Q3, late", use: "people" }],
  changes: [{ tab: "Q3, late", col: 1, role: "phone" }],
  where: [{ field: "location", op: "any_of", values: ["Pünë"], n: null, on: false }],
};
const decode = (header: string | undefined) => JSON.parse(Buffer.from(header ?? "", "base64url").toString("utf8")) as unknown;

describe("the plan, in a header", () => {
  it("is the base64url of its JSON, and reads back to the same plan, even with letters that are not ASCII", () => {
    const header = planHeader(PLAN);
    expect(header).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decode(header)).toEqual(PLAN);
  });
});

describe("a sheet read with the words typed beside it", () => {
  it("goes to the plan route, with the words in a header URL-encoded and kept out of the address", async () => {
    asked.length = 0;
    await peopleSheetApi.plan(new Blob(["x"]), "only the ones in Pune, ça va?", { campaignId: "c-1", columns: "2:phone" });
    expect(asked[0]?.path).toBe("/v1/candidates/sheet/plan?campaignId=c-1&columns=2%3Aphone");
    expect(asked[0]?.path).not.toContain("Pune");
    expect(asked[0]?.init?.headers?.["x-intake-say"]).toBe(encodeURIComponent("only the ones in Pune, ça va?"));
    expect(asked[0]?.init?.headers?.["content-type"]).toBe("application/octet-stream");
    expect(asked[0]?.init?.timeoutMs).toBe(170_000);
  });

  it("sends no more of the words than the server takes, and none when there are none", async () => {
    asked.length = 0;
    await peopleSheetApi.plan(new Blob(["x"]), "x".repeat(900));
    expect(decodeURIComponent(asked[0]?.init?.headers?.["x-intake-say"] ?? "").length).toBe(300);
    asked.length = 0;
    await peopleSheetApi.plan(new Blob(["x"]), "");
    expect(asked[0]?.init?.headers).not.toHaveProperty("x-intake-say");
  });

  it("reads a Google Sheet's link the same way, with the words in the header and not in the body", async () => {
    asked.length = 0;
    const url = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit";
    const stop = new AbortController();
    await peopleSheetApi.planLink(url, "only Pune", { campaignId: "c-1", signal: stop.signal });
    expect(asked[0]?.path).toBe("/v1/candidates/sheet/plan");
    expect(asked[0]?.body).toEqual({ url, campaignId: "c-1" });
    expect(asked[0]?.init?.headers?.["x-intake-say"]).toBe("only%20Pune");
    expect(asked[0]?.init?.signal).toBe(stop.signal);
  });

  it("can be cancelled in flight, as any reading can", async () => {
    asked.length = 0;
    const stop = new AbortController();
    await peopleSheetApi.plan(new Blob(["x"]), "only Pune", { signal: stop.signal });
    expect(asked[0]?.init?.signal).toBe(stop.signal);
  });
});

describe("a sheet read again with the plan the card kept", () => {
  it("sends the plan in a header, for a file and for a link, and nothing extra without one", async () => {
    asked.length = 0;
    await peopleSheetApi.read(new Blob(["x"]), { campaignId: "c-1", plan: PLAN });
    expect(asked[0]?.path).toBe("/v1/candidates/sheet/read?campaignId=c-1");
    expect(decode(asked[0]?.init?.headers?.["x-sheet-plan"])).toEqual(PLAN);
    expect(asked[0]?.init?.headers?.["content-type"]).toBe("application/octet-stream");
    asked.length = 0;
    await peopleSheetApi.readLink("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit", { plan: PLAN });
    expect(decode(asked[0]?.init?.headers?.["x-sheet-plan"])).toEqual(PLAN);
    expect(asked[0]?.body).toEqual({ url: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit" });
    asked.length = 0;
    await peopleSheetApi.read(new Blob(["x"]), { campaignId: "c-1" });
    expect(asked[0]?.init?.headers).not.toHaveProperty("x-sheet-plan");
    await peopleSheetApi.readLink("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit");
    expect(asked[1]?.init).not.toHaveProperty("headers");
  });
});
