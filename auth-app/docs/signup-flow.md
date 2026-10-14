# SuperHyre sign-up flow

Rewritten 11 Oct 2026 after the owner's feedback and the personal/organisation rules in `workspaces-and-orgs.md`. This is the
storyboard and the spec of what is built (console `src/setup/lean/`, server `modules/onboarding`). Everything stays local until
the owner says deploy.

Earlier versions of this file described a "workspace name" question, a company website or LinkedIn step, a sender choice and a
feature tour that played one power at a time. None of those exist any more.

---

## 1. The idea

Mind asks a few short questions on one painted screen. **Nobody is asked to name a workspace**: everyone starts in **Personal**,
which is theirs alone. What the set-up asks about is their **team**: an organisation to join, or to create. Then the first role,
its job description (so sourcing can start at once), and, if the role is for a client, the client's name. Nothing is fetched from
the web and no link is opened.

At the end the server makes the first campaign (**active**, never draft) and its chat, and returns within about a second.
With a job description a **background run** then reads it, drafts the role spec, approves it and starts the first search, so the
agent is already working when the console opens. The console lands in that campaign's Agent chat and the run narrates itself
there, live.

## 2. The flow

| # | Mind says | The person gives | Notes |
|---|---|---|---|
| 0 | tap the star (opening, once per account) | tap | she touches the star, the six powers go into her watch |
| 1 | "Hi, I'm Mind. What should I call you?" | name | offered from the account (Google) when known |
| 2 | "Your team" (see 2.1, the one conditional beat) | a choice | joining ends the set-up; creating is made at the end |
| 3 | "Which role should we start with?" | a job title | four suggestions, or type; a link is not a title |
| 4 | "Paste the *job description*." Helper: "Mind starts sourcing as soon as you finish setting up." | text, or "I'll add it later" | a bare link is turned back gently: "That's a link, and I can't open links. Paste the text of the job description instead." |
| 5 | "Is *Role* for a client?" | No, or Yes then **one field: "Client's company name"** | name only, nothing else is asked |
| 6 | "Here's what you've *unlocked*." | Continue | all six powers together, plainly: icon, name, one line each; nothing highlights or dims |
| 7 | "Setting up your first campaign." then "You're set, *Name*." | Open Mind | three lines tick over while the server works ("Setting up *Northstar*" or "Setting up Personal", the campaign, the hand-over to Mind) |

The progress pills at the top are **About you** (1, 2), **First role** (3 to 5) and **Your powers** (6, 7). A finished pill
takes you back to its first question.

### 2.1 "Your team" (beat 2)

What it shows is decided by who the person is. `resolveTeam` in `Team.tsx` is the whole rule (tested).

| Who | What they see | Choices |
|---|---|---|
| An invitation is waiting for this address | "*Asha* invited you to *Northstar Talent*." You'd join as a recruiter. Personal stays yours. | **Join** (accepts it; the console opens on the organisation) or **Not now** (next invitation, or on) |
| Work address, an organisation uses the domain | "*Northstar Talent* is already on SuperHyre." | **Join** (at once, when the organisation allows it for this address) or **Ask to join** (a request an admin approves), or **Not now** (carry on in Personal) |
| Work address, none on the domain | "Is this for *Northstar*, or just you?" with the name prefilled from the domain, editable | **Create *Northstar*** (the button says which one; they are its owner) or **Just me for now** |
| Personal address (gmail and the like) | "Which *organisation* do you work with?" (optional) | a name, or **Skip for now** |
| ...and the name matches one (lookup, name only back) | "*Northstar Talent* is already on SuperHyre." | **Ask to join** (always a request) or **No, a different one**, which goes back to "Which organisation do you work with?" with nothing in the field (and nothing of the name on her pad). It never opens a form that would make a second one of that name |
| ...and it does not | "Is this for *Brightside*, or just you?" with the typed name | **Create *Brightside*** or **Just me for now** |
| A request was just sent, or one is waiting | "Request *sent*. An admin at Northstar Talent has to approve it. Meanwhile you can carry on in Personal." | **Carry on** |

Every one of these says, in one clause, that **Personal is private**: "Personal stays yours, and only you can see it."
A lookup or a join that cannot be asked never blocks the set-up: the person goes on to create, or to Personal.

Joining (an invitation, a direct join) ends the set-up: the console calls `POST /v1/onboarding/done` so leaving that team later
never walks them through it again, then reads the account (which says where they are now) and opens on the organisation. No
role, description or client is asked (they are joining a team). The name they typed goes with the join (`fullName` on
`/organisations/:id/join` and `/invitations/:id/accept`), so they are never shown by their email address. A request leaves them
in Personal and the set-up carries on there.

While a request is waiting the console looks again every 15 s and when the tab is focused. When it is approved, the set-up
ends the same way as a join: the organisation opens (never a link to a campaign that was made in Personal), with one line,
"You're in Acme."

When the server says the organisation about to be made is already there (`organisation_exists`, a race or a lookup that could
not be made), the set-up asks for it by name and shows that one, to join or to ask to join, instead of an error.

Back: the page's Back and the browser's Back both go one step back inside the set-up (one history entry is kept ahead of the
page); the browser's Back leaves the app only from the first step.

An invite link opened by someone whose account has no name yet asks for one on the same screen ("What should your team call
you?"), as the set-up would have.

### 2.2 Her pad

The notes on the right are one thing she holds. A line is added as each answer is given; the line being typed is live, with a
cursor. Rows: **Name**, **Organisation** (only when one was given or chosen: Personal has no line; "Asked to join" as a plain
note), **First role**, **Description** ("Added", with its word count; a link or a scrap is not shown as one), **For** (the
client's name). At the end the page turns to **First campaign**. Each line is its label over its value, so a long label and a
long value never meet. Rule and tests: `padRows` in `Pad.tsx`. Hidden under 820 px.

## 3. Server (`server/src/modules/onboarding`, migration 177)

| Endpoint | What it does |
|---|---|
| `PUT /v1/onboarding/lean` | keeps the answers as they are given (`core.onboarding.answers.lean`), before any organisation exists; works for a personal address too |
| `GET /v1/onboarding/organisations/lookup?name=` | `{ match: { id, name, joinMode } \| null }`. See 3.1 |
| `POST /v1/onboarding/finish` | makes everything, idempotently. See 3.2 |
| `POST /v1/onboarding/done` | the set-up is over without a first campaign (they joined a team) |

Joining by id (`POST /v1/organisations/:id/join`), invitations (`/v1/invitations`) and `GET /v1/onboarding/organisations/by-domain`
belong to the identity module (see `workspaces-and-orgs.md` section 5); the console codes against that contract.

### 3.1 Looking an organisation up by name

The owner asked for this explicitly ("check if an organisation with the same name existed so that I can join directly"). It is an
**existence oracle**: a signed-in person can learn that a name is a customer. The mitigations, all tested (`test/org-lookup.test.ts`):

- **Name only back**: the organisation's id, its name and how joining would go (`direct` or `request`). Never members, counts,
  campaigns, clients, its domain or anything else.
- **A normalised exact match, nothing fuzzier**: case, spacing, punctuation and trailing company words (Pvt, Ltd, Inc, LLP, LLC,
  Technologies, ...) are ignored (`core.org_name_key`, indexed). Not a prefix, not a near spelling, not a word more or less.
- **Rate limited** per person: 20 lookups an hour, then a calm 429.
- **The same work for a hit and a miss** (one indexed probe, one join-mode read, the same response shape), so timing says nothing.
- **Someone already in an organisation is told nothing** (`{ match: null }`).
- **A match only ever leads to a request an owner or admin approves**, or, for the person's own company address, to the direct
  join that organisation allows. Looking up creates nothing.

### 3.2 Finishing

`finishLean` runs under an application lock per person (`onboarding-finish:<user>`), so a double click, two tabs or a retry make
one of everything, and a repeat returns the stored result. **It never waits for the model** (reading a job description is a
40 s to 2 minute call): it does only database work and returns in well under a second (229 ms with an organisation made, against a
fake agent), then hands the rest to a background run.

1. **Organisation**: only when `organisation` was sent (the person chose "Create <Name>"). Existing `create_organisation`: the
   creator is `owner`, and an owner passes every admin check an admin passes (`test/owner-privileges.test.ts`). A person on a
   personal address can create one too (migration 177: no email domain; nobody reaches it by domain, only by invitation or
   request). Someone already in an organisation is refused (409). **No organisation is ever made implicitly.**
2. **Where things go**: the organisation just made, otherwise **Personal**, whichever of the two the person had open, never an
   organisation they only belong to.
3. **Client**: by name, when the role is for one. Nothing else is stored.
4. **Campaign**: `active`, named after the role, the job description kept on it (`setup.jd`). It exists whatever happens next.
5. **Chat**: a conversation focused on the campaign, titled with the role, with the first turn in it: the person's line
   ("Here's the job description for X.") and a run behind it, so the Agent opens on a conversation, not an empty page.
6. **With a job description**: that first turn's run (`setupRunId`) is claimed in one statement and started in the background
   (`runFirstCampaign`), once however many times finish is called. It says, in phases (`"Reading the job description"` then
   `"Read the job description"`), what it is doing; drafts the spec; approves it; starts `startSourcing` hanging under the turn,
   and emits the same `plan` event (`step: "sourcing"`, `searchRunId`) a chat-started search does, so the console claims the search
   into the turn and shows the search run's own phases. Mind says: "I've read the job description, drafted the role spec and
   started the search. People appear here as they're found."
7. **Without one**: the first turn is answered at once and the spec is drafted from the title in the background and stops at a
   draft; Mind's one line asks for the description: "Paste the job description here whenever you have it and I'll start sourcing."
8. **When something goes wrong** it is said in the chat in one calm line, with an outcome card whose button tries again. The
   run ends `done`, never as a red error, and the campaign (active, description saved) is there either way:
   the description could not be read ("I couldn't turn that job description into a role spec just now. It's saved on the
   campaign, so we can try again."), the spec is not sound enough to search with ("...needs a closer look"), or the search
   could not start (the spec stays approved).

Result: `{ organisationId \| null, campaignId, clientId \| null, conversationId, setupRunId, specRunId \| null }`.

The console's call is safe to repeat (`finishWithRetry`): a slow (60 s), dropped or still-starting attempt is made again and the
server returns the same ids, so an idempotent success is never shown as an error; only an answer that says no is final.

A job description that is a bare link is refused with a calm 400 (the console says so before it is sent). Short or long, it is
text to the model, never a URL to open. The server's research module is untouched and unused.

## 4. Console (`src/setup/lean/`)

| File | What it is |
|---|---|
| `steps.ts` | the beats, order, answers, parsing and every line of copy, pure and tested |
| `Team.tsx` | `resolveTeam` and the hook that holds what was fetched (invitations, the domain's organisation) |
| `gate.ts` | `needsSetup`: who is walked through it (not someone in an organisation, who chose Personal, or whose account could not be read) |
| `LeanSetup.tsx` | the screen: Mind's words, the person's answer, each beat |
| `SideScreens.tsx`, `Side.tsx` | the whole-canvas cases: an invitation, an organisation that is already here, a request sent, an invite link (ready, expired, another address, already in another organisation), an account that would not load |
| `Stage.tsx`, `Pad.tsx`, `Companion.tsx`, `FrameLoop.tsx`, `art.ts` | the painted scene, her, her pad |
| `PowerList.tsx` | the six powers, plainly |
| `lean.css`, `side.css`, `parts.css` | styles; the ink and the type scale are tokens on `.lx` |

`App.tsx` mounts `LeanSetup mode="live"` for anyone `needsSetup` says so about, and after "Open Mind" opens the console on
`#/agent?campaign=<id>` and `openChat(conversationId)`, so the first search is the first thing seen. The phases themselves
are drawn by the Agent (see `agent-framework.md`).

### 4.1 Type and ink (11 Oct)

The first build's headings and sub-copy were hard to read on the peach: `--ink-3` sub-copy measured 3.5:1 on the darkest peach
any text sits on, the placeholder about 1.1:1, the orange accent word 2.4:1, and the Continue link 3.1:1. They are now tokens on
`.lx`, pinned so the console's theme can never turn the set-up's ink light on its always-peach sky:

| Token | Value | Used for | On the darkest peach / on the sky |
|---|---|---|---|
| `--ink` | `#2e1a10` | headings, answers, option rows | 11.5 / 15.3 |
| `--ink-2` | `#4a382c` | secondary lines | 7.7 / 10.3 |
| `--ink-3` | `#5a483c` | sub-copy, muted text, pills | 6.0 / 8.0 |
| `--lx-hover` | `#6e3a22` | an option pointed at (a lighter brown, leaning in) | 6.4 / 8.5 |
| `--lx-mute` | `#826c5e` | placeholders only | 3.4 / 4.6 |
| `--lx-em` | `--accent-deep` | the italic accent word (large display text) | 3.9 / 5.1 |
| `--lx-link` | `#a9340a` | Continue, small links | 4.6 / 6.1 |
| `--lx-alert` | `#9c3410` | a line that says something needs a look | 5.0 / 6.7 |

Three palettes were rendered in headless Chrome and measured against the real backgrounds under every piece of text (7 screens x
5 viewports): the deep warm brown above (chosen: warmest, headings read as ink not grey), an espresso-red (higher sub-copy contrast,
redder accent), and a warm charcoal (greyer, less warm). The type scale dropped about 17 % (`--lx-head`, `--lx-sub`,
`--lx-answer`, `--lx-opt`) so the column is in proportion with her, and it is **vertically centred on her middle** (`--vc`), not
hung from the top.

Fixed on the way: at 1100 to 1250 px wide on a tall window her pad ran off the right edge (its minimum width was larger than the
room beside her). She now steps left before it is asked to be narrower, and 24 px of sky is always left beside it (checked from
821 to 1920 px wide, 600 to 1200 px high).

## 5. Cases around it

| Who | What they see |
|---|---|
| New person, any address | the set-up above |
| An invitation waiting | "*Asha* invited you to *Northstar Talent*." Join / Not now |
| Their company is already on SuperHyre (work address) | "*Northstar Talent* is already on SuperHyre." Join (or Ask to join) / Not now |
| Asked to join | "Request sent." Carry on (in Personal) |
| Invite link, for this address | "You're invited to X." Join |
| Invite link, used up or withdrawn | "That invite has expired." |
| Invite link for another address | "This invite is for another address." Sign in with it |
| Invite while already in another organisation | "You're already in Y." |
| The account would not load | "We couldn't load your account." Try again / Sign out |
| Already in an organisation, finished, or chose Personal | straight to the console |

Preview without an account: `#/setup-preview` (the flow; `?step=name|team|role|jd|client|powers|finish`; `?team=work|domain|request|invited|personal|sent`
picks which "your team" case the stand-in server gives; `&nobar` hides the bar) and
`#/setup-preview?screen=invitation|domain|request|name|sent|invited|expired|elsewhere|taken|error` for the whole-canvas cases.

## 6. Not done / depends on others

- **A personal address cannot sign in yet.** The sign-in card (`validate.ts`) and the database's "before user created" hook
  refuse consumer domains, so the personal-address path in set-up is reachable only once that is relaxed (owner decision; the
  identity module). The set-up itself is ready for it.
- The invitation, join, by-domain and `joinMode` endpoints are the identity module's (`workspaces-and-orgs.md` section 5). Until
  they land the lookup uses a local stand-in for `joinMode` (direct only on the organisation's own domain), marked `TODO(E)`.
- Mobile has no pad (no room); the answers are still kept and shown at the end.
- Accounts that never finished set-up (before this) are walked through it once; they are not asked again after.
