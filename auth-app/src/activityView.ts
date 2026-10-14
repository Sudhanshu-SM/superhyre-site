/**
 * What the Agent activity page says about a run: what was asked, and what the agent did about it.
 * Pure, so the wording is pinned by tests without a page.
 *
 * A run's list row (`GET /v1/runs`) carries only its kind, campaign and status. The question and what
 * came of it are in the run itself (`GET /v1/runs/:id`): its input, and the events it streamed. This
 * reads those, defensively, since an event a newer server adds must not break the page.
 */

type Rec = Record<string, unknown>;

/** One run as `GET /v1/runs/:id` answers it, as far as this page reads it. */
export type RunDetail = {
  run: { conversationId?: unknown; input?: unknown };
  events: ReadonlyArray<{ type: string; seq?: number; payload?: unknown }>;
};

const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The first words of something, cut at a word, with no mark where it was cut. */
export function clip(s: string, max = 80): string {
  const line = s.trim().replace(/\s+/g, " ");
  if (line.length <= max) return line;
  const head = line.slice(0, max);
  const at = /\s/.test(line.charAt(max)) ? head.length : head.lastIndexOf(" ");
  return `${(at > 0 ? head.slice(0, at) : head).replace(/[\s,;:.-]+$/, "")}…`;
}

/** The question a chat run answered, first words only; null when the run didn't keep it. */
export function questionOf(d: RunDetail): string | null {
  const q = text(rec(d.run.input).text);
  return q ? clip(q) : null;
}

/** The chat the run belongs to, to open it. */
export function conversationOf(d: RunDetail): string | null {
  return text(d.run.conversationId) || null;
}

const hash = (name: string): string => (name ? `#${name.replace(/^#/, "")}` : "");

const people = (n: number): string => `${n} ${n === 1 ? "person" : "people"}`;

/** One scheduled item, as the sentence "Scheduled an email to Priya". */
function scheduled(item: Rec, who: string | null): string {
  const kind = text(item.kind);
  const payload = rec(item.payload);
  switch (kind) {
    case "email":
      return who ? `Scheduled an email to ${who}` : "Scheduled an email";
    case "slack_message":
      return text(payload.channelName) ? `Scheduled a post to ${hash(text(payload.channelName))}` : "Scheduled a Slack post";
    case "notion_note":
      return "Scheduled a Notion note";
    case "task":
      return "Scheduled a task";
    case "reminder":
      return "Set a reminder";
    case "digest":
      return "Scheduled a pipeline digest";
    default:
      return "Scheduled something";
  }
}

/** What an approved action did, in a line; "" for one this page has no words for. */
function approved(action: Rec, names: readonly string[], result: Rec): string[] {
  switch (text(action.action)) {
    case "slack_message":
      return [text(action.channelName) ? `Posted to ${hash(text(action.channelName))}` : "Posted to Slack"];
    case "notion_note":
      return [text(action.title) ? `Added “${clip(text(action.title), 40)}” to Notion` : "Added a note to Notion"];
    case "remember":
      return [text(action.clientName) ? `Saved a note for ${text(action.clientName)}` : "Saved a note"];
    case "shortlist": {
      const n = typeof result.added === "number" ? result.added : names.length;
      return [n > 0 ? `Shortlisted ${people(n)}` : "Shortlisted people"];
    }
    case "move": {
      const n = typeof result.moved === "number" ? result.moved : names.length;
      const stage = text(action.stage);
      return [`Moved ${n > 0 ? people(n) : "people"}${stage ? ` to ${stage}` : ""}`];
    }
    case "find_people":
      return ["Started a search"];
    case "start_watch":
      return ["Started keeping an eye out for people"];
    case "schedule": {
      const items = Array.isArray(action.items) ? action.items.map(rec) : [];
      let emails = 0;
      return items.map((it) => scheduled(it, text(it.kind) === "email" ? (names[emails++] ?? null) : null));
    }
    default:
      return [];
  }
}

/** Tools that act at once, with no card, and the line each leaves. */
const DONE_AT_ONCE: Readonly<Record<string, string>> = {
  create_task: "Created a task",
  cancel_schedule: "Cancelled something that was scheduled",
  do_not_contact: "Added someone to do not contact",
};

/**
 * What the agent did in this run, in order: each approved action, and each thing it did without
 * asking (a task, a cancel, a do-not-contact entry, a note saved at once). Nothing for a declined
 * card, and nothing for what was only looked at.
 */
export function didOf(d: RunDetail): string[] {
  const out: string[] = [];
  const cards = new Map<number, { action: Rec; names: string[] }>();
  for (const e of d.events) {
    const p = rec(e.payload);
    if (e.type === "approval" && typeof e.seq === "number") {
      const names = Array.isArray(p.people) ? p.people.map((x) => text(rec(x).name)).filter(Boolean) : [];
      cards.set(e.seq, { action: rec(p.action), names });
    } else if (e.type === "result" && p.decision !== "decline") {
      const card = typeof p.approvalSeq === "number" ? cards.get(p.approvalSeq) : undefined;
      if (card) out.push(...approved(card.action, card.names, p));
    } else if (e.type === "progress" && p.step === "tool" && p.status === "done") {
      const line = DONE_AT_ONCE[text(p.tool)];
      if (line) out.push(line);
    } else if (e.type === "progress" && p.step === "memory_write" && p.outcome === "saved") {
      out.push("Saved a note");
    }
  }
  return out;
}

/** "Posted to #hiring", or "Posted to #hiring and 2 more things" when it did several. */
export function didLine(did: readonly string[]): string | null {
  const first = did[0];
  if (!first) return null;
  const more = did.length - 1;
  return more > 0 ? `${first} and ${more} more ${more === 1 ? "thing" : "things"}` : first;
}
