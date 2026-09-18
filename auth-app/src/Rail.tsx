import { CaretRight, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BRIEFS, CAMPAIGN_CONFIG, CAMPAIGN_STATS, CHANNELS, COLLABORATORS, MODES,
} from "./orchestrator";
import { ROUTES } from "./nav";
import { Counter } from "./viz";
import type { Brief, Channel, ModeId } from "./orchestrator";
import type { Campaign } from "./workspaces";

/**
 * Rail — the orchestrator's right column: how the campaign is moving, how it
 * is configured, your briefs, and the channels the agent may speak on.
 *
 * ── WHAT WAS WRONG WITH THE PASS BEFORE THIS ONE ────────────────────────────
 * Not density — hierarchy. Every section got the same treatment: a bordered
 * panel with a resting shadow, a tinted glyph or chip on every row, and a
 * `Reads <table>` footer underneath. Nothing receded, so everything shouted
 * equally, and a 312px column shouting in four places reads as noise even
 * though each individual decision was defensible.
 *
 * Counted, the rail alone carried: three panel shadows, four campaign chips in
 * four hashed hues, two sage check badges, an accent-tinted add button, a
 * three-face avatar stack, and three table-name footers. That is fourteen
 * things competing before the eye reaches a brief title.
 *
 * ── WHAT CHANGED ────────────────────────────────────────────────────────────
 * Subtraction, mostly, plus two blocks that moved here from the header:
 *
 * • STATS moved out of `CampaignHead`, which is now identity only. They render
 *   as a quiet 3-up with no `Spark` and no `Delta` chip — a label over a
 *   tabular figure with the signed week-change as a bare suffix beside it.
 *   Only a DECLINE is coloured, so there is at most one coloured number on the
 *   whole surface and only when something is actually going wrong.
 * • CONFIGURATION is new, and is the label/value shape this rail was missing.
 *   It replaces the Collaborators panel and its avatar `Stack`: a three-person
 *   team does not need a face pile, it needs two names.
 * • The per-brief campaign `Chip` came out. Every row had one, in a hue hashed
 *   from the campaign name, which means the colour distinguished nothing WITHIN
 *   the list — four chips, four hues, no comparison available. The campaign is
 *   now plain `--ink-2` text under the title, which is what the chip's label
 *   was already doing on its own.
 * • The sage `Check` badge came off every connected channel. Same test: it was
 *   on both connected rows, so it read as decoration; connected is carried by
 *   the solid-vs-dashed edge, the connected-first order, and the `2 of 4
 *   connected` line.
 * • The three `Reads <table>` footers came out. The commitment to never fake
 *   data stands and is satisfied once, quietly, at the foot of the surface —
 *   not by tagging every section with a developer note.
 * • No resting `box-shadow` anywhere. `--e1` survives on exactly one hover
 *   state, explained where it is set.
 *
 * ── THE HUE HASH IS GONE ────────────────────────────────────────────────────
 * `hueFor()` — a 31-multiplier string hash from campaign name to category hue
 * — was deleted with the chip and the avatar stack, its only two callers. It
 * was a good mechanism solving a problem that should not have existed: it made
 * a stable mapping from names to colours in a list where no two rows ever
 * needed comparing. If something here ever does need per-entity colour, the
 * question to answer first is which rows the reader is comparing.
 *
 * ── WHAT COLOUR IS LEFT ─────────────────────────────────────────────────────
 * Six spots, and every one of them earned: three brand logos that identify a
 * thing in a list, one accent fill on `+ New`, one accent-tint selection wash,
 * and at most one rose figure — only when something is actually falling.
 *
 * Nothing in this file imports `viz.tsx` any more. The rail used three of its
 * primitives (`Glyph`, `Chip`, `Stack`) and now uses none: the chip and the
 * stack were deleted outright, and the mode glyph gave up its hue (see
 * BriefGroup). Remove all remaining colour and the rail still reads.
 */
export function Rail({
  campaign, activeBriefId, onNewBrief, onPickBrief,
}: {
  campaign: Campaign;
  activeBriefId: string | null;
  onNewBrief: () => void;
  onPickBrief: (id: string) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    /* Root is `orc-rail`, not `rail`: App.tsx already renders
       `<aside className="rail">` for the sign-in brand panel, whose rule
       paints a peach gradient and clips overflow, and it would have painted
       straight over this one. The `rail-*` children are unambiguous and keep
       the short prefix. */
    <aside className="orc-rail" aria-label={`Progress and setup for ${campaign.name}`}>
      {/* ── 1. how it is moving ────────────────────────────────────────────── */}
      <section className="rail-sec">
        <div className="rail-sec-head">
          {/* The heading IS the measurement window, which is why it is a date
              range rather than the word "Stats". The header this replaced spent
              a whole strip on `TRAILING 7 DAYS` next to `org_candidates ·
              outreach_queue`; the window still has to be stated — a bare `+6`
              is unreadable, six since when — but it does not need a row of its
              own. Seven is not a guess: `spark` carries seven trailing values
              and `delta` is documented as the trailing week. */}
          <h2 className="rail-sec-title">Last 7 days</h2>
        </div>

        <dl className="rail-panel rail-stats">
          {CAMPAIGN_STATS.map((s) => (
            <div className="rail-stat" key={s.id}>
              <dt className="rail-stat-label">{s.label}</dt>
              <dd className="rail-stat-figure">
                {/* Counts up on mount. The rail's three numbers are the first
                    thing a recruiter looks at, and watching them land is the
                    surface's most repeatable satisfying moment — it animates
                    to the true figure, so nothing is implied that is not so.
                    `.rail-stat-value` must carry tabular-nums or the row
                    jitters for the duration; it does. */}
                <span className="rail-stat-value"><Counter value={s.value} /></span>
                {/* Nothing at all when the change is zero. A `0` suffix in
                    tabular figures sits flush against the value and reads as
                    part of it (24 then 0 is 240 at a glance), and spelling out
                    "no change" spends nine characters of ink on the one state
                    that wants no attention. Absence is the quietest honest
                    encoding of "nothing happened".

                    The visible glyph is aria-hidden and the words are carried
                    separately, so a screen reader hears "Shortlisted, 24, up 6
                    this week" instead of "24 plus 6". The `Delta` chip this
                    replaces had a TrendUp/TrendDown icon with no text
                    alternative at all, so this is a net gain, not a cost. */}
                {s.delta !== 0 && (
                  <span className={`rail-stat-chg${s.delta < 0 ? " is-down" : ""}`}>
                    <span className="sr-only">
                      {s.delta < 0 ? `down ${Math.abs(s.delta)}` : `up ${s.delta}`} this week
                    </span>
                    <span aria-hidden="true">{signed(s.delta)}</span>
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {/* Rendered only when something is falling, and styled as text rather
            than as the bordered pill the header used. It is still a button,
            because it still acts — it seeds the composer with the question —
            and a control that acts should not be an anchor. "Link" here
            describes the treatment, not the element.

            The label is the sentence rather than a verb like "Investigate": you
            can tell what you will get before clicking, and the agent gets a
            brief worth answering. */}
      </section>

      {/* ── 2. configuration ───────────────────────────────────────────────── */}
      {/* ── LEARNED FROM THE REFERENCE, AND THE LESSON IS SUBTRACTION ──
          The reference's config card has no rule between its rows, no heading
          weight on the word "Configuration", and no action beside it. Ours had
          all three: hairline dividers, a 13px semibold heading with the
          campaign name under it, and a Manage link.

          Every one of those was defensible on its own and the stack of them is
          what made the column feel busy. A dividing line between two rows that
          are already 40px apart is ink spent on a separation the spacing has
          already made; the section label only has to be findable, not
          emphatic; and Manage was a second route to a page the nav already
          reaches. What is left is the pairing that carries the information —
          label left, value right — which is what the reference is actually
          made of. */}
      <section className="rail-sec">
        <dl className="rail-panel rail-config">
          <p className="rail-panel-label">Configuration</p>
          {CONFIG.map((r) => (
            <div className="rail-config-row" key={r.label}>
              <dt className="rail-config-label">{r.label}</dt>
              <dd className="rail-config-value">
                {/* Two renderings, because these are two different things. A
                    set field is text; an unset one is a link phrased as the
                    action that would set it. Styling a blank would have been
                    the third option and the worst — it tells the reader the
                    row exists without telling them it is theirs to fill. */}
                {r.marks && (
                  <span className="rail-config-marks">
                    {r.marks.map((c) => (
                      /* The brand colour is inline because it is DATA — it
                         lives on the channel fixture beside the mark it
                         belongs to, the way the campaign facet colours do.
                         Four brand hexes in the stylesheet would be four
                         tokens that mean nothing to the design system. */
                      <span
                        className="rail-config-mark"
                        key={c.id}
                        style={{ color: c.brand }}
                        role="img"
                        aria-label={c.name}
                        title={`${c.name} \u2014 ${c.detail}`}
                      >
                        <c.Icon size={13} weight="fill" aria-hidden="true" />
                      </span>
                    ))}
                  </span>
                )}
                {r.value !== undefined
                  ? r.value
                  : r.action && (
                      <a className="rail-config-act" href={r.action.href}>{r.action.label}</a>
                    )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── 3. history, behind one row ──────────────────────────────────────── */}
      {/* The four briefs used to sit inline, grouped Recent and Earlier, which
          cost ~180px of the column to show four rows of something a recruiter
          consults occasionally. As a single row it costs 48px and says the one
          fact worth knowing at rest — how many there are — with the list one
          click away.

          A dialog rather than an expanding panel: the full history grows
          without bound, and a column that can push its own neighbours off the
          fold is not a column. The popup gets the room to show every brief,
          which the rail never could. */}
      <section className="rail-sec">
        <div className="rail-panel rail-hist">
          <p className="rail-panel-label">History</p>

          {/* FOUR, not all seven, and not one summary row either.
              The pattern the research names for a space-constrained column is
              three-to-five recent items plus a clear route to the rest — and
              both extremes fail differently. All seven is the ~180px list this
              replaced. A single "History 7 ›" row, which the previous pass
              shipped, tells you a count and nothing you can act on: the useful
              content of a history is WHAT the recent briefs were, and that is
              exactly what a count omits.

              An ordered list, because the order is the meaning — reverse
              chronological — and a screen reader should convey it. */}
          <ol className="rail-briefs is-inline">
            {RECENT_FEW.map((b) => (
              <BriefRow key={b.id} brief={b} activeBriefId={activeBriefId} onPickBrief={onPickBrief} />
            ))}
          </ol>

          {/* Only when something is actually hidden. With four of four shown
              this control would open a dialog containing the same four rows,
              which is a lie about there being more. */}
          {BRIEFS.length > RECENT_FEW.length && (
            <button
              type="button"
              className="rail-more"
              onClick={() => setHistoryOpen(true)}
              aria-haspopup="dialog"
            >
              View all {BRIEFS.length}
              <CaretRight size={11} weight="bold" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>

      {historyOpen && (
        <HistoryDialog
          activeBriefId={activeBriefId}
          onClose={() => setHistoryOpen(false)}
          onNewBrief={() => { setHistoryOpen(false); onNewBrief(); }}
          onPickBrief={(id) => { setHistoryOpen(false); onPickBrief(id); }}
        />
      )}
    </aside>
  );
}

/* ── the history dialog ─────────────────────────────────────────────────────
   Every brief, grouped as the rail used to group them. Reuses the scrim and
   the role="dialog" vocabulary the command palette established, so the app has
   one way to dismiss a floating thing rather than two.                       */

function HistoryDialog({
  activeBriefId, onClose, onNewBrief, onPickBrief,
}: {
  activeBriefId: string | null;
  onClose: () => void;
  onNewBrief: () => void;
  onPickBrief: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  /* Escape closes it. Bound on the document rather than the dialog, so it
     works before anything inside has taken focus. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* Focus the field on open, so the dialog is typeable the instant it appears
     — the same contract the palette has. Without this the first keystroke goes
     nowhere and the search reads as decoration. */
  useEffect(() => { input.current?.focus(); }, []);

  /* One pass over BRIEFS, then the same recency split the rail uses.
     Re-grouping the FILTERED set rather than filtering the two prebuilt groups
     matters when a query matches nothing recent: the group header has to
     disappear with its rows, not sit above an empty space. */
  const { recent, earlier, total } = useMemo(() => searchBriefs(BRIEFS, query), [query]);

  return createPortal(
    <>
      {/* ── MOUNTED AT THE DOCUMENT ROOT, NOT WHERE THE STATE LIVES ──
          A modal is not a sibling of the content it floats over. Rendering it
          inline put it inside a flex column whose vertical centring was built
          on `> :last-child`, so opening this dialog changed which element was
          last and shoved every panel in that column down 121px.

          The portal makes that class of bug impossible rather than fixed: no
          layout outside this component can depend on whether the dialog is
          open, because the dialog is no longer inside any of it. Matches the
          convention `Nav.tsx` already established for its switcher popover. */}
      <div className="pal-scrim" onClick={onClose} aria-hidden="true" />

      <div className="hist" role="dialog" aria-modal="true" aria-label="Brief history">
        <header className="hist-head">
          <h2 className="hist-title">History</h2>
          <button type="button" className="rail-new" onClick={onNewBrief}>
            <Plus size={12} weight="bold" aria-hidden="true" />
            New
          </button>
          <button type="button" className="hist-x" onClick={onClose} aria-label="Close history">
            <X size={15} weight="bold" aria-hidden="true" />
          </button>
        </header>

        {/* Mirrors the palette's search head — same magnifier, same borderless
            input, same autoComplete/spellCheck posture — because the app should
            have ONE way a floating thing is searched, not two that look
            almost alike. */}
        <div className="hist-find">
          <MagnifyingGlass className="hist-find-ico" size={15} weight="regular" aria-hidden="true" />
          <input
            ref={input}
            className="hist-find-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search briefs"
            aria-label="Search briefs"
            autoComplete="off"
            spellCheck={false}
          />
          {/* Only while filtering. At rest the count is already on the control
              that opened this dialog, and repeating it here would be the
              header stating what the list plainly shows. */}
          {query.trim().length > 0 && (
            <span className="hist-find-count" aria-live="polite">
              {total} of {BRIEFS.length}
            </span>
          )}
        </div>

        <div className="hist-body">
          {recent.length > 0 && (
            <BriefGroup label="Recent" briefs={recent} activeBriefId={activeBriefId} onPickBrief={onPickBrief} />
          )}
          {earlier.length > 0 && (
            <BriefGroup label="Earlier" briefs={earlier} activeBriefId={activeBriefId} onPickBrief={onPickBrief} />
          )}
          {/* Names the query back, so the reader can see they typed what they
              meant before they conclude the brief is gone. */}
          {total === 0 && (
            <p className="hist-empty">
              No brief matches <strong>{query.trim()}</strong>
            </p>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

/* ── briefs ─────────────────────────────────────────────────────────────────
   One group (Recent or Earlier) and its rows.                               */

function BriefGroup({
  label, briefs, activeBriefId, onPickBrief,
}: {
  label: string;
  briefs: readonly Brief[];
  activeBriefId: string | null;
  onPickBrief: (id: string) => void;
}) {
  return (
    <>
      <p className="rail-micro">{label}</p>
      <ol className="rail-briefs">
        {briefs.map((b) => (
          <BriefRow key={b.id} brief={b} activeBriefId={activeBriefId} onPickBrief={onPickBrief} />
        ))}
      </ol>
    </>
  );
}

/**
 * One brief.
 *
 * Extracted so the rail's inline list and the dialog's grouped list render the
 * SAME row rather than two copies that drift. The previous shape had the row
 * inlined inside BriefGroup, which was fine while the dialog was the only
 * caller and became a duplication the moment the rail showed briefs too.
 */
function BriefRow({
  brief: b, activeBriefId, onPickBrief,
}: {
  brief: Brief;
  activeBriefId: string | null;
  onPickBrief: (id: string) => void;
}) {
  const mode = MODE_BY_ID[b.mode];
  const on = b.id === activeBriefId;
  return (
    <li>
      <button
        type="button"
        className={`rail-brief${on ? " is-on" : ""}`}
        aria-current={on ? "true" : undefined}
        onClick={() => onPickBrief(b.id)}
      >
        {/* NO HUE, and no container. MODES has exactly two values and they
            already carry two different SHAPES, Target and Sparkle — a hue here
            would be a second encoding of what the silhouette says on its own,
            which is decoration by definition.

            It also dissolves a contrast trap rather than working around it: a
            --c-* mark is solved against white and its own tint, and the
            selected row is washed --accent-tint where --c-sage measures
            2.87:1 against a 3:1 icon floor. --ink-2 is 7.60:1 on white and
            6.53:1 on the wash, so the floor stops being a constraint. */}
        <span className="rail-brief-mode" role="img" aria-label={mode.label} title={mode.label}>
          <mode.Icon size={16} weight="bold" aria-hidden="true" />
        </span>
        <span className="rail-brief-title">{b.title}</span>
        {/* Was a `Chip` in a hashed hue. Plain text: the chip's own label was
            already carrying the campaign, and the border and tint around it
            were coloured spots telling the reader nothing comparable. */}
        <span className="rail-brief-camp">{b.campaign}</span>
        <span className="rail-brief-when">{b.when}</span>
      </button>
    </li>
  );
}

/* ── formatting ─────────────────────────────────────────────────────────────*/

/**
 * A signed change, for the suffix beside a stat.
 *
 * U+2212 MINUS SIGN rather than a hyphen-minus. At 11px beside a 20px tabular
 * figure a hyphen sets short and rides high, so `-1` reads as a dash between
 * two things rather than a negative number. The minus sign is drawn at digit
 * width and digit height, which is the entire reason it exists.
 */
function signed(n: number): string {
  return `${n > 0 ? "+" : "\u2212"}${Math.abs(n)}`;
}

/* ── derived once, at module load ───────────────────────────────────────────
   BRIEFS, CHANNELS, COLLABORATORS and CAMPAIGN_STATS are frozen fixtures, so
   every derivation below is a constant. Doing it here rather than in the body
   means typing in the composer above does not re-filter and re-map four lists
   on every keystroke. When these become queries against agent_conversations /
   org_integrations / org_members / org_candidates, each moves into the
   component behind that query's own memo.                                    */

const RECENT: Brief[] = [];
const EARLIER: Brief[] = [];

/**
 * What the rail shows inline.
 *
 * Three. The research on space-constrained lists lands on three-to-five
 * recent items plus a clear route to the rest, and this was four — the top
 * of that band was affordable when the rail could run as tall as it liked.
 *
 * It cannot any more. The rail now holds a FIXED position that does not move
 * when the conversation starts, which means its inset is whatever the window
 * has left after the rail's own run and the reserved foot band — and at a
 * 1016px screen that arithmetic came out at 34px, the column pinned against
 * the page heading with no air above it. The only term in that sum with any
 * give is the rail's own height, and the cheapest 44px in it is a fourth
 * history row that the dialog already shows better. Three keeps the pattern
 * inside its own research band and buys the column its headroom.
 *
 * Sliced off BRIEFS rather than off RECENT, because RECENT is a recency
 * BUCKET — it holds whatever is under a day old, which could be one row or
 * twelve. The inline list needs a fixed count, not a variable one, or the
 * column's height changes with how busy yesterday was.
 */
export const RECENT_FEW: readonly Brief[] = BRIEFS.slice(0, 3);

/* One pass, and the recency rule stated once. Two filters would have needed
   the predicate and its negation side by side, which is a rule written twice.

   `when` is pre-rendered relative age — there is no server clock to diff
   against — so this reads the string it was given rather than inventing a
   timestamp: "2h" ends in h, "Yesterday" is spelled out, "2d" and "4d" are
   earlier. */
for (const b of BRIEFS) {
  (isRecent(b) ? RECENT : EARLIER).push(b);
}

/**
 * Under a day old.
 *
 * Extracted because the dialog's search has to re-group whatever survives the
 * filter, and a predicate written twice is a predicate that will disagree with
 * itself. Stated once, here.
 *
 * `when` is pre-rendered relative age — there is no server clock to diff
 * against — so this reads the string it was given rather than inventing a
 * timestamp: "2h" ends in h, "Yesterday" is spelled out, "2d" and "1w" are
 * earlier.
 */
function isRecent(b: Brief): boolean {
  return b.when.endsWith("h") || b.when === "Yesterday";
}

/**
 * Filter briefs by a query, then split the SURVIVORS by recency.
 *
 * Exported and pure so the suite can pin it — there is no DOM harness in this
 * project, so logic that can break has to be reachable without rendering.
 *
 * Re-grouping what survives, rather than filtering two prebuilt groups, is the
 * part worth stating: when a query matches nothing recent, the `Recent` header
 * has to disappear WITH its rows rather than sit above an empty space.
 */
export function searchBriefs(
  briefs: readonly Brief[],
  query: string,
): { recent: Brief[]; earlier: Brief[]; total: number } {
  const q = query.trim().toLowerCase();
  /* Title and campaign both, because "iOS" is how you would look for a brief
     whose title never says iOS. Nothing fuzzy: at this list's size a substring
     match is predictable, and predictable beats clever when the reader is
     checking whether the thing they remember is here. */
  const hit = q.length === 0
    ? briefs
    : briefs.filter((b) =>
        b.title.toLowerCase().includes(q) || b.campaign.toLowerCase().includes(q));
  return {
    recent: hit.filter(isRecent),
    earlier: hit.filter((b) => !isRecent(b)),
    total: hit.length,
  };
}

/* id → mode, mirroring TILE_KIND_INFO in orchestrator.ts, so a row resolves
   its mode by lookup instead of scanning MODES. */
const MODE_BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<ModeId, (typeof MODES)[number]>;

const CONNECTED_CHANNELS = CHANNELS.filter((c) => c.connected);

const CONNECTED = CONNECTED_CHANNELS.length;


/* The owner, and everyone else. Split by id rather than by filtering role
   twice, so a second "Owner" row — a mistake, but a possible one once this is
   a table — lands in Collaborators instead of vanishing from both. */
const OWNER = COLLABORATORS.find((p) => p.role === "Owner");
const OTHERS = COLLABORATORS.filter((p) => p.id !== OWNER?.id);

/**
 * The configuration rows, as label/value pairs.
 *
 * This replaces the Collaborators panel, whose three rows and three-face
 * `Stack` were spending an avatar apiece plus a hue apiece on a team of three.
 * The stack's hues came from the same string hash the campaign chip used, and
 * with both callers gone the hash went with them.
 *
 * Every value is a string rather than a node, because every one of them is a
 * fact and not a control. The fallbacks are real: `find` can miss, and a row
 * reading "Unassigned" is honest where a row reading the second collaborator's
 * name would be a quiet lie.
 */
export type ConfigRow = {
  label: string;
  /** Configured. A fact, in --ink. */
  value?: string;
  /**
   * Not configured. The reference's best idea: the value position holds the
   * ACTION that would fill it, in --ink-2, rather than a blank or a dash.
   *
   * `href` is mandatory and that is the honesty constraint — an affordance
   * that reads as a control has to go somewhere. Both of these point at real
   * routes the hash router honours, so the row takes you to the page where the
   * field would be set even though nothing here can set it inline.
   */
  action?: { label: string; href: string };
  /**
   * Brand marks rendered before the value.
   *
   * Only the CONNECTED channels appear, which is what makes the marks need no
   * on/off encoding of their own — every logo present is a logo that works.
   * Dimming the two disconnected ones instead would have put the state in an
   * opacity, and an opacity low enough to read as "off" is an opacity below
   * the contrast floor for a glyph that still means something.
   *
   * The `2 of 4` stays beside them, because the marks can only say what IS
   * connected and the row's real question is whether anything is missing.
   */
  marks?: readonly Channel[];
};

export const CONFIG: readonly ConfigRow[] = [
  { label: "Owner", value: OWNER?.name ?? "Unassigned" },
  {
    label: "Collaborators",
    /* Undefined rather than "Nobody else" when the team is one person: an
       empty collaborator list is a thing you would want to fix, so it reads as
       the invitation to fix it. */
    ...(OTHERS.length > 0
      ? { value: OTHERS.map((p) => p.name).join(", ") }
      : { action: { label: "Add collaborators", href: `#${ROUTES.settings.path}` } }),
  },
  { label: "Visibility", value: CAMPAIGN_CONFIG.visibility },
  { label: "Department", value: CAMPAIGN_CONFIG.department },
  {
    label: "Channels",
    ...(CONNECTED > 0
      ? { marks: CONNECTED_CHANNELS, value: `${CONNECTED} of ${CHANNELS.length}` }
      : { action: { label: "Connect a channel", href: `#${ROUTES.integrations.path}` } }),
  },
  {
    label: "ATS job",
    ...(CAMPAIGN_CONFIG.atsJob
      ? { value: CAMPAIGN_CONFIG.atsJob }
      : { action: { label: "Link ATS job", href: `#${ROUTES.integrations.path}` } }),
  },
  {
    label: "Intake",
    ...(CAMPAIGN_CONFIG.intake
      ? { value: CAMPAIGN_CONFIG.intake }
      : { action: { label: "Create intake", href: `#${ROUTES.settings.path}` } }),
  },
];
