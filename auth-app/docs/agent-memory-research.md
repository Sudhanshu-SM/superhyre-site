# Agent memory and context management for Mind: what the research says and what to build (10 Oct 2026)

Research done by web search plus reading primary pages (papers, official docs, engineering blogs, repos), run as four parallel passes and then checked against our code. The fetch tool summarises pages, so every figure is tagged: **[read]** = the page or paper text came back and was read; **[summary]** = a search snippet or secondary write-up; **[claim]** = vendor or author self-report with no independent run; **[calc]** = our arithmetic; **[inference]** = our reasoning, not a source finding. Re-open the original before quoting any single number outside the company. Legal items are orientation only and need counsel. Nothing in this brief has been built; section 4 says exactly what to change.

Code read for this brief (read-only): `superhyre-platform/server/src/modules/memory/{service,store}.ts`, `modules/agent/{chat,tools,actions,prompts,mcp,conversations}.ts`, `modules/matching/{context,injection,service}.ts`, `modules/sourcing/{watch,service}.ts`, `modules/outreach/jobs.ts`, `modules/connections/*`, `platform/{gateway,queue,untrusted,guards,db,crypto}.ts`, `db/migrations/{101,102,104}`, `test/memory.test.ts`, and the docs `memory-catalogue.md`, `agent-architecture.md` (§11, §13, §14, §16 to §20) and `candidate-matching-research.md`.

---

## 1. TL;DR

**Storage decision.** No graph database. No Mem0, Zep, Letta, Supermemory or any other external memory service. Keep Qdrant as the retrieval index for now, make Postgres the place where memory lifecycle is recorded (audit through the existing `activity` table now, a full memory ledger next), and move vectors into Postgres only if the triggers in section 4.12 fire. The research says Postgres could carry this workload, and the fallback design is written out, but a migration buys nothing a user can see while the real gaps are in write-path logic, not in the store.

**What the code review found that matters most** (details in section 3):

1. The agent has exactly one autonomous write path, the `remember` tool, and it is also the only mutation that skips the propose-then-approve rule. It can write agency-wide (`org`) memories, has no role check, no grounding check, and runs in a chat where `candidate_profile` returns raw candidate text. That is the textbook memory-injection chain.
2. A correction can reinforce the stale fact instead of replacing it. `store.ts` treats any new memory at cosine 0.92 or above as "the same memory" and bumps its confidence. "Budget is now 45 lakh" next to "Budget is 40 lakh" will usually clear that bar. The test only covers the case where the caller passes `supersedes`, which neither the `remember` tool nor the distil job ever does.
3. `purgePerson` and `forget` have no callers. Deleting a candidate leaves memories that contain their full name, with no expiry.
4. Nothing records which memories a run used, so there is no audit, no "why did you say that", and no way to ever credit outcomes.

**Ranked actions** (impact over effort; "now" = small, safe, valuable):

| # | Action | Impact | Effort | When |
|---|---|---|---|---|
| 1 | Harden `remember` and distil: verbatim quote from the recruiter required, org and client rules need a click, `pending` status, provenance fields | Very high (closes the injection path) | S to M | **Now** |
| 2 | Contradiction-safe writes: `sameClaim` guard in `store.remember`, slot keys, `recall_memory` returns ids, `remember` takes `replaces`, distil adjudicates against neighbours | Very high (correctness) | S to M | **Now** |
| 3 | Clean untrusted text in tool results (`cleanProfileText` on `candidate_profile` and notes) | High | S | **Now** |
| 4 | Wire erasure and forgetting: purge job on candidate delete, memory list and forget API, episode expiry, audit rows | High (DPDP readiness) | S to M | **Now** |
| 5 | Record memory ids per run; recency-aware ranking; client-scoped recall; context block budget | Medium | S | **Now** |
| 6 | Tests: knowledge-update, quote grounding, role gating, purge, cross-client leak, injection suite; start the 60 to 100 case memory eval | High (nothing else is measurable without it) | M | **Now**, grow over time |
| 7 | Measure context cost per turn (cache reads, `<context>` size) before building compaction or deltas | Medium | S | **Now** (measure), later (build) |
| 8 | Outcome-driven learning: deterministic episodes from stage moves, replies and hires; weekly reflection that proposes beliefs for approval | High | M | Next |
| 9 | Agent capabilities: follow-up drafts, reply capture without restricted Gmail scopes, weekly watch cadence with a dead-man pause, Slack digest | High | M | Next |
| 10 | Postgres memory ledger (system of record for lifecycle, Qdrant rebuildable from it) | Medium | M | Next |
| 11 | Move vectors into per-tenant Postgres tables | Low today | L | Later, only on triggers |
| 12 | Graph store, external memory service, embedding model swap, reranker | Low | L | Later, only on eval evidence |

**Four findings about the field to keep in mind** (section 2 has the evidence):

- Vendor benchmark numbers are not comparable and several are inflated. Supermemory's 97 percent is Recall@20 with aggregation, not answer accuracy; Mem0's "26 percent" is against OpenAI's memory while full context beat Mem0 in the same paper; Zep's LoCoMo score has been reported as 58.4, 65.99, 75.14 and 85.22 by different parties. Build our own small eval before trusting any figure.
- The one capability every serious system converged on is explicit supersession with time validity ("close the old fact, keep history"). It is also where independent tests show the worst results: on MemoryAgentBench conflict resolution, Mem0 averaged 10.0, Zep 5.0 and GPT-4o in long context 32.5.
- Graphs for conversational memory have weak evidence. A flat store with good keys is a strong baseline; Mem0 itself removed graph stores from its open-source SDK.
- Memory injection is measured and severe (98 percent injection success in MINJA, over 80 percent attack success at under 0.1 percent poison rate in AgentPoison), and write-time filters alone catch little. The defences that hold are structural: typed output, quote grounding, provenance, approval for shared state, and per-tenant enforcement in code.

---

## 2. How the leading systems work

### 2.1 Comparison

**Table A: what is stored, how it is written, how contradictions and time are handled.**

| System | Stores | Write path | Contradictions and time |
|---|---|---|---|
| Supermemory | Raw chunks, extracted atomic memories in a "fact-based temporal graph", and a profile (static plus dynamic) [read] | Per-session ingestion; atoms resolve references and keep the source chunk; "dreaming" groups related documents (`dynamic`, default) or processes one alone (`instant`). Dynamic Dreaming (blog, 25 May 2026) runs when the user goes quiet: merges fragments, resolves contradictions, adds derived links, every inference must cite sources [read, claim] | Relations `updates` (replaces for search, history kept), `extends` (both stay valid), `derives` (inference); `isLatest`; `documentDate` and `eventDate` on the research page [read] |
| Mem0 | Short natural-language facts in a vector store; Mem0g adds a Neo4j graph (Platform only since v2) [read] | 2025 paper: LLM extracts from a message pair, summary and last 10 messages; fetches top 10 similar memories; LLM picks ADD, UPDATE, DELETE or NOOP. April 2026 algorithm: single-pass, ADD-only, entity linking, no UPDATE or DELETE [read] | 2025: via UPDATE/DELETE. 2026: old and new both persist; on BEAM its weakest category is contradiction resolution (35.7 at 1M tokens); May 2026 adds per-fact temporal state keys that close the old state (Platform only) [read, claim] |
| Zep / Graphiti | Episodes (raw), entities and facts (edges), communities (clustered summaries) [read] | LLM entity resolution (embedding plus full text plus LLM judge); LLM compares each new edge with related edges [read] | Bi-temporal: `valid_at` / `invalid_at` (world time) and `created_at` / `expired_at` (system time); old edge invalidated, never deleted [read] |
| Letta / MemGPT | Core blocks always in context, recall (message history), archival (vector text); 2026 "context repositories" = git repo of markdown files [read] | The agent edits its own memory through tool calls; a sleep-time agent consolidates in the background; at 100 percent of the window about half the messages are evicted into a recursive summary [read] | None beyond the agent rewriting text; block writes are last-write-wins [read] |
| LangMem | Semantic (profile or collection), episodic, procedural (prompt rules) [read] | Hot path (agent tool) or a background manager; `ReflectionExecutor` debounces per thread, guide suggests 30 to 60 minutes [read] | Manager "updates or removes outdated memories"; no explicit validity [read] |
| Cognee | Relational plus vector plus graph; remember / recall / improve / forget [read] | cognify pipeline | None documented; scored 28 / 3 on MemoryAgentBench conflict resolution [read] |
| A-MEM | Notes with keywords, tags, context sentence, embedding, links [read] | New note compared with top 10 neighbours; LLM links them and may rewrite neighbours ("memory evolution") [read] | None explicit |
| MemoryOS | Short-term pages, mid-term segments, long-term persona [read] | Heat-based promotion (visits plus interactions plus recency) [read] | Heat-based eviction |
| HippoRAG 2 | Knowledge graph plus passages, Personalized PageRank [read] | OpenIE triples with an LLM filter | Document retrieval method, not conversation memory |
| Generative Agents | Memory stream plus reflections [read] | Importance 1 to 10 rated by the LLM at write time; reflection fires when recent importance sums above 150 [read] | None |
| Mastra Observational Memory | A dated, prioritised text observation log (no retrieval) [read] | Observer at about 30k tokens of history; Reflector at about 40k merges and prunes [read] | Reflector drops superseded items |
| Hindsight | World facts, experience, opinions with confidence, observation summaries [read] | retain / recall / reflect | Opinions carry confidence |
| LinkedIn Cognitive Memory Agent (Hiring Assistant) | Conversational, episodic, semantic, procedural layers [read] | Streaming path for episodes, batch path for semantic aggregation; offline job dedupes, drops stale data, resolves conflicting preferences [read] | Consolidation resolves conflicts; synthesised preferences link back to sources; time pruning at 6 to 12 months [read] |
| OpenAI cookbook, Vertex Memory Bank | Structured profile plus staged notes (OpenAI); Gemini-extracted memories (Google) [summary] | Notes during the session, LLM consolidation at the end with "recency wins" [summary] | "Latest user instruction beats session notes beats profile" (OpenAI) |

**Table B: read path, forgetting, isolation, cost, results.**

| System | Read path | Forgetting | Isolation | Cost and latency | Reported results (all vendor-run unless noted) |
|---|---|---|---|---|---|
| Supermemory | Hybrid search over chunks and memories; matching memory injects its source chunk; profile fetched separately and pasted into the system prompt [read] | Soft forget by id or query (dry run required); temporary facts expire; no decay formula [read] | Namespace is a hard boundary in the URL; scoped keys [read] | No official p50 or p95 [read] | LongMemEval-S "production report": 97 percent Recall@20 with aggregation (gpt-4o), but 84.6 and 85.2 percent accuracy with gpt-5 and gemini-3-pro; ASMR 98.6 percent is an any-of-8 score from an experimental 11 to 15 call pipeline [claim] |
| Mem0 | Semantic, BM25 and entity scores fused; `top_k` up to 200, under about 7k tokens [read, claim] | Search-time decay boost (1.5x recent, 0.3x stale); `expiration_date` hides [read] | `user_id` (more not confirmed) [read] | Paper, LoCoMo: search p95 0.200 s, total p95 1.44 s, 1,764 tokens per query vs full context 17.1 s and 26k tokens [read] | LoCoMo J: Mem0 66.88, Mem0g 68.44, Zep 65.99, LangMem 58.10, OpenAI 52.90, full context 72.90 [read]; 2026 algorithm 92.5 LoCoMo, 94.4 LongMemEval [claim] |
| Zep / Graphiti | Cosine, BM25 and graph traversal, then RRF, MMR or cross-encoder [read] | Invalidation only [read] | `group_id` inside a graph, or one graph per user [summary] | LongMemEval: about 1.6k tokens at 2.58 s vs 115k tokens at 28.9 s [read] | DMR 94.8 vs 93.4 (MemGPT); LongMemEval-S gpt-4o 60.2 to 71.2 percent, but single-session-assistant got worse (94.6 to 80.4) [read] |
| Letta | Pinned blocks always loaded; the rest searched by the agent [read] | Eviction by summary; agent edits [read] | Org-owned repos [read] | Sleep-time: about 5x less test-time compute for equal accuracy on synthetic math tasks [read, claim] | A plain-file agent scored 74.0 percent on LoCoMo vs 68.5 for Mem0g as reported by Mem0 [claim] |
| LangMem | Key, semantic search, metadata filter on LangGraph store [read] | Not documented | Hierarchical namespace tuples; `AsyncPostgresStore` recommended [read] | LoCoMo search p95 59.8 s as measured by Mem0 [read] | None official |
| A-MEM | Plain cosine top-k | None | n/a | About 1,200 tokens and 5.4 s per memory operation [read] | LoCoMo temporal F1 45.85 vs 25.52 (MemGPT); worse on adversarial questions; Mem0 re-run 48.38 J [read] |
| MemoryOS | Page-to-segment cosine plus keyword overlap | Heat-based | n/a | 3,874 tokens and 4.9 LLM calls per query [read] | +49.11 percent F1 on LoCoMo (own table averages about 48.4) [read] |
| Mastra OM | The log is the context (no retrieval), prefix stays cache-stable [read] | Reflector prunes | Thread or resource scope | About 6x compression, average context about 30k tokens [read] | LongMemEval-S 94.87 (gpt-5-mini), 84.23 (gpt-4o) [claim] |
| Hindsight | Semantic, BM25, graph, temporal; RRF; cross-encoder; token budget [read] | Not described | n/a | n/a | LongMemEval-S 83.6 to 91.4; baselines copied from other vendors' reports [claim] |
| LinkedIn CMA | Planned multi-step retrieval by a hosted LLM, not a single vector search [read] | 6 to 12 month pruning; user delete/edit is on the roadmap, not shipped [read] | Per recruiter and per customer tenant, ownership metadata on every record, credentials checked at every step [read] | Memory budget about 10 to 20 percent of response latency [read] | Self-reported: HLTM +5 percent answer correctness, +10 percent retrieval F1 [claim] |

### 2.2 What the benchmarks do and do not tell you

- **LongMemEval** [read, arXiv 2410.10813]: 500 questions over five abilities (information extraction, multi-session reasoning, temporal reasoning, knowledge updates, abstention). Its design findings held up and are the most transferable: index at round level, expand index keys with extracted facts (recall +9.4 percent), time-aware query expansion (+6.8 to 11.3 percent temporal recall), and read with chain-of-note. The S split is about 115k tokens, which now fits in a context window, so full-context baselines are strong and vary from 38 to 64 percent across papers for the same model class.
- **LoCoMo** [read, arXiv 2402.17753]: about 300 turns per conversation. A community audit found 6.4 percent of the answer key wrong (ceiling about 93.6 percent), a judge that accepted 62.8 percent of deliberately vague wrong answers, and category 5 excluded by everyone [read, community audit]. Zep, Letta and Mastra each argue it is a weak yardstick.
- **MemoryAgentBench** [read, arXiv 2507.05257]: the only independent test of selective forgetting and conflict resolution. FactConsolidation single-hop / multi-hop: GPT-5-mini long context 78 / 28; GPT-4o 60 / 5; Cognee 28 / 3; Mem0 18 / 2; Zep averaged 5.0. "All methods fail on the multi-hop situation."
- **Full context often wins.** A controlled cost study put Mem0 OSS at LongMemEval 49.0 vs 82.4 for long-context GPT-5-mini, and LoCoMo 57.68 vs 92.85; break-even is about 10 turns per user at 100k tokens with a 90 percent cache discount [read, arXiv 2603.04814]. ConvoMem: full context beats RAG and memory systems under roughly 150 conversations [read, arXiv 2511.10523]. Memory pays off on cost and at very long horizons (BEAM, up to 10M tokens), not on short ones.
- **Embedder choice swamps architecture.** Changing only the embedding model moved results by 6.2 points and flipped rankings in one controlled study [read, arXiv 2606.29914].
- **Comparable only inside one harness.** Same answer model, same judge, same categories. Zep's LoCoMo score appears as 58.44 (Mem0's CTO), 65.99 (Mem0 paper), 75.14 (Zep's correction) and 85.22 (a third paper); the dispute was never reconciled [read, zep-papers issue 5]. Recall@20 is not accuracy. Scores with LoCoMo category 5 are not comparable to scores without.
- **There is no recruiting memory benchmark.** Nothing public tests "client A's confidential comp band must not appear in client B's draft" or "recruiter changed the hiring bar". We must build it (section 4.11).

### 2.3 What consistently helps, and what is hype

Consistent evidence:
1. **Explicit supersession with validity time.** Zep, Mem0 (2026 temporal update) and Supermemory (`updates`) converge. Add/Update/Noop beat Add-only on HaluMem (QA-C 0.5861 vs 0.4785) [read, arXiv 2601.01280]. A learned manager that prefers UPDATE over DELETE plus ADD beat Mem0 with 152 training examples [read, Memory-R1, LoCoMo only]. Doing nothing about contradictions is clearly worse; the best implementation is not settled.
2. **Hybrid retrieval plus a rerank step**, with the embedder and reranker mattering more than the store.
3. **Session-level ingestion that keeps the source text**, not isolated message facts.
4. **A small injected profile plus searched memory** (Letta pinned blocks, Supermemory profile, Mastra's stable prefix). No controlled ablation exists, so the case rests on design convergence and cache economics.
5. **Background consolidation after the chat goes quiet** (LangMem debounce, Letta sleep-time, Supermemory dreaming, LinkedIn offline job). Our 10-minute distil is the same shape. The only controlled ablation is Generative Agents (TrueSkill 29.89 with reflection vs 26.88 without).
6. **Outcome credit**, early but the only route to "what worked": Memory-R1 rewards memory operations by downstream answer correctness; ReasoningBank and ACE keep playbooks distilled from successes and failures [read].

Hype or unproven:
- Headline SOTA claims above about 85 percent on LongMemEval from vendors with their own judge.
- Graphs for conversation memory: similarity-edge graphs hurt, entity-description graphs roughly tie flat stores, extraction took about 7.5x longer (1,181 vs 156 minutes on LongMemEval-S) [read, arXiv 2601.01280]. Mem0g gained 1.6 points overall and lost on single-hop (67.13 to 65.71) and multi-hop (51.15 to 47.19) [read, Mem0 paper table]. HippoRAG 2's about 3 F1 over a strong dense retriever is document QA, at roughly 8x the indexing time. GraphRAG-Bench: plain RAG 60.92 vs best graph 60.14 on fact retrieval; graphs win only on complex reasoning (53.38 vs 42.93) [read, arXiv 2506.05690].
- Time decay as an accuracy gain: no controlled study isolates it. Mem0's own decay added +0.9 and +1.0, inside its stated judge noise of about 1; two 2026 papers report negligible accuracy change from removing it [summary]. Treat decay as hygiene (stale-noise control, storage), not as a score gain, and never as deletion.
- LLM-rated "importance" at write time (never ablated alone).

### 2.4 Context management for long-running tool-using agents

Anthropic's guidance, which is also what the other vendors converge on [summary unless noted]:

- **Context is a finite attention budget** with diminishing returns ("context rot"). Aim for the smallest set of high-signal tokens. Hybrid is recommended: preload a little, retrieve the rest just in time (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents). Chroma's report over 18 models finds degradation with length even on simple tasks, faster when the question and the evidence are less similar, and worse with distractors; on LongMemEval focused prompts of about 300 tokens beat full 113k-token prompts [summary]. "Lost in the middle": GPT-3.5 accuracy 75.8 percent with the gold document first, 53.8 in the middle, 56.1 with no documents at all [summary; 2023 models, position effect is model-dependent].
- **Tool-result clearing** is called the safest light-touch compaction. API parameters: `clear_tool_uses_20250919` with `trigger` default 100,000 input tokens and `keep` default 3 tool uses; compaction `compact_20260112` with `trigger` default 150,000 (minimum 50,000) [summary]. Anthropic reports memory tool plus context editing +39 percent and context editing alone +29 percent on an internal agentic-search eval, and 84 percent fewer tokens on a 100-turn eval (internal, vendor-reported, not replicated) [summary].
- **Observation masking vs LLM summarisation** (JetBrains, SWE-bench Verified, five models) [summary, arXiv 2508.21433]: masking cut cost 9.8 to 57.1 percent at equal or better solve rate in most configurations (for example 54.8 vs 53.8 percent for Qwen3-Coder 480B); summaries lengthened trajectories by 13 to 15 percent and cost up to 7.2 percent of an instance to generate. Software-engineering only, fixed triggers.
- **Summaries drift.** OpenAI's cookbook names "context poisoning" in summaries ("even minor hallucinations in a summary can propagate forward") and prescribes a summariser prompt with a contradiction check and "most recent update wins" [summary]. ACE names two failure modes of LLM-maintained contexts, brevity bias and context collapse ("repeated rewriting gradually erodes detail"), and uses incremental structured updates (+10.6 percent on agent benchmarks) [summary, arXiv 2510.04618]. This applies directly to any distil or consolidation loop.
- **Sub-agents** return condensed 1 to 2k token summaries after tens of thousands of tokens of work, but cost about 15x the tokens of chat (agents about 4x); gains were on read-heavy breadth-first research. Cognition's counter-argument concerns parallel writers losing shared decisions [summary]. For us: read-only fan-out only.
- **Long-running work**: an initialiser session writes a feature-list JSON plus a progress file; later sessions read state first and may only flip `passes`. JSON is clobbered less often than Markdown [summary]. The 2026 follow-up finds Sonnet 4.5 showed "context anxiety" that needed resets, which Opus 4.5 removed: "every component in a harness encodes an assumption about what the model can't do" [summary].
- **Caching** [read for Claude Code docs]: keep the prefix byte-stable, append-only, volatile content last, do not edit earlier turns. Claude Code delivers updates as `system-reminder` content inside messages rather than editing the system prompt, the same layout as Mind's per-turn `<context>` in the user message. Cache invalidators include model switches, MCP tool-set changes and compaction. For a Claude subscription, the main conversation (including `-p` runs and Agent SDK turns) uses a 1-hour cache TTL within plan usage; API keys and credits default to 5 minutes. A gateway that strips `cache_control` or the `anthropic-beta` header silently turns every turn into a full-price rewrite. Cache reads cost 0.1x (0.05x on the 5.5 models) of base input [summary, https://code.claude.com/docs/en/prompt-caching].
- **Manus** [summary, practitioner]: KV-cache hit rate is "the single most important metric" (input to output ratio about 100:1); stable prefix, no per-second timestamps; filesystem as restorable context; recite a todo file; keep errors in context; beware few-shot ruts (in a 20-resume review the agent fell into a repetitive rhythm, directly relevant to bulk candidate review).
- **Breunig's four failures**: poisoning, distraction, confusion, clash. Clash evidence: sharded multi-turn prompts averaged a 39 percent drop, o3 from 98.1 to 64.1 [summary].

**Inference for Mind** [inference, not a source claim]: a warm CLI session in which every turn appends a fresh `<context>` block accumulates stale snapshots of pipeline counts and campaign lists, which is the "clash" pattern. No study measures per-turn context blocks versus deltas; measure before building.

### 2.5 Security of memory and untrusted text

| Attack | Result | Tag |
|---|---|---|
| MINJA (arXiv 2503.03704): query-only memory injection by a normal user | About 98.2 percent injection success, 76.8 percent attack success | [summary] |
| AgentPoison (arXiv 2407.12784) | Over 80 percent attack success at under 0.1 percent poison rate, under 1 percent benign impact | [summary] |
| GhostWriter (2607.06595), MAFIA (2608.03844) | About 98 percent injection, 60 percent activation; up to 90.7 percent attack success, audit detection fell from 83.3 to at most 7.4 percent with "factual cloaks" | [summary] |
| Utility Under Attack (2608.21230, single author) | Poisoning 1.2 percent of a LongMemEval corpus cut accuracy from 0.850 to 0.300; a write-time screen caught 0 of 360 poisoned factual memories | [summary] |
| Zombie Agents (2602.15654) | A one-time indirect injection persists through the agent's own memory updates | [summary] |
| ChatGPT memory (Rehberger) | A web page or document could write memories; Gemini memory poisoned via delayed tool invocation ("yes", "sure" triggers) | [summary] |
| Resumes (arXiv 2605.28999) | About 1 percent of about 200k real resumes carried hidden injections; over 90 percent of those were not explicit instructions | [summary] |

Defences with measured effect: spotlighting by datamarking cut attack success from about 50 to 3.1 percent (GPT-3.5 summarisation), plain delimiters only about halved it from a 60 percent baseline and the authors do not recommend them [summary, arXiv 2403.14720]; 12 published defences were bypassed at over 90 percent by adaptive attackers [summary, arXiv 2510.09023]; CaMeL gets provable security on 77 percent of AgentDojo tasks vs 84 percent undefended [summary, arXiv 2503.18813]; write-time sanitisation, provenance checks and anomaly detection showed no resolvable utility cost, while a read-time reranker lost 4.4 points and quarantined 33.6 percent of legitimate items [summary, single-author]; additive provenance weights at the shipped weight were indistinguishable from no defence [summary]. Meta's Rule of Two: a session may combine at most two of untrusted input, sensitive data or systems, and state change or external communication; Willison's lethal trifecta is the same idea. OWASP's Agentic Top 10 2026 lists "Memory and Context Poisoning" (ASI06) with mitigations that read like a checklist for us: scan memory writes before commit, segment memory by session and domain, require provenance, **prevent automatic re-ingestion of an agent's own outputs into trusted memory**, expire unverified memory, human review for high-risk actions, and weight retrieval by trust and tenancy [read, OWASP PDF pp. 24 to 26]. A study of five memory systems found none enforced revocation at retrieval by default: a revoked fact ranked above its replacement and led agents to unsafe actions (arXiv 2609.08258, single study) [summary].

Takeaway: filters are speed bumps; the controls that hold are structural. Section 4.7 turns this into design.

### 2.6 How recruiting products structure memory and automation

| Product | Memory | Automation and schedule | Human stance | Evidence |
|---|---|---|---|---|
| LinkedIn Hiring Assistant | Four-layer CMA (above); preferences as a tree: project leaf, recruiter, company cohort; GraphRAG rejected as too slow; user edit/delete not shipped | Plan-and-execute supervisor with sub-agents; async "source while you sleep"; FIFO retries; OpenTelemetry traces feed regression tests | Recruiter approves qualifications before evaluation; learning agent proposals need approval; humans make final outreach and hiring calls | [read] LinkedIn engineering and Stack Overflow interview |
| Juicebox (PeopleGPT / Agents) | "Calibrate" chat stores feedback; calibration complete at about 2 of 3 approved | Sources daily about 9am against a net-new target; **auto-pauses after 4 days of unreviewed leads**; goes "Out of Leads" rather than lowering the bar | Manual or Automatic mode; sends only through a reviewed sequence | [read] docs |
| Gem | Past interactions; explicitly does **not** use recruiter ratings to change searches | Sourcing, Application Review and Fraud Detection agents; permissioned MCP server | Flags go to recruiters | [read] marketing and help |
| Metaview | None persistent; refinement is human-triggered after about 10 to 15 verdicts or weekly with a pattern summary | Daily Slack or Teams shortlist; replies like "1, 4 yes . 3 no, too junior" are parsed; excludes reviewed candidates; says so if the pool is short | Confirmation gates for ATS posts, sequences, replacing the ideal-candidate profile | [read] docs, the clearest published precedent |
| Ashby | Scheduled Agents on a cadence (e.g. Monday pipeline recap) | Agentic Scheduling with a Copilot mode that pauses before each email | "Pause only for a human to confirm" | [read] keynote |
| Greenhouse | Job Kickoff Agent | MCP server | "The hiring decision is always yours" | [read] |
| hireEZ, Paradox, Findem, Moonhub, Tezi | Candidate-level notes at most; Paradox event-driven scheduling over SMS and WhatsApp | | Mostly marketing claims; Paradox's McHire admin panel exposure in 2025 (weak password, IDOR) shows recruiting chat logs are high-value PII | [claim] and [summary] |

Patterns: memory is almost always scoped by role or search and by recruiter; learning splits into implicit (LinkedIn, Juicebox) and explicit approved proposals (LinkedIn qualification updates, Metaview), with Gem declining to auto-learn. For an agency serving many clients the explicit camp is safer. Daily caps plus a dead-man switch (Juicebox) are the standard guard against runaway automation. Humans approve the template or sequence, not each send. Slack as an inbox with parseable replies is the emerging UX. Deletion and editing of memory is mostly absent everywhere; LinkedIn lists it as planned.

### 2.7 Tool design, approvals, compliance and the Gmail scope problem

- **Tool design** [read, Anthropic "Writing effective tools for agents" and OWASP LLM06]: consolidate around workflows, return names not UUIDs but keep ids available, paginate and cap responses (Claude Code caps at 25k tokens), write actionable errors, make arguments hard to misuse; excessive agency comes from excess functionality, permissions and autonomy, so narrow tools, run as the user, enforce authorisation downstream of the model, and rate-limit.
- **Idempotency** [read, Stripe]: client-generated keys up to 255 characters, first result (even a 500) saved and replayed, reuse with different parameters is an error. Durable-execution replay does not make external side effects idempotent: derive keys from workflow and step identity, persist the LLM decision so retries do not re-ask the model [summary]. With `gmail.send` only, we cannot search Sent to verify an ambiguous send; mark the row `unknown` and route to a human [inference].
- **Approval fatigue** [read, Anthropic auto mode]: users accept 93 percent of permission prompts, so the control erodes. Their classifier pipeline had 0.4 percent false positives and a 17 percent miss rate on real overeager actions. Sandboxing cut prompts by 84 percent in internal use [read]. Implication: tier approvals by risk, bind each approval to a hash of the exact payload with an expiry, show diffs, and treat edit and reject events as labelled data.
- **Gmail scopes** [read, Google docs]: `gmail.send` is **sensitive**; `gmail.readonly`, `gmail.modify`, `gmail.compose`, `gmail.metadata` are **restricted** and need an annual CASA assessment when data passes through a third-party server (exceptions: personal use, internal organisational use, domain-wide installation). Assessor cost sources conflict, from about $500 to $4,500 (Google and Nango pages) to vendor claims of $15k to $75k; get two quotes. `users.watch` push also needs a restricted scope. Unverified apps are capped at 100 users. Today `connections/google.ts` requests only `gmail.send` for Gmail (plus `drive.file` for Sheets), so replies cannot be detected.
- **Reply detection without restricted scopes** [synthesis]: Reply-To routing to a per-message address on an inbound-parse provider (Postmark exposes plus-address tags as `MailboxHash`), forwarding rule or BCC to a per-tenant address, a Gmail add-on with the sensitive `gmail.addons.current.message.*` scopes, or the manual "mark replied" we have. Trade-off: the recipient sees a different Reply-To.
- **Sending limits** [read]: Workspace 2,000 messages and 3,000 external recipients per day per user; API `messages.send` costs 100 quota units against 6,000 per minute per user. Google bulk-sender rules start above 5,000 messages a day to Gmail but the spam-rate targets (under 0.10 percent, never 0.30) are good goals.
- **Compliance orientation** (counsel needed): India's DPDP Rules were notified 13 Nov 2025; most duties (notice, consent, security, rights, retention) apply from 13 May 2027 [summary]. Whether an agency's candidate pool built from public and enriched data is inside the Act (s.3(c)(ii) publicly-available exclusion; enriched contact data may not qualify) and the agency's role versus its clients are the key legal questions. Build notice, withdrawal, access, correction, erasure and a grievance channel regardless. CAN-SPAM has no B2B exception (opt-out honoured in 10 business days); UK PECR needs consent for sole traders; WhatsApp requires opt-in and approved templates outside the 24-hour window, so cold WhatsApp to scraped numbers is non-compliant [read]; LinkedIn's User Agreement prohibits scraping tools and bots that message on your behalf [read]; EU AI Act high-risk obligations for recruitment AI were postponed to 2 Dec 2027 by the Digital Omnibus (confirm publication in EUR-Lex) [summary].

### 2.8 Evaluating agents

- Anthropic: start with 20 to 50 tasks from real failures; grade outcomes (final state), not paths; use pass^k for consistency (75 percent per trial gives about 42 percent for three in a row); isolate trials; a 0 percent score is usually a broken task [read].
- tau-bench [read, arXiv 2406.12045]: compare end database state with the goal state; GPT-4o under 50 percent and pass^8 under 25 percent in retail.
- Error analysis first (Husain and Shankar) [summary]: review 100 traces, hand-code 30, cluster failures, write binary judges per failure mode, validate on 100 to 200 labels, 80 percent TPR/TNR floor.
- Memory: LongMemEval categories plus MemoryAgentBench's selective forgetting; isolation canaries (plant a fact for tenant A, query as B). No public study gives guidance on evaluating memory in production agents.

### 2.9 Integrating Slack, Notion, Calendar, Gmail

- **MCP state** [read]: current spec 2026-07-28 (stateless, `server/discover`, Dynamic Client Registration deprecated for Client ID Metadata Documents). Authorization is OAuth 2.1 with PKCE, Protected Resource Metadata, `resource` indicator; servers must validate tokens were issued for them and must not pass tokens through. Security guidance covers confused deputy, SSRF during metadata discovery, and state-handle hijacking.
- **Hosted servers**: Slack MCP is user-token, Marketplace-listed apps only, no read-only mode (omit write scopes). Notion MCP is interactive OAuth only; for background jobs use the REST API with an integration token. Google's Gmail and Calendar MCP are Developer Preview since 1 May 2026; Gmail MCP has no send tool and uses restricted scopes; Google itself warns of indirect prompt injection. Vendor-hosted MCP is mostly user-interactive and preview-quality [read].
- **Brokers** (Nango, Composio, Arcade, Pipedream, Paragon): save refresh and rotation edge cases and add providers fast, but concentrate every tenant's tokens in a third party [summary].
- We already have first-party Gmail (send), Slack (bot, `chat:write`, `channels:read`, `groups:read`, org-scoped) and Notion connections with AES-256-GCM sealed tokens bound by AAD (`platform/crypto.ts`). The recommended pattern in section 4.10 extends that rather than adopting a broker.

### 2.10 Storage evidence: graph, Postgres, or Qdrant

- **pgvector** [read]: v0.8.7 current (1 Oct 2026). 0.8.0 added iterative index scans; filtering happens after the ANN scan, so with default `ef_search` 40 a filter matching 10 percent of rows returns about 4 rows. `hnsw.iterative_scan` fixes recall but only moves the failure point: candidates needed are about LIMIT divided by selectivity, so 0.05 percent selectivity with LIMIT 10 needs about 20,000 candidates, exactly the default `max_scan_tuples` cap [calc]. The maintainers' own advice for tenants is partial indexes for few values, **list partitioning or separate tables** for many; the filter-aware HNSW request was closed with no roadmap. **Versions at or below 0.8.1 carry CVE-2026-3172** (parallel HNSW build buffer overflow, can read other relations' data); require 0.8.2 or later. Supabase's catalogue lists 0.8.0 and 0.8.2; check the installed version [read].
- **AWS test** of 0.8.0 (10M rows, 384-d, filters matching 2 to 10 percent): completeness went from 1 to 10 percent on 0.7.4 to 100 percent on 0.8.0, p99 about 13 to 86 ms; synthetic data [read].
- **Qdrant** [read]: our configuration (one collection, `is_tenant` keyword index, `m: 0`, `payload_m: 16`, int8 scalar quantisation) is exactly the documented multitenancy pattern, and is what pgvector lacks. Caveats: no point-in-time recovery; snapshots are per node; Railway volume backups are daily kept 6 days and "still under development"; deletes are flagged and removed at vacuum; BM25 IDF is shard-wide by default so tenants' vocabularies influence each other's lexical scores, with a per-tenant option only from v1.19; RRF `k` default is 2 and configurable only from v1.16 (our compose file pins v1.15.4; the JS client is ^1.19).
- **BM25 in Postgres** [read]: `ts_rank` and `ts_rank_cd` are not BM25 (no IDF, length normalisation off by default). Real BM25 options (`pg_textsearch` v1.0, ParadeDB `pg_search`, VectorChord-BM25) are not in Supabase's extension catalogue. For one or two sentence memories, entities should resolve to ids and filter structurally; Mem0 v3 uses BM25 and entity overlap only as ranking boosts.
- **What real systems store on** [read unless noted]: Mem0 OSS defaults to Qdrant with 20+ stores including pgvector and **removed all graph stores in v2**; Zep/Graphiti needs Neo4j, FalkorDB or Neptune; Letta requires Postgres with pgvector; LangGraph `PostgresStore` uses pgvector; Supermemory moved to PlanetScale Postgres from TigerData ($900 to $90 a month); Mem0's hosted platform hit sequential scans on multi-tenant filtered pgvector queries (8 to 14 seconds) and moved vector search to Turbopuffer, while advising pgvector below about 10M vectors with simple queries.
- **No independent pgvector vs Qdrant benchmark with tenant-style filters exists** at 1 to 10M rows. The neutral academic evidence (FANNBench, SIGMOD '26) says scanning a partitioned subset beats ANN when selectivity is below 1 percent, which is our tenant shape [read].
- **Do recruiting questions need a graph?** "Which clients rejected people from X" and "who did Riya shortlist from Razorpay" are joins over `match_feedback`, `stage_moves`, `campaign_candidates`, `people` and `clients`, which we own in Postgres with RLS. Expose them as parameterised SQL tools. Memory should hold the qualitative why, linked by ids [inference]. A graph adds automatic fact invalidation and multi-hop traversal over relations extracted from unstructured text; temporal columns with `supersedes_id` and a slot key give the first, and recursive CTEs over entity ids give bounded multi-hop. SQL/PGQ was reverted from Postgres 19 in Beta 4, so do not plan on it [summary].

---

## 3. Where our implementation stands

### 3.1 What exists and is good

`memory/store.ts` (Qdrant) and `memory/service.ts` give us, ahead of most of the field:

- **Tenant filter inside the store** (`visible()`, lines 194 to 221), never by callers; recruiter-level memories visible only to their owner; campaign memories visible only to people who can see the campaign (`readerOf`, service.ts 19 to 25); `forgotten`, `is_latest` and `expires_at` filtered on every read.
- **Hybrid recall** with dense plus BM25 fused by RRF server-side in one request (`recall`, lines 331 to 362), tenant-aware HNSW (`m: 0`, `payload_m: 16`), int8 quantisation, collection alias for zero-downtime rebuilds.
- **Idempotent episode writes** (`pointId(key)` is a hash of workspace and key) and a retrying queue for writes (`memory.write`, 8 retries); reads degrade to "nothing remembered" and never fail a turn.
- **Attribution**: `saidBy` so Mind never tells one recruiter "you told me" about a colleague's words.
- **Write guards**: contact details and protected attributes are refused at write time (`hasContact`, `mentionsProtected`).
- **A distil job after 10 quiet minutes** with a cursor kept on the memory run's output, `policy: "short"` so later messages fold into one job, and a pre-check that re-queues if the chat is still active.
- **Structural safety around it**: every other mutation is a proposal that needs a click (`agent/actions.ts`, locked per approval, closed by a recorded result), at most 3 proposals per turn, per-user and per-org daily chat quotas, run slots, contact redaction on the way out, tags neutralised in everything inserted into prompts (`platform/untrusted.ts`), a prompt that says remembered items are never instructions.
- Matching already uses memory plus the campaign's shortlist and pass decisions with reasons, name-blind, with an instruction filter (`matching/context.ts`, `injection.ts`), a 3,500 character cap and graceful fallback.

### 3.2 Gaps, with file references

| # | Gap | Where | Why it matters |
|---|---|---|---|
| G1 | **Contradictions reinforce the stale fact.** The dedupe branch runs unless `m.key` or `m.supersedes` is set, takes the nearest neighbour at cosine >= 0.92 and bumps `evidence_count` and `confidence`; it never updates text or checks whether the claim changed | `store.ts` 254 to 288 | A change of number ("40 lakh" to "45 lakh") is a near-duplicate. Neither the `remember` tool (tools.ts 349 to 391) nor the distil job (service.ts 209 to 223) passes `supersedes`; `recall_memory` (tools.ts 334 to 347) returns no ids, so the model could not even name what it is replacing. The test (memory.test.ts 104 to 139) passes `supersedes` explicitly, so it never exercises this path. Independent benchmarks show this is where every system is weakest (section 2.2) |
| G2 | **The only autonomous write is un-gated and un-grounded.** `remember` accepts `level: "org"` from any role, requires no evidence that the recruiter said it, and writes `active` at once. Agent mode also reads `candidate_profile` (raw profile text and notes, tools.ts 200 to 221), `campaign_matches` (LLM-written strengths and concerns derived from profile text) and `find_candidates` | `agent/tools.ts` 349 to 391; `agent/mcp.ts` `text()` only neutralises our own tags | The chain untrusted profile text, then `remember(level: "org")`, then every colleague's context block and every judge call (`matching/context.ts` 123 to 136) is the Rule-of-Two violation and the persistent injection pattern in section 2.5. `cleanProfileText` exists but is used only in `matching/service.ts` (line 28), not in the chat tools. Existing mitigations: the prompt says memories are not instructions, `mentionsProtected` and `hasContact` refusals, and approvals still gate every real action, so the realistic harm is biasing judgement and wording, not sending mail |
| G3 | **Distil can launder.** The transcript fed to the extractor includes the agent's own lines (service.ts 196 to 198), and nothing ties an extracted memory to something the recruiter actually said. Org-level outputs go straight to active. Campaign scope uses the last message's campaign (line 184) and client scope the conversation's focus, so a chat that spanned two campaigns mis-scopes earlier facts | `memory/service.ts` 111 to 227 | OWASP: do not auto-re-ingest the agent's own outputs into trusted memory. Pasted candidate text in a user message can also carry instructions |
| G4 | **Erasure and forgetting are not wired.** `purgePerson` and `forget` have no callers; `deleteCandidate` (candidates/service.ts 1049) deletes notes and the row but never touches memory, and its route has no queue handle. Rejection episodes embed the person's full name (matching/service.ts about 727 to 741); episodes have no expiry. No API lists, edits or deletes memories, although architecture §11.7 promises recruiters can see, correct and delete what the agent remembers | `store.ts` 398 to 419; `candidates/routes.ts` 30 to 33 | DPDP erasure and access, trust, and the product promise |
| G5 | **Time model is thin.** Only `document_date` and `expires_at`; no `valid_from/valid_to` or `event_date`; confidence only ever goes up (+0.1 on reinforcement); `profile()` ranks by confidence then evidence count (lines 393 to 395), so an old, once-reinforced fact outranks a newer one forever; the doc's `uses/helped/hurt` fields do not exist | `store.ts` 365 to 396 | Stale facts dominate; no basis for outcome learning |
| G6 | **No record of what memory a run used.** `contextFor` returns memories to `contextBlock` and nothing is written to the run; `recall_memory` likewise | `memory/service.ts` 89 to 109; `agent/chat.ts` 408 to 415 | No audit, no "why did you say that", no outcome credit (architecture §20 lists this as not built) |
| G7 | **Episodes are thin.** Only two writers: a sourcing-run summary (`sourcing/service.ts` about 335) and rejection reasons (`matching/service.ts` about 727). Stage moves (`stage_moves.reason` exists), outreach outcomes (`logOutcome`), hires and campaign close write nothing | | "What worked on past campaigns", the agency memory's reason to exist, cannot be learned |
| G8 | **Recall is org-wide.** `recall` without `clientId` searches every client's memories in the org; `contextFor` passes `clientId` only to `profile()` | `store.ts` `visible()`; `service.ts` 102 | Client A's confidential facts (comp bands, intake notes) can surface in drafts and judgements for client B |
| G9 | **Context block is uncapped and re-sent every turn.** Up to 25 campaigns, pipeline lines, the spec, 20 profile memories and 6 recalled memories, in the user message each turn (`chat.ts` 361 to 418); `recentHistory` is the last 12 messages cut to 2,000 characters (conversations.ts about 168 to 182) and only used when the session is rebuilt. I have not read the gateway repo, so whether the warm CLI session accumulates old blocks is unverified | `agent/chat.ts`; `agent/prompts.ts` | Possible stale-snapshot "clash"; unmeasured cost; the model is told to "trust" the context block but not told that older blocks are superseded |
| G10 | **Hard constraints live (in the catalogue) in vector memory.** `memory-catalogue.md` puts `do_not_contact`, `policy.no_poach` and approval policies in memory; there is no suppression or consent table and no check in `approveMessages` or the send job | `docs/memory-catalogue.md` §1, §5; `outreach/*` | Similarity search can miss a "do not contact"; a hard rule must be a deterministic check, not a retrieval |
| G11 | **Reply capture is manual.** Gmail scope is `gmail.send` only; replies are logged by hand and a 4-day "any reply?" task exists | `connections/google.ts` 3 to 6; `outreach/jobs.ts` `NO_REPLY_AFTER` | Blocks automatic follow-up and learning from replies |
| G12 | **Tests cover isolation, reinforcement, explicit supersession, purge and distil-once, but no recall-quality eval, no injection cases, no knowledge-update through the LLM path, no role gating, no cross-client leak.** | `test/memory.test.ts` | Nothing else here is measurable |
| G13 | **Ops**: Qdrant has no PITR and Railway volume backups are young; two stores can drift; the local compose file pins Qdrant v1.15.4 while the JS client is ^1.19 | `docker-compose.yml`; `package.json` | Disaster recovery and feature availability |

### 3.3 Where we are on the research

We already follow: hybrid retrieval with RRF, tenant-aware indexing, background consolidation after quiet, source attribution, soft-delete flags, profile-plus-recall injection, propose-then-approve for every action, untrusted fencing, name-blind judging. We are behind on: supersession and validity time (G1, G5), grounded and typed memory writes (G2, G3), lifecycle and erasure (G4), usage tracking and outcome credit (G6, G7), client-level isolation inside a tenant (G8), and any evaluation (G12).

---

## 4. Recommendation

Each item is tagged **Implement now** (small, safe, valuable; files and functions named), **Next**, or **Later**.

### 4.1 The memory model: six types, only some of them vector memory

| Type | What it holds | Store | Retrieval | Lifetime |
|---|---|---|---|---|
| Hard rules | Suppression list, consent and source record, no-poach, send caps and windows | **Relational tables, enforced in code** (Next) | Deterministic check, never similarity | Until changed; audited |
| Semantic slots | Facts, preferences, constraints with a `slot` = scope plus topic ("client:acme:comp_band") | Qdrant `fact`/`preference` | Profile (injected) plus recall | One live value per slot; superseded, never overwritten |
| Beliefs | Patterns inferred from at least 2 distinct pieces of evidence, with evidence ids | Qdrant `belief`, `status: pending` until confirmed or reinforced | Profile, shown as "usually", never as fact | 180 days unless reinforced |
| Episodes | What happened: sourcing run, pass reason, reply outcome, hire | Qdrant `episode` | Recall only | 365 days (candidate-level 180), rolled up by reflection |
| Playbooks | How to do a task well here (small-edit rules) | Qdrant `playbook`, org-level only after admin confirm | Injected per skill | Until changed |
| Working state | A campaign's spec, stage counts, open asks, watches, last decisions | **Computed from SQL each turn** (already `contextBlock`), formalised as a pure `campaignBrief()`; watch state in `agents.counters` | Always injected, budgeted | Derived; no memory writes |

Conversation memory stays with the CLI session plus `recentHistory`. Do not build an observation log or compaction until measurement (4.8) shows chats long enough to need it.

Decision on the catalogue (`memory-catalogue.md`): `policy.*`, `constraint.do_not_submit`, `do_not_contact` and approval rules become relational rules (Next). The memory copy stays only as human-readable explanation.

### 4.2 Schema changes (Qdrant payload v2, additive; `schema_version: 2`)

All additive to `Payload` in `store.ts`; v1 points read with defaults.

| Field | Type and index | Purpose |
|---|---|---|
| `slot` | keyword, indexed | `${level}:${scopeId}:${topic}` when a topic exists; finds the live value deterministically before any similarity test |
| `valid_from`, `valid_to`, `event_date` | datetime | Separate "true from/to" and "happens on" from `document_date` (when said) and `created_at` (recorded); superseding sets the old row's `valid_to` |
| `supersedes` | keyword | Mirror of `superseded_by`, so a chain can be walked either way |
| `source` | object `{ kind, quote, message_seq, run_id }` where `kind` is one of recruiter_stated, agent_inferred, outcome, document | Provenance; `quote` is the verified verbatim span |
| `trust` | keyword, indexed; values user, derived, untrusted | Hard gating: `untrusted` can only produce a `fact` about a named entity, expires in 90 days, never a rule |
| `status` | keyword, indexed; values active, pending, rejected | `visible()` returns `active` only |
| `last_confirmed_at`, `last_used_at`, `use_count` | datetime, int | Decay and later outcome credit (`helped`/`hurt` added when outcome writes exist) |
| `embedding_model` | keyword | Makes mixed states detectable when the model changes (alias-swap re-embed already supported) |

Postgres side (Now): no new table. Audit through the existing tenant `activity` table with `logActivity(... verb: "memory_saved" | "memory_forgotten", data: { memoryId, runId })` against the campaign, client or candidate subject; IDs only, no text.

### 4.3 Write path

**(a) The `remember` tool (hot path) - Implement now**, files `agent/tools.ts`, `agent/actions.ts`, `memory/store.ts`:

1. Add a required `quote` argument. In the handler, load this conversation's last 20 user messages from `messages` and require the quote (whitespace and case normalised, at least 8 characters) to be a substring of one of them; otherwise return "Not saved: I can only remember what you've told me. Say it in your own words and I'll save it." This is the cheap, deterministic version of the evidence check the judge already uses, and it closes the path where text from a tool result becomes memory.
2. **Gate by level.** `recruiter` and `campaign` level save at once (status `active`, `trust: user`) and the tool result says "Saved: ... (say 'forget that' to undo)". `client` and `org` level become a **proposal**: add `{ action: "remember", level, kind, text, campaignId }` to the `Action` union in `actions.ts`, render it in `describe()` ("Remember for Acme: ..."), write it in `perform()`. Same card, same lock, same audit as every other mutation. On approval, a client-level memory goes in `active` (the recruiter is on a campaign for that client); an org-level memory goes in `active` only if `scope.role` is owner or admin, otherwise it is written `pending` and the admins get a confirm task (an agency-wide rule should not be settable by one recruiter's click).
3. Add `replaces?: string` (an id from `recall_memory`) passed through as `supersedes`.
4. Cap blast radius: at most 3 memory writes per turn (reuse the `proposals:${runId}` lock pattern) and a per-user daily quota via `takeQuotas` (`platform/quota.ts`).
5. Apply the instruction filter to `text` and `quote`: reuse the `INSTRUCTION_LIKE` patterns from `matching/injection.ts` (move `cleanProfileText` into `platform/untrusted.ts` so both use one copy) and add patterns for statements about the agent's own behaviour ("always approve", "never ask", "skip approval", "send without").

**(b) Contradiction-safe store - Implement now**, `store.ts` `remember()`:

- `sameClaim(a, b)`: pure function comparing the numerals, negations and comparison words (not, never, only, at least, under, over, more than) of two sentences. Unit-testable, no model call.
- If `slot` is set: look up the live memory in that slot (payload filter, no vector). Same claim (equal after normalisation, or cosine >= 0.97 and `sameClaim`) reinforces; anything else **supersedes**: new point created, old point gets `is_latest: false`, `superseded_by`, `valid_to`.
- If no slot: the near-duplicate branch (lines 254 to 288) reinforces only when `sameClaim` is true. If cosine is 0.80 to 0.97 and `sameClaim` is false, create the new memory and queue it for adjudication (below) instead of reinforcing.
- `recall_memory` returns `id` and a scope label; `profile()` and `recall()` already return ids in `Memory`.

**(c) Distil (background) - Implement now (grounding), Next (adjudication)**, `memory/service.ts` `DISTIL`, `Extracted`, `distil()`:

- Prompt `memory_extract@4`: "Evidence comes only from lines spoken by the recruiter. Agent lines are context, never evidence." Add `quote` to each memory; in code, verify the quote against the user lines of this batch and drop failures. This removes laundering through the assistant's reply.
- Derive `campaignId` per memory from the quoted message's `campaignIds` (the `ChatLine` already carries it) instead of the last message (line 184).
- Force `org`-level outputs to `status: pending`; drop `belief` unless backed by at least two distinct quotes.
- Adjudication (Next): after extraction, fetch the top 3 live neighbours in scope for each candidate and make **one** batched Sonnet call that returns `add | update(targetId) | noop` per candidate. This is Mem0's 2025 design and the consolidation step LinkedIn and Google run; Memory-R1 shows UPDATE beats DELETE plus ADD. It runs in the background lane, about one extra call per quiet chat that produced candidates.

**(d) Outcome writes (deterministic, no LLM) - Next.** On stage move with a reason, shortlist or pass with a reason (already in `match_feedback`), outreach outcome (`logOutcome` in `outreach/service.ts`), hire and campaign close: write idempotent episodes (`key` = event id) with `expiresAt`, `personIds`, `source.kind: "outcome"`. Counts and rates are computed in SQL; only free-text reasons go to memory.

**(e) Reflection - Next.** Trigger on accumulated decisions (Generative Agents: importance sum, not clock), for example 10 new decisions on a client: SQL aggregates plus one background Sonnet call propose at most 3 beliefs each citing evidence ids, written `pending`. Surface them as a task ("Mind noticed Acme passes on services-only backgrounds: confirm?") through the existing rule-task mechanism (`upsertRuleTask`). Admin confirm makes them `active`. This is the explicit-proposal camp (Metaview, LinkedIn learning agent) and avoids Gem's concern about silent drift.

### 4.4 Read path

**Implement now**, `store.ts` and `memory/service.ts`:

- **Status and client scope.** `visible()` adds `status = active`. When a campaign is known, filter `client_id in {this client, null}` (a `should` condition) in `contextFor` and in the `recall_memory` tool, so client A's facts cannot appear for client B (G8). Org-wide knowledge (`client_id` null) still flows.
- **Recency-aware ranking.** `effective = confidence * 0.5^(age_days / halfLife)` with half-life by kind: preference 180, fact 365, belief 120, episode 45; age measured from `last_confirmed_at`, falling back to `document_date`. Apply in `profile()` (re-rank the 15 per level you already scroll, replacing lines 393 to 395) and as a post-RRF re-weight in `recall()`. Reversible (ranking only, nothing deleted). Per-level quotas for the profile: org 4, client 6, campaign 6, recruiter 4. This is hygiene, not a score gain (section 2.3).
- **Budgeted block.** In `chat.ts` `contextBlock`, give the Remembered section a character budget (start at 2,000), ordered rules and constraints, then this recruiter's preferences, then client facts, then beliefs, then episodes; same pattern as `matching/context.ts`.
- **Record what was used.** `contextFor` also returns the ids; `agentTurn` emits `progress { step: "memory", ids }` and `recall_memory` emits the same through `deps.events.emit(runId, ...)`; a low-priority `memory.touch` job bumps `last_used_at` and `use_count`. This is audit now and the join key for outcome credit later.
- **Fence with a per-turn nonce** (Next): wrap recalled items in `<memory-xxxx>` with a random suffix, attributes `source`, `trust`, `date`; keep `untrusted()`. Spotlighting authors say delimiters alone are bypassed once the attacker knows them.

**Next / Later:** set RRF `k` to 60 and weight dense and sparse, once the memory eval exists and Qdrant is on v1.16 or later; add a cross-encoder rerank only for dedupe and supersession decisions (a 20-item shortlist rarely needs it, and no clean CPU latency exists for 20 short passages).

### 4.5 Forgetting and retention

**Implement now**, `memory/service.ts`, `candidates/{service,routes}.ts`, new `memory/routes.ts`:

- **Erasure on candidate delete.** `deleteCandidate` returns the `personId`; the route enqueues a new job `memory.purge-person { organizationId, userId, personId }` (retrying, idempotent, `store.purgePerson`). A queue job is the outbox; no new infrastructure.
- **Memory API.** `GET /v1/memories?level=&clientId=&campaignId=&status=` (add `list` to the store using `scroll`), `DELETE /v1/memories/:id` (soft `forget`), `POST /v1/memories/:id/confirm|reject` for pending items. Org-level changes need owner or admin. UI later; the API makes the promise in §11.7 real and gives the eval a read surface.
- **Expiry defaults.** In `remember()`, default `expiresAt` by kind when absent: episode 365 days, candidate-level episode 180, `trust: untrusted` 90, pending 30 (then `rejected`). Set explicitly in `rememberPasses` and the sourcing episode as well.
- **Nightly sweep** (pg-boss schedule, like `housekeeping`): archive expired and unreinforced beliefs, hard-delete memories forgotten for over 30 days, purge `rejected`. Qdrant removes deleted points at optimiser vacuum, not instantly; do not promise instant physical erasure in copy.
- **Backups.** Nightly Qdrant snapshot to object storage and one restore drill; Railway volume backups are young and Qdrant has no PITR [read]. Because chats and decisions live in Postgres, a lost Qdrant is recoverable by re-running distil, but explicit `remember` saves are not (they exist only in Qdrant), which is another reason for the ledger in 4.12.

### 4.6 Isolation

Keep: org filter inside the store, owner-only recruiter memories, campaign visibility, `personal:<userId>` keys. Add:

- Client-scoped recall (4.4).
- **Isolation tests that fail CI** (4.11): cross-tenant canary, cross-client canary, recruiter A's preference never visible to recruiter B, campaign-restricted recruiter, erased person never recalled.
- Note: BM25 IDF in Qdrant is shard-wide by default, so term statistics (not text) are shared across tenants. Negligible leakage, but know it; the per-tenant option arrives in v1.19 [read].
- Prefer enforcement in code and index over prompts everywhere (the MCP token already carries org and user; keep arguments from overriding them).

### 4.7 Injection defence (ranked by value over effort)

1. **No autonomous writes to shared memory** (4.3a): quote grounding, click for client and org level, `pending`.
2. **Typed and tainted outputs.** Distil returns typed records; code, not the model, decides status. Anything derived from imported documents (CVs, Notion, Slack, replies) is `trust: untrusted`: only `fact` about a named entity, 90-day expiry, never `playbook` or a rule.
3. **Clean tool results.** Run `cleanProfileText` over profile text, notes and any future reply text before it enters `candidate_profile`, `find_candidates` and `campaign_matches`; datamark long blobs (Next).
4. **Write-time scan** of memory text and quote for instruction-like and agent-behaviour phrases. Cheap, no measured utility cost, but 0 of 360 factual poisons caught in one study, so it is hygiene only.
5. **Rule of Two by construction.** The chat agent reads untrusted text and sensitive data, so state change stays click-gated. For reply handling (Next) split the roles: a no-tools classify task reads the candidate's reply and returns structured fields (intent, entities); a separate step drafts for approval. The reader never holds the send tool. Approval cards render structured fields only, no model-written links or images, which also blocks the image-exfiltration channel from the ChatGPT case.
6. **Blast radius caps**: 3 writes per turn, daily quota, `pending` expiry.
7. **Audit and review**: `activity` rows and run events with memory ids; a "What Mind remembers" list (4.5) so poisoned entries are visible and deletable.
8. **Never feed the agent's own text back as evidence** (4.3c). **Bounded occupancy at read time**: cap how many untrusted-derived items may enter one context block rather than adding a soft trust weight (additive weights showed no effect in one study).

### 4.8 Context-management strategy for the agent loop

Our design (code-built `<context>` plus just-in-time tools, propose-then-approve, run slots, stateless watch ticks reading durable state) matches the recommended hybrid and the long-running-harness pattern. Changes:

**Implement now**
1. **Measure before building.** Log per chat turn: size of the `<context>` block, input tokens, cache-read and cache-creation tokens (the CLI `result` usage the gateway already receives) and whether the cache used the 1-hour or 5-minute bucket (`usage.cache_creation.ephemeral_1h_input_tokens` vs `ephemeral_5m_...`). Confirm the gateway forwards `anthropic-beta` and `cache_control`. A stripped header would silently rewrite the whole history at full price every turn. Chat turn count distribution decides whether compaction is ever needed.
2. **State the supersession rule in the prompt.** `agent/prompts.ts` `BASE`: "Each message begins with a fresh <context>. If more than one appears in this conversation, only the latest is current; earlier ones are history." Prompt-only change (`chat@9`), no cost.
3. **Cap and order the block** (4.4).

**Next (only if the measurement says so)**
4. **Delta context**: keep a per-section hash on the conversation row; send the campaign list and spec only when changed, always send date, focus and memory. Anthropic's own cache guidance (volatile content last) and Breunig's "clash" argue for it; no study measures it, so A/B it.
5. **Rolling summary** for chats past about 40 turns: keep the last N verbatim, summarise older turns with a prompt that preserves entity ids and open asks, keep the full log (it is in `messages`). Masking beats summarising on cost in the one comparison, so prefer clearing old tool results first.
6. **A progress log for long-running agents.** Add a capped list of the last 10 tick decisions to `agents.counters` ("found 3, skipped 2 repeats, paused: 8 waiting") so each fresh tick starts from recorded decisions, as in the long-running harness pattern; the watch already reads durable state.
7. **Formalise `campaignBrief()`** as one pure function used by chat, sourcing context, watch ticks and follow-ups, with a character budget. No LLM, no memory writes.

**Not recommended now**: sub-agents in chat (about 15x tokens against a scarce subscription allowance); only for read-only background fan-out such as a campaign retrospective or weekly client review, run as fresh-context gateway tasks that return structured JSON with references. No tool-result clearing in chat (the CLI manages its own window; our tools already cap lists at 30 to 60).

### 4.9 Agent tools and schedules to add

Precedent and risk per item. Build order follows impact and safety.

| # | Capability | Builds on | Precedent | Risk and guard | When |
|---|---|---|---|---|---|
| 1 | **Suppression, consent and send caps as relational rules** (tenant `suppressions(person_id, email_hash, reason, until, source)`; check in `approveMessages` and the send job; per-mailbox daily cap and window beyond `outreach_slots`) | `outreach/service.ts`, `outreach/jobs.ts` | CAN-SPAM, ICO, DPDP; Juicebox sends only reviewed sequences | Prerequisite for every item below; deterministic, not memory | Next (prerequisite) |
| 2 | **Follow-up drafts**: job `outreach.suggest-followups` extends `remindUnlogged` (4-day scan); background task `followup_draft@1` drafts into existing `outreach_messages` as `draft`; task "3 follow-ups ready"; at fire time re-check replied, bounced, suppressed, campaign paused, cap, window; max 2 per thread; stops on reply | pg-boss, `createDrafts` (a later draft is a follow-up), approvals | Juicebox, Gem, Inngest `waitForEvent` pattern | Double sends: idempotency key `hash(org, campaign, person, step, channel)` with unique index, reserve then send, `unknown` state on ambiguity | Next |
| 3 | **Reply capture** without restricted scopes: Reply-To routing through an inbound-parse address, optional forward/BCC; classify in a no-tools task; draft reply for approval; unsubscribe auto-adds to suppression; keep manual "mark replied" | `logOutcome`, `core.connections` | Postmark `MailboxHash`; Gmail scope table | Different Reply-To may cost trust; partial coverage; injection via replies, hence the reader/sender split. Decide CASA (`gmail.readonly`) only with two assessor quotes | Next |
| 4 | **Weekly cadence and dead-man pause for watches**: add `weekly` to `Cadence` (`packages/shared/src/sourcing.ts` 173 to 183), pause after N days with unreviewed proposals, "out of leads" instead of lowering the bar (already how the ledger behaves) | `agents`, `superviseWatches`, `pauseAtWaiting` | Juicebox 4-day pause | Credit burn; small change | Now (small) |
| 5 | **Slack digest**: daily or weekly shortlist and pipeline recap via the existing bot (`postSlackMessage`); parseable replies ("1,4 yes . 3 no, too junior") later | `connections/slack-service.ts`, `watch.notify` | Metaview, Ashby | Slack text is untrusted input; outbound-only first | Next (outbound), Later (parse replies) |
| 6 | **Calibration proposal**: after 10 to 15 shortlist/pass verdicts or weekly, propose requirement-weight or spec changes as an approval card with the evidence | `match_feedback`, `Action` union | Metaview, Juicebox Calibrate, LinkedIn learning agent | Learned bias: protected attributes already blocked; log the diff | Next |
| 7 | **Campaign retrospective** on close or hire: episode plus belief proposals (reflection, 4.3e) | `core.runs` skill `memory` | Generative Agents reflection, Hindsight | Pending until confirmed | Next |
| 8 | **`create_task` and `log_outcome` tools**: low-risk writes that use existing services and activity log | `tasks/service.ts`, `logOutcome` | | Undo through delete; cap per turn | Next |
| 9 | **Calendar free/busy and a drafted availability email** in copilot mode | new connection | Ashby Copilot, Paradox | Calendar scopes are sensitive, not restricted; time zones; approval before send | Later |
| 10 | **Notion read-only import** of client intake docs as `trust: untrusted` `pending` facts | `connections` Notion | | Prompt injection in documents; REST API with integration token, not MCP | Later |

Not yet: WhatsApp cold outreach (opt-in and templates required), any LinkedIn automation (User Agreement), fully autonomous sending (93 percent click-through is a weak control; invest in risk-tiered, payload-bound approvals before loosening gates).

Tool-design rules to apply to each new tool: name by workflow and return names with ids available; cap responses; actionable errors; idempotency key on every side effect; approval bound to the payload hash with an expiry; per-run caps on steps, tool calls and proposals (3 exists); every write logs actor, tool, input hash, run id, memory ids used and approval id.

### 4.10 Integrations: patterns for Slack, Notion, Calendar, Gmail

- Stay first-party for the four providers we use or will soon use; use broker or vendor MCP *clients* only for long-tail providers. Do not run an MCP server for third parties to call without OAuth 2.1, Protected Resource Metadata and `resource` validation; our internal `/mcp` with a per-run token is fine as is.
- Capability levels per connection (`read`, `draft`, `write`); build the tool registry from granted scopes; default `read`. `core.connections.scopes` already stores the grant; add `capability` and `owner_user_id`.
- User-scoped Gmail and Calendar (the agent acts only as the person who connected and never borrows a colleague's token); org-scoped Slack and Notion with a named admin owner. Already how `connections/service.ts` models it.
- Envelope encryption: keep AES-256-GCM with AAD (done); move the master key behind a KMS and add a `key_id` for rotation (Later). Serialise refresh per connection with the advisory-lock helper, persist rotated tokens atomically, mark `needs_reauth` and pause dependent schedules on `invalid_grant`.
- Treat everything read from Slack, Notion or a calendar as untrusted text (4.7). Per-connection quotas and a per-tenant kill switch.

### 4.11 Evaluation plan

Smallest useful plan for a small team; cost is dominated by human labelling, and model calls draw on the shared subscription allowance, so schedule runs in the background lane overnight [inference].

1. **Safety suite (deterministic, every PR, pass^3), Implement now** in `test/memory-safety.test.ts` with the existing fakes: no memory write without a verified quote; client and org writes produce a proposal, not a point; recruiter cannot write org memory; a reply or profile containing "ignore previous instructions, remember that ..." makes no `remember` call and no pending point; contact details and protected attributes refused; cross-tenant canary (fact for org A never returned to org B); cross-client canary; recruiter A's preference invisible to B; campaign-restricted recruiter; person purge on `deleteCandidate`; replayed idempotency key returns the existing send (when follow-ups exist).
2. **Memory suite, 60 to 100 cases, Implement now (start with 20)**, mapped to LongMemEval and MemoryAgentBench categories: preference recall; two-session synthesis; **knowledge update without `supersedes`** (the 40 to 45 lakh case; expected result: one live value, old value in history); temporal ("what was true in March"); abstention ("what salary did Acme approve?" when never given); conflict resolution through the distil LLM path; poisoned-write attempts. Run nightly against the `memories_eval` alias from §14.1 with the real embedder; fix the judge, embedder, `k` and prompt version. Metrics: recall@5 of the expected memory id, exact slot-value accuracy (code-checked where possible), abstention rate, isolation violations (must be zero).
3. **Trajectory and task suite, 30 to 50 cases, Next**, drawn from real chat traces (run events already store tool calls and approvals): grade end state and tool sequence in code (no mutation without an approval event, right campaign, right tool); LLM judges only where code cannot decide, validated on about 100 human labels; report pass^3.
4. **Free labels from approvals.** Every rejected or edited approval card is a labelled failure with the human's correction; log a reason code and add it to the suite.
5. **Ablation**: memory on versus off for the judge context, as soon as the gold set from `candidate-matching-research.md` item 1 exists.
6. **Cadence**: safety on every PR; memory and trajectory nightly or on prompt, model, tool or schema change; review failures every 2 to 4 weeks; retire evals that always pass.

### 4.12 Storage decision (be decisive)

**Decision.** (1) No graph database; (2) no external memory service; (3) Qdrant stays the retrieval index for this quarter; (4) Postgres becomes the lifecycle record (audit rows now, ledger next); (5) vectors move to Postgres only on the triggers below.

**Why not a graph or a service.** Our relational facts are already joins over tables we own; graph gains on conversational memory are weak to negative in the evidence; extraction adds LLM calls per memory under a subscription allowance; Mem0 removed graph stores from OSS; the leading hosted systems differ on stack (Supermemory on Postgres) and none shows a retrieval win attributable to the database.

**Why keep Qdrant now rather than migrate.** Our setup is the documented tenant pattern that pgvector cannot match (filter-aware per-tenant graphs); the memory work that matters (G1 to G8) is store-independent; a migration adds risk and consumes the same engineering time that fixes correctness and safety; and the stated constraint from 3 Oct was to keep memory load off the main Supabase database, which also hosts the people HNSW index. The cost is a dual-store system with weak DR, which is why 4.5 adds snapshots and 4.12 adds the ledger.

**Why Postgres could carry it** (and the fallback is ready). Volume is 1k to 100k memories per agency; per-tenant filtering is the shape pgvector's maintainers recommend solving with separate tables or partitions; memory tables are orders of magnitude smaller than `mother_data.people`; Supermemory and Letta run on Postgres; costs are the same order of magnitude (Qdrant on Railway about $140 a month at 5M memories, about $780 at 50M; `halfvec` Postgres about 10 GB heap plus 9 GB HNSW at 5M, about $3 a month of disk plus the RAM to keep it hot) [calc].

**Triggers to move vectors into Postgres** (any one): a Qdrant restore drill fails or Railway backups prove inadequate; we need transactional supersession and erasure with proof for a customer; the ledger shows the Qdrant sync drifting more than once a quarter; or we are running memory at under 10M rows and want one fewer service. **Triggers to stay or move off Postgres later** (from the fallback spike): p95 filtered hybrid above 150 ms at 10M rows, recall@10 below 0.95 for tenants above 50k rows, HNSW plus hot heap above about half of database RAM, total above about 50M memories.

**Next: the Postgres memory ledger.** A tenant-schema table `memories` created by `provision_tenant()` (same `create table if not exists` pattern as `102_workspace_tables.sql`; personal workspaces use the `personal` schema with `workspace_owner`) holding text, scope, slot, validity, status, provenance, `qdrant_id`, `embedded_at`; every write goes to the ledger and an outbox job (`pg-boss` can enqueue inside the same transaction) updates Qdrant idempotently; a reconcile job compares counts and heals drift; Qdrant becomes rebuildable from the ledger. This gives atomic supersession, erasure with proof, joins for visibility, simple list and filter for the UI, and exports for evals. It also turns the later migration into "add a `halfvec` column and retire the outbox".

**Fallback design, if the triggers fire** (an unrun sketch; confirmed only against pgvector and Postgres docs; run `EXPLAIN (ANALYZE, BUFFERS)` as the application role before trusting it; needs pgvector 0.8.2 or later):

```sql
-- per tenant schema (provision_tenant); personal schema adds workspace_owner
create table memories (
  id              uuid primary key default gen_random_uuid(),
  slot_key        text,                         -- 'client:<uuid>:comp_band'
  level           text not null,                -- org|client|campaign|recruiter|candidate
  kind            text not null,                -- fact|preference|belief|playbook|episode
  topic           text,
  client_id       uuid,
  campaign_id     uuid,
  user_id         uuid,                         -- recruiter-level owner
  person_ids      uuid[] not null default '{}',
  content         text not null,
  status          text not null default 'active',     -- active|pending|rejected
  trust           text not null default 'user',       -- user|derived|untrusted
  source          jsonb not null default '{}',        -- kind, quote, message_seq, run_id
  confidence      real not null default 0.8,
  evidence_count  int  not null default 1,
  valid_during    tstzrange not null default tstzrange(now(), null, '[)'),  -- world time
  recorded_at     timestamptz not null default now(),                       -- record time
  superseded_at   timestamptz,
  supersedes_id   uuid,
  expires_at      timestamptz,
  forgotten_at    timestamptz,
  last_confirmed_at timestamptz,
  embedding_model text not null,
  embedding       halfvec(768) not null,
  fts             tsvector generated always as (to_tsvector('simple', content)) stored,
  -- one live version per slot at any world time
  exclude using gist (slot_key with =, valid_during with &&)
    where (slot_key is not null and superseded_at is null)   -- needs btree_gist
);
-- live rows only; every query repeats this predicate verbatim
create index memories_live    on memories (level, client_id, campaign_id)
  where superseded_at is null and forgotten_at is null and status = 'active';
create index memories_people  on memories using gin (person_ids)
  where superseded_at is null and forgotten_at is null;
create index memories_fts     on memories using gin (fts)
  where superseded_at is null and forgotten_at is null;
create index memories_expiry  on memories (expires_at) where expires_at is not null;
-- HNSW only for tenants above ~5k live rows (built by a job, per tenant); below that, exact scan:
-- create index memories_hnsw on memories using hnsw (embedding halfvec_cosine_ops)
--   where superseded_at is null and forgotten_at is null and status = 'active';

-- hybrid recall with RRF (sketch): two CTEs each LIMIT p_pool (40), then
--   score = 1/(60 + sem_rank) + 1/(60 + lex_rank) over a FULL OUTER JOIN, ORDER BY score DESC LIMIT k.
-- Set, per transaction: hnsw.iterative_scan = 'relaxed_order', hnsw.max_scan_tuples = 20000, hnsw.ef_search = 80.
-- Lexical leg: websearch_to_tsquery('simple', q) and ts_rank_cd(fts, q, 32); add pg_trgm for name typos.
-- Names and clients should resolve to ids and filter structurally, not rank lexically.

-- supersession (one transaction, with an outbox job to the derived index):
--   update memories set superseded_at = now(), valid_during = tstzrange(lower(valid_during), $from, '[)') where id = $old and superseded_at is null;
--   insert into memories (... supersedes_id = $old, valid_during = tstzrange($from, null, '[)')) ...;
-- as-of query: valid_during @> $t and recorded_at <= $known_at and (superseded_at is null or superseded_at > $known_at)
```

Spike gates if ever run (two weeks of shadow writes and replayed real queries): recall@10 at least 0.95 against exact for tenants of 1k, 10k and 100k rows; p95 hybrid query at most 100 ms at about 5M total rows on the target Supabase size; other queries on the same database degrade under 10 percent. Exact scan for small tenants is plausible (extrapolating one Neon data point, about 3 ms at 1k rows, 58 ms at 20k, 290 ms at 100k for 768-d) but unverified on our hardware [calc]. Postgres 17 on Supabase has no `WITHOUT OVERLAPS` (PG18 only); the `btree_gist` exclusion constraint above works on 17.

**Embeddings and reranking.**
- **Keep `bge-base-en-v1.5` (768-d, MIT, MTEB-v1 retrieval 53.25)** until we have 200 to 300 labelled memory-query pairs from real traces. Embedder choice moved results by up to 6 points in a controlled study, so decide on our data, not on leaderboards. Store `embedding_model` per point from now so a swap is detectable.
- Candidates if the eval shows a gap or Hindi/Hinglish text needs coverage: `gte-modernbert-base` (768-d, Apache-2.0, retrieval 55.33, English), EmbeddingGemma-300M (768-d, Matryoshka to 256 costs about 1.3 points, Gemma terms), Qwen3-Embedding-0.6B (Apache-2.0, English retrieval 61.83 on MTEB v2, multilingual). MTEB v1 and v2 scores are not comparable. `fastembed`'s published model list does not include these, so a swap likely means an ONNX or sentence-transformers path in the gateway. Avoid `jina-embeddings-v3` (CC-BY-NC). API embedders are cheap (re-embedding 50M short memories about $40 to $400) but break the no-external-API constraint.
- **Skip reranking** a 20-item memory shortlist by default. Anthropic's gain came from reranking 150 candidates down to 20 (failure 2.9 to 1.9 percent); use a cross-encoder only for dedupe and supersession decisions if it wins on our eval.

### 4.13 Implement-now checklist

| # | Change | Files and functions | Size |
|---|---|---|---|
| 1 | `remember` tool: required `quote` verified against this conversation's user messages; `replaces`; client/org level become an approval `Action`; per-turn and daily caps; instruction filter on text and quote | `agent/tools.ts` `remember`, `agent/actions.ts` (`Action`, `describe`, `perform`), `platform/quota.ts`, move `cleanProfileText` to `platform/untrusted.ts` | M |
| 2 | Store: `sameClaim`, slot lookup, supersede-instead-of-reinforce, payload v2 fields (`slot`, `valid_*`, `source`, `trust`, `status`, `last_*`, `embedding_model`), default expiry by kind, `status` and client scope in `visible()`, `list`, recency-aware `profile()` and `recall()` | `memory/store.ts` `remember`, `visible`, `profile`, `recall`, `setUp` (new payload indexes) | M |
| 3 | `recall_memory` returns `id` and scope label; emits used ids | `agent/tools.ts` `recall_memory` | S |
| 4 | Distil: `memory_extract@4` with `quote`, user-lines-only evidence, per-quote campaign, org outputs `pending`, belief needs two quotes | `memory/service.ts` `DISTIL`, `Extracted`, `distil` | S to M |
| 5 | Clean untrusted tool output | `agent/tools.ts` `candidate_profile`, `find_candidates`, `campaign_matches` (strengths and concerns pass-through), `agent/mcp.ts` `text` | S |
| 6 | Erasure and forget wiring: purge job on candidate delete, memory list/forget/confirm routes, nightly sweep, `logActivity` rows | `candidates/service.ts` `deleteCandidate` (return `personId`), `candidates/routes.ts`, `memory/service.ts` `registerMemoryJobs`, new `memory/routes.ts` | M |
| 7 | Expiry on existing episode writers | `matching/service.ts` `rememberPasses`, `sourcing/service.ts` episode write | S |
| 8 | Record used memory ids; client-scoped recall in `contextFor` | `memory/service.ts` `contextFor`, `agent/chat.ts` `agentTurn` and `contextBlock` | S |
| 9 | Context: supersession line in the prompt (`chat@9`), Remembered budget, per-turn token and cache logging | `agent/prompts.ts`, `agent/chat.ts` | S |
| 10 | `weekly` cadence | `packages/shared/src/sourcing.ts` `Cadence`, `CADENCE_MS`, labels | S |
| 11 | Tests: knowledge update without `supersedes`; quote grounding; role gating; client-scoped recall; purge on delete; injection suite; first 20 memory-eval cases | `test/memory.test.ts`, new `test/memory-safety.test.ts` | M |
| 12 | Ops: nightly Qdrant snapshot to object storage plus restore drill; upgrade Qdrant to at least v1.16 in compose and Railway (configurable RRF `k`) | `docker-compose.yml`, Railway | S |

---

## 5. Risks and open questions

- **Evidence quality.** Vendor benchmarks are single-judge and not comparable; independent runs (MemoryAgentBench, the cost study) are few and use older versions of the systems. No public benchmark matches a recruiting agency. Several 2026 security papers are single-author preprints read at abstract level. Our own eval is the only trustworthy yardstick.
- **Approval fatigue.** Moving client and org memory behind a click adds cards. At 93 percent acceptance in Anthropic's data, extra prompts become rubber stamps. Mitigation: few cards (only shared scope), batched, payload-bound, and `pending` items auto-expire in 30 days. Watch the acceptance rate.
- **Quote grounding false rejections.** A model that generalises across several messages ("Acme won't take services people") may fail a single-quote check. Allow quotes from any of the last 20 user messages; beliefs need two. Expect some friction; track rejections in the eval.
- **Subscription allowance.** Adjudication, reflection, follow-up drafts and nightly evals add background calls to a shared allowance (and the §18.2 terms risk stands). Budget them in the background lane and measure per task.
- **Decay half-lives are untuned** and no study shows decay improves accuracy. Keep it ranking-only, reversible, and tune on the memory eval.
- **Names in memory text** (rejection episodes) versus erasure and DPDP. We purge by `personIds`, but a name typed into a free-text memory ("Priya said...") is not caught. Counsel question: is the agency's pool within the Act, what is the agency's role, and what retention applies. Consider storing a display name outside the text.
- **Unknowns I could not verify.** Whether the gateway's warm CLI session accumulates old `<context>` blocks (gateway repo not read); whether it forwards `cache_control` and the beta header; production Qdrant version; installed pgvector version on the Supabase project (must be 0.8.2 or later for any Postgres path); whether Supabase offers `pg_trgm` for the fallback; Qdrant Cloud prices; measured CPU latency per short text for candidate embedders and rerankers.
- **Legal and platform items needing counsel or quotes**: DPDP scope for scraped and enriched data and Crustdata provenance versus LinkedIn's terms; whether recruiter outreach counts as direct marketing under PECR and Google's bulk-sender rules; EU AI Act Omnibus publication; two CASA quotes before choosing between restricted Gmail scopes and inbound routing; WhatsApp opt-in design.
- **Dual-store drift** until the ledger exists: a Qdrant write that fails after a queue retry window leaves a gap. The nightly count check in 4.5 should alert.
- **Pending-memory backlog.** If nobody confirms, shared learning never happens. Reflect weekly counts in the existing task list and let admins bulk confirm.
- **Over-reliance on memory in judging.** `matching/context.ts` already lets memory colour concerns and strengths; any belief that reaches the judge should be `active` and `trust: user` or confirmed. Add a switch to run the judge without memory for the ablation in 4.11.

---

## 6. Sources

**Memory systems and benchmarks**
- Supermemory: [research](https://supermemory.ai/research) · [how it works](https://supermemory.ai/docs/concepts/how-it-works) · [graph memory](https://supermemory.ai/docs/concepts/graph-memory) · [Dynamic Dreaming](https://supermemory.ai/blog/introducing-dynamic-dreaming-supermemory-now-connects-the-dots-for-you) · [PlanetScale move](https://supermemory.ai/blog/supermemory-just-got-faster-on-planetscale) · [ASMR coverage](https://aihola.com/article/supermemory-99-longmemeval-agentic-memory)
- Mem0: [paper arXiv 2504.19413](https://arxiv.org/abs/2504.19413) · [2026 algorithm](https://mem0.ai/blog/mem0-the-token-efficient-memory-algorithm) · [temporal update](https://mem0.ai/blog/the-token-efficient-memory-algorithm-now-has-temporal-reasoning) · [OSS v2 to v3 migration](https://docs.mem0.ai/migration/oss-v2-to-v3) · [latency and Turbopuffer](https://mem0.ai/blog/how-we-cut-vector-search-latency-by-70x) · [eval harness](https://github.com/mem0ai/memory-benchmarks)
- Zep and Graphiti: [paper arXiv 2501.13956](https://arxiv.org/abs/2501.13956) · [repo](https://github.com/getzep/graphiti) · [dispute thread](https://github.com/getzep/zep-papers/issues/5) · [Zep response](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)
- Letta: [MemGPT arXiv 2310.08560](https://arxiv.org/abs/2310.08560) · [sleep-time compute arXiv 2504.13171](https://arxiv.org/abs/2504.13171) · [filesystem benchmark](https://www.letta.com/blog/benchmarking-ai-agent-memory) · [context repositories](https://www.letta.com/blog/context-repositories) · [memory blocks](https://docs.letta.com/guides/agents/memory-blocks)
- LangMem: [conceptual guide](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/) · [delayed processing](https://langchain-ai.github.io/langmem/guides/delayed_processing/) · [repo](https://github.com/langchain-ai/langmem)
- Cognee: [docs](https://docs.cognee.ai/core-concepts/overview) · [arXiv 2505.24478](https://arxiv.org/abs/2505.24478)
- [A-MEM arXiv 2502.12110](https://arxiv.org/abs/2502.12110) · [MemoryOS arXiv 2506.06326](https://arxiv.org/abs/2506.06326) · [HippoRAG arXiv 2405.14831](https://arxiv.org/abs/2405.14831) · [HippoRAG 2 arXiv 2502.14802](https://arxiv.org/abs/2502.14802) · [Generative Agents arXiv 2304.03442](https://arxiv.org/abs/2304.03442) · [Mastra Observational Memory](https://mastra.ai/research/observational-memory) · [Hindsight arXiv 2512.12818](https://arxiv.org/abs/2512.12818) · [Memory-R1 arXiv 2508.19828](https://arxiv.org/abs/2508.19828) · [ReasoningBank arXiv 2509.25140](https://arxiv.org/abs/2509.25140) · [ACE arXiv 2510.04618](https://arxiv.org/abs/2510.04618) · [Memory in the Age of AI Agents arXiv 2512.13564](https://arxiv.org/abs/2512.13564) · [EverMemOS arXiv 2601.02163](https://arxiv.org/abs/2601.02163) · [Reflective Memory Management arXiv 2503.08026](https://arxiv.org/abs/2503.08026)
- Benchmarks and critiques: [LongMemEval arXiv 2410.10813](https://arxiv.org/abs/2410.10813) · [LoCoMo arXiv 2402.17753](https://arxiv.org/abs/2402.17753) · [MemoryAgentBench arXiv 2507.05257](https://arxiv.org/abs/2507.05257) · [ConvoMem arXiv 2511.10523](https://arxiv.org/abs/2511.10523) · [memory cost study arXiv 2603.04814](https://arxiv.org/abs/2603.04814) · [MemDelta arXiv 2606.29914](https://arxiv.org/abs/2606.29914) · [BEAM arXiv 2510.27246](https://arxiv.org/abs/2510.27246) · [Does Memory Need Graphs? arXiv 2601.01280](https://arxiv.org/abs/2601.01280) · [GraphRAG-Bench arXiv 2506.05690](https://arxiv.org/abs/2506.05690) · [LoCoMo audit](https://github.com/dial481/locomo-audit)

**Context engineering**
- Anthropic: [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [Managing context](https://claude.com/blog/context-management) · [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) · [Long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) · [Harness design](https://anthropic.com/engineering/harness-design-long-running-apps) · [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) · [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) · [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [Memory tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) · [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing) · [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) · [Claude Code prompt caching](https://code.claude.com/docs/en/prompt-caching) · [Contextual retrieval](https://www.anthropic.com/news/contextual-retrieval)
- OpenAI: [session memory cookbook](https://developers.openai.com/cookbook/examples/agents_sdk/session_memory) · [context personalization cookbook](https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization). Google: [ADK compaction](https://adk.dev/context/compaction/) · [ADK memory](https://adk.dev/sessions/memory/) · [Vertex Memory Bank](https://cloud.google.com/blog/products/ai-machine-learning/vertex-ai-memory-bank-in-public-preview)
- Practitioners and studies: [Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) · [Cognition](https://cognition.com/blog/dont-build-multi-agents) · [Breunig: how contexts fail](https://www.dbreunig.com/2025/06/22/how-contexts-fail-and-how-to-fix-them.html) · [Chroma: context rot](https://www.trychroma.com/research/context-rot) · [Lost in the Middle arXiv 2307.03172](https://arxiv.org/abs/2307.03172) · [JetBrains: Complexity Trap arXiv 2508.21433](https://arxiv.org/abs/2508.21433) · [ACON arXiv 2510.00615](https://arxiv.org/abs/2510.00615)

**Memory and prompt-injection security**
- [MINJA arXiv 2503.03704](https://arxiv.org/abs/2503.03704) · [AgentPoison arXiv 2407.12784](https://arxiv.org/abs/2407.12784) · [Zombie Agents arXiv 2602.15654](https://arxiv.org/abs/2602.15654) · [MemoryGraft arXiv 2512.16962](https://arxiv.org/abs/2512.16962) · [GhostWriter arXiv 2607.06595](https://arxiv.org/abs/2607.06595) · [MAFIA arXiv 2608.03844](https://arxiv.org/abs/2608.03844) · [Utility Under Attack arXiv 2608.21230](https://arxiv.org/abs/2608.21230) · [memory revocation arXiv 2609.08258](https://arxiv.org/abs/2609.08258) · [A-MemGuard arXiv 2510.02373](https://arxiv.org/abs/2510.02373) · [Price of Safety arXiv 2609.22818](https://arxiv.org/abs/2609.22818)
- Defences: [spotlighting arXiv 2403.14720](https://arxiv.org/abs/2403.14720) · [adaptive attacks arXiv 2510.09023](https://arxiv.org/abs/2510.09023) · [CaMeL arXiv 2503.18813](https://arxiv.org/abs/2503.18813) · [design patterns arXiv 2506.08837](https://arxiv.org/abs/2506.08837) · [Meta Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/) · [lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) · [OWASP Top 10 for Agentic Applications](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications/) · [OWASP LLM06 excessive agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) · [Anthropic prompt-injection defences](https://www.anthropic.com/research/prompt-injection-defenses) · [Rehberger: ChatGPT memory](https://embracethered.com/blog/posts/2024/chatgpt-macos-app-persistent-data-exfiltration/) · [Rehberger: Gemini memory](https://embracethered.com/blog/posts/2025/gemini-memory-persistence-prompt-injection/) · [prompt injection in resumes, arXiv 2605.28999](https://arxiv.org/abs/2605.28999) · [ResumeShield arXiv 2609.20188](https://arxiv.org/abs/2609.20188)

**Recruiting products, tool design, compliance**
- [LinkedIn Cognitive Memory Agent](https://www.linkedin.com/blog/engineering/ai/the-linkedin-generative-ai-application-tech-stack-personalization-with-cognitive-memory-agent) · [Stack Overflow interview](https://stackoverflow.blog/2026/08/25/inside-linkedin-s-cognitive-memory-agent/) · [LinkedIn AI stack](https://news.linkedin.com/2025/linkedin-s-ai-stack--expanding-to-build-tomorrow-s-agents) · [ByteByteGo summary](https://blog.bytebytego.com/p/how-linkedin-built-an-ai-powered) · [Juicebox agents](https://docs.juicebox.ai/welcome-kit-automate-with-agents) · [Gem](https://www.gem.com/ai-recruiting-agents) · [Metaview sourcing copilot](https://support.metaview.ai/ai-skills/sourcing-copilot.md) · [Ashby keynote](https://www.ashbyhq.com/ashby-one/2026/london/product-keynote) · [Greenhouse](https://www.greenhouse.com/uk/newsroom/greenhouse-launches-new-ai-capabilities-built-to-strengthen-structured-hiring-not-shortcut-it) · [hireEZ](https://hireez.com/agentic-ai/) · [Paradox scheduling](https://www.paradox.ai/products/scheduling) · [Paradox exposure](https://www.bleepingcomputer.com/news/security/123456-password-exposed-chats-for-64-million-mcdonalds-job-chatbot-applications) · [Moonhub](https://techcrunch.com/2025/06/02/salesforce-buys-moonhub-a-startup-building-ai-tools-for-hiring)
- [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests) · [Anthropic auto mode](https://anthropic.com/engineering/claude-code-auto-mode) · [Anthropic sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing) · [pg-boss](https://github.com/timgit/pg-boss) · [Inngest waitForEvent](https://www.inngest.com/docs/reference/functions/step-wait-for-event) · [Restate durable AI loops](https://www.restate.dev/blog/durable-ai-loops-fault-tolerance-across-frameworks-and-without-handcuffs) · [Gmail sending limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace) · [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) · [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) · [Nango on CASA](https://nango.dev/docs/api-integrations/google-shared/google-security-review.md) · [Gmail push](https://developers.google.com/gmail/api/guides/push) · [Postmark inbound](https://postmarkapp.com/developer/user-guide/inbound/parse-an-email) · [Google bulk-sender rules](https://support.google.com/a/answer/14229414)
- [DPDP Rules roadmap](https://www.tcsa.in/resources/dpdp-rules-2025-implementation-roadmap) · [DPDP publicly available data](https://www.india-briefing.com/news/india-dpdp-act-publicly-available-personal-data-46899.html/) · [CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) · [ICO B2B marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/) · [WhatsApp Business policy](https://whatsappbusiness.com/policy/) · [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement) · [EU AI Act Omnibus](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/) · [SCHUFA analysis](https://cms.law/en/deu/legal-updates/impact-of-the-cjeu-s-schufa-judgment-on-the-use-of-ai-in-hr)
- Evals: [tau-bench arXiv 2406.12045](https://arxiv.org/abs/2406.12045) · [Husain and Shankar evals FAQ](https://hamel.dev/blog/posts/evals-faq/) · [per-user multi-tenant agent memory tests](https://hindsight.vectorize.io/blog/2026/08/04/per-user-multi-tenant-agent-memory)

**Integrations**
- [MCP versioning](https://modelcontextprotocol.io/specification/versioning) · [MCP 2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) · [MCP authorization](https://modelcontextprotocol.io/specification/draft/basic/authorization) · [MCP security best practices](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices) · [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) · [Slack MCP](https://docs.slack.dev/ai/slack-mcp-server.md) · [Notion MCP](https://developers.notion.com/docs/get-started-with-mcp) · [Gmail MCP](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server) · [Calendar MCP](https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server) · [Atlassian Rovo MCP](https://www.atlassian.com/blog/rovo/atlassian-rovo-mcp-ga) · [Nango self-hosting](https://nango.dev/docs/guides/platform/self-hosting.md) · [Google envelope encryption](https://docs.cloud.google.com/kms/docs/envelope-encryption) · [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)

**Storage, search and embeddings**
- [pgvector](https://github.com/pgvector/pgvector) · [pgvector issue 980](https://github.com/pgvector/pgvector/issues/980) · [CVE-2026-3172](https://security-tracker.debian.org/tracker/CVE-2026-3172) · [AWS: pgvector 0.8.0 on Aurora](https://aws.amazon.com/blogs/database/supercharging-vector-search-performance-and-relevance-with-pgvector-0-8-0-on-amazon-aurora-postgresql) · [Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search) · [Supabase HNSW indexes](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes) · [Supabase compute add-ons](https://supabase.com/docs/guides/ai/choosing-compute-addon) · [Supabase extension catalogue](https://raw.githubusercontent.com/supabase/postgres/develop/nix/ext/versions.json) · [Postgres text search ranking](https://www.postgresql.org/docs/current/textsearch-controls.html) · [pg_textsearch v1.0](https://www.postgresql.org/about/news/pg_textsearch-v10-3264) · [Neon: halfvec](https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost) · [Neon: vector search optimisation](https://neon.com/docs/ai/ai-vector-search-optimization) · [FANNBench arXiv 2508.16263](https://arxiv.org/abs/2508.16263) · [Tiger Data: pgvector vs Qdrant](https://www.tigerdata.com/blog/pgvector-vs-qdrant)
- Qdrant: [multitenancy](https://qdrant.tech/documentation/guides/multiple-partitions/) · [hybrid queries](https://qdrant.tech/documentation/concepts/hybrid-queries/) · [quantisation](https://qdrant.tech/documentation/guides/quantization/) · [capacity planning](https://qdrant.tech/documentation/capacity-planning/) · [snapshots](https://qdrant.tech/documentation/snapshots/). Railway: [volume backups](https://docs.railway.com/volumes/backups) · [pricing](https://docs.railway.com/reference/pricing/plans). Postgres: [range types](https://www.postgresql.org/docs/current/rangetypes.html) · [partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html) · [CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html). Patterns: [Fowler: bitemporal history](https://martinfowler.com/articles/bitemporal-history.html) · [transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- Embedding models: [bge-base-en-v1.5](https://huggingface.co/BAAI/bge-base-en-v1.5) · [gte-modernbert-base](https://huggingface.co/Alibaba-NLP/gte-modernbert-base) · [EmbeddingGemma](https://huggingface.co/google/embeddinggemma-300m) · [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) · [nomic-embed-text-v2-moe](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe) · [fastembed supported models](https://qdrant.github.io/fastembed/examples/Supported_Models/) · [Voyage pricing](https://docs.voyageai.com/docs/pricing)

---

## What changed (10 Oct 2026)

Items 1 to 11 of 4.13 are built in `superhyre-platform` (server and `packages/shared`); item 12 (ops) is not. Reference for the routes, jobs and config is `superhyre-platform/server/docs/memory.md`. All paths below are under `server/src` unless noted.

| # | Status | What and where |
|---|---|---|
| 1 | Done | `remember` tool (`modules/agent/tools.ts`): required `quote` checked against the last 20 messages the recruiter sent in this chat (`modules/memory/claims.ts` `groundQuote`); `replaces` (same level and scope only); campaign and recruiter level saved at once, client and agency-wide become the new `remember` action (`modules/agent/actions.ts`: `Action`, `describeRemember`, `performRemember`); an agency-wide memory approved by a non-admin is written `pending` and opens a review task; at most 3 saves or proposals per answer, `LIMIT_MEMORY_WRITES_PER_DAY` (40) per person via `platform/quota.ts`; instruction filter on text and quote (`looksLikeInstruction` in `platform/untrusted.ts`, which now also holds `cleanProfileText`, moved from `modules/matching/injection.ts`, deleted) |
| 2 | Done, except `event_date` | `modules/memory/store.ts`: payload v2 (`slot`, `valid_from`, `valid_to`, `supersedes`, `source`, `trust`, `status`, `last_confirmed_at`, `last_used_at`, `use_count`, `forgotten_at`, `embedding_model`, `schema_version: 2`), new payload indexes (`slot`, `status`, `trust`, `forgotten_at`), `sameClaim` and `revises` (`modules/memory/claims.ts`) instead of cosine 0.92 alone, slot supersession, a late-arriving older statement stored as history, default expiry by kind, `status` and client scope in `visible()`, `list`, `count`, `get`, `confirm`, `touch`, `sweep`, recency-aware `profile()` (per-level quotas) and `recall()`. Payload v1 points load with defaults; no migration. The adjudication queue for cosine 0.80 to 0.97 is still Next |
| 3 | Done | `recall_memory` returns `id` and a scope label ("agency-wide", "client Acme", ...) and emits a `progress { step: "memory", via: "recall_memory", ids }` event |
| 4 | Done, adjudication still Next | `memory_extract@4` (`modules/memory/service.ts`): `quotes` per memory, verified in code against the recruiter's own lines only, agency-wide outputs `pending`, a belief needs two different quotes, campaign and client taken from the quoted message |
| 5 | Done | Instruction-like lines and invisible characters are removed from `candidate_profile`, `find_candidates` and `campaign_matches` (`modules/agent/tools.ts`), and from every string in every tool result in `modules/agent/mcp.ts` (`cleanDeep`) |
| 6 | Done | `deleteCandidate` returns `personId`; the route queues `memory.purge-person`, which erases the person's memories and episodes and logs `memory_purged`; `modules/memory/{routes,manage}.ts` serve list, stats, confirm, forget and correct (mounted in `app.ts`); `memory.sweep` runs nightly (`main.ts`); audit lines go to `activity` with the new subject kind `memory` (`db/migrations/172_memory_activity.sql`) |
| 7 | Done | `rememberPasses` (`modules/matching/service.ts`) expires after 180 days and carries the campaign's client; the sourcing episode (`modules/sourcing/service.ts`) after 365 days |
| 8 | Done | `contextFor` limits a campaign's context and recall to its client plus agency-wide memories (`forClient`); a recruiter reads a client's memories only while on one of its campaigns; every chat turn records the ids it read on the run (event, `output.memoryIds`) and queues `memory.touch` |
| 9 | Done, one part not verifiable here | `chat@10` (`modules/agent/prompts.ts`) says older `<context>` blocks are history and teaches `quote` and `replaces`; the Remembered section is built by `renderRemembered` with a 2,000 character budget in priority order; each turn logs `chat turn` (context size, remembered size, usage) and stores `contextChars` and `usage` on the run. `usage` is empty until the gateway sends it on the turn's `result` event (field `usage`, passed through as is), and whether the gateway forwards `anthropic-beta` and `cache_control` was not checked (gateway repo not read) |
| 10 | Done | `weekly` in `Cadence`, `CADENCE_MS` and `CADENCE_LABEL` (`packages/shared/src/sourcing.ts`); the agent's `propose_watch` accepts it. The console keeps its own `Cadence` type and label table in `auth-app/src/liveAgents.ts`, which does not know `weekly` yet |
| 11 | Done | `test/memory-safety.test.ts`, `test/memory-api.test.ts`, `test/memory-eval.test.ts` with its table `test/memory-eval-cases.ts` (24 cases), shared helper `test/memory-world.ts`; `test/memory.test.ts` updated for quotes |
| 12 | Skipped | Qdrant snapshots and the upgrade to 1.16 or later are ops work |

New HTTP routes (all `/v1`, tenant-scoped): `GET /memory?scope=&clientId=&campaignId=&status=&q=&limit=&cursor=` returning `{ items, nextCursor }`, `GET /memory/stats`, `POST /memory/:id/confirm`, `POST /memory/:id/forget`, `PATCH /memory/:id` `{ text }`. Agency-wide memories are the admins' to confirm, correct and forget; everything else belongs to any member who can see it.

What was not finished: the other 4.13-adjacent items marked Next (outcome episodes, reflection, adjudication, ledger, `forget_memory` tool, memory fence nonce); the activity row written when a candidate is deleted still holds the candidate's name (`deleteCandidate`), which erasure should drop too; the gateway work above.

---

## What changed (12 Oct 2026)

The memory and context framework: episodes, reflection, adjudication, the used-memory ledger, a budgeted working
memory, self-knowledge, the console's one Memory page, exhaustive isolation tests and a recall-quality eval.
Reference for the parts, jobs, routes and config is `superhyre-platform/server/docs/memory.md`; all paths below
are under `server/src` unless noted. Prompt `chat@15`; migrations 187 and 188 (additive).

| Item | Status | What and where |
|---|---|---|
| Episodic memory (G7) | Done | One helper, `episode()` (`modules/memory/episodes.ts`): idempotent key per event, an end by type (pass 180 days, hire 365, outreach 180, contact lookup and approval 120, closed or reopened 365, a chat's summary 120, a correction 180), campaign and client scope, no contact details or protected attributes, no candidate named (the person is linked by id and named at read time for those who may see them; erased with them). Writers: `deriveEpisodes` (`modules/memory/derive.ts`) reads each workspace's own activity log from a cursor (`core.memory_cursors`) every ten minutes and after a quiet chat: passes with their reason, moves (with the one reason they were made for), shortlisting, emails sent, outcomes (replied, no reply, bounced), hires, a campaign closed (with how it stood) or reopened, a spec approved, a watch started or finished; approvals and declines where they are decided (`modules/agent/actions.ts`); the recruiter's own corrections (`modules/memory/corrections.ts`); a pass reason typed in the chat (`modules/matching/service.ts` `rememberPasses`, no longer holding the name) |
| Reflection (4.3e, 4.9 item 7) | Done | `modules/memory/reflect.ts`: nightly and when six unread episodes have gathered; a model proposes at most three beliefs or playbooks per client, each citing episodes; code checks the citations, at least two independent pieces (different people or days), no candidate named, nothing that reads as an instruction; written `pending`; a belief at a client or campaign becomes current when new work shows it again, a playbook and anything for the whole agency only on a person's yes (an admin's), and the whole agency only from more than one client with no client or campaign named. An open task asks someone to look. Never reads a recruiter's private episodes. Capped per workspace and for all workspaces together |
| Chat summaries and compaction (4.8 item 5) | Done | `modules/memory/summary.ts`: after a quiet chat, one rolling summary written from the recruiter's own lines and the system's facts (never the agent's free text), checked and cleaned, kept on the conversation (`summary`, `summary_through`; a rebuilt model session reads it and then only what came after, 8,000 characters at most) and as the recruiter's own episode (`topic: session`) so "what did we do last time" works from another chat |
| Adjudication (G1, 4.3c) | Done | `modules/memory/adjudicate.ts`: a new lasting note near an old one (cosine 0.80 to below 0.97, not the same claim, not a plain revision) is checked by one model call: repeat (evidence added to the old note), replaces (old note closed with `valid_to`, kept as history) or different. The model chooses among three outcomes and cannot write; an older statement never replaces a newer one |
| Used-memory ledger (G6) | Done | Each chat run records `output.memory.used` (`[{ id, via }]`, ids only) and the section sizes and timings; `explain_answer` (`capabilities/memory.ts`) reads it for "why did you say that": the notes used, who said them and when, whether each has since been replaced or forgotten (a forgotten note is not quoted), and what was looked up. `use_count` and `last_used_at` lift a note's rank by at most 15 percent (`usageBoost`) |
| Hard rules stay deterministic (G10) | Done | `test/memory-rules.test.ts`: a person marked do-not-contact is refused at the agent's draft, at approval and at sending with a memory store that answers nothing and counts every call (none are made for the decision). Found and fixed on the way: the agent's `draft_emails` made a draft for such a person (approval would have refused it); it now refuses at the draft |
| Working memory (G9) | Done | `modules/agent/context.ts`: `campaignBrief()` (pure; stages, role spec most important first, sourcing, watches, the week's moves) and `fit()` (a budget per section: rules never cut, campaigns 2,200 characters, the brief 1,800, named people 700, remembered 1,400, brought back 800; the lowest priority gives way first). The block says it replaces any earlier one. Recall is client-scoped when a campaign is in focus (the tool and the overview use the chat's focus when not told one) and when a message names exactly one client (`namedClientOf`) |
| Self-knowledge (G-new) | Done | The prompt's "About you" section is generated from the registry (`modules/agent/product-map.ts` `aboutYou`): what it can do in plain words, what it remembers and how, who sees which, how to correct or forget, what it never keeps, where it stops; glossary entries for remember, forget, correct, always and never, from now on, what did we do, why did you say that. `memory_overview` gives the live account (counts by type and where each applies, newest notes with who and when, what waits, what will be used for the campaign in focus). `list_my_capabilities` was not built: the map lists every capability with who it is for, in words. Questions about what was done before are the model's, not the report view's (`packages/shared/src/views.ts`). `forget_memory` takes several ids in one card |
| Console | Done | Settings, then Memory: Needs your review, Facts and preferences, How we do things, What happened (a timeline), Coming up; Mine, This campaign, This client, Whole agency; search; each note says where it applies, how often and when the agent used it; correct and forget; agency-wide notes are the admins'; the rail's Memory row shows counts and opens it |
| Isolation tests | Done | `test/memory-isolation.test.ts`, `test/memory-episodes.test.ts`, `test/memory-learning.test.ts`, `test/memory-framework-store.test.ts`, `test/memory-rules.test.ts`: a canary per place (Personal, two organisations, client A and B, a campaign, a recruiter's own, the agency, a pending, a forgotten, an erased candidate) held to one matrix on the console list, the counts, recall, the context block, the overview, explanations, run records, activity and logs; a removed member; injection through episodes, summaries and reflection; per-turn and daily caps; expiry and the sweep; erasure of episodes that link or name a candidate. A mutation check (a recruiter's own notes made visible to others) fails nine of them |
| Evaluation (4.11) | Done | `test/memory-eval-chat.ts`: 35 conversations in ten categories, with the store-level table (24) 59 cases. CI runs them with a scripted stand-in for the model; `scripts/memory-eval-live.ts` runs the same table against the gateway (Haiku 4.5, `claude-haiku-4-5-20251001`) with a scratch database and collection of its own |

### Measured

Live eval, first run: 29 of 32 cases passed; the three misses were the table's, not the product's (a question
a model fairly answered from the live board instead of memory, a wording the pattern missed, and a refusal
the model made without calling the tool). They were rewritten and the three then passed.

Live eval, full run on the final table: 33 of 35 cases passed (94%), 39 turns. Both misses were the table's
wording again (a pattern for what happened at a close, and a "why" asked of an answer that used no notes);
both were rewritten and the two passed on a re-run. Turn latency, whole turn: median 6.0 s, 90th percentile
10.8 s; building the context (memory part included): median 55 ms, 90th percentile 62 ms; the context block
was 828 characters at the median and 1,118 at most (small seeded workspaces; the real-workspace table below
is the one to read for size).

Per-turn cost on the dev workspace of a real organisation (ten turns in one chat, 25 campaigns, 70+ notes),
with the model on `claude-haiku-4-5-20251001`:

| | |
|---|---|
| `<context>` block | 3,380 to 3,760 characters (about 900 tokens): campaigns 1,018, the campaign in focus 603, remembered 985, brought back 360 to 740, rules 144 |
| Time to build it | 18 to 130 ms; the memory part (profile and search) 14 to 115 ms, median about 45 ms |
| Model | first word 2.6 to 13.3 s; whole turn 3.0 to 15.0 s (the tools and the model dominate) |
| Tokens the gateway reported | 10 to 26 uncached input, 1,600 to 5,600 cache writes, 44,000 to 141,000 cache reads: the cache holds, and the context block is about 2 percent of what a turn reads |

Compaction was not shown to be needed: the block does not grow with the chat (it is rebuilt each turn), the
warm session grew by 1 to 2 thousand tokens a turn over ten turns, and a rebuilt session is bounded by the
summary and the 8,000-character history budget. The summary is a by-product of the chat's episode.

### Gaps from section 3.2

| # | Now |
|---|---|
| G1 | Closed: store-level for changed numbers, polarity and comparisons; model-level for the rest |
| G5 | Time model: `valid_from`, `valid_to` and recency-and-use ranking are in; an episode's `document_date` is when it happened; confidence still only rises (ranking decays it) |
| G6 | Closed |
| G7 | Closed for what the product records (reply capture is still manual, G11) |
| G8, G9 | Closed and measured |
| G10 | Closed and tested, with the draft fix above |
| G11 | Open: replies are logged by hand (the outcome episodes follow whatever is logged) |
| G12 | Closed: store-level and conversation-level evals, an injection suite through episodes and summaries |
| G13 | Open (ops) |

### Not finished

Qdrant snapshots and the upgrade to 1.16 or later (checklist item 12, ops); a Postgres ledger of memory
lifecycle (the activity log, `core.memory_cursors` and the run records cover audit, positions and "what was
used"); per-turn nonces on the memory fence; reflection over one recruiter's own corrections; reply capture
without restricted Gmail scopes; an `event_date` separate from `document_date`; contact lookups made by the
console's own button are not episodes (only the agent's approvals are); the shared people pool's name for an
erased person is read from the shared profile at purge time (nothing identifying is queued).
