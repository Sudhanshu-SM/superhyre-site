# Analytics design brief (13 Oct 2026)

> **Round 2, 13 Oct evening: this layout supersedes sections 2 and 5 below.** The owner called the first build
> "monotonous" and said data was cut off and the page would not scroll. What changed, in one place:
>
> - **The page is one screen.** On a window of 1241px or more wide and 700px or more tall the page is exactly the
>   window (`.an-page { height: calc(100dvh - 43px) }`): header, toolbar, a row of tiles, then 1 or 2 rows of cards
>   whose rows are `fr` units, so charts fill what they are given. Shorter windows (under 860px tall) tighten the
>   same page; narrower or under 700px tall it grows and scrolls. `.con-main:has(> .an-page)` scrolls inside the
>   locked frame above 1000px tall, so nothing is ever cut.
> - **Nothing is below the fold, and nothing is cut.** A card shows 5 to 8 rows or cards and "View all N" opens a
>   window with search, sort, CSV, focus trap, Esc, full screen on a phone. Definitions moved behind "How this is
>   counted"; "by week per person" is behind a person's card.
> - **Personality, in the console's own language.** One warm headline per page built from its figures
>   (`analyticsView.ts`: `overviewSay`, `teamSay`, ...), tiles with a tinted icon chip, the stage colours of
>   `statusTones.css` (found neutral, shortlisted ink, contacted amber, replied green, interviewing blue, hired
>   orange), rounded bars with the latest in orange, hires as sparkle dots, people and campaigns as cards.
> - Parts: `analyticsKit.tsx` (Tile, Panel, Avatar, DataModal, SayLine), `AnalyticsCharts.tsx` (RoundFunnel,
>   WeekBars, DotStrip, StageLanes, HourStrip, Ring, MiniFunnel, RankedBars), `analytics.css` (grid areas per page).
> - Try it without an API: the harness with `?rows=60` (every list 60 long) or `?empty=1` (a workspace with nothing).

Scope: visual and layout design for the five Analytics pages (Overview, Recruiters / My work, Outreach, Pipeline, Campaigns). Metrics, definitions and API stay as in `analytics-research-2026-10-13.md` and `analytics-api.md`. No product code here. Token names map to `access.css` / `theme/theme.css`; new ones are prefixed `--an-`. Choices, not options.

## 0. Verdict on the current page (51.png) and the five rules

| What is wrong now | Why it hurts | Fix |
|---|---|---|
| Six 10px bars on a 1060px track, label far left, number far right | Eye travels 1100px; Hired (4 of 591) is under 1% of the track; a quarter of the screen is empty on the right | Stepped-area funnel inside an 8-column card (4.1) |
| "24% carried on" under every bar, "more than the 30 days before" four times | Same sentence six and four times; and the rates do not match the bars as drawn (223 of 591 is 38%, shown 24%; 23 of 37 is 62%, shown 19%) | One rate per step, one comparison window stated once in the filter bar, rates and bars from the same `{n, of}` |
| Five pairs of ~77px columns, orange plus near-white, one y tick ("8") | Hired (the smaller series) is the loudest object on a dark page; fat blocks; no scale | One series per panel, columns max 20px, three hairline gridlines |
| Only the last KPI has a sparkline | Inconsistent; looks like a bug | Every figure has one, or none do |
| Every section is full width and stacked | Nothing sits side by side, so the page is long and thin | 12-column card grid, spans per page (section 2) |
| Empty periods are a sentence in a void | Reads as broken | Ghost chart in the same card shape (section 4.3) |

Rules: (1) Orange means **hired**, nothing else; every other mark is a warm neutral. (2) Length and position carry numbers; colour never encodes magnitude. (3) One number says one thing once (no repeated percentages, no repeated comparison phrases). (4) Every card has the same four states in the same height: loading, empty, small-n, error. (5) Marks are thin, grid is hairline, text is ink tokens, never series colour.

## 1. Research: what we took, what we did with it

| Finding | Source | Decision here |
|---|---|---|
| Length and 2D position are the accurate channels; colour is for categories not magnitude; avoid pie/donut and radial gauges (use bullet); design for a glance | [NN/g dashboards](https://www.nngroup.com/articles/dashboards-preattentive/) | Bars, columns, stepped area, bullet rows. No donut, no gauge |
| Plausible: six numbers, one chart, four panels, no sub-menus; compare is a toggle; incomplete period drawn dotted | [Plausible tour](https://plausible.io/docs/guided-tour) | Stat strip then one hero chart; this-week column drawn at 55% with "so far" |
| Mobbin's 2,108-dashboard study summarised as "five stats, one chart, two columns" (page blocked to fetch; from search snippet) | [Mobbin](https://mobbin.com/blog/what-good-dashboard-design-looks-like) | 3 to 4 stats per strip, two-column card rows |
| Value above chart; same fixed height for loading, error, empty and populated; do not go below ~200px chart width; 180 compact, 320 featured | [Stripe chart layout](https://docs.stripe.com/stripe-apps/patterns/chart-layout) | Plot heights 120 / 220 fixed across states; funnel never narrower than 480px |
| Pair each metric with context (this week, last week, highs and lows); operations views denser than strategy views | [Linear dashboards](https://linear.app/now/dashboards-best-practices) | Delta in the strip, previous value in the tooltip; Overview is an operations page |
| Same layout, spacing and legend position on every chart; most important data gets most contrast and area; on dark themes sequential scales reverse (lightest = most) | [Carbon dashboards](https://carbondesignsystem.com/data-visualization/dashboards), [Carbon colour](https://carbondesignsystem.com/data-visualization/color-palettes/) | One card anatomy; heat ramp built from ink so "more ink = more" in both themes |
| Marks 3:1, text and axes 4.5:1; omit legend for one series; limits: 5 lines, 10 bars, 5 segments, 5 slices; table preview + CSV | [Primer data viz](https://primer.style/product/ui-patterns/data-visualization/) | Same limits; "View as table" on every chart |
| Bullet graph: one measure bar, a comparative tick, at most 3 to 5 single-hue ranges, linear not radial | [Few, bullet spec](https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf) | Step-duration rows (median bar + previous-period tick); campaign progress |
| Sparkline: word-sized, wider than tall (5:1 and up), mark the end value, no frames or boxes | [Tufte](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/) | 9:1 sparkline under each figure, end dot only |
| Empty state: say it only after the load finishes, explain, link the path; skeletons only for waits under ~10s, skip under ~1s, frame-only skeletons read as broken | [NN/g empty](https://www.nngroup.com/articles/empty-state-interface-design/), [NN/g skeletons](https://www.nngroup.com/articles/skeleton-screens/) | Loading shows the card's own shape after 200ms; caption only after data arrives |
| Empty copy: title is a short phrase with a full stop, description under 14 words and active, action matches title; filtered-out is not "create first" | [Stripe empty state](https://docs.stripe.com/stripe-apps/patterns/empty-state) | Copy rules in 4.3 |
| Donut only for one whole, 2 to 5 exclusive parts; stacked segments are harder to read than bars | [Datawrapper donut](https://www.datawrapper.de/academy/how-to-create-a-donut-chart), [stacked](https://www.datawrapper.de/blog/stacked-column-charts) | Source of hire = ranked table with a bar, not donut or stack |
| Funnel tools offer "overall" vs "relative to previous step" and time-to-convert; Gem colours passthrough red/yellow/green and offers time in stage | [PostHog funnels](https://posthog.com/docs/product-analytics/funnels), [Gem](https://help.gem.com/external/the-pipeline-analytics-dashboard) | Show step rate only (relative); time in stage lives on Pipeline; no traffic-light fills |
| Dark mode: avoid pure white on pure black, desaturate, do not just invert | [Playfair](https://playfairdata.com/how-to-create-light-mode-and-dark-mode-dashboards-in-tableau/), [Chameleon](https://arxiv.org/html/2512.00516v2) | Dark tokens are selected, validated separately (3.3) |
| Volume leaderboards invite gaming; Loxo caps at 10 | research doc 1.2 | People table sorted by name, no data bars (decision A) |

Caveat: Dribbble, Behance, Mobbin and Refero shot pages returned no readable content to the fetch tool, so gallery links below are for the builder to open, not evidence I verified pixel by pixel.

## 2. Page template

```
PageHead   title (24) + one-line lede (14, ink-2, max 64ch)                   no eyebrow, no hero
FilterBar  sticky, top 0, ~64px: [7d|30d|90d|Custom] [Campaign v] [Client v] [Recruiter v]   Clear   14 Sep-13 Oct vs 15 Aug-13 Sep
Body       12-col grid, gap 16: StatStrip (12) -> hero card(s) -> tables; group headings only where a page has two topics
Footnote   <details> "How these are counted" (existing .an-defs), definitions one line each
```

| Viewport | Well | Grid | Strip | Hero card | Side card | Pairs | Tables |
|---|---|---|---|---|---|---|---|
| 1440 | min(1280, 100%) centred, side padding 32 | 12 col, gap 16 | 4 across | span 8 | span 4 | 6 + 6 | span 12 |
| 1280 | about 1000 | 12 col, gap 16 | 4 across | span 8 | span 4 | 6 + 6 | span 12 |
| 768 | about 700 (rail or drawer nav) | 12 col, gap 16 | 2 x 2 | span 12 | span 12 | 6 + 6 | span 12, scroll inside, sticky first column |
| 390 | 358 (side 16) | 1 col, gap 12 | 2 x 2 | span 12 | span 12 | stacked | scroll inside, or row cards (Campaigns) |

- Filter bar: filters scope everything below, live in the URL, never inside a card. Period is first. The comparison window is printed once, right-aligned, so figures never repeat "vs the 30 days before". "Clear" appears only when a non-default filter is set. Under 560px it is static, pickers two per row (existing behaviour).
- Card anatomy: 1px `--an-edge`, radius 12, padding 20 (16 under 600), no shadow. Header = title (16/600) + optional one-line caption (13, ink-2) + right slot (CSV on tables only). Footer = at most one plain sentence ("Biggest drop: found to shortlisted."). "View as table" text button bottom-left on charts.
- Stat strip: one bordered container, cells divided by hairlines (not four cards). Cell = label, value, one muted line `context + delta`, sparkline.
- Refetch keeps the frame at 55% opacity (existing `.an-body.is-busy`); no skeleton flash after first load.

## 3. Tokens

### 3.1 Space, shape, size

| Token | Value | Notes |
|---|---|---|
| Spacing scale | 4 8 12 16 20 24 32 48 | card gap 16, card padding 20, section gap 24, strip cell padding 16 x 20 |
| `--an-radius` | 12px | cards and strip; controls keep 8 to 10 |
| `--an-well` | 1280px | page max width, centred |
| Plot heights | KPI spark 28; weekly 120; funnel 220; heat row 20 (cell) | plus 24 axis band; same across states |
| Mark widths | column max 20, bar 8, spark and chart line 2, end dot r 4 with 2px surface ring | thin marks; 2px surface gap between touching fills |
| Row height | table row 44, header 36 | tap targets at least 32 |

### 3.2 Type (existing roles, no new sizes)

| Role | Token | Spec |
|---|---|---|
| Page title | `--type-title-lg` | 24/32 600 display face |
| Lede, table cell | `--type-body` | 14/20; cells tabular, right-aligned |
| Card title | `--type-title-sm` | 16/24 600 |
| Group heading (Emails / Calls) | `--type-title` | 20/28 |
| Stat label | `--type-label` | 13/500 ink-2 |
| Stat value | `--type-num-lg` | 28/32, **proportional** (drop tabular-nums on `.an-figs dd`: `121` looks loose at display size) |
| Funnel count | `--type-num-md` | 20/24 proportional |
| Delta, context, captions, footer | `--type-body-sm` | 13/20 ink-2 |
| Axis ticks, tooltip labels, step rates | `--type-caption` | 12/16 ink-2, tabular |
| Tooltip value | `--type-label` | 13/500 ink |

### 3.3 Colour (selected per theme, same roles)

| Role | Token = existing | Light | Dark | Contrast on card L / D | Use |
|---|---|---|---|---|---|
| Hire mark | `--an-hire` = `--accent-fill` | #cc4d17 | #cc4d17 | 4.52 / 3.96 | Hired step, Hired columns, Hires spark, progress fill, source bar |
| Hire wash | `--an-hire-wash` new | #f8e6df | rgba(255,255,255,.07) | decorative | area under the hired line; dark is neutral on purpose (orange on near-black reads brown) |
| Neutral mark | `--an-neutral` = `--nav-edge` | #9d8979 | #6c6c6c | 3.34 / 3.41 | every non-hire bar, line, step, spark |
| Strong neutral | `--an-strong` = `--ink` | #312a23 | #ececec | 14.1 / 15.2 | past-threshold segment, selected row mark |
| Text | `--ink` / `--ink-2` / `--ink-3` | #312a23 / #5c524b / #776d66 | #ececec / #b4b4b4 / #8f8f8f | 14.1, 7.6, 5.0 / 15.2, 8.7, 5.5 | ink-3 for tertiary captions only |
| Card edge | `--an-edge` = `--nav-edge-panel` | #e2ded9 | #303030 | 1.34 / 1.36 | card, strip, table rules |
| Grid, dividers | `--an-grid` = `--hairline` | #edeae6 | #262626 | 1.20 / 1.18 | gridlines (solid 1px), funnel step dividers |
| Plane | `--an-plane` = `--sub` | #f3f2f0 | #1f1f1f | 1.12 / 1.09 | tracks, zero heat cell, skeleton blocks |
| Heat ramp 1..5 | `--an-heat-n` new | ink mixed into card at 20 / 38 / 56 / 74 / 92% | same formula (ink is light) | 1.5 to 11.0 / 1.8 to 13.0 | one hue, more ink = more; zero cell = plane |
| Ghost fill / line | `--an-ghost-fill`, `--an-ghost-line` new | #f8e6df to transparent / #ead0c3 | rgba(255,255,255,.08) to transparent / rgba(255,255,255,.18) | decorative, aria-hidden | section 4.3 |
| Error | `--c-rose-text` + icon | #b84054 | #ee8fa0 | 5+ | only in error state, never on data |

Checked with the dataviz validator: accent vs neutral is ΔE 15.3 normal / 10.2 deutan (light) and 18.1 / 10.5 protan (dark), marks at least 3:1 in both themes. The validator's chroma-floor FAIL is by design: the neutral is not a hue, identity rides on direct labels and position, not on colour. Delta text is neutral ink-2 with a sign and arrow glyph; no green/red (owner rule), good-direction is said in words when it is not obvious ("Time to fill 3 days longer").

## 4. Components

### 4.1 Spec table

| Component | Size | Marks and encoding | Labels, axes, legend | Tooltip, interaction |
|---|---|---|---|---|
| StatCell | 1/4 of strip, about 128 tall | Value 28, one muted line, spark 28 high full cell width, weekly buckets (daily if 14 days or fewer), neutral line, end dot; Hires uses `--an-hire` | Label above value; `5 of 20 planned · ↑ 4`; counts compact from 10,000 (12.9K); durations "6.5 days", "3h 12m" | Hover/focus the spark: bucket value; whole cell links to detail when one exists |
| StepFunnel | span 8, plot 220 + 56 label band | Stepped area: 6 equal columns flush, 2px top line (neutral, last step `--an-hire`), 10% wash fading to transparent, 12px rounded risers, 1px `--an-grid` dividers; height linear in count, floor 2px | Count (20) above each step, stage label (13/500) below, one step rate (12, ink-2) under the label, none under Found; footer names the biggest drop in words | Tooltip: stage, count, "38% of Found, 46% of the step before"; arrows move between steps. Under 520px card width becomes a 6-row list: label, 8px bar, count, rate |
| WeekColumns | two panels in one span-12 card, plot 120 + 24 | One series per panel; column max 20, 4px top radius, flush baseline; zero weeks drawn as a 2px tick; this week at 55% | Y: 0, mid, max hairlines, labels left; X: week start "14 Sep", every 2nd or 3rd past 8 weeks; value only on the max and the latest bar; no legend (panel title names it) | Tooltip: week, value, "previous period: 5"; crosshair not needed (bar is the target); slot is full-height hit area |
| PeopleTable | span 12 | Sorted by name; tabular numerals; idle rows ink-2; 8-week activity spark column; tfoot Team total; no data bars, no rank | Group row Reach / Movement; workload columns behind "Show workload"; sticky first column and header | Row click opens that person's weekly small multiples under the table; `aria-pressed` on the name |
| RankedBars | span 5, row 36 | Horizontal bar 8px, radius 4 at the end, neutral, label column 9rem fixed, count right, share as muted text only if it adds | Sorted by count desc; max 6 rows then "Other" | Hover/focus row: count and share; same bar start column so lengths compare |
| Heatmap | span 12, cell 20 high, gap 2, radius 3 | 7 rows (Mon..Sun) x 24 hours, or 1 x 24 when only hour is known; 5-step ramp, zero = plane | Hour labels every 6; weekday labels left; legend "Fewer ▢▢▢▢▢ More" | Per-cell tooltip "Tue 10:00, 14 sent"; hidden entirely under 30 emails |
| StageBars (Pipeline now) | span 7, row 40 | One bar per stage, length = people, two segments: on pace `--an-neutral`, past threshold `--an-strong`, 2px gap | Right text "4 past 7 days"; no colour-only meaning | Tooltip: counts; row links to the filtered board |
| StepDuration (bullet rows) | span 6, row 36 | Bar = median days this period (8px), tick 2 x 14px = previous period (Few's comparative measure) | Median "6.5 days", n in caption; under 3 values "Not enough yet" | Tooltip: this, previous, n |
| SourceTable | span 6 | Rows by hires desc; first column carries a 6px bar = share of all hires, `--an-hire`; added / interviewed / hired as numbers | One-line caption defines "source" | Row focus shows the three counts |
| CampaignTable | span 12 | Per row: hired-of-planned bullet (6px bar, accent on plane, capped at 100%), micro funnel (6 columns 6px wide, 24 high, scaled to its own Found, neutral, last accent), muted "Quiet for 9 days" | Name + client below in caption; sticky first column | Micro funnel tooltip lists all six counts; row opens the campaign |
| WorthALook | span 4 | Plain list, up to 3 sentences, each a link; none = "All calm." | No icons, no pills | Link underline on hover |

### 4.2 States (same height in all four)

| State | Treatment |
|---|---|
| Loading | After 200ms: the card's own ghost shape at 100% of its height, no caption, opacity pulse 0.6 to 1 over 1.4s. Header and title are real text from the start. Under 1s total it is never shown. (NN/g prefers a spinner for a single module; we keep the card's shape so nothing reflows, as Stripe's pattern holds the height.) |
| Empty | Ghost chart (4.3) + one caption. "Empty" is only set when the response says `empty` for this card, never during loading. |
| Small-n | Real chart, real marks. Ratios with `of < 5` print "2 of 4" (no percent, no rate on the funnel step); medians under 3 values print "Not enough yet"; a one-line footer "Only 4 so far" when the whole card is under 5. |
| Error | Frame stays; content replaced by "Couldn't load {thing}." + Retry text button + 16px alert icon (rose text). Never blocks the filter bar or other cards. |

### 4.3 Ghost chart spec (matches 52.png, themed)

| Part | Spec |
|---|---|
| Shape | The same geometry as the live chart at the same size, drawn from fixed fake values (never random per render) |
| Fill | `--an-ghost-fill`: top colour at 100% fading to transparent by 92% of height (mask: opaque to 35%, transparent at 95%) |
| Line | 2px top edge or 1px dividers in `--an-ghost-line`, fading with the fill; no axes, no numbers, no tooltip, `aria-hidden` |
| Caption | Centred in the lower fade zone, 14/20 `--ink-2` (4.5:1 passes), max 14 words, max 2 lines, optional text link in `--accent-text`; no button, no illustration, no icon |
| Page-level | If there are no campaigns, render the whole page in ghost form plus one line under the filter bar with the single primary action ("Start a campaign"); per-card captions never repeat it |

| Chart | Ghost shape | Caption (example) |
|---|---|---|
| StepFunnel | 6 steps, heights 100 / 70 / 48 / 30 / 18 / 9%, rounded risers, dividers | "Shortlist someone and the funnel fills in." |
| WeekColumns | 6 columns, heights 40 / 62 / 48 / 74 / 55 / 66%, plus baseline | "Weeks appear as people move to interview." |
| Spark (StatCell) | Value "—" in ink-3; flat 1px `--an-grid` line | "Nothing yet" |
| PeopleTable / CampaignTable | 4 skeleton rows: name block, short bars of varied width in `--an-plane` | "It's just you so far. Invite your team." |
| Heatmap | 7 x 24 cells at ramp steps 0 to 3 in a soft diagonal band | "Needs 30 emails to show when they land." |
| RankedBars / StageBars | 5 bars, widths 92 / 70 / 54 / 38 / 22%, fading right to left | "No calls yet. Place one and it shows here." |

Filtered to zero but data exists: caption "Nothing in the last 30 days." with a link "Show 90 days"; never a create action.

## 5. Pages

Legend: `[S]` stat strip, `[F]` funnel, `[W]` week columns, `[T]` table, `[B]` ranked bars, `[H]` heatmap, `[P]` stage bars, `[U]` bullet rows.

### 5.1 Overview (all roles; recruiter sees own work unless switched)

```
Overview                                   How hiring is going: hires, replies and where people drop out.
[7d|30d|90d|Custom] [All campaigns v] [All clients v] [Everyone v]        14 Sep-13 Oct · vs 15 Aug-13 Sep
+--Hires-------+--Moved to interview--+--Replies--------+--People found----+   [S] span 12
| 5            | 27                   | 41              | 591              |
| of 20 · ↑ 4  | ↑ 25                 | of 94 · ↑ 31    | ↑ 526            |
| ~spark~      | ~spark~              | ~spark~         | ~spark~          |
+--Where people drop-------------------------+ +--Worth a look------------+   [F] span 8 | list span 4
| 591    223    103    37     23      4        | | Two campaigns quiet 7+d  |
| ▇▇▇   ▆▆▆     ▄▄     ▂▂     ▁▁     ▁       | | 3 people waiting 9+ days |
| Found  Short.  Cont.  Repl.   Intv.  Hired   | | 6 emails not logged      |
|  -     38%     46%    36%     62%    17%     | |                          |
+--Each week (span 12)------------------------------------------------------+   [W] x2
| Moved to interview  ▮ ▮ ▮ ▮ ▮ (grey)   | Hired  ▮ ▮ ▮ ▮ ▮ (orange)        |
+----------------------------------------------------------------------------+
```

### 5.2 Recruiters (owner/admin) and My work (recruiter, Personal)

```
Recruiters                                                  filters incl. Recruiter; My work hides it
+--Emails sent------+--Calls placed-------+--Hires-----------+   [S] team totals, 3 cells
+--People------------------------------------------------ Download CSV -+   [T] span 12
| Name ▾      | Emails Replies Rate | Calls Conn. Talk | Short. Intv Hires | 8 weeks  |
| A. Rao      |  ...                |  ...             |  ...              | ~spark~  |
| (idle rows muted)  ·  Team total in tfoot  ·  Show workload (4 more columns)        |
+--A. Rao, by week (opens on row click)-------------------------------------------+   [W] x3
| Emails ▮▮▮▮▮ | Calls ▮▮▮▮▮ | Moved to interview ▮▮▮▮▮                           |
```
My work: strip of 6 (3 x 2): Emails, Replies, Calls, Talk time, Moved to interview, Hires, each with a muted "Team typical 14" only when 3+ others had activity; below, `[W]` Each week span 8 and "Waiting longest" list span 4 (5 oldest). Personal sees no comparison line.

### 5.3 Outreach

```
Emails
+--Sent-------+--Replies (rate)--+--Usual time to reply--+--Waiting for a reply--+  [S]
+--Which email gets answered---+ +--By campaign------------------------------+  [B] span 5 | [T] span 7
| First email        ▬▬▬▬ 8%   | | Campaign   Sent  Replies  Rate  Waiting    |
| First follow-up    ▬▬▬▬▬ 14% | |                                            |
| Later follow-ups   ▬▬ 6%     | |                                            |
+--When emails go out (needs 30+ sent)-------------------------------------+  [H] span 12
Calls
+--Placed-------+--Connected (rate)--+--Talk time--+--Average conversation--+  [S]
+--How calls went--------------+ +--By campaign (incl. "No campaign")-------+  [B] span 5 | [T] span 7
```

### 5.4 Pipeline

```
Pipeline
+--Where people are now---------------------+ +--Waiting longest-------------+  [P] span 7 | list span 5
| Shortlisted  ▬▬▬▬▬▬▬▬ 38   4 past 7 days  | | Name · campaign · stage · 12d|
| Outreach     ▬▬▬▬▬ 24     2 past 7 days  | | up to 8, link to the card    |
| Interviewing ▬▬ 9         1 past 14 days | |                              |
+--How long each step takes-----------------+ +--Where people come from-------+  [U] span 6 | [T] span 6
| Shortlisted -> contacted  ▬▬▬ | 4.0 days  | | Source   Added  Intv.  Hired  |
| Contacted -> replied      ▬▬▬▬▬ | 2.5 d   | | agent    ▬▬▬▬▬ 3 hires        |
| Time to hire 18 days (n 5) · Offer acceptance 3 of 4                          |
```
"Where it leaks" is dropped: the funnel on Overview is the one home for conversion (no duplicate data). "Why people were passed" is hidden, not ghosted, until the pick-list exists.

### 5.5 Campaigns

```
Campaigns                     [Campaigns | Clients]   [Active | Closed | All]
+--Active campaigns--+--Hired of planned--+--Median days to first hire--+   [S] 3 cells
+--All campaigns--------------------------------------------- Download CSV -+   [T] span 12
| Campaign / client | Owner | Hired of planned | Pipeline      | Open | First hire | Last activity |
| Sales hires       | Rao   | 3 of 5 ▬▬▬▬▬▬░░  | ▇▅▃▂▁▁ micro  | 41 d | 12 d       | Quiet for 9 days |
```
Clients toggle swaps rows to client roll-ups (campaigns, hired of planned, median days to first hire, replied of contacted). Under 560px each row becomes a card: name, hired bar, three figures.

Responsive (all pages): 768 strip 2 x 2, hero and side span 12, week panels stay 6 + 6. 390 one column in the same order (strip, hero, side, pairs, tables); funnel becomes the 6-row list; week panels stack; heatmap cells shrink to 24 columns with labels every 6 hours; sparklines stay; no horizontal page scroll at 320.

## 6. Motion and accessibility

| Topic | Spec |
|---|---|
| Motion | 150 to 250ms, ease-out, opacity and scaleY only. Columns and funnel rise from the baseline once on first mount (220ms, stagger 20ms capped at 120ms). Filter change: previous render to 55% (150ms) then crossfade 200ms. Tooltip fade 100ms. Remove count-up (the existing 900ms `Counter`) on Analytics. No hover transforms. |
| Reduced motion | `prefers-reduced-motion: reduce`: no rise, no pulse (skeleton static at 0.75), opacity changes at 0ms. |
| Contrast | Text 4.5:1 and marks 3:1 in both themes (table 3.3). The heat ramp's lightest steps and ghosts are below 3:1 by design, so relief is mandatory: tooltip plus table view, ghosts `aria-hidden`. |
| Not colour alone | Funnel: stage names and counts. Pipeline: "4 past 7 days" text. Hires: also in the label ("Hired"). Delta: sign and arrow. |
| Text alternatives | Each chart is a `figure` with a generated `figcaption` sentence ("591 found, 223 shortlisted ..., 4 hired; biggest drop found to shortlisted") and a "View as table" twin (same rows as CSV). Sparklines: `aria-hidden`, value is in the cell text. |
| Keyboard | Plot area `tabindex=0`; arrow keys step between bars, steps, cells; tooltip shows on focus exactly as on hover; Esc hides. Table scroller focusable; sort buttons are real buttons. |
| Announcements | One `aria-live=polite` line: "Showing 30 days, all campaigns." updates on filter change. |
| Targets | Controls at least 32px tall (existing 34); bar slots are full-height hit areas; scatter-style 24px minimum for any dot. |

## 7. What to avoid

- Full-width thin bars with labels at one edge and numbers at the other; any bar so long its tail is a void.
- Two saturated series (orange plus white) in one chart; the minority series becoming the loudest mark.
- A percentage printed under every row, or "vs the 30 days before" on every figure; any rate that disagrees with its own bar.
- Sparkline on some figures and not others; count-up animation; tabular figures on 28px numbers.
- Pie, donut, gauge, Sankey, 3D, dual axis; traffic-light fills on conversion; medals or rank numbers on people.
- Giant columns, 5 gridlines, dashed grids, a number on every bar, borders around marks.
- A centred empty paragraph in a void; the same empty sentence on every card; a "create" button on a filtered-out card.
- Cards inside cards, status pills or dots, shadows beyond the existing popover shadow, gradient fills other than the ghost fade.

## 8. References by pattern (open these)

| Pattern | Links |
|---|---|
| KPI card, delta, sparkline | [SaaS UI KPI patterns](https://www.saasui.design/blog/saas-metric-kpi-card-ux-patterns), [Stripe chart layout](https://docs.stripe.com/stripe-apps/patterns/chart-layout), [Linear dashboards](https://linear.app/now/dashboards-best-practices), [Tufte sparklines](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/), [Plausible tour](https://plausible.io/docs/guided-tour), [Refero dashboard best practices](https://refero.design/p/dashboard-ui-best-practices/), [Mobbin SaaS dashboards](https://mobbin.com/explore/web/screens/saas-dashboard) |
| Funnel | [PostHog funnels](https://posthog.com/docs/product-analytics/funnels), [Gem pipeline analytics](https://help.gem.com/external/the-pipeline-analytics-dashboard), [NN/g dashboards](https://www.nngroup.com/articles/dashboards-preattentive/), [Dribbble funnel-chart](https://dribbble.com/tags/funnel-chart), [Dribbble Funnel Analytics](https://dribbble.com/shots/20559308-Funnel-Analytics), [Mobbin charts](https://mobbin.com/explore/web/screens/charts), [Linear Insights](https://linear.app/insights) |
| Trend, small multiples, comparison | [Stripe chart layout](https://docs.stripe.com/stripe-apps/patterns/chart-layout), [Primer data viz](https://primer.style/product/ui-patterns/data-visualization/), [Carbon dashboards](https://carbondesignsystem.com/data-visualization/dashboards), [Datawrapper stacked columns](https://www.datawrapper.de/blog/stacked-column-charts), [Plausible tour](https://plausible.io/docs/guided-tour), [Tufte](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/), [Pageflows dashboards](https://pageflows.com/resources/dashboard-design/) |
| Ranked tables, data bars | [Datawrapper heatmaps and bars in tables](https://www.datawrapper.de/blog/heatmaps-for-tables/), [EU data viz guide: tables](https://data.europa.eu/apps/data-visualisation-guide/table-design-integrating-visualisations), [NN/g data tables](https://www.nngroup.com/articles/data-tables/), [NN/g mobile tables](https://www.nngroup.com/articles/mobile-tables/), [Loxo reports](https://help.loxo.co/en/articles/8958909-reports-to-measure-kpis), [Greenhouse reports](https://support.greenhouse.io/hc/en-us/articles/8837686136987-Which-report-should-I-use) |
| Heatmap | [Visa heatmap](https://design.visa.com/data-visualization/charts/heatmap), [Datawrapper heatmap](https://www.datawrapper.de/academy/how-to-create-a-heatmap), [Carbon colour](https://carbondesignsystem.com/data-visualization/color-palettes/), [Datawrapper heatmap tables](https://www.datawrapper.de/blog/heatmaps-for-tables/), [Dribbble dark-dashboard](https://dribbble.com/tags/dark-dashboard) |
| Stage ageing, bullet | [Few bullet spec](https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf), [Gem time in stage](https://help.gem.com/external/the-pipeline-analytics-dashboard), [Teamtailor reports](https://support.teamtailor.com/en/articles/3461401-overview-recruitment-reports), [Manatal reports](https://support.manatal.com/docs/hiring-performance-reports.md), [Metaview benchmarks](https://www.metaview.ai/resources/blog/recruiting-benchmarks), [Ashby job dashboard](https://www.ashbyhq.com/blog/product/new-feature-default-job-dashboard) |
| Source of hire (not donut) | [Datawrapper donut](https://www.datawrapper.de/academy/how-to-create-a-donut-chart), [Datawrapper stacked](https://www.datawrapper.de/blog/stacked-column-charts), [UNHCR part-to-whole](https://dataviz.unhcr.org/chart-types/part-to-a-whole/), [Zurich donut guidelines](https://zds.zurich.com/data/donut_chart), [Primer limits](https://primer.style/product/ui-patterns/data-visualization/), [Recruitee hires board](https://support.recruitee.com/en/articles/8688428-board-template-hires) |
| Ghost, empty, loading | [NN/g empty states](https://www.nngroup.com/articles/empty-state-interface-design/), [NN/g skeletons](https://www.nngroup.com/articles/skeleton-screens/), [Stripe empty state](https://docs.stripe.com/stripe-apps/patterns/empty-state), [Carbon empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/), [Dribbble empty-state](https://dribbble.com/tags/empty-state), [Dribbble Chart Empty State](https://dribbble.com/shots/1934185-Chart-Empty-State), [Mobbin empty state](https://mobbin.com/glossary/empty-state) |
| Dark and light colour | [Carbon colour](https://carbondesignsystem.com/data-visualization/color-palettes/), [Stripe accessible colour](https://stripe.com/blog/accessible-color-systems), [Playfair dark/light](https://playfairdata.com/how-to-create-light-mode-and-dark-mode-dashboards-in-tableau/), [Chameleon paper](https://arxiv.org/html/2512.00516v2), [Sumo Logic dark theme](https://www.sumologic.com/blog/dark-theme), [Behance dark dashboards](https://www.behance.net/search/projects/dark%20mode%20dashboard) |
| Filter toolbar | [SaaS UI filtering](https://www.saasui.design/blog/saas-filtering-sorting-ux-patterns), [Metabase sticky filters thread](https://discourse.metabase.com/t/dashboard-filters-should-be-pinned-on-top-sticky-on-top/7719), [Plausible tour](https://plausible.io/docs/guided-tour), [Smart Interface Design Patterns](https://smart-interface-design-patterns.com/articles/filtering-ux/), [Gem filters](https://help.gem.com/external/the-pipeline-analytics-dashboard) |
| Accessibility | [Chartability](https://chartability.fizz.studio/), [Primer data viz](https://primer.style/product/ui-patterns/data-visualization/), [NN/g dashboards](https://www.nngroup.com/articles/dashboards-preattentive/), [MDN font-variant-numeric](https://developer.mozilla.org/docs/Web/CSS/font-variant-numeric), [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) |
| Galleries | [Dribbble recruitment-dashboard](https://dribbble.com/tags/recruitment-dashboard), [Dribbble Hirestream](https://dribbble.com/shots/23788486-Hirestream-Hiring-and-Recruitment-Dashboard), [Dribbble Talent hiring](https://dribbble.com/shots/23402970-Talent-Hiring-Dashboard), [Dribbble analytics-ui](https://dribbble.com/tags/analytics-ui), [Refero dashboard examples](https://styles.refero.design/examples/dashboard-ui-design), [Awwwards dashboards](https://www.awwwards.com/websites/dashboard/) |

## 9. Decisions for the owner to confirm (all built as written unless changed)

1. Orange is reserved for hires; every other chart mark is a warm grey. Fewer oranges, one clear outcome colour.
2. The People table has no data bars and is sorted by name (your own "no rank, no medals" rule); the sparkline column shows each person's shape instead.
3. Deltas are neutral ink with sign and arrow, no green/red.
4. Pipeline drops "Where it leaks" (the Overview funnel is the single home for conversion rates).
5. The funnel rates on the live page disagree with the bar counts (see section 0); confirm which definition `counts.rates` should print before the demo.
