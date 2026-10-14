import { API_URL, ApiError, api } from "./client";

/**
 * One event from a run, as the API streams it (see the server's run-events).
 *
 * `id` is the event's own: a phase line's id ("approval:13:draft") when its payload carries one, which is
 * how a line is told from another and a card finds its own lines; the stream's number otherwise.
 * `eventId` is always the stream's number, for where an event came in the order of the run.
 */
export type RunEvent = {
  id: number | string;
  /** Where the event is in the run's stream. Absent on events built by hand (fixtures). */
  eventId?: number;
  type: "plan" | "focus" | "message" | "question" | "progress" | "artifact" | "approval" | "result" | "notice" | "error" | "done";
  runId: string;
  seq: number;
  at: string;
  [key: string]: unknown;
};

const TYPES: RunEvent["type"][] = [
  "plan", "focus", "message", "question", "progress", "artifact", "approval", "result", "notice", "error", "done",
];

/** The longest wait between attempts to open a stream again. */
export const RETRY_CAP_MS = 30_000;

/** How long to wait before the nth attempt (0 is the first retry): 2 s, then doubling, never past the cap. */
export function retryDelay(attempt: number, random = Math.random()): number {
  const base = Math.min(RETRY_CAP_MS, 2000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.85 + 0.3 * random));
}

/**
 * Whether a failure says the stream can never open: the chat or run is not there (404), is gone (410), or the
 * tab is on a workspace that is no longer the active one (409), which the tab reloads out of. Trying again
 * would only ask the same question every couple of seconds for ever.
 */
export function isGone(err: unknown): boolean {
  return whyGone(err) !== null;
}

/** "missing": it is not there (any more); "moved": the tab's workspace is not the active one and will reload. */
export function whyGone(err: unknown): "missing" | "moved" | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 404 || err.status === 410) return "missing";
  if (err.status === 409 || err.details.workspaceChanged === true) return "moved";
  return null;
}

/**
 * A streamed event with its own id kept: the stream's number must never replace the id the event carries
 * (a phase line's), or two lines of one kind are one line and an approved card finds none of its own.
 */
export function runEventOf(payload: Record<string, unknown>, streamId: number, type: RunEvent["type"]): RunEvent {
  const own = payload.id;
  return { ...payload, id: typeof own === "string" && own !== "" ? own : streamId, eventId: streamId, type } as RunEvent;
}

/**
 * Follows a chat's or a run's events. EventSource reconnects by itself and
 * resumes after the last event id it saw (Last-Event-ID), so a dropped
 * connection never loses or repeats an event. It can't send headers, so the
 * stream opens with a one-minute ticket for this path (never the session token,
 * which would end up in logs). Once the ticket has lapsed the server refuses
 * the browser's own reconnect, and we open a fresh stream from the last id with
 * a new ticket, backing off (2 s, 4 s ... up to 30 s) while it keeps failing. A finished
 * run's stream ends with `end`: nothing more to follow. A chat or run that is
 * not there (404/410), or a workspace that changed under the tab, stops it for
 * good and tells `onGone`.
 */
export function follow(
  target: { conversationId: string } | { runId: string },
  after: number,
  onEvent: (e: RunEvent) => void,
  onGone?: (why: "missing" | "moved") => void,
): () => void {
  let source: EventSource | null = null;
  let closed = false;
  let last = after;
  let attempts = 0;
  let timer: number | undefined;
  const base = "conversationId" in target ? `/v1/conversations/${target.conversationId}` : `/v1/runs/${target.runId}`;
  const path = `${base}/events`;

  const gone = (why: "missing" | "moved") => {
    if (closed) return;
    closed = true;
    source?.close();
    onGone?.(why);
  };

  const retry = (err?: unknown) => {
    if (closed) return;
    const why = whyGone(err);
    if (why) return gone(why);
    const wait = retryDelay(attempts++);
    timer = window.setTimeout(() => void open().catch(retry), wait);
  };

  async function open(): Promise<void> {
    if (closed || !API_URL) return;
    const { ticket } = await api<{ ticket: string }>("POST", "/v1/stream-tickets", { path });
    if (closed) return;
    const es = new EventSource(`${API_URL}${path}?after=${last}&ticket=${encodeURIComponent(ticket)}`);
    source = es;
    es.onopen = () => { attempts = 0; };
    for (const type of TYPES) {
      es.addEventListener(type, (raw) => {
        const msg = raw as MessageEvent<string>;
        attempts = 0;
        last = Number(msg.lastEventId) || last;
        onEvent(runEventOf(JSON.parse(msg.data) as Record<string, unknown>, last, type));
      });
    }
    // A finished run's stream says so; reconnecting would only replay nothing.
    es.addEventListener("end", () => {
      closed = true;
      es.close();
    });
    es.onerror = () => {
      if (closed || es.readyState !== EventSource.CLOSED) return;
      // The browser can't say why it was refused. Asking for the chat itself tells a missing one from a dropped line.
      es.close();
      void api("GET", base).then(() => retry(), (err: unknown) => retry(err));
    };
  }

  void open().catch(retry);
  return () => {
    closed = true;
    if (timer !== undefined) window.clearTimeout(timer);
    source?.close();
  };
}
