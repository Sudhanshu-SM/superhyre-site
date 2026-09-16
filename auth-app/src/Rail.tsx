import { CaretRight, Plus } from "@phosphor-icons/react";
import { ROUTES } from "./nav";
import { BRIEFS, CAMPAIGN_STATS, CHANNELS, COLLABORATORS, MODES } from "./orchestrator";
import { Counter } from "./viz";
import type { Brief, Hue, ModeId, Stat } from "./orchestrator";
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
  campaign, activeBriefId, onNewBrief, onPickBrief, onOpen,
}: {
  campaign: Campaign;
  activeBriefId: string | null;
  onNewBrief: () => void;
  onPickBrief: (id: string) => void;
  /** Seeds the composer. Used by the derived decline question below, which
      moved here from `CampaignHead` along with the stats it is derived from. */
  onOpen: (prompt: string) => void;
}) {
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
        {DECLINE && (
          <button type="button" className="rail-ask" onClick={() => onOpen(ASK)}>
            {ASK}
          </button>
        )}
      </section>

      {/* ── 2. configuration ───────────────────────────────────────────────── */}
      <section className="rail-sec">
        <div className="rail-sec-head">
          <div className="rail-sec-id">
            <h2 className="rail-sec-title">Configuration</h2>
            {/* Which campaign these rows configure. Owner, collaborators and
                channels are all per-campaign, and without the name this block
                silently claims to be workspace-wide settings. */}
            <p className="rail-sec-sub">{campaign.name}</p>
          </div>
          {/* Manage is the only affordance this block has earned, and it is a
              real one: Settings is a route the hash router honours and the page
              that genuinely edits these three rows. */}
          <a className="rail-manage" href={`#${ROUTES.settings.path}`}>
            Manage
            <CaretRight size={11} weight="bold" aria-hidden="true" />
          </a>
        </div>

        {/* Label left in --ink-2, value right in --ink, one row each. This is
            the reference's entire mechanism and it is what replaced most of the
            chips on this surface: two inks on one line carry "which field" and
            "what value" without a container, a hue or a border. */}
        <dl className="rail-panel rail-config">
          {CONFIG.map((r) => (
            <div className="rail-config-row" key={r.label}>
              <dt className="rail-config-label">{r.label}</dt>
              <dd className="rail-config-value">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── 3. briefs ──────────────────────────────────────────────────────── */}
      <section className="rail-sec">
        <div className="rail-sec-head">
          <h2 className="rail-sec-title">Briefs</h2>
          {/* The rail's one primary action, so it is the one solid fill in the
              column. Everything else here is text, a mark or a quiet link. */}
          <button type="button" className="rail-new" onClick={onNewBrief}>
            <Plus size={12} weight="bold" aria-hidden="true" />
            New
          </button>
        </div>

        <div className="rail-panel">
          {/* Two groups, and each renders only when it has rows — an EARLIER
              label over nothing is the kind of empty structure that made the
              old rail feel padded. */}
          {RECENT.length > 0 && (
            <BriefGroup label="Recent" briefs={RECENT} activeBriefId={activeBriefId} onPickBrief={onPickBrief} />
          )}
          {EARLIER.length > 0 && (
            <BriefGroup label="Earlier" briefs={EARLIER} activeBriefId={activeBriefId} onPickBrief={onPickBrief} />
          )}
        </div>
      </section>

      {/* ── 4. channels ────────────────────────────────────────────────────── */}
      <section className="rail-sec">
        <div className="rail-sec-head">
          <h2 className="rail-sec-title">Channels</h2>
        </div>

        <div className="rail-panel rail-chan-panel">
          <ul className="rail-chans">
            {ORDERED.map((c) => {
              /* Inline style rather than a per-channel class: the hue is data,
                 and it resolves through the same --c-<hue> contract viz.tsx
                 uses, so there is no second copy of the token names to drift.

                 The hue identifies the PLATFORM, not the state — Teams is teal
                 and not connected. State is the edge, the order and the count
                 line, which is why removing the check badge cost nothing. */
              const hue = CHANNEL_HUE[c.id];
              return (
                <li key={c.id} className={`rail-chan${c.connected ? " is-on" : ""}`}>
                  <span className="rail-chan-mark" style={hue ? { color: `var(--c-${hue})` } : undefined}>
                    <c.Icon size={17} weight="fill" aria-hidden="true" />
                  </span>

                  {/* Always in the DOM, so a screen reader gets the whole list
                      — name, state and destination — even though sighted users
                      see one at a time in the slot below. */}
                  <span className="rail-chan-read">
                    <span className="rail-chan-nm">{c.name}</span>
                    <span className="rail-chan-de">
                      <span className="rail-chan-st">{c.connected ? "Connected" : "Not connected"}</span>
                      {" · "}
                      {c.detail}
                    </span>
                  </span>
                </li>
              );
            })}

            {/* The + is a real navigation, not a promise. Nothing in this app
                can connect Slack today, and a control that opens a dead modal
                is exactly what the honesty rule forbids — so it goes to the
                Integrations route, which the hash router genuinely honours,
                and its label says so rather than saying "Connect".

                It used to be accent-tinted. That made three accent spots in one
                312px column (the fill on + New, the selection wash on a brief,
                this) and the budget allows one primary action per rail. It is
                also not a primary action, so it lost the tint and reads as what
                it is: another dashed slot, told apart by a + instead of a
                logo. */}
            <li className="rail-chan is-add">
              <a
                className="rail-chan-mark"
                href={`#${ROUTES.integrations.path}`}
                aria-label="Connect a channel, opens Integrations"
              >
                <Plus size={15} weight="bold" aria-hidden="true" />
              </a>
              <span className="rail-chan-read" aria-hidden="true">
                <span className="rail-chan-nm">Connect a channel</span>
                <span className="rail-chan-de">Opens Integrations</span>
              </span>
            </li>
          </ul>

          {/* The resting state of the hover slot, and deliberately the same
              sentence as the Configuration `Channels` row above — same constant,
              so the two can never disagree. It is not redundant: this one is a
              live slot that a pointer replaces with a channel's detail, and the
              slot has to say something at rest or the panel opens with a 32px
              band of nothing in it. */}
          <p className="rail-chan-rest">{CHANNEL_LINE}</p>
        </div>
      </section>
    </aside>
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
      <ul className="rail-briefs">
        {briefs.map((b) => {
          const mode = MODE_BY_ID[b.mode];
          const on = b.id === activeBriefId;
          return (
            <li key={b.id}>
              <button
                type="button"
                className={`rail-brief${on ? " is-on" : ""}`}
                aria-current={on ? "true" : undefined}
                onClick={() => onPickBrief(b.id)}
              >
                {/* NO HUE, and no container. This was a `Glyph` — a tinted
                    24px box with a --c-*-line border and a sage-or-violet icon
                    — on all four rows.

                    The case for keeping it was that mode genuinely varies
                    between siblings (two sourcing, two agent), which is what
                    the colour budget permits. The case that won is narrower and
                    better: MODES has exactly two values and they already carry
                    two different SHAPES, Target and Sparkle. The hue was a
                    second encoding of what the silhouette says on its own, and
                    colour that duplicates shape is decoration by definition.

                    It also dissolves a contrast trap instead of working around
                    it. A --c-* mark is solved against white and against its own
                    tint; the selected row is washed --accent-tint, where
                    --c-sage measures 2.87:1 against a 3:1 icon floor. The
                    earlier draft kept `Glyph`'s tint box precisely because that
                    box was the substrate the hue had been measured on — i.e. a
                    container retained to rescue a colour that was not carrying
                    information. --ink-2 is 7.60:1 on white and 6.53:1 on the
                    wash, so the floor stops being a constraint at all.

                    16px bold, matching the only other bare icons in this rail
                    (`Plus`, `CaretRight`). Not duotone: its secondary path is
                    currentColor at 0.2 alpha, which existed to give the hue a
                    filled area inside the tint box and, uncoloured, only
                    softens the outline that is now doing all the work.

                    role="img" + aria-label rather than a caption: the mode is
                    worth a glance and not worth a column of repeated words. */}
                <span className="rail-brief-mode" role="img" aria-label={mode.label} title={mode.label}>
                  <mode.Icon size={16} weight="bold" aria-hidden="true" />
                </span>
                <span className="rail-brief-title">{b.title}</span>
                {/* Was a `Chip` in a hashed hue. Plain text now: the chip's own
                    label was already carrying the campaign, and the border and
                    tint around it were four coloured spots telling the reader
                    nothing they could compare. */}
                <span className="rail-brief-camp">{b.campaign}</span>
                <span className="rail-brief-when">{b.when}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
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

/**
 * Channel → hue.
 *
 * The references render brand logos in brand colours, and Slack aubergine is
 * not a token — every colour in this file has to be one. So each mark borrows
 * the nearest category hue: Outlook blue, Slack violet for its aubergine.
 * Teams is violet-blue in reality and takes teal here for the same reason the
 * token table moved amber off h38: two adjacent marks that read as the same
 * colour defeat the point of a logo row, and identity is already carried by
 * the logo's shape.
 *
 * Notion's mark has no hue at all, so it gets none — `undefined` leaves it in
 * ink. Inventing a colour for a black logo would be the one dishonest row in
 * the map.
 *
 * Every mark sits on the panel's white fill, which is what makes these legal:
 * a --c-* mark is solved for 3:1 on white, and on --sub alone teal lands at
 * 2.95:1. The panel went white in this pass, so the marks got safer, not
 * riskier — but do not put a --sub wash behind them.
 */
const CHANNEL_HUE: Partial<Record<string, Hue>> = {
  slack: "violet", outlook: "blue", teams: "teal",
};

/* ── derived once, at module load ───────────────────────────────────────────
   BRIEFS, CHANNELS, COLLABORATORS and CAMPAIGN_STATS are frozen fixtures, so
   every derivation below is a constant. Doing it here rather than in the body
   means typing in the composer above does not re-filter and re-map four lists
   on every keystroke. When these become queries against agent_conversations /
   org_integrations / org_members / org_candidates, each moves into the
   component behind that query's own memo.                                    */

const RECENT: Brief[] = [];
const EARLIER: Brief[] = [];

/* One pass, and the recency rule stated once. Two filters would have needed
   the predicate and its negation side by side, which is a rule written twice.

   `when` is pre-rendered relative age — there is no server clock to diff
   against — so this reads the string it was given rather than inventing a
   timestamp: "2h" ends in h, "Yesterday" is spelled out, "2d" and "4d" are
   earlier. */
for (const b of BRIEFS) {
  (b.when.endsWith("h") || b.when === "Yesterday" ? RECENT : EARLIER).push(b);
}

/* id → mode, mirroring TILE_KIND_INFO in orchestrator.ts, so a row resolves
   its mode by lookup instead of scanning MODES. */
const MODE_BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<ModeId, (typeof MODES)[number]>;

const CONNECTED = CHANNELS.filter((c) => c.connected).length;

const CHANNEL_LINE = `${CONNECTED} of ${CHANNELS.length} connected`;

/* Connected first, stable within each half (Array#sort has been required to be
   stable since ES2019, and `Number(boolean)` is the cheapest total ordering
   over a two-state key).

   The order is load-bearing now that the check badge is gone: `2 of 4
   connected` is only parseable at a glance if the two it counts are the two at
   the front, otherwise the reader has to compare four 1.53:1 dashed edges to
   find them. The shipped fixture already happens to be in this order — the
   sort is here so that stays true when CHANNELS becomes a query. */
const ORDERED = [...CHANNELS].sort((a, b) => Number(b.connected) - Number(a.connected));

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
const CONFIG: readonly { label: string; value: string }[] = [
  { label: "Owner", value: OWNER?.name ?? "Unassigned" },
  { label: "Collaborators", value: OTHERS.length > 0 ? OTHERS.map((p) => p.name).join(", ") : "Nobody else" },
  { label: "Channels", value: CHANNEL_LINE },
];

/**
 * The weakest stat by signed change, and the question it raises.
 *
 * Hard-coding "Why did interested drop this week?" would outlive the decline
 * it describes — the day the fixture turns positive the control is asking about
 * a fall that is not there, which is the same class of lie as an uninverted
 * delta. So it picks the weakest stat and the copy follows the data.
 *
 * `reduce` with a strict `<` keeps the FIRST of a tie, which is all the
 * stability the copy needs; there is no meaningful ordering between two equal
 * declines. No seed value, so an empty CAMPAIGN_STATS would throw rather than
 * render a question about nothing — that is the correct failure for a fixture
 * the module is built around.
 *
 * Checked `invert` for all three, as the header did before it: none of them
 * take it. Shortlisted, contacted and interested are all counts you want to go
 * up, so a fall is bad news in every case and inverting any of them would be
 * the surface lying without anyone editing a number.
 */
const WEAKEST = CAMPAIGN_STATS.reduce((a, b) => (b.delta < a.delta ? b : a));

/* Null unless something is genuinely falling. The header always rendered a
   question — "What moved the numbers this week?" when nothing had dropped —
   which is a control that exists in order to be a control. No decline, no
   line, and therefore no coloured figure either. */
const DECLINE: Stat | null = WEAKEST.delta < 0 ? WEAKEST : null;

const ASK = DECLINE ? `Why did ${DECLINE.label.toLowerCase()} drop this week?` : "";
