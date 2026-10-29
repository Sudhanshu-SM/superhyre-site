import type { BatchResult, ClientPlan, PeopleSheet, PlaceAnswer, PlaceRequest, SheetFields } from "../peopleSheet";
import { api, LONG_REQUEST_TIMEOUT_MS } from "./client";

/**
 * A recruiter's own sheet of people over the API (server: modules/candidates/sheet-import.ts). Reading a sheet changes
 * nothing; it says what is in it and what adding it would do. The people it names then go to the one import the
 * Candidates page also uses, a batch at a time, which is why sending the same ones again adds nobody twice.
 */

export type ReadOptions = {
  campaignId?: string | null;
  columns?: string | undefined;
  tab?: string | undefined;
  /** The tabs to add, by name; without it the main tab alone when more than one holds people. */
  tabs?: readonly string[] | undefined;
  /** Read the rows and columns the workbook hides too; without it they are left out and counted. */
  hidden?: boolean | undefined;
  /** What the first answer to the words said, kept and sent back (with a rule ticked or a tab chosen): read again by code, no model. */
  plan?: ClientPlan | undefined;
  /** Cancels the request: a reading that is no longer wanted (another was asked for, or the card was left). */
  signal?: AbortSignal | undefined;
};

const cancel = (signal: AbortSignal | undefined): { signal?: AbortSignal } => (signal ? { signal } : {});

/** A plan in a header: the base64url of its JSON, which is how the server reads it (a header cannot hold JSON as it is). */
export function planHeader(plan: ClientPlan): string {
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The headers a reading adds: the plan the card kept, and the person's words (URL-encoded: they are kept out of the address). */
const extra = (o: ReadOptions, say?: string): Record<string, string> => ({
  ...(o.plan ? { "x-sheet-plan": planHeader(o.plan) } : {}),
  ...(say ? { "x-intake-say": encodeURIComponent(say.slice(0, 300)) } : {}),
});

const query = (o: ReadOptions): string => {
  const p = new URLSearchParams();
  if (o.campaignId) p.set("campaignId", o.campaignId);
  if (o.columns) p.set("columns", o.columns);
  if (o.tab) p.set("tab", o.tab);
  if (o.tabs) p.set("tabs", JSON.stringify(o.tabs));
  if (o.hidden) p.set("hidden", "include");
  const q = p.toString();
  return q ? `?${q}` : "";
};

export const peopleSheetApi = {
  /**
   * The file itself is the body, in whatever type the browser called it: the server tells a workbook from text by its
   * first bytes, which is right where a browser says a CSV is "application/vnd.ms-excel".
   */
  read: (file: Blob, options: ReadOptions = {}) =>
    api<PeopleSheet>("POST", `/v1/candidates/sheet/read${query(options)}`, file, {
      headers: { "content-type": "application/octet-stream", ...extra(options) },
      timeoutMs: LONG_REQUEST_TIMEOUT_MS,
      ...cancel(options.signal),
    }),
  /** A Google Sheet that anyone with the link may view. */
  readLink: (url: string, options: ReadOptions = {}) =>
    api<PeopleSheet>(
      "POST",
      "/v1/candidates/sheet/read",
      { url, ...(options.campaignId ? { campaignId: options.campaignId } : {}), ...(options.columns ? { columns: options.columns } : {}) },
      { timeoutMs: LONG_REQUEST_TIMEOUT_MS, ...cancel(options.signal), ...(options.plan ? { headers: extra(options) } : {}) },
    ),
  /**
   * The sheet read with the words typed beside it: one call to a model when the layout is unclear or the words ask for more than
   * adding, none otherwise. It answers with the same reading, and what it did to it (`assist`). A model may take a few seconds.
   */
  plan: (file: Blob, say: string, options: ReadOptions = {}) =>
    api<PeopleSheet>("POST", `/v1/candidates/sheet/plan${query(options)}`, file, {
      headers: { "content-type": "application/octet-stream", ...extra({}, say) },
      timeoutMs: LONG_REQUEST_TIMEOUT_MS,
      ...cancel(options.signal),
    }),
  planLink: (url: string, say: string, options: ReadOptions = {}) =>
    api<PeopleSheet>(
      "POST",
      "/v1/candidates/sheet/plan",
      { url, ...(options.campaignId ? { campaignId: options.campaignId } : {}), ...(options.columns ? { columns: options.columns } : {}) },
      { timeoutMs: LONG_REQUEST_TIMEOUT_MS, ...cancel(options.signal), headers: extra({}, say) },
    ),
  /** One batch to the import, to the campaign's shortlist when there is one. Skips whoever is already here. */
  send: (rows: readonly SheetFields[], campaignId: string | null, signal?: AbortSignal) =>
    api<BatchResult>(
      "POST",
      "/v1/candidates/import",
      {
        rows,
        mode: "skip",
        ...(campaignId ? { campaignId } : {}),
      },
      cancel(signal),
    ),
  /**
   * The people just added, put on the stages the person chose for their sheet's words (server: modules/campaigns/sheet-place.ts).
   * It moves people forward only, and hires or rejects only the ids listed as ticked in the request.
   */
  place: (campaignId: string, request: PlaceRequest, signal?: AbortSignal) =>
    api<PlaceAnswer>("POST", `/v1/campaigns/${campaignId}/place`, request, cancel(signal)),
};
