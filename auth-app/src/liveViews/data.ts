import { api } from "../api/client";
import type { RunLite } from "../liveReports";

/** One of the agent's runs as the API lists them (server: modules/runs). */
export type RunRow = RunLite & { id: string; campaignName: string | null; mine: boolean };

/** The most the API gives in a page of runs. */
export const RUN_PAGE = 100;

/**
 * Agent work the person may see, newest first, one page. Narrowed by the server to a campaign and a
 * start time, so a busy workspace's chat turns don't push a campaign's searches off the page.
 */
export const listRuns = (opts: { campaignId?: string; since?: number; limit?: number } = {}) => {
  const q = new URLSearchParams({ limit: String(opts.limit ?? RUN_PAGE) });
  if (opts.campaignId) q.set("campaignId", opts.campaignId);
  if (opts.since) q.set("since", new Date(opts.since).toISOString());
  return api<{ runs: RunRow[] }>("GET", `/v1/runs?${q.toString()}`).then((r) => r.runs);
};
