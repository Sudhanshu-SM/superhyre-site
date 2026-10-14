# Analytics: research brief and build spec (13 Oct 2026)

Owner ask: standardise Analytics; show "what and how recruiters are doing"; no usage/quota page, no agent-activity log; 4-5 modular sections, proper empty states. No product code in this doc.

## 0. Summary

- Every serious product ends up with the same five questions: how are we doing (outcomes + funnel), how is each person doing, is outreach working, where do people wait, how is each campaign/client going. We ship exactly those five sections.
- Zoho Recruit: 40+ standard reports, five dashboards, KPI widgets (time, pipeline, diversity); reviewers call it basic and hard to customise. Juicebox: four dashboards (Usage, Projects, Outreach, Agents), admin/enterprise only. We drop Usage and Agents (owner decision) and keep the useful two.
- Almost everything recruiters actually use is computable today from `stage_moves`, `outreach_messages`, `calls`, `tasks`, `campaigns`, `form_responses`. See section 2.
- Five real gaps: replies are logged by hand (mail is send-only), no "interested?" on a reply, pass reasons are free text, no interview-scheduling record, no fee/revenue. Opens/clicks are not tracked and should stay out (vanity).
- Reddit was not reachable from the research tooling (search blocked, fetch refused, archive API rate-limited). Community voice below comes from LinkedIn, SourceCon/ERE and review sites (via search summaries, so directional). Worth 15 minutes of manual r/recruiting reading before launch.

## 1. Research

### 1.1 What leaders ship

| Product | Sections and exact metrics | Visuals, filters | Admin vs recruiter | Source |
|---|---|---|---|---|
| Zoho Recruit (priority) | Analytics = Reports (40+ standard, by module: Candidates by Source/Status/Ownership, Interview vs User, Candidate Source vs Interview, Open/Closed job openings, Today's calls), Dashboards (Activity, User overview, Job openings, Clients overview, Candidates overview), Recruiting KPIs: time-to-fill, time-to-hire, age of job, time to submit, pipeline conversion by origin and by source, time in stage, application frequency | Bar, pie, line, table, donut, area, funnel; KPI widget with green up / red down arrow vs average, click opens detail report; only Summary reports can be pinned, manual refresh, no styling; no filters documented | Access by permission ("Manage Reports & Dashboards"); User overview dashboard for team trends | [overview](https://help.zoho.com/portal/en/kb/recruit/analytics/overview/articles/overview-29-3-2021), [KPIs](https://help.zoho.com/portal/en/kb/recruit/analytics/recruiting-kpis/articles/recruiting-kpis), [reports](https://help.zoho.com/portal/kb/articles/reports), [dashboards](https://help.zoho.com/portal/en/kb/recruit/analytics/dashboards/overview/articles/working-with-dashboards), [marketing](https://www.zoho.com/recruit/powerful-insights-and-analytics.html) |
| Juicebox / PeopleGPT (priority) | Four categories. Usage: searches, profiles viewed/shortlisted/exported, credits. Projects: total projects, shortlisted, contacted, average time to contact, replies, interests. Outreach: runs, open, click, reply, interest, bounce rate. Agents: leads approved/disapproved, approval rate, interested replies, pending leads | Filters: user, project, sequence, started by, inbox, date range, days/weeks/months; export from each metric | Enterprise and admin-enabled users; what a normal user sees is not stated | [help](https://peoplegpt.super.site/analytics), [launch post](https://juicebox.ai/blog/reporting-analytics-dashboard) |
| Greenhouse | ~40 reports grouped by question: Pipeline and job status, Hiring-team activity, Applications and sourcing, Offers and outcomes, Prospecting (leaderboard: lookups, contacts, messages, replies, meetings), Goal attainment (personal goals) | Tables organised by job/recruiter/source/department; shared filters job, department, office, user; goal vs actual | Most reports need Job Admin; recruiter can be a row dimension | [which report](https://support.greenhouse.io/hc/en-us/articles/8837686136987-Which-report-should-I-use) |
| Gem | Pipeline Funnel + Activity views; passthrough rate, time in stage; Outreach stats: open, reply, interested rate by message/pool; per-recruiter activity | Funnel or Sankey; bar over time; table colours passthrough red/yellow/green; filter by recruiter, sourcer, source, job | Leaders compare recruiters; recruiters see sequence and content performance | [dashboard](https://help.gem.com/external/the-pipeline-analytics-dashboard), [metrics](https://vercel.gem.com/blog/tracking-recruiting-metrics) |
| Loxo | Activities by Owner, Calls Made (summary + duration), team workload, job reports: average time to fill, stage conversion funnel, stages by owner; revenue (deals, placements); goals | Bar/line/pie/number; leaderboard capped at top 10, can be put on a screen; filter by date and owner | Only admins create/edit reports; groups share access | [KPIs](https://help.loxo.co/en/articles/8958909-reports-to-measure-kpis), [dashboard](https://help.loxo.co/en/articles/8386308-loxo-s-reports-dashboard) |
| Bullhorn (agency) | Recruiter Activity (calls, emails, interviews, submissions), pending interviews, placements, time to first submission (internal and client), fill rate, candidate-to-placement ratio, net fee income | Customisable; slice by client, industry, team; trend over time | Three views: recruiter sees own live progress, manager compares team and coaches, leader sees business health | [reporting](https://www.bullhorn.com/uk/products/reporting-analytics/), [time to submit](https://www.bullhorn.com/glossary/time-to-submit-first-candidate/) |
| Ashby | Default job dashboards: Summary, Interviews & Feedback, Source Details; interviewer calibration | Dashboard-level filters, goal lines, forecasting | Access controls per dashboard | [release](https://www.ashbyhq.com/blog/product/new-feature-default-job-dashboard) |
| Teamtailor | Pipeline overview (daily snapshot), speed (days per stage), conversion (cohort by applied date), hires (time to hire, time to fill, source, department), reject reasons, meetings | Funnel by stage type, pies for source and reasons, cohort date range | Not stated | [reports](https://support.teamtailor.com/en/articles/3461401-overview-recruitment-reports) |
| Manatal | Funnel, performance by owner and job, ratios (added to submitted to interview to offer to hire), channel and referrer performance, average time to hire, drops by reason | Timeframe sets granularity (days/weeks/months/years) | Admins and authorised users | [reports](https://support.manatal.com/docs/hiring-performance-reports.md) |
| HubSpot Sequences | Enrollments, reply rate, meeting rate, no response, performance over time, step performance, meetings by step and by number of touches, template performance | Rates/Counts toggle; filter by enrolled-by (defaults to "Me") | Per-user default of "Me" | [sequence reports](https://knowledge.hubspot.com/sequences/report-on-your-sequences) |
| Outreach / Salesloft | Prospects contacted, responded, meetings; calls, connect rate, talk time. Manager view compares and coaches; rep view tracks self against goals (Salesloft detail is from a third-party blog) | Side-by-side team comparison | Manager broad, rep personal | [Outreach](https://support.outreach.io/support/solutions/articles/159000425538-draft-sales-manager-workflows-for-outreach-reporting), [Octave](https://www.octavehq.com/post/salesloft-analytics-measuring-sales-engagement) |
| Others | JobAdder performance dashboard (new jobs, CV submissions, placements, fees, targets), Lever (time to fill, source effectiveness, pipeline conversion), hireEZ (hires per project, response rates, outreach activity), Workable (assigned-job-only access for standard members), Recruitee (time to hire per recruiter, hires per source) | | | [JobAdder](https://jobadder.com/platform-feature/jobadder-analytics/), [hireEZ](https://hireez.com/recruitment-analytics/), [Workable](https://help.workable.com/hc/en-us/articles/8808063238935), [Recruitee](https://support.recruitee.com/en/articles/8688428-board-template-hires) |

### 1.2 What users complain about (directional)

- Reporting is basic and hard to customise: Zoho Recruit via Gartner, G2, Capterra review summaries ([Gartner](https://www.gartner.com/reviews/product/zoho-recruit), [Capterra](https://capterra.com/p/125768/Zoho-Recruit/reviews/?page=2)); Greenhouse: many reports, no from-scratch custom report ([Capterra](https://capterra.com/p/133100/Greenhouse/reviews/?page=3)). A PeerSpot snippet said pivot charts are too technical; the page I fetched showed only a positive reviewer, so treat that as unverified.
- Numbers lose trust when stage definitions differ per person or are changed by hand; then people stop updating ([consultancy write-up](https://consultevo.com/what-recruiting-teams-should-fix-first-when-reporting-loses-trust/), low authority).
- Definitions drift: time to fill starts at job creation (Zoho guide) or requisition approval ([Paraform](https://www.paraform.com/blog/top-10-recruitment-metrics-for-success)); Greenhouse prefers days-to-offer ([Greenhouse blog](https://www.greenhouse.com/blog/the-5-kpis-we-use-to-measure-recruiting-success-at-greenhouse-kpi-3)). Fix: say the definition on the page.
- Recruiters resist metrics mainly because nobody explains why; accept them as a personal roadmap, reject them as a stick ([Ruffini](https://www.linkedin.com/pulse/recruiting-metrics-do-we-really-need-them-john-ruffini)). Activity counts measure effort; pair with outcomes.
- Volume leaderboards invite gaming and demoralise people far from the top (general sales-team guidance: [Salesscreen](https://salesscreen.com/blog/how-to-build-a-sales-leaderboard-that-motivates-your-whole-team), not recruiter-specific research). Loxo caps its leaderboard at 10 and says it is not a picture of the whole team.
- Short list wins: [Loxo](https://www.loxo.co/blog/the-4-most-important-recruiting-metrics-for-staffing-agencies) argues four metrics (time to fill, submittal-to-placement, offer acceptance, candidate satisfaction) cover most others.

### 1.3 Metric importance (our ranking for recruiters and leads)

| Tier | Metrics | Why |
|---|---|---|
| 1, show by default | Hires vs target; people by stage now and who has waited too long; replies and reply rate; stage-to-stage conversion (shortlist to contacted to replied to interview to hire; agency "submittal to interview"); time to first hire / time to fill; per-recruiter emails, calls, interviews, hires | Drives the daily/weekly decision. Agency desk guides: ratios between stages, not raw volume ([TopEchelon](https://topechelon.com/recruiter-training/recruiting-kpis-every-recruiting-agency-should-track/), [RecruitBPM](https://recruitbpm.com/?p=11143)) |
| 2, one click deeper | Source of hire and quality by source; offer acceptance; follow-up lift (first vs later email); time to first contact; call connect rate and talk time; tasks done on time; form views to applications to added | Explains the tier-1 numbers |
| 3, only with data | Pass/drop reasons; interested rate; client approval; cost per hire; revenue/fees; quality of hire (retention at 90 days); candidate satisfaction | Valuable, but we cannot compute them honestly today |
| Vanity / skip | Email opens and clicks (listed as vanity in [this LinkedIn piece](https://www.linkedin.com/pulse/vanity-vs-sanity-kpis-really-matter-recruitment-marketing-lisa-jones)); profile views, searches, exports, credits; database size; applications without stage conversion; calls placed without outcome; rankings on raw volume; percentages on tiny n | Feels busy, changes no decision |

### 1.4 Definitions we adopt (shown on the page, one line each)

| Metric | Formula | Notes |
|---|---|---|
| Hire | Person currently at Hired whose latest move into Hired is in the period | A hire moved back is not a hire (same rule as `counts.ts`) |
| Moved to interview | People entering Interviewing in the period (distinct) | No scheduling record exists, so we never say "interviews held" |
| Reply rate (emails) | Replies logged / emails sent in period | Message level; SourceCon formula ([ERE](https://www.ere.net/4-key-metrics-most-sourcers-dont-track-but-should/)). People-level reply rate lives in the funnel (replied / contacted) |
| Time to reply | Median hours from send to the moment the reply was logged | Honest label: time until noted |
| Time to hire | Median days from added to campaign to Hired, for hires in period | Zoho: associated with job to Hired |
| Time to fill | Days from campaign opened to the day hires reached target; "first hire" shown beside it | Zoho: job creation to Filled; Greenhouse: open to accepted |
| Stage ageing | Days since `stage_entered_at`, current stage only | Defaults: waiting more than 7 days in Shortlisted or Outreach, 14 in Interviewing (vendor benchmark: under 7 healthy, 14+ friction, [Metaview](https://www.metaview.ai/resources/blog/recruiting-benchmarks)) |
| Stage velocity | Median days between entering and leaving a stage (completed stays) | From `stage_moves` consecutive rows |
| Offer acceptance | Hired / (Hired + passed after reaching Offer) | n at least 5 |
| Connect rate | Connected calls / calls placed | `resultOf()` in `calls/scope.ts` |
| Source of hire | `campaign_candidates.source` of people hired | agent, extension, manual, form, referral, import |

Benchmarks are vendor claims (reply about 10-15%, SourceCon; interview-to-offer 3-4; offer acceptance 85-95% in-house; submittal-to-interview 3:1 to 5:1 for agencies). Do not hard-code them. Compare each person and campaign with their own previous period and, for recruiters, a team-typical value.

## 2. What we can measure today

Legend: Now = existing function/query; Small = new SQL over existing tables; New = needs data capture (flag, do not fake).

| Metric | Status | Fed by |
|---|---|---|
| Funnel counts and neighbour rates | Now | `campaignCounts()` in `pipeline/counts.ts` (only definition; do not fork) |
| Funnel for a period cohort | Small | add optional window on `cc.created_at`/`first_seen_at` inside `counts.ts` |
| Hires, moved to interview, replies, offers, found (period vs previous) | Now | `overview/service.ts home()` over `stage_moves`, `campaign_seen` |
| Emails sent, replies, reply rate, by campaign, by touch, by hour, median time to reply, stalls | Now | `analytics.outreach()` |
| Emails per recruiter | Small | `outreach_messages.sent_by` (= approver; always a person), `status='replied_logged'` |
| Calls placed, connected, talk time, outcomes, per caller, per campaign | Small | `calls` (`user_id`, `duration_seconds`, `outcome`, `status`, `campaign_id`); personal: `public.individual_calls`; `callsTable/callsVisible/resultOf` |
| Shortlisted/interviews/hires by person | Small | `stage_moves.actor_kind='user'`, `actor_id`, `at`; adds are `from_stage is null` |
| Workload per recruiter (in progress, waiting too long, campaigns) | Small | `campaign_candidates.owner_id`, `stage`, `stage_entered_at`; `campaigns.owner_id`, `campaign_members` |
| Tasks assigned/done/overdue/on time | Small | `tasks.assignee_id`, `status`, `due_at`, `resolved_at`, `resolved_by` |
| Campaign scoreboard, days open, days to first hire, quiet | Now | `analytics.projects()` |
| Days to fill (target reached) | Small | nth `to_stage='hired'` move vs `campaigns.target`, `opened_at` |
| Stage velocity, time to hire, time to first contact | Small | `lag()` over `stage_moves`; first `outreach_messages.sent_at` per `campaign_candidate_id` |
| Source of hire / of interview | Small | `campaign_candidates.source`, `campaign_seen.source` |
| Form views, applications, added/passed, time to decide, by `src` | Small | forms summary query (`core.public_form_views`, `form_responses.decision/decided_at/src/utm`) |
| Offers made / accepted / not taken | Small | `stage_moves.step='offer'` then Hired vs Passed |
| Interested rate | New | add `interest` (interested / not now / not interested) to the reply-logging step (`LogOutcome`) |
| Real reply times and no manual logging | New | mail connection is send-only ("Replies are logged by the recruiter"); read access would automate it |
| Why people were passed, charted | New | `stage_moves.reason` is free text; add a short pick-list plus note |
| Interviews held/scheduled | New | no scheduling record; only stage entry |
| Revenue, fee per placement, cost per hire | New | `clients.fee` is unstructured jsonb; no placement fee field |
| Quality of hire, retention | New | nothing after Hired; a 90-day check-in task would create it |
| Email opens/clicks | Not tracked | keep out |

Caveats to show as one calm footnote where relevant: reply numbers are only as complete as logging; history shrinks when a person is removed from a campaign (`stage_moves` cascades) or erased; times use the viewer's time zone (`timeZoneOf`), not the IST constant used in `calls` filters.

## 3. Information architecture

- Sidebar group "Analytics", five labels, all one route each, landing = Overview:

| Label | Route | Question it answers |
|---|---|---|
| Overview | `#/analytics` | How is hiring going? |
| Recruiters (recruiter and Personal see "My work") | `#/analytics/recruiters` | What is each person doing, and what came of it? |
| Outreach | `#/analytics/outreach` | Are emails and calls getting answers? |
| Pipeline | `#/analytics/pipeline` | Where do people wait, drop and come from? |
| Campaigns | `#/analytics/campaigns` | How is each campaign and client going? |

- Redirects: `/analytics/projects` to Campaigns; `/analytics/usage` and `/analytics/agent` already go to Outreach, send them to Overview.
- Global filters (one sticky bar, kept in the URL so links share): Period 7 / 30 / 90 days / Custom (max 365, default 30); Campaign (only campaigns the viewer can see); Client (only clients of those); Recruiter (owner/admin only, hidden for recruiters and Personal). Compared against the equal period before it.
- Export: "Download CSV" on each table, built in the browser from rows already loaded (no server call, no migration; aggregates hold no candidate details). Server-side `exports` logging is only needed if candidate rows are ever exported.
- Whose numbers, by role:

| | Owner / admin | Recruiter | Personal |
|---|---|---|---|
| Scope | All campaigns, all members | Campaigns they can see (`canSeeCampaign`), people they may see (`candidateVisible`) | Own rows only (`owned()` on every query) |
| Default view | Team-wide, per-recruiter breakdown, Recruiter filter available | Own actions; switch to "Everyone on my campaigns" for campaign totals (no names) | Own, no comparison |
| Peers | Named, in Recruiters only, unranked | Never named; nameless team-typical when 3+ others have activity | None |
| Calls | Everyone's | Own only (existing `callsVisible`) | Own (`individual_calls`) |
| Client filter and Clients toggle | Yes | Only clients of visible campaigns, read-only | Hidden if no clients |
- Design rules (owner's standing feedback): plain muted text for state ("Closed", "Quiet for 9 days"), no status pills or dots, no red/green alarms, no medals or rank order, one number per idea (do not repeat a figure in two blocks), larger type scale, human copy, no vendor names. Reuse `Area`, `Spark`, `Delta`, `Funnel` from `viz.tsx` and `an-*` classes in `analytics.css`.

## 4. Modules

Common to all: request carries `days` or `from`+`to` (YYYY-MM-DD, viewer's time zone), `campaignId`, `clientId`, `userId`. A recruiter's `userId` other than their own returns 403 with a calm message. Every ratio is `{ n, of, rate, small }`; `rate` is null and `small` true when `of < 5`; UI then shows "2 of 4". Medians with fewer than 3 values read "Not enough yet". Loading: keep the last data dimmed while refetching, first load uses the existing block loader. Error: existing "Couldn't load {thing}. Try again." with retry, per module, never blocks the filter bar. Previous period = same length immediately before.

### 4.1 Overview

- Purpose: one calm read of outcomes and where people drop.
- Who: admin/owner team-wide; recruiter own work (switchable); Personal own.
- Blocks and metrics:

| Block | Content | Chart |
|---|---|---|
| Four figures | Hires (of N planned in active campaigns), Moved to interview, Replies (from N contacted), People found; each with "12 more than the 30 days before" | Big number + `Spark`; same four as Home's "Your week" so the two never disagree |
| Funnel | Found, On shortlist, Contacted, Replied, Interviewing, Hired with the rate between neighbours (`counts.rates`); cohort = people added in the period, followed to today | Stepped list with proportional bars, no pie/donut |
| Trend | Moved to interview and Hired per week (per day if 14 days or fewer) | Grouped columns, zero weeks drawn |
| Worth a look | Up to 3 sentences: campaigns quiet 7+ days, people waiting past threshold, sent emails with nothing logged 4+ days, overdue tasks; each links to the place | Plain list |

- Filters: global. Empty (no campaigns): "Nothing to measure yet. Start a campaign and this page fills in as people move through it." with Start a campaign. Empty (no activity in period): "A quiet stretch. Nothing moved in the last 30 days. Try a longer range or open a campaign to pick things up."
- API: `GET /v1/analytics/overview` returns `{ days, timeZone, tiles: { hires: { n, prev, planned }, interviews: { n, prev }, replies: { n, prev, contacted }, found: { n, prev, series: [{ day, n }] } }, funnel: { cohort: { from, to }, steps: [{ id, n }], rates: [{ id, n, of, rate, small }] }, trend: [{ weekStart, interviews, hires }], lookAt: [{ kind, count, campaignId?, href }] }`.
- Feeds: `home()` moves query (change `count(*)` of replies to `count(distinct campaign_candidate_id)` in both places via one shared helper), `campaignCounts()` windowed, `projects()` quiet logic, `outreach().stalls`, `tasks`.
- Edge: closed campaigns count for history and are excluded from "planned"; hires beyond target show as 100% not more; funnel for a recruiter uses `canSeeCampaign` and `candidateVisible` only.

### 4.2 Recruiters (My work)

- Purpose: what each person did and what came of it, so a lead can coach and a recruiter can see their own week. The owner's main ask.
- Who: owner/admin see every active member (zero-activity rows muted, never hidden); recruiter sees own figures plus "Team typical" (median of others, no names) only when at least 3 other people had activity; Personal sees own with no comparison.
- Metrics (period, per person):

| Group | Columns | Definition |
|---|---|---|
| Reach | Emails sent, Replies, Reply rate; Calls placed, Connected, Talk time | `sent_by`; replies on their sent emails; `calls.user_id`, connected via `resultOf`, sum of `duration_seconds` for connected |
| Movement | Added to shortlists, Moved to interview, Hires | `stage_moves` by that person (agent moves are not counted to anyone) |
| Follow-through | Tasks done on time of tasks due in period, Overdue now | `resolved_at <= due_at` and `resolved_by='user'` |
| Load now | People in progress, Waiting past threshold, Campaigns | `owner_id` on active campaigns |

- Visuals: admin sees one table sorted by name (columns sortable, no rank numbers, no bars that imply a ladder); clicking a row opens that person's weekly columns (emails, calls, interviews) against their previous period. Recruiter sees six tiles (Emails, Replies, Calls, Talk time, Moved to interview, Hires), each with change vs previous period and a quiet "team typical 14" line, then "Waiting longest" (their 5 oldest people, links to the card).
- Empty: admin alone: "It's just you so far. Invite your team and their work shows up side by side." Person without activity: "No activity in these 30 days." Recruiter: "Nothing logged yet this period. Send an email, place a call or move someone forward and your week shows up here."
- API: `GET /v1/analytics/people` returns `{ days, people: [{ userId, name, emails: { sent, replied, rate }, calls: { placed, connected, talkSeconds, rate }, shortlisted, interviews, hires, tasks: { due, onTime, overdue }, load: { inProgress, waiting, campaigns } }], typical: { ...same keys } | null, me: { ... } }` (admin gets `people`, recruiter gets `me` + `typical`); `GET /v1/analytics/people/:userId/weekly` returns `[{ weekStart, emails, calls, interviews }]`.
- Feeds: `outreach_messages`, `calls` (via `callsTable`), `stage_moves`, `tasks`, `campaign_candidates`, tenant `users`, `userName()`.
- Edge: attribute to the actor, not the campaign owner; removed members appear as "Former member" so totals reconcile; Personal has no Recruiters page, only My work; calls for recruiters are already limited to their own (`callsVisible`); totals here can be below Overview by the moves automation made, said once in a footnote ("Counts what people did themselves"); never show team typical when fewer than 3 others (it would identify them).

### 4.3 Outreach (emails and calls)

- Purpose: is outreach getting answers, and which follow-up or campaign earns them.
- Who: owner/admin all visible campaigns, recruiter own by default (switch to everyone's emails; calls stay own, per `callsVisible`).
- Emails: figures Sent, Replies (rate), Usual time to a reply, Waiting for a reply; table By campaign (sent, replies, rate, waiting); bars First email vs First follow-up vs Later follow-ups; By hour of day only when 30+ sent. Calls: figures Placed, Connected (rate), Talk time (average per conversation); outcome bars (connected, voicemail, no answer, call back, not interested); By campaign table, "No campaign" row for unlinked calls.
- One calm line above emails when something is waiting: "Replies show up once someone notes them on the person. 6 emails are waiting."
- Not shown: opens, clicks.
- Empty emails: "No emails sent in the last 30 days. Draft outreach from a campaign's shortlist, approve it, and replies and timing show up here." Empty calls: "No calls yet. Calls you place from SuperHyre show up here with how they went." No replies yet: "No replies yet. When someone writes back and you note it, it shows up here."
- API: keep `GET /v1/analytics/outreach` (additive `userId`, `clientId`, `from`, `to`); add `GET /v1/analytics/calls` returning `{ days, totals: { placed, connected, rate, talkSeconds, avgSeconds }, outcomes: [{ outcome, n }], byCampaign: [{ campaignId|null, name, placed, connected, talkSeconds }], daily: [{ day, placed, connected }] }`. Two requests so a calls failure never hides emails.
- Feeds: `analytics.outreach()`, `calls` columns above, `suppressions` rule already used for drafts.
- Edge: time to reply is time to logged; first email = `row_number()` 1 per thread; failed-to-send is not "bounced"; in Personal use `individual_calls`; calls with null campaign still count.

### 4.4 Pipeline

- Purpose: where people wait, how fast they move, where they come from.
- Who: owner/admin all visible; recruiter what `candidateVisible` allows; Personal own.

| Block | Content | Chart |
|---|---|---|
| Where people are now | Counts per stage (Shortlisted; Outreach waiting/replied; Interviewing loop/offer) and how many are past threshold | One horizontal stacked bar per stage |
| Waiting longest | Up to 8 people: name, campaign, stage, days, who looks after them | List with link to card |
| How long each step takes | Median days per stage this period vs previous; Time to hire (median, n); Time from shortlist to first email | Horizontal bars + text |
| Where it leaks | Neighbour conversion from `counts.rates` (kept, reached out, replied, interviewing, hired) and Offer acceptance | Rates with "n of N"; lowest step named in words, no red |
| Where people come from | By source: added, moved to interview, hired; form row: views, applications, added | Table |
| Why people were passed | Top reasons with counts | Hidden until the pick-list exists (New data) |

- Empty: "No one is in a pipeline yet. Shortlist someone from a campaign and you'll see how long people wait at each step." No hires: "No hires in this period, so time to hire has nothing to measure yet."
- API: `GET /v1/analytics/pipeline` returns `{ stages: [{ stage, step?, n, waiting }], waitingLongest: [{ campaignCandidateId, candidateId, name, campaign, stage, days, ownerName }], velocity: [{ stage, medianDays, n, prevMedianDays }], timeToHire: { medianDays, n }, timeToFirstContact: { medianDays, n }, conversion: [{ id, n, of, rate, small }], offers: { made, accepted, notTaken }, sources: [{ source, added, interviewed, hired }], forms: { views, applications, added, passed }, passed: [{ reason, n }] | null }`.
- Feeds: `campaign_candidates.stage_entered_at`, `stage_moves` with `lag()`, `campaignCounts()`, forms summary, `candidateVisible()`.
- Edge: a person moved back to an earlier stage re-enters it (use latest entry for ageing); Passed excluded from "waiting"; thresholds are constants, not settings, on day one; agent-found people with no owner show "Not assigned".

### 4.5 Campaigns

- Purpose: every campaign and client side by side, so the slow or quiet one is obvious.
- Who: owner/admin all; recruiter only visible campaigns (`canSeeCampaign`); Personal own.
- Content: toggle Campaigns | Clients (default Campaigns), filter Active | Closed | All (default Active, plus closed campaigns with activity in the period). Row: name, client, owner, "3 of 5 hired" with a thin progress bar, step counts (found, shortlisted, contacted, replied, interviewing, hired), days open, days to first hire, days to fill, last activity, "Quiet for 9 days" in muted text. Client row: campaigns (active/closed), hired of planned, median days to first hire, people replied of contacted. No revenue until fee capture.
- Empty: "No campaigns yet. Start one from Campaigns and its progress shows up here." Client toggle with no clients: "No clients yet. Add one and the campaigns you run for them roll up here."
- API: `GET /v1/analytics/campaigns` (the existing `/projects` payload plus `ownerName`, `daysToFill`, `clients: [{ clientId, name, campaigns, active, hired, planned, medianDaysToFirstHire, replied: { n, of, rate, small } }]`); keep `/projects` as an alias until the console is switched.
- Feeds: `analytics.projects()`, `campaignCounts()`, `clients`, `campaign_members`.
- Edge: opened_at null falls back to created_at (existing); closed campaigns measure to `closed_at`; never filled shows "Not filled yet"; target met by more hires than planned caps the bar at full.

## 5. Quality bar and tests

- One definition per number: every funnel figure comes from `counts.ts`; Overview tiles and Home share one helper; add a test that Overview tiles equal Home for the same period.
- Visibility tests per module: recruiter cannot see another's campaign, candidate or calls; Personal never reads org rows; `userId` forbidden for recruiters; team typical absent below 3 others.
- Small-n tests: 4 emails sent gives "1 of 4", never 25%.
- Time zone test: week boundaries at midnight Monday in the viewer's zone.
- Performance later: add `outreach_messages (sent_by, sent_at)` and `calls (user_id, started_at)` indexes if any module takes over 1 second on a 10k-person workspace.
- Remove dormant Usage code (`analytics.usage()`, route, `UsageAnalyticsPage`, fixtures) after the new pages ship; leave `core.usage_counters` alone, it enforces limits.

## 6. Build order and day-one minimum

1. Plumbing (about half a day): filter parser (`days|from,to`, `campaignId`, `clientId`, `userId` guard), `{ n, of, rate, small }` helper, nav and redirects, sticky filter bar, CSV helper.
2. Recruiters (about 1 day): the owner's explicit ask and fully computable now.
3. Overview (about 1 day): tiles from `home()`, funnel from `campaignCounts()` (period cohort window), Worth a look.
4. Outreach plus calls (about half a day): add `userId` filter and the calls endpoint.
5. Campaigns (about half a day): extend `projects()` with owner, days to fill, client roll-up.
6. Pipeline (about 1 day): stages now and waiting longest first, then velocity, sources, offers.
7. After demo: interest on replies, pass-reason pick-list, interview scheduling, placement fee, 90-day check-in, client-shareable report, optional weekly digest.

Demo-worthy day one: nav with the five labels; Recruiters (table plus the recruiter's own tiles); Overview (four figures, funnel, Worth a look); Outreach (existing page plus calls figures); Campaigns (existing list with owner and Clients toggle); Pipeline limited to "Where people are now" and "Waiting longest" (two cheap queries). Seed the demo workspace with at least 4 members who have emails, calls and stage moves, or the "team typical" and per-person table will look empty.

## 7. Decisions for the owner

1. Default landing: Overview for everyone (proposed) or the people view (Bullhorn lands recruiters on their own page).
2. Show recruiters a nameless team-typical value (proposed, only with 3+ others) or nothing.
3. Accept "Moved to interview" as the interview number until scheduling exists.
4. Reply logging is manual: add "interested?" to the log step now (cheap, unlocks interested rate), and decide whether to pursue read access to mail to remove the logging burden.
5. Pass-reason pick-list and placement fee field: yes/no and when.
6. Thresholds 7 / 7 / 14 days for "waiting" are our defaults, not researched constants.
7. Delete the dormant Usage code or keep it out of sight.

## Sources

Zoho Recruit: [analytics overview](https://help.zoho.com/portal/en/kb/recruit/analytics/overview/articles/overview-29-3-2021), [KPIs](https://help.zoho.com/portal/en/kb/recruit/analytics/recruiting-kpis/articles/recruiting-kpis), [standard reports](https://help.zoho.com/portal/kb/articles/reports), [dashboards](https://help.zoho.com/portal/en/kb/recruit/analytics/dashboards/overview/articles/working-with-dashboards), [analytics marketing](https://zoho.com/recruit/recruitment-analytics-old.html). Juicebox: [help](https://peoplegpt.super.site/analytics), [launch post](https://juicebox.ai/blog/reporting-analytics-dashboard). ATS and CRM: [Greenhouse](https://support.greenhouse.io/hc/en-us/articles/8837686136987-Which-report-should-I-use), [Gem](https://help.gem.com/external/the-pipeline-analytics-dashboard), [Loxo](https://help.loxo.co/en/articles/8958909-reports-to-measure-kpis), [Bullhorn](https://www.bullhorn.com/uk/products/reporting-analytics/), [Ashby](https://www.ashbyhq.com/blog/product/new-feature-default-job-dashboard), [Lever](https://www.lever.co/visual-insights), [Teamtailor](https://support.teamtailor.com/en/articles/3461401-overview-recruitment-reports), [Manatal](https://support.manatal.com/docs/hiring-performance-reports.md), [HubSpot](https://knowledge.hubspot.com/sequences/report-on-your-sequences), [Outreach](https://support.outreach.io/support/solutions/articles/159000425538-draft-sales-manager-workflows-for-outreach-reporting). Practitioner: [LinkedIn, Ruffini](https://www.linkedin.com/pulse/recruiting-metrics-do-we-really-need-them-john-ruffini), [LinkedIn, vanity vs sanity](https://www.linkedin.com/pulse/vanity-vs-sanity-kpis-really-matter-recruitment-marketing-lisa-jones), [LinkedIn Talent, 7 metrics](https://www.linkedin.com/business/talent/blog/talent-analytics/metrics-that-most-data-savvy-recruiting-teams-are-tracking), [SourceCon/ERE](https://www.ere.net/4-key-metrics-most-sourcers-dont-track-but-should/), [Metaview benchmarks](https://www.metaview.ai/resources/blog/recruiting-benchmarks), [TopEchelon](https://topechelon.com/recruiter-training/recruiting-kpis-every-recruiting-agency-should-track/), [Loxo blog](https://www.loxo.co/blog/the-4-most-important-recruiting-metrics-for-staffing-agencies). Our code read: `server/src/modules/analytics/service.ts`, `pipeline/counts.ts`, `pipeline/service.ts`, `overview/service.ts`, `outreach/service.ts`, `calls/scope.ts`, `tasks/service.ts`, `forms/service.ts`, migrations `102`, `176`, `183`, `168`; console `AnalyticsPages.tsx`, `analytics.ts`, `api/analytics.ts`, `nav.ts`, `viz.tsx`.
