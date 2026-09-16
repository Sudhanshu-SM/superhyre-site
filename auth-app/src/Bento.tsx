import { useState } from "react";
/* React's DragEvent, not the DOM global of the same name — the global is not
   generic, so `DragEvent<HTMLElement>` would fail to compile against it. */
import type { DragEvent } from "react";
import { CaretRight, DotsSixVertical, DotsThree, Plus } from "@phosphor-icons/react";

import type { Campaign } from "./workspaces";
import type { Hue, ModeId, Slot, TileKind, TileSpec } from "./orchestrator";
import {
  BRIEFS, CAMPAIGN_STATS, CHANNELS, PIPELINE, SCHEDULE, SOURCES,
  TILE_KIND_INFO, TILE_SPAN, WAITING,
} from "./orchestrator";
/* Glyph, Chip, Delta and now Stack are deliberately absent, and for related
   reasons: Glyph badged a card as a card, Chip and Delta put a tinted pill on
   a figure whose direction the number and the sparkline already state, and
   Stack put four faces above a list that named the same four people one line
   down. The first three were taken out for clutter; Stack was taken out for
   SPACE, and the two turn out to be the same argument — see the density note.
   The colour this revision puts back is none of them — see COLOUR IS A ZONE. */
import { Dot, Funnel, Ring, Spark } from "./viz";

/**
 * Bento — the orchestrator's opening surface, and the page's colour engine.
 *
 * ── WHY EIGHT SHAPES AND NOT EIGHT CARDS ────────────────────────────────────
 * A kind earns its place by rendering a structurally different object: a ring,
 * a funnel, a face stack, a time strip, a file list, a logo row, a number with
 * its trailing shape, a sentence. If two kinds would produce the same shape,
 * one of them should not exist — which is the rule orchestrator.ts states for
 * the gallery and this file is where it has to hold.
 *
 * ── EVERY TILE ANSWERS A QUESTION ───────────────────────────────────────────
 * A tile is not a label with a number under it. Each kind answers something a
 * recruiter asks themselves, and the lead figure IS the answer:
 *
 *   resume    where was I?                  the brief, and how far it got
 *   pipeline  where is this stalling?       the worst stage-to-stage drop, named
 *   replies   who am I keeping waiting?     longest wait first, in days
 *   calendar  what is next?                 today, then tomorrow
 *   sources   what is this role reading?    the files, by type
 *   channels  where can the agent speak?    the platforms, connected or not
 *   metric    is this number moving?        the value, its shape, its change
 *   suggest   —                             the deliberately quiet one
 *
 * `pipeline` is the one worth spelling out. It used to print the overall
 * first→last ratio, which is a summary and not an insight: a funnel exists to
 * say WHERE it narrows, so the tile now names the worst adjacent drop
 * ("Sourced → Shortlisted, 84% lost") and keeps the overall ratio as the line
 * of context under it.
 *
 * ── COLOUR IS A ZONE, NOT A BUDGET ──────────────────────────────────────────
 * The reference was sampled band by band. The greeting and this grid hold
 * 89.5% of the page's colour between them, and the bento alone holds 65.8% of
 * it at ~20% saturated by area. Everything below — the task header, the rows,
 * the composer — is between 0% and 4.4%.
 *
 * That is the whole lesson of the two revisions before this one. Spreading a
 * colour allowance thinly across every component produced a CLUTTERED surface
 * when the allowance was large and a BLAND one when it was small, because an
 * evenly saturated page has no zones and therefore nothing to look at first.
 * Neither was a quantity problem. So this grid is loud and the things around
 * it are silent, and colour arrives here in exactly three forms:
 *
 *   1. ONE TINTED TILE.   The reference's strongest colour moment is a single
 *      full-tint panel among white siblings. See `accent` on <Tile>.
 *   2. BRAND MARKS.       A logo identifying a platform in a list is the one
 *      permitted identity colour. See CHANNEL_MARK.
 *   3. MEASUREMENT.       Ring, Funnel, Spark, Dot in the configured hue —
 *      colour that encodes a quantity, the most defensible on the page.
 *
 * What is still banned, and why it must stay banned: a hue on a card edge, a
 * header glyph, a top rule, a per-row tint, or anything else that colours a
 * tile because it is a tile. Those were the 26 saturated spots that read as
 * clutter, and none of them let a reader learn anything.
 *
 * ── EVERY FOREIGN-HUE MARK CARRIES ITS OWN WHITE GROUND ─────────────────────
 * The --c-* marks were solved against white and against their OWN tint, and
 * nothing else. Measured, on a tint that is not theirs, they land at 2.75:1 to
 * 2.92:1 — under the 3:1 icon floor. The tinted tile can be any kind, because
 * the recruiter reorders the grid, so a brand mark or a file mark can end up
 * over a tint it was never solved against.
 *
 * The fix is one rule rather than a list of exceptions: a mark whose hue is
 * not the tile's own sits on `background: var(--nav-surface)`. On the white
 * canvas that ground is 1.000:1 and therefore invisible; on the one tinted
 * tile it is load-bearing. It costs nothing seven times over to be correct the
 * eighth. bento.css marks every place it applies.
 *
 * ── NOTHING TRANSLATES ──────────────────────────────────────────────────────
 * Hover is a shadow arriving (none → --e1) and the border stepping one shade.
 * No transform: a grid whose cells slide under the pointer reads as loose.
 *
 * ── NOTHING IS WIRED ────────────────────────────────────────────────────────
 * Every number below is a fixture from orchestrator.ts, including the "new
 * since you were here" counts — see the derivation note on SINCE. No tile
 * prints the table it will read; one quiet line at the foot of the surface
 * carries that for the whole page (Home.tsx owns it).
 */

/**
 * The one place in this file where a hue becomes a token name. Rename the
 * --c-* family and this is the single edit; it is also why no literal hex
 * appears in the markup.
 */
const hueVar = (hue: Hue, variant?: "tint" | "line" | "text") =>
  `var(--c-${hue}${variant ? `-${variant}` : ""})`;

/* ── derived fixtures ─────────────────────────────────────────────────────────
   Computed once at module scope rather than per render. None of them depend on
   props, and a sort or a group inside a render body is a new array on every
   keystroke in the composer above.                                            */

/**
 * Who has waited longest, first. WAITING already happens to be in this order;
 * relying on that would make the tile's headline claim ("longest wait") a
 * property of how the fixture was typed rather than of the data.
 */
const WAITING_BY_WAIT = [...WAITING].sort(
  (a, b) => parseInt(b.waited, 10) - parseInt(a.waited, 10),
);

/**
 * Past this many days a reply is an EXCEPTION and earns a marker.
 *
 * Named rather than inlined because it is the only threshold on this surface
 * that turns colour on, and the number it is compared against is printed in
 * the same row — so the two must not be able to drift apart silently.
 */
const URGENT_DAYS = 3;

/**
 * The schedule as day groups, in fixture order.
 *
 * A fold rather than a map keyed by day, because the calendar must render
 * "Today" before "Tomorrow" and the only thing that knows that ordering is the
 * sequence SCHEDULE is already written in. A keyed object would sort
 * alphabetically and put Tomorrow first.
 *
 * Only the FIRST group reaches the tile now; see CAL_DAY below.
 */
const SCHEDULE_BY_DAY = SCHEDULE.reduce<{ day: string; slots: Slot[] }[]>((acc, slot) => {
  const last = acc[acc.length - 1];
  if (last && last.day === slot.day) last.slots.push(slot);
  else acc.push({ day: slot.day, slots: [slot] });
  return acc;
}, []);

/**
 * ── A TILE IS A GLANCE, SO TWO KINDS SHOW PART OF THEIR LIST ────────────────
 *
 * A 140px row leaves a tile with an action 54.35px of body — bento.css writes
 * the arithmetic out per kind — and `sources` wanted 94.4px of it while
 * `calendar` wanted 81.85px. The review's instruction was explicit that the
 * row must not grow to absorb that, so both tiles show fewer items instead.
 *
 * That is also the right answer independently. Each of these tiles has an
 * action that opens the full view, and the reference's cards show two or three
 * items and never everything. What a partial list owes the reader is only that
 * it SAY SO, which is what the counts below are for.
 *
 * EVERY COUNT IS COUNTED. Each number printed by these two tiles is a `.length`
 * on the fixture it describes — never a literal, never a number that happened
 * to be true when it was typed. A hard-coded "2 of 3" is the same class of lie
 * as a hand-drawn chart: it survives the edit that makes it false.
 */

/** How many file rows fit .bn-src at 20px a row. Two: 23 + 27 = 50.00px. */
const SRC_SHOWN = 2;

const SOURCES_SHOWN = SOURCES.slice(0, SRC_SHOWN);

/**
 * How many slots fit .bn-cal-list at 14.95px a row. Two: 34.90px with its gap.
 *
 * The cap is on SLOTS and not on groups, and that is the load-bearing part: two
 * day groups cost 63.9px against a 54.35px body, so a tile that rendered
 * "however many groups the first two slots span" would fit or overflow
 * depending on how the fixture happens to break by day.
 */
const CAL_SHOWN = 2;

/** The nearest day, which is the one "what is next" is asking about. */
const CAL_DAY = SCHEDULE_BY_DAY[0];

const CAL_SLOTS = CAL_DAY ? CAL_DAY.slots.slice(0, CAL_SHOWN) : [];

/**
 * Everything the strip does not show, across every day — not just the rest of
 * today. The label prints today's own count beside it, so "Today (2) · 1 later"
 * reads as "today holds two, and one interview elsewhere is off-screen".
 */
const CAL_LATER = SCHEDULE.length - CAL_SLOTS.length;

const CONNECTED = CHANNELS.filter((c) => c.connected);

/**
 * ── BRAND MARKS KEEP THEIR BRAND ────────────────────────────────────────────
 *
 * The four channel logos were desaturated to --ink-2 in the pass that stripped
 * the chrome colour, and that went one step too far. A brand mark identifying
 * a thing in a list is the permitted case for identity colour: a recruiter
 * recognises Slack's aubergine half a second before they read the word, which
 * is the entire reason this row is logos and not a line of text in settings.
 * They are also a large share of the reference's vibrance.
 *
 * NEAREST TOKENISED STAND-IN, never a literal hex. Slack and Teams are
 * inherently multicolour and no single swatch is "correct" for them, so each
 * gets the palette entry closest to its mark: Slack's aubergine → violet,
 * Outlook's blue → blue, Teams → teal, Notion's black → ink. Four
 * distinguishable marks, all inside the measured set, all ≥3.30:1 on white.
 *
 * WHY THIS IS NOT THE DISC TINT COMING BACK. The disc tint that was removed
 * claimed to encode STATE — "connected" was violet for Slack and orange for
 * Notion, and a reader cannot learn a code that changes per row. This is
 * IDENTITY: Slack is violet in every row, in every campaign, forever. State is
 * still carried by three things and none of them is hue — the dashed ring
 * (a shape difference, so it survives greyscale), the step to --ink-2, and the
 * row underneath naming exactly who is live.
 *
 * Applied to the connected marks only, and that is measurement choosing rather
 * than taste: an unconnected mark sits on --sub, where --c-teal measures
 * 2.95:1 and fails the icon floor. A coloured mark needs the white plane, and
 * only the live channels stand on one.
 */
const CHANNEL_MARK: Record<string, string> = {
  slack: hueVar("violet"),
  outlook: hueVar("blue"),
  teams: hueVar("teal"),
  notion: "var(--ink)",
};

/**
 * What proportion the resume ring shows, per brief mode.
 *
 * STAGES deliberately cannot be used for this: orchestrator.ts states that the
 * stage list is the plan and not a performance, so drawing a ring over it
 * would report work that never happened — exactly the lie that documentation
 * exists to prevent.
 *
 * Two real pipeline counts instead, picked to match what the brief was for: a
 * sourcing brief produced a shortlist out of the pool it searched, an agent
 * brief produced replies out of the people it contacted. Both numbers are
 * printed in full beside the ring, so the percentage is never a bare figure
 * the reader has to take on trust.
 */
const RESUME_RATIO: Record<ModeId, readonly [got: string, pool: string]> = {
  sourcing: ["shortlisted", "sourced"],
  agent: ["replied", "contacted"],
};

/**
 * ── WHY THERE IS NO "WORST DROP" FIGURE, AND WHY ONE MUST NOT COME BACK ─────
 *
 * A WORST_DROP derivation stood here. It walked adjacent PIPELINE pairs, took
 * the largest single-step loss, and the tile printed it as a finding with a
 * rose down-arrow: "84% · Sourced → Shortlisted".
 *
 * IT WAS A METRIC THAT COULD NOT VARY. The largest adjacent narrowing in a
 * recruiting funnel is the first step, by construction, in every campaign:
 * sourcing is deliberately broad and shortlisting is deliberately selective,
 * so 148 → 24 is the funnel WORKING. A figure whose answer is structurally
 * predetermined is not an insight, and dressing it in an exception colour told
 * a recruiter that intended behaviour was a failure. The panel could only ever
 * repeat itself, campaign after campaign.
 *
 * AND THE HONEST REPLACEMENT DOES NOT EXIST YET. Saying a step is bad needs a
 * BASELINE — this campaign against its own history, or against comparable
 * campaigns — and no fixture carries either. Deriving one from the counts on
 * screen would be inventing a comparison, which is the same failure as a
 * hand-drawn chart. So nothing replaced it: the five bars and their counts
 * already show where the funnel narrows, and a reader can see the proportions
 * without being told which one to be unhappy about.
 *
 * If a baseline ever lands, the figure it supports belongs here — and it will
 * be a comparison against that baseline, never a maximum over the stage list.
 */

/**
 * ── WHAT CHANGED SINCE YOU LAST LOOKED ──────────────────────────────────────
 *
 * The brief asks for something that hooks a recruiter into coming back. The
 * honest version of that is not a streak and not a badge for showing up — both
 * reward the visit rather than reporting on it. It is the one thing a person
 * actually returns for: what moved while they were away.
 *
 * DERIVED, NOT STORED, AND THAT IS THE WHOLE CAVEAT. There is no
 * `last_seen_at` anywhere and orchestrator.ts is not this file's to extend, so
 * "since you were here" is stood in for by the most recent movement the
 * fixtures already record:
 *
 *   replies   entries whose wait is exactly one day — they arrived yesterday
 *   pipeline  stages that gained over the trailing week in CAMPAIGN_STATS
 *   metric    the last step of the sparkline, which is the most recent day
 *
 * Each badge therefore prints a number that exists in the data and a word that
 * says what that number counts. Never "3 new" because three looks alive; a
 * count nobody can trace is the same lie as a fake chart. When a real
 * `last_seen_at` lands, these three derivations are the only lines that change.
 *
 * Only the three kinds whose data supports it get one. A badge on all eight
 * would be the even-distribution mistake again, one tier down.
 */
type Since = { n: number; word: string };

/** Waiting one day means the reply landed yesterday. */
const SINCE_REPLIES = WAITING.filter((w) => parseInt(w.waited, 10) === 1).length;

/**
 * How many funnel stages gained, not how many people did. Summing the deltas
 * would print a headcount the data cannot support — the stats and the stages
 * are two different tables' worth of counting, and only three of five stages
 * have a stat at all. Counting stages is what the fixture actually knows.
 */
const SINCE_PIPELINE = PIPELINE.filter(
  (stage) => (CAMPAIGN_STATS.find((s) => s.id === stage.id)?.delta ?? 0) > 0,
).length;

/* ── tile bodies ─────────────────────────────────────────────────────────────

   One entry per kind, in one record, so that "are any two of these the same
   shape?" is answerable by reading a hundred lines rather than eight files.

   `title` is an override for the cases where the gallery label describes the
   KIND rather than the content — "Single metric" is a fine thing to call a
   tile in a picker and a useless thing to write at the top of one.

   `since` is the movement badge, rendered beside the header by <Tile> because
   that is where it belongs visually and the body has no access to the header.

   `action` seeds the composer. Informational kinds return none: a tile that
   offers "View all" into a surface that does not exist is a worse lie than a
   tile that simply reports.                                                   */

type Body = {
  title?: string;
  since?: Since;
  action?: { label: string; prompt: string };
  content: JSX.Element;
};

const BODY: Record<
  TileKind,
  (spec: TileSpec, campaign: Campaign, onOpen: (prompt: string) => void) => Body
> = {
  /* WHERE WAS I. The ring is the answer and it leads, at 52px rather than the
     46 it was: this is the tile's measurement and the reference's data marks
     are the largest objects in their cards, not footnotes beside the text. */
  resume: (spec) => {
    const brief = BRIEFS[0];
    if (!brief) {
      return { content: <p className="bn-empty">No brief has been run yet.</p> };
    }
    const [gotId, poolId] = RESUME_RATIO[brief.mode];
    const got = PIPELINE.find((s) => s.id === gotId);
    const pool = PIPELINE.find((s) => s.id === poolId);
    return {
      action: { label: "Resume this brief", prompt: brief.title },
      content: (
        <div className="bn-resume">
          {got && pool && (
            <Ring value={got.count} max={pool.count} hue={spec.hue} size={52} width={6} />
          )}
          <span className="bn-resume-txt">
            <span className="bn-resume-t">{brief.title}</span>
            {/* HOW FAR IT GOT, on its own line and above the provenance. Both
                counts the ring is drawn from are printed, so the percentage in
                the middle of it is never a figure taken on trust. */}
            {got && pool && (
              <span className="bn-resume-got">
                {got.count} {got.label.toLowerCase()} of {pool.count} {pool.label.toLowerCase()}
              </span>
            )}
            <span className="bn-resume-sub">
              {brief.campaign} · last worked {brief.when} ago
            </span>
          </span>
        </div>
      ),
    };
  },

  /**
   * WHERE IS THIS STALLING. Five stages as bars with their counts, and that is
   * the whole tile.
   *
   * THE "WORST DROP" PANEL IS GONE, and the derivation note above it says why
   * at length: the largest adjacent narrowing in a recruiting funnel is always
   * the first step, so the figure could not vary, and painting a structurally
   * inevitable step as an exception told a recruiter that the funnel working
   * was the funnel failing. Nothing replaced it, because an honest "this step
   * is worse than it should be" needs a baseline no fixture carries.
   *
   * That took 72.5px out of the body — the panel plus its gap — and with it
   * .bn-pipe, which was a flex column left holding one child. The stages
   * region IS the body now.
   *
   * WIDE NOW, NOT TALL, AND THE HEIGHT CAME OUT OF THE CHROME.
   * Five funnel rows are 66px and a 140px row leaves 106px of content, so the
   * two rows this used to take were never about the bars — they were about
   * everything around them. What went:
   *
   *   the "Stages (5)" kicker      ~20px  restated what five labelled rows
   *                                       already say, and the count is in the
   *                                       action line
   *   the .bn-pipe-stages wrapper    gap  one child, so a div costing a gap
   *
   * That leaves the bars plus the header, and the header already carries the
   * title, the "moved" badge and the action. A stacked segmented bar would
   * have been shorter still and is rejected in `Funnel`: 148 sourced CONTAINS
   * the 24 shortlisted, so the counts are nested and stacking them would draw
   * a total that does not exist.
   *
   * FIVE HUES, ONE PER STAGE. They live on `Stage.hue` rather than here, so
   * the colour belongs to the datum and not to the tile that happens to render
   * it. `spec.hue` is therefore unused by this kind — the configured hue would
   * have overridden five real states with one decorative choice.
   */
  pipeline: (_spec, campaign) => ({
    since: SINCE_PIPELINE > 0 ? { n: SINCE_PIPELINE, word: "moved" } : undefined,
    /* The action asks the agent to find where the pipeline is losing people
       rather than asserting it. That is the honest shape: the analysis needs a
       baseline the surface does not have, and an agent can go and get one.
       Counted off PIPELINE.length, like every other number here. */
    action: {
      label: `Review all ${PIPELINE.length} stages`,
      prompt: `Work through the ${campaign.name} pipeline stage by stage and say where it is losing people, comparing against how this campaign has converted before.`,
    },
    content: <Funnel stages={PIPELINE} />,
  }),

  /**
   * WHO AM I KEEPING WAITING. The list, longest wait first, and nothing above
   * it. All four entries are on screen — this is the one trimmed tile that
   * hides nothing, because what came out was not data.
   *
   * THE AVATAR STACK AND THE "4 NEED A REPLY" ROW ARE GONE, AND THEY WERE
   * 37.0px OF A 54.35px BODY. Two thirds of this tile's budget was a SUMMARY
   * OF THE THING DIRECTLY UNDER IT: the list names all four people and prints
   * how long each has waited, so four faces and the number four told a reader
   * nothing they could not see one line down, and the header already says
   * "Waiting on you". The count is still printed — in the action, off
   * WAITING.length — where the tile was already paying for a row.
   *
   * The .bn-rep and .bn-rep-grp wrappers went with it. Each held one child
   * once the Stack and the old sort label were out, and a flex column with a
   * single item is a div that costs a gap.
   */
  replies: (_spec) => ({
    since: SINCE_REPLIES > 0 ? { n: SINCE_REPLIES, word: "new" } : undefined,
    action: {
      label: `Chase ${WAITING.length} replies`,
      prompt: `Chase the ${WAITING.length} candidates waiting on a reply`,
    },
    content: (
      /* No "Longest wait first" micro-label above this either, and that one is
         the precedent this pass followed: it restated what the ordering
         already does, and it cost 15px in a tile whose content was 4px taller
         than its box — the body and the action genuinely overlapped, measured.
         The first row IS the longest wait and the days are printed beside
         every name. Growing the row instead would have pushed the composer
         further down the viewport, which is what this pass is fixing. */
      <ul className="bn-rep-list">
        {WAITING_BY_WAIT.map((w) => {
          /* Urgency is read off `waited` rather than stored beside it, so a
             fixture edit cannot leave the marker disagreeing with the number
             printed next to it.

             ONE THRESHOLD, NOT THREE BANDS. This was rose / amber / sage by
             day count, which put a coloured dot on all four rows — four
             siblings, three hues, nothing to scan for. Only a row past
             URGENT_DAYS is an exception, and only exceptions get a mark. No
             `pulse` either: with one dot on screen a loop is emphasis on
             emphasis, and the number is the carrier. */
          const urgent = parseInt(w.waited, 10) >= URGENT_DAYS;
          return (
            <li key={w.id} className="bn-rep-row">
              {/* Rendered whether or not it holds a dot, so the marker column
                  is reserved and a dot can never shift its row's text out of
                  line with the column beside it. It is also the white ground
                  the rose dot needs: rose is the exception hue regardless of
                  which hue the tile is configured in, so on the tinted tile
                  this is a foreign mark and measures 2.82:1 without it. */}
              <span className="bn-rep-mark">{urgent && <Dot hue="rose" />}</span>
              <span className="bn-rep-name">{w.name}</span>
              <span className="bn-rep-wait">{w.waited}</span>
            </li>
          );
        })}
      </ul>
    ),
  }),

  /**
   * WHAT IS NEXT. A time strip: one day label carrying its own count and the
   * count of what is off-screen, then rows that lead with the clock time so
   * the column of times reads as a strip rather than as the start of a
   * sentence. No sub-panel — the strip is the tile's whole body, so it had
   * nothing to separate from.
   *
   * ONE GROUP, NOT TWO, AND THAT IS WHERE THE 32.5px CAME FROM. Three slots in
   * two day groups needed 81.85px against a 54.35px body, and 34.0px of that
   * was the GROUPING — two labels, their gaps, and the gap between the groups
   * — carrying three rows of 14.95px. Grouping is a good device and an
   * expensive one, so the nearest day is the only one on screen and everything
   * else is a number in its label: "Today (2) · 1 later".
   *
   * Both figures are `.length` reads (see CAL_DAY and CAL_LATER), so the line
   * cannot go stale against the fixture. The action prints the full count for
   * the same reason.
   */
  calendar: (_spec) => ({
    action: {
      label: `Prepare ${SCHEDULE.length} briefings`,
      prompt: `Write a briefing pack for each of the ${SCHEDULE.length} interviews coming up`,
    },
    content: CAL_DAY ? (
      <div className="bn-cal">
        {/* The reference's GUESTS (6) device, doing two jobs at 9.5px: it says
            which day the times belong to, how many that day holds, and how
            many interviews the strip is not showing. A separate "1 more" row
            would be 18px and there are 6.95px. */}
        <span className="bn-k">
          {CAL_DAY.day} ({CAL_DAY.slots.length})
          {CAL_LATER > 0 && ` · ${CAL_LATER} later`}
        </span>
        <ul className="bn-cal-list">
          {CAL_SLOTS.map((slot) => {
            const { Icon } = slot;
            return (
              <li key={slot.id} className="bn-cal-row">
                <span className="bn-cal-when">{slot.when}</span>
                {/* The icon separates a video call from an email, which
                    `kind` does not — "Screening" could be either — so the
                    shape stays and the per-slot tint stays gone: three rows,
                    three hues, and the row already said it. `bold` rather
                    than `duotone`: duotone's second layer is a 0.2-opacity
                    pass, which goes thin at 13px once the icon is a single
                    ink. 13px also keeps the glyph under the 14.95px `who`
                    line, so it never sets the row's height. */}
                <span className="bn-cal-ic">
                  <Icon size={13} weight="bold" />
                </span>
                <span className="bn-cal-who">{slot.who}</span>
                <span className="bn-cal-kind">{slot.kind}</span>
              </li>
            );
          })}
        </ul>
      </div>
    ) : (
      <p className="bn-empty">Nothing is scheduled.</p>
    ),
  }),

  /**
   * WHAT IS THIS ROLE READING FROM. File rows: type mark, name, and the meta
   * the reference puts where a size badge would go. Separated by a hairline
   * rather than by gaps — a rule reads as a file list where spacing alone
   * reads as unrelated lines.
   *
   * TWO FILES ON ONE LINE EACH, WHICH IS A 44.4px CUT AND THE WORST OVERRUN ON
   * THE SURFACE. Three two-line rows came to 94.4px against 54.35px of body,
   * and halving the list was not enough on its own — two two-line rows are
   * 61.6px, still over. So the meta moved from under the name to the end of
   * its row, which is where the reference puts it anyway, and the row went
   * from 31.8px to 20px. bento.css has the full ladder.
   *
   * THE THIRD FILE IS COUNTED, TWICE, AND NEITHER NUMBER IS WRITTEN DOWN. A
   * separate "and 1 more" line needs 18px and there are 6.35px, so the count
   * goes where the tile already spends pixels: the header carries it (the
   * reference's GUESTS (6) device) and so does the action. Both are
   * SOURCES.length, so showing two of three says so and showing two of nine
   * would say that instead.
   *
   * THE FILE'S OWN HUE IS BACK ON THE MARK. It was removed as "three rows,
   * three hues, restating a shape that already says PDF / Notion / document",
   * and that reasoning had it backwards: the shape and the hue are one mark,
   * and a red PDF / black Notion / blue doc is the convention every file
   * browser a recruiter has ever used already taught them. It is also
   * identity, not state — d1 is rose in every render — so it is the same
   * permitted case as the channel logos.
   *
   * `regular` weight and not `fill`: filled file glyphs at 17px lose the
   * fold-corner that says "document", and the outline reads the type faster.
   */
  sources: (_spec) => ({
    /* TILE_KIND_INFO rather than the string, so the label stays single-sourced
       in the gallery that also has to print it. */
    title: `${TILE_KIND_INFO.sources.label} (${SOURCES.length})`,
    action: {
      label: `Summarise all ${SOURCES.length} sources`,
      prompt: "Summarise the role context this campaign reads from, and flag anything missing",
    },
    content: (
      <ul className="bn-src">
        {SOURCES_SHOWN.map((source) => {
          const { Icon } = source;
          return (
            <li key={source.id} className="bn-src-row">
              {/* Inline colour, because the hue is per-row data and a class
                  per hue would be seven dead rules. The white ground it needs
                  over a tint comes from .bn-src-ic in bento.css. */}
              <span className="bn-src-ic" style={{ color: hueVar(source.hue) }}>
                <Icon size={17} weight="regular" />
              </span>
              <span className="bn-src-name">{source.name}</span>
              <span className="bn-src-meta">{source.meta}</span>
            </li>
          );
        })}
      </ul>
    ),
  }),

  /**
   * WHERE CAN THE AGENT SPEAK. Brand marks, present or not, modelled on the
   * reference's Integrations card. See CHANNEL_MARK for why the logos carry
   * their brands again and why that is identity rather than a state code.
   *
   * No footer action: this tile reports configuration, and inventing a primary
   * verb for it would put a button on a surface that has nothing to run. The
   * `+` is not that button — it is the row's own affordance, and it seeds a
   * real connect brief rather than sitting there dead.
   */
  channels: (_spec, campaign, onOpen) => ({
    content: (
      <div className="bn-ch">
        <ul className="bn-ch-row">
          {CHANNELS.map((channel) => {
            const { Icon } = channel;
            return (
              <li key={channel.id}>
                <span
                  className={`bn-ch-disc${channel.connected ? "" : " is-off"}`}
                  /* Live channels only. An unconnected mark sits on --sub,
                     where --c-teal measures 2.95:1 and fails the icon floor,
                     so it keeps --ink-2 from the stylesheet — which is also
                     the state step, and inline colour here would overrule it. */
                  style={channel.connected ? { color: CHANNEL_MARK[channel.id] } : undefined}
                  title={`${channel.name} — ${channel.connected ? channel.detail : "not connected"}`}
                >
                  <Icon size={17} weight="fill" />
                </span>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className="bn-ch-add"
              aria-label="Connect another channel"
              onClick={() =>
                onOpen(`Connect another channel to ${campaign.name} so the agent can send from it`)
              }
            >
              <Plus size={14} weight="bold" />
            </button>
          </li>
        </ul>
        {/* Label then value, on one row. This was a --sub panel with an
            uppercase micro-label above the names; the panel separated the
            names from nothing, and two-tone says the same thing in one line. */}
        <p className="bn-two">
          <span className="bn-two-k">
            Connected {CONNECTED.length}/{CHANNELS.length}
          </span>
          <span className="bn-two-v">
            {CONNECTED.length ? CONNECTED.map((c) => c.name).join(" · ") : "None yet"}
          </span>
        </p>
      </div>
    ),
  }),

  /**
   * IS THIS NUMBER MOVING. One number, its trailing shape, and its change.
   *
   * The tile's hue picks which stat, so two metric tiles in different hues show
   * different numbers. The alternative was a `stat` field on TileSpec that
   * seven of the eight kinds would ignore — a wider type to serve one case,
   * and a second thing for the tile menu to configure.
   */
  metric: (spec) => {
    const stat = CAMPAIGN_STATS.find((s) => s.hue === spec.hue) ?? CAMPAIGN_STATS[0];
    if (!stat) return { content: <p className="bn-empty">No metrics yet.</p> };
    /* The most recent day's step, which is a different fact from the
       trailing-week delta printed below — one is "what moved while you were
       away", the other is "where the week went". Deriving both from `delta`
       would print one number twice and call it two. */
    const latest = stat.spark[stat.spark.length - 1];
    const prior = stat.spark[stat.spark.length - 2];
    const step = latest !== undefined && prior !== undefined ? latest - prior : 0;
    return {
      title: stat.label,
      since: step > 0 ? { n: step, word: "new" } : undefined,
      content: (
        <div className="bn-met">
          {/* THE CHANGE SITS BESIDE THE NUMBER, NOT UNDER IT, AND THAT IS THE
              17.5px THIS TILE NEEDED. Stacked, the body was four objects deep
              — 29px numeral, 15.53px change line, 6px of clearance, 34px
              sparkline — 88.53px against 78px. "61" and "+18 in the trailing
              7 days" are one statement about one number and were never two
              facts owed two lines, and a 15.53px line beside a 29px numeral
              costs nothing: the row is the numeral's height.

              The alternative was taking 12px off the sparkline, which lands
              this tile on 140.00px exactly — nil clearance on the one surface
              where a 4px miss has already shipped. This way the measurement
              keeps its height and the tile lands 5px clear. */}
          <div className="bn-met-lead">
            <span className="bn-met-n">{stat.value}</span>
            {/* Was a tinted <Delta> pill beside the number, and THAT is what
                stays gone — not the row. The sparkline below already states
                the direction, so the pill was a second coloured object saying
                the same thing.

                The sign is kept and the mood is not — a pill that paints "+18"
                green is the tile telling the reader how to feel about a number
                whose desirability it cannot know. U+2212 rather than a hyphen
                so the minus matches the digits' width under tabular-nums. */}
            <p className="bn-two">
              <span className="bn-two-v">
                {stat.delta === 0
                  ? "No change"
                  : `${stat.delta > 0 ? "+" : "\u2212"}${Math.abs(stat.delta)}`}
              </span>
              <span className="bn-two-k">in the trailing 7 days</span>
            </p>
          </div>
          {/* `spec.hue` and not `stat.hue`, which are the same value whenever a
              stat matched and differ only on the fallback. On the tinted tile
              that difference is a foreign mark over a foreign tint at 2.75:1,
              so the tile's own hue is the one that is always safe — and the
              hue never encoded WHICH stat anyway, the title does.

              No `h`: .bn-met-spark sets the rendered height, so passing one
              would only change the viewBox the path is stretched inside. */}
          <span className="bn-met-spark">
            <Spark data={stat.spark} hue={spec.hue} />
          </span>
        </div>
      ),
    };
  },

  /**
   * THE QUIET ONE. A sentence, no viz, no panel, no list, no kicker. Seven
   * tiles carrying a measurement and an eighth that declines to is a
   * composition; eight that all shout is the wall this surface was twice.
   *
   * THE "WORTH RUNNING" KICKER WENT, AND IT IS THE SAME CUT AS THE OTHER
   * THREE. It was defended as "saying what the sentence IS" — but the tile's
   * own header says "Suggested brief" two lines above it, so the reader was
   * told what this is twice before reaching the thing itself. That is the
   * replies avatar stack and the "Longest wait first" label again: a label
   * restating its neighbour.
   *
   * It also bought the 14.5px that made this the ONLY wrap-dependent block on
   * the surface safe. The prompt interpolates a campaign name, so its line
   * count is content-dependent; with the kicker it cleared a 140px row by
   * 0.73px, which is the same invisible margin that let the `replies` action
   * overlap a name row. It now clears by 15.2px, and bento.css declares the
   * clamp at two lines so a longer campaign name cannot spend it.
   *
   * .bn-sug went with the kicker — a flex column with one child.
   */
  suggest: (_spec, campaign) => {
    const prompt = `Summarise what changed in ${campaign.name} this week`;
    return {
      action: { label: "Run this brief", prompt },
      content: <p className="bn-sug-t">{prompt}</p>,
    };
  },
};

/* ── tile ────────────────────────────────────────────────────────────────── */

type Drag = {
  over: boolean;
  dragging: boolean;
  start: (id: string) => void;
  enter: (id: string) => void;
  drop: (id: string) => void;
  end: () => void;
};

function Tile({
  spec, campaign, accent, onOpen, onEditTile, drag,
}: {
  spec: TileSpec;
  campaign: Campaign;
  /**
   * The single tinted tile. Granted by <Bento> to the first tile in the layout
   * and to nothing else — see the enforcement note there.
   */
  accent: boolean;
  onOpen: (prompt: string) => void;
  onEditTile: (id: string, el: HTMLElement) => void;
  drag?: Drag;
}) {
  const info = TILE_KIND_INFO[spec.kind];
  const span = TILE_SPAN[spec.size];
  const body = BODY[spec.kind](spec, campaign, onOpen);
  const title = body.title ?? info.label;
  const titleId = `bn-t-${spec.id}`;
  /* Pulled out of `body` so the narrowing survives into the click handler;
     `body.action &&` alone narrows the JSX and not the closure under it. */
  const action = body.action;
  const since = body.since;

  return (
    <article
      className={`bn-tile${accent ? " is-accent" : ""}${drag?.over ? " is-over" : ""}${drag?.dragging ? " is-dragging" : ""}`}
      aria-labelledby={titleId}
      /* Spans travel as custom properties rather than as `gridColumn`
         directly: an inline `grid-column` outranks every stylesheet rule, and
         the single-column breakpoint would need !important to collapse a wide
         tile. As a property the breakpoint simply wins.

         The three hue properties are the markup's ONLY statement about colour,
         and the stylesheet decides where they land. That is deliberate: the
         revision that read as clutter had the hue reaching a card edge, a
         header glyph, a top rule and every row, and it got there by handing
         each of those its own property. There are exactly two consumers in
         bento.css — .bn-new (every tile) and .bn-tile.is-accent (one tile).
         A third use is the regression; refuse it. */
      /* Row span as an ATTRIBUTE as well as a custom property. CSS cannot
         branch on a custom property's value, and a tile that is two rows tall
         needs different internal layout from one that is one row tall — the
         funnel goes back to a single column there, because at `l` the
         two-column form leaves ~150px of dead space below it. */
      data-rows={span.rows}
      style={{
        ["--bn-cols" as string]: String(span.cols),
        ["--bn-rows" as string]: String(span.rows),
        ["--bn-tint" as string]: hueVar(spec.hue, "tint"),
        ["--bn-line" as string]: hueVar(spec.hue, "line"),
        ["--bn-text" as string]: hueVar(spec.hue, "text"),
      }}
      draggable={drag ? true : undefined}
      /* Event types are written out rather than left to contextual inference
         through `&&`. Inference does reach the right operand, but a handler
         that silently degrades to `any` is not worth the two words saved. */
      onDragStart={
        drag &&
        ((e: DragEvent<HTMLElement>) => {
          /* Firefox refuses to start a drag without payload, even though the
             id is carried in React state — which it is, because reading it
             back out of the DOM would tie reordering to a class name. */
          e.dataTransfer.setData("text/plain", spec.id);
          e.dataTransfer.effectAllowed = "move";
          drag.start(spec.id);
        })
      }
      onDragOver={
        drag &&
        ((e: DragEvent<HTMLElement>) => {
          /* Without preventDefault the browser refuses the drop outright, and
             onDrop never fires — the single commonest way HTML5 DnD looks
             broken while every handler is wired correctly. */
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          drag.enter(spec.id);
        })
      }
      onDrop={
        drag &&
        ((e: DragEvent<HTMLElement>) => {
          e.preventDefault();
          drag.drop(spec.id);
        })
      }
      onDragEnd={drag && (() => drag.end())}
    >
      <header className="bn-head">
        {drag && (
          <span className="bn-grip" aria-hidden="true">
            <DotsSixVertical size={13} weight="bold" />
          </span>
        )}
        <h3 className="bn-title" id={titleId}>{title}</h3>
        {/* Beside the header, which is where a reader looks first and the only
            place it can sit without competing with the tile's measurement.
            Inside the <h3> it would join the accessible name; outside and
            after it, a screen reader reads the title then the badge, which is
            the order the sentence works in. */}
        {since && (
          <span className="bn-new">
            {since.n} {since.word}
          </span>
        )}
        <button
          type="button"
          className="bn-menu"
          aria-label={`Configure the ${title} tile`}
          aria-haspopup="menu"
          onClick={(e) => onEditTile(spec.id, e.currentTarget)}
        >
          <DotsThree size={17} weight="bold" />
        </button>
      </header>

      <div className="bn-body">{body.content}</div>

      {/* The tile's one action, as the last flex child rather than inside a
          footer. The footer also held the table name this tile would read, and
          with that gone it was a flex row wrapping a single button — empty
          entirely for the two kinds that have no action. */}
      {action && (
        <button
          type="button"
          className="bn-act"
          onClick={() => onOpen(action.prompt)}
        >
          {action.label}
          <CaretRight size={11} weight="bold" />
        </button>
      )}
    </article>
  );
}

/* ── bento ───────────────────────────────────────────────────────────────── */

export function Bento({
  layout, campaign, onOpen, onEditTile, onReorder, reorderable = false,
}: {
  layout: readonly TileSpec[];
  campaign: Campaign;
  /** A tile's primary action seeds the composer. */
  onOpen: (prompt: string) => void;
  /** Opens the tile menu, anchored to the button that was pressed. */
  onEditTile: (id: string, el: HTMLElement) => void;
  /** Move `fromId` into `toId`'s slot. */
  onReorder?: (fromId: string, toId: string) => void;
  reorderable?: boolean;
}): JSX.Element {
  /* Two ids rather than one object: `over` changes on every dragover frame and
     `from` must not, so pairing them would re-render the source tile sixty
     times a second for a value that never moved. */
  const [from, setFrom] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  /* Collapsed into one const rather than tested as `reorderable && onReorder`
     at the call site: a const the ternary narrows is the one form whose
     narrowing is guaranteed to survive into the handlers closed over below.
     Also makes `reorderable` without a handler mean exactly what it says —
     not reorderable — instead of a drag that silently does nothing. */
  const reorder = reorderable ? onReorder : undefined;

  return (
    <div className="bn">
      {layout.map((spec, i) => (
        <Tile
          key={spec.id}
          spec={spec}
          campaign={campaign}
          /**
           * ── EXACTLY ONE TINTED TILE, AND THE RULE IS THE EXPRESSION ───────
           *
           * `i === 0`. Not a flag on TileSpec, not a field in the gallery, not
           * a count checked after the fact — the position IS the predicate, so
           * "exactly one" is a property of the map and cannot be violated by
           * a fixture edit, a tile the recruiter adds, or a reorder. Exactly
           * one index equals zero.
           *
           * WHY ONE AND NOT A FEW. The reference's single full-tint panel is
           * the strongest colour moment on its page precisely because it has
           * no sibling. Tint two tiles and neither is special; tint all of
           * them and the grid is the cluttered revision again with a warmer
           * hue. This is the same lesson as COLOUR IS A ZONE, applied inside
           * the zone: one loud thing, then quiet.
           *
           * WHY FIRST AND NOT "MOST IMPORTANT". Importance would need a rank
           * nothing in the data carries, so it would come from configuration —
           * and a recruiter who drags a tile to the front has already told us
           * what matters to them. Position is the honest signal, and it is the
           * one the recruiter controls.
           */
          accent={i === 0}
          onOpen={onOpen}
          onEditTile={onEditTile}
          drag={
            reorder
              ? {
                  over: over === spec.id && from !== null && from !== spec.id,
                  dragging: from === spec.id,
                  start: setFrom,
                  /* dragover fires continuously; only a change in target is
                     worth a render. */
                  enter: (id) => setOver((prev) => (prev === id ? prev : id)),
                  drop: (id) => {
                    if (from && from !== id) reorder(from, id);
                    setFrom(null);
                    setOver(null);
                  },
                  end: () => {
                    setFrom(null);
                    setOver(null);
                  },
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
