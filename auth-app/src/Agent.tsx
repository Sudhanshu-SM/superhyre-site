import { ArrowUp, Check, FileText, FunnelSimple, Plus, SlidersHorizontal } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Campaigns } from "./Campaigns";
import { Loader } from "./components/Loader";
import { onInvalidate } from "./invalidate";
import type { Deployed } from "./Campaigns";
import { BorderGlow } from "./glow";
import { BRIEFS, MODES, SCOPED, SOURCING_CONTEXT, STAGES } from "./orchestrator";
import type { CampaignKey, ModeId, PipelineRole } from "./orchestrator";
import { Rail } from "./Rail";
import { REPLIES } from "./replies";
import { Prompt, Reply } from "./Reply";
import { IdeaChips, IdeaList } from "./Recs";
import { nextVisit } from "./recs";
import { highlightRuns } from "./slots";
import { ProfileSidebar } from "./ProfileSidebar";
import { FiltersDialog } from "./FiltersDialog";
import { JdDialog, jdFromText } from "./JdDialog";
import type { Jd } from "./JdDialog";
import { Dialog } from "./ui";
import { activeCount, fromBrief } from "./filters";
import type { Values } from "./filters";
import { RankedMatches } from "./RankedMatches";
import { SourcingRun } from "./Sourcing";
import { CANDIDATES } from "./sourcing";
import { ConnectorsProvider } from "./connectors";
import { Moment } from "./Moments";
import { campaignName } from "./orchestrator";
import { classify } from "./moments";
import type { FormView } from "./formsStore";
import { TurnContext, clearThread, saveTurns, savedTurns } from "./agentThread";
import type { MomentCtx, MomentKind } from "./moments";
import type { Verdict } from "./sourcing";
import type { Campaign } from "./workspaces";
import { api, LIVE, messageOf } from "./api/client";
import { agentApi, attachmentApi, filtersApi } from "./api/agent";
import { isSheetFile } from "./jdIntake";
import { type ImportSeed, hasSeed, sheetLinkIn, stashImport } from "./importFiles";
import {
  ATTACH_ACCEPT, MAX_ATTACHMENTS, PATH_NOTE, composeMessage, fileRefusal, readClipboard, typeOf,
} from "./attachments";
import type { Attachment, PasteOutcome } from "./attachments";
import { diffFilters, filtersLine, summariseFilters, valuesFromSetup, valuesFromSpec, withSaved } from "./liveFilters";
import { TRANSCRIPT_TAIL, orcClass, tailPadding } from "./agentLayout";
import { keepsDraft, slotsFor } from "./agentDraft";
import { AttachChips } from "./AttachChips";
import { BriefSignals } from "./BriefSignals";
import { refreshCampaign, refreshCampaignList, useCampaignRow, useCampaignRows } from "./campaignStore";
import { useMayChangeCampaign } from "./campaignRights";
import { useCampaignSpec } from "./specDraft";
import type { Conversation } from "./api/agent";
import { campaignById } from "./formKit";
import { CHAT_LIMIT, chatLength, chatNow, chatOver, newChat, onChatFocus, openChat, openChatFor, resumeChat, sendAction, sendMessage, useLiveChat } from "./liveChat";
import { DOUBTS_ASK, DOUBTS_LABEL, DOUBTS_SHOW } from "./memoryView";
import { showFromHash, withoutShow } from "./nav";
import { chatTitle, titleFromMessage, UNTITLED } from "./chatTitle";
import { tidySeed } from "./seedText";
import { useToast } from "./Contacts";
import { LiveTurnBody } from "./LiveTurn";
import { FormLinkChips } from "./FormLinkChip";
import { WatchList } from "./WatchList";
import type { Brief, Stat } from "./orchestrator";
import { homeOverview } from "./api/home";
import { getCandidate } from "./api/candidates";
import { candidateFromDetail, candidateFromMatch } from "./liveCandidate";
import type { CandidateSet } from "./liveCandidate";
import { matchFromProfile } from "./liveViews/compareLogic";
import { campaignIds, campaignOfCandidate, candidateById, clearSets, getSet, setOfCandidate, updateCandidate, useCandidateSets } from "./liveCandidates";
import { LiveMomentProvider } from "./liveViews/LiveMoment";
import { PassReasonDialog } from "./PassReason";
import { useRailConfig } from "./useRailConfig";
import "./agentHero.css";
import "./chat.css";

/**
 * Agent — brief the agent, and everything it has run.
 *
 * ── WHY THIS IS ITS OWN PAGE ────────────────────────────────────────────────
 * The composer, the transcript and the rail of past briefs used to sit on Home
 * beneath the bento. That framed the agent as one more widget on a dashboard,
 * and it gave Home two unrelated jobs: survey a campaign, and hold a
 * conversation. Those have different shapes — a survey is scanned, a
 * conversation is worked — and they were competing for one viewport.
 *
 * It is product-level rather than campaign-level for the same reason its route
 * moved: the agent is what you brief about ANY campaign, and the conversation,
 * the briefs you have run and the channels it may speak on are not properties
 * of one req.
 *
 * Home surveys. This page works.
 */

const EMPTY: Values = {};

type Turn = {
  id: number;
  /** What the recruiter sent. */
  said: string;
  /** Started by a press (an answer on a card, a button): there is no message of the recruiter's to show, and the reply carries on from the card above. */
  quiet?: boolean;
  mode: ModeId;
  /** Which stage the agent is on, or -1 once it has answered. */
  stage: number;
  /** For the truthful "Thought for Ns" line — measured, never invented. */
  startedAt: number;
  thoughtMs: number | null;
  /**
   * Which reply shape this turn gets.
   *
   * Assigned at send and never recomputed, so a turn does not change kind
   * under the user on a re-render. It cycles, because there is no backend to
   * decide: successive sends walk prose -> question -> artefact so all three
   * are reachable. When a real agent picks the shape, this field is where its
   * answer lands and the cycling is the only thing that goes.
   */
  replyIndex: number;
  /**
   * Which moment this turn is: `sourcing` gets the full run (phases, a
   * search to confirm, profiles); `reply` gets a canned reply; everything
   * else is a Moment. Decided at send, like `replyIndex`.
   */
  kind: MomentKind;
  /** Connected chats: the server-backed turn this one draws. */
  liveKey?: string;
};

/** A chat as the rail lists it. */
function briefOf(c: Conversation): Brief {
  const mins = (Date.now() - Date.parse(c.updatedAt)) / 60_000;
  const when =
    mins < 60 ? `${Math.max(1, Math.round(mins))}m`
    : mins < 1440 ? `${Math.round(mins / 60)}h`
    : mins < 2880 ? "Yesterday"
    : mins < 10_080 ? `${Math.round(mins / 1440)}d`
    : `${Math.round(mins / 10_080)}w`;
  return { id: c.id, title: chatTitle(c.title), campaign: c.focusCampaignName ?? "", when, mode: "agent" };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Agent({
  campaign, campaignIsCurrent = false, inOrg = false, handoff, handoffSend = false, onHandoffTaken, chatFor = null, onChatForTaken, onOpenForm, onOpenCampaign, onFocusCampaign, onNewChat,
}: {
  /** Leaves the chat for a campaign, making it current. */
  onOpenCampaign?: (campaignId: string) => void;
  /** The chat moved to a campaign as it went (one it just made, or one chosen): the page makes it current, staying where it is. */
  onFocusCampaign?: (campaignId: string, name: string) => void;
  /** A fresh chat was started: the page no longer treats the campaign it was on as in focus. */
  onNewChat?: () => void;
  /** Send the handoff at once instead of leaving it in the composer. */
  handoffSend?: boolean;
  /** Arrived from a campaign (its task, a link, its page): the chat to be in is that campaign's own, not the last one open. */
  chatFor?: string | null;
  /** Called once that chat is open, so the choice is made exactly once. */
  onChatForTaken?: () => void;
  campaign: Campaign;
  /** Whether the recruiter picked or visited `campaign` this session. The
      console always has a default campaign; only a chosen one is assumed. */
  campaignIsCurrent?: boolean;
  /** Connected, whether the workspace is an organisation (it has a team to show and invite to). */
  inOrg?: boolean;
  /** Leaves the chat for a form in the builder. */
  onOpenForm?: (campaignId: string, formId: string, view: FormView) => void;
  /**
   * A prompt sent here from another page — a bento tile, a task, a header
   * question. Null when the user navigated directly.
   */
  handoff: string | null;
  /** Called once the handoff is in the field, so it is consumed exactly once. */
  onHandoffTaken: () => void;
}) {
  const [mode, setMode] = useState<ModeId>("sourcing");
  /* ── THE DRAFT LIVES IN THE COMPOSER, NOT HERE ──
     It was state on this component, so every keystroke re-rendered the whole
     page — the transcript with every moment in it, the rail, the live band —
     to change one textarea. Measured: 24ms per key on an empty page, 32ms
     with a conversation, spikes to 296ms. The composer now owns its text and
     exposes it through this handle, which the page reads only when it needs
     the text (on send) or sets it (seeding a suggestion). */
  const draftApi = useRef<ComposerHandle>({ get: () => "", set: () => {} });
  /* The job description and the filters the composer carries into a search. */
  const [jd, setJd] = useState<Jd | null>(null);
  const [filters, setFilters] = useState<Values>({});
  const [jdOpen, setJdOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState<{ initial: Values; prefilled: readonly string[] } | null>(null);
  const openFilters = useCallback((text: string) => {
    const brief = fromBrief(text);
    const fresh = Object.keys(brief).filter((k) => !(k in filters));
    setFiltersOpen({ initial: { ...brief, ...filters }, prefilled: fresh });
  }, [filters]);
  /* The thread survives leaving the chat (for the form builder, say) and
     coming back: it is restored from the session, every restored turn
     already answered. */
  const [restored] = useState<ReadonlySet<number>>(() => new Set(savedTurns().map((t) => t.id)));
  /* Connected: a turn that began before this visit is a restored one, so its answered questions replay. */
  const mountedAt = useRef(Date.now());
  const [turns, setTurns] = useState<Turn[]>(() => savedTurns().map((t) => ({
    ...t, mode: t.mode as ModeId, kind: t.kind as MomentKind, stage: -1,
  })));
  /* Connected: the transcript is the server's chat, replayed from its events. */
  const live = useLiveChat();
  /* A campaign this page has no real id for (a fixture, nothing chosen) names no chat. */
  const chatForId = chatFor && UUID.test(chatFor) ? chatFor : null;
  useEffect(() => {
    // Arriving for a campaign opens its chat (below); otherwise the tab picks up the chat it had.
    if (LIVE && !chatForId) void resumeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!chatFor) return;
    if (!LIVE || !chatForId) { onChatForTaken?.(); return; }
    void openChatFor(chatForId).finally(() => onChatForTaken?.());
  }, [chatFor, chatForId, onChatForTaken]);
  useEffect(() => (LIVE && onFocusCampaign ? onChatFocus(onFocusCampaign) : undefined), [onFocusCampaign]);
  /* A task that counts the notes the agent is unsure about opens the Agent with "?show=memory-doubts": the card of
     them is asked for quietly (no message of the person's, no model turn) in the chat they were in. The link is
     spent at once, so a second pass (or the page drawn twice) asks nothing more. */
  useEffect(() => {
    if (!LIVE) return undefined;
    const open = () => {
      if (showFromHash(window.location.hash) !== DOUBTS_SHOW) return;
      history.replaceState(null, "", withoutShow(window.location.hash));
      void (chatNow().conversationId ? Promise.resolve() : resumeChat()).then(() => { sendAction(DOUBTS_ASK, DOUBTS_LABEL); });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  const liveTurns = useMemo<Turn[]>(
    () =>
      live.turns.map((lt, i) => ({
        id: i + 1, said: lt.said, mode: "agent", stage: -1, startedAt: lt.startedAt, thoughtMs: null,
        replyIndex: 0, kind: "reply", liveKey: lt.key, ...(lt.quiet ? { quiet: true } : {}),
      })),
    [live.turns],
  );
  const shown = LIVE ? liveTurns : turns;
  /* The rail's week, from the server's home overview. Gains only: a dip is not news. */
  /* A search that starts, brings its first people or ends moves "Found": the week is read again for each. */
  const searchSig = live.turns
    .flatMap((t) => t.searches.map((x) => `${x.runId}:${x.status}:${(x.items?.length ?? 0) > 0 ? "people" : "none"}`))
    .join("|");
  const [week, setWeek] = useState<readonly Stat[]>([]);
  const [weekState, setWeekState] = useState<"loading" | "failed" | "ready">("loading");
  const [weekAsk, setWeekAsk] = useState(0);
  useEffect(() => {
    if (!LIVE) return;
    let current = true;
    homeOverview(7)
      .then((h) => {
        if (!current) return;
        const gain = (p: { current: number; previous: number }) => Math.max(0, p.current - p.previous);
        setWeek([
          { id: "found", label: "Found", value: h.found.current, hue: "violet", delta: gain(h.found), spark: h.found.series.map((d) => d.count) },
          { id: "replies", label: "Replies", value: h.replies.current, hue: "blue", delta: gain(h.replies), spark: [] },
          { id: "interviews", label: "Interviews", value: h.interviews.current, hue: "sage", delta: gain(h.interviews), spark: [] },
        ]);
        setWeekState("ready");
      })
      /* A refresh that fails after the week was shown keeps what is on screen; only a
         week that never arrived says so. */
      .catch(() => { if (current) setWeekState((s) => (s === "ready" ? s : "failed")); });
    return () => {
      current = false;
    };
  }, [live.turns.length, weekAsk, searchSig]);
  /* What the agent just did moves these numbers: read them again behind what is shown. */
  useEffect(() => onInvalidate((effects) => {
    if (effects.has("pipeline") || effects.has("campaign") || effects.has("candidates") || effects.has("sourcing")) setWeekAsk((n) => n + 1);
  }), []);
  /* Past chats for the rail, refreshed whenever a chat starts or changes. The server names a chat when
     its first message lands and moves it up when a turn ends, so those two are read again too. */
  const sentCount = live.turns.filter((t) => t.runId !== null).length;
  const settledCount = live.turns.filter((t) => t.status === "done" || t.status === "failed").length;
  const [chats, setChats] = useState<readonly Brief[] | undefined>(undefined);
  const [chatsFailed, setChatsFailed] = useState(false);
  const [chatsAsk, setChatsAsk] = useState(0);
  useEffect(() => {
    if (!LIVE) return;
    let current = true;
    agentApi
      .conversations()
      .then(({ conversations }) => {
        if (!current) return;
        setChats(conversations.map(briefOf));
        setChatsFailed(false);
      })
      .catch(() => current && setChatsFailed(true));
    return () => {
      current = false;
    };
  }, [live.conversationId, live.turns.length, sentCount, settledCount, chatsAsk]);
  /* The open chat is named from its first message at once, rather than "New chat" until the server's own
     name is read; that name replaces this one on the next read. */
  const railChats = useMemo<readonly Brief[] | undefined>(() => {
    const id = live.conversationId;
    const first = live.turns[0]?.said;
    if (!LIVE || !chats || !id || !first) return chats;
    const mine = chats.find((c) => c.id === id);
    if (!mine) return [{ id, title: titleFromMessage(first), campaign: "", when: "1m", mode: "agent" }, ...chats];
    return mine.title === UNTITLED ? chats.map((c) => (c.id === id ? { ...c, title: titleFromMessage(first) } : c)) : chats;
  }, [chats, live.conversationId, live.turns]);
  /* ── SEARCHING PAST CHATS ──
     The search button under the composer and "/" open the History dialog, which is where chats are
     searched and opened (⌘K stays the console's quick find, wherever focus is). Connected, the chats are
     read before the dialog has anything to search: if they have not arrived, or failed, they are asked
     for again and the dialog opens when they land, for a few seconds, so a late answer does not open it
     under someone who has moved on. */
  const [findAsk, setFindAsk] = useState(0);
  const findUntil = useRef(0);
  const openFind = useCallback(() => {
    if (LIVE && !railChats) {
      findUntil.current = Date.now() + 5000;
      if (chatsFailed) setChatsAsk((n) => n + 1);
      return;
    }
    setFindAsk((n) => n + 1);
  }, [railChats, chatsFailed]);
  useEffect(() => {
    if (railChats && findUntil.current > Date.now()) {
      findUntil.current = 0;
      setFindAsk((n) => n + 1);
    }
  }, [railChats]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.defaultPrevented) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      /* A slash typed into a field is a slash; so is one meant for a dialog that is already open. */
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      openFind();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFind]);
  /* Which three ideas the row under the composer shows: the next three each visit and each new chat. */
  const [visit, setVisit] = useState(nextVisit);
  useEffect(() => {
    /* Connected, the transcript is the server's: the local thread is empty and must not wipe the answered questions kept per turn. */
    if (LIVE) return;
    saveTurns(turns.map(({ id, said, mode, kind, replyIndex, thoughtMs, startedAt }) => ({ id, said, mode, kind, replyIndex, thoughtMs, startedAt })));
  }, [turns]);
  /* ── THE CAMPAIGN'S JOB DESCRIPTION AND FILTERS, LIVE ──
     The prototype's two dialogs, on the campaign in focus. The description goes to the agent as a message
     (its own job description flow: read, role spec, approve, search, narrated under the turn); the filters
     are saved on the campaign and read by its next search, over the role spec. A person who only follows the
     campaign sees both and changes neither. */
  const liveCampaignId = LIVE && campaignIsCurrent && UUID.test(campaign.id) ? campaign.id : "";
  const liveSpec = useCampaignSpec(liveCampaignId);
  const liveRow = useCampaignRow(liveCampaignId);
  const mayChange = useMayChangeCampaign(liveCampaignId || null);
  const toast = useToast();
  const [liveFiltersOpen, setLiveFiltersOpen] = useState(false);
  const focused = liveCampaignId !== "";
  /* With no campaign in focus the job description and the filters are for the NEXT message: the description is
     attached to it (and starts a campaign), the filters go with it as a line and are saved on the campaign it
     makes. They show as chips in the composer until sent. */
  const [nextJd, setNextJd] = useState<Jd | null>(null);
  const [nextFilters, setNextFilters] = useState<Values>({});
  const next = useRef({ jd: nextJd, filters: nextFilters, focused });
  next.current = { jd: nextJd, filters: nextFilters, focused };
  const [filtersFocus, setFiltersFocus] = useState<{ category: string; n: number } | null>(null);
  const [liveFiltersInit, setLiveFiltersInit] = useState<{ initial: Values; prefilled: readonly string[] }>({ initial: {}, prefilled: [] });
  const onLiveJd = useCallback(() => setJdOpen(true), []);
  const specNow = liveSpec.approved ?? liveSpec.latest;
  const filtersBase = useMemo<Values>(
    () => (specNow ? valuesFromSpec(specNow.spec) : valuesFromSetup(liveRow?.setup)),
    [specNow, liveRow?.setup],
  );
  const filtersNow = useMemo<Values>(
    () => withSaved(filtersBase, liveRow?.setup?.filters as Values | undefined),
    [filtersBase, liveRow?.setup?.filters],
  );
  const liveJdText = (specNow?.jdText ?? liveRow?.setup?.jd ?? "").trim();
  const liveJd = useMemo<Jd | null>(() => (liveJdText ? jdFromText("Job description", liveJdText) : null), [liveJdText]);
  /* Opens the filters on the campaign in focus, or for the next one. Pre-filled from what the brief already
     says (`fromBrief`), and scrolled to the group that was asked for. */
  const openLiveFilters = useCallback((text: string, category?: string) => {
    if (focused) setLiveFiltersInit({ initial: filtersNow, prefilled: [] });
    else {
      const brief = fromBrief([text, nextJd?.text ?? ""].join("\n"));
      const fresh = Object.keys(brief).filter((k) => !(k in nextFilters));
      setLiveFiltersInit({ initial: { ...brief, ...nextFilters }, prefilled: fresh });
    }
    setFiltersFocus(category ? { category, n: Date.now() } : null);
    setLiveFiltersOpen(true);
  }, [focused, filtersNow, nextJd, nextFilters]);
  const onLiveFilters = useCallback(() => openLiveFilters(""), [openLiveFilters]);
  const nextFiltersWords = useMemo(() => summariseFilters(nextFilters), [nextFilters]);
  const slots = slotsFor({
    focused, campaignJd: liveJd, campaignFilters: activeCount(filtersNow),
    nextJd, nextFilters: activeCount(nextFilters),
  });
  /* The draft is one conversation's: moving to another chat (or to a new one) empties the composer, the slots
     and the strip. The first resume of the chat on arrival, and the first message making its conversation,
     keep what is there. */
  const seenConversation = useRef<string | null>(null);
  useEffect(() => {
    if (!LIVE) return;
    const prev = seenConversation.current;
    seenConversation.current = live.conversationId;
    if (keepsDraft(prev, live.conversationId)) return;
    draftApi.current.set("");
    setNextJd(null);
    setNextFilters({});
  }, [live.conversationId]);
  const config = useRailConfig(
    campaign, campaignIsCurrent, inOrg,
    LIVE ? { onJd: onLiveJd, onFilters: onLiveFilters, next: { jd: nextJd !== null, filters: nextFiltersWords } } : undefined,
  );
  /* Filters that were set for the next campaign are saved on it once it exists: the list of campaigns is read
     again while they wait, and the first campaign that was not there when the message went is theirs. */
  const allRows = useCampaignRows();
  const pendingFilters = useRef<{ values: Values; known: ReadonlySet<string>; at: number } | null>(null);
  const allRowsRef = useRef(allRows);
  allRowsRef.current = allRows;
  const [watching, setWatching] = useState(false);
  useEffect(() => {
    const p = pendingFilters.current;
    if (!p) return;
    if (Date.now() - p.at > 30 * 60_000) { pendingFilters.current = null; setWatching(false); return; }
    const made = allRows.find((r) => !p.known.has(r.id) && UUID.test(r.id));
    if (!made) return;
    pendingFilters.current = null;
    setWatching(false);
    filtersApi.save(made.id, p.values).then(
      () => { refreshCampaign(made.id); toast(`Filters saved on ${made.name}. Its searches use them.`, "done"); },
      () => toast(`Couldn't save the filters on ${made.name}. Set them from the Filters row.`, "error"),
    );
  }, [allRows, toast]);
  useEffect(() => {
    if (!watching) return;
    const id = window.setInterval(() => refreshCampaignList(), 6000);
    return () => window.clearInterval(id);
  }, [watching]);
  /* Archiving is quiet and can be taken back: the chat leaves the list and a toast offers it again. */
  const archiveChat = useCallback(
    (id: string) =>
      api("PATCH", `/v1/conversations/${id}`, { archived: true }).then(() => {
        setChatsAsk((n) => n + 1);
        toast("Chat archived", "done", {
          label: "Undo",
          onClick: () => {
            api("PATCH", `/v1/conversations/${id}`, { archived: false }).then(
              () => setChatsAsk((n) => n + 1),
              () => toast("Couldn't bring that chat back. Try again.", "error"),
            );
          },
        });
      }),
    [toast],
  );
  const [activeBrief, setActiveBrief] = useState<string | null>(null);
  /* Shortlist and reject, shared by the transcript's cards, the ranked list
     and every profile, so a verdict made in one place shows in all three. */
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  /* The ranked list (a dialog in the middle) and the profile (a sidebar) are
     separate surfaces with separate state. The profile remembers which list
     its arrows walk: every match from the transcript, or whatever the
     dialog's current filter shows. */
  /* Answers the recruiter asked the agent to remember, for this session. */
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const setPref = useCallback((key: string, value: string) => {
    setPrefs((p) => {
      const next = { ...p };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }, []);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [profile, setProfile] = useState<{ id: string; ids: readonly string[] } | null>(null);
  /* Connected: the ranked list belongs to one campaign's matches, and shortlisting or passing
     is a call to the server, with the reason for a pass asked first. */
  const [listCampaign, setListCampaign] = useState<string | null>(null);
  const [passing, setPassing] = useState<string | null>(null);
  const sets = useCandidateSets();
  const setVerdict = useCallback((id: string, v: Verdict | null) => {
    setVerdicts((all) => {
      const next = { ...all };
      if (v) next[id] = v;
      else delete next[id];
      return next;
    });
  }, []);
  const onVerdict = useCallback((id: string, v: Verdict | null) => {
    if (!LIVE) return setVerdict(id, v);
    const cid = campaignOfCandidate(id);
    if (!cid) return;
    if (v === "shortlisted") {
      setVerdict(id, v);
      agentApi.shortlist(cid, [id]).catch(() => setVerdict(id, null));
    } else if (v === "rejected") setPassing(id);
    // Undoing isn't offered by the server for a shortlist or a pass, so a press on a decided person changes nothing.
  }, [setVerdict]);
  const passWith = useCallback((reason: string | undefined) => {
    const id = passing;
    setPassing(null);
    const cid = id ? campaignOfCandidate(id) : null;
    if (!id || !cid) return;
    setVerdict(id, "rejected");
    agentApi.reject(cid, [id], reason).catch(() => setVerdict(id, null));
  }, [passing, setVerdict]);
  /* What was already decided about the people in view, from the server, once per campaign, and again whenever
     something is written about people (a shortlist or a rejection made in another card, the sheet, or by the agent):
     every card that shows a person then shows what was decided. */
  const decidedFor = useRef(new Set<string>());
  const readDecisions = useCallback((cid: string) => {
    agentApi.decisions(cid).then((d) => {
      setVerdicts((all) => {
        const next = { ...all };
        for (const id of d.passed) next[id] = "rejected";
        for (const id of d.shortlisted) next[id] = "shortlisted";
        return next;
      });
    }).catch(() => decidedFor.current.delete(cid));
  }, []);
  useEffect(() => onInvalidate((effects, campaigns) => {
    if (!LIVE || !(effects.has("pipeline") || effects.has("candidates"))) return;
    /* The campaign that was written to, whether or not a card of this chat is about it (an earlier card of found people has
       no campaign of its own, and shows a shortlist or a pass made elsewhere all the same), and every campaign in view. */
    const written = [...campaigns].filter((c): c is string => c !== null);
    const ids = new Set(campaigns.has(null) ? [...campaignIds(), ...written] : [...written, ...campaignIds()]);
    for (const cid of ids) readDecisions(cid);
  }), [readDecisions]);
  useEffect(() => {
    if (!LIVE) return;
    for (const cid of campaignIds()) {
      if (decidedFor.current.has(cid)) continue;
      decidedFor.current.add(cid);
      readDecisions(cid);
    }
  }, [sets]);
  /* The full profile of whoever is open: the list gives the header and the fit, this the history. */
  useEffect(() => {
    if (!LIVE || !profile) return;
    const set = setOfCandidate(profile.id);
    if (!set) return;
    let current = true;
    /* Someone already on a board or found by name: their own candidate row has the history. A person a search found
       (not in the workspace) is read from the campaign's match, whichever set holds them. */
    if (candidateById(profile.id)?.inWorkspace === true || !set.campaignId) {
      getCandidate(profile.id).then((d) => { if (current) updateCandidate(candidateFromDetail(d)); }).catch(() => {});
      return () => { current = false; };
    }
    const cid = set.campaignId;
    agentApi.matchProfile(cid, profile.id).then((mp) => {
      const base = set.candidates.find((c) => c.id === profile.id);
      if (!current || !base) return;
      updateCandidate(candidateFromMatch(
        { ...matchFromProfile(profile.id, mp), fullName: base.name, headline: base.headline, stage: mp.stage ?? "judged" },
        { criteria: set.criteria, profile: mp, campaignId: cid },
      ));
    }).catch(() => {});
    return () => { current = false; };
  }, [profile?.id]);
  const liveSet: CandidateSet | null = LIVE && listCampaign ? getSet(listCampaign) : null;
  const idsOfSetWith = (id: string): readonly string[] => {
    const cid = campaignOfCandidate(id);
    return (cid ? getSet(cid)?.candidates.map((c) => c.id) : null) ?? [id];
  };
  const nextId = useRef(Math.max(0, ...savedTurns().map((t) => t.id)) + 1);
  /* Whether the transcript follows new content, the follower's frame, and
     the log's last scroll position. See `nudge`. */
  const pinned = useRef(true);
  const follow = useRef(0);
  const lastTop = useRef(0);
  const streamRef = useRef<HTMLDivElement>(null);
  /* The transcript's own scrollport — the composer sits outside it. */
  const logRef = useRef<HTMLDivElement>(null);
  /* The composer's outer block, so the send can FLIP it from where it rests
     to where it docks. */
  const composerRef = useRef<HTMLDivElement>(null);

  /* ── THE SEND IS A JOURNEY, AND THIS IS WHAT IT NEEDS TO MEASURE ──
     Sending the first brief moves the composer 601px down the page — measured
     — and for every revision up to this one that move happened in ONE FRAME.
     Its height eased over 480ms and its shape morphed underneath it while the
     whole block teleported to the dock, which is why the interaction kept
     reading as snappy no matter how the durations were tuned: the largest
     motion on screen was not being animated at all.

     `flipFrom` is the composer's viewport top read immediately BEFORE the
     state change, and `exitAt` is where the heading block (the heading and
     the suggestion list) was sitting at that same instant. Both are refs rather than state: they
     are written during an event and consumed in the layout effect that runs
     from it, and a render in between would be a render showing the old
     layout. */
  const flipFrom = useRef<number | null>(null);
  /* The field's own height, and every control's position INSIDE the composer,
     both read at the same instant as `flipFrom`. The controls are stored
     relative to the composer rather than to the viewport: the composer is
     itself being translated, and a child of a translated parent that also
     carries its own viewport-delta would travel the distance twice. */
  const flipField = useRef<{ h: number; r: string } | null>(null);
  const flipKids = useRef<Map<Element, { x: number; y: number }> | null>(null);
  const exitAt = useRef<{ intro: number } | null>(null);
  /* True while the landing-state blocks are on their way out. They stay
     mounted for it — an element cannot be animated away after it has already
     been removed from the tree, which is why they used to vanish between one
     frame and the next while everything around them eased. */
  const [exiting, setExiting] = useState(false);

  /* Declared here rather than beside `contextFor` further down: the FLIP and
     the autosize effect both key on it, and a `const` below them is a
     use-before-declaration. It is derived, not state — `turns` is the single
     source of truth for whether a conversation exists. */
  const started = shown.length > 0;
  const sendRef = useRef<HTMLButtonElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  /* Where the mark flew from, so the new turn can FLIP it into place. Cleared
     once consumed — a stale origin would make a later turn fly in from a
     button that has since moved. */
  const [flight, setFlight] = useState<{ id: number; x: number; y: number } | null>(null);
  /* STABLE, and that is load-bearing. As an inline arrow this changed identity
     on every Agent render, so the turn's flight effect re-ran — and its cleanup
     cancelled the animation mid-flight. Measured: the mark reported zero
     animations and the flight never appeared. */
  const clearFlight = useCallback(() => setFlight(null), []);

  /**
   * What every tile, task and header action does: put a concrete brief in the
   * composer and hand over the caret.
   *
   * Deliberately NOT auto-sending. A suggestion the product wrote is a starting
   * point, and firing it off on one click takes the edit away at the exact
   * moment the recruiter knows something the suggestion does not.
   */
  const seed = useCallback((raw: string) => {
    const prompt = tidySeed(raw);
    draftApi.current.set(prompt);
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    /* Caret to the end rather than selecting the text: a selection means the
       next keystroke destroys the suggestion, which is the opposite of handing
       someone a draft. After a frame, because the composer commits the new
       text on its own render. */
    requestAnimationFrame(() => {
      const n = el.value.length;
      el.setSelectionRange(n, n);
    });
  }, []);

  /* Hovering an idea previews it in the empty composer as ghost text. */
  const [preview, setPreview] = useState<string | null>(null);

  /* ── PICKING AN IDEA TYPES IT IN ──
     Rather than the whole sentence appearing at once, it writes itself into
     the composer over a fraction of a second, so the hand-off from card to
     field is something you watch happen. Only the composer re-renders per
     frame. Reduced motion gets the plain seed. */
  const typing = useRef(0);
  const seedTyped = useCallback((raw: string) => {
    const prompt = tidySeed(raw);
    cancelAnimationFrame(typing.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { seed(prompt); return; }
    const el = areaRef.current;
    el?.focus();
    const t0 = performance.now();
    const dur = Math.min(650, prompt.length * 12);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      draftApi.current.set(prompt.slice(0, Math.round(prompt.length * k)));
      if (k < 1) typing.current = requestAnimationFrame(step);
      else requestAnimationFrame(() => { const n = el?.value.length ?? 0; el?.setSelectionRange(n, n); });
    };
    typing.current = requestAnimationFrame(step);
  }, [seed]);

  /**
   * Agents deployed in this session, newest first.
   *
   * Owned here because two things deploy: the timeline's empty pipeline slot,
   * and SENDING A BRIEF — which is what the composer does, two levels above
   * the band that shows the result. Frontend-only, which is what makes the
   * band's entrance animation honest: deploying really adds a row, so the
   * motion reports a state change rather than playing an effect.
   */
  const [deployed, setDeployed] = useState<readonly Deployed[]>([]);

  const deploy = useCallback(
    (role: PipelineRole, name: string, id: CampaignKey): string => {
      const deployedAt = Date.now();
      const key = `${id}:${role}:${deployedAt}`;
      setDeployed((d) => [
        { key, role, campaign: name, campaignId: id, deployedAt },
        ...d,
      ]);
      return key;
    },
    [],
  );

  /* Undo for a deploy made from the conversation (the dispatch receipt). */
  const undeploy = useCallback((key: string) => {
    setDeployed((d) => d.filter((x) => x.key !== key));
  }, []);

  const send = useCallback(() => {
    const bulk = draftApi.current.bulk?.() ?? null;
    if (bulk) stashImport(bulk);
    const said = bulk ? "Add roles in bulk" : draftApi.current.get().trim();
    if (!said) return;
    /* Too long for the agent: the composer says by how much and has Send off, and Enter does the same. */
    if (LIVE && chatOver(said)) return;

    /* ── MEASURE THE OLD LAYOUT WHILE IT IS STILL THE LAYOUT ──
       Only on the FIRST send: that is the one that rearranges the page. Every
       later send leaves the composer exactly where it is, and running a FLIP
       with a zero delta would be 480ms of nothing.

       `offsetTop` for the two departing blocks rather than a viewport rect —
       they are re-anchored against their own offset parent on the way out, so
       an offset is the number that survives them leaving the flow. */
    if (shown.length === 0) {
      const root = composerRef.current;
      if (root) {
        const box = root.getBoundingClientRect();
        flipFrom.current = box.top;
        const f = root.querySelector(".orc-composer-field");
        flipField.current = f
          ? { h: f.getBoundingClientRect().height, r: getComputedStyle(f).borderRadius }
          : null;
        /* Every control that ends up somewhere else. The modes and slots
           travel from under the text to beside it; the send button slides up
           the field's right edge as the field collapses around it. */
        const kids = new Map<Element, { x: number; y: number }>();
        root.querySelectorAll(".orc-mode, .orc-slots .orc-gslot, .orc-send").forEach((kid) => {
          const r = kid.getBoundingClientRect();
          kids.set(kid, { x: r.left - box.left, y: r.top - box.top });
        });
        flipKids.current = kids;
      }
      const intro = streamRef.current?.querySelector<HTMLElement>(".orc-intro");
      exitAt.current = { intro: intro?.offsetTop ?? 0 };
      setExiting(true);
    }
    /* Optimistic: the turn is on screen before anything else happens. Standard
       practice for a composer and worth 100-300ms of perceived latency even
       when, as here, there is no request to wait for. */
    const id = LIVE ? shown.length + 1 : nextId.current++;
    /* Measured BEFORE the state change, because sending empties the composer
       and the button can shift as the field collapses back to one row. */
    const r = sendRef.current?.getBoundingClientRect();
    if (r) setFlight({ id, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    if (LIVE) {
      pinned.current = true;
      /* A campaign the recruiter picked travels with the message; otherwise the
         server works out which one is meant from the text and the chat. */
      sendMessage(said, campaignIsCurrent && UUID.test(campaign.id) ? campaign.id : undefined);
      draftApi.current.set("");
      /* What was set for "the next message" went with it. The filters are saved on the campaign it makes. */
      if (!next.current.focused) {
        const set = next.current.filters;
        if (activeCount(set) > 0) {
          pendingFilters.current = {
            values: Object.fromEntries(Object.entries(set).filter(([id, v]) => activeCount({ [id]: v }) > 0)),
            known: new Set(allRowsRef.current.map((r) => r.id)),
            at: Date.now(),
          };
          setWatching(true);
        }
        setNextJd(null);
        setNextFilters({});
      }
      return;
    }
    const kind = classify(said);
    pinned.current = true;
    setTurns((t) => [
      ...t,
      {
        id, said, mode, stage: kind === "reply" ? 0 : -1, startedAt: Date.now(), thoughtMs: null,
        replyIndex: (id - 1) % REPLIES[mode].length,
        kind,
      },
    ]);
    draftApi.current.set("");

    /* ── SENDING A BRIEF DEPLOYS AN AGENT ──
       This is the link the band was missing: you write a brief, an agent goes
       to work on it, and it appears at the foot of the page. The role follows
       the MODE, because that is what the two modes mean — `sourcing` puts a
       Sourcing agent on the campaign, `agent` puts the orchestrator's own
       Outreach agent on it. Nothing invented: the role, the campaign and the
       first step all come from what was already selected. */
    /* `campaign.id` is a `string` on the workspace type while the orchestrator
       keys on a union. The two id spaces were unified deliberately, so the
       value is right and only the TYPE is loose — narrowed against the real
       key list rather than asserted, so a workspace that ever carries an id
       the orchestrator does not know simply does not deploy, instead of
       deploying into a campaign that has no fixtures. */
    /* A sourcing run deploys its agent itself, once its plan is ready — see
       `deploySourcing` — so the band reports the agent when it actually has
       a search to run rather than the instant the brief was typed. */
    const key = SCOPED.find((k) => k === campaign.id);
    if (key && kind === "reply") deploy(mode === "sourcing" ? "Sourcing" : "Outreach", campaign.name, key);
  }, [mode, deploy, campaign, campaignIsCurrent, shown.length]);

  const sendNow = useRef(send);
  sendNow.current = send;

  /* A button that names what it does ("Ask for times", "Find the drop-off") acts: its words go as a message,
     as if typed, rather than waiting as a draft that has to be found and sent. */
  const sendText = useCallback((raw: string, forCampaign?: string) => {
    const said = tidySeed(raw).trim();
    if (!said) return;
    if (!LIVE || chatOver(said)) { seed(raw); return; }
    pinned.current = true;
    sendMessage(said, forCampaign ?? (campaignIsCurrent && UUID.test(campaign.id) ? campaign.id : undefined));
  }, [seed, campaign, campaignIsCurrent]);

  /* The job description from the dialog goes to the agent as the message, so the same flow a pasted one starts
     runs: it is read, the role spec drafted and approved, and the search begins, each step shown under the turn. */
  const sendJd = useCallback((jd: Jd) => {
    const att: Attachment = {
      id: "jd", name: jd.name, origin: "file", size: jd.text.length, status: "ready", text: jd.text, docKind: "job_description",
    };
    const { text } = composeMessage("", [att], { campaignName: campaign.name });
    if (!text) return;
    pinned.current = true;
    sendMessage(text, liveCampaignId || undefined);
  }, [campaign.name, liveCampaignId]);
  const readJdFile = useCallback(
    (file: File) => attachmentApi.read(file, typeOf(file)).then((r) => r.text),
    [],
  );

  const saveFilters = useCallback(
    (values: Values) =>
      filtersApi.save(liveCampaignId, diffFilters(filtersBase, values)).then(() => {
        refreshCampaign(liveCampaignId);
        toast("Filters saved. The next search uses them.", "done");
      }),
    [liveCampaignId, filtersBase, toast],
  );

  /* ── A FILE DROPPED ANYWHERE ON THE PAGE, OR PASTED, IS ATTACHED ──
     The composer holds the attachments; these listeners only hand it what arrived. A dialog that is open
     keeps its own drops (the job description's), and nothing here lets the browser open a dropped file. */
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!LIVE) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const modal = () => !!document.querySelector('[role="dialog"][aria-modal="true"]');
    const enter = (e: DragEvent) => { if (hasFiles(e) && !modal()) { depth += 1; setDragging(true); } };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = modal() ? "none" : "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!hasFiles(e)) return;
      const handled = e.defaultPrevented;
      e.preventDefault();
      if (handled || modal()) return;
      draftApi.current.attach?.(Array.from(e.dataTransfer?.files ?? []));
    };
    const paste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || modal()) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const out = readClipboard(e.clipboardData);
      if (out.kind === "text") return;
      e.preventDefault();
      draftApi.current.paste?.(out);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    document.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      document.removeEventListener("paste", paste);
    };
  }, []);

  const deploySourcing = useCallback(() => {
    const key = SCOPED.find((k) => k === campaign.id);
    if (key) deploy("Sourcing", campaign.name, key);
  }, [deploy, campaign]);

  /* ── FOLLOWING THE BOTTOM OF THE TRANSCRIPT ──
     The log is the page's only scrollport: the shell is locked to the window
     at every size the two columns fit, and the composer sits under the log
     rather than floating over it. So "follow" means one thing, scrolling the
     log, and one mechanism does it.

     It used to be three: a smooth `scrollTo` on every `turns` change (which
     fires on each stage tick, whether or not the reader had scrolled away), a
     `nudge` from every moment that grew, and a ResizeObserver calling the
     same `nudge` — plus a page-scroll branch for windows under 1000px tall.
     Each restarted the others' smooth scroll from a new target, so the
     transcript stuttered down, overshot and settled back.

     Now there is one follower, a per-frame ease toward the bottom. Growth
     while it runs only moves its target, so a reply that arrives in steps
     still reads as one glide. It runs only while `pinned`: the reader is at
     (or within 64px of) the bottom. Scrolling up unpins it, coming back down
     re-pins it. Reduced motion jumps instead of easing.

     The bottom it follows to is TRANSCRIPT_TAIL (28px) under the newest line
     and that is all there is: no padding is held back for a turn that got
     shorter. A run finishing (its lines fold into one, the feed goes) or a
     card collapsing used to be "held" as up to ~250px of padding under the
     turn for as long as it was working and a beat after, which read as an
     empty band between the last message and the composer. Now the end of the
     transcript stays where the composer is and what is above it moves. */
  const pageGap = useCallback((): number => {
    const last = logRef.current?.querySelector(":scope > article.orc-turn:last-of-type");
    const comp = composerRef.current;
    if (!last || !comp) return 0;
    return last.getBoundingClientRect().bottom - (window.innerHeight - comp.offsetHeight) + TRANSCRIPT_TAIL;
  }, []);
  const nudge = useCallback(() => {
    if (!pinned.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* ── GROWTH OF A FEW LINES IS FOLLOWED AT ONCE, BEFORE IT IS PAINTED ──
       A phase line arriving or a card appearing is tens of pixels: easing toward it left the newest line
       closer than its clearance to the composer for a few frames. Called from the resize observer, which runs after
       layout and before paint, a small distance is closed on the spot, so no frame shows the newest line
       nearer than its clearance. Only a long jump (a whole answer arriving) glides. */
    const log0 = logRef.current;
    if (log0) {
      const paged0 = getComputedStyle(log0).overflowY === "visible";
      const d0 = paged0 ? pageGap() : log0.scrollHeight - log0.clientHeight - log0.scrollTop;
      if (d0 >= 1 && d0 <= 240) {
        if (paged0) window.scrollBy(0, d0);
        else { log0.scrollTop += d0; lastTop.current = log0.scrollTop; }
        return;
      }
    }
    if (follow.current) return;
    const step = () => {
      const log = logRef.current;
      if (!log || !pinned.current) { follow.current = 0; return; }
      /* Stacked under 1100px wide the page scrolls instead, with the
         composer stuck to the foot of the window: follow by bringing the
         end of the transcript to just above it. */
      const paged = getComputedStyle(log).overflowY === "visible";
      const d = paged ? pageGap() : log.scrollHeight - log.clientHeight - log.scrollTop;
      if (d < 1) { follow.current = 0; return; }
      const by = reduce || d <= 240 ? d : Math.max(1, Math.ceil(d * 0.18));
      if (paged) window.scrollBy(0, by);
      else { log.scrollTop += by; lastTop.current = log.scrollTop; }
      follow.current = requestAnimationFrame(step);
    };
    follow.current = requestAnimationFrame(step);
  }, [pageGap]);

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    /* ── ONLY THE READER UNPINS ──
       A card appearing or growing moves the layout, and the browser clamping the scroll position then looked like
       the reader moving up: the transcript stopped following and the newest card sat under the composer. The
       position-based unpin below now needs a gesture in the last second (wheel, touch, key, a press on the
       scrollbar), so only a reader who scrolled up on purpose is left where they are. */
    let gestureAt = 0;
    const gesture = () => { gestureAt = Date.now(); };
    const unpin = (e: WheelEvent | TouchEvent | KeyboardEvent) => {
      if (e instanceof WheelEvent && e.deltaY >= 0) return;
      if (e instanceof KeyboardEvent && !["ArrowUp", "PageUp", "Home"].includes(e.key)) return;
      gesture();
      pinned.current = false;
    };
    const onScroll = () => {
      const top = log.scrollTop;
      const d = log.scrollHeight - log.clientHeight - top;
      /* Near the bottom pins. Moving UP unpins, unless it is the browser
         clamping the position because content above got shorter — that
         leaves the reader at the bottom, which the first test catches. */
      /* A move up that lands exactly on the bottom is the browser clamping
         to content that just got shorter, not the reader. The position from
         before it is kept, because the resize handler puts it back. */
      if (top < lastTop.current - 1 && d < 1 && pinned.current) return;
      if (d < 64) pinned.current = true;
      else if (top < lastTop.current - 1 && Date.now() - gestureAt < 1000) pinned.current = false;
      lastTop.current = top;
    };
    /* The page-scrolling (stacked) layout's equivalent of `onScroll`. */
    let lastY = window.scrollY;
    const onPageScroll = () => {
      const y = window.scrollY;
      if (getComputedStyle(log).overflowY === "visible") {
        if (pageGap() < 64) pinned.current = true;
        else if (y < lastY - 1) pinned.current = false;
      }
      lastY = y;
    };
    log.addEventListener("wheel", unpin, { passive: true });
    log.addEventListener("touchmove", unpin, { passive: true });
    log.addEventListener("keydown", unpin);
    log.addEventListener("scroll", onScroll, { passive: true });
    log.addEventListener("pointerdown", gesture, { passive: true });
    window.addEventListener("scroll", onPageScroll, { passive: true });
    /* ── WHILE PINNED, AN EARLIER TURN CHANGING HEIGHT DOES NOT MOVE THE END ──
       An EARLIER turn changing height (a run still finishing after the
       next brief was sent) pushed everything below it down, and the
       follower then glided it back up. Its change is now absorbed in the
       scroll position before the frame is painted, so the bottom stays
       put.

       The NEWEST turn getting shorter is not given anything back. It used to
       be "held" as padding under the turn (so the form flow's collapsed
       card did not drop the transcript ~300px and lift it again), and that
       hold stayed for as long as the turn worked: a 200-250px empty band
       between the last message and the composer. The end of the log is the
       end of the log; what is above it moves.

       Reads the scroll position from before the change (`lastTop`): by the
       time this runs the browser may already have clamped it. */
    const heights = new WeakMap<Element, number>();
    const onResize = (entries: ResizeObserverEntry[]) => {
      const turns = log.querySelectorAll<HTMLElement>(":scope > article.orc-turn");
      const newest = turns[turns.length - 1];
      let above = 0;
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (!el.matches("article.orc-turn")) continue;
        const h = el.offsetHeight;
        const was = heights.get(el);
        heights.set(el, h);
        if (was === undefined) continue;
        if (el !== newest) above += h - was;
      }
      const live = log.closest(".orc-stream.is-live") !== null
        && getComputedStyle(log).overflowY !== "visible";
      if (live && pinned.current && above !== 0) {
        log.scrollTop = lastTop.current + above;
        lastTop.current = log.scrollTop;
      }
      nudge();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(log);
    const watchKids = () => Array.from(log.children).forEach((k) => ro.observe(k));
    watchKids();
    const mo = new MutationObserver(watchKids);
    mo.observe(log, { childList: true });
    return () => {
      log.removeEventListener("wheel", unpin);
      log.removeEventListener("touchmove", unpin);
      log.removeEventListener("keydown", unpin);
      log.removeEventListener("scroll", onScroll);
      log.removeEventListener("pointerdown", gesture);
      window.removeEventListener("scroll", onPageScroll);
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(follow.current);
      follow.current = 0;
    };
  }, [nudge, pageGap]);

  /* ── THE LOG ENDS TRANSCRIPT_TAIL ABOVE THE INPUT, WHATEVER THE INPUT HAS GROWN TO ──
     Beside the rail the composer is bottom-aligned in a dock of fixed height, so a taller input (a long message,
     attached files) rises into the foot of the log instead of pushing it up, and a dock with room to spare
     leaves some between them. The log's own bottom padding (`--log-tail`, 28px in chat.css) is what makes the
     distance from its last line to the input the same 28px in every case: this measures where the input's top
     is against the log's bottom edge and sets the padding that closes the difference.

     Measured in layout coordinates (offsetTop), which the composer's FLIP and a card's entrance cannot skew, and
     only where the log is the scrollport. Stacked under 1100px the page scrolls and the composer follows the
     log in the flow: there is nothing to measure, and the stylesheet's 28px stands. */
  useLayoutEffect(() => {
    const log = logRef.current;
    const comp = composerRef.current;
    if (!log || !comp || !started) return;
    const apply = () => {
      const paged = getComputedStyle(log).overflowY === "visible";
      let pad: string | null = null;
      if (!paged && log.offsetParent !== null && log.offsetParent === comp.offsetParent) {
        const inputTop = comp.offsetTop + (parseFloat(getComputedStyle(comp).paddingTop) || 0);
        pad = `${tailPadding(inputTop - (log.offsetTop + log.offsetHeight))}px`;
      }
      const was = log.style.getPropertyValue("--log-tail");
      if ((pad ?? "") === was) return;
      if (pad === null) log.style.removeProperty("--log-tail");
      else log.style.setProperty("--log-tail", pad);
      /* The end moved: the follower takes the reader there if they were at it. */
      nudge();
    };
    apply();
    if (typeof ResizeObserver === "undefined") {
      return () => log.style.removeProperty("--log-tail");
    }
    const ro = new ResizeObserver(apply);
    ro.observe(comp);
    ro.observe(log);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      log.style.removeProperty("--log-tail");
    };
  }, [started, nudge]);

  /* Walks the running turn through its stages, then answers. Intervals rather
     than one long timeout so each stage is legible, and cleared on unmount so
     a navigation mid-brief does not leave a timer writing into a dead tree. */
  useEffect(() => {
    const running = turns.find((t) => t.stage >= 0);
    if (!running) return;
    const id = window.setTimeout(() => {
      setTurns((ts) =>
        ts.map((t) => {
          if (t.id !== running.id) return t;
          const done = t.stage + 1 >= STAGES[t.mode].length;
          return {
            ...t,
            stage: done ? -1 : t.stage + 1,
            /* Recorded at the transition, so the figure the reply prints is the
               elapsed time that actually passed rather than a number chosen to
               look plausible. */
            thoughtMs: done ? Date.now() - t.startedAt : null,
          };
        }),
      );
    }, running.stage === 0 ? 420 : 620);
    return () => window.clearTimeout(id);
  }, [turns]);

  /* ── THE COMPOSER TRAVELS TO ITS DOCK ──
     A FLIP, and it has to be a LAYOUT effect: the browser must not paint the
     new position before the inverse transform is on the element, or the
     block is seen at the dock for one frame and then slides back up to
     animate down again — the classic FLIP flash.

     `translateY` only. The height is animated separately, by the autosize
     effect, on the same duration and curve; between them the composer glides
     down while it collapses into a bar, which is one gesture rather than two
     because the numbers agree. Transform never triggers layout, so this
     602px slide costs nothing per frame even while the transcript above it
     is reflowing into the space. */
  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    if (from === null) return;

    const el = composerRef.current;
    const field = el?.querySelector<HTMLElement>(".orc-composer-field");
    const kids = flipKids.current;
    const fieldWas = flipField.current;
    flipKids.current = null;
    flipField.current = null;
    if (!el || !field) return;

    /* ── EVERY MEASUREMENT FIRST, THEN EVERY ANIMATION ──
       Reading a rect after starting an animation would measure a value the
       first animation had already moved, so the whole final layout is
       sampled before anything is allowed to move. */
    const fieldNow = field.getBoundingClientRect().height;

    /* ── THE CONTROLS ARE MEASURED AGAINST THE ANIMATION'S FIRST FRAME ──
       Not its last, and the difference is what put them on top of the
       field's border mid-collapse.

       A FLIP normally measures the FINAL layout, because the final layout is
       where the element will be sitting for the whole animation. That is not
       true here: the field's height is itself animated, and in the live
       layout the controls are vertically CENTRED in it, so their position
       drifts continuously as the box shrinks. Measuring the end state and
       animating to it meant the drift and the FLIP both moved them — the
       same distance counted twice — and they slid straight out of the box.

       So the field is forced back to its pre-swap height for the duration of
       one synchronous measurement. That yields where each control sits on
       the animation's FIRST frame; the FLIP covers only the residual (the
       genuine rearrangement from a row under the text to a cluster beside
       it), and the centring drift carries the rest exactly once. No paint
       happens in between — this is all inside one layout effect. */
    const hardH = field.style.height;
    if (fieldWas) field.style.height = `${fieldWas.h}px`;
    const startBox = el.getBoundingClientRect();
    /* ── THE TRAVEL IS MEASURED FROM THE FIRST FRAME'S LAYOUT ──
       The composer docks against the bottom edge, so while its field is
       animating from tall to short, the tall field on the first frame pushes
       the composer's TOP up by the difference (84px at rest-to-dock). The
       translate was computed against the final, short layout, so the first
       painted frame showed the composer 84px above where it had been resting
       — a jump before the glide. Measured with the field forced back to its
       starting height, the translate and the shrinking height add up to the
       resting position on frame one and to the dock on the last. */
    const dy = from - startBox.top;
    const starts = new Map<Element, { x: number; y: number }>();
    kids?.forEach((_was, kid) => {
      const r = kid.getBoundingClientRect();
      starts.set(kid, { x: r.left - startBox.left, y: r.top - startBox.top });
    });
    field.style.height = hardH;

    const moves: Array<[Element, number, number]> = [];
    kids?.forEach((was, kid) => {
      const at = starts.get(kid);
      if (!at) return;
      const kdx = was.x - at.x;
      const kdy = was.y - at.y;
      if (Math.abs(kdx) >= 1 || Math.abs(kdy) >= 1) moves.push([kid, kdx, kdy]);
    });

    if (Math.abs(dy) < 2 && moves.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /* 750ms on `--ease-morph`. The literals are duplicated from access.css
       because the Web Animations API takes numbers, not custom properties.
       Every one of these MUST stay equal: they are not four animations that
       happen to overlap, they are one shape change expressed in four places,
       and any drift between them shows up as a part arriving early. */
    const TIMING = {
      duration: 280,
      easing: "cubic-bezier(0.6, 0.28, 0.44, 1)",
      fill: "none" as const,
    };
    const anims = [
      /* The block travels to its dock. */
      el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
        TIMING,
      ),
      /* ── THE FIELD'S HEIGHT, NOT THE TEXTAREA'S ──
         One number that already contains everything the shape change does to
         the box: the padding coming down, the controls moving from under the
         text to beside it, and the text itself collapsing to a line.
         Animating the textarea instead (which is what this did) left the
         padding and the column-to-row switch snapping around a height that
         eased, which is the "switches first, then moves" that was
         reported. */
      /* ── RADIUS TRAVELS WITH HEIGHT, IN THE SAME KEYFRAMES ──
         `border-radius` was transitioning to `--r-pill` (100px) on its own
         clock while the box was still 139px tall, and a 100px radius on a
         tall box is a CAPSULE — a stadium shape that appears nowhere in this
         design and was the single ugliest frame in the collapse.

         The end state is a pill only because the box ends up 54px tall and
         the radius clamps to half of it. So the radius is animated to
         exactly `fieldNow / 2`: every intermediate frame is a correctly
         proportioned rounded rectangle, and the last one is a true pill
         because half the height IS the pill radius. Same keyframes as the
         height so the two can never disagree. */
      field.animate(
        [
          { height: `${fieldWas?.h ?? fieldNow}px`, borderRadius: fieldWas?.r ?? "" },
          { height: `${fieldNow}px`, borderRadius: `${fieldNow / 2}px` },
        ],
        TIMING,
      ),
      /* ── AND EACH CONTROL WALKS ITS OWN PATH ──
         The modes and the attach slots move from a row UNDER the text to a
         cluster BESIDE it — the single largest rearrangement in the collapse
         and, until now, the one thing that still teleported. Because the
         deltas were taken relative to the composer, these compose correctly
         with the parent's own translate above instead of doubling it. */
      ...moves.map(([kid, kdx, kdy]) =>
        kid.animate(
          [{ transform: `translate(${kdx}px, ${kdy}px)` }, { transform: "translate(0, 0)" }],
          TIMING,
        ),
      ),
    ];
    return () => anims.forEach((a) => a.cancel());
  }, [started]);

  /* ── THE RAIL IS FIXED; THE COMPOSER MEETS IT ──
     The rail is anchored to the foot of the page (its last panel ends on the line the docked composer's input
     starts on) and is the same in every state, so nothing moves it. At rest the composer's top is on the top
     of its Configuration panel: that line is read from the rail, where it has come to rest (its panels rise
     into place when the page mounts, so the rise is taken off), and handed to the page's grid as
     `--config-top`. It is measured again whenever a panel arrives or changes size. The heading stays where the
     page starts. */
  const [configTop, setConfigTop] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const shift = (el: HTMLElement) => {
      let ty = 0;
      for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
        const t = getComputedStyle(n).transform;
        if (t && t !== "none") ty += new DOMMatrixReadOnly(t).m42;
      }
      return ty;
    };
    const measure = () => {
      const page = rootRef.current;
      const cfg = document.querySelector<HTMLElement>(".orc-rail .rail-config");
      if (!page || !cfg) { setConfigTop(null); return; }
      const top = cfg.getBoundingClientRect().top - shift(cfg) - page.getBoundingClientRect().top;
      const next = Math.max(0, Math.round(top));
      setConfigTop((cur) => (cur !== null && Math.abs(cur - next) <= 1 ? cur : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    const rail = document.querySelector<HTMLElement>(".orc-rail");
    if (rail) {
      ro.observe(rail);
      rail.querySelectorAll(":scope > section").forEach((el) => ro.observe(el));
    }
    if (rootRef.current) ro.observe(rootRef.current);
    const mo = rail ? new MutationObserver(() => { measure(); rail.querySelectorAll(":scope > section").forEach((el) => ro.observe(el)); }) : null;
    if (rail) mo?.observe(rail, { childList: true });
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    /* The panels' entrance is a short rise: once more when it has ended. */
    const settle = window.setTimeout(measure, 700);
    return () => {
      ro.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(settle);
    };
  }, [started, mode]);

  /* ── ONE FLAG FOR "THE MORPH IS RUNNING" ──
     It started as "the landing blocks are still fading" and is now also what
     `.orc-stream.is-morphing` reads to stand the glow ring down, so it runs
     the length of the MORPH (750ms) rather than of the fade (420ms). The
     blocks finish early and hold at opacity 0 on their `both` fill until
     this clears — already inert by then, being `pointer-events: none` and
     aria-hidden. The extra 30ms keeps a frame of overlap so nothing is
     removed on the same tick it finishes animating. */
  useEffect(() => {
    if (!exiting) return;
    const id = window.setTimeout(() => setExiting(false), 320);
    return () => window.clearTimeout(id);
  }, [exiting]);

  /* ── A NEW TURN IS FOLLOWED ONCE ──
     Keyed on the NUMBER of turns, not on `turns`: the array is replaced on
     every stage tick, and following on each of those is what kept dragging
     a reader who had scrolled up back to the bottom. Sending is the one
     moment the reader has asked to see the end, so it re-pins.

     A thread restored from the session lands at its end with no glide. */
  const turnCount = shown.length;
  const seenCount = useRef(-1);
  useLayoutEffect(() => {
    const log = logRef.current;
    const first = seenCount.current < 0;
    seenCount.current = turnCount;
    if (!log || turnCount === 0) return;
    if (first) { log.scrollTop = log.scrollHeight; lastTop.current = log.scrollTop; return; }
    pinned.current = true;
    nudge();
  }, [turnCount, nudge]);

  const contextFor = mode === "sourcing" ? SOURCING_CONTEXT : [];

  /* Leaves the conversation for a blank one. Resuming is the default, so this is the one way
     back to the landing: it clears the thread, what was decided in it, and the open panels. */
  const startNew = () => {
    setActiveBrief(null);
    clearThread();
    setTurns([]);
    /* A draft left in the composer belongs to the chat that was left: it is not carried into the next message.
       That is the words, the files, and the job description and filters that were set for it. */
    draftApi.current.set("");
    setNextJd(null);
    setNextFilters({});
    setJdOpen(false);
    setLiveFiltersOpen(false);
    /* A new chat is not about the campaign the last one was: its slots start empty. */
    onNewChat?.();
    if (LIVE) {
      newChat();
      clearSets();
      decidedFor.current.clear();
      setVerdicts({});
    }
    setMatchesOpen(false);
    setProfile(null);
    setVisit(nextVisit());
    areaRef.current?.focus();
  };




  /* Take a prompt handed over from another page, once.
     `onHandoffTaken` clears it at the source, so returning to this page later
     does not re-seed a brief the user already edited or sent. Depending on
     `seed` is safe because it is stable. */
  useEffect(() => {
    // A prompt that goes out at once waits until the campaign's chat is the one open, or it lands in the wrong thread.
    if (handoff === null || chatFor) return;
    seed(handoff);
    /* An explicit "ask the agent" goes out at once: the composer commits the
       seeded text on its own render, so send on the next frame. */
    if (handoffSend) requestAnimationFrame(() => sendNow.current());
    onHandoffTaken();
    // `send` is read through a ref so a new identity does not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, chatFor, onHandoffTaken, seed]);

  return (
    <ConnectorsProvider>
    {/* One layout for every kind of turn. The form flow used to switch the
        page to a different grid (`is-guided`) while it was the last turn,
        so the column changed width and the composer changed position each
        time a turn of another kind followed it. */}
    <div
      className={orcClass(started)}
      ref={rootRef}
      style={configTop !== null ? { ["--config-top" as string]: `${configTop}px` } : undefined}
    >
      {dragging && (
        <div className="orc-drop" aria-hidden="true">
          <div className="orc-drop-in">Drop to attach<small>PDF, Word, text or an image, up to 10 MB</small></div>
        </div>
      )}
      <div className="orc-main">

        {/* ── TWO STATES, AND THE CLASS SAYS WHICH ──
            At rest the column is a heading over a composer. Once a brief is
            sent it becomes a transcript that scrolls with the composer docked
            beneath it — the shape every chat surface converges on, and the
            shape the reference asks for. One class drives the whole change so
            the two states cannot disagree about which one is showing. */}
        <div
          className={`orc-stream${started ? " is-live" : ""}${exiting ? " is-morphing" : ""}`}
          ref={streamRef}
        >
          {/* The mark, faint, behind the heading and the composer. It takes no room and goes when a message does. */}
          <span className="orc-wm" aria-hidden="true"><Mark /></span>
          {/* The transcript owns the scroll, not the column: the composer has
              to stay put while the messages move under it. */}
          <div className="orc-log" ref={logRef}>
          {started && shown.map((t) => (
            <TurnView
              key={t.id}
              turn={t}
              restored={LIVE ? t.startedAt < mountedAt.current : restored.has(t.id)}
              flyFrom={flight?.id === t.id ? flight : null}
              onFlown={clearFlight}
              onAnswer={seed}
              sourcingProps={{
                verdicts,
                onVerdict,
                onOpenProfile: (cid: string) => setProfile({ id: cid, ids: CANDIDATES.map((c) => c.id) }),
                onOpenList: () => { setProfile(null); setMatchesOpen(true); },
                onPlanned: deploySourcing,
                onGrow: nudge,
              }}
              momentCtx={{
                said: t.said,
                verdicts,
                onVerdict,
                openProfile: (cid: string, ids?: readonly string[]) =>
                  setProfile({ id: cid, ids: ids ?? (LIVE ? idsOfSetWith(cid) : CANDIDATES.map((c) => c.id)) }),
                openList: (cid?: string) => {
                  setProfile(null);
                  if (LIVE) setListCampaign(cid ?? campaignIds().at(-1) ?? null);
                  setMatchesOpen(true);
                },
                deploy: (role, cid) => (LIVE ? null : deploy(role, campaignName(cid as CampaignKey), cid as CampaignKey)),
                undeploy,
                seed,
                send: sendText,
                onGrow: nudge,
                prefs,
                setPref,
                /* The campaign in the sidebar is the one open, whether it was
                   picked this session or is the console's starting scope: a
                   form request with no campaign named uses it, and says so
                   with a Change link. */
                campaign: { id: campaign.id, name: campaign.name },
                openForm: onOpenForm,
                openCampaign: onOpenCampaign,
              }}
            />
          ))}
          {(!started || exiting) && (
              /* ── THE PAGE TITLES ITSELF, AND SAYS NOTHING ELSE ──
                 This was "Brief the agent" over a sentence explaining what a
                 brief does and which campaign it would run against. Both are
                 gone: the explanation restated what the composer's own
                 placeholder and its mode note already say, and naming the
                 campaign here contradicted the rail, which states owner,
                 visibility and department for the same campaign two columns
                 over — two places asserting the same scope is one place too
                 many, and it is the same fault that took the Agents block off
                 this page.

                 What is left is the product's name for the surface. It does
                 not instruct, because everything below it already does. */
              /* On the way out it is taken OUT OF FLOW and pinned to where
                 it was standing, so the log can lay out around the incoming
                 turn immediately — which is what the composer's FLIP has to
                 measure against — while this still fades from its old place
                 rather than jumping somewhere else to do it. */
              <div
                className={`orc-intro${exiting ? " is-out" : ""}`}
                style={exiting ? { top: exitAt.current?.intro ?? 0 } : undefined}
                aria-hidden={exiting || undefined}
              >
                <h1 className="orc-intro-h">
                  {/* Two spans because the two words are different KINDS of
                      thing — the product, then the surface within it — and
                      that is the only honest place to put a colour break. */}
                  Superhyre <span className="orc-intro-mark">Agent</span>
                </h1>
              </div>
            )}
          </div>

          <Composer
            started={started}
            api={draftApi}
            mode={mode}
            onMode={setMode}
            context={contextFor}
            jd={LIVE ? slots.jd : jd}
            filterCount={LIVE ? slots.filters : activeCount(filters)}
            {...(LIVE && focused ? { campaignName: campaign.name } : {})}
            {...(LIVE && !focused
              ? {
                  brief: {
                    onClearJd: () => setNextJd(null),
                    filtersLine: filtersLine(nextFilters),
                    onClearFilters: () => setNextFilters({}),
                  },
                }
              : {})}
            onOpenJd={() => setJdOpen(true)}
            onOpenFilters={LIVE ? openLiveFilters : openFilters}
            onSend={send}
            sendRef={sendRef}
            areaRef={areaRef}
            rootRef={composerRef}
            sending={flight !== null}
            preview={preview}
            below={
              /* The ideas and the search of past chats, under the field: part of the composer's own block, so
                 it docks with it. Connected they are three full sentences, one under the other; they step
                 aside while a brief is written (the composer shows what it says instead) and in a long chat. */
              LIVE
                ? !started
                  ? (
                    <IdeaList
                      focusName={focused ? campaign.name : null}
                      onPick={seedTyped}
                      onAsk={(p) => sendText(p)}
                      onPreview={setPreview}
                      onFind={openFind}
                    />
                  )
                  : null
                : <IdeaChips mode={mode} visit={visit} onPick={seedTyped} onPreview={setPreview} onFind={openFind} />
            }
          />

          {/* Stacked under 1100px the history panel, where New lives beside the page, is a
              screen below the conversation. This puts the way to a fresh chat where the
              conversation is. Hidden by CSS wherever the rail sits beside it. */}
          {LIVE && started && (
            <button type="button" className="rail-new orc-newchat" onClick={startNew}>
              <Plus size={12} weight="bold" aria-hidden="true" />
              <span className="orc-newchat-l">New chat</span>
            </button>
          )}
        </div>
      </div>

      <Rail
        campaign={campaign}
        agents={
          /* The agents this session deployed live in the rail, beside the
             conversation that started them. They used to be a band across
             the foot of the page, which took 269px from both columns, pushed
             the rail's last panel under it on a laptop screen, and arrived
             seconds after a send, moving the composer when it did. */
          LIVE ? <WatchList /> : <Campaigns scope="all" onOpenBrief={seed} deployed={deployed} onDeploy={deploy} />
        }
        {...(LIVE
          ? {
              briefs: railChats ?? [],
              history: railChats ? "ready" : chatsFailed ? "failed" : "loading",
              onRetryHistory: () => setChatsAsk((n) => n + 1),
              onRenameBrief: (id: string, title: string) =>
                api("PATCH", `/v1/conversations/${id}`, { title }).then(() => setChatsAsk((n) => n + 1)),
              onArchiveBrief: archiveChat,
            }
          : {})}
        {...(LIVE
          ? {
              stats: week,
              statsState: weekState,
              onRetryStats: () => { setWeekState("loading"); setWeekAsk((n) => n + 1); },
              /* Always: a chat that has not started can still be pointing at the campaign the last one was about, and a new
                 chat is how to leave it. */
              canStartNew: true,
              ...(config ? { config } : {}),
            }
          : {})}
        activeBriefId={LIVE ? live.conversationId : activeBrief}
        findAsk={findAsk}
        onNewBrief={startNew}
        onPickBrief={(id) => {
          if (LIVE) {
            void openChat(id);
            return;
          }
          setActiveBrief(id);
          /* Seeds the brief's title rather than pretending to load a
             transcript that was never stored. */
          const b = BRIEFS.find((x) => x.id === id);
          if (b) {
            setMode(b.mode);
            seed(b.title);
          }
        }}
      />

      {LIVE ? (
        <>
          <JdDialog
            open={jdOpen}
            onClose={() => setJdOpen(false)}
            current={focused ? liveJd : nextJd}
            onApply={focused ? sendJd : setNextJd}
            {...(!focused && nextJd ? { onRemove: () => setNextJd(null) } : {})}
            read={readJdFile}
            /* Several descriptions, or a sheet of them, are added together on the import card, not one at a time here. */
            {...(!focused ? { onMany: (pick: { files?: File[]; links?: string[] }) => { stashImport(pick); sendMessage("Add roles in bulk", undefined); } } : {})}
            viewOnly={focused && !mayChange}
            lead={focused
              ? (liveJd
                ? "Choose another and the agent reads it again, drafts the role spec and searches."
                : "The agent reads it, drafts the role spec and starts finding people.")
              : "It goes with your next message, and the agent starts a campaign from it."}
          />
          <FiltersDialog
            open={liveFiltersOpen}
            onClose={() => setLiveFiltersOpen(false)}
            initial={liveFiltersInit.initial}
            prefilled={liveFiltersInit.prefilled}
            onApply={focused
              ? saveFilters
              : (values: Values) => {
                  setNextFilters(Object.fromEntries(Object.entries(values).filter(([id, v]) => activeCount({ [id]: v }) > 0)));
                }}
            live
            readOnly={focused && !mayChange}
            focus={filtersFocus}
            {...(focused ? {} : { lead: "For the campaign you start next: they go with your next message and are saved on it." })}
          />
        </>
      ) : (
        <>
          <JdDialog
            open={jdOpen}
            onClose={() => setJdOpen(false)}
            current={jd}
            onApply={setJd}
            onRemove={() => setJd(null)}
          />
          <FiltersDialog
            open={filtersOpen !== null}
            onClose={() => setFiltersOpen(null)}
            initial={filtersOpen?.initial ?? EMPTY}
            prefilled={filtersOpen?.prefilled ?? []}
            onApply={setFilters}
          />
        </>
      )}

      <RankedMatches
        open={matchesOpen}
        onClose={() => { setProfile(null); setMatchesOpen(false); }}
        verdicts={verdicts}
        onVerdict={onVerdict}
        activeId={profile?.id ?? null}
        onOpen={(id, ids) => setProfile({ id, ids })}
        {...(LIVE ? { set: liveSet } : {})}
        scoring={LIVE && live.turns.some((t) => t.searches.some((x) => x.status === "running"))}
        {...(LIVE && liveSet?.campaignId
          ? {
              /* The same sentence the search card's button sends: the chat reads the rest in code and the card follows it. */
              onScoreRest: () => {
                setProfile(null);
                setMatchesOpen(false);
                // The name is the set's own campaign's, which the page may not be on.
                const named = (liveSet.campaignId && campaignById(liveSet.campaignId)?.name) || campaign.name;
                sendMessage(`Score the people found for ${named} again`, liveSet.campaignId ?? undefined);
              },
            }
          : {})}
      />
      <PassReasonDialog
        who={passing ? (candidateById(passing)?.name.split(" ")[0] ?? "them") : null}
        onClose={() => setPassing(null)}
        onPass={passWith}
      />

      <ProfileSidebar
        candidate={profile ? (LIVE ? candidateById(profile.id) : CANDIDATES.find((c) => c.id === profile.id)) ?? null : null}
        onClose={() => setProfile(null)}
        {...(() => {
          if (!profile) return {};
          const i = profile.ids.indexOf(profile.id);
          const go = (d: number) => {
            const next = profile.ids[i + d];
            return next ? () => setProfile({ ...profile, id: next }) : undefined;
          };
          return { onPrev: go(-1), onNext: go(1), position: { index: i, total: profile.ids.length } };
        })()}
        verdict={profile ? verdicts[profile.id] : undefined}
        onVerdict={onVerdict}
        scrim={!matchesOpen}
        canDecide={!LIVE || !profile || setOfCandidate(profile.id)?.campaignId != null}
        {...(() => {
          const set = LIVE && profile ? setOfCandidate(profile.id) : null;
          return set ? { criteria: { text: set.criteria.map((c) => c.text), short: set.criteria.map((c) => c.short) } } : {};
        })()}
      />
    </div>
    </ConnectorsProvider>
  );
}

/* ── a turn ──────────────────────────────────────────────────────────────── */

function TurnView({
  turn, restored = false, flyFrom, onFlown, onAnswer, sourcingProps, momentCtx,
}: {
  turn: Turn;
  /** Came back from an earlier visit: shown as it was left, not replayed. */
  restored?: boolean;
  flyFrom: { x: number; y: number } | null;
  onFlown: () => void;
  /** A clarifying question's options seed the composer; they never act. */
  onAnswer: (text: string) => void;
  sourcingProps: Omit<React.ComponentProps<typeof SourcingRun>, "onBusy">;
  /** Everything a Moment may do, minus its own busy flag. */
  momentCtx: Omit<MomentCtx, "onBusy">;
}) {
  const stages = STAGES[turn.mode];
  /* A sourcing run reports its own busy state: it is working through its
     phases, idle while it waits for Run search, then working again. */
  const selfRun = turn.kind !== "reply";
  const [busy, setBusy] = useState(selfRun);
  const chatTurns = useLiveChat().turns;
  const liveTurn = chatTurns.find((t) => t.key === turn.liveKey);
  /* A question the chat has gone past is no longer asked. */
  const later = chatTurns.slice(chatTurns.findIndex((t) => t.key === liveTurn?.key) + 1);
  const running = liveTurn
    ? liveTurn.status === "sending" || liveTurn.status === "working"
    : selfRun ? busy : turn.stage >= 0;
  /* Built once per turn, so the moment's effects that depend on the context
     do not re-run on every Agent render. The functions inside are stable
     callbacks; the verdicts read through a ref so shortlisting elsewhere
     still reaches a moment that is already on screen. */
  const ctxRef = useRef(momentCtx);
  ctxRef.current = momentCtx;
  const ctx = useMemo<MomentCtx>(() => ({
    get said() { return ctxRef.current.said; },
    get verdicts() { return ctxRef.current.verdicts; },
    onVerdict: (id, v) => ctxRef.current.onVerdict(id, v),
    openProfile: (id, ids) => ctxRef.current.openProfile(id, ids),
    openList: (cid) => ctxRef.current.openList(cid),
    deploy: (role, cid) => ctxRef.current.deploy(role, cid),
    undeploy: (key) => ctxRef.current.undeploy(key),
    seed: (text) => ctxRef.current.seed(text),
    send: (text, cid) => {
      const act = ctxRef.current.send;
      if (act) act(text, cid);
      else ctxRef.current.seed(text);
    },
    onGrow: () => ctxRef.current.onGrow(),
    get prefs() { return ctxRef.current.prefs; },
    setPref: (k, v) => ctxRef.current.setPref(k, v),
    get campaign() { return ctxRef.current.campaign; },
    openForm: (c, f, v) => ctxRef.current.openForm?.(c, f, v),
    openCampaign: (id) => ctxRef.current.openCampaign?.(id),
    onBusy: setBusy,
  }), []);
  const mark = useRef<HTMLSpanElement>(null);
  /* Connected, a turn is the server's: its own key (a turn's position moves between chats), so the answered
     questions and the records its cards made are found again whichever chat is open. */
  const turnKey = turn.liveKey ?? turn.id;
  const turnInfo = useMemo(() => ({ id: turnKey, restored }), [turnKey, restored]);

  /* ── THE FOCAL MOMENT, as a FLIP ──
     The mark's final position is its ordinary layout position in this turn.
     To make it arrive FROM the send button, it is given the inverse transform
     on its first frame and animated to identity — so the send visibly becomes
     the agent, using one element rather than a decoy that hands off to a real
     one.
     Transform only, never top/left, which animate.md is explicit about. The
     Web Animations API rather than a CSS keyframe because the distance is
     computed at runtime and differs every send. */
  useEffect(() => {
    const el = mark.current;
    if (!el || !flyFrom) return;

    const to = el.getBoundingClientRect();
    const dx = flyFrom.x - (to.left + to.width / 2);
    const dy = flyFrom.y - (to.top + to.height / 2);

    /* Under a few pixels there is nothing to explain, so skip it rather than
       play a 520ms animation nobody can see. */
    if (Math.hypot(dx, dy) < 8) { onFlown(); return; }

    /* Reduced motion: no travel. animate.md asks for an intentional
       alternative rather than a kill switch, so the arrival is still announced
       — the mark fades up in place instead of flying across the surface. The
       signal survives, the 520ms of spatial movement does not. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const quick = el.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 120, easing: "ease-out", fill: "none" },
      );
      quick.finished.then(onFlown, onFlown);
      return () => quick.cancel();
    }

    const anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(0.72)`, opacity: 0.85 },
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
      ],
      {
        /* 520ms: animate.md's band for a deliberately authored focal entrance
           is 300-500 for a view transition and 500-800 for a focal one, and
           this is the surface's single authored moment. Confident deceleration,
           no bounce. */
        duration: 520,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "none",
      },
    );
    /* Only completion clears the flight. Passing `onFlown` as the rejection
       handler too — which is what this was — makes a CANCEL count as an
       arrival, so React's StrictMode double-invoke cleared the origin before
       the second invocation could use it and nothing ever animated. */
    anim.finished.then(onFlown).catch(() => {});
    return () => anim.cancel();
  }, [flyFrom, onFlown]);

  return (
    <article className={`orc-turn${turn.quiet ? " is-continued" : ""}`}>
      {liveTurn?.opening && <Opening line={liveTurn.opening.line} jdWords={liveTurn.opening.jdWords} />}
      {!turn.quiet && !liveTurn?.opening && <Prompt text={turn.said} />}
      {!turn.quiet && !liveTurn?.opening && <FormLinkChips text={turn.said} />}

      <div className="orc-answer">
        {/* The mark, which is the agent. It stays still: what the turn is doing is said, line by line, beside it,
            and that is where the loader is. It is the same element that flew in from the send button. */}
        <span ref={mark} className={`orc-mark${running ? " is-working" : ""}`} aria-hidden="true">
          <Mark />
        </span>

        <div className="orc-answer-body">
          {liveTurn ? (
            /* The turn's scope reaches the views its cards draw: without it they could not tell a visit
               from a return, and a form made here would be asked for again. */
            <TurnContext.Provider value={turnInfo}>
              <LiveMomentProvider value={ctx}>
                <LiveTurnBody turn={liveTurn} onAnswer={onAnswer} later={later} />
              </LiveMomentProvider>
            </TurnContext.Provider>
          ) : turn.kind === "sourcing" ? (
            <SourcingRun {...sourcingProps} onBusy={setBusy} />
          ) : turn.kind !== "reply" ? (
            <TurnContext.Provider value={turnInfo}>
              <Moment kind={turn.kind} ctx={ctx} />
            </TurnContext.Provider>
          ) : running ? (
            <p className="orc-stage" aria-live="polite">
              <Loader size="sm" />
              {stages[turn.stage]}
            </p>
          ) : (
            <Reply
              /* The fixture carries a `thoughtMs`, and it is overridden with
                 the turn's MEASURED elapsed time. That line has been truthful
                 since it was added and a fixture value would quietly undo it. */
              reply={{
                ...REPLIES[turn.mode][turn.replyIndex % REPLIES[turn.mode].length]!,
                thoughtMs: turn.thoughtMs ?? 0,
              }}
              onAnswer={onAnswer}
            />
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * How a chat that the app opened begins: one quiet line that says what this is ("Your first campaign: Senior Data
 * Engineer"), with the job description as a calm file beside it. It is the app's, not the person's, so it is not a bubble.
 */
function Opening({ line, jdWords }: { line: string; jdWords: number | null }) {
  return (
    <div className="orc-opening">
      <p className="orc-opening-t">{line}</p>
      {jdWords !== null && (
        <span className="rep-prompt-file orc-opening-file">
          <FileText size={13} aria-hidden="true" />
          <b>Job description</b>
          <small>{jdWords.toLocaleString("en-IN")} words</small>
        </span>
      )}
    </div>
  );
}

/** The SuperHyre mark. Inline so it can inherit colour and be transformed. */
function Mark() {
  return (
    <svg viewBox="0 0 34 35" fill="none" focusable="false" aria-hidden="true">
      <path
        d="M16.047 0.496124C16.0223 2.74925 16.6685 4.85749 17.9504 6.64333C19.9314 9.36012 22.9612 10.9359 26.1146 11.8233C28.2333 12.4029 30.3556 12.6674 32.605 12.6855V15.9384C30.3697 15.942 28.2969 16.4962 26.3159 17.4562C20.4611 20.3831 15.9694 26.7367 15.9129 33.4961L12.989 33.0868L12.0426 28.5008C11.3117 25.9579 10.3653 23.9656 7.78397 23.1252C6.90469 22.8427 6.03954 22.7014 5.11789 22.5963L1.34654 22.4551L0.60498 19.0464C2.40944 18.8218 4.13268 18.4378 5.79942 17.7315C12.8336 14.714 13.2221 7.87494 13.2362 0.829384L15.9023 0.496124"
        fill="currentColor"
        stroke="currentColor"
        strokeMiterlimit="10"
      />
    </svg>
  );
}

/* ── composer ────────────────────────────────────────────────────────────── */

/**
 * The field's resting height, in lines of its own leading.
 *
 * `LINE_H` mirrors `.orc-input`'s computed `line-height` (14.5px type at 1.5).
 * Stated as two numbers rather than one so the intent — TWO LINES — survives
 * a change to the type size, and so the mismatch is visible if the CSS moves.
 *
 * It was three, which made the composer the largest thing on the landing; two
 * say "write a sentence" and it grows with the text, up to MAX_LINES.
 */
const REST_LINES = 2;
const LINE_H = 22;
/** The most lines the field grows to before it scrolls: a brief longer than this is read in the field, not in the layout. */
const MAX_LINES = 6;

/** What the page can ask of the composer: the draft as it will be sent, setting it, and what was dropped or pasted. */
type ComposerHandle = {
  get: () => string;
  set: (t: string) => void;
  /** When what is in the composer is a list of roles (a Google Sheet's link, or several job descriptions), what the import card takes. */
  bulk?: () => ImportSeed | null;
  attach?: (files: File[]) => void;
  paste?: (out: PasteOutcome) => void;
};

function Composer({
  api, mode, onMode, context, jd, filterCount, onOpenJd, onOpenFilters, onSend,
  sendRef, areaRef, rootRef, sending, started, preview, below, campaignName, brief,
}: {
  /** The campaign in focus, which a job description and the filters act on at once. Absent: they wait for the next message. */
  campaignName?: string;
  /**
   * With no campaign in focus: what is set for the NEXT message. The job description is attached to it, and the
   * filters go with it as one short line. Both show as chips in the composer, to take off.
   */
  brief?: { onClearJd: () => void; filtersLine: string | null; onClearFilters: () => void };
  /** What sits under the field and travels with it: the ideas and the search of past chats. */
  below?: React.ReactNode;
  /** An idea being hovered, shown as ghost text while the field is empty. */
  preview: string | null;
  /** True once a brief has been sent; the field then rests at one line. */
  started: boolean;
  /** How the page reads and sets the draft without owning it. */
  api: React.MutableRefObject<ComposerHandle>;
  mode: ModeId;
  onMode: (m: ModeId) => void;
  context: readonly { id: string; label: string; Icon: typeof ArrowUp; hint: string }[];
  jd: Jd | null;
  filterCount: number;
  onOpenJd: () => void;
  /** Opens the filters, pre-filled from what the draft already says; `category` scrolls the dialog to that group. */
  onOpenFilters: (draft: string, category?: string) => void;
  onSend: () => void;
  /* Non-nullable element type: `useRef<HTMLButtonElement>(null)` yields
     `RefObject<HTMLButtonElement>`, and React 18's LegacyRef will not accept
     the nullable form when the ref is passed to `ref=` rather than merely
     read. The switcher's `anchor` prop gets away with the nullable type
     because nothing forwards it to an element. */
  sendRef: React.RefObject<HTMLButtonElement>;
  /* Lifted to Home so a tile or task can hand the caret over after seeding. */
  areaRef: React.RefObject<HTMLTextAreaElement>;
  /** The outer block, so the page can FLIP it from its rest to its dock. */
  rootRef: React.RefObject<HTMLDivElement>;
  /* True for the length of the flight. The arrow recedes while the mark is in
     the air, so the two are never both on screen — that is what makes it read
     as a handoff rather than as a copy. */
  sending: boolean;
}) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  /* The page's handle on the draft. `get` reads a ref so it is never stale. */
  const draftNow = useRef(draft);
  draftNow.current = draft;

  /* ── FILES AND LONG TEXT ──
     Dropped, pasted or picked, each is a chip with its name and size, read on the server (PDF, Word, text,
     images) and sent as the content of the message. A long paste becomes a chip too, "Pasted text, N words",
     rather than filling the field. A path that came through as text is not put in the box. */
  const [atts, setAtts] = useState<Attachment[]>([]);
  const attsNow = useRef(atts);
  attsNow.current = atts;
  const [note, setNote] = useState<{ text: string; picker: boolean } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const uid = useRef(0);

  const fresh = () => `a${Date.now().toString(36)}${(uid.current += 1)}`;
  const addFiles = (dropped: File[]) => {
    if (!LIVE || !dropped.length) return;
    /* A spreadsheet is a list of roles, not an attachment to one message: the import card reads it, row by row, and
       asks only what a row leaves out. The files wait for it here, and the chat answers with the card. */
    const sheets = dropped.filter(isSheetFile);
    const files = dropped.filter((f) => !isSheetFile(f));
    if (sheets.length) {
      stashImport({ files: sheets });
      sendMessage("Add these roles in bulk", undefined);
      if (!files.length) return;
    }
    setNote(null);
    let room = MAX_ATTACHMENTS - attsNow.current.length;
    const refused: string[] = [];
    for (const f of files) {
      const why = fileRefusal(f);
      if (why) { refused.push(why); continue; }
      if (room <= 0) { refused.push(`Up to ${MAX_ATTACHMENTS} files go in one message.`); break; }
      room -= 1;
      const id = fresh();
      const name = f.name || "Pasted image";
      setAtts((a) => [...a, { id, name, origin: "file", size: f.size, status: "reading", text: "" }]);
      attachmentApi.read(f, typeOf(f)).then(
        (r) => setAtts((a) => a.map((x) => (x.id === id ? { ...x, status: "ready", text: r.text, docKind: r.kind, ...(r.truncated ? { note: "Only the start fits in a message." } : {}) } : x))),
        (err: unknown) => setAtts((a) => a.map((x) => (x.id === id ? { ...x, status: "failed", note: messageOf(err) } : x))),
      );
    }
    if (refused.length) setNote({ text: refused[0] ?? "", picker: false });
  };
  const addPasted = (text: string) => {
    setNote(null);
    if (attsNow.current.length >= MAX_ATTACHMENTS) { setNote({ text: `Up to ${MAX_ATTACHMENTS} files go in one message.`, picker: false }); return; }
    setAtts((a) => [...a, { id: fresh(), name: "Pasted text", origin: "pasted", size: text.length, status: "ready", text }]);
  };
  const takePaste = (out: PasteOutcome) => {
    if (out.kind === "files") addFiles(out.files);
    else if (out.kind === "path") setNote({ text: PATH_NOTE, picker: true });
    else if (out.kind === "long") addPasted(out.text);
  };
  const dropAtt = (id: string) => {
    if (id === "next-jd") { brief?.onClearJd(); return; }
    setAtts((a) => a.filter((x) => x.id !== id));
    setViewing((v) => (v === id ? null : v));
  };

  /* With no campaign in focus, the job description set from its dialog is one more attachment, and the filters
     are a line at the end of the message; both are consumed by the send. */
  const nextJd: Attachment | null = !campaignName && jd
    ? { id: "next-jd", name: jd.name, label: `Job description: ${jd.name}`, origin: "file", size: jd.text.length, status: "ready", text: jd.text, docKind: "job_description" }
    : null;
  const items = nextJd ? [nextJd, ...atts] : atts;
  const itemsNow = useRef(items);
  itemsNow.current = items;
  const compose = (typed: string, list: readonly Attachment[]) =>
    composeMessage(typed, list, campaignName
      ? { campaignName }
      : { newCampaign: true, tail: brief?.filtersLine ?? null });
  const composed = compose(draft, items);
  /* What is sent is what is typed and what was attached, as one message; clearing the field clears the files. */
  api.current = {
    get: () => compose(draftNow.current, itemsNow.current).text,
    set: (t: string) => {
      setDraft(t);
      if (!t) { setAtts([]); setNote(null); }
    },
    attach: addFiles,
    paste: takePaste,
    /* Several job descriptions attached, or a Google Sheet's link in the words, are roles to add together: the agent
       answers with the import card, which reads them, instead of one message about all of them. */
    bulk: () => {
      if (!LIVE || campaignName) return null;
      const ready = itemsNow.current.filter((a) => a.status === "ready" && a.text.trim().length >= 60);
      const typed = draftNow.current.trim();
      const link = sheetLinkIn(typed);
      /* Two or more documents with no résumé among them, and nothing typed that says they are something else (a
         question about them), are roles to add. A file the reader took for a job description counts either way. */
      const docs = ready.filter((a) => a.docKind !== "resume");
      const sure = ready.filter((a) => a.docKind === "job_description");
      const about = !typed || /\b(campaigns?|roles?|jds?|job descriptions?|openings?|positions?|vacanc\w+|hir(?:e|ing))\b/i.test(typed);
      const many = sure.length >= 2 || (docs.length >= 2 && docs.length === ready.length && about);
      const seed: ImportSeed = {
        files: [],
        texts: many ? docs.map((a) => ({ label: a.name.replace(/\.[a-z0-9]+$/i, ""), jd: a.text })) : [],
        links: link ? [link] : [],
      };
      return hasSeed(seed) ? seed : null;
    },
  };
  const reading = atts.some((a) => a.status === "reading");
  const withText = items.filter((a) => a.status === "ready").length;

  /* The mirror does not scroll itself — it sits behind a textarea that does,
     so it has to be moved by the same amount or the underlines drift off the
     words as soon as the field scrolls. */
  useEffect(() => {
    const area = areaRef.current;
    const mirror = mirrorRef.current;
    if (!area || !mirror) return;
    const sync = () => { mirror.scrollTop = area.scrollTop; };
    area.addEventListener("scroll", sync);
    sync();
    return () => area.removeEventListener("scroll", sync);
  }, [areaRef]);

  /* Grows upward with its content, capped so a long brief scrolls instead of
     pushing the transcript off screen. Height is set from scrollHeight rather
     than animated — animating a layout-driving property is what animate.md
     warns against, and there is nothing to communicate here anyway.

     ── AND IT HAS A FLOOR, SET HERE RATHER THAN IN CSS ──
     `rows={1}` left the field 22px tall at rest, which made the composer read
     as a search box rather than as somewhere you write a brief, so the
     resting size should say so. The floor is REST_LINES lines of the field's
     own 21.75px leading, rounded up.

     It lives in this expression and not as a CSS `min-height` because this
     effect writes `style.height` directly: two owners for one dimension is how
     you get a resting height that disagrees with the grown one. `max` of the
     floor and `min` of the cap, so the clamp reads in the order it applies. */
  /* ── A LAYOUT EFFECT, AND THE ORDERING IS THE WHOLE REASON ──
     This was `useEffect`, which React runs after paint and after every
     layout effect. The page's morph is a layout effect in the PARENT, so it
     measured the field's final height while this had not yet resized the
     textarea — it read 84px (collapsed padding still wrapped around a
     three-line textarea), animated toward that, and then the textarea
     shrank a frame later and the field dropped the remaining 30px in one
     step. A hitch at the very end of the collapse, which is the worst place
     to put one.

     A child's `useLayoutEffect` runs before its parent's, so the textarea is
     already at its final height when the morph measures. What this effect
     depends on is not a value but an order. */
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;

    el.style.height = "auto";
    /* ── THE FLOOR MOVES WITH THE STATE, THE CEILING DOES NOT ──
       Two lines at rest, because a brief is more than a word and the field
       should say so before one is written. One line once a transcript exists:
       the conversation is the subject then and the field is the instrument,
       so it gives the room back. Either way the autosize still grows it the
       moment the draft needs more. */
    const floor = (started ? 1 : REST_LINES) * LINE_H;
    const target = Math.max(floor, Math.min(el.scrollHeight, MAX_LINES * LINE_H));
    el.style.height = `${target}px`;

    /* ── THE HEIGHT IS SET HERE, BUT NO LONGER ANIMATED HERE ──
       This used to own the collapse, animating the TEXTAREA from its old
       height to its new one. That was right when the textarea was the only
       thing changing and wrong once the whole field was: the field also
       switches from a column (row of controls UNDER the text) to a row
       (controls BESIDE it) and drops 8px of padding, so animating the
       textarea alone left the two halves of one shape changing on different
       clocks.

       The morph now belongs to the layout effect below, which animates the
       FIELD's height — one number that already contains the padding, the
       column-to-row switch and this — and FLIPs each control along its own
       path inside it. This effect goes back to doing only its job: making
       the textarea the right size for its text. */
  }, [draft, areaRef, started]);

  const size = chatLength(draft);
  /* Connected, the agent takes a message of this length at most. Past it Send is off, and the count
     shows only once the end is near so it is not a number to watch while writing a normal one. */
  const over = LIVE && chatOver(draft);
  const near = LIVE && size >= CHAT_LIMIT * 0.85;
  const ready = (size > 0 || withText > 0) && !over && !reading;
  const filterChip = !campaignName && brief?.filtersLine && filterCount > 0
    ? { count: filterCount, onOpen: () => onOpenFilters(draft), onRemove: brief.onClearFilters }
    : undefined;
  const hasAttached = items.length > 0 || !!filterChip;
  /* What the brief says so far, from the words and from the files, shown instead of the ideas while there is any. */
  const sayingSomething = draft.trim().length > 0 || items.some((a) => a.status === "ready");

  return (
    <>
    <div className="orc-composer" ref={rootRef}>
      <div className={`orc-composer-field${hasAttached ? " has-attached" : ""}`} data-tour="composer">
        {/* The travelling ring. §4.4: this belongs to the CLASS "a field you
            are about to type into", so quick find, the switcher's search and
            this all light the same way. The CSS trigger existed for a while
            before this line did, which is a reminder that a selector matching
            nothing fails silently. */}
        <BorderGlow />
        {/* What is attached is inside the box, at its top: the box grows to hold it, and its top (the line the
            rail ends on) moves with it. */}
        {hasAttached && (
          <AttachChips
            items={items}
            cut={composed.cut}
            onView={setViewing}
            onRemove={dropAtt}
            filters={filterChip}
          />
        )}
        {/* ── THE BRIEF SHOWS ITS OWN STRUCTURE ──
            A mirror of the textarea's text, sitting directly behind it, with
            the spans `brief.read` RECOGNISED underlined in their facet's
            colour. The textarea above is transparent-texted, so what you read
            is this layer and what you edit is the real field.

            Why: the research on conversational input measures 30-60s per
            message, most of it spent re-reading and re-typing because you
            cannot tell what was understood. Underlining only the recognised
            spans answers that without a form — you write prose, and the parts
            that landed light up beneath the words.

            Why it is honest where the deleted "intent wash" was not: that one
            highlighted a string split and, on a short prompt, washed the whole
            message. This highlights only what matches a fixed, auditable
            vocabulary, and highlights nothing else. Unrecognised text staying
            plain is the useful half of the signal.

            `aria-hidden` because the textarea already carries the text to
            assistive tech; announcing it twice would be worse than not
            decorating it at all. The facet summary below the field is the
            non-visual route to the same information. */}
        {/* A wrapper whose box IS the text's content box, so the mirror can
            use `inset: 0` and land exactly on the field. Absolute positioning
            resolves against the containing block's PADDING box, so anchoring
            the mirror to the card directly put it 16px up and left of the
            textarea — measured, and visible as text clipped by the border.
            Repeating the card's padding here instead would be a second place
            to keep that number correct. */}
        <div className="orc-field-text">
        <div className="orc-mirror" aria-hidden="true" ref={mirrorRef}>
          {highlightRuns(draft).map((run, i) =>
            run.hit ? <span key={i} className="orc-hit">{run.text}</span> : <span key={i}>{run.text}</span>,
          )}
          {/* A trailing newline keeps the mirror's height in step with the
              textarea's when the text ends in a line break, which a browser
              otherwise collapses in a div but not in a textarea. */}
          {"\n"}
        </div>
        <textarea
          ref={areaRef}
          className={`orc-input${preview && !draft ? " is-preview" : ""}`}
          /* Briefs are jargon ("backend", "Postgres", "SRE") that a spell
             checker flags in red, right on top of the orange highlights. */
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={preview && !draft ? preview : LIVE
            /* Connected there is one wording: the agent is briefed in words, whatever the state. */
            ? "Brief the agent…"
            : started
            /* Docked, the field shares its line with five controls; the long
               prompt wrapped to two lines and made the bar taller. */
            ? (mode === "sourcing" ? "Brief the agent…" : "Ask the agent…")
            : mode === "sourcing"
              ? "Describe who you are looking for…"
              : "Tell the agent what to run…"}
          rows={1}
          onKeyDown={(e) => {
            /* Enter sends, Shift-Enter breaks the line. The convention every
               composer uses, and the one people try first. */
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!over && !reading) onSend();
            }
          }}
          onPaste={(e) => {
            if (!LIVE) return;
            const out = readClipboard(e.clipboardData);
            if (out.kind === "text") return;
            e.preventDefault();
            takePaste(out);
          }}
        />
        </div>

        <div className="orc-composer-row">
          {/* The job description by name and the filters by count: the same controls the prototype's
              composer has, connected. The description goes to the campaign in focus (or starts the next
              one) and the filters are the campaign's own, read by its next search. There is no mode
              connected: the agent is briefed in words. */}
          {!LIVE && <div className="orc-modes" role="radiogroup" aria-label="Mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                className={`orc-mode${mode === m.id ? " is-on" : ""}`}
                onClick={() => onMode(m.id)}
              >
                <m.Icon size={14} weight={mode === m.id ? "fill" : "regular"} aria-hidden="true" />
                <span className="orc-chip-l">{m.label}</span>
              </button>
            ))}
          </div>}

          {/* Sourcing-only. The slots are not decoration — they are the two
              things that change what a sourcing run returns, so they sit on the
              composer rather than in a settings page nobody opens mid-brief. */}
          {/* Sourcing-only: the two things that change what a run returns.
              Each opens its own dialog and, once set, says so in place: the
              JD by name, the filters by count. Docked, they shrink to their
              icons with the count as a badge. */}
          {(LIVE || context.length > 0) && (
            <div className="orc-slots">
              <button
                type="button"
                className={`orc-gslot orc-ctx${jd ? " is-on" : ""}`}
                data-tour="jd-slot"
                title={jd ? `Job description: ${jd.name}` : "Attach a job description"}
                onClick={onOpenJd}
              >
                <span className="orc-ctx-ico" aria-hidden="true">
                  {jd ? <Check size={12} weight="bold" /> : <FileText size={14} weight="bold" />}
                </span>
                <span className="orc-chip-l orc-chip-name">{jd ? (LIVE ? jd.name : "JD attached") : "Job description"}</span>
              </button>
              <button
                type="button"
                className={`orc-gslot orc-ctx${filterCount ? " is-on" : ""}`}
                data-tour="filters-slot"
                title={filterCount ? `${filterCount} filters set` : "Set filters"}
                onClick={() => onOpenFilters(draft)}
              >
                <span className="orc-ctx-ico" aria-hidden="true">{LIVE ? <SlidersHorizontal size={14} weight="bold" /> : <FunnelSimple size={14} weight="bold" />}</span>
                <span className="orc-chip-l">{filterCount ? "Filters" : LIVE ? "Filters" : "Set filters"}</span>
                {filterCount > 0 && <b className="orc-ctx-n" key={filterCount}>{filterCount}</b>}
              </button>
            </div>
          )}

          {/* Docked, the modes and the two context buttons fold into one
              control, so the bar reads as field → tune → send. */}
          {started && (
            <TuneMenu
              mode={mode}
              onMode={onMode}
              jd={jd}
              filterCount={filterCount}
              onOpenJd={onOpenJd}
              onOpenFilters={() => onOpenFilters(draft)}
            />
          )}

          {/* The picker is reached from the job description slot and from the note on a pasted path: there is
              no separate pin. Files can also be dropped on the page or pasted. */}
          {LIVE && (
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              accept={`${ATTACH_ACCEPT},.xlsx,.csv,.tsv`}
              onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
            />
          )}

          {near && (
            <span
              className={`orc-count t-caption${over ? " is-over" : ""}`}
              title={`${size.toLocaleString("en-IN")} of ${CHAT_LIMIT.toLocaleString("en-IN")} characters`}
              aria-live="polite"
            >
              {over
                ? <>{(size - CHAT_LIMIT).toLocaleString("en-IN")} too long<span className="sr-only">: the most is {CHAT_LIMIT.toLocaleString("en-IN")} characters</span></>
                : `${size.toLocaleString("en-IN")} / ${CHAT_LIMIT.toLocaleString("en-IN")}`}
            </span>
          )}

          <button
            ref={sendRef}
            type="button"
            className={`orc-send${sending ? " is-flying" : ""}`}
            onClick={onSend}
            disabled={!ready}
            aria-label="Send brief"
          >
            <ArrowUp size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Under the input, in a block of its own: the page's grid gives it its own row, so what is here (a note,
          the ideas, what the brief says) can be as tall as it needs without the rail having to make room. */}
      <div className="orc-composer-below">
        {note && (
          <p className="orc-attach-note" role="status">
            <span>{note.text}</span>
            {note.picker && <button type="button" onClick={() => { setNote(null); picker.current?.click(); }}>Choose a file</button>}
          </p>
        )}

        {/* While a brief is being written (words, or a file attached) the line under the composer says what
            of it has been understood; otherwise it holds the ideas. */}
        {LIVE && sayingSomething
          ? <BriefSignals text={[draft, ...items.filter((a) => a.status === "ready").map((a) => a.text)].join("\n")} onOpen={(category) => onOpenFilters(draft, category)} />
          : below}
      </div>

      {(() => {
        const open = atts.find((a) => a.id === viewing && a.origin === "pasted");
        return (
          <Dialog open={!!open} onClose={() => setViewing(null)} label="Pasted text" size="md">
            <div className="orc-paste-view">
              <header><h2 style={{ margin: 0 }}>Pasted text</h2></header>
              <textarea
                aria-label="Pasted text"
                value={open?.text ?? ""}
                onChange={(e) => { const text = e.target.value; setAtts((a) => a.map((x) => (x.id === viewing ? { ...x, text, size: text.length } : x))); }}
              />
              <footer>
                <button type="button" className="src-btn is-quiet mo-small" onClick={() => viewing && dropAtt(viewing)}>Remove</button>
                <span className="sp" />
                <button type="button" className="src-btn is-primary mo-small" onClick={() => setViewing(null)}>Done</button>
              </footer>
            </div>
          </Dialog>
        );
      })()}

      {/* One line, and only the mode's own description. The stage list used to
          be appended here, which pinned ~80 characters of grey text to the
          bottom of every screen once the composer became sticky — and the
          stages already announce themselves inside a running turn, where they
          are actually information rather than a caption. */}
      {/* ── THE BRIEF GAUGE ──
          Six facets of an intake brief. As prose lands in one, that slot takes
          its facet's colour and shows the words it caught, so you can see what
          was UNDERSTOOD rather than guessing — the research measures 30-60s per
          message in conversational input, most of it spent re-reading and
          re-typing because nothing confirms what landed.

          ── AND IT NO LONGER RENDERS EMPTY ──
          It used to render always, on the argument that "a design is judged on
          its resting state" and that six outlines naming a brief's parts
          "teaches what to say without a form". Reported as cluttered, and the
          argument does not survive checking:

          • It did not teach. The resting labels came from `FACET_PROMPT` —
            Level / Skills / Scale / Location / Background / Experience — which
            was not a set of prompts but a second list of the same six category
            nouns. "Scale" does not tell you to write "Series B", and
            "Background" does not tell you to write "came from infra".
          • It RENAMED itself on fill. `FACET_PROMPT` and `FACET_LABEL` are
            different words for the same facets, so "Level" became "Seniority"
            and "Background" became "Company" the moment they filled — the slot
            that asked for something changed its name once you answered it, and
            the reader loses the mapping.
          • It was below the visibility floor anyway. The empty outline is
            `1px dashed var(--rule)`, measured 1.43:1 on white against a 3:1
            floor for a meaningful boundary. Six near-invisible dashes is not
            structure, it is the visual noise it was reported as.
          • It was redundant. `TRY A SEARCH` sits directly beneath it in the
            same state and teaches the same thing properly — three complete,
            clickable briefs instead of six nouns.

          So the mechanism stays and the empty state goes. The resting surface
          still has a point of view; it is carried by the suggestions, which
          earn it. */}
      {/* What the brief covers is shown IN the text now: words that give a
          role, experience, skills, location or industry turn orange as they
          are typed (see highlightRuns). The separate chips and labels that
          used to sit here are gone. */}

    </div>
    </>
  );
}

/* ── the docked bar's one control ────────────────────────────────────────── */

function TuneMenu({
  mode, onMode, jd, filterCount, onOpenJd, onOpenFilters,
}: {
  mode: ModeId;
  onMode: (m: ModeId) => void;
  jd: Jd | null;
  filterCount: number;
  onOpenJd: () => void;
  onOpenFilters: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const set = (jd ? 1 : 0) + filterCount;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const Current = LIVE ? null : MODES.find((m) => m.id === mode)!.Icon;

  return (
    <div className="orc-tune-wrap" ref={wrap}>
      <button
        type="button"
        className={`orc-tune${open ? " is-open" : ""}${set ? " is-set" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={LIVE ? "Job description and filters" : "Mode, job description and filters"}
        onClick={() => setOpen((o) => !o)}
      >
        {!LIVE && Current && <Current size={14} weight="bold" aria-hidden="true" />}
        <SlidersHorizontal size={14} weight="bold" aria-hidden="true" />
        {set > 0 && <b className="orc-tune-n" key={set}>{set}</b>}
      </button>
      {open && (
        <div className="orc-tune-pop" role="menu">
          {!LIVE && (
            <div className="orc-tune-modes" role="radiogroup" aria-label="Mode">
              {MODES.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`orc-tune-mode${mode === m.id ? " is-on" : ""}`} onClick={() => onMode(m.id)}>
                  <m.Icon size={14} weight={mode === m.id ? "fill" : "regular"} aria-hidden="true" />{m.label}
                </button>
              ))}
            </div>
          )}
          <button type="button" role="menuitem" className="orc-tune-item" onClick={() => { setOpen(false); onOpenJd(); }}>
            <span className="orc-ctx-ico" aria-hidden="true">{jd ? <Check size={12} weight="bold" /> : <FileText size={14} weight="bold" />}</span>
            <span className="orc-tune-l"><b>Job description</b><small>{jd ? jd.name : "Rank against the role as written"}</small></span>
          </button>
          <button type="button" role="menuitem" className="orc-tune-item" onClick={() => { setOpen(false); onOpenFilters(); }}>
            <span className="orc-ctx-ico" aria-hidden="true"><FunnelSimple size={14} weight="bold" /></span>
            <span className="orc-tune-l"><b>Filters</b><small>{filterCount ? `${filterCount} set` : "Location, seniority, company…"}</small></span>
            {filterCount > 0 && <b className="orc-ctx-n">{filterCount}</b>}
          </button>
        </div>
      )}
    </div>
  );
}

