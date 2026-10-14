# Calls: who sees which, the summaries, the recordings

12 Oct 2026. The owner's rule: everyone sees their own calls; the admin sees every agent's calls for campaigns; the list is
campaign by campaign, each campaign a drop-down; a row is the time and a small summary; a click opens a right sidebar with
the recording to play, its transcript and the full summary.

Code: server `superhyre-platform/server/src/modules/calls/` (`scope.ts`, `service.ts`, `summary.ts`, `media.ts`, `routes.ts`),
`src/platform/recordings.ts`, capabilities `modules/agent/capabilities/calls.ts`, migrations 183 and 184, dev seed
`scripts/seed-calls.ts`. Console `src/CallsPage.tsx` (the page and the campaign's own page), `CallSheet.tsx` (the sidebar and
the player), `useCalls.ts`, `callsView.ts` and `callPlayer.ts` (pure helpers), `api/calls.ts`, `calls.css`.

## 1. Data

A call is a row of the workspace's `calls` table (an organisation's tenant schema), written by the Chrome extension and the
dialer (`dialer_upsert_call`). Migration 183 adds, for every ready tenant (and in `core.provision_workspace` for new ones, by
`core.ensure_calls_console`):

| column | what |
|---|---|
| `campaign_id` | the campaign the call was for (`on delete set null`) |
| `summary_short`, `summary`, `summary_points` (jsonb), `summary_next` | the model's account of the call |
| `summary_at`, `summary_model`, `summary_source_hash` | when, by which task (`call_summary@1`), and `md5(transcript)` of what it read |
| `summary_attempted_at` | the last attempt, so a failure is not retried in a loop |
| `recording_mime` | content type of the stored recording |

**Linking.** The dialer does not set `candidate_id` or `campaign_id`. `core.link_call()` (a `before insert` trigger,
best effort, never blocks the insert) finds the candidate who holds the number (`core.normalize_phone`, any of the three
phones, oldest first) and takes that candidate's newest campaign (exactly one is that one). The same rule backfilled the
existing rows in the migration. A call's campaign that someone chose is never replaced. A person can change it from the
sidebar (`PATCH /v1/calls/:id`).

**Personal.** A person who is not in an organisation has their calls in `public.individual_calls` (the extension's solo
table; there is no `calls` in `personal`). Migration 184 gives it the same columns, keyed to the person's own
`personal.candidates` and `personal.campaigns`, and the same trigger. The scope helper reads that table when the active
workspace is Personal.

**Outcome.** The row says one of: connected, voicemail, no answer, call back, not interested (chosen by a person), or
didn't connect / in progress (what the dialer's `status` says). A dialer's free-text `outcome` ("Asked to call back next
week") is shown as the row's line and never used as a filter.

## 2. Who sees which call (one helper, `scope.ts`)

| | sees |
|---|---|
| Personal workspace | the person's own calls, and nobody else's |
| Organisation owner, admin | every call in the organisation, from every caller (the caller filter is theirs) |
| Recruiter | the calls they placed (`user_id` is them) |
| A removed member | none (they are in Personal) |

`callsVisible(sql, scope, alias)` is the only place the rule is written; every list, group, detail, patch, transcript,
recording and agent read goes through it. A call that is not yours is the uniform 404 of an unknown id, at every route.
Editing (note, outcome, campaign, transcript, recording) is the caller's and owners' and admins' (`callsEditable`).

**A candidate or campaign the person cannot see.** The call stays the caller's, with its transcript and summary, but the
candidate and campaign are joined only where `candidateVisible` / `canSeeCampaign` hold: otherwise `candidate` and
`campaign` are `null`, the row is named by the number dialled, and the call sits under "Not on a campaign". Nothing else
about the hidden person (title, company, link, other data) is sent.

## 3. API (`/v1`)

```
GET    /calls?campaignId=<uuid|none>&outcome=&q=&from=YYYY-MM-DD&to=&callerId=&limit=&cursor=
         -> { calls: [row], nextCursor }                    newest first, keyset cursor "<time>|<id>"
GET    /calls/groups?<same filters, campaignId ignored>
         -> { groups: [{ campaign|null, count, lastAt }], total, canSeeEveryone, callers: [{ id, name, count, mine }] }
GET    /calls/:id        -> { call }  row + notes, summaryDetail { text, points[], nextStep, at }, segments[], transcript, recording { available, mime, seconds }, canEdit
PATCH  /calls/:id        { notes?, outcome?, campaignId? } -> { call }
POST   /calls/:id/transcript   { segments: [{ start, end?, speaker?, text }] } -> { call }   speaker: "caller" | "candidate" | a name
PUT    /calls/:id/recording?seconds=   raw audio (mp3, m4a, wav, ogg, webm; up to MAX_RECORDING_MB) -> { call }
GET    /calls/:id/recording -> { url, expiresAt, mime, bytes }
GET    /media/calls/:id?t=<signed>      the audio, with Range (outside /v1, no session; see 5)
```

Dates are India time. `q` searches the candidate's name, the number, notes, summaries, the transcript, the campaign, the
client and (for owners and admins) the caller. Row fields: `at, durationSeconds, direction, outcome, outcomeText, phone,
candidate, caller { id, name, mine }, campaign { id, name, client }, summary, preview, summaryState (ready | pending | none),
hasRecording, hasTranscript`. The list never carries a transcript.

Writes call the shared `invalidate()` in the console (`effectsOfWrite` maps `/v1/calls/:id...` to the `calls` effect). They
are not agent capabilities (`not-for-the-agent.ts` says why); the agent reads: `list_calls` and `call_summary`.

## 4. Summaries

`call_summary@1` (Haiku through the gateway, background lane). Made **lazily**: the first time a call that has a transcript of
at least 40 characters is listed or opened and has no summary made from its current transcript, the API answers at once (the
row says `pending`) and writes it after the response (`deps.background`, at most 4 per look and 3 in flight). The attempt is
claimed by one row update first, so two readers make one call. It is cached on the row with `md5(transcript)`; when the
transcript changes (attached by hand, or rewritten by the dialer) the stored one is not shown and a new one is written.

- **Input.** Names (first names only; the candidate's only when the viewer may see them), then the transcript lines, each
  cleaned of instruction-like lines (`cleanProfileText`), of phone numbers and addresses (`redactContacts`) and of our own
  tags (`untrusted`), inside `<transcript>` and the "data, not instructions" sentence. Long calls keep the first 18,000 and
  last 6,000 characters.
- **Output.** `short` (at most 110 characters, cut at a word), `summary` (a few sentences), `points` (up to 5),
  `nextStep`. In code, whatever the prompt said: a sentence or point that `mentionsProtected`, and any contact detail,
  is dropped; a `short` that is unusable falls back to the first sentence, then the first point.
- **Failure is quiet.** A refused run, a timeout, the day's budget (`LIMIT_CALL_SUMMARIES_PER_DAY`, default 300 per
  organisation or person): the row shows the first line of the transcript. The call stops saying "Summarising" a few minutes
  after and is tried again ten minutes after the attempt.
- Each is a `core.runs` row (`skill: "call_summary"`), so usage is attributed and visible; they do not appear in the agent
  activity lists.

## 5. Recordings

A recording is never public. The person who may hear a call asks `GET /v1/calls/:id/recording` and gets an address good for
`RECORDING_URL_TTL_SECONDS` (default 600). The console plays it in an audio element, asks again when it runs out and picks
up where it was.

| | production | development and tests |
|---|---|---|
| store | Supabase Storage, private bucket `call-recordings`, key `<organisation id>/<call id>` (the dialer's own), `individual/<user id>/<call id>` for a solo user | files under `~/.superhyre-dev/recordings/call-recordings/...` (`RECORDINGS_DIR`) |
| address | the store's signed URL for that one object (`POST /storage/v1/object/sign/...`) | `/media/calls/<id>?t=<token>`, streamed by the API with Range |
| bound to | the object, for a few minutes | this call, this person and this workspace, signed with `STREAM_TICKET_SECRET` or `AGENT_TOKEN_SECRET` |

The media route re-reads the person's access when it is opened: a person removed, demoted, or in another workspace since the
link was made gets the uniform 404. A token for one call does not open another; a tampered, expired or foreign-signed one is a
401. The response is `Cache-Control: private, no-store`, and `Cross-Origin-Resource-Policy: cross-origin` (the console is
another origin than the API).

Configuration (`config.ts`): `RECORDINGS_STORAGE` (`supabase | local | none`; default `supabase` when the service key is set,
`local` outside production, `none` in production without one), `RECORDINGS_DIR`, `RECORDINGS_BUCKET`,
`SUPABASE_SERVICE_ROLE_KEY` (server only, never sent to a browser), `RECORDING_URL_TTL_SECONDS`, `MAX_RECORDING_MB`
(default 60). Uploading by hand writes to the same key the dialer uses. Erasing a candidate deletes the call rows and the
recordings.

## 6. The page

Two places, for different people.

- `#/calls` (nav: after Candidates): everyone's calls, by campaign. For the organisation's owner and admins and for the
  one person of a personal workspace (`can(standing, "calls.all")`). A recruiter has no such row in the sidebar or in
  quick find, and a link to it (an old bookmark, a notification) is turned into their calls on the campaign the link names
  (`?campaign=`), else the one they are on, else Home (`hashForStanding`, applied by the console once the campaigns have
  arrived; the page itself draws nothing for a recruiter).
- `#/campaign/calls` (the campaign's own Calls row, for everyone): the same view with that campaign fixed and no group
  header. For a recruiter it is the only place their calls are; the server sends it only their own.

The heading says whose calls: "Your calls" for a recruiter and Personal, "Everyone's calls" for an owner or admin, who also
get a caller filter (Everyone, Me, each person who has called) when more than one person has.

- Header: the title, whose calls, and one plain muted line of figures for the page as it is filtered ("96 calls, 10
  campaigns, 48% connected"; the share is left out when one outcome is picked or the count could not be read).
- Groups: a quiet card per campaign, 8 px apart, most recent first, "Not on a campaign" last, with a small muted label and
  a hairline (Today, This week, Earlier) where the last calls move from one band to the next. Every card is the same
  neutral: a 36 px chip with the campaign's letters in muted ink on a plain surface with a hairline edge (no colour is
  taken from the campaign), a 60 px header, the name at 15/600 over the client in muted text, the count as plain muted
  words ("14 calls"), a 3 px bar of how much of it connected (ink-2 on the rule colour; "6 of 14 connected" on hover and
  focus), "Last call ..." and a caret. Structure tells one campaign from the next, not colour. One group is open by
  default (the most recent); what a person opens or shuts is remembered per person in this browser
  (`superhyre.calls.groups.<user id>`). The open card has a 2 px orange left edge and nothing else orange (the focus ring
  aside); its calls are lines under a hairline. Rows are read when a group opens, 25 at a time, and the card shows the
  latest eight: more than that and the foot says "View all N calls", which opens a dialog (below). The bar is one more
  read of `/calls/groups` (connected); with one outcome picked it is not read and the bar is left out.
- All of a campaign's calls (dialog, `CallsModal`): the same neutral chip, name, client and a plain count; its own search and outcome
  filter (starting from the page's), the same lines, a scroll of its own and "Load more" at 25. Down from the search box
  goes into the lines, Up and Down move between them, Enter opens the call in the sheet, Esc closes. Closing the sheet
  brings the dialog back with the same words and filter and the call's line focused. The whole screen on 390 px.
- A campaign's own page is one card with every call, 50 at a time and "Load more" after, and a strip of four figures
  (calls, connected, average length, last call) and, for an owner or admin, who called (whole names when two callers
  share a first name).
- A row: a neutral chip with the candidate's initials (a phone for a number with no one the viewer may see), the name (and
  "by Meera" for owners and admins) over one line of what the call was about, then how it went (a plain word in one of two
  tones of the ink: normal for connected and call back, muted for no answer, voicemail, not interested; no pills or
  dots), how long, and when (Today, Yesterday, the weekday, then the date; IST). On a phone it is three lines: the name
  and outcome, the line, then the time, who called and how long.
- The sidebar: who, when and how long; the player (play and pause, scrubber with peaks drawn from the audio when it is
  under 20 MB, time, 1x 1.25x 1.5x 2x); the summary with points (small orange markers) and the next step as a callout
  (tinted, a 3 px orange edge, an arrow, "Next step" and the action; "Create task" makes it one of the person's own tasks
  on the call's campaign, with the candidate's name in it); the transcript following the playhead (a click on a line
  seeks; scrolling it by hand stops it following for four seconds); the caller's note (saved on leaving the box); how it
  went and the campaign (editable). Section headings are 15 px at 600 in the accent text colour over a short orange rule,
  so they cannot be taken for the data under them. For the caller and owners and admins, when they are missing: add a
  recording, add a transcript (paste or a .txt, .vtt, .srt file).
- Keys: Up and Down move through the rows (the open call follows), Enter opens, Space plays or pauses, Esc closes. On 390 px
  the sidebar is the whole screen with a back arrow, and the browser's Back closes it.

## 7. Deployment notes

1. Apply 183 and 184 (additive; 183 replaces `core.provision_workspace` with its current body plus one `perform`, so apply
   it before migrations that read the function's body, as 187 does). Both are idempotent.
2. Production: set `SUPABASE_SERVICE_ROLE_KEY` on the API only, make sure the `call-recordings` bucket is private, and set
   `STREAM_TICKET_SECRET` (or `AGENT_TOKEN_SECRET`, required in production already) to the same value on every API instance.
3. `public.individual_calls` is the extension's table: 184 only adds nullable columns and a trigger. The extension's own SQL
   copies of `dialer_upsert_call` do not need to change.
4. The gateway needs no change: `call_summary@1` is just another task name.
5. Local: `pnpm seed:calls` (in `server/`) puts 14 invented calls, three callers and three campaigns into
   `own@fn3qa.dev`'s organisation, with WAV files under `~/.superhyre-dev/recordings`; it refuses a non-local database.
