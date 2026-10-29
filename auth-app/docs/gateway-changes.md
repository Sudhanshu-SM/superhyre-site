# claude-code-gateway → SuperHyre agent runtime: change plan

Status: **plan only**, written 4 Oct 2026. Nothing is changed in the gateway repo until this is signed off.
Repo: `~/Desktop/Personal/claude-code-gateway` (Python 3.12, FastAPI). Summary in `agent-architecture.md` §18.

---

## 0. Decisions

| Topic | Decision |
|---|---|
| Model access | The gateway, on the **Claude subscription token** (Claude Code CLI). No API key: budget. |
| Model | **Sonnet** for every task, pinned to one id. |
| Shape | **Continuously running**: long-lived CLI sessions for chats, warm pre-started processes for tasks, a supervisor that keeps them healthy. |
| Caching | Anthropic's prompt cache (made to hit as often as possible) **plus our own layers**: result cache, entity caches, in-flight de-duplication. |
| Interface | A dedicated `/v1/superhyre/*` API, service-to-service only. |
| Scarce resource | Model calls against the subscription's usage limits. Code first, batch, cache, schedule. |

---

## 1. Facts this plan is built on (verified 4 Oct 2026)

From the Claude Code docs (code.claude.com/docs: headless, agent-sdk streaming input, prompt-caching, env-vars, cli-reference) and the local CLI 2.1.289:

1. **One process can serve many turns.** `claude -p --input-format stream-json --output-format stream-json` accepts user messages on stdin as NDJSON for as long as it runs ("realtime streaming input"). This is how the Agent SDK's `ClaudeSDKClient` keeps a persistent session: queued messages, interruption, context kept across turns. Each turn ends with a `result` message (`result`, `session_id`, `usage`, `total_cost_usd`, `duration_ms`, `num_turns`, `is_error`, `subtype`; `structured_output` when `--json-schema` is used).
2. **Prompt caching is automatic and prefix-based.** Each request re-sends system prompt → project context → conversation; the API reuses the longest identical prefix. A change anywhere in the prefix recomputes everything after it. Model switches, tool-set changes, MCP servers connecting, compaction and CLI upgrades invalidate it.
3. **TTL on a subscription:** the main conversation (interactive, `-p`, SDK turns) gets a **1-hour** cache by default within plan usage; set it explicitly with `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` (v2.1.242+). Subagents and other helpers get 5 minutes unless `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL` is set.
4. **Cache scope:** effectively one machine + one working directory (the prefix embeds the working directory, platform, auto-memory paths and a git snapshot). **Parallel sessions in the same directory build matching prefixes and read each other's cache.** So every process of a kind runs in the same empty, non-git directory with the same settings.
5. **Cache visibility:** `usage.cache_read_input_tokens` / `cache_creation_input_tokens` (and `cache_creation.ephemeral_1h_input_tokens`) in every `result`.
6. **Structured output:** `--json-schema` puts the parsed object in `result.structured_output`; on refusals or limits the text comes back in `result` instead, so we still validate.
7. **Tools:** `--tools ""` disables built-ins; `--mcp-config` + `--strict-mcp-config` load only our MCP servers; `--allowedTools mcp__superhyre__*`; `--permission-mode dontAsk` denies anything not allowed; `--max-turns`; `--max-budget-usd`.
8. **Start-up trimming:** `--bare` (skips hooks, LSP, plugin sync, CLAUDE.md discovery), `--setting-sources` limited, `DISABLE_AUTOUPDATER=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `--no-session-persistence` for throwaway task processes.
9. **Auth:** `CLAUDE_CODE_OAUTH_TOKEN` is accepted "for SDK and automated environments"; a replaced token needs a process restart.

**Policy risk, stated once:** the Agent SDK docs say Anthropic does not allow third-party developers to offer claude.ai login or subscription rate limits for their products. SuperHyre on a subscription token is in that territory. The plan keeps an `AgentRuntime` port so moving to an API key later is one adapter. Usage limits for the plan are not published; we measure and design for hitting them (§6.4).

**Not yet verified (spikes in §12):** reusing one task process across tasks with `/clear` in stream mode; CLI cold-start time and memory on Railway; how many concurrent processes one token tolerates; the exact text of a usage-limit result (and whether it includes the reset time).

---

## 2. What the gateway is today, and what's broken

From a full read of `src/gateway` (≈2.9k lines):

- **Per request:** `SessionPool.lease()` (a semaphore, size 3, 30 s wait) → `ClaudeCodeSession` spawns `claude -p --tools "" --max-turns 1 --no-session-persistence --disable-slash-commands`, writes one NDJSON user message, reads stdout, exits. Every call pays process start-up; there are no warm processes.
- **Formatting:** multi-turn chats are flattened into one `<conversation_history>` text message; images and files in earlier turns become placeholders.
- **Wiring:** services on `app.state` read as `Any`; no dependency injection; a module-level DB engine; `create_all` at start-up, Alembic never run.

Defects to fix along the way:

| # | Defect | Where |
|---|---|---|
| 1 | Stream errors are swallowed: the client just gets `[DONE]` | `api/chat._sse_stream` |
| 2 | Circuit breaker never sees streaming failures, and each stream start resets its count | `application/relay.relay_stream` |
| 3 | `stderr` is piped but never read in streaming: a chatty CLI can block | `providers/session.relay_stream` |
| 4 | `stdin` written without `drain()` | `providers/session` |
| 5 | Cost, `session_id`, cache tokens dropped; `structured_output` not read | `providers/codec`, `application/relay` |
| 6 | `gateway_cost_usd_total` never increments; streaming records no tokens | `api/chat` |
| 7 | `UsageService`, `UsageRecord`, `AuditLog`, `ResponseCache`, `BaseProvider`, OTel deps, `claude_warmup_timeout`, `claude_model` unused | various |
| 8 | Error mapping by string-matching `RuntimeError` messages | `api/chat._classify_runtime_error` |
| 9 | CORS is the innermost middleware, so preflights hit auth and get 401 | `main.py` |
| 10 | One DB query per request for API key auth, no cache; rate limiter fails closed on Redis errors | `middleware/auth`, `services/rate_limit` |
| 11 | CLI installed `@latest`; image built without `uv.lock` | `Dockerfile` |
| 12 | `json_object` response format silently ignored; empty `messages` returns 200 | `providers/session`, `api/chat` |
| 13 | Boolean `server_default=text("1")` in `0001` migration (Postgres may reject) | `alembic/versions/0001_initial.py` |
| 14 | `ResponseCache` key truncates image URLs, so different images collide | `infrastructure/cache.py` |
| 15 | `railway.toml` config-as-code deprecated (works until 2026-12-01) | repo root |

---

## 3. Target architecture

```
SuperHyre API / worker ──(private network, service key)──► gateway
                                                              │
        ┌───────────────────────── Scheduler ─────────────────┤  lanes · per-org fair share · budgets · limit state
        │                                                      │
        ▼                         ▼                            ▼
  Conversation sessions     Task workers (warm)          Agent sessions
  1 live CLI per active     pre-started CLI per          CLI with SuperHyre MCP
  chat, multi-turn,         (task, prompt version),      tools, capped turns
  idle-evicted, resumable   one task each, replenished
        │                         │                            │
        └─────────── Process supervisor: spawn · health · recycle · RSS watch · stderr drain
                                          │
           Caches: L1 result (Redis) · L2 entity · L3 in-flight · Anthropic prompt cache (prefix)
           Usage ledger (Postgres) · metrics (Prometheus) · logs (structlog)
           Local services: BGE-M3 embeddings · document extraction (PyMuPDF, Tesseract)
```

### 3.1 Three kinds of model work

| Kind | Used for | Process model | Context |
|---|---|---|---|
| **Task** | route, spec_from_jd, judge (batched), outreach_draft, reply_draft, form_draft, call_summary, memory_extract, consolidate, reflect | **Warm worker**: started ahead of time with the task's fixed system prompt, JSON schema, `--tools ""`, `--max-turns 1`, `--no-session-persistence`; waits on stdin; serves exactly one task; exits; supervisor starts a replacement | Fresh every time: no bleed between orgs or tasks |
| **Conversation** | the console chat's streamed replies | **Long-lived streaming-input session** per active conversation: each new message is appended on stdin; history and cache build up turn by turn | Our context bundle (§13 of the main plan) is sent with each message; the session keeps the chat itself |
| **Agent** | open-ended turns that must look things up ("why did we drop Priya?") | Long-lived session like a conversation, plus `--mcp-config` (SuperHyre MCP, HTTP, per-run token), `--allowedTools mcp__superhyre__*`, `--permission-mode dontAsk`, `--max-turns 6` | Same as conversation; tools read our data through our API, never the DB directly |

Conversation and agent can be the same session type with tools on or off; tools stay fixed for a session's lifetime (changing them invalidates the cache).

### 3.2 Why this is fast

- **No start-up on the critical path:** tasks take a warm process; chats reuse their live session.
- **Prompt cache hits by construction:** fixed system prompt per task version, fixed tool set, one working directory per process kind, pinned CLI and model, stable-first inputs. Live chat sessions only append, so every earlier turn is a cache read.
- **Our caches answer repeats without the model at all.**
- **Batching** cuts calls 4–5× for matching and memory work.

---

## 4. Process model in detail

### 4.1 Common launch settings

```
cwd:  /srv/claude/<kind>          # empty, not a git repo; one per kind (task|conversation|agent)
env:  CLAUDE_CODE_OAUTH_TOKEN=…   CLAUDE_CONFIG_DIR=/data/claude-config
      CLAUDE_CODE_PROMPT_CACHE_TTL=1h   DISABLE_AUTOUPDATER=1
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1   CLAUDE_CODE_MAX_OUTPUT_TOKENS=<per task>
args: -p --input-format stream-json --output-format stream-json --verbose
      --bare --setting-sources "" --strict-mcp-config --model <pinned sonnet id>
```

`--bare` and `--setting-sources ""` stop user / project settings and hooks from changing behaviour or the cached prefix; `--strict-mcp-config` loads only what we pass.

### 4.2 Task workers

- **Pool per (task, prompt version)** with a target number of warm processes, sized from recent demand (e.g. `judge` 4, `route` 2, others 1), within global caps.
- **Spawn ahead:** the supervisor keeps each pool at target. A request takes a warm process, writes one NDJSON user message, reads until `result`, then the process exits and a replacement starts in the background.
- **Optional reuse (only if the spike passes):** if `/clear` works over streaming input, a task process can serve N tasks with a clear between them, keeping its system-prompt cache warm. Even without reuse, parallel same-directory processes share the cache (§1.4), so the system prompt is a cache read after the first call.
- **Batch (`judge`):** items are grouped (default 5 per call) under one shared spec; groups run in parallel on the pool; each item streams back as its group finishes.
- **Validation:** read `structured_output`, validate against the task's schema (Pydantic); on failure, one repair call with the error appended; then a typed error.

### 4.3 Conversation and agent sessions

- **One live process per active conversation**, keyed by SuperHyre `conversation_id`, owned by one gateway instance (in-memory registry; Redis lease for multi-instance later).
- **Per-session lock:** messages are processed in order; a message sent while a turn runs waits, unless it's an interrupt (cancel) for that run.
- **Idle eviction** after 15 min (configurable), also under memory pressure (least recently used first). Evicted sessions keep their transcript (session persistence on, `CLAUDE_CONFIG_DIR` on a Railway volume) and are **resumed** with `--resume <claude_session_id>` on the next message; within the cache TTL the history is a cache read.
- **Recycle** a session after N turns or when its context grows past a threshold: start a fresh one primed with our compact summary (the observation log, §11.9 of the main plan) instead of letting the CLI auto-compact mid-turn.
- **Agent tools:** the SuperHyre MCP server URL and a short-lived per-run bearer token (org, campaign, user, expiry) are written to a per-session MCP config. The token is minted by SuperHyre for each run and validated on every tool call.

### 4.4 Supervisor

- Starts, health-checks and restarts every process; drains `stderr` continuously into logs; enforces per-process timeouts; kills on cancel.
- **Memory watch:** reads each process's RSS; recycles any above a ceiling; refuses new spawns above a global ceiling and sheds background work first.
- **Max age / max turns** per process kind; **auth check** at start-up and when a `result` reports an auth error (token expired → one clear alert, gateway marked not ready).
- Exposes counts per pool, warm vs busy, spawn time, crash rate.

---

## 5. Caching layers (ours) on top of the prompt cache

| Layer | Key | Value | TTL / invalidation | Saves |
|---|---|---|---|---|
| **P · Anthropic prompt cache** | the request prefix | — | 1 h (subscription default, set explicitly); broken by prompt / tool / model / CLI changes | input processing on every call |
| **L1 · result cache** (Redis) | `sha256(task, prompt_version, model, canonical_json(input))` | the validated JSON result + usage | per task (e.g. route 10 min, judge 30 days, spec_from_jd 30 days, drafts 1 day); bumping `prompt_version` invalidates | whole calls on exact repeats |
| **L2 · entity caches** | `judge:{spec_version}:{person_id}:{profile_hash}` · `doc:{file_sha256}:{want}` · `emb:{model}:{text_sha256}` · `mem_extract:{session_id}:{last_seq}` | per entity | change of spec version, profile, file or text | repeat judgements, re-extraction, re-embedding |
| **L3 · in-flight de-duplication** | same key as L1 | a shared future / Redis lock | while the call runs | two identical requests at once pay once |
| **L4 · warm context** | `ctx:{org}:{campaign}` (built by SuperHyre, §11 of the main plan) | profiles, snapshot | rebuilt on change | not a gateway cache; listed so prompts stay stable-first |

Rules:
- **Canonical inputs:** sorted keys, trimmed strings, no timestamps or request ids inside inputs, so equal work hashes equally.
- **Stable-first prompts:** task prompt (fixed) → org / client / campaign profiles → shared batch context (the spec) → the item. Same order every time.
- **Never cache** errors, refusals or partial streams; cache only validated results.
- **Per-org namespacing** on every key: no result crosses orgs, even if inputs match.
- **Hit-rate metrics** for every layer, and prompt-cache read ratio per task from `usage`.

---

## 6. Scheduling, fairness and usage limits

### 6.1 Lanes

| Lane | Work | Share of capacity | Behaviour when full |
|---|---|---|---|
| interactive | chat turns, route, judge for a recruiter waiting, spec_from_jd on upload | ≥ 70 % reserved | queue briefly (≤ 2 s), then 429 with `Retry-After` |
| background | memory_extract, consolidate, reflect, watch runs, re-judges after enrich | the rest, never steals interactive slots | queue (minutes is fine) |

### 6.2 Fair share between orgs

A weighted round-robin queue per lane, keyed by org: a single busy org can't occupy every slot. Weights come from the org's plan in SuperHyre (sent as a header).

### 6.3 Budgets

- Every call writes a usage row (tokens in / out, cache read / write, duration, task, org, campaign, run, lane).
- Daily budget per org in tokens (and a global daily budget sized to the subscription); background work stops at 80 % of an org's budget, interactive at 100 % with a clear message.
- `GET /v1/superhyre/usage` and `/capacity` let SuperHyre show "the agent is busy" before sending.

### 6.4 When the subscription limit is hit

- Detect it from the `result` (error subtype / message) and from repeated failures; parse a reset time if present, else back off (1 min, 5 min, 15 min…).
- Enter **limited state**: background lane paused, interactive requests answered immediately with `503 {"code":"capacity","retryAt":"…"}` so the console can say *"The agent is at capacity. It will retry at 14:30."*; queued background work resumes after the reset.
- Alert once per limited period.

---

## 7. The SuperHyre API

Auth: `X-API-Key` (SuperHyre's own key, cached in memory, not a DB read per request) + `X-Org-Id`, `X-Run-Id`, `X-Lane`, `Idempotency-Key`. Private networking only. Errors always JSON: `{"error": {"code", "message", "retryAt?", "details?"}}`.

| Method | Path | Request → response |
|---|---|---|
| POST | `/v1/superhyre/tasks/{task}` | `{promptVersion, input, shared?}` → `{result, usage, cache: {layer, hit}}` |
| POST | `/v1/superhyre/tasks/{task}/batch` | `{promptVersion, shared, items[], groupSize?}` → SSE: `item` per result, `usage`, `error`, `done` |
| POST | `/v1/superhyre/conversations/{id}/messages` | `{message, context, tools: false}` → SSE: `token`, `usage`, `done` |
| POST | `/v1/superhyre/conversations/{id}/agent` | `{message, context, mcpToken}` → SSE: `token`, `tool` (name, status), `trailer` (actions, artifacts, references), `usage`, `done` |
| DELETE | `/v1/superhyre/conversations/{id}` | ends and forgets the live session |
| DELETE | `/v1/superhyre/runs/{runId}` | interrupts / kills every process working for that run |
| POST | `/v1/superhyre/embed` | `{texts[]}` → `{dense[][], sparse[]}` (BGE-M3) |
| POST | `/v1/superhyre/documents/extract` | multipart file or storage key + `want?` → `{text, pages, method, quality, structured?}` |
| GET | `/v1/superhyre/usage` | `?org&campaign&run&task&from&to` → totals and series |
| GET | `/v1/superhyre/capacity` | lanes, warm processes, queue depth, limited state, retryAt |

SSE event names and payloads are typed (Pydantic models shared as JSON schema with SuperHyre's `packages/shared`). Every stream ends with `done` or `error`; never a bare `[DONE]`.

Task registry (versioned, in the gateway): `route@1`, `spec_from_jd@1`, `judge@1`, `outreach_draft@1`, `reply_draft@1`, `form_draft@1`, `call_summary@1`, `memory_extract@1`, `consolidate@1`, `reflect@1`, `answer@1`. Each has: system prompt file, input model, output model (→ JSON schema), max output tokens, lane, cache TTL, eval set path.

---

## 8. Embeddings and documents (no model calls)

**Embeddings:** BGE-M3 loaded once at start-up (FlagEmbedding or ONNX runtime on CPU), dense (1024) + sparse in one pass, request micro-batching (collect for ≤ 10 ms or 32 texts), L2 cache by text hash, max text length enforced. Replaces the current 501 `/v1/embeddings`.

**Documents:**
1. Fetch by storage key or accept upload (≤ 10 MB, ≤ 15 pages); hash; L2 cache.
2. DOCX → python-docx; PDF → PyMuPDF text layer per page.
3. Pages with too little text → render (150–200 dpi) → **Tesseract** (eng; add hin if needed) with confidence.
4. Low-confidence pages only → Sonnet vision through a task worker (`page_ocr@1`).
5. `want: spec_from_jd | cv_profile` → one task call on the clean text.

**Method names are read by the platform (29 Oct 2026).** The platform's client expects an extract to answer `{ text, pages, methods, lowConfidencePages }` (the table in section 7 says `method` and `quality`) and reads `methods` to tell text read off a picture from text that was in the file: a method that matches `/ocr|vision|tesseract|image/i`, or an image file, sets `picture` (`server/src/modules/agent/attachments.ts`). That flag is how a resume read from a scan says "Read from a picture: check the contact details before adding." So keep naming OCR and vision methods in a way that pattern matches, or change the pattern there in the same release.

The container gains Tesseract and the model weights (image size grows; weights on a volume to keep builds fast).

---

## 9. Code changes, module by module

Follows the main plan's §15 (modular, pure core, ports and adapters, minimal comments). New code under `src/gateway/superhyre/` so the existing OpenAI-compatible routes keep working for Magnifi.

```
src/gateway/
  runtime/                      shared by all routes
    cli_args.py                 build launch args per kind (pure)
    events.py                   stream-json event models + parser (replaces providers/codec.py)
    process.py                  one CLI process: spawn, write, read events, drain stderr, kill
    supervisor.py               pools, warm targets, health, recycle, RSS watch
    task_pool.py                warm task workers per (task, version)
    sessions.py                 live conversation / agent sessions: registry, lock, evict, resume
    scheduler.py                lanes, fair share, budgets, limited state
    errors.py                   typed errors (Capacity, Timeout, Invalid, Auth, Cancelled) → one HTTP mapper
  caching/
    keys.py                     canonical JSON + key builders (pure)
    result_cache.py             L1/L2 on Redis
    singleflight.py             L3
  superhyre/
    tasks/registry.py           task specs (prompt path, models, limits, ttl, lane)
    tasks/prompts/*.md          versioned system prompts
    tasks/models.py             Pydantic input/output per task
    api/tasks.py  api/conversations.py  api/runs.py  api/embed.py  api/documents.py  api/usage.py
    services/task_service.py    cache → singleflight → schedule → worker → validate/repair → usage
    services/batch_service.py   grouping, parallel groups, streamed items
    services/chat_service.py    session turn, streaming, trailer parsing
    services/usage_service.py   writes usage rows (org, campaign, run, task, lane, cache tokens)
    sse.py                      typed SSE encoder
    deps.py                     FastAPI Depends wiring (replaces app.state lookups for new code)
  embeddings/bge_m3.py          model load, micro-batcher
  documents/extract.py          pipeline (pure steps + adapters for PyMuPDF, Tesseract)
  config/settings.py            new settings (below), parsed once
```

**Existing files:**
- `providers/session.py`, `providers/pool.py`, `providers/codec.py`: kept for the OpenAI-compatible route, but rebuilt on `runtime/process.py` and `runtime/events.py` so they get the fixes (stderr, drain, typed errors, usage).
- `application/relay.py`: stream errors become an SSE error event; circuit breaker wraps the whole stream; usage recorded.
- `api/chat.py`: replace string-matched errors with `runtime/errors.py`; fix the empty-messages case.
- `main.py`: CORS outermost; register `superhyre` routers; supervisor start / stop in lifespan; run Alembic at start-up instead of `create_all`.
- `middleware/auth.py`: in-memory key cache (TTL 60 s); `rate_limit.py` fails open with a log line.
- `database/models.py`: `UsageRecord` gains `org_id`, `campaign_id`, `run_id`, `task`, `lane`, `cache_read_tokens`, `cache_write_tokens`, `prompt_version`; timezone-aware timestamps; new `TaskCacheStat` optional. Migration `0003`.
- `Dockerfile`: pin the CLI version; copy `uv.lock` and `uv sync --frozen`; add Tesseract; create `/srv/claude/*` working dirs; `CLAUDE_CONFIG_DIR` on a volume.
- Remove dead code (`BaseProvider` if unused, OTel deps until wired, `passlib`).

**New settings** (env, validated at start-up):
`SH_ENABLED`, `SH_API_KEYS`, `CLAUDE_MODEL_ID` (pinned Sonnet), `PROMPT_CACHE_TTL=1h`, `POOL_GLOBAL_MAX`, `POOL_TARGETS` (json per task), `LANE_INTERACTIVE_SHARE=0.7`, `SESSION_IDLE_SECONDS=900`, `SESSION_MAX_TURNS=40`, `PROCESS_RSS_LIMIT_MB=600`, `GLOBAL_RSS_LIMIT_MB`, `TASK_TIMEOUT_SECONDS` (per task), `BATCH_GROUP_SIZE=5`, `RESULT_CACHE_TTLS` (json), `ORG_DAILY_TOKEN_BUDGET`, `GLOBAL_DAILY_TOKEN_BUDGET`, `MCP_BASE_URL`, `EMBED_MODEL_PATH`, `DOC_MAX_MB=10`, `DOC_MAX_PAGES=15`, `TESSERACT_LANGS=eng`.

---

## 10. Observability

- **Prometheus:** requests by route / task / status; latency histograms per task (queue wait, process wait, model time); warm / busy processes per pool; spawn time; session count; evictions; RSS; cache hit ratio per layer; prompt-cache read ratio per task; usage tokens by org / task / lane; limited state; repairs and validation failures.
- **Logs:** structlog JSON with `request_id`, `org_id`, `run_id`, `task`, `session`; never prompt text or contact details at info level.
- **Usage table** is the source for SuperHyre's cost views and budgets.

---

## 11. Deployment (Railway)

- **Service sizing:** start at 8 GB RAM / 4 vCPU; RSS ceiling and pool targets tuned after the spike. BGE-M3 adds ~2–3 GB.
- **Volume** for `CLAUDE_CONFIG_DIR` (resumable chat sessions) and model weights.
- **Region:** Singapore if Magnifi's traffic allows; otherwise keep US West (a model call is seconds; the extra round trip is ~0.2 s).
- **Private networking** from SuperHyre's services; public route only for Magnifi's existing use.
- **Health:** `/ready` = supervisor ready (warm pools at minimum), DB, Redis, auth OK, not limited; `/health` = process alive.
- **Config:** move from `railway.toml` to the dashboard / new config before 2026-12-01; secrets only in Railway variables; rotate the ones exposed in `RAILWAY_LIVE_DEPLOYMENT.md`.
- **Releases:** pin CLI + model; a CLI upgrade is a planned release (it resets prompt caches once).

---

## 12. Spikes to run first (half a day, results decide details)

1. **Multi-turn stdin:** one process, three user messages, three `result`s; measure per-turn latency and cache reads.
2. **`/clear` over streaming input** with slash commands enabled: does it reset context without restarting? Decides task-process reuse.
3. **Cold start and memory** on the Railway machine: time to first token for `--bare` vs default; RSS idle and after 10 turns.
4. **Cache sharing:** two parallel processes, same directory, same system prompt: does the second read the first's cache?
5. **Concurrency on one token:** 4, 8, 12 parallel processes; error rates and latency.
6. **Limit behaviour:** what a usage-limit `result` looks like (subtype, message, reset time).
7. **`--json-schema`:** confirm `structured_output` placement, behaviour on schema violations, and size limits for our schemas.
8. **MCP over HTTP** with a bearer header from `--mcp-config` JSON: tool call latency, `dontAsk` behaviour on a non-allowed tool.

### 12.1 Spike results (run 4 Oct 2026, local CLI 2.1.289, Sonnet → `claude-sonnet-5-5`)

| # | Question | Result | Design consequence |
|---|---|---|---|
| 1 | Many turns in one process | **Yes.** Context kept across turns (5 → 15). Warm turn ≈ 1.3 s, first turn ≈ 2.4 s | Live chat sessions and reusable task workers |
| 2 | `/clear` over streaming input | **Works**, ≈ 10 ms; the next turn has no memory of the previous task | Task workers are reused with `/clear` between tasks: no spawn per task, system prompt stays cached |
| 3 | Start-up and memory | Pre-started process: first answer 1.8 s (vs 2.4 s cold). **≈ 200 MB RSS** per process, +10 MB after a turn | Pool sizing ≈ 4 processes per GB, leave headroom |
| 4 | Cache sharing across processes | A fresh process read the system prompt from cache (`cache_read 980`) | Same cwd, args and prompt per task kind |
| 5 | Concurrency on one token | 6 parallel processes all succeeded, 1.8–3.5 s | Start pools at 6–8 total, measure before raising |
| 6 | Limits | Every first turn emits `rate_limit_event` with `utilization` and `resetsAt` for the **five_hour** and **seven_day** windows, plus `overageStatus` | Scheduler reads it: background pauses near the limit, `/capacity` reports real headroom |
| 7 | `--json-schema` | Parsed object in `result.structured_output`; costs one extra internal turn (`num_turns: 2`) | Always read `structured_output`; validate anyway |
| 8 | Auth failure | Comes back as `subtype: success` with text "Not logged in · Please run /login" | Detect explicitly; never trust `subtype` alone |
| 9 | Config isolation | `--bare` ignores stored credentials (needs `CLAUDE_CODE_OAUTH_TOKEN` in env). A machine's MCP servers and plugins inflate context massively (283k cache write) unless excluded | Always pass `--strict-mcp-config` with our own (or empty) MCP config and `--setting-sources ""`; in the container use `--bare` with the token env |

---

## 13. Rollout

1. **Fix the defects** in §2 (helps Magnifi too) and add usage recording.
2. **Runtime core:** process, events, supervisor, task pool, scheduler, errors; the OpenAI route moved onto it.
3. **SuperHyre tasks + batch + caches** (L1–L3), usage and capacity endpoints.
4. **Conversation sessions**, then **agent sessions** with the SuperHyre MCP server.
5. **Embeddings and documents.**
6. **Load test:** 20-person judge batches, 30 concurrent chats; tune pools, lanes, TTLs.

**Done means:** p50 task ≤ 3 s and judge-20 first result ≤ 4 s / all ≤ 15 s; chat first token ≤ 3 s; prompt-cache read ratio ≥ 70 % on steady tasks; L1+L2 hit rate reported; zero swallowed errors; usage per org / run correct to the call.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Subscription terms / limits for a commercial product | `AgentRuntime` port, usage ledger and budgets; switch to an API key when budget allows |
| Usage limit hit during work hours | lanes, budgets, caches, batching, limited-state UX |
| CLI behaviour changes | pinned version, spikes re-run on upgrade, contract tests on the event stream |
| Memory pressure from many live sessions | idle eviction, RSS ceilings, resume from disk |
| Cross-tenant leakage | fresh processes per task; one session per conversation; per-org cache keys; MCP tokens scoped per run |
| Single gateway instance | supervisor restarts; sessions resumable from the volume; scale to two instances with Redis session leases later |
