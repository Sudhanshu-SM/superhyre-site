# Candidate matching: what the research and industry say (10 Oct 2026)

Research done by web search plus reading the papers I could open. Evidence quality is flagged on each item: **[read]** = I read the paper text or abstract; **[summary]** = from a search or page summary, not the paper body; **[claim]** = company or blog claim. Almost everything cited is a preprint or industry report, not peer-reviewed proof, and results come from different datasets, so numbers don't compare across papers.

---

## 1. The ten findings that matter most

1. **Two stages beat one.** Every serious system retrieves broadly and cheaply, then reranks a short list with a stronger model, then explains. Synapse reports +22% nDCG@10 over embedding-only retrieval from adding LLM and contrastive reranking [read]. A person-job retrieval benchmark found reranking helped consistently [read].
2. **Hybrid retrieval is the norm.** Dense vectors plus keywords, fused by reciprocal rank fusion (RRF, k = 60 as the usual starting point, tuned per task), with metadata filters applied inside each branch. This is what we already do.
3. **Fine-tuned embeddings with hard negatives win.** ConFit v2 reports +13.8% recall and +17.5% nDCG over BM25 and OpenAI embeddings, using generated "hypothetical resumes" for job posts and hard negatives mined from unlabeled pairs [summary].
4. **LLM rerankers work, with caveats.** ConFit v3: multi-pass reranking beats single-pass; label quality matters more than quantity (removing noisy samples helps); distilling from a stronger model before RL helps; a trained 8B/32B reranker beat prompted GPT-5 and Claude Opus 4.5 on two real datasets [read].
5. **Listwise comparison helps but position bias is real.** Listwise rerankers beat pointwise, yet are sensitive to candidate order (shuffled order can drop below BM25). Fixes: aggregate several orderings, block-attention designs, or score items independently [summary].
6. **Recruiting labels are noisy and confounded.** Most resume-job pairs are unlabeled; unapplied candidates are not unqualified. Behavioural labels mix exposure, preference and qualification. Treating unlabeled as negative hurts good matches [read, summary].
7. **Judges need locked rubrics, evidence and calibration.** Evidence-anchored scoring with versioned rubrics is more reliable than clever prompts; judges favour their own model family; agreement with humans is only moderate at fine granularity (kappa about 0.2 to 0.45) and better when labels are coarse [summary].
8. **Bias is measured, large and survivable only with audits.** Embedding retrievers favoured White-associated names in 85.1% of tests and female-associated names in 11.1%; Black male names were disadvantaged in every comparison with White male names [read]. People then mirror the AI's bias [summary].
9. **The text you feed the model is an attack surface.** Hidden prompt injections appear in roughly 1% of about 200,000 resumes; attacks exceed 80% success on some LLM screeners; defences cost false rejections [summary].
10. **Humans stay in the loop in production.** LinkedIn's Hiring Assistant is a supervisor with sub-agents, human control for trust and safety, and reports 36% vs 28% InMail acceptance for AI-assisted vs manual sourcing [claim].

---

## 2. Findings by topic

### 2.1 Pipeline shape
- **Retrieve, rerank, explain.** Synapse separates high-recall candidate generation (FAISS dense retrieval) from high-precision reranking (contrastive plus LLM), then adds a retrieval-augmented explanation grounded in evidence; nDCG@10 +22% [read]. LinkedIn's semantic search uses a bi-encoder retrieval stage over up to 1.3 billion documents returning the top 1,000, then a ranking stage, and an LLM relevance judge for quality [summary].
- **Query understanding alone didn't help.** The PJB benchmark (about 200,000 real resumes, six industries) found query understanding gave no gain and, combined with reranking, lowered performance. Reranking was consistently positive. It also found performance varies far more across industry domains than across module upgrades, so average scores can mislead [read].
- **Pre-filtering beats post-filtering.** LinkedIn's LiNR stresses attribute pre-filtering because post-filtering in nearest-neighbour search lowers quality [summary]. We already apply hard filters inside each branch.

### 2.2 Retrieval and embeddings
- **RRF details.** k = 60 is the usual default; some teams tune to 10 to 25; weighted RRF is common (one system used 0.50 vector, 0.35 BM25, 0.15 graph). BM25 helps with names, tools and exact terms embeddings miss [summary].
- **Candidate pool size matters.** The right result can sit at position 30 to 80, so the pool handed to the reranker must be large enough; reported pools range from 12 to 100 [summary].
- **Blend the reranker with the fusion score.** One system used 0.65 reranker plus 0.35 RRF so a cross-encoder can't fully discard evidence several retrievers agreed on [summary].
- **Hypothetical resume embedding (HyRE).** At inference an LLM writes an ideal resume for the job post, and its embedding joins the job's; this is the HyDE idea applied to hiring [summary].
- **Hard negatives.** ConFit mined rejected-but-similar resumes as hard negatives; v2 mines "runner-up" negatives from unlabeled pairs [summary].
- **Fine-tuning small embedders works.** A 2026 comparison kept EmbeddingGemma fine-tuned with cached multiple-negatives ranking loss as its preferred setup inside a hybrid RRF pipeline, with an LLM turning job descriptions into search text [summary].

### 2.3 Reranking and judging
- **ConFit v3 recipe** [read]: multi-pass sliding-window reranking at inference; listwise RL objective; drop noisy samples rather than clever filtering; SFT distillation from a stronger model before RL.
- **LinkedIn distillation** [summary]: an 8B oracle judge is distilled to a smaller student (linear kappa 0.77 against humans, teacher 0.81); soft labels from the teacher improved both quality and calibration; relevance-only distillation lifted NDCG@5 from 0.8123 to 0.8933 (+9.97%); 10x more data gave no further relevance gain. LANTERN adds multi-level distillation for fit plus explanation; online +0.24% apply rate and +0.28% qualified applications [read].
- **Position bias.** Listwise rerankers overweight early items and can lose the middle; mitigations are aggregating multiple orderings (costly), training on shuffled orders (can lose accuracy), or encoding each candidate independently so order can't matter [summary].
- **Calibration over raw scores.** Treat judge outputs as scores to calibrate against humans: a linear map from judge scores to human judgments needed only a few examples [summary].

### 2.4 Learning from feedback
- **LinkedIn lessons paper** [summary of abstract only; I could not read its body]: learns recruiter preference within a session from immediate responses, and supports search from an ideal candidate because recruiters struggle to write a query.
- **Relevance feedback in dense retrieval** [summary]: Rocchio-style update q_new = alpha * q + beta * average(feedback vectors); ColBERT-PRF clustered feedback embeddings and reported up to 26% MAP gains. Almost no work on negative feedback in dense retrieval.
- **Do not conflate preference and qualification.** Behavioural signals (clicks, applies, replies) measure willingness and exposure as much as fit; a 2026 paper separates "preference" from "qualification" with dual-perspective reasoning [title and abstract only]. The 2026 review makes the same point [read].
- **Reciprocal recommendation.** Match labels are sparse; predicting each side then aggregating propagates error; a "best-of-both" method helped smaller segments [summary]. LinkedIn patents describe a likelihood-to-respond score blended with relevance [summary].

### 2.5 Signals beyond the profile
- **Job-change and tenure signals.** Papers and patents predict moves from career trajectories, tenure, recent title changes and company factors; one 2025 paper models public career profiles with competitor and contagion effects. Accuracy figures come from specific datasets and don't transfer; actual moves are rare, so class imbalance matters [summary].
- **Self-declared intent is strongest.** Recruiter guidance reports LinkedIn "Open to work" candidates are about twice as likely to respond [claim].
- **Privacy and law.** Scoring individuals from scraped data raises GDPR-type issues and bias risks; check the legal basis before building it [summary].

### 2.6 Evaluation
- **Independent gold set.** A job-search benchmark kept human gold labels (two annotators, kappa about 0.85) separate from silver labels built from features the model uses, to avoid circular evaluation [summary].
- **Full-corpus ranking.** Sampled negatives inflate metrics; person-job benchmarks use full-corpus ranking and nDCG@10 [summary]. Released relevance judgments often hold only positives, so missing pairs count as zero gain [summary].
- **Stage-level evidence.** The 2026 review finds final-output scores hide pipeline failures and no coded work jointly evaluates utility, fairness, privacy and security; it proposes mapping each kind of evidence to the strongest claim it supports [read].
- **LLM judges for evaluation.** Agreement with human rankings can be high at the system level (Kendall tau 0.87) but weaker per item; coarse labels agree more [summary].

### 2.7 Fairness, law, safety
- **Measured bias.** Wilson and Caliskan (UW): across 9 occupations, 500+ resumes and 500+ jobs, embedding models significantly preferred White-associated names in 85.1% of 27 tests (Black-associated 8.6%) and male-associated in 51.9% (female 11.1%). Shorter documents increased bias (gender differences rose from 63% to 85.2% of tests), and the result flipped when names were matched on corpus frequency. Authors: audit systems, don't rely on removing names (education, location and word choice carry signal), be cautious with technical debiasing [read].
- **Humans mirror AI.** In a 528-person study, people followed AI recommendations even when biased; in a hiring-manager simulation they followed the AI about 70% of the time when candidates were comparable, and only 8 of 294 noticed the gender bias [summary]. A 2024 study found about 60% didn't notice bias even when asked [summary].
- **Fair re-ranking works but is contested.** LinkedIn's Det-Greedy re-ranking produced nearly three times as many queries with representative top results without hurting business metrics; an external audit still found minority under-representation in early ranks, and the right target ratio is an open question [summary].
- **Regulation.** NYC Local Law 144: independent annual bias audit, public posting, advance notice, fines up to $1,500 a violation; one study found only 18 of 391 employers posted audits [summary]. The EU AI Act treats recruitment AI as high-risk (risk management, data governance, logging, human oversight); I could not confirm current dates because of a proposed delay, so check the primary text [summary, partly my own knowledge].
- **Prompt injection.** Hidden instructions in resumes (white or low-contrast text) shift LLM screening; about 1% of 200,000 production resumes carried them; fabricated qualifications can beat direct instructions because pipelines parse into fields first; prompt-based defences cut success about 10% but raised false rejections 12.5%; separation-based defences cut about 15% at 10.4% more false rejections; detection tools such as PhantomLint exist [summary].

### 2.8 Agent systems
- LinkedIn's Hiring Assistant: supervisor with sub-agents, agents as registered services, observability split between tracing in development and OpenTelemetry in production, human-in-the-loop, and the engineering lead saying the system isn't accurate enough for most complex tasks without humans [claim, via InfoQ and TechCrunch].

---

## 3. What this means for SuperHyre

What we already do that matches the evidence: hybrid pool search (meaning + words + skills fused by RRF, k = 60) with filters inside each branch; rule score plus an LLM judge; evidence checked against profile text; protected attributes excluded from judgements; untrusted profile text fenced; as of 10 Oct, client, memory and past-decision context for the judge and a "like these" pull on the query.

Ranked next steps, most leverage first:

| # | Do | Why (evidence) | Effort |
|---|---|---|---|
| 1 | **Build a gold set and an eval harness**: 150 to 300 recruiter-labelled (spec, person) pairs from our own shortlists and passes, two raters on a sample, report agreement, fixed and independent of what the judge sees; measure nDCG@10 on full pools and per domain | Without it we can't tell any change helps; PJB shows domain variance dwarfs module gains; sampled negatives inflate | Medium |
| 2 | **Test judge position bias**: we judge five candidates per call; re-run with shuffled order and compare; if unstable, aggregate two orderings or judge each alone | Listwise models are order-sensitive | Low |
| 3 | **Counterfactual bias audit**: swap names and other identity markers on the same profile, run through retrieval, rules and judge, report disparity; run on every prompt or model change; keep a public-facing summary ready | UW study; NYC LL144 and EU high-risk obligations | Low to medium |
| 4 | **Scan profile text for hidden or injected instructions** before it reaches the judge, and keep verdicts tied to evidence text | Injection prevalence and attack success | Low |
| 5 | **Hypothetical-candidate query**: have the model write an ideal profile from the spec, embed it with the spec text, and blend into the search vector | HyRE/HyDE gains | Low |
| 6 | **Rocchio with negatives**: extend the "like these" pull with a small push away from passed people who share a stated reason ("too junior"); require a minimum number of decisions | Little prior work on negatives, so test it on the gold set first | Medium |
| 7 | **Separate qualification from engagement**: keep the fit score as is; add a different "likely to reply" estimate from our outreach outcomes, shown separately, never mixed into fit | Behavioural labels confound qualification and preference; response models in LinkedIn patents | Medium, needs data |
| 8 | **Blend scores, don't replace them**: final order = judge tier first, then a blend of the feature score and the retrieval rank | Reranker-plus-fusion blends | Low |
| 9 | **Judge calibration**: measure agreement between judge tiers and recruiter decisions (coarse: shortlist vs pass), track over time, alert on drift | LLM-judge agreement is moderate | Medium |
| 10 | **Fair re-ranking, optional and configurable**: only with legal advice and self-declared data; the target ratio is an open question | Det-Greedy and its critiques | Later |
| 11 | **Public-footprint and job-change signals**, only from provider-returned data, shown as evidence with source and never as hidden score inputs | Job-change literature, privacy risk | Later, needs a decision |
| 12 | **Distil a smaller judge** from our best judge once we have a gold set and volume | LinkedIn and ConFit v3 results | Later |

Things the evidence says **not** to expect from us: gains from an LLM query rewriter alone (PJB); gains from more training data alone (LinkedIn saw none past 10x); a fairness guarantee from removing names.

---

## 4. Evidence quality and gaps

- I could open and read the text of ConFit v3, Synapse (abstract), LANTERN (abstract), the 2026 recruiting-systems review (abstract), and the UW embedding-bias paper. Other items come from search summaries or abstract pages.
- No paper I found directly measures LLM-judge reliability on resumes against human recruiters, or compares query-understanding approaches for people search; both are open gaps and our gold set would fill them for us.
- The LinkedIn talent-search lessons paper (1809.06481) is a key reference I could only read at abstract level; it is worth reading in full.
- The EU AI Act timing and the details of NYC LL144 enforcement should be checked against primary texts or counsel before relying on them.

---

## 5. Sources

- [From Matching Models to Recruiting Agents (2026 review)](https://arxiv.org/pdf/2609.04286)
- [ConFit v3: LLM-based re-ranking](https://arxiv.org/pdf/2605.09760) · [ConFit v2](https://arxiv.org/pdf/2502.12361) · [ConFit](https://arxiv.org/pdf/2401.16349)
- [Synapse: two-phase retrieval and LLM reranking](https://arxiv.org/pdf/2604.02539)
- [LANTERN: LLM distillation for job-person fit](https://arxiv.org/pdf/2510.05490)
- [Semantic Search at LinkedIn](https://arxiv.org/html/2602.07309v1) · [LiNR](https://arxiv.org/pdf/2407.13218) · [Learning to Retrieve for Job Matching](https://arxiv.org/pdf/2402.13435)
- [Talent Search and Recommendation Systems at LinkedIn](https://arxiv.org/pdf/1809.06481) · [Towards Deep and Representation Learning for Talent Search](https://arxiv.org/pdf/1809.06473)
- [Fairness-Aware Ranking, LinkedIn Talent Search](https://arxiv.org/pdf/1905.01989) · [External fairness evaluation of LinkedIn Talent Search](https://arxiv.org/html/2511.10752v1)
- [Gender, Race and Intersectional Bias in Resume Screening via Language Model Retrieval](https://arxiv.org/html/2407.20371v1) · [UW news](https://www.washington.edu/news/2024/10/31/ai-bias-resume-screening-race-gender/) · [People mirror AI hiring biases](https://washington.edu/news/2025/11/10/people-mirror-ai-systems-hiring-biases-study-finds) · [No Thoughts Just AI](https://arxiv.org/html/2509.04404v1) · [Frontiers: Michael is better than Mehmet](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11420529/)
- [Prompt injection in resume screening: measurement](https://arxiv.org/pdf/2605.28999) · [Resume screening as a case study](https://arxiv.org/pdf/2512.20164) · [ResumeShield](https://arxiv.org/pdf/2609.20188) · [Self-promotional text](https://arxiv.org/pdf/2606.27287) · [PhantomLint](https://arxiv.org/pdf/2508.17884)
- [PJB benchmark](https://arxiv.org/pdf/2603.17386) · [Semantic candidate-job matching, dense models in hybrid retrieval](https://arxiv.org/pdf/2609.23307) · [Position-robust talent recommendation (L3TR)](https://arxiv.org/pdf/2604.02200) · [Calibrated LLM distillation for person-job fit](https://arxiv.org/pdf/2601.10321) · [Preference vs qualification](https://arxiv.org/pdf/2602.03097)
- [RULERS: locked rubrics and evidence-anchored scoring](https://arxiv.org/html/2601.08654) · [Scoring bias in LLM-as-a-judge](https://arxiv.org/html/2506.22316v3) · [LLM judges vs human relevance in recommender evaluation](https://arxiv.org/html/2511.23312v1)
- [Hybrid search trade-offs](https://arxiv.org/pdf/2508.01405) · [PRF with deep LMs and dense retrievers](https://arxiv.org/pdf/2108.11044) · [ColBERT-PRF](https://arxiv.org/pdf/2106.11251) · [PRF with LLMs](https://arxiv.org/pdf/2603.11008)
- [Position bias in listwise reranking](https://arxiv.org/pdf/2608.03091) · [Listwise reranking under positional bias](https://arxiv.org/pdf/2604.03642)
- [ESCO zero-shot skill matching](https://arxiv.org/pdf/2307.03539) · [Contrastive bi-encoders for ESCO skills](https://arxiv.org/pdf/2601.09119)
- [Null compliance: NYC Local Law 144](https://arxiv.org/html/2406.01399v1) · [Automating bias detection for LL144](https://arxiv.org/html/2501.10371v1)
- [Reciprocal recommendation, best-of-both](https://arxiv.org/html/2409.10992v2) · [Let's Predict Who Will Move to a New Job](https://arxiv.org/pdf/2309.08333) · [Turnover with competitor and contagion effects](https://arxiv.org/pdf/2502.01660)
- [LinkedIn multi-agent platform, InfoQ](https://infoq.com/news/2025/09/linkedin-multi-agent) · [LinkedIn Hiring Assistant, TechCrunch](https://techcrunch.com/2024/10/29/linkedin-launches-its-first-ai-agent-to-take-on-the-role-of-job-recruiters)

---

## 6. Status of section 3 (10 Oct 2026)

| # | Step | State |
|---|---|---|
| 1 | Gold set and eval harness | **Waiting on labelled data** (owner arranging) |
| 2 | Judge position bias | **Done**: seeded shuffle of candidate order per run; verdicts checked independent of order |
| 3 | Name-swap bias audit | **Done as a test** plus a structural fix: judge and embedder text is name-blind |
| 4 | Hidden or injected instructions | **Done**: filter with a recruiter-visible concern |
| 5 | Ideal-profile query | **Done**, weight 0.25, untuned |
| 6 | Rocchio with negatives | **Done**, weight 0.12, needs 3 passed people, untuned |
| 7 | Likely-to-reply score | Not started (needs outreach outcome data) |
| 8 | Blend scores | Already the order: tier first, then score; no rank blend added |
| 9 | Judge calibration | Needs labels |
| 10 to 12 | Fair re-ranking, public signals, distilled judge | Later |
