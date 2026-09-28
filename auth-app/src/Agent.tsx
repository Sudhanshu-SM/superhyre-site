import { ArrowUp, Check, FileText, FunnelSimple, SlidersHorizontal } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Campaigns } from "./Campaigns";
import type { Deployed } from "./Campaigns";
import { BorderGlow } from "./glow";
import { BRIEFS, MODES, SCOPED, SOURCING_CONTEXT, STAGES } from "./orchestrator";
import type { CampaignKey, ModeId, PipelineRole } from "./orchestrator";
import { Rail } from "./Rail";
import { REPLIES } from "./replies";
import { Prompt, Reply } from "./Reply";
import { Recs } from "./Recs";
import { highlightRuns } from "./slots";
import { ProfileSidebar } from "./ProfileSidebar";
import { FiltersDialog } from "./FiltersDialog";
import { JdDialog } from "./JdDialog";
import type { Jd } from "./JdDialog";
import { activeCount, fromBrief } from "./filters";
import type { Values } from "./filters";
import { RankedMatches } from "./RankedMatches";
import { SourcingRun } from "./Sourcing";
import { CANDIDATES } from "./sourcing";
import { ConnectorsProvider } from "./connectors";
import { Moment } from "./Moments";
import { campaignName } from "./orchestrator";
import { classify } from "./moments";
import type { MomentCtx, MomentKind } from "./moments";
import type { Verdict } from "./sourcing";
import type { Campaign } from "./workspaces";

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
};

export function Agent({
  campaign, handoff, onHandoffTaken,
}: {
  campaign: Campaign;
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
  const draftApi = useRef<{ get: () => string; set: (t: string) => void }>({ get: () => "", set: () => {} });
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
  const [turns, setTurns] = useState<Turn[]>([]);
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
  const onVerdict = useCallback((id: string, v: Verdict | null) => {
    setVerdicts((all) => {
      const next = { ...all };
      if (v) next[id] = v;
      else delete next[id];
      return next;
    });
  }, []);
  const nextId = useRef(1);
  /* Whether the transcript should follow new content. See `nudge`. */
  const pinned = useRef(true);
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
     state change, and `exitAt` is where the heading and the suggestion list
     were sitting at that same instant. Both are refs rather than state: they
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
  const exitAt = useRef<{ intro: number; recs: number } | null>(null);
  /* True while the landing-state blocks are on their way out. They stay
     mounted for it — an element cannot be animated away after it has already
     been removed from the tree, which is why they used to vanish between one
     frame and the next while everything around them eased. */
  const [exiting, setExiting] = useState(false);

  /* Declared here rather than beside `contextFor` further down: the FLIP and
     the autosize effect both key on it, and a `const` below them is a
     use-before-declaration. It is derived, not state — `turns` is the single
     source of truth for whether a conversation exists. */
  const started = turns.length > 0;
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
  const seed = useCallback((prompt: string) => {
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

  /* The background mark shows only in the default view: nothing typed,
     nothing previewed. Written straight onto the element, because the draft
     lives in the composer so typing never re-renders this page. */
  const markRef = useRef<HTMLSpanElement>(null);
  const onIdle = useCallback((idle: boolean) => {
    const el = markRef.current;
    if (el) el.dataset.idle = idle ? "1" : "";
  }, []);

  /* ── PICKING AN IDEA TYPES IT IN ──
     Rather than the whole sentence appearing at once, it writes itself into
     the composer over a fraction of a second, so the hand-off from card to
     field is something you watch happen. Only the composer re-renders per
     frame. Reduced motion gets the plain seed. */
  const typing = useRef(0);
  const seedTyped = useCallback((prompt: string) => {
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
    const said = draftApi.current.get().trim();
    if (!said) return;

    /* ── MEASURE THE OLD LAYOUT WHILE IT IS STILL THE LAYOUT ──
       Only on the FIRST send: that is the one that rearranges the page. Every
       later send leaves the composer exactly where it is, and running a FLIP
       with a zero delta would be 480ms of nothing.

       `offsetTop` for the two departing blocks rather than a viewport rect —
       they are re-anchored against their own offset parent on the way out, so
       an offset is the number that survives them leaving the flow. */
    if (turns.length === 0) {
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
      const recs = streamRef.current?.querySelector<HTMLElement>(".orc-recs");
      exitAt.current = { intro: intro?.offsetTop ?? 0, recs: recs?.offsetTop ?? 0 };
      setExiting(true);
    }
    /* Optimistic: the turn is on screen before anything else happens. Standard
       practice for a composer and worth 100-300ms of perceived latency even
       when, as here, there is no request to wait for. */
    const id = nextId.current++;
    /* Measured BEFORE the state change, because sending empties the composer
       and the button can shift as the field collapses back to one row. */
    const r = sendRef.current?.getBoundingClientRect();
    if (r) setFlight({ id, x: r.left + r.width / 2, y: r.top + r.height / 2 });
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
  }, [mode, deploy, campaign]);

  const deploySourcing = useCallback(() => {
    const key = SCOPED.find((k) => k === campaign.id);
    if (key) deploy("Sourcing", campaign.name, key);
  }, [deploy, campaign]);

  /* A sourcing run grows long after its turn was added, so it asks for the
     newest content to be brought into view. Only when the reader is already
     near the bottom: someone who scrolled up to reread is not yanked back. */
  /* `pinned` is cleared only by the reader's own intent — a wheel or touch
     upward — never by a scroll event, because a smooth programmatic scroll
     passes through positions far from the bottom on its way there. */
  /* ── WHICHEVER THING SCROLLS ──
     At full height the log is its own scrollport. Below 1000px tall the
     viewport lock comes off and the PAGE scrolls instead, with the composer
     stuck to the foot of the window — so "follow" means bringing the end of
     the transcript to just above the composer, by scrolling the page. */
  const overflow = useCallback((): number => {
    const log = logRef.current;
    const comp = composerRef.current;
    const last = log?.lastElementChild;
    if (!log || !comp || !last) return 0;
    if (getComputedStyle(log).overflowY !== "visible") {
      return log.scrollHeight - log.scrollTop - log.clientHeight;
    }
    /* The composer is sticky at the foot of the window, so the end of the
       transcript should sit just above where the composer RESTS on screen —
       the window's bottom minus its height — not above where it sits in flow. */
    return last.getBoundingClientRect().bottom - (window.innerHeight - comp.offsetHeight) + 16;
  }, []);

  const nudge = useCallback(() => {
    if (!pinned.current) return;
    requestAnimationFrame(() => {
      const log = logRef.current;
      if (!log) return;
      if (getComputedStyle(log).overflowY !== "visible") {
        log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
        return;
      }
      const d = overflow();
      if (d > 4) window.scrollBy({ top: d, behavior: "smooth" });
    });
  }, [overflow]);

  /* ── STAY AT THE BOTTOM WHILE THE PAGE MOVES UNDER THE LOG ──
     Two things change the log's geometry without a new turn: a run growing
     inside its turn, and the live band arriving at the foot of the page,
     which takes ~180px off the log's height in one step. Either one used to
     leave the newest block — the Run search button, typically — under the
     composer. One observer on the log's box and on its content covers both. */
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const unpin = (e: WheelEvent | TouchEvent) => {
      if (e instanceof WheelEvent && e.deltaY >= 0) return;
      pinned.current = false;
    };
    const repin = () => {
      if (overflow() < 60) pinned.current = true;
    };
    const stream = streamRef.current ?? log;
    stream.addEventListener("wheel", unpin, { passive: true });
    stream.addEventListener("touchmove", unpin, { passive: true });
    log.addEventListener("scroll", repin, { passive: true });
    window.addEventListener("scroll", repin, { passive: true });
    const ro = new ResizeObserver(() => nudge());
    ro.observe(log);
    const watchKids = () => Array.from(log.children).forEach((k) => ro.observe(k));
    watchKids();
    const mo = new MutationObserver(watchKids);
    mo.observe(log, { childList: true });
    return () => {
      stream.removeEventListener("wheel", unpin);
      stream.removeEventListener("touchmove", unpin);
      log.removeEventListener("scroll", repin);
      window.removeEventListener("scroll", repin);
      ro.disconnect();
      mo.disconnect();
    };
  }, [nudge, overflow]);

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
      duration: 750,
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

  /* ── THE LANDING COMPOSER SITS ON THE CONFIGURATION PANEL'S BASELINE ──
     Measured, not derived: the rail's panels change height with their
     content and the window, so the gap under the heading and the ideas is
     sized so the composer field's bottom edge lands exactly on the bottom
     edge of the rail's Configuration panel. Landing only, and only when the
     rail is beside the column (not stacked under it on narrow screens). The
     send animation measures its start after this, so the dock is unchanged. */
  const [landPush, setLandPush] = useState(0);
  /* And the heading sits on the line of the rail's first label ("Last 7
     days"), which moves with the window because the rail centres itself on
     tall screens. Measured in the same pass so the composer's push can
     account for the heading moving in the same frame. */
  const [headDrop, setHeadDrop] = useState(0);
  useLayoutEffect(() => {
    if (started) return;
    /* ── WHERE THINGS WILL REST, NOT WHERE THEY ARE MID-ENTRANCE ──
       The rail's panels rise into place when the page mounts. A rect taken
       during that rise includes the animation's translate, so arriving from
       another page seated the composer too low and a later re-measure moved
       it up in front of the user. Offsets would ignore the transform but the
       rail is sticky, and offsets report its un-stuck position. So: take the
       rect, and subtract the vertical translate currently applied by any
       ancestor of the panel, which is exactly what the entrance adds. */
    const shift = (el: HTMLElement) => {
      let ty = 0;
      for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
        const t = getComputedStyle(n).transform;
        if (t && t !== "none") ty += new DOMMatrixReadOnly(t).m42;
      }
      return ty;
    };
    const restingBottom = (el: HTMLElement) => el.getBoundingClientRect().bottom - shift(el);
    const restingTop = (el: HTMLElement) => el.getBoundingClientRect().top - shift(el);
    const measure = () => {
      const cfg = document.querySelector<HTMLElement>(".rail-config");
      const field = composerRef.current?.querySelector<HTMLElement>(".orc-composer-field");
      if (!cfg || !field) return;
      if (cfg.getBoundingClientRect().left < field.getBoundingClientRect().right) { setLandPush(0); setHeadDrop(0); return; }
      const style = getComputedStyle(logRef.current ?? field);
      const appliedDrop = parseFloat(style.getPropertyValue("--head-drop")) || 0;
      const label = document.querySelector<HTMLElement>(".rail-sec-title");
      const head = streamRef.current?.querySelector<HTMLElement>(".orc-intro-h");
      /* Text on text: the heading's glyph box, not its line box, meets the
         label's, so both are offset by their half-leading. */
      const glyphTop = (el: HTMLElement) => {
        const c = getComputedStyle(el);
        return restingTop(el) + (parseFloat(c.lineHeight) - parseFloat(c.fontSize)) / 2;
      };
      const drop = label && head ? Math.round(glyphTop(label) - (glyphTop(head) - appliedDrop)) : 0;
      /* Never pulled up past the column's own top padding. */
      const nextDrop = Math.max(-24, drop);
      setHeadDrop((cur) => (Math.abs(nextDrop - cur) > 1 ? nextDrop : cur));
      /* Idempotent: the push currently IN THE DOM is subtracted to get the
         field's unpushed position, and the push is set to the exact target.
         Adding a delta to the state instead double-counted whenever two
         measurements ran before a re-render (the observer's first callback
         and this effect), and the composer overshot by the whole gap. */
      const applied = parseFloat(style.getPropertyValue("--land-push")) || 0;
      const fieldRest = restingBottom(field) - applied - appliedDrop + nextDrop;
      const target = Math.max(0, Math.round(restingBottom(cfg) - fieldRest));
      setLandPush((cur) => (Math.abs(target - cur) > 1 ? target : cur));
    };
    measure();
    const ro = new ResizeObserver(measure);
    const cfg = document.querySelector(".rail-config");
    if (cfg) ro.observe(cfg);
    if (streamRef.current) ro.observe(streamRef.current);
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
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
    const id = window.setTimeout(() => setExiting(false), 780);
    return () => window.clearTimeout(id);
  }, [exiting]);

  /* ── KEEP THE NEWEST TURN IN VIEW ──
     This scrolled the WINDOW, on the reasoning that the page was the scroller
     and the stream's own overflow was a phantom. Both halves stopped being
     true: the shell is viewport-locked now, so the window does not scroll at
     all, and the transcript is a real scrollport with the composer docked
     beneath it. Scrolling the window was therefore a no-op and the newest
     reply stayed off the bottom of the log.

     `scrollHeight` on the log, not `scrollIntoView` on the turn: the log's
     top is masked, and scrolling an element into view can land it under that
     fade. The bottom is unmasked precisely because it is where the newest
     thing lives. */
  useEffect(() => {
    if (turns.length === 0) return;
    const log = logRef.current;
    if (!log) return;
    log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
    nudge();
  }, [turns, nudge]);

  const contextFor = mode === "sourcing" ? SOURCING_CONTEXT : [];




  /* Take a prompt handed over from another page, once.
     `onHandoffTaken` clears it at the source, so returning to this page later
     does not re-seed a brief the user already edited or sent. Depending on
     `seed` is safe because it is stable. */
  useEffect(() => {
    if (handoff === null) return;
    seed(handoff);
    onHandoffTaken();
  }, [handoff, onHandoffTaken, seed]);

  return (
    <ConnectorsProvider>
    <div className="orc">
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
          {/* The transcript owns the scroll, not the column: the composer has
              to stay put while the messages move under it. */}
          {/* The mark, very faint, behind the landing view. It is the brand
              saying whose surface this is before anything is typed, and it
              fades out with the heading when a conversation starts. */}
          {(!started || exiting) && (
            <span ref={markRef} className={`orc-bgmark${exiting ? " is-out" : ""}`} aria-hidden="true" data-idle="1">
              <Mark />
            </span>
          )}
          <div className="orc-log" ref={logRef} style={!started ? { ["--land-push" as string]: `${landPush}px`, ["--head-drop" as string]: `${headDrop}px`, minHeight: 0 } : undefined}>
          {started && turns.map((t) => (
            <TurnView
              key={t.id}
              turn={t}
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
                  setProfile({ id: cid, ids: ids ?? CANDIDATES.map((c) => c.id) }),
                openList: () => { setProfile(null); setMatchesOpen(true); },
                deploy: (role, cid) => deploy(role, campaignName(cid), cid),
                undeploy,
                seed,
                onGrow: nudge,
                prefs,
                setPref,
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
                {/* Ideas to start from, ABOVE the composer: they are what you
                    read before you write, and placing them here also rests
                    the composer lower on the landing page. They leave with
                    the heading when a brief is sent. */}
                <Recs
                  mode={mode}
                  onPick={seedTyped}
                  onPreview={setPreview}
                  disabled={exiting}
                />
              </div>
            )}
          </div>

          <Composer
            started={started}
            api={draftApi}
            mode={mode}
            onMode={setMode}
            context={contextFor}
            jd={jd}
            filterCount={activeCount(filters)}
            onOpenJd={() => setJdOpen(true)}
            onOpenFilters={openFilters}
            onSend={send}
            sendRef={sendRef}
            areaRef={areaRef}
            rootRef={composerRef}
            sending={flight !== null}
            preview={preview}
            onIdle={onIdle}
          />


        </div>
      </div>

      {/* ── THE FEED IS A BAND ACROSS THE FOOT OF THE PAGE ──
          It sat inside the heading block of the left column, which framed it
          as a feature of the conversation. It is not: it reports on work
          running across every campaign, so it belongs under BOTH columns
          rather than beside one.

          As a row of the page grid it spans the full width and inherits the
          page's own side margins — which is what "full width with spacing
          from the ends" means here. The band is not wider than the page; it
          is exactly as wide as the page, which nothing else on this screen
          is. */}
      <Campaigns
        scope="all"
        onOpenBrief={seed}
        deployed={deployed}
        onDeploy={deploy}
        reserve={started}
      />

      <Rail
        campaign={campaign}
        activeBriefId={activeBrief}
        onNewBrief={() => {
          setActiveBrief(null);
          setTurns([]);
          setMatchesOpen(false);
          setProfile(null);
          areaRef.current?.focus();
        }}
        onPickBrief={(id) => {
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

      <RankedMatches
        open={matchesOpen}
        onClose={() => { setProfile(null); setMatchesOpen(false); }}
        verdicts={verdicts}
        onVerdict={onVerdict}
        activeId={profile?.id ?? null}
        onOpen={(id, ids) => setProfile({ id, ids })}
      />

      <ProfileSidebar
        candidate={profile ? CANDIDATES.find((c) => c.id === profile.id) ?? null : null}
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
      />
    </div>
    </ConnectorsProvider>
  );
}

/* ── a turn ──────────────────────────────────────────────────────────────── */

function TurnView({
  turn, flyFrom, onFlown, onAnswer, sourcingProps, momentCtx,
}: {
  turn: Turn;
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
  const running = selfRun ? busy : turn.stage >= 0;
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
    openList: () => ctxRef.current.openList(),
    deploy: (role, cid) => ctxRef.current.deploy(role, cid),
    undeploy: (key) => ctxRef.current.undeploy(key),
    seed: (text) => ctxRef.current.seed(text),
    onGrow: () => ctxRef.current.onGrow(),
    get prefs() { return ctxRef.current.prefs; },
    setPref: (k, v) => ctxRef.current.setPref(k, v),
    onBusy: setBusy,
  }), []);
  const mark = useRef<HTMLSpanElement>(null);

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
    <article className="orc-turn">
      <Prompt text={turn.said} />

      <div className="orc-answer">
        {/* The mark, which is the agent. It stays STILL while the brief runs;
            a ring sweeps around it instead.

            It used to rotate in stepped thirds. Spinning a logo is the
            cheapest possible loader and it fights what a logo is for — an
            identity that tumbles reads as a throbber rather than a presence.
            The motion moved to a ring outside it: an arc whose dash length
            compresses and expands as it travels, so the orbit has a pulse
            instead of being a uniform circle going round. The mark sits
            inside it unmoved, and is still the same element that flew in from
            the send button. */}
        <span ref={mark} className={`orc-mark${running ? " is-working" : ""}`} aria-hidden="true">
          {running && (
            <svg className="orc-orbit" viewBox="0 0 32 32">
              {/* pathLength normalises the circumference so the dash values
                  are percentages independent of r. A calc() resolving to a
                  bare number is invalid for stroke-dasharray and fails
                  silently — the same trap documented at .glow-ring. */}
              <circle cx="16" cy="16" r="14" pathLength={100} />
            </svg>
          )}
          <Mark />
        </span>

        <div className="orc-answer-body">
          {turn.kind === "sourcing" ? (
            <SourcingRun {...sourcingProps} onBusy={setBusy} />
          ) : turn.kind !== "reply" ? (
            <Moment kind={turn.kind} ctx={ctx} />
          ) : running ? (
            <p className="orc-stage" aria-live="polite">
              {stages[turn.stage]}
              <span className="orc-stage-dots" aria-hidden="true">
                <i /><i /><i />
              </span>
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
 * Stated as two numbers rather than one so the intent — THREE LINES — survives
 * a change to the type size, and so the mismatch is visible if the CSS moves.
 */
const REST_LINES = 3;
const LINE_H = 22;

function Composer({
  api, mode, onMode, context, jd, filterCount, onOpenJd, onOpenFilters, onSend,
  sendRef, areaRef, rootRef, sending, started, preview, onIdle,
}: {
  /** True while the field is empty and nothing is being previewed. */
  onIdle?: (idle: boolean) => void;
  /** An idea being hovered, shown as ghost text while the field is empty. */
  preview: string | null;
  /** True once a brief has been sent; the field then rests at one line. */
  started: boolean;
  /** How the page reads and sets the draft without owning it. */
  api: React.MutableRefObject<{ get: () => string; set: (t: string) => void }>;
  mode: ModeId;
  onMode: (m: ModeId) => void;
  context: readonly { id: string; label: string; Icon: typeof ArrowUp; hint: string }[];
  jd: Jd | null;
  filterCount: number;
  onOpenJd: () => void;
  /** Opens the filters, pre-filled from what the draft already says. */
  onOpenFilters: (draft: string) => void;
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
  api.current = { get: () => draftNow.current, set: setDraft };

  const idle = !draft && !preview;
  useEffect(() => { onIdle?.(idle); }, [idle, onIdle]);

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
     as a search box rather than as somewhere you write a brief — and a brief
     is several lines, so the resting size should say so. The floor is three
     lines of the field's own 21.75px leading, rounded up.

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
       Three lines at rest, because a brief is several lines and the field
       should say so before one is written. One line once a transcript exists:
       the conversation is the subject then and the field is the instrument,
       so it gives the room back. Either way the autosize still grows it the
       moment the draft needs more. */
    const floor = (started ? 1 : REST_LINES) * LINE_H;
    const target = Math.max(floor, Math.min(el.scrollHeight, 168));
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

  const ready = draft.trim().length > 0;

  return (
    <div className="orc-composer" ref={rootRef}>
      <div className="orc-composer-field">
        {/* The travelling ring. §4.4: this belongs to the CLASS "a field you
            are about to type into", so quick find, the switcher's search and
            this all light the same way. The CSS trigger existed for a while
            before this line did, which is a reminder that a selector matching
            nothing fails silently. */}
        <BorderGlow />
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
          placeholder={preview && !draft ? preview : started
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
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        </div>

        <div className="orc-composer-row">
          <div className="orc-modes" role="radiogroup" aria-label="Mode">
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
          </div>

          {/* Sourcing-only. The slots are not decoration — they are the two
              things that change what a sourcing run returns, so they sit on the
              composer rather than in a settings page nobody opens mid-brief. */}
          {/* Sourcing-only: the two things that change what a run returns.
              Each opens its own dialog and, once set, says so in place: the
              JD by name, the filters by count. Docked, they shrink to their
              icons with the count as a badge. */}
          {context.length > 0 && (
            <div className="orc-slots">
              <button
                type="button"
                className={`orc-gslot orc-ctx${jd ? " is-on" : ""}`}
                title={jd ? `Job description: ${jd.name}` : "Attach a job description"}
                onClick={onOpenJd}
              >
                <span className="orc-ctx-ico" aria-hidden="true">
                  {jd ? <Check size={12} weight="bold" /> : <FileText size={14} weight="bold" />}
                </span>
                <span className="orc-chip-l">{jd ? "JD attached" : "Job description"}</span>
              </button>
              <button
                type="button"
                className={`orc-gslot orc-ctx${filterCount ? " is-on" : ""}`}
                title={filterCount ? `${filterCount} filters set` : "Set filters"}
                onClick={() => onOpenFilters(draft)}
              >
                <span className="orc-ctx-ico" aria-hidden="true"><FunnelSimple size={14} weight="bold" /></span>
                <span className="orc-chip-l">{filterCount ? "Filters" : "Set filters"}</span>
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

  const Current = MODES.find((m) => m.id === mode)!.Icon;

  return (
    <div className="orc-tune-wrap" ref={wrap}>
      <button
        type="button"
        className={`orc-tune${open ? " is-open" : ""}${set ? " is-set" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mode, job description and filters"
        onClick={() => setOpen((o) => !o)}
      >
        <Current size={14} weight="bold" aria-hidden="true" />
        <SlidersHorizontal size={14} weight="bold" aria-hidden="true" />
        {set > 0 && <b className="orc-tune-n" key={set}>{set}</b>}
      </button>
      {open && (
        <div className="orc-tune-pop" role="menu">
          <div className="orc-tune-modes" role="radiogroup" aria-label="Mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`orc-tune-mode${mode === m.id ? " is-on" : ""}`} onClick={() => onMode(m.id)}>
                <m.Icon size={14} weight={mode === m.id ? "fill" : "regular"} aria-hidden="true" />{m.label}
              </button>
            ))}
          </div>
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

