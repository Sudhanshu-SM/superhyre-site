import { ArrowRight, CaretRight } from "@phosphor-icons/react";
import type { Scope } from "./orchestrator";
import {
  STALE_DAYS, campaignsFor, isScoped, sourcedFor, stepsFor,
} from "./orchestrator";
import {
  Area, Counter, Dot, Ring,
} from "./viz";
import { Bars } from "./Bars";

/**
 * Home's analytics: one full-width banner, and three cards stacked beside the
 * task list.
 *
 * ── ONE CARD, ONE QUESTION ──────────────────────────────────────────────────
 * The guidance is that a dashboard card holds one metric or one chart, and that
 * a chart has "a fraction of a second to communicate, so clarity beats
 * cleverness". So each of these answers exactly one thing:
 *
 *   Sourced    is the pipeline filling, and at what rate
 *   (next)     reserved — see NextMetricCard
 *   Progress   where are those people now
 *   Campaigns  which reqs are live, and is any of them stalling
 *
 * ── SOURCED IS A BANNER, NOT A STACK ROW ─────────────────────────────────────
 * It used to be the top card of the three-card stack, sized like its
 * neighbours. Moved out because sourcing is most of what a recruiter's day is
 * — squeezing the one chart that carries a genuine trend into a third of a
 * 582px column was the wrong trade the moment there was a whole page width
 * available instead. It is a direct child of `.orc-stream` now, sized like any
 * other section rather than folded into the stack — see `.ov-chart.is-wide`.
 *
 * ── EVERY CARD TAKES THE SAME `scope` AND NONE OF THEM OWNS IT ──────────────
 * The scope is a prop, never state in here. Cards each holding their own copy
 * of "which campaign" is chances to disagree with the header that set it — and
 * a dashboard whose cards disagree about what they are counting is worse than
 * one with no filter at all. They read; Console decides.
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

/* ── sourced over time — the full-width banner ─────────────────────────────
   Scaled up from the card it used to be: a taller plot (220px, up from 104)
   and more x-axis labels (7, up from 4) so the extra width buys a readable
   shape instead of stranded whitespace between four widely-spaced dates. The
   header, the count and the per-day rate are unchanged — a bigger number is
   the only other concession, because the fourteen-day total is still the
   first thing this card should say. */

export function SourcedCard({ scope }: { scope: Scope }) {
  const data = sourcedFor(scope);
  const total = data.reduce((a, d) => a + d.n, 0);
  const days = data.length;
  /* Per-day average rather than a week-on-week delta: a delta needs a previous
     period and the fixture is one period. Printing a rate that IS derivable
     beats printing a change that is not. */
  const perDay = Math.round((total / days) * 10) / 10;

  return (
    <article className="ov-card ov-chart is-wide">
      {/* ── THE HEADER IS JUST A HEADER AGAIN ──
          The total used to live here as a 32px number on its own row, which
          cost two things: the panel sat 74px from the card's top edge against
          17px on the right, and the figure had no container — a big number
          alone in white space reads as something left behind rather than as a
          summary. It moved inside the plot, where it is the total OF the
          series it sits on. This row is now one line: what the card is, and
          over what period. */}
      <header className="ov-head">
        <h3 className="ov-h">Sourced</h3>
        <span className="ov-sub">{perDay} a day · last {days} days</span>
      </header>

      <div className="ov-chart-plot">
        {/* ORANGE, because the brand is. `hue` drives the furniture — the
            panel wash and the dashed rules come off --c-brand's tint and line
            tokens, which are the palest members of the family and exactly
            what a background and a reference line should be. `accent` drives
            the DATA, and it is --accent-fill rather than the hue's own base:
            #c87248 measures 3.53:1 on white but sits on a warm panel here,
            where it went muddy. --accent-fill is 4.52:1 and reads as a line
            rather than a stain.

            That split is the whole reason `accent` exists as a separate prop
            — see Area. Furniture wants the pale end of a family, data wants
            the deep end, and one token cannot be both. */}
        <Area
          data={data}
          hue="brand"
          accent="var(--accent-fill)"
          h={220}
          labels={7}
          noun="sourced"
          total={
            <>
              {/* Counts up on mount AND on scope change, so switching
                  campaigns animates to the new datum instead of snapping.
                  `tabular-nums` lives on .vz-total, or the card jitters for
                  the duration of the count. */}
              <Counter value={total} />
              <span className="vz-total-u">candidates</span>
            </>
          }
        />
      </div>
    </article>
  );
}

/* ── conversion: rates, not counts ────────────────────────────────────────────

   Sourced's old slot at the top of the stack. Not a fourth volume number —
   Progress right below already owns raw counts, so repeating them here would
   answer the same question twice. A RATE is a different question: not how
   many, but how well each step is converting, which is the number a
   recruiter checks against their own gut sense of whether outreach is working.

   ── WHICH THREE, AND WHY NOT FIVE ──
   Researched against real 2026 sourcing-outreach benchmarks before picking
   these three:
     Response rate       replied / contacted   the industry's own headline
                          metric — cold email averages ~5%, personalised
                          outreach 18-25%, top-decile senders ~11%. A number
                          worth comparing yourself against, which is exactly
                          what a bare percentage cannot support on its own.
     Interview rate       interviews / replied  is the screening any good,
                          once someone is actually talking to you.
     Sourced -> interview  interviews / sourced  the top-line yield: how many
                          do I need to source for one interview. Comparable to
                          the ~4-5% industry figure for applicant funnels.
   Shortlist rate and contact rate exist in the same data and were left out.
   The KPI-card research is consistent on this: a repeated element loses the
   viewer's attention fast past the first couple, and this is one card in a
   stack, not a KPI row that gets a whole page width to spread five numbers
   across.

   ── NEVER A BARE PERCENTAGE ──
   Every ratio prints its own numerator/denominator underneath, because the
   research is unanimous that an isolated percentage is a vanity metric — a
   28% response rate off 61 contacted reads completely differently than the
   same 28% off 4. This is the same rule Progress already follows with its
   `of X` labels; here each of the three ratios needs its OWN denominator
   printed, since 61, 17 and 148 are three different bases, not one shared at
   the top of the card.

   All three fold out of the exact same `stepsFor` call Progress makes — no
   new fixture, and no risk of disagreeing with it. */
export function ConversionCard({ scope }: { scope: Scope }) {
  const steps = stepsFor(scope);
  const [shortlisted, , replied, interviews] = steps;

  /* shortlisted.of and contacted.of are both the sourced total (see
     stepsFor) — reusing it here rather than calling sourcedFor again keeps
     this card's number identical to Progress's by construction. */
  const sourced = shortlisted!.of;

  /* ── ORANGE, BECAUSE THE BRAND IS ORANGE — AND TINTS, NOT SHADES ──
     These were violet first (a hue the brand does not own), then three
     SHADES of the accent — #ea5a1e / #cc4d17 / #b8400f, getting progressively
     darker and reading burnt. Now three TINTS: the same accent stepped
     toward white instead of toward black.

     What made tints possible was moving the TRACK, not the arcs. An arc is
     read against the ring it sits in, and the brand hue's own `line` token is
     a mid tint, so `--accent` on `--c-brand-line` measured only 2.39:1 — the
     brand family had the worst arc/track separation of any hue while looking
     the heaviest on the page. Dropping the track to the much paler
     `--accent-tint` lifts that same arc to 3.02:1, and THAT headroom is what
     the arcs spend on being lighter. Measured against the pale track:
     3.02 / 2.69 / 2.44:1, each step visibly lighter than the last.

     ── AND THE STEPS ARE SPACED BY dE, NOT BY EYE ──
     The first attempt at this stepped 1.00 / 0.90 / 0.82 along a white-mix
     ramp and the three were indistinguishable — measured, dE 9.2 and 8.5,
     which is under the ~10 where two colours stop reading as two colours at
     all. WCAG contrast was the wrong metric to pick steps with: it answers
     "can I see this against the background", not "can I tell these apart".
     Spaced by CIELAB dE instead, these land at 23.1 and 24.9 — roughly two
     and a half times the separation, and visibly three tints rather than one
     colour drawn three times.

     They are also a LIGHTNESS ramp at constant saturation rather than a mix
     toward white: mixing with white desaturates, so the light end went chalky
     exactly where it needed to stay orange.

     Against white they run 3.47 / 2.58 / 2.05:1, so the lighter two sit under
     the 3:1 a lone data mark owes. They are not lone data marks: every ring
     prints its own percentage in the centre and its own numerator and
     denominator underneath, which is this file's stated test — remove the
     colour entirely and all of it still reads. The contrast that governs
     whether you can see where an arc ENDS is arc-against-track, and all three
     clear that (2.97 / 2.23 / 1.65:1).

     The label does not follow the arc: it stays on --c-brand-text for all
     three, because a tint light enough to be a pleasant arc is nowhere near
     the 4.5:1 that the number inside it owes as text. */
  const stats = [
    { label: "Response rate", n: replied!.n, of: replied!.of, unit: "replied",
      color: "#ed5a1d" },
    { label: "Interview rate", n: interviews!.n, of: interviews!.of, unit: "replied",
      color: "#f1834f" },
    { label: "Sourced → interview", n: interviews!.n, of: sourced, unit: "sourced",
      color: "#f6a98a" },
  ];

  return (
    <article className="ov-card">
      <header className="ov-head">
        <h3 className="ov-h">Conversion</h3>
      </header>

      {/* RINGS, not bare percentages. The two research findings that changed
          this card: a percentage with nothing else on the page is a vanity
          metric — every KPI-card guide says pair it with the numerator and
          denominator, which the caption line already did — but a bare number
          is also not yet a VISUAL, and "too bland" was the actual complaint.
          A ring is a fraction of a circle, which is what a rate literally is;
          it also arrives with the arrival motion every other data primitive
          on this page already uses (the value sweeps in on mount), which text
          alone cannot do. `Ring` already existed in viz.tsx unused — this is
          its first caller.

          78px. It went 68 -> 46 when the whole page was over-inflated, but
          the thing actually inflating it was the VERTICAL funnel in the card
          below; that is horizontal now, so this card's height is set by the
          task list beside it rather than by its own content, and the ~50px of
          slack the rings were leaving was free to spend. Checked: at 78 the
          card's min-content is still under the 185px the task list dictates,
          so a bigger ring costs nothing anywhere. */}
      <div className="ov-conv">
        {stats.map((s) => (
          <div className="ov-conv-stat" key={s.label}>
            <Ring
              value={s.n} max={s.of} hue="brand"
              size={78} width={8}
              color={s.color} track="var(--accent-tint)"
            />
            <p className="ov-conv-label">{s.label}</p>
            <p className="ov-conv-of">{s.n} of {s.of} {s.unit}</p>
          </div>
        ))}
      </div>
    </article>
  );
}


/* ── where they are now ──────────────────────────────────────────────────── */

export function ProgressCard({ scope }: { scope: Scope }) {
  const [, contacted, replied, interviews] = stepsFor(scope);

  /* ── THE TRUE CHAIN, WHICH IS NOT THE ORDER stepsFor RETURNS ──
     `stepsFor` denominates Shortlisted against SOURCED and Contacted against
     SOURCED. Those are two parallel judgements over one pool, not consecutive
     stages, and drawing them in sequence is what made every previous version
     of this card need a reorder hack and still come out with a step in the
     middle of the silhouette.

     The chain the denominators actually describe is a strict nesting:

         Sourced -> Contacted (of sourced) -> Replied (of contacted)
                 -> Interviews (of replied)

     Every stage is a subset of the one before, so the taper is monotonic by
     construction rather than by sorting, and no display-order fix is needed.

     Sourced is synthesised as the head of the chain from `contacted.of` —
     the same total the Sourced banner prints, read off the step that is
     already denominated against it, so the two cannot disagree.

     Shortlisted is deliberately absent. It is a real number and it is not a
     funnel stage; forcing it into a sequence it does not belong to is the
     thing that was breaking the shape. If it wants a home it needs one that
     does not imply sequence. */
  const sourced = contacted!.of;

  const chain = [
    { id: "sourced", label: "Sourced", n: sourced, of: sourced },
    { id: "contacted", label: "Contacted", n: contacted!.n, of: contacted!.of },
    { id: "replied", label: "Replied", n: replied!.n, of: replied!.of },
    { id: "interviews", label: "Interviews", n: interviews!.n, of: interviews!.of },
  ];

  return (
    <article className="ov-card">
      <header className="ov-head">
        <h3 className="ov-h">Pipeline</h3>
        <a className="ov-link" href="#/campaign/pipeline">
          All candidates <CaretRight size={11} weight="bold" aria-hidden="true" />
        </a>
      </header>

      {/* Bars, not a funnel: a funnel's tapering shape makes every drop look
          like a loss. Bars just say how many people are at each step, which
          is what the recruiter wants to read. */}
      <Bars orient="horizontal" unit="people" data={chain.map((c) => ({ label: c.label, value: c.n, hint: c.id === "sourced" ? `${c.n} sourced` : `${c.n} of ${c.of}` }))} />
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
              <Dot hue={stale ? "amber" : "sage"} />
              <a className="ov-camp-n" href="#/campaign">{c.name}</a>
              <span className="ov-camp-m">
                {solo ? c.role : `${c.live} in pipeline`}
              </span>
              <span className={`ov-camp-q${stale ? " is-stale" : ""}`}>
                {c.quietFor === 0 ? "Active today" : stale ? "Could use a nudge" : `${c.quietFor}d ago`}
              </span>
              {solo && (
                <span className="ov-camp-x">{c.live} in pipeline</span>
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
            {stalling === 1 ? "One campaign could use a nudge" : `${stalling} campaigns could use a nudge`}
            <ArrowRight size={11} weight="bold" aria-hidden="true" />
          </a>
        </p>
      )}
    </article>
  );
}
