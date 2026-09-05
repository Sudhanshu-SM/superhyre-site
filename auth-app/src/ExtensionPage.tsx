import { ArrowSquareOut, EnvelopeSimple, Phone } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { CHROME_STORE_URL, EXTENSION_ID } from "./config";
import {
  contactFound, describeActivityError, fetchActivity, orderStages, TERMINAL_STAGES,
} from "./activity";
import type { Activity, ActivityFailure, ActivityView, RecentCandidate } from "./activity";

/**
 * The Extension page: install the extension, then see what it captured.
 *
 * ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────
 * One RPC, `public.console_extension_activity()` (05_console.sql). Eight
 * figures off one snapshot, so the tiles cannot disagree with the table. Only
 * `public` is exposed to PostgREST, so there is no alternative to an RPC here:
 * the browser's publishable key cannot see `core`, `mother_data` or any tenant
 * schema at all.
 *
 * ── ADMIN / RECRUITER ───────────────────────────────────────────────────────
 * A recruiter sees their own activity. `can_view_team` comes back from the
 * function, and the toggle renders only when the function would actually serve
 * it, so the control is never a button that answers 42501. The gate itself is
 * in SQL; this is presentation.
 *
 * ── DESIGN CONSTRAINTS THIS FILE IS HELD TO ─────────────────────────────────
 * From the three reference repos (impeccable's Operate mode is authoritative
 * for dashboards; taste-skill excludes dashboards in its own §13):
 *   - at most 4 metric tiles (working-memory limit, Cowan 2001)
 *   - a tile is one number, one label, at most one comparison: no icon tile,
 *     no accent bar, no decorative sparkline
 *   - every label names its window and its dedupe basis, because a capture log
 *     is append-only and "reveals" and "people" are different numbers
 *   - a chart ships only when a number cannot answer the question
 *   - tabular numerals on anything that changes
 *   - accent is the primary action only. #ea5a1e on peach is 2.85:1 and fails
 *     non-text contrast, so it is never a fill on the panel surface
 *   - no mount animation: this is opened daily
 */

const WINDOWS = [7, 30, 90] as const;

type Load =
  | { s: "loading" }
  | { s: "ready"; data: Activity }
  | { s: "error"; failure: ActivityFailure };

export function ExtensionPage() {
  const [days, setDays] = useState<number>(30);
  const [view, setView] = useState<ActivityView>("mine");
  const [load, setLoad] = useState<Load>({ s: "loading" });

  const run = useCallback((d: number, v: ActivityView) => {
    let live = true;
    setLoad({ s: "loading" });
    fetchActivity({ days: d, view: v })
      .then((data) => { if (live) setLoad({ s: "ready", data }); })
      .catch((err: unknown) => { if (live) setLoad({ s: "error", failure: describeActivityError(err) }); });
    return () => { live = false; };
  }, []);

  /* The cleanup return matters: switching the window twice quickly must not let
     the slower response overwrite the faster one. */
  useEffect(() => run(days, view), [days, view, run]);

  if (load.s === "loading") return <Skeleton />;

  if (load.s === "error") {
    return (
      <Frame>
        <div className="ex-note ex-note-bad" role="alert">
          <p className="ex-note-head">
            {load.failure.kind === "not-deployed" ? "Not available yet" : "Could not load"}
          </p>
          <p className="ex-note-body">{load.failure.message}</p>
        </div>
        <InstallPanel tone="quiet" />
      </Frame>
    );
  }

  const a = load.data;
  const captures = a.captures;
  const everUsed =
    a.reveals.total > 0 || a.saved.total > 0 || (captures.tracked && captures.total > 0);

  return (
    <Frame>
      {/* Empty state (a): never used it. The install path is the whole page,
          not a banner above an empty dashboard. */}
      {!everUsed ? (
        <>
          <InstallPanel tone="primary" />
          <p className="ex-hint">
            Once it is installed, open any LinkedIn profile and use the Superhyre
            sidebar. Everything you reveal or save shows up here.
          </p>
        </>
      ) : (
        <>
          <div className="ex-controls">
            <Segmented
              label="Window"
              options={WINDOWS.map((d) => ({ value: String(d), label: `${d}d` }))}
              value={String(days)}
              onChange={(v) => setDays(Number(v))}
            />
            {/* Rendered only for the roles the SQL would serve. */}
            {a.can_view_team && (
              <Segmented
                label="Scope"
                options={[
                  { value: "mine", label: "Mine" },
                  { value: "team", label: "Team" },
                ]}
                value={view}
                onChange={(v) => setView(v === "team" ? "team" : "mine")}
              />
            )}
          </div>

          <Tiles a={a} />
          <Trend a={a} />
          <Pipeline a={a} />
          <Recent a={a} />
          <InstallPanel tone="quiet" />
        </>
      )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="con-page con-page-wide">
      <h1 className="con-h1">Extension</h1>
      <p className="con-lede">
        The Superhyre sidebar runs on LinkedIn profiles. It reveals contact
        details and saves people into your pipeline. This is what yours has
        done.
      </p>
      {children}
    </div>
  );
}

/* ── tiles ──────────────────────────────────────────────────────────────
   Exactly four, and each one has to earn its slot by answering a question a
   recruiter can act on. Every label states its window; where the dedupe basis
   matters it is stated too, because a reveal log is append-only and "reveals"
   and "distinct profiles" are different numbers.

   The fourth tile is deliberately NOT a cumulative "saved all time": that only
   ever goes up, reads as progress on a bad week, and is 0 on day one. It was
   replaced with the follow-up worklist, which is the one figure here that
   creates work. Cumulative saves still appear, as the table's "of N". */
function Tiles({ a }: { a: Activity }) {
  const found = contactFound(a.reveals);
  const broken = a.reveals.failed;
  const un = a.uncontacted;

  return (
    <div className="ex-tiles">
      <Tile
        label={`Reveals · last ${a.days}d`}
        value={a.reveals.total}
        note={`${fmt(a.reveals.unique_profiles)} distinct profiles`}
      />

      {/* Rate is suppressed under MIN_RATE_N in favour of the raw fraction: a
          percentage on three attempts is a worse lie than "2 of 3". */}
      <Tile
        label={`Contact found · last ${a.days}d`}
        value={
          found.attempts === 0 ? "none yet"
          : found.pct === null ? `${fmt(found.hits)} of ${fmt(found.attempts)}`
          : `${found.pct}%`
        }
        note={
          found.attempts === 0 ? "no lookups in this window"
          : found.pct === null ? "too few lookups for a rate"
          : `${fmt(found.hits)} of ${fmt(found.attempts)} lookups`
        }
      />

      {un.tracked ? (
        <Tile
          /* "you" is wrong once the scope is the whole team, and a tile that
             misattributes a worklist is worse than one with a dull label. */
          label={a.view === "team" ? "Waiting on the team" : "Waiting on you"}
          value={un.total}
          note={
            un.total === 0 ? "nothing sourced and uncalled"
            : un.d30p > 0 ? `${fmt(un.d30p)} over 30 days old`
            : un.d8_30 > 0 ? `${fmt(un.d8_30)} over a week old`
            : "all within a week"
          }
        />
      ) : (
        /* Personal workspace: no <schema>.calls table, so follow-up state is
           genuinely unknowable rather than zero. Show the window's saves. */
        <Tile
          label={`Saved · last ${a.days}d`}
          value={a.saved.in_window}
          note={`${fmt(a.saved.total)} saved in total`}
        />
      )}

      <Tile
        label="Reveals left today"
        value={a.quota.remaining}
        note={broken > 0 ? `${fmt(broken)} lookups errored` : `daily cap ${fmt(a.quota.cap)}`}
      />
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="ex-tile">
      <span className="ex-tile-label">{label}</span>
      <span className="ex-tile-value">{typeof value === "number" ? fmt(value) : value}</span>
      <span className="ex-tile-note">{note}</span>
    </div>
  );
}

/* ── trend ──────────────────────────────────────────────────────────────
   The question this answers, written down as the design rules require:
   "Is my sourcing steady, or does it come in bursts with dead days?"
   A single number cannot answer it; 30 daily points can. The zero days are
   the point, which is why the SQL zero-fills rather than omitting them. */
function Trend({ a }: { a: Activity }) {
  const max = a.daily.reduce((m, d) => Math.max(m, d.reveals), 0);
  const active = a.daily.filter((d) => d.reveals > 0).length;

  if (a.daily.length < 14) return null;

  return (
    <section className="ex-sec">
      <div className="ex-sec-head">
        <h2 className="ex-sec-title">Reveals per day</h2>
        <p className="ex-sec-sub">
          {active} active {active === 1 ? "day" : "days"} of {a.daily.length}
          {max > 0 ? `, busiest ${fmt(max)}` : ""}
        </p>
      </div>

      {/* Bars are ink tints, not accent: the accent is reserved for the one
          primary action on the page, and rarity is what gives it force. */}
      <div className="ex-bars" role="img"
           aria-label={`Reveals per day for the last ${a.days} days. ${active} of ${a.daily.length} days had activity. Busiest day ${max}.`}>
        {a.daily.map((d) => (
          <span
            key={d.day}
            className={`ex-bar${d.reveals === 0 ? " is-zero" : ""}`}
            style={{ ["--h" as string]: max > 0 ? `${Math.max((d.reveals / max) * 100, d.reveals > 0 ? 6 : 0)}%` : "0%" }}
            title={`${d.day}: ${d.reveals} ${d.reveals === 1 ? "reveal" : "reveals"}`}
          />
        ))}
      </div>
    </section>
  );
}

/* ── current stage ──────────────────────────────────────────────────────
   Question: "where is everyone I own, right now?" A distribution across more
   than three categories, which is a bar's job rather than a number's.

   NOT a funnel, and deliberately not labelled as one. `candidates.stage` is a
   mutable column and there is no stage-history table anywhere in the schema,
   so nothing here can say when anyone moved or what share converted. Calling
   it a funnel would assert a measurement the data cannot support; it is a
   snapshot, so it says "current stage".

   `stage` also has no CHECK constraint in 01_tenant.sql, so unknown values are
   appended by orderStages rather than dropped: silently omitting one would
   make these bars disagree with the table's total. */
function Pipeline({ a }: { a: Activity }) {
  if (a.funnel.length === 0) return null;
  const rows = orderStages(a.funnel);
  const max = rows.reduce((m, r) => Math.max(m, r.n), 0);
  const open = rows.filter((r) => !TERMINAL_STAGES[r.stage]).reduce((s, r) => s + r.n, 0);
  const total = rows.reduce((s, r) => s + r.n, 0);

  return (
    <section className="ex-sec">
      <div className="ex-sec-head">
        <h2 className="ex-sec-title">Current stage</h2>
        <p className="ex-sec-sub">
          {fmt(open)} of {fmt(total)} still open{a.view === "team" ? ", across the team" : ""}
        </p>
      </div>

      <dl className="ex-stages">
        {rows.map((r) => (
          <div className="ex-stage" key={r.stage}>
            <dt className="ex-stage-name">{r.stage}</dt>
            <dd className="ex-stage-bar">
              <span className="ex-stage-fill" style={{ width: max > 0 ? `${(r.n / max) * 100}%` : "0%" }} />
            </dd>
            <dd className="ex-stage-n">{fmt(r.n)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ── recent ─────────────────────────────────────────────────────────────── */
function Recent({ a }: { a: Activity }) {
  if (a.recent.length === 0) {
    /* Empty state (b)/(c): they have used the extension, so this must not
       re-pitch installing. Either the window is too narrow or nothing is
       saved yet, and those get different sentences. */
    return (
      <section className="ex-sec">
        <div className="ex-sec-head">
          <h2 className="ex-sec-title">Saved candidates</h2>
        </div>
        <div className="ex-note">
          <p className="ex-note-body">
            {a.saved.total === 0
              ? "Revealing a profile does not save it. Use Save in the sidebar to put someone in your pipeline, and they will be listed here."
              : `Nothing saved in the last ${a.days} days. Try a wider window.`}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="ex-sec">
      <div className="ex-sec-head">
        <h2 className="ex-sec-title">Saved candidates</h2>
        <p className="ex-sec-sub">
          Showing {fmt(a.recent.length)} of {fmt(a.saved.total)}
          {a.view === "team" ? ", across the team" : ""}
        </p>
      </div>

      <div className="ex-table-wrap">
        <table className="ex-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Location</th>
              <th scope="col">Contact</th>
              <th scope="col">Stage</th>
              {a.view === "team" && <th scope="col">Owner</th>}
              <th scope="col">Saved</th>
            </tr>
          </thead>
          <tbody>
            {a.recent.map((c) => <Row key={c.candidate_id} c={c} team={a.view === "team"} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ c, team }: { c: RecentCandidate; team: boolean }) {
  const role = [c.current_title, c.current_company_name].filter(Boolean).join(" at ");
  const place = [c.city, c.country].filter(Boolean).join(", ");
  return (
    <tr>
      <td className="ex-cell-name">
        {/* The full value stays reachable via title, per the truncation
            contract: a 90-character name must not break the row. */}
        {c.linkedin_url ? (
          <a className="ex-name-link" href={c.linkedin_url} target="_blank"
             rel="noreferrer noopener" title={c.full_name}>
            {c.full_name}
            <ArrowSquareOut size={12} weight="bold" aria-hidden="true" />
          </a>
        ) : (
          <span title={c.full_name}>{c.full_name}</span>
        )}
      </td>
      <td className="ex-cell-role" title={role || c.headline || ""}>
        {role || c.headline || <span className="ex-dim">not recorded</span>}
      </td>
      <td className="ex-cell-place" title={place}>
        {place || <span className="ex-dim">not recorded</span>}
      </td>
      <td className="ex-cell-contact">
        {/* Icons carry an accessible name each, so contact coverage is not
            encoded by colour or position alone. */}
        {c.has_phone && <Phone size={15} weight="regular" aria-label="Phone on file" />}
        {c.has_email && <EnvelopeSimple size={15} weight="regular" aria-label="Email on file" />}
        {!c.has_phone && !c.has_email && <span className="ex-dim">none</span>}
      </td>
      <td className="ex-cell-stage"><span className="ex-stage-tag">{c.stage}</span></td>
      {team && (
        <td className="ex-cell-owner" title={c.owner_name ?? ""}>
          {c.mine ? "You" : c.owner_name ?? <span className="ex-dim">unassigned</span>}
        </td>
      )}
      <td className="ex-cell-when">{relative(c.created_at)}</td>
    </tr>
  );
}

/* ── install ────────────────────────────────────────────────────────────
   `tone` is the whole difference between empty state (a) and the standing
   footer link. The accent fill exists once on the page, and only in the
   primary tone, which is the state where installing IS the task. */
function InstallPanel({ tone }: { tone: "primary" | "quiet" }) {
  if (tone === "quiet") {
    return (
      <p className="ex-hint">
        <a className="ex-link" href={CHROME_STORE_URL} target="_blank" rel="noreferrer noopener">
          Get the Chrome extension
          <ArrowSquareOut size={12} weight="bold" aria-hidden="true" />
        </a>
        {" "}if you use another browser profile or machine.
      </p>
    );
  }

  return (
    <section className="ex-install">
      <h2 className="ex-install-title">Add the extension to Chrome</h2>
      <p className="ex-install-body">
        Nothing has come through yet. The sidebar is what captures profiles, so
        it needs to be installed in the browser you source in.
      </p>
      <a className="ex-cta" href={CHROME_STORE_URL} target="_blank" rel="noreferrer noopener">
        Install extension
        <ArrowSquareOut size={14} weight="bold" aria-hidden="true" />
      </a>
      <p className="ex-install-foot">
        Signed in with this same account. In <code>chrome://extensions</code> the
        ID reads <code>{EXTENSION_ID}</code>.
      </p>
    </section>
  );
}

/* ── small parts ────────────────────────────────────────────────────────── */

function Segmented({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="ex-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`ex-seg-btn${o.value === value ? " is-on" : ""}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Skeleton geometry matches the loaded page, so nothing jumps when the data
 *  lands. A centred spinner is what the reference rules explicitly refuse. */
function Skeleton() {
  return (
    <Frame>
      <div className="ex-tiles" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div className="ex-tile" key={i}>
            <span className="ex-sk ex-sk-label" />
            <span className="ex-sk ex-sk-value" />
            <span className="ex-sk ex-sk-note" />
          </div>
        ))}
      </div>
      <div className="ex-sec" aria-hidden="true">
        <span className="ex-sk ex-sk-title" />
        <div className="ex-sk ex-sk-chart" />
      </div>
      <p className="sr-only" role="status">Loading your extension activity</p>
    </Frame>
  );
}

/** Grouped thousands, so 1200 reads as 1,200 in a column of numbers. */
function fmt(n: number): string {
  return n.toLocaleString();
}

/**
 * Coarse relative time. Deliberately not a live-updating clock: this is a
 * table someone scans, and a value that rewrites itself while being read is
 * noise. Absolute date past a week, because "37 days ago" is not a date
 * anybody can act on.
 */
function relative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
