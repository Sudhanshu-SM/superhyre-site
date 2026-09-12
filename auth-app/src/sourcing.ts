// Client for the sourcing-search Edge Function: JD in, ranked ContactOut
// candidates out. The function itself ports sourcing/lib/* (see
// supabase/functions/sourcing-search/); this file is the browser side that
// used to be sourcing/public/app.js, rewritten against fetch + a Supabase
// session instead of a same-origin local server.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config";
import { supabase } from "./supabase";

const FN_URL = `${SUPABASE_URL}/functions/v1/sourcing-search`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  return { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` };
}

export type Filters = Record<string, string[] | string | boolean | undefined>;

export type Candidate = {
  url: string; name: string; title: string; headline: string; company: string;
  companyDomain: string; companySize: number | null; industry: string; location: string;
  seniority: string; jobFunction: string; skills: string[]; experience: string[];
  education: string[]; available: Record<string, boolean> | null;
  emails: string[]; phones: string[];
  matchedAfterDropping?: string[];
  score?: number | null;
  reason?: string;
};

export type Plan = {
  roleSummary: string;
  mustHaves: string[];
  unmapped: string[];
  filters: Filters;
  locked: string[];
  dropped: string[];
};

export type SearchEvent =
  | { type: "start"; runId: string; jdHash: string; previousRuns: number; previouslySeen: number }
  | ({ type: "plan" } & Plan)
  | { type: "stage"; stage: string; message: string; removed?: string[] }
  | { type: "page"; page: number; total: number | null; scanned: number; fetched: number; kept: number; collected: number; skipped: number; budget: number }
  | { type: "done"; runId: string; candidates: Candidate[]; requested: number; returned: number; skippedSeen: number; scanned: number; budgetLeft: number; exhausted: boolean }
  | { type: "error"; runId: string; message: string; partial: number };

export type SearchPayload = {
  jd: string;
  comments: string;
  count: number;
  revealInfo: boolean;
  fastForward: boolean;
  broaden: boolean;
  score: boolean;
  dataTypes: string[];
};

/** Streams NDJSON progress events as the pipeline runs, exactly like the
 *  local tool's app.js did against its same-origin server — the only change
 *  is the URL and the Authorization header. */
export async function runSourcingSearch(
  payload: SearchPayload,
  onEvent: (event: SearchEvent) => void,
): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${FN_URL}/search`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as SearchEvent);
    }
  }
}

export type HistoryRun = {
  id: string; jd_hash: string; jd_label: string; comments: string;
  requested: number; returned: number; skipped_seen: number; scanned: number;
  summary: string; status: string; error: string | null; created_at: string; mine: boolean;
};

export async function fetchSourcingHistory(limit = 40): Promise<HistoryRun[]> {
  const headers = await authHeaders();
  const res = await fetch(`${FN_URL}/history?limit=${limit}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { runs } = await res.json();
  return runs;
}

export type RunDetail = HistoryRun & {
  jd_text: string; filters: Filters; locked: string[]; candidates: Candidate[];
};

export async function fetchSourcingRun(id: string): Promise<RunDetail> {
  const headers = await authHeaders();
  const res = await fetch(`${FN_URL}/runs/${id}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function forgetSourcingJd(jd: string): Promise<{ forgotten: number }> {
  const headers = await authHeaders();
  const res = await fetch(`${FN_URL}/forget`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ jd }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
