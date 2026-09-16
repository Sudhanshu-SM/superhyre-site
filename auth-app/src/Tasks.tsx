import { Clock, MagnifyingGlass, Sparkle } from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";
import { TASKS, TASK_STATE_HUE, TASK_STATE_LABEL } from "./orchestrator";
import type { Hue, TaskChip, TaskItem, TaskState } from "./orchestrator";
import { Chip, Dot } from "./viz";

/**
 * Tasks — the answer to "what should I do now".
 *
 * The surface was missing this entirely, and its absence is why the landing
 * view had nothing to open it for: the header describes the past, the bento
 * offers shortcuts, and the composer waits to be told something. None of them
 * answer the question a recruiter actually arrives with. This card does, and
 * it is the reason the section sits between the bento and the composer rather
 * than in the rail — it is content, not configuration.
 *
 * ── THE WHOLE CARD IS ONE OBJECT ────────────────────────────────────────────
 * One white card, one hairline, no shadow. The rows inside it are separated
 * by an inset rule rather than being cards of their own, because five bordered
 * boxes in a stack is the "four identical white cards" failure again at a
 * smaller scale — a list of things is one thing.
 *
 * ── THE CHIPS ARE BACK, AND THE MEASUREMENT IS WHY ──────────────────────────
 * Two passes ago this card drew a dot plus two or three tinted chips plus a
 * state chip on every row — twenty coloured spots in one card — and it was the
 * loudest thing on the surface. The correction stripped every chip out and
 * folded one label into a plain `campaign · label` line, and that read as
 * bland, because it took a zone that is supposed to have *some* colour down to
 * none.
 *
 * Neither version was a quantity problem. The reference was sampled band by
 * band and the numbers say where colour belongs:
 *
 *   greeting       24.2% of its own area saturated, 23.7% of the page's colour
 *   bento          19.8%,                           65.8%
 *   tasks HEADER    0.0%,                            0.0%
 *   task ROWS       2.1%,                            5.1%
 *
 * So colour is CONCENTRATED, not spread: the bento is this page's colour
 * engine and carries two thirds of it, the greeting carries most of the rest,
 * and this card gets roughly a twentieth. Which is not zero — it is a handful
 * of small pills. Hence the shape of this file:
 *
 *   • AT MOST TWO CHIPS PER ROW. The state, and the single highest-priority
 *     chip off TaskItem.chips (see `lead`). The other one or two chips the
 *     fixture carries are still not rendered anywhere — that is a deliberate
 *     drop, not an oversight. "4 drafts", "Join" and "31 to review" are all
 *     true and none of them change what the recruiter does next; a task's full
 *     detail belongs in a task detail view, which does not exist yet.
 *   • THE HEADER STAYS AT 0.0%. Heading, count, filter pills and search field
 *     are ink and hairline only. The selected filter pill is --ink with white
 *     text — a neutral high-contrast selection, because the accent is rationed
 *     and the composer's send button has already spent it.
 *   • ONE LOUD THING PER ROW, AND ONLY ON THE ROWS THAT EARN IT. See `alarm`.
 *
 * Deleted along the way, and listed so nobody restores them: the `Note` glyph
 * beside the heading (a tinted square whose only job was to mark a card as a
 * card), the `.tk-camp` element (the campaign is a bare text node now), the
 * `.tk-state` word column and the `.tk-alarm` text fragment (both were the
 * chip-less pass standing in for chips, and the chips are back), and the
 * footer naming `recruiter_tasks` — one line at the foot of the whole surface
 * now carries the fixture disclosure for every section, which is the same
 * commitment stated once instead of seven times. Do not add a second one here.
 *
 * ── IT REALLY FILTERS ───────────────────────────────────────────────────────
 * The pill row and the search box both narrow the rendered list and compose
 * with each other. A filter control that decorates without filtering is worse
 * than no control: it teaches the recruiter that the surface is a mock.
 *
 * ── AND IT DOES NOT FAKE DATA ───────────────────────────────────────────────
 * Every row is a fixture against `recruiter_tasks`, which does not exist yet.
 * `Today` is the one filter that would need a real timestamp, and rather than
 * invent one it reads the fixture's own urgency flag — see FILTER.today.
 */

/**
 * Urgency that survives completion.
 *
 * A finished task is not urgent however it was flagged, so four places read
 * this instead of `urgent` directly: the `Today` filter, the sort, the dot's
 * pulse, and `alarm`. Sorting on the raw flag floats a done task to row one,
 * which is precisely the row nobody needs, and pulsing it advertises a closed
 * loop as live.
 */
const pressing = (t: TaskItem) => t.urgent && t.state !== "done";

/**
 * THE ONE ROW TREATMENT ALLOWED TO SHOUT.
 *
 * The due information is the thing a recruiter scans a task list for, and a
 * palette exists so that the rows which need a decision today look different
 * from the rows that do not. On an `alarm` row the lead chip is rendered
 * `solid` — a filled pill in its own hue with white type — and it is the only
 * saturated element on that row beyond the dot. Everything else stays ink.
 *
 * `blocked` qualifies because a blocked task is the one kind that cannot be
 * progressed by working harder, and `pressing` qualifies because `urgent` IS
 * this fixture's due-today marker (the substitution is argued at FILTER.today).
 * Once `recruiter_tasks` carries `due_at`, the second half becomes
 * `pressing(t) && t.due_at <= endOfToday` and stops being a substitution.
 *
 * On this fixture that is three rows of five — k1 and k2 pressing, k3 blocked —
 * and because the sort below floats pressing rows first and then orders by
 * state rank (blocked first), the three land as rows one to three. The colour
 * therefore decays down the list in step with the ordering, which is the whole
 * ask: the loud pills are at the top, where the eye already is.
 *
 * Three of five is deliberately not five of five. A treatment every sibling
 * receives encodes nothing and is decoration — that is the failure the first
 * version of this card shipped, and the reason the other two rows get pale
 * tint pills instead.
 */
const alarm = (t: TaskItem) => t.state === "blocked" || pressing(t);

/**
 * Sort weight. Deliberately a separate record rather than the key order of
 * TASK_STATE_LABEL: that record is keyed for lookup, and leaning on object key
 * order for a visual ordering breaks silently the day someone alphabetises it.
 */
const STATE_RANK: Record<TaskState, number> = { blocked: 0, doing: 1, todo: 2, done: 3 };

type FilterId = "all" | "today" | "blocked" | "done";

type Filter = {
  /** Pill label. */
  label: string;
  /** The same predicate as a noun phrase, so the empty line can name it. */
  noun: string;
  match: (t: TaskItem) => boolean;
};

const FILTER: Record<FilterId, Filter> = {
  all: { label: "All", noun: "tasks", match: () => true },
  /* `recruiter_tasks` will carry a due date and this becomes a comparison
     against it. Until then `urgent` IS the fixture's due-today marker — the
     two flagged tasks are exactly the two whose lead label reads "By today"
     and "10:30" — so the filter reads the flag rather than inventing a
     timestamp to compare against, which is the one thing this surface must
     not do. `alarm` above makes the same substitution and cites this. */
  today: { label: "Today", noun: "tasks due today", match: pressing },
  blocked: { label: "Blocked", noun: "blocked tasks", match: (t) => t.state === "blocked" },
  done: { label: "Done", noun: "done tasks", match: (t) => t.state === "done" },
};

/**
 * Pill order, separate from the record for the same reason HUES is separate
 * from HUE_LABEL in orchestrator.ts. Ordered by how often it is wanted: the
 * default, then the urgent slice, then the two states worth isolating.
 */
const FILTER_ORDER: readonly FilterId[] = ["all", "today", "blocked", "done"];

/* ── which chip of the two or three gets rendered ─────────────────────────────

   TaskItem.chips carries one or two per row. Exactly ONE of them renders, and
   the rest are not rendered anywhere. See the header comment for why that drop
   is deliberate; what follows is only how the survivor is chosen.           */

/**
 * The severity channel the fixture already has. Rose blocks, amber is
 * imminent, teal is merely scheduled, blue and violet are counts, sage is
 * settled — so the ranking reads the hue rather than adding a `priority`
 * field to TaskChip that only this one view would ever look at.
 */
const CHIP_RANK: Record<Hue, number> = {
  rose: 0, amber: 1, brand: 2, teal: 3, blue: 4, violet: 5, sage: 6,
};

/**
 * The surviving chip, or nothing when a task carries none.
 *
 * TWO KEYS, AND BOTH OF THEM MATTER. A `chips[0]` would be the same thing for
 * this fixture by luck — every row happens to list its deadline first — and
 * would silently pick "4 drafts" over "By today" the day someone reorders an
 * array literal. The comparator is the contract; the array order is not.
 *
 * A reduce rather than `[...chips].sort(…)[0]`: picking one maximum needs
 * neither a mutable copy of the readonly fixture array nor a total ordering of
 * it, and this runs once per row on every keystroke in the search box. It is a
 * running maximum over a transitive preorder with a strict `<` tie-break, so
 * the result is order-independent — reverse any row's `chips` and the same
 * chip comes back.
 */
const lead = (t: TaskItem): TaskChip | undefined =>
  t.chips.reduce<TaskChip | undefined>((best, c) => {
    if (best === undefined) return c;
    /* KEY 1 — A DEADLINE OUTRANKS EVERYTHING ELSE, because when is the only
       fact that decides what to do first: "By today" reorders the recruiter's
       morning and "4 drafts" does not.

       Read off the Icon, not the label, because the label is prose — the
       fixture spells its deadlines "By today", "10:30" and "By tomorrow", and
       a comparator that pattern-matched those three strings would be a second,
       fragile spelling of a fact the chip already states by carrying Clock.
       It is also why the rendered chip keeps its Icon: the glyph the ranking
       reads is the glyph the recruiter sees. */
    const byDeadline = Number(c.Icon === Clock) - Number(best.Icon === Clock);
    if (byDeadline !== 0) return byDeadline > 0 ? c : best;
    /* KEY 2 — two deadlines, or neither: fall back to severity. Strict `<`, so
       an exact tie keeps the incumbent and the earliest of equals wins. */
    return CHIP_RANK[c.hue] < CHIP_RANK[best.hue] ? c : best;
  }, undefined);

export function Tasks({ onOpen }: { onOpen: (prompt: string) => void }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  /* Named so the section becomes a landmark a screen reader can jump to. Via
     useId rather than a literal, which is what the rest of the app does — a
     hardcoded id is a duplicate waiting for the second instance. */
  const headingId = useId();

  const active = FILTER[filter];

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    /* `.filter` hands back a fresh mutable array, which is what makes the
       in-place sort below safe against the readonly TASKS fixture. The two
       controls COMPOSE: the filter predicate and the needle are ANDed, so
       "Blocked" plus "comp" narrows to blocked tasks whose title matches,
       not to one or the other. */
    return TASKS.filter(
      (t) => active.match(t) && (!needle || t.title.toLowerCase().includes(needle)),
    ).sort(
      /* Urgent first, then by state. Array#sort is stable, so ties keep the
         fixture's own order and the list does not reshuffle between renders. */
      (a, b) =>
        Number(pressing(b)) - Number(pressing(a)) || STATE_RANK[a.state] - STATE_RANK[b.state],
    );
  }, [active, query]);

  return (
    <section className="tk" aria-labelledby={headingId}>
      {/* THE HEADER IS THE 0.0% BAND. No glyph, no accent, no hue, no
          gradient — a tinted 26px Note square used to sit here badging the
          card as a card, which is a coloured spot spent on the fact that a
          heading is a heading. Ink and hairline are the whole treatment. */}
      <header className="tk-head">
        <div className="tk-head-l">
          <h2 className="tk-h" id={headingId}>
            My Tasks
          </h2>
          {/* The count of what is ON SCREEN, not TASKS.length. The reference
              shows the total, but a total parked next to a filtered list is a
              number that disagrees with the rows under it. */}
          <span className="tk-n">{rows.length}</span>
        </div>

        <div className="tk-head-r">
          {/* Pill-shaped, but not coloured. Selected-versus-unselected is a
              state the treatment itself has to carry, and four outlines of
              which exactly one is filled says so — in ink, at 14.13:1, with
              no hue spent on it. */}
          <div className="tk-filters" role="group" aria-label="Filter tasks">
            {FILTER_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className="tk-filter"
                aria-pressed={id === filter}
                onClick={() => setFilter(id)}
              >
                {FILTER[id].label}
              </button>
            ))}
          </div>

          <div className="tk-search">
            <MagnifyingGlass size={13} weight="bold" aria-hidden="true" />
            <input
              className="tk-q"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks"
              aria-label="Search tasks by title"
            />
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        /* One sentence, naming the filter it is reporting on, because "no
           results" leaves the recruiter to guess which of the two controls
           they are fighting. role=status so it is announced rather than being
           a silent change for anyone not watching the rows. */
        <p className="tk-empty" role="status">
          {query.trim()
            ? `No ${active.noun} match \u201c${query.trim()}\u201d.`
            : `There are no ${active.noun}.`}
        </p>
      ) : (
        <ul className="tk-list">
          {rows.map((t) => {
            const chip = lead(t);

            return (
              <li key={t.id} className={`tk-row${t.state === "done" ? " is-done" : ""}`}>
                {/* The dot is now REINFORCEMENT, not the only carrier — the
                    state chip two columns over spells the same state in
                    words. That is what makes it safe: --c-teal against the
                    --sub hover wash measures 2.95:1, just under the 3:1 icon
                    floor, and a mark that misses the floor costs nothing when
                    it is the second telling of a fact rather than the first.
                    It stays because TASK_STATE_HUE genuinely differs row to
                    row and a colour column scans down a list faster than any
                    amount of text can. */}
                <span className="tk-mark">
                  <Dot hue={TASK_STATE_HUE[t.state]} pulse={pressing(t)} />
                </span>

                <div className="tk-body">
                  <p className="tk-title">{t.title}</p>

                  {/* The campaign, plain, alone, --ink-2. Always rendered: a
                      task with no campaign is unactionable, so it is part of
                      the task rather than a detail. It used to carry the lead
                      chip's label after a middle dot, which was the chip-less
                      pass approximating a chip in text — the chip is back, so
                      the approximation goes. */}
                  <p className="tk-meta">{t.campaign}</p>
                </div>

                {/* AT MOST TWO PILLS, IN THIS ORDER, AND THE ORDER IS THE
                    POINT. The lead chip sits against the title it qualifies;
                    the state chip sits against the action gutter, whose width
                    is identical on every row, so the state pills share a right
                    edge and scan as a column without any alignment property
                    doing it.

                    Both are viz.tsx's Chip at its own metrics — 10.5px, 2.5px
                    by 7px, tint fill, -line border, -text label. Not
                    re-declared here: forking the primitive's size per context
                    is how a surface ends up with two chip conventions.

                    `solid` is the entire colour story of this card. On an
                    alarm row the lead chip fills with --c-<hue>-fill and takes
                    white type; everywhere else both pills stay pale. See
                    `alarm` for which rows qualify and why it is three of five
                    rather than all of them.

                    The Icon rides along on the lead chip only. It is the fact
                    `lead`'s first key reads — a Clock means "this is a time" —
                    so showing it makes the ranking legible. The state chip
                    gets none: its label is already the whole content, and a
                    glyph there would be pixels spent announcing that a state
                    is a state. */}
                <span className="tk-chips">
                  {chip ? (
                    <Chip label={chip.label} hue={chip.hue} Icon={chip.Icon} solid={alarm(t)} />
                  ) : null}
                  <Chip label={TASK_STATE_LABEL[t.state]} hue={TASK_STATE_HUE[t.state]} />
                </span>

                {/* Revealed by opacity on row hover/focus, never by insertion —
                    the fourth grid column measures this button at opacity 0
                    too, so the row's height and the title's wrap width are
                    identical hovered and not. Rendering it conditionally would
                    resize every row the cursor passed over.

                    The prompt carries the campaign as well as the title because
                    "Confirm the comp band" is ambiguous across three open
                    campaigns. The title goes in verbatim — lowercasing its
                    first word to make the sentence flow would mangle a proper
                    noun. */}
                <button
                  type="button"
                  className="tk-ask"
                  aria-label={`Ask the agent about: ${t.title}`}
                  onClick={() => onOpen(`Help me with this ${t.campaign} task: ${t.title}.`)}
                >
                  <Sparkle size={12} weight="fill" aria-hidden="true" />
                  Ask the agent
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* No fixture footer. It named `recruiter_tasks` under every render of
          this card; the surface now states that once, at its foot, for all of
          its sections at once. Do not add a second one here. */}
    </section>
  );
}
