# SuperHyre platform plan: data, workspaces, features

Status: **plan only** (4 Oct 2026). Companion to `agent-architecture.md` (agent, sourcing, matching, memory, orchestration) and `gateway-changes.md` (model runtime).
Grounded in: the live Supabase project (read-only checks, 4 Oct 2026), the SQL in `Superhyre-Extension/supabase/00–07`, and the console code in `auth-app/src`.

---

## 1. What exists today

### 1.1 Database (live project `npqajviolhoufuggfobg`)

| Schema | Tables | Notes |
|---|---|---|
| `core` | `organizations`, `org_members`, `tenant_schemas`, `user_active_context`, `organization_join_requests`, `providers`, `free_email_domains`, `reveal_events`, **`sourcing_runs`**, **`sourcing_candidates`** | The last two exist live but in no repo: a sourcing service (JD hash, filters, `skipped_seen`, 11 runs, 171 candidates). |
| `mother_data` | `people`, `person_identifiers`, `person_experiences`, `person_skills`, `skills`, `companies`, `company_identifiers` | Shared pool, 194 people, skills/experience empty. |
| `public` | `user_profiles`, `individual_candidates`, **`individual_calls`**, **16 `agent_*` tables** | `agent_*` belong to a live WhatsApp recruiting agent (319 messages, Google integrations with encrypted refresh tokens, Gmail drafts and reply watches, calendar events, memories with embeddings). Not in any repo found locally. |
| `tenant_superhyre`, `tenant_talentdiary` | `users`, `candidates`, `candidate_identifiers`, `candidate_experiences`, `candidate_skills`, `extension_captures`, `call_queue`, `calls`, `upload_sessions` | Made by `core.provision_tenant()`. |

Behaviour that matters:
- **`core.caller_tenant()`** (live) returns the user's **oldest** ready membership and ignores `user_active_context`, so the workspace switcher can't change what the RPCs read.
- **Onboarding** (`core.onboard_user`, trigger on `auth.users`): free email → personal; first login on a new domain → personal; **second** login on that domain → org auto-created, oldest user becomes owner. Joining an org **copies personal candidates into the org and deletes the personal profile and candidates** (credits included).
- **Roles** live only in `tenant_<slug>.users.role` (owner/admin/recruiter). Tenant RLS gives every member full CRUD on `users`, so a recruiter could change their own role if a tenant schema were ever exposed.
- **Missing:** campaigns, clients, per-campaign stages, stage history, activity, tasks, forms, outreach/email, notifications, invites (join requests exist but nothing approves them), settings, versioned migrations.

### 1.2 Console (`auth-app`)

Real: auth (OTP + Google), `extension_bootstrap`, the Integrations page (`extension_activity`). Everything else runs on fixtures and in-memory stores. Placeholders: Settings, Support, three Analytics pages. No onboarding, org creation, invite or member management screens. Tasks, notifications, news, fleet and many counts are fixtures (listed in `agent-architecture.md` §17.1).

---

## 2. Workspaces, organisations and sign-up

### 2.1 The model

- **Organisation** = the tenant (one `tenant_<slug>` schema). A user belongs to at most one in v1.
- **Every user also has a personal workspace**, private to them, always available, including after joining an organisation.
- The **workspace switcher** (top of the sidebar) moves between *Personal* and *the organisation*. It changes what every RPC reads, through one function (§2.4).

### 2.2 Flows

**Work email, domain has no organisation**
1. Sign in (Google or OTP).
2. Screen: **"Set up Acme on SuperHyre"**: organisation name (pre-filled from the domain), optional logo. Colleagues on the same domain can ask to join; an admin approves each one (decided 4 Oct 2026).
3. Create → the organisation row is created, the tenant schema is provisioned (a few seconds; the screen shows progress, retries on failure), the user becomes **owner**.
4. Lands in the organisation workspace. Personal workspace exists alongside.

**Work email, domain already has an organisation**
1. Sign in.
2. Screen: **"Join Acme"** with who's in it (count, owner's name) and two buttons: Join, or Continue with personal only.
3. **Admin approval is required** (decided 4 Oct 2026): Join creates a join request; owners and admins get a task and a notification and approve with a role (recruiter by default) or decline; the user works in their personal workspace until approved, and sees "Waiting for approval".

**Invited by email** (any domain, for contractors and agencies): the admin invites; the invitee signs in with that email and lands in the org with the role chosen in the invite.

**Free email (gmail.com etc.)** (decided 4 Oct 2026): blocked, except **selected personal accounts set up in the database**. The hardcoded array in `core.is_email_allowlisted()` becomes a table, `core.personal_allowlist(email primary key, note, added_by, created_at, expires_at)`, which the sign-up hook and `onboard_user` both read; adding someone is one insert (or an owner-only Settings field later). Allowlisted personal accounts get a personal workspace only and can't create or join an organisation.

### 2.3 Changes to the current onboarding

| Today | Change |
|---|---|
| Second login on a domain silently creates the org | The **first** user on a domain is *offered* to create it (§2.2); nothing is auto-created |
| Joining deletes `user_profiles` and personal candidates | **Keep the personal workspace intact.** Moving a candidate to the org becomes an explicit action |
| Join requests have no approver | `approve_join_request` / `reject_join_request` RPCs (admin), plus a task for admins |
| Org is resolved by "oldest membership" | Resolved from the active workspace (§2.4) |
| Admin is never assigned | Creator is owner; owner/admins can promote |

### 2.4 One function decides scope

```sql
core.caller_scope() returns table(scope text /* personal|org */, organization_id uuid, schema_name text, role text)
-- reads user_active_context; null org → personal; verifies membership and tenant ready
```

Every RPC and the backend use it instead of `caller_tenant()`. `lookup_record` / `lookup_callback` move to it too, so credits and visibility follow the active workspace. `caller_tenant()` stays as a wrapper for the extension until it's updated.

### 2.5 Where personal-workspace data lives

New features (campaigns, forms, tasks…) need the same tables in personal mode. Options considered: a schema per user (too many schemas at scale), or duplicate `public.individual_*` tables per feature (two code paths).

**Decision proposed:** one shared schema **`personal`**, created by the same template as tenants, with an **`owner_user_id`** column on every table and RLS `owner_user_id = auth.uid()`. The backend passes `schema_name = 'personal'` and the RLS does the scoping, so one code path serves both. `public.individual_candidates` and `individual_calls` migrate into it later; until then the extension keeps using them.

---

## 3. Admin and recruiter views

| Area | Owner / admin | Recruiter |
|---|---|---|
| Home | Org-wide numbers; filter by recruiter | Own campaigns and work |
| Campaigns | All; create, assign, close, complete, duplicate | Assigned only; pause / resume / start sourcing |
| Campaign overview | Hires card (hires, needs-you, screening) | "Your work" card |
| Candidates | All in the org; delete | All in the org (shared pool); add; no delete |
| Clients | Full | Hidden (absent from nav) |
| Agent chat | Can create campaigns and clients | Asked campaign questions; campaign creation becomes a request to an admin (task) |
| Settings | Members, organisation, connections (org-level), usage | Profile, own connections |
| Integrations / usage | Team view | Own view |

Enforced in three places: hidden in the UI (absent, not disabled), checked in the backend command, and enforced by RLS/RPC. Recruiters can't change roles: role changes only through `set_member_role` (admin), and the `users` table becomes read-only to non-admins.

---

## 4. Settings (minimal)

One page, a short list on the left, one panel on the right. No tabs inside tabs.

| Section | Who | Contents |
|---|---|---|
| **Profile** | everyone | Name, photo, time zone, email signature (used in outreach) |
| **Organisation** | owner, admin | Name, logo, join requests from @acme.com need admin approval (shown, not a toggle in v1), default campaign visibility |
| **Members** | owner, admin | List (name, email, role, status, last active, campaigns); **Invite** (email, role); change role; deactivate; remove; pending join requests with Approve / Decline |
| **Connections** | everyone (own), admins (org) | Gmail, Google Calendar, Google Sheets, WhatsApp (Magnifi), Chrome extension, Slack; state, account, reconnect, disconnect |
| **Usage** | admins (team), everyone (own) | Lookup credits, agent usage this month, exports |
| **Danger zone** | owner | Transfer ownership, leave, delete organisation |

**Removing a member** opens one confirmation that says what happens: their campaigns and candidates are reassigned to a chosen person (default: the admin removing them); their connections are disconnected; running agents they started keep running under the new owner; their personal workspace is untouched. Implemented as `remove_member(user, reassign_to)` in one transaction, plus an activity entry.

**Inviting**: `invites(id, org, email, role, token_hash, invited_by, expires_at, accepted_at)`; email sent from SuperHyre (transactional, not the user's Gmail); accepting adds the member. Resend and revoke from the list.

---

## 5. The tenant data model (per organisation, and in `personal`)

Added to `provision_tenant()` (idempotent; backfilled for `tenant_superhyre`, `tenant_talentdiary`). Every table gets `created_at`, `updated_at` (touch trigger), and in `personal` an `owner_user_id`.

| Table | Key columns | Notes |
|---|---|---|
| `clients` | name, website, domain, industry, location, status (prospect/active/inactive), owner_user_id, fee jsonb, notes | |
| `client_contacts` | client_id, name, title, email, phone, is_primary | one primary per client (partial unique index) |
| `campaigns` | name, client_id, status (active/closed; migration 176 folded draft, paused and completed into these two), owner_user_id, department, location, target, priority, visibility, setup jsonb (the full `CampaignSetup`), opened_at, closed_at | |
| `campaign_members` | campaign_id, user_id, role (owner/member) | recruiters see only their campaigns |
| `campaign_candidates` | campaign_id, candidate_id, **stage** (shortlisted/outreach/interviewing/hired/passed), **step** (waiting/replied/loop/offer), owner_user_id, source (agent/extension/manual/form/referral), fit (1–3), tier, stage_entered_at, screening jsonb, unique (campaign_id, candidate_id) | **the per-campaign stage**; `candidates.stage` stays for the extension's org-level view |
| `stage_moves` | campaign_candidate_id, from, to, step, actor_kind (user/agent/system), actor_id, reason, run_id, at | history, activity, metrics, undo |
| `notes` | subject (candidate/campaign/client), body, author | |
| `activity` | subject, verb, actor_kind, actor_id, data jsonb, at | one feed for overview, client history, audit |
| `tasks` | §7 | |
| `forms`, `form_questions`, `form_versions`, `form_responses` | §10 | |
| `outreach_threads`, `outreach_messages` | §8 | |
| `conversations`, `messages`, `agents` | `agent-architecture.md` §17.2 | |
| `campaign_seen`, `sourcing_ledgers`, `role_specs`, `match_runs`, `match_scores`, `match_feedback` | `agent-architecture.md` §10, §16 | |
| `exports` | kind, filters, format, row_count, by, at, file_key | audit and re-download |
| `notifications` | user_id, kind, subject, text, read_at | |
| `candidates` (existing) | add `notice_days`, `current_ctc`, `expected_ctc`, `work_mode_pref`, `relocate`, `search_tsv` | filled by forms and calls |

Shared, in `core` (keyed by `organization_id`, or by user for personal): `runs`, `run_events` (Realtime), `connections` (§8.1), `invites`, `usage_daily`.

**Migrations become versioned**: `supabase/migrations/NNN_*.sql` applied in order by a script that also loops every ready tenant and the `personal` schema, records applied versions in `core.schema_versions`, and is safe to re-run. The `07 after 04/05` rule disappears.

---

## 6. Feature → data map

| Feature (UI) | Reads | Writes | Backend |
|---|---|---|---|
| Sign-in / onboarding | `organizations`, `org_members` | org, membership, tenant schema, join request | RPCs `onboarding_state`, `create_organisation`, `join_organisation` |
| Workspace switcher | memberships | `user_active_context` | RPC `set_active_workspace` |
| Home: week card | `stage_moves`, `campaign_seen`, `campaigns` | – | RPC `home_overview(scope, days)` |
| Home: tasks | `tasks` | `tasks` | commands; agent-generated (§7) |
| Home: campaigns list | `campaigns`, `campaign_candidates` counts | – | RPC `campaign_list` |
| Home: insights | – | – | placeholder (§12) |
| Campaigns page | `campaigns`, `campaign_members`, `clients` | create / assign / status | commands (admin-gated) |
| Campaign overview | `campaign_candidates`, `stage_moves`, `campaign_seen`, `activity`, `forms` | – | RPC `campaign_overview(id)` (§11) |
| Pipeline / Shortlisted | `campaign_candidates` + `candidates` | `stage_moves` | `moveCandidate` command |
| Shortlisted export | same + visible contacts | `exports` | §10.4 |
| Forms builder / responses | `forms`, `form_*` | `forms`, `form_responses` links | §10 |
| Public form `#/apply/<key>` | form version | `form_responses` | public endpoint |
| Calls | `calls`, `call_queue` | notes, links | existing dialer RPCs + recording URLs |
| Candidates page | `candidates`, `mother_data` | candidates, imports | existing + `ingest_person` |
| Clients | `clients`, `client_contacts`, `activity` | same | commands (admin) |
| Agent chat | conversations, runs | everything via commands | orchestrator |
| Agents rail / fleet | `agents`, `runs` | controls | supervisor |
| Integrations | `reveal_events`, candidates | – | `extension_activity` (exists) |
| Settings | members, invites, connections | same | §4 |
| Search / quick find | many | – | §14 |
| Notifications | `notifications` | read state | Realtime |

---

## 7. Tasks, and the agent keeping track of work

### 7.1 Task model

```sql
tasks(id, title, kind /* manual | agent | system */, status /* todo | doing | blocked | done | dismissed */,
      assignee_user_id, created_by_kind, created_by_id, campaign_id, candidate_id, client_id,
      due_at, priority, dedupe_key unique, action jsonb /* what "Hand to agent" or the primary button does */,
      source_run_id, resolved_by /* user | rule */, resolved_at, created_at, updated_at)
```

- **Manual**: typed on Home or in a campaign.
- **Agent / system** tasks come from rules, each with a `dedupe_key` so the same situation never creates two tasks, and **close themselves** when the condition clears:

| Rule | Task text | Closes when |
|---|---|---|
| Reply logged and unanswered ≥ 1 day | "Reply to Rohan Mehta (Senior Backend)" | a reply is sent or the stage changes |
| Sent ≥ 4 days, nothing logged | "Any reply from 5 people in Senior Backend?" (one tap: Replied / Follow up / No reply) | answered |
| Approval needed (outreach, spec, campaign request) | "Approve 6 messages for Senior Backend" | approved or rejected |
| Interview ≥ 5 days without feedback | "Ask Neha for feedback on Asha" | feedback note or stage change |
| Offer unsent / offer out ≥ 3 days | "Follow up on Asha's offer" | hired / passed |
| Form response flagged or unmatched | "Review 3 new applicants" | added or dismissed |
| Watch paused (review backlog) | "Review 8 people from the sourcing watch" | backlog cleared |
| Join request | "Approve Riya's request to join" | decided |
| Connection expired | "Reconnect Gmail to keep outreach going" | reconnected |

- Home shows **My tasks** (Today, Coming up, Done) from the table; campaign pages show that campaign's tasks. "Hand to agent" starts a run with the task's `action`.

### 7.2 The agent tracks its own work

- Every agent action is a **run** with events (§13, §17 of the architecture doc) and writes **activity** rows with `actor_kind = agent`, so the campaign activity log, the client history and the Agents rail show the same truth.
- Long-lived work is an **agent** row (watch, outreach sequence, screening) with state, counters and next run; the supervisor updates it.
- A daily **work summary** per campaign (what the agent did, what's waiting on people) is generated from runs + activity, not invented: it powers "catch me up" and the digest.

---

## 8. Connectors

### 8.1 Model

```sql
core.connections(id, scope /* user | org */, user_id, organization_id, provider, account_email, account_name,
                 scopes text[], tokens_enc bytea, status /* connected | expired | failed | revoked */,
                 last_error, last_used_at, connected_at, updated_at)
```

Tokens encrypted with a server-held key (the live `agent_integrations` table already follows this pattern: `refresh_token_enc`, `tokens_enc`; reuse its code if it belongs to us). States map to the console's existing `ConnState`.

| Connector | Scope | Used for | Phase |
|---|---|---|---|
| **Gmail** | user | outreach drafts and sending, reply detection | 1 |
| **Google Sheets** (Drive `drive.file`) | user | export shortlists to a sheet | 1 |
| **Chrome extension** | user | sourcing, contact finding (exists) | live |
| **WhatsApp via Magnifi** | org | outreach on WhatsApp (Magnifi is our own WhatsApp product) | later; email only for now |
| **Google Calendar** | user | interview scheduling (the WhatsApp agent already does this) | 2 |
| **Slack** | org | notifications to a channel | 3 |
| Outlook, Teams, Notion, ATS | – | shown as "later" rows only if they say what they will do (DESIGN.md honesty rule) | later |

### 8.2 Gmail: send-only first (decided 4 Oct 2026)

**Scope: `gmail.send` only.** It is a *sensitive* scope, not a restricted one: production needs Google's OAuth app verification (consent screen, privacy policy, a short demo video) but **no annual security assessment**. Until verification, it runs in testing mode for named test users. Reading mail (reply detection, Gmail drafts) is a later step that would need restricted scopes.

What that means in the product:
- **Drafts live in SuperHyre**, not in Gmail. The agent drafts; the recruiter edits and approves in the outreach review deck.
- **Sending:** after approval, `users.messages.send` from the recruiter's own address, with their Profile signature. Gmail returns the message and thread ids, which we keep, so **follow-ups go in the same thread** (`threadId` + `In-Reply-To` / `References` headers).
- **Pacing:** a per-user daily cap well under Gmail's limit (default 150/day, admin-adjustable), sends spread over working hours, one per user at a time.
- **Replies are logged, not read.** Each sent message row has **Replied / No reply / Bounced** actions; the candidate card and the pipeline have **"Mark as replied"** (optionally pasting the reply, which then feeds memory). After 4 days without a logged reply, one grouped task asks "Any reply from 5 people?". Logging a reply moves the step to *replied* (§9).
- **Bounces and failures:** a send error (invalid address, quota) marks the message failed with the reason and creates a task; we can't see bounce emails without read access, so "Bounced" is also a manual action.
- **Later, without restricted scopes (optional):** add a SuperHyre reply-copy address to `Reply-To` next to the recruiter's, so most replies also reach us. Off by default; it changes what candidates see.
- **Tables:** `outreach_threads(campaign_candidate_id, channel, provider_thread_id, status)`, `outreach_messages(thread_id, direction, provider_message_id, subject, body_text, status: draft|approved|scheduled|sent|failed|replied_logged, sent_at, logged_by, error)`.
- **Token expired** → connection `expired`, task "Reconnect Gmail", approved messages wait.

---

## 9. Candidate states update themselves (with a trail)

Rules run on events in the worker; each move writes `stage_moves` with `actor_kind = agent`, a reason, and an undo window. A recruiter's manual move always wins: rules never move someone the recruiter moved in the last 24 h unless the event is a reply.

| Event | Change | Also |
|---|---|---|
| Outreach sent | shortlisted → **outreach**, step *waiting* | |
| Reply logged (Mark as replied) | step → **replied** | task "Reply to …" |
| Form submitted with all must-haves met | step note "screened" + screening fields filled | task to review |
| Interview scheduled (Calendar, when connected; or logged by hand) | → **interviewing**, step *loop* | |
| Offer recorded | step → **offer** | follow-up task after 3 days |
| Candidate opts out / declines in reply | step note, **no** automatic pass | task to confirm "Pass?" |
| No reply after the sequence ends | stays in outreach | task "No reply from 5 people" |

**Never automatic:** rejecting or passing someone, and hiring. Those always need a person (the UI already promises "Nobody is turned down automatically"). Per-campaign switch: "Let the agent update stages" (on by default).

---

## 10. Forms and exports

### 10.1 Architecture

```sql
forms(id, campaign_id, name, slug, public_key unique, status /* draft | live | closed */, version, settings jsonb, theme, created_by)
form_questions(id, form_id, position, type, title, help, required, options jsonb, knockout, accept jsonb,
               maps_to /* notice_days | current_ctc | expected_ctc | location | years | work_mode | relocate | null */)
form_versions(form_id, version, snapshot jsonb, published_at)      -- responses always point at the version they answered
form_responses(id, form_id, version, answers jsonb, email, linkedin_url, name, submitted_at, duration_s,
               must_have jsonb /* met | missed per question */, flagged,
               person_id, candidate_id, campaign_candidate_id, match /* email | linkedin | created | none */)
```

- **Public endpoint** `POST /forms/{public_key}/responses` (no login): rate limit per IP and per form, honeypot field, Cloudflare Turnstile, size limits, and a confirmation screen. Stores against the live version.
- **Matching:** email → `person_identifiers`; else LinkedIn URL; else a new person through `ingest_person` (source `form`), which also triggers enrichment if LinkedIn was given.
- **Mapped answers** (`maps_to`) write to the candidate (notice, CTC, location, work mode, relocate) and to `campaign_candidates.screening`; they also turn matching verdicts from *unknown* into *met / not met*.

### 10.2 From response to candidate and shortlist

- **Already in the campaign:** linked automatically; the response shows on their profile and in the pipeline.
- **New applicant:** appears under **New applicants** in Responses (badge with count) with must-have results; actions **Add to shortlist**, **Pass**, **Open profile**; bulk select in the table view. Optional campaign setting: "Add applicants who meet every must-have to the shortlist automatically".
- The disabled "Add to pipeline (coming soon)" becomes these real actions.

### 10.3 UI to build (minimal)

- Builder: a small "Saves to: Notice period" picker on questions that can map.
- Responses: the *New applicants* filter and the three actions above; matched / unmatched marker on each response.
- Candidate profile: a "Screening answers" section listing mapped answers with the form and date.
- Share tab: "Send to N" really sends (Gmail) and records who got the link.

### 10.4 Exporting the shortlist (and other tables)

- **Where:** Shortlisted page (selection or all), Pipeline, Candidates, Clients, form responses (exists). One **Export** button with three choices: **CSV**, **Excel**, **Google Sheets**.
- **CSV / Excel** in the browser, reusing `exportTable.ts` and `xlsx.ts` (UTF-8 BOM, formula-injection guard, frozen header). Filename `<campaign>-shortlist-YYYY-MM-DD`.
- **Google Sheets** on the server with the user's Google connection (`drive.file`): creates a new sheet in their Drive, named like the file, with a header row and frozen first row; returns the link. Re-exporting creates a new sheet (no silent overwrite).
- **Columns (shortlist):** Name, Current role, Company, Location, Experience (yrs), Stage, Step, Tier, Must-haves met, Notice (days), Expected CTC, Owner, Source, LinkedIn, Email, Phone, Added on, Last update, Notes. A column picker remembers the last choice per user.
- **Contacts respect visibility:** email and phone appear only where the account can already see them (the credits / `contact_seen` rules); otherwise the cell says "Locked".
- **Audit:** every export writes an `exports` row (who, what, how many rows, format). Admins see exports in Usage.

---

## 11. Overviews: where every number comes from

All overview numbers come from two RPCs, cached in Redis for active campaigns (60 s) and invalidated on `stage_moves`, so the console never computes metrics from fixtures.

**`campaign_overview(campaign_id)`**

| Metric | Definition |
|---|---|
| Found this week (+ vs last) | `campaign_seen` rows first seen in the last 7 days vs the 7 before |
| Kept for the shortlist | campaign_candidates that reached *shortlisted* |
| Funnel | count reaching each stage (`stage_moves`), step % = next ÷ previous |
| Replied % | candidates with step *replied* ÷ candidates who reached *outreach* |
| Hired / target | stage *hired* ÷ `campaigns.target` |
| Sourced per day (14 d) | `campaign_seen` grouped by day |
| Needs you | open tasks for this campaign, grouped |
| Your work (recruiter) | `stage_moves` and calls and outreach by this user, this week vs last |
| Activity | `activity` for the campaign, newest first |

**`home_overview(scope, days)`**: the same definitions across the user's visible campaigns, plus tasks due and agent work.

A nightly `campaign_daily_stats` roll-up (counts per day per campaign) keeps 14-day and weekly numbers cheap as data grows.

---

## 12. News section: placeholder

The Insights card shows a **placeholder illustration** (see `illustrations-and-assets.md`) and one honest line: *"Market news for your clients and roles will appear here."* The fixture news, carousel and "did you know" facts are removed until a real source is connected (DESIGN.md: no invented content).

---

## 13. Agent checks in before sourcing; creates campaigns and clients

1. A sourcing request always needs a campaign. The orchestrator resolves it (named → referenced → focus; `agent-architecture.md` §17.3).
2. **Not sure which?** Card: **"Which campaign is this for?"** with the user's open campaigns and **New campaign**.
3. **New campaign** → the existing guided flow (role, client, team, work mode, city, openings, CTC, must-haves, agents) with answers pre-filled from the message and JD; it **asks only what's missing**.
   - **Client:** matched by name or website domain against `clients`; if nothing matches, **"Add Acme Fintech as a client?"** with the fields already known (name, website, industry) → created in the same step.
   - Recruiters can't create campaigns: the card becomes "Ask an admin to set this up" → a task for admins with the drafted campaign attached; one tap to approve.
4. **Confirm before spending:** "Find people for **Senior Backend Engineer** at **Acme Fintech**? First 20 new people, then 10, then 5." → Start.
5. Skipped when the campaign is explicit in the same message and was used in the last few turns.

---

## 14. Search

Two kinds, kept separate:

**Quick find (⌘K, sidebar search)** finds things already in the workspace:
- Kinds: campaigns, candidates, clients, forms, conversations, tasks, settings pages.
- One RPC `search_workspace(q, kinds?, limit)` over tenant tables with `pg_trgm` similarity + full-text (`search_tsv` columns, maintained by triggers), ranked per kind, respecting visibility (recruiters see only their campaigns; Clients absent for them).
- Debounced input (120 ms), results grouped by kind, recent items when empty, keyboard navigation. Target under 150 ms.
- A last row **"Ask the agent: …"** hands the query to the chat for anything that isn't a lookup.

**Candidate search (Candidates page and sourcing)**: filters + text + meaning over `mother_data.people` and the org's candidates (`agent-architecture.md` §7.4); "Find new people" goes through sourcing with the campaign check (§13).

Both are measured: zero-result queries are logged (no personal data) to improve ranking.

---

## 15. Changes by layer

**`core` (shared)**
- `caller_scope()`; `set_active_workspace`, onboarding RPCs (`onboarding_state`, `create_organisation`, `join_organisation`), `approve_join_request`, `reject_join_request`, `invite_member`, `accept_invite`, `set_member_role`, `remove_member`, `transfer_ownership`.
- New: `invites`, `connections`, `runs`, `run_events`, `usage_daily`, `schema_versions`, `personal_allowlist`; `organizations` gains `logo_url`. `is_email_allowlisted()` reads `personal_allowlist`.
- `lookup_record` / `lookup_callback` resolve the account through `caller_scope`.

**`mother_data` (shared pool)**
- `embedding`, `profile_hash`, `completeness` on people; `person_sources` (pointer + storage key); `crustdata_person_id` identifier type (architecture doc §9.5, §9.6).

**Tenant template (every org)**
- Tables in §5; `users` writable only by admins (policy + `set_member_role`); stage history; search columns; indexes.
- Backfill for `tenant_superhyre` and `tenant_talentdiary`.

**`personal` schema (every user)**
- Same template + `owner_user_id` + owner-only RLS; `public.individual_*` migrated later; onboarding no longer deletes personal data.

**Live tables we don't own**
- `public.agent_*` belong to **Magnifi**, our WhatsApp product (decided 4 Oct 2026: ignore for now). SuperHyre does not read or write them; WhatsApp outreach waits. `core.sourcing_runs` / `sourcing_candidates` also stay untouched; our sourcing ledger (`agent-architecture.md` §16) is separate.

---

## 16. Build order (fits Phase 1–4 of `agent-architecture.md` §19)

1. Versioned migrations, `caller_scope`, personal schema, onboarding RPCs and screens, Settings (Profile, Members, Organisation).
2. Tenant tables (§5), commands for campaigns / clients / stages, overview RPCs, quick find; console moves from fixtures to data page by page.
3. Tasks and notifications; Forms backend + public endpoint + applicant actions; shortlist export (CSV / Excel, then Sheets).
4. Gmail connector (send-only), outreach threads, reply logging, automatic stage updates.
5. Agent check-in and chat creation of campaigns and clients on the real tables; later: Calendar, Gmail read access, WhatsApp via Magnifi, Slack.

---

## 17. Decisions (4 Oct 2026)

| Question | Decision | Why |
|---|---|---|
| Free-email users | Blocked, except selected personal accounts in `core.personal_allowlist` | Keeps SuperHyre for teams while allowing chosen individuals |
| Same-domain join | Admin approval required | Agencies control who sees client and candidate data |
| `public.agent_*` | Magnifi's tables; ignore for now; email-only outreach | Separate product; no coupling yet |
| Gmail | Send-only (`gmail.send`); replies logged by hand | Sensitive scope only: verification without a yearly security assessment |
| Organisations per user | **One organisation in v1, plus the personal workspace**; the membership table already allows more | Clients are modelled inside an agency's org, so agency staff need one org; multi-org is additive later with no data migration |
