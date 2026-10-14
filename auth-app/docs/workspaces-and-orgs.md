# Personal, organisation, roles and invites

11 Oct 2026. The owner's rules, made explicit so the server, the console and the agent say the same thing. This replaces any
earlier statement that sign-up asks for a "workspace name" or always creates an organisation.

## 1. The model

- **Personal workspace.** Every account has one from the first sign-in. Nobody is asked to name it. It is private to the
  person: its campaigns, candidates, clients, chats, memory, schedules and notifications are theirs alone. It is the default
  place a person lands and starts working.
- **Organisation.** A shared workspace for a company or agency. A person is in **at most one** organisation (existing rule:
  "Leave it before joining another"). They keep their Personal workspace as well and switch between the two.
- **Isolation.** Personal and organisation data are separate stores and never mix: nothing in Personal appears in the
  organisation, and the organisation's data is not visible from Personal, even to the same person at the same time. Nothing
  moves between them silently. The shared people pool is the only common layer, and contact details stay private to the
  tenant that obtained them (migrations 174/175), and so are the people a workspace typed or imported: they are not
  discoverable (another workspace's pool search and the extension's lookup do not return them) until a public source
  (Crustdata or Apify reading their LinkedIn) or the person's own consent through a form makes them so (migration 181).
  Contact details a workspace fetches for the people it has shortlisted (`contacts.md`, migration 185) follow the same rule:
  a Personal workspace and an organisation are separate accounts for lookups (their own credits, lookup log and candidate
  rows), and the details land only on the asking workspace's own candidate row.
  Leaving or being removed from an organisation ends access to its data and never touches Personal.
- The switcher and Settings say this in one calm line each: "Personal. Only you can see this." and "Acme. Visible to the
  people in Acme, by role."
- **Proved, not promised:** `server/test/workspace-isolation.test.ts` puts one of every kind of thing (campaigns, candidates
  and their notes, clients, forms, tasks, chats, agent memory, schedules, exports, runs, do-not-contact entries, the bell,
  an organisation's Slack, quick find, Home and Analytics counts) into Personal and into an organisation for the same
  person, then reads every list and looks up every id from each side, as that person, as a colleague and as an outsider.
  It also covers removal and leaving.
- **Nothing is copied when someone joins.** `core.place_in_org` used to carry a person's Chrome-extension candidates
  and calls into the organisation they created, joined or accepted (migration 109, production behaviour). It no longer does,
  on any path (migration 179). Copying is the person asking: Settings > Organisation shows one line, "You have N candidates
  saved in Personal. Copy them into Acme? Personal keeps its own copy." [Copy them] / [Not now], only while they have some
  that the organisation does not and have not copied. It runs `POST /v1/organisation/import-personal`: the caller's own
  Personal candidates and the extension's list and calls, for themselves only (never another member's), once (a second run
  finds nothing new), Personal keeping its own copy. Contacts come across only where they are the caller's own (typed or
  revealed in Personal); the shared pool's contacts do not, so the organisation unlocks those as it always does.
  Someone the organisation already holds is not copied: the same pool person, or the same email, phone or LinkedIn on any
  of its candidates, whoever may see that candidate. They are counted in `skipped` ("already in Acme") and nothing else
  is said about them.

## 2. Roles (organisation)

| | Owner (exactly one) | Admin | Recruiter |
|---|---|---|---|
| See every campaign, candidate and client | yes | yes | own and shared campaigns, and the candidates on them (plus their own and the unclaimed; see Candidates below) |
| See calls, with their recordings, transcripts and summaries | every caller's | every caller's | only the calls they placed (a Personal workspace: its person's own) |
| Create and edit clients | yes | yes | no (read-only) |
| Assign tasks and campaigns to others | yes | yes | to themselves only |
| Invite people | as admin or recruiter | as recruiter | no |
| Approve or decline requests to join | yes (any role) | yes (as recruiter) | no |
| Change a member's role | any non-owner | recruiters only (not admins) | no |
| Remove a member | anyone but self | recruiters only | no |
| Organisation name, logo, join policy | yes | yes | no |
| Transfer ownership | yes | no | no |
| Leave the organisation | must transfer first | yes | yes |

The database functions (`public.*`) enforce this; the console mirrors it with `can()`; the agent's capabilities use the same
rule through `allow`. One test per row of the table (`server/test/identity-roles.test.ts`).

The agent does the people rows too, as cards an owner or admin approves: invite (`invite_member`), change a role
(`set_member_role`), answer a request (`respond_to_join_request`) and **remove someone** (`remove_member`, 13 Oct 2026). The
removal card names the person and says what happens to their campaigns, candidates and open tasks and who gets them (the
person asking unless someone is named), and it is refused with the database's own words for the same cells as the button (an
admin cannot remove an admin or the owner; nobody removes the owner or themselves). It leaves a line on each campaign that
changed hands (`owner_changed`, "because removed"), a bell for the organisation's owner and admins other than the one who
did it ("Ada removed Eve from Acme. Their 1 campaign and 4 candidates are with Ada."), a bell for whoever holds the work when
that is not one of them, and the removed person's own notice (the database's); the Members page's removal does the same
(`server/src/modules/identity/removal.ts`). A recruiter's plain ask ("remove Ravi from the team") is still the one calm line
with an offer of a note to the admins. Tests: `server/test/agent-remove-member.test.ts`.

How it is held together:

- **One authority.** `core.org_may(action, actor, target, new)` (migration 179) is the whole matrix as a function; every
  management function calls it. `server/src/modules/identity/roles.ts` is the same matrix as data, and a test compares the
  two cell by cell, so they cannot drift. The owner is also held to one by a partial unique index on each workspace's `users`
  table (made the first time a role function touches it).
- **What is refused, and how it reads.** Always 403, always one calm sentence: "Only an admin or the owner can do this."
  (not a manager), "Only the owner can do this." (transfer), "Only the owner can invite an admin.", "Only the owner can make
  someone an admin.", "Only the owner can change an admin's role.", "Only the owner can remove an admin.", "Only the owner can
  cancel an invitation for an admin.", "The owner's role changes only by transferring ownership.", "The owner can't be
  removed. Transfer ownership first.", "You can't change your own role.", "You can't remove yourself. Use Leave organisation
  instead.", "Transfer ownership to someone else before you leave." (`roles.ts` `DENIED` has them.)
- **An admin and roles.** An admin may approve, invite, cancel invitations and remove recruiters, and nothing more. Since only
  the owner makes an admin, an admin has no role to change a recruiter to: asking for the role they already have is a no-op.
- **Teammates' addresses.** An owner and an admin see every member's email address on Members; a recruiter sees names
  and roles (and their own address), the same rule the agent follows (it matches a teammate by name for a recruiter, and a
  teammate with no name reads "A teammate"). `GET /v1/members` sends a recruiter `email: null` for everyone else;
  pending requests and invitations are not sent to a recruiter at all. A person asking to join is named by the name they
  gave in set-up (the same one the bell uses); with none, the row says "No name on their account yet". Tests:
  `server/test/identity-roles.test.ts` ("teammates' email addresses").
- **Clients.** The Clients area is the owner's and admins'. A recruiter reads (never changes) the clients of the campaigns they
  can see, without the agency's fee, notes or activity. Quick find still leaves clients out for them. A recruiter who owns a
  campaign may set its client only to one they can see (a client of a campaign they own, are on, or that is shared with the
  organisation); any other id answers like a client that is not there.
- **Campaigns.** Seeing a campaign shared with the organisation is not being on it (decided 13 Oct 2026, option B: narrow).
  A recruiter who can see one and is not on it (not its owner, not on its team, not an owner or admin) **keeps the board's
  collaborative work** and **may not write the brief or spend the workspace's credits**:

  | Open to anyone who can see the campaign | Needs being on it (its owner, a member, or an owner or admin) |
  |---|---|
  | add people, move them, pass, shortlist, save to Candidates, notes, outreach drafts and the emails that follow (including the free email lookup that sending one needs), tasks, forms, exports, reading everything | writing, drafting, uploading or approving the role spec; starting a search ("Find people", "Find N more"), approving the spec with matching, ranking again; starting, pausing, resuming or stopping a keep-sourcing watch; **getting contact details** (a campaign's, a named campaign's, or "all campaigns", which then means the ones they are on); the campaign's settings and brief (`PATCH /campaigns/:id`, the pasted job description) |

  Otherwise 403 "Only the people on this campaign can change it. Ask its owner or an admin to add you." Closing and reopening, the
  team, the owner, the client and visibility keep their own rules ("Only an admin or the campaign's owner can close or reopen
  it.", "Only admins can change who owns a campaign."). A recruiter's Members page counts, for each person, only the campaigns
  the recruiter can open.
  - **One guard.** `requireOnCampaign` (`server/src/modules/pipeline/service.ts`, with `isOnCampaign` and
    `campaignsOnTeam`) is asked by each service that does one of those things (`matching` draft, edit and approve of a spec,
    `sourcing` start, rank again and the watch, `contacts` fetch, `campaigns` update and the pasted job description), so
    every HTTP route, every agent capability (card preview and run), the chat's own commands ("find more", "score them
    again", "keep looking", "stop the watch": one calm line, no model turn, no card) and a stale approval all meet it. Not
    seeing the campaign at all still answers as before (404, or "You're not on this campaign." for a private one).
  - **The console draws no such control for them** and says why once: "You can follow this campaign. Ask its owner to add you
    to change the role spec or start a search." (`FOLLOWING_LINE`, `src/campaignRights.ts`, the same rule as `isAssigned`):
    the role spec is read-only, the agents panel offers no search or watch, the search card and "Find N more" are not drawn,
    contact buttons and the table's menu are absent, and Edit details and Edit brief are not in the campaign's menu.
  - **Proved:** `server/test/off-team-guard.test.ts` lists every write route of `matching`, `sourcing` and `contacts` (a new
    one fails it until it is decided) and every agent capability of the family, and puts a recruiter who follows a campaign,
    one who is on its team, its owner, an admin and the organisation's owner through each; the console's side is
    `src/__tests__/followingCampaign.test.tsx`.
- **Calls.** One helper decides (`server/src/modules/calls/scope.ts`, `callsVisible`): an owner or admin sees every call in the
  organisation, a recruiter the calls they placed, a Personal workspace its person's own; a call that is not yours answers
  the 404 of an id that is not there. A recruiter's own call about a candidate they can no longer see stays theirs (its
  summary and transcript with it) and names nothing of that candidate. Recordings are served only through a short-lived
  address for one call and one person, whose access is read again when it is opened. See `docs/calls.md`.
- **Tasks.** A recruiter's tasks are their own: giving one to a teammate, or passing one on, is the owner's and admins'
  ("You can give tasks to yourself. An admin can give them to others."). Owners and admins also see and reassign everyone's.
- **Candidates.** The directory follows the campaigns (the security audit's open decision 2, resolved 11 Oct 2026). One
  predicate, `candidateVisible` (`server/src/modules/pipeline/service.ts`, beside `canSeeCampaign`): an owner or admin
  sees every candidate; a recruiter sees a candidate when **(a)** they look after them (`owner_user_id` is them; what
  they add or save is theirs), **(b)** the candidate is on at least one campaign they can see (their own, shared with the
  organisation, or one they are a member of), or **(c)** nobody has taken them yet (no owner and on no campaign at all).
  Taken off a campaign, a recruiter keeps only what (a) gives. A personal workspace is its one person's, unchanged.
  - **A hidden candidate is an id that is not there.** Every read and write by id answers the same 404 body as an unknown
    id; they are absent from lists and filters, quick find, export counts, the agent's tools (`find_candidates` and its
    near-miss names, `candidate_profile`, notes, shortlisting by candidate id), tasks (a task for them is shown without the
    candidate), the do-not-contact list (the entry still holds for every email), applicants' "this may be X", linking, the
    contact-found hints and the typed profile details the matcher reads. Where the server needs "visible candidates" in a
    query it uses `visibleCandidates(sql, scope)` as a table expression, which for everyone who sees all is the table
    itself.
  - **Rows reached through a campaign the caller may open are visible by that campaign** (the board, outreach, matches,
    exports of a campaign, the digest, analytics and Home counts): they need no second check. Counts and funnels were
    already per visible campaign and are unchanged.
  - **Putting someone on a campaign they can see makes them visible**, so normal work is unaffected: shortlisting from a
    search or by candidate id, "send the rest to Candidates" (the saver owns the new row), a form's applicants, a typed or
    imported person added to a campaign, and the Chrome extension's saves. Shortlisting a person a colleague already holds
    puts them on the recruiter's board and so shows them the row; it takes nothing from the owner.
  - **Typing in someone who is already held** (a LinkedIn, email or phone on a candidate the caller cannot see) says only
    "X is already saved by your team", with no id and no word on who holds them; with a campaign they can see it adds them there
    (as shortlisting does) and answers the ordinary "already here". Adding details never changes a hidden candidate.
  - **The Chrome extension** reads and saves through the database. Migration 180 puts the same rule in SQL
    (`core.candidate_visible`) and applies it in `extension_lookup`, `extension_lookup_many`, `extension_save`,
    `core.holds_person` and `core.own_contacts`: someone it may not see is "not saved", with no stage, notes, owner or
    contacts of theirs; saving that person leaves the row as it is and answers a conflict with no owner or stage. A
    person who did not agree to be found is found only by those who may see them as a candidate. Re-applying 175 after
    180 would undo this, like 174/175's own warning in the audit.
  - **Left as it was:** the extension's own call list and queue (its `calls` and `call_queue` tables); the "N candidates
    saved in Personal" count on Settings > Organisation, which leaves out people the organisation already holds; and a
    contact a recruiter's own paid lookup finds for a person a colleague holds, which fills a blank on that row and
    shows to them once a campaign they can see holds the person.
  - **Proved:** `server/test/candidate-visibility.test.ts` (an owner, an admin and two recruiters over HTTP, the agent's
    tools and the extension's functions) covers each rule above.

## 3. Joining

- **Work email** (an address that is not a free-mail domain), verified by the code or Google sign-in:
  - an organisation already uses the domain: "Acme is already on SuperHyre. Join your team?" Joining is **direct** (the
    person becomes a recruiter at once) while the organisation's join policy is "People with an @acme.com email can join
    without approval" (default on; owner or admin can switch it off, then it becomes a request).
  - no organisation uses the domain: one calm choice, "Create Acme" (name prefilled from the domain, editable) or "Just me for
    now". Creating makes the person the owner.
- **Personal email** (gmail etc.): the set-up asks "Which organisation do you work with?" (optional). The name is looked up
  (normalised exact match, name only back). Found: "Acme is already on SuperHyre. Ask to join?" which sends a **request**
  that an owner or admin approves. Not found: "Create <name>" or "Just me for now".
- **Invited**: an owner or admin invites an email with a role, a personal address included (a gmail address may be
  invited, and accepts with that address once it is verified; only the *direct* join by domain is work email). If that
  person already has an account the invitation shows
  **in their notifications** (the bell) in any workspace, with Accept and Decline. If they do not have one yet, the link in
  the invite (and the email) works, and after they sign in the invitation is waiting for them in the set-up and the bell.
  Accepting needs a verified email equal to the invited address.
- While a request is pending the person carries on in Personal. When it is approved a notification arrives
  ("You're in Acme") and the switcher shows it.

What the server does about it (`core.join_mode`, `public.join_organisation`, migration 179):

- **Walks in** only when all of these hold: the email is **verified** (`auth.users.email_confirmed_at`), it is not a
  free-mail address, its domain is the organisation's own, the organisation's `join_policy` is `domain_direct` (the default),
  and the person has never been in it before. Everyone else **asks**. Coming back after leaving or being removed is
  always a request, so removal cannot be undone by the person alone.
- **A personal address may ask but never walks in.** An organisation made from a personal address has no email domain
  (migration 177): nobody reaches it by domain, only by invitation or by asking.
- **One request at a time.** A person has one pending request; asking somewhere else withdraws the first. After an owner or
  admin has answered a request, the same person cannot ask the same organisation again for a day, and no more than 10
  requests an hour in all. Requests can only be made through the functions (direct inserts are revoked).
- **One organisation per person**, checked under locks, so two clicks or an invitation and an approval at the
  same moment make one membership. The message is the same everywhere: "You're already in Acme. Leave it before joining
  another organisation." For an owner it says what to do instead: "You own Acme. Hand its ownership to someone else and
  leave it before joining another organisation." (and, when nobody else is in it, to invite someone first). An
  organisation's id is not an oracle: someone already in another organisation who asks to join an id that is not their own
  work address's organisation gets "We couldn't find that organisation.", the same as for an unknown id.
- **One lock order** (migration 181, `core.lock_membership`): every function that changes who is in an organisation or in
  what role takes the organisation's row, then the person, then the invitation or request row. An invitation accepted
  while the same person's request is approved used to deadlock; now whoever is second finds the membership there: an
  approval of someone who has just come in by invitation answers `approved: true` again, an old invitation never changes
  the role of someone who is already in, and a request a manager had already decided is "already been dealt with". If the
  database still picks a deadlock victim, `rpc()` runs the call again (twice at most) before answering 409.
- **Names are unique**: an organisation's name is unique under `core.org_name_key` (case, spacing, punctuation and
  company suffixes ignored), at creation (`public.create_organisation`, which the set-up's finish and "Create an
  organisation" both use) and at renaming. A taken name answers 409 with `error.code = "organisation_exists"` and one
  sentence naming that organisation ("Acme is already on SuperHyre. Ask to join it instead.") and nothing else; the console
  asks the lookup for the id and `joinMode`. Each refusal counts against the person's 20 lookups an hour, so it is no way to
  list names. Organisations that were already duplicates are left alone (a unique index covers rows made after migration
  181), and the lookup answers with the oldest.
- **Invitations** are found by verified email and listed to that person only; an unverified address is shown none and cannot
  answer one. Another person's invitation id answers like a random id ("This invitation is no longer valid."). Accepting is
  idempotent. Accepting by the link (`/invites/accept`) needs a verified address too. At most 50 invitations wait at once.
  `GET /invitations` also says `memberOfRole` (their role where they already are). The invitation preview
  (`/invites/preview`) shows the invited address only to the person it was sent to: anyone else holding the link gets
  `email: null` and an `emailHint` ("y***@gmail.com").
- **Copy link** on a pending invitation makes a fresh link (the old one cannot be read back, because only its hash is kept)
  and the earlier one stops working. The invitation email goes out through the mailer when there is one.

## 4. Notifications that matter here

Delivered through the bell, actionable in place, workspace-independent for the person's own invitations:

| kind | to | actions |
|---|---|---|
| `invitation` | the invited person (by verified email) | Accept, Decline |
| `join_request` | owner and admins of the organisation | Approve, Decline |
| `member_joined` | owner and admins | open Members |
| `invitation_answered` | the inviter | none |
| `request_answered` | the person who asked | open the organisation |
| `role_changed` | the member | none |
| `removed` | the person removed | none |
| `member_left` | owner and admins | open Members |
| `member_removed` | owner and admins, and whoever takes the removed person's work | open Members or Campaigns |
| `admin_note` | owner and admins | open Clients or Members (the note's link) |

The bell's unread count includes invitations. Accepting an invitation switches the console to the organisation (stores reset,
as on any workspace change), and says "You're in Acme." once.

Where each one lives: `join_request`, `member_joined`, `member_left`, `member_removed`, `admin_note`, `invitation_answered` and
`role_changed` are the organisation's own notifications (in its schema, so they show in its bell, as the others do). `request_answered` and
`removed` are about a person who is not (or no longer) in the organisation, so they are in the person's own inbox,
`core.user_notifications` (RLS: own rows; read ones age out after 60 days like the others), which follows them into every
workspace. Invitations are not copied anywhere: `GET /v1/notifications` reads them from `core.invites` by verified email.
Marking all read stops an invitation being counted (`core.invites.seen_at`), and it stays on the list until it is answered
or runs out. A request someone else already decided stops asking for an answer in everyone's bell (`open: false`).

An `admin_note` is the one line in the bell that carries another member's name and words (a recruiter's "<name> asked to add the
client X", made by the agent's `note_for_admins` card). It is written with `subject_kind = 'member'` and `subject_id` = its
author, and the clean-up that follows a removal or a person leaving (`members.offboard`, `purgeMemberRecords`) deletes every
`admin_note` with that author from every bell, read or not, along with the author's own chats, bell and finished runs. Notes
written before the author was recorded on the line carry no subject: they age out with the read ones after 60 days.

## 5. API contract (server `modules/identity`, `modules/notifications`)

```
GET    /v1/invitations                          -> { invitations: [{ id, organisationId, organisationName, logoUrl, inviterName, role, createdAt, expiresAt }], memberOf: string | null, memberOfRole: "owner" | "admin" | "recruiter" | null }
POST   /v1/invitations/:id/accept               -> { organisationId, role }   (email must match; one-organisation rule; optional body { fullName } for a route that never asked)
POST   /v1/invitations/:id/decline              -> 204
GET    /v1/onboarding/organisations/lookup?name=-> { match: { id, name, joinMode: "direct"|"request" } | null }   (name only; rate limited)
GET    /v1/onboarding/organisations/by-domain   -> { match: { id, name, joinMode } | null }   (the caller's verified email domain)
POST   /v1/organisations/:id/join               -> { status: "joined", organisationId, role } | { status: "requested", requestId }   (optional body { fullName })
PUT    /v1/onboarding/lean                      -> the set-up's draft; a `name` in it is saved at once as core.user_settings.full_name
POST   /v1/organisation/leave                   -> 204 (not for the owner)
GET    /v1/organisation/import-personal         -> { candidates, calls, skipped, imported, organisationName }   (what asking would copy, for the caller; skipped: already in the organisation)
POST   /v1/organisation/import-personal         -> { candidates, calls, skipped, organisationId }   (the caller's own, once; any member)
PATCH  /v1/organisation                         -> adds { joinPolicy: "domain_direct" | "approval" }
GET    /v1/notifications                        -> { notifications: [{ id, kind, text, link, subjectKind, subjectId, readAt, createdAt,
                                                      open, organisationId?, invitation? }], unread }
                                                    (the workspace's own + the person's inbox + invitations, newest first)
POST   /v1/notifications/read                   -> { ids } or { all: true }; marks the workspace's, the inbox's and invitations seen
GET    /v1/me                                   -> workspaces[] of kind "org" also carry { joinPolicy, domain }
```

SQL (all in migration 179, all `security definer`, called as the signed-in user): `public.join_organisation(org)`,
`public.accept_invitation(id)`, `public.decline_invitation(id)`, `public.leave_organisation()`,
`public.update_organisation(patch)`, `public.import_personal()`, `public.personal_import_offer()`; replaced (same
signatures): `core.place_in_org` (no copy), and `invite_member`, `revoke_invite`, `accept_invite`,
`decide_join_request`, `set_member_role`, `remove_member`, `transfer_ownership`. Internals: `core.org_may`,
`core.join_mode`, `core.detach_member`, `core.take_invite`, `core.notify_user`, `core.notify_member`,
`core.notify_managers`, `core.email_verified`. On a local database `auth.users` gains `email_confirmed_at` (Supabase's own
column, which the local stand-in lacked; the local sign-in counts as verifying).

Migration 181 (11 Oct 2026, after the end-to-end round) replaces `invite_member` (personal addresses may be invited),
`accept_invite`, `accept_invitation`, `core.take_invite`, `join_organisation`, `decide_join_request`, `set_member_role`,
`remove_member`, `transfer_ownership`, `leave_organisation` (one lock order, `core.lock_membership`),
`core.place_in_org` (the set-up's name; never changes the role of someone already in), `core.was_member` (was a member
and is not now; `core.has_been_member` is the old meaning, kept for `core.join_mode`), `create_organisation` and
`update_organisation` (one organisation per name), `invite_preview` (the address is the invitee's), `import_personal`
and `personal_import_offer` (dedupe, `skipped`), `core.ingest_person` (typed people are not discoverable) and
`extension_save` (never fills a person it may not see). New: `core.hide_tenant_typed_people()`, `core.may_read_run`
(runs and their events are read by whoever started them, the owner of their conversation, and owners and admins).

Existing routes stay (`/members`, `/members/invites`, `/members/requests/:id/decision`, `/members/:userId/role`,
`/members/:userId/ownership`, `/invites/preview`, `/invites/accept`, `/onboarding/personal`, `/organisations`).
`identity.invite(db, userId, { email, role }, appUrl)` keeps its signature (the agent calls it).

## 6. UI language

Plain nouns: "Personal" and the organisation's name; roles are "Owner", "Admin", "Recruiter" as muted text, no pills. One
line says what a role can do wherever a role is chosen. Errors are calm ("You're already in Acme. Leave it before joining
another organisation."). The switcher shows type and role ("Personal · only you", "Acme · Admin").

In the console: the bell answers invitations (Accept, Decline) and requests (Approve as a recruiter, Decline) in place;
Settings > Members groups people by role with one line on each role and offers only what the viewer may do (`actionsOn` in
`can.ts`); Settings > Organisation holds the name, logo and the join switch for owners and admins, and "Create an
organisation" for someone in Personal.

### Console behaviour that follows from the above (12 Oct)

- **The bell is current within about 15 s.** One poll loop (`homeStore.ts`), every 15 s while the tab is in front, at once when
  it comes back or is focused, and shortly after any write; paused while hidden; one loop however many times the workspace
  changes. Members and the join requests in Settings read on the same rhythm.
- **A workspace change resets everything.** Switching, an approval, accepting an invitation or another tab doing any of them
  runs the same reset: every store (chat, campaigns, Home, forms, memory, connections, candidates) forgets the old workspace's,
  the open chat goes with it (and what the tab would reopen), a link to a campaign is dropped, and the account is read once.
  Requests still carrying the old workspace are not asked again; the person sees one calm line ("You're in Acme now."), not a
  storm. A member who was removed (403 `removed`) is told so and lands in Personal; a member whose workspace merely changed
  (409) is not.
- **One place says what happened.** `toast.tsx` is mounted once, by the console. A refused answer to an invitation or request
  (or any write a store puts back) and the confirmations of every page are drawn there; a dead invitation or request leaves the
  list with one line ("That invitation is no longer open.").
- **Asking to join later.** Settings > Organisation, for someone in Personal whose verified work address has an organisation
  (they said "Not now", or left it): "Join Acme" or "Ask to join Acme", by `joinMode`, never only "Create".
- **An owner is told how to leave**, on the Members page: make someone else the owner first (invite someone if nobody else is
  in it).
- **Said without ids and domains (13 Oct).** The database's own refusals carry what is not the person's: "no invite <id>" and
  "<their email's domain> already has an organisation". `platform/errors.ts` (`plainRefusal`) says "That invitation isn't there
  any more." and "Your team already has an organisation on SuperHyre. Ask to join it instead." The sign-up's job description
  beat keeps Continue pressable once anything is typed and, when it is not enough, says "Paste the whole job description, or
  add it later." with the cursor back in the field; a first campaign that could not start says its sentence once, on the card
  with "Try again".
- **One meaning of "agent messages" on the Usage page (13 Oct).** A message a person sent in a chat that took the agent's
  time: what the daily counter counts. A command done in code and a turn the agent had no free slot for are given back by the
  counter and are not counted by the page either (`runs.error.capacity`, `output.path = 'fast'`), and the set-up's own first
  turn (trigger `action`) is not a message anyone sent. The meter, the chart and the per-person table read the same runs.
  The one definition is `modules/runs/messages.ts` (`messageRun`). The meter can only be above the page by the runs the page
  no longer has: when a removed member's chats and runs are purged (`members.offboard`), what they sent today leaves the day's
  organisation count with them, so the meter keeps agreeing with the chart and the table (13 Oct, Y2-1).

- **The organisation's logo, uploaded, and the invitation email (13 Oct).** `core.organizations.logo_url` is still the one
  logo field; an upload is a small PNG/JPEG/WebP (at most 256 KB, cropped square and shrunk to 256 px in the browser, an SVG is
  turned into a PNG there and never stored) kept in `core.organization_logos` and served openly at
  `GET /media/org-logos/<organisation id>?v=<etag>`, so every place that shows `logoUrl` (switcher, bell, emails) needs no
  change. `PUT /v1/organisation/logo` (owner and admin, decided by `update_organisation`) and `DELETE` the same; a typed link
  through `PATCH /v1/organisation` replaces an upload. The sign-up carries an optional `logo` in `POST /v1/onboarding/finish`
  (dropped quietly when it is not a real small picture). Production needs `PUBLIC_API_URL` set to the API's public address (the
  stored address is built from it; locally from the request). An invitation is emailed once (`core.invites.emailed_at`), HTML
  and plain text, from `modules/identity/invite-mail.ts`, through `deps.mailer`: locally it is in `~/.superhyre-dev/api.log`
  ("invitation email (local outbox, api.log)"); there is **no production provider yet** (`mailerFor` gives `noMailer`), so the
  response says `emailed: false` and the link and the bell carry it. A resend inside a minute of the email going out is refused
  ("was emailed an invitation a moment ago"), because a second invitation would revoke the link just sent. Migration 191.
