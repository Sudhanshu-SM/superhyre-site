# SuperHyre — design system

**Status:** working draft · **Revision:** 25 · **Last changed:** 2026-09-15

> **This file is a proposal layer, not the implementation.** The CSS custom
> properties in `auth-app/src/access.css` and `style.css` are what actually
> renders. This document exists to say *why* each value is what it is, and to
> hold the next change before it is made.
>
> **How to change it:** edit the table, note the reason in the same row, and add
> a line to the [Changelog](#changelog). Anything in *Proposed* state is fair
> game to overwrite — nothing here is load-bearing until it is marked *Adopted*
> and the token exists in CSS. Every colour claim carries a measured contrast
> ratio; if you change a hex, recompute it (see [Verifying](#verifying-a-colour-change))
> rather than eyeballing it, because two of the values in the source reference
> for this revision are not legible and it is invisible until measured.

---

## 0. Philosophy

> Organic Modern SaaS · Editorial UI · Human-Centered Design · Soft Bento
> layouts · Minimalism · Subtle Tactile / Soft UI — a warm yet professional
> recruitment experience built from modular asymmetric cards, generous
> whitespace, clean typography, soft rounded surfaces, restrained shadows,
> earthy orange–peach–sage tones, minimal line iconography, contextual
> navigation, human-focused candidate imagery, and AI-native conversational
> interactions.

That is the intent. Below is what each clause **costs you in a code review**,
because a philosophy that cannot be violated cannot be followed either. Every
line is a rule someone can hold a diff against.

| Clause | What it means here | How it fails review |
|---|---|---|
| **Organic Modern SaaS** | Warmth lives in the accent and the active state, never in the page. The console page is 10% saturation at 30° hue — same family as the brand, none of the cast. | A warm-sand panel behind white cards. Measured at 54% saturation it read as beige, not as a product surface; that finding is already recorded at `access.css:1341-1360`. |
| **Editorial UI** | Text is the interface. One idea per block, real sentences, no label-shaped nouns standing in for explanation. Serif (`--serif`) for reading, sans (`--ui`) for operating. | "Coming soon". A placeholder that does not name what it will read and why. |
| **Human-Centered** | The product states what it is doing and what it cannot do. Disabled controls say why. Empty states name the table behind them. | A menu row that looks live and no-ops. A badge showing `0`. |
| **Soft Bento** | Modular, asymmetric, gap-separated blocks. Asymmetry comes from **content weight**, not from decoration — a wide block earns its width by holding more. | A 2×2 grid of equal cards padded to look deliberate. |
| **Minimalism** | Generous whitespace is the only spacing device. Remove a rule, a border, or a shadow before adding one. | A divider doing a job that 16px of space already does. |
| **Subtle Tactile** | Elevation is the *quietest* signal that reads. See §4.1 — shadows are opacity ≤ 0.10 and never the only boundary of a control. | A drop shadow standing in for a border that WCAG 1.4.11 requires at 3:1. |
| **Earthy tones** | Orange–peach–sage, and orange stays scarce. If everything is accented nothing is. | A second saturated hue competing with the accent. |
| **Minimal line icons** | Phosphor, one weight, outline resting / fill active. §5.6. | A filled icon on a resting row. A second icon library. |
| **Contextual navigation** | The sidebar shows where you are working, not only where you can go — hence the campaign block. Scope is visible without being clicked. | A flat list that puts "Shortlisted" beside "Contacts" as if they were peers. |
| **Human-focused imagery** | Candidate photography is of people, cropped to faces, never a stock handshake. Always a real avatar or a legible initial; never a silhouette. | A generic user glyph where a name would do. |
| **AI-native conversational** | The agent is a surface with history, not a button. Searches are conversations that persist and can be returned to. | A one-shot prompt box with no record of what was asked. |

### Visitor mode decides which rules apply

**Read this before applying any rule from an anti-pattern list.** Impeccable's
`layout.md` splits its guidance by visitor mode, and the modes want opposite
things:

| Mode | Surface | What it rewards |
|---|---|---|
| Persuade / Experience | landing pages, campaigns, portfolios | composition may be asymmetric, fluid, intentionally disruptive |
| **Operate / Read** | **this console, the sidebar, every table** | *"predictable structure, stable density, and navigable linearity are affordances"* |

This product is almost entirely **Operate**. The consequence is concrete:
conventions that read as filler on a landing page are orientation here, and
stripping them is a regression dressed as restraint.

It cost a revision to learn. The `CURRENT CAMPAIGN` section label was deleted
on the strength of the "kicker above a heading" ban — a Persuade-mode rule,
misapplied to a nav. The label is what tells you the six rows beneath belong to
a campaign rather than continuing the nav above; without it the row had to
shout (14px, 600, accent glyph) to explain itself, and read as a bold row
floating between two groups. Restoring the label let the row drop back to one
weight step, because **hierarchy belongs to structure — label, indent, spine —
not to type compensating for missing structure.**

Nav section labels are the convention in every comparable console (Linear,
Notion, Slack, Figma). Being conventional is the point in Operate mode.

### Sidebar hierarchy (researched)

Sourced from Notion/Linear teardowns and current sidebar-UX guidance, not taste.
Numbers are theirs; the values in brackets are what this sidebar does.

| Finding | Here |
|---|---|
| *"Active state should not rely on color alone — add weight, icon fill, or left indicator."* | **Three** signals: peach wash + 500 weight + **filled glyph**. The fill was specified in §5.6 when the iconography sheet landed and went unwired for four revisions; `weight={active ? "fill" : "regular"}`. |
| *Sub-items: "slightly smaller 13-14px, lighter, indented 16-24px"* | Scoped children 12.5px `--ink-2`, indented 18px. They were 13px `--ink` — identical to top-level — which is why the block read flat. |
| *"Core capabilities cannot rely solely on hover"* (no hover on touch) | The `···` is always rendered at 0.6 opacity, not hover-only. |
| *Collapse transition 200-300ms; remember the preference* | 260ms; `railed` persists in localStorage. |
| *Indent guides: `border-inline-start` on the nested container, inset under the parent's glyph* | Spine at x=36, the icon-box centre. |
| *"One consistent icon set; filled variant for active"* | Phosphor only, one weight, fill on active. |

**The rank that falls out of it:**

| Level | Type | Colour | Wash |
|---|---|---|---|
| Scope row | 13px **600** | `--ink` | none |
| Top-level nav | 13px 400 | `--ink` | none |
| Scoped child | 12.5px 400 | `--ink-2` | none |
| **Current page** | +500, filled glyph | `--ink` | peach |

**One wash per block.** The fill briefly sat on the scope row, copied from a
reference where the project row *is* the current page — so its single fill
answers both questions at once. Here the current page is usually a child, so
the same move produced two peach blocks two rows apart with nothing to rank
them. Priority settles it: *where am I* beats *what scope am I in*. The wash
goes to the page; the scope row gets 600 weight, an accented glyph, and the
only overflow menu in the panel.

**Dynamic came from affordances, not decoration.** What fixed "reads static"
was the `···` menu, the `+ New search` action row, and sentence-case labelling
— not the fill, which was the part that had to come back out.

### Anti-tells

Adopted from [Impeccable](https://github.com/pbakaus/impeccable) — a design
language for AI coding harnesses, whose premise is that every model trained on
the same SaaS templates produces the same handful of giveaways. Three of these
were live in this sidebar and were caught by review before by the list:

| Tell | Status here |
|---|---|
| **Tinted rounded-square icon tile** | Removed from the campaign row. This is the canonical giveaway and it read as decoration bolted onto the row. |
| **Kicker / eyebrow above a heading** | Removed (`CAMPAIGN`). A flat ban, not a default: *the heading carries its own weight; delete the label and let the heading speak.* |
| **Colored `border-left` above 1px** on cards, list items, callouts | Removed from `.notice` (3px) and `.con-note` (2px). The asymmetric radius `.con-note` needed (`0 12px 12px 0`) was the tell that the stripe was driving the shape. |
| **Zero-offset colored halo as depth** | None left. The bell badge's ring became a real `border` — structurally a knockout between two objects, not a shadow imitating one. Depth here means offset + soft blur (§4.1). |
| Gradient text; glass as decoration; hard offset shadows; nested cards; unicode or emoji as icons; monospace as costume | Not present. Audited in the browser, not assumed. |

**Browser surfaces are part of the design.** Impeccable calls this the cheapest
signal that a page was built rather than assembled, and the one models skip
most reliably — and nothing here was themed. Now tinted from the palette:
`::selection` (the peach of an active row, with `--ink` on it at 10.67:1 —
never a grey on a tinted surface), `caret-color`, `accent-color` for
browser-painted form controls, `scrollbar-color` plus the WebKit pseudo-elements,
and `text-underline-offset`.

**Other craft-floor checks worth keeping in view:** more space above a heading
than below it; one authored motion moment rather than scattered effects;
tracking floor -0.04em; every state built (hover, disabled, loading, error,
empty) with real content and keyboard focus.

### The two rules that override taste

1. **Measured contrast wins.** Any of the above loses to a WCAG floor. Soft, warm and quiet are all achievable above 4.5:1; three values in the source reference were not, and they were changed rather than kept.
2. **Honesty wins.** If the data is not there, the UI says so. No fake charts, no placeholder avatars posing as people, no controls that imply a capability the backend lacks.

---

## 1. Where this revision came from

Revision 1 adapts a reference sheet titled **"TalentHub — Design System v1.0"**
(warm / human / purposeful; *"a modern hiring experience for a more human
future"*). It is a reference, not a brand: the product is SuperHyre, and the
existing site already has a documented palette with its contrast arithmetic
worked out in `access.css:50-71`. So this is an **evolution of the live tokens,
not a replacement**, and each row below states which.

The reference's own numbers, measured:

| Reference value | Measured | Verdict |
|---|---|---|
| `#D76127` primary, white text on it | **3.73:1** | ✗ below 4.5 — and dark text on it is 3.94:1, also below. **Neither colour is legible on this fill at body size.** |
| `#77846E` deep sage, white text on it | **3.95:1** | ✗ same problem, same fix |
| `#E57373` error as text on white | **2.99:1** | ✗ decorative only |
| `#F59861` secondary as text on white | **2.20:1** | ✗ fill only, never text |
| `#AFB29F` sage as text on white | **2.17:1** | ✗ fill only, never text |
| `#272923` text on `#FAF8F5` | **13.88:1** | ✓ |
| `#74766E` muted on `#FFFFFF` | **4.61:1** | ✓ on white only — **4.35:1 on `#FAF8F5`**, so it fails on the page background it ships with |

The first row is the same mistake the current site already made once and wrote
down: *"Orange panel, black type. Both `--accent-on-white` and white-on-accent
are 3.51:1, so an orange field can ONLY carry near-black text"* — `access.css:55`.
Adopting `#D76127` for buttons unchanged would reintroduce it. Rows below carry
corrected values.

---

## 2. Colour

### 2.1 Brand — *Proposed*

| Token | Hex | Use | Measured |
|---|---|---|---|
| `--primary` | `#D76127` | Fills, the mark, shapes. **Never small text.** | 3.73:1 on white — decorative and large-text only |
| `--primary-fill` | `#BF5623` | **Buttons that carry white text.** 11% darker than `--primary`. | white text **4.59:1** ✓ |
| `--primary-text` | `#B95322` | Primary colour used *as* text, links, active labels | **4.86:1** on white, **4.58:1** on `#FAF8F5` ✓ |
| `--secondary` | `#F59861` | Fills and tints only | dark text on it 6.69:1 ✓ / white 2.20 ✗ |
| `--accent` | `#FAB795` | Tint fills, hover washes | dark text 8.60:1 ✓ |
| `--accent-light` | `#FFDCC2` | Active nav row, selected states | dark text 11.39:1 ✓ |

The existing live token is `--accent: #ea5a1e`, and `--accent-deep: #b8400f`
(5.56:1 on white) already plays exactly the role `--primary-text` plays here.
**Decision needed** — see [Open questions](#open-questions) Q1.

### 2.2 Sage — *Proposed, new to the product*

A second hue family. Nothing in the live site has one; this is the largest
genuinely new idea in the reference and worth keeping, because it gives status
and category colour somewhere to live that is not the brand orange.

| Token | Hex | Use | Measured |
|---|---|---|---|
| `--sage` | `#AFB29F` | Fills, dividers, muted chips | dark text 6.79:1 ✓ / as text 2.17 ✗ |
| `--sage-deep` | `#77846E` | Large text, icons, borders | 3.95:1 — large text and UI only |
| `--sage-text` | `#6A7562` | Sage used as body text | **4.85:1** on white, **4.57:1** on bg ✓ |
| `--sage-fill` | `#6D7965` | Sage button carrying white text | white **4.59:1** ✓ |

### 2.3 Neutrals — *Proposed*

| Token | Hex | Use | vs live |
|---|---|---|---|
| `--bg` | `#FAF8F5` | Page | live console `--page: #f6f5f4` — near-identical, slightly warmer |
| `--surface` | `#FFFFFF` | Cards, fields | same as live `--card` |
| `--border` | `#E8E3DD` | Hairlines | 1.20:1 on bg — decorative only. For a **meaningful** boundary (focus ring, input outline) 3:1 is required; use `--sage-deep` or `--muted` |
| `--muted` | `#74766E` | Secondary text | **only on white (4.61:1)**. On `--bg` it is 4.35:1 ✗. Live `--ink-2: #6c6158` is 6.02:1 and safe on both — **prefer the live one** |
| `--text` | `#272923` | Body | 14.71:1 on white. Live `--ink: #271f18` is 16.21:1 |

### 2.4 Semantic — *Proposed*

Each has a **fill** form and a **text** form, because the reference's single
value fails as text in three of four cases.

| Role | Fill | Text | Measured (text, on bg) |
|---|---|---|---|
| Success | `#77846E` | `#6A7562` | 4.57:1 ✓ |
| Warning | `#F59861` | `#9F633F` | 4.57:1 ✓ |
| Error | `#E57373` | `#AE5757` | 4.61:1 ✓ |
| Info | `#5B86E5` | `#4C6FBE` | 4.58:1 ✓ |

Success and the sage family are the same hue on purpose — "good" and "calm"
being one colour is a deliberate simplification, not an oversight. Say so if you
want them separated.

---

## 3. Typography

### 3.1 Family — *Blocked on a decision*

The reference specifies **Plus Jakarta Sans** for everything. The live site
loads **five** families already, each with a written justification
(`access.css:36-46`):

| Live token | Family | Role |
|---|---|---|
| `--ui` | IBM Plex Sans | All interface text |
| `--serif` | Fanwood Text | Body / editorial |
| `--pixel` | PP Mondwest | Display, collage words |
| `--wm` | Helvetica Neue | The SUPERHYRE wordmark |
| `--word` | Space Grotesk | Small uppercase taglines |

Adding a sixth is not free — it is another render-blocking request in front of a
form. The only version of this worth doing is **Plus Jakarta Sans replaces IBM
Plex Sans as `--ui`**: one swap, no net addition, and it is the role the
reference actually cares about. See Q2.

### 3.2 Scale — *Proposed, adopt as-is*

Straight from the reference, no objection — it is a clean 4px-grid scale.

| Step | Size / line | Weight | Use |
|---|---|---|---|
| H1 | 32 / 40 | 600 | Page title |
| H2 | 24 / 32 | 600 | Section |
| H3 | 18 / 28 | 600 | Card title |
| Body | 16 / 24 | 400 | Default |
| Small | 14 / 20 | 400 | Secondary, meta |
| Caption | 12 / 16 | 400 | Timestamps, labels |

**Rule:** 12px never carries anything the user must read to act. Contrast floors
above assume body size — at Caption, use `--text`, never `--muted`.

### 3.3 Ink — *Adopted at revision 4*

**The problem:** `--ink` was `#271f18`, measured **16.21:1** on white. Pure black
is 21:1, so at 16 the eye reads it as black — and near-black text on a warm
surface is the single loudest thing on the page. It fought the accent, flattened
the weight hierarchy (600 and 400 look equally heavy when both are that dark)
and is the opposite of the "warm yet professional" §0 asks for. Every other
decision in this file is quiet; this one was shouting.

**The fix:** lighten along the same warm axis, do not go grey.

| Token | Value | on white | on console page | on auth sand | on peach active |
|---|---|---|---|---|---|
| `--ink` | `#312a23` | **14.13** | 12.98 | 12.12 | 11.79 |
| `--ink-2` | `#5c524b` | 7.60 | 6.98 | 6.51 | 6.34 |

12.80 is still emphatic — Notion's body ink sits at ~12.6 — while dropping 3.4
points of glare. The worst case across all four surfaces is 10.67, so there is
more than double the AA headroom; this is not a contrast compromise, it is
removing contrast that was doing no work.

**Hierarchy comes from weight and size, not from more darkness.** With the ink
softened, 600 vs 400 is legible as a difference again, which is what makes the
"clean typography" clause of §0 achievable:

| Role | Colour | Weight |
|---|---|---|
| Page title, card title | `--ink` | 600 |
| Body, nav row | `--ink` | 400 |
| Active nav row | `--ink` | 500 |
| Secondary, meta, hint | `--ink-2` | 400 |
| Faded label (§5.3) | `#7e746c` | 500 |

**Rule:** there is no third ink. Reach for weight, size, or `--ink-2` before
inventing a fourth grey — a five-value text ramp is how a palette stops being
legible as a system.

---

## 4. Shape, motion, spacing

*Adopted — these already exist and the reference does not contradict them.*

| Token | Value | Use |
|---|---|---|
| `--r-pill` | `100px` | Interactive controls |
| `--r-card` | `20px` | Containers |
| `--r-field` | `10px` | Inputs inside a card |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Entering, exiting, acknowledging |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Moving between two on-screen positions |
| `--t` | `150ms var(--ease-out)` | Default transition |

Two standing rules from `access.css:104-126`, still in force: **three radius
tiers only**, and **`ease-in` appears nowhere** — it delays the first frames,
which is exactly when someone is watching.

Spacing is a **4px grid**. The reference implies it; nothing conflicts.

### 4.2 Planes — *Adopted at revision 18*

**The panel is a ground, and rows are tiles on it.** The panel was `#ffffff`,
which made it the same plane as everything drawn on it — a hovered row had
nowhere to go, so hover had to be a slightly *darker* grey: a recess pretending
to be a response. Inverting that is what lets hover and select be lifts.

| Plane | Value | What sits here |
|---|---|---|
| Page | `#f6f5f4` | the content area, deepest |
| **Panel (ground)** | **`--nav-panel: #faf8f5`** | the sidebar, its foot, and every recess inside a tile |
| Tile | `--nav-surface: #ffffff` | hovered rows, popovers, the quick-find face |
| Tinted tile | `--nav-active: #fbe7d7` | the current page |

`#faf8f5` is not a new colour — it is the `--bg` already documented in §2.3, so
the ground comes from the palette rather than from feel.

**Hover shades, select lifts.** Two different jobs, and only one raises
anything:

| State | Fill | Elevation | Timing |
|---|---|---|---|
| Hover | `--nav-hover` — a **3% neutral overlay** | none | `--t-dim` (240ms) |
| Select | `--nav-active` peach | `--e1` | `--t` |

Hover was briefly an opaque white tile under a full `--e1`, and on the warm
ground that read as a hard card punched out of the panel — far too much event
for a pointer crossing a list. The 3% wash composites to `#f4f2ef` on the
ground, separating by **1.054:1**, which is almost exactly the **1.053** the
original `#f9f9f8` gave against the old white panel: the same faint silver step
the sidebar always had, now as a tint that works on *any* surface beneath it.

It is **translucent** on purpose — one token over the warm ground, a white
popover, or a peach row, with no per-surface variants. And **neutral**, not
warm: shade is an absence of light, so tinting it warm makes it read as a
colour wash.

`--t-dim` (240ms) is the one documented exception to "motion under 200ms". At 3%
there is not enough contrast for the eye to register a step — snapping it reads
as a twitch, so it dims in and out gradually. That gradual fade is what lets the
tint be this quiet.

The lift belongs to select alone, and that contrast is the point: **give both a
shadow and neither means anything.** `--e1`, not `--e2` — `--e2` belongs to the
quick-find trigger, and a nav row must not out-rank the panel's primary control.

**Rows need a 3px gap.** Flush rows were fine while only one carried a fill, and
wrong the moment two adjacent ones did — a selected row beside a hovered one
merged into a single tinted block with a colour change through the middle,
reading as one object rather than two states. On the *list* (`gap`), never as
margins on the rows, which would collapse through their `li` parents and
silently halve.

**Rules this created:**

- **`--nav-hover` means *lifted*, and is `#ffffff`.** It was `#f9f9f8`, which
  measures **1.006** against the new ground — literally invisible. Anything that
  wants to look *recessed* inside a white tile (the `⌘K` chip, the switcher's
  search field, the palette's `kbd`) takes `--nav-panel`, never `--nav-hover`.
- **Changing the panel moves the surface every border is measured against.**
  `--nav-notch` was `#D08152` at 3.02:1 on white and **2.85:1** on the new
  ground — a failed 1.4.11 boundary. Darkened 3% to `#ca7d50`, back to 3.02:1.
- **The panel casts sideways only** (`1px 0 3px / 0.04`). Light from above means
  a vertical edge throws horizontally; a shadow all round would read as a
  floating sheet rather than fixed chrome.
- Text re-measured on the new ground: `--ink` 13.33:1, `--ink-2` 7.17:1,
  tone-1 5.81:1, `--accent-deep` 5.24:1. All pass.

### 4.1 Elevation — *Proposed*

"Subtle Tactile" and "restrained shadows" are the two clauses most likely to be
read as licence for a glow, so they get numbers. Four steps, and the resting
surface is step 0:

| Step | Shadow | Where |
|---|---|---|
| `--e0` | none | Cards, panels, the sidebar. A hairline does this job. |
| `--e1` | `0 1px 1px /.05` + `0 2px 6px /.07` | A control that should read as liftable — the search field at rest. |
| `--e2` | `0 1px 1px /.05` + `0 5px 14px /.09` | The same control on hover. This is "popped out" in full. |
| `--e3` | `0 16px 40px rgba(58,35,23,0.14)` | Genuinely floating and dismissable: popovers, the palette, the mobile drawer. |

Rules, in force:

- **Opacity never exceeds 0.14**, and only `--e3` reaches it. Past that the
  warm brown reads as grey smear on `--bg`.
- **Shadow is never a control's only boundary.** WCAG 1.4.11 wants 3:1 for the
  edge that identifies a component, and a shadow does not measure — so every
  elevated control keeps its 1px border underneath. Removing the border because
  "the shadow shows it" is the failure this rule exists to stop.
- **Colour is `rgba(58,35,23,…)`**, not black. Neutral-black shadow on a warm
  surface is the other half of what made the old console read grey.
- **One step per interaction.** `--e1 → --e2` on hover is the whole vocabulary;
  jumping to `--e3` on hover makes a resting field look like a dialog.
- **`--e1` and `--e2` are TWO layers**, and that is what makes a control read as
  raised: a tight contact shadow says the object touches the surface, a wider
  ambient one says it sits above it. One alone reads as a hairline or as a
  float, never as a raised thing. The single-layer `0 1px 2px / 0.05` this file
  first specified is precisely why the quick-find trigger looked flat.
- **A shadow cannot lift a surface that has no surface.** The trigger was
  `#ffffff` on a `#ffffff` panel: zero contrast against its surround, so only
  its border separated them, and a 1px hairline is a boundary rather than a
  height. It needed a face of its own first — a near-imperceptible
  `linear-gradient(180deg, #fff, #fdf9f6)`, light from above, which is the only
  lighting model in the file. Elevation second.
- **They are tokens now.** `--e1`/`--e2`/`--e3` existed only inside comments for
  several revisions while every shadow was hardcoded; the scale was
  documentation, not a rule. Defined at `:root`.
- **One documented exception**, the sign-in hero card: three layers with
  negative spreads, peaking at 0.18. It is a Persuade-mode surface, where §0
  allows more expressive composition, and the scale governs Operate-mode
  chrome. Marked as such in the CSS so nobody "fixes" it or copies it inward.

---

## 5. Components

Specs below describe the reference. ✅ = exists in code · 🔶 = partly · ⬜ = new.

### 5.1 Buttons ⬜ *(spec)*

| Variant | Fill | Text | Border |
|---|---|---|---|
| Primary | `--primary-fill` | white | none |
| Secondary | `--sage` | `--text` | none |
| Tertiary | `--accent-light` | `--primary-text` | none |
| Destructive | `#FCE9E9` | `#AE5757` | none |

States: **Default** → **Hover** (one step darker fill) → **Pressed** (two steps,
no transform) → **Disabled** (`--border` fill, `--muted` text, `cursor:
not-allowed`). Focus is always a visible ring at ≥3:1 against the adjacent
surface — `--border` is too faint to be that ring.

### 5.2 Inputs 🔶 *(`components/Field.tsx` exists)*

`--surface` fill, `--border` hairline, `--r-field`. Focused: `--primary` border
plus ring. Optional leading icon, optional label above at Small. Placeholder at
`--muted` — **on white only**, per §2.3.

### 5.3 Sidebar navigation ✅ *(`Nav.tsx`, `Console.tsx`)*

Built. Tokens: `--nav-w: 256px`, `--nav-pad: 16px`, `--nav-w-rail` **derived** as
`--nav-pad * 2 + --nav-icon-box` = 68px, `--nav-bp: 900px`, `--nav-active:
#fbe7d7`, `--nav-notch: #D08152`.

**Order, top to bottom** — this is "contextual navigation" made literal:

1. **Mark + nudge.** Logo left, collapse notch hard right. The caret points
   where the panel will *go*, not where it is; a control is read as a verb.
2. **Workspace switcher.** At the very top, above search. Scope is the first
   question ("which account am I in"), so it is answered before anything is
   offered. This also puts the two identity controls at opposite ends —
   *which workspace* at the top, *who am I* at the bottom — rather than
   stacking both in the foot where they competed.
3. **Search + notifications.** Pill-radius field at `--e1`, bell in a circle.
4. **Product nav.** Home · Campaigns · Contacts · Analytics *(collapsible)* ·
   Integrations.
5. **Campaign scope.** A quiet `Campaign` label, then the campaign name as an
   **always-open dropdown title** owning its six rows. No divider above it —
   the whitespace does that work (§0, Minimalism).
6. **Support**, pinned.
7. **Profile.** Click opens a menu holding sign-out. Sign-out is not a
   permanent row: it is the least-used control in the sidebar and was taking
   the most visually prominent slot in the foot.

**Why the campaign name is a dropdown that never closes.** It reads as a
disclosure title so the six rows below are visibly *its* children rather than a
second flat list — the hierarchy is the information. It does not collapse
because collapsing it would hide the working context, which is the one thing
this block exists to keep on screen. The caret is therefore decorative and
`aria-hidden`; the control is not a button, because a button that cannot change
anything is a lie. When campaign *switching* exists this becomes a real
`aria-expanded` menu and the caret earns its keep.

The reference's own nav (Jobs · Interviews · Messages · Projects) is a
different product. Live nav is backed by real tables (`nav.ts`); do not reorder
it to match a mock — the rule is written at `Console.tsx:28-31`.

### 5.3.0 Organisation vs workspace — *the model, not a style*

These were one value in the code and they are not one thing. Recording it here
because the confusion shaped the UI, and the same mistake is available to anyone
laying out a header again.

| | What it is | Where it appears |
|---|---|---|
| **Organisation** | The **tenant**. One row in `core.organizations`, one `tenant_<slug>` schema, the boundary every RLS policy is written against. A person resolves to exactly one; it is not switchable from a sidebar. | The **account row** at the foot, under the person's name. |
| **Workspace** | The **scope you work in**, inside that boundary. Two levels: `user` (private to you — the `public` schema, `scope: "solo"`) and `org` (shared across the tenant, `scope: "tenant"`). | The **switcher** at the head, grouped under the organisation. |

The bug: `ownWorkspace()` returned the *organisation's name as the workspace's
name* and described the organisation as a workspace with the hint
`"Your organization"`. So the header claimed to switch something unswitchable,
and the tenant had no home of its own.

**Where each now lives, and why:**

- The **switcher** groups by level — `Your workspace` for the user-level row,
  then the organisation's name as a heading over the shared ones. The org
  heading is styled as a proper noun (600, ink, rule above) rather than a
  category label, because `Your workspace` names a kind and `Harness Org` names
  a thing; they must not read as the same line.
- The **account row** shows name over organisation. It is the tenant identity —
  who you are and which boundary you are inside — and it is where the
  organisation had to go once the switcher stopped pretending to be it. The
  email moved to the account menu, where a detail belongs.
- Org-level rows are **disabled**: switching a workspace changes which schema is
  read, and there is no membership table to switch against. This is the one
  place the campaign switcher and the workspace switcher differ on purpose —
  re-scoping a campaign label is a true statement about UI state, re-scoping a
  workspace would be a claim about data access.

### 5.3.1 Quick find ✅ *(`Nav.tsx`, `Palette.tsx`)*

A **trigger**, not an input. It looks like a field and behaves like a button:
clicking opens the command palette, so there is never a text cursor in the
sidebar competing with the palette's own.

| State | Border | Elevation |
|---|---|---|
| Rest | `1px --nav-notch` (3.02:1) | `--e1` |
| Hover | `1px --nav-notch` + a **travelling arc** on the border | `--e1` |
| Focus | `--accent-deep` + `--focus` outline | `--e1` |

`--r-pill`, not a fourth radius tier — §4's "three tiers only" holds.

#### The hover glow is a patch travelling at constant speed

Three versions; the first two are recorded because each failed for a different
measurable reason.

**v1 — a 3px halo on the whole perimeter, plus an `--e2` lift.** Rejected:
lighting the entire boundary at once reads as *the control is in an error
state*, and the lift made a resting field look pressed.

**v2 — a `conic-gradient` arc rotated by a registered `@property` angle,
masked to the border with `mask-composite: exclude`.** Worked, and lurched. A
conic sweep is constant in **degrees**, not in perimeter distance, and this
trigger is a 191×34 stadium. From its centre:

| Segment | Length | Angle subtended | Speed |
|---|---|---|---|
| Straight run (×2) | 157px | 155.6° | 1.01 px/deg |
| Cap (×2) | 53.4px | 24.4° | 2.19 px/deg |

**2.17× variation, four times per lap** — crawling along the long edges,
accelerating round the ends. The pill shape is deliberate, so the fix could not
be to change the shape.

**v3 — CSS motion path.** What ships.

- `offset-path: border-box` follows the containing block's border box
  *including its radius*, which is the stadium the eye actually sees.
- `offset-distance` is a percentage of **path length**, so a `linear` animation
  on it is genuinely constant px/s whatever the outline. Measured after the
  change: 24 equal steps produced segments of 16.8–17.5px, a ratio of **1.04**,
  and the residual is chord-vs-arc sampling error at the caps rather than speed
  variance.
- **Never ease this animation.** Any easing reintroduces exactly the
  non-uniform speed motion path was adopted to remove.

**v4 — a circle on the motion path.** Geometrically correct at every
curvature, because a circle has no orientation and so no tangent to leave the
curve along. Rejected on looks: it reads as a dot, not a streak.

**v5 — what ships: an SVG dash on the outline itself.** Stop moving an object
*along* the border and let the light *be* part of it. A `<rect>` matching the
control's shape, stroked, with a dash gap swept by `stroke-dashoffset`. A dash
is a length of the path, so it curves with the path — corner behaviour is not
something this version gets right, it is something it cannot get wrong.

- `pathLength="100"` renormalises the geometry so `stroke-dasharray` and
  `stroke-dashoffset` are percentages of the perimeter. The sweep is therefore
  constant-speed and loops seamlessly at whatever width flex gives the button,
  with no perimeter to measure in JS and nothing to recompute on resize.
- Two rects: a 1.6px `--accent` core and a 5px `rgba(234,90,30,0.55)` blurred
  bloom. One stroke cannot be crisp and soft at once.
- **The corner radius is the trap.** `rx: var(--r-pill)` (100px) rendered a
  *stretched ellipse*: SVG clamps the two radii **independently**, rx to
  width/2 and ry to height/2, so one oversized value became a 94×15 corner and
  the streak swept a shallow arc across the interior. Invisible at 1× and
  obvious at 4×. The fix is to set **only `ry: 50%`** and leave `rx: auto`,
  which per SVG2 geometry takes ry's used value — a circular cap derived from
  the height, correct at 34px and at the 40px the control takes on a coarse
  pointer. Verified by path length: the ellipse measured 388px, the stadium
  measures 408px, and $2(187-30) + 2\pi(15) = 408.2$.
- **A line that glows — not a line, and not a glow.** Three attempts, and the
  first two each missed on one side:

  | | Recipe | Why it failed |
  |---|---|---|
  | v5 | one 1.6px opaque stroke | a *drawn line*; no light, findable edge |
  | v6 | 2/4/8px, blur to 4.5px, peak 0.42 | a *cloud*; no line in it, read as a smudge detached from the border |
  | v7 | 1.3/3.2/6px, blur to 3.5px, peak 0.9 | ships |

  The neon recipe is a thin genuinely **bright** core, a tight halo hugging it,
  and a faint outer lift — every layer pulled *toward* the line so the glow
  stays attached to it:

  | Layer | Dash | Width | Opacity | Blur |
  |---|---|---|---|---|
  | lift | 22 | 6px | 0.13 | 3.5px |
  | halo | 17 | 3.2px | 0.30 | 1.6px |
  | core | 13 | 1.3px | 0.90 | 0.3px |

  The core carries real opacity because something has to *be* the line; at
  1.3px under a third of a pixel of blur it still has no hard edge. Lengths are
  a gentle 13/17/22 rather than a steep 9/17/26 — close lengths read as a
  segment of light, a steep taper reads as a blob.
- **A dash cannot fade towards its own ends.** `stroke-linecap: round` gives a
  *rounded* end, not a faded one, and SVG has no gradient along a dash. Three
  nested dashes therefore produce three stacked hard ends and read as a segment
  with steps in it. Blur does not rescue it: blur is isotropic, so softening an
  end by the amount needed also fattens the line into a cloud.

  So the falloff is **sampled** — sixteen dashes from one curve
  (`GLOW_LAYERS` in `Nav.tsx`), each slightly shorter, narrower, brighter and
  sharper than the last. Ends land ~1 unit apart and overlap under their own
  blur, so the ramp reads as continuous; the composite is faint where only the
  long faint layers reach and bright where all sixteen coincide. Per-layer
  opacity stays low because sixteen composite as $1 - \prod(1 - a_i)$.
- **Centre the layers by PHASE, never by arithmetic in the offset.** Each layer
  animates `stroke-dashoffset` over exactly one dash period, so a lap ends
  where the next begins and the loop has no seam; the shorter layers are
  started *ahead* with a negative `animation-delay` of
  $(\text{len}/2 - 13)/100 \times \text{duration}$.

  The version before this fed an inherited `--nav-sweep` number through a
  `calc()` in every layer, every frame. It froze correctly at any given value
  and was wrong in motion — sixteen calcs re-resolving from one inherited
  variable are not guaranteed to stay in phase, and the variable's own
  100 → 0 wrap is a discontinuity inside a loop that should have none. That is
  the jump, and the layers pulling apart into visibly separate lines. Verified
  after the change by sampling all sixteen dash centres across live frames:
  circular spread 0 on every frame.
- **The stroke must sit on the border's CENTRELINE.** The SVG viewport is the
  padding box, already 1px inside the border box, so the 1px border's
  centreline is 0.5px *outside* the viewport — `x: -0.5px` with
  `width: calc(100% + 1px)`. An earlier `0.8px` inset put the stroke ~1.3px
  inside the visible border, which is why the glow looked like a separate
  smudge floating beside the line instead of the line itself glowing. `ry: 50%`
  then clamps to 16.5px, exactly the centreline's radius, for free.
- **One clock.** `--nav-sweep` is a registered `<number>` animated once on the
  `<svg>` and inherited, so all three layers derive their offset from the same
  value. Animating each rect separately lets them drift a frame apart and the
  taper comes visibly apart.
- **`* 1px` on every calc is load-bearing.** `stroke-dasharray` and
  `stroke-dashoffset` take a `<length>`; a calc resolving to a bare *number* is
  invalid CSS and falls back silently. Plain literals like `14` are fine (SVG
  presentation-attribute semantics), which is why the single-dash version
  worked without it — a calc is not. With no viewBox, one user unit is one
  pixel, so px maps exactly onto the `pathLength=100` scale.
- **Never `rx: 50%; ry: 50%`.** Percentages resolve per-axis against the
  viewport, which reintroduces the ellipse exactly.

**Rule this generalises to:** anything placed on a motion path must be shorter
than the tightest radius it will travel, or be radially symmetric. Otherwise
the corner geometry decides how it looks, and the corner always wins.

**No elevation change on hover.** The patch is the whole feedback.

**Fallbacks.** `offset-path: <coord-box>` is Chrome 116+ / Safari 18.2+; where
it is missing the patch would sit motionless at the origin, which looks like a
rendering bug, so `@supports not` hides it and warms the border instead —
the same answer `prefers-reduced-motion` gets, since a looping travelling
highlight is precisely what that setting is for.

### 5.3.2 Command palette ⬜ *(`Palette.tsx`)*

Notion / Linear shape, and the first piece of "AI-native conversational"
groundwork: one input, a filtered list, keyboard-first.

- `⌘K` / `Ctrl-K` opens from anywhere; `Escape` closes; `↑ ↓` move; `Enter`
  navigates. Arrow keys must `preventDefault` or the list scrolls *and* the
  caret moves.
- Overlay at `--e3` over a `rgba(40,24,16,0.34)` scrim — same scrim as the
  mobile drawer, one dismissal vocabulary.
- Focus moves into the input on open and **returns to the trigger on close**.
  Skipping the return is the most common palette bug: focus lands on `<body>`
  and the next Tab restarts at the top of the page.
- Results are grouped and every row names its section, because "Agent" appears
  twice in this product (Analytics → Agent, and the campaign's Agent) and the
  group is the only thing that disambiguates them.
- Empty query lists everything rather than nothing: a palette that starts blank
  hides the fact that it is a navigator.

### 5.4 Cards ⬜ *(spec)*

Three kinds in the reference:

- **Person** — avatar + presence dot, name (H3), role, location, skill tags, two
  actions (tertiary "View Profile" + primary "Shortlist").
- **Job** — icon tile, title (H3), meta row (dept · type · location), 2-line
  description, tech tags, footer (applicant count · posted), bookmark toggle.
- **Stat** — label (Small, `--muted`), value (32px 600), delta with arrow
  (`--sage-text` up / `--error-text` down), area sparkline in `--accent`.

All: `--surface`, `--r-card`, `--border` hairline, no drop shadow.

### 5.5 Tags & badges ⬜ *(spec)*

- **Category** (Frontend / Backend / Product / Design) — tinted pill, dark text.
- **Employment** (Full-time / Part-time / Contract / Internship) — outline pill.
- **Status** (Applied / Interviewing / Hired / Rejected) — leading dot, using
  Info / Warning / Success / Error **text** values so the label is legible.

Status must never be carried by colour alone — the dot plus the word, always.

### 5.6 Icons — *Proposed; the library is already Adopted*

Sourced from a second reference sheet, **"TalentHub — Iconography System v1.0"**
(*"icons for a more human hiring experience"* · consistent icons, clearer
journeys). Its five principles — Simple, Consistent, Human (rounded geometry),
Flexible (outline + filled), Purposeful (every icon has a clear meaning) — are
the argument for the library already installed, not against it.

**`@phosphor-icons/react@2.1.7` is already a dependency**, already used in
`Nav.tsx`, `Cards.tsx` and `components/Field.tsx`. All **58 icons** in the
reference were checked against the installed package's 1,512 exports: **every
one exists.** No new dependency, no SVG sprite to maintain, no hand-drawn set.

#### Specs, and how Phosphor already satisfies them

| Reference spec | Phosphor | Verdict |
|---|---|---|
| Stroke 1.75–2px | `bold` = 1.69px @18px, 1.88px @20px, 2.25px @24px | ✓ `bold` is the match. `regular` is 1.13px @18px — far too light |
| Round cap + round join | Round by design | ✓ nothing to configure |
| Outline default | Default weights are outline | ✓ |
| Filled for active/selected | `weight="fill"` | ✓ swap the prop, same component |
| 18px default (sidebar) | `size={18}` | ✓ |
| 16 / 20 / 24px | `size` prop | ✓ |

`ICON_WEIGHT = "bold"` already exists in `components/Field.tsx:6` and is already
the correct value. **Move it** to a shared module when icons spread past that
file — an icon constant living inside a form-field component is where the next
person will not look for it.

#### States — two values need correcting

Icons are **UI components**, so the floor is WCAG 1.4.11's **3:1**, not the
4.5:1 body-text floor. That difference is load-bearing: `#D76127` **fails as
text** (3.73:1 vs 4.5) but **passes as an icon** (3.73:1 vs 3.0). The same hex
is legal here and illegal in §2.1.

| State | Reference | on white | on `--bg` | on `--nav-active` `#fbe7d7` | on `--accent-light` `#FFDCC2` |
|---|---|---|---|---|---|
| Default | `#74766E` | 4.61 ✓ | 4.35 ✓ | 3.84 ✓ | 3.57 ✓ |
| Hover | `#D76127` | 3.73 ✓ | 3.52 ✓ | 3.11 ✓ | **2.89 ✗** |
| Active | `#D76127` filled | 3.73 ✓ | 3.52 ✓ | 3.11 ✓ | **2.89 ✗** |
| Disabled | `#C9C6C0` | 1.70 | 1.61 | 1.42 | 1.32 |

**The active-state bug.** The reference pairs an orange icon with a peach
active-row tint — and on its own `--accent-light` `#FFDCC2` that lands at
**2.89:1**, under the floor. The live `--nav-active` `#fbe7d7` scrapes through at
3.11:1. So: **keep the live `#fbe7d7` for the active row, not `#FFDCC2`**, or
darken the icon to `--primary-text` `#B95322` (3.76:1 on `#FFDCC2`) — which also
resolves Q1 in the same stroke. This is the second time the peach-on-orange
pairing has failed a measurement in this document.

**Disabled is exempt** from 1.4.11, so `#C9C6C0` is permissible — but it must
never be the *only* signal. Pair it with `aria-disabled` and a non-colour cue,
per the same rule §5.5 applies to status.

**Error as an icon colour fails too**: `#E57373` is **2.99:1** on white, a
hair under. Use `--error-text` `#AE5757` for icons as well as text, and keep
`#E57373` for fills only.

#### Semantic icon colours

| Role | Hex | on white | Verdict |
|---|---|---|---|
| Default | `#74766E` | 4.61 | ✓ |
| Primary | `#D76127` | 3.73 | ✓ as icon only |
| Success | `#77846E` | 3.95 | ✓ |
| Info | `#5B86E5` | 3.51 | ✓ |
| Error | `#E57373` | 2.99 | ✗ → use `#AE5757` |
| Disabled | `#C9C6C0` | 1.70 | exempt, never sole signal |

#### The map — all 58, verified against the installed package

**Navigation** · Home `House` · Jobs `Briefcase` · Candidates `Users` ·
Interviews `CalendarBlank` · Analytics `ChartBar` · Messages `ChatCircle` ·
Shortlist `Bookmark` · Projects `SquaresFour` · Settings `Gear` ·
Support `Lifebuoy`

**Actions** · Add `Plus` · Search `MagnifyingGlass` · Filter `SlidersHorizontal`
· Sort `ArrowsDownUp` · Link `LinkSimple` · Edit `PencilSimple` ·
Delete `Trash` · Share `Export` · More `DotsThree`

**People & hiring** · User `User` · Add user `UserPlus` · Recruiter `UserCircle`
· Featured `Star` · Hire `ThumbsUp` · Reject `ThumbsDown` · Schedule `Clock` ·
Feedback `Headset`

**Content & files** · Document `FileText` · Attachment `Paperclip` ·
Folder `Folder` · External link `ArrowSquareOut` · Tag `Tag` · Info `Info`

**Location & organisation** · Location `MapPin` · Company `Buildings` ·
Remote `Globe` · Education `GraduationCap` · Department `MapTrifold` ·
Office `Building`

**Status & feedback** · Pending `Clock` · Interviewing `CircleDashed` ·
Hired `CheckCircle` · Rejected `XCircle` · Warning `Warning` · Info `Info` ·
Shortlisted `Star` · Viewed `Eye`

**Product & misc** · Activity `Lightning` · Growth `TrendUp` ·
AI/Match `Sparkle` · Theme `Sun` · Notifications `Bell` · Dark mode `Moon`

**Arrows & direction** · Back `ArrowLeft` · Forward `ArrowRight` · Up `CaretUp`
· Down `CaretDown` · Expand `ArrowsOutSimple` · Open `ArrowSquareOut`

#### Standing rules

- **One meaning per glyph.** `Clock` is Pending *and* Schedule in the reference,
  `Star` is Featured *and* Shortlisted, `ArrowSquareOut` is External link *and*
  Open, `Info` appears twice. Acceptable where the contexts never meet; pick
  different glyphs the moment two of them can appear in one view.
- **Arrows vs carets is a real distinction**, not a style choice: arrows
  (`ArrowLeft` / `ArrowRight`) move you somewhere, carets (`CaretUp` /
  `CaretDown`) disclose something in place. The reference already splits them
  this way — keep it.
- **Icon-only controls always take an accessible name.** Decorative glyphs take
  `aria-hidden="true"`, as `Field.tsx:37` already does.
- **Import named components, never a dynamic-string lookup.** `import { House }
  from "@phosphor-icons/react"` is tree-shaken; resolving a name at runtime
  pulls all 1,512 in.

### 5.7 Illustration ⬜ *(spec)*

Overlapping organic blobs in `--accent` / `--sage` at partial opacity, plus
handwritten script accents. The live sign-in surface already does a restrained
version of this (`.deco` squares in `App.tsx:283-286`, fragments of the logo
staircase). Keep it inert and `aria-hidden`, as that one is.

---

## 6. Verifying a colour change

Every ratio in this file was computed, not estimated. To re-check after an edit:

```js
const hex=(h)=>{let s=h.replace('#','');if(s.length===3)s=s.split('').map(c=>c+c).join('');
  const n=parseInt(s,16);return[(n>>16)&255,(n>>8)&255,n&255];};
const lin=(c)=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
const L=(h)=>{const[r,g,b]=hex(h);return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);};
const ratio=(a,b)=>{const x=L(a),y=L(b),[hi,lo]=x>y?[x,y]:[y,x];return(hi+0.05)/(lo+0.05);};
```

Floors: **4.5:1** body text · **3:1** large text (≥24px, or ≥18.66px bold), icons,
and any boundary that carries meaning · decorative only below 3:1.

Check every foreground against **both** `--surface` *and* `--bg`. The reference's
`--muted` passes on one and fails on the other, which is exactly the failure this
step catches.

---

## 7. Open questions

**Q1 — Which orange?** Live `--accent: #ea5a1e` vs proposed `--primary:
#D76127`. They are 0.2 apart in contrast and visually close. Keeping `#ea5a1e`
means zero churn and `--accent-deep: #b8400f` already covers the text case;
switching means touching every token in two stylesheets. *Recommendation: keep
`#ea5a1e`, adopt only the sage family and the semantic pairs, which are the parts
the live palette genuinely lacks.*

*Now partly forced by §5.6:* the active nav row needs an orange that clears 3:1
on its own peach tint, and `#D76127` does not on `#FFDCC2`. Whichever orange
wins, the active-row pairing has to be one of the measured combinations.

**Q2 — RESOLVED: Inter.** Replaces IBM Plex Sans as `--ui`; one swap, no net
addition, still five families. Loaded as a variable face (`wght@300..700`) so
the 400/500/600 steps the hierarchy leans on are real instances rather than
synthesised. Impeccable lists Inter as an overused font, which is a statement
about landing pages reaching for character they did not earn — Operate-mode UI
read at 12-13px is where its neutrality is the point. **Carries one mandatory
correction:** `letter-spacing: -0.011em` on dense rows. Inter ships generous
default tracking for body sizes and at 13px in a 232px column it cost enough
width to start truncating the campaign name the moment the face changed. Well
inside the -0.04em tracking floor.

**Q3 — Sage in the console?** The live console is orange-and-neutral. Sage is
new. Does it enter as status colour only, or as a full secondary surface family?

**Q4 — Scope.** Which surfaces does revision 1 apply to — new pages only, or
retrofit `/access/` and the marketing site too?

**Q5 — Where does `ICON_WEIGHT` live?** Currently `components/Field.tsx:6`,
which is the wrong home for a system-wide constant. Move it to a shared module
(`icons.ts`?) the first time a third file needs it.

---

## Changelog

| Rev | Date | Change |
|---|---|---|
| 1 | 2026-09-15 | First draft. Adapted the TalentHub reference sheet; measured every colour and corrected the six values that fail WCAG; reconciled against the live tokens in `access.css` / `style.css`. Nothing adopted yet. |
| 2 | 2026-09-15 | Added §5.6 from the TalentHub Iconography sheet. Mapped all 58 icons to verified `@phosphor-icons/react` exports (no new dependency); confirmed `bold` is the weight that matches the 1.75–2px stroke spec; measured icon states against the 3:1 UI floor and found the orange-on-peach active row at 2.89:1 plus error at 2.99:1. Q5 added; Q1 now partly forced. |
| 3 | 2026-09-15 | Added §0 Philosophy, turning each clause into a reviewable rule with its own failure mode, plus the two overrides (measured contrast, honesty). Added §4.1 Elevation as four measured steps with an opacity ceiling and the "shadow is never the only boundary" rule. Rewrote §5.3 for the new sidebar order — workspace switcher to the top, sign-out into a profile menu, campaign block as an always-open disclosure with no divider — and added §5.3.1 Quick find and §5.3.2 Command palette. |
| 4 | 2026-09-15 | Softened `--ink` from `#271f18` (16.21:1, read as black) to `#38312a` (12.80:1) and added §3.3 Ink with the per-surface table and the no-third-ink rule. Rewrote the §5.3.1 hover glow as a constant-speed motion path after measuring the conic version at 2.17× perimeter-speed variation; now 1.04×. Campaign name became a clickable list row with a persistent `is-selected` wash, indented on the Analytics spine. Settings joined Support in the foot; the profile lost its carets; the nudge became `SidebarSimple` after `CaretLineLeft` rendered as a letter K at 14px. |
| 5 | 2026-09-15 | Campaign name stopped competing with its children: the peach wash became a tinted icon chip, so peach now means only "the page you are on" (three simultaneous highlights became one hierarchy). Widened the campaign block spacing. Glow patch became a circle after measuring the bar overshooting the 17px cap by 10.8px (core) and 19.2px (bloom) — both longer than the cap is wide, which was the diagonal spike at the edges. |
| 6 | 2026-09-15 | Glow became an SVG `stroke-dashoffset` sweep on the control's own outline — a dash is a length of the path, so it curves with the path and the corner cannot be wrong. Replaced the v4 circle, which was geometrically correct but read as a dot. Caught and fixed the per-axis `rx`/`ry` clamp that rendered a 94x15 elliptical corner instead of the pill's cap; confirmed by path length (388px ellipse -> 408px stadium, matching the closed form). |
| 7 | 2026-09-15 | Glow stopped reading as a drawn line: the single opaque dash became three nested dashes sharing one animated position and centred on it, peak opacity 0.42, every layer blurred — tapering along the path as well as across it. Caught that `calc()` resolving to a bare number is invalid for `stroke-dasharray`/`stroke-dashoffset` and was silently falling back, so every derived offset computed to nothing. |
| 8 | 2026-09-15 | Glow retuned from a cloud to a lit line: widths 2/4/8 -> 1.3/3.2/6, blur ceiling 4.5 -> 3.5, core opacity 0.42 -> 0.9, taper 9/17/26 -> 13/17/22. Also moved the stroke onto the border's centreline (x: -0.5px, not 0.8px) — it had been sitting 1.3px inside the visible border, which is why the light looked detached from it. |
| 9 | 2026-09-15 | Glow made smooth in motion. Falloff sampled across 16 dashes from one curve instead of 3 hand-tuned steps, since a dash cannot fade towards its own ends and blur only fattens it. Centring moved from a per-frame calc on an inherited animated variable to a negative animation-delay phase offset — the old approach could not be relied on to keep 16 layers in phase and its 100->0 wrap was a discontinuity mid-loop, which is what produced the opacity jump and the layers separating into two lines. Verified: circular phase spread 0 across live frames. |
| 10 | 2026-09-15 | Adopted Impeccable's anti-tell list as design system rules (new section in §0) and audited against it in the browser. Campaign row lost its tinted rounded-square icon tile and its `CAMPAIGN` eyebrow — both named tells — and is now marked editorially: 14px/600 name, accented glyph, extra air, ownership of the indented rows. Removed colored border-lefts above 1px from `.notice` and `.con-note`. Bell badge's zero-offset halo became a real knockout border. Themed the browser-owned surfaces (selection, caret, accent-color, scrollbars, underline offset), none of which had been. Thinned the glow again: widths 7->5px, peak alpha 0.16->0.09. |
| 11 | 2026-09-15 | Restored the `CURRENT CAMPAIGN` section label and recorded why its removal was wrong: visitor mode decides which rules apply, and the kicker ban is Persuade-mode guidance misapplied to an Operate-mode nav, where labels are affordances. With the label back, the campaign row dropped from 14px/600/accent to a single weight step — the over-styling had been compensating for the missing label. Verified with layout.md's squint test at blur(2.4px): groups read in order. |
| 12 | 2026-09-15 | Researched sidebar hierarchy against Notion/Linear teardowns and current sidebar-UX guidance; added §0 findings table. Wired `weight="fill"` on active glyphs — specified in §5.6 since the iconography sheet and never implemented, leaving the active state on wash+weight alone. Subordinated scoped children to 12.5px/`--ink-2` per the sub-item guidance (they matched top-level, which is why the block read flat). Removed the scope-row fill: one wash per block, and it belongs to the current page. |
| 13 | 2026-09-15 | Inter replaces IBM Plex Sans as `--ui` (variable, 300..700), resolving Q2; added the -0.011em tracking correction dense rows need, without which the campaign name truncated. Darkened both inks — `--ink` #38312a→#312a23 (12.80→14.13), `--ink-2` #6c6158→#5c524b (6.02→7.60) — 40% back toward the original without returning to the 16.21 glare. Fixed the Analytics dropdown: a previous edit deleted `.nav-sub-wrap > .nav-sub { min-height: 0; overflow: hidden }` as a duplicate of the wrapper's clip when it is not one, so the `0fr` track stayed floored at its item's 112px content height in both states. Moved the sublist's vertical padding into the open state — padding is not content, so `min-height: 0` alone still left a 4px floor. Removed the `+ New search` action row and its route. |
| 14 | 2026-09-15 | Campaign glyph Megaphone → `Kanban`: a campaign IS a pipeline (`org_candidates.stage`), so one glyph says "project with stages" — structural rather than a folder. Applied to both the nav item and the scope row. The `···` two-item menu became a real switcher: search field over the full campaign list, keyboard-first (focus to field, arrows, Enter, Escape), current row checked and filled, pinned "View all campaigns". Filters on name AND role. Selecting re-scopes the sidebar for real — campaign state lifted to Console so it survives the drawer remounting, and the palette's group label follows it. Popover sized to the content column after `right: 0` at 258px put its left edge 8px past the panel, which `.nav`'s `overflow: hidden` clipped rather than overhung. |
| 15 | 2026-09-15 | Campaign glyph settled by rendering, not by reasoning from names: built a sheet of 35 candidates at the real 18px in both outline and fill, on the real row, and looked. `Kanban` reads as a grid — rejected on sight. `FolderOpen` for the campaign you are inside (best fill of the set, unambiguous project read), `Folders` for the Campaigns collection — same family, meaningful plural, rather than one glyph on two different rows. Uniqueness comes from the treatment (accent + fill on active), not from an obscure glyph nobody reads as a project. |
| 16 | 2026-09-15 | Campaign switcher leaves the sidebar: rendered through a portal into `<body>` at `position: fixed`, 304px against the 268px panel. The panel's `overflow: hidden` (needed to clip labels during collapse) cannot be removed, and a popover should not inherit an ancestor's clip. Unboxed it per §0 minimalism — dropped the divider under the search, the divider above the footer, and the footer's tinted band, all doing jobs spacing already did; search became a soft `--r-field` input, rows 42px, footer a quiet accent row. Standardised popover radius on `--r-card`: this and the workspace/account menus had drifted to an off-scale 12px, a fourth radius §4 does not allow. Moved the `--nav-*` colour tokens from `.con` to `:root` — the portal left the custom-property scope and the popover rendered fully transparent with sidebar rows showing through. |
| 17 | 2026-09-15 | Elevation became real: `--e1`/`--e2`/`--e3` defined at `:root` after several revisions of existing only in comments while every shadow was hardcoded. `--e1`/`--e2` are now two layers (contact + ambient), which is what reads as raised. Quick-find trigger given a surface of its own — it was `#ffffff` on a `#ffffff` panel, and no shadow lifts a surface with zero contrast against its surround — plus the `--e1`→`--e2` hover step restored (the earlier removal was aimed at a halo that no longer exists). Clamped the mobile drawer to `--e3` and documented the sign-in hero as the single deliberate exception to the 0.14 ceiling. |
| 18 | 2026-09-15 | Panel became a ground: `--nav-panel: #faf8f5` (the `--bg` already in §2.3) with a sideways-only cast, so hover and select are LIFTS rather than tint swaps — on a white panel a hovered row had nowhere up to go and hover had to be a darker grey. Added §4.2 Planes. `--nav-hover` inverted to `#ffffff` (its old `#f9f9f8` measures 1.006 on the new ground); recesses inside white tiles switched to `--nav-panel`; `--nav-notch` darkened to `#ca7d50` because the panel change dropped it to 2.85:1, under the 3:1 boundary floor; foot joined the ground instead of being a white band across it. |
| 19 | 2026-09-15 | Hover softened to a shade: `--nav-hover` is a translucent 3% neutral (1.054:1 on the ground, matching the 1.053 the original `#f9f9f8` gave on white) with no shadow at all — the opaque white tile under `--e1` read as a hard card. Added `--t-dim` (240ms) so a tint that faint dims gradually instead of flickering; the lift now belongs to select alone. Added a 3px gap between rows because a selected row abutting a hovered one merged into one tinted block. Unified the Analytics spine onto the list (it was a border per `li`, which also made a gap impossible) and gave the switcher's keyboard cursor its own `--nav-cursor` at 7%, since it must be findable under arrow keys rather than merely follow the pointer. |
| 20 | 2026-09-15 | Switcher given room: padding 7→11px, field 34→42px, rows 42→48px (a name over a role needs leading or the pair reads cramped — the "cluttered" complaint was density, not content), 2px row gap, width 316px. Repositioned so only 10% overlaps the panel and the rest lies on the content, measured off the panel's right edge so it holds at any panel width. Extracted the border glow as a reusable `BorderGlow` / `.glow-ring` and gave the switcher's field one — the alternative was a second copy of sixteen layers and ninety lines of CSS. Host controls radius via `--glow-ry`. Moved `--nav-sweep-dur` to `:root`: on `.nav-find` it resolved to nothing for the portaled copy, which invalidates the whole `animation` shorthand and silently yields `animation: none`. Fixed the field never taking focus — the portal's `if (!pos) return null` gate meant the mount effect ran before the input existed and `[]` deps never retried. |
| 21 | 2026-09-15 | Switcher's search field made a pill (`--r-pill`), matching Quick find. Horizontal padding 12→16px, since 12 inside a 21px cap puts the glyph in the curve. Dropped its `--glow-ry` override so the ring falls back to the default 50%, which clamps to half the height — a pill's cap radius exactly; leaving it at `--r-field` would have traced a 10px corner around a 21px one and the light would have left the edge at all four caps. |
| 22 | 2026-09-15 | Panel narrowed 268→256px. Measured first: the binding constraint is the campaign name, which needs 162px intrinsically while every other label has 40px+ of headroom (workspace 121, longest child 111), so 12px came off the panel and 8 off the overhead around that one label — `--nav-pad` 18→16 (rail follows to 68px, derived) and the scope row's menu button 26→22 with a 3px gutter. Campaign name now fits at exactly 162/162, nothing truncates, rail axis still a single centre at x=34 with 0px spread. The shrunk button keeps a 44px touch target via a `::after` with `inset: -11px`, because growing the box on coarse pointers would push the name straight back out — it had no touch rule at all before, and the comment claiming otherwise was wrong. |
| 23 | 2026-09-15 | Decluttered the panel head. Workspace trigger went to one line — the hint ("Your organization" / "Personal workspace") was the densest thing there for the least information, since the name already says which it is, and it still earns its place in the switcher where it separates rows. Bell lost its resting outline: two outlined shapes side by side in a 224px row was most of the clutter, and the quick-find trigger is the row's subject while the bell is an adjunct already legible from its glyph and badge; the outline arrives on hover, when a boundary is useful. Rhythm: brand row 56→54, workspace block padding 10→12, tools 12→16 and gap 8→10. Badge knockout ring switched from `--nav-surface` to `--nav-panel` — it was white because the panel used to be, and a knockout must match what it knocks out of. |
| 24 | 2026-09-15 | Separated organisation from workspace, which the code had conflated: `ownWorkspace()` used the organisation's NAME as the workspace's name and labelled the tenant as a workspace. Organisation is the tenant (`core.organizations`, `tenant_<slug>`, the RLS boundary, not switchable); workspace is the scope inside it at `user` or `org` level. Added §5.3.0 with the model. The switcher now groups `Your workspace` above the organisation's own heading; the account row shows name over organisation and the email moved into the account menu. Org-level rows stay disabled because switching one would change which schema is read — the deliberate difference from the campaign switcher. |
| 25 | 2026-09-15 | Workspace switcher rebuilt on the same shell as the campaign switcher: portaled, 316px, search field with its own border glow, two divisions — `Personal workspace` and `Org workspaces` — with the organisation named in a closing note rather than as a group label, since it is the boundary and not a heading of peers. Extracted `SwitcherPopover` rather than copying: the markup was never the hard part, but the portal, position measurement, keyboard cursor, focus latch and dismissal had each already cost a bug, and duplicating that list was not an option. Arrows walk enabled rows ACROSS group boundaries; empty groups drop away instead of leaving a heading over nothing; disabled rows carry `aria-disabled` as well as the dimming. Removed the 15 now-dead `.nav-ws-pop` / `.nav-ws-item` / `.nav-ws-head` rules. Group divisions are separated by space, not a rule — a divider inside a bordered popover would be the third boundary in 300px. |
