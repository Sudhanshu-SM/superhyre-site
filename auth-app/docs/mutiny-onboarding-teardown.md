# Mutiny onboarding: design teardown

Reference for SuperHyre's own sign-up and onboarding. Written 9 Oct 2026 from two live runs of `app.mutinyhq.com`:

- **Run A (Magnifi):** the 8 screenshots Arnab took on Fedora/Firefox.
- **Run B (SuperHyre):** driven in Chrome, with computed styles read straight from the DOM. Workspace `SuperHyre`, site `superhyre.com`, role Founder.

The values below are measured, not guessed, except where marked *(approx.)*.

---

## 1. The flow at a glance

| # | URL | Screen | What the user does | What Mutiny does behind it | Wait |
|---|---|---|---|---|---|
| 0 | `/login` | Log in | Work email → Next, or Continue with Google | Auth | — |
| 1 | `/onboarding/setup` | "Let's get started" | First/last name (pre-filled), workspace name, company website, how did you hear | Creates the workspace and reserves `<workspace>.mutiny.app` | ~1s (button spinner) |
| 2 | `/onboarding/interview` · Getting to know you | Welcome + identity card | Watches | Researches the person and company from the website | ~13s |
| 3 | 〃 | Role picker | Picks a role from the dropdown | Writes 3 research insights into the card | instant |
| 4 | 〃 | "Finding the best next steps for your role…" | Waits | Generates focus options for that role and company | ~8s |
| 5 | 〃 | "Where do you want to focus first?" | Picks 1 of 3 AI chips, or types "Something else" | Stores the goal | — |
| 6 | 〃 · Your brand | Brand theme card | Continue | Extracts logo, colours, fonts and a site screenshot, then builds the theme | ~6s |
| 7 | 〃 · Getting started | 3 suggested assets + "Just explore" | Picks one | Generates asset ideas from goal + research | ~5–8s |
| 8 | `/threads/<id>` → `/build/assets/<id>` | Chat + canvas | Watches the first asset get built | Agent picks a template and drafts the asset | ~30s |

Everything from step 2 to step 7 runs on **one URL** (`/onboarding/interview`). It's a single conversational page: content fades in and out under a fixed stepper, with no page loads between steps.

**Total user input:** 3 typed fields, 1 dropdown, 2 single-click choices and 2 Continues. Roughly 60–90 seconds, and most of that is watching the AI work.

---

## 2. Design system (shared across the flow)

### Type

| Role | Font | Size / line-height | Weight | Tracking | Colour |
|---|---|---|---|---|---|
| Display headings ("Log in", "Let's get started") | **Reckless Condensed S** (serif) | 42px / 1.25 | 400 | -1.05px (-0.025em) | `#020817` |
| Person name in identity card | Reckless Condensed S | 26px / 26px | 400 | — | `#000` |
| App page titles ("Hasta la vista, backlog.", "Templates") | Reckless Condensed S | 38px / 57px | 400 | — | `#1A1B1E` |
| UI text | **Inter** (self-hosted as `Inter-Mutiny`, 400/500/600/700) | 16px / 24px | 400 | — | `#020817` |
| Labels | Inter | 14px / 14px (leading-none) | 500 | — | `#020817` |
| Helper text | Inter | 12px / 1.4 | 400 | — | gray-500 `oklch(0.551 0.027 264)` |
| Stepper pills | Inter | 13px | 400 (active) / 500 (idle) | — | — |

IBM Plex Serif (300/400) is also loaded, but only the generated assets use it.

**The pattern:** an editorial condensed serif for moments (headings, the person's name), and Inter for everything functional. That pairing is most of what makes it feel premium.

### Colour

| Token | Value | Use |
|---|---|---|
| Ink | `#020817` (slate-950) | Body text, labels |
| Button black | `#1A1B1E` | Primary CTA |
| Border | `#E2E8F0` (slate-200) | Inputs, dividers |
| Stepper active | `#138BE6` | Current step pill |
| Stepper done | green *(approx. `#1DB97A`)* | Completed step pill |
| Stepper idle | bg `#FAFAFA`, text `#737578` | Upcoming step pill |
| Card stack: lime | `#D7FD85` | Hero card |
| Card stack: sky | `#C6F1FD` | Hero card |
| Card stack: lilac | `#F3D9FC` | Hero card |
| Asset icon: landing page | bg `#E7F5FD`, icon `#1688C9` | Suggestion rows |
| Asset icon: report / one-pager | bg `#FFE8E0`, icon `#F15B35` | Suggestion rows |
| Asset icon: deck | purple tint | Suggestion rows |
| Asset icon: explore | bg `#F2F2F2`, icon `rgba(0,0,0,.5)` | Suggestion rows |

The page background is pure white throughout. The only colour comes from the card stack, the stepper, and the user's own brand once it's been extracted.

### Elevation

```css
/* Form card (login / setup) — very soft, long, layered */
box-shadow: 0 0 1px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.02), 0 34px 54px rgba(0,0,0,.04);
border-radius: 16px;
padding: 30px;

/* Identity card + chips — "hairline ring + small drop" (Tailwind shadow-md / shadow-sm with a 0.5px ring) */
box-shadow: 0 0 0 .5px rgba(17,24,39,.2), 0 4px 6px -1px rgba(17,24,39,.1), 0 2px 4px -2px rgba(17,24,39,.1);
border-radius: 22px;          /* identity card */
/* chips: same ring, 0 1px 3px + 0 1px 2px -1px, radius 12px */
```

Borders are rarely real borders. Most edges are a **0.5px box-shadow ring**, which reads crisper than a 1px border on retina screens.

### Buttons

```css
/* Primary pill (Continue) */
height: 40px;                 /* 48px on login */
border-radius: 9999px;
background: #1A1B1E linear-gradient(rgba(255,255,255,.2), rgba(255,255,255,0));
color: #fff; font: 500 16px/24px Inter;
box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.17), 0 3px 4px rgba(0,0,0,.11);
transition: all 150ms cubic-bezier(.4,0,.2,1);
```

- **Disabled** (e.g. before a role is picked): the same pill in mid-grey.
- **Loading:** grey, with a small spinner before the label ("◌ Continue").
- **Secondary** (Continue with Google): white, height 48, radius 10, `0 2px 2px rgba(0,0,0,.07), 0 0 0 1px rgba(0,0,0,.18)`.

The top-light gradient plus the inset highlight make the black pill look slightly convex, like a physical key.

### Inputs

```css
height: 48px; border-radius: 12px; padding: 0 16px;
border: .75px solid #E2E8F0; font-size: 16px;   /* 16px prevents iOS zoom */
```

On login, the input instead uses radius 10 with a `0 2px 2px rgba(0,0,0,.07)` drop plus a 1px ring. Focus state is a dark 1px ring.

---

## 3. Screen by screen

### 0 · Login (`/login`)

- Mutiny logo mark top-left, at 35px/35px.
- **Left:** the 3-card stack (described under step 1), with lime in front. A small black "burst/spinner" glyph, then **"Log in"** in Reckless, then "Don't have an account? **Sign up**" (underlined).
- **Right:** a 400×312 white card. "Work email" label, input (`name@company.com`), black **Next** pill (grey until valid), an "OR" divider (1px `rgba(0,0,0,.18)` lines), then **Continue with Google**.

### 1 · Setup (`/onboarding/setup`)

**Layout:** two columns, centred on the viewport. Hero card stack on the left (~340px), form card on the right (~380px), with about 110px between them.

**Card stack (signature element)**
- Three 340×480 cards, radius 16, solid fills (sky, lilac, lime).
- They are stacked and offset diagonally down-left using `translate: -8px 8px`, `-29px 29px`, `-50px 50px`.
- The fractional values we caught (`-29.149px`) show the **fan-out is animated** on load.
- **The colour order rotates per screen:** lime is in front on login, sky is in front on setup. The same component gets a new feel on each page.
- The front card holds a 120×104 illustration (a halftone, mostly black character drawing with neon green, purple and red accents), the Reckless heading, and a one-line subtitle at 80% opacity.

**Copy**
- Heading: "Let's get started"
- Subtitle: "We'll make this quick"

**Form fields**

| Field | Placeholder | Notes |
|---|---|---|
| First name / Last name (side by side) | First / Last | Pre-filled from the Google profile |
| Name your workspace | ACME Corp | After typing, a hint appears below: *"Your assets will be hosted at **superhyre-3.mutiny.app**"*. It shows the subdomain live; `-3` because earlier workspaces took the slug. |
| Company website | company.com | The label row has a right-aligned underlined **"But why?"** link. Clicking it opens a black tooltip with an arrow: *"We use your website to understand your brand so everything you create looks and sounds like you."* |
| How did you hear about Mutiny? | Claude, Google, Newsletter, Podcast… | Free text, not a dropdown. Note "Claude" is listed first. |
| ☐ Allow colleagues from my company to discover and join this workspace | — | Disabled for personal email domains. 20×20 checkbox, radius 6. Grey label plus helper text: "Not available for personal email domains — only company domains can be discovered." |

The CTA is a full-width **Continue** pill. On click it turns grey with a spinner, and about 1s later it fades into the interview.

**Patterns worth copying**
- Answering "why do you need this?" inline, right where the doubt arises.
- Showing the live subdomain as the user types.
- Pre-filling everything the auth provider already knows.

### 2 · Interview shell (`/onboarding/interview`)

**Stepper:** fixed at top centre, 27px tall.

```
[▶ Getting to know you] • • • [Your brand] • • • [Getting started]
```

- **Active:** blue `#138BE6` pill, white text, with a ▶ "send" icon.
- **Done:** green pill with a ✓.
- **Upcoming:** `#FAFAFA` pill with grey text.
- The `• • •` connectors turn blue once you've passed them.

**Content column:** about 636px wide, centred, left-aligned text, starting about 160px from the top. No card wraps the page; text sits straight on white, like a chat transcript without bubbles.

**Text entrance:** every new line types itself out. Characters appear left to right, with the leading edge fading from grey to black (see Run A screenshot 2: "so you hav~~e~~").

### 3 · Getting to know you: research

1. Typed in, one line after the other:
   > Welcome to Mutiny, Arnab!
   > We're just doing a bit of research so you have a great experience.
2. The **identity card** slides in below (636 wide, radius 22, ring shadow):
   - **Header row:**
     - 52px initials avatar "AJ". It starts as a grey outline and **fills pink once research is done**.
     - Name in Reckless 26px.
     - The company favicon plus company name in Inter 600 beneath it.
   - **Footer row:** below a hairline divider, a 🔍 status line in grey that cycles:
     `Looking you up…` → `Learning about your company…` → `✓ Research complete`
3. **Role picker** (seen in Run B): a small select ("Select your role") next to a grey, disabled **Continue**.
   - Options: Account Executive · Account-Based Marketing · BDR or SDR · Demand-gen Marketing · Product Marketing · Founder · Other.
   - Run A's screenshots skip this step, so it's likely shown only when the research can't infer the role.
4. After a role is picked:
   - The role appears under the name with a ⌄ chevron, so it can be edited later.
   - The card **expands** with three ⓘ insight lines written about *your* company. Run B produced:
     - "SuperHyre provides vetted candidate shortlists to companies using multi-stage screening before candidates reach hiring managers."
     - "Traditional hiring processes suffer from wrong sourcing channels, generic outreach, resumes that don't predict performance, and slow timelines."
     - "You may be focused on explaining how SuperHyre solves broken hiring or building buyer confidence that vetted shortlists accelerate hiring decisions."
   - This is the "it gets me" moment: proof the AI read your site before it asks for anything else.
5. Clicking Continue clears the screen to a single line with a spinner: **"Finding the best next steps for your role…"**

### 4 · Getting to know you: focus question

- **Question (generated):**
  - Run A: "Where do you want to start with Magnifi?"
  - Run B: "Where do you want to focus first?"
- **Three chips** are generated from the research, as one-line verbs. Each chip is a white pill, radius 12, 15px text, with the ring shadow, stacked vertically and left-aligned.

  | Run A (Magnifi) | Run B (SuperHyre) |
  |---|---|
  | Start conversations with early buyers | Start conversations with companies stuck in slow hiring |
  | Explain what Magnifi does and why it matters | Explain why traditional hiring fails and what's different |
  | Turn interested teams into first customers | Turn early interest into a first buyer conversation |

  The three slots are fixed (open conversations, explain the product, convert interest), with company-specific wording.
- **"Something else…"**: a fourth chip in lighter grey. Clicking it turns it in place into a text input ("What are you focused on?") with a small grey ↑/→ submit button, the same shape as a chat composer.
- **On select:** the chosen chip stays and the others **blur and fade out**. Then the step pill animates blue → green ✓ and the next pill turns blue.

### 5 · Your brand

- **Centrepiece:** a 340×370 card, radius 16, that previews the extracted brand as a collage.
  - **Top half (white):** the company logo, large.
  - **Bottom half:** filled with the **brand primary colour**, with a tabbed, folder-like top edge drawn in SVG.
  - Three cards are fanned over the seam:
    - **Left:** a type specimen card (113×113, radius 14) showing "H1 / H2 / Body" in the extracted fonts, rotated about -8°.
    - **Centre:** a 190×260 screenshot of the homepage (radius 14).
    - **Right:** a colour-swatch grid card.
- **Loading state** (Run A screenshot 6): the same layout in a default green theme, with placeholder labels "Company logo", "Screenshot", "Primary" and empty swatches. Real data then swaps in. The skeleton *is* the layout, so nothing jumps.
- **Copy:** "Your brand theme is complete. This will ensure all assets are stunning and on brand."
- **CTA:** a centred **Continue** pill. On click, the card desaturates and fades out.
- **What it extracted for SuperHyre:**
  - Logo
  - Colours: orange `#E8541C` *(approx.)* and a dark grey
  - Fonts: **PP Mondwest** for headings, **Fanwood Text** for body, **IBM Plex Sans**
  - Typography scale: H1 64px, H2 4xl, H3 29px, H4 22px, Body 19px
  - CTA styles: filled orange pill, outlined pill, plain link
  - It also imported **4 images from the site into the Library** without asking.

### 6 · Getting started

- **Intro line** (Run B): "Here are three assets that could help the deal. Mutiny builds them end to end, on-brand, ready to send. Select one of these to get started."
- **While generating** (Run A): the heading "Putting together your starting points", with titles appearing first and grey skeleton bars where the descriptions will go.
- **List rows:**
  - 660px wide, radius 12, padding 8/12.
  - Grey hover fill and a › chevron on the right.
  - A 32px icon tile (radius 11) tinted by asset type.
  - Title in 16px/600, formatted "**Type: Title**".
  - A 14px description under it (Run B only; Run A showed titles only).

| Run A (Magnifi) | Run B (SuperHyre) |
|---|---|
| Landing page: Book a WhatsApp Inbox Demo | Landing page: Why Traditional Hiring Keeps Failing |
| One-pager: Shared Inbox for WhatsApp Teams | Report: The Broken Hiring Process Explained |
| Deck: Why Magnifi for WhatsApp Teams | Landing page: Stop Sourcing Wrong Candidates |
| Just explore Mutiny for now | Just explore Mutiny for now |

The last row is always an **escape hatch** ("Just explore Mutiny for now", grey home icon), so nobody is forced into generating something.

### 7 · Hand-off into the product

Picking an asset drops you into the main app with the first job **already running**:

- **Chat thread (left, ~330px):**
  - Your request is auto-sent as a user bubble: "Help me create Landing page: Why Traditional Hiring Keeps Failing."
  - Agent status lines follow: "Thinking ›" → "Choosing a template for faster creation" → "Thought for 14s".
  - Tool cards show "**Why Traditional Hiring Keeps Failing** updating ◌" → "updated ✓", each with a one-line brief.
  - Then a plain-prose summary of what it built and what it deliberately left out ("avoids unverified metrics… an editable draft, not a published page").
  - Suggestion chips sit above the composer: "Review and refine the draft", "Add social proof or testimonials", "Add benefits section below failures", "Find hero image…".
- **Canvas (right):**
  - Breadcrumb "All › [logo] Title ⋯".
  - **Desktop ⌄** preview toggle.
  - **Invite team** and a blue **Share externally** button.
  - Expand and close icons.
- **Feedback toast:** a dark floating pill, bottom-centre, reading "How does this look? 👍 👎 ✕".
- **Sidebar:** collapses to an icon rail while you're in the editor.

---

## 4. Motion summary

| Moment | Motion |
|---|---|
| Card stack on login/setup | The three cards fan out diagonally from behind the front card (translate 0 → -50px) |
| Every new sentence | Typewriter reveal with a fading leading edge |
| Identity card | Slides/fades in; the avatar fills from outline to colour when research completes |
| Role chosen | Card height animates open to reveal the insights |
| Chip chosen | Unchosen chips blur and fade; the chosen one stays put |
| Step complete | Pill colour changes blue → green, ▶ becomes ✓, connector dots turn blue |
| Between steps | Whole column cross-fades to blank, then a spinner line appears, then the new content |
| Brand card exit | Desaturate and fade |
| Credits counter (app) | Odometer-style digits (each digit is its own element) |

UI transitions are 150ms `cubic-bezier(.4,0,.2,1)`. The step-level fades are slower *(approx. 300–500ms)*.

---

## 5. What the main app looks like after onboarding (brief)

Only enough to show where onboarding lands you.

- **Sidebar (~155px):**
  - Home · Assets · Templates · Routines · Projects
  - **Foundations** (collapsible): Skills · Library · Brand · Integrations
  - **Recent** threads
  - A **Credits** meter at the bottom (purple bar, "9.73 left · Renews in 12h · Upgrade"), then the account switcher.
- **Active nav item:** bg `#EFF0F0`, radius 8, height 34.
- **Home:**
  - Faint isometric-grid background.
  - Reckless headline "Hasta la vista, backlog."
  - A 600×120 composer (radius 18) whose placeholder cycles example prompts ("Create a 1:1 personalized page for prospecting into Boeing", "Create a follow-up for my last demo with Amplitude"…). It has + (attach), a ⚙ menu (Chat Settings → Model: Automatic), a mic, and a send button.
  - A Recent row.
  - "Start building with Mutiny": eight illustrated tiles (230×119 pastel boxes, radius 16, with the same halftone illustrations).
- **Templates:** a kanban grouped by **deal stage**:
  - **Book meeting** (purple), **Run evaluation** (blue), **Close deal** (green), **No stage** (grey).
  - Chevron-shaped column headers.
  - Each template card has a coloured icon tile, title, a "Starter" pill and a "Use" action.
- **Assets / Routines / Projects / Skills:** each has a Reckless page title, a search field, "+ New …", and segmented tabs (Yours / Shared / Suggested). Empty states use one illustration, "No X just yet", a link to suggestions, and a "+ Create" button.
- **Brand:**
  - A theme card that reuses the onboarding collage.
  - Its detail page has sections for Logo (light/dark), Content Viewer, Colors, Fonts, Typography (light and dark previews side by side) and CTAs.
  - Each section has an **Edit** button that opens a right-hand drawer, e.g. Typography lets you set font, weight and size per style, with a "Show advanced" toggle.
- **Integrations:**
  - **Shared:** Gong, HubSpot, LinkedIn Ads, Notion, Salesforce (Enterprise), Slack, custom MCP server.
  - **Personal:** Gmail, Google Calendar, Drive, Slides, Notion, custom MCP.
  - **Visitor identification:** Outreach and Salesloft (Business plan).

---

## 6. Takeaways for SuperHyre onboarding

1. **Ask for the website, then show your work.** One URL gets Mutiny the company summary, the problem, a guess at the user's goal, and the full brand. For SuperHyre, the equivalent is the company site plus a job link. We could research the company and role, then show *"Here's what we understood"* as an expandable card before asking anything else.
2. **Make the wait the product demo.** Each AI wait (13s, 8s, 6s) is covered by a visible narrative: typed sentences, status lines that change, a card that fills in. Nothing looks frozen, and every wait ends in a reveal.
3. **Use generated choices, not blank forms.** "Where do you want to focus first?" offers three tailored chips plus "Something else…" that turns into a free-text input. Our "what are you hiring for" step could work the same way.
4. **Keep it on one URL with a 3-pill stepper.** The flow is linear and conversational with no page loads. The pills give a sense of progress without a wizard's weight.
5. **Answer doubt inline.** "But why?" next to the website field is cheap and lowers drop-off on the most sensitive question.
6. **Land the user mid-task.** Onboarding ends with the first asset *already being built* in the real product UI, not on an empty dashboard. There's always an escape hatch ("Just explore").
7. **Copy the visual recipe:**
   - Condensed serif for moments, Inter for UI.
   - White page, colour only from illustration and brand.
   - 0.5px ring shadows instead of borders.
   - A convex black pill CTA.
   - Pastel card stacks whose order rotates per page.

### Where it falls short

- The role picker appears only sometimes. The two runs behaved differently, which is confusing if a user sees both.
- The free-text "How did you hear about Mutiny?" is easy to answer but hard to analyse.
- Library images are imported from the site without asking (there is a "Discard import" option afterwards).
- In our automated run the canvas preview never rendered (it stayed on a spinner), though the asset thumbnail did show on the Assets page.
