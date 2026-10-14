# SuperHyre sign-up storyboard (art v3)

Replaces the engraving direction (v2) and the clay set. The reference is the sign-in art
(`superhyre-site/assets/access-art.webp`): a warm, flat editorial illustration of a desk seen
from above, a device showing SuperHyre, candidate cards with simple avatars, dashed orange
connectors, peach and sand light. Set-up continues that same picture, so signing in and
setting up feel like one story.

## The story: your first morning with SuperHyre

Same desk, same plant, same mug in every frame; only what's on the screen and the desk
changes. Each frame fills the left panel of the sign-in frame for its chapter. No hands,
no drawings, nothing awkward: the desk and the work tell it.

| Frame | Chapter / state | What's on the desk | Caption card under it |
|---|---|---|---|
| F1 | I. Hello | The tablet lies on the desk showing a welcome card with one empty name line outlined in orange; coffee steaming | Every search starts with a hello. |
| F2 | II. Reading your website | A laptop shows a company website; a soft orange band sweeps across it; four small cards float out on dashed lines: a logo tile, three colour chips, a type tile, a briefcase card | We read your public site, nothing else. |
| F3 | II. What we learned | The website has become one company card in the middle; three note cards are pinned around it on dashed lines, one with an orange tick | Facts you can fix, each with its source. |
| F4 | II. Your team | Seen from above: a round meeting table with four chairs, an orange mug at one seat, a notepad | Who you hire for, and your part in it. |
| F5 | III. First role | The tablet shows a job card (title bars, a location pin, a briefcase); candidate cards wait faintly behind it | One role to start with. |
| F6 | IV. Your look | A printed job post with an orange header band, colour chips beside it, and a round stamp with a tick lifting off the page | Your job posts and forms, in your colours. |
| F7 | V. First steps | Three folders with orange tabs fanned on the desk; one paper plane leaving toward the tablet on a dashed trail | Pick one and the agent gets going. |
| F8 | Welcome (first landing) | The tablet shows the SuperHyre dashboard with the first candidate cards rising off it, one highlighted in orange | You're set up. |
| F9 | Your team is already here | An office door ajar with warm light; inside, a glimpse of desks and a candidate board | Ask to join; an admin lets you in. |
| F10 | Waiting for approval | A cosy armchair and side table with coffee; the tablet on the chair shows a progress card | Your personal workspace is ready meanwhile. |
| F11 | We couldn't read the site | The laptop shows a blank page and a small card with an unplugged cable; a calm cup of tea | Try another link, or tell us yourself. |
| F12 | Setting up your workspace | A tiny office assembling on the desk: little desks, chairs and a plant clicking into place | A few seconds. |

F1 to F8 are the sign-up path (generate first). F9 to F12 are the side paths.

## The rest of the app, in the same world

Every place in the console that needs art, checked against today's components. One world
(the warm desk), framed differently per family so nothing repeats:

| Family | Framing | Motion in the app |
|---|---|---|
| Sign-up storyboard (F) | top-down desk, portrait, the left panel of the sign-in frame | crossfade between chapters |
| Empty states (E) | close-up still life of one object, fading to white | settles in once (a short rise and fade) |
| Home workflows (W) | the result you'll get, as a card floating above the desk | lifts on hover |
| Success moments (X) | caught mid-motion at a low angle, one orange highlight | a small pop when it appears |
| Working states (I) | layered shapes, so the layers can drift separately | slow parallax while the work runs |
| System states (Y) | minimal, quiet, mostly white | none |
| Candidate pages (G) | the applicant's own desk at dusk, no SuperHyre branding | none (the employer's colour tints the band) |
| Settings (D), placeholders (B) | one simple object | settles in once |
| Email and link previews (H) | landscape, room for a title | static |

Every object appears once; the tablet is the one recurring object, because it's the product.

### Every asset

76 images (P1: 12, P2: 49, P3: 15). The prompt file is generated from the same list.

| ID | File | Family | Where it's used | Copy beside it | Size | Priority |
|---|---|---|---|---|---|---|
| F1 | `hello` | Sign-up storyboard | Set-up, I. Hello (left panel) | Every search starts with a hello. | 1024x1536 | P1 |
| F2 | `reading-site` | Sign-up storyboard | Set-up, II. Reading your website | We read your public site, nothing else. | 1024x1536 | P1 |
| F3 | `learned` | Sign-up storyboard | Set-up, II. What we learned | Facts you can fix, each with its source. | 1024x1536 | P1 |
| F4 | `team-table` | Sign-up storyboard | Set-up, II. Your team | Who you hire for, and your part in it. | 1024x1536 | P1 |
| F5 | `first-role` | Sign-up storyboard | Set-up, III. First role | One role to start with. | 1024x1536 | P1 |
| F6 | `your-look` | Sign-up storyboard | Set-up, IV. Your look | Your job posts and forms, in your colours. | 1024x1536 | P1 |
| F7 | `first-steps` | Sign-up storyboard | Set-up, V. First steps | Pick one and the agent gets going. | 1024x1536 | P1 |
| F8 | `welcome` | Sign-up storyboard | Set-up done, first landing | You're set up. | 1024x1536 | P1 |
| F9 | `door-ajar` | Sign-up storyboard | Your team is already on SuperHyre (join request) | Ask to join; an admin lets you in. | 1024x1536 | P1 |
| F10 | `armchair` | Sign-up storyboard | Waiting for approval | Your personal workspace is ready meanwhile. | 1024x1536 | P1 |
| F11 | `unplugged` | Sign-up storyboard | We couldn't read the website | Try another link, or tell us yourself. | 1024x1536 | P1 |
| F12 | `assembling` | Sign-up storyboard | Setting up your workspace | A few seconds. | 1024x1536 | P1 |
| F13 | `work-email` | Sign-up storyboard | Please use your work email (personal address) | Use your work email. | 1024x1536 | P2 |
| F14 | `invite-expired` | Sign-up storyboard | This invite has expired | Ask for a new one. | 1024x1536 | P2 |
| E1 | `blank-board` | Empty state | Campaigns page, no campaigns yet (admin) | No campaigns yet. Start one for a role you're hiring for. | 1600x1200 | P2 |
| E2 | `empty-tray` | Empty state | Campaigns page, recruiter not on any yet | You're not on any campaigns yet. An admin adds you. | 1600x1200 | P2 |
| E3 | `empty-columns` | Empty state | Campaign pipeline, nobody on the board | No one here yet. | 1600x1200 | P2 |
| E4 | `velvet-box` | Empty state | Shortlisted page, empty | Nothing shortlisted yet. | 1600x1200 | P2 |
| E5 | `card-stack-blank` | Empty state | Candidates page, no candidates yet | Your candidates will gather here. | 1600x1200 | P2 |
| E6 | `binoculars` | Empty state | Any search or filter with no matches | No one matches. Try fewer filters. | 1600x1200 | P2 |
| E7 | `business-cards` | Empty state | Clients page, no clients yet | No clients yet. | 1600x1200 | P2 |
| E8 | `card-stand` | Empty state | Client detail, no campaigns for this client | No campaigns for this client yet. | 1600x1200 | P3 |
| E9 | `blank-form` | Empty state | Forms tab, no forms yet | No forms yet. Make a short screening form. | 1600x1200 | P2 |
| E10 | `mailbox-waiting` | Empty state | Responses, form live but no answers yet | No responses yet. Answers appear here as people apply. | 1600x1200 | P2 |
| E11 | `form-unpublished` | Empty state | Responses, no form live | No form is live. Publish one to start collecting answers. | 1600x1200 | P3 |
| E12 | `phone-quiet` | Empty state | Calls page, none yet | No calls yet. | 1600x1200 | P3 |
| E13 | `clear-desk` | Empty state | Home, My tasks all done | You're all caught up. | 1600x1200 | P2 |
| E14 | `notebook-open` | Empty state | Campaign activity log, nothing yet | Nothing yet. Activity shows up as people move. | 1200x900 | P3 |
| E15 | `sleeping-tablet` | Empty state | Agents rail, nothing running | No agents running. Ask for a search and one starts here. | 1600x1200 | P2 |
| E16 | `agent-ready` | Empty state | Agent page, new chat landing | What are we hiring for today? | 1600x1200 | P2 |
| E17 | `bell-quiet` | Empty state | Notifications, none | No notifications. We'll tell you when something needs you. | 1200x900 | P3 |
| E18 | `letters-tied` | Empty state | Chat history, no past chats | Your past chats will be listed here. | 1200x900 | P3 |
| E19 | `blueprint` | Empty state | Campaign overview before the brief is done | Nothing to track until the brief is done. | 1600x1200 | P2 |
| E20 | `own-desk` | Empty state | Personal workspace, first visit | Your personal workspace. Only you can see what you keep here. | 1600x1200 | P2 |
| E21 | `extension-piece` | Empty state | Integrations, extension not used yet | Bring people in from LinkedIn. | 1600x1200 | P2 |
| E22 | `easel` | Empty state | No campaign selected | No campaign selected. Choose one in the sidebar. | 1600x1200 | P2 |
| E23 | `chart-empty` | Empty state | Analytics pages before there's data | Numbers show up here once your team starts working. | 1600x1200 | P3 |
| W1 | `talent-map` | Home workflow | Workflow card: Talent map | Map where this talent works today | 1600x1200 | P2 |
| W2 | `jd-from-notes` | Home workflow | Workflow card: Job description from notes | Turn your notes into a job description | 1600x1200 | P2 |
| W3 | `find-people` | Home workflow | Workflow card: Find people for a role | Find people for {role} | 1600x1200 | P2 |
| W4 | `salary-range` | Home workflow | Workflow card: Salary benchmark | Check what the role pays | 1600x1200 | P2 |
| W5 | `comparison` | Home workflow | Workflow card: Employer comparison | See how your offer compares | 1600x1200 | P2 |
| W6 | `form-from-jd` | Home workflow | Workflow card: Application form from a job description | Make the application form | 1600x1200 | P2 |
| W7 | `shortlist-page` | Home workflow | Workflow card: Client shortlist page | Share a shortlist with your client | 1600x1200 | P2 |
| W8 | `weekly-update` | Home workflow | Workflow card: Weekly client update | Send clients a weekly update | 1600x1200 | P2 |
| W9 | `keep-sourcing` | Home workflow | Workflow card: Keep sourcing | Keep looking for {role} | 1600x1200 | P2 |
| X1 | `campaign-launch` | Success moment | Campaign created | Campaign created. The agent can start looking whenever you are. | 1200x1200 | P2 |
| X2 | `hired` | Success moment | Candidate hired | {Name} is hired. | 1200x1200 | P2 |
| X3 | `form-live` | Success moment | Form published | Your form is live. Share the link or send it with outreach. | 1200x1200 | P2 |
| X4 | `messages-sent` | Success moment | Outreach sent | {N} messages sent. Replies will show up here. | 1200x1200 | P2 |
| X5 | `export-ready` | Success moment | Export ready | Your export is ready. | 1200x1200 | P3 |
| X6 | `watch-done` | Success moment | Keep-sourcing watch finished | Done: found the {N} people you asked for. | 1200x1200 | P2 |
| Y1 | `signpost` | System state | Page not found | This page doesn't exist. Head back home. | 1200x1200 | P2 |
| Y2 | `coffee-spill` | System state | Something went wrong | Something went wrong on our side. Your work is saved. | 1200x1200 | P2 |
| Y3 | `no-signal` | System state | You're offline | You're offline. We'll catch up when you're back. | 1200x1200 | P2 |
| Y4 | `queue-cups` | System state | The agent is at capacity | The agent is busy. It picks this up at {time}. | 1200x1200 | P3 |
| Y5 | `lockbox` | System state | Only admins can open this / not on this campaign | Only admins can open this. | 1200x1200 | P2 |
| Y6 | `toolbox` | System state | Planned maintenance | Back shortly. Everything you saved is safe. | 1200x1200 | P3 |
| I1 | `sourcing` | Working state | First search running | Searching for {role} | 1200x1200 | P2 |
| I2 | `matching` | Working state | Judging candidates against the role | Checking each person against the role | 1200x1200 | P2 |
| I3 | `reading-file` | Working state | Reading a job description or CV upload | Reading your file | 1200x1200 | P2 |
| G1 | `apply-band` | Candidate page | Application page header band (tinted to the employer's colour) | (the role title sits below) | 3200x1000 | P2 |
| G2 | `apply-sent` | Candidate page | Application sent | Thanks, your application is in. | 1600x1200 | P2 |
| G3 | `apply-closed` | Candidate page | Application form closed | This form is closed. Thank you for your interest. | 1600x1200 | P2 |
| G4 | `apply-code` | Candidate page | Applicant: check your inbox for the code | We sent a 6-digit code to your email. | 1600x1200 | P2 | (dropped 13 Oct 2026: no code step)
| D1 | `seats` | Settings | Members, only you so far | Invite your team. | 1200x1200 | P2 |
| D2 | `mail-connect` | Settings | Connect Gmail | Connect Gmail to send from your own address. | 1200x1200 | P2 |
| D3 | `reconnect` | Settings | A connection needs reconnecting | Gmail needs reconnecting. | 1200x1200 | P3 |
| D4 | `sheet-connect` | Settings | Export to Google Sheets | Connect Google to export straight to a sheet. | 1200x1200 | P3 |
| B1 | `news` | Placeholder | Home insights (market news, coming) | Market news is on its way. | 1600x900 | P2 |
| B2 | `support` | Placeholder | Support page | Support is on its way. Write to us meanwhile. | 1600x900 | P3 |
| B3 | `coming-later` | Placeholder | Settings, connectors coming later | Coming later. | 1600x900 | P3 |
| H1 | `email-invite` | Email / link preview | Invite email header |  | 1200x400 | P2 |
| H2 | `email-digest` | Email / link preview | Weekly digest email header |  | 1200x400 | P3 |
| H3 | `og-default` | Email / link preview | Link preview for superhyre.com and app links |  | 1200x630 | P2 |
| H4 | `og-apply` | Email / link preview | Link preview for an application form |  | 1200x630 | P2 |

## How they're used

- Each frame is the left panel's background, exactly like the sign-in art: covered,
  focused a little above the middle, with the peach scrim over its top and bottom.
- Keep the top third and the bottom sixth calm: the wordmark and chapter title sit at the
  top, the caption card at the bottom.
- Frames crossfade between chapters (one deliberate motion per screen); with reduced motion
  they simply swap.
- Delivery: 1024×1536 PNG or WebP. I make the WebP/PNG pair and wire each one in.
