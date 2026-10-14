# Analytics API (13 Oct 2026): final response shapes

Contract for the console pages (written to match `analytics-research-2026-10-13.md` section 4 and the types in
`auth-app/src/api/analytics.ts`; everything beyond the spec is additive). Server:
`superhyre-platform/server/src/modules/analytics/`. All routes are `GET`, signed-in, workspace-scoped like every other
`/v1` route. Fields are only ever added. Needs an API restart to be live.

Definitions live in the research doc section 1.4; this file is only the wire format.

## Common query params (all five modules)

| param | values | notes |
|---|---|---|
| `period` | `7`, `30`, `90`, `custom` | default `30`. Alias: `days` (any 1 to 365). A window is whole calendar days in the viewer's time zone, ending today (today included). |
| `from`, `to` | `YYYY-MM-DD` | with `period=custom` (or on their own); inclusive, viewer's zone, at most 365 days; `to` is clamped to today |
| `campaign` | uuid | alias `campaignId`. A campaign the viewer cannot see reads as "nothing there" (empty), never an error |
| `client` | uuid | alias `clientId`. One client's campaigns |
| `recruiter` | uuid | alias `userId`. Owner/admin only; **ignored** for recruiters and Personal (`viewer.recruiterId` says what was applied) |
| `view` | `mine` (default) or `campaigns` | recruiters only, on `overview` and `outreach`: `campaigns` = totals over the campaigns they can see (what Home shows), no names |
| `state` | `active` (default), `closed`, `all` | `campaigns` only |

Bad input is `400`. Previous period = the same number of days immediately before `from`.

## Common envelope (every response has these, next to the module's own fields)

```json
{
  "days": 30,
  "timeZone": "Asia/Kolkata",
  "period": { "key": "30", "days": 30, "from": "2026-09-14", "to": "2026-10-13",
              "prevFrom": "2026-08-15", "prevTo": "2026-09-13" },
  "viewer": { "role": "owner", "userId": "uuid", "seesTeam": true, "canPickRecruiter": true,
              "view": "team", "recruiterId": null },
  "empty": false,
  "emptyReason": null
}
```

- `viewer.role`: `owner | admin | recruiter | personal`. `viewer.view`: `team` (owner/admin), `recruiter` (owner/admin with a
  recruiter filter), `mine` (recruiter default, Personal), `campaigns` (recruiter switch).
- `empty` is true when there is nothing to draw; `emptyReason` is `no_campaigns` (nothing to measure yet), `no_activity`
  (campaigns exist, nothing in this period) or `null`. Arrays are `[]` and numbers `0` then, never missing.

## Shared value shapes

- **Ratio** `{ "n": 1, "of": 4, "rate": null, "small": true, "smallN": true }`. `rate` is a **fraction 0 to 1** (never above 1)
  or `null`. `small`/`smallN` (same value, two names) is true when `of < 5`, including 0: show "1 of 4" (a dash when `of` is 0),
  never a percentage; `rate` is `null` then.
- **Medians** are plain numbers next to their count: `medianDays: 6.5, n: 12`; `medianDays` is `null` when `n < 3`
  ("Not enough yet").
- **Pair** `{ "n": 12, "prev": 9 }`: this period and the one before it.

No vendor names appear in any label.

## GET /v1/analytics/overview

```json
{
  "tiles": {
    "hires":      { "n": 3, "prev": 1, "planned": 8 },
    "interviews": { "n": 9, "prev": 6 },
    "replies":    { "n": 14, "prev": 10, "contacted": 52 },
    "found":      { "n": 71, "prev": 40, "series": [{ "day": "2026-10-13", "n": 4 }] }
  },
  "funnel": {
    "cohort": { "from": "2026-09-14", "to": "2026-10-13" },
    "steps": [
      { "id": "found", "label": "Found", "n": 80 },
      { "id": "shortlisted", "label": "On the shortlist", "n": 41 },
      { "id": "contacted", "label": "Contacted", "n": 30 },
      { "id": "replied", "label": "Replied", "n": 12 },
      { "id": "interviewing", "label": "Interviewing", "n": 7 },
      { "id": "hired", "label": "Hired", "n": 3 }
    ],
    "rates": [
      { "id": "kept", "label": "Kept after search", "n": 41, "of": 80, "rate": 0.51, "small": false, "smallN": false },
      { "id": "reachedOut", "label": "Reached out to", "n": 30, "of": 41, "rate": 0.73, "small": false, "smallN": false },
      { "id": "replied", "label": "Replied", "n": 12, "of": 30, "rate": 0.4, "small": false, "smallN": false },
      { "id": "interviewing", "label": "Moved to interview", "n": 7, "of": 30, "rate": 0.23, "small": false, "smallN": false },
      { "id": "hired", "label": "Hired", "n": 3, "of": 7, "rate": 0.43, "small": false, "smallN": false }
    ]
  },
  "trend": [{ "weekStart": "2026-10-05", "interviews": 3, "hires": 1 }],
  "trendGrain": "week",
  "lookAt": [
    { "kind": "quiet_campaign", "count": 1, "text": "1 campaign has been quiet for 7 days or more", "href": "#/analytics/campaigns" },
    { "kind": "waiting", "count": 5, "text": "5 people have waited longer than usual", "href": "#/analytics/pipeline" },
    { "kind": "unlogged_replies", "count": 6, "text": "6 sent emails have nothing noted after 4 days", "href": "#/analytics/outreach" },
    { "kind": "overdue_tasks", "count": 2, "text": "2 tasks are overdue", "href": "#/tasks" }
  ]
}
```

- `tiles.*` use the same helper as Home (`/v1/overview/home`): replies and interviews are distinct people, a hire is a person at
  Hired now. Home counts active campaigns only; Overview also counts campaigns closed in the period (history), so they differ
  only when a closed campaign had activity in the window. `planned` = targets of active campaigns.
- `funnel` is `pipeline/counts.ts` over the cohort "people added in the period, followed to today".
- `trend`: `weekStart` is the bucket's first date; `trendGrain` is `day` when the period is 14 days or fewer, else `week`
  (weeks start Monday in the viewer's zone). Every bucket is present, zeros included.
- Recruiter default (`view=mine`): tiles count the person's own moves, the funnel is the people they look after.
  `view=campaigns`: totals as Home.
- `lookAt`: only entries with `count > 0` (up to 4); `campaignId` is present only when one campaign is meant; `href` is a console hash route.

## GET /v1/analytics/recruiters

Owner/admin get `people` (every active member, zero-activity rows included). A recruiter gets `me` + `typical`.
Personal gets `me` only.

```json
{
  "people": [
    {
      "userId": "uuid", "name": "Meera Nair", "role": "recruiter", "former": false, "active": true,
      "emails": { "sent": 42, "replied": 9, "rate": 0.21, "small": false },
      "calls":  { "placed": 18, "connected": 11, "talkSeconds": 3120, "rate": 0.61, "small": false },
      "shortlisted": 20, "interviews": 5, "hires": 2,
      "tasks": { "due": 6, "onTime": 5, "overdue": 1 },
      "load":  { "inProgress": 14, "waiting": 3, "campaigns": 2 },
      "prev": { "emails": { "sent": 30, "replied": 6, "rate": 0.2, "small": false },
                "calls": { "placed": 12, "connected": 7, "talkSeconds": 2000, "rate": 0.58, "small": false },
                "shortlisted": 15, "interviews": 3, "hires": 1 }
    }
  ],
  "me": null,
  "typical": null,
  "waitingLongest": []
}
```

- Rates are fractions (`emails.rate` = replied / sent, `calls.rate` = connected / placed), `null` when `small` (fewer than 5).
- Recruiter: `people` is absent/`null`; `me` is one row (same keys, with `prev`); `typical` has the same stat keys (medians of the
  other active people, no `userId`/`name`) **only when 3 or more others had activity in the period**, else `null`.
  `waitingLongest` (their 5 oldest people): `[{ campaignCandidateId, candidateId, campaignId, name, campaign, stage, days }]`.
- Owner/admin: `me` is `null`; with `recruiter=<uuid>` `people` holds that person alone and `waitingLongest` is theirs.
- It counts what people did themselves (agent moves go to no one), so totals can be below Overview: one footnote says so.
- `typical` is built only from what the recruiter may see: another person's emails, moves, calls and tasks count only on
  campaigns visible to the viewer (calls and tasks with no campaign count too); nothing is ever named.
- A removed member's work appears as `{ "name": "Former member", "former": true }` so totals reconcile.

### GET /v1/analytics/recruiters/:userId/weekly

Owner/admin for anyone; a recruiter only for their own id (anyone else `403`). Same period params.

```json
{
  "userId": "uuid", "name": "Meera Nair", "grain": "week",
  "weeks":    [{ "weekStart": "2026-10-05", "emails": 12, "calls": 5, "interviews": 2 }],
  "previous": [{ "weekStart": "2026-09-28", "emails": 9, "calls": 4, "interviews": 1 }]
}
```
`previous[i]` lines up with `weeks[i]`; `grain` is `day` for 14 days or fewer.

## GET /v1/analytics/outreach (existing route, additive)

The old fields are unchanged (`days`, `timeZone`, `totals`, `byCampaign`, `byTouch`, `byHour`, `stalls`). `?days=N` alone now
means the last N whole calendar days ending today in the viewer's zone (it used to be a rolling N x 24 hours; the numbers
differ only by the part of a day). New: the envelope, the common filters, and

```json
{
  "reply":       { "n": 9, "of": 42, "rate": 0.21, "small": false, "smallN": false },
  "timeToReply": { "medianHours": 6.5, "n": 9 },
  "waiting":     6,
  "showByHour":  true,
  "byCampaign":  [{ "campaignId": "uuid", "name": "Backend", "drafted": 10, "sent": 8, "replied": 2, "awaiting": 1,
                    "replyRate": 0.25, "reply": { "n": 2, "of": 8, "rate": 0.25, "small": false, "smallN": false } }],
  "byTouch":     [{ "touch": "first", "sent": 30, "replied": 7, "replyRate": 0.23 }],
  "touches":     [{ "touch": "first", "sent": 30, "replied": 7,
                    "reply": { "n": 7, "of": 30, "rate": 0.23, "small": false, "smallN": false } }]
}
```

- Recruiter default is their own sent emails (`sent_by`); `view=campaigns` is everyone's on campaigns they can see.
- `showByHour` is true only when 30 or more were sent; hide the hour chart otherwise. `waiting` = sent, nothing noted yet.
- `replyRate` stays a fraction (as before) even when small; use `reply.small` (on `byCampaign[]`, `touches[]`, `reply`) to decide count or percentage. `byTouch` is unchanged; `touches` is the same rows with the ratio.

## GET /v1/analytics/calls

```json
{
  "totals": { "placed": 18, "connected": 11, "rate": 0.61, "small": false, "talkSeconds": 3120, "avgSeconds": 284 },
  "outcomes": [{ "outcome": "connected", "n": 11 }, { "outcome": "voicemail", "n": 3 }, { "outcome": "no_answer", "n": 3 },
               { "outcome": "call_back", "n": 1 }, { "outcome": "not_interested", "n": 0 }],
  "byCampaign": [{ "campaignId": "uuid", "name": "Backend", "placed": 9, "connected": 6, "talkSeconds": 1700 },
                 { "campaignId": null, "name": "No campaign", "placed": 2, "connected": 1, "talkSeconds": 90 }],
  "daily": [{ "day": "2026-10-13", "placed": 2, "connected": 1 }]
}
```
A recruiter sees only their own calls (admins see everyone's; `recruiter` narrows). Calls need no campaign, so with none placed
`emptyReason` is `no_activity` even when there are no campaigns. `outcomes` always lists the five outcomes;
failed and in-progress calls count as placed only. `rate`/`avgSeconds` are `null` when nothing was placed/connected (`rate` also
when `small`). Personal reads their own solo calls.

## GET /v1/analytics/pipeline

```json
{
  "thresholds": { "shortlisted": 7, "outreach": 7, "interviewing": 14 },
  "stages": [
    { "id": "shortlisted", "stage": "shortlisted", "step": null, "label": "Shortlisted", "n": 22, "waiting": 4 },
    { "id": "outreach_waiting", "stage": "outreach", "step": "waiting", "label": "Waiting for a reply", "n": 15, "waiting": 6 },
    { "id": "outreach_replied", "stage": "outreach", "step": "replied", "label": "Replied", "n": 5, "waiting": 1 },
    { "id": "interviewing_loop", "stage": "interviewing", "step": "loop", "label": "In the interview loop", "n": 6, "waiting": 1 },
    { "id": "interviewing_offer", "stage": "interviewing", "step": "offer", "label": "Offer stage", "n": 2, "waiting": 0 }
  ],
  "totals": { "inProgress": 50, "waiting": 12, "hired": 9, "passed": 31 },
  "waitingLongest": [
    { "campaignCandidateId": "uuid", "candidateId": "uuid", "campaignId": "uuid", "name": "Asha Verma", "campaign": "Backend",
      "stage": "outreach", "step": "waiting", "days": 19, "pastThreshold": true, "ownerName": "Meera Nair", "mine": false }
  ],
  "velocity": [{ "stage": "shortlisted", "medianDays": 2.1, "n": 30, "prevMedianDays": 2.8 }],
  "timeToHire": { "medianDays": 21, "n": 7 },
  "timeToFirstContact": { "medianDays": 1.5, "n": 24 },
  "conversion": [{ "id": "replied", "label": "Replied", "n": 12, "of": 30, "rate": 0.4, "small": false, "smallN": false }],
  "weakestStep": "interviewing",
  "offers": { "made": 4, "accepted": 3, "notTaken": 1,
              "acceptance": { "n": 3, "of": 4, "rate": null, "small": true, "smallN": true } },
  "sources": [{ "source": "agent", "label": "Found by the agent", "added": 40, "interviewed": 9, "hired": 3 }],
  "forms": { "views": 120, "applications": 18, "added": 11, "passed": 4,
             "conversion": { "n": 18, "of": 120, "rate": 0.15, "small": false, "smallN": false } },
  "passed": null
}
```

- `stages`: only people in progress (hired and passed are in `totals`). `waiting` = past the threshold in `thresholds`.
- `waitingLongest`: up to 8, oldest first, in progress only. For recruiters `ownerName` is their own name or `null` (peers are
  never named); `mine` says which.
- `conversion` = the same neighbour rates as Overview (`kept, reachedOut, replied, interviewing, hired`) over people added in the
  period; `weakestStep` is the id of the lowest rate among those with `small: false`, else `null`.
- `velocity`: median days people spent in a stage (completed stays that ended in the period) against the period before;
  `medianDays` is `null` under 3 stays.
- `passed` is `null` until a pass-reason pick-list exists; hide the block.
- `sources[].source`: `agent | extension | manual | form | referral | import`.

## GET /v1/analytics/campaigns

Extra param `state` (default `active` = active campaigns plus closed ones with activity in the period).

```json
{
  "quietAfterDays": 7,
  "campaigns": [
    { "campaignId": "uuid", "name": "Backend", "status": "active", "clientId": "uuid", "client": "Zeta Works",
      "ownerId": "uuid", "ownerName": "Meera Nair", "target": 5,
      "openedAt": "2026-09-01T04:00:00.000Z", "closedAt": null, "firstHireAt": null, "lastActivityAt": "2026-10-12T09:00:00.000Z",
      "found": 40, "shortlisted": 22, "contacted": 15, "replied": 6, "interviewed": 4, "hired": 2,
      "progress": { "hired": 2, "target": 5, "share": 0.4, "small": true, "smallN": true },
      "daysOpen": 42, "daysToFirstHire": 18, "daysToFill": null, "quiet": false, "quietDays": null, "activeInPeriod": true }
  ],
  "clients": [
    { "clientId": "uuid", "name": "Zeta Works", "campaigns": 3, "active": 2, "hired": 4, "planned": 9,
      "medianDaysToFirstHire": 17, "medianDaysToFirstHireN": 3,
      "replied": { "n": 9, "of": 31, "rate": 0.29, "small": false, "smallN": false } }
  ]
}
```
- `/v1/analytics/projects` keeps returning the same payload (no envelope, all campaigns) until the console is switched.
- `daysToFill` is `null` ("Not filled yet") until hires reach target; `progress.share` never exceeds 1 and `progress.small` is
  true for a target under 5 (say "2 of 3 hired"); `quietDays` is set only when quiet. `client`/`clientId` are `null` for a
  campaign with none. `filledAt` (the day hires reached target, `null` before) is also present.
- `clients` lists only clients that have a campaign in view; `medianDaysToFirstHire` is `null` under 3 campaigns with a hire.

## Errors

`400` bad params, `401` signed out, `403` only for another person's `/recruiters/:userId/weekly` as a recruiter.
A hidden campaign or person reads as empty, never as an error.

## Demo data

`pnpm seed:analytics` in `superhyre-platform/server` (local database only; `--owner=<email>` picks another organisation)
fills `fn3 Talent Partners` with eight weeks of marked rows: 6 campaigns, about 200 people in every stage, emails and
calls per recruiter with different numbers, replies, hires with a source, offers, tasks, two live forms with views and
applications. Running it again replaces only its own rows. API restart is needed for the new routes; the seed needs none.
