# Changelog

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
