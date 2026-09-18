# SuperHyre — design system

**Status:** working draft · **Revision:** 55 · **Last changed:** 2026-09-18

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

### Case study: the orchestrator (Home) — *Rebuilt at revision 27*

*Not a component spec — a worked example of every rule in this document,
including the ones I broke. The components it is built from are §5.8 and
§5.9; the colour system it forced is §2.*

The surface a recruiter works in. Revision 26 shipped it bland and it was
judged, correctly, as something a customer would close. What it got wrong is
worth keeping written down, because each fault was a rule applied without its
purpose.

| Fault | The rule I was leaning on | What was actually true |
|---|---|---|
| **626px of empty ground** — ~61% of the viewport, content welded to the bottom edge | "the page is the surface, not a widget on it" | A transcript hugs the composer; a *landing state* must start at the top. One anchor cannot serve both, and I used the transcript's for both. |
| **Four identical text-only cards** | "asymmetry from content weight (§0)" | All four tiles held the same content *type* — a title and a sentence — so the asymmetry was decorative. I cited the clause while breaking it. |
| **`24 / 61 / 9` as dead numbers** | brevity | A recruiter cannot tell whether 61 contacted is good. Answering that is the entire job of the header. |
| **One accent hue everywhere** | "restraint" | Nothing was colour-coded, so nothing was scannable: eleven rail rows had to be *read*. Sage sat defined-and-unused with "Q3 stays open" written as if deferring were deciding. |
| **No tasks, no config, no affordances** | — | There was no answer to "what should I do now", which is the only reason to open a home surface twice. |

Passing a contrast table and a squint test is not the same as being good. Both
passed at revision 26.

#### What the rebuild is

**Anchoring is per state.** `.orc-stream.has-turns` bottom-anchors; without it
the landing content flows from the top and fills. Measured after: the gap under
the header went **626px → 24px**. Still `margin-top: auto` on the first child
rather than `justify-content: flex-end`, which looks identical until content
outgrows the box and then makes the top of the transcript unreachable.

**The bento is configured, not hard-coded.** Eight tile kinds, each
*structurally* different — a ring, a funnel, a face stack, a file list, a time
strip, brand-logo discs, a metric with its trailing shape, and one deliberately
quiet text kind. If two kinds would render the same shape, one should not
exist. Size (`s`/`m`/`l` → 1×1 / 2×1 / 2×2), hue, order and membership are the
recruiter's, persisted to `localStorage` under a versioned key. Reorder is
drag **and** a keyboard path in the menu, because drag alone is a pointer-only
affordance.

**Between the bento and the composer: My Tasks.** Filter chips and search that
genuinely filter, ordered urgent-first then by state, with the row's agent
affordance revealed by **opacity** so the row's box is byte-identical hovered
and not — `display: none` and `visibility: hidden` were both rejected for
taking the button out of the tab order and killing the `:focus-within` path.

**A reply is an artefact.** A quiet truthful `Thought for Ns` (the *measured*
elapsed time), then a card with an app header, field rows sharing one label
origin, and semantically tinted `section` blocks that read as discrete
reviewable objects. Revision 26 rendered one sentence, which is why there was
nothing to do once the reply landed.

#### Motion

| | |
|---|---|
| 60ms | Press. Scale only, controls only. |
| 150ms | Feedback. Hover shade and elevation. **Nothing translates.** |
| 280ms | Arrival. The landing block assembling, once, 28ms per tile. |
| 520ms | The focal moment. The send becoming the agent. Exactly one. |
| loops | Reserved for genuinely live state: the working mark, a pulse dot. |

**Hover never translates.** With four columns the cursor crosses several tiles
on the way anywhere, so a lift-by-moving would ripple the whole surface. Press
*does* move — by then you have already hit the target.

The **28ms stagger is not a second focal moment**: the longest total is under
250ms, inside the feedback band, and it is driven by `:nth-child` so the grid
component knows nothing about it.

The focal moment is a **FLIP** — the mark's final position is its ordinary
layout position, given the inverse transform on its first frame and animated to
identity, so the send visibly *becomes* the agent using one element rather than
a decoy handing off to a real one. Transform only, never `top`/`left`.

#### And it still does not fake work

`delight.md` forbids faking work. There is no orchestrator backend, so:

- stage lists name the steps a brief **will** run, in order
- every fixture renders the table it stands in for (`recruiter_tasks`,
  `agent_conversations`, `org_candidates`, `outreach_queue`, `org_integrations`)
- the reply's `note` block says plainly that nothing is wired
- unwired controls carry a lock glyph, an uppercase caption and `aria-disabled`

The last one has a contrast consequence worth recording: the obvious way to
mark the commit button unavailable is `opacity: 0.55`, which puts its white
label at about **2.5:1**. Unavailability is carried by lock, caption and ARIA —
**never by degrading text**. This is the same failure as the two below.

#### Two failures of my own, both caught by measuring

1. I invented a tertiary grey `#9a9188` in four places. It measures **2.75:1**.
   §3.3 forbids it in as many words: *there is no third ink.*
2. Told to fix it, I wrote `opacity: 0.8` over a legal `--ink-2`. That measures
   **4.19:1**. **A translucent pass at a legal colour is still an illegal
   colour.**

Both are now `--ink-2`, demoted by size. The lesson is that "demote this text"
has exactly two safe tools — size and weight — and reaching for a colour or an
alpha is the reflex to distrust.

### Anti-tells### Anti-tells

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

## 2. Colour — *Adopted at revision 27*

Rewritten after measuring three reference screenshots pixel by pixel instead of
describing them. Everything below is solved for a contrast floor, not picked.

### 2.0 The finding — *where saturation belongs*

The surface built at revision 26 came back described as *"low aesthetic, kinda
the old feel of light wood"*. That was correct, and the cause was not the
accent. It was **where the colour was**:

| | Chroma (C\*) | Share of screen |
|---|---|---|
| Reference app ground | **0.01** (pure `#ffffff`) | ~60% |
| Reference sub-panel | ~1.07 (`#f5f7fb`, measured) | small |
| Reference chips / CTAs / marks | **s 89–93%** | under 5% |
| **My revision-26 ground** | **2.76** | **~60%** |

So the old surface did not lack colour. It had colour in the wrong place: a
saturated warm plane across most of the viewport with muted content on top. A
large, desaturated, warm area reads as aged paper — and once the ground is
itself a colour, every accent on it is competing rather than landing.

> **The rule: desaturate the large areas, saturate the small ones.**
> Grounds and panels are near-neutral. Hue lives in chips, marks, strokes,
> bars and fills — small enough to carry real saturation without tinting the
> room.

The one place the references were *not* followed is temperature. Theirs is a
cool neutral; ours leans warm, because the mark is orange and a cool ground
fights it. Measured, that costs almost nothing: brand orange separates from a
warm near-neutral at ΔE 80.8 against 81.6 on pure white.

### 2.1 Neutrals — *Adopted at revision 27*

| Token | Hex | C\* | Use | Measured |
|---|---|---|---|---|
| `--surface` / `--nav-surface` | `#ffffff` | 0.01 | Cards, fields | — |
| `--page` | `#f7f7f5` | **1.01** | The ground | white card lifts **1.073:1** |
| `--sub` | `#f3f2f0` | 1.07 | A plane **inside a card** | **1.119:1** on white |
| `--hairline` | `#edeae6` | 2.30 | Decorative edge | 1.199:1 on white |
| `--rule` | `#e4e1db` | 3.28 | Stronger divider | 1.305:1 on white |

`--page` was solved for a 1.072 lift because that is the **card-to-panel step
measured out of the reference itself**. Ink on it: `--ink` 13.17:1,
`--ink-2` 7.08:1.

**`--sub` is a plane inside a CARD, and that constraint is load-bearing.** On
`--page` it lands at 1.04:1 — invisible, along with any `--hairline` divider
drawn on it. A panel that sits directly on the ground (the campaign header, the
rail) must either be a white card or carry its own hairline. Both callers hit
this and both handled it; the token's name is not a suggestion.

`--nav-panel` moved `#faf8f5` → `#fbfbfa` (C\* 1.67 → 0.50) for the same
reason, so the peach active row and the orange mark read as chosen colour
rather than more of the same warm.

### 2.1.1 The canvas — *Adopted at revision 29*

`--page` is **`#ffffff`**, and that is a structural decision rather than a
shade. Sampled out of the reference:

| | Measured |
|---|---|
| page background | `#ffffff` |
| composer fill | `#ffffff` |
| rail card fill | `#ffffff` |
| status card fill | `#ffffff` |
| every one against every other | **1.000:1** |

**Nothing in the reference is separated by tone.** Cards are outlined regions
on one continuous surface, demarcated by a hairline at roughly 1.30:1 — which
is almost exactly `--nav-edge-panel` (1.33:1), so the existing edge token was
already correct.

That is the whole reason it reads as *one board with content floating on it*.
The model therefore inverted:

- **was:** toned ground (`#f7f7f5`), white cards lifting off it by 1.073:1
- **is:** one white canvas, cards demarcated by a hairline only

`--sub` (#f3f2f0) keeps exactly one job: a recessed plane **inside** a card. On
the white canvas it is 1.00:1 — invisible — which is now a feature, because it
means a `--sub` panel can only ever appear where it is legible.

**The rail has no `border-left`.** That single line was the biggest reason the
surface read as two documents pasted side by side. What separates the columns
is **space** — the reference gives it ~113px of empty canvas and no rule at
all. A full-height divider says "these are different things"; the panels
inside already say where they begin.

### 2.1.2 Colour zones — *Adopted at revision 29*

Two revisions were spent getting the *amount* of colour wrong in both
directions — 26 saturated spots read as cluttered, 7 read as bland. Neither was
a quantity problem. Sampling the reference band by band, counting saturated
pixels:

| Band | % of its own area saturated | Share of ALL page colour |
|---|---|---|
| greeting | 24.2% | 23.7% |
| **bento** | **19.8%** | **65.8%** |
| tasks header | 0.0% | 0.0% |
| task rows | 2.1% | 5.1% |
| composer | 4.4% | 5.5% |

**The greeting and the bento hold 89.5% of the page's colour. Everything else
is near-colourless.**

> **Colour is concentrated in zones. A zone is loud; the space between zones is
> silent.**

This supersedes the flat per-viewport budget of §4.3 as the *primary*
instrument — the budget still caps the accent at three instances, but an evenly
spread allowance is exactly what produced both failures. A page needs one or two
places where colour is genuinely dense and the rest quiet.

The zones on this surface:

1. **The greeting** — one washed phrase. `--c-blue-tint` carrying
   `--c-blue-text` at 4.90:1. Blue and not brand, because the brand is the
   *action* colour and a greeting is not an action.
2. **The bento** — the engine, carrying ~two thirds. Three devices, all from
   the reference: **exactly one tinted tile** among white siblings (the
   reference's warm-yellow `#fef9e2` card); **brand marks in real brand
   colour** (a logo identifying a thing in a list is the permitted case); and
   **data visualisation in full hue**, which is the most defensible colour on
   any page because it encodes a quantity.
3. **Nothing else.** Task rows get at most two small chips; the tasks header
   gets none at all. The counter-intuitive finding is that the chips I twice
   agonised over contribute **5.1%** — they are accents, not the carrier.

If two tiles are tinted, neither is special. That rule is enforced in code.

### 2.2 Brand — *the only action colour*

| Token | Hex | Use | Measured |
|---|---|---|---|
| `--accent` | `#ea5a1e` | The mark, fills, shapes. **Never text, never a button label.** | white text **3.51:1** ✗ |
| `--accent-fill` | `#cc4d17` | **Primary buttons carrying white text.** | white text **4.52:1** ✓ |
| `--accent-deep` | `#b8400f` | Conservative option for small or dense labels | white text 5.56:1 ✓ |
| `--accent-tint` | `#fdeae2` | Soft brand wash, name highlight, prompt intent | `--ink` 12.14:1 ✓ |
| `--accent-text` | `#b24c20` | Brand **as text** | 5.32:1 white, 4.57:1 on its tint ✓ |

The references put a vivid sky blue on every primary button. It is good-looking
and it was **rejected**: the mark is orange and the brand does not change
because a screenshot was persuasive. Measuring it was still worth it —

- sampled reference CTA `#51a7f5` → white text **2.56:1**, fails outright
- live `--accent` `#ea5a1e` → white text **3.51:1**, also fails

Both buttons are illegal. `--accent-fill` is the same brand hue solved for the
floor: the most vivid orange that legally carries white text. **Blue is not an
action colour here** — it survives only as `--c-blue`, one of seven category
hues, used for status and never for a button.

### 2.3 Category + status hues — *Adopted at revision 27*

Seven hues × five roles. Every value solved, none picked.

| Hue | `--c-*` | `-tint` | `-line` | `-text` | `-fill` |
|---|---|---|---|---|---|
| brand | `#c87248` | `#f9ede7` | `#ead0c3` | `#9f5b38` | `#b16038` |
| amber | `#aa8825` | `#f9f4e7` | `#eae0c3` | `#846d25` | `#8b742c` |
| sage | `#559d3d` | `#ebf9e7` | `#cceac3` | `#477c35` | `#41852a` |
| teal | `#349c98` | `#e7f9f8` | `#c3eae8` | `#2e7b79` | `#298280` |
| blue | `#588acd` | `#e7eff9` | `#c3d4ea` | `#3d6dac` | `#3d76c2` |
| violet | `#9b72d0` | `#efe7f9` | `#d4c3ea` | `#8051be` | `#8d5ecc` |
| rose | `#d16476` | `#f9e7ea` | `#eac3c9` | `#b84054` | `#c64c60` |

Guarantees, all measured:

- `--c-*` clears **3:1 on white and on its own tint** (worst 3.02) — icons,
  strokes, bars, drop indicators
- `--c-*-text` clears **4.5:1 on white and on its own tint** (worst 4.53)
- `--c-*-fill` carries **white text at ≥4.5:1** (worst 4.50)
- `--ink` on every tint clears **11.7:1**
- every hue clears its floor on `--page` too (worst mark 3.08, worst text 4.63)

**The `--c-*` marks were solved against white and their own tint — and
nothing else.** Put one on any other plane and you are outside what was
measured. Two that were checked and fail the 3:1 icon floor:

| Mark on plane | Measured |
|---|---|
| `--c-sage` on `--accent-tint` | **2.87:1** ✗ |
| `--c-teal` on `--sub` | **2.95:1** ✗ |

So a category mark never goes on a selection wash or a recessed panel. When
that collision came up on the rail's selected brief row, the resolution was to
drop the hue rather than rescue it — the mode's icon *shape* already carried
the distinction, so the colour was a second encoding of one fact.

Two further decisions worth keeping:

**Amber sits at h45, not h38.** At h38 it measured fine and was *useless* —
rendered beside brand terracotta at a real 18px it was the same colour. Hue
separation is a legibility property and it has to be checked by rendering, not
by reading the number.

**A tinted tile does not work on this ground.** Tints at l94 lift only
1.003–1.046 off `--page`, so a tinted card floats invisibly. Tiles are white
(per §4.2) and hue enters through the icon chip, a hairline, viz strokes and
text. This is why the seven hues have no `-card` role.

### 2.4 Hue is never the only carrier

A coloured dot, chip, bar or ring always ships with a label, glyph or number.
Strip every hue out and the surface must still read — that is the test, and it
is also what makes the palette safe for colour-blind users without a second
theme. The one place colour genuinely is alone is the hue picker in a tile's
menu, which is why each swatch carries its name in `aria-label` and `title`.

### 2.5 Semantic mapping

No separate semantic palette. Status maps onto the seven:

| Role | Hue | Notes |
|---|---|---|
| Positive / done / connected | `sage` | |
| In progress / scheduled | `blue` | |
| Waiting / attention | `amber` | |
| Blocked / overdue / decline | `rose` | |
| Agent / intelligence | `violet` | |
| Neutral / to do | `teal` | |
| Campaign identity | `brand` | |

`Delta` takes an `invert` flag for metrics where down is good. Without it a
falling time-to-hire renders as a decline, which is the commonest way a
dashboard lies without anyone editing a number.

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

### 4.3 Loudness — *Adopted at revision 28*

The revision-27 surface passed every contrast check and came back judged
**cluttered**. Measured against the reference it was aping:

| | revision 27 | reference |
|---|---|---|
| Bordered elements in view | **68** | ~6 |
| Distinct saturated colour spots | **26** | ~6, one hue |
| Chips / deltas | **11** | 0 |
| Table names on screen | **7** | 0 |
| Elements with a resting shadow | **15** | ~1 |

The reference is **not** cleaner because it holds less. It holds a breadcrumb,
a title, a composer with two modes and four context controls, three
suggestions, an agent-status card, recent searches, three stats, seven
configuration rows and a shortlist. It is cleaner because **exactly one thing
is loud and everything else is quiet.**

> Cleanliness is restraint in **treatment**, not in **quantity**.

So density was never the problem — uniformity was. Every element had a border,
a shadow, a radius, a tinted glyph and a footer, so nothing receded and
everything competed. Four tiers, and an element may only wear the treatment of
its own tier.

#### Tier 0 — Hero. **Exactly one per screen.**

The composer, and nothing else. White surface, `--r-card`,
`--nav-edge-panel`, **`--e2` at rest — the only resting shadow on the
surface**, the travelling glow ring (§4.4), generous padding, and the one
accent-filled control.

Fifteen elements had a shadow at revision 27, which is the arithmetic reason
the composer stopped reading as primary. One `--e2` only means something when
its neighbours have none.

#### Tier 1 — Structure. Type only, no container.

Breadcrumb, campaign name, section headings. No border, no background, no
shadow, no glyph. `--ink` for the name, `--ink-2` for the breadcrumb. Size and
weight do the work.

#### Tier 2 — Content blocks. Hairline, **no resting shadow**.

Bento tiles, My Tasks, rail panels. `1px solid var(--hairline)`, `--r-card`,
`--e1` **on hover only**.

- Header is **plain text** — `12.5px/600 --ink`. No tinted glyph container.
  Those six coloured squares did nothing but badge a card as a card.
- Body is **two-tone**: label `--ink-2`, value `--ink`, on one row. This is
  the reference's whole mechanism and it replaces most chips.

**Qualification, earned in build.** Tier 2's `--e1`-on-hover is a *press*
affordance. A block that is not interactive does not get it — a shadow
tracking the pointer over a non-interactive `<article>` implies pressability
that is not there, which is the same class of lie as a live-looking dead
button. The reply artefact therefore carries a hairline and no shadow in any
state, deliberately, and not because it missed a rule.

#### Tier 3 — Quiet metadata. `--ink-2`, small, no container.

Counts, timestamps, helper text, "2 of 4 connected".

#### The colour budget — a hard cap

Colour is for **exception**, never decoration. Target ≤8 saturated spots in
view, against 26 measured.

- **Accent (orange): max 3 instances.** The send button, the active nav row,
  at most one primary action in the rail.
- **Status hues: only where the value genuinely varies between sibling rows.**
  Permitted — task state (five rows, four states); channel connected or not.
  Forbidden — a hue on every row of a list, a per-card "category" tint, a
  delta chip on a number with only one possible mood.

> **The test: if every sibling in a list gets a coloured chip, the colour
> carries no information and must come out.** Colour that never differs is
> decoration.

This is what retired the per-brief campaign chip, the per-row wait dot, the
three header state chips, the sage check badge on every connected channel, the
four brief mode glyphs, the per-tile category accent, and the avatar stack's
one-hue-per-person — four people rendering as four colours is eight saturated
spots encoding what the initials already say. **Identity is not a status, and
only status earns the palette.**

#### Measured outcome

| | revision 27 | revision 28 | target |
|---|---|---|---|
| Composer position | **557px below the fold** | **top, fully visible** | hero |
| Elevation shadows | 15 | **1** | 1 |
| Distinct colour spots | 26 | **7** | ≤8 |
| Bordered elements | 68 | 32 | ~12 |
| Chips / deltas | 11 | **0** | 0 |
| Table names on screen | 7 | **0** | 0 |

Two counting notes, because the naive detector is wrong in both directions: a
structural ring (`0 0 0 2px` white, letting overlapping avatars cut into each
other) and an inset row divider are **not** elevation and must be excluded, or
the count reads 9 when the real answer is 1. Conversely `sr-only` text still
carries a colour and still counts.

#### Honesty without noise

Seven table names on screen were developer notes leaking into the product. The
commitment to never fake data is unchanged — it is satisfied by stating it
**once, quietly**, at the foot of the surface. The only per-component exception
is the reply artefact's `note`, which sits directly beneath a button that looks
like it would send something, and therefore has to speak where it stands.

### 4.4 The travelling glow — *Adopted at revision 28*

A 16-layer composited bloom on one `rect`, swept by `stroke-dashoffset`. It was
built for the sidebar's quick-find field and was, for two revisions, the best
interaction in the product and the only one of its kind — which is exactly what
was wrong with it.

> *"When one screen uses a glow-on-hover and another uses none, it breaks the
> interaction rhythm."*

**The glow belongs to a class of element, not to a component.** Every field the
user is about to type into gets it; nothing else does. That now means quick
find, the switcher's search, and the composer — which was the most important
field in the product and the one field without it.

It lives in `glow.tsx`. A host needs `position: relative`, an opacity trigger
in the `.glow-ring` rule list, and — if its radius is not a pill — its own
`--glow-ry` set to its radius **less half its border width**, because the
stroke rides the border's centreline.

Two traps, both documented at the rule and both of which cost a session:

- a `calc()` resolving to a bare number is **invalid** for
  `stroke-dasharray`/`stroke-dashoffset` and fails silently
- centring the layers with a per-frame `calc()` over an inherited variable
  drifts out of phase; the fix is a negative `animation-delay`

Under `prefers-reduced-motion` the sweep stops and the border warms instead —
hover still answers, which is the intentional alternative rather than a kill
switch.

### 4.5 The composition — *Adopted at revision 31*

Measured off the reference as fractions of a 1568px window:

| | Share | Value |
|---|---|---|
| left margin | 5.6% | 88px |
| **content** | **53.6%** | **840px** |
| gutter | 9.6% | 150px |
| **rail** | **26.4%** | **414px** |
| right margin | 4.8% | 76px |

Three things were wrong against that. The rail was **312px** where the
reference gives its own a quarter of the width. There was **no right margin at
all**, so the rail sat flush against the window edge. And the content took
whatever was left, which with a railed sidebar meant a **1108px** composer —
far past the ~840px the reference sets.

**The composition is capped and centred, not stretched.**

```
.orc {
  max-width: 1290px;
  margin-inline: auto;
  padding-right: 34px;
  column-gap: 56px;
  grid-template-columns: minmax(0, 1fr) 340px;
}
```

That is the rule this pass exists to establish:

> **A wider window buys a surface more air, not bigger components.**

Stretching is how "fill the space" turns into "everything grew", which is
exactly the note that came back. Capping the composition and letting the
leftover become page margin gives a stable 830px content column at any width —
measured identical with the sidebar expanded and railed.

### 4.6 Vertical rhythm — *Adopted at revision 31*

**One owner.** `.orc-stream` sets `gap: 22px` and no block carries a vertical
margin of its own.

Measured before: **20 / 30 / 10 / 0 / 10px** between consecutive blocks — not a
scale, just whatever each block's margins summed to across two containers that
both set a gap. After: **22 / 22 / 22 / 22 / 22**.

The test of whether a rhythm is real: change the one number and the whole page
re-spaces. If some gaps move and others do not, a block is still carrying its
own margin.

Two bugs this surfaced, both worth knowing:

- `.tk { margin-top: 10px }` was the entire cause of the one 32px gap, and its
  comment claimed it was matching "the bento's own gap" — a margin that
  duplicates a gap is always a rhythm bug, however it is justified.
- A substitution that tried to fix the gap **replaced a string that no longer
  existed and silently did nothing**, so the source read as fixed while the
  page measured as broken. Every edit to this stylesheet is now asserted to
  match exactly once before it is written.

**Padding is uniform at 16px** on every wide card (bento tile, task card,
composer) and **14px** in the rail, which is narrower. Measured before: 13/14,
16/18, 16/14, and 11/12 — four values for one job.

`.rail-stats` was overriding `.rail-panel` with `11px 12px 12px` at equal
specificity, later in the sheet. It was invisible in the source and only
appeared when the computed padding disagreed with the rule that looked like it
set it. A panel that needs different padding has to say why; uniform is the
default.

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

### 5.8 Micro-visualisations ✅ *(`viz.tsx`)*

The vocabulary the bento is built from. Each answers a question a bare number
cannot, and each takes a `hue` resolved through one function so the
`--c-<hue>-<variant>` convention lives in exactly one place.

| Primitive | Answers |
|---|---|
| `Ring` | what fraction of the way through is this |
| `Spark` | which direction has it been moving |
| `Delta` | by how much, and is that good (`invert` when down is good) |
| `Funnel` | where does the pipeline actually narrow |
| `Stack` | who, as faces rather than a count |
| `Chip` | what state is this in |
| `Dot` | the smallest state marker |
| `Glyph` | what kind of thing is this |

Three implementation notes that each cost a bug once:

- `pathLength={100}` on a ring normalises the circumference so the dash maths
  is a percentage. A `calc()` resolving to a bare number is **invalid** for
  `stroke-dasharray` and fails silently, leaving a full ring.
- Anything stretched by `preserveAspectRatio="none"` needs
  `vector-effect="non-scaling-stroke"`, or a 2px line renders at 5px on a wide
  tile.
- A flat series has zero span. Dividing by it collapses the line to the
  baseline; giving it a span of 1 puts it up the middle, which is the truthful
  shape.

### 5.9 Reply artefacts ✅ *(`Reply.tsx`)*

`lead` · `field` · `section` · `note`. The `section` is the load-bearing one: a
tinted block in its own hue with a title in `--c-<hue>-text` and its own edit
affordance, so it reads as a discrete reviewable unit rather than a paragraph
with a background.

The prompt renders the recruiter's own words large in `--serif` — the one piece
of human prose on the surface, where the agent's output is UI — with the
leading clause washed in `--accent-tint`. That span comes from a **string
split** (first comma, or six words, whichever is shorter), and the code says so
at length: it is a typographic device, **not NLP**, and nothing claims to have
parsed intent.

### 5.10 Reply kinds — *Adopted at revision 32*

There was one reply shape: the artefact card. Good for what it is, but it was
*the special kind*, and the ordinary kinds were missing. Four now, behind one
`Reply({ reply, onAnswer })` that dispatches on `reply.kind`.

| Kind | Treatment |
|---|---|
| **prose** | Paragraphs. 15px/1.65 `--ink` at 62ch. **No card, no border, no background.** |
| **question** | The agent asks. A `why` line, 2–4 options, and the composer as the free-text path. |
| **artefact** | The reviewable object. The only one with a card. |
| **trace** | A disclosure on the `Thought for Ns` line, carried by all three. |

**Prose must look like nothing.** If prose looks designed, the artefact card
stops meaning "this one is special" — and that distinction is the whole reason
to have kinds at all. The card is earned by being a reviewable object with a
commit action; a paragraph earns nothing.

**The trace is "what it thought and came across".** Collapsed by default and
**not in the DOM when collapsed** — a transcript only grows, so leaving four
expanded traces mounted is a cost that compounds. Each step carries a `label`,
a `detail`, and `found` items — and the hierarchy is *inverted on purpose*:
label `--ink`, detail `--ink-2`, findings back to `--ink`. The findings are the
half a recruiter could not have guessed, so the eye goes label → found with the
conclusion sitting between them as a caption.

**The trace's honesty line LEADS rather than trails**, departing from this
document's honesty-last convention. `--orc-fixtures` and `.rep-note` sit
*under* things that look like they would act, qualifying an act not yet taken.
Trace steps are assertions about the past, and a correction arriving after four
believed assertions is too late.

**A question's options seed the composer and never act.** Verified: clicking
one filled the field with "Include candidates who are up to two years short on
seniority, and mark them as a stretch", moved focus to the input, and left the
turn count unchanged. That is the established pattern — a suggestion hands you
a draft, it does not send it.

Two implementation notes worth keeping:

- `<button aria-expanded>` rather than `<details>`/`<summary>`, so nothing
  remains in the DOM when closed and there is no UA marker to strip off the
  thought line's typography. `aria-controls` is dropped while closed rather
  than dangling at an id not in the document.
- The caret is **swapped** (`CaretRight`/`CaretDown`), never rotated. A
  rotation is a transform, and this surface's one interaction transform is the
  60ms press.

### 5.11 The working indicator — *Adopted at revision 32*

**The mark does not move.** It used to rotate in stepped thirds. Spinning a
logo is the cheapest loader there is and it works against what a logo is: an
identity that tumbles reads as a throbber, not a presence.

The motion moved to a ring outside it — an arc that travels while **its own
length compresses and expands**, 10% of the circumference at its shortest and
42% at its longest. Two animations on one element at deliberately different
periods (1.15s travel, 1.9s breathe) so the pattern never resolves into a
single repeating gesture.

Both dash values are stated in every keyframe: interpolating a two-value
`stroke-dasharray` requires the lists to be the same length, and omitting the
gap invalidates the whole declaration rather than inheriting it.

Reduced motion holds a static incomplete arc — still visibly working, with
nothing in motion.

### 5.12 The composer reads the brief — *Adopted at revision 34*

The creative centre of this surface, and it comes out of one research finding:

> *"Conversational AI is a very slow way of helping users express their intent.
> Usability tests show 30–60s per input, with users lost in editing, reviewing,
> typing and re-typing."*
> — Smart Interface Design Patterns

The cost is not typing speed. It is that **you cannot tell what was
understood**, so you re-read your own sentence and rewrite it defensively.

Every product answers this one of two ways: prose (fast to write, impossible
to verify) or a form (verifiable, miserable to write). Neither is necessary,
because **a sourcing brief is a structured query wearing prose clothing** —
*"Staff engineers who have scaled Postgres past 10TB, remote Bangalore"*
carries a seniority, a skill, a threshold and a location.

So: you type prose, and the spans the product **recognises** are underlined
beneath the words in their facet's colour. Six facets, each mapped to one of
the measured seven hues:

| Facet | Hue | Example |
|---|---|---|
| Seniority | violet | Staff engineers |
| Skill | blue | Postgres, Go |
| Scale | amber | 10TB, 40 engineers |
| Location | teal | remote Bangalore |
| Company | brand | Series B |
| Tenure | sage | 8 years |

Below the field the same reading appears as chips — because the underlines are
for a pointer and an eye, and the reading has to reach a screen reader and
anyone who cannot rely on colour. Hue is never the only carrier.

#### Why this is honest where the deleted highlight was not

Revision 32 deleted a wash over the prompt's "leading clause", taken by a
string split. It dressed a `split` up as comprehension and, on a short prompt,
washed the entire message.

This is the inverse. It matches against a **fixed, auditable vocabulary** of
real recruiting terms and highlights *nothing else*. The claim it makes —
"these words are in my vocabulary" — is exactly the claim it can support. No
model is consulted and nothing is inferred. **Unrecognised text staying plain
is the useful half of the signal**, because it is the half that tells a
recruiter to be more specific.

When a real parser exists it replaces `read()` and the UI does not change, because the UI already only trusts the spans it is handed.

#### The mirror technique, and its four traps

The underlines live on a `div` mirroring the text, positioned behind a
textarea whose own text is transparent. Every metric that affects where a
glyph lands must be identical in both, so they share one declaration block —
a change to one that misses the other is the entire failure mode.

1. **`white-space: pre-wrap` + `overflow-wrap: break-word`** matter as much as
   the font. A textarea wraps on its own rules and a div only matches them
   with both.
2. **`inset: 0` resolves against the PADDING box**, so anchoring the mirror to
   the card put it 16px up and left — visible as text clipped by the border.
   A wrapper whose box *is* the content box fixes it without repeating the
   padding value anywhere.
3. **`-webkit-text-fill-color` beats `color`** on form controls in WebKit, so
   hiding the real text needs both — and it is **inherited by
   `::placeholder`**, which made the placeholder vanish and the field render
   blank. Found by reading the pseudo-element's computed style; the screenshot
   just looked like an empty box.
4. **The mirror does not scroll itself.** It sits behind a field that does, so
   its `scrollTop` is synced or the underlines drift off the words.

#### Two bugs the tests found, not the eye

- `"Staff engineers"` matched only `"staff"`, because the vocabulary is stored
  singular for a human to read. One optional trailing `s`, boundary-checked,
  so it extends a term rather than guessing at morphology — `"engineering"` is
  still not `"engineer"`.
- `"5 years"` highlighted as `"years"` and dropped the number: the bare word
  claimed the ground before the richer pattern could. **Patterns now run
  first**, because ground is claimed once and the more specific reader has to
  go first.

### 5.13 The Home overview — *Adopted at revision 35*

Two columns at 50/50: today's tasks, and three analytics cards.

#### The tile gallery is gone, and that is the change

No sizes, no hues, no reordering, no persisted layout, no version key. What
Home shows is a **decision**, not a preference.

Configurability was answering "different recruiters watch different numbers",
and it cost: a persisted schema, a version to bump on every shape change (v1
through v5 in one session), two popovers, a drag interaction, and a resting
state that had to look deliberate at three sizes and seven hues. **198 CSS
rules and three modules deleted.** An overview that answers the same four
questions for everyone needs none of it and can be composed rather than tiled.

#### How the columns stay level

The three cards are **rows of a stretched grid track**, not cards with heights
of their own:

```css
.ov       { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch }
.ov-stack { grid-template-rows: repeat(3, minmax(0, 1fr)) }
```

`stretch` makes both columns as tall as the taller; `1fr × 3` splits that into
equal parts. No card knows the list's height and none is told it — the sum
equals it *by construction* rather than by a number kept in sync by hand.
Measured: 620 / 620, cards 193 / 193 / 193.

#### What the research changed

| Finding | What I would have done |
|---|---|
| *"Enable markers when peaks and valleys matter, or when the first or last value carries special meaning"* | A dot on all 14 points. Now: high, low, latest — deduped, since the last point is often also the high. |
| *"Choose a line colour that is light and a marker that is bright and dark"* | A vivid line. Inverted: `--c-blue-line` for the curve, `--c-blue` for the markers — which is what leaves the anchors anywhere brighter to go. |
| *"10 colours makes it look like a candy store and removes the ability to use colour for emphasis"* | A hue per card. Now three: blue owns the chart, violet the bars, **rose is reserved for a campaign that has actually stalled**. |
| *"Top-left is prime real estate"* | Numbers first. The task list is top-left because the page's question is *what should I do now*. |

Smoothing is Catmull-Rom at tension 0.5 — not a polyline (the shape is the
message) and not a higher tension, which bows past its own points and on a
weekend trough of 2 draws candidates that were never sourced.

#### One bug worth the note

The chart's plot was `flex: 1 1 auto` with the svg at `height: 100%`. With no
definite height in the chain, `100%` fell back to **the viewBox's aspect
ratio** — at 582px wide that is 178px tall, which inflated the card, then the
stack that equalises to its tallest card, then the task list that stretches to
match. Measured: **883px of column for two tasks.** A definite 88px on the plot
fixed all three.

#### And the empty column is filled with information

Today's list is short by design, so on Home it has slack. Rather than pad it or
stretch the rows, it ends with **"3 more tasks after today"** — counted off the
fixture through the same predicate the Today filter uses, so the two can never
disagree about what today means.

### 5.14 The overview gains a filter — *Adopted at revision 36*

A campaign scope, a time window, a greeting, and a real axis.

#### The parts sum to the whole, or the filter is a lie

Every overview number is now stored **per campaign**. "All campaigns" is not a
fourth fixture beside the three — it is the three folded:

```ts
sourcedFor("all")  // DAYS.map(day => sum of each campaign's value for that day)
stepsFor("all")    // each step folded, numerator AND denominator
```

Measured: 78 + 46 + 24 = 148, and the funnel folds to exactly `[24, 61, 17, 6]`.
148 reads 148 because that is what those add to, not because 148 is typed
anywhere.

This is the whole reason the control is trustworthy. Had the overall totals
stayed hand-written, the day someone edited one campaign the header would
report a number that no longer equalled the sum of its own parts, and **nothing
in the type system would notice.** So it is pinned by test, and the tests assert
*relations* rather than values — day-by-day equality, not "the total is 148",
because a test that hardcodes the fixture has to be edited whenever a number
changes, which trains everyone to update tests without reading them.

`live` stopped being a stored field and became `funnel.contacted`. It had been
its own number reading 61 for one campaign — which was also the *overall*
contacted count. Two unrelated quantities that happened to match, waiting to be
read as the same fact.

#### One id space

`orchestrator.ts` called the campaigns `sbe` / `sre` / `ios`; `workspaces.ts`
called the same three `backend-snr` / `platform-sre` / `ios-mid`. Two id spaces
for one concept works right up until something has to filter by campaign across
both. They are now the canonical ids, and names are looked up rather than
written twice.

Only three of the seven campaigns carry data, and the switcher offers exactly
those plus All. Four all-zero views behind a control that looks like it narrows
data is worse than not offering them.

#### One control per question

The task filter was four pills — All / Today / Blocked / Done — which mixed
**when** a task is due with **what state** it is in, in one control where
answering one question erased your answer to the other. "Blocked things due this
week" was unaskable.

Time became a select. State did not come back as a second one: every row already
wears its state as a chip, and *a list you can read beats a control you have to
operate to learn the same thing.*

Today deliberately means `dueInDays <= 0` — **overdue included**. Something due
on Monday stopped being Monday's problem and became today's; giving overdue its
own tab lets the one row that has already slipped hide behind a control nobody
thinks to click.

That required replacing the boolean. `urgent: boolean` was standing in for a due
date the fixture did not have — fine while the only question was "is this row
loud", useless the moment the list needed a range. **You cannot range-filter a
boolean.** `dueInDays: number` answers both, so the urgency treatment and the
filter now read the same field instead of one approximating the other.

#### Two entry points, one truth

The campaign filter appears twice — page header and task card — and both write
the same state in Console. Not two filters: two handles on one. A local campaign
filter private to the list would put two controls on screen reading "All
campaigns" and "Platform SRE", each correct about a different half of the page.

It lives in Console, not Home, so scoping the overview, walking to the Agent and
coming back does not silently reset to All. Verified across that round trip.

Kept distinct from the sidebar's `campaign`, and the distinction is real:
`campaign` is a **navigation** context, always exactly one, with no "all" for it
to be; this is an **analytics** scope, which must be able to mean everything.

#### Hello, not Home

"Home" restated what the highlighted sidebar item already says, so the largest
type on the page was spent on its least interesting fact. 30px, lower, and
indented 16px past the content edge as asked — which does break the shared 64px
left edge every other element on the page starts at. It survives because 30px
type carries more side bearing than a 12.5px card title, so the indent reads as
air at this size in a way it would not at 13px. One `margin-left` away from
snapping back if it ever reads as a misalignment.

"New campaign" is **wired**, and to the thing that actually creates a campaign.
There is no campaigns table, so the tempting version is a modal with a name
field that posts nowhere. But the product's own model answers it: you do not
fill in a campaign, you brief the agent. The button seeds the composer and
navigates — the same move the task rows make.

#### The axis took three attempts, and the first two were about measurement

| Attempt | What broke |
|---|---|
| Stretch a `340×104` viewBox with CSS | Glyphs scale with the box: an 11px label rendered near **19px**, and *resized when the sidebar collapsed*. Filling a different aspect needs `preserveAspectRatio="none"`, under which a circle is drawn as an **ellipse**. |
| Measure with `ResizeObserver`, draw 1:1 | The SVG's `width` attribute gave it intrinsic width, which **propped its own container open** — the box never reported shrinking, so the chart ratcheted permanently wider on every sidebar expansion and painted 642px through a 548px card. Then, fixed by taking it out of flow, the observer turned out **not to fire at all** in headless: a freshly constructed `ResizeObserver` on the same node reported nothing in 700ms, so the chart rendered *nothing*. |
| Percentages, no measurement | Works. |

The rule: **paths tolerate a non-uniform stretch; type and circles do not.** So
the SVG holds only the fill and the curve in a 0–100 square, with
`vector-effect: non-scaling-stroke` pinning the line at 2.5px. The labels, the
gridlines and the markers are HTML positioned in percent on top. Text keeps its
real size, circles stay circular, and it re-lays-out at any width with no
JavaScript. Verified: `plotW` 517 → 373 → 613 across viewports, markers 7×7 at
every one.

A component that renders nothing until an async callback arrives has made its
own existence conditional on a callback it cannot guarantee.

Axis maximum rounds up to a multiple of **four**, not five or ten: the axis gets
three lines (nothing, half, full) and four is the smallest step keeping the
midpoint whole at every scale this chart sees. 21 → 24 with a midline of 12; a
multiple of five gives 25 and a midline of 12.5, and half a candidate is not a
quantity. It also bounds headroom to 3 units, so the curve fills its box instead
of cowering under a generous round number. Scoping rescales it honestly: 24 → 12
→ 8 → 4.

Four date labels, evenly spaced including both ends. Fourteen collide at any
width this card has.

#### Two measured corrections

- The top value label is **centred on** the top gridline, so half its
  line-height sits above it. At `top: 0` that half landed inside `.ov-big`'s box
  — a 6px overlap between "24" and "148", both hard against the card's left
  edge, so a real collision rather than a box artefact. Insetting the axis 7px
  gives the label its half-line and the peak marker more clearance at once.
- The solo campaigns card is **centred**, not top-aligned. One row in a card
  sized for three leaves ~60px of slack; pinned to the top that reads as a card
  whose content failed to load.

### 5.15 Sourced becomes a banner; the fourth slot becomes Conversion — *Adopted at revision 37*

Two changes to the same problem: the page read bland and the bottom was empty.

#### Sourced left the stack for a full-width banner

It used to be the top card of the three-card `.ov-stack`, sized like its
neighbours — a third of a 582px column for the one chart that carries a real
trend. Sourcing is most of a recruiter's day; the fix was giving it the width a
stretched grid row could never provide; it is now a direct child of
`.orc-stream`, bounded to the same `--orc-measure` content width as `.ov`
above it, with a taller plot (220px, up from 104) and more x-axis labels (7,
up from 4) so the extra room reads as a shape rather than stranded whitespace
between four widely-spaced dates.

One real bug caught in the move: `Area`'s x-axis label count was hardcoded to
four. Generalised to a `labels` prop — `Math.round((k * (data.length-1)) /
(labels-1))` — so the banner can ask for seven without a second component.

#020 Verified: banner width matches `.ov` exactly at every width tested (981
expanded / 1372 railed at 1568px; 716 at the 1100px single-column breakpoint),
7 labels render, zero collisions swept across every text node in the card.

#### The freed slot did not get backfilled with a guess

Sourced's old place at the top of the stack was left dashed and stated "not
decided yet" for one turn, rather than invented — the same instinct that
killed the tile gallery. That would have been exactly the thing this surface
refuses everywhere else: a metric implying a capability the page didn't
actually have.

#### Conversion: researched, not assumed

What went in the slot **was researched before it was built** — real 2026
sourcing-outreach benchmarks (cold email ~5%, personalised outreach 18-25%,
top-decile senders ~11%) and real KPI-card design guidance (never show a
percentage in isolation; pair it with its numerator and denominator or it is a
vanity metric — the same rule Progress's `of X` labels already followed).

Three ratios, not five, because the research on repeated-element attention
(the viewer barely registers past the first couple) applies to one card in a
stack exactly as it does to a KPI row:

```
Response rate        replied / contacted    28%  (17 of 61 replied)
Interview rate        interviews / replied   35%  (6 of 17 replied)
Sourced -> interview   interviews / sourced   4%  (6 of 148 sourced)
```

28% response rate sits above even the personalised-outreach benchmark band
(18-25%) — a number worth knowing, which a bare unbenchmarked percentage would
not have been.

All three fold out of the exact `stepsFor` call Progress already makes — no
new fixture, so Conversion and Progress cannot report numbers that disagree.
`shortlisted.of`, reused as the sourced total, is why the card does not also
call `sourcedFor` a second time.

Centred stat blocks, not left-label/right-number rows: Progress already owns
that shape for counts one card down, and copying it here would make the two
cards read as the same list rather than two different questions.

### 5.16 Progress becomes a real funnel; Conversion becomes rings — *Adopted at revision 38*

"Too bland" and "the funnel type view is not implemented" — both true. Bars and
bare percentages were correct but not visual. Researched twice before touching
either: funnel-chart design practice, and radial-gauge/progress-ring practice.

#### The funnel is a real tapering silhouette now

Four connected trapezoids, not four independent tracks. Consecutive bands
share an edge, so the whole thing reads as one narrowing shape rather than a
row of bars that happen to share a maximum.

**The reorder that makes the taper honest.** `stepsFor()` returns
`[shortlisted, contacted, replied, interviews]` because that is DERIVATION
order — shortlisted and contacted are both measured against the sourced pool,
not against each other. Their raw counts are not monotonic: contacted (61) is
larger than shortlisted (24), because they are two separate judgements over
the same pool, not one stage feeding the next. Drawing them in derivation
order would flare the shape outward in the middle before narrowing — not a
taper, a shape that looks broken. `ProgressCard` reorders by count before
handing stages to `Funnel` — contacted, shortlisted, replied, interviews — so
the drawing sequence is genuinely decreasing. The `of` on each stage is
untouched by the reorder; only the drawing order changes, never the fraction.

**One hue, four measured shades — and a computed one, not the existing
tokens.** Reached first for `--c-violet-tint`/`-line`/`-text`/`-fill`, then
measured them: tint is 1.20:1 against white, line 1.64:1 — both background
washes meant to sit BEHIND dark text, not stand alone as a filled shape. This
is exactly what the funnel's own predecessor already found "unfixable by
tuning". Built a proper 4-step ramp instead at `--c-violet`'s own hue/
saturation (266°, 50%), lightness only: `--c-violet-1..4`, measuring
3.27 / 4.57 / 6.42 / 8.15:1 against white.

> **Correction, revision 42.** This ramp was designed and measured but **never
> emitted as tokens** — `access.css` carries only the single `--c-violet`
> family (`-tint` / `-line` / `-text` / `-fill`), and `--c-violet-1..4` appears
> nowhere in `src/`. The rings moved off violet before the ramp shipped and
> this section was never corrected. It is left here because the measurement is
> the useful part, but **do not reach for these token names — they do not
> exist.** Caught during the revision-42 brainstorm, after this very paragraph
> had already misled a briefing document into telling four agents the tokens
> were available. Adjacent steps in ANY same-hue ramp
are still close (1.27–1.40:1 here), so every band also carries a 1.5px stroke
in the card's own surface colour — an explicit boundary rather than hoping
shade alone separates neighbours.

**Motion**: each band fades and grows in top-to-bottom, staggered 70ms apart —
the same "value reveals itself" language `Ring`/`Spark`/`Counter` already use
elsewhere on this page, so a fourth primitive does not introduce a fourth kind
of motion. Suppressed under `prefers-reduced-motion`, same as the others.

#### Conversion: three rings, not three bare percentages

`Ring` already existed in `viz.tsx` — arc sweep-in, per-hue colour, centred
percentage — built the same session as `Spark` and `Delta`, and used by
nothing until this card. A ring IS what a rate is: a fraction of a circle.
Swapping the bare `28%` text for the ring did three things a text-only number
could not: gave the number a shape, gave it the same mount animation every
other data primitive on Home already has, and answered "too bland" by putting
genuine colour and motion where there had only been ink.

`Ring`'s label was a fixed 9.5px, sized for its unused 38px default. Asking
for it at 68px made the number look lost in the middle of the arc, so the
label is now `size * 0.24` — proportional, so the primitive stays correct at
whatever size a future caller picks rather than only at the one size it
happened to be built for.

The denominator stays printed beside every ring exactly as it was beside every
bare percentage before — the KPI-card research that shaped the previous
revision (never show a rate without its numerator and denominator) did not
stop being true just because the rate gained a shape.

#### What stayed the same

Colour budget is still three. Progress and Conversion both spend violet, not
a new hue each — a card asking for attention by introducing colour that
nothing else on the page uses is the exact trap this surface has refused since
the palette was first measured. `stepsFor()` is still the only source either
card reads from, so they still cannot disagree with each other.

Verified: 4 bands render, zero text collisions swept, cards stay equal-height
across breakpoints (263px expanded, 299px railed, 157/314/185 intrinsic at the
1100px single-column break — the funnel gets MORE dramatic at that width, not
less, since it goes to a whole column's height with nothing to divide it by).

### 5.17 The Agent page gets a fleet — and nine classes come back — *Adopted at revision 39*

Run from a generated design prompt (`.prompts/agent-page-design.md`, gitignored)
for the orchestrator surface. The research changed the build; an audit changed
the priority.

#### The page was broken, and this document's own tooling broke it

Nine classes `Agent.tsx` renders had **no rules at all**:

```
.orc-head  .orc-head-mark  .orc-head-id  .orc-head-kicker  .orc-head-name
.orc-head-menu   .orc-gauge   .orc-gslot   .orc-gslot-v   .orc-composer-note
.orc-recs  .orc-recs-k  .orc-recs-list
```

So the revision-34 brief gauge rendered as six raw `<li>` bullets — *"• Level
• Skills • Scale • Location • Background • Experience"* — the suggestions
rendered as bordered links in a bulleted list, and the campaign header had no
type. It had been that way for three commits.

The cause was **`73fd3c9`, the commit that deleted the widget gallery.** Its
message claims it removed 198 CSS rules. It removed **2,020 lines**, and these
went with the `.bn*` / `.tm*` blocks they happened to sit beside. Home was the
page under test, so nothing caught it. The identical failure then recurred two
revisions later while retiring `.ov-big`, which took `.ov-chart.is-wide` with
it and hung a chart 77px below its own card.

> **Edit this stylesheet by matched text, never by line range.** A range is
> anchored to neighbours that have no reason to be related to what you are
> removing.

All thirteen were **recovered verbatim from `fb209c0`**, not rewritten — rules
reconstructed from memory would have silently changed the design. `.orc-intro*`
is the one exception: it was never styled, so those three are new.

One recovered rule was itself a trap. Only `.orc-gslot.is-on` had survived, and
it was the *wrong* `.is-on` — an older rule hardcoding `#ad3b0c` and two nav
tokens, long superseded because `Agent.tsx` sets each facet's own tint/line/text
inline. Inline wins, so the rule had no visible effect and was pure
misdirection for the next reader. Replaced with the real one.

#### The fleet: what the orchestrator was missing

The page had a composer, a transcript and a rail of past briefs — briefing and
recall. It had nothing for the orchestrator's actual job: it **deploys** agents
per campaign and supervises them. A supervisor surface with no supervised
agents was the page's largest gap.

The research is blunt about the stakes. **71% of AI product abandonment traces
to interface failure rather than model failure**, and the missing transparency
layer is specifically where agent products lose trust in the first fortnight.
So this is not a status widget; it is the page's second job after the composer.

**Freshness is a field, not a spinner.** Agents publish on independent
schedules — one streams, one wakes hourly, one fires on an event, one is
failing with backoff. So the view reads the *latest known good state* and says
how old it is. A `running` row last heard from 41 minutes ago is a different
fact from one heard from just now, and only the timestamp tells them apart. A
request-time status model would not be merely suboptimal; it would lie.

**Steps are states**: `queued / running / waiting / error / done`. Two of them
are why the list exists — `waiting` is the agent asking permission and the only
state a human *must* act on, and `error` is the one a spinner hides forever.

**Tool faults and agent faults are labelled differently**, in the glyph and in
the words: `Connector` for a mailbox that rejected a send, `Brief` for a brief
too vague to search. Collapsing them is what makes a user stop trusting the
agent at all — the integration's fault reads as the agent being stupid. Every
fault carries its fix, because a failure state with no next step is a dead end.

**Sorted by who needs a human, not by time.** A list ordered by recency buries
the one blocked agent behind five that are fine.

Measured and fixed, both caught by measurement rather than by looking:

- **Pills landed at six different x positions** (877 / 888 / 895 / 957 / 956 /
  979). Grid columns align only within *one* grid container and every row is
  its own, so `auto` sized each row to its own content. Fixed widths rather
  than `subgrid` — reserving the space is the better behaviour, since a
  reserved column keeps the layout still as an agent transitions.
- **Five of six pills were coloured**, which fails this document's own test
  immediately: if nearly every sibling carries a coloured chip the colour has
  stopped carrying information. Colour is now spent only on `waiting` and
  `error` — three loud rows out of six, all three actionable. The leading dot
  still carries each state's hue as a 7px secondary encoding.

Contrast, computed: `--c-amber-text` on `--c-amber-tint` **4.56:1**, `--c-rose-text`
on `--c-rose-tint` **4.53:1**, `--c-rose-text` on white **5.39:1**. All past the
4.5 floor. Tier 2 throughout — hairline, **no resting shadow**; verified the
surface still has exactly one, on `.orc-composer-field`.

Verified: aligned pills at 1568 and 1100, zero collisions, fleet left edge
identical to the composer's in both sidebar states (320 expanded / 132 railed),
collapsed fault detail absent from the DOM, and "Ask the agent" seeding the
composer with turn count unchanged.

#### What was deliberately not built

Connectors and history **already exist** in the rail — `Channels` with a
connected count, and `Briefs` grouped Recent/Earlier. Building second copies on
the same page would have been the visible-progress answer rather than the right
one. The honest gaps that remain are named in `<open>`: the rail's channel rows
do not yet distinguish a *degraded* connector from a disconnected one, and
`SUGGESTIONS` is still static per-mode where `RECOMMENDATIONS` (added here,
each carrying the observation it came from) is the shape a real recommendation
needs.

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
| 26 | 2026-09-15 | Built the orchestrator (Home): campaign header with three movement metrics, bento opening state, blended composer with Sourcing/Agent modes and sourcing-only context slots, right rail of briefs and campaign setup (channels with real brand marks, collaborators), and the send-to-reply choreography. Added §5.4 with the ground's derivation, the naming argument for "brief", and the motion thesis. Ground is `#f4f1ec` — 27% saturation against the 54% that §0 records as having failed. Caught two of my own violations while auditing: I invented a tertiary grey `#9a9188` in four places (2.75:1, fails outright) which §3.3 forbids in as many words, and then tried to demote the same token with `opacity: 0.8` (4.19:1) — a translucent pass at a legal colour is still an illegal colour. Both now `--ink-2`, demoted by size. 25/25 text elements pass. |
| 27 | 2026-09-16 | Rebuilt the orchestrator and the colour system after the revision-26 surface was judged bland and "light wood". Measured three reference screenshots pixel by pixel: the finding was not which accent they use but WHERE the saturation sits — their ground is C* 0.01 with s89-93% concentrated in under 5% of pixels, mine was C* 2.76 across ~60% of the screen. New rule in §2.0: desaturate the large areas, saturate the small ones. Ground `#f4f1ec` → `--page #f7f7f5` (C* 2.76 → 1.01), `--nav-panel` neutralised, `--sub` added as a plane inside a card, and seven category hues × five roles added, every value solved for its floor. Rejected the references' blue primary — orange stays the only action colour — but measuring it was worth it: their `#51a7f5` carries white text at 2.56:1 and our own `--accent` at 3.51:1, so both buttons were illegal; `--accent-fill #cc4d17` is the brand hue solved for 4.5:1. Amber moved h38→h45 after rendering it beside brand terracotta at real size. Home rebuilt: per-state anchoring (dead space 626px → 24px), eight structurally distinct configurable tile kinds with size/hue/order/membership persisted locally, a My Tasks section, an enriched rail, structured reply artefacts, and a documented five-band motion set. 49 text elements audited, zero failures. |
| 28 | 2026-09-16 | Cleanliness pass. The revision-27 surface passed every contrast check and came back judged cluttered, with the composer 557px BELOW THE FOLD on a 1568x895 laptop — the core of the product, unreachable without scrolling. Measured the gap against the reference: 68 bordered elements vs ~6, 26 saturated colour spots vs ~6, 11 chips vs 0, 7 table names vs 0, 15 resting shadows vs ~1. Diagnosis in §4.3: density was never the problem, UNIFORMITY was — every element wore a border, a shadow, a tinted glyph and a footer, so nothing receded. Added the four-tier loudness hierarchy, the colour budget (≤ 8 saturated spots; accent capped at 3 instances; a hue only where sibling rows genuinely differ), and the rule that cleanliness is restraint in treatment rather than in quantity. Structurally: the composer moved from the last grid row to the second, so it is permanently visible and the transcript grows downward under it — which also retired the per-state anchoring that existed only because it had been last. Removed the greeting (a third heading competing with the campaign name and the composer's own placeholder), cut the default bento from five tiles to three, demoted suggestions from cards to bare lines, moved the stats out of the header into the rail, and replaced seven per-card table names with one quiet line. §4.4: extracted the travelling glow to `glow.tsx` and applied it to the CLASS of element (any field you type into) rather than to one favourite component — the composer was the most important field in the product and the only one without it. Motion rewritten to five documented bands over classes, on the research finding that animations draw attention once while micro-interactions sustain it. |
| 29 | 2026-09-16 | Canvas and colour-zone pass, after the surface was judged "not blended" and "bland with no vibrance". Two measurements drove it. (1) THE CANVAS: every fill in the reference is `#ffffff` — page, composer, rail cards, status cards, all 1.000:1 against each other — so cards are outlined regions on one continuous surface, never separated by tone. `--page` went `#f7f7f5` → `#ffffff`, and the rail's `border-left` was deleted: that one line was the main reason the right column read as a second document. Columns are now separated by 55px of canvas and nothing else. §2.1.1. (2) COLOUR ZONES: sampling saturated pixels per band showed the greeting and the bento hold 89.5% of the reference's colour while its tasks header holds 0.0% and its task rows just 5.1%. So colour is concentrated, not distributed — which explains both the cluttered version (26 spots, spread) and the bland one (7 spots, spread). §2.1.2. Structurally: the composer went back BELOW the bento as asked, and the fold problem was fixed the right way this time with `position: sticky` rather than by reordering the page; it is a sticky last child INSIDE the scroll container, which also cured a 15px ragged edge caused by it not sharing the stream's `scrollbar-gutter`. All four blocks now share one `--orc-measure` — left and right spread measured at 0px, against three different widths before. One 20px rhythm replaced gaps of 10/73/14/10/24. The greeting returned (wrong to remove it) with a blue wash. Interactions: three new arrival gestures that each animate TO the real datum — a ring sweeping to its percentage, a spark drawing left to right, and a number counting up — deliberately NOT the travelling glow, which stays exclusive to fields you type into, because an effect reused everywhere stops being a signal. Two contrast fixes fell out of the build: the funnel's per-step fade toward its tint put bars 2-5 at 2.96 / 2.50 / 2.12 / 1.82:1, under the 3:1 a data mark owes, and it was unfixable by tuning because the undiluted mark is only ~3.3:1 — so the fade was deleted outright and depth is carried by the bar widths, which are the datum. And the rail's stat labels went from uppercase to sentence case: "SHORTLISTED" with +0.03em tracking needs ~78px against a ~67px column, so two of three rendered as "SHORTLIS…". Uppercase costs roughly a fifth of the width for the same word and the tracking it needs costs more again; the uppercase micro-label device belongs where there is a full column to spend it. |
| 30 | 2026-09-16 | Spacing and placement pass. The gap between the content and the rail was the `--orc-measure: 980px` cap: with the sidebar railed the column is 1188px, so the content stopped 208px short and left a 168px void — measured. The measure now fills its column (`min(100%, 1240px)`) and the rail's gutter is a deliberate 28px margin rather than leftover space; gap to rail 168px → 40px. Widgets shrunk: `grid-auto-rows` 176 → 144px. 138 was tried and rejected on a measurement — the `replies` tile's action overlapped its last name row by 4px, which `scrollHeight` could not detect because the tile is `overflow: visible`; 144 became safe only after dropping that tile's "Longest wait first" label, which restated what the ordering already does. The task list is now a constant 140px with its own scroll, so total page height (and therefore where the composer lands) no longer depends on how many tasks exist; it is sized to clip a row mid-height, which is the clearest signal a list scrolls. The composer stopped being sticky — it was only pinned because the page overflowed, and with the widgets and list bounded the whole surface fits a 1012px viewport, so it sits in the flow at 75% of the viewport height instead of glued to the bottom edge (92% before). Recommended searches moved from above the composer to below it, rendered as pills with a search glyph rather than bare sentences, and the honesty line moved to the very foot; both were spending vertical budget above the field. "Customise home" folded onto the greeting baseline, reclaiming another 50px. Rhythm tightened 20 → 14px. Verified: 0 tile collisions, 0 horizontal overflow, no page scroll, and 75% composer placement in both sidebar states at 1568x1012. |
| 31 | 2026-09-16 | Composition and spacing pass, on the note "don't fill spaces by increasing the size — we need subtle and just the right amount of spaces" and "components feel too big". §4.5: measured the reference's proportions (content 53.6%, gutter 9.6%, rail 26.4%, right margin 4.8%) and found the rail at 312px with NO right margin and the content stretching to 1108px. The composition is now capped at 1290px and centred, so a wider window buys page margin rather than bigger components — content is a stable 830px with the sidebar expanded or railed, the composer went 1108 → 830, tiles 453 → 409, the rail 312 → 340, and the page gained a 34px right margin plus a 56px gutter. §4.6: vertical rhythm reduced to ONE owner (`.orc-stream` gap 22px, no per-block margins) after measuring 20/30/10/0/10; now 22 across every boundary. Padding unified to 16px on wide cards and 14px in the rail, from four different values. Two process bugs recorded: a `.tk { margin-top: 10px }` whose comment justified duplicating a gap, and a string substitution that silently matched nothing so the source read as fixed while the page measured broken — every stylesheet edit is asserted to match exactly once now. Tile content is being trimmed to a measured 108px content box rather than the rows being grown, because the components were the thing judged too big. |
| 32 | 2026-09-16 | Reply kinds, the working indicator, and the bento default. §5.10: added prose, question and a reasoning trace beside the artefact, behind one `Reply({ reply, onAnswer })` dispatching on `kind` — prose deliberately looks like nothing, because if it looks designed the artefact's card stops meaning "special". The trace is collapsed and absent from the DOM when closed, shows each step's `found` items (the half a recruiter could not guess), and puts its honesty line FIRST — a documented departure from honesty-last, since trace steps assert about the past and a correction after four believed assertions is too late. Question options seed the composer and never act; verified the turn count stays unchanged. §5.11: the mark stopped spinning. A tumbling logo reads as a throbber rather than a presence, so `@keyframes orc-turn` was deleted and the motion moved to an orbiting arc whose dash length breathes (10%→42% of the circumference) on two different periods. DELETED the prompt's intent wash: it took a "leading clause" by string split, and on "Find me good candidates" — four words, no comma — both bounds missed and it washed the ENTIRE message as one orange serif pill. That was the common case, not an edge case, and the comment defending it was wrong. DELETED the WORST DROP panel: it reported the largest ADJACENT funnel loss, which is always Sourced → Shortlisted by construction, so it could only ever print the same finding while framing intended behaviour as a failure; not replaced, because an honest version needs a baseline no fixture carries. Bento default cut to FOUR tiles, two wide and two narrow alternating over a THREE-column grid (only 3 tracks let `m`+`s` fill a row exactly). `pipeline` left the default on a measurement — it needs 222px and overflowed a 140px row by 51px when I ignored that; it stays in the gallery at `l`. Greeting bar moved to the top of the page where it survives into the conversation state, the campaign gained a name-derived mark beside its title, and the page-level fixtures line was removed — the load-bearing honesty marker stays at the point of action. |
| 33 | 2026-09-16 | Bumped the tile-layout storage key v1 → v2, which should have shipped with revision 32. The bento went from a four-column grid to three and the default from five tiles to four, so a saved layout was structurally VALID (`kind`, `size` and `hue` all still validate) and semantically stale: a `size: "l"` that meant half the width now means two-thirds, and a five-tile arrangement that tiled cleanly at four columns leaves a hole at three. The result was people looking at a layout the current grid could not produce — tiles stacked in one column with one floating outside the content measure. This is precisely the case the versioned key exists for, and the lesson is that versioning only helps if the bump actually happens when the shape changes. The arrangement is now verified off real geometry rather than from the spec: row 1 long+short, row 2 short+long, four tiles on a 3 × 312px grid, bento 294px tall. |
| 34 | 2026-09-16 | The composer reads the brief. §5.12. Research finding: conversational input measures 30-60s per message and the cost is not typing but that you cannot tell what was understood, so people re-read and rewrite defensively. A sourcing brief is a structured query wearing prose clothing, so the composer now underlines the spans it RECOGNISES beneath the words in their facet's colour — seniority, skill, scale, location, company, tenure — with the same reading repeated as chips below the field for anyone who cannot rely on colour. Matching is a fixed auditable vocabulary, never a model, so the only claim made is "these words are in my vocabulary"; unrecognised text staying plain is the useful half of the signal. This is the honest version of the intent wash deleted at revision 32, which highlighted a string split. Implemented as a mirror div behind a transparent-texted textarea, with four traps documented at the rules: pre-wrap plus overflow-wrap are as load-bearing as the font, `inset: 0` resolves against the padding box (16px misalignment, fixed with a content-box wrapper rather than a duplicated padding value), `-webkit-text-fill-color` is inherited by ::placeholder and made it invisible, and the mirror's scrollTop must track the field's. Two bugs caught by tests rather than by looking: "Staff engineers" under-claimed as "staff" until plurals were tolerated, and "5 years" collapsed to "years" until patterns were ordered before the word list. 12 new tests; 83 total. |
| 35 | 2026-09-16 | Home becomes a fixed overview and the widget feature is deleted. §5.13. Two columns at 50/50: today's tasks left (the page asks "what should I do now" and the list is what answers it; the guidance puts the answer top-left), three analytics cards right — sourced-per-day as a smooth area chart, a four-step progress card, and active campaigns. The three are ROWS of a stretched grid track rather than cards with their own heights, so their sum equals the list's by construction; measured 620/620 with cards at 193/193/193, and 50/50 holding in both sidebar states (columns reclaim the collapsed rail: 582 → 676). Deleted the tile gallery entirely — Bento.tsx, TileMenu.tsx, tileLayout.ts, the tile model in orchestrator.ts and 198 CSS rules — because configurability cost a persisted schema, five key versions in one session, two popovers, a drag interaction and a resting state that had to look deliberate at three sizes and seven hues, to answer a question a fixed overview answers for everyone. Research changed three decisions I would have got wrong: markers go on high/low/latest rather than all fourteen points; the LINE is pale and the MARKERS are vibrant, not the reverse; and the palette is three hues with rose reserved for a campaign that has actually stalled. One measured bug: the chart plot had no definite height, so `height: 100%` fell back to the viewBox aspect ratio — 178px at 582px wide — which inflated the card, the stack and then the task list to 883px for two tasks. |
| 36 | 2026-09-16 | The overview gains a campaign filter, a time window, an axis and a greeting. §5.14. Every number is stored PER CAMPAIGN and "All campaigns" is the fold — 78+46+24=148, funnel folds to [24,61,17,6] — because hand-written overall totals would let the header disagree with the sum of its own parts with nothing in the type system noticing; pinned by 13 tests asserting RELATIONS (day-by-day equality, each step inside its denominator) rather than fixture values. `live` became derived from `funnel.contacted`: it had been a stored 61 that was also the overall contacted count, two unrelated numbers that happened to match. Unified the two campaign id spaces (`sbe` vs `backend-snr`) onto the canonical list. Four task pills became two selects because the pills mixed WHEN with WHAT STATE in one control, making "blocked things due this week" unaskable; state needs no control since every row wears a chip. Today means dueInDays <= 0, overdue INCLUDED — which forced replacing `urgent: boolean` with a number, since you cannot range-filter a boolean. The campaign filter appears twice writing one piece of Console state: two handles on one truth, and it survives navigating to the Agent and back. "Home" became "Hello <name>" at 30px, indented 16px past the shared 64px left edge as asked. "New campaign" is wired to the composer rather than a modal posting nowhere. The axis took three attempts and the first two were about measurement: a stretched viewBox scaled 11px type to ~19px and drew round markers as ellipses; a ResizeObserver version let the SVG's width attribute prop its own container open so the chart ratcheted wider and painted 642px through a 548px card, then — once out of flow — never fired at all in headless and rendered nothing. The rule: paths tolerate a non-uniform stretch, type and circles do not. SVG holds only fill and curve in a 0-100 square with non-scaling-stroke; labels, gridlines and markers are HTML in percent. Verified plotW 517/373/613 across viewports with markers 7x7 at each. Axis max rounds to a multiple of four so the midpoint stays whole (21→24, midline 12). Two measured corrections: the centred top label overlapped .ov-big by 6px until the axis was inset 7px, and the solo campaigns card is centred rather than top-aligned into ~60px of void. |
| 37 | 2026-09-17 | Sourced becomes a full-width banner below both columns; the freed top-of-stack slot becomes a researched Conversion card. §5.15. Sourcing is most of a recruiter's day, so the chart left the three-card stack for a direct-child-of-.orc-stream banner at the full content measure, plot height 104→220, x-axis labels 4→7 via a new generalised `labels` prop on `Area`. The freed slot was NOT backfilled with a guessed metric for one turn (dashed, "not decided yet") before being researched: real 2026 sourcing-outreach benchmarks (personalised outreach 18-25% reply, top-decile ~11%) and KPI-card design guidance (never show a percentage without its numerator/denominator, the same rule Progress's `of X` labels already followed) landed on three ratios — response rate 28% (17 of 61), interview rate 35% (6 of 17), sourced→interview 4% (6 of 148) — not five, because the research on repeated-element attention loss applies to one card exactly as it does to a KPI row. All three fold out of the same `stepsFor` call Progress makes, so the two cards cannot disagree; `shortlisted.of` is reused as the sourced total rather than calling `sourcedFor` again. Verified: banner width matches `.ov` at every width and sidebar state (981/1372/716), 7 labels render, zero text collisions swept, 3-stat row holds at the 1100px single-column breakpoint. |
| 38 | 2026-09-17 | Progress becomes a real tapering funnel; Conversion becomes three animated rings. §5.16. Researched funnel-chart and radial-gauge design practice before rebuilding either — "too bland" and "funnel not implemented" were both accurate complaints about bars and bare text. Funnel: four connected trapezoids sharing edges, reordered from stepsFor()'s derivation order (shortlisted, contacted, replied, interviews) to count order (contacted 61, shortlisted 24, replied 17, interviews 6) so the taper is honestly decreasing rather than flaring outward, since Contacted and Shortlisted are parallel judgements over the sourced pool, not sequential stages. Reached for the existing --c-violet tint/line/text/fill tokens first, measured them (1.20:1 / 1.64:1 against white — background washes, not standalone-fill-safe), and built a proper 4-step lightness ramp instead at violet's own hue/saturation: --c-violet-1..4 at 3.27/4.57/6.42/8.15:1. Same-hue adjacent steps still only differ 1.27-1.40:1, so every band also carries a 1.5px stroke in the card's surface colour as an explicit separator. Bands fade+grow in staggered 70ms apart, reduced-motion suppressed, matching Ring/Spark/Counter's existing arrival language. Conversion: swapped three bare percentages for Ring, which already existed in viz.tsx unused since an earlier revision. Ring's label was a fixed 9.5px sized for its 38px default; made proportional (size * 0.24) once asked for at 68px, since a fixed value was only ever correct at the one size it happened to be built for. Colour budget stays three — both cards spend violet, no new hue introduced. Verified zero collisions, cards equal-height across breakpoints (263 expanded / 299 railed / 157-314-185 intrinsic at the 1100px break, where the funnel gets a whole column to itself and reads even more dramatically). |
| 39 | 2026-09-18 | The Agent page gets a fleet, and thirteen lost classes come back. §5.17. AUDIT FIRST: nine classes Agent.tsx renders had no rules at all — the revision-34 brief gauge was rendering as six raw <li> bullets, the suggestions as bordered links in a bulleted list, the campaign header with no type, and had been for three commits. Cause was 73fd3c9, whose message claims 198 rules removed and actually removed 2,020 lines, taking .orc-head* / .orc-gauge / .orc-gslot* / .orc-recs* / .orc-composer-note with the .bn*/.tm* blocks they sat beside; Home was the page under test so nothing caught it. Recovered VERBATIM from fb209c0 rather than rewritten. One recovered rule was itself a trap: only .orc-gslot.is-on had survived and it was the wrong one, an older rule hardcoding #ad3b0c that Agent.tsx's inline facet colours had long overridden — invisible in effect, misleading in the source. Rule established: edit this stylesheet by matched text, never by line range. THEN THE FLEET: the orchestrator deploys and supervises per-campaign agents and the page had no surface for it. Freshness is a field rather than a spinner because agents publish on independent schedules — the view reads latest-known-good state and says how old it is. Five run states (queued/running/waiting/error/done) with `waiting` the only one a human must act on. Tool faults and agent faults are labelled differently in glyph and words, each carrying its fix, because collapsing them makes the integration's fault read as the agent being stupid. Sorted by who needs a human, not by recency. Two measured fixes: pills landed at six different x positions because grid columns align only within one container and every row is its own (fixed widths, not subgrid — a reserved column keeps the layout still as an agent transitions); and five of six pills were coloured, failing this document's own test, so colour is now spent only on waiting and error. Contrast computed: amber-on-tint 4.56:1, rose-on-tint 4.53:1, rose-on-white 5.39:1. Connectors and history were deliberately NOT built — both already exist in the rail, and second copies would have been visible progress rather than right. |
| 40 | 2026-09-18 | The rail's Configuration panel had no padding, and a section label's inset is not a free choice. §5.18. THE BUG FIRST: the config card rendered its values **3px** from their own border, which read as a design failure and was a specificity collision — the element carries both `.rail-panel` (`padding: 14px`) and `.rail-config`, and `.rail-config` set `padding: 0` at equal specificity later in the file, so it won. It had been invisible for as long as the rows carried `8px 12px` of their own padding, which accidentally stood in for the padding the panel had lost; tightening rows to the reference's spacing removed that compensation and exposed a rule that had never worked. The lesson is the shape, not the number: **a rule that only works because a different rule is compensating for it is not working.** Panel owns its inset, rows own their rhythm; measured 15px both sides after. Then the same class of error one level up — **a section label has to start where the rows it labels start, and those rows are buttons with their own horizontal padding, so the label's inset is a CONSEQUENCE, not a choice.** Measured: the dialog's `RECENT` at 17px over a row icon at 25px, and the rail panel's `History` at 2px over rows insetting 8px. Both looked deliberate; each number had been picked against the panel edge while the rows were placed against something else. Fixed with one mechanism rather than three numbers: whichever container owns a list declares `--row-inset`, and `.rail-micro` / `.rail-panel-label` read it as `padding-left`, so changing a row's padding moves its label and there is no second number to remember (23/23, 15/15, 25/25). CONFIGURATION gained the reference's fields — Owner, Collaborators, Visibility, Department, Channels, ATS job, Intake — and with them its best idea: **an unset field puts the ACTION that would fill it in the value position**, not a blank, a dash, or the word "None". That forced `set` and `unset` to be different TYPES in the fixture (`string` vs `null`), because `atsJob: "None"` collapses them and the rail can no longer tell "nothing is linked, here is how" from "the linked thing is called None" — the null is the information. Every affordance carries a mandatory `href` to a real route, since an affordance that reads as a control has to go somewhere. Channels renders the connected brands' own marks at 14px (Slack 11.00:1, Outlook 4.53:1, Teams 6.60:1, Notion 17.59:1 on white, all clear of the 3:1 glyph floor) — colour spent on RECOGNITION, which is the one thing a mark does better than its name, and a fixture field rather than a hash because these are four fixed brands with four real colours. Only CONNECTED channels appear, which is what lets the marks carry no on/off encoding of their own: every logo present is a logo that works, and dimming the two disconnected ones would have put state in an opacity low enough to fail the floor for a glyph that still means something. The `2 of 4` stays beside them because marks can only say what IS connected and the row's real question is whether anything is missing. HISTORY went from a single `History 7 ›` count row to **four rows inline plus `View all 7`** — research on space-constrained lists lands on three-to-five recent items plus a clear route to the rest, and both extremes fail differently: all seven is the ~180px list this replaced, while a bare count tells you a number and withholds the only useful content a history has, which is what the recent briefs were. `View all` renders only when rows are actually hidden, or it is a lie about there being more (BRIEFS 4 → 7 so the truncation is real). The dialog gained the palette's search head verbatim — same magnifier, same borderless input, same `autoComplete`/`spellCheck` posture, focused on open — because the app should have one way a floating thing is searched, not two that look almost alike; it matches title AND campaign (you look for a brief by "iOS" when its title never says iOS), re-groups the FILTERED set rather than filtering two prebuilt groups so an emptied `Recent` header disappears with its rows, states its count only while filtering, and names the query back on empty so a typo is visible as a typo. Extracted `BriefRow` so the inline list and the dialog render one row definition instead of two that drift, and `isRecent()` so the recency predicate is not written twice. Both lists became `<ol>`: reverse-chronological order is the meaning. MEASUREMENT TRAP: `getBoundingClientRect()` on a block returns the BORDER box, so `padding-left` is invisible to it — the alignment fix looked like it had failed until the text edges were measured with a `Range`. Deleted the superseded `.rail-open` block. |
| 41 | 2026-09-18 | The Agents block folds onto its campaigns, and a z-index nobody wrote down had made two dialogs inert. §5.19. THE LAYERING BUG FIRST, because it invalidated a verification pass: `.pal-scrim` was authored at `z-index: 70` to sit under the palette's `71`, but every dialog added afterwards reused that scrim while picking `60` from the nav popovers — which have no scrim. So the scrim rendered ON TOP of both the history popup and the new campaign flow. Two consequences, and the cosmetic one is what got reported: the dialog was tinted by its own backdrop (read as "the whole site is under a colour filter" — correct, and the `+ New` button measured muted brown instead of `rgb(204,77,23)` accent), and every click aimed at the dialog hit the scrim instead. `elementFromPoint` at the popup's own centre returned `.pal-scrim`; `dialogIsClickable: false`. **The earlier "verified" interaction pass was worthless** — it had set the search field with `evaluate` and dispatched synthetic events, and its one mouse assertion was "scrim-click dismisses", which is what EVERY click did. Re-verified with real `page.keyboard.type` and real clicks: typing filters (2 of 7), picking a brief closes the dialog, seeds the composer and selects in the rail. Fixed by writing the scale down as `--z-pop: 60` / `--z-scrim: 70` / `--z-dialog: 71`, so a new dialog reads a NAME and cannot land under the scrim it reuses; `.con-skip` and `.nav-switch` stay on the pop tier deliberately (no scrim to out-rank, and a skip link should be behind a modal's scrim because focus belongs to the dialog). The scrim itself was also genuinely tinting: `rgba(40,24,16,0.34)` lands on #b6b0ae over white, a red-minus-blue spread of 8 — a visible sepia. Now `rgba(26,22,20,0.30)`, spread 2, still faintly warm because the canvas beneath is warm and a cold grey reads as a different material. THE AGENTS BLOCK measured **552px for six rows over three campaigns, 55% of the viewport**, pushing the composer — which holds the page's one hero slot — below the fold. The size was the visible fault; the real one was that a flat list of RUNS made the reader do the grouping: two `Outreach` rows on two different campaigns sat adjacent and read as one campaign's pair, with the campaign name the quietest text in the row. Worse, height grew with how badly things were going (52/62/62/111/62/80) because each run carried its prose, yield, fault and actions inline — so the worst campaign was the one you scrolled furthest to finish reading. **A supervision surface whose size reports the severity of the problem punishes you for having problems.** Now one row per campaign at a fixed 59px — 258px total, 26% — carrying the four facts that change what a supervisor does next: blocked or not, which agent leads, what stage it is in, how fresh. Columns are FIXED (`76px` for the widest pill label `Needs you`, `62px` for the widest age `just now`) and not `auto`, because each row is its own button and therefore its own grid — `auto` sizes to its own row and nothing aligns between rows, which is exactly the ragged-pill fault measured in revision 39. Everything variable moved into a scrollable per-campaign flow dialog, and the flow is DERIVED from FLEET — each agent's own `steps` array split at its `step` index — never authored beside it: a parallel narrative is free to say "Matching the role" in the row and "Planning the search" in the flow with nothing noticing. Grouped by agent rather than interleaved into one campaign timeline, and that is a data limit not a preference — `seenAgo` is per agent, so there are no per-step timestamps to interleave on and a merged timeline would have to invent the order. `STEP_NOTE` holds notes ONLY for finished steps; the step in flight reads `agent.doing`, so the fixture cannot state the same fact twice and differently (pinned by a test that rejects any key at or past an agent's current step). Four honesty bugs found by reading the two components side by side rather than either alone: the current-step marker was blue — i.e. "running" — for every state, so `Sending` wore a running halo directly under its own `Stopped` pill and a queued agent looked like it had started (fixed in BOTH the roster stepper and the flow track, and `MARK_MOD` made exhaustive over `RunState` so a sixth state is a type error rather than a silently blue segment); `flowFor` marked a finished agent's last step as in-flight; the yield chip rendered after the whole list, putting "24 shortlisted" directly beneath `Ranking candidates` — a step not started — so it now attaches to the furthest step actually reached; and the header count read `needsHuman(scope)` straight off the fixture, so dismissing a fault left the surface's loudest number claiming `3 need you` while the row beneath it had correctly gone quiet. `needsHuman` was deleted rather than left as an attractive nuisance. Also removed `.fl-cr-i.is-needs`, which was markup with no rule behind it. Deleted 11 dead rules from the flat list. 14 new tests pin the derivation as RELATIONS — the roster accounts for every agent in scope, leads with the highest-ranked one, and orders campaigns by lead rank (an earlier draft sorted on `needsYou > 0`, collapsing `waiting` and `error` and letting a merely-stopped campaign outrank one actually waiting on a person — it contradicted the very rule it claimed to reuse, now `RUN_RANK` shared by all three callers). |
| 42 | 2026-09-18 | The Agents section becomes a three-stage muster board, and a greedy regex eats 130 rules. §5.20. Verdict on revision 41's roster was "too bland, AI slop", so the section went through a structured ideation pass (CGU `multi_agent_brainstorm` — Explorer / Critic / Wildcard, plus a reference hunter — run as four real parallel subagents rather than four voices in one context). ALL FOUR independently named the same root cause: **`pickLead` is a `max()`**, and that one function produced four separate complaints. It saturated the palette (every campaign contains a blocked agent, so the lead was blocked on 3 of 3 rows — seven coloured elements, two of them the identical rose "Stopped"; the old flat list was 3 loud of 6, and the fold silently made it 3 of 3 while shipping a comment claiming otherwise). It flattened the one quantitative mark (`steps.length` is 4 for Sourcing/Outreach and 3 for Screening, but all three leads happened to have 4 steps, so the stepper drew an identical 65px in every row — the variation was in the data, hidden by the pick). It **suppressed the only animation**: `pulse` was gated on the lead being `running`, `waiting` outranks `running`, so `f1` never reached a row and `getAnimations()` on the section returned ZERO — a surface whose entire subject is work in progress, motionless. And it hid half the facts (21 of 41). MEASURED BASELINE: 258px, **84.6% empty**, 12.9% type, one 65×3px quantitative mark = **0.09%** of the block — of which only the single lit segment cleared threshold, because traversed segments were `--rule` at **1.43:1**, so "step 3 of 4" never read as a position at all. Critic's `reverse` pass scored the design **7 of 8** on a checklist for making a status list maximally bland, and found the objective function stated out loud in the CSS: *"the same shape whether the fleet is healthy or on fire"* — **a process whose success metric is constancy cannot produce differentiation, it forbids it.** Critic's sharper meta-finding: *every* measurement previously taken on this section was a correctness property and not one was an expression property — you cannot reach interesting by only checking for wrong. THE DESIGN — Wildcard's `random_input` draw landed on "teeth", and a dental chart (a fixed positional grid of always-the-same slots where the finding that matters is often an empty socket) unlocked the spine: `role` is a three-stage ordered anatomy (Sourcing → Outreach → Screening) and **every campaign is missing a different stage** — backend-snr the end, platform-sre the start, ios-mid the middle. All three rendered `2 agents` and were structurally indistinguishable; ios-mid has a broken front end and a finished back end and the old row could not say so. Chose a strip over a better list on Wildcard's **wedge** argument, which is structural and not aesthetic: a row's x-axis means ATTRIBUTE (name, mark, pill, age, caret) and a pipeline's x-axis means POSITION, so they cannot share a line — in-row the anatomy gets ~11% of the width while five metadata columns take the rest, i.e. the surface's most meaningful structure is handed its smallest column. RESULT: 258 → **218-231px** (shorter), type 12.9 → **22.3%**, quantitative mark 0.09 → **1.46% (16×)**, coloured marks 7 → **5** (Wildcard's acceptance criterion was that the strip must spend LESS colour, and the first build failed it at 8 — the word's hue duplicated the in-flight rung's 20px away, so rule 9 settled it: data takes the hue, labels do not, and a WORD survives greyscale where a hued dot does not), animations 0 → **1**, facts on screen 51% → 6 agents + 3 drawn gaps + 2 yields + 2 fault kinds. Also: the card stopped being an outline and became a `--sub` PLANE, because Critic proved no token can fix it — on white `--hairline` 1.20, `--rule` 1.43, `--rule-strong` 2.81 all miss the 3:1 boundary floor and only the inks pass, while white-on-`--page` is 1.17:1, so neither the line nor the surface could carry figure/ground and the arrangement had to change instead of the value. Tint narrowed from `{waiting, error}` to `{waiting}` alone (grounded in the codebase's own words — `waiting` is the only state where a human is the blocker — and `RUN_RANK` already ranks it strictly ahead), header split into a rose `waiting` count and an ink `stopped` count so the rose number finally varies, and the word now names the fault KIND ("Tool broke" / "Stuck" / "Your turn") because the roster had been committing the exact tool-vs-agent collapse the `Fault` docstring spends a paragraph forbidding. The empty stage is a CONTROL, seeding the composer through the `onBrief` prop already threaded in — the section's first affordance that is not "open a dialog". Strip capped at 3 with the overflow naming its own blocked count, because past three blocked a bare "+2 more" would let the header contradict the marks beneath it. THREE SELF-INFLICTED BUGS CAUGHT BY MEASUREMENT: the untraversed rung was left as bare plane on the reasoning that "absence should be absent", which made a 3-of-4 agent indistinguishable from a finished 3-of-3 — the mark said HOW MANY ARE DONE and left the denominator to the text, the old stepper's exact failure; fixed by giving both states `--ink-2` and distinguishing them by HEIGHT (5px against 1px), which is the house rule taken literally, demote with size not a third ink. The sort tiebreak took `Math.max` of every agent's `seenAgo`, so iOS (9m) outranked Platform SRE (41m) because iOS's max came from its FINISHED agent at 96m — ranking on a number the surface does not show while the visible ages ran ascending against a "quietest first" rule. And the 3-up breakpoint shipped at 1080px when "Screening" at 10.5px/600 needs 62px and the station falls under that below **1360px**, truncating all nine role labels; the yield needs 68px and so hides below 1520px, both numbers derived from `(column − 14) / 3` rather than guessed. THE REGEX INCIDENT: a pattern meant to delete the 21 rules of the old roster used a greedy `(?:.*\n)*?` bridge to an `@media` block and removed **130 rules** — the entire `.vz-*` viz stylesheet, `.tk*`, `.ov-conv*`, and the whole fleet section. Recovered by set-difference against `2caca6f` (`.vz-*`/`.tk*`/`.ov-conv*` spliced back VERBATIM with their comments, verified by selector-set and keyframe-set equality reaching NONE-missing) plus the last built bundle for the `.fl-*` values, which is why those carry their measured numbers exactly. Same lesson as the line-range splice that cost 2,020 lines, in a new costume: **a pattern whose extent is bounded by something other than the thing you are matching will eventually match more than you meant** — delete by exact selector, one regex per selector, never by a span between two landmarks. Refused throughout, with sources: time-as-length in every form (Gantt, span, duration bar, `Spark`) — universal across Temporal / Airflow / Vercel / Sentry and impossible without start times; percentage and `Ring` (Microsoft's own guidance licenses the refusal); per-campaign brand hue (this repo already deleted `Stack`'s per-entity hues for encoding nothing); avatars (no people, and "Sourcing"/"Screening" both initial to S); inline accordion (straight regression to the measured 552px failure). `blockedBy` and a structured `yielded: {n, noun}` were flagged as schema additions and deliberately NOT faked — `yielded` renders verbatim rather than parsing a number out of prose. 15 new tests pin the anatomy as relations: three slots always in `AGENT_ROLES` order, filled slots accounting for every agent, each campaign's gap in a different stage, `needsYou`/`stopped` disjoint and summing to blocked, and the cap keeping the most urgent. Also corrected a doc drift the brainstorm surfaced: DESIGN.md has documented `--c-violet-1..4` since revision 38 and those tokens **were never emitted** — the claim had already misled this revision's own briefing document. |
| 43 | 2026-09-18 | Opening the history popup dropped the entire right rail 121px, because `:last-child` is positional. §5.21. REPORTED as "when the popup appears the right section comes down", and measured exactly: the rail's first panel sat at 143px with the dialog closed and **264px** with it open, while the rail container itself never moved. The mechanism was two lines that had been correct for as long as nothing else mounted into that container: `.orc-rail > :first-child { margin-top: auto }` and `.orc-rail > :last-child { margin-bottom: auto }`, an idiom that centres a flex column by splitting its free space between two `auto` margins. `HistoryDialog` was rendered inline by `Rail.tsx`, so opening it appended `.hist` as the rail's last child — **the bottom `auto` margin moved onto a `position: fixed` element where it does nothing**, and the surviving top margin absorbed the whole 242px instead of half of it. `getComputedStyle` showed `margin-top` going 121.188px → 242.359px, exactly double, which is what identified it: a free-space split that stopped being a split. Note what did NOT go wrong — `.hist` is `position: fixed` and was correctly out of flow, so the usual suspicion (a modal taking layout space) was wrong; the dialog never occupied a pixel of the column. It broke the layout purely by **existing as a sibling**, which is a much quieter failure mode and the reason it survived a previous sweep that checked the left nav for movement and found none. Fixed twice on purpose, because the two fixes answer different questions. (1) Both nested dialogs — `HistoryDialog` in `Rail.tsx` and `Flow` in `Fleet.tsx` — now render through `createPortal(…, document.body)`, matching the convention `Nav.tsx` already established for its switcher popover. A modal is not a sibling of the content it floats over, and at the document root no layout outside the component can depend on whether it is open. (2) The rail's centring became `justify-content: center`, which states the intent directly and cannot care what the children are. Identical geometry at rest (22px padding + 121px of half free space = 143px) and no future sibling can break it. **One fix removes the dependency; the other removes the fragility** — keeping only the portal would leave a positional selector waiting for the next element someone adds. Verified: section tops identical at 143/266/571 across closed → open → reclosed, `margin-top` now a flat `0px`, rail child count constant at 3, and the strip and composer unmoved; the only thing that differs between states is whether `.hist` exists under `document.body`. Both dialogs still centre, still sit above the scrim, still take clicks, and still do their work from the new mount point — history filters (2 of 7) and seeds the composer on pick, flow opens from a campaign heading with both agent tracks. The general lesson is narrow and worth keeping: **a positional selector encodes an assumption about siblings, so any component that mounts into a container it does not own can invalidate it from a distance.** `:first-child`/`:last-child` for layout maths is a standing invitation to that bug; container-level properties are not. |
| 44 | 2026-09-18 | The Agent page's typography was the browser's, not ours. §5.22. Asked to remove the Agents block and the campaign name and "standardise this page properly — like typography and all". The audit found the reason the page looked unstandardised, and it was not a set of choices: **eight classes had no CSS rule at all**, so the entire landing state rendered at UA defaults. `.orc-intro-h` at 32px/700 Fanwood is what an unstyled `<h1>` is (2em bold); `.orc-recs-k` at 24px/700 is an unstyled `<h2>` (1.5em); `.orc-intro-p`, `.orc-composer-note` and `.orc-fixtures` at 16px/400 serif were inheriting `body`; and `.orc-rec > span` rendered **13.333px Arial** — the only Arial on the page and the tell that cracked it, because `<button>` is the one element that does not inherit the `font` shorthand, so with no declaration nothing in the cascade reaches its text. **The page's type hierarchy WAS the UA stylesheet**, and it read as deliberate because `h1 { font-size: 2em }` happens to land near a real display size while `body` supplies the serif. Casualties of the `73fd3c9` line-range splice; revision 39 recovered thirteen classes from that incident and these eight were missed because nothing about unstyled text throws an error — it still renders, and it renders *plausibly*. Measured before: **13 distinct font sizes**, four families (Fanwood, Inter, monospace, **Arial**), and a `13.3333px` that is not a number any designer picks. After: **7 sizes in the main column, two families, no Arial, no unstyled 16px, and zero Inter nodes missing the -0.011em optical correction.** Every value taken from an existing convention rather than invented — 30px serif from `.orc-page-h.is-greet` (Home's greeting, so the console has ONE page-level display size instead of two), 15px serif from `.bp-quote-text`, the 10px/0.09em uppercase eyebrow from `.rail-micro`, 11.5px/1.6 from `.rep-trace-note`, and the bare-monospace `code` recipe from `.rep-trace-note code` rather than `.rep-code`'s bordered chip, because that one belongs on `--sub` and this sits on bare canvas. The governing split, which already ran through the sheet and had simply never reached this page: **serif for what is READ, Inter for what is OPERATED.** Two judgements beyond restoration: `.orc-recs-k` became an eyebrow rather than a heading, because at 24px/700 it made three optional starting points the second-loudest thing on a page whose hero is the composer they are subordinate to; and `.orc-intro-p` went to 15px with a `62ch` measure, since 16px only looked close to right because Fanwood's x-height is generous and the composer's 772px is ~95ch of unbroken prose at that size. REMOVALS AND THEIR CONSEQUENCES: the Agents block and `CampaignHead` both left, which settles the contradiction the ideation pass had flagged — `<Fleet scope="all">` rendered directly beneath a header naming ONE campaign, so the page asserted a scope its own content denied. Settled by deleting one side rather than reconciling two. `Fleet` was not orphaned: it moved to the `analytics-agent` route already labelled "Agent activity" and previously rendering `Placeholder`, which is what the view actually is — no dead code, and no working component thrown away. Removing the header then exposed two things it had been carrying invisibly. `.orc-main` was `grid-template-rows: auto minmax(0, 1fr)` with a 32px row-gap — a header track and a stream track — so with the header gone the stream auto-placed into row 1 and the gap it had been relying on for its top inset vanished with it: the heading measured **y=0**, flush against the viewport. Fixed with a single track (two tracks for one child is a layout waiting to be mis-read) plus a 40px top padding on `.orc-stream`, which now owns the air before the first block as well as between blocks and after the last — the one-rhythm-owner rule extended rather than bent. And the rail's `justify-content: center`, correct while the left column ran past the fold, became a measured misalignment once that column was ~450px: content heading at y=40, rail's first panel at y=143, **103px apart**, so the two columns read as unrelated documents side by side. Both now start at the same 40px and end at the same 56px; the rail is taller and extends below the content, which is what a two-column layout does. The lesson worth keeping: **unstyled text is the hardest CSS loss to notice, because it renders.** A missing rule for a colour or a layout breaks visibly; a missing rule for type quietly substitutes the UA's opinion for yours and the result looks like a decision someone made badly. Audit by asking what families and sizes are ACTUALLY computed, not by reading the stylesheet for what it says. |
| 45 | 2026-09-18 | Four composition asks, and one number did two of them. §5.23. SIDEBAR CENTRED. The nav rows were top-aligned under the search field, leaving a measured ~249px void between the last campaign row and the footer whenever the Analytics group was collapsed — a third of the sidebar reading as unfinished rather than as air. `.nav-body` becomes a flex column with **`justify-content: safe center`**, and the `safe` keyword is the whole point rather than a flourish: centring a flex column that can OVERFLOW clips the top of its content and makes it unreachable, because the overflow goes both ways and only the bottom is scrollable. With Analytics expanded this list is 78px taller than its container, so that is not hypothetical. Verified in all three states — collapsed gives 20px above and 20px below (centred), expanded gives `above: 0` with "Home" still reachable and `scrollTop` still settling at 0, and a 700px-tall viewport the same. Plain `center` stays as the preceding declaration for engines without `safe`, where clipping is the lesser evil against no centring. SPACING REGULARISED. Measured gaps between the three content blocks were **54px and 50px against a declared 32px rhythm** — and both extras were mine from revision 44, `.orc-intro` carrying `margin-bottom: 22px` and `.orc-recs` carrying `margin-top: 18px`. That is precisely the fault `.orc-stream`'s own comment documents ("one place sets vertical space between blocks, and blocks carry no vertical margins of their own"), reintroduced two revisions after it was written down, by the person who read the comment. Both margins to zero; gaps now a uniform 32px at every width. **A rhythm with two owners is not a rhythm, and the second owner is usually whoever added the most recent block.** CHAT COLUMN NARROWED AND RAIL MOVED LEFT — one lever, because the two asks are the same number. `.orc`'s `padding-right` goes 64px → **112px**: the rail is the last grid track so growing that margin moves it left, and because the content column is the only flexing track the width comes straight out of the composer rather than out of the 72px gutter. Measured at 1568: rail 1164 → 1116 (48px left), content column 836 → 788. Then `.orc-stream` gains a 56px right padding it never had — the composer used to run the full width of its column and end flush on the column's edge with air only on its left, which is what "reduce the width by adding space from left and right" names. Deliberately NOT equal to the 64px left inset: that one is the edge every block on the surface aligns to and is shared with Home, so it stays put, while 56 keeps the pair legibly close without implying the column is centred — it is left-anchored on purpose, because an auto margin there moves the content's left edge every time the sidebar toggles. Composer 772px → **668px** at 1568, holding 64/56 at 1120 through 1680 with no overflow and nothing clipped. |
| 46 | 2026-09-18 | The rail centres, the nav does not, and the rail had two heading recipes for three headings. §5.24. THE CENTRING WENT TO THE WRONG COLUMN. Revision 45 read "centre this section" as the left sidebar and centred `.nav-body`; the ask was the right rail. Both halves were wrong and the sidebar's was wrong on its own terms: a nav is a list scanned from the top, and the fixed search field directly above it establishes that top edge, so centring opened a ~230px void between the field and `Home` and moved every row off the anchor it is read against. Reverted to top-aligned. The slack below the last row is not a defect to fill — a nav sized to its content with the footer pinned under it does not move when a group expands, whereas distributing that slack makes every row's position a function of how many children happen to be open. The rail took the centring instead, with `safe center` for the same reason `.nav-body` needed it when it briefly had it: three panels plus gaps run ~690px against a viewport-height column, so at a short window plain `center` clips the first panel's top with nothing able to scroll up to it. Measured 37px above and 37px below. "WHAT IS THIS" — two questions, two answers. The duplicated `24` in the DOM is a 1×1px `sr-only` span, correct and invisible. The visible artifact was real: `.rail-stat + .rail-stat` carried `border-left: 1px var(--hairline)`, which measures **1.20:1 on white** against the 3:1 floor for a meaningful boundary. The rule's own comment defended it — "the rule, not a gap: a gap alone leaves three numbers floating in one box" — and the reasoning was sound while the execution could not deliver it: at 1.20:1 it was not separating three stats, it was leaving two faint grey marks that read as rendering glitches, which is exactly how it was reported. No token fixes it (`--rule` 1.43:1, `--rule-strong` 2.81:1, and the only passes are inks, which are heavier than the figures they would structure), so the separation became SPACE — 18px of column gap against the 8px of padding the rule needed, and the `padding: 0 4px` that existed only to hold the rule off the figures went with it. Each cell is a label stacked on its figure, a vertical pair the eye groups unaided; the three pairs only ever needed room between them. THE TYPOGRAPHY had two recipes for three headings of identical rank: `Last 7 days` at 13px/600 sentence case in `--ink`, and `Configuration` / `History` at 12.5px/400 in `--ink-2` — **the same size and weight as the row labels beneath them**, so a panel's title and its contents were typographically indistinguishable and each panel read as one undifferentiated block. The fix was already written down and never implemented: the note above `.rail-stat-label` states that "the uppercase micro-label device belongs on the panel headings above, where there is a full column to spend", and explains that the STAT labels stay sentence case only because 67px cannot hold "SHORTLISTED". One recipe now — 10.5px/600, +0.06em, uppercase, `--ink-2` — and the fit objection that rules out uppercase inside a stat cell does not apply one level up ("CONFIGURATION" is ~104px against a 312px column). Also corrected the one Inter run in the rail off the house optical correction: `.rail-stat-label` carried -0.006em where everything else carries -0.011em, and since the correction is TIGHTER it buys fit rather than costing it — which was that label's whole constraint. Rail type scale 6 sizes → **5**, three panel headings now byte-identical, zero Inter nodes off convention. And two `.rail-stat` rules disagreeing about padding were consolidated into one, since a second rule winning on source order is the drift this sheet keeps catching. |
| 47 | 2026-09-18 | The brief gauge stops rendering empty, and the accent family finally gets a `-line`. §5.25. THE GAUGE, ANALYSED RATHER THAN DELETED. Asked what the chip row under the composer was for and whether it was needed. It is the brief gauge: six facets of an intake brief that take their facet's colour and show the words the parser caught as you type — genuinely the one thing on the surface that could not be lifted from another product, and the answer to the research finding that conversational input burns 30-60s per message on re-reading because nothing confirms what landed. So the mechanism stays. Its RESTING state was the clutter, and the code's own defence of it — "a design is judged on its resting state", six outlines "teach what to say without a form" — does not survive checking. **It did not teach**: the resting labels came from `FACET_PROMPT` (Level / Skills / Scale / Location / Background / Experience), which was not a set of prompts but a second list of the same six category nouns, and "Scale" does not tell anyone to write "Series B". **It renamed itself on fill**: `FACET_PROMPT` and `FACET_LABEL` are different words for the same facets, so "Level" became "Seniority" and "Background" became "Company" the moment they filled — the slot that asked for something changed its name once you answered it. **It was below the visibility floor**: the empty outline was `1px dashed var(--rule)`, measured **1.43:1 on white** against the 3:1 floor, so six of them were not structure but exactly the faint noise they were reported as. **And it was redundant**: `TRY A SEARCH` sits directly beneath it in the same state and teaches the same thing properly, with three complete clickable briefs instead of six nouns. So the gauge now renders only when `caught.size > 0`, and `FACET_PROMPT` was deleted — it existed solely to label the state that no longer exists, and it was the source of the rename. TWO SELF-INFLICTED BUGS IN THAT CHANGE, both caught by measuring the result rather than trusting the build. The first: the guard gated the list but the body still did `FACET_ORDER.map` over all six and called `hits!.join(", ")`, which **throws** on the first un-caught facet — a non-null assertion standing in for a guarantee the data does not make. tsc was clean and the build was green; the page rendered nothing and React swallowed it. Fixed by filtering to `caught.has(f)` first, which makes `on` not a state at all and removes the assertion and the conditional styling with it. The second: `.orc-gslot` is SHARED with the composer's context chips, where dashed-when-off against solid-when-`is-on` is the entire signal for unattached against attached — so flattening the border to solid deleted that distinction from a control that still needs it. The dashed base is back; the gauge's slots are always `is-on` and take the existing solid override. Verified end to end: nothing at rest with the chips still dashed, and on a real brief four slots reading Seniority "senior, staff engineers" · Skill "Go, Kubernetes" · Location "Berlin" · Company "Series B, startup", each solid and hued. Also corrected the slot's -0.006em tracking to the house -0.011em, the same drift the rail's stat label carried. THE WARM PANEL EDGE. Rail panels had `1px solid var(--hairline)` — 1.20:1 on white with 7 points of red-minus-blue, i.e. effectively neutral, which made three white cards on a sand page read as pasted-on rectangles. Asked for an orange tint on their borders, and the accent family turned out to have no member for the job: every `--c-*` family carries a `-line` and the accent only had `-tint` (1.16:1 — a wash, invisible as a line), `-fill` (4.52:1 — a button) and `-text`. Added `--accent-line: #f2cbb6`, measured **1.50:1 on white and 1.29:1 on `--page`** — the same weight band as `--rule` (1.43:1), so it reads as a warm edge rather than an orange outline, while carrying **60** points of warmth against the hairline's 7. No shadow: the rail is tier 2 and the composer keeps the only resting elevation. PROCESS NOTE worth keeping: the token declaration silently never landed the first time, because the same script that added it also tried a `.rail-panel` replacement that matched 5 times and `sys.exit`ed BEFORE `write_text` — so the abort rolled back the good edit along with the bad one. The assert-before-write discipline is right, but batching an uncertain replacement with a certain one means the certain one is hostage to it. One edit per script when the match count is not already known. |
| 48 | 2026-09-18 | The page titles itself in the wordmark face, and the accent lands on a word rather than on letters. §5.26. REMOVED "Brief the agent" and the sentence under it. The sentence restated what the composer's own placeholder and its mode note already say one and two blocks below, and it named the campaign — "against **Senior Backend Engineers**" — while the rail states owner, visibility and department for that same campaign two columns over. Two surfaces asserting the same scope is one too many, and it is the same fault that took the Agents block off this page. `.orc-intro-p` and its `strong` rule went dead with it and were deleted; the revision-44 comment that documents `.orc-intro-p` as one of the eight unstyled classes now says "class since deleted" so nobody hunts for a rule that is intentionally absent. THE FACE WAS THE INCONSISTENCY, and it was mine. The replacement heading inherited revision 44's 30px Fanwood, which I had justified by matching Home's greeting — but on THIS page, with the paragraph gone, it left exactly one serif element in a content column that is otherwise entirely Inter. Reported as looking weird and inconsistent, and correctly: one serif heading over an all-sans page is not a system, it is an exception, and cross-page consistency with Home does not buy much when the within-page reading is a single floating anomaly. `--word` is the answer rather than plain `--ui`, and it is not a new idea: it resolves to `"Space Grotesk"`, the face `.nav-word` already sets the WORDMARK in, and "Superhyre Agent" is the product's name. Verified the font actually renders rather than silently falling back — Space Grotesk 600 reports `loaded` and its advance width for the string differs from Inter's. Weight and tracking follow `.nav-word`'s 600 / -0.021em, tightened one step to **-0.024em** because tracking is optical and the value that looks right at 16px reads loose at 30. Content column is now two families: the wordmark on its own name, Inter on everything operated. THE ACCENT, ON A WORD. Asked for orange in "some letters", and letters is the one place it should not go — colouring arbitrary glyphs is decoration, colouring a word is information. "Superhyre" is the product and "Agent" is the surface, so the break lands where the meaning already breaks, and the accent now says which page this is — the one job left to a heading whose campaign name and instructions are both gone. A two-stop gradient rather than a flat fill, which is what "shades" asks for, but between two NEIGHBOURS: `--accent-text` #b24c20 at **5.32:1** and `--accent-deep` #b8400f at **5.56:1** on white. Both clear the 4.5:1 BODY floor, not merely the 3:1 large-text floor this 30px type would have been allowed, and the luminance delta between them is small enough to read as ink variation across the word rather than as a gradient effect. `--accent` #ea5a1e was rejected at 3.51:1 — it fails the body floor and the sheet already labels it a fill hue rather than a text hue. `color` is declared before the clip so the word still renders where `background-clip: text` is unsupported, because a heading that vanishes is a worse failure than a heading that is flat, and the gradient drops to a flat accent under `prefers-contrast: more`. |
| 49 | 2026-09-18 | The composer gets three lines and one gap variable, and the clamp fixes an overflow that predated the ask. §5.27. THICKER: the field was `rows={1}`, 22px of textarea in a 95px box, which made the composer read as a search input rather than as somewhere a BRIEF gets written — and a brief is several lines, so the resting size should say so. Floor is now three lines of the field's own 21.75px leading, 66px, giving a 139px field and a 165px composer. It lives in the autosize expression as `Math.max(REST_LINES * LINE_H, Math.min(scrollHeight, 168))` rather than as a CSS `min-height`, because that effect writes `style.height` directly and two owners for one dimension is how a resting height ends up disagreeing with a grown one. `REST_LINES` and `LINE_H` are two constants rather than one product so the intent — three lines — survives a change to the type size and the mismatch is visible if the CSS moves. NARROWER, AND THE EQUALITY IS NOW STRUCTURAL: 604px → **556px** at 1568. Holding "same distance from the sidebar as from the rail" by hand is awkward because the two sides are not made of the same things — the left gap is purely `.orc-stream`'s padding while the right is that padding PLUS the grid's 72px `column-gap`, which is exactly why the original 64/128 asymmetry was invisible in the source. So `--orc-gap` is the one number and both insets derive from it: `--orc-inset-l: var(--orc-gap)` and `--orc-inset-r: calc(var(--orc-gap) - 72px)`. Change the gutter and both follow; there is no way to set one side without the other. THE CLAMP, DERIVED RATHER THAN TUNED, and it repairs a real bug the previous revision shipped. The composer's min-content width is **420px** — its mode row and context chips cannot wrap — and its column is `100vw` minus the sidebar (256), this padding-right (112), the rail (340) and the gutter (72) = `100vw - 780`. Fitting 420 plus both insets means `gap + (gap - 72) + 420 <= 100vw - 780`, i.e. **`gap <= (100vw - 1128) / 2`**, and that expression is literally the middle term of `clamp(40px, (100vw - 1128px) / 2, 152px)`. With the gap held constant at 128 the composer overflowed its column below ~1432px — measured at 1280 as a **negative 137px** gap to the rail, i.e. the field crossing into it. Now verified equal and non-overlapping at every width tested: 152/152 at 1680, 1568 and 1440; 136/136 at 1400; 76/76 at 1280; 40/40 at 1208 — with no horizontal document overflow anywhere. `.is-solo` (Home, no rail, no gutter) keeps its own 64/56 and opts out by name. The general shape is worth keeping: when a visual property is the sum of two unrelated declarations, derive BOTH from a single variable that names the property, and derive that variable's ceiling from the measured constraint rather than choosing a number that happens to look right at one viewport. |
| 50 | 2026-09-18 | The composer aligns to `Configuration` by moving itself, not the rail. §5.28. Asked to put the composer's top on the same line as the rail's Configuration panel. My first attempt did it the easy way — top-anchored the rail so both columns shared an origin, then gave the heading block a constant height — and that was corrected: align by bringing the CHAT INTERFACE down, leave the right side where it is. The correction is the harder direction and it is the better one, because a rail that jumps between centred and top-anchored depending on what the left column wants is a rail whose position is an accident of its neighbour. THE OBSTACLE, measured: a centred column's panel positions are a function of viewport height. `Configuration` sat at **163px in a 760px window, 184 at 850, 209 at 900, 259 at 1000, 309 at 1100** while the composer stayed at 114 throughout. No constant can meet a moving target, so the left column meets it with an EXPRESSION. Derived rather than tuned, from measured facts about the rail — `100dvh` tall with an 809px floor, padding 40/56, gap 22px, content 713px, first panel 101px: `free = 100dvh - 809`; `statsTop = 40 + max(0, free/2)`; `configTop = statsTop + 123`; `composerTop = 72 + introH`. Equating the last two gives **`introH = 91px + max(0, (100dvh - 809px) / 2)`**, which is the rule verbatim — written as `max()` of the floor and the tracking term so the two regimes read in the order they apply: under an 809px window the rail is at `flex-start` and the offset is zero, above it the rail centres and the heading grows at half the rate the window does. Verified **0px delta at 760 / 809 / 850 / 883 / 900 / 1000 / 1100 / 1300**, rail `safe center` throughout. THE COUPLING IS RECORDED RATHER THAN HIDDEN, because this is the kind of alignment that rots silently: 809 and 101 are CONTENT-DRIVEN heights of the rail and its stats panel, CSS cannot read them, and they are therefore measured constants sitting in a different rule from the thing they describe. Add a rail panel or change the stats type scale and the expression goes stale and the alignment drifts with nothing erroring. That is the real cost of aligning across two independent subtrees without `subgrid`, and the comment says so in those words. The alternative — restructuring both columns into one grid so the rows correspond — is the correct long-term fix and is noted as such rather than pretended away. General shape worth keeping: **when asked to align A to B, first establish whether B's position is a constant or a function. If it is a function, A's offset has to be the same function, and the cheap fix of freezing B is usually a different design decision wearing an alignment's clothes.** |
| 51 | 2026-09-18 | Campaigns get an activity bar and a true chronological timeline. §5.29. THE COLOUR SYSTEM IS THE IDEA, and it is two orthogonal encodings rather than one decorated one. **COLOUR IS WHO**: every role owns a hue — Sourcing teal, Outreach violet, Screening brand — so the timeline's spine changes colour at each handoff and "which agent did what" is answered before a word is read. **SHAPE IS WHAT**: `done` is a filled node, the step in flight is a ringed node that breathes, `blocked` is an outlined node carrying its fault glyph, an unstaffed stage is dashed. Verified three distinct border treatments, so stripping every colour leaves the state fully readable — the test that separates an encoding from a decoration. This is also why per-CAMPAIGN colour stays refused while per-ROLE is right: a hue every sibling has encodes nothing (this repo already deleted `Stack`'s per-entity hues for that), whereas role is three fixed values in an ordered anatomy. Hues chosen by what was LEFT: state already spends blue, amber, rose and sage, so teal/violet/brand are the only three that let no hue do double duty. Measured 3.30 / 3.68 / 3.53 on white (3:1 mark floor), separation **ΔE 74.6 / 74.7 / 80.5** between roles against the ΔE 9 trio that had to be rebuilt in revision 38, and a **minimum ΔE 30.7 against any state hue** so role can never be read as status. `ROLE_HUE` is typed to the existing `Hue` union, so a typo is a compile error rather than a silently missing custom property. THE TIMELINE REQUIRED A FIELD I HAD PREVIOUSLY REFUSED TO FAKE. `flowFor` groups by agent and the reason was recorded at the time: `seenAgo` is per agent, there were no per-step times, and a merged sequence would have had to invent the order two agents' work happened in. `STEP_AT` is that missing column, declared as fixture data a real `agent_runs` would log — not parsed out of prose, not derived from position. With it `timelineFor` interleaves every agent's work into one true sequence, so the campaign reads as a story: Screening finishes an earlier batch, Sourcing reads the brief, Sourcing plans a search and stops. Pinned by an invariant test — **an agent's last entry must equal its `seenAgo`**, because the most recent step is by definition when the agent last reported — plus strict backwards ordering per agent and no key past an agent's current step. THE BAR follows two rules, both asked for and both defensible. Finished campaigns are omitted: a campaign whose every agent is `done` cannot change while you are looking at it and cannot need you, so it would spend a slot in a bar whose entire job is "what is happening now" on the one thing that definitionally is not. And it sorts by **latest activity**, deliberately a DIFFERENT order from `rosterFor`'s urgency sort — the roster answers "where do I look first", the bar answers "what is moving", and collapsing them would make one surface lie. Its three-stage mark makes the campaigns structurally distinguishable at a glance, since each is missing a different stage. ONE FAULT CAUGHT IN REVIEW, and it is the same one as revision 42's rail tiebreak: the bar first sorted on the freshest agent while the card displayed the LEAD's age, so the rendered ages ran 12m, 9m, 41m — **an order the reader cannot verify because the key is off screen**. Now sorted on `leadOf`, which is exported so the card and the sort cannot pick different leads. Also shipped and fixed: "Deploy **a** outreach agent" — the article depends on the role's first sound, so `deployPrompt` is a function shared by both surfaces rather than a template string, and a fourth role would get it right for free. The live agent is pinned to the dialog's footer rather than left in the list, because "what is the fleet doing right now" is the question the dialog gets opened for and reading a chronology downward makes it the last thing you reach. 16 new tests. |
| 52 | 2026-09-18 | The campaign bar becomes a live feed, moves into the gap, and gains an entrance. §5.30. PLACEMENT SOLVED ITSELF. The feed was asked to sit between the heading and the composer — which is exactly the band of air `.orc-intro`'s min-height opened up to keep the composer aligned to `Configuration`, growing from 56px at an 809px window to 302px at 1300. Empty padding at the top of a page is where a feed belongs, so the slot stops being padding and becomes content with **zero change to the alignment arithmetic**. One correction was needed: `min-height` let the feed push the block taller and the alignment silently came undone — *the thing placed in the space the alignment created destroyed the alignment*. Now `height`, so the slot is exactly as tall as the arithmetic says and the feed lives INSIDE it. PER-AGENT, NOT PER-CAMPAIGN. The bar showed one card per campaign, answering "which campaigns exist" — a question the sidebar already answers. The feed answers "who is working right now", and the thing that works is an agent: a campaign does not read a brief, a Sourcing agent does. `done` and `queued` are excluded because neither can produce a new line while you watch, and a feed whose rows cannot change is a list. Each row shows what the agent is DOING in its own words — "Matching the role against 61 contacted profiles" — rather than a state adjective, which is the transparency the surface exists for. HORIZONTAL, ON CORRECTION, and it settled a problem stacking had: three rows needed 150px against a 137px slot at a 900px window, so the third was always below the fold. Across, the band is one row tall at every viewport and all three are visible. Separators are `--rule` at 1.43:1 — under the 3:1 boundary floor, and the stats dividers were DELETED for exactly that reading. The difference is what else separates the things: there, three bare numbers sat in one box and the invisible rule was the only divider, so it divided nothing; here each column carries its own coloured dot, role label and campaign name with real grid space between them, so the line is reinforcement rather than the mechanism and is allowed to be quiet. THE ONE LIVE THING IS TIME. The fixtures give `seenAgo` at page load; leaving it there would mean a feed claiming to be live with every timestamp frozen — the cheapest possible lie on a surface whose whole promise is "now". `useElapsed` ticks every 30s (the ages render in whole minutes, so faster would re-render for a number that cannot have changed) and each row adds it to its fixture age. THE RESTRAINT RULE: exactly ONE thing moves at rest — the live dot, and only on an agent genuinely running. Measured 2 animations at rest across the whole block. Three rows each animating something would be a slot machine, and a supervision surface that demands attention constantly gets ignored permanently, which is the opposite of transparency. THE ENTRANCE, and it is honest because deploying really adds a row — local state, same prototype posture as dismissing a fault, so the motion shows a real state change rather than playing a canned effect. Three simultaneous parts, each with a different job: the grid column animates `0fr → 1fr`, which is how you animate to an unknown width without measuring it, so the band genuinely makes room and the others slide aside; the card rises 6px and scales from 0.97, so it arrives from somewhere; and the surface flashes its ROLE colour via `color-mix` and recedes, the beat that reads as "new" and is gone inside a second. 440ms open, 900ms flash. Verified mid-flight (`feed-open`, `feed-rise`, `feed-flash` all running, opacity 0.74, column at 159px) and settled (opacity 1, background transparent, only the live dot still animating). Full `prefers-reduced-motion` opt-out. ONE FAULT CAUGHT BY MEASURING THE RESULT: deploying made a FOURTH column, dropping each to 139px, and the campaign names collided with the ages. The cap belonged to the band rather than to each source — `feedAgents` capped its own list and the deploy added on top. Now `FEED_CAP` slices the merged band so a new agent displaces the least recently active one, and the header counts what is WORKING rather than what fits, so "4 working" over three columns is how the reader learns the band is a top-N. 4 new tests. |
| 53 | 2026-09-18 | The feed shows each agent's workflow, and the status dots are gone. §5.31. THE DOTS WERE THE RIGHT THING TO ATTACK. Reported as looking "too AI", and the measurement backs it: the 7px dot sat directly beside the role name **printed in the same hue** — colour duplicating colour, adjacent to the word it was colouring, which is decoration by this sheet's own definition. It is also the single most generic element an AI product ships; "a pulsing dot means something is happening" has stopped conveying anything because everything has one. The replacement is not another mark but STRUCTURE — the agent's own steps, listed, with the one it is on marked — which says what the dot could not: which step, of which sequence, and where it stopped. The header dot went too, since a pulsing dot beside the word "working" is the ornament the redesign was removing. THE WORKFLOW PANEL, modelled on a reasoning dropdown because that is the reference given and it is the right one: completed steps carry a `Check` and read at full strength, the step in flight takes weight plus a 2px role-coloured bar in the same cell as the checks, and steps not reached render at 0.5 opacity because they have not happened. The agent's own sentence sits DIRECTLY UNDER the step it describes — it first rendered after the whole list, which put the sentence about the current step below the one that had not started, so the panel read as if the agent were explaining its next move rather than its present one. WHERE THE LIST STOPS IS THE MESSAGE. A blocked run drops every step past the one it halted on: those steps are not coming while a person is the blocker, and drawing them would imply progress that is not. Four end states, all verified on screen by temporarily widening the cap — `Waiting for you` in amber where a human is the blocker, `Brief stopped it` and `Connector stopped it` in rose for the two fault kinds the orchestrator insists on separating, and **`Paused`** with every step checked for a finished agent. That last one required a correction: `done` agents had been filtered out of the feed on the reasoning that a row which cannot change is a list. Wrong, and `queued` is the case that reasoning actually describes — a queued agent has no steps to show, nothing said, and no true last-heard time to order by, while a finished one has a complete workflow, a real age, and a state a supervisor should see rather than have silently vanish. The header count still excludes paused, so the one number on the surface cannot disagree with the panel beneath it. ENLARGED from 82px to ~164px tall, and the height comes from CONTENT rather than padding — the panel is bigger because it now says more. Campaign 11.5px → 12.5px, role 9.5px → 10px. ONE FAULT FOUND BY READING THE RENDER: the active-step bar was a `::before` on the line itself, which made it the grid's first item, took column 1 row 1, and pushed the mark and label onto their own rows — the active step rendered as a bar above the single letter "M". It belongs inside the MARK cell, because the bar and the check marks are the same thing: the column that says where you are. Motion at rest is down to **one** animation for the whole block, the active step's bar, on opacity and scaleY only so it can never move a neighbour. |
| 54 | 2026-09-18 | The feed widens, centres, and stops having three different left insets. §5.32. THE "WEIRD" WAS MEASURABLE AND IT WAS AN INSET. `.feed-item:first-child .feed-row` carried `padding-left: 2px` while every other column had 14px, so the first panel's content sat flush against the band's edge and the others cleared their separators — three panels that did not start in the same place relative to their own cell. All three now take an identical `2px 20px`, which is also the breathing room the separators needed. CENTRED, WITH ONE EXCEPTION THAT MATTERS. The role, the age, the campaign name and the end chip all centre. The STEP LIST does not: `text-align: center` on a checklist scatters the marks, landing each row's glyph at a different x, and the column stops reading as one sequence. So the list is sized to its content and centred as a BLOCK while every step still begins on the same line — centred in the panel, left-aligned inside itself. WIDER: 556px → 604px, panels 185px → ~201px. THE FIRST ATTEMPT AT THE WIDTH WAS WRONG IN A WAY THE MEASUREMENTS ENDORSED, which is the part worth recording. Pulling 48px off each side gave a better 652px band and kept it equidistant from sidebar and rail — **measured 104 and 104, symmetric by exactly the arithmetic the composer uses**, every number green. Looking at the render killed it: this page has ONE left edge. Heading, composer, mode note and suggestions all begin at the same x, and that shared vertical line is what every block on the surface aligns to. A band starting 48px to its left is symmetric about its own column and RAGGED against the page, and the ragged edge is what a reader actually sees. The symmetry I had verified was the wrong symmetry. So the left edge holds and the right gives: `margin-right` only, gap to the rail 104 against the composer's 152. That is the lesser inconsistency — one is a shared vertical line running the height of the page, the other a margin against a gutter that already varies with the window. Verified: five blocks, one left edge, `oneLeftEdge: true`. Clamped against the inset it reclaims, so a narrow window cannot leave the band hanging outside its column. THE LESSON: a measurement can confirm the property you chose to measure while the property that matters goes unmeasured. "Equidistant from its neighbours" was true and irrelevant; "shares the page's left edge" was the one that governed, and only the render showed it. |
| 55 | 2026-09-18 | The no-slop audit, the chip buttons, and a status line in machine voice. §5.33. AUDITED THIS SESSION'S OWN WORK against the `no-slop-ui` skill, which indicts several things shipped in the last ten revisions: **32 pill-radius elements**, **19 uppercase+tracking labels**, and — from revision 54, one turn earlier — centred content on a page where everything else is left-aligned, which is that reference's "no mixed alignment" verbatim. The centring is reverted; the reference image supplied alongside is left-aligned too, so both agree. THE CHIP BUTTONS: `Job description` and `Set filters` shared `.orc-gslot` with the brief gauge, so they inherited a 100px pill radius, a 400 weight and no fill — a CONTROL styled as a LABEL, which is why they read wrong. Scoped by parent rather than split into a new class, because the two uses are genuinely one component in two roles: the gauge's slots stay pills (a tag is a pill everywhere) and `.orc-slots .orc-gslot` takes `--r-field` 10px, 500 weight and a surface. 10px is both the top of the no-slop range and this sheet's existing field radius, so the fix is a correction back onto the system rather than a new value. The dashed edge survives on merit: dashed means nothing attached and solid means something is, which is the only thing saying whether a job description is in play. WHAT THE REFERENCE WAS RIGHT ABOUT, and what it was not. Taken: a continuous RULE down the step list, because the steps are one sequence and a rule says so where N separate marks say "here are N things" — it also deletes the per-row ornament outright. Taken: a STATUS LINE at the foot of each panel, in monospace, because it is machine output and that is the one second face this sheet already licenses. Taken: a block CARET, blinking on `steps(1, end)` like a terminal cursor rather than fading, since a fade would read as a pulse and put the ornament straight back — and it renders only while an agent is actually running, because a caret on a halted run claims activity that is not there. REFUSED: the reference's dots on every line and a `LIVE` badge on every card. The dots are what was removed one revision ago for being the most generic mark an AI product ships, and the badge is a nav badge carrying no data the panel does not already state. TWO FAULTS FOUND BY MEASURING. The running column showed one step ahead and the halted ones did not, making it 194px against a 161px band — so `overflow: hidden` clipped its STATUS LINE, the most live element on the surface, to preserve a layout. Unreached steps are gone for every state, which is also the rule `timelineFor` already follows: a feed records what has happened and is happening, never what is planned. And the columns sized independently, leaving the three status lines at three different heights; `align-items: stretch` levels them and gives the separators their full run. THE RANKING THAT MATTERS: the Configuration alignment and a 173px workflow panel are incompatible below a ~1120px window. `height` states the alignment and `min-height: 248px` states the content floor, and because `min-height` wins when larger the alignment holds on a tall window and yields on a short one. **Never clip live content to keep a decorative alignment.** Verified nothing clips at 800/900/1000/1123/1200/1400, alignment true at 1123 and above. STILL OUTSTANDING from the audit and deliberately not swept in one turn: 31 remaining pill elements and the uppercase labels on `LAST 7 DAYS` / `CONFIGURATION` / `HISTORY` / `TRY A SEARCH`. Role labels are truly categorical and earn the treatment; `TRY A SEARCH` is an instruction and does not. |
