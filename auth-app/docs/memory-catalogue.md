# SuperHyre memory catalogue

Every kind of memory that goes into Qdrant (`memories`, see `agent-architecture.md` §14), with examples.
Last updated: 3 Oct 2026. Status: proposed.

Each row is one point. Columns: `kind`, `topic` (machine label), what the `text` says, the structured `data`, and anything special (confidence, dates, expiry, visibility). All examples are for org `org_superhyre`, client Acme Fintech, campaign *Senior Backend Engineer*, recruiter Riya.

`level` is one of: **org, client, campaign, recruiter, candidate, company, skill**. `kind` is one of: **episode, fact, belief, preference, playbook, example, profile**.

---

## 1. Org level (how this agency works)

| kind | topic | text | data | notes |
|---|---|---|---|---|
| fact | `policy.no_poach` | "We never approach people we placed in the last 12 months." | `{ months: 12 }` | applies to every campaign |
| fact | `policy.screening_required` | "Every candidate gets the screening form before a call." | `{ required: true }` | |
| fact | `policy.approvals` | "Outreach to senior (Director+) candidates needs an admin's approval." | `{ minSeniority: "Director" }` | |
| preference | `outreach.tone` | "Warm, first name, no emojis, signed by the recruiter." | `{ emojis: false, sign: "recruiter" }` | |
| preference | `outreach.channel` | "WhatsApp first for India; email first for Director and above." | `{ default: "whatsapp", senior: "email" }` | |
| preference | `report.format` | "Client updates go out on Fridays as a short email with a table." | `{ day: "Fri", format: "email_table" }` | |
| belief | `sourcing.channel_yield` | "Most of our hires come from extension saves, not cold sourcing." | `{ extension: 0.6, crustdata: 0.3 }` | confidence 0.7, from hire outcomes |
| playbook | `process.volume_roles` | "For volume roles, send the screening form before any call." | `{ ruleId: "pb_org_7" }` | edited in small steps |
| episode | `admin.rule_change` | "Punith set the 12-month no-poach rule on 3 Oct." | `{ by: "user_punith" }` | source of the fact above |
| profile | `profile` | static: agency focus, tone, rules. dynamic: "busy quarter: 9 open campaigns" | `{ static: [...], dynamic: [...] }` | one per org, deterministic id |

## 2. Client level (what we know about Acme)

| kind | topic | text | data | notes |
|---|---|---|---|---|
| fact | `bar.experience` | "Acme wants at least 3 years at product companies." | `{ minYearsProduct: 3 }` | |
| fact | `constraint.notice` | "Acme won't consider notice periods over 60 days." | `{ maxNoticeDays: 60 }` | |
| fact | `constraint.budget` | "Senior backend budget up to ₹45L fixed." | `{ role: "SBE", maxFixedLakh: 45 }` | `updates` the old ₹40L fact; old one kept, not latest |
| fact | `constraint.work_mode` | "Hybrid, 3 days a week in the Bengaluru office." | `{ mode: "hybrid", daysOnsite: 3, city: "Bengaluru" }` | |
| fact | `process.loop` | "Loop: HR screen → 2 technical rounds → founder round, about 3 weeks." | `{ rounds: [...], weeks: 3 }` | |
| fact | `process.cv_format` | "Neha (hiring manager) wants CVs as PDF with a 3-line summary on top." | `{ contact: "Neha", format: "pdf+summary" }` | |
| fact | `constraint.do_not_submit` | "Don't submit former Acme employees who left less than a year ago." | `{ exEmployeeCooloffMonths: 12 }` | |
| belief | `bar.background` | "Prefers product fintech backgrounds over services firms." | `{ prefers: "product_fintech", avoids: "services" }` | confidence 0.8, 8 pieces of evidence |
| belief | `rejection.pattern` | "Most technical-round rejections are about system design." | `{ reason: "system_design", share: 0.71 }` | confidence 0.75 |
| belief | `process.speed` | "Feedback usually takes 4–6 days; chase on day 3." | `{ medianDays: 5 }` | from stage-move timings |
| preference | `shortlist.size` | "Acme wants at most 5 profiles per batch." | `{ maxPerBatch: 5 }` | |
| episode | `feedback` | "Neha on Rohan: strong coder, too junior for a lead role." | `{ personId: "p_rohan", verdict: "reject" }` | `person_ids` set; feeds the beliefs |
| episode | `meeting` | "Intake call 1 Oct: team is rebuilding the payouts service in Go." | `{ date: "2026-10-01" }` | source chunk in Storage |
| profile | `profile` | static: bar, constraints, process. dynamic: "2 roles open; waiting on feedback for 3 people" | `{ static, dynamic }` | |

## 3. Campaign level (this hire)

| kind | topic | text | data | notes |
|---|---|---|---|---|
| episode | `run.sourcing` | "Run 14: 30 from our pool + 18 new; Riya shortlisted 4, rejected 6 (services backgrounds)." | `{ runId, pool: 30, new: 18, shortlisted: 4, rejected: 6 }` | deterministic id from run id |
| episode | `chat.session` | "Riya and the agent narrowed to Bengaluru + Pune and added Kafka as a must." | `{ conversationId }` | from the observation log when the chat goes quiet |
| episode | `decision` | "Pune added because Bengaluru had fewer than 20 strong matches." | `{ change: "add_location", value: "Pune" }` | the *why* behind a spec change |
| episode | `milestone` | "First offer made on 28 Oct (Asha)." | `{ stage: "offer", personId }` | |
| fact | `spec.rationale` | "Kafka is a must because the team runs event-driven payouts." | `{ requirementId: "r2" }` | the spec itself is in Postgres; memory keeps the reason |
| fact | `deadline` | "Acme wants offers out by 15 Nov." | `{ }` | `event_date` 2026-11-15, `expires_at` 2026-11-30 |
| belief | `market.pool` | "Go + Kafka in Bengaluru is thin; Pune and Hyderabad yield more." | `{ thin: ["Bengaluru"], better: ["Pune", "Hyderabad"] }` | confidence 0.6 |
| belief | `outreach.response` | "Messages mentioning the payouts rebuild get more replies on this role." | `{ hook: "payouts_rebuild" }` | from reply outcomes |
| profile | `profile` | static: role, must-haves, why. dynamic: "3 in interviews, 1 offer pending, chase Neha Friday" | `{ static, dynamic }` | refreshed on stage changes |

## 4. Recruiter level (how Riya likes to work)

| kind | topic | text | data | notes |
|---|---|---|---|---|
| preference | `shortlist.size` | "Riya wants shortlists of 10." | `{ size: 10 }` | |
| preference | `answers.style` | "Short answers; reasons in one line each." | `{ verbosity: "short" }` | |
| preference | `language` | "Writes in a mix of English and Hindi; reply in English." | `{ replyIn: "en" }` | |
| preference | `view` | "Prefers the table view over the board." | `{ view: "table" }` | |
| fact | `focus` | "Riya mostly works backend and data roles." | `{ areas: ["backend", "data"] }` | from assignments |
| profile | `profile` | static: preferences above. dynamic: "4 active campaigns; Acme is the urgent one" | `{ static, dynamic }` | `visibility: owner` for personal items |

No evaluative memories about recruiters (performance, speed rankings). Those belong in reports built from records, not in what the agent "believes" about a colleague.

## 5. Candidate level (what this org knows about a person)

Always `person_ids` set, always org-scoped. Contact details never stored. Structured fields (current CTC, expected CTC, notice, stage) live in Postgres; memory keeps the nuance around them.

| kind | topic | text | data | notes |
|---|---|---|---|---|
| fact | `availability` | "Asha's notice is 30 days and her manager may let her go earlier." | `{ noticeDays: 30, negotiable: true }` | |
| fact | `comp.nuance` | "Asha would consider ₹38L fixed if fully remote." | `{ minFixedLakhRemote: 38 }` | `visibility: org` |
| fact | `location` | "Won't relocate to Mumbai; open to Pune." | `{ no: ["Mumbai"], yes: ["Pune"] }` | |
| fact | `motivation` | "Looking because her company had layoffs this year." | `{ reason: "layoffs" }` | |
| fact | `do_not_contact` | "Asked not to be contacted until April." | `{ }` | `expires_at` 2027-04-01; checked before any outreach |
| episode | `call.highlight` | "Call 3 Oct: deep on Kafka internals, weaker on Postgres tuning." | `{ callId, strengths: [...], gaps: [...] }` | source = transcript chunk |
| episode | `outcome` | "Declined Acme's offer after a counter-offer." | `{ campaignId, outcome: "declined_counter" }` | |
| episode | `client_feedback` | "Acme round 2: great system design, slow on coding." | `{ round: 2 }` | also `client_id` set |
| belief | `fit.roles` | "Better suited to platform roles than product backend." | `{ suits: "platform" }` | confidence 0.6; never shown as fact |
| profile | `profile` | static: skills, background, what they want. dynamic: "in Acme interviews, round 2 done" | `{ static, dynamic }` | per org |

## 6. Company level (what this org has learned about employers)

| kind | topic | text | data | notes |
|---|---|---|---|---|
| belief | `notice.typical` | "Razorpay engineers usually have 60–90 day notice." | `{ minDays: 60, maxDays: 90 }` | `company_ids` set; confidence from past candidates |
| belief | `talent.strength` | "Ex-Paytm backend engineers often have strong UPI experience." | `{ strength: "UPI" }` | |
| fact | `signal.health` | "Acme Payments headcount down 18% in 12 months." | `{ headcountChange: -0.18 }` | `expires_at` +30 days; feeds "likely to move" |
| fact | `relationship` | "Zeta is also a client; don't poach from them." | `{ clientId: "cl_zeta" }` | |
| episode | `news` | "Layoffs announced at Acme Payments on 20 Sep." | `{ url }` | from the market news feed |

## 7. Skill level (how the agent does each job well: procedural memory)

`skill` set; usually org-scoped. Learned from outcomes; changed one item at a time.

| kind | topic | text | data | notes |
|---|---|---|---|---|
| playbook | `sourcing.adjacent_skills` | "For Kafka, count Pulsar as a match and RabbitMQ as partial." | `{ skill: "Kafka", full: ["Pulsar"], partial: ["RabbitMQ"] }` | |
| playbook | `matching.lead_roles` | "For lead roles, make 'has led a team' a must, not a nice-to-have." | `{ roleType: "lead" }` | |
| playbook | `spec.missing_budget` | "Ask for the budget band before sourcing if the JD has none." | `{ ask: "budget" }` | |
| playbook | `outreach.first_line` | "Open with the specific product, keep it under 60 words." | `{ maxWords: 60 }` | outcome score from reply rate |
| playbook | `screening.knockouts` | "For Acme roles, include notice and CTC as knockout questions." | `{ clientId: "cl_acme" }` | |
| playbook | `chat.terms` | "When Riya says 'top ones', she means tier A." | `{ term: "top ones", means: "tierA" }` | |
| example | `spec.approved` | the full role spec Riya approved without edits | `{ role: "SBE", edits: 0 }` | |
| example | `outreach.replied` | the message Rohan replied to | `{ role, city, channel: "whatsapp", outcome: "replied" }` | `person_ids` dropped; message text only |
| example | `outreach.no_reply` | a message nobody replied to | `{ outcome: "no_reply", sent: 25 }` | an *avoid* example |
| example | `form.screening` | a screening form with a 90% completion rate | `{ completion: 0.9 }` | |
| example | `client_update.liked` | a Friday update Neha said was useful | `{ clientId }` | |
| example | `followup.replied` | a follow-up that got a reply after silence | `{ daysAfter: 4 }` | |

## 8. Profiles (one per scope)

| Scope | Static | Dynamic |
|---|---|---|
| Org | focus, tone, rules | open campaigns, busy periods |
| Client | bar, constraints, process, contacts' preferences | open roles, waiting-on items |
| Campaign | role, must-haves and why, deadline | stage counts summary, next actions |
| Recruiter | preferences, focus areas | active campaigns, today's priorities |
| Candidate | background, what they want | where they are in which campaign |

Stored in Qdrant as `kind: profile` so Redis can be rebuilt; served from Redis on every turn.

---

## Never stored in memory

- **Contact details** (phones, emails): they stay behind credits and visibility rules in Postgres.
- **Records of truth**: stages, counts, spec fields, credits. Memory refers to them by id.
- **Raw transcripts and chats**: in Storage; memory keeps highlights and the key to the source.
- **Protected personal attributes**: religion, caste, health, marital status, pregnancy, age guesses, photos-based judgements. Never extracted, never inferred, filtered at the extraction step.
- **Evaluations of colleagues**: no "Riya is slow"; reports come from records.
- **Anything from another org**: every point has one `org_id`; there is no cross-org memory. (A platform-wide layer from anonymised aggregates is possible later, off by default.)
- **Provider names in anything shown to users**, per the extension's vendor-neutral rule.
