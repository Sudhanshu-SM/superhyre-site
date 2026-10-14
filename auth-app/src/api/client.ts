import { DEV_SKIP_AUTH } from "../devSession";
import { supabase } from "../supabase";

/**
 * The console's one door to the SuperHyre API.
 *
 * LIVE is decided at build time: with VITE_API_URL set, stores load from and
 * write to the API; without it the console keeps running on its fixtures, so
 * design work never needs a backend. The session token comes from supabase-js
 * (which refreshes it); in development with sign-in skipped, a token minted for
 * the local API stands in.
 */
export const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? null;
export const LIVE = API_URL !== null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
  /** When the agent is at capacity, when it frees up (epoch ms). */
  get retryAt(): number | null {
    return typeof this.details.retryAt === "number" ? this.details.retryAt : null;
  }
}

export async function accessToken(): Promise<string> {
  if (DEV_SKIP_AUTH) {
    const dev = import.meta.env.VITE_DEV_API_TOKEN;
    if (!dev) throw new ApiError(401, "unauthenticated", "Set VITE_DEV_API_TOKEN to use the local API without signing in.");
    return dev;
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  return data.session.access_token;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/* ── which workspace this tab is showing ─────────────────────────────────── */

/**
 * The active workspace lives on the server, so a tab left open after switching in
 * another one would otherwise save into the new workspace while still showing the
 * old. Every request says which workspace this tab means; the API refuses a
 * mismatch, and the tab reloads instead of writing somewhere unseen.
 */
let tabWorkspace: string | null = null;
let onMismatch: ((failure: ApiError) => void) | null = null;
/** When this tab was told its workspace is not the active one; null while it is settled. */
let staleSince: number | null = null;
/** Failure lines are held back until this time: a change of workspace is not a failure to talk about. */
let settleUntil = 0;
/** How long a tab waits for its reload before it asks the API again (a reload that never came must not freeze it). */
const STALE_FOR_MS = 8000;
const SETTLE_MS = 5000;

export function setTabWorkspace(organizationId: string | null): void {
  const next = organizationId ?? "personal";
  if (tabWorkspace !== null && tabWorkspace !== next) settleUntil = Date.now() + SETTLE_MS;
  tabWorkspace = next;
  staleSince = null;
}

/**
 * Whether this tab is between finding out its workspace changed and having reloaded into the new one. Requests
 * that would only be refused wait for the reload (they fail at once and quietly), and nothing says "didn't load"
 * about them: the person sees one calm line, not a storm.
 */
export function workspaceSettling(now = Date.now()): boolean {
  return (staleSince !== null && now - staleSince < STALE_FOR_MS) || now < settleUntil;
}

/** Paths that choose or set up the workspace themselves: the API never refuses them for being on the wrong one. */
const WORKSPACE_FREE = /^\/v1\/(me|workspace\/active|organisations|invites|onboarding)(\/|$)/;

/** A request that was held back, or answered for a workspace this tab has already left. Never shown to anyone. */
function staleFailure(): ApiError {
  lastFailure = "server";
  lastConnect = null;
  return new ApiError(409, "conflict", "Your workspace changed.", { workspaceChanged: true, quiet: true });
}

/** Whether a failure is only "this tab was on another workspace": not worth a word of its own. */
export const isQuiet = (err: unknown): boolean => err instanceof ApiError && err.details.quiet === true;

/**
 * What to do when the API says this tab is on a workspace that's no longer active:
 * switched in another tab, or `details.removed` when the person was taken out of it.
 */
export function onWorkspaceMismatch(fn: ((failure: ApiError) => void) | null): void {
  onMismatch = fn;
}

/**
 * What a tab does after a workspace mismatch. Removed from the organisation: say so, and
 * leave for Personal rather than being offered to rejoin it. Otherwise another tab switched
 * (or an approval moved them): follow it.
 */
export function afterMismatch(failure: ApiError): { notice: string; leaveOrg: boolean } {
  if (failure.details.removed === true) {
    const said = failure.message.trim().replace(/([^.!?])$/, "$1.").replace(/\bthat workspace\b/i, "that organisation");
    return { notice: `${said} You're in Personal now.`, leaveOrg: true };
  }
  /* Another tab switched, or this person was let into an organisation while they sat in Personal. The line
     is replaced by where they are once the account has been read (see App's `follow`). */
  return { notice: "Something changed. Updating.", leaveOrg: false };
}

/** Where a tab lands after it followed a change: one calm line naming the place. */
export function landedLine(organisationName: string | null): string {
  return organisationName ? `You're in ${organisationName} now.` : "You're in Personal now.";
}

/* ── why the last load failed ────────────────────────────────────────────── */

/**
 * The kind of the most recent failure, so an inline "didn't load" can say the right
 * thing: a dropped connection is the person's to fix, a server error is ours.
 */
export type FailureKind = "network" | "server" | "limited" | "session" | "access";
let lastFailure: FailureKind | null = null;
let lastRetryAt: number | null = null;
let lastConnect: string | null = null;
export const lastFailureKind = () => lastFailure;
/** The service the last refusal said needs connecting (a 503 carrying `details.connect`), if it did. */
export const lastFailureConnect = () => lastConnect;
/** When the last refused request can be tried again (a 429's `retryAt`), if it said. */
export const lastFailureRetryAt = () => lastRetryAt;

/* ── what was written ── */

type WriteListener = (method: Method, path: string) => void;
const writeListeners = new Set<WriteListener>();

/**
 * Told after every request that changed something and succeeded, with its path (`invalidate.ts` turns that into
 * the views the write left stale). A read is never told.
 */
export function onWrite(fn: WriteListener): () => void {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}

function wrote(method: Method, path: string): void {
  if (method === "GET") return;
  for (const l of writeListeners) l(method, path.split("?")[0] ?? path);
}

/** JSON in, JSON out; errors carry the sentence the API wrote for people. */
export async function api<T>(method: Method, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, "offline", "The console isn't connected to SuperHyre.");
  const headers = new Headers(init.headers);
  try {
    headers.set("authorization", `Bearer ${await accessToken()}`);
  } catch (err) {
    lastFailure = "session";
    lastConnect = null;
    throw err;
  }
  const sentFor = tabWorkspace;
  if (sentFor) {
    // Told it is on the wrong workspace and not yet reloaded: asking again can only be refused.
    if (staleSince !== null && Date.now() - staleSince < STALE_FOR_MS && !WORKSPACE_FREE.test(path)) throw staleFailure();
    headers.set("x-workspace", sentFor);
  }
  const raw = body instanceof ArrayBuffer || body instanceof Blob;
  if (body !== undefined && !raw) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      method,
      headers,
      ...(body === undefined ? {} : { body: raw ? (body as BodyInit) : JSON.stringify(body) }),
    });
  } catch {
    lastFailure = "network";
    lastConnect = null;
    throw new ApiError(0, "network", "Can't reach SuperHyre. Check your connection and try again.");
  }
  if (res.status === 204) {
    wrote(method, path);
    return undefined as T;
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } & Record<string, unknown> } | null)?.error;
    const failure = new ApiError(res.status, err?.code ?? "error", err?.message ?? "Something went wrong.", err ?? {});
    if (failure.details.workspaceChanged === true) {
      lastFailure = "server";
      lastConnect = null;
      // The tab has moved on since this request left (it reloaded into the new workspace): nothing to do.
      if (sentFor !== tabWorkspace) throw staleFailure();
      const first = staleSince === null || Date.now() - staleSince >= STALE_FOR_MS;
      staleSince = Date.now();
      settleUntil = staleSince + SETTLE_MS;
      // Many requests are in flight at once and all hear it; one reload is enough.
      if (first) onMismatch?.(failure);
      throw failure;
    }
    /* Every refusal sets the kind (anything else is ours to say), so a request that failed in some
       other way never inherits an older "network" or "session" and blames the wrong thing. */
    lastFailure = res.status === 401 ? "session" : res.status === 403 ? "access" : res.status === 429 ? "limited" : "server";
    if (res.status === 429) lastRetryAt = failure.retryAt;
    lastConnect = typeof failure.details.connect === "string" ? failure.details.connect : null;
    throw failure;
  }
  wrote(method, path);
  return data as T;
}

/** How long until `at` (epoch ms), the way a person says it: "40s", "3 min", "2 h". */
export function waitLabel(at: number, now = Date.now()): string {
  const s = Math.max(1, Math.ceil((at - now) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
}

/**
 * When a refused or busy request can be tried again, as a short sentence; empty when the
 * failure isn't about waiting or the message already says when (a daily limit's midnight).
 */
export function retryHint(err: unknown, now = Date.now()): string {
  if (!(err instanceof ApiError) || (err.code !== "rate_limited" && err.code !== "unavailable")) return "";
  const at = err.retryAt;
  if (!at || at <= now || /midnight|tomorrow/i.test(err.message)) return "";
  return `Try again in ${waitLabel(at, now)}.`;
}

/** A readable sentence for any failure, for toasts and inline errors, with when to retry. */
export function messageOf(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong.";
  const hint = retryHint(err);
  if (!hint) return err.message;
  // A closing "Try again shortly." says less than the hint; replace it rather than say both.
  // Only a sentence that starts with it: "…, or try again later." is part of another sentence.
  const base = err.message.replace(/(?<=^|[.!?])\s*Try again\b[^.]*\.?$/, "").trim();
  return `${base.replace(/([^.!?])$/, "$1.")} ${hint}`;
}
