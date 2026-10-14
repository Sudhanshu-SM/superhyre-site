# Agent framework: how agentic work and deployment are built

11 Oct 2026. The contract the server (`modules/agent`, `modules/runs`, `modules/sourcing`, `modules/matching`) and the console
(`Agent.tsx`, `liveChat.ts`, `liveSourcing.ts`) share. One way to declare what the agent can do, one way to report what it is doing,
one way to say what changed. No one-off tool, card or refresh hack outside it.

## 1. Principles

1. **Agentic.** The agent never tells the person to go and do something it can do. If a step is missing (campaign not active,
   Gmail not connected, role spec not approved), it proposes that step as an action the person can accept in one click, then
   carries on. It says what it did or proposed, with numbers, in plain words.
2. **One registry.** Everything the agent can read or change is a *capability*, declared once. The model's tool list, the
   approval cards, the executor, the product map in its prompt and the "what changed" refresh are all derived from it.
3. **Autonomy is a property of the capability**, not of the prompt.
4. **Every run narrates itself** in a fixed vocabulary of phases, so the UI can show real progress and never a blank spinner.
5. **Every write says what it touched**, so the console refreshes exactly those views and nothing disagrees with the chat.
6. **Local first, same code in production.** Nothing here depends on the local stand-ins.

## 2. Capability registry (server)

`server/src/modules/agent/capabilities/` holds one file per area (`campaigns.ts`, `candidates.ts`, `pipeline.ts`,
`sourcing.ts`, `connections.ts`, `schedules.ts`, `memory.ts`, `clients.ts`, `team.ts`) and `index.ts` that assembles them.

```ts
type Capability<I> = {
  id: string;                       // "campaign.set_status"; stable, used in events and audit
  title: string;                    // "Activate or close a campaign"
  summary: string;                  // one line; feeds the agent's product map
  kind: "read" | "write";
  input: z.ZodType<I>;              // what the model supplies
  /** Who may use it: the same rule the matching button / route enforces. Checked at propose and again at execute. */
  allow: (scope: Scope) => boolean;
  /**
   * write only.
   *  - "ask":       becomes an approval card; runs only on the person's yes. Always for anything that leaves the
   *                 workspace (email, Slack, Notion, Drive, WhatsApp) or is not reversible.
   *  - "when_asked": runs at once, but only when the person's own words in this chat ground it (`quote`, checked with
   *                 groundQuote, capped per turn), and always reported with what changed. Reversible, in-product only.
   */
  autonomy?: "ask" | "when_asked";
  preview?: (ctx, input) => Promise<Preview>;     // what the card shows: people, before/after, caveats
  run: (ctx, input) => Promise<Outcome>;          // the one implementation; buttons and approvals call this too
  /** Views that are stale after it ran. */
  effects: Effect[];                // "campaign" | "pipeline" | "candidates" | "clients" | "team" | "connections" | "memory" | "schedules" | "spec" | "sourcing"
};

type Outcome = {
  summary: string;                  // "Added 25 people to the shortlist of Software Engineer."
  counts?: Record<string, number>;  // { added: 25, alreadyThere: 0, skipped: 0 }
  next?: Suggestion[];              // the obvious next step, itself a capability call ("Start outreach")
};
```

Rules:
- Reads are `kind: "read"` and run immediately; they may attach a `card`.
- A write that the product already does through a route must call the same service function; the capability adds the
  contract, not a second implementation.
- Output text for the person comes from `Outcome.summary`, not from the model improvising numbers. The model is told what
  happened (and what did not) and writes one or two sentences around it.
- `allow` false means the capability is not offered to the model for that person at all (a recruiter's agent has no
  `team.invite`), and a proposal that arrives anyway is refused with a calm line.

### Capabilities that must exist (new ones marked +)

| Area | Capabilities |
|---|---|
| Campaigns | list, overview, **+ set_status (active or closed)**, **+ approve_spec (the draft role spec, then start sourcing)**, **+ update (name, location, target, priority, client)**, **+ create (name, JD text, client)** |
| Candidates | find, profile, **+ save_to_candidates (people from the search into the Candidates directory, on no campaign)**, add_note, do_not_contact |
| Pipeline | shortlist, move_stage, **+ pass (with reason)**, **+ unshortlist (back to Candidates)**, **+ assign_owner** |
| Sourcing | find_people, keep_sourcing (watch), **+ stop_watch** |
| Contacts | **+ fetch_contacts (`ask`, section 12): emails (free) and phone numbers (a credit when found) for people who are shortlisted; one campaign, particular people, or all campaigns** |
| Outreach | draft, schedule (existing), follow-up (existing) |
| Connections | list, **+ connect (Google / Slack / Notion): returns a connect card with the real authorise URL for this person** |
| Clients | **+ list, create, update** (admin) |
| Team | **+ list_members, invite (admin), set_role (admin)**, create_task (existing) |
| Memory | recall, remember (existing), **+ forget** (one or several notes, one card), **+ overview** (what is remembered for a person, campaign or client), **+ explain** (what an earlier answer was based on) |
| Schedules | list, propose, cancel (existing) |
| Calls | list_calls, call_summary (reads, by the Calls page's own scope rule: `docs/calls.md`) |

"Anything the product's buttons do, the agent can do or propose" is the bar. The registry has a test that walks the console
routes table in `server/src/**/routes.ts` and fails when a user-facing write route has neither a capability nor an entry in
`NOT_FOR_THE_AGENT` with a reason.

## 3. The product map

`server/src/modules/agent/product-map.ts` is generated text (plus a small hand-written part) put in the system prompt, so the agent
knows where things are and what words mean. It covers, at minimum:

- Pages and what each shows: Home, Agent, Campaigns (Overview, Pipeline, Forms & responses, Shortlisted, Role spec),
  Candidates (everyone saved in the workspace, any campaign or none), Clients, Analytics (Outreach, Usage, Projects, Agent
  activity), Settings (Members, Connections, Memory, Do not contact, Notifications).
- The words: **Found** (a search turned them up, not saved anywhere), **Candidates** (saved to the workspace directory),
  **Shortlisted** (on a campaign's board, first stage), **In outreach**, **Interviewing**, **Hired**, **Passed**. A campaign is
  **Active** or **Closed**; there is no draft.
- Who can do what: owner and admin (manage team, clients, every campaign, assign work to others); recruiter (their own
  and shared campaigns).
- The capability list from the registry.
- Phrases people use and what they mean ("send the rest to candidates" = `save_to_candidates`, "put them on the board" =
  shortlist, "remove from shortlist" = unshortlist, "turn it on" = set_status active).

## 4. Run narration: phases

Every run emits `progress` events with `step: "phase"` in addition to today's events. The vocabulary is fixed so the console can
render it without per-skill code.

```ts
{ type: "progress", step: "phase",
  phase: "understand" | "search" | "enrich" | "match" | "decide" | "write" | "wait",
  state: "running" | "done" | "failed",
  label: string,        // "Looking through our pool of candidates"
  detail?: string,      // "Software Engineer, Remote, 5+ years"
  done?: number, total?: number,   // "Scoring 12 of 30"
  found?: number }      // "Got 30 candidates"
```

Required narration for a sourcing run (labels are exact; plain, present tense while running, past when done):

1. `understand` "Reading the role spec"
2. `search` "Looking through our pool of candidates" then "Got 30 candidates" (`found`)
3. `match` "Matching candidates to the role" with `done/total` as each batch is judged
4. `decide` "Shortlisting the best fits" then "Shortlisted 8 of 30" if the run shortlists, else "Ready for your call"

A sourcing run has **no `enrich` phase**: contact details are never looked up while searching, so a search spends no contact
credits (12 Oct). `enrich` is the narration of the on-demand contact fetch for shortlisted people (section 12): "Getting contact
details" with `done`/`total`, then "Contact details for X of N".

A chat turn emits `understand`, one phase per tool call (`search`, `write` ...) and `write` for the answer. Phases are also
emitted for proposals ("Preparing the change") and for approved actions ("Adding 25 people to the shortlist" ... "Added 25").
A phase left `running` when the run ends is closed by the server as `done` or `failed`; the UI never shows a phase that
never ends.

Also required: the first event of any run is emitted within one second of the request (the `understand` phase), and
text streams token by token as it is produced.

## 5. Effects: nothing disagrees with the chat

Every executed write emits one event after it commits:

```ts
{ type: "progress", step: "effect",
  capability: "pipeline.shortlist",
  effects: ["pipeline", "candidates", "campaign"],
  campaignId?: string,
  summary: "Added 25 people to the shortlist",
  counts: { added: 25 } }
```

The console keeps one `invalidate(effects, { campaignId })` function. It refetches (or marks stale and refetches on next
view) the stores for those effects. It is called from the chat reducer on `effect` and `result` events, from approval
decisions, and by every console button that writes. The board, Shortlisted, Candidates, Overview funnel and the Agent
page's right-hand counts all read the same server numbers after it.

## 6. Cards

One card component family, one place (`console/src/agentCards/`):

| kind | Used for | Buttons |
|---|---|---|
| `approval` | any `ask` write | Approve, Not now (and what it will do, who it affects, what it will not do) |
| `outcome` | what a write did | the `next` suggestions as one-click buttons |
| `connect` | a missing connection | Connect Google / Slack / Notion (opens the authorise page; flips to Connected on return) |
| `people`, `campaign`, `campaigns`, `view` | reads | as today |

An approved action's card turns into its outcome card in place (same position), with the counts and the next steps. A
declined one says "Not done" quietly. Nothing says "I'll need you to go to Settings"; a missing connection is a `connect` card.

## 7. Deployment of agents on a campaign

"Deploying" an agent is turning it on for a campaign. It is one idea with one panel (campaign Overview, top): the campaign's
agents, each in plain words with one CTA.

- **Sourcing**: Working (N found, M scored) / Keeping watch (until a number or a date) / Idle. CTA: Find people, Keep sourcing, Stop.
- **Outreach**: Waiting for your approval (N messages) / Sending / Idle. CTA: Review, Pause.
- **The campaign**: Active or Closed. CTA: Close campaign / Reopen campaign.

The state of each comes from the same server rows the runs write; there is no separate "deployment" record. Opening the
workspace after sign-up shows the sourcing agent already Working.

## 8. Latency budget

Target (local, Haiku through the gateway): first visible event under 1 s; first words of an answer under 4 s; a lookup answer
under 8 s; a first batch of scored candidates on screen under 25 s, with the rest filling in as they are judged.
Means: stream text and phases; judge in parallel batches and publish each batch as it lands; judge the top 10 first and
the rest in the background; code fast-paths for commands with no ambiguity (status changes, saving, showing a list); one
tool call per question; do not re-send the whole context when the conversation is warm; start sourcing at set-up, not at
the first message.

## 9. Tests

- Registry: every capability has `id`, `title`, `summary`, `effects`; write capabilities have `autonomy`; `allow` is
  enforced at propose and at execute; `when_asked` requires a grounded quote; per-turn caps hold.
- Route coverage test (see section 2).
- Phases: a sourcing run emits the required sequence; a run that fails closes its open phases.
- Effects: each write emits `effect` with the right views; console `invalidate` unit test per effect.
- Product map: snapshot test so changes to the registry change the map deliberately.

## 10. What campaigns, sourcing and contacts give the framework (as built, 11 Oct 2026)

- **Status.** A campaign is `active` or `closed`; migration 176 folded draft, paused and completed into those. One call:
  `PUT /v1/campaigns/:id/status {status}`, service `setCampaignStatus(db, scope, actor, campaignId, status)` (owner or admin;
  answers `{ status, changed }`, logs `closed` or `reopened` once). New campaigns are `active`. A closed campaign refuses
  new people (shortlisting, adding, searching, fetching contacts) with "This campaign is finished. Reopen it to add people."
- **People actions** (same functions as the buttons): `saveMatchesToCandidates` (`POST /campaigns/:id/matches/save`,
  people this campaign's search turned up go to the Candidates directory, source `agent`, no board entry),
  `removeFromShortlist` (`POST /campaigns/:id/candidates/unshortlist`, only the shortlisted stage, they stay in Candidates),
  `fetchContacts` (`POST /campaigns/:id/contacts`, section 12 and `contacts.md`: only people on the board).
- **The agents panel.** `GET /v1/campaigns/:id/agents` answers what section 7 shows, from the rows the work writes:
  `sourcing.state` (`working` with `run: { id, found, scored }`, `watching` with `watch: { stop, found, nextRunAt }`,
  `idle`), `outreach` (`waiting` drafts, `sending` approved or scheduled), `approvedSpec`, `status`.
- **One count.** `campaignCounts` (`modules/pipeline/counts.ts`, documented at its head) is the only place a campaign's
  people are counted. `stages` is where people are now (board columns, Shortlisted page). `reached` is how far they got:
  found (search finds only, never lowered by a decision), shortlisted (everyone ever on the board, passed included),
  contacted (a message went out, or moved into outreach, or a reply logged; passing a never-contacted person or moving
  someone straight to Hired does not make them contacted), replied (a part of contacted), interviewing (entered
  interviews at some time), hired (at the hired stage now). `rates` are the conversions between neighbours with the
  numerator a part of the denominator. The campaign list and a campaign (`reached`, `rates`), the Pipeline header, the
  Overview funnel, the report and leak views, Analytics > Projects, the digest, the agent's `campaign_overview` and its
  per-turn context all read it; `server/test/funnel-counts.test.ts` computes one campaign through every surface.
  "Found" is stated once too: `sourcingStatus.shown` and `GET /campaigns/:id/matches` `counts` (`found`, `shortlisted`,
  `passed`, `toReview`, `ruledOut`, `unranked`) split the same people, so a decision moves a person out of "to review"
  and never out of "found".
- **Approving a role spec starts matching.** `POST /campaigns/:id/spec/:specId/approve?match=true` (what "Approve and
  start matching" sends) starts the first search when nobody was found yet, or ranks the people already found on the new
  version (`startRescoring`, a `sourcing` run, no profile bought); `matching` in the answer says which. The agent's
  approve capability runs a search, which also ranks everyone found who has no verdict on the approved spec.
- **Do not contact is one rule.** `suppressionsFor` (`modules/suppressions/predicate.ts`) answers it for the approval,
  the send, a draft, a schedule, the board rows (`doNotContact`), the outreach threads (`doNotContact`) and the schedule
  list (`doNotContact`); a listed person is shown as "Do not contact" with no actions, never drafted for.
- **Sourcing narration.** A search emits `understand` ("Reading the role spec"), `search` ("Looking through our pool of
  candidates", then "Got N candidates"), `match` ("Matching candidates to the role", `done`/`total` every group) and `decide`
  ("Ready for your call"; a search never shortlists). It emits `candidate_list` artifacts: zero or more with `partial: true`
  (people judged so far, one per group that lands) then the whole list. It does not look up contact details.
- **Contacts.** On demand, for shortlisted people only, through the extension's waterfall (SalesQL, then Apollo last; see
  `contacts.md`). `POST /campaigns/:id/contacts` takes `{ campaignCandidateIds | candidateIds, mode }`, `POST /contacts/fetch`
  several campaigns or all, `GET /campaigns/:id/contacts/status` says what is fetched, waiting (Apollo) or not found. Found values
  land on the workspace's own candidate row (blanks only); found-list rows carry `hasEmail`, `hasPhone` and `contactsChecked`,
  never the details. The earlier Crustdata enrichment during a search (`enrichStep`, `LIMIT_CRUSTDATA_CONTACTS_PER_RUN`) is gone.

## 11. What the console does with it (as built, 11 Oct 2026)

- **Narration.** `agentPhases.ts` folds `progress` events with `step: "phase"` into lines by `id` (a later `state` replaces
  the earlier one; `seq` guards replay and out-of-order delivery). `agentCards/PhaseTimeline.tsx` draws the lines while a
  turn works, with Stop, and `PhaseSummary` ("Thought for 48s") folds them behind the answer. A sourcing run's people appear
  as the `scored` events and the partial `candidate_list` artifacts land, best fit first, not after the last one. Where the
  server sends no phases the console falls back to the tools the turn used.
- **Cards.** `agentCards/`: `ApprovalCard` (what, who, what it won't do, Approve / Not now; becomes the outcome in place),
  `OutcomeCard` (sentence, counts, up to three next steps; the counts line goes when the sentence already says its
  numbers), `ConnectCard` (opens the authorise page, watches the connection and flips to "connected"; "Carry on" resends
  what was asked). Slack and Notion need `connections.manage`. An `approval` may carry `capability` and `wontDo[]`, an
  `outcome` card `summary`, `counts`, `next[{ label, href | text }]`, a `connect` card `provider`, `url`, `reason`,
  `retryText`; unknown kinds are kept and shown as plain text rather than dropped. `#/agent-preview` replays scripted
  events through the real reducer for a look without a server.
- **Consistency.** `invalidate.ts` is the one `invalidate(effects, { campaignId })`. Chat `effect` and `result` events,
  approval decisions, and every console write (`api/client.ts` `onWrite`, mapped by `effectsOfWrite`) call it; a 120 ms
  window batches a burst. Coming back to the tab after a minute revalidates the open campaign. Stores expose a `refresh*`
  (`campaignStore.ts`, `homeStore.ts`); a page that keeps its own list (Contacts, the Agent page's week) subscribes with
  `onInvalidate`.
- **Roles.** `can.ts` is the table: `can(standing, "campaign.assign")`, `useCan(...)`, with `personal`, `owner`, `admin` and
  `recruiter` as standings. Clients are visible to everyone but a recruiter reads them (no fee or notes, no editing) and
  sees only the clients of their campaigns; the server still answers `GET /v1/clients` for admins only.
- **Where scheduled things went.** There is no Scheduled page and no Memory or Do not contact page in Settings (13 Oct):
  "Coming up" is a card on Home (`HomeComing.tsx`; the next five, soonest first, with Change time and Cancel; the Home scope
  filters it; `#/?section=coming-up`, `&campaignId=` from old links). `#/schedules`, `#/scheduled`, `#/settings/memory`
  (its coming-up section goes to Home, anything else to Settings), `#/settings/do-not-contact`, `#/integrations` and
  `#/extension` redirect. Memory is the agent's own (it says "I'll remember that" and answers "what do you remember about
  Acme?"); a do-not-contact is made by telling the agent or from a person's menu on a board (an admin can "Allow contact
  again" there; the agent never lifts one). Nothing in the console creates a schedule; the agent does, after a yes.
- **Theme.** Light, dark or the device's (account menu; `superhyre.theme`). Dark tokens live in `theme/theme.css`; literal
  colours in the stylesheets get a dark twin from the PostCSS plugin in `theme/postcssDark.ts` (mapping rules in
  `theme/darkColors.ts`, pinned by `darkTheme.test.ts`), so a new rule that spends a literal colour is covered. `setup/`
  and `apply.css` stay light.
- **Loader.** `components/Loader.tsx`: the mark with a thin ring, three sizes, a visually hidden label when it stands
  alone. It is the only spinner; a page waits with it, a button holds its label and shows it inline.
- **Contact details (12 Oct).** `contactsModel.ts` (types, every sentence, who is asked, the poll rule), `contactsFetch.ts` (API
  calls, one store per campaign with polling, a fixtures simulator without an API), `ContactsFetch.tsx` (the cell, the side
  lines, the menu). The Shortlisted table has a "Contact details" column in plain words ("Email found", "Phone found", "Email
  and phone found", "Looking, this can take a few minutes" with the loader ring, "Not found", "No contact details yet") with
  "Get email" (free) and "Get phone" (a credit when found) for a side nobody asked about, only for people with a profile on an
  open campaign; one "Get contact details" menu in the table's bar (the picked people, or everyone who has none: Email, Phone
  number, Both, each with the lookups it will use and the credits left); the person sheet and the profile sidebar show the
  same state from the same store. A result is one calm toast from the server's `summary`. The store polls
  `GET /campaigns/:id/contacts/status` every 6 s while anyone is "looking" (paused while the tab is hidden, 10 minutes at
  most) and invalidates `pipeline` and `candidates` when something lands. `Question.choices` may carry a `text`: what a click
  sends (used by the `contacts_scope` question).

## 12. Contact details: which campaign, how it is asked, what it says (12 Oct 2026)

`fetch_contacts` (`sourcing.fetch_contacts`, `ask`: it spends credits). It looks up emails (free) and phone numbers (a credit each,
only when one is found) for people who are **shortlisted** (on a campaign's board, not passed) through the extension's waterfall
(`contacts.md`). Which campaign is decided in code, so the agent asks the same question the same way every time:
`agent/contacts-flow.ts` (`parseContactsCommand`, `decideContacts`), reached first by the chat for a plain request
(`contactsTurn`, no model call) and by the tool's handler for everything else, with the same table.

| What was said | Campaign | The agent |
|---|---|---|
| "all campaigns", "every campaign", "across campaigns" | all | one card covering every campaign: each with its count of people lacking details, the total, the lookups it will use and the credits left; then everyone shortlisted whose details are not fetched yet |
| a campaign named, or chosen on the page | that one | its card at once |
| "all shortlisted candidates" / "everyone", no campaign named (even with one in focus from earlier) | none | asks "For all campaigns or a particular one?" with each campaign and its count, and "All campaigns" (only one campaign has anyone lacking: no question, its card) |
| nothing named, none in focus, more than one open campaign | none | asks "Which campaign?" with the same choices |
| nothing named, one in focus from earlier, or the only open campaign | that one | its card at once |
| anyone named | the board | a card for those people; someone who is only in a found list is "not shortlisted": said in one line with an offer to shortlist them first (`propose_shortlist`) |
| nothing lacks what was asked | any | says so: "Everyone shortlisted for X already has an email.", with how many were not found (not asked again for 90 days), are still being looked up, or have no profile to look up |

The question is an ordinary `question` event, `kind: "contacts_scope"`, each choice `{ id, name: "Data Engineer, 6 people",
text: "Get contact details for Data Engineer" }` (and "All campaigns"); the console sends `text` as the next message and it
reads back as exactly that request. Sides: "emails" is email, "phone numbers" is phone, "contact details" is both ("phone too"
keeps both). The card says who, the counts per campaign, "Emails are free. Uses up to N phone lookups, a credit for each number
found (M left).", and that details appear on each candidate's page, not in the chat; one request covers at most
`LIMIT_CONTACTS_PER_REQUEST` people (the rest is "waiting").

After a yes: the `enrich` phase narrates "Getting contact details" (`done`/`total`) and ends on the counts; the outcome states them
once ("Got 5 emails and 3 phone numbers for Data Engineer, 2 not found, 1 still being looked up.") and offers "Start outreach"
for each campaign that got an email (and "Send the email" when the request was an email waiting for the address). The effect
event is `sourcing.fetch_contacts` with `candidates`, `pipeline` and `campaign`. A number still on its way arrives by itself,
and the console's Shortlisted page shows it as "Looking" until it does.

`send_email` to someone with no address now proposes this lookup for **every** person on the board (mode email, free), not only
people a search found; its result keeps the words that asked for the email and offers to send once there is an address.

## 13. Waiting for the agent, and acting instead of pointing (12 Oct 2026, agent round)

**No free slot is not a failure.** The gateway admits a few runs at a time (8 interactive, 3 background) and refuses the rest after
its own 20 s queue with `503 capacity`. Nothing has run when that happens, so `platform/gateway.ts` tries again on its own, for
`run`, `batch` and `turn` alike: bounded jittered backoff (1.5, 3, 5, 8, 12 s, each plus or minus a third), honouring the time the
gateway names (`retryAt`) when it is inside what is left, within 90 s in all (75 s for a chat turn). A refusal that names a time
further away than that (a plan limit that lifts in hours) is not waited for: one try, then the time to come back at. When the
patience runs out the error is `unavailable` with `capacity: true` and a `retryAt` (the gateway's, or 30 s on), so parked
background work and the screen have a time. A retry is always before the model ran, so it cannot write twice; `run` ids stay the
same and a spec draft or a search is still one per run.

**It says so.** The caller passes `onWait` and the screen's line becomes "Still working, the agent is busy for a moment"
(phase `wait`): the chat's thinking line (same `id`), the job description's `jd` line, an approved card's draft line. A turn that
is silent for longer than three seconds re-says its line with where it is working and for how many seconds
(`beating` in `runs/phases.ts`; "Working from Senior Backend, 6 s", "Reading what the lookup found, 9 s"). The first line of a
turn goes out beside the first reads and the model request goes out before the lines about it are written.

**A first campaign that is busy ends as "busy", not "unreadable"** (`JOB_DESCRIPTION_STOPPED.busy`), with the saved description
and a Try again that works: "Read the job description for X, draft the role spec and start sourcing." is a command in code
(`parseCommand` kind `start`), so it is not answered with the sourcing view. "Start sourcing" and "draft the role spec from the job
description and start sourcing" do the same: with an approved spec a search; with a description (pasted here or saved on the
campaign) `set_job_description` (read, draft, approve, search, narrated under the same turn, `sourcing/from-jd.ts`); with only
must-haves the `approve_role_spec` card; with nothing, one line asking for the description here.

**An approved long action narrates itself on its card.** `performApproved` opens `approval:<seq>`; a capability writes its steps
under it (`approval:<seq>:read`, `:draft`, `:approve`, `:search`) and the console draws those on the card while it is deciding
(`approvalLines`), so "Working" is never the whole story. `approve_role_spec`: Reading the job description, Drafting the role
spec (with the seconds, or the busy line), Approving the role spec, Starting the search. `create_campaign` ends on "Ready for your
call".

**Someone saved in Candidates on no board is emailed in one card.** `send_email` takes `candidateId` (and `campaignId`, or the
chat's focus, or the only open campaign; otherwise a question with the campaigns as choices). The card says "Shortlist X for C,
then email X" with the exact message and a change from "Not on the board"; the yes checks Gmail first (a missing connection
changes nothing), shortlists, looks the address up for free when there is none, then drafts and sends under the usual outreach
rules. Nothing is changed by a card nobody approves.

**Notion with no default page asks which page, in the chat.** `propose_notion_note` asks an owner or admin with the pages the
integration can see (a `question` of kind `notion_page`, each choice's `text` carrying the page's link); `set_notion_page`
(owner or admin, `when_asked`) remembers the answer as the workspace's default. Anyone else is told to give a page link or ask an
admin; nobody is sent to Settings.

**Tool names never reach a person.** The prompt says so; `agent/plain-words.ts` is the net (streamed and kept replies say
`list_schedules` as "the list of what's scheduled"); a test scans the sentences the code writes for tool names. The tool list sent
with every turn drops the repeated uuid pattern (61 KB to 49 KB).

**The daily chat budget** (`chat:user-day:*`, `chat:org:*`) is taken by a person's message and given back when it was a command done
in code or a turn the agent was too busy to take; the memory, summary, judging and drafting work has budgets of its own.

## 14. Which campaign, which teammate, which client (12 Oct 2026, chat views round)

**Which campaign a message is about** is decided in one place, `agent/campaign-target.ts` (`resolveTarget`), for every view and fast
path. In order: the campaign the words name as a whole phrase; a part of a name ("the Android campaign", "robotics", a client's
name) that fits exactly one campaign this person may see (the focus moves there, "Now working on ..."); several fit, so the
question "Which one?" with each as a choice (each choice resends the request with the campaign's own name); none fits, so one
plain line, "I don't see an X campaign in your workspace", with the visible campaigns as choices. A campaign that exists but is
hidden from this person reads exactly like one that does not exist. Only a message that names no campaign falls back to the one
the page chose, the chat's focus, or the only active one: a name that was given never does. A trailing "for Machine Learning
Engineer" counts as a name only in a plain request for a view or a command (never in a sentence for the model, and never a plural:
"look for platform engineers" is people), and a pasted job description is not read for names.

**Which teammate**: `capabilities/team-lookup.ts`. A teammate is found by name, by the label the Members page shows, or, for an
owner or admin, by email (the whole address). A recruiter matches by name only, and a teammate with no name reads "A teammate" to
them. The model never has to see an address: `agent/team-hints.ts` puts the teammates the message names (by name, or by address
for an owner or admin) in the turn's context with their `userId`, the way `name-hints.ts` does for candidates.

**Which client** (`campaign.create`): with no client said, and clients to choose from, no card is made: a `question` of kind
`client` carries each client, "A new client" and "No client" as choices (each sends its own words, which the model reads as
`client`, `newClient` or `noClient`). `newClient` adds the client, as a prospect and by its name alone, together with the campaign,
in one card. The chat's client wizard asks the company's name and nothing else; website, industry, contact and fee terms are added
on the Clients page. A spec draft that does not come through says the job description is saved and offers a "Try again" that
sends "Read the job description for X, draft the role spec and start sourcing" (the saved description is used, nothing is pasted).

**Views act**: a button that names its action ("Ask for times", "Find the drop-off", "Answer the 1 waiting") sends its words as the
person's next message (`MomentCtx.send`, `act()` in `moments.ts`); the composer is only seeded where nothing can be sent. A press on
one of the agent's own choices sends too, and the choices then stay as they were, no longer pressable. New chat clears the composer.
The sourcing view of a campaign with no approved spec is never "write and approve one in the campaign": the chat answers with the
card that approves the spec (it drafts it first), or asks for the job description there.

## 15. A name a letter off, a client that was never said, a busy model (13 Oct 2026, fixer FA2)

**A name typed a letter or two off is found wherever the person is saved.** `agent/spelling.ts` (`isMisspellingOf`) is the one
test: the same number of words, each a slip or two off (a swap of two letters is one slip, nothing for a three-letter word), at most
two slips in all; a name with a middle name is found by its first and last words. `name-hints.ts` reads candidates from trigram 0.3
and lets only that test through, so "Abhisekh Jain" (0.56 to "Abhishek Jain") is a hint. `lookUpPeople` with a campaign looks at
that campaign first and, when nobody there is the name, at everyone the asker can see (`widened`), saved in Candidates on no board
included. Several near names, or one that is not plainly the one, are a `question` of kind `person` ("Did you mean Abhishek
Jain?") whose choices each send the person's own sentence with the name spelled right; never "I couldn't find X in this campaign".
A saved person on no board carries the next step in their hint line (`send_email` with the `candidateId`; it shortlists first and
asks which campaign with choices). When the model asks "which campaign?" or "which client?" in a sentence and no question with
choices went with it, `chat.ts` puts the choices on the screen (`in-words.ts`): never a question in words alone.

**Which client is decided from what the person wrote.** `campaign.create` takes `client`, `clientId`, `newClient` or `noClient`
only when the person's last three messages say it (`namesCompany`: the whole name or its brand word; `no client`, `internal`, ...).
Otherwise, and when clients exist, the question with the clients, "A new client" and "No client" is put on the screen and nothing
is proposed. The chat's guided form offers a client the message named that is not in Clients as "Add X as a new client" (name only,
a prospect, created with the campaign), also when there are no clients at all.

**A teammate named by an address.** (Section 17: the plain ask is now done in code.) No tool returns an address, so the model cannot tell whose it is. `teamHints` lines come first in the
`named` section (1200 characters, was 700: one candidate on four boards used it all and the teammate was cut), a person's line names
at most three places, a `[email hidden]` the model passes as a name is read as the address in the person's own last message
(`teammatesAddressed`), and `list_team` marks that teammate (`theAddressInTheMessage`).

**Waiting for the model, again.** A 429 from the gateway (the key's per-minute allowance, `Retry-After`) is a refusal like having no
free slot: `failure()` makes it `capacity` with `retryAt`, waited out by `patiently` for runs, batches, turns and embeddings (45 s for a document, 5 s for a query that an answer does without).
A turn that stays busy ends "The agent is busy right now, even after waiting for it." with the time (the screen says "Try again in
40s"). Judging asks again for groups the model had no room for (`JUDGE_RETRY_PAUSES_MS`, now 10 s, 25 s then 60 s, section 17; a limit
named hours away is not waited for); people still not scored are said once, in one line, with `rescore` on the notice: the screen's "Score them
again" sends "Score the people found for X again", a command in code (`startRescoring`; a finished run no longer stands in for a
new ask while people are waiting). The last line then reads "Found N people, not scored yet", never "Ready for your call" over them.
`people.embed` no longer sends a person with no text (only a name, once the name is left out) or more than 8000 characters, which
refused the whole request of thirty-two with a 422.

**Who owns a campaign.** `set_campaign_owner` (`campaign.set_owner`, a card, owners and admins) changes it through the same
`updateCampaign` as the route; the new owner gets a `campaign_owner` notification, the history an `owner_changed` line. `assign_owner`
refuses a request whose words are about the campaign's owner (`owner-words.ts`).

**A note for your admin is real.** `note_for_admins` (`team.note_for_admins`, a card, recruiters): the owner and admins get
"<name> asked to add the client X" in the bell. The recruiter's refusal offers it as one press whose sentence the chat carries out in
code (`roleOffer`, `adminNoteIn`). **A stated fact** ("the notice period cap is now 30 days") puts a line in the turn's context
(`stated-fact.ts`): save it with `remember`, say what was saved, never ask first.

## 16. Rules said in the rule's own words, an address for an admin, a cadence kept (13 Oct 2026, fixer FN, round 4)

**A plain ask to remove someone who cannot be removed is answered in code** (`agent/team-asks.ts`, before the model, for an owner
or admin): "Remove the owner from the team" is "The owner can't be removed. Transfer ownership first.", "remove myself" or one's own
name is "You can't remove yourself. Use Leave organisation instead.", an admin asking for another admin is "Only the owner can
remove an admin." The words and the order are `removalDenied` (`identity/removal.ts`, from `DENIED` in `roles.ts`), the same call
the `remove_member` card's check makes, so the sentence is the same on every route. A removal the rules allow goes on to the model,
which puts the card in front of them. (Owner asking for themselves reads "The owner can't be removed" here and "You can't remove
yourself" from the API, which checks self first: both are true.)

**An owner or admin is told a teammate's address** the same way: "What is Ravi's email address?" and "list my teammates and their
email addresses" are answered in code with the address the Members page shows them. The model never has an address, and a
recruiter is never answered (that ask goes to the model, which says only an owner or admin can see them).

**A cadence is kept or the supported ones are said.** `sourcing/cadence.ts` (`cadenceIn`) reads how often from the person's words:
every hour, every 4 hours, once a day, once a week (and "hourly", "daily", "weekly", "every morning"). `propose_watch` has a handler
that reads the person's last message (400 characters at most), so "watch daily" is a daily watch whatever the model passed; the
short command "keep looking daily for 20 people" carries it too, and the "how many?" question's presses keep it. A cadence the
watch cannot keep ("every 15 minutes", "twice a day", "every 2 days") is answered "A watch can look every hour, every 4 hours, once
a day or once a week, not every 15 minutes. Which would you like?" and nothing is proposed. A length of time ("for 2 weeks") is not a
cadence. With nothing said, the usual is every 4 hours.

**What was said on a call is the calls', not the report.** `classifyBrief` no longer turns "What did the candidate say at the end of
that call?" into the activity report view: a question about a call or its recording or transcript is the model's, which has
`list_calls` and `call_summary`. "Show me a report" is still the report.

**A refusal for who the person is is final.** A tool call refused with `forbidden` (not on the campaign, the role) comes back to the
model with "This is final: say it to the person in one line, in these words. Don't try again with another campaign, another person
or none ...", so a refusal is said once, in the product's words, and not worked around ("Let me try that again without the campaign
ID").

**Off-team recruiters are not offered what they would be refused.** The Agent page's idea chips leave out "find more people" for a
campaign the person may only follow (`mayChangeCampaign`); the read-only ideas for it stay.

**A note to the admins goes with its author.** `note_for_admins` writes the line with `subject_kind = 'member'`, `subject_id` = the
author; removing them or their leaving deletes it from every bell (workspaces-and-orgs.md section 4).

**A client that was named stays named (console, `clarify.ts`).** "Add X as a new client" is the first tile of "Who is it for?" when
the message named a company that is not in Clients, whether it said "for the client X", "for X" or, now, "<role> at X" (a capitalised
place that is not a city we know after "at"; "at scale" is still part of the role). Once that tile is the answer (`client = "new"`)
the company is still read from the message (`newClientOf`), so the card says "For X, a new client" and Create adds the client (name
only, a prospect) before the campaign and links it; nothing says "Internal hire". In the New campaign dialog, "Add a new client..."
picks the client it just made (`pickClient` reads the store as it is now, not the list the dialog drew before the client existed),
and Create uses it.

## 17. An address is the code's, a note carries it, the model is waited for (13 Oct 2026, fixer FM, round 4)

**"Assign <person> to <address>" is a command in code** (`agent/assign-flow.ts`). Six turns in seven for one teammate ended "I need
the teammate's name": no tool returns an address, the system prompt said addresses are hidden, and the model did not use the line
that names the teammate. For an owner or admin the plain ask (`assign|allocate|reassign <one name> to <one whole address>`, with
"please", "on this campaign" or "on <campaign>") is matched to the team here (a whole address, so `rec@` is not found inside
`y1.rec@`), the person to the board (`lookUpPeople`, one person, a name as written), and the same `assign_owner` card is put up with
no model turn. A person on two boards with no campaign in focus gets a `campaign` question whose choices each send the ask with that
campaign. Anything else (a pronoun, two people, someone on no board, an address nobody has) goes to the model, which now has the
teammate written beside the address in its message (`annotateAddresses`: "y1.rec2@y1-co.io [teammate Tara Tester, userId ...]").
`addressesIn` is the one reader of addresses (`team-lookup.ts`).

**Intake notes ask which client in code.** `intake-ask.ts`: notes that ask for a campaign ("please set up the campaign from this")
and say no client (no known client's name, no "internal"/"new client", no company-like name after for/at/with/from, a city is not
one) from an owner or admin, with clients to choose from, are answered with the `client` question at once. `in-words.ts` also
reads "for a specific client, or is it an internal hire?", "is it for a client or in-house?", "does this have a client?" and a
bare "which one?" after a sentence that named campaigns.

**The note to the admins carries the address as typed.** "Invite x@y.io as a recruiter" from a recruiter is `invite-ask.ts`: one
line, one press whose words are the note, and a `note_for_admins` of `about: invite_member` built in code. `note_for_admins` puts
back the address the recruiter typed where the model's text has a masked copy (exactly one typed address), keeps only addresses that
were in the recruiter's own recent words (stored on the card as `typed`), and still takes out every other address and every phone
number. The card says what is true: approving sends it; the admins have nothing to approve.

**Waiting for the model.** `JUDGE_RETRY_PAUSES_MS` is 10 s, 25 s, 60 s (one model call is 10 to 45 s; 4 s and 10 s asked again while
the same work held the slots), each spread a quarter either way, and a time the gateway names (`retryAt`, up to a minute) wins when
it is later. Before a pause the match line says "The AI is busy. Trying again in about N seconds" with how many people wait; the
next person scored puts the count back. A press of "Score them again" while a search or ranking of the same spec version is going
joins that run ("Scoring is already going ..."), and a ranking that scored nobody ends "Couldn't score any of the N people this
time", not "Found N people".

**Off-team spec asks.** "Approve the role spec", "redraft the job description" and the like (`spec_change` command) are the calm
"ask its owner to add you" line in code for someone who only follows the campaign; for anyone on it, the model's, as before.

## 18. Ask or act (13 Oct 2026, fixer FA2, from the owner's feedback on three numbered questions in one paragraph)

**Policy.** The agent asks only when all three hold: the action cannot be done safely or usefully without the answer, no
reasonable default exists, and a wrong guess would be costly or hard to undo. Otherwise it proposes with sensible defaults, the card
is pre-filled, and one line says what was assumed. It never asks about wording or titles, a date or time that has a default (tomorrow
09:00, the next working day), a count or limit (the usual 20 or 30), which of several equivalent ways to do it, confirmation of what
an approval card already confirms, or what the context or the person already said. At most one question in a turn, one short
sentence, with two to four things to tap (the question kinds: campaign, client, person, teammate, notion_page); several items in a
reply are lines, never a paragraph and never numbered inline. The rule is in the prompt (`chat@17`, "When to ask (strict)") and
enforced in code below it.

**In code.** `format-reply.ts` (`tidyReply`, applied to every model reply before it is stored and shown): numbers run together in a
paragraph become lines; when two or more questions are in a message the first stays as the question on its own line and the rest are
folded into "I can also set these, so tell me only if you want them different:" with each on its own line, nothing dropped.
`create_task` takes `assignees` (one task each): the title as said plus the campaign (named, or in focus), due tomorrow 09:00 in the
person's time zone unless a time was said, shown as one card; a name that fits two people is the only question, with their names to
press (`question` kind `teammate`). The recruiter's own task is made at once.

| Question | Now |
|---|---|
| Keep looking: how many people or how long | removed: 30 people is proposed on the card and said once (`propose_watch` too) |
| Task: one or two, what it says, when | removed: one task per assignee, the title from the ask, due tomorrow 09:00 |
| Which campaign, with one open campaign or one in focus | removed (`resolveTarget` already used them); asked only with several open and none in focus |
| Which client, when the person's words (the JD, the notes) name exactly one client | removed: that client is on the card (`withClientNamedInWords`) |
| Which Notion page, when the integration can see exactly one | removed: that page is used for the note |
| "Did you mean" for a name written exactly, or a spelling a letter or two off with no rival | not asked (unchanged, `isMisspellingOf`) |
| Which client, nothing in the words names one, clients exist | kept (client attribution is hard to see wrong) |
| Which client, the words name two | kept |
| Did you mean, near names that are not plainly one | kept |
| Which campaign, the words fit several and none is in focus; a person on several boards | kept |
| Contact details for "all shortlisted" without a campaign: all or one (credits) | kept |
| Which teammate, a name that fits two | kept (with their names to press) |
| Which Notion page, several visible and no default | kept (where outward writes go) |
| The job description, when sourcing has none; the email connection | kept (a connect card or one line, never a quiz) |
| The note to the admins (a recruiter's refusal) | kept: one press, an offer, outward-facing |

## Keeping the console current (13 Oct, `src/invalidate.ts`)

Everything an agent write changes is read again without a reload, from one place. A change says what it touched
(an `effect` event's kinds and its `capability`, an approved action's `result`, a run that ended, a page opened
again, the window coming back) and four tables turn that into the stores to read: `VIEWS_OF_EFFECT` (the server's
effect kinds), `VIEWS_OF_CAPABILITY` (by capability id or action name, for what the vocabulary has no word for:
tasks, owners, the bell), `AMBIENT_VIEWS` (Home's tasks and week, the bell and the campaign list are read after
any agent write, whatever it named) and `VIEWS_OF_ROUTE` (what each page shows from the stores). `READ` is the
one place a store is named. Pages opened again read what is older than `FRESH_MS` (15 s) behind what is shown;
a window that comes back does the same, and reads everything after a minute away. A new capability needs a row
only when it leaves something stale that its effects and the ambient views do not cover.
