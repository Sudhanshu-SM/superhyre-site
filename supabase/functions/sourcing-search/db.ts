// Every database call this function makes, as the *caller* — never as a
// service role. Same posture as reveal-phone/db.ts: the user's own JWT goes to
// PostgREST, so auth.uid() inside the sourcing_* RPCs is the real person, and
// core.require_superhyre() is what actually gates this to the SuperHyre team.
// This function holds no elevated database credential; the only secrets it
// owns are the ContactOut and AI-gateway keys.
const SUPABASE_URL = "https://npqajviolhoufuggfobg.supabase.co";
// Publishable/anon key — public by design, only ever the `apikey` header. It
// authorises nothing on its own: every RPC below is granted to `authenticated`
// only (anon explicitly revoked — see migration lock_down_sourcing_rpc_grants).
const PUBLISHABLE_KEY = "sb_publishable_GNHiZtlyWPLQQhySPd7Vhg_aTcqYWex";

async function rpc<T>(fn: string, args: Record<string, unknown>, jwt: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${fn} returned ${res.status} ${detail}`.trim().slice(0, 500));
  }
  // The void-returning RPCs (attachPlan, saveCandidates, finish) come back as
  // 204 No Content with an empty body — correct PostgREST behaviour for a SQL
  // function that `returns void`, not an error. res.json() on an empty body
  // throws a bare "Unexpected end of JSON input" with nothing to say which
  // call it was, which is exactly the failure this sidesteps.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export type StartResult = { runId: string; jdHash: string; previousRuns: number; seenUrls: string[] };

export function start(
  p: { jd: string; comments: string; requested: number },
  jwt: string,
): Promise<StartResult> {
  return rpc<StartResult>("sourcing_start", { p }, jwt);
}

export function attachPlan(
  p: { runId: string; filters: unknown; locked: unknown; summary: string },
  jwt: string,
): Promise<void> {
  return rpc<void>("sourcing_plan_attach", { p }, jwt);
}

export function saveCandidates(
  p: { runId: string; jdHash: string; candidates: unknown[] },
  jwt: string,
): Promise<void> {
  return rpc<void>("sourcing_candidates_save", { p }, jwt);
}

export function finish(
  p: { runId: string; returned: number; skipped: number; scanned: number; status?: string; error?: string },
  jwt: string,
): Promise<void> {
  return rpc<void>("sourcing_finish", { p }, jwt);
}

export type HistoryRun = {
  id: string; jd_hash: string; jd_label: string; comments: string;
  requested: number; returned: number; skipped_seen: number; scanned: number;
  summary: string; status: string; error: string | null; created_at: string; mine: boolean;
};

export async function history(limit: number, jwt: string): Promise<HistoryRun[]> {
  const { runs } = await rpc<{ runs: HistoryRun[] }>("sourcing_history", { p: { limit } }, jwt);
  return runs;
}

export function runGet(runId: string, jwt: string): Promise<Record<string, unknown>> {
  return rpc<Record<string, unknown>>("sourcing_run_get", { p: { runId } }, jwt);
}

export function forget(body: { jd?: string; jdHash?: string }, jwt: string): Promise<{ forgotten: number }> {
  return rpc<{ forgotten: number }>("sourcing_forget", { p: body }, jwt);
}
