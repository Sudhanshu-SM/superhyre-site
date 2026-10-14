# Crustdata people search: lean and full

13 Oct 2026. One setting, `CRUSTDATA_MODE`, decides what a search asks the provider for and what it costs.
Code: `packages/shared/src/crustdata.ts` (request builder), `server/src/modules/sourcing/crustdata.ts`
(client, normaliser), `server/src/modules/sourcing/service.ts` (search, credits, scoring criteria),
`server/scripts/crustdata-sim.ts` (local stand-in).

## Env vars (server)

| Variable | Default | What it does |
| --- | --- | --- |
| `CRUSTDATA_API_KEY` | empty | The provider's key. Empty: searches use our own pool only. |
| `CRUSTDATA_URL` | `https://api.crustdata.com` | The API, or `http://localhost:8130` for the simulator (`SIM_KEY` is the key, default `sim-key`). |
| `CRUSTDATA_MODE` | `lean` | `lean` or `full`, below. Read on every search, so a restart picks up a change. |
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
