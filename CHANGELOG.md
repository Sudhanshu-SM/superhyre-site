# Changelog

## 1.5.2 (2026-10-28)

### Added
- **People you saved from LinkedIn are offered to the campaign they fit.** The Chrome extension saves people to Candidates and shortlists them onto a campaign only when one is picked in it. On a campaign's Shortlisted page a line says "N people you saved from LinkedIn fit <campaign> and aren't on its shortlist yet", with one press to add them (as extension captures) and "Not now". It is not drawn for someone who only follows the campaign, or when there is nobody.

## 1.5.1 (2026-10-28)

Fixes the Pipeline board, the Overview funnel and every stage label that 1.5.0 stretched, and a round of smaller things.

### Fixed
- **Stage labels stretched to the height of the screen.** The shared chat's stylesheet in 1.5.0 defined a global `.sc`, which the stage-coloured words (`<span class="sc" data-sc>`) also use. The Pipeline columns showed their cards below the fold, the Overview funnel lost its bars and the Shortlisted table's status cell grew. The shared chat's classes are `shc-*` now, and `cssClassClash.test.ts` fails when two stylesheets define the same plain class.
- The Pipeline's columns: four share the row, five share it too (never narrower than 240px), fewer than four never grow past the four-wide size, and more than five scroll sideways.

- **A hired person's email and phone showed "On file" instead of the address.** The candidate list leaves out the hired, and the Shortlisted table reads its values from it; it now reads the Hired stage too.

### Added
- **Select all** beside "Get contact details" picks everyone listed on every page, and the menu's choices say what they get: "Get all emails", "Get all phone numbers", "Get everything (emails and phones)".
- Where searches look starts on **External only** (the chip lists it first); a campaign that chose something else keeps it.
- Owners and admins see every chat in the organisation in the chat list; opened, it shows the chat's cards as they were, for reading only.
- The campaign pill is bigger and sits on the "Superhyre Agent" heading's line, and the campaign list names each campaign's client.
- Where the filters and "where to look" would be, a person who only follows a campaign reads why they are not there.
- The Sourced page with nobody found has a proper empty state (no spec, a spec to approve, a search not started, one going, one that found no one).
- A card opens when someone rests on a task on Home: the whole title read as steps, for whom, added by, when it is due, the campaign and where it stands.

## 1.5.0 (2026-10-27)

### Added
- **Teams page as a grid of cards** under hairline dividers: a square picture (or initials), the name, the role, the email, the teams, and "N campaigns · Joined date". Search appears once there are more than eight people or invitations.
- **Every invitation shows its state** as a tag: Sent, Delivered, Bounced, Not sent, Expired, Accepted. Accepted fades from the list after three days, expired after two weeks. A bounced, unsent or expired invitation has a "Send again" button; the menu copies a fresh link or cancels the invitation.
- **Choose where a campaign searches**: "DB only", "DB + external" or "External only", from a compact list on the composer; the docked menu is grouped under "Search in" and "Add in bulk".
- **Read a teammate's chat about a campaign** from the chat list, read only.
- The campaign you are in appears first in the chat list ("Selected") with its chats, and Recents lists every chat.

### Changed
- The Lead and Member labels on a team, and "You", are tags.
- The bulk-add rows and their hints are shorter.

### Fixed
- The campaign switcher closed itself when you scrolled its own list.

## 1.4.1 (2026-10-25)

### Added
- **Delete a chat** from its menu in the chat list: red, apart from the other rows, and it asks once more ("Keep it" is where focus starts). Deleting the chat that is open starts a fresh one. The question says that chats nobody has written in for 60 days are deleted on their own, and that a pinned chat is kept.

### Changed
- **The chat list keeps the page's white ground** and carries the brand orange in small things: its headings (Last 7 days, Pinned, Recents), the icon of the row you point at, and a light peach under a hovered or open row.
- **Job description and Filters are no longer on every composer.** In a campaign's chat they are not shown (they are the campaign's set-up, in the header's "What the agent knows" and on each sourcing card). In a chat about no campaign the job description shows from the start and Filters once there is a brief (words, a description, or filters already set). The docked menu follows the same rule and holds only "Add in bulk" in a campaign's chat.

### Fixed
- **The New chat, Search and Campaigns rows ran 15px past the right edge of the chat list**: the open search field's own width stretched their column. They now hold to the list's width, open or closed.
- **The chat list floating open (list hidden, pointer on its button) was painted under the message box**, which covered the first letters of its rows on a narrow window. It now sits above the conversation, and under menus and dialogs.
- **The header on the landing cut the top off the watermark behind the heading** with an opaque band; it only gets a ground once there is a conversation. With the list hidden, the header's chip no longer runs under the list's button on a narrow window.

## 1.4.0 (2026-10-25)

### Added
- **Claude-style chat list on the Agent page** (right side): New chat, Search, Campaigns, then Pinned (chats and campaigns, the most active first) and Recents with "View more". Pinned shows only when something is pinned; a pinned campaign opens folded, with its chats under it. A row's menu pins, renames, adds to a campaign (with a search) or archives. The list hides and peeks with the toggle or Ctrl/⌘B, and rows glide to their new place.
- **Campaigns page**: a search bar over a grid of blocks. Pressing one starts a chat in that campaign, so the agent has its brief, people and tasks from the first message.
- **The rail's top block** shows the week (Found, Replies, Interviews) for the campaign in the chat, and Owner and Collaborators, which can be added from there.
- **"Add in bulk"** beside the message box: roles into campaigns from a CSV, Excel file or Google Sheet (with a "Left out" note naming each skipped row), or, in a campaign, candidates from a sheet.
- **Company sheets**: connect a running role's sheet from the campaign header ("Import from sheet", then "Sync sheet"); Home suggests it once, when active campaigns have nobody in them yet.
- **Task progress**: a task shows "In progress" and "3/72" as people are reviewed, and tasks refresh when someone is shortlisted or passed. A pasted list makes one task each; the Home add-task takes plain words ("Dev to send the BD list by Monday") and forgives a misspelt teammate.
- **In chat sourcing the first person is opened for you** with the profile sliding in beside the chat; the Sourced page does the same.
- **Clients** moved into the profile menu. "Load full career" on a profile's Experience. Campaign headers show client and role title.

### Changed
- The agent's sparkle beside every reply is gone; the chat has the whole width.
- Shortlist and Reject on a decided person are shown as disabled, with the reason on hover, because the server has no undo (use the Pipeline to move someone). A press on one says so.

### Fixed
- **Sourced page:** the profile's cross closed nothing and "Score the rest" looked dead. The profile stays closed once closed, and scoring shows "Reading N…", refreshes the list as people are read and says when everyone has been.
- Home add-task text used a serif font; it uses the console's.

## 1.3.0 (2026-10-23)

### Added
- **Page size you can change** on Candidates, Campaigns, Clients, Shortlisted, Outreach and Calls: "Per page" next to the range, Auto (fits the window) or a fixed size that suits how many there are. 25, 50 and 100 always; 500 once there are more than 500; 1,000 once there are more than 1,000 (266 people: pages of at most 100). Remembered per list.
- **Who added a candidate, and when**, as a quiet line under the name ("Added by Ravi · 3d ago"; "Applied via form" for form applicants), and an **Added by** filter. For the organisation's owner and admins.
- **Review N matches** (and the Pipeline's empty board) open the people found for review in the ranked list, straight from the campaign.

### Changed
- **Support is a section of Settings** (Profile, Organisation, Connections, Support), no longer a row in the sidebar. The old `#/support` link, quick find and the tour land on it there.
- **Connections** shows what works first and what is coming (Slack, Notion, WhatsApp) together under "Coming soon", so the two no longer read as one list.
- **The collapsed sidebar on a short window** scrolls its list instead of stacking icons over the foot, with smaller icons and tighter rows (campaign pages included) below 780px tall.

### Fixed
- **Candidate filters:** applying one no longer empties the others (Location vanished after "Has phone"), and a blank place no longer shows as an empty chip.

## 1.2.0 (2026-10-23)

### Fixed
- **Add a task with a date.** With "Pick a date" chosen, Enter did nothing (a form with two fields and no submit button does not submit). The "↵" is a real button now.
- **"Review N matches" opens that campaign's own chat**, not the last chat you had open. A task, a link or "ask the agent" from a campaign opens the latest chat about it, or a fresh one that is about it from the first message. A message that waits to be sent goes out only once that chat is open.
- **A wall of "Not scored yet" is one line.** The ranked list says once how many people haven't been read closely, with a "Score the rest" button (or "Scoring now" while a run is going), instead of a sentence on every row.
- **Importing roles from a sheet:** a read that runs out of time says nothing was changed (it used to say "it may have gone through"), is tried again on its own for a busy moment, and a role that cannot be read steps aside to the end instead of blocking the rest. A batch of six or more says what to expect.

### Changed
- **A search that comes back short, or runs dry, asks what to do next** with buttons (add a nearby city, keep watching and add new people, change the city), instead of "no more people to show".

## 1.1.1 (2026-10-23)

### Fixed
- **A page cached or left open across a deploy no longer breaks.** Each deploy used to delete the previous build's files, and browsers keep `index.html` for ten minutes (and tabs stay open for days), so a returning person could land on a blank page or a screen that would not open. The deploy now keeps the last three builds' files, and the app reloads itself once onto the current build if a screen's file is still missing (never twice within a minute).

## 1.1.0 (2026-10-23)

### Added
- **Campaigns:** tabs are Active (the default), Closed, All and Archived; a closed campaign can be archived, brought back and deleted from its menu (Delete asks for the campaign's name).
- **New campaign starts from the job description:** drop or pick several files (PDF, Word, text, Excel, CSV), paste one, or give a Google Sheet's link. Each is read for what it states and only what it leaves out is asked, one question at a time (skippable; an answer can stand for the rest). The long form is still there under "Fill in the details yourself".
- **Through the agent:** the Job description dialog takes several files, a spreadsheet or a Google Sheet link; several JDs attached in the composer, a spreadsheet dropped there, or a Sheet link typed in the message open the import card by themselves.
- **One role spec at a time after a bulk add:** approve each (Previous / Next role under the card), searches run in the background, one line per role says where it stands.
- **Your Google Calendar events on Coming up** (Home and the chat), with a quiet link to add Google Calendar when it is not linked.
- **New chat** is always in History (it was hidden until a chat had messages).

### Fixed
- Dialog spacing: the delete confirmation and the add-roles card line up with the dialog's margins; archived rows keep their figures.
