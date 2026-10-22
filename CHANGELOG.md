# Changelog

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
