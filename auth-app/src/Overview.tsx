import { ArrowRight, CaretRight } from "@phosphor-icons/react";
import {
  ACTIVE_CAMPAIGNS, SOURCED_BY_DAY, STEPS,
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
 * ── THE COLOUR BUDGET IS THREE ──────────────────────────────────────────────
 * "Using 10 different colours makes the dashboard look like a candy store and
 * removes the ability to use colour for emphasis." So: blue owns the chart,
 * violet owns the progress bars, and rose is reserved for the one thing that
 * is actually wrong. Nothing else is coloured — the numbers are ink, the labels
 * are ink-2, and that is what leaves rose with any force.
 *
 * Every figure is a fixture. None of them is derived from a made-up baseline:
 * where a card would need a comparison it does not have, it prints the
 * component parts instead and lets the reader do the comparing.
 */

/* ── sourced over time ───────────────────────────────────────────────────── */

export function SourcedCard() {
  const total = SOURCED_BY_DAY.reduce((a, d) => a + d.n, 0);
  const days = SOURCED_BY_DAY.length;
  /* Per-day average rather than a week-on-week delta: a delta needs a previous
     period and the fixture is one period. Printing a rate that IS derivable
     beats printing a change that is not. */
  const perDay = Math.round((total / days) * 10) / 10;

  return (
    <article className="ov-card ov-chart">
      <header className="ov-head">
        <h3 className="ov-h">Sourced</h3>
        <span className="ov-sub">Last {days} days</span>
      </header>

      <p className="ov-big">
        {/* Counts up on mount. `tabular-nums` on the class, or the row jitters
            for the duration of the count. */}
        <Counter value={total} />
        <span className="ov-big-unit">candidates</span>
      </p>

      {/* The chart fills what the card has left, so the three cards can be
          equal height without this one needing to know what that height is. */}
      <div className="ov-chart-plot">
        <Area data={SOURCED_BY_DAY} hue="blue" w={340} h={104} />
      </div>

      <p className="ov-foot">
        <strong>{perDay}</strong> a day on average
      </p>
    </article>
  );
}

/* ── where they are now ──────────────────────────────────────────────────── */

export function ProgressCard() {
  return (
    <article className="ov-card">
      <header className="ov-head">
        <h3 className="ov-h">Progress</h3>
        <a className="ov-link" href="#/campaign/candidates">
          All candidates <CaretRight size={11} weight="bold" aria-hidden="true" />
        </a>
      </header>

      <ul className="ov-steps">
        {STEPS.map((s) => {
          const pct = Math.round((s.n / s.of) * 100);
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

/** A campaign quiet this long has stalled rather than merely paused. */
const STALE_DAYS = 7;

export function CampaignsCard() {
  const stalling = ACTIVE_CAMPAIGNS.filter((c) => c.quietFor >= STALE_DAYS).length;

  return (
    <article className="ov-card">
      <header className="ov-head">
        <h3 className="ov-h">Active campaigns</h3>
        <span className="ov-sub">{ACTIVE_CAMPAIGNS.length}</span>
      </header>

      <ul className="ov-camps">
        {ACTIVE_CAMPAIGNS.map((c) => {
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
                {c.open} open · {c.live} live
              </span>
              <span className={`ov-camp-q${stale ? " is-stale" : ""}`}>
                {c.quietFor === 0 ? "Today" : `${c.quietFor}d quiet`}
              </span>
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
            {stalling} has had no movement in over a week
            <ArrowRight size={11} weight="bold" aria-hidden="true" />
          </a>
        </p>
      )}
    </article>
  );
}
