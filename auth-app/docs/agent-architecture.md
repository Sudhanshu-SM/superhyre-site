# SuperHyre agent and backend: architecture plan

A running record of the design discussions, kept so the build follows one plan.
Last updated: 4 Oct 2026 (§15–19: code principles, sourcing over time, chats and orchestration, gateway runtime, implementation plan). Status: agreed direction, not built yet.

**Companion plans:** `platform-plan.md` (workspaces, sign-up, settings, tenant data model, tasks, connectors, forms, exports, overviews, search), `gateway-changes.md` (model runtime), `illustrations-and-assets.md` (illustration system and prompts).

---

## 1. Decisions so far

| Topic | Decision | Why |
|---|---|---|
| Two backends? | **One codebase, two roles**: `api` (normal requests) and `worker` (agent runs). Start as **one instance** with `ROLE=all`; split into `ROLE=api` + `ROLE=worker` when load or reliability needs it. | Two separate services in their own cluster from day one is overkill: service-to-service auth, versioning, two deploys. |
| How do api and worker talk? | **Through the database**, not direct calls. The API writes a job row; the worker claims it (`FOR UPDATE SKIP LOCKED`), works, and writes progress and results back. | Survives crashes and deploys. No networking between services. |
| Live updates to the UI | Supabase Realtime (or SSE) on `run_events`. | The Agents rail and the chat stream from the same events. |
| Database / auth / files | Supabase (Postgres, Auth, Storage). The Chrome extension already uses project `npqajviolhoufuggfobg`, so it should feed the same database. | One source of truth. |
| Who can do what | Enforced in the DB with row-level security, plus checks on the server. Mirrors the UI roles: admin / recruiter (assignee). | A frontend bug can't leak another campaign. |
| LLM | Claude API with tool use / structured output, called from the worker. | Typed, validated output, never free text. |
| Deploy | Containers on one platform (Railway is connected). No Kubernetes. | Simple; scale workers later. |
| Profile details (enrichment) | **Apify** LinkedIn profile scraper actor, called only from the server, behind a `ProfileProvider` interface. Used for the backfill of existing people, for extension saves, and for on-demand enrichment in matching. Crustdata stays for *search* (§7). | Decided 3 Oct 2026. One provider for profile data everywhere; the interface keeps it swappable if the actor or LinkedIn access changes. |
| Agent runtime | **claude-code-gateway** on the Claude subscription (no API key: budget), SuperHyre routes, **Sonnet** for every step (§18) | Decided 4 Oct 2026. Calls are the scarce resource: code first, batched, cached. |
| Sourcing over time | 20 → 10 → 5 → 5 new people per request; nobody shown twice per campaign; keep-sourcing watch with a count or end date (§16) | Decided 4 Oct 2026. |
| Chats | Many chats per user; a chat can span campaigns, a run never does; agents outlive chats (§17) | Decided 4 Oct 2026. |
| Code | Modular monolith by domain, pure core, ports and adapters, minimal comments (§15) | Agreed 4 Oct 2026. |

---

## 2. The three building blocks

### 2.1 Skills: each kind of agent work, described the same way

Sourcing, outreach, screening, form builder, client intake, reporting, call summary: each is one `defineSkill(...)`.

```ts
// packages/agent/skills/sourcing.ts
export const sourcing = defineSkill({
  id: "sourcing",
  label: "Find candidates",
  permission: "assignee",                 // "admin" | "assignee" | "anyone"
  match: ["source", "find people", "search for"],   // keyword hint; LLM classifier is the fallback
  inputs: z.object({
    campaignId: z.string(),
    role: z.string(),
    mustHaves: z.array(z.string()).min(1),
    location: z.string().optional(),
  }),
  ask: {                                  // how to ask for each missing input
    campaignId: { kind: "choice", source: "campaigns", allowNew: true },
    mustHaves:  { kind: "text", prompt: "Which 1 or 2 skills are non-negotiable?" },
  },
  steps: ["plan_search", "search", "enrich", "rank", "shortlist"],
  tools: ["linkedin.search", "enrich.contact", "rank.fit"],
  produces: ["candidate_list@1", "search_summary@1"],
});
```

If an input is missing, the runtime **asks for it**, using the `ask` hint to pick the UI: option cards, a text box or a campaign picker. That is the same behaviour as the form flow and the "Which campaign?" question in the prototype.

### 2.2 Runs: every request is a stored run

```sql
create table runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, user_id uuid not null,
  skill text not null, campaign_id uuid,
  status text not null check (status in
    ('waiting_for_input','running','waiting_for_approval','done','failed','cancelled')),
  inputs jsonb not null default '{}',
  step int not null default 0,              -- checkpoint, so a restart resumes
  created_at timestamptz default now()
);

create table run_events (
  run_id uuid references runs(id) on delete cascade,
  seq int not null,
  at timestamptz default now(),
  type text not null,                       -- see 2.3
  payload jsonb not null,
  primary key (run_id, seq)
);
```

### 2.3 Events: the only way the agent talks to the UI

```ts
type AgentEvent = { runId: string; seq: number; at: string; type: EventType; payload: unknown };

type EventType =
  | "message"   // plain text reply
  | "question"  // missing input or clarification -> option cards / text / picker
  | "progress"  // step started or finished, with counts -> "Step 3 of 4, 1,389 profiles read"
  | "artifact"  // a result object -> candidate list, form draft, client card, report
  | "approval"  // something with real-world effects -> "Send 24 emails? Review / Approve"
  | "result"    // what a command changed, with Undo
  | "notice"    // non-blocking heads-up -> "3 had no email, skipped"
  | "error"     // failed step, with Retry
  | "done";     // final summary and follow-up suggestions
```

The user's answers to `question` and `approval` go back in as events on the same run, so a whole run can be replayed and audited. The Activity log is built from these events.

---

## 3. Handling what the model replies

**Rule: the model never hands us free text to parse.** Every reply is a validated **artifact** (to show) or a validated **command** (to do). Prose only goes in `message`.

1. **Structured output only.** One Zod schema per artifact or command, shared by the backend and the console.
2. **Validate, then repair.** If validation fails, send the errors back and ask for a fix, at most twice. If it still fails, fall back to `message` plus `notice`.
3. **The model proposes, the server decides.** The model never invents IDs, counts or stage names. It returns references; the server resolves them against the DB.
4. **Every artifact has `kind` and `version`**, so old runs still render after schemas change.

### 3.1 Example artifact: `candidate_list@1`

```ts
export const CandidateList = z.object({
  kind: z.literal("candidate_list"), version: z.literal(1),
  campaignId: z.string(),
  query: z.object({ role: z.string(), mustHaves: z.array(z.string()), location: z.string().optional() }),
  items: z.array(z.object({
    ref: z.object({ linkedinUrl: z.string().url().optional(), email: z.string().email().optional(),
                    name: z.string(), company: z.string() }),
    title: z.string(), company: z.string(), location: z.string().optional(), years: z.number().optional(),
    fit: z.object({
      score: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      reasons: z.array(z.object({ mustHave: z.string(), met: z.boolean(), evidence: z.string() })),
    }),
    source: z.enum(["agent_search", "extension", "referral"]),
    sourceUrl: z.string().url().optional(),
  })),
  stats: z.object({ scanned: z.number(), matched: z.number(),
                    skipped: z.array(z.object({ reason: z.string(), n: z.number() })) }),
});
```

What the server does with it:
1. Matches each `ref` to an existing person: LinkedIn URL, then email, then name + company. It creates or updates the person and uses our own IDs.
2. Drops people already on the campaign or already passed, and emits a `notice` with how many and why.
3. Saves the artifact with the resolved IDs, then emits it.

### 3.2 One registry: data to every surface

```ts
registry["candidate_list@1"] = {
  schema: CandidateList,
  chat: CandidateListCard,                  // compact card in the conversation
  page: ShortlistTable,                     // full view
  activity: (a) => `Agent found ${a.items.length} people`,
  actions: ["shortlist_candidates", "reach_out", "pass"],
};
```

### 3.3 Something no specific UI covers

Generic kinds the agent can always use, each with one well-designed renderer:

| kind | Use |
|---|---|
| `table@1` | columns + rows (typed cells: text, number, person, date, link) |
| `list@1` | items with title, subtitle, optional link to a person, campaign or client |
| `key_value@1` | facts about one thing |
| `chart@1` | small bar, line or funnel spec |
| `document@1` | limited markdown (headings, lists, bold), e.g. a JD draft or an email |
| `comparison@1` | 2 to 4 entities side by side |

We log which generic answers come up often and promote the frequent ones to first-class kinds.

### 3.4 What is built: lookup cards (5 Oct 2026)

Every read tool the model calls also puts a card in front of the recruiter, as an `artifact` event on the chat run
(`server/src/modules/agent/cards.ts`; built in the tools, validated, never passing through the model):

| tool | card |
|---|---|
| `list_campaigns`, and "what campaigns do I have" (answered in code, no model turn) | `campaigns`: the open campaigns, each a link |
| `campaign_overview` | `campaign`: stage counts, spec, sourcing, watches, links to its pages |
| `campaign_matches`, `pipeline`, `find_candidates` | `people`: rows with fit or stage, the judge's strength, a profile sheet, and Shortlist / Not a fit for sourced people |

A card's `key` names what it is about, so asking again replaces it. A sourcing search's own `candidate_list` artifact
and an approval's people use the same rows, and a name opens the profile sheet (`GET /campaigns/:id/matches/:personId`
for a sourced person, the candidate row for someone on the board). The prompt tells the model the card carries the
detail, so its words say only what stands out. Console: `ChatCards.tsx`, `LiveProfile.tsx`, `chatCards.ts`.

### 3.5 Views: the console's own components, in the chat (6 Oct 2026)

When a request is for one of the console's views (a search, outreach, the agents, a report, a comparison, a form, adding a
client, and so on) the chat draws that view from live data instead of describing it. Sixteen kinds, one list on each side
(`packages/shared/src/views.ts`, `auth-app/src/chatViews.ts`): sourcing, outreach, status, assign, report, compare,
schedule, leak, rediscover, intake, digest, campaign, form, form-status, client, campaign-new.

- **Who picks the view.** Short plain requests are routed in code (`classifyBrief`, no model turn, a one-line lead from
  `viewLead`); everything else the model routes with the `show_view` tool. Both emit one `artifact` run event
  `{kind: "view", view, campaignId, candidateIds, personIds, query}`, so a reopened chat replays it.
- **Who draws it.** `ChatCards` -> `liveViews/index.tsx` -> one lazy file per view (`liveViews/<View>.tsx`), each reusing the
  demo's components (`Staged`, `Stages`, `AgentsOverview`, `CampaignReport`, `CompareDialog`, `ClientMoments`, `Outreach`, ...)
  with live data injected (the fixtures stay the default, so the demo still runs). A view fetches its own data from the API.
- **The context.** Views get the same `MomentCtx` the demo's replies always had (`said`, `verdicts`, `openProfile`,
  `openList`, `seed`, `onGrow`, `campaign`, ...), implemented by the live page: verdicts are API calls, profiles open the
  `ProfileSidebar`, the ranked list opens `RankedMatches`, both fed from a store of the people in view
  (`liveCandidates.ts`, adapters in `liveCandidate.ts`).
- **Asking first.** Missing campaign or people: the console's `Clarified` tiles, with live options (`liveViews/ask.ts`).

---

## 4. Actions ("shortlist these 3", "create a form")

Commands are a separate registry. **A command runs through the same API as the UI button**, so the agent can never do something a person couldn't.

```ts
export const shortlistCandidates = defineCommand({
  id: "shortlist_candidates",
  input: z.object({ campaignId: z.string(), personIds: z.array(z.string()).min(1) }),
  permission: "assignee",
  effect: "internal",                       // "read" | "internal" | "external" | "destructive"
  idempotencyKey: (i) => `${i.campaignId}:${[...i.personIds].sort().join(",")}`,
  preview: async (i, db) => ({ adds: await db.people.byIds(i.personIds) }),
  run: async (i, api) => api.pipeline.move(i.campaignId, i.personIds, "shortlisted"),
  undo: async (i, api, before) => api.pipeline.restore(i.campaignId, before),
});
```

Flow for "shortlist these 3":
1. **Resolve "these 3".** Each conversation keeps a **context** of what is on screen (the last artifact, its item IDs in order, the rows the user selected). The model must pass IDs from that context. If it's ambiguous, it emits a `question` instead of guessing.
2. **Check permission** on the server.
3. **Apply the effect policy:**
   - `internal` (shortlist, move stage, draft form, note): do it, then a `result` with **Undo**.
   - `external` (send email or WhatsApp, book a call, share a form): `approval` with a preview first.
   - `destructive` (delete contacts, close a campaign): admin only, explicit confirm.
4. **Log it** to Activity, e.g. "Agent shortlisted Meera, Aditya and Kunal for Punith".

Multi-step asks ("find 20 and email the top 5") become a chain of commands; the agent pauses at each `external` step for approval.

---

## 5. The worker loop (single instance, `ROLE=all`)

```ts
// server/main.ts
const role = process.env.ROLE ?? "all";
if (role === "api" || role === "all") startApi();      // Fastify/Hono routes for the console
if (role === "worker" || role === "all") startWorker({ concurrency: 4 });

// server/worker.ts
async function startWorker({ concurrency }) {
  for (let i = 0; i < concurrency; i++) loop();
  async function loop() {
    while (true) {
      const run = await claimNextRun();     // UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1)
      if (!run) { await sleep(500); continue; }
      try { await runSkill(run); } catch (e) { await fail(run, e); }
    }
  }
}

// server/runtime.ts
async function runSkill(run: Run) {
  const skill = skills[run.skill];
  const missing = skill.missingInputs(run.inputs);
  if (missing) return ask(run, missing);                // emits "question", status -> waiting_for_input
  for (let i = run.step; i < skill.steps.length; i++) {
    await emit(run, "progress", { step: i + 1, of: skill.steps.length, label: skill.steps[i] });
    const out = await skill.step(skill.steps[i], run);   // tool calls + LLM, validated
    if (out?.artifact) await emit(run, "artifact", await resolve(out.artifact));
    await checkpoint(run, i + 1);                        // a restart resumes here
  }
  await finish(run);                                     // emits "done"
}
```

---

## 6. Build order

1. Shared types package: events, artifact kinds, `defineSkill`, `defineCommand`.
2. DB tables (`runs`, `run_events`, domain tables) + RLS for admin / assignee.
3. Runtime: job loop, slot-filling to `question`, validate-and-repair, checkpointing.
4. Console: render chat and Agents rail from events (convert today's "moments").
5. First two skills end to end: **sourcing** and **form builder**.
6. Commands: shortlist, move stage, create form, then the external ones with approvals (outreach).
7. Remaining skills: screening, client intake, reporting, call summary and transcripts.

Data work that runs alongside (§9.6): run the one-off Apify backfill for the existing people; build the server `enrich` job (Apify) and call it from extension saves and manual / CSV adds; `core.ingest_person` writes skills and experience.

---

## 7. Sourcing: filters, our own database first, then Crustdata

Sourcing is the most important job. A request carries **free text + structured filters** (the same filter categories as the prototype's Filters dialog in `src/filters.ts`: role, seniority, location and work mode, skills, companies, experience, and so on).

### 7.1 Decisions

| Topic | Decision | Why |
|---|---|---|
| Vector search | **Start with `pgvector` inside the same Supabase Postgres**, using an HNSW index. Add a separate vector DB (e.g. Qdrant, already used in another project) only past roughly 5–10M profiles, or if search load starts hurting the main DB. | One database, filters and vectors in one query, no sync job between two stores. pgvector handles a few million rows comfortably. |
| Search style | **Hybrid**: hard filters in SQL `WHERE`, plus keyword match (Postgres full-text) and semantic match (vectors), merged with reciprocal-rank fusion, then an LLM/reranker pass on the top ~100. | Filters must be exact; meaning ("scaled payments systems") needs vectors; names and skills need keywords. |
| Order of sources | **Our DB first. Call Crustdata only if we don't have enough good matches**, then store and embed everything Crustdata returns. | Saves credits; our pool gets better every search. |
| Load on the main DB | Embedding and indexing run in the **worker**; read replicas or a separate vector DB later if needed. | Keeps API reads fast. |

### 7.2 The request

```ts
export const SourcingInput = z.object({
  campaignId: z.string(),
  brief: z.string(),                            // free text: "senior backend, scaled payments, Go or Java"
  filters: z.object({                           // hard constraints, from the Filters UI or parsed from the brief
    titles: z.array(z.string()).default([]),
    pastTitles: z.boolean().default(false),
    seniority: z.array(z.string()).default([]),
    cities: z.array(z.string()).default([]),
    workMode: z.array(z.enum(["Onsite", "Hybrid", "Remote"])).default([]),
    skillsAll: z.array(z.string()).default([]), // must have every one
    skillsAny: z.array(z.string()).default([]), // nice to have
    companies: z.array(z.string()).default([]),
    excludeCompanies: z.array(z.string()).default([]),
    yearsMin: z.number().optional(), yearsMax: z.number().optional(),
  }),
  want: z.number().default(50),                 // how many good matches we're after
});
```

### 7.3 Tables

```sql
create extension if not exists vector;

create table profiles (                          -- one row per real person, shared across campaigns
  id uuid primary key default gen_random_uuid(),
  linkedin_url text unique, full_name text, headline text,
  title text, company text, city text, seniority text,
  years numeric, skills text[], summary text,
  source text,                                   -- crustdata | extension | upload
  raw jsonb,                                     -- the provider's full payload, for re-processing
  fetched_at timestamptz,                        -- when we last refreshed from Crustdata
  search tsvector generated always as (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(headline,'') || ' ' ||
                coalesce(summary,'') || ' ' || array_to_string(skills,' '))) stored,
  embedding vector(1024)                         -- one vector per profile
);
create index on profiles using hnsw (embedding vector_cosine_ops);
create index on profiles using gin (search);
create index on profiles using gin (skills);
create index on profiles (city, seniority);
```

### 7.4 The pipeline (steps of the `sourcing` skill)

```ts
steps: ["understand", "search_ours", "search_crustdata", "merge", "enrich", "rank", "shortlist"]
```

1. **understand**: the LLM turns the brief into extra filters (only when the user didn't set them) plus a clean "meaning" sentence to embed. Output is a validated `SourcingPlan`.
2. **search_ours**: one hybrid SQL query.

```sql
-- $1 = query embedding, $2 = keyword query, filters bound as params
with filtered as (
  select id, embedding, search from profiles
  where ($cities is null or city = any($cities))
    and ($seniority is null or seniority = any($seniority))
    and (skills @> $skillsAll)                       -- has every must-have skill
    and not (company = any($excludeCompanies))
),
sem as (select id, row_number() over (order by embedding <=> $1) r from filtered order by embedding <=> $1 limit 200),
kw  as (select id, row_number() over (order by ts_rank(search, websearch_to_tsquery($2)) desc) r
        from filtered where search @@ websearch_to_tsquery($2) limit 200)
select id, coalesce(1.0/(60+sem.r),0) + coalesce(1.0/(60+kw.r),0) as score   -- reciprocal-rank fusion
from sem full join kw using (id) order by score desc limit 200;
```

3. **search_crustdata**: only if `search_ours` found fewer than `want` strong matches. Map our filters to Crustdata's people-search filters with `toCrustdataQuery` (section 7.7). Page until we have enough, or hit a credit cap per run (emit a `notice` if we stop early).
4. **merge**: dedupe by LinkedIn URL, then email, then name + company. Upsert into `profiles` (keep `raw`), and queue embeddings for new or changed rows.
5. **enrich**: only for the shortlist candidates: contact details via the existing chain (SalesQL, ContactOut, Apollo), respecting the per-org lookup limits.
6. **rank**: rerank the top ~100 against the brief; produce `fit.reasons` per must-have with evidence quoted from the profile.
7. **shortlist**: emit a `candidate_list@1` artifact; skip anyone already on the campaign or passed, with a `notice`.

### 7.5 Keeping it cheap and fresh

- **Cache Crustdata.** Never refetch a profile fetched in the last N days (`fetched_at`); refresh lazily when it's shortlisted.
- **Embeddings in the worker, in batches.** Re-embed only when the embedded text changes (store a hash).
- **Credit budget per run and per org**, shown in the run's `progress` ("Used 120 of 500 credits").
- **Record why** each profile matched (which filters, the keyword hits, the semantic score), so "why this person" is explainable in the UI.

### 7.6 Not fetching people we already have (dedupe)

**Decision: no Bloom filter for now.** Use stable identity keys, a batched indexed lookup, and Crustdata-side exclusion where the API allows it.

Why not a Bloom filter yet:
- A batched lookup on a unique index (`where crustdata_person_id = any($1)`, 100 IDs per page) takes about a millisecond in Postgres, even at millions of rows. A Bloom filter saves almost nothing there.
- Bloom filters give false positives ("probably have it"). Wrongly skipping a new candidate is the worst outcome for sourcing, so every "maybe" still needs a DB check.
- They can't delete entries. Deleted contacts or a per-org scope mean rebuilds, and every worker instance needs its own copy kept in sync.

What we do instead:
1. **Identity keys** on `profiles`, each unique and indexed: `crustdata_person_id`, a normalised LinkedIn slug (lowercase, no query string or trailing slash), and a hash of each email.
2. **Exclude before paying, if supported.** Send the IDs we already hold for this campaign or search as a `not_in` filter on `crustdata_person_id` (verify the operator and list-size limit).
3. **Check before enriching.** Per results page, one batched lookup splits the people into *new* (insert, embed, enrich) and *known* (refresh only if `fetched_at` is old). Enrichment is the expensive call, so this is where the saving is.
4. **Per-org view.** "Already in your pipeline" is a join on campaign membership, not a separate store.

When a Bloom filter would be worth it: a very large pool (hundreds of millions of rows), or the **Chrome extension** showing "already in SuperHyre" on LinkedIn pages without a server round trip. In that case ship a small per-org filter to the client, with a server check behind it.

### 7.8 Open questions for sourcing

- Embedding model: hosted (e.g. Voyage or OpenAI) vs self-hosted (BGE-M3, already used offline in another project). This decides the vector size.
- Crustdata plan limits and which endpoints (people search vs enrich) we're on.
- How long we keep `raw` provider payloads (licensing / data-protection).

### 7.7 Crustdata filter mapping

Every filter in the Filters dialog (`src/filters.ts`) goes through one pure function, `toCrustdataQuery(values, opts)` in `src/search/crustdata.ts`. It returns four things, all zod-typed so the worker imports it unchanged:

| Output | What it holds | Who applies it |
|---|---|---|
| `body` | The Crustdata request: hard filters, the brief as a search, page size, cursor. | Crustdata |
| `postFilters` | Rules computed from the returned profile, our DB, screening forms or enrichment. | `merge` / `shortlist` steps |
| `rankHints` | Signals that move people up or down but never remove them. | `rank` step |
| `unsupported` | Filters nothing can answer yet, so they are never silently dropped. | Shown as a `notice` |

Sources: [Person Search intro](https://docs.crustdata.com/person-docs/search/introduction), [Person Search reference](https://docs.crustdata.com/person-docs/search/reference), [Semantic search guide](https://docs.crustdata.com/guides/person-semantic-search), [Autocomplete](https://docs.crustdata.com/person-docs/autocomplete/introduction). API version `2025-11-01`. We found no separate "fulltextai" docs; everything below is from docs.crustdata.com.

#### The request

```http
POST https://api.crustdata.com/person/search
Authorization: Bearer <key>
Content-Type: application/json
x-api-version: 2025-11-01
```

```jsonc
{
  "filters": {                                  // one condition, or a group
    "op": "and",                                // "and" | "or", nest freely
    "conditions": [
      { "field": "experience.employment_details.current.title", "type": "(.)", "value": "Backend Engineer" },
      { "field": "professional_network.location.raw", "type": "geo_distance",
        "value": { "location": "Pune", "distance": 25, "unit": "km" } },
      { "field": "years_of_experience_raw", "type": "=>", "value": 6 },
      { "field": "skills.professional_network_skills", "type": "has_all", "value": ["Go", "Kafka"] }
    ]
  },
  "search": { "query": "scaled payments systems", "mode": "hybrid" },  // optional: the brief
  "mode": "exact",                              // our filters stay hard; the query only ranks
  "limit": 100,
  "cursor": "<next_cursor from the last page>",
  "post_processing": { "exclude_profiles": ["<linkedin url we already contacted>"] }
}
```

Response: `{ profiles: [...], next_cursor, total_count }`. Page with `cursor` until `next_cursor` is null, we have `want` good matches, or the run's credit cap is hit. Cost is 0.03 credits per result plus premium-field surcharges.

**Operators.** `=` `!=` (whole value), `in` `not_in` (whole value in a list), `>` `<` `=>` `=<` (numbers and ISO dates; note `=>` and `=<`, not `>=`), `is_null` `is_not_null`, `has_all` (an array has every listed value), `(.)` (all words, any order, case-insensitive), `[.]` (exact phrase, case-insensitive), `(!)` (excludes a substring), `geo_distance` and `geo_exclude` (`{ location | lat_lng, distance, unit }`, default km). There is no `between`: a range is `=>` plus `=<`. There is no `contains`: use `(.)` or `[.]`.

**Nested arrays.** Conditions on `experience.employment_details.*` inside one `and` group must match the **same job**. That is what we want for "current title X at current company Y". Cross-job matching needs an `all_of` group.

#### The mapping

Kind: **direct** = a Crustdata field and operator; **derived** = computed by us from Crustdata data; **own** = our DB, screening forms or enrichment; **unsupported** = nothing answers it yet. `E` below is `experience.employment_details`.

| Category | Filter (id) | Kind | Crustdata field and operator, or where it comes from |
|---|---|---|---|
| Role | Job titles (`titles`) | direct | `E.current.title (.)` per title, any of them |
| | Match past titles too (`pastTitles`) | direct | Switches the title field to `E.title` (any job) |
| | Seniority (`seniority`) | direct | `E.current.seniority_level in`. Intern → In Training, Entry level → Entry Level, Senior, Manager → Entry Level Manager + Experienced Manager, Director, VP → Vice President, C-level → CXO, Founder or partner → Owner / Partner. Staff and Principal have no level; they are Senior plus a title. |
| | Function (`function`) | direct | `E.current.function_category in`, the 12 Crustdata categories (Product → Product Management, Design → Arts and Design, HR → Human Resources, Customer success → Customer Success and Support) |
| | Profile mentions (`keywords`) **new** | direct | Each phrase: `basic_profile.headline (.)` or `basic_profile.summary (.)`; all phrases required |
| Location | Cities (`cities`) | direct | `basic_profile.location.full_location (.)`, with old spellings (Bangalore, Gurgaon, Bombay …) |
| | Within (`radius`) | direct | With a distance: `professional_network.location.raw geo_distance { location: city, distance, unit: "km" }` per city |
| | Countries (`countries`) **new** | direct | `basic_profile.location.country in` (full names) |
| | Time zones (`timezones`) | derived | Narrowed to `basic_profile.location.country in` when no city or country is set; the exact zone (EST vs PST) is checked after from state |
| | Work mode (`workMode`) | own | Screening answer; Crustdata has no remote/onsite preference |
| | Open to relocating (`relocate`) | own | Our DB: people elsewhere who told us they'd move. Crustdata keeps the city filter. |
| Experience | Total experience (`years`) | direct | `years_of_experience_raw =>` / `=<` (an open end is left off) |
| | Time at current company (`currentRole`) | direct | `E.current.years_at_company_raw =>` / `=<`. Crustdata has company tenure, not time in role, so we relabelled it. |
| | Average tenure (`tenure`) | derived | Mean of past jobs' `end_date − start_date` |
| | Changed jobs recently (`recentMove`) | direct | `E.current.start_date =<` or `=>` today minus 182 days |
| Skills | Must have (`must`) | direct | `skills.professional_network_skills has_all` (all) or `in` (any) |
| | Must-haves match (`skillMatch`) | direct | Picks `has_all` or `in` |
| | Exclude (`exclude`) | direct | `skills.professional_network_skills not_in` |
| | Nice to have (`nice`) | derived | Rank hint only |
| | Used in a role (`inRole`) | derived | Must-have appears in a job's `description`; checked after |
| Company | Current company (`current`) | direct | `E.current.company_name in` |
| | Past companies (`past`) | direct | `E.past.company_name in` |
| | Exclude companies (`excludeCo`) | direct | `E.current.company_name not_in` |
| | Company size (`size`) | direct | `E.current.company_headcount_range in`: myself only, 2-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+ |
| | Funding stage (`stage`) | derived | Not on person search. Resolve through Crustdata's company search to company ids, then `E.current.company_id in` |
| | Industry (`industry`) | direct | `E.current.company_industries in`, each option a set of LinkedIn industry names |
| | Product or services (`model`) **new** | direct | Services: `E.current.company_industries in` [IT Services and IT Consulting, Outsourcing and Offshoring Consulting, Business Consulting and Services]; Product: `not_in` the same |
| | Ownership (`type`) | direct | `E.current.company_type in`: Privately Held, Public Company, Nonprofit, Government Agency, Educational. Replaces Product / Services / Startup / MNC / Big Tech, which Crustdata doesn't hold. |
| Education | Degree (`degree`) | direct | `education.schools.degree [.]`, any of a phrase set (Bachelor's → Bachelor, BTech, B.Tech, BE, BSc …) |
| | Field of study (`field`) | direct | `education.schools.field_of_study (.)` |
| | Institution group (`tier`) | direct | `education.schools.school [.]` against a school list per group. `[.]` keeps "Indian Institute of Technology" from matching IIITs. |
| | Schools (`schools`) **new** | direct | `education.schools.school (.)`, with short forms expanded (IIT Bombay → Indian Institute of Technology Bombay) |
| | Graduated (`gradYear`) | derived | No filterable graduation date; checked after on the returned education |
| Compensation | Current CTC (`ctc`), Expected CTC (`expected`), Notice period (`notice`) | own | Screening forms and our DB only |
| Availability | Open to work (`openToWork`) | direct | `professional_network.open_to_cards in ["CAREER_INTEREST"]` or `dev_platform_profiles.is_hireable = true` |
| | Likely to move (`likelihood`) | derived | Rank hint from tenure, `recently_changed_jobs` and profile edits |
| | Profile updated (`active`) | direct | `basic_profile.last_updated =>` today minus 7, 30 or 90 days. Was "Last active", which no source can tell us. |
| Signals | Has public code (`github`) | direct | `dev_platform_profiles.public_repo_count => 1` |
| | Pushed code in the last 90 days (`ghActive`) | direct | `dev_platform_profiles.repos.github_pushed_at =>` today minus 90 days |
| | Writes code in (`ghLanguages`) **new** | direct | `dev_platform_profiles.all_languages in` |
| | Stars on their repositories (`ghStars`) **new** | direct | `dev_platform_profiles.total_stars => 10 / 100 / 1000` |
| | Open-source contributor (`oss`) | derived | Needs merged PRs in repos they don't own: GitHub API in the enrich step |
| | Promoted in current company (`promoted`) | derived | Two or more titles under the same current `company_id` |
| | Wrote or spoke publicly (`talks`) | unsupported | No field. Ranked from headline, summary and `honors.title`; reported as a notice |
| | Certifications (`certs`) | direct | `certifications.issuing_organization (.)` (AWS, Google Cloud) or `certifications.name (.)`/`[.]` (Azure, CKA, CKAD, Terraform, PMP) |
| Languages | Speaks (`spoken`) | direct | `basic_profile.languages in` |
| Inclusion | Career returners (`returners`) | derived | Ranker skips the employment-gap penalty |
| | Non-traditional backgrounds (`nonTraditional`) | derived | Education filters become rank hints instead of hard filters |
| Exclusions | Already contacted, In another campaign, Rejected before | own | Our DB. Known profile URLs also go in `post_processing.exclude_profiles` so we don't pay for them. |
| | Only with contact details (`contact`) | own | Enrichment chain. Choosing email also ranks up `business_email_verified`. |
| (always) | Likely fake profiles | direct | `assessment.authenticity.verdict not_in [probably_fabricated, clearly_fabricated]`, on unless `excludeFabricated: false` |

#### Crustdata fields we chose not to expose (yet)

| Field | Decision |
|---|---|
| `normalized_title.department` / `sub_department` | Later. Function already covers the broad split; the department vocabulary isn't documented. Pull it from autocomplete first. |
| `location.state` | No. Cities and countries cover Indian searches; states only matter for US time zones, which the post-filter handles. |
| `employment_type` | Later, as "Leave out freelancers and contractors", once we see the free-text values. |
| `company_headquarters_country` | Later, for "worked at a US company". Uses ISO alpha-3 codes, unlike person location. |
| `dev_platform_profiles.all_topics` | No. Too noisy for a recruiter; languages carry the signal. |
| `professional_network.followers` | No. Popularity, not fit. Useful as a sort, not a filter. |
| `business_email_verified` | Used as a rank hint, not a filter, so it never shrinks the pool. |

#### Assumptions to verify

1. **Page size.** The intro says `limit` is 1–100; the reference says 1–1000 (default 20). **We cap at 20 per run** (`MAX_LIMIT`, decided 3 Oct 2026, §10.7).
2. **`has_all` and `not_in` on plain string arrays** (`skills.professional_network_skills`, `basic_profile.languages`): documented with nested company ids; we assume they mean "every value present" and "no value present".
3. **Skill names are exact and case-sensitive** for `in` / `has_all`. Normalise through autocomplete (`skills.professional_network_skills`) before sending.
4. **Vocabularies the docs don't list**: `company_type` values (we use LinkedIn's), `company_industries` names (LinkedIn's 2022 list), degree wording. Check each with `/person/search/autocomplete`.
5. **Company names with `in`** are whole-value matches, so "Razorpay" may miss "Razorpay Software Pvt Ltd". Better: resolve names to `company_id` through autocomplete or company search.
6. **`basic_profile.last_updated`** accepts a date (not only a datetime) with `=>`.
7. **`geo_distance` on `professional_network.location.raw`** is the field to use; it is the only one shown with geo in the docs.
8. **`not_in` on `assessment.authenticity.verdict`** keeps profiles that have no verdict.
9. **`all_of` group syntax** (for cross-job matching) is mentioned but not shown; we don't use it yet.
10. **Education response** includes years, for the graduation post-filter; otherwise the Apify profile fetch (§9.6) supplies them.
11. **Funding stage** needs Crustdata's company search (a separate plan and credits).


## 8. Open questions

- API framework (Hono vs Fastify) and where the code lives (new `server/` package vs a separate repo).
- ~~Which providers back search / profile data~~ Decided: Crustdata for search (§7), Apify for profile details (§9.6), the extension's SalesQL → ContactOut → Apollo chain for contacts.
- Which Apify actor (compare 2–3 on `--limit 5`).
- Outreach sending: our own email/WhatsApp integrations or a provider.
- Data retention for recordings and transcripts.

---

## 9. Fit with the existing database (reviewed 3 Oct 2026)

Source reviewed: `Superhyre-Extension/supabase/00–07*.sql` on branch `feat/one-click-find` (local files only; the live project was not queried). Per the extension notes, `main` lags production, so confirm the live schema matches before migrating.

### 9.1 What exists today

| Schema | What it holds |
|---|---|
| `auth` | Supabase users. |
| `core` | Orgs, members, tenant routing (`tenant_schemas`, `caller_tenant()`), providers, lookup limits / credits, `reveal_events`. |
| `mother_data` | **Global person and company graph** shared by every tenant: `people`, `person_identifiers`, `person_experiences`, `person_skills`, `companies`, `company_identifiers`, `skills`. |
| `tenant_<slug>` (one per org) | `users` (role owner / admin / recruiter), `candidates` (one row per person per org, with a single `stage`), `candidate_identifiers`, `candidate_experiences`, `candidate_skills`, `extension_captures`, `call_queue`, `calls` (recording + `transcript_segments`), `upload_sessions`. |
| `public` | Solo users: `user_profiles`, `individual_candidates`. |

Access goes through `SECURITY DEFINER` functions that resolve the caller's tenant themselves (`05_console.sql`, `04_extension.sql`); only `public` is exposed to PostgREST.

### 9.2 What already matches the plan

- **Dedupe is already designed.** `mother_data.person_identifiers` has `unique(identifier_type, normalized_value)` and every ingestion path checks it first. This replaces the `profiles` table and unique keys proposed in 7.3 and 7.6: add `identifier_type = 'crustdata_person_id'` and reuse it. No Bloom filter needed.
- **One global pool + per-org working copy** is exactly "search our DB first": the pool is `mother_data`, and the org's view is `tenant_x.candidates`.
- **Roles** (`owner` / `admin` / `recruiter`) match the console's admin / recruiter split; segregation is already enforced in the DB functions.
- **Calls** already store the recording location and timestamped transcript segments, which matches the Calls page.

### 9.3 Three ways candidates arrive, one door in

Extension (save / reveal), agent sourcing (Crustdata) and manual (form, LinkedIn URLs, CSV) must all call **one upsert**: resolve identifiers in `person_identifiers`, then create or update `mother_data.people` (+ experiences / skills), then attach to the org's `candidates`, and optionally to a campaign. The extension already does this in `public.extension_save`; generalise it into `core.ingest_person(payload, source)` and make `extension_save` call it.

**LinkedIn is recommended, not required** (decided 3 Oct 2026). `mother_data.people.linkedin_url` is already nullable. Only the extension paths (`extension_save`, `extension_lookup`, reveals) require it, which is right since they start on a LinkedIn page. `core.ingest_person` must accept a person with only a name + email or phone. When LinkedIn is present it is what lets us fetch skills and experience (Crustdata) and exclude them from Crustdata searches; without it, dedupe falls back to email / phone.

**Live DB check (3 Oct 2026, read-only):** 194 people, all with a clean `https://www.linkedin.com/in/<handle>` identifier; 136 with email, 123 with phone. `person_skills`, `skills` and `person_experiences` exist but are **empty**: the extension saves the person and contacts only. Skills and experience will first be filled by Crustdata ingestion (and manual / CSV adds), so `core.ingest_person` must write them.

### 9.4 Gaps to add (new tenant tables, created by `provision_tenant()` like the others)

| Table | Why |
|---|---|
| `clients`, `client_contacts` | Clients section. |
| `campaigns` (+ setup fields from the New campaign form) and `campaign_members` (assigned recruiters) | Campaigns, assignment, admin-only actions. |
| `campaign_candidates` (campaign_id, candidate_id, **stage**, step, owner, moved_at) and `stage_moves` (history) | Today `candidates.stage` is one stage per person per org. A person can be in several campaigns, so the stage must live per campaign. Keep `candidates.stage` only as a legacy / org-level field. |
| `outreach_messages` | Outreach, replies, "Wrote back". |
| `forms`, `form_questions`, `form_responses` | Forms and responses. |
| `notes`, `activity` (or derive from `run_events` + `stage_moves`) | Activity log. |
| `runs`, `run_events` | Agent framework (section 2). Tenant-scoped, so RLS / definer functions apply the same way. |

### 9.5 Global additions in `mother_data`

- `people.embedding vector(1024)` (pgvector, HNSW index) plus a hash of the embedded text: semantic search over the shared pool. Tenant-private notes never go into the embedded text.
- `person_sources(person_id, source, fetched_at, object_key, payload_hash)`; the raw Crustdata / Apify / provider payload itself lives in Supabase Storage (§12.10), instead of growing `additional_data`. This gives freshness checks ("fetched in the last N days") and re-processing.
- More `person_experiences` fields used by filters: seniority_level, function_category, company headcount / industries at the time.

### 9.6 Profile data: Apify fills every profile (decided 3 Oct 2026)

**The problem (live check, read-only, 3 Oct 2026):** of 194 people, 183 have a headline and 180 a current title, but **0** have summary, years of experience, education, city, skills or experience rows; 9 have a current company. The extension saves name, headline, title and contacts only. Without skills and history a person can't be matched.

**The decision:** a LinkedIn URL is enough. Whenever we have one, the server fetches the full profile from an **Apify LinkedIn profile actor** and writes it through `core.ingest_person`. Crustdata stays for *search* only (§7).

| How a person arrives | What fills their profile |
|---|---|
| Already in the DB (the 194) | **One-off script**, `Superhyre-Extension/scripts/backfill-apify.mjs` (below). Run once, then retired. |
| Extension save | Extension saves what it scraped (instant, free) → server queues an `enrich` job → worker runs the actor → `ingest_person` fills the rest → extension and console update over Realtime. |
| Manual add / CSV with a LinkedIn URL | Same `enrich` job after the row is created. Fields the recruiter typed win over Apify's. |
| Manual add without LinkedIn | Stays as entered (LinkedIn is recommended, not required, §9.3). Skills can still be inferred from title / notes. |
| Crustdata search results | Search payload is ingested; Apify only if the matcher needs more (unknown must-haves among those judged) or the person is shortlisted. |

**Rules**
- **Fill, never overwrite.** Apify fills empty fields; recruiter edits and the extension's newer scrape win. Skills and experience rows are added, deduped the way `extension_save` does it (same title + company = same row).
- **Never pay twice.** Skip anyone enriched in the last 90 days; keep the raw payload (`person_sources`, or the backfill's files on disk) so it can be re-normalised for free.
- **Refresh** only when data is older than ~90 days *and* the person is in an active campaign. Never bulk-refresh the pool.
- **Not found / private** profiles are marked (`additional_data.apify.status = 'not_found'`) and not retried automatically.
- **Server only.** The Apify token is a server secret, never in the extension or the console, same rule as the contact providers (`Superhyre-Extension/CLAUDE.md`).
- **Completeness level** per person, `basic` → `scraped` → `enriched`, so the UI and the matcher know how far to trust a profile. Thin profiles score `unknown`, not `not met` (§10).

**Provider interface** (so the actor can be swapped without touching anything else):

```ts
interface ProfileProvider {
  name: string;                                   // "apify:<actor-id>"
  fetch(urls: string[]): Promise<RawProfile[]>;   // batch; missing URLs simply absent
  normalise(raw: RawProfile): PersonPayload;      // → core.ingest_person shape
}
```

Apify's run-actor API takes a list of URLs; one run per batch (≈25 URLs, or a few seconds' worth of extension saves) to cut per-run overhead. Stored as `person_sources(source = 'apify:<actor>', payload)`; `person_skills.source` / `person_experiences.source = 'Apify'`.

**The one-off backfill script** (`Superhyre-Extension/scripts/backfill-apify.mjs`, written 3 Oct 2026, not yet run):
- Env: `DATABASE_URL`, `APIFY_TOKEN`, `APIFY_ACTOR`, optional `APIFY_URL_FIELD` (default `profileUrls`), `APIFY_INPUT`, `BACKFILL_DIR` (default `~/superhyre-backfill`).
- Picks people with a LinkedIn URL, no experience rows and no earlier Apify attempt (read-only query).
- Calls the actor in batches of 25, saves every raw response to disk; a re-run reuses them.
- Normalises the common actor output shapes (name, About, location, current role, experience with dates, years worked with overlaps counted once, skills, education, certifications, languages).
- Writes a preview JSON and a SQL file. **Nothing is written until** `--apply <file.sql>`, which runs in one transaction. `--limit 5` for a trial, `--from-raw <file>` to re-normalise without calling Apify.
- Verified on a throwaway local Postgres with the real table definitions: fills only empty fields, handles quotes, and a second run adds nothing.

**To confirm on the first runs:** which actor (output fields, price per profile, success rate on Indian profiles), time per batch, and how it reports not-found / private profiles.

**Risk:** scraping LinkedIn is against LinkedIn's terms, and scraper vendors have been shut down before. Hence the `ProfileProvider` boundary, the stored raw payloads, and the extension's own scrape as the fallback.

### 9.7 Things to watch with schema-per-tenant

- **Migrations** must loop over every tenant schema. `provision_tenant()` already uses `add column if not exists`; keep every change idempotent and run it for all rows in `core.tenant_schemas`.
- **The worker** must never take a schema name from user input. It resolves the tenant from the run's `org_id` via `core.tenant_schemas`, the same way `caller_tenant()` does.
- **Realtime** for `run_events` works per table: either one publication entry per tenant schema, or put `runs` / `run_events` in a shared `core` table keyed by `org_id` with RLS. Recommended: shared `core.runs` / `core.run_events`, which is simpler for the worker loop and for Realtime.
- **Scale:** schema-per-tenant is fine for hundreds of orgs; past a few thousand, catalog size and migration time grow. Not a problem now.


---

## 10. JD matching service (proposed 3 Oct 2026)

Semantic vector similarity alone is not matching: it finds people who *sound like* the JD, not people who *meet* it. Matching is its own module (`match`) with one job: given a role spec and a set of people, say how well each person fits, why, and with what evidence. Sourcing, the shortlist, the agent chat and later re-ranking all call it.

### 10.1 Decisions

| Topic | Decision | Why |
|---|---|---|
| Where it lives | A module in the same codebase (`server/match/`), exposed as its own API and run as worker jobs. Can be deployed alone later as `ROLE=matcher` without code changes. | Same reasoning as §1: a separate cluster now is overkill, but the boundary is clean from day one. |
| What is matched against | A **role spec** (structured, versioned), never the raw JD text. | Every score is traceable to a requirement the recruiter saw and approved. |
| Recall vs precision | **Retrieve narrow and cheap, score carefully.** Our pool's top 30 + **at most 20 new from Crustdata** = ≤ 50 people; code scores all of them instantly; the LLM judges the top 20. | Small, paid-for pools keep cost and latency down (§10.7); vectors alone are imprecise. |
| Who gives the number | The LLM gives **per-requirement verdicts with evidence** (met / partial / not met / unknown). Code turns verdicts into the score using the spec's weights. | Numbers from an LLM drift between runs; verdicts are checkable and stable. |
| Missing data | `unknown` is not `not met`. Unknowns on important requirements trigger enrichment, not a penalty. | Thin profiles otherwise lose to verbose ones. |
| Profile source | Our pool, already filled by Apify (§9.6). Crustdata search results are scored on their search payload; Apify fetches the full profile only for gaps among those judged, or on shortlist, in the background. All of it lands in `mother_data` via `core.ingest_person`. | One fetch, reused by every org and every later match. |

### 10.2 The role spec (JD → structure, recruiter approves)

```ts
const Requirement = z.object({
  id: z.string(),                       // "r1"
  kind: z.enum(["skill", "experience", "title", "domain", "education",
                "location", "language", "other"]),
  text: z.string(),                     // "3+ years building payment systems"
  importance: z.enum(["knockout", "must", "nice"]),
  weight: z.number().min(0).max(1),     // musts ~0.6–1, nice ~0.1–0.4
  structured: z.object({                // when it can be checked by code
    skill: z.string().optional(),
    minYears: z.number().optional(),
    within: z.enum(["current", "last_5y", "ever"]).optional(),
  }).partial().optional(),
});

export const RoleSpec = z.object({
  title: z.string(),
  seniority: z.string(),
  yearsMin: z.number().optional(), yearsMax: z.number().optional(),
  locations: z.array(z.string()), remoteOk: z.boolean(),
  requirements: z.array(Requirement),
  idealProfiles: z.array(z.string()).default([]), // person ids the recruiter says "like this"
  avoid: z.array(z.string()).default([]),          // "no pure-services background"
});
```

The `jd_to_spec` skill extracts this (validate-and-repair, §3), shows it as an editable artifact, and asks only about the gaps (`question` events). Nothing that spends Crustdata credits runs before the recruiter approves the spec. Each edit makes a new `spec_version`.

### 10.3 The flow

```
JD ─► 1 spec ─► (recruiter approves) ─► 2 retrieve ─► 3 hydrate ─► 4 knockouts
   ─► 5 feature score ─► 6 LLM judge (top N) ─► 7 rank + tiers ─► 8 feedback
```

1. **Spec.** JD → `RoleSpec` (above).
2. **Retrieve (≤ 50).** Our pool's top 30 (§7.4 hybrid: SQL filters + `tsvector` + pgvector, RRF), and **at most 20 new people** from Crustdata person search built with `toCrustdataQuery` (§7.7), never anyone we hold or this campaign has seen (§10.7). Both run at the same time.
3. **Hydrate.** People from our pool are already filled (§9.6). For Crustdata results, ask search for the fields scoring needs (experience with dates, skills, education, headline, summary) and ingest through `core.ingest_person`; Apify fills the gaps later only for those who reach step 6 with unknowns.
4. **Knockouts (code, free).** Location / remote, years band, explicit knockout requirements. Fails are kept with a reason ("Outside Bengaluru, not open to relocate"), not deleted, so the recruiter can override.
5. **Feature score (code, cheap).** Per requirement where `structured` allows it: skill present and *recent* (from experience dates, not just the skills list), years in the relevant role, title/seniority trajectory, domain match from company industries, tenure pattern, plus embedding similarity as one feature. Gives a provisional score for all ≤ 50; the top 20 go on.
6. **LLM judge (top N).** One call per person, Claude with a strict schema; cheap model first, stronger model only for the close calls.
   ```ts
   const Verdict = z.object({
     requirementId: z.string(),
     verdict: z.enum(["met", "partial", "not_met", "unknown"]),
     evidence: z.string().max(200),   // quoted from the profile, never invented
   });
   const Judgement = z.object({
     verdicts: z.array(Verdict),
     strengths: z.array(z.string()).max(3),
     concerns: z.array(z.string()).max(3),
   });
   ```
   Evidence must be a substring of the profile text we sent; verdicts whose evidence doesn't check out become `unknown`.
7. **Rank + tiers.** Score in code:
   ```ts
   const credit = { met: 1, partial: 0.5, not_met: 0, unknown: 0.35 };
   function score(spec: RoleSpec, j: Judgement) {
     let got = 0, max = 0;
     for (const r of spec.requirements) {
       if (r.importance === "knockout") continue;      // handled in step 4
       const v = j.verdicts.find((x) => x.requirementId === r.id)?.verdict ?? "unknown";
       got += r.weight * credit[v]; max += r.weight;
     }
     const mustsMissed = spec.requirements.filter((r) => r.importance === "must" &&
       j.verdicts.find((x) => x.requirementId === r.id)?.verdict === "not_met").length;
     const pct = max ? got / max : 0;
     return { pct, tier: mustsMissed ? "C" : pct >= 0.75 ? "A" : pct >= 0.5 ? "B" : "C" };
   }
   ```
   Output is a `candidate_list@1` artifact with a "why" per person (the met/not-met lines with evidence).
8. **Feedback.** Shortlist / reject / "more like this" are stored as labels per `spec_version`. They (a) nudge requirement weights for that campaign, (b) add `idealProfiles` for retrieval, and (c) become the golden set for evaluating changes to the matcher.

### 10.4 API (internal, same auth as everything else)

| Call | Does |
|---|---|
| `POST /match/specs` `{campaignId, jdText \| jdFileId}` | Starts `jd_to_spec`; returns a run id. |
| `PUT /match/specs/:id` | Recruiter edits → new version. |
| `POST /match/runs` `{specVersionId, sources: ["ours","crustdata"], target: 50, creditBudget}` | Starts a match run (steps 2–7) on the worker. |
| `POST /match/score` `{specVersionId, personIds[]}` | Scores given people only (extension saves, manual adds, a CSV import). |
| `GET /match/runs/:id/results?tier=A` | Ranked results with verdicts. |

`/match/score` is what makes it a service rather than a sourcing step: every candidate who enters a campaign by any door (§9.3) is scored against that campaign's spec the same way.

### 10.5 Tables (tenant schema unless noted)

- `role_specs(id, campaign_id, version, spec jsonb, jd_text, approved_by, approved_at)`
- `match_runs(id, spec_id, status, counts jsonb, credits_used, run_id → core.runs)`
- `match_scores(spec_id, person_id, profile_hash, stage_reached, features jsonb, judgement jsonb, score, tier, knocked_out_reason, model, created_at)`, unique `(spec_id, person_id, profile_hash)`, so an unchanged profile against an unchanged spec is never re-judged.
- `match_feedback(spec_id, person_id, label shortlist|reject|like_this, reason, by_user, at)`
- `campaign_seen(campaign_id, person_id, linkedin_key, source, run_id, first_seen_at)`: everyone a campaign has been shown, so no one is fetched or shown twice (§10.7).
- Embeddings stay global on `mother_data.people` (§9.5); the spec's embedding lives on `role_specs`.

### 10.6 Second score: how likely they are to move (proposed 3 Oct 2026)

Fit answers "are they right for the role?". This answers "would they listen now?". **Kept separate from fit**: it never changes the tier, it orders outreach inside a tier and shows as a reason ("Company headcount down 18% this year").

**Signals**

| Group | Signal | Source |
|---|---|---|
| Company health | Headcount falling over 6–12 months, hiring freeze (few open roles), layoffs in the news, long time since last funding, leadership exits, acquisition | Crustdata company data (headcount trend, job openings, funding), our market news feed. Fields to confirm on a test call. |
| Person at the company | Long tenure with no title change (stuck), passed a likely vesting point (~4 yrs), manager or teammates recently left | Experience dates; colleagues in our pool |
| Person, direct | Open to work, profile recently updated, recent new skills or certifications | Crustdata person data |
| Pulls the other way | Recent promotion, recently joined (< 1 yr), company growing fast or just raised | Same |

**Combining:** each signal is a small, explainable bump (`low / medium / high`), not a model: e.g. tenure ≥ 4 yrs **and** company headcount down ≥ 10% → high. The combination matters more than either alone; long tenure at a thriving company usually means *less* likely to move.

**Cost:** company signals are fetched **per company, not per person**, and cached for about a week. One fetch covers every candidate from that company, so it's cheap.

**Rules**
- Never a penalty on fit, and never used to hide someone.
- Shown as facts, not guesses: "Headcount down 18% in 12 months", not "company is failing".
- Not used in outreach copy to the candidate unless the recruiter writes it themselves.
- Recruiter feedback (who replied) tunes it later: reply rate by move-likelihood band is the check.

### 10.7 Speed, the 20-profile cap, and never repeating anyone (decided 3 Oct 2026)

**Per run: at most 20 new people from Crustdata.** We rank them together with our own pool's best 30. "Find more" then fetches 10, then 5 at a time (§16.1). `MAX_LIMIT = 20` in `src/search/crustdata.ts`.

- Skip Crustdata entirely when our pool already gives 20+ people above the feature-score bar; "Find more" always fetches.
- Hard per-campaign credit budget; a run key (`campaign + spec_version + "find more" count`) so a double click never spends twice.

**Never the same person twice.** Three layers, each a backstop for the one before:

1. **Before the call:** `exclude_profiles` = LinkedIn URLs of our pool's matches for these filters **∪** everyone this campaign has already been shown. Normalised to one canonical URL per profile. Excluded people aren't returned, so they aren't paid for (confirm on the first call).
2. **After the call:** `freshOnly(results, url, seen)` drops anyone already seen, and repeats inside the response, before anything is ingested, judged or shown.
3. **On save:** `core.ingest_person` matches on `person_identifiers` (LinkedIn, email, phone, and Crustdata's person id, stored from day one), so a person who slipped through updates their existing row.

Plus: keep Crustdata's `next_cursor` per (campaign, spec version, query) on `match_runs`, so "Find more" continues the same result list instead of starting over.

New tenant table:

```sql
create table campaign_seen (
  campaign_id   uuid not null,
  person_id     uuid not null references mother_data.people(id),
  linkedin_key  text,              -- profileKey(url): "asha-verma"
  source        text not null,     -- ours | crustdata | extension | manual
  run_id        uuid,
  first_seen_at timestamptz not null default now(),
  primary key (campaign_id, person_id)
);
create unique index on campaign_seen (campaign_id, linkedin_key) where linkedin_key is not null;
```

**Latency: results on screen in about a second, final ranking in about 10.**

| t | What the recruiter sees | How |
|---|---|---|
| ≈ 1 s | Our pool's best matches, ranked by feature score | One SQL query (filters + full text + pgvector) and the code scorer. Embeddings and normalised skills are computed at ingest, never at query time. The spec's embedding is stored when the spec is approved. |
| ≈ 3–6 s | Up to 20 new people from Crustdata, merged into the list | Fired in parallel with our search, as soon as the cheap filter query has produced the exclude list. Ask only for the `fields` scoring needs. |
| ≈ 6–12 s | AI verdicts fill in person by person; tiers settle | Top 20 judged **in parallel** (≈ 10 at a time) on Sonnet (decided 4 Oct 2026, §18), through the agent runtime. The spec and rubric are the same prefix on every call, so prompt caching cuts time and cost. Profile text trimmed to the relevant parts; short structured output. Each result streams to the UI as it lands. |
| later | A few people move up or down | Apify fills gaps in the background (never on the hot path), then those people are re-judged. |

- **Cache:** a judgement keyed by (spec version, person, profile hash) is reused instantly; re-running the same campaign costs nothing for people already judged.
- **Order stays stable:** a person's row updates in place as their verdicts arrive; nobody jumps around while being read.
- Targets to check on real runs: first results < 1.5 s, Crustdata merged < 6 s, all 20 judged < 15 s.

**To confirm on the first Crustdata calls:** that excluded profiles cost nothing, and the maximum length of `exclude_profiles`. If it's short, send this campaign's seen list first, then the pool matches.

### 10.8 Open questions

- Default N for the LLM judge: 20 (§10.7); tune on real runs.
- Do we show recruiters the numeric score, or only tiers + reasons? (Recommend tiers + reasons.)
- Should feedback weight changes stay per campaign, or roll up per client / per role family?
- Golden set: 3–5 past campaigns with known hires, to measure precision@20 before launch.

### 10.9 Deterministic scoring, policy v2 (built 21 Oct 2026)

**Principle:** the model reads a profile and says what it shows; code validates that, calculates the score, coverage, tier and status, and orders the list. The model never gives a number, a tier, a weight or an eligibility call.

**Flow (server `modules/matching/`):** `profile-facts.ts` (what a profile says: present / absent / ambiguous / not mentioned, and where in the text) -> `eligibility.ts` (knockouts: only confirmed facts; unclear data leaves a review note) -> `preranking.ts` (45/20/10/25 by default, weights from the policy; chooses who is read closely; never shown as a fit; the rest are "not scored yet") -> `judge.ts` + `assessment.ts` + `prompts.ts` (per requirement: verdict, quote, short reason; strict schema, no extra fields) -> `evidence.ts` (the quote must be the profile's own words; otherwise unknown; every correction logged) -> `scoring.ts` (`scoreAssessments(rubric, assessments, policy)`, pure) -> `results.ts` (the record kept with the result, and the API fields shaped from it) -> `audit.ts` + `overrides.ts` (append-only trail, a recruiter's override with a reason).

**Policy:** one versioned, zod-validated place, `policy.ts`. `v1` is the original arithmetic (an unknown earns 0.35, no minimum coverage) and is kept so old results read as they were made and a benchmark can compare; `v2` is the active policy for new scoring (`MATCH_POLICY`, `MATCH_MIN_COVERAGE`). Every stored result records its policy and rubric (spec) version; old rows are never rescored.

**v2 arithmetic:** credits met 1, partial 0.5, not_met 0, unknown left out. `fit = 100 x sum(w x credit) / sum(w)` over what could be assessed; `coverage = 100 x assessed weight / total weight`. Coverage under 50 -> status `insufficient_evidence`: no fit shown, no tier, no 1-3 indicator. Otherwise A at 75 or more with no unknown must-have and no must-have shown not met; B at 50 or more; C below 50 or a must-have shown not met. An unknown must-have is "to verify", never a failure. Fit, coverage, status, tier and override are separate fields.

**API (per match row and detail):** `score` (0-100, only for a valid fit), `coverage`, `status` (`scored`, `insufficient_evidence`, `not_scored_yet`, `knocked_out`), `tier`, `fit`, `toVerify`, `requirements` (verdict, quote, reason, weight, contribution), `strengths`, `concerns`, `missing`, `knockout`, `override`, `policyVersion`, `rubricVersion`, `evaluatedAt`. `POST /v1/campaigns/:id/matches/:key/override`, `GET .../audit`, `POST .../screen` (`:key` is a person id or a board card id). The console only shows these fields.

**Measure, do not claim:** `server/scripts/match-benchmark.ts` (fixtures in `server/test/fixtures/match-benchmark/`, offline by default, `--live` for the real judge), `match-fairness.ts` (counterfactual names and presentations), `match-compare-db.ts` (v1 and v2 side by side on campaigns already in a database, read-only).

---

## 11. Memory layer: master context, kept off the main database (proposed 3 Oct 2026)

**Requirement (from the user):** chats and campaigns need a persistent, layered "master context", and it must **not** load the main Supabase database. The main DB stays the source of truth for records (people, campaigns, stages, forms, calls); the memory layer holds everything the agent *remembers* about them.

### 11.1 Shape: one memory service, its own stores

```
           main DB (Supabase)                     memory service (own stores)
  campaigns · candidates · stages ...   ──events──►  ingest worker
  run_events · messages (thin)                        │
                                                      ├─ Redis    : working memory (live chats, hot briefs, TTL)
  agent worker ──── getContext() ────────────────────►├─ Qdrant   : recall (memories as vectors, filtered by org/campaign)
               ◄─── one bundle, ~50 ms ───────────────├─ Object storage (R2/S3): raw archive (full chats, transcripts)
                                                      └─ Briefs   : compiled master context per level (JSON docs)
```

- **Writes are asynchronous.** The main DB already emits `run_events`, stage moves and messages; a memory worker consumes them from a queue and updates memory. A chat turn never waits on memory writes and never adds query load to Postgres.
- **Reads come only from the memory service.** Building a prompt is one call, `getContext(org, campaign, conversation, query)`, served from Redis + Qdrant. Live campaign numbers come from a snapshot the event stream keeps fresh in Redis, not from per-turn queries.
- **Separate stores now, separate process later.** The memory *stores* (Redis, Qdrant) are their own Railway services from day one, so memory never loads Postgres. The memory *code* starts as a module inside the existing worker (`ROLE=all`), behind a `MemoryStore` interface; it moves to its own `ROLE=memory` service only when it needs to scale or deploy on its own. Same reasoning as §1.
- **Railway layout (region: Southeast Asia / Singapore, the closest to Supabase's `ap-south-1` Mumbai):** `app` (api + worker + memory module) · `redis` · `qdrant` (with a volume). They talk over Railway's private network. Raw archive in Supabase Storage or R2: object storage, so no Postgres load. Every call from Railway to Supabase crosses Singapore→Mumbai (tens of ms), so the API batches through RPCs rather than many small queries.

### 11.2 The master context: a hierarchy of briefs

| Level | Brief holds | Updated when |
|---|---|---|
| Org | How this agency works: tone, rules, recurring clients, things they never want | Weekly roll-up, or when a recruiter states a rule |
| Client | Hiring bar, past roles, what they rejected and why, contacts' preferences | After each campaign milestone for that client |
| Campaign | Role spec, decisions made, rejected directions, open asks, current state | After every few turns and every stage change |
| Conversation | Rolling summary + last ~20 messages verbatim + what "these 3" points to | Every turn (Redis) |
| Recruiter | Personal preferences and shortcuts | When stated or clearly repeated |
| Candidate (per org) | Notes, call highlights, feedback across campaigns | After calls, notes and decisions |

Each brief is a small, versioned JSON document (facts with source and date, preferences, open items). A lower level inherits from the ones above: a campaign turn sees org → client → campaign → conversation. Facts carry where they came from, so the agent can say *why* it believes something, and wrong ones can be corrected or deleted.

### 11.3 Kinds of memory

- **Working** (Redis, expires): the live conversation window, references, the campaign snapshot.
- **Episodic** (Qdrant + archive): what happened: summaries of chats, calls and decisions, each a vector with `org_id`, `campaign_id`, `client_id`, `person_ids`, `kind`, `at`.
- **Semantic** (briefs): distilled facts and preferences, rewritten as new episodes come in.
- **Raw** (object storage): full transcripts and chat logs, never sent whole to the model; re-processable later.

### 11.4 Building the context for one turn (`getContext`)

1. Briefs for org → client → campaign (cached, rarely change, so they sit first for prompt caching).
2. Conversation summary + recent messages + reference list.
3. Top-k recalled memories for the current message, filtered to the org and preferably the campaign/client.
4. Trimmed to a token budget by priority; the list of memory ids used is recorded on the run, so every answer is traceable.

### 11.5 Rules

- **Tenant isolation:** every key and vector carries `org_id`; the filter is applied inside the memory service, never by the caller. Separate Redis key prefixes per org.
- **Main DB wins on facts.** Memory never stores a stage, count or contact detail as truth; it refers to records by id.
- **Forgetting:** deleting a candidate, client or org purges their memories (vectors, briefs, archive) by id.
- **Contact details** never enter memory (they stay behind the credit/visibility rules).

### 11.6 Build vs buy

Managed memory systems exist (Mem0, Zep/Graphiti with a temporal knowledge graph, Letta). Proposal: build the thin service above on Redis + Qdrant + object storage, behind a `MemoryStore` interface, and evaluate Zep/Graphiti later if we need relationship queries ("which clients rejected people from X?"). Open question for the user.

### 11.7 The memory store from day one, and how it makes agents better (agreed direction, 3 Oct 2026)

**Decided with the user:** Redis is for fast caching only. A durable **context memory store** is built from the start, so it grows with every chat, run and recruiter decision and is used to make the agents better over time.

**Store:** Qdrant is the durable memory store (vectors + structured payload, on a volume with scheduled snapshots to object storage; or Qdrant Cloud if Railway backups are weak). Raw episodes are archived in object storage. A graph store (Graphiti on Neo4j / FalkorDB) is a later addition if we need multi-hop relationship questions; the record below already carries the entity links it would need.

**One memory record:**

```ts
type Memory = {
  id: string;
  orgId: string;                        // always set; every query filters on it
  scope: { level: "org" | "client" | "campaign" | "recruiter" | "candidate" | "skill";
           clientId?: string; campaignId?: string; userId?: string; personId?: string; skill?: string };
  kind: "episode"      // what happened: a chat summary, a call, a decision
      | "fact"         // "Client X needs people who can start within 30 days"
      | "preference"   // "Riya wants shortlists of 10, not 20"
      | "playbook"     // how to do a task well here: a rule or a worked example
      | "example";     // a past output that worked (approved spec, outreach that got replies)
  text: string;                         // what goes into the prompt
  data?: Record<string, unknown>;       // structured form when there is one
  evidence: { runId?: string; eventIds?: string[]; at: string }[];  // where it came from
  confidence: number;                   // rises with repeated evidence, falls when contradicted
  validFrom: string; validTo?: string;  // superseded facts are closed, not deleted
  supersedes?: string;
  uses: number; helped: number; hurt: number;   // filled by the learning loop
  embedding: number[];                  // stored as the Qdrant vector
};
```

**The learning loop** (background jobs in the worker; never on the chat's hot path):

1. **Capture.** Every run already records its inputs, the memories it used, its output and what happened next: the recruiter accepted, edited, undid or rejected; the candidate replied; the client hired. These are the signals.
2. **Distil.** After a chat goes quiet and after each run, a reflection pass turns episodes into candidate facts, preferences and playbooks ("For client X, recruiters reject pure-services backgrounds: 7 of 8 rejections"). Each carries its evidence.
3. **Consolidate.** New memories are merged with near-duplicates, raise or lower confidence, and close (`validTo`) anything they contradict. Org-wide rules above a threshold are shown to an admin to confirm before they apply to everyone.
4. **Use.** `getContext` retrieves by scope (org → client → campaign → conversation) and by similarity, ranked by relevance × confidence × recency, and records which memory ids each run used.
5. **Measure.** Outcomes are credited back to the memories used (`helped` / `hurt`). Memories that keep hurting or are never used decay and are archived. Per-skill evaluation sets (§10 golden sets, approved specs, replied outreach) check that memory actually improves results: same task with and without memory.

**What improves, concretely:**
- **Sourcing / matching:** client-specific bars and rejection reasons adjust requirement weights and filters before the recruiter has to repeat them.
- **Role specs:** past approved specs for similar roles become examples, so drafts need fewer edits.
- **Outreach:** messages that got replies, by role and region, become examples; ones that didn't are avoided.
- **Chat:** recruiters stop re-explaining preferences; "same as last time for Acme" works.

**Rules (in addition to §11.5):** no contact details in memory; a memory always shows its source; recruiters can see, correct and delete what the agent remembers about their org, clients and campaigns.

### 11.8 Lessons taken from Supermemory (researched 3 Oct 2026)

Qdrant is confirmed as the context memory store. Supermemory (a hosted memory API; Cloudflare-based, own vector-graph engine) reports 97% Recall@20 on LongMemEval. What we copy into §11.7, on Qdrant:

1. **Raw source and memories are separate outputs.** Ingest a whole chat session / call / run, not single messages. Produce (a) chunks kept as evidence and (b) *atomic memories*: one fact each, with references resolved ("he" → the candidate's id). Search hits memories, then attach the source chunk so the model gets the fact and the detail.
2. **Memories link to each other**, three ways: `updates` (a correction or change of state; the old one gets `isLatest = false`, kept for history), `extends` (adds detail, both stay valid), `derives` (an inference across several memories, lower confidence, must cite them). Added to the record as `relation?: { type, to: string[] }` and `isLatest: boolean`.
3. **Two dates per memory:** `documentDate` (when it was said) and `eventDate` (when it happens: "joins on 1 Nov"). Temporary facts carry an expiry and drop out by themselves.
4. **"Dreaming" = our distil step,** run on groups of related episodes (a whole chat or day of a campaign), not on each write. An instant mode for things that must be remembered right away (an explicit "remember that…").
5. **Profiles injected, not searched.** Each scope gets a short profile with a **static** part (lasting facts and preferences) and a **dynamic** part (what's happening now). Attached to every prompt with no extra search; Supermemory reports 1 call and 50–100 ms instead of 3–5 searches and 200–500 ms. These are our §11.2 briefs.
6. **Forget is soft by default:** hidden from search, kept on record; hard delete is a separate, verified operation (a deleted candidate must not come back after a resync).
7. **The application decides contradictions about real records.** Memory never outranks the main DB (already §11.5).
8. **Containers = hard isolation**: their `containerTags` are our `orgId` (+ client / campaign) filters, applied in the memory service.

Differences on purpose: we also learn from *outcomes* (accepted, edited, replied, hired; §11.7 step 5), which Supermemory does not describe; and org-wide rules need an admin's confirmation.

### 11.9 Further improvements from other memory systems (researched 3 Oct 2026)

Sources compared: Supermemory (§11.8), Mastra *Observational Memory* (≈95% LongMemEval with gpt-5-mini), Hindsight (arXiv 2512.12818, 91.4% LongMemEval). Adopted:

**Intelligence**
1. **Observation log for chats (Mastra).** Past a token threshold, an *observer* turns raw messages into dense, dated observations; a *reflector* merges and prunes them. The log replaces old raw history in the prompt: 3–6× smaller, and stable, so it stays prompt-cached between turns (4–10× cheaper input). This is the conversation layer of §11.2.
2. **Separate memory by what kind of knowledge it is (Hindsight).** Facts about the world (candidates, companies, clients); the agent's own experiences (what it did and what happened); **beliefs with confidence** ("Acme prefers product-company backgrounds", c = 0.8, reinforced or weakened by new evidence); entity summaries (the profiles). Beliefs never get stated to users as facts.
3. **Four-way recall, fused (Hindsight).** Meaning (dense vectors) + exact words (sparse / BM25: names, skills, companies) + entity links (memories about the same candidate, their company, the client: one hop) + time ("last week", "before the offer"). Merged with reciprocal-rank fusion, reranked with a cross-encoder, cut to a token budget.
4. **Canonical entities on every memory.** Each memory carries `personIds`, `companyIds`, `clientId`, `campaignId` from the main DB. This gives graph-like one-hop recall on Qdrant payload filters, without a graph database.
5. **Playbooks grow by small edits, not rewrites.** Per skill (sourcing, outreach, specs), the reflection step proposes *additions or changes to single items*, each with evidence and an outcome score; whole-playbook rewrites lose detail over time.
6. **Agent-driven memory as well as passive.** Skills get two tools, `recall(query)` and `remember(text, scope)`, for explicit "remember that…" and deeper lookups mid-task.
7. **Our own memory test set** in the style of LongMemEval, with recruiting cases: preference recall ("Riya wants 10"), knowledge update ("Acme raised the budget"), time ("who joins next month"), across sessions, and isolation (another org's memory must never appear). Run on every change to memory code or prompts.

**Storage and speed**
- **Three tiers:** Redis hot (profiles, observation logs, recent memories of active campaigns; rebuilt if lost) → Qdrant warm (all live memories) → object storage cold (raw sessions, source chunks).
- **One Qdrant collection, two vectors per point:** dense (1024-d BGE-M3) and sparse (BGE-M3 also produces sparse weights in the same pass, so one embedding call gives both). Scalar int8 quantization with rescoring; payload on disk.
- **Payload indexes:** `orgId` (tenant index), `clientId`, `campaignId`, `personIds`, `kind`, `isLatest`, `forgotten`, `expiresAt` (datetime). Default filter: this org, latest, not forgotten, not expired.
- **Hybrid in one request:** Qdrant's query API runs the dense and sparse searches as prefetches and fuses them server-side.
- **Embeddings cached by text hash; ingestion batched.** Extraction and reflection on Sonnet, in the background (§18).
- **Prompt order for caching:** system + skill playbook → org / client / campaign profiles → observation log → recalled memories → the new message. The stable parts come first, so most of every prompt is a cache hit.
- **Budget:** about 8–15k tokens of context per turn; profiles regenerate when their inputs change, never at request time.

---

## 12. One campaign, end to end (walkthrough, 3 Oct 2026)

How every piece above works together over the life of one campaign. Example: *Acme Fintech hires a Senior Backend Engineer; admin Punith, recruiter Riya.*

### 12.0 The loop every agent request follows

```
Console ──POST /runs──► API: check role, write core.runs row (queued) ──► 200 {runId}
   ▲                                                                      │
   │ Realtime (run_events)                         worker claims it (FOR UPDATE SKIP LOCKED)
   │                                                                      ▼
   └── message · question · progress · artifact · approval · result ◄── skill steps
                                                                          │
         getContext(): Redis profiles + observation log + Qdrant recall ──┘ (≈50 ms)
         after the run: run summary → memory queue → distil (background)
```

Every step below is one or more of these runs. Main DB = records; Redis = hot cache; Qdrant = memory; object storage = raw files.

### 12.1 Set-up (day 0)

| Step | What happens | Writes |
|---|---|---|
| Client | Admin adds Acme (form or agent chat), or it already exists | `clients`, `client_contacts` |
| Campaign | Admin creates it (full New campaign form), links Acme, assigns Riya | `campaigns`, `campaign_members`; RLS now lets Riya see it |
| Context | Memory service builds the campaign profile from org + client profiles: Acme's past bar, rejections, preferences | Redis profile; Qdrant: `campaign created` episode |

### 12.2 JD → role spec (day 0, minutes)

1. Riya uploads the JD or pastes it. `jd_to_spec` skill: Claude reads it **with the Acme client profile and similar approved specs** recalled from memory (examples).
2. Output is a `RoleSpec` artifact (validated, repaired if needed). Gaps become `question` events ("Is remote OK?").
3. Riya edits and approves. → `role_specs` v1; memory gets an *example* (approved spec) and any *facts* she stated ("Acme won't consider notice > 60 days").

Cost: one Claude call. No credits spent before approval.

### 12.3 Sourcing + matching (day 0–1, seconds per run)

| t | What | Tech |
|---|---|---|
| 0 | "Find people" | run `sourcing`; idempotency key per (campaign, spec v, find-more #) |
| ≈1 s | Our pool's best 30 on screen | one SQL: filters + full text + pgvector over `mother_data.people`; code scorer |
| ≈3–6 s | ≤ 20 new from Crustdata merged in | `toCrustdataQuery` + exclude list (pool matches ∪ `campaign_seen`); `freshOnly`; `ingest_person` |
| ≈6–12 s | AI verdicts fill in; tiers A/B/C settle | top 20 judged in parallel on Sonnet, prompt-cached spec; cached per (spec v, person, profile hash) |
| later | Gaps filled, a few people re-ranked | Apify `enrich` jobs in the background, then re-judge |
| — | "Likely to move" orders each tier | company signals per company, cached ~1 week |

Writes: `match_runs`, `match_scores`, `campaign_seen`, new people in `mother_data`. Memory: an episode per run (query, counts, what was shown).
Cost: ≤ 20 Crustdata profiles, ≤ 20 Sonnet judgements (fewer when cached), Apify only for gaps.

### 12.4 Shortlisting (days 1–3)

- Riya shortlists, rejects, or "more like this" from the table or the chat ("shortlist the top 3 from Razorpay"). Chat references resolve through the conversation's reference list.
- Each is a **command** (`shortlistCandidates`, `rejectCandidate`): permission check, idempotency key, undo. → `campaign_candidates` stage, `stage_moves`, `match_feedback`.
- Learning: rejections with reasons adjust requirement weights for this campaign right away; the distil step turns repeated patterns into client-level *beliefs* ("Acme: 7/8 rejections were services-only backgrounds", c = 0.8).
- "Find more" fetches the next 20 *new* people, never repeats.

### 12.5 Contacts + outreach (days 2–7)

1. Contact details only for shortlisted people Riya picks: the existing SalesQL → ContactOut → Apollo chain, per-org credits, visibility rules unchanged.
2. `outreach` skill drafts messages using **examples that got replies** for similar roles and regions (procedural memory) and the candidate's profile.
3. Sending is an **external** command → `approval` event; Riya approves each message or the batch. → `outreach_messages`.
4. Replies are **logged by the recruiter** for now (Gmail is send-only, WhatsApp later; `platform-plan.md` §8.2) → step moves to replied, memory records the outcome on the message's examples (`helped` / `hurt`).

### 12.6 Screening (days 5–12)

- `form_builder` skill: a screening form drafted from the spec's must-haves and Acme's known knockouts; Riya edits and publishes. → `forms`, `form_questions`.
- Responses → `form_responses`; knockout answers update match verdicts (a must-have `unknown` becomes `met` / `not_met`), so tiers refresh.
- Calls: recordings to object storage, transcripts to `calls`; the call-summary skill writes highlights → memory (candidate-level, this org only). Contact details never go into memory.

### 12.7 Interviews → offer → hire (weeks 2–6)

- Stage moves on the board or by chat; each a command with an `activity` entry; the Overview and Activity log read the same records.
- Client feedback ("too junior", "great system design") is captured as notes → memory: client *beliefs* and *facts* get evidence.
- Hire: stage `hired`, offer details on the record; the outcome credits every memory and match decision that led there.

### 12.8 Close and learn (end of campaign)

1. Admin completes or closes the campaign (admin-only command). Recruiters' access ends with it per RLS rules.
2. **Campaign reflection run:** what worked (sources of hires, message styles with replies, requirements that predicted success), what didn't. Results become:
   - client profile updates and beliefs ("Acme hires from product fintechs, 3–6 yrs, values system design"),
   - playbook edits for sourcing / outreach (small, evidenced),
   - the hired person's spec + shortlist as a **golden case** for the matcher's test set.
3. Campaign memories stay, scoped to Acme and the org. The next Acme campaign starts with all of it in its profile on day 0.

### 12.9 What runs where

| Piece | Runs on |
|---|---|
| Console | Static React app |
| API + worker + memory module | Railway, Singapore (`ROLE=all`, split later) |
| Records, auth, RLS, Realtime, Storage | Supabase, Mumbai |
| Hot cache | Redis on Railway |
| Memory | Qdrant on Railway (volume + snapshots) |
| LLM | Claude Sonnet for every agent step (§18), through the claude-code-gateway |
| Data providers | Crustdata (search), Apify (profiles), SalesQL → ContactOut → Apollo (contacts) |

### 12.10 The stores: what each holds, who calls it, where analysis happens

| Store | Role | Holds | Never holds |
|---|---|---|---|
| **Supabase Postgres** (main DB) | The record of truth | `mother_data` (people, identifiers, experiences, skills, companies, candidate embeddings via pgvector); tenant tables (clients, campaigns, members, `campaign_candidates`, stage moves, outreach, forms, responses, calls metadata + transcript text, notes, activity, role specs, match runs / scores / feedback, `campaign_seen`); `core` (orgs, credits, `reveal_events`, `runs`, `run_events`) | Chat memory, profiles of beliefs, raw provider payloads (see below) |
| **Supabase Storage** (object storage) | Cold archive and files | JD files, recordings, raw Apify / Crustdata payloads, full chat sessions, source chunks behind memories, Qdrant snapshots | Anything queried per request |
| **Redis** (Railway) | Hot cache; everything rebuildable | Org / client / campaign / recruiter profiles, each chat's observation log + reference list, campaign snapshot (stage counts, shortlist ids), embedding cache, rate-limit counters | Anything that would be lost for good if Redis were wiped |
| **Qdrant** (Railway) | Long-term memory | Memories: episodes, facts, beliefs, preferences, playbook items, examples; dense + sparse vectors; scope + entity ids; dates, `isLatest`, confidence, outcome counts | Records of truth (stages, counts), contact details |
| *Supabase Realtime* | Delivery, not storage | Pushes `run_events` and record changes to the console and extension | — |

**Raw provider payloads move to Storage** (change from §9.5): `person_sources` keeps `(person_id, source, fetched_at, object_key, payload_hash)` in Postgres and the payload itself in Storage, so the main DB doesn't grow with large JSON.

**Who calls which store, per phase**

| Phase | Postgres | Storage | Redis | Qdrant |
|---|---|---|---|---|
| Set-up | write client, campaign, members | — | build campaign profile | read org / client memories; write episode |
| JD → spec | write `role_specs` | write JD file | read profiles | read similar approved specs (examples); write example + stated facts |
| Sourcing + matching | read pool (SQL + pgvector); write people, `match_*`, `campaign_seen` | write raw payloads | read campaign snapshot; embedding cache | read client beliefs that adjust weights; write run episode |
| Shortlisting | write stages, `stage_moves`, `match_feedback` | — | update snapshot, reference list | write feedback episodes; distil → beliefs |
| Outreach | read contacts (visibility rules); write `outreach_messages`, replies | — | read profiles | read reply-winning examples; write outcomes (`helped` / `hurt`) |
| Screening + calls | write forms, responses, call rows, transcripts | write recordings | — | write call highlights (no contacts) |
| Interviews → hire | write stages, notes, offer | — | update snapshot | write client feedback as evidence; credit outcomes |
| Close + learn | write status; read the campaign's records for the reflection | read raw sessions for reflection | refresh client profile | write profile / belief / playbook updates, golden case |

**Who talks to which store**
- **Console and extension:** Postgres only, through RPCs and RLS; Realtime for live updates. Never Redis or Qdrant directly.
- **API:** Postgres (records, permissions), Redis (snapshots, rate limits).
- **Worker (skills):** Postgres for records; `getContext()` for everything memory-related (Redis first, then Qdrant); Storage for files.
- **Memory module:** the only code that reads or writes Qdrant and the Redis profile / observation keys. Listens to `run_events` and record changes; writes nothing to Postgres except a run's list of memory ids used.

**Where each kind of analysis happens**

| Analysis | Runs in | Reads |
|---|---|---|
| Overview numbers, funnel, activity, recruiter contribution | Postgres (SQL views / RPCs), cached in Redis for active campaigns | Postgres |
| Candidate search (filters + words + meaning) | Postgres, one SQL query | `mother_data` + pgvector |
| Match scoring (rules, feature score) | Worker code, in memory | Postgres records |
| Match verdicts | Claude Sonnet from the worker | spec + profile text + client beliefs from Qdrant |
| "Likely to move" | Worker code | company signals (cached in Redis), experience dates |
| Memory recall for a turn | Qdrant (hybrid dense + sparse, filtered) → rerank in the worker | Qdrant + Redis |
| Distil / reflection / consolidation | Worker background jobs on Sonnet | run summaries, Storage sessions, Qdrant neighbours |
| Outcome credit (`helped` / `hurt`) | Worker job on each outcome event | Postgres outcome + the run's used memory ids |
| Memory quality tests | CI / scheduled job | test set against a scratch Qdrant collection |

**If a store fails**
- Postgres down: the product is down (it is the record).
- Redis down: slower; everything rebuilt from Postgres and Qdrant.
- Qdrant down: agents still work from records and profiles, just without long-term recall.
- Storage down: uploads and playback fail; nothing else.

---

## 13. The orchestrator: from "something happened" to the right prompt (3 Oct 2026)

The orchestrator is **code, not one big agent**. It runs in the worker for every trigger, decides what to do, builds the context, and hands off to a skill or a command. A small model is used only where a decision needs language understanding (routing a chat message).

### 13.1 Triggers

| Kind | Examples | Routed by |
|---|---|---|
| Chat message | "find more like Asha but with Kafka" | Router model (Sonnet), then code |
| UI action | Find people, Approve spec, Shortlist, Send | Code: the button names the skill / command |
| External event | Candidate replied, form submitted, call uploaded, Apify finished | Code: event type → handler |
| Schedule / quiet | Chat idle 10 min, nightly, campaign closed | Code: memory jobs |

### 13.2 The pipeline for every trigger

```
1 normalise   → Trigger { kind, orgId, campaignId?, userId?, payload }
2 resolve     → references ("these 3", "Asha", "that form") from the chat's reference list, in code
3 route       → structured triggers: table lookup.   chat: router model → Decision (below)
4 check       → permission (role, campaign membership), args against the skill's schema;
                missing → `question` event and stop
5 plan context→ the skill's context recipe → which stores, which searches, token budget
6 build prompt→ fixed layer order (13.4)
7 run         → skill steps (code + LLM), commands with approvals, events streamed
8 after       → records written, memory ids used saved on the run, episode queued for memory
```

Router output (validated like every LLM output):

```ts
const Decision = z.object({
  intent: z.enum(["skill", "command", "answer", "clarify"]),
  skill: z.string().optional(),               // "sourcing", "outreach", "form_builder"…
  command: z.string().optional(),             // "moveStage", "shortlist"…
  args: z.record(z.unknown()),
  needs: z.object({
    records: z.array(z.string()),             // "stage_counts", "candidate:<id>", "stage_moves"
    recall: z.string().nullable(),            // a memory search query, or null
  }),
  clarify: z.string().optional(),
});
```

The router sees only: the skill and command catalogue, the campaign snapshot (Redis), the chat's observation log and reference list. No memory search to route.

### 13.3 Context recipes: each skill declares what it needs

```ts
defineSkill({
  name: "outreach",
  context: {
    profiles: ["org", "client", "campaign", "recruiter"],      // Redis, always, no search
    records:  ["role_spec", "candidates:args.personIds"],       // Postgres by id
    recall: [
      { kinds: ["example"], query: "outreach for {spec.title} in {spec.locations}",
        filter: { orgId, outcome: "replied" }, k: 3 },          // semantic search
      { kinds: ["belief", "fact"], filter: { clientId }, k: 8 },// filter only, no vector
    ],
    budget: 12_000,
  },
  ...
});
```

Two kinds of memory read:
- **Fetch by filter** (no vector): "everything current about Acme", "Riya's preferences". Cheap, exact, used whenever scope is known.
- **Semantic search** (dense + sparse in Qdrant, then rerank): only when the question is open-ended or the best examples are wanted.

### 13.4 Prompt layers (same order every time, so most of it is cached)

1. System rules: who we are, safety, output format.
2. The skill's prompt + its playbook items (versioned).
3. Profiles: org → client → campaign → recruiter (static + dynamic).
4. Chat observation log + reference list.
5. Records the step needs (spec, candidate profiles, counts).
6. Recalled memories, each with its source.
7. The trigger: the new message or event.
8. The output schema (tool definition).

### 13.5 When semantic search fires, and when it doesn't

| Fires | Store | Why |
|---|---|---|
| Sourcing: search the pool | Postgres pgvector | find people by meaning of the spec |
| Spec drafting: similar approved specs | Qdrant, `example` | start from what was approved before |
| Outreach drafting: messages that got replies | Qdrant, `example` | reuse what works |
| Chat question about the past ("why did we drop Rohan?", "what did Acme say last time?") | Qdrant, scoped to campaign / client / person | recall the reason, with source |
| Router asks for it (`needs.recall`) | Qdrant | message mentions something not in hot context |
| Memory ingest / consolidation | Qdrant | find near-duplicates and the memory a new one `updates` / `extends` |

| Doesn't fire | Instead |
|---|---|
| Commands ("move Asha to interviewing", "shortlist these 3") | references + Postgres |
| Numbers ("how many are interviewing?") | campaign snapshot (Redis) or SQL |
| Matching weights | client beliefs fetched by filter |
| Profiles | Redis, attached whole |
| External events (reply, form, call) | handler code; memory written afterwards |

### 13.6 Traces

**A. Chat: "find more like Asha but with Kafka"**
1. Resolve "Asha" → `person_id` from the reference list.
2. Router → `skill: sourcing`, `args: { likePersonId, addMust: ["Kafka"] }`, `needs.recall: null`.
3. Check: Riya is on the campaign; Kafka becomes a must for this run only (asks "add Kafka to the spec for good?").
4. Context: profiles (Redis); spec + Asha's profile (Postgres); Acme beliefs by filter (Qdrant, no vector).
5. Run: pgvector search with Asha's embedding + spec filters + Kafka → our best 30; Crustdata ≤ 20 new; score; Sonnet judges the top 20.
6. After: `match_runs`, `campaign_seen`; episode "looked for Asha-like + Kafka" queued.

**B. Event: Rohan replies on WhatsApp**
1. Webhook → handler (no router): store reply, move stage to Replied, `activity`.
2. Outcome credited to the outreach examples used for Rohan's message (`helped`).
3. Optional suggestion: `reply_draft` skill → recall: examples of good follow-ups (semantic, k = 3) → draft shown to Riya for approval.

**C. Chat: "why did we drop Priya?"**
1. Router → `answer`, `needs.records: ["stage_moves:Priya"]`, `needs.recall: "reason Priya rejected"`.
2. Postgres: her stage history and notes. Qdrant: semantic search scoped to this campaign + Priya.
3. Answer cites the note / call highlight it came from.

**D. Chat: "Acme now wants 10+ years"**
1. Router → `command: updateSpec` (new spec version) → needs approval in the chat.
2. On approval: memory writes a client fact that **updates** the old one (old `isLatest = false`); Redis client profile refreshed; re-match of current candidates queued (cached verdicts reused where unaffected).

**E. Chat idle 10 minutes**
1. Schedule trigger → observer compresses the chat into observations (Redis + archive).
2. Distil: new facts / preferences / beliefs with evidence → consolidation search in Qdrant → insert, `updates` or `extends`.

---

## 14. Qdrant storage layout (3 Oct 2026)

### 14.1 Collections

| Name | Holds | Notes |
|---|---|---|
| `memories` (an **alias** pointing at `memories_v1`) | Every memory point for every org: episodes, facts, beliefs, preferences, playbook items, examples, profiles | One collection for all orgs; the alias lets us rebuild into `memories_v2` (new embedding model, new settings) and switch with no downtime |
| `memories_eval` | The memory test set (§11.9) | Never mixed with real data |

Source chunks, full chats and transcripts stay in object storage; a point only stores their keys.

### 14.2 Collection settings

```jsonc
PUT /collections/memories_v1
{
  "vectors": {
    "dense": { "size": 1024, "distance": "Cosine", "on_disk": true }       // BGE-M3 dense
  },
  "sparse_vectors": {
    "sparse": { "index": { "on_disk": false } }                            // BGE-M3 lexical weights
  },
  "quantization_config": {
    "scalar": { "type": "int8", "quantile": 0.99, "always_ram": true }     // ~4x smaller, in RAM
  },
  "hnsw_config": { "m": 0, "payload_m": 16 },   // graph built per org (every query filters by org)
  "on_disk_payload": true
}
```

- Originals of the dense vectors on disk, the int8 copies in RAM; searches use the int8 copy and re-check the top hits against the originals (`rescore`, oversampling 2).
- `m: 0` + `payload_m: 16`: no global graph, one per tenant. Right for us because no query ever spans orgs.

### 14.3 One point

```jsonc
{
  "id": "6f1c…",                       // UUID; deterministic (uuidv5) for episodes and profiles, so retries don't duplicate
  "vector": { "dense": [/* 1024 */], "sparse": { "indices": [...], "values": [...] } },
  "payload": {
    "org_id": "org_superhyre",         // always set; tenant index
    "level": "client",                 // org | client | campaign | recruiter | candidate | company | skill
    "client_id": "cl_acme",
    "campaign_id": null,
    "user_id": null,
    "person_ids": [],                  // canonical ids from mother_data
    "company_ids": [],
    "skill": null,                     // sourcing | outreach | spec | screening … for playbooks / examples

    "kind": "belief",                  // episode | fact | belief | preference | playbook | example | profile
    "topic": "hiring_bar.background",  // short machine label, groups related memories
    "text": "Acme prefers candidates from product fintech companies over services firms.",
    "data": { "prefers": "product_fintech", "avoids": "services" },

    "confidence": 0.8,                 // beliefs and derived memories
    "evidence_count": 8,
    "source": { "type": "run", "run_ids": ["run_…"], "event_ids": ["evt_…"], "chunk_keys": ["chats/…/12.json"] },

    "document_date": "2026-10-03T10:12:00Z",   // when it was said
    "event_date": null,                        // when it happens, if different
    "expires_at": null,                        // temporary facts
    "created_at": "2026-10-03T10:20:00Z",
    "updated_at": "2026-10-03T10:20:00Z",

    "is_latest": true,
    "relation": { "type": "derives", "to": ["9a2e…", "b71d…"] },  // updates | extends | derives
    "superseded_by": null,
    "forgotten": false,
    "visibility": "org",               // org | admins | owner

    "uses": 0, "helped": 0, "hurt": 0, "last_used_at": null,
    "embed_model": "bge-m3", "schema_version": 1
  }
}
```

What each kind looks like in practice:

| kind | level | Example `text` | Typical `data` |
|---|---|---|---|
| episode | campaign | "Run 14: 30 from pool + 18 new; Riya shortlisted 4, rejected 6 (services backgrounds)" | counts, run id |
| fact | client | "Acme won't consider notice periods over 60 days" | `{ maxNoticeDays: 60 }` |
| belief | client | "Acme prefers product fintech backgrounds" | `{ prefers, avoids }`, confidence |
| preference | recruiter | "Riya wants shortlists of 10" | `{ shortlistSize: 10 }` |
| playbook | skill (+ org) | "For fintech backend roles, ask about payments scale first" | rule id, outcome score |
| example | skill (+ org) | the outreach message itself | role, region, `outcome: "replied"` |
| profile | any | the static + dynamic summary for that scope | `{ static: [...], dynamic: [...] }` |

The full catalogue of memory types, with examples for every level, is in `docs/memory-catalogue.md`. It adds a `company` level (what this org has learned about employers).

Profiles are stored here as one point per scope (deterministic id) so Redis can always be rebuilt from Qdrant.

### 14.4 Payload indexes

| Field | Index | Used for |
|---|---|---|
| `org_id` | keyword, `is_tenant: true` | every query |
| `level`, `kind`, `topic`, `skill`, `visibility` | keyword | recipes ("beliefs about this client") |
| `client_id`, `campaign_id`, `user_id` | keyword | scope |
| `person_ids`, `company_ids` | keyword (arrays) | "everything about Asha", purge on delete |
| `is_latest`, `forgotten` | bool | default filter |
| `expires_at`, `event_date`, `document_date` | datetime | expiry, "last week", "before the offer" |
| `confidence` | float | drop weak beliefs |

Default filter on every read: `org_id = X AND is_latest AND NOT forgotten AND (expires_at is empty OR expires_at > now)`, plus `visibility` for the caller's role.

### 14.5 The four read patterns

1. **Fetch by filter** (no vector): `scroll` with filter, e.g. current beliefs and facts for `client_id = cl_acme`. Used by context recipes when the scope is known.
2. **Hybrid search**: one `query` call, two prefetches fused server-side, then reranked in the worker:
   ```jsonc
   POST /collections/memories/points/query
   {
     "prefetch": [
       { "query": [/* dense */],              "using": "dense",  "limit": 40, "filter": F },
       { "query": { "indices": [...], "values": [...] }, "using": "sparse", "limit": 40, "filter": F }
     ],
     "query": { "fusion": "rrf" },
     "limit": 20,
     "params": { "quantization": { "rescore": true, "oversampling": 2.0 } }
   }
   ```
3. **Entity hop**: filter `person_ids` / `company_ids` contains the ids in play (one hop, no graph DB).
4. **Consolidation lookup** (on write): same `org_id` + scope + `kind`, dense top 5 with score ≥ 0.85, to decide *insert*, *updates* or *extends*.

### 14.6 Write patterns

| Event | Operation |
|---|---|
| New memory | embed (dense + sparse in one BGE-M3 call, cached by text hash) → consolidation lookup → `upsert` |
| Correction / change ("Acme now wants 10+ years") | upsert the new point with `relation.type = "updates"`; `set_payload` on the old: `is_latest = false`, `superseded_by` |
| Extra detail | upsert with `relation.type = "extends"`; old stays latest |
| Evidence repeats / contradicts a belief | `set_payload`: `confidence`, `evidence_count`, `updated_at` (no re-embed) |
| Memory used in a run / outcome arrives | `set_payload`: `uses`, `last_used_at`, `helped` / `hurt` |
| Soft forget (user or decay) | `set_payload`: `forgotten = true` |
| Hard delete (candidate / client / org removed) | `delete` by filter (`person_ids` contains id, or `client_id`, or `org_id`), plus their archive keys in Storage; then a check that search returns nothing |
| Expired temporary fact | nothing: the default filter hides it; a nightly job marks it forgotten |

Writes come only from the memory module, in batches, with `wait: true` where the next step depends on them.

### 14.7 Size and operations

- **Per point:** about 1 KB int8 vector in RAM, 4 KB original vector + 1–2 KB payload on disk.
- **1M memories:** about 1–1.5 GB RAM, about 6–7 GB disk. A 2–4 GB RAM Railway instance covers the foreseeable future.
- **Backups:** nightly snapshot to Supabase Storage; restore tested monthly.
- **Model change:** build `memories_v2` from the archive and existing payloads, run the memory test set on it, switch the alias.

---

## 15. How the backend code is written (agreed 4 Oct 2026)

**Status: plan only. Nothing is implemented until the plan is signed off.**

### 15.1 Shape: a modular monolith, organised by domain

One deployable, split into modules that own a piece of the business. Folders follow the domain, not technical layers.

```
server/
  src/
    main.ts                    composition root: reads config, wires adapters, starts roles
    config.ts                  env parsed once with zod
    modules/
      campaigns/   clients/   candidates/   sourcing/   matching/
      outreach/    forms/     calls/        memory/     orchestrator/   identity/
        domain/      pure rules and types, no I/O
        app/         use cases; depend on domain + ports
        ports.ts     interfaces this module needs (repos, providers)
        infra/       adapters: Postgres repos, provider clients
        http/        routes (thin: parse → use case → map result)
        jobs/        worker handlers (thin, same as routes)
        index.ts     the module's public API; nothing else is imported from outside
    platform/      db, queue, realtime, llm client, logging, errors, idempotency
packages/
  shared/          zod schemas and types shared with the console: events, artifacts, commands, skills
```

**Dependency rules** (checked by a lint rule):
- `domain` imports nothing outside itself.
- `app` imports its own `domain` and `ports`, never `infra`.
- Modules never import each other's internals; only `modules/<x>/index.ts`, or they react to events.
- `main.ts` is the only place adapters are created and passed in (plain factories, no DI framework).

### 15.2 Principles

- **Pure core, thin edges.** Business rules are pure functions tested without a database or network. Examples: the Crustdata query builder, the batch schedule and no-repeat ledger (§16), the match scorer, context-budget trimming. Routes and job handlers only parse, call a use case, and map the result.
- **Ports and adapters for everything external.** `SearchProvider` (Crustdata), `ProfileProvider` (Apify), `ContactProvider` (existing chain), `AgentRuntime` (the gateway, §18), `MemoryStore` (Qdrant + Redis), `MessageChannel` (WhatsApp / email). Tests use in-memory fakes. Swapping a vendor touches one adapter.
- **Validate at the boundary, trust inside.** Every HTTP body, job payload, webhook, provider response and LLM output is parsed with zod once; types are inferred from the schemas. No `any`, strict TypeScript.
- **Errors are values at the edges.** Use cases return typed results or throw typed domain errors; one mapper turns them into HTTP responses and user-facing copy. Provider names and raw messages never reach users (extension rule).
- **Idempotent writes.** Commands and jobs carry an idempotency key; retries never double-spend or double-insert. Events are written in the same transaction as the change (outbox), then published.
- **Small, named things.** One responsibility per file; functions short enough to read at once; names say what, so comments rarely have to. Prefer plain functions and data over classes; no inheritance hierarchies.
- **Minimal comments.** Comment *why* (a constraint, a measured fact, a trade-off), never *what*. Doc comments only on a module's public API. No commented-out code, no TODOs without an issue.
- **Config and secrets.** One `config.ts` parses env with zod at start-up and fails fast. Secrets only in Railway / Supabase secrets; nothing in code or the repo.
- **Observability.** Structured logs with `org_id`, `campaign_id`, `run_id`, `session_id`; traces across API → worker → gateway → providers; no personal data or contact details in logs.
- **Database.** SQL migrations, idempotent, run for every tenant schema; one repository per aggregate; client access only through RPCs with RLS (extension rule).
- **Tests by layer.** Unit (domain, pure), integration (repos against local Postgres, like the backfill check), contract (provider adapters against recorded responses), one end-to-end slice per skill. CI gate: typecheck, lint, tests.
- **Tooling.** pnpm workspace, TypeScript strict, Biome (lint + format), Vitest, zod everywhere.

---

## 16. Sourcing over time: "find more", no repeats, and the keep-sourcing watch (decided 4 Oct 2026)

### 16.1 Batch sizes shrink: 20 → 10 → 5 → 5 …

| Request in this campaign | New people asked for |
|---|---|
| First search | 20 |
| 1st "find more" | 10 |
| 2nd "find more" and every one after | 5 |

The size is a function of how many requests the campaign has made (`batchSize(n)`), so it is the same whether "find more" comes from a button, the chat, or another recruiter on the same campaign. A spec change (new version) does **not** reset it: people already shown stay excluded, and the size continues from where it was. Resetting is an explicit admin action ("start sourcing over"), which still never re-shows anyone.

### 16.2 The no-repeat ledger (one per campaign)

```ts
type Ledger = {
  campaignId: string;
  seen: string[];            // profileKey() of everyone the campaign has been shown, from any source
  cursor: string | null;     // provider paging position; "find more" continues, never restarts
  batches: { n, asked, returned, fresh, repeats, at, by: "recruiter" | "watch" }[];
  exhausted: boolean;        // provider has nothing more for these filters
};
```

- **Stored** as `campaign_seen` (§10.7) plus a `sourcing_ledgers` row (cursor, batch log, exhausted). Postgres is the truth; Redis holds a hot copy for active campaigns.
- **Concurrency:** two "find more" clicks, or a click while a watch runs, must not fetch the same page twice. Each request takes a per-campaign advisory lock (`pg_advisory_xact_lock(hash(campaign_id))`), reads the ledger, plans the batch, and commits the new cursor + seen list atomically with the results. A second request waits for the first, then plans from the updated ledger. Idempotency key: `campaign:specVersion:n`.
- **Three layers** (from §10.7): exclude list before the call → `freshOnly` after → identifier match in `ingest_person`. People who reach the campaign any other way (extension, manual add, our own pool) are added to `seen` too.
- **Exhausted:** an empty page or no next cursor marks the ledger exhausted; the UI says so in plain words and offers to widen filters (a new search inherits `seen`).

### 16.3 The keep-sourcing watch (long-running)

A recruiter can ask the agent to keep finding people for a while. The watch is a **job with a schedule**, owned by the worker, not by a chat or a browser tab.

```ts
type WatchConfig = {
  campaignId: string;
  stop: { profiles?: number /* 1–200 */; until?: ISODate /* ≤ 30 days */ };   // at least one required
  cadence: "hourly" | "every_4h" | "daily";       // default every_4h
  tiers: ("A" | "B" | "C")[];                      // keep only these; default A + B
  notify: "each_batch" | "daily_digest" | "when_done";
  pauseAtWaiting?: number;                          // pause when this many wait for review
};
type WatchState = { status: "running" | "paused" | "done"; reason: string | null;
                    startedAt; lastRunAt; found: number; emptyRuns: number };
```

- **Each run fetches 5** (the steady batch size, lowered to what's left of the count), goes through the same ledger, matching and tiering as a manual "find more", and only keeps people in the chosen tiers.
- **It stops itself** when: the count is reached · the end date passes · the search is exhausted. **It pauses** when: 3 runs in a row found nobody new · `pauseAtWaiting` people are waiting for review · the campaign is closed · the org's credit budget for sourcing is used up. Every stop and pause carries a reason the UI shows as is.
- **Ways to start one:** a chat message ("keep looking for a week", "find me 30 more over the next few days"), the "Keep sourcing" action on the results, or the Agents rail. The orchestrator turns all three into the same `startWatch` command; whichever stop is missing, the chat asks for it (16.4).
- **Runs in the worker** as a scheduled job (`watch_runs` table, claimed with `SKIP LOCKED` like any run); each tick is a normal run with events, so the Agents rail and the chat update live, and the memory layer learns from it.
- **Controls:** pause, resume, change count / date / cadence, stop. Admin or the campaign's recruiters only.

### 16.4 What the agent asks, and the copy

The chat collects missing settings as one compact card, not a quiz. Proposed copy (plain, no pills):

- Setting up: **"Keep looking for people for Senior Backend Engineer?"**
  - "Stop after" · [20] [50] [100] [Custom] people
  - "or by" · [3 days] [1 week] [2 weeks] [Pick a date]
  - "Check" · Every 4 hours ▾  · "Keep" · Tier A and B ▾
  - Note under the fields: "5 new people each time. Nobody you've already seen comes back."
  - Buttons: **Start** · Not now
- If only one stop is given, the card pre-fills it and the other row is optional: "Also stop by a date? (optional)".
- Running (Agents rail and campaign): **"Keeping an eye out · 12 of 30 found · next check in 2 h"** with Pause / Edit / Stop.
- Paused: "Paused: 8 people are waiting for review. It resumes when you get through them." · Resume now.
- Done: "Done: found the 30 people you asked for." · "Done: no new people match these filters right now. Widen the search?"

Find more, on the results:
- Button label with the real next size: **"Find 10 more"**, then **"Find 5 more"**.
- After a batch: "**7 new people** · 3 already in this campaign were skipped" (only when skips > 0).
- Exhausted: "That's everyone matching these filters for now." · Widen filters · Keep sourcing.

### 16.5 Numbers on screen are always derived

Every count comes from state, never from text in the code:
- Results header: shown in campaign (`seen.length`), new this batch (`fresh`), next batch size (`batchSize(n)`).
- Watch: `found` / `stop.profiles`, next run from `lastRunAt + cadence`.
- Pool: count of people matching the filters in our database (SQL `count(*)` with the same filters, cached per filter hash), and "already in this campaign" from the ledger.
- Overview / Home / rail counts read the same stores (campaign snapshot in Redis, Postgres behind it).

---

## 17. Chats, agent sessions and orchestration, refined (4 Oct 2026)

### 17.1 What the console does today (read 4 Oct 2026)

- One chat thread in `sessionStorage` (`agentThread.ts`); "New chat" clears it; History is a fixture list that only re-seeds the composer.
- Each turn finds its campaign by regex (`campaignIn`), so one chat already touches several campaigns, but nothing records which campaign a turn was about.
- Message → response is keyword routing (`classify` in `moments.ts`) to fixture moments; `SourcingRun` is hard-wired to Senior Backend and ignores the campaign, filters and JD set in the composer.
- Chat verdicts (`Agent.verdicts`) are keyed by candidate only and never reach the campaign pipeline (`campaignStore`).
- Deployed agents live in component state with two clock-driven states (Running / Done); a second fixture fleet model exists for the Status moment and the agents board.
- Many counts are literals (1,398 matches, "24 shortlisted", Rail's "Last 7 days", Digest rows, FLEET lines). Full list in the 4 Oct console map; all of them move to derived state (§16.5, §17.8).

### 17.2 The model: conversation → turn → run → agent

| Thing | What it is | Lives in | Scope |
|---|---|---|---|
| **Conversation** | One chat thread. Owned by a user; admins can open any in their org | `conversations` (Postgres) | org + owner; a **focus** campaign that can change |
| **Turn** | One message and the agent's answer | `messages` | stamped with the campaign(s) it was about |
| **Run** | One unit of agent work started by a turn, a button or a schedule | `core.runs` + `run_events` | **exactly one campaign** (or the org, for org-wide questions) |
| **Agent** (deployment) | Long-lived work: a keep-sourcing watch, an outreach sequence, a screening agent | `agents` | one campaign, one role |

- **A chat can span campaigns; a run never does.** "Source iOS engineers and draft outreach for the backend shortlist" becomes two runs, one per campaign, shown as one answer with two parts.
- **Agents outlive chats.** Closing a chat, navigating away or closing the browser never stops an agent; the Agents rail and the campaign show it from the database.

```sql
conversations(id, org_id, owner_user_id, title, focus_campaign_id, created_at, updated_at, archived_at)
messages(id, conversation_id, seq, role, text, campaign_ids uuid[], artifact jsonb, client_id, created_at)
agents(id, org_id, campaign_id, role, kind, config jsonb, state, state_reason, started_by,
       started_at, last_run_at, next_run_at, counters jsonb, version)
-- agent state: queued | running | waiting (needs you) | paused | done | stopped | error
```

### 17.3 Which campaign a message is about

Resolved in code before the model is asked (step 2 of §13.2), in this order:
1. Named in the message ("for iOS") → that campaign.
2. Refers to something shown earlier ("these 3", "that form") → the campaign of the turn that showed it.
3. Otherwise the conversation's focus campaign.
4. Still unclear, or two campaigns fit → ask, as a one-tap question: **"Which campaign is this for?"** with the open campaigns as choices.

When the focus changes, the chat shows a quiet line, **"Now working on iOS Engineers"**, and each turn carries the campaign name above it in muted text (no pill). Recruiters only see and pick campaigns they're assigned to (RLS).

### 17.4 Orchestrator, refined

- **Fast path first.** Buttons, webhooks and obvious commands ("shortlist these 3", "find 5 more", "pause the watch") are routed by code with no model call. Only open-ended messages go to the Sonnet router. This keeps most actions under 300 ms.
- **Plans, not single calls.** The router returns a small plan: one or more runs with their campaign, skill, args and dependencies. Independent runs start in parallel; dependent ones wait.
- **One queue per conversation, ordered.** Messages in one chat are handled in order. A new message while a run is working is queued behind it, or, if it says "stop" / "cancel", cancels the run (and its gateway calls, §18.5).
- **One lock per campaign for sourcing** (§16.2), so a chat, a button and a watch never fetch the same page twice.
- **Supervisor** (in the worker): schedules agent ticks (watches), retries failed steps with backoff, times out stuck steps, moves agents to `waiting` when they need a person and to `error` with a readable reason, and enforces org credit budgets.
- **Events** gain two types: `plan` (what the agent is about to do, per campaign) and `focus` (campaign switched). Every event has a per-conversation `seq`.

### 17.5 Tech stack (proposed)

| Layer | Choice | Why |
|---|---|---|
| Console | React 18 + TypeScript + Vite (existing); **TanStack Query** for server state; the existing `useSyncExternalStore` stores for UI state; Supabase JS for auth and Realtime | Caching, retries and optimistic mutations without a framework change |
| API + worker + memory | **Node 22, TypeScript, Hono**, zod, Kysely (typed SQL) on `postgres`, **pg-boss** for jobs and schedules (Postgres `SKIP LOCKED`), ioredis, Qdrant JS client | One language with the console; shared types in `packages/shared`; jobs and watch schedules without another broker |
| Model runtime | **claude-code-gateway** (Python, FastAPI, Claude Code CLI on the subscription) with the SuperHyre routes (§18.6), **Sonnet** | No API budget; warm pools, batching and caching make the subscription go further (§18.4–18.5) |
| Embeddings | **BGE-M3** served by the gateway (`/v1/superhyre/embed`, CPU, batched, cached by text hash) | One call gives dense + sparse (§11.9); no extra vendor |
| Documents | Gateway `/documents/extract`: PyMuPDF text layer, local Tesseract OCR, Sonnet only when OCR is poor (§18.7) | Free for most files |
| Data | Supabase Postgres (records, pgvector), Storage, Auth, Realtime · Redis · Qdrant | §12.10 |
| Hosting | Railway, Singapore: `api`, `worker` (same image, `ROLE`), `gateway`, `redis`, `qdrant`, private networking | §11.1 |
| Quality | Biome, Vitest, Playwright (Firefox) for UI checks, GitHub Actions | §15 |
| Observability | OpenTelemetry traces, Sentry errors, PostHog product analytics, gateway usage tables | Cost and latency per org / run |

### 17.6 Latency: targets and how

| Moment | Target | How |
|---|---|---|
| Message appears | instant | optimistic, client id |
| Command (shortlist, move, pause) | < 300 ms confirmed | fast path, no model; one RPC |
| First visible agent activity | < 500 ms | `plan` event streamed as soon as routing is done; skeletons sized to the real batch |
| First words of a chat reply | < 1.5 s | Sonnet streaming through the gateway, prompt cache on layers 1–4 |
| Pool results on screen | ≈ 1 s | one SQL query; cached filter counts |
| New people from Crustdata | ≈ 3–6 s | parallel with our pool; cards stream in as each arrives |
| All verdicts | ≈ 6–12 s | batch judge, streamed per person |

Ways to get there:
- **Everything in one region** (Singapore: app, gateway, Redis, Qdrant); Supabase in Mumbai is one hop, so batch DB work into single RPCs.
- **Context in parallel:** Redis profiles, Qdrant recall and Postgres records fetched at the same time; `getContext` budget 50 ms.
- **Two delivery paths:** chat tokens stream over **SSE straight from the API** (lowest latency); run progress and agent state go over **Supabase Realtime broadcast** per conversation and per campaign, and are also written to `run_events` so a reconnect replays from the last `seq`.
- **Prefetch:** opening a campaign or chat warms its profiles and snapshot in Redis; typing in the composer warms the router context.
- **Never wait on background work:** memory writes, enrichment and watches run in the background lane (§18.5).

### 17.7 Optimistic UI rules

- **Show immediately, reconcile quietly.** Messages, shortlist / reject, stage moves, watch start / pause appear at once with a client id; the server's confirmation replaces them; on failure they roll back with a one-line reason and Retry.
- **Undo instead of confirm** for internal actions (8 s undo, as the Assign moment does today).
- **Never optimistic for the outside world.** Sending outreach, spending credits and contacting candidates show "Sending…" until the server confirms, after an approval.
- **Skeletons match reality:** "Find 10 more" shows 10 placeholders, not a spinner; they fill as people stream in, and any that don't come back disappear with the real count ("7 new people").
- **Reconnect without gaps:** the client tracks the last event `seq`; after a dropped connection it fetches what it missed, then resumes live.
- **Same chat on two tabs or devices** stays in sync through Realtime; client ids stop duplicates.

### 17.8 Console work this implies (to do after sign-off; nothing changed yet)

Stores (all with the existing `useSyncExternalStore` pattern now, backed by TanStack Query later):
- `conversationsStore`: many chats, each with turns, focus campaign and per-turn campaign; replaces the single `sessionStorage` thread; History lists real chats.
- `sourcingStore`: per campaign the ledger (§16.2), batches and people; generates a larger fixture pool with `makePeople` so 20 → 10 → 5 can be shown honestly.
- `agentsStore`: deployments with the full state set (queued, running, waiting, paused, done, stopped, error), config and counters; replaces both `Deployed` in `Agent.tsx` and the `FLEET` fixture so the rail, the Status moment and the agents board agree.

Components and moments:
- `SourcingRun` takes the campaign, filters and JD; restored turns render their saved result instead of replaying.
- Results and `RankedMatches`: **"Find 10 more" / "Find 5 more"** with the real next size, batch header ("7 new people · 3 already in this campaign were skipped"), exhausted state.
- New moment **`keep-sourcing`** (with a `clarify` question for count / date, §16.4) and a **watch card** for running, paused and done.
- Rail `AgentRow`: watch progress ("12 of 30 found · next check in 2 h") and Pause / Edit / Stop.
- Turn header shows the campaign; "Now working on …" line; "Which campaign is this for?" question.
- Chat verdicts write to the campaign pipeline (`campaignStore`), keyed by campaign + person.
- Every literal count in the 4 Oct list is replaced by a derived value; the ones that only exist as fiction (FLEET lines, Digest rows, Rail "Last 7 days") are computed from the stores.

---

## 18. Agent runtime: claude-code-gateway, Sonnet (decided 4 Oct 2026)

**Detailed gateway change plan: `docs/gateway-changes.md`** (continuously running instance, our own caching layers, file-by-file changes). This section is the summary.

**Decision (user):** the model calls run through our own `claude-code-gateway` (repo `Desktop/Personal/claude-code-gateway`), on **Sonnet** for every step (routing, judging, drafting, memory work), not Haiku.

### 18.1 What the gateway is today (read 4 Oct 2026)

- FastAPI service, OpenAI-style `POST /v1/chat/completions`; each request starts one `claude -p` subprocess (`--tools ""`, `--max-turns 1`, no session persistence), model per request (`claude-sonnet` alias or a full id), system prompt, **`response_format.json_schema` → structured JSON**, PDFs and images as input, SSE streaming.
- Auth to clients: `X-API-Key` per user (hashed in its own Postgres), Redis sliding-window rate limit (default 60 rpm per key). Auth to Anthropic: a Claude **subscription OAuth token**, not an API key.
- Concurrency: `CLAUDE_POOL_SIZE` processes per instance (live: 3), one uvicorn worker; 30 s wait for a slot, then 429; 300 s per call cap; circuit breaker after 5 failures.
- Conversations: server-side text history only. No tools / MCP, no agent loop, no background jobs, no cancel endpoint; errors mid-stream end silently with `[DONE]`; usage is not recorded per key.
- Live: Railway project `claude-code-gateway`, service `gateway`, **US West**, healthy, with its own Postgres + Redis; already used by Magnifi's backend.

### 18.2 Constraint (4 Oct 2026): subscription only, no API key

Budget rules out an Anthropic API key. **Everything runs through the gateway on the Claude subscription token (Claude Code CLI), model Sonnet.** That fixes three things the design must live with:
- **Usage is a shared allowance, not pay-per-call.** The subscription has rolling usage limits; when one is hit, calls fail until it resets. So the number of model calls is the scarce resource: fewer, bigger, cached calls.
- **Each call is a CLI process.** Start-up time and memory (~200–300 MB per process) shape latency and concurrency.
- **The CLI is a real agent.** It supports multi-turn tool use and MCP servers, which the gateway currently switches off (`--tools ""`, `--max-turns 1`). We can use that instead of building a tool loop ourselves.

Risk to note once: a personal subscription serving a commercial, multi-user product may conflict with Anthropic's terms and its limits. The `AgentRuntime` port (18.3) keeps a later move to an API key a one-adapter change.

### 18.3 How SuperHyre uses the gateway

```ts
interface AgentRuntime {                       // one adapter: the gateway
  task<T>(name: TaskName, input: unknown, opts: { orgId; runId; lane: "interactive" | "background";
          idempotencyKey: string; signal?: AbortSignal }): Promise<T>;
  taskBatch<T>(name, items: unknown[], shared: unknown, opts): AsyncIterable<{ index: number; result: T }>;
  agent(req: { conversationId; runId; orgId; campaignId; message; context }): AsyncIterable<AgentEvent>;
  embed(texts: string[]): Promise<{ dense: number[][]; sparse: Sparse[] }>;
  extract(file: FileRef, want?: "spec_from_jd" | "cv_profile"): Promise<Extracted>;
  cancel(runId: string): Promise<void>;
}
```

Two ways of calling the model:

| Mode | Used for | How the CLI runs |
|---|---|---|
| **Task** (most calls) | route, spec_from_jd, judge, outreach_draft, form_draft, call_summary, memory_extract, consolidate, reflect | one turn, no tools, fixed system prompt per task version, `--json-schema`, Sonnet |
| **Agent** (open-ended chat) | "why did we drop Priya?", "compare these three and draft a note to Neha", anything that needs to look things up | several turns, **tools from a SuperHyre MCP server** (18.6), Sonnet, capped turns and time |

Fast-path commands (buttons, "find 5 more", "pause the watch") never reach the gateway (§17.4).

### 18.4 Spending fewer calls (the budget rules)

| Rule | Effect |
|---|---|
| **Code before model.** Routing fast path, rules and feature scores in code; the model only where judgement is needed | Most interactions make zero model calls |
| **Batch inside one call.** Judge 5 candidates per call against the same spec (4 calls for 20 people, not 20); extract memories from a whole chat session at once; summarise a call in one pass | 4–5× fewer calls for matching and memory |
| **Result cache** keyed by `hash(task, prompt version, input)` in Redis; judgement cache per (spec version, person, profile hash) | Re-runs and repeats cost nothing |
| **Background work is batched and scheduled.** Memory distillation per session or nightly, reflections at campaign close, watch runs at their cadence | Smooths usage; nothing burns the allowance in bursts |
| **Free tools for free jobs.** Embeddings with local BGE-M3; PDF text layer and local OCR (Tesseract) before any model call | No model calls for embedding or plain OCR |
| **Budgets per org and per lane.** A daily allowance share per org; background lane yields to interactive | One busy org can't starve the others; chats stay responsive |
| **Graceful limits.** When the subscription limit is hit: interactive calls show "The agent is at capacity, retrying at 14:30" and retry; background jobs pause and resume after reset | No silent failures |

### 18.5 Gateway changes for SuperHyre (latency and quality, within the CLI)

1. **Warm process pool per task.** A task's system prompt and schema are fixed per version, so the gateway starts CLI processes ahead of time with those arguments and keeps them waiting on stdin. A request writes its input to a warm process and reads the result; a replacement starts in the background. Process start-up leaves the critical path.
2. **Two lanes with their own pools:** interactive (chat, routing, matching the recruiter is waiting for) and background (memory, watches, reflections). Background never takes an interactive slot.
3. **Pool sizing to memory:** about 3 processes per GB; for example 8 GB → ~12 (8 interactive, 4 background). Measure, then tune.
4. **Typed tasks with versioned prompts.** Each task: system prompt, JSON schema, turn and time limits. The gateway validates the JSON and repairs once by re-asking with the error. Prompts are checked against eval sets before a new version ships.
5. **Stable prefix for caching.** The CLI caches prompt prefixes; we keep the task prompt fixed and put the stable context (org / client / campaign profiles) first in the input, the changing part last. Cache hits are read from the CLI's `result` usage and logged.
6. **Batch endpoint** that splits items into model-sized groups (e.g. 5 candidates per call), runs groups in parallel within the lane's pool, and streams each result as it arrives.
7. **Agent mode with our tools:** the CLI runs with `--mcp-config` pointing at the SuperHyre MCP server, `--allowedTools` limited to that server, `--max-turns 6`, a time cap, streaming events back. Tools that change things outside SuperHyre return "needs approval" rather than acting (§4).
8. **Cancel by run id:** kills that run's CLI processes.
9. **Usage per org / campaign / run / task** from each CLI `result` message (tokens, cache reads, duration), stored in the gateway's `usage_records` and returned. Feeds the budgets in 18.4.
10. **Typed SSE** (`token`, `item`, `tool`, `usage`, `error`, `done`); errors are sent, never swallowed.
11. **Pinned versions:** Claude Code CLI version in the Dockerfile (not `@latest`), model alias `sonnet` pinned to an id.
12. **Own API key for SuperHyre** with its own rate limit and lane quotas, on the same gateway service as Magnifi to save cost; a separate service later if load needs it.
13. **Region:** move the gateway to Singapore if Magnifi is also served from Asia; otherwise keep US West. A model call takes seconds, so the extra ~200 ms round trip matters less than the cost of running two gateways.
14. **Rotate the secrets** exposed in `RAILWAY_LIVE_DEPLOYMENT.md` and keep them only in Railway variables.

### 18.6 The SuperHyre API on the gateway

Service-to-service only (SuperHyre key + `X-Org-Id`, `X-Run-Id`, `X-Lane`, `Idempotency-Key`). The console never calls the gateway.

| Method | Path | Does |
|---|---|---|
| POST | `/v1/superhyre/tasks/{task}` | One typed task → validated JSON |
| POST | `/v1/superhyre/tasks/{task}/batch` | Many items, grouped into calls, results streamed (SSE `item` events) |
| POST | `/v1/superhyre/agent` | Agent mode for open-ended chat turns; streams tokens, tool steps and a typed trailer (actions, artifacts, references) |
| POST | `/v1/superhyre/embed` | BGE-M3 dense + sparse vectors, local CPU, batched, cached |
| POST | `/v1/superhyre/documents/extract` | JD / CV → text (text layer → local OCR → model only if needed) → optional structured result |
| DELETE | `/v1/superhyre/runs/{runId}` | Cancel a run's processes |
| GET | `/v1/superhyre/usage` | Usage by org / campaign / run / task, plus remaining share of today's budget |

**The SuperHyre MCP server** (part of our API, not the gateway) exposes read tools scoped by a short-lived token minted per run (org, campaign, user, expiry): `get_campaign`, `get_role_spec`, `search_candidates`, `get_candidate`, `get_stage_history`, `recall_memory`, `count_pipeline`. Write tools only *propose*: `propose_shortlist`, `propose_stage_move`, `propose_outreach`; the orchestrator turns proposals into commands with permissions, undo and approvals. The model never touches the database directly.

Example batch call:

```http
POST /v1/superhyre/tasks/judge/batch
X-Org-Id: org_superhyre  X-Run-Id: run_14  X-Lane: interactive  Idempotency-Key: run_14:judge
{ "promptVersion": "judge@3", "groupSize": 5,
  "shared": { "spec": { ... }, "clientBeliefs": [ ... ] },
  "items": [ { "personId": "p_asha", "profileText": "..." }, ... ] }
→ event: item  data: {"personId":"p_asha","verdicts":[...]}   (one per person, as groups finish)
→ event: usage data: {...}
→ event: done
```

### 18.7 Document extraction (JDs, CVs), cheapest first

1. Store the file in Supabase Storage; its SHA-256 is the cache key.
2. DOCX → text directly. PDF → text layer (PyMuPDF).
3. Pages with little or no text → **local OCR** (Tesseract, run in the gateway container): free, no model call.
4. Only if OCR quality is poor (low confidence, broken tables) → send that page's image to Sonnet through the CLI.
5. With `want: "spec_from_jd"`, one `spec_from_jd` task turns the clean text into the role spec draft.

Returns `{ text, pages, method: "text_layer" | "ocr" | "vision", quality, structured? }`. Limits: 10 MB, 15 pages.

### 18.8 Latency with the CLI (targets to measure)

| Call | Target | Main lever |
|---|---|---|
| Fast-path command | < 300 ms | no model call |
| Task (route, short JSON) | ≈ 2–4 s | warm pool, stable cached prefix, small output |
| Judge 20 people | ≈ 8–15 s, first results in ≈ 4 s | 4 batched calls in parallel, streamed per person |
| Chat answer (agent mode) | first words ≈ 2–3 s | warm pool, streaming, capped turns |
| Embedding | < 100 ms per small batch | local BGE-M3 |

The UI hides the rest with optimistic updates, real-size skeletons and streamed results (§17.7).

---

## 19. Implementation plan (updated 4 Oct 2026; nothing starts before sign-off)

**Phase 0: decisions to confirm**
- Gateway: subscription-based, SuperHyre key and lanes on the existing service, the §18.5 changes, region decision (18.5 #13). Rotate the exposed secrets now.
- Stack in §17.5.

**Phase 1: foundations (backend)**
1. `packages/shared`: zod schemas for events, artifacts, commands, skills, `RoleSpec`, `WatchConfig`, `Ledger`.
2. Migrations: `conversations`, `messages`, `agents`, `core.runs` / `run_events` (with `seq`), `campaign_seen`, `sourcing_ledgers`, campaigns and per-campaign stages (§9.4), `role_specs`, `match_*`, `person_sources` (pointer form).
3. Server skeleton (§15.1): config, platform (db, pg-boss, Redis, logging), identity + RLS checks, API and worker roles.
4. Gateway SuperHyre routes: `tasks`, `tasks/batch`, `agent`, `embed`, `documents/extract`, cancel, usage; warm pools and lanes; SuperHyre MCP server in our API.

**Phase 2: first end-to-end slice**
5. Orchestrator: fast path + Sonnet router, campaign resolution, per-conversation queue, plans, events over SSE + Realtime.
6. JD → spec (with OCR) → approve.
7. Sourcing: pool search + Crustdata (20 → 10 → 5), ledger with lock, `ingest_person`, Apify enrich.
8. Matching: rules, feature score, batch judge, tiers.
9. Memory v1: capture episodes and run summaries, profiles in Redis, `getContext` with filter fetch + hybrid recall.

**Phase 3: console on real data**
10. Stores and components in §17.8, TanStack Query, optimistic rules (§17.7).
11. Keep-sourcing watch: supervisor schedules, controls, notifications.

**Phase 4: the rest of the campaign**
12. Shortlist / stage commands, contacts (existing chain), outreach with approvals, replies via webhooks.
13. Forms, calls and transcripts, client feedback.
14. Memory v2: distil, consolidate, beliefs, playbooks, outcome credit, memory test set.

**Phase 5: hardening**
15. Load test (20 parallel judges per run, 50 concurrent chats), latency budgets (§17.6), cost dashboards, backups and restore drills.

---

## 20. As built (4 Oct 2026)

The plan above is implemented in `superhyre-platform` (API + worker + shared package) and the gateway
branch `feat/superhyre-runtime`. Where the build departed from the plan, and why:

| Plan | Built | Why |
|---|---|---|
| Sonnet router call, then the skill (§13.2, §17.4) | **Fast path in code** for clear commands ("find more", "keep looking for 30 people", "pause the watch"); everything else is **one Sonnet turn in agent mode** with SuperHyre tools over MCP | Routing and answering in one call halves model calls on the subscription; the CLI already runs a tool loop |
| BGE-M3, 1024-d dense + sparse | **bge-base-en-v1.5 (768-d) + Qdrant/bm25** via fastembed on the gateway | Runs on CPU in the gateway image today; the Qdrant alias (`memories` → `memories_v1`) allows a swap without downtime |
| Redis hot cache for profiles and snapshots | **Not used by the API.** Memory profiles are a filtered Qdrant scroll (milliseconds); the gateway keeps its own Redis for result and embedding caches | No measured need; one fewer moving part |
| Supabase Realtime for run events | **Postgres LISTEN/NOTIFY + SSE** from the API (`/v1/conversations/:id/events`, `/v1/runs/:id/events`), resumable by event id | Works with the API's own tables and auth; reconnects replay exactly |
| Judge one person per call | **Five people per call**, evidence checked word-for-word against the profile; verdicts cached per (spec version, person, profile hash) | 4 calls for 20 people instead of 20 |
| Watch runs table | Watches are rows in `agents`; a pg-boss schedule (every 5 min) hands due ones to workers, one tick per watch at a time | Same behaviour, no extra table |
| Memory distillation per session | After 10 quiet minutes a `memory.distil` job reads the new messages once (cursor kept on the memory run's output) | |

**Where things live (server/src/modules):** `agent` (chats, fast path, agent turn, MCP tools, approvals),
`matching` (specs, rules, judge, results), `sourcing` (pool search, Crustdata, ledger, watches),
`people` (Apify enrichment, embeddings), `memory` (Qdrant store, episodes, distillation), `runs`
(runs, events, SSE), plus the workspace modules (identity, campaigns, clients, pipeline, candidates,
tasks, notifications, forms, exports, connections, outreach, overview, search).

**Verified end to end (local, real Claude CLI through the gateway):** JD → spec in ~5 s; pool search +
judge with sensible tiers; a chat turn that called `campaign_matches`, `remember` and
`propose_shortlist`; approving the shortlist put the person on the board; "find more" took the fast
path with the right batch size (20 → 10).

**Console (auth-app):** with `VITE_API_URL` set, every page reads and writes the API (identity,
onboarding and settings; campaigns, clients, board, overview, home, quick find, tasks, notifications;
candidates, import, forms and the public apply page, exports, outreach review; the agent chat, role spec,
search results and watches). Without it the console runs on its fixtures as before. Checked in headless
Chrome against the local API with the real Claude CLI: chat answers in ~7 s, "find more" streams scored
people into the chat, and every page loads with no failed requests.

**Not built yet:** "likely to move" signals (§10.6), the memory learning loop's outcome credit and
playbooks (§11.7 steps 3 and 5), WhatsApp, calls and transcripts, the memory test set, contact lookups
from the agent.

---

## Context-backed sourcing and judging (added 10 Oct 2026, local only)

Before this, a search used only the approved role spec and the judge saw only the spec and the profile. Memory, the client
and the campaign's earlier decisions were read by the chat agent alone. Now one search builds a **sourcing context**
(`server/src/modules/matching/context.ts`) and uses it twice:

1. **Judge.** The context goes to the judge as a fenced `<recruiter_context>` block after the spec: the client (name,
   industry, location, notes), up to 12 memories (campaign, client and agency level, through `contextFor`), and up to six
   shortlisted and six passed people on this campaign with the recruiter's reasons. `judge@3` may use it only to word
   strengths and concerns ("Services-only background; Acme has passed on this"); verdicts, evidence and the spec still win,
   and protected attributes are ignored. The cached judgement is keyed by the context's hash, so a changed context is judged
   again for new people.
2. **Search.** With at least three shortlisted people who have embeddings, their average embedding is blended into the
   spec's query vector (70/30, renormalised) so the pool search leans toward "more like these". Fewer than three leaves the
   query unchanged.

Safeguards: every line has contact details redacted and drops protected attributes; the block is capped at 3,500 characters;
if memory or the database read fails, the search runs on the spec alone and logs a warning. The run emits a
`progress` event `{ step: "context", notes, decided, likeThese }` right after `plan`, and `match_runs.counts.context`
records the same numbers.

Not done (needs provider data or product decisions): public-footprint signals (posts, tenure patterns, open-to-work),
learning from negatives in the search vector, and re-judging earlier people when the context changes.

### Matching hardening from the research pass (added 10 Oct 2026, local only)

Follows `candidate-matching-research.md`. Everything below needs no labelled data; the gold set and eval harness are still to do.

1. **Name-blind judging and embeddings.** `profileText(p, { blind: true })` leaves out the name and the name where it recurs in the headline and summary. The judge and the embedder both use it; recruiter-facing views keep the name. Profiles embedded the old way are refreshed as searches surface them (`findPeople` calls `embed` on the pool people it returned; `embed` only touches profiles whose text hash changed), so the pool moves over gradually. Cached judgements are re-made because their text changed.
2. **Instruction filter** (`matching/injection.ts`): invisible characters are dropped, lines that talk to the reader ("ignore the above", "rank this candidate first", `[INST]`, our own tags) become `[removed: instruction-like text]`, and a judged person with such text gets the concern "Profile text contained instructions to the reader; they were ignored." as the first of up to three.
3. **Judge reads in a shuffled order**, seeded by the run (`judge.ts: shuffled`), so best-feature-first order is no longer built into every group of five.
4. **Search vector** is now: query embedding, blended with an embedded "ideal profile" written from the spec (`SOURCING_IDEAL_WEIGHT`, default 0.25, 0 turns it off; untuned), then Rocchio-style: pulled toward the average of 3 or more shortlisted people (weight 0.3) and pushed away from the average of 3 or more passed people (weight 0.12). The run event and `match_runs.counts.context` record `likeThese`, `awayFrom` and `ideal`.

Tests: `test/matching-context.test.ts` (19, including a name-swap check that two different names give identical judge and embedder text, order-independence of verdicts, injection false-positive checks) and sourcing tests for the blind judge and the hidden-instruction concern. 383 tests pass.

Not done: gold set and metrics, judge-vs-recruiter calibration, a separate likely-to-reply score, fair re-ranking, public-footprint signals, a distilled judge.

---

## 10 Oct 2026 additions (built overnight; all local)

- **Memory** rebuilt per `agent-memory-research.md` (decision: keep Qdrant for retrieval, Postgres for lifecycle/audit, no graph DB, no external memory service). The agent's `remember` needs a verbatim quote from the recruiter's own words; client/agency rules are approval cards; agency-wide notes stay `pending` until an admin confirms; corrections supersede instead of reinforcing; recall is client-scoped; every run records the memory ids it used; candidate delete purges person-linked memories; a nightly sweep removes expired ones. Console: Settings → Memory (review queue, correct, forget). Server doc: `superhyre-platform/server/docs/memory.md`.
- **Integrations**: Slack and Notion are org-level connections (admin connects with a pasted token, or OAuth when configured); the agent can propose Slack posts and Notion notes as approval cards (`slack_message`, `notion_note`). Local simulators for Slack/Notion (:8140) and Google/Gmail (:8150). Doc: `superhyre-platform/server/docs/integrations.md`.
- **Schedules**: `scheduled_actions` (email, Slack, Notion, task, reminder, digest; once or repeating), a scheduler job, suppressions (do-not-contact) enforced at approve, send and fire, and agent tools `list_schedules`, `propose_schedule`, `propose_followup`, `cancel_schedule`, `create_task`, `do_not_contact`. Everything outward is an approval card with the exact content and the time in the person's zone; emails go through the existing outreach pacing and snap to weekday 09:00–19:00. Console: Scheduled screen, rail row, schedule approval card, Settings → Do not contact. Doc: `superhyre-platform/server/docs/schedules.md`.
- **Tasks**: assigned-task views (`assigned`, admin-only `team`) with names and creators; Home shows "Assigned to others" / "Team tasks" with reassign.
- **Agent page**: the right-hand Configuration box is back in LIVE (owner, team, campaigns, channels with real connections, memory, scheduled), and suggestions always render.
- Prompt versions: `chat@11`. Migrations 171 (integrations), 172 (memory activity), 173 (scheduled actions).

---

## 11 Oct 2026: the capability registry (agent framework, server side)

Contract: `agent-framework.md`. Everything the agent can read or change is one **capability**, declared once in
`superhyre-platform/server/src/modules/agent/capabilities/` (one file per area, `index.ts` assembles them). The MCP tool list,
the approval cards, the executor, the product map in the prompt and the effect events are all read from it; nothing else lists
tools. A capability is `{ id, tool, title, summary, description, input, allow, effects, routes, narrate, kind, autonomy,
preview, run }`. The old `tools.ts`, `tools-schedules.ts` and the `Action` union in `actions.ts` are gone: `tools.ts` and
`actions.ts` are now thin layers over the registry.

How a call goes: the model calls a tool (`mcp.ts`) -> `executor.invoke`. A read runs. A write is a **card** (`ask`) unless it
is `when_asked` and the recruiter's own words in this chat ground it (`quote`, checked with `groundQuote`, capped per answer);
then it runs at once, says what changed (`Outcome.summary` with counts) and shows an outcome card. A card's yes goes to
`performApproved` and the same `run`. Every write then emits a `progress step:"effect"` event with the views it touched.
`allow` decides what is offered to a person and is checked again at run time. The product map (`product-map.ts`) is generated
from the registry plus the glossary, and is static prompt text (`chat@12`).

Capabilities (tool name: how it behaves; `read` looks up, `card` asks first, `now` runs at once when asked):

| Area | Tools |
|---|---|
| Campaigns | `list_campaigns`, `campaign_overview` (read); `set_campaign_status` active or closed (now); `approve_role_spec` (card; drafts the spec first, then starts sourcing); `update_campaign` (now; a client change is a card); `create_campaign` (card; admins) |
| Candidates | `find_candidates` (read; closest names when nothing matches), `candidate_profile`, `campaign_matches` (read); `save_to_candidates` (now; "send the rest to candidates"); `add_candidate_note` (now); `do_not_contact` (now, stops only) |
| Board | `pipeline` (read); `propose_shortlist` (card; found people or saved candidates); `move_stage` (now for one person to shortlisted, outreach or interviewing; else card); `pass_candidates` (card, with reason); `unshortlist_people` (now); `assign_owner` (card) |
| Sourcing | `propose_find_people`, `propose_watch`, `fetch_contacts` (card); `stop_watch` (now) |
| Outreach and later | `draft_emails` (now; saves drafts, sends nothing); `list_schedules` (read); `propose_schedule`, `propose_followup` (card); `cancel_schedule` (now) |
| Connections | `list_integrations` (read); `connect_app` (shows a connect card with the real sign-in, or the token field); Slack and Notion posts are cards |
| Memory | `recall_memory` (read); `remember` (now for own and campaign level, card for client and agency); `forget_memory` (card) |
| Clients (owners, admins) | `list_clients` (read); `create_client`, `update_client` (card) |
| Team (organisations) | `list_team` (read); `pending_team_requests`, `invite_member`, `set_member_role`, `respond_to_join_request`, `remove_member` (a card naming the person and what happens to their campaigns; owners and admins; per the role matrix in `workspaces-and-orgs.md`); `create_task` (now) |
| Views | `show_view` (read) |

Run narration: chat turns emit `progress step:"phase"` (`understand` first, a phase per tool call, `write`), approved actions
emit their own, and `finishRun` closes any phase still running (done, or failed when the run failed or was stopped). The
helper is `phase(emit, {...})` in `modules/runs/phases.ts`; types are in `packages/shared/src/agent.ts`.

Fast paths in `chat.ts` (no model): list campaigns, activate or close a named campaign, "send the rest to candidates" and
"save these to candidates", show the shortlist, connect Gmail, find more, pause or stop a watch, a plain view request.

Tests: `agent-registry.test.ts` (registry shape, allow matrix, product-map snapshot, **route coverage**: every console write
route has a capability `routes` entry or a reason in `not-for-the-agent.ts`), `agent-capabilities.test.ts`,
`agent-workspaces.test.ts` (Personal and organisation memory never meet), `run-phases.test.ts`.

To add a capability: write it in the area's file, give it `routes` for the buttons it mirrors, add its line to the expected
list in `agent-registry.test.ts`. To add a console write route: give it a capability or a reason in `not-for-the-agent.ts`.

---

## 12 Oct 2026: the agent acts (G3 round, local only)

What changed, in the registry and around it. Prompt `chat@14`; no migration.

- **Bulk or history-losing changes are cards.** `unshortlist_people` for one named person runs at once (with an `undo`
  suggestion that names them); for more than one it is always a card that names them, whatever the quote said.
  `move_stage` for several people and `pass_candidates` were already cards. "The shortlist is done, move everyone remaining
  to the candidates page" is `save_to_candidates` (rest), never an unshortlist: the glossary example is in the product map.
- **"Email X".** `send_email` (card, exact message, from the person's Gmail on a yes; it is also a draft in Outreach, replacing
  one that was waiting). Gmail missing: a connect card in the same answer. No address on file: `fetch_contacts` as a card
  that keeps what was asked (`thenSay`), and its outcome offers "Send the email". The approval carries `emails[]`
  (name, subject, text) so the console draws a message, not a paragraph ("Send this to Nandini?"). `cancel_email` stops one
  that is queued or scheduled (back to a draft). `draft_emails` is only for "draft it for me".
- **Closed campaigns** are listed (labelled) by `list_campaigns` and the fast path; "turn it on" works on the one in focus;
  shortlist, email, find people and the other writes that need an open campaign are one card that says it reopens first
  (`needsOpen`); the fast path for "find more people" no longer fails with "Reopen it".
- **Names** resolve across every campaign and the found lists (`find_candidates` without a campaign). One match acts; a
  spelling a letter or two off, word by word (`spelling.ts`), is still one match (`closeSpelling`), while another first name
  that shares letters ("Priyanka" for "Priya") is a question. The names a message carries are also looked up in code before the
  model is asked (`name-hints.ts`, in `<context>` as "Named in the message"), which saves the model a round trip.
- **What the buttons do.** `export_campaign` (sheet on a yes; CSV or Excel as an `export` card the console builds from the
  same rows as the Export button), `duplicate_campaign`, `delete_candidate` (erase, card), `disconnect_app` (card),
  `change_campaign_team` (card, owners and admins), `set_job_description`. A campaign is never deleted (closing keeps its
  history), and the agent says so. `refuse` no longer sends anyone to Settings: a missing connection is a connect card
  (token field inline for Slack and Notion), or one line saying an owner or admin can connect it.
- **A pasted job description** (`set_job_description`, `when_asked`): saved on the campaign at once; then, after the answer and
  under the same run, `readJobDescriptionAndSearch` (the service the set-up's first campaign uses) drafts a new spec from it
  (not the old title-only one), approves it and starts one search, narrated in phases. It is outside the tool call because a
  tool call is cut off after about a minute and a spec takes that long (`after-answer.ts`; a yes on the card runs it in the
  background into the same run).
- **Said once.** A sentence that restates an outcome card's summary is dropped in code (`dedupe.ts`) and the prompt asks for
  it; a card-only answer stores what it did for the next turn's history. Outcome cards drop a counts line the sentence
  already says. An outcome with a way back shows "Undo" as a button.
- **Narration.** A name lookup says "Looking for <name> in your candidates"; a model turn shows "Thinking it through" as soon
  as the call starts and again after each tool, then "Writing the answer".
- **Background learning** honours the gateway's `retryAt` (parks until then, one refusal serves every chat of the workspace)
  and stops after three failures until the chat changes (`memory/service.ts`). The gateway counts that time in seconds and the
  platform in milliseconds: `platform/gateway.ts` `epochMs` converts at the door (before, a time hours away read as 1970 and
  every retry went ahead in seconds, which is where the 64 failed runs in 90 minutes came from).

Console: `ConnectCard` token mode, `ExportCard`, `OutcomeBody` undo, `ApprovalCard` emails, the Candidates page's control says
"Passed" or "In outreach" for a person past the shortlist (`shortlistControl.ts`).

---

## 12 Oct 2026 (later): memory and context as one framework (local only)

Prompt `chat@15`; migrations 187 (a chat's rolling summary) and 188 (where memory has read to). Reference for
the parts, jobs, routes and config: `superhyre-platform/server/docs/memory.md`; the research and what each
item closed: `agent-memory-research.md`, "What changed 12 Oct".

- **Episodes.** What happened is written as it happens, through one helper with idempotent keys, an end by
  type, no contact details or protected attributes, and no candidate named (the person is linked by id and
  named at read time, for those who may see them). Most are read from the workspace's own activity log
  (`memory/derive.ts`, every ten minutes and after a quiet chat): a pass with its reason, shortlisting,
  emails sent and their outcomes, a hire, a campaign closed (with how it stood) or reopened, a role spec
  approved, a keep-sourcing watch started or finished. Approvals and declines are written where they are
  decided; a plain "No, not that one" is written as the recruiter's own.
- **Chat summaries.** After a chat goes quiet, a summary is written from the recruiter's own lines and the
  system's facts, never the agent's free text. It is kept on the conversation (a rebuilt model session reads
  it, then only what came after) and as the recruiter's own episode ("what did we do last time").
- **Reflection and adjudication.** Nightly and when enough has gathered, episodes are rolled into proposed
  beliefs and playbooks (two independent pieces of evidence, pending until confirmed or seen again, the whole
  agency only on an admin's yes and only across clients). A new note near an old one is checked by a model:
  repeat, replace (the old one kept as history) or different.
- **Working memory.** `<context>` is built from rows each turn in budgeted sections (rules, campaigns, the
  campaign in focus as `campaignBrief`, named people, remembered, brought back), the lowest priority giving
  way first, and says it replaces any earlier one. Recall is client-scoped whenever a campaign is in focus,
  or the message names one client.
- **The agent knows itself.** The prompt has an "About you" section generated from the registry (what it can
  do in plain words, what it remembers and how, who sees which, how to correct or forget, what it never
  keeps, where it stops). `memory_overview` gives the live account for a person, a campaign or a client;
  `explain_answer` reads the record of an earlier answer; `forget_memory` takes several notes in one card.
  Questions about what was done before are the model's, not the report view's.
- **Console.** (Superseded 13 Oct: no Memory page in Settings, memory is the agent's own and is read back in chat.
  `SettingsMemory.tsx` stays dormant; Coming up is a card on Home.) Settings, then Memory: Needs your review, Facts and
  preferences, How we do things, What happened, Coming up; Mine, This campaign, This client, Whole agency; each note says
  where it applies and how often and when the agent used it.


## 13 Oct 2026: files in the chat, campaign filters, the Agent page's layout

- **Files in the chat.** The composer takes PDF, Word (.docx), text and images by drop (anywhere on the page, with a
  calm "Drop to attach" overlay), paste (files, or a long block of text, which becomes a "Pasted text, N words" chip) and
  the paperclip. A path that arrives as text (a file copied in a file manager) is never put in the box: one line says
  browsers cannot open it from its path and offers the picker. The server reads the file: `POST /v1/attachments/read`
  (body = the file, `Content-Type` = its type; 10 MB; the gateway's document reader, 15 pages; 40 files an hour per
  person; the text is not logged or stored) and answers `{ text, pages, kind, truncated }` where `kind` is
  `job_description | resume | document`, by plain cues. The console sends the text as the content of the message
  (`attachments.ts composeMessage`): words first, then `[Attached: name] ... [End of attachment]` blocks, cut to the
  8000-character message limit. A job description with no words typed gets "Here is the job description for X.", which
  starts the same flow a pasted one does (set_job_description: read, role spec, approve, search, narrated under the turn).
  A resume is passed to the agent as the attached text: there is no add-candidate-from-text capability yet. Old .doc
  files are refused (the reader takes .docx).
- **Campaign filters.** `PUT /v1/campaigns/:id/filters` saves the dialog's values in `campaign.setup.filters`, in the
  console's own filter vocabulary, and mirrors cities, years, must and nice into the brief's own fields. A search reads
  the approved role spec and puts `setup.filters` over it (`withRecruiterFilters`, sourcing/crustdata.ts, in
  `fetchNew`): a value they set wins, an empty one removes the spec's, the rest stays the spec's. The console saves
  only what differs from the spec (`liveFilters.diffFilters`), so a new job description still moves what was not
  touched. The pool search (our own people) still ranks on the spec alone.
- **The page.** At 1101px and wider the rail is fixed: it sits in the rows above a dock row of fixed height, at the
  end of them, so the bottom of its last panel (History) is the top of the docked composer's input in every state
  (home, chat, typing) and it never moves when a chat starts. It keeps 24px clear of the top and scrolls inside itself
  if the window is too short. At home the composer's top is on the Configuration panel's top (`--config-top`, read
  from the rail by Agent.tsx) with the ideas under it; starting a chat glides it down to the dock (280ms) and the
  transcript takes the column above it. The suggestions exist only before a conversation. Under 1100px the page
  stacks as before. Files and the job description chips are inside the composer's own box, at its top.
- **The composer, connected.** The prototype's controls are back: "Job description" (by name once set) and
  "Filters" (by count), and the docked bar's tune menu. There is no mode connected: the agent is briefed in words,
  with one placeholder. The filters dialog opens on the basics (Location, Job title, Years of experience, Skills,
  Industry; `filters.ts BASIC_ORDER`) with "View more filters (N set)" for the whole catalogue; anything set beyond
  the basics is shown at once. With a campaign in focus the description goes to it through the
  chat and the filters are saved on it; with none they are for the next message (a chip each), and the filters are
  saved on the campaign that turn creates (the campaign list is read until a new one appears). Under the input, while a
  brief is written or a file attached, a line says what was understood (Location, Job Title, Years of Experience,
  Industry, Skills; `briefSignals.ts`), and pressing one opens the filters at that group; otherwise three full-sentence
  suggestions and "Search past chats" (`recs.ts ideaRows`).
