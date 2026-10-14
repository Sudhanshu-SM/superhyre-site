import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A tab that is told its workspace is not the active one (another tab switched, or an approval or acceptance moved
 * the person) reloads once, quietly: one request says so, the ones that were in flight say nothing, and nothing
 * more is asked for the old workspace until the new one is known.
 */

vi.mock("../supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } },
}));
vi.stubEnv("VITE_API_URL", "http://api.test");
vi.stubEnv("VITE_DEV_API_TOKEN", "dev-token");

const mismatch = () => new Response(
  JSON.stringify({ error: { code: "conflict", message: "Your workspace changed.", workspaceChanged: true } }),
  { status: 409, headers: { "content-type": "application/json" } },
);
const ok = (body: unknown = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

let client: typeof import("../api/client");
let problems: typeof import("../problems");
let fetched: string[];
let handler: (path: string) => Response;

beforeEach(async () => {
  vi.resetModules();
  fetched = [];
  handler = () => ok();
  vi.stubGlobal("fetch", async (url: string) => {
    const path = url.replace("http://api.test", "");
    fetched.push(path);
    return handler(path);
  });
  client = await import("../api/client");
  problems = await import("../problems");
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("a tab on a workspace that is no longer the active one", () => {
  it("reloads once however many requests were in flight, and stops asking for the old workspace meanwhile", async () => {
    const onMismatch = vi.fn();
    client.onWorkspaceMismatch(onMismatch);
    client.setTabWorkspace(null);
    handler = () => mismatch();

    const six = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => client.api("GET", `/v1/thing/${i}`)));
    expect(six.every((r) => r.status === "rejected")).toBe(true);
    expect(onMismatch).toHaveBeenCalledTimes(1);
    expect(client.workspaceSettling()).toBe(true);

    // Stale: nothing more goes out for the old workspace (and it fails quietly, with no line of its own).
    fetched.length = 0;
    const held = await client.api("GET", "/v1/campaigns").catch((e: unknown) => e);
    expect(fetched).toEqual([]);
    expect(client.isQuiet(held)).toBe(true);

    // The account itself is never held back: it is how the tab finds out where it is.
    handler = () => ok({ user: {} });
    await client.api("GET", "/v1/me");
    expect(fetched).toEqual(["/v1/me"]);

    // Reloaded into the new workspace: requests go out again, for it.
    client.setTabWorkspace("org-1");
    fetched.length = 0;
    await client.api("GET", "/v1/campaigns");
    expect(fetched).toEqual(["/v1/campaigns"]);
  });

  it("says nothing about a request that left for the workspace the tab has since left", async () => {
    const onMismatch = vi.fn();
    client.onWorkspaceMismatch(onMismatch);
    client.setTabWorkspace(null);
    let release: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", () => new Promise<Response>((r) => { release = r; }));
    const slow = client.api("GET", "/v1/campaigns").catch((e: unknown) => e);
    await Promise.resolve();
    // The tab reloads into another workspace while it is on its way; then the old answer arrives.
    client.setTabWorkspace("org-2");
    release(mismatch());
    const failure = await slow;
    expect(client.isQuiet(failure)).toBe(true);
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it("keeps failure lines back while the workspace settles, and shows them again after", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      client.onWorkspaceMismatch(() => {});
      client.setTabWorkspace(null);
      handler = () => mismatch();
      await client.api("GET", "/v1/campaigns").catch(() => {});
      problems.reportProblem("Campaigns didn't load. Your workspace changed.");
      expect(problems.problemNow()).toBeNull();

      // Reloaded into the new workspace; once the moment has passed, a real failure is said as before.
      client.setTabWorkspace("org-1");
      vi.setSystemTime(Date.now() + 10_000);
      problems.reportProblem("That invitation wasn't accepted. Try again.");
      expect(problems.problemNow()?.text).toBe("That invitation wasn't accepted. Try again.");
      // The same line twice is one line.
      const n = problems.problemNow()?.n;
      problems.reportProblem("That invitation wasn't accepted. Try again.");
      expect(problems.problemNow()?.n).toBe(n);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tells a removed member (403) from a member whose workspace changed (409), and each says its own line", async () => {
    const seen: { removed: boolean; line: string; leave: boolean }[] = [];
    client.onWorkspaceMismatch((failure) => {
      const { notice, leaveOrg } = client.afterMismatch(failure);
      seen.push({ removed: failure.details.removed === true, line: notice, leave: leaveOrg });
    });

    client.setTabWorkspace("org-1");
    handler = () => new Response(
      JSON.stringify({ error: { code: "forbidden", message: "You're no longer a member of Acme.", removed: true, workspaceChanged: true } }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
    await client.api("GET", "/v1/campaigns").catch(() => {});
    client.setTabWorkspace("org-1");
    handler = () => mismatch();
    await client.api("GET", "/v1/campaigns").catch(() => {});

    expect(seen).toEqual([
      { removed: true, line: "You're no longer a member of Acme. You're in Personal now.", leave: true },
      { removed: false, line: "Something changed. Updating.", leave: false },
    ]);
  });

  it("names where it landed, in words a person uses", () => {
    expect(client.landedLine("Acme")).toBe("You're in Acme now.");
    expect(client.landedLine(null)).toBe("You're in Personal now.");
  });
});
