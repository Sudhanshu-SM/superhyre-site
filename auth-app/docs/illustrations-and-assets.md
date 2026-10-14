# SuperHyre illustration and asset system

Status: **plan, ready for generation** (4 Oct 2026). Fills the empty slot in `DESIGN.md` §5.7.
Reference mood: the soft clay "Nothing shortlisted yet" scene (calm 3D figure, chalky monochrome objects, a dashed placeholder frame, one thought bubble, small props). We keep the feeling and make it ours: **light canvas, warm neutrals, one terracotta accent, our own cast and motifs.**

---

## 1. Why and where illustrations earn their place

DESIGN.md is strict: text is the interface, colour is scarce, nothing decorative pretends to be data. Illustrations are allowed only where a screen has **no data yet, cannot show data, or marks a moment**. They never sit beside live numbers, never inside tables, and never in the chat stream except at milestones.

Rules the whole set follows:
1. **One illustration per screen, at most.** It is the Tier 0 hero of an empty screen (DESIGN.md §4.3) and disappears the moment data arrives.
2. **Always paired with real copy:** a headline that names the state and a sentence that names what fills it and how. The picture never carries meaning alone (`aria-hidden`, copy does the work).
3. **One accent per image, plus Hyre.** Exactly one object in terracotta; Hyre's glowing seam is the only allowed second touch (it is part of the character). Everything else is warm ivory, bone and greige. Sage appears only as plant leaves.
4. **No text, logos, UI screenshots or numbers inside images.** Copy is set in HTML so it can be translated, read by screen readers, and kept honest.
5. **Light canvas.** Assets are transparent PNG / WebP and are judged on pure white (`#FFFFFF`, our canvas since revision 29).

---

## 2. The visual language

### 2.1 Material and render

- **Soft matte clay / bisque porcelain:** satin, never glossy; rounded edges (2–4 % bevel); a faint **chalk-dust grain** on surfaces (like the reference); very light subsurface warmth so edges glow slightly in the light.
- **Lighting:** one large soft key light from top-left (≈ 45°), a soft fill from the right, gentle ambient occlusion in creases. No hard specular highlights, no rim neon.
- **Ground:** no floor plane. A **soft contact shadow** under the group: a wide, blurred ellipse in warm grey at 10–14 % opacity, fading to transparent. Optional faint chalk "dust" halo at the shadow edge (the reference's signature), kept extremely subtle.
- **Camera:** three-quarter view from slightly above (≈ 15° down), long lens feel (little perspective distortion), subject centred with generous empty margin.

### 2.2 Palette (from the design tokens)

| Role | Colour | Use |
|---|---|---|
| Ivory (main object surface) | `#F4F1EC` | most props, cards, frames |
| Bone (second surface) | `#EAE5DD` | stacked items, back layers |
| Greige (third surface) | `#D9D3CA` | bases, plinths, clothing neutrals |
| Warm grey (shadow / line) | `#B8B0A6` | dashed lines, creases, contact shadow |
| Charcoal (deep neutral) | `#3A3632` | hair, shoes, small dark details only |
| **Terracotta accent (one object)** | `#E0602A` lit, `#C87248` shaded | the single meaningful object (the thing the state is about) |
| Sage (plants only) | `#A7B79A` muted | leaves of the small plant |
| Skin | natural South Asian range, warm, softly rendered | characters |

Never: pure black, pure white highlights, blue, purple, neon, gradients behind the subject, coloured backgrounds.

### 2.3 The cast (keep consistent across every image)

| Name (internal) | Who | Look |
|---|---|---|
| **Tara** | recruiter, late 20s, South Asian woman | shoulder-length wavy dark hair tucked behind one ear, small gold stud earring, oatmeal knit sweater with pushed-up sleeves, sage-grey relaxed trousers, white low sneakers |
| **Kabir** | recruiter, late 20s, South Asian man | short textured dark hair, light stubble, greige overshirt over a white tee, charcoal chinos, white sneakers with a thin grey stripe |
| **Meera** | admin / team lead, mid 40s, South Asian woman | silver-streaked hair in a low bun, round thin-rimmed glasses, ivory kurta-length top under a greige long cardigan, slim charcoal trousers, flat shoes |
| **Hyre** | the agent | a smooth floating **pebble**, about one third of a head in size, ivory matte, with SuperHyre's 2×4 staircase mark softly **debossed** on its face; a thin seam around its middle that **glows warm terracotta** when it is working. No face, no eyes, no limbs. It hovers at shoulder height with its own tiny shadow. State is shown only by the glow (off, soft, bright) and by 2–3 tiny orbiting dots when thinking |

Characters are stylised (Pixar-adjacent proportions: slightly larger heads, soft rounded hands), calm and competent, never goofy, never crying, never sweating. Expressions: thoughtful, focused, quietly pleased. Hyre is never a robot, never a face, never a sparkle cliché.

### 2.4 Shared motifs (our visual vocabulary)

| Motif | Meaning | Look |
|---|---|---|
| **The dashed slot** | "something will go here" | a rounded rectangle drawn with soft warm-grey dashes on a clay board, like the reference's dashed frame |
| **Candidate card** | a person in the pipeline | a small ivory rounded card with an empty circle (avatar) and three soft raised lines (no text) |
| **Staircase mark** | SuperHyre / the agent | the 2×4 staircase as a small embossed shape, used sparingly |
| **Paper plane** | outreach sent | folded ivory paper plane, crisp folds |
| **Clipboard / form sheet** | forms, screening | clay clipboard with a sheet of soft raised lines and round tick bubbles |
| **Ring funnel** | pipeline / funnel | three stacked clay rings narrowing downward |
| **Handset** | calls | a soft rounded phone handset or headset |
| **Calendar block** | scheduling | a chunky square clay calendar with a ring binding |
| **Sheet tile** | exports | a small ivory grid tile (spreadsheet cells as raised squares) |
| **Seal** | done / success | a round clay seal stamp with a raised tick, in terracotta when it is the accent |
| **Plant + books** | calm, human workspace | small potted plant (sage leaves) on two or three stacked bone-coloured books, as in the reference |

### 2.5 State language (each family looks different at a glance)

| Family | Composition rule | Hyre | Accent object |
|---|---|---|---|
| **Empty, nothing yet** | a character beside an **empty dashed slot**, relaxed and ready | dim or absent | the object that will fill the slot (e.g. one card) |
| **No results (filtered)** | a **magnifier** over a dashed slot with a few cards drifting just outside it | absent | the magnifier ring |
| **Waiting / pending** | a character **seated**, an object half-arrived (a card on its way, an envelope in flight) | soft glow | the arriving object |
| **Working / in progress** | Hyre **active** with orbiting dots, cards gently assembling | bright glow | Hyre's seam |
| **Done / success** | the dashed slot is now **solid and filled**, a **seal** with a tick, 4–6 small paper flecks | soft glow | the seal |
| **Coming later (placeholder)** | a **ghosted object drawn in dashed chalk lines** on a small plinth, a character sketching it with a chalk stick | absent | the chalk stick tip |
| **Blocked / needs access** | a closed **folder or door with a soft padlock tag**, character holding a key | absent | the key's bow |
| **Something went wrong** | a calm, **slightly misaligned** object (a card tilted off its stack, an unplugged soft cable), character inspecting it | dim | the loose plug |

---

## 3. Asset list (every place, with the copy that sits under it)

Format per asset: **ID · file · where · canvas · scene · accent · copy · alt**. Canvas sizes: `hero` = 4:3, exported 2400×1800 (shown at 360–480 px wide); `spot` = 1:1, 1200×1200 (shown at 96–160 px); `band` = 16:5, 3200×1000 (headers); `og` = 1200×630 (fixed). Copy follows our writing rules: plain, human, no em dashes.

### A. Empty states, core screens

**A1 · `empty-campaigns-admin` · Campaigns page, no campaigns (admin) (`CampaignsPage.tsx:161`) · hero**
Scene: Meera stands beside a tall clay board holding one large **dashed slot**; she is pinning the first **terracotta index card** into its top corner. A plant on books at the board's foot.
Accent: the index card. Copy: **"No campaigns yet"** · "Start one for a role you're hiring for, and the agent can begin finding people." · button *New campaign*. Alt: none (decorative).

**A2 · `empty-campaigns-recruiter` · Campaigns page, recruiter not assigned (`CampaignsPage.tsx:162`) · hero**
Scene: Kabir sits on a low cushion with a closed laptop on his knees, looking toward an **empty dashed slot** on the wall where a card would hang; a single **terracotta pin** waits in the slot's corner.
Accent: the pin. Copy: **"You're not on any campaigns yet"** · "An admin adds you to a campaign, and it shows up here."

**A3 · `empty-pipeline` · Campaign pipeline board, no one yet (`CampaignWorkspace.tsx:865`) · hero**
Scene: three short **empty dashed columns** side by side (like a board), Tara kneeling at the first column placing **one terracotta candidate card** into it.
Accent: that card. Copy: **"No one here yet"** · "Shortlist people from Candidates or let the agent run a search, and they land on this board."

**A4 · `empty-shortlist` · Shortlisted page, empty · hero**
Scene (closest to the reference, made ours): a tall clay **clipboard** with a dashed slot; inside the slot a small embossed **staircase mark with three rays**; Kabir sits cross-legged beside it, chin in hand, a **thought bubble** above him holding a tiny **terracotta star**; plant on books on the right.
Accent: the star in the bubble. Copy: **"Nothing shortlisted yet"** · "Shortlist people from a search or the pipeline to compare them here."

**A5 · `empty-candidates` · Candidates page, workspace has no candidates · hero**
Scene: a neat stack of **blank candidate cards** fanned on a plinth, the top one lifting off and turning toward Tara, who holds a **terracotta Chrome-extension-like puzzle piece** (abstract, not the Chrome logo).
Accent: the puzzle piece. Copy: **"Your candidates will gather here"** · "Save people from LinkedIn with the extension, add them by hand, or let the agent source them."

**A6 · `no-results` · any filtered list or search with no matches (Contacts, Clients, Campaigns search, RankedMatches) · spot**
Scene: a clay **magnifier** leaning on an empty dashed slot; two candidate cards drift just outside the slot's edge.
Accent: magnifier ring. Copy (varies by page): **"No one matches"** · "Try fewer filters or a different word." · *Clear filters*.

**A7 · `empty-clients` · Clients page, no clients (`Clients.tsx:185`) · hero**
Scene: Meera at a small standing desk sliding a **terracotta business card** into an empty dashed card holder; a second, empty holder beside it.
Accent: business card. Copy: **"No clients yet"** · "Add the companies you hire for, so each campaign knows who it's for."

**A8 · `empty-client-campaigns` · Client detail, no campaigns (`Clients.tsx:414`) · spot**
Scene: a closed ivory folder with a **terracotta tab** and a dashed outline where papers would be.
Accent: the tab. Copy: **"No campaigns for this client yet"**.

**A9 · `empty-forms` · Forms tab, no forms (`CampaignForms.tsx:119`) · hero**
Scene: a clay **clipboard** with a form sheet: three rows of raised lines with round tick bubbles, all empty; Tara holds a **terracotta pencil** about to write the first question.
Accent: pencil. Copy: **"No forms yet"** · "Make a short screening form and send it with your outreach. Answers land on each candidate."

**A10 · `empty-responses-waiting` · Responses, form live but no answers (`FormResponses.tsx:67`) · hero**
Scene: a **terracotta paper plane** mid-flight leaving a clipboard, a dotted path behind it; Kabir seated, watching it go with a mug.
Accent: paper plane. Copy: **"No responses yet"** · "Answers appear here as people fill in the form."

**A11 · `empty-responses-no-form` · Responses, no form live (`FormResponses.tsx:74`, `Moments.tsx:893`) · spot**
Scene: a clipboard with its sheet still **ghosted in dashed lines**, a small **terracotta "publish" toggle** knob on its clip.
Accent: toggle. Copy: **"No form is live"** · "Publish one from its builder to start collecting answers."

**A12 · `empty-calls` · Calls page, none yet (`CallsPage.tsx:121`) · hero**
Scene: a clay **headset** resting on a stack of candidate cards; a soft **terracotta handset** cord curls toward an empty dashed slot (a waveform shape drawn in dashes).
Accent: the handset. Copy: **"No calls yet"** · "Calls from the dialer show up here with recordings and transcripts."

**A13 · `empty-tasks-clear` · Home "My tasks", all done · spot**
Scene: a short stack of three **ticked cards** squared neatly, a **terracotta seal** with a tick resting on top, a few tiny paper flecks.
Accent: the seal. Copy: **"You're all caught up"** · "New tasks appear when the agent needs you."

**A14 · `empty-activity` · Campaign activity log, nothing yet (`CampaignWorkspace.tsx:537`) · spot (small, 96 px)**
Scene: an hourglass-shaped stack of tiny cards, the top bulb holding one **terracotta card**.
Copy: "Nothing yet. Activity shows up as people move."

**A15 · `empty-agents` · Agents rail, nothing running (`Campaigns.tsx:179`) · spot**
Scene: **Hyre resting** on a small round cushion, seam unlit, eyes-free calm.
Accent: a single terracotta thread on the cushion's tassel. Copy: "No agents running. Ask for a search or outreach and one starts here."

**A16 · `agent-welcome` · Agent page, new chat landing (above the composer) · hero (wide 16:9 variant too)**
Scene: Tara at a desk, turned toward **Hyre**, which floats at shoulder height with a **soft terracotta glow**; between them a tidy fan of three candidate cards and a folded JD sheet.
Accent: Hyre's glowing seam. Copy: **"What are we hiring for today?"**

**A17 · `empty-notifications` · Notifications panel, none · spot**
Scene: a small clay bell lying on its side on a cushion, its clapper a **terracotta bead**.
Copy: "No notifications. We'll tell you when something needs you."

**A18 · `empty-history` · Chat history, no past chats (`Rail.tsx:375`) · spot**
Scene: a small stack of **blank speech-bubble tiles**, the bottom one in terracotta.
Copy: "Your past chats will be listed here."

**A19 · `overview-brief-pending` · Campaign overview before the brief is done (`OverviewPanel.tsx:339`) · spot**
Scene: a JD sheet half-filled with raised lines, a **terracotta bookmark** tucked in.
Copy: "Nothing to track until the brief is done." · *Finish the brief*.

**A20 · `empty-personal-workspace` · Personal workspace, first visit · hero**
Scene: Kabir at a **small personal desk** with a lamp, a plant and an empty dashed slot pinned above; a **terracotta key** hangs from the lamp (it's his space).
Accent: key. Copy: **"Your personal workspace"** · "Only you can see what you keep here. Save people, draft searches and try things before sharing with your team."

**A21 · `extension-not-installed` · Integrations page before the extension is used · hero**
Scene: a browser-window-shaped clay frame (no logos), a **terracotta puzzle piece** about to click into its top-right corner; a LinkedIn-agnostic profile card leaning against the frame.
Copy: **"Bring people in from LinkedIn"** · "Install the SuperHyre extension, then save anyone from their profile in one click."

### B. Placeholders for features we'll build later

**B1 · `placeholder-news` · Home Insights card (replaces fixture news) · band (16:5) + spot**
Scene: a small clay **newspaper stand** whose papers are **ghosted in dashed chalk lines**, Tara sketching the top page with a **terracotta chalk stick**; a tiny plinth.
Copy: **"Market news is on its way"** · "News about your clients and the roles you hire for will appear here."

**B2 · `placeholder-analytics-outreach` · Analytics › Outreach · hero**
Scene: a dashed-chalk **bar chart** standing on a plinth, one bar being filled from the bottom by a **terracotta paper plane** unfolding into it.
Copy: **"Outreach analytics is being built"** · "Reply rates by channel, message and time of day will live here."

**B3 · `placeholder-analytics-usage` · Analytics › Usage · hero**
Scene: a dashed-chalk **gauge / dial**, Meera adjusting its single **terracotta needle**.
Copy: **"Usage is being built"** · "Lookups, agent work and exports for your team will show here."

**B4 · `placeholder-analytics-projects` · Analytics › Projects · hero**
Scene: dashed-chalk **stacked folders** in a staggered timeline on three plinths, the front folder tab in terracotta.
Copy: **"Project analytics is being built"** · "Time to hire and progress across campaigns will show here."

**B5 · `placeholder-support` · Support page · hero**
Scene: Kabir at a small help desk with a clay **lifebuoy ring** leaning against it, its rope in terracotta; a dashed-chalk chat bubble above.
Copy: **"Support is on its way"** · "Until then, write to us at support@superhyre.com."

**B6 · `placeholder-connector-later` · Settings › Connections, rows for later connectors · spot**
Scene: a dashed-chalk **plug and socket** not yet joined, the plug's prongs in terracotta.
Copy (per row): "Outlook is coming later. It will send outreach from your address."

### C. Onboarding and account

**C1 · `signin-side` · Sign-in page side panel (replaces nothing; sits beside the existing brand deco) · tall 3:4**
Scene: Tara and Kabir walking up a gentle **clay staircase** shaped like the 2×4 mark, Hyre floating ahead with a soft glow; the top step in terracotta.
Accent: top step. No copy in image.

**C2 · `onboard-create-org` · "Set up Acme on SuperHyre" · hero**
Scene: Meera placing the **first terracotta block** onto a small clay **foundation** shaped like the staircase mark (laying the cornerstone); a rolled blueprint beside her.
Copy: **"Set up your organisation"** · "Your team gets one shared workspace for campaigns, candidates and clients."

**C3 · `onboard-join-org` · "Join Acme" · hero**
Scene: a softly open clay **door** in a rounded wall, warm light spilling out, a small group of three tiny candidate-card "nameplates" on the wall beside it, one in terracotta (yours).
Copy: **"Join Acme on SuperHyre"** · "{N} people from Acme are already here."

**C4 · `onboard-provisioning` · tenant being created (a few seconds) · spot, loopable still**
Scene: **Hyre bright**, with three small clay blocks assembling into the staircase mark beneath it, the last block terracotta, mid-air.
Copy: "Setting up your workspace…" (status, polite live region).

**C5 · `onboard-pending-approval` · join request waiting · hero**
Scene: Kabir seated on a bench outside the clay door (C3's door, now closed), holding a **terracotta ticket**; a small clock on the wall.
Copy: **"Waiting for approval"** · "An admin at Acme will let you in. You can work in your personal workspace meanwhile."

**C6 · `onboard-welcome` · first landing after joining or creating · hero**
Scene: the clay door from C3 wide open, Tara stepping through, **Hyre** greeting her with a soft glow, a **terracotta welcome mat**.
Copy: **"Welcome to Acme"** · "Here's where your team's campaigns live."

**C7 · `blocked-personal-email` · BlockedCard (personal email) · spot**
Scene: a clay **envelope** with a soft padlock tag, and beside it a second envelope with a small **terracotta briefcase charm** (work email).
Copy: **"Use your work email"** · "SuperHyre is for teams. Sign in with your company address."

**C8 · `invite-expired` · invite link expired · spot**
Scene: a clay **ticket** gently curled at the edges, its stub missing, an hourglass beside it with its last **terracotta grain** falling.
Copy: **"This invite has expired"** · "Ask your admin to send a new one."

### D. Settings and connectors

**D1 · `settings-invite-team` · Members, only you so far · hero**
Scene: Meera at a table setting out **two empty dashed chairs** beside her own; she places a **terracotta name card** on one.
Copy: **"Invite your team"** · "Add recruiters by email. They'll see the campaigns you assign them."

**D2 · `connect-gmail` · Connections, Gmail not connected (also used inside the Outreach ConnectGate) · spot**
Scene: a clay **envelope** with a soft cable plug beside it, the plug in terracotta, not yet inserted.
Copy: **"Connect Gmail"** · "Drafts appear in your Gmail, and replies come back here."

**D3 · `connect-expired` · any connection expired · spot**
Scene: the plug from D2 **slightly pulled out**, a small loose loop in its cable.
Copy: **"Gmail needs reconnecting"** · "Queued messages wait until you reconnect."

**D4 · `connect-sheets` · first export to Google Sheets · spot**
Scene: a **sheet tile** (raised grid squares) with a small terracotta corner fold.
Copy: "Connect Google to export straight to a sheet."

### E. Moments of success (small, earned, never confetti storms)

**E1 · `success-campaign-created` · after creating a campaign (card or toast-sized) · spot**
Scene: the A1 board now holding a **solid filled card**, a terracotta **seal** at its corner, four ivory paper flecks.
Copy: "Campaign created. The agent can start looking whenever you are."

**E2 · `success-hired` · candidate marked hired (pairs with the existing hired micro-interaction) · spot**
Scene: a candidate card standing upright on a small plinth like a trophy, a **terracotta ribbon** draped over its corner.
Copy: "{Name} is hired."

**E3 · `success-form-published` · form published · spot**
Scene: the A9 clipboard with its sheet now solid, a small **terracotta tick seal** on the clip.
Copy: "Form is live. Share the link or send it with outreach."

**E4 · `success-outreach-sent` · batch sent · spot**
Scene: three ivory paper planes in formation, the lead plane terracotta, short dotted trails.
Copy: "{N} messages sent. Replies will show up here."

**E5 · `success-export-ready` · export finished · spot**
Scene: a **sheet tile** sliding out of a soft clay tray, terracotta corner tab.
Copy: "Your sheet is ready." · *Open*.

**E6 · `success-watch-done` · keep-sourcing watch finished · spot**
Scene: Hyre settling down onto a small stack of **filled candidate cards**, glow fading, one terracotta card on top.
Copy: "Done: found the {N} people you asked for."

### F. System states

**F1 · `state-404` · page not found · hero**
Scene: a clay **signpost** with three blank arrow boards pointing different ways, Kabir reading a folded map with a **terracotta pin** in it.
Copy: **"This page doesn't exist"** · "It may have moved. Head back home." · *Go home*.

**F2 · `state-error` · something went wrong · hero**
Scene: a neat stack of candidate cards with **one card slipped and tilted**, Tara steadying it calmly; a terracotta clip on the slipped card.
Copy: **"Something went wrong on our side"** · "Your work is saved. Try again in a moment."

**F3 · `state-offline` · connection lost / reconnecting · spot**
Scene: a soft clay **cable** with its plug resting just short of a socket, a terracotta plug.
Copy: "You're offline. We'll reconnect and catch up automatically."

**F4 · `state-agent-capacity` · agent at capacity (subscription limit, `gateway-changes.md` §6.4) · spot**
Scene: **Hyre resting** on its cushion with a small clay **hourglass** beside it, the falling sand terracotta.
Copy: "The agent is at capacity. It will pick this up at {time}."

**F5 · `state-admin-only` · AdminOnly / NotOnCampaign · spot**
Scene: a closed clay **folder** with a soft padlock tag, a key with a **terracotta bow** lying beside it.
Copy: **"Only admins can open this"** / **"You're not on this campaign"** · "Ask an admin for access."

**F6 · `state-maintenance` · planned maintenance · hero**
Scene: Meera tightening a small clay **bolt** on the staircase mark with a terracotta wrench, a tidy toolbox.
Copy: **"Back shortly"** · "We're making an update. Everything you saved is safe."

### G. Candidate-facing (public form pages)

**G1 · `apply-header` · public form page header (`ApplyPage`) · band 16:5**
Scene: a calm wide composition: a desk with a laptop (blank screen), a mug, a plant on books, and a **terracotta paper plane** on the desk edge; no characters (candidates should see themselves, not our cast).
No copy in image; the role title sits below in HTML.

**G2 · `apply-thanks` · after submitting · hero**
Scene: the terracotta paper plane from G1 now **landed** in a soft clay tray, a small tick seal beside it.
Copy: **"Thanks, your answers are in"** · "The recruiter will be in touch if it's a match."

**G3 · `apply-closed` · form closed · spot**
Scene: a clipboard with a soft fabric **ribbon tied across it**, the knot in terracotta.
Copy: **"This form is closed"** · "The role may be filled. Thank you for your interest."

### H. Email and sharing

**H1 · `email-invite-header` · invite email · band 600×200 (email-safe PNG, light background `#FFFFFF`)**
Scene: the C3 open door, small and centred, warm light.

**H2 · `email-digest-header` · weekly digest email · band 600×200**
Scene: Hyre beside a short stack of cards and a calendar block, glow soft.

**H3 · `og-default` · link previews for superhyre.com and app links · 1200×630**
Scene: the C1 staircase with Tara, Kabir and Hyre on the left half; right half left empty in `#FFFFFF` for the HTML/OG title overlay produced separately (no text in the image).

**H4 · `og-apply` · link preview for a public form · 1200×630**
Scene: G1's desk scene on the left, empty right half for the role title overlay.

### I. Working / loading (stills, animated only by CSS opacity)

**I1 · `working-sourcing` · first search running, before results stream in · spot**
Scene: Hyre **bright**, three orbiting dots, candidate cards rising from a shallow tray toward it, one terracotta card leading.

**I2 · `working-matching` · judging candidates · spot**
Scene: Hyre above a **ring funnel**, two cards passing through, the lower ring terracotta.

**I3 · `working-documents` · reading a JD / CV upload · spot**
Scene: a sheet being fed into a soft clay **roller**, emerging as neat raised lines, the roller handle terracotta.

### J. Spot set for settings and onboarding checklists (1:1, 160 px, no characters)

`spot-candidate` (candidate card) · `spot-campaign` (index card on a pin board) · `spot-client` (business card in a holder) · `spot-form` (clipboard) · `spot-call` (handset) · `spot-task` (ticked card) · `spot-agent` (Hyre, soft glow) · `spot-export` (sheet tile) · `spot-calendar` (calendar block) · `spot-mail` (envelope) · `spot-team` (three name cards) · `spot-lock` (padlock tag). One terracotta element each, same light, same shadow.

**Total: 73 assets** (A 21 · B 6 · C 8 · D 4 · E 6 · F 6 · G 3 · H 4 · I 3 · J 12). Priority for the first batch: A3, A4, A1, A2, A9, A10, A12, A13, A16, B1, C2, C3, C5, D1, D2, F1, F2, G2.

---

## 4. Prompts

### 4.1 Step 1: generate the character and object reference sheet first

Consistency across 73 images comes from **one approved reference sheet** fed back as the character / style reference for every later image.

> **Reference sheet prompt**
> A clean character and prop turnaround sheet for a soft 3D clay illustration series, on a pure white background, evenly spaced, no text, no labels. Top row: three stylised South Asian characters in calm, friendly poses, each shown front and three-quarter: (1) "Tara", a recruiter in her late twenties with shoulder-length wavy dark hair tucked behind one ear, a small gold stud earring, an oatmeal knit sweater with pushed-up sleeves, sage-grey relaxed trousers and white low sneakers; (2) "Kabir", a recruiter in his late twenties with short textured dark hair and light stubble, a greige overshirt over a white tee, charcoal chinos and white sneakers; (3) "Meera", a team lead in her mid forties with silver-streaked hair in a low bun, round thin-rimmed glasses, an ivory long top under a greige long cardigan, slim charcoal trousers and flat shoes. Slightly larger heads, soft rounded hands, gentle expressions, Pixar-adjacent proportions but understated. Middle row: "Hyre", a smooth floating matte ivory pebble about one third the size of a head, with a small 2-by-4 staircase symbol softly debossed on its face and a thin seam around its middle, shown three times: seam unlit, seam glowing soft warm terracotta, seam glowing bright terracotta with three tiny orbiting dots; no face, no eyes, no limbs. Bottom row of props, all matte clay: a candidate card (small rounded ivory card with an empty circle and three raised lines), a rounded board with a dashed rectangle drawn on it, a clipboard with a form sheet of raised lines and round tick bubbles, a folded paper plane, an envelope, a soft rounded phone handset, a chunky square calendar block, a tile of raised grid squares, a round seal stamp with a raised tick, three stacked rings forming a funnel, a magnifying glass, a small potted plant with muted sage leaves on three stacked books. Materials: satin matte clay and bisque porcelain with a faint chalk-dust grain, softly rounded edges, very light subsurface warmth. Palette: warm ivory #F4F1EC, bone #EAE5DD, greige #D9D3CA, warm grey #B8B0A6 for lines and shadows, charcoal #3A3632 only for hair and shoes, muted sage only on the leaves; exactly one accent colour, terracotta #E0602A, used on the Hyre glow and on the seal only. Lighting: one large soft key light from the top left, soft fill from the right, gentle ambient occlusion, no hard highlights. Each item sits on its own soft blurred warm-grey contact shadow. Three-quarter view from slightly above, long-lens feel, high detail, calm, premium, editorial.

### 4.2 Step 2: the master style block (prefix for every asset)

> **STYLE**: soft 3D clay illustration for a calm, premium recruiting product. Satin matte clay and bisque porcelain materials with a faint chalk-dust grain and softly rounded edges. Warm neutral palette only: ivory #F4F1EC, bone #EAE5DD, greige #D9D3CA, warm grey #B8B0A6 for dashed lines and shadows, charcoal #3A3632 only for hair and shoes, muted sage #A7B79A only on plant leaves. **Exactly one object in terracotta (#E0602A in light, #C87248 in shade): {ACCENT}.** One large soft key light from the top left, gentle fill from the right, soft ambient occlusion, no glossy highlights. No floor: a single wide, very soft warm-grey contact shadow under the group, fading to transparent, with an extremely faint chalk-dust halo at its edge. Three-quarter view from slightly above, long-lens, subject centred with generous empty margins (subject fills about 60 percent of the frame). **Transparent background.** Characters, when present, match the attached reference sheet exactly (Tara, Kabir, Meera, and Hyre the floating ivory pebble with a debossed staircase mark and a terracotta-glowing seam; Hyre has no face). Calm, competent, quietly warm mood. **Scene:** {SCENE}

> **AVOID**: any text, letters, numbers, logos, brand marks other than the debossed staircase on Hyre, UI screenshots, real app icons, glossy plastic, neon, glow halos, gradients or coloured backgrounds, blue, purple, robots, faces on Hyre, cartoon sweat or tears, confetti storms, stock handshake imagery, cluttered desks, more than one terracotta object, harsh shadows, floor planes, photographic realism, low-poly, flat vector.

### 4.3 Step 3: one prompt per asset

Fill `{SCENE}` and `{ACCENT}` from section 3. Example, fully assembled:

> **A4 `empty-shortlist`**: STYLE … **Exactly one object in terracotta: the tiny star inside the thought bubble.** … **Scene:** a tall matte clay clipboard stands upright; on its board a rounded rectangle is drawn in soft warm-grey dashes, and inside it sits a small embossed 2-by-4 staircase mark with three short rays above it. Kabir from the reference sheet sits cross-legged on the left of the clipboard, chin resting in one hand, thoughtful, looking slightly up at a small cloud-shaped thought bubble above him, which holds a tiny terracotta star, with two little trailing bubbles. On the right, a small potted plant with muted sage leaves on three stacked bone-coloured books. Canvas 4:3. AVOID …

### 4.4 Step 4: one batch prompt per family (for models that make sheets)

For tools that do better with several related images at once, use one grid prompt per family, then crop. Example for the empty states:

> STYLE (as above, with "exactly one terracotta object **per tile**") … Create a 3-by-3 grid of nine separate square tiles with generous white gutters, each a self-contained scene sharing the same light, camera, materials and cast: (1) Meera pinning a terracotta index card into an empty dashed slot on a tall clay board; (2) Kabir on a low cushion looking at an empty dashed slot with a terracotta pin in its corner; (3) three short dashed columns with Tara placing one terracotta candidate card in the first; (4) the clipboard-and-thought-bubble scene with a terracotta star; (5) a fanned stack of blank candidate cards with Tara holding a terracotta abstract puzzle piece; (6) a clay magnifier with a terracotta ring leaning on a dashed slot, two cards drifting outside it; (7) Meera sliding a terracotta business card into an empty dashed holder; (8) a clipboard form with empty tick bubbles and Tara holding a terracotta pencil; (9) a terracotta paper plane leaving a clipboard along a dotted path while Kabir watches with a mug. AVOID …

Families for batching: Empty core (A1–A9), Empty rest (A10–A21), Placeholders (B), Onboarding (C), Settings + success (D, E), System (F), Candidate-facing + email (G, H), Working (I), Spot set (J as a 4-by-3 grid).

### 4.5 Tool notes

| Tool | How |
|---|---|
| **GPT-image / ChatGPT images** | Attach the approved reference sheet; request "transparent background"; 1536×1152 for 4:3, 1024×1024 for spots; generate per asset (best consistency). |
| **Midjourney v7** | Reference sheet as `--cref` (characters) and `--sref` (style); `--style raw --stylize 75 --ar 4:3` (heroes) or `--ar 1:1` (spots); remove backgrounds after (Midjourney has no alpha). |
| **Ideogram / Flux** | Use the style block as the "style" field and the scene as the prompt; keep a fixed seed per family; remove background after. |
| **Canva (connected here)** | Can generate and store the set in one folder if you want them in Canva; same prompts. |

---

## 5. Delivery specs (so they drop straight in)

- **Generate each image on its own canvas** (never crop from a sheet), export at least 1920×1440 for heroes, with a true transparent background.
- **Files:** `public/illustrations/{id}.webp` (+ `{id}.png` fallback), sRGB, transparent, trimmed to a fixed canvas (no auto-crop, so all heroes align), subject centre at 50 % / 48 %.
- **Sizes:** heroes 2400×1800 master, exported 960×720 and 480×360; spots 1200×1200 master, exported 320 and 160; bands 3200×1000 → 1600×500; OG exactly 1200×630 (PNG, white background).
- **Weight:** WebP quality 82, target ≤ 60 KB per hero at 960 px, ≤ 15 KB per spot at 320 px.
- **QA checklist per image:** one terracotta object only · no text or logos · cast matches the sheet · shadow present and soft · transparent edges clean (no halo) · reads on white · nothing looks like a real UI control.

## 6. How they're used in the console

- One component, `<Illustration name="empty-shortlist" size="hero|spot|band" />`, rendering `<picture>` with WebP + PNG, `width`/`height` set (no layout shift), `loading="lazy"`, `decoding="async"`, `alt=""` and `aria-hidden="true"` (copy beside it carries the meaning).
- Empty-state layout: illustration (max 360 px wide on desktop, 240 px on phones), 24 px gap, headline (H3), one sentence (`--ink-2`), at most one primary action. Exactly the reference's rhythm, on our white canvas.
- Motion: none in the image; a 200 ms fade-in when the empty state first appears; `prefers-reduced-motion` disables it. Working stills (I1–I3) may pulse Hyre's glow by layering a second PNG and animating its opacity.
- Removal rule: an illustration never stays once its screen has data; tests assert the empty state disappears when rows exist.
