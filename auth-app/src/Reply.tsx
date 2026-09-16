import {
  CaretDown, CaretRight, Copy, Lock, PencilSimple, SlidersHorizontal, Sparkle, Trash,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import type { Hue, ReplyArtefact, ReplyBlock } from "./orchestrator";
import type { AgentReply, QuickReply, TraceStep } from "./replies";
import { Chip } from "./viz";

/**
 * Reply — what the recruiter said, and the four things the agent can say back.
 *
 * ── THE ARTEFACT WAS RIGHT, AND BEING THE ONLY KIND MADE IT WRONG ───────────
 * The previous version of this file argued that an answer is not prose: it
 * rendered every reply as a REVIEWABLE OBJECT — an addressed card with
 * semantically coloured sections and the one act it waits for at the top —
 * because a sentence left the surface with nothing to do once the reply
 * landed. That is still the right shape for a shortlist or a batch of
 * outreach, and `ReplyBlock` is still that shape.
 *
 * It was the wrong shape for everything else, which was the actual problem.
 * Most answers to most questions are a paragraph. Dressing "148 sourced, 24
 * shortlisted, the bottleneck is your reply rate" as a card with a commit
 * button claims there is something to commit, and there is not — and once
 * every reply is a card, the card stops meaning "this one is special", which
 * is the only thing it was ever carrying. So there are now four kinds:
 *
 *   prose      paragraphs on the canvas. No card, no border, no background.
 *              The default, and it should look like nothing at all.
 *   question   the agent asks; the options seed the composer and the recruiter
 *              sends. The conversation continuing, not a form.
 *   trace      orthogonal to all of them: a disclosure on the `Thought for Ns`
 *              line showing the steps the run took and what each turned up.
 *   artefact   unchanged, and still the one with a card.
 *
 * ── NOTHING IS WIRED, AND EVERY DEAD CONTROL SAYS SO ────────────────────────
 * The commit button, the per-section pencils and the three actions under the
 * card all do nothing, because there is no backend behind any of them. They
 * are still drawn, because the artefact is not legible without them — an
 * artefact with no act on it is a paragraph again. Each one therefore carries:
 *
 *   - `aria-disabled` rather than `disabled`, which is the pattern Nav.tsx
 *     already uses for a control that exists but cannot act. It keeps the
 *     control in the tab order, which matters twice: assistive tech announces
 *     it as unavailable, and the section pencil could not reveal itself on
 *     :focus-visible if focus could never reach it.
 *   - `title="Not wired yet"`, and no click handler at all, so there is no
 *     path by which a press does something invisible.
 *   - a VISIBLE "Not wired" marker with a lock — one per group of controls,
 *     because the fact is identical for all three actions and repeating it
 *     beside each would read as three separate problems.
 *
 * A live-looking primary button that silently swallows a click is the exact
 * dishonesty this surface is not allowed, so the marker is not optional.
 *
 * The trace trigger and the question's options carry NO marker, and that is
 * the same rule rather than an exception to it: opening a disclosure and
 * putting a draft in the composer are both things that genuinely happen. The
 * lock means "this cannot act", not "this is new" — marking a working control
 * would teach a recruiter to ignore the marker on the ones that matter.
 *
 * ── HOVER, ONCE, FOR ALL OF THEM ────────────────────────────────────────────
 * None of the dead controls respond to hover. Not because hover is banned —
 * the rest of the surface uses shadow and shade freely — but because a control
 * that answers the pointer is claiming it can act, and these cannot. Focus
 * still rings, since focus is navigation rather than a claim. The two live
 * controls DO answer the pointer, which is what distinguishes them on sight
 * from the dead ones sitting a few pixels away.
 */

/**
 * The same rule viz.tsx states: a hue plus a variant IS a token name, so the
 * seven categories need no per-hue branch anywhere in this file. Spelled out
 * again rather than imported because viz.tsx keeps it module-local — the cost
 * worth avoiding is a second convention, and this is the same one.
 */
const tok = (hue: Hue, variant: "tint" | "line" | "text") => `var(--c-${hue}-${variant})`;

/* ── the prompt ───────────────────────────────────────────────────────────── */

/**
 * What the recruiter said. Serif at 20px, following the rule access.css already
 * set for this surface: the person's words are the one piece of prose here that
 * a human wrote, and the agent's own output is UI. Setting it in Inter would
 * have flattened that distinction into a size change.
 */
export function Prompt({ text }: { text: string }): JSX.Element {
  /* ── THE INTENT HIGHLIGHT IS GONE, AND THIS IS THE SECOND TIME ────────────
     It used to wash a "leading clause" in warm tint, taken by string split:
     up to the first comma, or the end of the sixth word, whichever came
     first. The comment defended the short-prompt case as "the right answer
     rather than a fallback: six words or fewer IS the leading clause."

     That was wrong in the COMMON case. "Find me good candidates" is four
     words with no comma, so both bounds miss, the span becomes the entire
     message, and it renders as one orange serif pill. Most prompts are short,
     so the failure mode was the normal mode.

     It came back once already: a concurrent agent rebuilt this file from a
     read taken before the deletion and faithfully "preserved" the version
     with the bug in it. Hence the size of this comment.

     There is no repair worth making. The device dressed a `split` up as
     comprehension, and its only honest description — "the opening words are
     emphasised" — is not a thing worth emphasising. Do not reintroduce a
     highlight here without something that actually knows which part of the
     sentence carries the intent. */
  return <p className="rep-prompt">{text}</p>;
}

/* ── the dispatch ─────────────────────────────────────────────────────────── */

/**
 * One entry point for every kind of reply, so the stream renders a turn the
 * same way whatever came back.
 *
 * `onAnswer` is the only thing a reply can do to the world, and all it does is
 * put a sentence in the composer. That is deliberately the same contract the
 * suggestions under the composer and the briefs in the rail already have: the
 * surface hands you a draft, you decide whether to send it. A quick reply that
 * answered the agent on one click would take the edit away at the exact moment
 * the recruiter knows something the option does not.
 */
export function Reply({
  reply, onAnswer,
}: { reply: AgentReply; onAnswer: (text: string) => void }): JSX.Element {
  return (
    <div className="rep">
      {/* Before the answer in every kind, because it is the answer's
          provenance. The trace hangs off the union rather than off one kind:
          "what did you look at to get here" is a fair question to ask of a
          paragraph, a question and an artefact alike. */}
      <Thought ms={reply.thoughtMs} trace={reply.trace} />

      {/* Total over the union. Prose is inlined rather than wrapped in a
          component of its own, because a one-expression component that maps an
          array is a name standing where the thing itself would fit — and the
          paragraphs must be DIRECT children of .rep so its grid gap owns the
          spacing between them rather than a second margin that drifts. */}
      {reply.kind === "prose" &&
        reply.body.map((para) => <p key={para} className="rep-para">{para}</p>)}

      {reply.kind === "question" && (
        <Ask ask={reply.ask} why={reply.why} options={reply.options} onAnswer={onAnswer} />
      )}

      {reply.kind === "artefact" && <Artefact artefact={reply.artefact} />}
    </div>
  );
}

/* ── the thought line, and the trace behind it ────────────────────────────── */

/**
 * `Thought for 2.4s`, and the disclosure that makes that line worth having.
 *
 * ── WHY THE TRIGGER IS THIS LINE AND NOT A NEW CONTROL ──────────────────────
 * The line already existed and was inert: it reported a duration and nothing
 * else, which is the least interesting fact about a run. The reviewer asked
 * twice for "what it thought and came across", and the answer to that belongs
 * exactly where the claim about thinking is made. A separate "Show reasoning"
 * button would have added a control to say what an existing label could say.
 *
 * ── COLLAPSED MEANS NOT RENDERED, NOT HIDDEN ────────────────────────────────
 * The trace is long — four steps, each with a conclusion and two or three
 * findings — so the closed state mounts none of it. That is the whole reason
 * this is `useState` plus a conditional rather than <details>/<summary>:
 * <details> is free and needs no state, but it keeps the whole subtree in the
 * DOM for every reply in a transcript that only grows, and a <summary> has to
 * have its UA marker stripped before it can wear this line's typography. A
 * <button> with aria-expanded is the same keyboard contract (Enter and Space
 * both activate it) with nothing to strip and nothing left mounted.
 */
function Thought({ ms, trace }: { ms: number; trace?: readonly TraceStep[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  const panel = useId();

  /* Truthful. `ms` is Home's measured `Date.now() - startedAt` for the staged
     sequence that just ran, not a number picked to look like thinking. One
     decimal under ten seconds, where 2.4 and 2.9 are different waits; whole
     seconds above, where the tenth is noise. No floor is applied — rounding a
     short measurement up to something more impressive is precisely the
     invention this surface forbids. */
  const secs = Math.max(ms, 0) / 1000;
  const label = `Thought for ${secs < 10 ? secs.toFixed(1) : Math.round(secs)}s`;

  /* A bare icon, never viz's Glyph. This file uses no tinted glyph container
     anywhere now — see the header — and a 28px tinted square would be the
     loudest marker in the system sitting on the quietest line in the reply.
     `fill` at 13px matches the Sparkle CampaignHead already sets: same icon,
     same size, same surface. */
  const spark = <Sparkle size={13} weight="fill" aria-hidden="true" />;

  /* `?.length` rather than a bare `trace &&`: an empty array is a trace that
     found nothing to say, and a trigger that opens onto nothing is worse than
     the plain label it replaced. */
  if (!trace?.length) return <p className="rep-thought">{spark}{label}</p>;

  return (
    <>
      <button
        type="button"
        className="rep-thought rep-trace-trigger"
        aria-expanded={open}
        /* Dropped while closed rather than pointing at an id that is not in
           the document. aria-expanded alone is a complete statement of the
           state; a dangling IDREF is not a statement of anything. */
        aria-controls={open ? panel : undefined}
        onClick={() => setOpen(!open)}
      >
        {spark}
        {label}
        {/* The caret is SWAPPED, not rotated. A rotation is a transform, and
            the one transform this surface allows on interaction is the 60ms
            press scale; spending the exception on a chevron would be the
            cheapest possible reason to break the rule. Two glyphs cost
            nothing and the state is unambiguous at any moment. */}
        {open
          ? <CaretDown size={11} weight="bold" aria-hidden="true" />
          : <CaretRight size={11} weight="bold" aria-hidden="true" />}
      </button>

      {open && <Trace steps={trace} id={panel} />}
    </>
  );
}

/**
 * The steps, and what each one came across.
 *
 * `found` is the half that earns this component. A list of labels — "Read the
 * brief", "Planned the search" — is the working indicator again, in the past
 * tense: a recruiter could have guessed all four. What they could not guess is
 * that the comp band is in a separate doc, that two of the twelve matches are
 * already in another campaign, or that nothing anywhere answers the
 * sponsorship question. So the findings are rendered as their own list under
 * each step rather than folded into the step's sentence, where they would read
 * as narration instead of as things that were turned up.
 */
function Trace({ steps, id }: { steps: readonly TraceStep[]; id: string }): JSX.Element {
  return (
    <div className="rep-trace" id={id}>
      {/* ── THE HONESTY LINE GOES FIRST, AND THAT IS A DEPARTURE ─────────────
          Everywhere else on this surface the honesty line comes last: the
          page's single `orc-fixtures` line is the final thing on it, and the
          artefact's `note` block is the last block in the card. Both sit UNDER
          something that looks like it would act, where the caption qualifies
          an act you have not taken yet.

          The steps below are not an offer, they are assertions about the past,
          and a correction that arrives after four assertions have been read
          and believed is too late to be a correction. So this one leads.

          Hard-coded rather than a field on TraceStep: the sentence is
          identical for every trace, and a per-trace field is an invitation to
          write a weaker one, or to leave it out. */}
      <p className="rep-trace-note">
        These are the steps this brief will run, in order — not a record of a
        model reasoning, because nothing has run yet. Once wired, each run will
        write its own steps and findings to <code>agent_conversations</code>.
      </p>

      <ol className="rep-steps">
        {steps.map((step) => (
          <li key={step.label} className="rep-step">
            <span className="rep-step-label">{step.label}</span>
            {step.detail && <p className="rep-step-detail">{step.detail}</p>}
            {step.found?.length ? (
              <ul className="rep-found">
                {step.found.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── the question ─────────────────────────────────────────────────────────── */

/**
 * The agent asks, and the recruiter answers in the composer.
 *
 * ── WHY THERE IS NO SECOND INPUT ────────────────────────────────────────────
 * A free-text field here would be a duplicate composer 300px above the real
 * one, with its own send, its own focus ring and its own empty state — and the
 * recruiter would have to work out which of the two the agent is listening to.
 * There is one input on this surface. The options fill it; the copy under them
 * says so; the caret ends up in it either way.
 *
 * ── WHY THE OPTIONS DO NOT ANSWER ───────────────────────────────────────────
 * `onAnswer` seeds the composer and stops. Pressing "We don't sponsor" on one
 * click would commit a recruiter to a sentence about somebody's right to work
 * without ever showing them the sentence. Every other one-click affordance on
 * this surface — the suggestions, the rail's briefs, the tiles — hands over a
 * draft for the same reason, so this is the established pattern rather than a
 * special caution for questions.
 */
function Ask({
  ask, why, options, onAnswer,
}: {
  ask: string;
  why?: string;
  options: readonly QuickReply[];
  onAnswer: (text: string) => void;
}): JSX.Element {
  const askId = useId();

  return (
    <>
      <p className="rep-ask" id={askId}>{ask}</p>
      {why && <p className="rep-why">{why}</p>}

      {/* aria-labelledby on the list rather than role="group" on a wrapper.
          A screen reader then announces "list, <the question>, 3 items", which
          is the relationship that matters, and the list keeps its list
          semantics — role="group" would have overridden them, and a wrapper
          purely to hold a role is a DOM node earning nothing. Section() below
          uses role="group" instead because it has no list to name. */}
      <ul className="rep-opts" aria-labelledby={askId}>
        {options.map((option) => (
          <li key={option.label}>
            <button
              type="button"
              className="rep-opt"
              onClick={() => onAnswer(option.text)}
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>

      <p className="rep-free">
        Picking one fills the composer so you can change it before you send —
        or ignore them and type your own answer there.
      </p>
    </>
  );
}

/* ── the artefact ─────────────────────────────────────────────────────────── */

/** The three affordances on a finished reply. Data, so the row is one map. */
const ACTIONS: readonly { label: string; Icon: Icon }[] = [
  { label: "Copy", Icon: Copy },
  /* Sliders, not a pencil: refining is adjusting the brief and running it
     again, which is a different act from editing one section in place — and
     the pencil is already spoken for inside the sections. */
  { label: "Refine", Icon: SlidersHorizontal },
  { label: "Discard", Icon: Trash },
];

function Artefact({ artefact }: { artefact: ReplyArtefact }): JSX.Element {
  /* Two ids so each unwired group's button can point at its own visible
     marker. aria-describedby rather than title alone, because browsers and
     screen readers disagree about whether a title is ever announced, and the
     whole point of the marker is that the fact reaches everybody. */
  const commitMark = useId();
  const actsMark = useId();

  return (
    <>
      <article className="rep-card">
        <header className="rep-app">
          {/* Plain text, no glyph. A tinted container here would restate what
              the caption literally says — this card is captioned "Shortlist"
              or "Outreach" — and an icon or a hue that repeats adjacent text
              is decoration. Having no siblings makes that worse rather than
              excusable: with no set to be distinguished from, the hue carried
              nothing at all. Same cut as the rail's four mode glyphs. */}
          <span className="rep-app-name">{artefact.app}</span>

          <span className="rep-commit-wrap">
            {/* Full --accent-fill strength, deliberately. White on it is
                4.52:1 and there is no headroom to spend: the reflex "disabled"
                move of dropping to opacity 0.55 would put this label at about
                2.5:1, which is the same failure this project already made once
                with a 0.8 on legal ink. The artefact also still has to show
                WHICH act it waits for. So the unavailability is carried by the
                lock, the caption and aria-disabled — never by degrading the
                text. */}
            <button
              type="button"
              className="rep-commit"
              aria-disabled="true"
              aria-describedby={commitMark}
              title="Not wired yet"
            >
              <Lock size={12} weight="bold" aria-hidden="true" />
              {artefact.commit}
            </button>
            {/* "Not wired", not "Unavailable" — unavailable implies it works on
                a better day. */}
            <span className="rep-commit-mark" id={commitMark}>Not wired</span>
          </span>
        </header>

        <div className="rep-blocks">
          {artefact.blocks.map((block, i) => (
            <Block key={`${block.kind}${i}`} block={block} hue={artefact.hue} />
          ))}
        </div>
      </article>

      <div className="rep-acts">
        {ACTIONS.map(({ label, Icon }) => (
          <button
            key={label}
            type="button"
            className="rep-act"
            aria-disabled="true"
            aria-describedby={actsMark}
            title="Not wired yet"
          >
            <Icon size={13} weight="bold" aria-hidden="true" />
            {label}
          </button>
        ))}
        <span className="rep-acts-mark" id={actsMark}>
          <Lock size={10} weight="bold" aria-hidden="true" />
          Not wired
        </span>
      </div>
    </>
  );
}

/** One block, dispatched on kind. The union is closed, so this is total. */
function Block({ block, hue }: { block: ReplyBlock; hue: Hue }): JSX.Element {
  switch (block.kind) {
    case "lead":
      return <p className="rep-lead">{block.body}</p>;

    case "field":
      return (
        <div className="rep-field">
          <span className="rep-field-label">{block.label}</span>
          <span className="rep-field-value">
            {/* The ARTEFACT's hue, not a per-field one. A field is part of the
                object's address, so it has to read as the same object; the
                reference's recipient chip is blue because that artefact is an
                email, and here the hue follows whatever the artefact is. */}
            {block.chip ? <Chip label={block.value} hue={hue} /> : block.value}
          </span>
        </div>
      );

    case "section":
      return <Section title={block.title} hue={block.hue} items={block.items} />;

    case "note":
      return (
        <p className="rep-note">
          {/* The fixture writes table names in backticks, because naming the
              table is this line's entire job and an identifier set in body
              copy stops reading as one. Split on the delimiter: one delimiter,
              no nesting, no escapes — reaching for a markdown parser would be
              carrying a whole grammar in to do a `split`. Odd indices are the
              code spans, which is what alternating on a single delimiter
              means. */}
          {block.body.split("`").map((part, i) =>
            i % 2 === 1 ? <code key={i} className="rep-code">{part}</code> : part,
          )}
        </p>
      );
  }
}

/**
 * A section is the reviewable unit: the thing you accept or edit on its own.
 * Its tint and line come from the BLOCK's hue rather than the artefact's,
 * because the sections are what differ from each other — "Strong match" and
 * "Worth a look" are the distinction the colour is carrying.
 */
function Section({
  title, hue, items,
}: { title: string; hue: Hue; items: readonly string[] }): JSX.Element {
  return (
    /* role="group" with a name, not a <section> and not an <h4>. A heading
       would have to guess its level against an outline this component does not
       own, and a wrong level is worse for a screen-reader user than no heading;
       a named <section> becomes a region landmark, and several of those inside
       one card is landmark noise. "A set of related UI objects" is the literal
       definition of group, and of a reviewable unit. */
    <div
      className="rep-sec"
      role="group"
      aria-label={title}
      style={{ background: tok(hue, "tint"), borderColor: tok(hue, "line") }}
    >
      {/* The hue's text colour is set once here so the title and the pencil
          both inherit it — the pencil belongs to its section, and two
          declarations of one colour is one too many. */}
      <div className="rep-sec-head" style={{ color: tok(hue, "text") }}>
        <span className="rep-sec-title">{title}</span>
        <button
          type="button"
          className="rep-sec-edit"
          aria-disabled="true"
          title="Not wired yet"
          aria-label={`Edit ${title} — not wired yet`}
        >
          <PencilSimple size={13} weight="bold" aria-hidden="true" />
        </button>
      </div>

      <ul className="rep-sec-items">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
