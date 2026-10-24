import { CaretRight, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BRIEFS, CAMPAIGN_CONFIG, CAMPAIGN_STATS, CHANNELS, COLLABORATORS, MODES,
} from "./orchestrator";
import { ConnectorLogo, isConnectorId } from "./ConnectorLogo";
import { Shimmer, ShimmerRegion } from "./components/Shimmer";
import { useFocusTrap } from "./components/focusTrap";
import { ROUTES } from "./nav";
import { LoadFailed } from "./ui";
import { Counter } from "./viz";
import { railSlots } from "./railConfig";
import type { ConfigRow, RailSlot } from "./railConfig";
import { RailDialogs } from "./RailDialogs";
import type { RailConfig } from "./useRailConfig";
import type { Brief, ModeId, Stat } from "./orchestrator";
import type { Campaign } from "./workspaces";

export type { ConfigRow } from "./railConfig";

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
  campaign, agents, briefs = BRIEFS, stats = CAMPAIGN_STATS, statsState = "ready", onRetryStats, config,
  activeBriefId, onNewBrief, onPickBrief, canStartNew,
  history = "ready", onRetryHistory, onRenameBrief, onArchiveBrief, findAsk = 0,
}: {
  /** Opens the history's search each time it goes up: the page's own search button and "/" are asking for it. */
  findAsk?: number;
  /** Renaming and archiving, where chats live on the server. */
  onRenameBrief?: (id: string, title: string) => Promise<void>;
  onArchiveBrief?: (id: string) => Promise<void>;
  /** Live chats arrive from the server: until then the panel says so instead of showing anything else. */
  history?: "loading" | "failed" | "ready";
  onRetryHistory?: () => void;
  campaign: Campaign;
  /** The week's movement; the fixture figures when the console isn't connected. */
  stats?: readonly Stat[];
  /** Connected, the week arrives from the server: until then the panel holds its place, and if it never comes it says so. */
  statsState?: "loading" | "failed" | "ready";
  onRetryStats?: () => void;
  /** What the setup panel says, drawn from the workspace's own data; the prototype's fixtures when absent. */
  config?: Pick<RailConfig, "scope" | "rows"> & Partial<Pick<RailConfig, "layout" | "inOrg" | "go" | "dialog">>;
  /** Connected, a chat that is already under way can be left for a new one from the history panel. */
  canStartNew?: boolean;
  /** The chats to list; the fixture briefs when the console isn't connected. */
  briefs?: readonly Brief[];
  /** The agents at work, rendered by the page that deploys them. It sits ABOVE the week: the rail is anchored to
      the foot of the page, so a panel that comes and goes is the one at its top and nothing under it moves. */
  agents?: ReactNode;
  activeBriefId: string | null;
  onNewBrief: () => void;
  onPickBrief: (id: string) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => { if (findAsk > 0) setHistoryOpen(true); }, [findAsk]);
  const recentFew = briefs === BRIEFS ? RECENT_FEW : briefs.slice(0, HISTORY_SLOTS);
  const rows = config?.rows ?? CONFIG;
  const slots = railSlots(config?.layout ?? "campaign", rows, { inOrg: config?.inOrg ?? true, ...(config?.go ? { go: config.go } : {}) });

  return (
    /* Root is `orc-rail`, not `rail`: App.tsx already renders
       `<aside className="rail">` for the sign-in brand panel, whose rule
       paints a peach gradient and clips overflow, and it would have painted
       straight over this one. The `rail-*` children are unambiguous and keep
       the short prefix. */
    <aside className="orc-rail" aria-label={`Progress and setup for ${config?.scope ?? campaign.name}`}>
      {/* ── THE RAIL DOES NOT MOVE ──
          Three panels of fixed height: the week (90px), the configuration (seven rows, always the same seven) and the
          history (three slots and its "View all" row). Whatever arrives, is missing or is still on its way fills a
          place that was already there, so nothing above or below shifts. The agents at work are the one thing that
          comes and goes, and they sit above the week: the rail is anchored to the foot of the page, so they grow
          upward and the three panels stay exactly where they were. */}
      {agents}

      {/* ── 1. how it is moving ────────────────────────────────────────────── */}
      <section className="rail-sec">
        <div className="rail-sec-head">
          {/* The heading IS the measurement window, which is why it is a date
              range rather than the word "Stats". The window still has to be
              stated — a bare `+6` is unreadable, six since when — but it does
              not need a row of its own. Seven is not a guess: `spark` carries
              seven trailing values and `delta` is documented as the trailing
              week. The week is the whole workspace's, while the panel below it
              is the campaign in focus: it says so. */}
          <h2 className="rail-sec-title">Last 7 days, all campaigns</h2>
        </div>

        {/* Always 90px: loading, failed and arrived are the same box, so the column does not change height when the
            week lands, and says so quietly if it never does rather than vanishing. */}
        {statsState === "loading" ? (
          <div className="rail-panel rail-stats-wait">
            <ShimmerRegion label="Loading the week" className="rail-wait-cols">
              {[0, 1, 2].map((i) => <span key={i} className="rail-wait-col" aria-hidden="true"><Shimmer w="56%" h={18} r={6} /><Shimmer w="78%" h={10} r={5} /></span>)}
            </ShimmerRegion>
          </div>
        ) : statsState === "failed" ? (
          <div className="rail-panel rail-stats-wait">
            <LoadFailed compact what="The week" {...(onRetryStats ? { onRetry: onRetryStats } : {})} />
          </div>
        ) : stats.length === 0 ? (
          <div className="rail-panel rail-stats-wait">
            <p className="rail-hist-note">Nothing to count yet. The week fills in as the agent works.</p>
          </div>
        ) : (
        <dl className="rail-panel rail-stats">
          {stats.map((s) => (
            <div className="rail-stat" key={s.id}>
              <dt className="rail-stat-label">{s.label}</dt>
              <dd className="rail-stat-figure">
                {/* Counts up on mount, to the true figure, so nothing is implied that is not so. `.rail-stat-value`
                    carries tabular-nums or the row jitters for the duration.

                    Nothing at all when the change is zero: a `0` suffix in tabular figures sits flush against the
                    value and reads as part of it (24 then 0 is 240 at a glance). The visible glyph is aria-hidden
                    and the words are carried separately, so a screen reader hears "Shortlisted, 24, up 6 this
                    week" instead of "24 plus 6". */}
                <span className="rail-stat-value"><Counter value={s.value} /></span>
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
        )}
      </section>

      {/* ── 2. configuration ───────────────────────────────────────────────── */}
      {/* ── SEVEN ROWS, ALWAYS, AND EACH ONE A BUTTON ──
          No rule between rows and no heading weight on the word "Configuration": label left, value right is what
          carries the information. What changed in this pass is that the rows no longer come and go with the data.
          They are a fixed list (see railSlots): a field that is not set says "Not set" in muted text, a read that is
          on its way is a skeleton bar in the same place, and the Channels row is always two lines tall. Each row is
          one 40px target (Channels, 60px) that goes where its name says: a page, or the dialog that sets it. */}
      <section className="rail-sec">
        <div className="rail-panel rail-config" data-tour="configuration">
          <header className="rail-config-head">
            <p className="rail-panel-label">Configuration</p>
            {/* Which scope it describes. Connected, the page is sometimes about one campaign and sometimes about
                the workspace, and the rows alone cannot say which. */}
            {config && <span className="rail-config-scope" title={config.scope}>{config.scope}</span>}
          </header>
          <ul className="rail-config-rows">
            {slots.map((slot) => <li key={slot.key}><ConfigSlot slot={slot} /></li>)}
          </ul>
        </div>
      </section>

      {/* ── 3. history ──────────────────────────────────────────────────────── */}
      {/* Three slots and the "View all" row, always. An empty slot is a faint line, so a person with one chat and a
          person with ninety have the same panel, and it ends on the line the composer's input starts on. */}
      <section className="rail-sec">
        <div className="rail-panel rail-hist" data-tour="history">
          {/* Connected, a chat that was left open is reopened where it stopped, and the history dialog only shows
              the way to a fresh chat once there are chats to list. So the way to one has to be here, always, or
              someone with three chats could never start a fourth. The row holds its height whether or not the
              control shows. */}
          {canStartNew !== undefined ? (
            <div className="rail-hist-head">
              <p className="rail-panel-label">History</p>
              {canStartNew && (
                <button type="button" className="rail-new" onClick={onNewBrief}>
                  <Plus size={12} weight="bold" aria-hidden="true" />
                  New chat
                </button>
              )}
            </div>
          ) : (
            <div className="rail-hist-head">
              <p className="rail-panel-label">History</p>
            </div>
          )}

          <div className="rail-hist-body">
            {history === "loading" ? (
              <ShimmerRegion label="Loading your chats">
                <ol className="rail-briefs is-inline" aria-hidden="true">
                  {Array.from({ length: HISTORY_SLOTS }, (_, i) => (
                    <li key={i} className="rail-brief-slot"><Shimmer h={10} w={`${46 + ((i * 19) % 36)}%`} /></li>
                  ))}
                </ol>
              </ShimmerRegion>
            ) : history === "failed" ? (
              <div className="rail-hist-wait">
                <LoadFailed compact what="Your chats" {...(onRetryHistory ? { onRetry: onRetryHistory } : {})} />
              </div>
            ) : (
              <ol className="rail-briefs is-inline">
                {Array.from({ length: HISTORY_SLOTS }, (_, i) => {
                  const b = recentFew[i];
                  if (b) return <BriefRow key={b.id} brief={b} activeBriefId={activeBriefId} onPickBrief={onPickBrief} />;
                  return (
                    <li key={`empty-${i}`} className="rail-brief-slot" aria-hidden={briefs.length > 0 || i > 0 ? "true" : undefined}>
                      {briefs.length === 0 && i === 0
                        ? <span className="rail-brief-slot-note">No chats yet. They will be listed here.</span>
                        : <span className="rail-brief-slot-line" />}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* The whole row opens the full list (search, rename, archive). Always there, so the panel's height is
              one number; with nothing to list it is a quiet, inert line. */}
          <button
            type="button"
            className="rail-more"
            onClick={() => setHistoryOpen(true)}
            aria-haspopup="dialog"
            disabled={history !== "ready" || briefs.length === 0}
          >
            <span>{briefs.length > 0 && history === "ready" ? `View all ${briefs.length}` : "View all"}</span>
            <CaretRight size={11} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </section>

      {historyOpen && (
        <HistoryDialog
          briefs={briefs}
          {...(onRenameBrief ? { onRename: onRenameBrief } : {})}
          {...(onArchiveBrief ? { onArchive: onArchiveBrief } : {})}
          activeBriefId={activeBriefId}
          onClose={() => setHistoryOpen(false)}
          onNewBrief={() => { setHistoryOpen(false); onNewBrief(); }}
          onPickBrief={(id) => { setHistoryOpen(false); onPickBrief(id); }}
        />
      )}
      {config?.dialog && <RailDialogs dialog={config.dialog} />}
    </aside>
  );
}

/** How many chats the rail lists inline, always: empty slots are drawn as faint lines. */
export const HISTORY_SLOTS = 3;

/**
 * One Configuration row: the whole 40px (Channels, 60px) is one link or button. The label sits left; the value, the
 * brand marks and the second line sit right. Never a text link inside a row: there is one target, and it is all of it.
 */
export function ConfigSlot({ slot }: { slot: RailSlot }) {
  const body = (
    <>
      <span className="rail-config-label">{slot.label}</span>
      <span className="rail-config-value">
        {slot.loading ? (
          <span className="rail-skel" aria-hidden="true" />
        ) : (
          <span className="rail-config-line">
            {slot.marks && (
              <span className="rail-config-marks">
                {slot.marks.map((c) => (
                  /* The brand colour is inline because it is DATA: it lives on the channel beside the mark it
                     belongs to. A brand hex each in the stylesheet would be tokens that mean nothing to the design
                     system. */
                  <span
                    className="rail-config-mark"
                    key={c.id}
                    style={{ ["--mark" as string]: c.brand, ["--mark-dark" as string]: c.brandDark } as CSSProperties}
                    role="img"
                    aria-label={c.name}
                    title={c.detail ? `${c.name} \u00b7 ${c.detail}` : c.name}
                  >
                    {isConnectorId(c.id)
                      ? <ConnectorLogo id={c.id} size={14} decorative />
                      : <c.Icon size={13} weight="fill" aria-hidden="true" />}
                  </span>
                ))}
              </span>
            )}
            <span className={`rail-config-text${slot.empty ? " is-empty" : ""}`}>{slot.value}</span>
          </span>
        )}
        {slot.twoLine && (
          <span className="rail-config-note">
            {slot.loading ? (
              <span className="rail-skel is-short" aria-hidden="true" />
            ) : (
              <>
                {slot.offer && slot.offer.length > 0 && (
                  <span className="rail-config-offer">
                    {slot.offer.map((id) => <ConnectorLogo key={id} id={id} size={13} decorative />)}
                  </span>
                )}
                {slot.note ?? "\u00a0"}
              </>
            )}
          </span>
        )}
      </span>
    </>
  );
  const cls = `rail-row${slot.twoLine ? " is-two" : ""}`;
  return "href" in slot.go
    ? <a className={cls} href={slot.go.href} aria-label={slot.name} {...(slot.loading ? { "aria-busy": true } : {})}>{body}</a>
    : <button type="button" className={cls} onClick={slot.go.onClick} aria-label={slot.name} {...(slot.loading ? { "aria-busy": true } : {})}>{body}</button>;
}

/* ── the history dialog ─────────────────────────────────────────────────────
   Every brief, grouped as the rail used to group them. Reuses the scrim and
   the role="dialog" vocabulary the command palette established, so the app has
   one way to dismiss a floating thing rather than two.                       */

function HistoryDialog({
  briefs, activeBriefId, onClose, onNewBrief, onPickBrief, onRename, onArchive,
}: {
  onRename?: (id: string, title: string) => Promise<void>;
  onArchive?: (id: string) => Promise<void>;
  briefs: readonly Brief[];
  activeBriefId: string | null;
  onClose: () => void;
  onNewBrief: () => void;
  onPickBrief: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  /* Tab stays inside it, and focus goes back to what opened it. */
  useFocusTrap(dialog, true);

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
  const { recent, earlier, total } = useMemo(() => searchBriefs(briefs, query), [briefs, query]);

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

      <div className="hist" role="dialog" aria-modal="true" aria-label="Brief history" ref={dialog} tabIndex={-1}>
        <header className="hist-head">
          <h2 className="hist-title">History</h2>
          <button type="button" className="rail-new" onClick={onNewBrief}>
            <Plus size={12} weight="bold" aria-hidden="true" />
            New chat
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
              {total} of {briefs.length}
            </span>
          )}
        </div>

        <div className="hist-body">
          {recent.length > 0 && (
            <BriefGroup label="Recent" briefs={recent} activeBriefId={activeBriefId} onPickBrief={onPickBrief} onRename={onRename} onArchive={onArchive} />
          )}
          {earlier.length > 0 && (
            <BriefGroup label="Earlier" briefs={earlier} activeBriefId={activeBriefId} onPickBrief={onPickBrief} onRename={onRename} onArchive={onArchive} />
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
  label, briefs, activeBriefId, onPickBrief, onRename, onArchive,
}: {
  label: string;
  briefs: readonly Brief[];
  activeBriefId: string | null;
  onPickBrief: (id: string) => void;
  onRename?: ((id: string, title: string) => Promise<void>) | undefined;
  onArchive?: ((id: string) => Promise<void>) | undefined;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const run = (id: string, work: Promise<void>) => {
    setBusy(id);
    setFailed(null);
    work.then(() => { setBusy(null); setEditing(null); }, () => { setBusy(null); setFailed(id); });
  };
  return (
    <>
      <p className="rail-micro">{label}</p>
      <ol className="rail-briefs">
        {briefs.map((b) =>
          editing === b.id && onRename ? (
            <li key={b.id} className="rail-brief-edit">
              <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) run(b.id, onRename(b.id, title.trim())); }}>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Chat name" autoFocus
                  onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }} />
                <button type="submit" className="rail-more" disabled={busy === b.id || !title.trim()}>Save</button>
              </form>
            </li>
          ) : (
            <BriefRow key={b.id} brief={b} activeBriefId={activeBriefId} onPickBrief={onPickBrief}>
              {(onRename || onArchive) && (
                /* Shown when the row is pointed at or focused, so the same two words are not repeated down the
                   list; a change that didn't save keeps them on screen with the line saying so. */
                <span className={`rail-brief-acts${failed === b.id ? " is-shown" : ""}`}>
                  {failed === b.id && <span className="rail-brief-err">Didn't save.</span>}
                  {onRename && <button type="button" className="rail-more" onClick={() => { setEditing(b.id); setTitle(b.title); }}>Rename</button>}
                  {onArchive && <button type="button" className="rail-more" disabled={busy === b.id} onClick={() => run(b.id, onArchive(b.id))}>Archive</button>}
                </span>
              )}
            </BriefRow>
          ),
        )}
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
  brief: b, activeBriefId, onPickBrief, children,
}: {
  brief: Brief;
  activeBriefId: string | null;
  onPickBrief: (id: string) => void;
  /** Row actions beside the brief, in the history dialog. */
  children?: ReactNode;
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
      {children}
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
  return b.when.endsWith("m") || b.when.endsWith("h") || b.when === "Yesterday";
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
      : { action: { label: "Connect a channel", href: `#${ROUTES.settings.path}/connections` } }),
  },
  {
    label: "ATS job",
    ...(CAMPAIGN_CONFIG.atsJob
      ? { value: CAMPAIGN_CONFIG.atsJob }
      : { action: { label: "Link ATS job", href: `#${ROUTES.settings.path}/connections` } }),
  },
  {
    label: "Intake",
    ...(CAMPAIGN_CONFIG.intake
      ? { value: CAMPAIGN_CONFIG.intake }
      : { action: { label: "Create intake", href: `#${ROUTES.settings.path}` } }),
  },
];
