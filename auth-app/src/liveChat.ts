import { announce } from "./browserAlerts";
import { useSyncExternalStore } from "react";
import { CAPABILITY_EFFECTS, effectOf } from "./agentEvents";
import type { CapabilityEffect } from "./agentEvents";
import { applyFeed } from "./agentFeed";
import type { FeedLine } from "./agentFeed";
import { applyPhaseEvent, closePhases } from "./agentPhases";
import type { PhaseLine } from "./agentPhases";
import { agentApi } from "./api/agent";
import type { ChatCard, ConversationDetail, Match, Suggestion } from "./api/agent";
import { ApiError, messageOf } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import { approvalFailure } from "./chatCards";
import { follow } from "./api/events";
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
  people: Array<{ name: string; title: string | null; company: string | null; city: string | null }>;
  decided: null | { decision: "approve" | "decline"; outcome: Record<string, unknown> };
  deciding: boolean;
  error: string | null;
  /** Things the server wants said about this one (a missing Gmail, contact details taken out), as it sent them. */
  notes: string[];
  /** The capability behind it ("pipeline.shortlist"), when the server names one. */
  capability: string | null;
  /** What the server says this will not do, in its words; the card adds its own for the kinds it knows. */
  wontDo: string[];
  /** An email that will go out, exactly: who it is to (a name), the subject and the words. */
  emails: Array<{ to: string; subject: string; body: string }>;
};
/** A choice may carry the exact words to send when it is picked (`text`), whatever the kind of question. */
export type Question = { kind: string; text: string; choices: Array<{ id: string; name: string; text?: string }>; retryText?: string; campaignId?: string; note?: string };

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
  /** The campaign the message was sent about, kept so sending it again says the same. */
  campaignId?: string | null;
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

/** The choices of a `question` event, keeping the words a choice sends when it has its own. */
export function questionChoices(raw: unknown): Question["choices"] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c: unknown) => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    const name = str(o.name)?.trim();
    if (!name) return [];
    const text = str(o.text)?.trim();
    return [{ id: str(o.id) ?? name, name, ...(text ? { text } : {}) }];
  });
}

/**
 * What a question offers to press, and what each press sends. A choice with its own `text` sends that, for any kind
 * of question; a campaign question's choices otherwise resend the original words "for <campaign>".
 */
export function askOptions(question: Pick<Question, "kind" | "choices" | "retryText">): Array<{ label: string; text: string }> {
  if (question.kind === "watch_setup" && !question.choices.some((c) => c.text)) {
    return [
      { label: "20 people", text: "Keep looking for 20 people" },
      { label: "50 people", text: "Keep looking for 50 people" },
      { label: "For a week", text: "Keep looking for a week" },
      { label: "For 2 weeks", text: "Keep looking for 2 weeks" },
    ];
  }
  return question.choices.flatMap((c) => {
    const text = c.text ?? (question.kind === "campaign" ? `${question.retryText ?? ""} for ${c.name}`.trim() : null);
    return text ? [{ label: c.name, text }] : [];
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
        }],
      }));
    }
    case "result": {
      const seq = num(e.approvalSeq);
      const decision = e.decision === "decline" ? "decline" : "approve";
      let next = update(state, key, (t) => ({
        ...t,
        approvals: t.approvals.map((a) => (a.seq === seq ? { ...a, deciding: false, decided: { decision, outcome: e } } : a)),
      }));
      const runId = str(e.searchRunId);
      const campaignId = str(e.campaignId);
      /* Any approved action that started a search names it (finding people, approving a role spec): the turn
         follows it and draws it as the search it is, whichever action it was. */
      if (runId && campaignId) next = claim(next, runId, key, { campaignId, size: num(e.size) });
      return next;
    }
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

/** A card event, or null when it isn't one the page knows (an older or newer server). */
function cardOf(e: RunEvent): ChatCard | null {
  const key = str(e.key);
  if (!key) return null;
  if (e.kind === "people" && Array.isArray(e.people)) return { ...(e as unknown as Extract<ChatCard, { kind: "people" }>), key };
  if (e.kind === "campaign" && str(e.campaignId)) return { ...(e as unknown as Extract<ChatCard, { kind: "campaign" }>), key };
  if (e.kind === "view" && str(e.view)) return { ...(e as unknown as Extract<ChatCard, { kind: "view" }>), key };
  if (e.kind === "campaigns" && Array.isArray(e.items)) return { ...(e as unknown as Extract<ChatCard, { kind: "campaigns" }>), key };
  if (e.kind === "outcome") {
    return {
      kind: "outcome", key, summary: str(e.summary) ?? "Done.", counts: countsOf(e.counts), next: suggestionsOf(e.next),
      undo: suggestionsOf([e.undo])[0] ?? null,
      campaignId: str(e.campaignId), capability: str(e.capability),
    };
  }
  if (e.kind === "export") {
    const list = e.list === "pipeline" ? "pipeline" : e.list === "shortlist" ? "shortlist" : null;
    const format = e.format === "xlsx" ? "xlsx" : e.format === "csv" ? "csv" : null;
    const campaignId = str(e.campaignId);
    if (!list || !format || !campaignId) return null;
    return { kind: "export", key, campaignId, campaignName: str(e.campaignName) ?? "the campaign", list, format };
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
    };
  }
  // A kind from a newer server: kept, so the turn's cards stay in order, and drawn as nothing.
  const was = str(e.kind);
  return was ? { kind: "unknown", key, was } : null;
}

/** The emails an approval shows as messages; anything that is not a name, a subject and a body is left out. */
function emailsOf(v: unknown): Approval["emails"] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): Approval["emails"] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const to = str(o.to)?.trim();
    const body = str(o.body);
    return to && body ? [{ to, subject: str(o.subject) ?? "", body }] : [];
  });
}

/** A card's counts, keeping only the whole numbers. */
export function countsOf(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object") return null;
  const out = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, n]) => typeof n === "number" && Number.isFinite(n)) as [string, number][]);
  return Object.keys(out).length ? out : null;
}

/** The obvious next steps an outcome offers, each as a label and what it says or opens. */
export function suggestionsOf(v: unknown): Suggestion[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): Suggestion[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const label = str(o.label) ?? str(o.title);
    if (!label) return [];
    const href = str(o.href);
    const text = str(o.text) ?? str(o.prompt);
    return [{ label, ...(href ? { href } : {}), ...(text ? { text } : {}) }];
  }).slice(0, 3);
}

function applySearch(s: Search, e: RunEvent): Search {
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

/** A chat as the server has it: one turn per message the recruiter sent. */
export function fromDetail(detail: ConversationDetail): ChatState {
  const turns: LiveTurn[] = [];
  const owners: Record<string, string> = {};
  for (const m of detail.messages) {
    if (m.role !== "user") continue;
    const key = m.clientId ?? m.id;
    turns.push({ ...newTurn(key, m.text, Date.parse(m.createdAt)), runId: m.runId, status: "working" });
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
};

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
  add_note: ["candidates"],
  erase_candidate: ["candidates", "pipeline", "campaign", "memory"],
  // Email
  draft_emails: ["pipeline", "campaign"],
  send_email: ["pipeline", "campaign", "candidates"],
  cancel_email: ["pipeline", "campaign"],
  // The team
  invite_member: ["team"],
  set_member_role: ["team"],
  respond_to_request: ["team"],
  remove_member: ["team", "campaign", "candidates"],
  create_tasks: ["team"],
  note_for_admins: ["team"],
  // The agent's own things
  remember: ["memory"],
  forget_memory: ["memory"],
  schedule: ["schedules"],
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
export function sendMessage(text: string, campaignId?: string): string {
  const key = crypto.randomUUID();
  set({ ...state, error: null, turns: [...state.turns, { ...newTurn(key, text), campaignId: campaignId ?? null }] });
  void deliver(key, text, campaignId);
  return key;
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
    turns: state.turns.map((t) => (t.key === key ? { ...newTurn(key, t.said), campaignId: t.campaignId ?? null } : t)),
  });
  void deliver(key, turn.said, turn.campaignId ?? undefined, true);
}

async function deliver(key: string, text: string, campaignId?: string, again = false): Promise<void> {
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
    const sent = await agentApi.send(id, { clientId, text, ...(campaignId ? { campaignId } : {}) });
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

export async function decide(key: string, seq: number, decision: "approve" | "decline"): Promise<void> {
  const turn = state.turns.find((t) => t.key === key);
  if (!turn?.runId) return;
  const patch = (fn: (a: Approval) => Approval) =>
    set(update(state, key, (t) => ({ ...t, approvals: t.approvals.map((a) => (a.seq === seq ? fn(a) : a)) })));
  patch((a) => ({ ...a, deciding: true, error: null }));
  try {
    // The outcome arrives as a `result` event on the stream, which settles the card.
    const result = await agentApi.decide(turn.runId, seq, decision);
    // A watch that just started belongs in the rail now, not on its next refresh.
    if (decision === "approve" && (result as { action?: string } | undefined)?.action === "start_watch") {
      watchesChanged();
    }
    // What the approved action changed is read again now, not when the stream gets round to saying so.
    if (decision === "approve") {
      const was = turn.approvals.find((a) => a.seq === seq);
      const changed = effectsOfResult((result ?? {}) as Record<string, unknown>, { action: was?.action ?? null, campaignId: was?.campaignId ?? null });
      if (changed) for (const l of effectListeners) l(changed.effects, changed.campaignId, changed.capability);
    }
  } catch (err) {
    const status = err instanceof ApiError ? err.status : null;
    patch((a) => ({ ...a, deciding: false, error: approvalFailure(a.action, status, messageOf(err)) }));
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
    const { runId, size } = await agentApi.findMore(campaignId, from);
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
