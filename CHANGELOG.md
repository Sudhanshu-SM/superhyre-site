# Changelog

## 1.5.5 (2026-10-30)

### Added
- **How many new people each campaign gets a morning** is a field in the Daily search popup, beside the time and the days (the section is now headed "Each morning"). It starts at the server's number and goes up to the ceiling the server says; the line under the list says what Save would spend from the number typed, and Save waits on a number the server would turn down. A change of the number alone saves like a change of the room. Needs the 1.5.5 server and migration 211 first.

## 1.5.4 (2026-10-30)

### Added
- **Every campaign has a client.** The New campaign form asks for it (pick one, or add the company's name); the add-roles intake and the chat's guided questions ask for it every time and no longer offer "No client"; with no client to choose from, the company's name is typed.
- **A Client row in the Requirements dialog.** Choose a client or add a new one by its company name; it saves at once. Approving the requirements waits until the campaign has a client and says so.
- **A quiet "Add client" on the Campaigns list** for a campaign that has none, for the people who can change it. It opens a small picker, and the row then shows the client's name.
- **Sixteen colours for a stage** in a 4 by 4 grid (sky, indigo, plum, pink, red, yellow, lime, mint and brown are new), plus Default; each has light and dark values and is drawn the same on the board's column heads, strip, Overview bars and the Home ring and card. Needs migration 207 and the new server first.
- **A paperclip on the chat composer** for sheets and documents. A sheet of people goes to a People import card: how the columns were read (a dropdown to correct any), who is new and who is already here, why any row was left out, and one button to add them, to Candidates or to the campaign's shortlist (Candidates is always a choice). A sheet link typed in the composer is read and routed like a file. If an import stops half way the card says how far it got and carries on from there; leaving the page stops it. A roles sheet or a job description document keeps going where it went.
- **A "Job description" button in the campaign's header**, beside Requirements, opens a popup: all of the text (it scrolls inside the popup), who added it and when, and Download for the original file. People who may change the campaign get Update, which turns the same popup into paste or upload and, once the new text has been kept, back into the text. Nothing is read until the popup is opened; a draft that was pasted and not saved is kept if the popup is closed by accident.
- **People saved from LinkedIn are put on the campaign's shortlist by themselves**, with no question. Opening a campaign's Shortlisted page, or choosing it on the Candidates page, brings everyone who fits its role (an owner or admin: everyone's; anyone else who may change the campaign: their own), however long the list, and a line says what was done ("Added 5 people saved from LinkedIn (Archi 3, Ravi 2) to BD Executive's shortlist.") with Show who and Dismiss. It asks nothing; only a failure offers Try again.
- **Each message in a chat says when it was sent**, small and quiet: the person's own under their bubble at the right, the agent's under its answer at the left once the answer is whole (not while it is still on its way, not for a failed turn, not for a line the agent said on its own). Today is "11:54 pm", another day "28 Oct, 11:54 pm" (with the year when it is not this one), and the whole date is on hover. Messages in somebody else's chat have it too.
- **The paperclip asks "What are you adding?"** (Candidates, Job description, More roles or Job descriptions, Something to read) before it opens the picker, and each file keeps what it was chosen as, with a caret on its chip to change it. Up to 10 files in a message (5 sheets, 5 to read). A dropped or pasted file is suggested a kind ("Looks like …") with one click to change it, and a file that looks like something else says so in one line and waits. The Add in bulk chip is gone; Connect a Google Sheet is in the menu. A Google Sheet link pasted in the composer is a chip with the same menu.
- **One card for everything added as candidates.** Sheets and resumes attached together are one card: one place they go, one Add, a tick for each sheet and its tabs (a workbook adds its main tab alone; hidden rows and columns are left out and counted, with one tick to read them), and a totals line ("212 people from 3 files. 18 rows joined, because the same person is in more than one file."). It says first what is added and that nothing else in the file is, that people already here are kept as they are, and, for a sheet read with the words typed beside it, "I checked the columns and changed 3", "From your words" ticks with counts and "I couldn't apply …" in the person's own words. A column can be set by hand, including for a sheet that read like roles ("Keep as candidates").
- **Words typed beside a sheet are read once, by its card.** A campaign named as where the people go is preselected. The agent hears only a next step the card could not do (such as starting outreach), and only after the people are added; a bare add makes no extra turn.
- **Resumes.** The Candidates row takes resumes, many at a time; one card lists every person found, ticked unless they cannot be added, with the reason, and a person with no email, phone or LinkedIn link can be given one on their line.
- **A sheet's status column can place people.** One tick on the card, off by default and shown only with a campaign: each of the sheet's words has its own choice, words nobody can place stay on Shared, and hiring and rejecting are two separate unticked boxes that name the people. The done line says what placing did: "3 moved to Interviewing, 2 to Rejected. 2 need your yes because they are on another campaign."
- **A job description picked from the paperclip goes straight to the campaign you have open**, with no chat turn to read it; one dropped on the chat asks "Put it on <campaign>?" first. When it cannot be saved the chat says why and offers Send again.
- **Search history on the Sourced page.** A "Search history" button lists every change to the campaign's search filters and sources (who, when, what it was, what it became) and puts one back with Undo while nothing has changed the same thing since.
- **Daily search.** A "Daily search" button on the Campaigns page (drawn only when the server has it on) opens a popup: the on or paused switch, the morning and the days, a checklist of campaigns with how each stands in plain words, campaigns that cannot be searched yet with why and a link to their requirements, the last mornings, and Pause or Resume for each campaign. Owners and admins also see and can pause other people's. The agent rail shows a whole daily search as one row with Manage, and the bell's daily-search row opens the popup. A watch of the daily search has no end, so the rail, the overview and the agent views no longer assume it has a stop. When the search is suggesting changes (shadow week excepted), the popup lists them across your campaigns, each with what it would change and a Show me that puts it in that campaign's chat as a card, and two plain lines of scoreboard (suggested, made, declined, undone; how they did). After a Save that could not hold every ready campaign the popup says how many are not in it yet and what the daily limit is, and picking more than the limit by hand says how many to take out.

### Changed
- **A campaign's Daily search chat is pinned first in its chats.** In the chat list the Daily search chat of a campaign (selected or pinned) is the first of that campaign's chats, in a faint orange wash with a pin before its name (on the dark theme the wash is made of the lighter orange, a warm dark, not orange over black); in Recents and search it carries its campaign after its name in the same line. Its menu is Rename, Archive and Delete: no Pin, no Add to campaign. Each line the agent says on its own, in this chat or any other, shows when it was said, a task that opens a campaign's chat never opens into this one, and a pinned campaign is no longer lifted by the agent's morning post.
- **The chat list's rows no longer fly across it.** Pressing "N more" under a campaign, pinning a chat or a new chat arriving made rows slide over each other and left gaps. A chat listed under its campaign and again in Recents shared one key, so each was sent to the other's place, and a section and the rows inside it were both moved, twice as far as they went. A row now glides only where it moved, once; a list that is only making room for more rows does not move at all, and a glide that is interrupted carries on from where the row was.
- **The Job description dialog no longer takes several files or a sheet** (the paperclip does that), and its old-Excel message also covers a workbook with a password.
- **Against an older server the paperclip opens the picker at once and a Send goes as it always did**, instead of sending a choice the server would drop (the console asks `GET /v1/agent/capabilities`).
- **The client and the owner stand out on the Campaigns list.** The client's name (beside the campaign's name) is in the brand's warm text colour and the owner's name in the stages' teal, both medium weight, both from tokens that exist in light and dark; the "+1" after an owner stays grey.
- **Recruiters can name a company for a campaign.** Anyone on a campaign can give it a client while it has none, by picking one or typing the company's name; the server adds the company. Changing a client a campaign already has stays with admins and the campaign's owner. The detailed Add client form stays an admin's.
- **A client can no longer be taken off a campaign.** "Remove client from this campaign" is gone.
- **The chat is wider and one size larger.** The transcript column takes more of the window (its cap is 1300px, was 1240px, with smaller side insets and a slimmer chat list), the person's bubble can be wider, and the message, the answer, the thought line, the people cards, the questions and the buttons on cards are one px up; the type tokens are raised for everything in the chat and for nothing outside it.
- **The candidate sheet dialog (Import from sheet, Sync sheet) says what it will do and what it did.** Before the yes it says which tab it reads (the one the link points at, else the first, and what to do when the people are on another), which words in the statuses put people where ("Rejected, 22: the status says rejected (15), not interested (7)"; "no response" is contacted, never rejected), and how many rows are not people and why; a box, on by default, can turn off placing by status so everyone is added as shared and no one is moved. After the yes it accounts for every row: added, already here, repeats of a row above, and the rows that were refused with their number in the sheet and the reason, so a sheet of 50 never quietly becomes 22. What it says scrolls between the heading and the buttons, so the buttons never leave the dialog.
- **The client's name is beside each campaign's name on the Campaigns page**, quietly, and no longer repeated in the line under it.
- **Bigger type on the agent page**: the message box, the question chips, the suggestions under them and the note under the box are one or two sizes larger, with the buttons beside the box taller to match.
- **The card on a task opens from any part of the task**, not only its title: the campaign, the status, the day and the space between. It opens near the pointer, above a dialog too, and gives the time of day with the due day.
- **One loader, in the middle of the window.** The SuperHyre loader on the Sourced page (it showed only a line of text) and on every page while its file arrives sits where the app's start-up loader does and never moves; it stays out of sight for a moment, so a page that arrives at once shows no flash.
- **"Role spec" is "Requirements"** in all the console's words.
- The sentence "This campaign isn't on a team you lead..." is gone: an admin changes every campaign, and the controls that are not someone's are simply not drawn.
- **A search card says "Step 2 of 3" only while a step is going on.** One for a search that had stopped, or that was read back from an earlier day, said "Step 1 of 3".
- **Somebody else's chat, read only, has no Stop** on a run that was still going: the owner or admin reading it could not press it, and it was not theirs to stop.
- **Messages in somebody else's chat have their time for everyone who can read it**, not only for an admin who sees the whole turns (everyone else is sent the words alone, and they were drawn without a time). A time never reads earlier for the answer than for the question when this computer's clock runs ahead of the server's.
- The candidate sheet dialog forgets an unticked "place by status" box with the preview it was for, so Sync now cannot add people without placing them because of an old untick.

## 1.5.3 (2026-10-28)

### Changed
- **Owners and admins see everyone's saved LinkedIn people.** On a campaign's Shortlisted page the line reads "30 people saved from LinkedIn (Archi 30) fit <campaign> and aren't on its shortlist yet", with "Show who" listing each person and whose they are. "Add all" is drawn only for someone who may change that campaign; an admin who is not on it sees the line, the list and why.

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
