# SuperHyre — design system

**Status:** working draft · **Revision:** 35 · **Last changed:** 2026-09-16

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
