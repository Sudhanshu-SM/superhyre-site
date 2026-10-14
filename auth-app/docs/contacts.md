# Contact details for shortlisted people

12 Oct 2026. How emails and phone numbers are fetched in the platform, why it is only for people a recruiter has
shortlisted, and what has to be true for it to stay private and cheap. The server half is `server/src/modules/people/waterfall`
(the provider chain) and `server/src/modules/contacts` (campaigns, routes, the webhook); the agent half is
`agent/contacts-flow.ts` and `agent/capabilities/contacts.ts`; the console half is `contactsModel.ts`, `contactsFetch.ts`,
`ContactsFetch.tsx`.

## 1. The rules

1. **Only for people who are shortlisted**: on a campaign's board, stage Shortlisted or later, not Passed. Never for someone who
   was only found, and **never at sourcing time**: a search spends no contact credits and says nothing about contact details
   (the `enrich` phase now exists only for the on-demand fetch).
2. **Emails are free, phone numbers spend a credit** and only when a number is found ("Get email", "Get phone").
3. **The same waterfall as the Chrome extension**, in the same order (never reordered), written to the same tables, so credits,
   the lookup log and the people pool are one system with the extension.
4. **What is fetched is private to the workspace that asked** (see section 5). Nothing leaves the server as a value except onto
   that workspace's own candidate row.
5. **The agent never asks the person for a contact detail it can fetch**, and spends credits only on a yes.

## 2. The waterfall

`lookUp(deps, workspace, person, side)` in `waterfall/waterfall.ts`, run once per person and side. It is the extension's
`reveal-phone` function (Superhyre-Extension `supabase/functions/reveal-phone`, CLAUDE.md "A lookup runs in this order").

| Side | Order |
|---|---|
| **Phone** ("Get phone") | 1. the account already sees a number: `cached`, free. 2. credits spent: refused, nothing called. 3. our own data holds a number another account paid for (or an email lookup brought back): served, logged `shared`, **one credit**, no source called. 4. **SalesQL**, unless it answered about this profile in the last 90 days. 5. **Apollo, last**: only when 4 found no phone, the account has Apollo credits left and Apollo has not answered (or is not still working, pending under a day); it answers `pending` and delivers by webhook. 6. no number: a miss, **declared for the whole waterfall**: if any source answered (now or before) it is a plain `not_found` whatever another source's error; `failed` only when every source asked failed. |
| **Email** ("Get email") | the emails the account already sees; else log `emails` (free) to open the ones our data holds, no source asked; else the sources not yet asked, stopping at the first email. Numbers a source returns on the way are kept in our data and not shown: a later "Get phone" serves them as `shared` (a credit) without asking anyone again. A miss on this side is not a `not_found` on the person. |

Rules that hold across both: no source is asked twice for the same profile within 90 days, by any account or either side
(`public.lookup_asked`); a number must be plausible (`waterfall/phone.ts`, kept in step with the extension's `phone.ts` and
`core.phone_plausible`) and not already another person's (`public.lookup_screen_phones`) or the chain moves on; a masked
value is never kept; a request an account has made and is waiting for is not made again (that would log a miss over it and the
late number would be ignored); the profile address a source is pointed at is rebuilt as `https://www.linkedin.com/in/<slug>`.

**Apollo's callback.** The lookup signs `?u=<user>&o=<organisation or "personal">&p=<person>&l=<profile>&s=<hmac>` into the
`webhook_url` it hands Apollo (HMAC-SHA256 with `APOLLO_WEBHOOK_SECRET`). `POST /webhooks/apollo` (no session, public) trusts only
that signature, answers 200 for anything readable (Apollo disables a webhook that keeps failing; one 503 only when the database
call failed, so a redelivery can land it), acts only while the workspace's latest answer for the profile is still `requested`
(`core.lookup_callback_ws`), writes the number, spends one credit and one Apollo reveal, files it on the candidate row and flips
the person from "Looking" to found or not found.

**Configuration** (server env; a missing key drops that source, none at all makes the buttons hide):
`SALESQL_API_KEY`, `SALESQL_API_URL` (default `https://api-public.salesql.com`), `APOLLO_API_KEY`, `APOLLO_API_URL` (default
`https://api.apollo.io`), `APOLLO_WEBHOOK_SECRET` (without it Apollo is not asked at all), `APOLLO_WEBHOOK_BASE_URL` (where
Apollo reaches this API when that is not `PUBLIC_API_URL`), `CONTACT_LOOKUP_TIMEOUT_MS` (25 s),
`LIMIT_CONTACTS_PER_REQUEST` (50 people a request), `LIMIT_CONTACT_LOOKUPS_PER_DAY` (300 people a workspace a day).
`LIMIT_CRUSTDATA_CONTACTS_PER_RUN` is gone.

## 3. What is written, and where

All through the extension's own SQL. Migration **185** adds the platform's workspace-aware writer and the few pieces a database
built from the platform's baseline lacks (each created only when missing: the live project already has the extension's own).

| What | Where |
|---|---|
| the outcome of every lookup (`cached`, `shared`, `found`, `emails`, `requested`, `not_found`, `failed`, `needs_setup`), which is what credits and "what this account sees" are derived from | `core.reveal_events`, by `core.lookup_record_ws` |
| every number and address a source returned, filed under the source that supplied it first | `mother_data.person_identifiers`, and the contact columns of `mother_data.people` (`core.refresh_person_contacts`) |
| what each source said, per lookup (outcome and counts, never a value) | `core.provider_calls`, by `public.lookup_log_calls` |
| credits | `core.organizations.lookup_credits` / `apollo_credits`, and for a Personal workspace `public.user_profiles`, through `core.spend_credit` (a phone found spends one; Apollo's also one Apollo credit; a miss, an email and a still-waiting request none) |
| what this workspace asked and what came of it (found, not found, waiting), no value | `core.contact_lookups` (workspace = organisation id or `personal:<user id>`) |
| the details themselves, for the recruiters of this workspace | the workspace's own `candidates` row, **filling blanks only** (a typed address stays) |

`core.lookup_record_ws(user, organisation|null, person, url, outcome, provider, phones, emails, sources)` is
`public.lookup_record` for a named workspace: `lookup_record` finds the organisation as "the first organisation this user belongs
to" and copies onto every unowned candidate row, which would charge a Personal lookup of an organisation member to the
organisation and show it there. The platform's lookups name their workspace; the extension's keep calling `lookup_record`.

## 4. API

```
GET  /v1/campaigns/:id/contacts/status   -> { campaignId, closed, creditsLeft, perRequest, available: { email, phone },
                                              people: [{ campaignCandidateId, candidateId, personId, stage, email, phone, lookupable }],
                                              counts: { people, emailFound, phoneFound, looking, missingEmail, missingPhone } }
POST /v1/campaigns/:id/contacts          { campaignCandidateIds? | candidateIds? | personIds?, mode: "email"|"phone"|"both" }
                                          -> { campaignId, mode, people: [{ ids, email, phone }], counts, creditsUsed, creditsLeft,
                                               remaining, notice, summary }
POST /v1/contacts/fetch                  { campaignIds: [...] | all: true, mode } -> { campaigns: [{ campaignId, name, counts, remaining, notice }],
                                               counts, creditsUsed, creditsLeft, remaining, notice, summary }
POST /webhooks/apollo?...                Apollo's delivery (signed; not a button)
```

A side reads `found`, `looking` (Apollo, minutes), `not_found` or `none` (never asked). A request side result is `found`, `had`,
`not_found`, `looking`, `skipped`, `no_credits`, `failed` or `none`. Ids name people on **this campaign's board**; anyone else
(not shortlisted, passed, a hidden candidate, an id from another workspace) is simply not asked and counted `skipped`, with no
sign of whether they exist. No ids: everyone on the board lacking what was asked. A person not found is not asked again in a batch
for 90 days (naming them asks, and costs the sources nothing); a requested number is never asked for twice. A closed campaign is 409
("This campaign is finished. Reopen it to get contact details."), two requests for one campaign at once are serialised by a lock
(`contacts:<schema>:<campaign>`), the cap per request is `LIMIT_CONTACTS_PER_REQUEST` (the rest is `remaining`), and a day's
allowance spent is 429. Calm words: "No phone lookups left. Email lookups are free.", "Contact lookups aren't switched on for this
workspace yet.", "You've used today's contact lookups. They reset at midnight UTC.". A result carries counts, never a value.

Who may ask (13 Oct 2026, `workspaces-and-orgs.md` section 2): the people on the campaign, because a lookup spends the workspace's
credits. That is its owner, its team and an owner or admin of the organisation (`requireOnCampaign`); a recruiter who only
follows a campaign shared with the whole organisation reads what is found and gets 403 "Only the people on this campaign can
change it. Ask its owner or an admin to add you." from the route and the agent's `fetch_contacts`, and "all campaigns" means
the ones they are on. The free email lookup that sending an email needs (outreach, for the person it has just shortlisted)
asks no more than seeing the campaign. In the workspace they are in: a Personal workspace is its own account (its own
credits, events and candidate rows) even for someone who belongs to an organisation.

## 5. Privacy

- **The people pool.** A provider's find is a pool contact like the extension's: `person_identifiers` takes it as `shared` by the
  source trigger (migration 174), so it can be served to another workspace as the paid `shared` step. That workspace sees nothing
  until its **own** reveal event exists (`core.contact_seen`, 175): its candidate rows do not fill, its `extension_lookup` is
  empty, its board says "none". The platform never writes the pool itself: only `lookup_record_ws`, the one writer. What a
  workspace types (forms, imports, by hand) stays private (174/175), and recruiters see candidate rows by the campaign rule
  (`candidateVisible`; 179/180): a lookup reached through a campaign they can open.
- **Nothing contact-like in a log, an event or the model's text.** Run events and the effect event carry counts; provider call
  records carry counts and outcomes; server log lines carry the person's id and the source's name; the approval card names people
  and counts and says "details appear on each candidate's page". Provider error text has addresses and numbers taken out before
  it is filed. Tests assert this against the captured log, the run events, the cards and the chat's answer.
- **A source's key never leaves the server**, and the answer to a person never names a vendor.

## 6. Locally

`./dev-up.sh` starts two simulators and points the API at them: `server/scripts/salesql-sim.ts` on :8160 and
`server/scripts/apollo-sim.ts` on :8170 (Apollo answers `pending` and calls `/webhooks/apollo` about 1.5 s later,
`SIM_DELIVER_MS`; `manual` holds it until `POST :8170/__sim/deliver`). What they say for a person is a function of the profile
address (`scripts/contact-sim-data.ts`): words in the slug pick a behaviour (`sqlhit`, `nomatch`, `emailonly`, `phoneonly`,
`junkphone`, `sqlboom`, `sqlkey`, `sqlrate`, `apollomiss`, `apollosync`, `apollonone`, `apolloboom`, `apollokey`), anyone else is
a mix of hits, email-only answers and misses by hash. `/__sim/log`, `/__sim/reset` and `/__sim/fail` as the other simulators.
In tests the same simulators run in-process over real HTTP and the API is served on a port so the callback comes back to it
(`test/contacts-world.ts`).

## 7. Deploying

1. The database needs the extension's SQL that the waterfall relies on, which the live project already has (08 `core.provider_calls`
   and `core.settings`, 09 `public.lookup_log_calls`, 16/17 `public.lookup_asked`, 13/19 `public.lookup_screen_phones`).
   Migration 185 creates each only if it is missing and replaces none of them. Apply 185 like any migration.
2. Set `SALESQL_API_KEY`, `APOLLO_API_KEY`, `APOLLO_WEBHOOK_SECRET` (a long random value) and, when the API is not reachable by
   Apollo at `PUBLIC_API_URL`, `APOLLO_WEBHOOK_BASE_URL`. The API must be reachable by Apollo at `/webhooks/apollo` with no
   session (it is outside `/v1`).
3. The extension's functions and the platform share one balance and one lookup log; a number found from either is a `shared`
   credit for the other account. Top-ups are setting the credit columns; nothing refills by itself, so no copy promises a refill.

## 8. Differences from the extension's edge function (known)

- **Workspace-explicit writer** (section 3): the platform's `lookup_record_ws` takes the workspace; the extension's `lookup_record`
  keeps "first organisation".
- **No work-email preference** (extension 15's `preferred_work_email`): the platform's candidate row takes the pool's ranking
  (`core.person_contacts`), not Apollo's `person.email` priority. The ranking and both sides are the same.
- **Phone screening** is the plausibility rules plus "a number already on another person is not offered" where the database
  lacks the extension's 13/19; on the live project the extension's own `lookup_screen_phones` (blocked lines, sightings) runs.
- **No streamed progress** (the extension reports "source n" to the sidebar): the platform answers when done, and a late Apollo
  number shows by polling the status.
- **Sources**: SalesQL then Apollo, as the extension (ContactOut has been out of the chain since 6 Oct).

## 9. Limits and risks (as built)

- **A request is synchronous.** A batch of up to 50 people runs four at a time and answers when done; with slow sources that is
  a minute or two, longer than a button's patience but inside a proxy's. A late Apollo number never blocks it (it arrives by
  webhook). If batches get large, the next step is to run them as a run with phases, which the agent's approval path already narrates.
- **Credits are a balance, not a plan.** The default is 100 lookups and 40 Apollo reveals per organisation, and the same for a
  Personal workspace (`public.user_profiles`, created on first spend). Joining an organisation deletes a person's personal credit
  row, so a Personal workspace of an organisation member starts again at the default: a policy question for the owner, not code.
  Two lookups at the same moment can overshoot a balance by one (the extension's own rule).
- **The pool holds provider finds.** They are served to another workspace as the paid `shared` step, as the extension's are
  (section 5). If a workspace must never contribute to the pool, the writer needs a private mode; today nothing offers one.
- **Apollo needs to reach this API.** `APOLLO_WEBHOOK_BASE_URL` / `PUBLIC_API_URL` must be reachable from Apollo; a number that
  arrives after its webhook was missed is lost (the request stays `looking` for a day, then may be asked again).
- **The `not_found` state is per workspace and per side**; "not found" does not mean the sources have nobody, only that they did
  not within 90 days. A batch skips such people until then; naming them asks again at no cost to the sources.
- **No work-email preference** and **simpler phone screening** than the live project (section 8).
