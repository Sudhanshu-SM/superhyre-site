import { ArrowRight, CaretRight } from "@phosphor-icons/react";
import type { Scope } from "./orchestrator";
import {
  STALE_DAYS, campaignsFor, isScoped, sourcedFor, stepsFor,
} from "./orchestrator";
import { Area, Counter, Dot } from "./viz";

/**
 * The three analytics cards on Home's right column.
 *
 * ── ONE CARD, ONE QUESTION ──────────────────────────────────────────────────
 * The guidance is that a dashboard card holds one metric or one chart, and that
 * a chart has "a fraction of a second to communicate, so clarity beats
 * cleverness". So each of these answers exactly one thing:
 *
 *   Sourced    is the pipeline filling, and at what rate
 *   Progress   where are those people now
 *   Campaigns  which reqs are live, and is any of them stalling
 *
 * ── EVERY CARD TAKES THE SAME `scope` AND NONE OF THEM OWNS IT ──────────────
 * The scope is a prop, never state in here. Three cards each holding their own
 * copy of "which campaign" is three chances to disagree with the header that
 * set it — and a dashboard whose cards disagree about what they are counting is
 * worse than one with no filter at all. They read; Console decides.
 *
 * The numbers themselves come from `sourcedFor` / `stepsFor` / `campaignsFor`,
 * which FOLD per-campaign fixtures. "All campaigns" is the sum of the parts
 * rather than a fourth hand-written total, so the filter cannot be caught
 * lying — see the overview section of orchestrator.ts.
 *
 * ── THE COLOUR BUDGET IS THREE ──────────────────────────────────────────────
 * "Using 10 different colours makes the dashboard look like a candy store and
 * removes the ability to use colour for emphasis." So: blue owns the chart,
 * violet owns the progress bars, and rose is reserved for the one thing that
 * is actually wrong. Nothing else is coloured — the numbers are ink, the labels
 * are ink-2, and that is what leaves rose with any force.
 */

/* ── sourced over time ───────────────────────────────────────────────────── */

export function SourcedCard({ scope }: { scope: Scope }) {
  const data = sourcedFor(scope);
  const total = data.reduce((a, d) => a + d.n, 0);
  const days = data.length;
  /* Per-day average rather than a week-on-week delta: a delta needs a previous
     period and the fixture is one period. Printing a rate that IS derivable
     beats printing a change that is not. */
  const perDay = Math.round((total / days) * 10) / 10;

  return (
    <article className="ov-card ov-chart">
      <header className="ov-head">
        <h3 className="ov-h">Sourced</h3>
        {/* The rate AND the range on one line. The average used to sit in a
            footer beneath the chart; the x-axis wanted that row, and a rate
            belongs next to the range it is averaged over anyway. */}
        <span className="ov-sub">{perDay} a day · last {days} days</span>
      </header>

      <p className="ov-big">
        {/* Counts up on mount AND on scope change, so switching campaigns
            animates to the new datum instead of snapping. `tabular-nums` on
            the class, or the row jitters for the duration of the count. */}
        <Counter value={total} />
        <span className="ov-big-unit">candidates</span>
      </p>

      <div className="ov-chart-plot">
        <Area data={data} hue="blue" h={104} />
      </div>
    </article>
  );
}

/* ── where they are now ──────────────────────────────────────────────────── */

export function ProgressCard({ scope }: { scope: Scope }) {
  const steps = stepsFor(scope);

  return (
    <article className="ov-card">
      <header className="ov-head">
        <h3 className="ov-h">Progress</h3>
        <a className="ov-link" href="#/campaign/candidates">
          All candidates <CaretRight size={11} weight="bold" aria-hidden="true" />
        </a>
      </header>

      <ul className="ov-steps">
        {steps.map((s) => {
          /* Guarded rather than assumed non-zero: scoped to one campaign a
             step's denominator is that campaign's previous step, and a
             campaign with nothing contacted yet would divide by zero. */
          const pct = s.of > 0 ? Math.round((s.n / s.of) * 100) : 0;
          return (
            <li key={s.id} className="ov-step">
              <span className="ov-step-l">{s.label}</span>
              {/* The bar is the ratio to the step BEFORE it, which is the only
                  honest denominator for a funnel: 17 replies is 28% of the 61
                  contacted, not 11% of everyone sourced. The denominator is
                  printed so the percentage can be checked. */}
              <span className="ov-step-track">
                <span className="ov-step-bar" style={{ width: `${pct}%` }} />
              </span>
              <span className="ov-step-n">{s.n}</span>
              <span className="ov-step-of">of {s.of}</span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/* ── which reqs are live ─────────────────────────────────────────────────── */

export function CampaignsCard({ scope }: { scope: Scope }) {
  const camps = campaignsFor(scope);
  const stalling = camps.filter((c) => c.quietFor >= STALE_DAYS).length;
  /* Scoped to one campaign the list is a single row, which leaves this card
     with slack its siblings do not have. It spends that on the campaign's own
     subtitle rather than on air — the same row, one more true fact about it. */
  const solo = isScoped(scope);

  return (
    <article className="ov-card">
      <header className="ov-head">
        <h3 className="ov-h">Active campaigns</h3>
        <span className="ov-sub">{camps.length}</span>
      </header>

      <ul className={`ov-camps${solo ? " is-solo" : ""}`}>
        {camps.map((c) => {
          const stale = c.quietFor >= STALE_DAYS;
          return (
            <li key={c.id} className="ov-camp">
              {/* The ONE place colour appears in this card, and only when a
                  campaign has actually gone quiet. A dot on every row would
                  make the palette decorative and leave nothing to mark the
                  row that needs attention. */}
              <Dot hue={stale ? "rose" : "sage"} />
              <a className="ov-camp-n" href="#/campaign">{c.name}</a>
              <span className="ov-camp-m">
                {solo ? c.role : `${c.open} open · ${c.live} live`}
              </span>
              <span className={`ov-camp-q${stale ? " is-stale" : ""}`}>
                {c.quietFor === 0 ? "Today" : `${c.quietFor}d quiet`}
              </span>
              {solo && (
                <span className="ov-camp-x">{c.open} open · {c.live} live</span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Stated only when true, and phrased as the fact rather than an alarm.
          A permanent "0 stalling" row is a fixture reporting the absence of a
          problem. */}
      {stalling > 0 && (
        <p className="ov-foot">
          <a className="ov-link is-warn" href="#/campaigns">
            {stalling === camps.length && camps.length === 1
              ? "No movement in over a week"
              : `${stalling} has had no movement in over a week`}
            <ArrowRight size={11} weight="bold" aria-hidden="true" />
          </a>
        </p>
      )}
    </article>
  );
}
