import { ArrowUp, Check, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bento } from "./Bento";
import { BorderGlow } from "./glow";
import { CampaignHead } from "./CampaignHead";
import {
  BRIEFS, MODES, SOURCING_CONTEXT, STAGES, SUGGESTIONS,
} from "./orchestrator";
import type { ModeId } from "./orchestrator";
import { REPLIES } from "./replies";
import { Prompt, Reply } from "./Reply";
import { Rail } from "./Rail";
import { Tasks } from "./Tasks";
import { TileGallery, TileMenu } from "./TileMenu";
import { useTileLayout } from "./tileLayout";
import type { Campaign } from "./workspaces";

/**
 * Home — the orchestrator.
 *
 * The surface a recruiter works in: a configurable bento of what is happening,
 * the tasks they owe someone today, and a composer that briefs an agent.
 *
 * ── WHAT THE PREVIOUS VERSION GOT WRONG ─────────────────────────────────────
 * It rendered four identical text-only cards on a warm beige ground and left
 * ~61% of the viewport empty, because the landing state and the transcript
 * shared one bottom-anchored layout. It also had nothing to DO: no tasks, no
 * configuration, no representation of a quantity anywhere on the page. A
 * recruiter could not tell whether 61 contacted was good, which is the only
 * question that number gets asked.
 *
 * Three structural fixes, in order of how much they mattered:
 *
 *   1. Anchoring is per state. The landing content flows from the top and
 *      fills; a transcript hugs the composer and grows upward. One rule could
 *      not serve both, and conflating them is what produced the empty page.
 *   2. The bento is CONFIGURED, not hard-coded. Eight tile kinds, each
 *      structurally different — a ring, a funnel, a face stack, a file list, a
 *      time strip. Size, colour, order and membership are the recruiter's.
 *   3. A reply is an ARTEFACT. Sections you can review and act on, not a
 *      sentence you read and then retype somewhere else.
 *
 * ── WHAT IS NOT WIRED ───────────────────────────────────────────────────────
 * All of it. Every fixture names the table it stands in for, the reply says so
 * in plain words, and no control implies a capability the backend lacks. The
 * agent's stage list is the plan it will execute, not a performance of work
 * that already happened.
 */

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
};

export function Home({ campaign }: { campaign: Campaign }) {
  const [mode, setMode] = useState<ModeId>("sourcing");
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<string[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeBrief, setActiveBrief] = useState<string | null>(null);
  const nextId = useRef(1);
  const streamRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const tiles = useTileLayout();
  /* The menu holds the element it was opened from, not just the id: it anchors
     to that button and returns focus to it on dismissal. */
  const [menu, setMenu] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [gallery, setGallery] = useState<HTMLElement | null>(null);

  /* Where the mark flew from, so the new turn can FLIP it into place. Cleared
     once consumed — a stale origin would make a later turn fly in from a
     button that has since moved. */
  const [flight, setFlight] = useState<{ id: number; x: number; y: number } | null>(null);
  /* STABLE, and that is load-bearing. As an inline arrow this changed identity
     on every Home render, so the turn's flight effect re-ran — and its cleanup
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
    setDraft(prompt);
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    /* Caret to the end rather than selecting the text: a selection means the
       next keystroke destroys the suggestion, which is the opposite of handing
       someone a draft. */
    const n = prompt.length;
    el.setSelectionRange(n, n);
  }, []);

  const send = useCallback(() => {
    const said = draft.trim();
    if (!said) return;
    /* Optimistic: the turn is on screen before anything else happens. Standard
       practice for a composer and worth 100-300ms of perceived latency even
       when, as here, there is no request to wait for. */
    const id = nextId.current++;
    /* Measured BEFORE the state change, because sending empties the composer
       and the button can shift as the field collapses back to one row. */
    const r = sendRef.current?.getBoundingClientRect();
    if (r) setFlight({ id, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setTurns((t) => [
      ...t,
      {
        id, said, mode, stage: 0, startedAt: Date.now(), thoughtMs: null,
        replyIndex: (id - 1) % REPLIES[mode].length,
      },
    ]);
    setDraft("");
  }, [draft, mode]);

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

  /* Keep the newest turn in view.
     The PAGE is the scroller now, not the stream — the stream's own
     `overflow` was removed because it never actually scrolled (nothing above
     it constrains its height) and its phantom scrollport was preventing the
     composer from sticking. So this scrolls the window, and scrolls to the
     bottom because the composer is the last thing there. */
  useEffect(() => {
    if (turns.length === 0) return;
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const contextFor = mode === "sourcing" ? SOURCING_CONTEXT : [];
  const started = turns.length > 0;
  const menuSpec = menu ? tiles.layout.find((t) => t.id === menu.id) : undefined;

  return (
    <div className="orc">
      <div className="orc-main">
        <CampaignHead
          campaign={campaign}
          onCustomise={(el) => setGallery(el)}
        />

        <div className="orc-stream" ref={streamRef}>
          {!started ? (
            <div className="orc-open">

              <Bento
                layout={tiles.layout}
                campaign={campaign}
                onOpen={seed}
                onEditTile={(id, el) => setMenu({ id, el })}
                onReorder={tiles.reorder}
                reorderable
              />

              <Tasks onOpen={seed} />
            </div>
          ) : (
            turns.map((t) => (
              <TurnView
                key={t.id}
                turn={t}
                flyFrom={flight?.id === t.id ? flight : null}
                onFlown={clearFlight}
                onAnswer={seed}
              />
            ))
          )}

          {/* Sits in the flow, a little below the vertical centre, with the
              recommendations under it. It is a child of the stream rather than
              a sibling grid row so it shares the column's exact content box —
              as a sibling it did not inherit the same padding and its right
              edge sat 15px wider than every block above it. */}
          <Composer
            draft={draft}
            onDraft={setDraft}
            mode={mode}
            onMode={setMode}
            context={contextFor}
            attached={attached}
            onAttach={(id) =>
              setAttached((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
            }
            onSend={send}
            sendRef={sendRef}
            areaRef={areaRef}
            sending={flight !== null}
          />

          {/* ── RECOMMENDATIONS, BELOW THE COMPOSER ──
              Searches worth running, under the field you would run them in.
              They used to sit ABOVE it, between the task list and the
              composer, where they read as more page content rather than as
              options for the thing beneath them. Below the field the
              relationship is unambiguous.

              Landing state only: a list of starting points is noise once a
              brief is already running. */}
          {!started && (
            <section className="orc-recs" aria-label="Recommended searches">
              <h2 className="orc-recs-k">Try a search</h2>
              <ul className="orc-recs-list">
                {SUGGESTIONS[mode].map((sug) => (
                  <li key={sug}>
                    <button type="button" className="orc-rec" onClick={() => seed(sug)}>
                      <MagnifyingGlass size={13} weight="bold" aria-hidden="true" />
                      <span>{sug}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <Rail
        campaign={campaign}
        onOpen={seed}
        activeBriefId={activeBrief}
        onNewBrief={() => {
          setActiveBrief(null);
          setTurns([]);
          areaRef.current?.focus();
        }}
        onPickBrief={(id) => {
          setActiveBrief(id);
          /* Selecting a past brief seeds its title rather than pretending to
             load a transcript that was never stored. */
          const b = BRIEFS.find((x) => x.id === id);
          if (b) {
            setMode(b.mode);
            seed(b.title);
          }
        }}
      />

      {menu && menuSpec && (
        <TileMenu
          spec={menuSpec}
          anchor={menu.el}
          layout={tiles}
          onClose={() => setMenu(null)}
        />
      )}

      {gallery && (
        <TileGallery anchor={gallery} layout={tiles} onClose={() => setGallery(null)} />
      )}
    </div>
  );
}

/* ── a turn ──────────────────────────────────────────────────────────────── */

function TurnView({
  turn, flyFrom, onFlown, onAnswer,
}: {
  turn: Turn;
  flyFrom: { x: number; y: number } | null;
  onFlown: () => void;
  /** A clarifying question's options seed the composer; they never act. */
  onAnswer: (text: string) => void;
}) {
  const stages = STAGES[turn.mode];
  const running = turn.stage >= 0;
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
          {running ? (
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

function Composer({
  draft, onDraft, mode, onMode, context, attached, onAttach, onSend,
  sendRef, areaRef, sending,
}: {
  draft: string;
  onDraft: (v: string) => void;
  mode: ModeId;
  onMode: (m: ModeId) => void;
  context: readonly { id: string; label: string; Icon: typeof ArrowUp; hint: string }[];
  attached: string[];
  onAttach: (id: string) => void;
  onSend: () => void;
  /* Non-nullable element type: `useRef<HTMLButtonElement>(null)` yields
     `RefObject<HTMLButtonElement>`, and React 18's LegacyRef will not accept
     the nullable form when the ref is passed to `ref=` rather than merely
     read. The switcher's `anchor` prop gets away with the nullable type
     because nothing forwards it to an element. */
  sendRef: React.RefObject<HTMLButtonElement>;
  /* Lifted to Home so a tile or task can hand the caret over after seeding. */
  areaRef: React.RefObject<HTMLTextAreaElement>;
  /* True for the length of the flight. The arrow recedes while the mark is in
     the air, so the two are never both on screen — that is what makes it read
     as a handoff rather than as a copy. */
  sending: boolean;
}) {
  /* Grows upward with its content, capped so a long brief scrolls instead of
     pushing the transcript off screen. Height is set from scrollHeight rather
     than animated — animating a layout-driving property is what animate.md
     warns against, and there is nothing to communicate here anyway. */
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [draft, areaRef]);

  const ready = draft.trim().length > 0;

  return (
    <div className="orc-composer">
      <div className="orc-composer-field">
        {/* The travelling ring. §4.4: this belongs to the CLASS "a field you
            are about to type into", so quick find, the switcher's search and
            this all light the same way. The CSS trigger existed for a while
            before this line did, which is a reminder that a selector matching
            nothing fails silently. */}
        <BorderGlow />
        <textarea
          ref={areaRef}
          className="orc-input"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          placeholder={mode === "sourcing"
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
                {m.label}
              </button>
            ))}
          </div>

          {/* Sourcing-only. The slots are not decoration — they are the two
              things that change what a sourcing run returns, so they sit on the
              composer rather than in a settings page nobody opens mid-brief. */}
          {context.length > 0 && (
            <div className="orc-slots">
              {context.map((c) => {
                const on = attached.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`orc-slot${on ? " is-on" : ""}`}
                    aria-pressed={on}
                    title={c.hint}
                    onClick={() => onAttach(c.id)}
                  >
                    {on
                      ? <Check size={13} weight="bold" aria-hidden="true" />
                      : <Plus size={13} weight="bold" aria-hidden="true" />}
                    {c.label}
                  </button>
                );
              })}
            </div>
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
      <p className="orc-composer-note">{MODES.find((m) => m.id === mode)?.blurb}</p>
    </div>
  );
}
