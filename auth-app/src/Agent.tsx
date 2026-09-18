import { ArrowUp, Check, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FACET_HUE, FACET_LABEL, FACET_ORDER, read, segment,
} from "./brief";
import { Campaigns } from "./Campaigns";
import { BorderGlow } from "./glow";
import { BRIEFS, MODES, SOURCING_CONTEXT, STAGES, SUGGESTIONS } from "./orchestrator";
import type { ModeId } from "./orchestrator";
import { Rail } from "./Rail";
import { REPLIES } from "./replies";
import { Prompt, Reply } from "./Reply";
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
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<string[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeBrief, setActiveBrief] = useState<string | null>(null);
  const nextId = useRef(1);
  const streamRef = useRef<HTMLDivElement>(null);
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
    <div className="orc">
      <div className="orc-main">

        <div className="orc-stream" ref={streamRef}>
          {started
            ? turns.map((t) => (
                <TurnView
                  key={t.id}
                  turn={t}
                  flyFrom={flight?.id === t.id ? flight : null}
                  onFlown={clearFlight}
                  onAnswer={seed}
                />
              ))
            : (
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
              <div className="orc-intro">
                <h1 className="orc-intro-h">
                  {/* Two spans because the two words are different KINDS of
                      thing — the product, then the surface within it — and
                      that is the only honest place to put a colour break. */}
                  Superhyre <span className="orc-intro-mark">Agent</span>
                </h1>

                {/* ── THE FEED LIVES IN THE GAP, AND THE GAP WAS ALREADY THERE ──
                    This block carries a min-height that keeps the composer's
                    top on the rail's `Configuration` panel, which left a band
                    of empty air between the heading and the field that grew
                    with the window — 56px at an 809px viewport, 302px at 1300.
                    Empty padding at the top of the page is exactly where a
                    feed belongs, and putting it here changes no alignment
                    arithmetic at all: the block's height is unchanged, the
                    heading keeps its natural size, and the feed takes whatever
                    is left over and scrolls when that is not much. */}
                <Campaigns scope="all" onOpenBrief={seed} />
              </div>
            )}

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

          {/* Searches worth running, under the field you would run them in.
              Landing state only: a list of starting points is noise once a
              brief is already going. */}
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
        activeBriefId={activeBrief}
        onNewBrief={() => {
          setActiveBrief(null);
          setTurns([]);
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
  const mirrorRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(REST_LINES * LINE_H, Math.min(el.scrollHeight, 168))}px`;
  }, [draft, areaRef]);

  const ready = draft.trim().length > 0;

  /* What the draft has caught, keyed by facet, so a slot can ask the Map
     directly rather than filtering the match list once per slot. Grouped so
     one slot reads "Skill  Postgres, Go" instead of two slots both saying
     Skill. */
  const caught = (() => {
    const by = new Map<ReturnType<typeof read>[number]["facet"], string[]>();
    for (const m of read(draft)) {
      const list = by.get(m.facet);
      if (list) list.push(m.text);
      else by.set(m.facet, [m.text]);
    }
    return by;
  })();

  return (
    <div className="orc-composer">
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
          {segment(draft).map((run, i) =>
            run.match ? (
              <span
                key={i}
                className="orc-mark-span"
                style={{ ["--f" as string]: `var(--c-${FACET_HUE[run.match.facet]})` }}
              >
                {run.text}
              </span>
            ) : (
              <span key={i}>{run.text}</span>
            ),
          )}
          {/* A trailing newline keeps the mirror's height in step with the
              textarea's when the text ends in a line break, which a browser
              otherwise collapses in a div but not in a textarea. */}
          {"\n"}
        </div>
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
                    className={`orc-gslot${on ? " is-on" : ""}`}
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
      {caught.size > 0 && (
        <ul className="orc-gauge" aria-label="What this brief specifies">
          {/* FILTERED to what was actually caught, not mapped over all six.
              Mapping all six and rendering `hits!.join()` threw a TypeError on
              the first un-caught facet — a non-null assertion standing in for a
              guarantee the data does not make. Filtering first means every slot
              that exists is filled, so `on` is not a state any more and the
              conditional styling and the assertion both go with it. */}
          {FACET_ORDER.filter((f) => caught.has(f)).map((facet) => (
            <li
              key={facet}
              className="orc-gslot is-on"
              style={{
                background: `var(--c-${FACET_HUE[facet]}-tint)`,
                borderColor: `var(--c-${FACET_HUE[facet]}-line)`,
                color: `var(--c-${FACET_HUE[facet]}-text)`,
              }}
            >
              {/* One name per facet, from `FACET_LABEL`. The slot cannot rename
                  itself between states because there is only one state in which
                  it exists. */}
              <b>{FACET_LABEL[facet]}</b>
              <span className="orc-gslot-v">{caught.get(facet)!.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="orc-composer-note">{MODES.find((m) => m.id === mode)?.blurb}</p>
    </div>
  );
}
