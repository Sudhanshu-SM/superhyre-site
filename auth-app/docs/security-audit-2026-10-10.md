# Tenant isolation and privacy audit, 10 Oct 2026

Scope: can one tenant (organisation or personal workspace) read, change or infer another's data, and is personal data
handled safely. Local stack only; nothing is deployed. Method: five auditors in parallel (database, API routes, agent
and memory, browser and public pages, privacy and secrets), each reading the code and attacking the running system with
two or more invented organisations and personal workspaces; then three fixers; then the gates again.

## Verdict

**Direct cross-tenant access through the API held.** About 90 id-taking route templates were called with a victim's ids
from three attackers each (read, update, delete, bulk, nested, ids in bodies and queries, uuid spellings, the workspace
header): every foreign id answered a uniform 404 with byte-identical bodies and equal timing. 155 routes were
inventoried; 9 are unauthenticated and were probed. 76 organisation schemas plus `personal` carry 3,078 row-level-security
policies, none missing. Tokens at rest are AES-256-GCM bound to their holder; invite and form keys are hashed or 144+ bits;
SSRF guards blocked 17 address forms; agent tools take their scope only from the signed token; agent memory is filtered by
organisation on every read and write; model sessions are keyed per organisation and conversation.

**What was broken, and is now fixed:** the shared people pool leaked contacts across tenants (one rule, two routes),
several things were visible or writable that should not have been, deleting a candidate was not erasure, and the browser
kept one person's data for the next person on the same tab. Details below.

## Findings and what was done

| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | high | Typing any phone on your own candidate for a pooled person unlocked the pool's phones and emails that other tenants or imports contributed, free (`core.contact_seen`) | **Fixed** (174/175): unlocking depends only on your own reveal events. DB tests: none, still none after typing, full after a reveal |
| 2 | high | Concurrent set-up finish made N campaigns; a recruiter could overwrite the org website and be trapped in set-up | **Fixed**: per-person lock; finish refuses anyone who is not the owner, before any write |
| 3 | high | Switching or leaving a workspace left the previous workspace's lists on screen | **Fixed**: every store resets on workspace change |
| 4 | med | Another person signing in on the same tab saw the last person's chat, candidate names and campaign draft (display cache only; the server refused every fetch) | **Fixed**: sign-out clears what the browser kept and reloads; a different user id reloads |
| 5 | med | Any signed-in user could read other tenants' cached company research and burn their quota | **Fixed**: cache only for those entitled to it; quota per person and domain |
| 6 | med | Any authenticated user could append experiences and fill fields of any pooled person (`extension_save`) | **Fixed** (175): only a person nobody has described and with no trusted enrichment; capped |
| 7 | med | An applicant could plant a typed LinkedIn URL, with their own verified contacts, onto the pool person for that profile | **Fixed**: applicant-typed LinkedIn is never bound to the pool |
| 8 | med | Non-consenting applicants were pooled (name, LinkedIn, enrichment) and findable by other tenants' search | **Fixed**: `people.discoverable`, hidden unless consent; search and lookups filter it |
| 9 | med | Tenant-typed contacts (forms, imports, manual) were `shared` pool contacts for everyone | **Fixed**: visibility decided by a trigger by source; legacy rows made private |
| 10 | med | Deleting a candidate left their form response, calls, activity names, export filters, suppression label, queued payloads | **Fixed**: erasure in the same transaction plus a job; member removal purges their chats |
| 11 | med | No retention on runs, run events, chats, notifications | **Fixed**: nightly job (30/90/60/90 days, constants documented) |
| 12 | med | Exports (5,000 rows with contacts) were not audited server-side; no rate limit | **Fixed**: recorded server-side with the real count; 20/hour per user |
| 13 | med | Public apply form emailed any address a message containing text a form owner wrote; limits multiplied by form | **Fixed**: fixed template, per-address cap across forms, per-visitor cap across forms, page-load throttle |
| 14 | med | The agent could, after reading untrusted text, do-not-contact people, cancel schedules or give a teammate a task without the recruiter asking | **Fixed**: each needs the recruiter's own words as a quote found in their messages; cancels capped at 3/answer |
| 15 | med | Client-level memories distilled from chat were active at once | **Fixed**: they wait for approval, like the chat's own remember |
| 16 | low-med | Contact details reached the model as input (tool results, judge text) | **Fixed**: free text redacted on the way in; prompt-tag spoofing (zero-width, fullwidth, more tags) closed; history is delimited |
| 17 | low | Existence oracles: org uuid via the workspace header, invite and join-request ids, `alreadyInPool`, run 403 vs 404, personId lookups in suppressions | **Fixed** except the intra-organisation 403/404 on campaigns (kept for a useful message) |
| 18 | low | A removed member's running turn kept read access until it ended | **Fixed**: no role means no read |
| 19 | low | Core helper functions callable by any signed-in user (`scope_for_user` and friends); pool contact columns selectable by `authenticated` | **Fixed**: execute and column grants revoked; policies narrowed |
| 20 | low | Suppression email hash was an unsalted SHA-256 | **Fixed**: per-tenant HMAC with dual lookup and lazy upgrade |
| 21 | low | Production could start with missing or weak secrets; dev bypass depended only on the build mode | **Fixed**: refuses to start; bypass also requires a local address; `.env*` ignored |
| 22 | low | `Cache-Control` absent; uuid spellings bypassed quota keys; provider error text echoed; cursors 500 | **Fixed** |

## Open: decisions for the owner

1. **The API connects to Postgres as a superuser role (BYPASSRLS).** Row-level security therefore never runs for API traffic;
   isolation rests on `table()`/`owned()` in the server code, which the audit found consistent (302 tenant-table queries,
   spot-checked) but which has no database backstop. Fixing it means a non-bypass role and request-scoped transactions
   (`set local role` and claims), a sizeable change. Recommended before real customer data.
2. ~~Recruiters see every candidate in the organisation~~ **Resolved 11 Oct 2026.** A recruiter sees a candidate when
   they look after them, when they are on a campaign the recruiter can see, or when nobody has taken them yet (no
   owner and on no campaign); owners and admins see all. One predicate, `candidateVisible`, with `visibleCandidates`
   for joins (`server/src/modules/pipeline/service.ts`), applied at every read and write that names a candidate by id,
   person, name or contact: the list and its filters, get, edit, notes, details, delete, quick find, the export
   count, add and import (a person already held by someone else reads "already saved by your team" with no id or
   name), shortlisting by id, tasks, the do-not-contact list, forms' possible matches and linking, schedules' titles,
   the contact hints on matches, the matcher's typed details, the agent's tools, and the extension's lookup and save
   (migration 180). A hidden candidate answers the same 404 as an unknown id. Paths already inside a campaign the
   caller may open (board, outreach, matches, exports, digest, analytics) are visible by that campaign and were left.
   Proved by `server/test/candidate-visibility.test.ts`. By design (the rule's (b)), a recruiter who finds a person a
   colleague holds and shortlists them onto their own campaign then sees that row; nothing is taken from the owner.
   Not covered: the extension's own `calls` and `call_queue` tables, and the Settings count of Personal candidates
   that leaves out those the organisation holds.
3. ~~A recruiter can pause, and add candidates to, an org-visible campaign they are not on~~ **Decided 13 Oct 2026: B
   (narrow).** On a campaign shared with the whole organisation, a recruiter who is not on it (not its owner, not a member,
   not an owner or admin) keeps the board's collaborative work (add, move, pass, shortlist, notes, outreach drafts) and may
   not do the brief and credit-spending family: writing, drafting, uploading or approving the role spec, starting or
   watching a search, ranking again, contact lookups, and the campaign's settings and brief. One guard, `requireOnCampaign`
   (`pipeline/service.ts`), is asked by every route, agent capability and chat command of that family (403 "Only the people
   on this campaign can change it. Ask its owner or an admin to add you."); the console draws no such control for them and
   says why once. A recruiter who owns a campaign can attach only a client they can see (`requireClient`). Proved by
   `server/test/off-team-guard.test.ts`. See `workspaces-and-orgs.md` section 2, "Campaigns".
4. **The extension's own SQL** (`Superhyre-Extension/supabase/07_credits.sql`, `16_phone_and_email_access.sql`, and files
   that redefine `contact_seen`, `sync_candidate_contacts`, `extension_lookup`) still defines the old unlock rule. If any of
   those is re-applied after the platform migrations (174/175) it undoes fix 1, and after 180 it would also undo the
   candidate-visibility rule in `extension_lookup`, `extension_lookup_many` and `extension_save`. They are a separate
   project and were not edited. The deployed `reveal-phone` edge function was not in scope.
5. **Production settings were not verifiable locally:** Supabase "exposed schemas" (core, mother_data, personal and
   every tenant_* must not be exposed; see "Exposure requirements" and `pnpm check:exposure`), email confirmation required for sign-up, `TRUSTED_PROXY_HEADER`, `CORS_ORIGINS`, `QDRANT_API_KEY`.
6. **A loose file** `superhyre_access_token.txt` (a Supabase management token) sits in the workspace root, outside any git
   repo here. Delete it and rotate the token.
7. Local dev only: Postgres, Qdrant and the API listen on all interfaces and Qdrant has no key. The gateway puts the
   per-turn agent token on the model CLI's argv (visible to local users via `ps`).

## Exposure requirements

Row-level security in the tenant schemas is a second line, not the first. The API server reads them as a superuser and
is their only reader; the policies on them are membership-only (a member's rows, not a role's), so they assume nobody
reaches the tables directly. That assumption is a deployment setting, and it is the requirement:

- **Supabase "Exposed schemas" (PostgREST `db_schemas`) lists `public` and nothing else of ours.** `core` (organisations,
  members, invitations, runs, connections), `mother_data` (the shared people pool), `personal` (every personal workspace)
  and every `tenant_*` schema must not be exposed. The console and the Chrome extension need only the `public` RPC
  functions and Auth.
- **Check it before every release:** `pnpm check:exposure` in `server/` (reads the `authenticator` role's
  `pgrst.db_schemas`; `--exposed a,b,c` checks the dashboard's list by hand). It exits 1 and names each schema that must
  come out. The server also logs the same finding at start-up in production (`src/platform/exposure.ts`); on a local
  database there is no such role and it has nothing to say.
- **Why not role-aware policies in the tenant tables:** a recruiter's visibility is a join across campaigns, members and
  ownership, enforced in the server (`candidateVisible`) and, for the extension's functions, in SQL (migration 180).
  Duplicating it into 37 tables' policies, behind a connection the API does not use, would be a second copy to keep right
  with nothing exercising it. If a tenant schema ever had to be exposed, that work comes first.
- **What is role-aware at the database now:** `core.runs` and `core.run_events` (migration 181). A member reads the runs
  they started and the runs of conversations they own; the organisation's owner and admins read all of the organisation's.
  Before this, any member could read every run and event of the organisation (16 of 24 runs were other people's chats in
  the 11 Oct test). The API's own connection is a superuser and reads them all, as it did.

## Known limits

Chat text and run events that name a person age out by retention only. Spreadsheets already exported to someone's Drive
remain. The research endpoint and cache stay in the code, unused by the new sign-up. Candidate rows polluted by the old
unlock exploit cannot be told apart from copied contacts and were left. The injection filters are heuristic; the real
controls are the approval gate, the quote grounding, the per-turn caps and tenant-scoped tools.

## Re-running

Tests: `server/test/db.isolation.test.ts` (30 database tests), `onboarding-lean.test.ts`, `erasure.test.ts`,
`untrusted.test.ts`, `config.test.ts`, `candidate-visibility.test.ts` (open decision 2), plus additions in forms,
exports, suppressions, schedules-agent, memory, hardening. Console: `clientCache.test.ts`. Gates after the work: see `e2e-results-2026-10-10.md`.
