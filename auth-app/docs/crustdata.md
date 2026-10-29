# Crustdata people search: atlas, lean and full

13 Oct 2026. One setting, `CRUSTDATA_MODE`, decides what a search asks the provider for and what it costs.
Code: `packages/shared/src/crustdata.ts` (request builder), `server/src/modules/sourcing/crustdata.ts`
(client, normaliser), `server/src/modules/sourcing/service.ts` (search, credits, scoring criteria),
`server/scripts/crustdata-sim.ts` (local stand-in).

## Env vars (server)

| Variable | Default | What it does |
| --- | --- | --- |
| `CRUSTDATA_API_KEY` | empty | The provider's key. Empty: searches use our own pool only. |
| `CRUSTDATA_URL` | `https://api.crustdata.com` | The API, or `http://localhost:8130` for the simulator (`SIM_KEY` is the key, default `sim-key`). |
| `CRUSTDATA_MODE` | `atlas` (since 29 Oct 2026; `lean` before) | `atlas`, `lean` or `full`, below. Read on every search, so a restart picks up a change. An environment that sets it keeps what it sets. |
| `CRUSTDATA_ORDER` | `crustdata` | Atlas only: `crustdata` keeps the provider's own order, `relevance` ranks the same people by the brief's words, inside the same filters. |
| `CRUSTDATA_TIMEOUT_MS` | `30000` | Per request. |
| `LIMIT_CRUSTDATA_PROFILES_PER_DAY` | `400` | Profiles an organisation may buy a day, searches and contact lookups together. Counted in profiles, not credits. |

## Cost (API 2025-11-01, `POST /person/search`)

Per result: 0.03 base, plus each premium group you filter on or receive. Sorting is free. The provider reports
the exact figure in the `X-Credits-Used` response header; we record that, not an estimate.

| Group | Adds per result |
| --- | --- |
| experience, education, skills | 0.1 each |
| certifications, honors, network signals, languages, summary | 0.2 each |
| dev platform profile filters | 0.8 or 2.5 (filter side) |
| no `fields` sent | returns experience + education: 0.23 in all |
| `fields: ["basic_profile", <profile url>]` and base filters only | 0.03 |

A search of 20 people: lean 0.6 credits, full 4.6.

## Lean (default)

Request: `fields` = `basic_profile` and `social_handles.professional_network_identifier.profile_url` (the URL is
how we tell people apart; it is not in `basic_profile`). The search query, `limit`, `cursor` and the exclude list
are unchanged.

Filters sent, all base-priced:

| Recruiter filter | Sent as |
| --- | --- |
| Job title | `basic_profile.headline` `(.)` or `basic_profile.normalized_title.matched_title` `(.)` |
| Keywords | `basic_profile.headline` `(.)` (full mode also reads the summary) |
| City | `basic_profile.location.full_location` `(.)`, with the usual alias spellings |
| Country, time zone | `basic_profile.location.country` `in` |
| Years of experience | `years_of_experience` with `=>` and `=<` |

Not sent, and kept as plain lines for our own scoring (`SourcingContext`, read by the judge as "the recruiter also
asked for"): seniority, function, company (current, past, excluded, size, type, model), industry, skills (must,
any, excluded), time in role, recent move, education (degree, field, school, tier), certifications, spoken
languages, open to work, GitHub signals, profile freshness, a search radius, and "has held the title".
Whatever the role spec already says is left out of that block; the judge reads the spec as it is.

The "not a fabricated profile" filter is also left out: it is not a base-priced field.

## What lean loses

- **Recall is by headline, not by history.** Someone whose headline does not say the role (or says it in other
  words) is not found. Current-title and company filters are not applied by the provider.
- **No work history.** A person lands with a name, headline, title, place, picture and a URL. `experiences`,
  `skills`, `education` stay empty until a profile is enriched. The company is read from a headline that says
  "X at Company", otherwise it is empty. Years of experience is empty too.
- **Scoring is thinner.** The judge scores from headline, title, place and (when sent) years. A hard-skill
  knock-out is not applied to a profile with no skills and no roles: it can't prove a skill is missing.
- **Our pool is the better source.** People we already hold with full profiles are still matched on everything.
- **Premium filters are soft.** Company, skills, industry and education reach the judge as criteria; people who
  fail them are ranked lower, not removed.

Use `full` for a role where company or education is the whole brief (for example "ex-Razorpay, IIT").

## Where credits show up

- Run phase line: `Found 30 people, 0.9 credits` (no vendor name). Without a figure it stays `Got 30 candidates`.
- `match_runs.counts.credits` (decimal) and `counts.mode`; `match_runs.credits_used` stays whole profiles.
- The sourcing ledger: each batch record in `sourcing_ledgers.batches` has `credits`.
- Run output: `credits`.

## Local

`pnpm --filter @superhyre/server sim:crustdata` starts the simulator. It honours `fields` (a family or a dotted
path; `crustdata_person_id` is always there) and answers `X-Credits-Used` from the same price list, premium
filters included. `GET /__sim/stats` has `creditsUsed`.

Verify against the real API on the first live search: the header should read 0.03 a person. If it reads more, the
URL field path is being charged or a filter is in a premium group; check `request` in the run and the price list
at `/account/endpoints`.

## Atlas (default since 29 Oct 2026): how the provider's own Search page searches

Found by running one sentence through their app ("pre sales or sales with real estate sales experience from hyderabad
india", signed in as the same account as our key) and reading the plan it showed. It does **not** rank anything:

1. It asks which job titles are stored for the words (`POST /person/search/autocomplete`, free,
   `{field: "experience.employment_details.title", query, limit: 20}`), once per word it thinks of ("sales", "presales",
   "pre", "realty", "property"), and keeps the suggestions that hold the role's words.
2. It sends ONE filter-only `POST /person/search`: city and country (`=`), the titles in the current, past and any
   employment (`in`), the industry in four fields (`(.)`: current and past `company_industries` and
   `company_professional_network_industry`). No `search.query`, no `sorts`.
3. With no sort the order is ascending `crustdata_person_id`, paged by `next_cursor`.

We do the same (`server/src/modules/sourcing/atlas.ts`): the words to look up are read from the brief once by the model
(`crustdata_lookups@1`, kept 24 h; the title's own words when the model cannot be reached), the titles are looked up and
filtered by word (`pickTitles`), and `atlasRequest` builds the request. Batches do not use cursors: each leaves out every
profile already seen (`post_processing.exclude_profiles`), so it is the next page of the same search. On the Hyderabad
example our request returned the same 10 people in the same order as their app's own run (2,897 matches in all).

- **Falls back** to the ranked lean search when the plan is too thin (needs titles, and a city or an industry or a country),
  when the lookup does not answer, or when the request is refused (a transient failure is retried and, if it persists,
  fails the run honestly, as before). A shortfall (fewer people than asked) is topped up from the ranked search with the
  people the titled one returned left out.
- **Order.** Their order is by id, so relevance is low (directors and founders appear among the first 20); our scoring
  re-ranks each batch and shows the best first. `CRUSTDATA_ORDER=relevance` sends the brief's words as a ranking query
  (`mode: exact`, the filters stay hard) at the cost of no longer matching their page.
- **Needs** the `experience` group to cost nothing on the account's plan (true for ours: `get_schema` lists it at 0; the
  base price is 0.03 a person). Elsewhere the same request bills for it.
- **Not reproducible:** the older `/agent-search` page (an asynchronous model job over a pool; two runs of one sentence
  gave different lists). Nothing can match that one.

### Exact replay

The cURL their Search page shows beside a plan (or its JSON) pasted into the chat is read in code
(`sourcing/replay.ts`: only `https://*.crustdata.com/person/search`, validated by the same request schema, at most
3,000 values and 300 conditions) and shown as one card, "Run the search you pasted for X". A yes runs that very request:
filters, ranking and order as pasted; the page size, the `fields` and the people already seen are ours. No lookup, no
model. A chat message is at most 8000 characters, so a long pretty-printed plan goes in as the JSON on one line. Every
run keeps the request it sent (`how.curl` in its output, the key and the people-seen list left out) to paste into their page.

The card lists every place, the number of titles, the industry, any other field filtered on and any sort, with no name of the
source in a field. A search that filters or sorts on a field charged for each person (`dev_platform_profiles`,
`research_profiles`) is refused with a plain line, and a search the source turns down is told as that. In the ledger a
pasted search is a batch marked `replay`: it counts as a request (the next run needs another idempotency key) and its
people are never fetched again, but it does not move the campaign's own cursor or its "nobody more", does not size the
batches after it, and is not refused when the campaign's own search has run out. A run whose titled search came back short
and was filled up with the ranked search says so in its line (`how.line`).

## Strays, erased people and the daily search (29 Oct 2026)

- **A search's strays are kept.** The provider matches near spellings, so a search can be sent people from outside the
  campaign's cities. They are not taken in and never made into people, and their profile keys are kept in
  `sourcing_ledgers.strays` (migration 208; the newest 300, `MAX_STRAYS` in `sourcing/service.ts`), which the next
  search of the same query leaves out with everyone seen. Before, they were said to "stay in the ledger as seen" but
  were not kept, so the same ones headed every later page and were paid for again each time. A changed spec or filter is
  a different query and starts the list again. A pasted search (replay) is not held to the campaign's cities.
- **Erased people are not bought back.** Erasing a person writes `erased_profiles` (a hash of their profile key, salted
  by the workspace: enough to refuse them, nothing that says who they were), and a search refuses a profile whose hash
  is there. A hash cannot be sent as `exclude_profiles`, so the source can still put them on a page: a campaign pays for
  each of them once, after which their key is kept with its strays. The pool path can still surface someone erased from
  the workspace, because their shared profile stays in the pool by design.
- **The daily search** (`plans/daily-search.md`, `agent-architecture.md`) searches in whichever mode is set, on the
  background lane, with a 7-day cache for the title lookup (`TITLE_LOOKUP` in `sourcing/standing-run.ts`; a 24-hour
  cache would mostly miss for a search that runs once a day), and makes no memory episode and no enrichment request. It
  shares `LIMIT_CRUSTDATA_PROFILES_PER_DAY` with hand searches and never spends the last 100 profiles of a day (its
  reserve), and it buys at most 3,000 profiles a month (`DAILY_SEARCH` in `packages/shared/src/sourcing.ts`, with an
  admin task at 70%). The approval card's "about 1.2 credits a day" is profiles times 0.03, the price of basic profiles;
  it is not checked against what lean and full modes charge.
- **Twins.** In atlas mode two campaigns with the same role title and city make the same request, so campaigns of one
  daily search that ask for exactly the same people leave out what their siblings already hold from an identical request
  (`sourcing/siblings.ts`; the request key, a hash of the filters, query, mode and sorts, is stored in
  `match_runs.counts.plan`). In lean and full modes the ranking query carries the campaign's own title words, so
  differently named campaigns are not twins.
