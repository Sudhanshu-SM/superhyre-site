import { announce } from "./browserAlerts";
import { useSyncExternalStore } from "react";
import { CAPABILITY_EFFECTS, effectOf } from "./agentEvents";
import type { CapabilityEffect } from "./agentEvents";
import { applyFeed } from "./agentFeed";
import type { FeedLine } from "./agentFeed";
import { applyPhaseEvent, closePhases } from "./agentPhases";
import type { PhaseLine } from "./agentPhases";
import { agentApi } from "./api/agent";
import type { ChatCard, Structured, ChatMessage, ConversationDetail, Match, Suggestion } from "./api/agent";
import { ApiError, messageOf } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import { ALREADY_HANDLED, approvalFailure, helpLinkOf } from "./chatCards";
import { ensureConnections } from "./connectionsStore";
import { follow } from "./api/events";
import { pressId } from "./agentCards/specActions";
import type { RunEvent } from "./api/events";

/**
 * The agent chat when the console is connected (LIVE).
 *
 * The server is the record: a turn is the recruiter's message plus everything
 * its run streams back (words as they arrive, the tools it used, cards waiting
 * for approval, a search it started). The page renders this state and nothing
 * else, so reopening a chat replays the same events and shows the same thing.
 */

/** The longest message the agent takes, as the server counts it (the text trimmed). */
export const CHAT_LIMIT = 8000;

/** How long a message counts as: what the server will measure, so the page and the API agree. */
export const chatLength = (text: string): number => text.trim().length;

/** Whether a message is too long to send. */
export const chatOver = (text: string): boolean => chatLength(text) > CHAT_LIMIT;

export type ToolStep = { tool: string; status: "running" | "done" | "failed" };
export type Approval = {
  seq: number;
  summary: string;
  action: string;
  /** The rest of what is being asked to run (a Slack message's channel and text, a note's title and body), as the server sent it. */
  detail: Record<string, unknown>;
  campaignId: string | null;
  campaignName: string | null;
  /** Who it would change, so the card can name them. */
  people: Array<{ name: string; title: string | null; company: string | null; city: string | null; address?: string | null }>;
  decided: null | { decision: "approve" | "decline"; outcome: Record<string, unknown> };
  deciding: boolean;
  error: string | null;
  /** Where the fix is made when it is not here (the Google project's API page), from the refusal that said so. */
  help?: string | null;
  /** The server's machine reason for the refusal ("google_api_disabled"), when it gave one. */
  reason?: string | null;
  /** Things the server wants said about this one (a missing Gmail, contact details taken out), as it sent them. */
  notes: string[];
  /** The capability behind it ("pipeline.shortlist"), when the server names one. */
  capability: string | null;
  /** What the server says this will not do, in its words; the card adds its own for the kinds it knows. */
  wontDo: string[];
  /** An email that will go out, exactly: who it is to (a name), the subject and the words. */
  emails: Array<{ to: string; address?: string | null; subject: string; body: string }>;
  /** A meeting the card draws as one: when, with whom, the Meet link; absent for anything else. */
  meeting?: MeetingDraft;
  /** Other free times the card offers inside itself, as the server worded them. */
  slots?: Array<{ startsAt: string; endsAt: string; when: string }>;
  /** The connections the card carries inside itself (a Calendar that is not allowed yet). */
  connect?: string[];
};
/** What a meeting approval says about the meeting, as the server sends it (see ApprovalEvent in packages/shared). */
export type MeetingDraft = {
  kind: "interview" | "meeting";
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  durationMinutes: number;
  meet: boolean;
  guests: Array<{ name: string; role: "candidate" | "team" | "other" }>;
  busy: boolean;
  was?: { startsAt: string; endsAt: string };
  cancel: boolean;
};
/** An option of a question. `input` is a value the card asks for inside itself when this one is picked (a new client's name); `quiet` is a way out beside Continue ("No client"). */
export type Choice = { id: string; name: string; text?: string; input?: { label: string; placeholder?: string; tag?: string }; quiet?: boolean };
/**
 * A question the agent put on the screen, answered on its card: the pick goes to the server as an answer (not as a
 * message), and the card keeps it as one line. `runId` and `seq` say where it was asked, which is how an answer
 * finds it again after a reload.
 */
export type Question = {
  kind: string; text: string; choices: Choice[]; retryText?: string; campaignId?: string; note?: string;
  runId: string; seq: number;
  /** Several picks, between `min` and `max`; absent for one. */
  multi?: { min: number; max: number };
  /** The answer that stands: what the card settles on. */
  answer?: { ids: string[]; value?: string; line: string } | null;
  /** The chat moved on before this was answered, so it can no longer be. */
  stale?: boolean;
  sending?: boolean;
  error?: string | null;
  /** Kept across a retry, so pressing twice is one answer. */
  answerKey?: string;
};

/** A search the turn started, followed live: progress, then the people it found. */
export type Search = {
  runId: string;
  campaignId: string;
  size: number | null;
  pool: number | null;
  fresh: number | null;
  scored: number;
  items: Match[] | null;
  notices: string[];
  /**
   * Some of the people found could not be scored (the model was busy even after asking again): what the
   * "Score them again" button says on the person's behalf. Null or absent when everyone was scored.
   */
  rescore?: { campaignId: string; people: number; text: string } | null;
  /** What the search says it is doing: one line per phase. */
  phases: readonly PhaseLine[];
  /** What it is doing right now, as short lines that rise and fade under the matching line. */
  feed?: readonly FeedLine[];
  /** People as they are scored, before the whole list lands. */
  scoredIds: readonly string[];
  status: "running" | "done" | "failed";
  error: string | null;
};

export type LiveTurn = {
  key: string;
  said: string;
  runId: string | null;
  status: "sending" | "working" | "done" | "failed";
  reply: string;
  steps: ToolStep[];
  /** What the run says it is doing: one line per phase, in the order they began. */
  phases: readonly PhaseLine[];
  focus: string | null;
  questions: Question[];
  approvals: Approval[];
  notices: string[];
  searches: Search[];
  /** What the agent looked up, shown as cards; one per thing, the latest lookup winning. */
  cards: ChatCard[];
  error: string | null;
  /** Why it failed, when the server said: a limit (`rate_limited`) may also say when it lifts. */
  errorCode?: string | null;
  retryAt?: number | null;
  startedAt: number;
  finishedAt: number | null;
  /** When the last event of this turn happened (the server's clock), to tell a turn that is quiet from one that is busy. */
  touchedAt?: number;
  /** The campaign the message was sent about, kept so sending it again says the same. */
  campaignId?: string | null;
  /**
   * The turn began with a press, not with words typed: no message of the person's is shown. `label` is the button
   * or the answer's line; `answer` is the card it answered, so the turn can be sent again in place.
   */
  quiet?: { label: string; answer?: { runId: string; seq: number; ids: string[]; value?: string } };
  /**
   * The chat opened with the app's own line (the set-up's first campaign), not with words of the person's: shown as a
   * quiet line, with the job description as a file beside it when there was one, and never as something they said.
   */
  opening?: { line: string; jdWords: number | null };
  /** The people a button on a card was about, sent with its words: what the agent does is for them only. */
  structured?: Structured;
};

export type ChatState = {
  conversationId: string | null;
  turns: LiveTurn[];
  /** Runs this chat knows, mapped to the turn they belong to. */
  owners: Record<string, string>;
  /** Events for runs not yet tied to a turn (a search can report before the
      message that started it); applied once the run is claimed. */
  orphans: Record<string, RunEvent[]>;
  /** The last event applied per run: a replayed or doubled event is skipped, so folding is idempotent. */
  applied: Record<string, number>;
  loading: boolean;
  error: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** The choices of a `question` event, keeping the words a choice sends when it has its own, and what it asks for. */
export function questionChoices(raw: unknown): Choice[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c: unknown): Choice[] => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    const name = str(o.name)?.trim();
    if (!name) return [];
    const text = str(o.text)?.trim();
    const ask = o.input && typeof o.input === "object" ? (o.input as Record<string, unknown>) : null;
    const label = str(ask?.label)?.trim();
    const placeholder = str(ask?.placeholder)?.trim();
    const tag = str(ask?.tag)?.trim();
    return [{
      id: str(o.id) ?? name, name,
      ...(text ? { text } : {}),
      ...(label ? { input: { label, ...(placeholder ? { placeholder } : {}), ...(tag ? { tag } : {}) } } : {}),
      ...(o.quiet === true ? { quiet: true } : {}),
    }];
  });
}

export function newTurn(key: string, said: string, at = Date.now()): LiveTurn {
  return {
    key, said, runId: null, status: "sending", reply: "", steps: [], phases: [], focus: null,
    questions: [], approvals: [], notices: [], searches: [], cards: [], error: null, startedAt: at, finishedAt: null,
  };
}

function update(state: ChatState, key: string, fn: (t: LiveTurn) => LiveTurn): ChatState {
  return { ...state, turns: state.turns.map((t) => (t.key === key ? fn(t) : t)) };
}

/** Ties a run to a turn and replays anything that arrived for it before the tie. */
export function claim(state: ChatState, runId: string, key: string, search?: { campaignId: string; size: number | null }): ChatState {
  let next: ChatState = { ...state, owners: { ...state.owners, [runId]: key } };
  if (search) {
    next = update(next, key, (t) =>
      t.searches.some((s) => s.runId === runId)
        ? t
        : { ...t, searches: [...t.searches, { runId, campaignId: search.campaignId, size: search.size, pool: null, fresh: null, scored: 0, items: null, notices: [], phases: [], scoredIds: [], status: "running", error: null }] },
    );
  }
  const waiting = next.orphans[runId];
  if (waiting) {
    const { [runId]: _, ...rest } = next.orphans;
    next = waiting.reduce(applyEvent, { ...next, orphans: rest });
  }
  return next;
}

/** Folds one streamed event into the chat. Pure, so replaying a chat rebuilds it exactly. */
export function applyEvent(state: ChatState, e: RunEvent): ChatState {
  const key = state.owners[e.runId];
  if (!key) {
    const waiting = state.orphans[e.runId] ?? [];
    if (waiting.some((w) => w.seq === e.seq)) return state;
    const parked = { ...state, orphans: { ...state.orphans, [e.runId]: [...waiting, e] } };
    // A "Find N more" search names the turn it was asked from, so a replay puts it back there.
    const parent = str(e.parentRunId);
    const owner = parent ? state.owners[parent] : undefined;
    const campaignId = str(e.campaignId);
    if (e.type === "plan" && e.step === "sourcing" && owner && campaignId) {
      return claim(parked, e.runId, owner, { campaignId, size: num(e.size) });
    }
    return parked;
  }
  if (e.seq <= (state.applied[e.runId] ?? 0)) return state;
  return fold({ ...state, applied: { ...state.applied, [e.runId]: e.seq } }, e, key);
}

function fold(state: ChatState, e: RunEvent, key: string): ChatState {
  const next = foldEvent(state, e, key);
  const at = Date.parse(e.at);
  if (!Number.isFinite(at) || next === state) return next;
  return update(next, key, (t) => (t.touchedAt === at ? t : { ...t, touchedAt: at }));
}

function foldEvent(state: ChatState, e: RunEvent, key: string): ChatState {
  const turn = state.turns.find((t) => t.key === key);
  if (!turn) return state;
  const search = turn.searches.find((s) => s.runId === e.runId);
  if (search) return update(state, key, (t) => ({ ...t, searches: t.searches.map((s) => (s.runId === e.runId ? applySearch(s, e) : s)) }));

  switch (e.type) {
    case "focus":
      return update(state, key, (t) => ({ ...t, focus: str(e.name) }));
    case "message":
      return update(state, key, (t) => ({
        ...t,
        status: t.status === "sending" ? "working" : t.status,
        reply: e.final ? (str(e.text) ?? t.reply) : t.reply + (str(e.delta) ?? ""),
      }));
    case "progress": {
      if (e.step === "phase") {
        return update(state, key, (t) => {
          const phases = applyPhaseEvent(t.phases, e);
          return phases === t.phases ? t : { ...t, phases, status: t.status === "sending" ? "working" : t.status };
        });
      }
      if (e.step === "answer") {
        return settleQuestion(state, e.runId, num(e.questionSeq), { ids: stringsOf(e.ids), ...(str(e.value) ? { value: str(e.value) ?? "" } : {}), line: str(e.line) ?? "" });
      }
      if (e.step !== "tool") return state;
      const tool = str(e.tool) ?? "tool";
      const status = (str(e.status) ?? "running") as ToolStep["status"];
      return update(state, key, (t) => {
        const open = t.steps.findIndex((s) => s.tool === tool && s.status === "running");
        if (status !== "running" && open >= 0) {
          return { ...t, steps: t.steps.map((s, i) => (i === open ? { ...s, status } : s)) };
        }
        return { ...t, status: "working", steps: [...t.steps, { tool, status }] };
      });
    }
    case "plan": {
      const runId = str(e.searchRunId);
      const campaignId = str(e.campaignId);
      if (e.step !== "sourcing" || !runId || runId === turn.runId || !campaignId) return state;
      return claim(state, runId, key, { campaignId, size: num(e.size) });
    }
    case "question":
      return update(state, key, (t) => ({
        ...t,
        questions: [...t.questions, {
          kind: str(e.kind) ?? "text",
          text: str(e.text) ?? "",
          choices: questionChoices(e.choices),
          runId: e.runId, seq: e.seq,
          ...(e.multi && typeof e.multi === "object" && num((e.multi as Record<string, unknown>).max) !== null
            ? { multi: { min: num((e.multi as Record<string, unknown>).min) ?? 1, max: num((e.multi as Record<string, unknown>).max) ?? 1 } }
            : {}),
          ...(str(e.retryText) ? { retryText: str(e.retryText) ?? "" } : {}),
          ...(str(e.campaignId) ? { campaignId: str(e.campaignId) ?? "" } : {}),
          ...(str(e.note) ? { note: str(e.note) ?? "" } : {}),
        }],
      }));
    case "artifact": {
      const card = cardOf(e);
      if (!card) return state;
      // The same lookup again replaces the first, keeping its place.
      return update(state, key, (t) => ({
        ...t,
        cards: t.cards.some((c) => c.key === card.key) ? t.cards.map((c) => (c.key === card.key ? card : c)) : [...t.cards, card],
      }));
    }
    case "approval": {
      const action = (e.action ?? {}) as { action?: string; campaignId?: string };
      const people = Array.isArray(e.people) ? (e.people as Approval["people"]) : [];
      return update(state, key, (t) => ({
        ...t,
        approvals: [...t.approvals, {
          seq: e.seq, summary: str(e.summary) ?? "", action: action.action ?? "", detail: action as Record<string, unknown>,
          campaignId: action.campaignId ?? null,
          campaignName: str(e.campaignName), people,
          decided: null, deciding: false, error: null,
          notes: Array.isArray(e.notes) ? e.notes.filter((n): n is string => typeof n === "string" && n.trim() !== "") : [],
          capability: str(e.capability),
          wontDo: Array.isArray(e.wontDo) ? e.wontDo.filter((n): n is string => typeof n === "string" && n.trim() !== "") : [],
          emails: emailsOf(e.emails),
          ...(meetingOf(e.meeting) ? { meeting: meetingOf(e.meeting) as MeetingDraft } : {}),
          ...(slotsOf(e.slots).length ? { slots: slotsOf(e.slots) } : {}),
          ...(Array.isArray(e.connect) ? { connect: e.connect.filter((x): x is string => typeof x === "string") } : {}),
        }],
      }));
    }
    case "result":
      return settleApproval(state, key, e);
    case "notice":
      return update(state, key, (t) => ({ ...t, notices: [...t.notices, str(e.text) ?? ""] }));
    case "error":
      // A stopped turn says so: the run's own failure (the model call cut off) arrives after
      // the "Stopped." event and mustn't replace it with "couldn't answer".
      return update(state, key, (t) =>
        t.error === STOPPED
          ? t
          : {
              ...t,
              status: "failed",
              phases: closePhases(t.phases, "failed"),
              error: str(e.message) ?? "The agent couldn't answer this time.",
              errorCode: str(e.code),
              retryAt: num(e.retryAt),
              finishedAt: Date.parse(e.at) || Date.now(),
            });
    case "done":
      return update(state, key, (t) => ({ ...t, status: "done", phases: closePhases(t.phases, "done"), finishedAt: Date.parse(e.at) || Date.now() }));
    default:
      return state;
  }
}


const stringsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** A question settled on its answer (or on being out of date). The same answer arrives as the reply to the press and as the run's event; either settles it. */
function settleQuestion(state: ChatState, runId: string, seq: number | null, answer: Question["answer"] | "stale"): ChatState {
  const is = (q: Question) => q.runId === runId && q.seq === seq;
  if (!state.turns.some((t) => t.questions.some(is))) return state;
  return {
    ...state,
    turns: state.turns.map((t) => (t.questions.some(is)
      ? { ...t, questions: t.questions.map((q) => (is(q) ? (answer === "stale" ? { ...q, sending: false, error: null, stale: true } : { ...q, sending: false, error: null, answer }) : q)) }
      : t)),
  };
}

/**
 * An approval's answer folded into the turn: the card settles on what was done (or declined). The same answer
 * arrives twice, as the reply to the click and as the run's `result` event, and either one settles the card,
 * so a stream that is behind (or gone) never leaves a yes showing "Sending…".
 */
function settleApproval(state: ChatState, key: string, e: Record<string, unknown> & { runId?: string }): ChatState {
  const seq = num(e.approvalSeq);
  const decision = e.decision === "decline" ? "decline" : "approve";
  const incoming = num(e.attempt);
  let next = update(state, key, (t) => ({
    ...t,
    approvals: t.approvals.map((a) => {
      if (a.seq !== seq) return a;
      /* A card answered again (Try again) is the same card with a newer answer: an older one that arrives late
         (a snapshot written before the retry, replayed after it) does not take its place. */
      const have = a.decided ? num(a.decided.outcome.attempt) : null;
      if (have !== null && incoming !== null && incoming < have) return a;
      return { ...a, deciding: false, error: null, help: null, reason: null, decided: { decision, outcome: e } };
    }),
  }));
  const runId = str(e.searchRunId);
  const campaignId = str(e.campaignId);
  /* Any approved action that started a search names it (finding people, approving a role spec): the turn
     follows it and draws it as the search it is, whichever action it was. */
  if (runId && campaignId) next = claim(next, runId, key, { campaignId, size: num(e.size) });
  return next;
}

/** An approval's own phase lines (`approval:<seq>` and its steps) that were still running, ended as not finished. */
export function failApprovalLines(lines: readonly PhaseLine[], seq: number, label: string): readonly PhaseLine[] {
  const own = (l: PhaseLine) => l.id === `approval:${seq}` || l.id.startsWith(`approval:${seq}:`);
  if (!lines.some((l) => own(l) && l.state === "running")) return lines;
  return lines.map((l) => (own(l) && l.state === "running" ? { ...l, state: "failed" as const, label: l.id === `approval:${seq}` ? label : l.label } : l));
}

/** A card event, or null when it isn't one the page knows (an older or newer server). */
function cardOf(e: RunEvent): ChatCard | null {
  const key = str(e.key);
  if (!key) return null;
  if (e.kind === "people" && Array.isArray(e.people)) return { ...(e as unknown as Extract<ChatCard, { kind: "people" }>), key };
  if (e.kind === "campaign" && str(e.campaignId)) return { ...(e as unknown as Extract<ChatCard, { kind: "campaign" }>), key };
  if (e.kind === "view" && str(e.view)) return { ...(e as unknown as Extract<ChatCard, { kind: "view" }>), key };
  if (e.kind === "campaigns" && Array.isArray(e.items)) return { ...(e as unknown as Extract<ChatCard, { kind: "campaigns" }>), key };
  if (e.kind === "link") {
    const label = str(e.label);
    const href = str(e.href);
    return label && href ? { kind: "link", key, label, href } : null;
  }
  if (e.kind === "counts" && Array.isArray(e.rows) && Array.isArray(e.columns)) {
    const nums = (x: unknown): number[] => (Array.isArray(x) ? x.map((n) => num(n) ?? 0) : []);
    const rows = e.rows.flatMap((x): Extract<ChatCard, { kind: "counts" }>["rows"] => {
      const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
      const id = o ? str(o.id) : null;
      const name = o ? str(o.name) : null;
      return o && id && name
        ? [
            {
              id,
              name,
              client: str(o.client),
              cells: nums(o.cells),
              extras: Array.isArray(o.extras)
                ? o.extras.flatMap((x) => {
                    const e = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
                    const n = e ? str(e.name) : null;
                    const people = e ? num(e.people) : null;
                    return n && people ? [{ name: n, people }] : [];
                  })
                : [],
              hiresWanted: o ? num(o.hiresWanted) : null,
            },
          ]
        : [];
    });
    return { kind: "counts", key, columns: e.columns.map((c) => String(c)), rows, totals: nums(e.totals) };
  }
  if (e.kind === "attention" && Array.isArray(e.items)) {
    const items = e.items.flatMap((x): Extract<ChatCard, { kind: "attention" }>["items"] => {
      if (!x || typeof x !== "object") return [];
      const o = x as Record<string, unknown>;
      const cta = suggestionsOf([o.cta])[0];
      const campaign = str(o.campaign);
      const line = str(o.line);
      const group = o.group === "overdue" || o.group === "today" || o.group === "waiting" || o.group === "soon" ? o.group : undefined;
      return cta && campaign && line ? [{ campaignId: str(o.campaignId), campaign, line, cta, ...(group ? { group } : {}) }] : [];
    });
    const t = e.tasks && typeof e.tasks === "object" ? (e.tasks as Record<string, unknown>) : null;
    const tasks = t && num(t.open) !== null ? { open: num(t.open) ?? 0, overdue: num(t.overdue) ?? 0, today: num(t.today) ?? 0, later: num(t.later) ?? 0 } : null;
    return { kind: "attention", key, tasks, items, more: num(e.more) ?? 0 };
  }
  if (e.kind === "outcome") {
    return {
      kind: "outcome", key, summary: str(e.summary) ?? "Done.", counts: countsOf(e.counts), next: suggestionsOf(e.next),
      undo: suggestionsOf([e.undo])[0] ?? null,
      campaignId: str(e.campaignId), capability: str(e.capability),
    };
  }
  if (e.kind === "role_spec") {
    const campaignId = str(e.campaignId);
    if (!campaignId) return null;
    const spec = e.spec && typeof e.spec === "object" ? (e.spec as Extract<ChatCard, { kind: "role_spec" }>["spec"]) : null;
    return {
      kind: "role_spec", key, campaignId, campaignName: str(e.campaignName) ?? "the campaign",
      specId: str(e.specId), version: num(e.version), spec, approved: e.approved === true, trouble: str(e.trouble),
      status: e.status === "drafting" ? "drafting" : "ready",
    };
  }
  if (e.kind === "export") {
    const list = e.list === "pipeline" ? "pipeline" : e.list === "shortlist" ? "shortlist" : null;
    const format = e.format === "xlsx" ? "xlsx" : e.format === "csv" ? "csv" : null;
    const campaignId = str(e.campaignId);
    if (!list || !format || !campaignId) return null;
    return { kind: "export", key, campaignId, campaignName: str(e.campaignName) ?? "the campaign", list, format };
  }
  if (e.kind === "file") {
    const sheetId = str(e.sheetId);
    const downloadUrl = str(e.downloadUrl);
    if (!sheetId || !downloadUrl) return null;
    return {
      kind: "file", key, sheetId, downloadUrl, title: str(e.title) ?? "Your sheet",
      filename: str(e.filename) ?? "sheet.xlsx", rows: num(e.rows) ?? 0, columns: num(e.columns) ?? 0,
      googleUrl: str(e.googleUrl), capped: e.capped === true,
    };
  }
  if (e.kind === "connect") {
    const provider = e.provider === "google" || e.provider === "slack" || e.provider === "notion" ? e.provider : null;
    if (!provider) return null;
    const field = e.field && typeof e.field === "object" ? (e.field as Record<string, unknown>) : null;
    return {
      kind: "connect", key, provider, url: str(e.url) ?? str(e.authorizeUrl) ?? str(e.authorise_url),
      mode: e.mode === "token" ? "token" : e.mode === "oauth" ? "oauth" : null,
      field: field && str(field.label) ? { label: str(field.label) ?? "", help: str(field.help) ?? "" } : null,
      reason: str(e.reason), retryText: str(e.retryText),
      waiting: e.waiting !== false,
      label: str(e.label),
      products: Array.isArray(e.products)
        ? e.products.filter((p): p is "gmail" | "sheets" | "calendar" | "tasks" => p === "gmail" || p === "sheets" || p === "calendar" || p === "tasks")
        : [],
    };
  }
  if (e.kind === "need_email") {
    const campaignCandidateId = str(e.campaignCandidateId);
    const candidateId = str(e.candidateId);
    if (!campaignCandidateId || !candidateId) return null;
    return { kind: "need_email", key, campaignCandidateId, candidateId, campaignId: str(e.campaignId), name: str(e.name) ?? "This person" };
  }
  if (e.kind === "slots") {
    const slots = slotsOf(e.slots);
    if (!slots.length) return null;
    return {
      kind: "slots", key, timezone: str(e.timezone) ?? "UTC", durationMinutes: num(e.durationMinutes) ?? 30,
      forName: str(e.forName), campaignId: str(e.campaignId), campaignCandidateId: str(e.campaignCandidateId),
      slots, assumed: Array.isArray(e.assumed) ? e.assumed.filter((a): a is string => typeof a === "string") : [],
    };
  }
  if (e.kind === "drafts") {
    const emails = draftEmailsOf(e.emails);
    if (!emails.length) return null;
    return { kind: "drafts", key, campaignId: str(e.campaignId), campaignName: str(e.campaignName), emails };
  }
  // A kind from a newer server: kept, so the turn's cards stay in order, and drawn as nothing.
  const was = str(e.kind);
  return was ? { kind: "unknown", key, was } : null;
}

/** The emails of a drafts card: each needs its message and who it is to; a subject may be empty. */
export function draftEmailsOf(v: unknown): Array<{ messageId: string; to: string; subject: string; body: string }> {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const messageId = str(o.messageId);
    const to = str(o.to)?.trim();
    const body = str(o.body);
    return messageId && to && body ? [{ messageId, to, subject: str(o.subject) ?? "", body }] : [];
  });
}

/** A free time the card offers: two instants and the words for it. Anything else is left out. */
export function slotsOf(v: unknown): Array<{ startsAt: string; endsAt: string; when: string }> {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const startsAt = str(o.startsAt);
    const endsAt = str(o.endsAt);
    return startsAt && endsAt && !Number.isNaN(Date.parse(startsAt)) ? [{ startsAt, endsAt, when: str(o.when) ?? "" }] : [];
  });
}

/** The meeting an approval describes, or null when the event carries none. */
export function meetingOf(v: unknown): MeetingDraft | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const startsAt = str(o.startsAt);
  const endsAt = str(o.endsAt);
  const title = str(o.title);
  if (!startsAt || !endsAt || !title || Number.isNaN(Date.parse(startsAt))) return null;
  const was = o.was && typeof o.was === "object" ? (o.was as Record<string, unknown>) : null;
  return {
    kind: o.kind === "interview" ? "interview" : "meeting",
    title,
    startsAt,
    endsAt,
    timezone: str(o.timezone) ?? "UTC",
    durationMinutes: num(o.durationMinutes) ?? Math.max(1, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000)),
    meet: o.meet === true,
    guests: Array.isArray(o.guests)
      ? o.guests.flatMap((g) => {
          if (!g || typeof g !== "object") return [];
          const r = g as Record<string, unknown>;
          const role = r.role === "candidate" || r.role === "team" ? r.role : "other";
          return [{ name: str(r.name) ?? "A guest", role }];
        })
      : [],
    busy: o.busy === true,
    ...(was && str(was.startsAt) && str(was.endsAt) ? { was: { startsAt: str(was.startsAt) ?? "", endsAt: str(was.endsAt) ?? "" } } : {}),
    cancel: o.cancel === true,
  };
}

/** The emails an approval shows as messages; anything that is not a name, a subject and a body is left out. */
function emailsOf(v: unknown): Approval["emails"] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): Approval["emails"] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const to = str(o.to)?.trim();
    const body = str(o.body);
    const address = str(o.address)?.trim();
    return to && body ? [{ to, ...(address ? { address } : {}), subject: str(o.subject) ?? "", body }] : [];
  });
}

/** A card's counts, keeping only the whole numbers. */
export function countsOf(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object") return null;
  const out = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, n]) => typeof n === "number" && Number.isFinite(n)) as [string, number][]);
  return Object.keys(out).length ? out : null;
}

/** The obvious next steps an outcome offers, each as a label and what it says or opens. */
/** The people a follow-up is about, when the server named them: a campaign and the ids on its board. */
function onlyOf(v: unknown): Suggestion["only"] | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const campaignId = str(o.campaignId);
  const ids = Array.isArray(o.campaignCandidateIds) ? o.campaignCandidateIds.filter((x): x is string => typeof x === "string") : [];
  return campaignId && ids.length ? { campaignId, campaignCandidateIds: ids } : null;
}

export function suggestionsOf(v: unknown): Suggestion[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): Suggestion[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const label = str(o.label) ?? str(o.title);
    if (!label) return [];
    const href = str(o.href);
    const text = str(o.text) ?? str(o.prompt);
    const only = onlyOf(o.only);
    return [{ label, ...(href ? { href } : {}), ...(text ? { text } : {}), ...(only ? { only } : {}) }];
  }).slice(0, 3);
}

/** A search before its first event: what a card that follows a run by its id starts from. */
export function newSearch(runId: string, campaignId: string, size: number | null = null): Search {
  return { runId, campaignId, size, pool: null, fresh: null, scored: 0, items: null, notices: [], phases: [], scoredIds: [], status: "running", error: null };
}

export function applySearch(s: Search, e: RunEvent): Search {
  switch (e.type) {
    case "plan":
      return { ...s, size: num(e.size) ?? s.size };
    case "progress": {
      if (e.step === "phase") {
        const phases = applyPhaseEvent(s.phases, e);
        return phases === s.phases ? s : { ...s, phases };
      }
      if (e.step === "feed") {
        const feed = applyFeed(s.feed ?? [], e);
        return feed === s.feed ? s : { ...s, feed };
      }
      if (e.step === "pool") return { ...s, pool: num(e.found) };
      if (e.step === "crustdata") return { ...s, fresh: num(e.found) };
      if (e.step === "scored") {
        // Counted once a person: a replayed event, or the same person scored again, does not add a second.
        const id = str(e.personId);
        if (id && s.scoredIds.includes(id)) return s;
        // A score that brings the person with it puts their row on screen now, in its place by fit.
        const item = e.item && typeof e.item === "object" && str((e.item as { personId?: unknown }).personId) ? (e.item as Match) : null;
        return {
          ...s,
          scored: s.scored + 1,
          scoredIds: id ? [...s.scoredIds, id] : s.scoredIds,
          ...(item ? { items: withScored(s.items, item) } : {}),
        };
      }
      return s;
    }
    case "notice": {
      const again = e.rescore && typeof e.rescore === "object" ? (e.rescore as Record<string, unknown>) : null;
      const text = again ? str(again.text) : null;
      return {
        ...s,
        notices: [...s.notices, str(e.text) ?? ""],
        ...(again && text ? { rescore: { campaignId: str(again.campaignId) ?? s.campaignId, people: num(again.people) ?? 0, text } } : {}),
      };
    }
    case "artifact":
      // The first batch lands while the rest is still being read, and the whole list replaces it.
      return { ...s, items: Array.isArray(e.items) ? mergeItems(s.items, e.items as Match[], e.partial === true) : (s.items ?? []) };
    case "error":
      return { ...s, status: "failed", phases: closePhases(s.phases, "failed"), error: str(e.message) };
    case "done":
      return { ...s, status: "done", phases: closePhases(s.phases, "done") };
    default:
      return s;
  }
}

/** A scored person added to the rows on screen, best fit first; the same person again replaces their row. */
export function withScored(have: readonly Match[] | null, item: Match): Match[] {
  const rest = (have ?? []).filter((m) => m.personId !== item.personId);
  return [...rest, item].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/** The people a search has put on screen so far: a partial batch is added to, the finished list replaces. */
export function mergeItems(have: readonly Match[] | null, next: readonly Match[], partial: boolean): Match[] {
  if (!partial || !have) return [...next];
  const seen = new Set(next.map((m) => m.personId));
  return [...next, ...have.filter((m) => !seen.has(m.personId))];
}

/** What a message kept from a press, so its turn comes back without a message of the person's: an answer to a card, or a button's words. */
function quietOf(artifact: ChatMessage["artifact"]): Pick<LiveTurn, "quiet"> {
  const a = artifact ?? null;
  if (a?.kind === "action") return { quiet: { label: str(a.label) ?? "" } };
  if (a?.kind !== "answer") return {};
  const runId = str(a.runId);
  const seq = num(a.seq);
  const value = str(a.value);
  return { quiet: { label: str(a.line) ?? "", ...(runId && seq !== null ? { answer: { runId, seq, ids: stringsOf(a.ids), ...(value ? { value } : {}) } } : {}) } };
}

/** The app's own opening line of a chat, from the message that carries it (the set-up's first campaign). */
export function openingOf(artifact: ChatMessage["artifact"]): Pick<LiveTurn, "opening"> {
  const a = artifact ?? null;
  if (a?.kind !== "setup") return {};
  const line = str(a.line);
  if (!line) return {};
  const jd = a.jd && typeof a.jd === "object" ? num((a.jd as Record<string, unknown>).words) : null;
  return { opening: { line, jdWords: jd } };
}

/** A chat as the server has it: one turn per message the recruiter sent. */
export function fromDetail(detail: ConversationDetail): ChatState {
  const turns: LiveTurn[] = [];
  const owners: Record<string, string> = {};
  for (const m of detail.messages) {
    // The agent speaking first (a reminder that came due): its own line, with nothing of the person's above it.
    if (m.role === "assistant" && !m.runId && m.artifact?.kind === "reminder") {
      const at = Date.parse(m.createdAt);
      turns.push({ ...newTurn(m.id, "", at), status: "done", reply: m.text, finishedAt: at, quiet: { label: "" } });
      continue;
    }
    if (m.role !== "user") continue;
    const key = m.clientId ?? m.id;
    turns.push({ ...newTurn(key, m.text, Date.parse(m.createdAt)), runId: m.runId, status: "working", ...quietOf(m.artifact), ...openingOf(m.artifact) });
    if (m.runId) owners[m.runId] = key;
  }
  return { conversationId: detail.conversation.id, turns, owners, orphans: {}, applied: {}, loading: false, error: null };
}

/* ── the store ─────────────────────────────────────────────────────────── */

const CHAT_KEY = "sh.agent.conversation";
const EMPTY: ChatState = { conversationId: null, turns: [], owners: {}, orphans: {}, applied: {}, loading: false, error: null };

let state: ChatState = EMPTY;
let stop: (() => void) | null = null;
const stopSearches = new Map<string, () => void>();
const listeners = new Set<() => void>();

function set(next: ChatState): void {
  state = next;
  for (const l of listeners) l();
}
/** Events up to this id were already there when the chat was opened: replayed, not new. */
let replayUntil = 0;
/** Counts every time the chat is opened, cleared or sent away from, so an answer to an older ask is dropped. */
let epoch = 0;

const dispatch = (e: RunEvent) => {
  set(applyEvent(state, e));
  if ((e.eventId ?? (typeof e.id === "number" ? e.id : 0)) <= replayUntil) return;
  // The agent has answered while this tab is behind another: a browser alert, if the person allowed one.
  if (e.type === "done") announce("Your agent replied.", "agent-reply");
  const changed = effectsOf(e) ?? searchEnded(state, e);
  if (changed) {
    const capability = (changed as { capability?: string | null }).capability ?? null;
    for (const l of effectListeners) l(changed.effects, changed.campaignId, capability);
  }
  // A run that ended may have written (a command run in code, a task made): what everyone sees is read again.
  if (e.type === "done" || e.type === "error") for (const l of runEndListeners) l();
  // The chat is about another campaign now (one just made, one just chosen): the page follows it.
  const about = e.type === "focus" ? str(e.campaignId) : null;
  if (about) focusChat(about, str(e.name) ?? "");
};

/** Tells the page the chat is about this campaign now: a card that made one says so too, as the server does for its own. */
export function focusChat(campaignId: string, name: string): void {
  for (const l of focusListeners) l(campaignId, name);
}

const focusListeners = new Set<(campaignId: string, name: string) => void>();

/** Told when the chat moves to a campaign as it goes (a new one was made, or one was chosen), not when a chat is reopened. */
export function onChatFocus(fn: (campaignId: string, name: string) => void): () => void {
  focusListeners.add(fn);
  return () => focusListeners.delete(fn);
}

/**
 * A search this chat follows has just ended: the campaign's board, its figures and the week's "found" are stale
 * (the search saved people), though the run itself does not say so. Null for any other event.
 */
export function searchEnded(
  chat: ChatState,
  e: Pick<RunEvent, "type" | "runId">,
): { effects: readonly CapabilityEffect[]; campaignId: string | null } | null {
  if (e.type !== "done" && e.type !== "error") return null;
  const key = chat.owners[e.runId];
  const search = key ? chat.turns.find((t) => t.key === key)?.searches.find((s) => s.runId === e.runId) : undefined;
  return search ? { effects: ["sourcing", "pipeline", "campaign", "candidates"], campaignId: search.campaignId } : null;
}

/* ── what a run changed ── */

type EffectListener = (effects: readonly CapabilityEffect[], campaignId: string | null, capability: string | null) => void;
const effectListeners = new Set<EffectListener>();
const runEndListeners = new Set<() => void>();

/** Told when a run of this chat has ended (done or failed), for whatever it may have written along the way. */
export function onChatRunEnd(fn: () => void): () => void {
  runEndListeners.add(fn);
  return () => runEndListeners.delete(fn);
}

/** Told when something this chat ran changed the workspace, so the pages that show it can read it again. */
export function onChatEffects(fn: EffectListener): () => void {
  effectListeners.add(fn);
  return () => effectListeners.delete(fn);
}

/**
 * What an approved action leaves stale, for a server that doesn't say so itself (its `result` and `effect`
 * events carry the capability's own effects, which win). Every action a card can be approved for is here.
 */
export const ACTION_EFFECTS: Readonly<Record<string, readonly CapabilityEffect[]>> = {
  // The board
  shortlist: ["pipeline", "campaign", "candidates"],
  move: ["pipeline", "campaign", "candidates"],
  pass: ["pipeline", "campaign", "candidates"],
  unshortlist: ["pipeline", "campaign", "candidates"],
  assign_owner: ["pipeline", "team", "candidates"],
  // Searching
  find_people: ["sourcing", "campaign"],
  start_watch: ["sourcing", "campaign"],
  stop_watch: ["sourcing", "campaign"],
  fetch_contacts: ["candidates", "pipeline", "campaign"],
  // Campaigns
  set_status: ["campaign", "pipeline", "sourcing"],
  approve_spec: ["spec", "sourcing", "campaign"],
  edit_spec: ["spec"],
  set_job_description: ["campaign", "spec", "sourcing"],
  update_campaign: ["campaign"],
  create_campaign: ["campaign", "spec"],
  duplicate_campaign: ["campaign"],
  campaign_team: ["campaign", "team"],
  set_campaign_owner: ["campaign", "team"],
  // Clients
  create_client: ["clients"],
  update_client: ["clients", "campaign"],
  // People
  save_candidates: ["candidates", "campaign"],
  add_candidate: ["candidates", "pipeline", "campaign"],
  add_note: ["candidates"],
  erase_candidate: ["candidates", "pipeline", "campaign", "memory"],
  // Email
  draft_emails: ["pipeline", "campaign"],
  send_email: ["pipeline", "campaign", "candidates"],
  cancel_email: ["pipeline", "campaign"],
  retry_failed_emails: ["pipeline", "campaign", "candidates"],
  // The team
  invite_member: ["team"],
  set_member_role: ["team"],
  respond_to_request: ["team"],
  remove_member: ["team", "campaign", "candidates"],
  create_team: ["team"],
  update_team: ["team"],
  delete_team: ["team", "campaign"],
  add_team_member: ["team"],
  remove_team_member: ["team"],
  assign_campaign_team: ["team", "campaign"],
  create_tasks: ["team"],
  note_for_admins: ["team"],
  // The agent's own things
  remember: ["memory"],
  forget_memory: ["memory"],
  schedule: ["schedules"],
  // Meetings, interviews and reminders
  meeting: ["meetings", "pipeline"],
  meeting_move: ["meetings"],
  meeting_cancel: ["meetings"],
  meeting_add: ["meetings"],
  reminder: ["schedules", "meetings"],
  // Connections
  slack_message: ["connections"],
  notion_note: ["connections"],
  set_notion_page: ["connections"],
  disconnect_app: ["connections"],
};

/**
 * The views an event says are stale: an `effect` event says so itself, and an approved action's `result` names
 * the action, which is enough on a server that does not emit effects yet.
 */
export function effectsOf(e: RunEvent): { effects: readonly CapabilityEffect[]; campaignId: string | null; capability: string | null } | null {
  const effect = effectOf(e);
  if (effect) {
    // A write the console knows by its capability (a task, an owner) is read again even when it names no view.
    return effect.effects.length || effect.capability
      ? { effects: effect.effects, campaignId: effect.campaignId ?? null, capability: effect.capability || null }
      : null;
  }
  if (e.type !== "result" || e.decision === "decline") return null;
  return effectsOfResult(e as Record<string, unknown>, null);
}

/** An approved action's answer: its own capability and effects when the server says them, else what the action implies. */
function effectsOfResult(
  r: { action?: unknown; capability?: unknown; effects?: unknown; campaignId?: unknown },
  was: { action?: string | null; campaignId?: string | null } | null,
): { effects: readonly CapabilityEffect[]; campaignId: string | null; capability: string | null } | null {
  const action = str(r.action) ?? was?.action ?? null;
  const campaignId = str(r.campaignId) ?? was?.campaignId ?? null;
  const capability = str(r.capability);
  const own = Array.isArray(r.effects) ? r.effects.filter((x): x is CapabilityEffect => CAPABILITY_EFFECTS.some((k) => k === x)) : [];
  const effects = own.length ? own : action ? ACTION_EFFECTS[action] ?? [] : [];
  // An action the console has no table row for is still a write: it says so with its action name.
  if (!effects.length && !capability && !action) return null;
  return { effects, campaignId, capability: capability ?? action };
}

function remember(id: string | null): void {
  try {
    if (id) window.sessionStorage.setItem(CHAT_KEY, id);
    else window.sessionStorage.removeItem(CHAT_KEY);
  } catch {
    /* the chat still works; it just won't reopen after a reload */
  }
}

export function useLiveChat(): ChatState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** The chat as it is now, outside React (tests, and anything that must not subscribe). */
export const chatNow = (): ChatState => state;

/** Opens the chat from this tab's last visit, if there was one. */
export async function resumeChat(): Promise<void> {
  if (state.conversationId) return;
  let id: string | null = null;
  try {
    id = window.sessionStorage.getItem(CHAT_KEY);
  } catch {
    id = null;
  }
  if (id) await openChat(id);
}

/**
 * Looks at the open chat again from the start: what the server holds replaces what this tab has, and the line is
 * opened afresh. For a card that has waited too long for its next word (the line may have dropped without a sound).
 */
export async function refreshChat(): Promise<void> {
  if (state.conversationId) await openChat(state.conversationId);
}

/** What a followed chat does when its stream says it can never open: forget it, calmly. */
function chatGone(at: number, id: string) {
  return (why: "missing" | "moved") => {
    if (at !== epoch || state.conversationId !== id) return;
    epoch += 1;
    closeStreams();
    remember(null);
    // Moved: the tab is about to reload into another workspace, and says so itself.
    set(why === "missing" ? { ...EMPTY, error: "That chat isn't here any more." } : EMPTY);
  };
}

export async function openChat(id: string): Promise<void> {
  closeStreams();
  const at = ++epoch;
  set({ ...EMPTY, loading: true });
  try {
    const detail = await agentApi.conversation(id);
    if (at !== epoch) return;
    replayUntil = detail.eventCursor ?? 0;
    set(fromDetail(detail));
    remember(id);
    // Replay from the start: it rebuilds cards, searches and approvals exactly as they were.
    stop = follow({ conversationId: id }, 0, dispatch, chatGone(at, id));
  } catch (err) {
    if (at !== epoch) return;
    remember(null);
    set({ ...EMPTY, error: messageOf(err) });
  }
}

export function newChat(): void {
  epoch += 1;
  closeStreams();
  replayUntil = 0;
  remember(null);
  set(EMPTY);
}

/**
 * The workspace changed (switched, approved, accepted, or another tab did it): the chat belongs to the
 * one that was left. Nothing of it stays on screen, in history or in what the tab would reopen.
 */
export function resetChat(): void {
  newChat();
}
onWorkspaceChange(resetChat);

function closeStreams(): void {
  stop?.();
  stop = null;
  for (const s of stopSearches.values()) s();
  stopSearches.clear();
}

/**
 * Sends a message, starting the chat on the first one. The turn is on screen
 * before the request goes out; its key is returned at once so the page can
 * animate the turn it just added.
 */
export function sendMessage(text: string, campaignId?: string, structured?: Structured): string {
  const key = crypto.randomUUID();
  set({ ...state, error: null, turns: [...state.turns, { ...newTurn(key, text), campaignId: campaignId ?? null, ...(structured ? { structured } : {}) }] });
  void deliver(key, text, campaignId, false, undefined, structured);
  return key;
}

/**
 * A button that does something the agent already knows how to do ("Find more people", "Carry on"): its words go
 * to the agent as a turn, and the turn is shown under the button, with no message of the person's. Anything that
 * is a new question belongs in the composer, and is sent as a message.
 */
export function sendAction(text: string, label: string, campaignId?: string, structured?: Structured): string {
  const key = crypto.randomUUID();
  set({ ...state, error: null, turns: [...state.turns, { ...newTurn(key, text), campaignId: campaignId ?? null, quiet: { label } }] });
  void deliver(key, text, campaignId, false, label, structured);
  return key;
}

/**
 * The pick on a question's card, sent as the answer to that question: the card settles on it, the agent goes on
 * under it, and no message of the person's is added. The same press twice is one answer (the key stays with the
 * card until it is answered); a card the chat has moved on from settles as out of date.
 */
export async function answerQuestion(key: string, index: number, ids: readonly string[], value?: string): Promise<void> {
  const q = state.turns.find((t) => t.key === key)?.questions[index];
  const conversationId = state.conversationId;
  if (!q || q.answer || q.stale || q.sending || !conversationId) return;
  const clientId = q.answerKey ?? crypto.randomUUID();
  const mark = (fn: (q: Question) => Question) =>
    set(update(state, key, (t) => ({ ...t, questions: t.questions.map((x, i) => (i === index ? fn(x) : x)) })));
  mark((x) => ({ ...x, sending: true, error: null, answerKey: clientId }));
  const at = epoch;
  try {
    const r = await agentApi.answer(conversationId, { clientId, runId: q.runId, seq: q.seq, ids: [...ids], ...(value ? { value } : {}) });
    if (at !== epoch) return;
    const mine = { ids: stringsOf(r.answer.ids), ...(str(r.answer.value) ? { value: str(r.answer.value) ?? "" } : {}), line: str(r.answer.line) ?? "" };
    let next = settleQuestion(state, q.runId, q.seq, mine);
    // The turn the answer started sits under the card. One that is there already (a second press, a reload) is not added twice.
    if (!next.owners[r.runId]) {
      const turn: LiveTurn = {
        ...newTurn(clientId, ""), runId: r.runId, status: "working",
        quiet: { label: mine.line, answer: { runId: q.runId, seq: q.seq, ids: mine.ids, ...(mine.value ? { value: mine.value } : {}) } },
      };
      next = claim({ ...next, turns: [...next.turns, turn] }, r.runId, clientId);
    }
    set(next);
  } catch (err) {
    if (at !== epoch) return;
    if (err instanceof ApiError && err.status === 409) set(settleQuestion(state, q.runId, q.seq, "stale"));
    else mark((x) => ({ ...x, sending: false, error: messageOf(err) }));
  }
}

/**
 * "Send again" on a turn that did not go through: the same turn, in the same place, goes out again about the
 * same campaign. It is not a second message in the thread.
 */
export function resendTurn(key: string): void {
  const turn = state.turns.find((t) => t.key === key);
  if (!turn) return;
  const owners = Object.fromEntries(Object.entries(state.owners).filter(([, k]) => k !== key));
  set({
    ...state,
    error: null,
    owners,
    turns: state.turns.map((t) => (t.key === key ? { ...newTurn(key, t.said), campaignId: t.campaignId ?? null, ...(t.quiet ? { quiet: t.quiet } : {}), ...(t.structured ? { structured: t.structured } : {}) } : t)),
  });
  if (turn.quiet?.answer) void redeliverAnswer(key, turn.quiet.answer);
  else void deliver(key, turn.said, turn.campaignId ?? undefined, true, turn.quiet?.label, turn.structured);
}

/** "Send again" on the turn an answer started: the answer is made once more, in place, and starts the turn again. */
async function redeliverAnswer(key: string, a: { runId: string; seq: number; ids: string[]; value?: string }): Promise<void> {
  const at = epoch;
  try {
    const id = state.conversationId;
    if (!id) throw new Error("This chat isn't open any more.");
    const r = await agentApi.answer(id, { clientId: crypto.randomUUID(), runId: a.runId, seq: a.seq, ids: a.ids, ...(a.value ? { value: a.value } : {}), again: true });
    if (at !== epoch) return;
    set(update(claim(state, r.runId, key), key, (t) => ({ ...t, runId: r.runId, status: t.status === "sending" ? "working" : t.status })));
  } catch (err) {
    if (at !== epoch) return;
    const api = err instanceof ApiError;
    set(update(state, key, (t) => ({
      ...t, status: "failed", error: api ? err.message : messageOf(err), errorCode: api ? err.code : null,
      retryAt: api ? err.retryAt : null, finishedAt: Date.now(),
    })));
  }
}

async function deliver(key: string, text: string, campaignId?: string, again = false, quiet?: string, structured?: Structured): Promise<void> {
  const at = epoch;
  try {
    let id = state.conversationId;
    if (!id) {
      const created = await agentApi.createConversation(campaignId);
      if (at !== epoch) return;
      id = created.id;
      remember(id);
      set({ ...state, conversationId: id });
      stop = follow({ conversationId: id }, 0, dispatch, chatGone(at, id));
    }
    // A message that went again is a new send to the server: the first one's key already stands for a refused try.
    const clientId = again ? crypto.randomUUID() : key;
    const sent = await agentApi.send(id, { clientId, text, ...(campaignId ? { campaignId } : {}), ...(quiet ? { quiet } : {}), ...(structured ?? {}) });
    if (at !== epoch) return;
    set(update(claim(state, sent.runId, key), key, (t) => ({ ...t, runId: sent.runId, status: t.status === "sending" ? "working" : t.status })));
  } catch (err) {
    if (at !== epoch) return;
    /* The server's own sentence and code, so a refused message is told as refused (and a limit counts
       down) rather than offered again as if sending it once more could work. */
    const api = err instanceof ApiError;
    set(update(state, key, (t) => ({
      ...t, status: "failed", error: api ? err.message : messageOf(err), errorCode: api ? err.code : null,
      retryAt: api ? err.retryAt : null, finishedAt: Date.now(),
    })));
  }
}

/** How long a yes waits for its answer before the card stops waiting and says so. */
export const DECISION_LIMIT_MS = 90_000;

/** Said when no answer came back at all: the request may still have reached the server, so it says to look first. */
export const NO_ANSWER = "No answer came back in time. It may still have gone through, so look before you try again.";

class NoAnswer extends Error {}

/** `work`, or a refusal after `ms`: a request that never settles must not leave a card on "Sending…". */
function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new NoAnswer(NO_ANSWER)), ms);
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (err: unknown) => { clearTimeout(timer); reject(err); },
    );
  });
}

/** What a refused or failed yes says on the card: the sentence, where the fix is, and the server's reason. */
export function failureOf(action: string, err: unknown): { error: string; help: string | null; reason: string | null; aboutConnection: boolean } {
  if (err instanceof NoAnswer) return { error: NO_ANSWER, help: null, reason: "no_answer", aboutConnection: false };
  const api = err instanceof ApiError ? err : null;
  const said = api ? messageOf(api) : "That didn't go through. Try again.";
  const help = api ? helpLinkOf(api.details.help, said) : helpLinkOf(null, said);
  const reason = api && typeof api.details.reason === "string" ? api.details.reason : api && api.status === 0 ? "network" : null;
  return {
    error: approvalFailure(action, api ? api.status : null, said),
    help,
    reason,
    aboutConnection: api !== null && (typeof api.details.connect === "string" || reason === "google_reconnect" || reason === "google_permission"),
  };
}

/** Whether an answered card can be answered again in place: the last answer says something failed that can be sent again. */
export const canTryAgain = (a: Pick<Approval, "decided">): boolean =>
  a.decided?.decision === "approve" && a.decided.outcome.again === true;

/** Which answer of the card this is (1 for the first); a Try again sends it so a second tab's older press runs nothing. */
const attemptOf = (a: Pick<Approval, "decided">): number => {
  const n = a.decided ? num(a.decided.outcome.attempt) : null;
  return n !== null && n >= 1 ? n : 1;
};

/**
 * Answers an approval. The card is "working" from the click until one of three things: the reply says it was done
 * or declined (the card settles on it at once, the stream's `result` event after it changes nothing), the reply
 * is a refusal or the request fails (the card says why in words, offers "Try again" and its own lines stop), or no
 * reply comes within `DECISION_LIMIT_MS`. A card is never left working for good.
 */
export async function decide(
  key: string,
  seq: number,
  decision: "approve" | "decline",
  /** What was done on the card before the yes: which of its offered times (by place), the Meet link on or off. */
  edit?: { slot?: number; meet?: boolean },
): Promise<void> {
  const turn = state.turns.find((t) => t.key === key);
  const was = turn?.approvals.find((a) => a.seq === seq);
  /* An answered card is answered once, except Try again on one that says so: that runs the same approval again, in
     place, and the card's answer is replaced. Nothing is added to the chat for it. */
  const again = decision === "approve" && !!was && canTryAgain(was);
  if (!turn || !was || was.deciding || (was.decided && !again)) return;
  const patch = (fn: (a: Approval) => Approval) =>
    set(update(state, key, (t) => ({ ...t, approvals: t.approvals.map((a) => (a.seq === seq ? fn(a) : a)) })));
  if (!turn.runId) {
    patch((a) => ({ ...a, error: "This chat isn't ready for an answer yet. Try again in a moment." }));
    return;
  }
  patch((a) => ({ ...a, deciding: true, error: null, help: null, reason: null }));
  try {
    const result = await within(agentApi.decide(turn.runId, seq, decision, again ? attemptOf(was) : undefined, edit), DECISION_LIMIT_MS);
    // A watch that just started belongs in the rail now, not on its next refresh.
    if (decision === "approve" && (result as { action?: string } | undefined)?.action === "start_watch") {
      watchesChanged();
    }
    const body = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
    // The reply is the outcome: the card settles on it now rather than when the stream gets round to saying so.
    const now = state.turns.find((t) => t.key === key)?.approvals.find((a) => a.seq === seq);
    /* Once, for the first answer; for a Try again, only when the answer is newer than the one on the card (the
       stream's own copy of it may already have landed). */
    const newer = typeof body.attempt === "number" && !!now?.decided && body.attempt > attemptOf(now);
    if (now && (!now.decided || newer)) {
      set(settleApproval(state, key, { ...body, approvalSeq: seq, decision: body.decision ?? decision, runId: turn.runId }));
    } else {
      /* A reply that settled nothing (the stream's copy won) still ends the wait. */
      patch((a) => ({ ...a, deciding: false }));
    }
    // What the approved action changed is read again now, not when the stream gets round to saying so.
    if (decision === "approve") {
      const changed = effectsOfResult(body, { action: was.action || null, campaignId: was.campaignId });
      if (changed) for (const l of effectListeners) l(changed.effects, changed.campaignId, changed.capability);
    }
  } catch (err) {
    /* The card was answered somewhere else (another tab, the Outreach page, an earlier yes): it settles on that, calmly. A
       red "Try again" would offer to do again what is done. */
    if (err instanceof ApiError && err.status === 409 && /already (?:decided|handled|logged)/i.test(err.message)) {
      set(settleApproval(state, key, { approvalSeq: seq, decision, action: was.action, summary: ALREADY_HANDLED, handled: true, runId: turn.runId }));
      return;
    }
    /* A refusal that will not change (they may not do this): the card settles on the sentence. "Try again" would offer the
       same refusal again. */
    if (err instanceof ApiError && err.status === 403 && was.decided === null) {
      set(settleApproval(state, key, { approvalSeq: seq, decision, action: was.action, summary: messageOf(err), refused: true, runId: turn.runId }));
      return;
    }
    const failed = failureOf(was.action, err);
    set(update(state, key, (t) => ({
      ...t,
      approvals: t.approvals.map((a) => (a.seq === seq ? { ...a, deciding: false, error: failed.error, help: failed.help, reason: failed.reason } : a)),
      // The line the yes was running stops with it, so nothing on the page keeps turning for a send that is not going.
      phases: failApprovalLines(t.phases, seq, failed.error),
    })));
    // A refusal about a connection: what is connected is read again, so the card beside it tells the truth.
    if (failed.aboutConnection) void ensureConnections(true).catch(() => undefined);
  }
}

/* ── the rail's watch list listens for watches started from chat ── */

const watchListeners = new Set<() => void>();
export function onWatchesChanged(fn: () => void): () => void {
  watchListeners.add(fn);
  return () => watchListeners.delete(fn);
}
/** Tells whatever lists the workspace's watches (the rail) that one started, paused or stopped. */
export function watchesChanged() {
  for (const fn of watchListeners) fn();
}

/** "Find N more" on a search's results: a new search in the same turn, followed live. */
export async function findMore(key: string, campaignId: string): Promise<void> {
  const turn = state.turns.find((t) => t.key === key);
  const from = state.conversationId && turn?.runId ? { conversationId: state.conversationId, parentRunId: turn.runId } : undefined;
  try {
    const { runId, size } = await agentApi.findMore(campaignId, from, pressId());
    set(claim(state, runId, key, { campaignId, size }));
    // Part of the chat, its events arrive on the chat's own stream; otherwise follow the run.
    if (!from) stopSearches.set(runId, follow({ runId }, 0, dispatch));
  } catch (err) {
    set(update(state, key, (t) => ({ ...t, notices: [...t.notices, messageOf(err)] })));
  }
}

const STOPPED = "Stopped.";

/** Stops a turn that's still working. Its run says "Stopped." and the turn settles from the stream. */
export async function stopTurn(key: string): Promise<void> {
  const turn = state.turns.find((t) => t.key === key);
  if (!turn?.runId) return;
  try {
    await agentApi.cancel(turn.runId);
    set(update(state, key, (t) => (t.status === "working" || t.status === "sending" ? { ...t, status: "failed", error: STOPPED, finishedAt: Date.now() } : t)));
  } catch (err) {
    set(update(state, key, (t) => ({ ...t, notices: [...t.notices, messageOf(err)] })));
  }
}

/** The server gives up on a turn after this long; past it, the page stops waiting too. */
export const TURN_LIMIT_MS = 190_000;

/** A turn still "working" long after the server would have ended it: its run was lost (a restart). */
export function stalled(t: LiveTurn, now = Date.now()): boolean {
  return (t.status === "working" || t.status === "sending") && now - t.startedAt > TURN_LIMIT_MS;
}
