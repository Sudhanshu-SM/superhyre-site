# CRM / ATS integration plan

Status: proposal. Nothing here is built on the backend yet. The frontend now has
the per-campaign pipeline (board and table), forms, calls and shortlist that
this plan connects to; all of it runs on fixture data today.

## 1. How CRMs and ATSs work (the shared model)

Every recruiting CRM or ATS is built from the same parts:

| Concept | What it is | SuperHyre today |
|---|---|---|
| Candidate | The person | `candidates` (tenant schema), `mother_data.people` |
| Job / requisition | The opening | a campaign (no `campaigns` table yet) |
| Application | One candidate in one job, with a stage | none (fixture: `campaign.ts` pipeline) |
| Stage | Where the application is: Sourced, Screen, Interview, Offer, Hired, Rejected | fixture stages |
| Activity | Email, call, note, form response | `calls`, `call_queue`, `extension_captures` |
| Task | A reminder tied to a person or stage | fixture `TASKS` |
| Scorecard / feedback | Interviewer's structured verdict | none |
| Offer | Terms plus approvals | none (leave to the ATS) |

Workflows are **trigger, condition, action** rules on top of that model:

- *When* an application enters Interview, *if* the job is Engineering, *then*
  send the scheduling link, create scorecards, notify the hiring manager.
- Time based: no reply in 3 days sends a follow-up; 5+ days in a stage flags
  "could use a nudge" (already shown on the board).
- Sequences: email day 0, WhatsApp day 3, LinkedIn day 6, stop on reply.

They connect to other systems through an API plus **webhooks** (events pushed
out when something happens).

## 2. What SuperHyre owns, and what it hands off

SuperHyre is strongest at the top of the funnel: finding, enriching, reaching
out. Customers usually already run interviews and offers in an ATS
(Greenhouse, Lever, Ashby, Workable) or a CRM (HubSpot, Salesforce, Pipedrive).

- **Own:** candidates, campaigns, the pipeline up to Interviewing, outreach,
  calls, screening forms.
- **Mirror:** Interview, Offer, Hired, Rejected when the customer has an ATS.
- **Hand off:** scorecards, offer approvals, onboarding.

One field, one writer. A person's stage is written by exactly one system per
campaign, set when the campaign is linked. Two writers overwrite each other.

## 3. Backend model needed (tenant schema)

```sql
campaigns(id, name, department, location, owner_id, target_hires, status, created_at)
applications(id, campaign_id, candidate_id, stage, stage_since, owner_id, source, fit, created_at)
application_events(id, application_id, kind, from_stage, to_stage, actor, at, payload jsonb)
forms(id, campaign_id, name, status, questions jsonb, created_at)
form_responses(id, form_id, candidate_id, answers jsonb, flagged bool, took_s, at)
calls.campaign_id              -- add, so Calls can be scoped per campaign
integrations(id, provider, auth_ref, config jsonb, created_by, created_at)  -- secrets in Vault, not here
campaign_links(campaign_id, integration_id, external_job_id, stage_map jsonb, mode)
external_ids(entity, local_id, integration_id, external_id)
sync_outbox(id, integration_id, event, payload jsonb, idempotency_key, attempts, next_at, status)
```

The frontend fixtures map onto these one to one: `PipelinePerson` is an
application joined to its candidate, `Form` and `FormResponse` match the form
tables, `Call` gains `campaign_id`.

## 4. Integration modes, in order

1. **Feeder (first).** On shortlist, and on stage changes we own, push the
   candidate and an application into the linked job. Activity (emails, calls,
   form answers) is written back as notes. Nothing flows in.
2. **Mirror.** The ATS's stage changes come back by webhook and show on the
   board read-only past the handoff stage. The campaign's "1 of 3 hired" ring
   becomes real.
3. **Own pipeline.** For customers without an ATS, our board is the system of
   record, with optional export.

Start with a **generic webhook and CSV export** before any vendor connector: it
works with every tool and needs no vendor choice.

## 5. Connector shape

Each provider is one module implementing:

- `connect()` OAuth or API key, stored per tenant in Supabase Vault.
- `listJobs()` so a campaign can be linked to an external job.
- `listStages(jobId)` for the stage-mapping screen.
- `pushCandidate`, `pushApplication`, `pushNote` (out).
- `handleWebhook(event)` → normalised `stage_changed`, `interview_scheduled`,
  `offer_made`, `hired`, `rejected` (in).

Runs as Supabase Edge Functions:

- outbound worker drains `sync_outbox` with retries and backoff;
- inbound endpoint verifies the provider signature, then writes
  `application_events`;
- a nightly poll reconciles anything a webhook missed.

Every event carries an idempotency key, so replays are no-ops.

## 6. Where it appears in the product

| Place | What |
|---|---|
| Integrations page | Connect a CRM/ATS (same connector pattern as Gmail, WhatsApp, LinkedIn) |
| Campaign header | Chip: "Linked to Greenhouse · job #1234 · synced 2m ago" |
| Campaign settings | Pick the external job, map our stages to theirs, choose the mode |
| Candidates board | Columns past the handoff show the ATS stage, read-only, with its source |
| Person dialog | "Open in Greenhouse", last sync time |
| Contacts | "Already in your ATS" before outreach (dedupe) |
| Agent | Can answer "who moved to onsite in Greenhouse this week" from mirrored events |

## 7. Priorities

1. Backend tables for campaigns, applications, forms, responses; `calls.campaign_id`.
2. Wire the existing frontend to them (replace fixtures one page at a time).
3. Outbound webhook + CSV on shortlist.
4. First native connector, chosen by what the first customers use.
5. Inbound webhooks (mirror mode) and dedupe.

## 8. Risks

- **Personal data.** Scraped and enriched contact details pushed into a
  customer's system: consent, retention and ownership need to be clear in
  `PRIVACY.md` and the customer agreement.
- **Secrets.** Per-tenant tokens in Vault, never in the extension or browser.
- **Drift.** Two systems disagree unless every write is idempotent and each
  field has one owner.
- **Licences.** Calling a vendor's API is fine; embedding AGPL code (Twenty,
  AppFlowy) is not without open-sourcing the result.

## 9. Open questions

- Which CRM/ATS do the first customers use?
- Is SuperHyre the system of record, or a feeder into theirs?
- Are scorecards and interview scheduling in scope for us, or the ATS's job?
