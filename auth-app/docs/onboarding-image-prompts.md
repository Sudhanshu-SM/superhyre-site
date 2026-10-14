# SuperHyre onboarding: open-canvas image script (ChatGPT)

> **Round 2 (9 Oct, later) is the current direction: jump to section 7.** The six-screen set the owner approved has
> the hero, words and plain round-marker choices on the canvas. Sections 1 to 6 are round 1 (pure no-text scenes)
> and stay as the fallback for artwork-only assets.

Rewritten 9 Oct 2026; text removed same day (images are pure illustration, words are set in code). **The whole screen is the canvas.** There are no cards, panels, windows, phone frames, bordered
chips or boxes. Text, objects and the hero float straight on a full-bleed colour field, and the story is told by the
scene. This replaces the earlier version, which still had cards.

**Sources:** `superhyre-site/DESIGN.md` (palette, type, warmth), `mutiny-onboarding-teardown.md` (the beats: a
conversation on one screen, generated choices, a brand moment, landing in the product), and the reference of
illustrated onboarding slides, taken only for **how it tells the story**: one character in a scene, surrounded by objects
that carry the meaning (a board of equations behind the teacher, planets and tools drifting out of a laptop). We do not
copy its layout, frames or controls.

**Story:** your hiring is the hero, and set-up gives it powers. The emblem becomes a dial. The dial holds four powers:
**Mind** (the agent), **Reach** (the Chrome extension), **Voice** (Magnifi), **Memory** (the console). The pasted text
#9 never arrived, so this is my assumption; change section 3 if it differs.

---

## 1. How to run it in ChatGPT

1. Open one new chat and keep every image in it so the style holds.
2. Paste **2.1 Style bible**, then send **2.2 Reference sheet**. Re-roll until the hero and dial look right. This is the
   anchor.
3. Send one scene from section 4 per message, each starting `Same style and figure as the reference sheet.`
4. Size: **wide 3:2 (1536×1024)** for scenes, **square** for assets.
5. No words in any image. If text or UI appears, send `Same image with all text, UI and boxes removed.`
6. Fix one thing at a time: `Keep the image, change only the dial to four segments.`

---

## 2. Style

### 2.1 Style bible (paste first)

```
You are creating full-screen scenes for SuperHyre's onboarding, a recruiting product. Use ONE consistent
style in this whole chat:

GEOMETRIC FLAT VECTOR ILLUSTRATION, FULL-BLEED.
- Each image is ONE open scene that fills the entire frame edge to edge. The background IS the scene: a large
  flat colour field with big soft layered shapes (hills, arcs, circles) for depth.
- NO containers of any kind: no cards, no panels, no windows, no browser frames, no phone frames, no boxes,
  no bordered or filled rectangles that hold text or content, no buttons shaped like boxes. Objects
  float directly on the scene.
- Built only from simple geometric shapes: circles, semicircles, arcs, triangles, bands, rounded blobs.
  Clean vector edges. Flat solid fills only. No gradients, no textures, no noise, no halftone, no hatching, no
  outlines, no 3D, no photoreal shading, no clay, no engraving, no hand-drawn wobble.
- Depth only from overlapping flat shapes and a few faint flat shadow shapes.
- Calm, warm, grown-up, editorial. Never childish, never cartoonish.
- People are faceless: a circle head and a simple body shape. Candidates appear as a plain coloured circle.
- STORY THROUGH OBJECTS: each scene has one character and a handful of meaningful objects arranged around it,
  floating, orbiting or lifting off, so the scene explains the idea without words. Every object must say
  something about hiring.

PALETTE (only these):
  ink #312a23   ink-soft #5c524b   white #ffffff   sand #f3f2f0
  orange #ea5a1e (brand, small and scarce)   orange-tint #fdeae2   peach #f9ede7   terracotta #b16038
  sage #559d3d   sage-tint #ebf9e7   teal #349c98   teal-tint #e7f9f8
  amber #aa8825   amber-tint #f9f4e7   sky #588acd   sky-tint #e7eff9
Each scene gets ONE dominant soft colour field (a different one per scene: peach, sage-tint, sky-tint, sand,
teal-tint, amber-tint) and two or three deeper shades of it for the layered shapes. Orange appears only on
the hero's emblem and small accents.

NO TEXT AT ALL: no words, letters, numbers, labels or captions anywhere in the image. No UI controls, buttons,
forms, inputs, progress bars or screens. It is a pure illustration; the words are added in code.

NEVER: containers, hands touching or holding each other, handshakes, stock-photo people, clay, engraving,
line-art, children's-book look, emoji, lightning bolts, capes.
```

### 2.2 Reference sheet (send second)

```
Create a style reference sheet, wide 3:2, a flat sand background, in the style above. No containers. Arrange
on open space:
1. A row of 9 round swatches in the palette.
2. THE HERO, three times left to right: a faceless figure (circle head, tall rounded body, upright, front
   view): (a) plain ink-grey, (b) with an orange star-shaped emblem on the chest, (c) wearing a suit of
   terracotta and peach panels with the emblem.
3. THE DIAL: a round device drawn from the front, a white disc with a thin sand ring, the orange star at
   its centre, four equal segments around it in orange, teal, sage and amber.
5. Four small objects: a floating logo mark, three colour dots, a speech bubble, a stack of three discs.
No labels.
```

---

## 3. The story in eight scenes

One idea and one new central object per scene. The hero and the dial recur, because they are the story.

| # | Scene | Hero beat | Central object (unique) | Field |
|---|---|---|---|---|
| 1 | Hello | The hero is nameless | A name forming above the silhouette | peach |
| 2 | Reading your site | The emblem forms | Logo, colours and type lifting off a loose horizon of grey bars and flying to the figure | sage-tint |
| 3 | What we learned | The senses open | Three glyphs (an eye, a target, a seal) floating in an arc over the figure, each with a single line | sky-tint |
| 4 | Your team | The allies gather | A round table from above with four seats, one filled, loose on the field | sand |
| 5 | First role | The signal | A beam of light rising from a small title tag into the sky; candidate circles drift toward it | teal-tint |
| 6 | Your look | The suit | Brand colours sweeping onto the figure panel by panel, a loose logo above | amber-tint |
| 7 | Pick a power | The dial | The dial, large, four powers on the rim | peach, deeper |
| 8 | Take-off | Flight | The hero rising over a skyline of candidate circles, the dial small at the top right | sky-tint to peach |
| S1 | Your team is here | The door | An open door with warm light on the field | sage-tint |
| S2 | Waiting | The knock | A lamp, a plant and an envelope on a sill | sand |

**Animation notes (for the build, not the image):** slow parallax on the layered shapes, objects drift and lift off
the way the story says (logo and colours fly to the figure, the signal rises, the suit sweeps on), text types in, and
the field cross-fades between scenes. Reduced-motion users get still frames.

---

## 4. Scene prompts

Every prompt assumes the style bible and reference sheet are already in the chat.

### Scene 1 · Hello

```
Same style and figure as the reference sheet. Wide 3:2 full-bleed scene, peach field with two deeper peach
hills layered at the bottom and a pale orange sun-circle behind. In the middle, the plain ink-grey hero,
small, standing alone with lots of empty space. Above its head a name is forming: five small floating circles
arranged in a loose arc with faint dashed lines drawing them together.
```

### Scene 2 · Reading your site

```
Same style and figure as the reference sheet. Wide 3:2, sage-tint field with layered sage hills. On the left
horizon, a loose cluster of grey horizontal bars and one orange block, like a faint distant skyline of a website
(no frame). From it, on thin dashed curves, four flat objects float toward the hero standing at the right: a
logo mark, three colour dots, a small type mark, a small briefcase. The hero now has the orange star emblem
on its chest, just landing.
```

### Scene 3 · What we learned

```
Same style and figure as the reference sheet. Wide 3:2, sky-tint field with soft blue layered hills. The hero
with emblem stands in the lower middle. Over it an arc of three floating glyphs, each a flat shape with a faint
halo: an eye (teal), a target (orange), a seal with a tick (sage).
Two tiny sensor circles at the hero's head glow orange-tint.
```

### Scene 4 · Your team

```
Same style and figure as the reference sheet. Wide 3:2, sand field with two deeper sand hills. Large in the
middle, a round table seen from directly above (one big white circle with a very faint shadow), four small
round seats around it in teal, sage, amber and sky, one seat marked by an orange dot. On the table, a small
orange mug (a circle with a semicircle handle) and a notepad (a thin shape, not boxed). The hero with emblem
stands a little outside the table.
```

### Scene 5 · First role

```
Same style and figure as the reference sheet. Wide 3:2, teal-tint field with layered teal hills. From a small
floating title tag shape at the lower centre, a wide soft orange-tint beam
rises like a searchlight (one tall triangle) up and out of the frame. A handful of candidate circles with
plain dots in different tints drift up the beam. The hero with emblem stands at the bottom
looking up (faceless, head tilted).
```

### Scene 6 · Your look

```
Same style and figure as the reference sheet. Wide 3:2, amber-tint field with layered warm hills. Above the
hero, a floating orange square logo mark. The hero in the middle is mid-change: its left
half in plain ink-grey, its right half already wearing the suit in the brand orange and peach panels, the
panels sweeping across it on thin dashed curves. A loose type mark and six colour dots float beside it.
```

### Scene 7 · Pick a power

```
Same style and figure as the reference sheet. Wide 3:2, peach field with a deeper terracotta-tint arc behind. In
the middle, THE DIAL, large: a white disc with a sand ring, the orange star at the centre, four equal segments
around it. The orange segment at the top is selected, with a soft orange-tint halo; the others are muted.
Around the rim, four icons in small white circles, no labels: orange spark (Mind), teal plug (Reach), sage speech bubble (Voice), amber stack of three discs (Memory). The
hero with emblem stands lower left, small, a miniature dial on its chest.
```

### Scene 8 · Take-off

```
Same style and figure as the reference sheet. Wide 3:2, a sky-tint field turning to peach at the horizon. The hero
with emblem, wearing the suit, rises in the upper middle with a soft trail of orange-tint circles behind it.
Below, a skyline of candidate circles of different heights, each a plain coloured circle,
like buildings, one highlighted by an orange-tint halo. A small round dial sits at the top right.
```

### Side scene S1 · Your team is already here

```
Same style and figure as the reference sheet. Wide 3:2, sage-tint field. An open door standing alone on the
field (just a tall rounded shape in deeper sage, ajar), warm peach light spilling out as one wedge, a small
glimpse of two desks inside as simple shapes. The hero stands in front of it, small.
```

### Side scene S2 · Waiting

```
Same style and figure as the reference sheet. Wide 3:2, sand field. A window sill drawn as one wide flat band at
the bottom with a lamp (orange shade, round base), a plant in a terracotta pot and an envelope leaning with a
small orange tick seal. Warm peach light from the lamp as one flat shape. The hero sits small on the sill edge.
```

---

## 5. Isolated assets (square, one object, plain sand background, no container)

Preface: `Same style as the reference sheet. Square 1:1, plain flat sand background, one object, centred, nothing
else, no frame.`

| Asset | After the preface |
|---|---|
| Hero, plain | `The faceless hero, plain ink-grey, front view.` |
| Hero, emblem | `The hero with the orange star emblem on its chest.` |
| Hero, suit | `The hero in the terracotta and peach suit with the emblem, arms relaxed, no hands touching anything.` |
| Dial, resting | `The dial with four segments in orange, teal, sage, amber and the orange star at the centre.` |
| Dial, Mind selected | `The dial with the orange segment selected, soft orange-tint halo, the others muted.` |
| Mind | `A spark shape, orange, with a soft halo.` |
| Reach | `A plug-and-link shape, teal.` |
| Voice | `A speech bubble shape, sage.` |
| Memory | `A stack of three discs, amber.` |
| Signal | `A small title tag with a soft orange-tint beam rising from it as one triangle.` |
| Round table | `A round table from above with four coloured seats, a mug and a notepad.` |
| Open door | `An open door in deeper sage with a wedge of warm peach light.` |
| Sill | `A band with an orange-shaded lamp, a terracotta plant and an envelope with an orange tick.` |
| Skyline | `A skyline of candidate circles of plain circles in different tints, one with an orange-tint halo.` |

---

## 6. What happens with the results

1. Use the images as **inspiration** for composition and mood. The real onboarding is built in code on the
   full-screen canvas, with the person's own name, logo and colours.
2. Send me the hero and dial you like and I'll turn them into SVG components so the product matches the images.
3. Words in the images are placeholders. Final copy stays in `SetupFlow.tsx`.
4. If the dial is unclear at small size, keep the four colours and drop the icons first.

---

## 7. Round 2: continue the approved set, add fetching and conversation

**Baseline (approved):** the six-screen set where one woman hero (dark hair, cream top, olive trousers, a glowing
emblem watch on her wrist or chest) stands on a soft peach, sage or sky field, with the headline in a condensed serif,
one grey line, plain choices with round markers, a black pill button and a small unlocked-power chip at the bottom
right. Attach that image in the chat and say "this is the approved set; keep the hero, palette and type exactly".

Two changes on top of it:

1. **Fetching screens.** Every place where the agent goes and reads or builds something gets its own screen, so the
   wait is part of the story.
2. **It talks to you.** Each question arrives as a line from Mind, then you answer, and your answers stay behind as a
   quiet trail. Like the Mutiny set-up: one conversation on one screen, choices generated for you, no form.

### 7.1 The conversation rule (paste once, before the screens)

```
Keep the approved set's look exactly: same hero, palette, type, black pill button, open canvas, no boxes.

CONVERSATION. Every screen is a conversation between the person and Mind, the agent.
- Mind's line is the big serif headline, with a small orange star avatar just before it, and three small ink dots
  (a typing mark) shown when Mind is "thinking". No chat bubbles, no boxes.
- What the person already answered stays above as a short stack of quiet grey lines, oldest fading out
  ("Northstar Talent", "Hiring for clients", "acme.com"), right-aligned, no bubbles.
- The next question's choices are plain text with a round marker, written like a reply the person might say
  ("Our clients", "Both", "Paste a job description instead").
- A free-text answer is a single thin underline with the typed words sitting on it, no input box.
- The hero reacts to the beat: looks up at what is arriving, holds a tablet, glances at her wrist.
```

### 7.2 Fetching screens (send each as one image)

Each shows the **fetch as a story**: things fly in from one side, a short list of what Mind is doing ticks off line
by line, and the hero waits with something in her hands. The checklist lines are plain text; the one active line has
a small orange spinner arc, finished lines have a green tick, upcoming lines are grey.

**F1 · Reading the site**

```
Same set, wide 3:2, sage field. Left: Mind's headline "Reading acme.com…" with the three typing dots. Under it
a plain list, one line active:
  ✓ Found the logo and colours
  ✓ Found 4 open roles on the careers page
  ◜ Learning how they hire…
    Checking who they hire from
The hero holds a tablet on the right. From a faint distant skyline of grey bars on the far horizon, small objects
(a logo mark, three colour dots, a type mark, a briefcase) fly on thin dashed orange curves into the hero's emblem
watch. No boxes. Small chip bottom right: Mind unlocked.
```

**F2 · What we learned (fetch finished, conversation continues)**

```
Same set, wide 3:2, sky field. Headline "Here's how they hire. Did I get it right?" Three plain lines with a round
marker each: "Hires about 14 engineers a year", "Prefers product-company experience", "Most roles close in 60 days".
Under them two quiet links: "Fix anything" and "Looks right". The hero looks at three floating glyphs (an eye, a
target, a tick seal) arcing over her. Her earlier answers stay as grey lines at the top right.
```

**F3 · Finding the role**

```
Same set, wide 3:2, teal-tint field. Headline "Pick the role to start." Choices as plain text lines with
markers: "Senior Full Stack Engineer", "Product Designer", "Data Analyst", then the link "Paste a job description
instead". On the right the hero looks up at a soft orange beam rising from a small floating title tag; a few round
candidate dots with initials drift up it. Bottom: a small count in plain text "3 scouts searching · 12 found" with
three blue dots.
```

**F4 · Scouts working (after Create campaign)**

```
Same set, wide 3:2, sky field with a pale skyline. Headline "Your scouts are out." One line "I'll tell you when the
first people come back." A plain list with spinner and ticks: "Reading the role", "Searching 33,000 profiles",
"Ranking by fit". The hero stands at the bottom looking up; above her a fan of thin orange dashed lines goes out
to three small scout dots, and a few candidate circles with initials come back along them, one with a percent in
plain text (92%).
```

**F5 · Matching your look**

```
Same set, wide 3:2, amber-tint field. Headline "Dressing your job posts in Acme's colours." Plain list:
"✓ Logo", "✓ Colours", "◜ Choosing a font". The hero is mid-change: left half plain, right half in the brand suit,
colour swatches sweeping onto her on dashed curves. Bottom two plain choices: "Looks right" and "Adjust tone".
```

**F6 · Connecting a power (extension or WhatsApp)**

```
Same set, wide 3:2, sky field. Headline "Waiting for Chrome…" One line "Click Add to Chrome in the tab
that just opened." The hero sits holding a laptop; a puzzle-piece plug floats toward a faint browser silhouette
(no frame) and connects with a small orange spark; three typing dots. Plain links "Skip for now". Chip: Reach
connecting.
```

**F7 · Mind is putting your first campaign together**

```
Same set, wide 3:2, peach field. Headline "Putting your first campaign together." Plain lines appearing one by
one as if typed: "Role: Senior Full Stack Engineer · Acme", "Skills I'll look for: React, Node, Postgres",
"I'll ask before I contact anyone." The hero rises slightly, emblem watch glowing, loose paper sheets lifting
behind her.
```

**F8 · It didn't work (gentle)**

```
Same set, wide 3:2, sand field. Headline "I couldn't read that site." One line "No problem. Give me a LinkedIn company
page or paste a job description." Choices as plain text with markers: "Paste a LinkedIn page", "Paste a job
description", "Skip for now". The hero shrugs lightly, a single loose grey bar floats away. No red, no warning
icon.
```

### 7.3 The approved six, redone as conversation

Send these after 7.1, attaching the approved set, one per message.

| Screen | Mind says | The person's answer shape | Trail kept above |
|---|---|---|---|
| 1 Your agency | "What should I call your agency?" | thin underline + "Our clients / Our own team / Both" | none |
| 2 Your first client | "Who are you hiring for first?" | thin underline for the site, link "No website? Paste a LinkedIn page" | agency name, hiring-for |
| 3 First role | "I found these. Which should I start with?" | three plain choices + paste link | agency, client, "Read acme.com" |
| 4 Brand and outreach | "Should messages go out as you or as Acme?" | "Send as Northstar Talent" / "Keep the client confidential" | the above, role |
| 5 Your toolkit | "Two quick connections. Skip any for now." | plain rows: Chrome extension, WhatsApp by Magnifi, each with a text link | all above fading |
| 6 Take-off | "You're ahead of every recruiter still searching by hand." | three ranked candidates as plain lines with percent, "Open my workspace" | none |

### 7.4 What this means for the build

1. Each fetch screen maps to a real backend step: F1 to the site read, F2 to the learned profile, F3 and F4 to role
   pick and the first search, F5 to brand colours, F6 to the extension and Magnifi connections, F7 to the agent's
   first campaign draft, F8 to a failed read.
2. The checklist lines come from real progress events on the run, not a timer; if a step is quick the line ticks
   immediately.
3. The conversation trail is the answers already saved by the set-up, so going back and editing one is one tap.
4. Copy shown in the images is placeholder; real words and the person's own name, logo and colours are set in code.

---

## 8. The live stage (bottom right)

Mutiny keeps the conversation on the left and shows the work happening on the right (the brand collage assembling, the
canvas rendering). We keep that idea but not its card: the **stage is the bottom-right of the canvas itself**, roughly
the right 45% and lower 55%. No frame, no panel; things materialise straight on the colour field, and the hero stands
beside or behind them. The conversation (headline, trail, choices, pill button) stays top-left.

### 8.1 One of our own components per step

Each step has a different live object, so nothing repeats (the Mutiny collage is not copied).

| Step | Live object on the stage | How it animates |
|---|---|---|
| Agency name | Name letters landing as a small signboard post | letters drop in as typed, board rocks once |
| Client site | A **scanner**: a faint horizon of grey bars with a thin orange scan line sweeping across it | line sweeps, logo, colour dots and type mark lift off and fly to the hero's watch |
| What we learned | **Three signal glyphs** (eye, target, seal) on an arc, each lighting as its fact is found | glyphs light left to right, the fact types under each |
| Role | **Beam and tag**: a title tag with a searchlight beam, candidate circles rising | circles drift up the beam, count ticks up |
| Scouts working | **Radar**: concentric arcs from the hero, scout dots orbiting, matches returning with a percent | arcs pulse, dots return along dashed lines, a percent pops |
| Brand | **Suit sweep**: brand colours painting onto the hero's panels | panels fill one by one |
| Toolkit | **Power dial**: the four-segment dial, each power clicking in as it connects | segment lights with a soft click, chip text "Reach connected" |
| Campaign draft | **Paper stack**: loose sheets with lines typing onto the top one | lines type, sheet lifts, next sheet arrives |
| Take-off | **Skyline of candidates** with the hero rising over it | circles grow into place, one halo lights |

### 8.2 Animation and the "working" feel

- Everything on the stage is driven by real run progress, not timers. A line ticks when its event arrives; a quick step
  ticks at once.
- Objects ease in (about 400 ms, slight overshoot), then idle gently (2 to 3 px drift). Nothing loops loudly.
- The stage never blocks the conversation. Going back one step reverses its object out.
- Reduced motion: still frame of the finished object, ticks appear without sweep.
- Small screens: the stage moves to the bottom third under the question, same objects, smaller.

### 8.3 Prompt (send with the approved set attached)

```
Keep the approved set's hero, palette, type and black pill button. Redraw the six screens with this layout:

- TOP LEFT: the conversation, Mind's headline with the small orange star avatar, quiet grey answer trail, plain
  choices with round markers, black pill button.
- BOTTOM RIGHT (roughly the right 45%, lower 55% of the canvas): THE STAGE. The live work happens here, drawn
  straight on the coloured field, with NO frame, card, window or box around it. The hero stands beside it, looking at it.

A different stage object on each screen, built from flat geometric shapes in our palette:
1 a signboard post with the name landing on it letter by letter;
2 a faint horizon of grey bars with a thin orange scan line sweeping across it, and a logo mark, three colour
  dots and a type mark lifting off it on dashed orange curves toward the hero's watch;
3 a searchlight beam rising from a small floating title tag, candidate circles drifting up it, a plain count
  "3 scouts searching · 12 found";
4 the hero's suit being painted panel by panel in the client's orange and peach;
5 the four-segment dial with segments clicking on one by one, a plain "Reach connected" beside it;
6 a skyline of candidate circles with the hero rising over it, one circle haloed with "92%" beside it.

Show the in-between state: the objects mid-flight, spinner arcs on active lines, three typing dots when Mind
is thinking. Words spelled exactly as given or left blank. No red, no emoji, no boxes.
```

After this, send the fetching screens F1 to F8 from section 7.2, adding to each: `Put the live work in the bottom
right as in the last image, no frame.`

---

## 9. One colour: orange only (supersedes the multi-colour palettes above)

Decision (9 Oct): the whole set uses **one hue, orange, in its shades and tints**, plus ink and white. No sage, teal, sky
or amber fields. Scenes differ by *how deep* the orange is, so the set still progresses (pale at hello, deepest at the
dial, glowing at take-off). The four powers are told apart by **shape and by shade**, not by hue.

| Token | Hex | Use |
|---|---|---|
| tint-50 | `#fff6f1` | lightest field, page wash |
| tint-100 | `#fdeae2` | soft field (hello, role) |
| tint-200 | `#f9ede7` to `#f8d9c9` | hills, light shapes |
| tint-300 | `#f6c3a8` | mid hills, halos |
| tint-400 | `#f08f5f` | secondary objects |
| orange | `#ea5a1e` | brand, emblem, the active thing (scarce) |
| shade-600 | `#c9481a` | deeper accents, selected state |
| shade-700 | `#b16038` | suit panels, deep hills |
| shade-800 | `#7a3a1e` | darkest shapes, shadow shapes |
| ink | `#312a23` | text, hero base, outlines never |
| white | `#ffffff` | the dial disc, highlights |

**Powers by shade and shape:** Mind = orange spark (`#ea5a1e`), Reach = plug, deep shade (`#b16038`), Voice = speech
bubble, mid tint (`#f08f5f`), Memory = stack of discs, pale (`#f6c3a8` with a deep edge). The dial's four segments are
those four orange shades.

**Field per step (all orange):** 1 tint-100, 2 tint-50 with tint-200 hills, 3 tint-200, 4 tint-100, 5 tint-300 hills
with tint-50 sky, 6 tint-200, 7 tint-300 deeper with shade-700 arc, 8 tint-100 to tint-300 glow.

**Status colours:** a finished line gets a tick drawn in ink on an orange-tint dot (no green). The active line uses an
orange spinner arc. Errors use shade-800 text, never red.

### 9.1 Prompt (send with the approved image and the layout prompt already in the chat)

```
Recolour the whole set to ONE HUE: orange, used in its shades and tints, plus ink #312a23 and white. Remove every
green, blue, teal, amber and purple field, shape, dot and icon. Keep layout, hero, type, conversation and live
stage exactly as before.

Palette (only these): #fff6f1, #fdeae2, #f8d9c9, #f6c3a8, #f08f5f, #ea5a1e (brand, scarce), #c9481a, #b16038,
#7a3a1e, ink #312a23, white.

- Fields are pale orange (#fff6f1 to #f6c3a8). Hills and layered shapes are deeper steps of the same orange.
  Each screen uses a slightly deeper field than the last, glowing at the final screen.
- The hero keeps her cream top; her trousers become deep orange-brown (#b16038), her suit panels #b16038 and
  #f6c3a8, her emblem watch #ea5a1e with a pale halo.
- The four powers are told apart by shape and shade: spark #ea5a1e, plug #b16038, speech bubble #f08f5f,
  stack of discs #f6c3a8 with a #7a3a1e edge.
- Candidate circles are orange tints with ink initials. Ticks are ink on an orange-tint dot. Spinner arcs and
  the scan line are #ea5a1e. No red errors; use #7a3a1e text.
- Keep contrast: ink text on pale fields, white text only on #b16038 and deeper.
No other colour anywhere, no gradients on shapes, no boxes.
```

Then re-send the stage prompt (8.3) and the fetch screens F1 to F8 with `Orange palette only, as in the last image.`

---

## 10. Add: set-up questions and the research step (Mutiny-style, in our design)

Adds three screens at the start, before "Your agency". They borrow Mutiny's order (ask for the person, the workspace and
the website, then research while you watch) in our look: orange only, open canvas, conversation top-left, live stage
bottom-right, no boxes.

| New screen | Mind says | Person gives | Live stage |
|---|---|---|---|
| 0 Let's get started | "Let's start with you." | name, workspace name, company website, optional "how did you hear about us" as plain choices; a "But why?" link beside the website | The signboard post, with the workspace name landing on it |
| R1 Researching | "Reading northstartalent.com…" | nothing, just watching | Scanner sweeping a grey skyline, logo and colours lifting off, lines ticking |
| R2 What I found | "Here's what I learned about you. Is that right?" | three plain lines to confirm or fix, then a generated focus choice | Three glyphs lighting (company, who you hire for, how you hire) |

Then the existing flow continues: Agency, Client, Role, Brand, Go.

### 10.1 Prompt (send with the approved set and the orange layout already in the chat)

```
Add three new screens at the START of the set, same style: orange hue only, open canvas, conversation top
left (Mind's headline with the small orange star, quiet grey answer trail, plain choices with round markers, black
pill button), live stage bottom right drawn straight on the field with no frame, and the same hero.

SCREEN 0 · "Let's get started"
Mind: "Let's start with you." Four lines on the canvas, each a label above a single thin underline with the
typed words on it, no boxes: "Your name: Riya Menon", "Workspace name: Northstar Talent", "Company website:
northstartalent.com" with a small underlined link "But why?" at its right edge, and "How did you hear about us?"
as three plain text choices with round markers (Search, A friend, Somewhere else). Black pill button
"Continue". Live stage: a signboard post with "Northstar Talent" landing on it letter by letter.
A small grey tooltip text near "But why?": "We read your website so everything you see looks and sounds like you."

SCREEN R1 · Researching (the in-between moment)
Mind: "Reading northstartalent.com…" with three typing dots. A plain list ticking one line at a time:
"✓ Found your logo and colours", "✓ Found who you hire for", "◜ Learning how you hire", "Checking your open roles".
Active line has a small orange spinner arc, finished lines an ink tick on an orange-tint dot, upcoming lines grey.
Live stage: a faint horizon of grey bars with a thin orange scan line sweeping across it; a logo mark, three
colour dots and a type mark lift off on dashed orange curves into the hero's emblem watch. The hero holds a
tablet and watches. No button yet.

SCREEN R2 · What I found
Mind: "Here's what I learned about you. Is that right?" Three plain lines with a round marker each:
"A recruiting agency in Bengaluru", "You hire for fintech and SaaS clients", "Mostly senior engineers and
designers". Two quiet text links: "Fix anything" and "Looks right". Under them a generated question in grey,
"Where should we start?" with three plain choices: "A role for a client", "A role for my own team", "Just
look around". Live stage: three glyphs (a building, a target, a tick seal) on an arc over the hero, lighting
left to right in deeper shades of orange. The hero glances at her watch, which now shows one lit segment.

Rules: spell every word exactly as given or leave it blank. Orange palette only (#fff6f1 to #7a3a1e, brand
#ea5a1e, ink #312a23, white). No boxes, no cards, no input rectangles, no red, no emoji.
```

### 10.2 What it means for the build

1. Screen 0 posts to the account (name, workspace, website) and starts the site read as soon as Continue is pressed.
2. R1 shows the real progress of the site read; each line ticks when its event arrives. A slow read keeps the last
   line active; a failed one goes to F8.
3. R2 shows what the read found, editable in place; the focus choices are generated from it.
4. "Our own team" skips the client step later; "join your team" and "waiting for approval" still branch off after
   Continue on screen 0 (side scenes S1 and S2).

---

## 11. Mutiny's fetch components, in our style

From the 9 Oct screenshots: Mutiny's fetching is small and honest, not a big animation. It uses four things, all of which
we lacked as explicit components:

1. **The identity line.** The person's initials in a ring that starts grey and outline-only, with their name and company
   beside it, and under it **one status line that cycles**: "Looking you up…", "Learning about your company…", then done.
2. **Typed lines.** Mind's sentence types itself out, so the wait reads as speech.
3. **Skeleton rows.** "Putting together your starting points": each result's title appears first and a **pale bar sits
   where its description will land**, so nothing jumps when the real text arrives.
4. **Generated choices.** After the wait, three tailored choices plus a lighter "Something else…".
   (A stepper of three pills sits on top: done pills turn green with a tick, the current one is blue.)

Ours, on the open canvas and in orange: the same four, drawn without a card.

### 11.1 Prompt (send with image 28 attached)

```
Keep the current set exactly (same hero, orange-only palette, open canvas, conversation top-left, live stage
bottom-right). Add these four fetching components, drawn on the canvas with no cards or boxes:

1. IDENTITY LINE, on the "Reading" screen: under Mind's headline, a circle with the initials "RM" in a thin
   orange outline (empty, pale), the name "Riya Menon" in serif beside it, "Northstar Talent" in small sans
   below, and under it ONE grey status line with a small magnifier glyph: "Learning about your company…".
   On the next screen ("What I found") the same circle is filled solid orange and the status line reads
   "✓ Research complete".

2. SKELETON ROWS, on the "First role" screen while roles are found: each role title is printed in ink and
   under it a thin pale-orange bar (#f8d9c9) where its description will land, one bar is shimmering with a
   lighter streak. A fourth row, lighter: "Something else…".

3. SKELETON CANDIDATES, on the take-off screen before results: three rows, each a pale-orange circle for the
   avatar, a short ink title and a thin pale bar, and a pale bar where the percent will be.

4. TYPING: on every screen Mind's headline has its last few letters fading from grey to ink, and three small
   ink dots after it, as if being typed.

Also change the stepper to chapter pills at top centre, drawn as plain text with a tiny orange dot between
them: finished chapters in ink with a tick, the current chapter in orange text with an arrow, upcoming in
light grey: "Getting to know you · Your brand · Getting started".

Orange palette only. Spell words exactly. No boxes, cards, red or emoji.
```

### 11.2 Why this is the right size of fetch

Mutiny covers each wait with one sentence, one status line and a skeleton, and they are what make a wait feel designed.
Our bigger stage objects (scanner, beam, radar) sit on top as our own flourish, but every wait also needs these four,
because they are what the build reuses as real components.

---

## 12. Research as a reveal (not ticks), and a softer, quieter set

Feedback on image 29: the research is bland, just a list with ticks. Mutiny's brand step (screenshot "Your brand theme is
complete") shows **what it actually found, as things**: the real site rendered as a small page, the logo, a type specimen
(H1 / H2 / Body) tilted on a card, a swatch grid, all collaged over a block of the brand colour. The proof is visible.
And image 29 is also too busy.

### 12.1 What the research shows (replaces tick lists)

Findings appear one at a time as small tilted paper pieces on the stage, each with a one-line caption beneath it,
and each pinned to the hero's watch by a thin dashed curve:

| Found | Drawn as | Caption |
|---|---|---|
| The site | a small page of the client's real homepage (logo, one headline, a button), slightly tilted | "Your website" |
| Logo | the logo on a small square tile | "Your logo" |
| Colours | a 2x3 grid of swatches in the brand colours | "Your colours" |
| Type | a tilted specimen: "Aa", "H1  H2  Body" | "Your type" |
| Who they hire | three small role tags, e.g. "Senior Engineer", "Product Designer", "Analyst" | "4 open roles" |
| How they hire | a tiny funnel or five short bars shrinking | "How you hire" |

While one is still loading, its piece is a pale outline with a shimmer; when found it fills with real content and
settles with a small bounce. The identity circle (initials) fills with orange once the research finishes.

### 12.2 Softer and quieter (apply to every screen)

- **One idea per screen.** Mind's line, at most two supporting lines, one choice group, one button. Nothing else.
- **60% empty.** Large calm space; the hero smaller and quieter, only one prop.
- **No small print.** Remove tooltips, hint lines, footnotes, counters and the top-bar clutter. The stepper is one quiet
  line of three chapter names in light grey with the current one in orange.
- **Softer tones.** Headline ink `#5c524b` instead of near-black; the button a deep soft brown `#7a3a1e`, fully rounded;
  smaller leaf shapes in lighter tints, fewer layers; no hard shadows.
- **Softer type.** Headline a little smaller, lighter weight, generous line height; sans text slightly larger.

### 12.3 Prompt (send with images 28 and 29, and the Mutiny brand screenshot, attached)

```
Redraw the set softer and quieter, and make the research a real reveal.

KEEP: the orange-only palette, the hero, the conversation top-left, the live stage bottom-right, open canvas.

1. RESEARCH AS A REVEAL, not ticks. On the "Reading" screen, the live stage shows the findings arriving as small
   tilted paper pieces on the field, each with a short caption under it, each joined to the hero's watch by a
   thin dashed orange curve:
   - a small page of the client's homepage (logo, one headline, one button) captioned "Your website"
   - a logo on a small square tile, "Your logo"
   - a 2x3 grid of colour swatches, "Your colours"
   - a tilted type specimen reading "Aa" and "H1  H2  Body", "Your type"
   - three small role tags, "4 open roles"
   Show it mid-way: three pieces filled with content, one still a pale outline with a light shimmer streak, one
   not yet arrived. Remove the tick list and the status lines completely. Keep only one grey line under
   Mind's headline: "Learning how you hire…". The identity circle "RM" is outlined but not yet filled.
   On the next screen ("What I found") the same pieces sit gathered in a loose pile near the hero and the
   circle is filled solid orange.

2. SOFTER AND QUIETER on every screen:
   - One idea per screen: Mind's headline, at most two supporting lines, one choice group, one button.
   - About 60% empty space. The hero is smaller and has only one prop.
   - Remove tooltips, hint lines, footnotes and counters. The stepper is a single quiet line of three chapter
     names in light grey, the current one in orange.
   - Headline in lighter ink #5c524b, a little smaller, more line spacing. The button is a fully rounded deep soft brown
     #7a3a1e with white text. Fewer, smaller, paler leaf shapes. No hard shadows.

Orange palette only. Spell every word exactly. No boxes, cards, red or emoji.
```

### 12.4 For the build

Each found piece is a real component fed by the site read (the page thumbnail is a screenshot, the swatches the
extracted colours, the specimen the extracted font). A piece that can't be found stays hidden rather than showing a
placeholder, so a failed read never shows fake work.

---

## 13. Research reveal, improved for UX (supersedes 12.3)

Chosen concept: **the page unfolds into pinned pieces** (the site appears as one wide page, then logo, colours, type and
roles lift off it as separate rectangles pinned to the hero's watch).

### 13.1 UX rules behind it

1. **Acknowledge in under a second.** The headline already names the site ("Reading northstartalent.com…") and the page
   outline is on screen at once, so the person never sees an empty wait.
2. **Show progress by content, not a bar.** Order is fastest and most recognisable first: the site, then logo, colours,
   type, roles. Each piece appears when it is real.
3. **Make it checkable.** Every piece shows the real thing, so the person can see at a glance that it is right. Trust
   comes from seeing their own logo and colours.
4. **Make fixing cheap.** Each finished piece has a small quiet "Not right?" under its caption; tapping it turns the piece into
   a single underline to change it (new logo, other colour). No separate edit screen.
5. **Never block.** "Continue" is available as soon as the site and the roles are in; the rest keeps loading and
   joins the pile. A slow read doesn't hold anyone.
6. **Partial is fine.** Anything not found shows a pale outline and a plain line, "I couldn't find your logo. Add it?",
   never a fake placeholder or an error.
7. **One calm motion.** Slide in, settle, rest. No spinning, no bounce, a single shimmer on the one piece loading.
8. **One decision at the end.** A finished state with the pieces gathered and one question, "Does this look like you?",
   with "Looks right" as the only button and "Not right?" as a link.
9. **A time promise.** One small grey line, "About 10 seconds", under the headline, so waiting feels short.
10. **Quiet and readable.** At most five pieces, large readable captions, high contrast ink on pale fields, reduced
    motion shows the finished state at once.

### 13.2 Prompt (send with images 28, 29 and the Mutiny brand screenshot attached)

```
Redraw the research step as three screens, softer and quieter, in the orange-only palette. Keep the hero, the
conversation top-left, the open canvas and the soft brown pill button #7a3a1e. No boxes around the conversation. The
findings themselves are loose rounded rectangles on the canvas (soft shadow, pale orange fill, thin ink hairline),
each tilted a few degrees at its own size, never in a vertical list.

SCREEN 1 · Reading (mid-way)
Headline "Reading northstartalent.com…" with three typing dots, one grey line under it "About 10 seconds".
On the stage (bottom-right, about 55% of the canvas): ONE wide page of the client's website (logo, a headline, a
button), unfolding. From it, four smaller pieces have lifted off and settled around it, each joined to the hero's
watch by a thin dashed orange curve and each with a one-word caption under it:
  "Your logo" (logo on a small square), "Your colours" (a 2x3 swatch grid), "Your type" (a tilted card reading
  "Aa" and "H1  H2  Body"), and "4 open roles" (three small role tags).
Show it in motion: the logo, colours and type pieces are filled; the roles piece is a pale outline with one soft
shimmer streak. The hero holds a tablet and watches. The initials circle "RM" is outlined, not yet filled.
No tick list, no status text, no progress bar.

SCREEN 2 · Almost there (partial and fixable)
Headline "Almost done." One grey line "I couldn't find your logo. Add it?" with a quiet link "Add a logo". The pieces
settle into a loose pile beside the hero; the logo piece is a pale outline with a small plus. Under each finished
caption a tiny grey "Not right?". The "Continue" pill is already available.

SCREEN 3 · Does this look like you?
Headline "Does this look like you?" The pieces are gathered in a tidy fan near the hero, all filled. The initials
circle "RM" is now filled solid orange. One pill "Looks right" and one quiet link "Not right?" Nothing else.

Soft and minimal: one idea per screen, about 60% empty space, no tooltips or counters, headline ink #5c524b, a quiet
stepper line of three chapter names in light grey with the current one in orange, fewer and paler leaf shapes.
Orange palette only. Spell every word exactly. No red, no warning icons, no emoji.
```

### 13.3 For the build

- The pieces are real components fed by the site read: a page screenshot, extracted colours and font, a count of found
  roles. Each appears as its data arrives; a piece with no data stays an outline.
- "Not right?" saves the correction straight to the profile the agents use later, so a fix here carries into drafts and
  outreach.
- "Continue" enables when the site and roles are in; the rest streams into the pile after.

---

## 14. The whole flow in one request (master prompt)

Image 31 is the approved look: soft orange, pale field, serif headline in ink `#5c524b`, quiet three-name stepper, initials
circle, loose tilted pieces pinned to the hero's watch by dashed curves, soft brown pill, "Not right?" under each piece.
This section asks ChatGPT for **every screen of the flow, in order, plus a flow map**, consistent with that look.

### 14.1 The flow (what exists and why)

Chapters in the stepper: **Getting to know you · Your brand · Getting started**.

| # | Screen | Mind asks / says | Person does | Fetch shown | Live stage |
|---|---|---|---|---|---|
| 1 | Let's start with you | "Let's start with you." | name, workspace, website, how they heard (plain choices) | none | signboard post with the workspace name |
| 2 | Reading | "Reading northstartalent.com…" | watches, can't be blocked | site read | page unfolds, pieces lift off (image 31, screen 1) |
| 3 | Almost there | "Almost done." (or the missing piece) | Continue, add a logo, or "Not right?" | partial result | pieces settle, outline for the missing one |
| 4 | Does this look like you? | same | Looks right / Not right? | done | pieces fan out, circle fills |
| 5 | What I found | "Here's what I learned. Is that right?" | confirm or fix three facts; pick who you hire for: clients, own team, or both | none | three glyphs |
| 6 | Your first client | "Who are you hiring for first?" (skipped for "own team") | client website | none | faint skyline and logo |
| 7 | Reading the client | "Reading acme.com…" | watches | client site read | the same unfolding page with Acme's logo, colours, type, roles |
| 8 | First role | "I found these roles. Which should I start with?" | pick one of three, or paste a job description | roles skeleton to results | beam and tag, candidate dots rising |
| 9 | Your voice | "Should messages go out as you or as Acme?" | choose sender style | none | a message line typing on the field |
| 10 | Scouts out | "Your scouts are out." | watches, can continue | first search | radar, candidates returning with percent |
| 11 | Two connections | "Two quick connections. Skip any for now." | Chrome extension, WhatsApp, each plain link | connecting state | the dial clicking segments on |
| 12 | Take-off | "You're ahead of every recruiter still searching by hand." | Open my workspace | first matches | hero rising over a skyline of candidates |

Side screens: **S1** "Your team is already here" (ask to join), **S2** "Request sent" (waiting), **F8** "I couldn't read that site"
(paste a LinkedIn page or a job description, or skip), **F9** "Taking longer than usual" (still reading, continue anyway).

Progress memory: the watch on the hero fills **one more orange segment** at screens 4, 8, 11 and 12, from empty to the full dial.

### 14.2 The prompt

Send in the same chat, with images 28, 29 and 31 attached. It asks for the flow map first, then the screens in batches of four.

```
Using the look of the attached image 31 exactly (soft orange palette only, pale orange field, serif headline in
#5c524b, quiet three-name stepper top-right "Getting to know you · Your brand · Getting started" with the current
one in orange and an arrow, the initials circle "RM Riya Menon · Northstar Talent" top-left, loose tilted rectangular
pieces pinned to the hero's watch by thin dashed orange curves, the soft brown pill #7a3a1e, the same hero), design
the COMPLETE sign-up flow.

FIRST: one wide FLOW MAP image: 12 small thumbnails of the screens in a left-to-right, two-row path with thin dashed
arrows between them, numbered 1 to 12, the three chapters marked above, side branches below for "Join your team",
"Waiting for approval", "Couldn't read the site", "Taking longer than usual". No text smaller than readable.

THEN the screens, four per image in a 2x2 grid, in this order. Every screen: conversation top-left, the live stage
bottom-right on the open canvas (no frame), about 60% empty space, one idea, one button, no tooltips or counters.
The hero is the same size and position on every screen, and she reacts. The watch on her wrist shows how far you
are: empty at screens 1 to 3, one orange segment from 4, two from 8, three from 11, a full four-segment dial at 12.

1 "Let's start with you." Four underlines: Your name "Riya Menon", Workspace name "Northstar Talent", Company
  website "northstartalent.com" with a small link "But why?", and three plain choices for "How did you hear about
  us?" (Search, A friend, Somewhere else). Pill "Continue". Stage: a signboard post with the workspace name.
2 "Reading northstartalent.com…" with "About 10 seconds". The page unfolds on the stage with logo, colours, type
  and "4 open roles" pieces lifting off and pinned to her watch, the roles piece still an outline with a shimmer.
3 "Almost done." with "I couldn't find your logo. Add it?" and a link "Add a logo". The pieces settled, the logo
  piece a dashed outline with a plus. "Not right?" under each piece. Pill "Continue" available.
4 "Does this look like you?" The pieces fanned out all filled, the circle filled. Pill "Looks right", link "Not right?".
5 "Here's what I learned. Is that right?" Three plain lines with round markers: "A recruiting agency in
  Bengaluru", "You hire for fintech and SaaS clients", "Mostly senior engineers and designers", link "Fix anything".
  Then "Who do you hire for?" with choices "Our clients", "Our own team", "Both". Stage: three glyphs on an arc.
6 "Who are you hiring for first?" One underline "Client website: acme.com", link "No website? Paste a LinkedIn page".
  Stage: a faint skyline with Acme's logo tile. Pill "Continue".
7 "Reading acme.com…" the same unfolding page, now with Acme's logo, colours, type and "4 open roles" pieces.
8 "I found these roles. Which should I start with?" Skeleton rows becoming three plain choices with markers:
  "Senior Full Stack Engineer", "Product Designer", "Data Analyst", then link "Paste a job description instead".
  Stage: a searchlight beam from a title tag with candidate dots rising. Pill "Create campaign".
9 "Should messages go out as you or as Acme?" Choices "Send as Northstar Talent", "Keep the client confidential".
  Stage: a message line typing itself on the field. Pill "Looks right", link "Adjust tone".
10 "Your scouts are out." One grey line "I'll tell you when the first people come back." Stage: a radar with three
  scout dots, candidate circles returning along dashed lines, one with "92%". Pill "Continue".
11 "Two quick connections. Skip any for now." Two plain rows: Chrome extension "Save any profile in one click" with
  link "Add to Chrome"; WhatsApp by Magnifi "Reach candidates where they reply" with link "Connect". Stage: the
  dial with segments clicking on. Link "Skip for now", pill "Continue".
12 "You're ahead of every recruiter still searching by hand." Three ranked candidates as plain lines with a
  percent: "Jane Sharma · 92%", "Mohit Kapoor · 88%", "Ananya Tiwari · 84%". Stage: the hero rising over a skyline of
  candidate circles. Pill "Open my workspace".
S1 "Your team is already here." One line "Ask to join. An admin lets you in." Pill "Ask to join", link "Use a
  personal workspace". Stage: an open door with warm light.
S2 "Request sent." One line "We'll let you in the moment they approve." Link "Check again". Stage: a lamp, plant
  and envelope on a sill.
F8 "I couldn't read that site." One line "No problem. Give me a LinkedIn page or a job description." Choices
  "Paste a LinkedIn page", "Paste a job description", "Skip for now". Stage: one loose grey bar floating away.
F9 "Taking longer than usual." One line "You can carry on. I'll finish in the background." Pill "Continue". Stage:
  the unfolding page half-built with a slow shimmer.

KEEP CONSISTENT on every screen: same stepper position, same circle top-left, same type sizes, same pill, the
hero's place, pale fields that get slightly deeper along the flow, orange palette only. Spell every word exactly.
Fewer, paler leaf shapes. No red, no warning icons, no emoji, no boxes around text.
```

### 14.3 UX checks to apply to what comes back

1. Is the next action obvious in one second (one pill, everything else quiet)?
2. Does every wait show real content, with a time promise and a way to carry on?
3. Can every wrong guess be fixed in place ("Not right?")?
4. Is the same thing in the same place on every screen (stepper, circle, hero, pill, stage)?
5. Is there always a way out (Skip, Back, paste instead, ask to join)?
6. Do the watch segments grow as the person earns powers, so progress is felt?
7. Anything small, crowded or decorative that isn't pulling its weight gets cut.

---

## 15. The opening: she gets her powers by touching the SuperHyre icon

A short pre-flow sequence, **screen 0**, before "Let's start with you". The star icon is the real start button: the
person taps it and the hero is awakened.

### 15.1 UX

1. **The icon is the only thing on screen to press**, big and gently pulsing, with one line, "Tap to find your superpower."
2. **It is a real action, not a cutscene.** The tap is the person's first commitment; the animation plays as the response.
3. **Short.** About 4 seconds, with a quiet "Skip" link bottom-left so returning users and the impatient are never held.
4. **Cause and effect.** Tap, ripple, the star lifts off the field and settles on her wrist as the watch, and the four power
   icons appear orbiting dim, then slot into the watch dial. The dial stays dim; powers light up one by one later in the
   flow (that is the progress mechanic).
5. **Soft landing.** The whole scene eases into screen 1 (the field slides, her pose stays), so there is no hard cut.
6. **Reduced motion:** a single still frame of frame 0c, then screen 1.
7. **Copy:** one headline, one line, nothing else. No stepper yet, no chapter names, no circle top-left.

### 15.2 The four frames

| Frame | What happens | Words |
|---|---|---|
| 0a Idle | She stands plain, no watch, looking at a large star icon floating at her height, a soft pulse ring around it | "Every recruiter has a superpower." and "Tap to find yours." Bottom-left link "Skip" |
| 0b Touch | One finger lightly on the star, a ripple of three thin orange rings, the star brightens | none |
| 0c Awaken | The star has lifted off and landed on her wrist as the watch, orange light spreading as a soft halo, four small power icons orbiting her, dim | "Mind. Reach. Voice. Memory." |
| 0d Powers set | The four icons slide into the watch's dial, still dim, a soft glow; the field warms | "Four powers. Let's wake them up." and the page eases into screen 1 |

### 15.3 Prompt (send in the same chat, with images 31 and 32 attached)

```
Add the opening sequence for the flow: SCREEN 0, four frames in a 2x2 grid, same look as the attached sign-up flow
(soft orange palette only, pale orange field, serif headline in #5c524b, the same hero, loose shapes, open canvas,
no boxes, about 60% empty space). No stepper, no initials circle, no chapter names on these frames.

0a IDLE: the hero stands plain with no watch, looking at a large orange four-point star icon (the SuperHyre mark)
  floating at her chest height, a soft pulse ring around it. Headline "Every recruiter has a superpower." Under it
  one grey line "Tap to find yours." Bottom-left quiet link "Skip".
0b TOUCH: she reaches out and touches the star lightly with one finger (one hand, nothing else touching). Three thin
  orange ripple rings spread from the touch, the star brightens. No text.
0c AWAKEN: the star has lifted off and settled on her wrist as the glowing emblem watch, with a soft orange halo
  spreading across the field. Four small power icons orbit her, dim: a spark, a plug, a speech bubble, a stack of
  discs (shades of orange, no labels). Small text on the field: "Mind. Reach. Voice. Memory."
0d POWERS SET: the four icons have slid into the watch's four-segment dial, all segments still pale and dim, a
  soft glow around it. The field a little warmer. Headline "Four powers. Let's wake them up." and one grey line
  "Tap to continue."

Powers are shown only as shapes and shades of orange (spark #ea5a1e, plug #b16038, speech bubble #f08f5f, discs
#f6c3a8). Spell every word exactly. No red, no emoji, no capes, no lightning bolts, no hands touching other hands.
```

### 15.4 For the build

- Screen 0 is shown once per account (first run), before step 1; "Skip" and returning users go straight to step 1.
- The tap on the icon is the first saved event, so we know who started. Nothing is written to the account until
  step 1's Continue.
- The watch then carries real state from here on: the dial starts dim, and segments fill at screens 4, 8, 11 and 12.
- Powers are metaphor only; the real connections (Chrome, WhatsApp) happen at screen 11.

---

## 16. Polish pass on the full flow (image 32)

What is off in the generated sheet, and the prompt that fixes it.

| # | Problem seen | Fix |
|---|---|---|
| 1 | Screen labels collide with the logo or title ("7. Reading acme.com", "9. SUPER and outreach", "10. Your first client") | Put numbers and names outside the screen, below it, never on it |
| 2 | The stepper says "Getting to know you" on every screen | It must move: screens 1 to 5 chapter one, 6 to 9 "Your brand", 10 to 12 "Getting started", finished chapters get a tick |
| 3 | Three trailing dots after every headline ("Almost done…", "Does this look like you?…") | Dots only while Mind is thinking (screens 2, 7, 10), never on a finished question |
| 4 | The text is too small in a 2x2 sheet; labels, captions and choices are hard to read | One screen per image at full size, minimum text sizes below |
| 5 | The watch never visibly changes, so progress is invisible | Show the dial on every screen: empty, one, two, three, then four segments |
| 6 | The initials circle is missing or changes on some screens (12) | Same circle on every screen after the opening; filled once the first site read is done |
| 7 | Screen 10's "Your scouts are out" looks the same as the roles screen | Show a radar and returning candidates, with a count |
| 8 | Side screens are cut off and cramped | Give each full size |

### 16.1 Minimum sizes (relative to a 1536 px wide screen)

- Headline 56 px, supporting line 24 px, choices and links 22 px, captions under pieces 18 px, stepper 18 px.
- Nothing smaller than 18 px. Contrast: ink `#5c524b` or darker on pale fields, white only on `#7a3a1e` or deeper.
- Choices have a 44 px row height and a round marker at least 22 px.
- The pill button is at least 56 px tall, with 22 px text.

### 16.2 Prompt (send with image 32 attached)

```
This sheet is almost right. Redo the flow one screen per image, full size, wide 3:2, keeping the look exactly
(soft orange palette only, pale field, serif headline in #5c524b, same hero, same loose tilted pieces, soft brown
pill #7a3a1e, open canvas, no boxes). Apply these fixes to EVERY screen:

1. LABELS: never draw the screen number or name on the artwork. If you add a caption, put it below the image,
   outside the frame.
2. STEPPER, top-right, must progress: screens 1 to 5 "Getting to know you" in orange with an arrow; screens 6 to 9
   "Getting to know you" with a tick, "Your brand" in orange with an arrow; screens 10 to 12 both earlier chapters
   ticked, "Getting started" in orange with an arrow.
3. DOTS after a headline appear only while Mind is working (screens 2, 7 and 10). Finished questions end cleanly.
4. READABLE: headline about 56 px, supporting line 24, choices and links 22, captions under pieces 18, nothing
   smaller than 18 on a 1536 px wide image. Choices sit in 44 px rows with a 22 px round marker. The pill is at
   least 56 px tall with 22 px text. Ink #5c524b or darker on pale fields.
5. THE WATCH shows progress on every screen: an empty pale dial on screens 1 to 3, one orange segment on 4 to 7,
   two on 8 and 9, three on 10 and 11, the full four-segment dial on 12.
6. THE CIRCLE "RM  Riya Menon · Northstar Talent" sits top-left on every screen from 1, outlined while the first site
   is being read, filled solid orange from screen 4 onward.
7. SCREEN 10 shows a radar of three scout dots around her, candidate circles returning on dashed lines, one with "92%"
   beside it, and the line "I'll tell you when the first people come back."
8. SCREEN 12 and the side screens S1, S2, F8, F9 get the same full-size treatment and the same stepper and circle.
9. The hero is the same size and place on every screen; nothing overlaps her face; about 60% of each screen is empty.

Return the screens in order, starting with the flow map, then 1 to 12, then S1, S2, F8, F9. Spell every word
exactly. Orange palette only. No red, no warning icons, no emoji.
```

### 16.3 Acceptance checklist (look at each returned image)

1. Can you read every word at phone width without zooming?
2. Is the one thing to do obvious in a second (one pill, everything else quiet)?
3. Is the same thing in the same place on every screen (stepper, circle, hero, pill, stage)?
4. Does the stepper move and does the dial grow?
5. Does every wait show real content, with a way to carry on?
6. Is anything crowded, decorative or overlapping? Cut it.
7. Does it feel calm: soft, plenty of space, one motion language?

---

## 17. Single prompt: the SuperHyre logo + the polish pass

Send with images 31 and 32 and the logo file (the star and wordmark from the site header) attached. If the logo image
is attached, say so in the first line; if it isn't, the written description below is what keeps it consistent.

```
REDESIGN the SuperHyre sign-up flow. This is a full redesign of the onboarding: new look, new story (a hero who
earns four powers), new screens, new research and waiting moments. Do not copy any earlier SuperHyre sign-up screen;
use only the attached images as the new direction.

LOGO (use exactly, same on every screen): the SuperHyre mark is a four-point star with softly concave sides, solid
orange #ea5a1e, no outline, no gradient, with the sparkle's points at top, bottom, left and right. Next to it the
wordmark "SUPERHYRE" in heavy uppercase Helvetica Neue style, ink #312a23, tight letter spacing, the mark about the
height of the capitals. Placed top-left on every screen, same size and position. The same star is the icon the
hero taps in the opening, the emblem on her watch, and the avatar before Mind's headline.

OPENING (screen 0, comes first, no stepper, no initials circle, no chapter names): four frames in a 2x2 grid showing
the hero tapping the star to get her powers.
0a IDLE: she stands plain with no watch, looking at the large orange four-point SuperHyre star floating at her chest
  height, a soft pulse ring around it. Headline "Every recruiter has a superpower." One grey line "Tap to find
  yours." Bottom-left quiet link "Skip".
0b TAP: she reaches out and taps the star with one finger (one hand, nothing else touching). Three thin orange ripple
  rings spread from the touch and the star brightens. No text.
0c AWAKEN: the star has lifted off and settled on her wrist as the glowing emblem watch, a soft orange halo spreading
  across the field. Four small dim power icons orbit her (spark, plug, speech bubble, stack of discs, shades of
  orange, no labels). Small text: "Mind. Reach. Voice. Memory."
0d POWERS SET: the four icons slide into the watch's four-segment dial, all segments pale and dim. Headline "Four
  powers. Let's wake them up." One grey line "Tap to continue." Then the scene eases into screen 1.

This redesign sheet is almost right. Redo the redesigned flow one screen per image, full size, wide 3:2, keeping the look exactly
(soft orange palette only, pale field, serif headline in #5c524b, same hero, same loose tilted pieces, soft brown
pill #7a3a1e, open canvas, no boxes). Apply these fixes to EVERY screen:

1. LABELS: never draw the screen number or name on the artwork. If you add a caption, put it below the image,
   outside the frame.
2. STEPPER, top-right, must progress: screens 1 to 5 "Getting to know you" in orange with an arrow; screens 6 to 9
   "Getting to know you" with a tick, "Your brand" in orange with an arrow; screens 10 to 12 both earlier chapters
   ticked, "Getting started" in orange with an arrow.
3. DOTS after a headline appear only while Mind is working (screens 2, 7 and 10). Finished questions end cleanly.
4. READABLE: headline about 56 px, supporting line 24, choices and links 22, captions under pieces 18, nothing
   smaller than 18 on a 1536 px wide image. Choices sit in 44 px rows with a 22 px round marker. The pill is at
   least 56 px tall with 22 px text. Ink #5c524b or darker on pale fields.
5. THE WATCH shows progress on every screen: an empty pale dial on screens 1 to 3, one orange segment on 4 to 7,
   two on 8 and 9, three on 10 and 11, the full four-segment dial on 12.
6. THE CIRCLE "RM  Riya Menon · Northstar Talent" sits just under the logo, top-left, on every screen from 1,
   outlined while the first site is being read, filled solid orange from screen 4 onward.
7. SCREEN 10 shows a radar of three scout dots around her, candidate circles returning on dashed lines, one with "92%"
   beside it, and the line "I'll tell you when the first people come back."
8. SCREEN 12 and the side screens S1, S2, F8, F9 get the same full-size treatment and the same logo, stepper and circle.
9. The hero is the same size and place on every screen; nothing overlaps her face; about 60% of each screen is empty.

Return the screens in order, starting with the flow map, then the opening 0a to 0d, then 1 to 12, then S1, S2, F8, F9. Spell every word
exactly. Orange palette only. No red, no warning icons, no emoji.
```

---

## 18. Two-stage prompt: four overview boards first, then each page after approval

Changes from section 17: (1) **state truth**: nothing appears on a screen before the person has given it; (2) **one board
with all screens** in four variations with different components; (3) **more minimal and professional**; (4) **more orange**;
(5) full-size single pages only after a variation is approved.

### 18.1 What each screen may show (state truth)

Example data is typed on screen 1 and shown only from then on. Nothing else is invented early.

| Screen | Fields and text shown | Not yet allowed |
|---|---|---|
| Opening | star, hero, four dim icons | name, circle, stepper |
| 1 Let's start | **empty fields with grey placeholders** ("Your name", "Workspace name", "company.com"), no choice selected, button grey | any name, workspace, site, circle top-left |
| 2 Reading | circle "RM  Riya Menon · Northstar Talent" and the site typed on screen 1 | roles, logo, colours (they arrive as found) |
| 3 Almost done | only the pieces found so far; missing ones as outlines | pieces that were not found |
| 4 Looks like you | all pieces found | client info |
| 5 What I found | three facts read from the site | client name |
| 6 First client | **empty** "Client website" field with placeholder "client.com" | Acme, its logo |
| 7 Reading client | the client site typed on 6, "acme.com", the client's pieces as found | roles before found |
| 8 First role | roles found on the client's careers page | candidates, percents |
| 9 Voice | sender choice, nothing selected until chosen | message preview not yet written |
| 10 Scouts out | scouts and candidate dots; percent appears only on returned ones | named candidates |
| 11 Connections | rows with links; "Running" only for scouts that really are | Chrome or WhatsApp "connected" |
| 12 Take-off | names and percents that scouts returned | invented companies |

Also: the watch and the stepper always match the step; a filled circle appears only after a read is done.

### 18.2 The four variations (different components, same story, same screens)

| Variation | Research and finding pieces | Choices | The stage |
|---|---|---|---|
| A · Pinned | page unfolds into tilted pieces pinned to the watch by dashed lines | plain text with round markers | beam, radar, skyline |
| B · Rail | findings slide as a single horizontal strip of wide, short cards, the active one largest | plain choices as horizontal chips in one row | the same objects but kept low and quiet |
| C · Orbit | findings circle the watch on one thin ring, the one being read comes to the front | plain choices placed around the hero like a dial | the dial grows as powers unlock |
| D · Ticker | a single line of text runs beneath the page ("Found your logo · Found 4 open roles…"), finished findings pin as small cards above | plain choices in a vertical stack with generous spacing | a thin progress rule across the bottom |

### 18.3 Prompt, stage 1 (send with images 31 and 32 and the logo attached)

```
REDESIGN the SuperHyre sign-up flow. Make FOUR separate overview boards (one image each), named Variation A, B, C
and D. Each board shows the ENTIRE flow in one image: the opening (four small frames 0a to 0d), screens 1 to 12 and the
side screens S1, S2, F8, F9, laid out as a left-to-right, three-row storyboard with numbers under each frame and thin
dashed arrows. Same story and same screens on every board; the variations differ only in these components:

A "Pinned": the site page unfolds into tilted rectangular pieces pinned to the hero's watch with dashed curves; plain
  choices with round markers.
B "Rail": findings arrive as one horizontal strip of wide short cards, the active one largest; choices as horizontal
  plain chips in a single row; the stage objects kept low and quiet.
C "Orbit": findings circle the hero's watch on one thin ring, the one being read in front; choices placed around her
  like a dial; the dial grows as powers unlock.
D "Ticker": one line of text runs under the page ("Found your logo · Found 4 open roles"), finished findings pin as
  small cards above; choices in a vertical stack with generous spacing; a thin progress rule along the bottom.

LOGO on every frame, top-left, identical: a four-point star with softly concave sides in solid orange #ea5a1e, with
the wordmark "SUPERHYRE" in heavy uppercase Helvetica Neue style, ink #312a23. The same star is the icon the hero taps
in the opening, the emblem on her watch, and Mind's avatar.

OPENING: the plain hero stands looking at the large star, taps it with one finger, it settles on her wrist as the
watch, four dim power icons (spark, plug, speech bubble, discs) orbit then slot into its dial. Text: "Every
recruiter has a superpower." "Tap to find yours." "Mind. Reach. Voice. Memory." "Four powers. Let's wake them up."

SHOW ONLY WHAT HAS BEEN GIVEN SO FAR (very important, keep consistent):
- Screen 1 has EMPTY fields with grey placeholders ("Your name", "Workspace name", "company.com"), no choice
  selected, a grey button, no initials circle yet.
- The circle "RM Riya Menon · Northstar Talent" first appears on screen 2, after those were typed. These are
  example entries, never shown before they are entered.
- Screen 6 "Client website" is EMPTY with the placeholder "client.com"; "Acme", its logo and "acme.com" appear only
  from screen 7. Roles appear only once found (screen 8); candidates and percents only once a search has returned
  them (screens 10 to 12). A piece that was not found stays an empty outline. Choices are unselected until chosen.
- The stepper and the watch always match the step: chapters "Getting to know you" (1 to 5), "Your brand" (6 to 9),
  "Getting started" (10 to 12), finished ones ticked; the dial empty on 1 to 3, one segment 4 to 7, two on 8 and 9,
  three on 10 and 11, four on 12.

FLOW (one idea per screen): 1 "Let's start with you." 2 "Reading northstartalent.com…" 3 "Almost done." 4 "Does this look
like you?" 5 "Here's what I learned. Is that right?" with "Who do you hire for?" 6 "Who are you hiring for first?"
7 "Reading acme.com…" 8 "I found these roles. Which should I start with?" 9 "Should messages go out as you or as
Acme?" 10 "Your scouts are out." 11 "Two quick connections. Skip any for now." 12 "You're ahead of every recruiter
still searching by hand." S1 "Your team is already here." S2 "Request sent." F8 "I couldn't read that site." F9
"Taking longer than usual."

MORE MINIMAL AND PROFESSIONAL: one idea per screen; about 65% empty space; at most one headline, one supporting line,
one choice group and one button; no tooltips, hints or counters; a single motion language (slide, settle, rest); a
grid with the same margins on every frame; text aligned left on one edge; no decoration that carries no meaning;
fewer and paler leaf shapes; the hero smaller, calm, one prop.

ORANGE SHOWN BETTER: the field is a clearer pale orange #fbd9c8 fading to #fff1e8, not near-white. Solid brand orange
#ea5a1e appears in a few deliberate places on every screen: the star and wordmark mark, the active stepper chapter
with its arrow, selected markers, the primary button (a solid orange pill with white text, 56 px tall), the watch's
lit segments and one key object in the scene. Deep orange-brown #7a3a1e only for hair, trousers and small text accents.
Headline ink #5c524b, body ink #312a23. Nothing green, blue, red or purple.

Text must be readable: headline about 56 px, supporting 24, choices 22, captions 18, nothing smaller on a 1536 px
board scaled up; if text cannot fit legibly in a frame, shorten it, never shrink it. No screen number or name drawn
on the artwork except the small numbers beneath each frame. Spell every word exactly. No red, no warning icons, no
emoji.
```

### 18.4 Prompt, stage 2 (send only after one variation is approved)

```
I approve Variation <A/B/C/D>. Now generate each page individually, one image per screen, wide 3:2, full size, exactly in
that variation's components and the rules above (state truth, minimal and professional, stronger orange). Order: opening
0a to 0d as a 2x2 image, then screens 1 to 12 one per image, then S1, S2, F8, F9. Keep logo, stepper, circle, hero,
button and stage in the same place on every image. After each, wait for me to say "next".
```

### 18.5 What to look at when choosing

1. Which research moment feels most trustworthy and least busy (A pinned, B rail, C orbit, D ticker)?
2. Can you tell what to do on each screen in a second?
3. Does anything appear before it could possibly be known?
4. Is the orange confident without shouting?
5. Which variation is simplest to build and animate well? A and D are lightest; C is the most distinctive.

---

## 19. One board: the flow map and every screen (like image 34)

A single image: flow map on top, every screen beneath in a grid. 20 frames: opening 0a to 0d, screens 1 to 12, side
screens S1, S2, F8, F9. Fixes the problems seen in image 34: filled form on screen 1, circle shown before it exists,
stepper stuck on "Getting to know you", garbled labels on 9 and 11, overprinted titles.

```
REDESIGN the SuperHyre sign-up flow. Make ONE very wide board image (about 3:4 portrait, 3072 x 4096) like the
attached image 34: at the top a FLOW MAP, below it a grid of EVERY screen the person will see, in order.

FLOW MAP (top, one row plus a branch row): 0 the opening, then the 12 steps with thin dashed arrows, a small
thumbnail and a short caption under each: 0 "Tap the star", 1 "Let's start with you", 2 "Reading your site", 3 "Almost
done", 4 "Does this look like you?", 5 "What I learned", 6 "Your first client", 7 "Reading their site", 8 "First role",
9 "Your voice", 10 "Scouts are out", 11 "Your toolkit", 12 "Take-off". Below it, dashed branches to S1 "Your team is
already here", S2 "Request sent", F8 "Couldn't read the site", F9 "Taking longer than usual". Captions drawn once,
below the thumbnails, never over artwork.

SCREEN GRID: 4 columns by 5 rows, 20 frames, each frame wide 3:2 with its number small beneath. Order:
row 1  0a Idle · 0b Tap · 0c Awaken · 0d Powers set
row 2  1 · 2 · 3 · 4
row 3  5 · 6 · 7 · 8
row 4  9 · 10 · 11 · 12
row 5  S1 · S2 · F8 · F9

LOOK: soft pale-orange field #fbd9c8 fading to #fff1e8; one hero woman (dark wavy hair, cream top, orange-brown
trousers #7a3a1e, white shoes) in the same size and place on every frame, one prop at most; serif headline in #5c524b;
body ink #312a23; solid orange #ea5a1e used in a few deliberate places: the logo star, the active stepper chapter with
an arrow, selected round markers, the primary pill button (solid orange, white text), the lit watch segments and one key
object. Open canvas, no boxes around text; findings are loose tilted rounded rectangles pinned to her watch by thin
dashed orange curves. Minimal and professional: one idea per frame, about 65% empty space, left-aligned on one edge, no
tooltips or counters, fewer and paler leaf shapes. Orange palette only, nothing green, blue, red or purple.

EVERY FRAME (1 to 12 and the side frames) has: top-left the logo (an orange four-point star with concave sides plus
"SUPERHYRE" in heavy uppercase Helvetica Neue style, ink), top-right a three-name stepper "Getting to know you · Your
brand · Getting started" that PROGRESSES: frames 1 to 5 first chapter in orange with an arrow; 6 to 9 first chapter
ticked, "Your brand" orange; 10 to 12 both ticked, "Getting started" orange. The opening frames have no stepper and no
circle. Mind's headline has a small orange star before it. Dots after a headline only on 2, 7 and 10.

THE WATCH shows progress: absent in 0a; star in 0b; dim four-segment dial from 0c; on frames 1 to 3 empty, 4 to 7 one
orange segment, 8 and 9 two, 10 and 11 three, 12 four.

SHOW ONLY WHAT IS KNOWN SO FAR (very important):
- Frame 1: EMPTY underlines with grey placeholders "Your name", "Workspace name", "company.com"; no choice selected;
  the pill grey; no initials circle; the signboard post blank.
- From frame 2 the circle "RM  Riya Menon · Northstar Talent" sits under the logo (outlined on 2 and 3, filled
  orange from 4), as if typed on frame 1. The site read is "northstartalent.com".
- Frame 6: EMPTY "Client website" with placeholder "client.com"; no Acme anywhere. Acme, its logo and
  "acme.com" appear only from frame 7. Roles only once found (frame 8). Candidates and percents only from frame 10,
  and only those that have returned. Choices unselected until the frame says chosen. A piece not found is an outline.

FRAMES
0a Idle: plain hero, no watch, looking at the large orange star floating at chest height with a soft pulse ring.
   "Every recruiter has a superpower." "Tap to find yours." Bottom-left link "Skip".
0b Tap: she taps the star with one finger, three ripple rings, the star brightens. No text.
0c Awaken: the star has become the glowing watch on her wrist, halo, four dim power icons (spark, plug, speech
   bubble, discs) orbit her. "Mind. Reach. Voice. Memory."
0d Powers set: icons slot into the watch's dial, all pale. "Four powers. Let's wake them up." "Tap to continue."
1  "Let's start with you." Four empty underlines, "How did you hear about us?" with three unselected choices
   (Search, A friend, Somewhere else), a small link "But why?", grey pill "Continue".
2  "Reading northstartalent.com…" "About 10 seconds". The page unfolds, pieces "Your logo", "Your colours", "Your
   type" lift off pinned to her watch; the "4 open roles" piece still an outline with a shimmer.
3  "Almost done." "I couldn't find your logo. Add it?" link "Add a logo". Logo piece a dashed outline with a plus;
   "Not right?" under each found piece. Pill "Continue".
4  "Does this look like you?" All pieces filled and fanned. Pill "Looks right", link "Not right?".
5  "Here's what I learned. Is that right?" Three plain lines with markers: "A recruiting agency in Bengaluru",
   "You hire for fintech and SaaS clients", "Mostly senior engineers and designers", link "Fix anything". Then "Who
   do you hire for?" Our clients / Our own team / Both. Pill "Continue".
6  "Who are you hiring for first?" empty underline "client.com", link "No website? Paste a LinkedIn page". Pill.
7  "Reading acme.com…" "About 10 seconds". The page unfolds with Acme's logo, colours, type; "4 open roles" piece
   still an outline.
8  "I found these roles. Which should I start with?" Three plain choices: Senior Full Stack Engineer, Product
   Designer, Data Analyst, link "Paste a job description instead". Beam and candidate dots. Pill "Create campaign".
9  "Should messages go out as you or as Acme?" Choices "Send as Northstar Talent", "Keep the client confidential",
   unselected. Pill "Looks right", link "Adjust tone".
10 "Your scouts are out." "I'll tell you when the first people come back." Radar of three scout dots, a few
   candidate circles returning, one with "92%". Pill "Continue".
11 "Two quick connections. Skip any for now." Two plain rows: Chrome extension "Save any profile in one click" link
   "Add to Chrome"; WhatsApp by Magnifi "Reach candidates where they reply" link "Connect". Link "Skip for now". Pill.
12 "You're ahead of every recruiter still searching by hand." Three plain lines "Jane Sharma 92%", "Mohit Kapoor 88%",
   "Ananya Tiwari 84%". The hero rising over a skyline of candidate circles. Pill "Open my workspace".
S1 "Your team is already here." "Ask to join. An admin lets you in." Pill "Ask to join", link "Use a personal workspace".
   Open door with warm light.
S2 "Request sent." "We'll let you in the moment they approve." Link "Check again". Lamp, plant, envelope on a sill.
F8 "I couldn't read that site." "No problem. Give me a LinkedIn page or a job description." Choices "Paste a
   LinkedIn page", "Paste a job description", "Skip for now". One loose grey bar floating away.
F9 "Taking longer than usual." "You can carry on. I'll finish in the background." Pill "Continue". Half-built page
   with a slow shimmer.

TEXT RULES: spell every word exactly; if text does not fit legibly, shorten it, never shrink it or garble it; never
overprint a title on the logo, stepper or another label; no screen names drawn on the artwork, only the small
numbers beneath each frame. No red, no warning icons, no emoji.
```

---

## 20. Lean flow: no fetching, softer chat, much less content (supersedes 14 to 19)

Three insights from 9 Oct: (1) **don't fetch anything now**, only ask for the website or LinkedIn link and store it;
(2) **the content is too much**; (3) **the conversation should appear smoothly**, not as big text blocks.

### 20.1 What the changes remove

| Removed | Because |
|---|---|
| Reading, Almost done, Does this look like you, What I learned | they were all site-fetch moments |
| Reading the client, Found roles | same |
| F8 "couldn't read the site", F9 "taking longer" | nothing is fetched, so nothing fails or waits |
| The initials circle, named chapter stepper, pieces, scanner, "Not right?" | only needed by the fetch |
| Invented candidates and percentages on the last screens | nothing is searched on the first run, so nothing is claimed |

What remains is a short, honest conversation that collects six things, then lands in the console.

### 20.2 The lean flow (9 steps, 14 frames)

| # | Mind asks | Person gives | Note |
|---|---|---|---|
| 0 | opening: the girl taps the star, gets the dial | tap | optional, skippable |
| 1 | "What should I call you?" | name | |
| 2 | "And your workspace?" | name | |
| 3 | "Where can I find your company?" | website or LinkedIn link | "Skip for now" |
| 4 | "Who do you hire for?" | Our clients / Our own team / Both | |
| 5 | "Your first client's website or LinkedIn?" | a link | only if clients or both |
| 6 | "Which role first?" | job title or a job-description link | |
| 7 | "Send messages as you or as Acme?" | one choice | only if a client was given |
| 8 | "Two quick connections. Skip any for now." | Chrome, WhatsApp, both skippable | |
| 9 | "You're set. Mind is putting your first campaign together." | Open my workspace | |
| S1, S2 | join your team, request sent | | unchanged |

### 20.3 The chat that appears smoothly

Replace big headlines with a calm conversation:

- **One Mind line at a time**, medium serif (about 32 px), not 56, with a small orange star avatar before it. It fades in
  as it is typed, three soft dots first (about 500 ms).
- **The thread stays and recedes**: the previous Mind line and the person's answer shrink to small grey text (about
  18 px) and drift up and fade, so the thread is a quiet trail, never a wall of text.
- **The person's answer** sits right-aligned in plain text, no bubble, and appears as it is typed or tapped.
- **A single composer line** at the bottom (a soft pill with a placeholder and a small orange send arrow) is the only
  input, in every step; choices appear as soft chips above it.
- **No stepper names.** Progress is a row of eight tiny dots top-right, and the watch.
- **Nothing else.** One question, one input, one way to skip. The hero and the stage objects stay but only one at a time.

### 20.4 Prompt (send with image 34 and the logo attached)

```
REDESIGN the SuperHyre sign-up flow, now LEAN: nothing is fetched or researched. We only ask for a website or a
LinkedIn link and keep it. Make ONE portrait board image (about 3072 x 3584), like the attached image 34: at the top a
short FLOW MAP, below it every screen in a 4-column grid.

FLOW MAP: thumbnails with dashed arrows and captions under each: 0 "Tap the star", 1 "Your name", 2 "Your workspace",
3 "Your company", 4 "Who you hire for", 5 "Your first client", 6 "First role", 7 "Your voice", 8 "Your toolkit",
9 "You're set". Below, dashed branches: S1 "Your team is already here", S2 "Request sent". Captions only below
thumbnails.

GRID (14 frames, each wide 3:2, small number beneath):
row 1  0a Idle · 0b Tap · 0c Powers set · 1
row 2  2 · 3 · 4 · 5
row 3  6 · 7 · 8 · 9
row 4  S1 · S2

LOOK: soft pale-orange field #fbd9c8 fading to #fff1e8; the same hero woman (dark wavy hair, cream top, orange-brown
trousers #7a3a1e) on every frame, small and calm, one prop at most; serif for Mind's line in #5c524b; body ink #312a23;
solid orange #ea5a1e used deliberately: the logo star, Mind's avatar star, the composer's send arrow, selected
markers, the lit watch segments, the primary pill when there is one. Open canvas; no boxes around text. Orange palette
only; nothing green, blue, red or purple. Much less content: about 70% of each frame empty.

THE CHAT, on every frame 1 to 9: a smooth, calm conversation on the left, NOT big headlines.
- The CURRENT Mind line, medium serif (about 32 px, not larger), a small orange star avatar before it, at the vertical
  centre of the left side. While Mind is "speaking" show three soft dots fading into the text.
- ABOVE it, the earlier turns as a quiet trail: the previous Mind line and the person's answer in small grey text (about
  18 px), the older ones fainter and smaller, fading upward. The person's answers are right-aligned plain text, no
  bubbles.
- BELOW it, one soft composer line (a pale rounded line with a grey placeholder and a small orange send arrow) and,
  where choices exist, soft round chips above it (not boxes with borders).
- Nothing else on the left: no field labels, no supporting paragraph, no hints, no tooltips.
- The stage on the right holds the hero and at most ONE small object; no pinned pieces, no scanners, no radar.

TOP OF EVERY FRAME 1 to 9 and S1, S2: the logo top-left (orange four-point star with concave sides + "SUPERHYRE"
in heavy uppercase Helvetica Neue style, ink). Top-right ONLY a row of eight tiny dots, the current one orange, finished
ones ticked in pale orange. No chapter names, no counters, no circle.

THE WATCH: absent in 0a; the star in 0b; a dim four-segment dial from 0c; frames 1 to 2 empty, 3 to 5 one orange
segment, 6 and 7 two, 8 three, 9 four.

SHOW ONLY WHAT HAS BEEN GIVEN SO FAR: composer placeholders are grey and empty until the person answers; the
person's answers appear in the trail only after their frame (example answers: "Riya", "Northstar Talent",
"northstartalent.com", "Our clients", "acme.com", "Senior Full Stack Engineer"); "Acme" appears only after frame 5;
nothing is described, scored or found; no candidates, percentages, logos or roles drawn from a site.

FRAMES
0a Idle: the plain hero, no watch, looks at the large orange star floating at chest height with a soft pulse ring.
   "Every recruiter has a superpower." "Tap to find yours." Bottom-left link "Skip".
0b Tap: she taps the star with one finger, three ripple rings, the star brightens. No text.
0c Powers set: the star is now her watch; four dim icons (spark, plug, speech bubble, discs) have slotted into its
   dial. "Four powers. Let's wake them up."
1  Mind: "What should I call you?" Empty composer "Your name".
2  Trail: "What should I call you?" and "Riya". Mind: "And your workspace?" Empty composer "Workspace name".
3  Trail: the earlier turns. Mind: "Where can I find your company?" Composer "Website or LinkedIn link" and a quiet
   chip "Skip for now". One watch segment lit.
4  Mind: "Who do you hire for?" Three soft chips: "Our clients", "Our own team", "Both"; none selected.
5  Mind: "Your first client's website or LinkedIn?" Composer "Website or LinkedIn link", chip "Not yet".
6  Mind: "Which role first?" Composer "A job title, or paste a job description link". Two watch segments.
7  Mind: "Send messages as you or as Acme?" Two soft chips: "As Northstar Talent", "Keep the client private"; none
   selected.
8  Mind: "Two quick connections. Skip any for now." Two soft chips: "Add Chrome extension", "Connect WhatsApp", and a
   quiet "Skip for now". Three watch segments.
9  Mind: "You're set." A quiet line "Mind is putting your first campaign together." The hero rising, the full dial
   lit. One solid orange pill "Open my workspace".
S1 Mind: "Your team is already here." Chips "Ask to join", "Use a personal workspace". An open door, warm light.
S2 Mind: "Request sent. We'll let you in the moment they approve." Quiet chip "Check again". A lamp, plant, envelope.

TEXT RULES: spell every word exactly; if text does not fit legibly in a frame, shorten it, never shrink it or garble it;
never overprint any text on the logo or another label. No screen names drawn on the artwork, only the small numbers
beneath each frame. No red, no warning icons, no emoji.
```

### 20.5 What this means for the build

1. The set-up becomes a single chat on one page: six questions, one composer, chips for choices, no fetch waits.
2. Stored: name, workspace, company link, who you hire for, first client link, first role (title or link), sender style.
   The links are kept for later; Mind uses them when it builds the first campaign inside the console, not here.
3. Smooth feel is implemented as: line-by-line fade with typing dots, the earlier turns shrinking and fading upward,
   chips fading in after the question, eased 300 to 500 ms; reduced motion shows lines at once.
4. Skips are always available: the company link, the first client and each connection.
5. The old fetch-based screens (reading, pieces, "what I learned", failures) are dropped from the plan; if site reading
   returns later, it comes back as one optional moment after the link is given.

### 20.6 Presentation reference (image 35) for the lean prompt

Image 35 is the preferred **presentation** (title bar "Onboarding flow" with a one-line tagline, the flow map with
captions under thumbnails, dashed branches to side screens, a clean grid with numbers beneath). It still contains the
old fetch screens (2, 3, 4, 5, 7, 8, F8, F9), so use it for layout only. Add this line at the start of the section 20.4
prompt when attaching image 35:

```
Use the attached image 35 ONLY for the presentation: the title bar "Onboarding flow" with a one-line tagline on the right
("From your name to your first campaign, in nine quiet steps."), the flow map with captions under the thumbnails, the
dashed branches to the side screens, the grid and the numbers beneath each frame. Do NOT copy its screens: it still has
research and fetching, which are removed. The content, frames and rules below replace everything in image 35.
```

### 20.7 Final merged prompt (presentation built in; use this one)

```
REDESIGN the SuperHyre sign-up flow, now LEAN: nothing is fetched or researched. We only ask for a website or a
LinkedIn link and keep it. Produce ONE portrait presentation board (about 3072 x 4096) in the style of the attached
image 35. Use image 35 ONLY for the presentation; do NOT copy its screens (they still have research and fetching, now
removed). Content and rules below replace everything in it.

PRESENTATION (copy from image 35):
- Whole board on the same pale orange field, no outer border.
- HEADER: top-left the SuperHyre logo (orange four-point star with concave sides + "SUPERHYRE" in heavy uppercase
  Helvetica Neue style, ink), then the title "Onboarding flow" in large serif #5c524b. Top-right, small grey
  tagline: "From your name to your first campaign, in nine quiet steps."
- FLOW MAP (one wide row under the header): 10 small thumbnails of the screens left to right joined by thin dashed
  arrows, a bold number above each and a short caption under each: 0 "Tap the star", 1 "Your name", 2 "Your workspace",
  3 "Your company", 4 "Who you hire for", 5 "Your first client", 6 "First role", 7 "Your voice", 8 "Your toolkit",
  9 "You're set".
- BRANCH ROW under the map: dashed lines drop from the relevant steps to two slightly larger thumbnails with a bold
  code and a label: S1 "Your team is already here", S2 "Request sent".
- SCREEN GRID under that: 4 columns, every frame wide 3:2 with a small number centred beneath it (0a, 0b, 0c, 1 ...),
  frames separated only by thin gaps of the field, no frame borders or shadows.
  row 1  0a Idle · 0b Tap · 0c Powers set · 1
  row 2  2 · 3 · 4 · 5
  row 3  6 · 7 · 8 · 9
  row 4  S1 · S2
- Captions only in the flow map, branch row and beneath frames; never drawn on top of any artwork.

LOOK: soft pale-orange field #fbd9c8 fading to #fff1e8; the same hero woman (dark wavy hair, cream top, orange-brown
trousers #7a3a1e) on every frame, small and calm, one prop at most; serif for Mind's line in #5c524b; body ink #312a23;
solid orange #ea5a1e used deliberately: the logo star, Mind's avatar star, the composer's send arrow, selected
markers, the lit watch segments, the primary pill when there is one. Open canvas; no boxes around text. Orange palette
only; nothing green, blue, red or purple. Much less content: about 70% of each frame empty.

THE CHAT, on every frame 1 to 9: a smooth, calm conversation on the left, NOT big headlines.
- The CURRENT Mind line, medium serif (about 32 px, not larger), a small orange star avatar before it, at the vertical
  centre of the left side. While Mind is "speaking" show three soft dots fading into the text.
- ABOVE it, the earlier turns as a quiet trail: the previous Mind line and the person's answer in small grey text (about
  18 px), the older ones fainter and smaller, fading upward. The person's answers are right-aligned plain text, no
  bubbles.
- BELOW it, one soft composer line (a pale rounded line with a grey placeholder and a small orange send arrow) and,
  where choices exist, soft round chips above it (not boxes with borders).
- Nothing else on the left: no field labels, no supporting paragraph, no hints, no tooltips.
- The stage on the right holds the hero and at most ONE small object; no pinned pieces, no scanners, no radar.

TOP OF EVERY FRAME 1 to 9 and S1, S2: the logo top-left. Top-right ONLY a row of eight tiny dots, the current one
orange, finished ones ticked in pale orange. No chapter names, no counters, no initials circle.

THE WATCH: absent in 0a; the star in 0b; a dim four-segment dial from 0c; frames 1 to 2 empty, 3 to 5 one orange
segment, 6 and 7 two, 8 three, 9 four.

SHOW ONLY WHAT HAS BEEN GIVEN SO FAR: composer placeholders are grey and empty until the person answers; the
person's answers appear in the trail only after their frame (example answers: "Riya", "Northstar Talent",
"northstartalent.com", "Our clients", "acme.com", "Senior Full Stack Engineer"); "Acme" appears only after frame 5;
nothing is described, scored or found; no candidates, percentages, logos or roles drawn from a site.

FRAMES
0a Idle: the plain hero, no watch, looks at the large orange star floating at chest height with a soft pulse ring.
   "Every recruiter has a superpower." "Tap to find yours." Bottom-left link "Skip".
0b Tap: she taps the star with one finger, three ripple rings, the star brightens. No text.
0c Powers set: the star is now her watch; four dim icons (spark, plug, speech bubble, discs) have slotted into its
   dial. "Four powers. Let's wake them up."
1  Mind: "What should I call you?" Empty composer "Your name".
2  Trail: "What should I call you?" and "Riya". Mind: "And your workspace?" Empty composer "Workspace name".
3  Trail: the earlier turns. Mind: "Where can I find your company?" Composer "Website or LinkedIn link" and a quiet
   chip "Skip for now". One watch segment lit.
4  Mind: "Who do you hire for?" Three soft chips: "Our clients", "Our own team", "Both"; none selected.
5  Mind: "Your first client's website or LinkedIn?" Composer "Website or LinkedIn link", chip "Not yet".
6  Mind: "Which role first?" Composer "A job title, or paste a job description link". Two watch segments.
7  Mind: "Send messages as you or as Acme?" Two soft chips: "As Northstar Talent", "Keep the client private"; none
   selected.
8  Mind: "Two quick connections. Skip any for now." Two soft chips: "Add Chrome extension", "Connect WhatsApp", and a
   quiet "Skip for now". Three watch segments.
9  Mind: "You're set." A quiet line "Mind is putting your first campaign together." The hero rising, the full dial
   lit. One solid orange pill "Open my workspace".
S1 Mind: "Your team is already here." Chips "Ask to join", "Use a personal workspace". An open door, warm light.
S2 Mind: "Request sent. We'll let you in the moment they approve." Quiet chip "Check again". A lamp, plant, envelope.

TEXT RULES: spell every word exactly; if text does not fit legibly in a frame, shorten it, never shrink it or garble it;
never overprint any text on the logo or another label. No red, no warning icons, no emoji.
```

---

## 21. Asset production plan (image 36 is approved)

Goal: every visual piece needed to build the lean flow in code, as **separate, same-scale, flat-background pieces** that
can be cut out and animated. Buttons, chips, composer, dots and text are **built in code**, not drawn; the images are
only the scenery, the hero, the star, the dial and the props.

### 21.1 Asset manifest

| Sheet | Contents | Files |
|---|---|---|
| 1 Hero poses | idle plain (looks up-right at the star), tap (arm raised, finger out), watch glance (wrist raised, looking at it), thinking (hand to chin), attentive with tablet, attentive with laptop (seated), blink variant of the tablet pose, door pose (hand on an open door), rising (flight) | `hero-idle, hero-tap, hero-watch, hero-think, hero-tablet, hero-tablet-blink, hero-laptop-sit, hero-door, hero-rise` |
| 2 Star and watch | the star solid; star glow halo; three ripple rings; the star shrunk onto a wrist (watch closeup); the watch on her wrist, dial dim; the dial lit with 1, 2, 3, 4 segments | `star, star-glow, ripple-1/2/3, watch-star, dial-0 … dial-4` |
| 3 Powers | the four icons, each lit and dim: spark, plug (puzzle piece), speech bubble, discs; each also as a single dial segment, lit and dim | `power-mind/reach/voice/memory-lit/dim`, `seg-1…4-lit/dim` |
| 4 Step props | one small hero-prop per step (nameplate, workspace building, link pin, clients trio and own-team trio, client building, job-description sheet, message lines, Chrome puzzle piece, WhatsApp bubble, a rising paper sheet for the campaign, open door, lamp, plant, envelope, sofa) | `prop-name, prop-workspace, prop-link, prop-clients, prop-team, prop-client-building, prop-jd, prop-message, prop-chrome, prop-whatsapp, prop-campaign, prop-door, prop-lamp, prop-plant, prop-envelope, prop-sofa` |
| 5 Scenery | pale-orange field plates from light to deeper (one per step range), three hill layers (far, mid, near), leaf plants (small, medium, large), sun circle, soft clouds, a skyline of candidate circles | `field-1…4, hill-far/mid/near, leaf-s/m/l, sun, cloud, skyline` |
| 6 Effects | sparkle particles (3 sizes), light beam from the door, flight trail, soft glow blob, confetti dots | `spark-s/m/l, beam, trail, glow, dots` |
| 7 Spritesheets | the star pulse (6 frames), the typing dots (3 frames), the hero idle breathing (4 frames), the hero blink (3 frames) | `sprite-star-pulse, sprite-typing, sprite-breathe, sprite-blink` |

### 21.2 Micro-animations and interactions (what the build does with them)

| Moment | Interaction | Motion |
|---|---|---|
| Opening idle | star pulses; hero breathes; hover on the star lifts and brightens it | pulse 2.4 s loop (scale 1 to 1.06, halo fade); breathe 4 s, 3 px vertical; hover ease 150 ms |
| Tap | click or key on the star | ripple rings expand 600 ms staggered 120 ms; star scales 1.0, 1.12, 1.0 over 220 ms; hero swaps to tap pose 120 ms before; haptic-like nudge of 4 px |
| Awaken | star flies to the wrist | path curve 700 ms ease-in-out, shrinks to watch size, halo bursts and fades 500 ms |
| Powers set | four icons orbit, then slot | orbit 900 ms, each icon eases into its segment 220 ms apart, dial dim, soft click pulse each |
| Step change | content changes | field plate cross-fades 400 ms; hills parallax move 12 to 40 px; hero holds position and swaps pose by fade 160 ms |
| Mind's line | appears | three typing dots 500 ms, then the line fades in word by word at about 28 ms per word, avatar star twinkles once |
| Trail | earlier turns recede | previous lines translate up 12 px, scale 0.9, fade to 0.45 over 350 ms; older to 0.25 |
| Composer | focus, type, send | focus ring grows 120 ms; send arrow tilts 8 degrees on valid input; on send the answer slides right and joins the trail |
| Chips | appear, select | stagger 70 ms fade-up 8 px; tapped chip fills orange 160 ms with a tick, others dim to 0.4 |
| Watch progress | step earns a power | segment fills orange with a 300 ms ease-out and a one-time pulse ring; the matching icon glows then settles |
| Hero | idle | breathe loop; blink every 5 to 7 s (random), 120 ms; eyes follow cursor by 2 px on desktop only |
| Step 9 take-off | arrival | hero rises along a curve 900 ms, trail and sparkles trail behind, skyline circles grow in staggered 40 ms, pill fades in last |
| Skip, back | always available | skip link fades the scene 250 ms and jumps; back reverses the trail |
| Errors, empty | none expected | a field with no value shows a soft shake of 6 px, once |
| Reduced motion | system setting | no loops, no parallax, fades only at 120 ms, the finished state of each scene shown at once |

All motion uses one easing (cubic-bezier 0.22, 1, 0.36, 1) and durations between 120 and 900 ms.

### 21.3 Technical rules for the assets

1. Every piece is a **separate image on a plain solid #ffffff background** with nothing else around it (so it can be cut
   out), centred with clear margin, no shadow on the ground, no text.
2. Same scale across a sheet and across sheets: the hero is always the same height (full body, 1000 px tall, feet on the
   same baseline); props are drawn at the size they have beside the hero.
3. Flat vector style as the approved board, orange palette only. Soft edges but no gradients inside shapes except the
   field plates and the glows.
4. Square 2048 px per piece, except fields and hills (3072 x 1536) and spritesheets (a single row).
5. Names as in the manifest so the build can reference them. After approval, each is cut out, traced to SVG where simple
   (star, dial, icons, props) and kept as PNG for the hero.

### 21.4 Prompt (send in the chat that made image 36, with image 36 attached)

```
Image 36 is approved. Now produce ALL the assets needed to BUILD this flow in code, so the pieces can be cut out and
animated. Keep the exact style of image 36 (flat vector, soft pale-orange palette, the same hero woman with dark wavy
hair, cream top, orange-brown trousers #7a3a1e, white shoes, the same orange four-point star #ea5a1e).

Produce SEVEN SHEETS, one image per sheet, in this order. After each, wait for me to say "next".
Each sheet is a clean grid of separate pieces on a plain solid white #ffffff background, evenly spaced with clear
margins, nothing touching, NO shadows on the ground, NO text, NO labels drawn on the pieces, a tiny grey filename
beneath each piece only. Same scale on all sheets: the hero is always the same height with feet on the same baseline;
props are drawn at the size they have beside her.

SHEET 1 HERO POSES (full body, front or three-quarter, same size): hero-idle (plain, no watch, looking up-right),
hero-tap (right arm raised, one finger out), hero-watch (wrist raised, glancing at her watch), hero-think (hand at
chin), hero-tablet (holding a tablet, attentive), hero-tablet-blink (same, eyes closed), hero-laptop-sit (seated with
a laptop), hero-door (standing, one hand on an open door), hero-rise (rising in flight, trailing orange sparks).

SHEET 2 STAR AND WATCH: star (solid), star-glow (soft halo), ripple-1, ripple-2, ripple-3 (thin orange rings),
watch-star (the star shrunk onto a wrist, close-up), dial-0 (four pale segments), dial-1 (one orange), dial-2, dial-3,
dial-4 (all four lit).

SHEET 3 POWERS: power-mind (orange spark), power-reach (plug / puzzle piece), power-voice (speech bubble),
power-memory (stack of discs), each in two states: lit and dim (pale); then the four dial segments seg-1 to seg-4,
each lit and dim, shaped to fit the circular dial.

SHEET 4 STEP PROPS: prop-name (a small nameplate), prop-workspace (a small building), prop-link (a link pin),
prop-clients (three people), prop-team (three people with a table), prop-client-building (a different building),
prop-jd (a job-description sheet), prop-message (a few lines of message), prop-chrome (a puzzle piece), prop-whatsapp
(a speech bubble with a phone), prop-campaign (a paper sheet rising), prop-door (an open door with warm light),
prop-lamp, prop-plant, prop-envelope, prop-sofa.

SHEET 5 SCENERY: field-1 to field-4 (wide soft pale-orange background plates from lightest to deepest, 3:2),
hill-far, hill-mid, hill-near (wide transparent-style hill layers on white), leaf-s, leaf-m, leaf-l (plants), sun
(a pale circle), cloud, skyline (a skyline of plain candidate circles of different heights).

SHEET 6 EFFECTS: spark-s, spark-m, spark-l (small four-point sparkles), beam (a soft wedge of warm light), trail (a
flight trail of fading circles), glow (a soft glow blob), dots (loose confetti circles).

SHEET 7 SPRITE STRIPS (each a single row of frames on white): sprite-star-pulse (6 frames of the star pulsing),
sprite-typing (3 frames of three soft dots), sprite-breathe (4 frames of the hero tablet pose breathing), sprite-blink
(3 frames: open, half, closed).

STYLE: flat vector, clean edges, no outlines, no hard shadows, no gradients inside shapes (soft gradients only on
fields and glows), orange palette only: #fff6f1 #fdeae2 #fbd9c8 #f6c3a8 #f08f5f #ea5a1e #c9481a #b16038 #7a3a1e plus ink
#312a23 and white. Nothing green, blue, red or purple. No text. Pieces must be crisp enough to cut out.
```

### 21.5 After the assets come back

1. Check each sheet against the manifest; ask only for the missing or wrong pieces by filename.
2. Send me the sheets; I will cut them out, trace the simple ones to SVG and set up the motion in the build.
3. Then I write `signup-flow.md` (screens, data stored, APIs) and implement the chat, the opening and the dial.

### 21.6 Revised: asset kit boards, no pages and no per-piece images (use this instead of 21.4)

Feedback: no full pages and no individual images. The assets are drawn together on **kit boards**, like a design-system
sheet: many pieces per image, laid out in a grid, labelled by section. Two boards, no waiting between them.

```
Image 36 is approved. Do NOT draw any screens or pages. Draw the ASSET KIT used to build them, as TWO kit boards
(two images, no waiting between them), in the exact style of image 36 (flat vector, the soft pale-orange palette,
the same hero woman with dark wavy hair, cream top, orange-brown trousers #7a3a1e, white shoes, the same orange
four-point star #ea5a1e).

Each board is a big, clean, portrait sheet (about 3072 x 4096) on a plain white #ffffff background: a tidy grid of
SEPARATE pieces with clear margins, nothing touching or overlapping, no shadows on the ground, no scene, no text drawn
on any piece. Sections are marked by a small grey section title at the top-left of each block; every piece has a tiny
grey filename beneath it. Same scale throughout: the hero is always the same height with feet on the same baseline;
props are drawn at the size they have beside her.

BOARD 1 · CHARACTER, STAR AND POWERS
Section "Hero poses" (9 pieces): hero-idle (plain, no watch, looking up-right), hero-tap (right arm raised, one finger
  out), hero-watch (wrist raised, glancing at her watch), hero-think (hand at chin), hero-tablet, hero-tablet-blink
  (eyes closed), hero-laptop-sit (seated with a laptop), hero-door (one hand on an open door), hero-rise (in flight with
  orange sparks).
Section "Star and watch": star, star-glow, ripple-1, ripple-2, ripple-3, watch-star (the star shrunk onto a wrist),
  dial-0 (four pale segments), dial-1, dial-2, dial-3, dial-4 (segments lit one by one).
Section "Powers": power-mind (spark), power-reach (plug / puzzle piece), power-voice (speech bubble), power-memory
  (stack of discs), each as lit and dim; seg-1 to seg-4, the four dial segments, lit and dim.
Section "Sprite strips" (single rows): sprite-star-pulse (6 frames), sprite-typing (3 frames), sprite-breathe (4 frames
  of hero-tablet), sprite-blink (3 frames).

BOARD 2 · PROPS, SCENERY AND EFFECTS
Section "Step props": prop-name (nameplate), prop-workspace (small building), prop-link (link pin), prop-clients (three
  people), prop-team (three people with a table), prop-client-building, prop-jd (job-description sheet), prop-message
  (message lines), prop-chrome (puzzle piece), prop-whatsapp (bubble with phone), prop-campaign (paper rising),
  prop-door (open door with warm light), prop-lamp, prop-plant, prop-envelope, prop-sofa.
Section "Scenery": field-1 to field-4 (wide soft pale-orange plates from lightest to deepest), hill-far, hill-mid,
  hill-near, leaf-s, leaf-m, leaf-l, sun, cloud, skyline (plain candidate circles of different heights).
Section "Effects": spark-s, spark-m, spark-l, beam (wedge of warm light), trail (flight trail), glow, dots (confetti).

ANIMATION-READY (these pieces will be animated in code, so draw them for motion):
- Everything that moves is its own separate piece, never merged into another: the star, its glow and each ripple ring;
  each dial segment and each power icon in lit and dim states; each hill layer and leaf; each prop; each sparkle.
- Draw each moving piece centred on its own pivot with generous empty margin around it, so it can scale, rotate and
  pulse without being clipped (the star on its centre, the ripple rings concentric, the dial segments around one
  shared centre point, the sparkles on their centre).
- States, drawn as separate pieces: star (rest, bright), each power icon (dim, lit), each dial segment (dim, lit),
  the watch (dial-0 to dial-4), the hero tablet pose (eyes open, half, closed).
- Motion frames, drawn as strips: star pulse (6), typing dots (3), hero breathing (4), blink (3), a sparkle twinkle
  (4), a flight trail fading (4), a ripple expanding (4, from small to large and fading).
- Hills, leaves and field plates are drawn wider than the screen and tileable at the edges, so they can slide for
  parallax without a visible edge.
- Pieces that attach to the hero (watch, tablet, laptop) are drawn both attached (in the pose) and alone, so they can
  be animated separately.
- Do not draw motion blur, speed lines or shadows; motion is added later.

STYLE: flat vector, clean edges, no outlines, no hard shadows, no gradients inside shapes (soft gradients only on
fields and glows). Orange palette only: #fff6f1 #fdeae2 #fbd9c8 #f6c3a8 #f08f5f #ea5a1e #c9481a #b16038 #7a3a1e plus ink
#312a23 and white. Nothing green, blue, red or purple. Crisp enough to cut out. If a board is too dense, keep every
piece legible by splitting only the sprite strips and the scenery onto a third board.
```

---

## 22. Patch after the 9 Oct decisions (apply to the board and the asset kit)

Changes: no "who you hire for" step; the role comes before the client; the last-but-one step is a **feature tour**
(six powers, nothing opens or connects); the dial now has **six segments**; the last step says Mind is already working.

### 22.1 Board patch (send in the chat that made image 36, with image 36 attached)

```
Redo the same board, same presentation and look as image 36, with these changes only.

NEW STEPS (9 steps plus the opening; branches S1, S2 unchanged):
0 "Tap the star"  1 "Your name"  2 "Your workspace"  3 "Your company"  4 "First role"  5 "Your client"  6 "Your voice"
7 "Your powers"  8 "You're set". The old "Who you hire for" and "Your toolkit" frames are removed.
Flow map captions and the tagline: "From your name to your first campaign, in eight quiet steps."

FRAME CHANGES (everything else as in image 36):
4 Mind: "Which role first?" Composer "A job title, or paste a job description link". No chips.
5 Mind: "Is this for a client? Add their website or LinkedIn." Composer "Website or LinkedIn link" and a chip "Not for a client".
6 Mind: "Send messages as you or as Acme?" Two chips "As Northstar Talent", "Keep the client private". Only shown after a
  client was given.
7 THE POWERS TOUR: a large dial at the centre with SIX segments around it, each with a small orange icon, lighting one by
  one; the hero beside it, small. Mind: "Here's what you've just unlocked." Under the dial, one line that changes per
  power, drawn for the first: "Agents that source, shortlist and watch for new people." Around the dial, six tiny
  labels: "AI agents", "Contact finder", "WhatsApp agents", "Specialised forms", "Analytics", "Memory". Quiet link
  "Skip tour". No chips, no composer.
8 Mind: "You're set." One line "Mind is already on your first campaign." The hero rising, all six segments lit. Pill
  "Open my workspace".
The watch: empty at 1 to 2, a thin progress ring that fills with each step from 3, and the six segments lighting only in
frame 7 and full in frame 8. The progress dots at the top-right become eight.
Keep spelling exact, orange palette only, no boxes, the chat smooth and calm as before.
```

### 22.2 Asset kit patch (add to the asset prompt in 21.6)

```
Change the dial and the powers: the dial now has SIX segments, with six power icons: power-mind (spark), power-reach
(puzzle piece), power-voice (speech bubble), power-forms (a form sheet with a tick), power-insight (a small rising
bar chart), power-memory (stack of discs), each in lit and dim states. Redraw dial-0 (six pale segments), dial-1 to
dial-6 (segments lit one by one), seg-1 to seg-6 (lit and dim), and add ring-progress-0 to ring-progress-4 (a thin
orange progress ring around the watch, empty to full). Remove prop-team, prop-clients and prop-chrome and
prop-whatsapp (nothing opens or connects); add prop-tour-frame: nothing. Keep everything else as already specified.
```

---

## 23. Every asset as its own file, in a zip

An image generator makes pictures, not folders, so this is a two-step recipe: (A) draw the assets on **strict grids**
(one piece per equal cell, on white), then (B) have ChatGPT's Python tool **slice each cell into its own transparent
PNG, named by the manifest, and zip them**. Uses the six-power dial from section 22.

### 23.1 Grids (so slicing is exact)

| Board | Size | Cells | Cell size | Contents (left to right, top to bottom) |
|---|---|---|---|---|
| A Hero | 3072 x 4608 | 3 x 3 | 1024 x 1536 | hero-idle, hero-tap, hero-watch / hero-think, hero-tablet, hero-tablet-blink / hero-laptop-sit, hero-door, hero-rise |
| B Star, dial, powers | 3072 x 3584 | 6 x 7 | 512 x 512 | r1 star, star-glow, ripple-1, ripple-2, ripple-3, watch-star / r2 dial-0 to dial-5 / r3 dial-6, ring-progress-0 to ring-progress-4 / r4 power-mind-lit, power-mind-dim, power-reach-lit, power-reach-dim, power-voice-lit, power-voice-dim / r5 power-forms-lit, power-forms-dim, power-insight-lit, power-insight-dim, power-memory-lit, power-memory-dim / r6 seg-1-lit, seg-1-dim, seg-2-lit, seg-2-dim, seg-3-lit, seg-3-dim / r7 seg-4-lit, seg-4-dim, seg-5-lit, seg-5-dim, seg-6-lit, seg-6-dim |
| C Props and effects | 3072 x 2048 | 6 x 4 | 512 x 512 | r1 prop-name, prop-workspace, prop-link, prop-client-building, prop-jd, prop-message / r2 prop-campaign, prop-door, prop-lamp, prop-plant, prop-envelope, prop-sofa / r3 spark-s, spark-m, spark-l, beam, trail, glow / r4 dots, leaf-s, leaf-m, leaf-l, sun, cloud |
| D Scenery | 3072 x 4096 | 2 x 4 | 1536 x 1024 | field-1, field-2 / field-3, field-4 / hill-far, hill-mid / hill-near, skyline |
| E Sprite frames | 3072 x 3584 | 6 x 7 | 512 x 512 | r1 sprite-star-pulse-1 to -6 / r2 sprite-typing-1 to -3, sprite-breathe-1 to -3 / r3 sprite-breathe-4, sprite-blink-1 to -3, sprite-twinkle-1, -2 / r4 sprite-twinkle-3, -4, sprite-trail-1 to -4 / r5 sprite-ripple-1 to -4 (rest empty) |

Count: 9 + 42 + 24 + 8 + 28 = about 110 files.

### 23.2 Prompt A: draw the boards (send in the chat that made image 36, with image 36 attached)

```
Image 36 is approved. Do NOT draw pages. Draw FIVE ASSET BOARDS (five images, no waiting between them), in the exact
style of image 36 (flat vector, soft pale-orange palette, the same hero woman with dark wavy hair, cream top,
orange-brown trousers #7a3a1e, white shoes, the same orange four-point star #ea5a1e).

STRICT GRID RULES for every board: plain solid white #ffffff background; the board is divided into EXACTLY equal cells
in the columns and rows given; ONE piece per cell, centred, with at least 12% empty white margin on every side so
nothing touches a cell edge; no grid lines, no borders, no labels, no text, no shadows. Empty cells stay plain white.
Pieces keep the same scale across boards (hero poses are full-body at the same height, feet on the same baseline).
Animation-ready: each moving piece is a separate shape drawn centred on its own pivot (the star on its centre, ripples
concentric, dial segments around one shared centre).

BOARD A HERO, 3072 x 4608, 3 columns x 3 rows (cells 1024 x 1536): row 1 hero-idle (plain, no watch, looking up-right),
hero-tap (right arm raised, one finger out), hero-watch (wrist raised, glancing at her watch); row 2 hero-think (hand
at chin), hero-tablet (holding a tablet), hero-tablet-blink (the same with eyes closed); row 3 hero-laptop-sit (seated
with a laptop), hero-door (one hand on an open door), hero-rise (rising in flight with orange sparks).

BOARD B STAR, DIAL, POWERS, 3072 x 3584, 6 x 7 (cells 512 x 512). Rows:
1 star (solid), star-glow (soft halo), ripple-1, ripple-2, ripple-3 (thin orange rings of growing size), watch-star
  (the star shrunk onto a wrist, close-up)
2 dial-0 (six pale segments around a centre), dial-1, dial-2, dial-3, dial-4, dial-5 (segments lit orange one by one)
3 dial-6 (all six lit), ring-progress-0, ring-progress-1, ring-progress-2, ring-progress-3, ring-progress-4 (a thin
  orange ring around a small watch face, from empty to full)
4 power-mind-lit (orange spark), power-mind-dim (pale), power-reach-lit (plug / puzzle piece), power-reach-dim,
  power-voice-lit (speech bubble), power-voice-dim
5 power-forms-lit (a form sheet with a tick), power-forms-dim, power-insight-lit (a small rising bar chart),
  power-insight-dim, power-memory-lit (stack of discs), power-memory-dim
6 seg-1-lit, seg-1-dim, seg-2-lit, seg-2-dim, seg-3-lit, seg-3-dim (the six dial segments, each one sixth of a ring)
7 seg-4-lit, seg-4-dim, seg-5-lit, seg-5-dim, seg-6-lit, seg-6-dim

BOARD C PROPS AND EFFECTS, 3072 x 2048, 6 x 4 (cells 512 x 512). Rows:
1 prop-name (nameplate), prop-workspace (small building), prop-link (link pin), prop-client-building, prop-jd
  (job-description sheet), prop-message (message lines)
2 prop-campaign (paper sheet rising), prop-door (open door with warm light), prop-lamp, prop-plant, prop-envelope,
  prop-sofa
3 spark-s, spark-m, spark-l (small four-point sparkles), beam (wedge of warm light), trail (flight trail of fading
  circles), glow (soft glow blob)
4 dots (loose confetti), leaf-s, leaf-m, leaf-l (plants), sun (pale circle), cloud

BOARD D SCENERY, 3072 x 4096, 2 columns x 4 rows (cells 1536 x 1024, 3:2): row 1 field-1, field-2 (soft pale-orange
background plates, lightest to deeper, filling the whole cell edge to edge); row 2 field-3, field-4 (deeper); row 3
hill-far, hill-mid (wide hill layers, only the hills, on white, edge to edge horizontally); row 4 hill-near, skyline
(plain candidate circles of different heights).

BOARD E SPRITE FRAMES, 3072 x 3584, 6 x 7 (cells 512 x 512), one frame per cell, row by row: sprite-star-pulse-1 to -6
(the star pulsing); sprite-typing-1 to -3 (three soft dots), sprite-breathe-1 to -4 (upper body of the hero with a
tablet breathing, shoulders 3 px apart), sprite-blink-1 to -3 (open, half, closed), sprite-twinkle-1 to -4 (a sparkle
twinkling), sprite-trail-1 to -4 (a flight trail fading), sprite-ripple-1 to -4 (a ring expanding and fading). Fill
cells in this order, leave the rest empty white.

STYLE: flat vector, clean edges, no outlines, no hard shadows, no gradients inside shapes (soft gradients only on
fields and glows). Orange palette only: #fff6f1 #fdeae2 #fbd9c8 #f6c3a8 #f08f5f #ea5a1e #c9481a #b16038 #7a3a1e plus ink
#312a23 and white. Nothing green, blue, red or purple. Crisp enough to cut out.
```

### 23.3 Prompt B: slice into individual files and zip (send after the boards, in the same chat)

```
Use Python (PIL and zipfile) on the five boards you just drew. Use the exact grids below. For each non-empty cell,
save ONE separate PNG named exactly as its filename plus ".png".

Boards, sizes, grids, cell sizes and the order of the filenames (left to right, top to bottom):
A hero 3072x4608, 3x3, cells 1024x1536: hero-idle, hero-tap, hero-watch, hero-think, hero-tablet, hero-tablet-blink,
  hero-laptop-sit, hero-door, hero-rise
B star-dial-powers 3072x3584, 6x7, cells 512x512: star, star-glow, ripple-1, ripple-2, ripple-3, watch-star, dial-0,
  dial-1, dial-2, dial-3, dial-4, dial-5, dial-6, ring-progress-0, ring-progress-1, ring-progress-2, ring-progress-3,
  ring-progress-4, power-mind-lit, power-mind-dim, power-reach-lit, power-reach-dim, power-voice-lit, power-voice-dim,
  power-forms-lit, power-forms-dim, power-insight-lit, power-insight-dim, power-memory-lit, power-memory-dim,
  seg-1-lit, seg-1-dim, seg-2-lit, seg-2-dim, seg-3-lit, seg-3-dim, seg-4-lit, seg-4-dim, seg-5-lit, seg-5-dim,
  seg-6-lit, seg-6-dim
C props-effects 3072x2048, 6x4, cells 512x512: prop-name, prop-workspace, prop-link, prop-client-building, prop-jd,
  prop-message, prop-campaign, prop-door, prop-lamp, prop-plant, prop-envelope, prop-sofa, spark-s, spark-m, spark-l,
  beam, trail, glow, dots, leaf-s, leaf-m, leaf-l, sun, cloud
D scenery 3072x4096, 2x4, cells 1536x1024: field-1, field-2, field-3, field-4, hill-far, hill-mid, hill-near, skyline
E sprite-frames 3072x3584, 6x7, cells 512x512: sprite-star-pulse-1..6, sprite-typing-1..3, sprite-breathe-1..4,
  sprite-blink-1..3, sprite-twinkle-1..4, sprite-trail-1..4, sprite-ripple-1..4 (in that order, 28 frames)

Processing for every cell:
1. Crop the cell. If the board image is not exactly the stated size, first resize it to the stated size.
2. Make the white background transparent by flood-filling from the cell edges with a small tolerance (keep white and pale
   shapes INSIDE the piece untouched). Do NOT do this for field-1 to field-4: keep them opaque.
3. Trim to the content with 16 px padding, EXCEPT dial, seg, ring-progress, ripple, star, star-glow and all sprite
   frames: keep the full cell size so their pivots stay centred.
4. Save as PNG with transparency into a folder per group: hero/, star-dial-powers/, props-effects/, scenery/, sprites/.

Then write manifest.json listing every file with: name, folder, board, column, row, final width and height. Put
everything into one zip called superhyre-signup-assets.zip and give me a download link. Also tell me any cell you could
not cut cleanly (touching an edge, overlapping a neighbour, empty) so I can have it redrawn.
```

If ChatGPT says it can't reach the images in Python, upload each board back into the chat as a file first, then send
Prompt B.

### 23.4 After the zip arrives

1. Unzip into `src/setup/art/`, run a check that every file in the manifest exists and is not empty.
2. Flag any piece that looks wrong (clipped, ragged edge, wrong colour) and send back only those names for redrawing.
3. I trace the simple pieces (star, dial, segments, icons, props) to SVG and wire the rest into the build.

---

## 24. Asset system prompt: describe the style so any other asset can be made later

Use after the sign-up assets are approved, with image 36 and a few of the finished pieces (hero poses, star, dial,
props, a field plate) attached. It asks for a written system, and a "style lock" block to paste in front of any future
asset prompt (empty states, errors, loading, success screens for the main console).

```
Study the attached images (the SuperHyre onboarding board and its asset pieces). Write the ASSET SYSTEM for this
illustration style, so any new asset can be made later and match exactly. Return it as a clear document with these
sections, concrete and specific (hex values, proportions, counts), no generalities:

1. STYLE IN ONE PARAGRAPH: what it is, the mood, what it is never.
2. SHAPE LANGUAGE: how things are built (soft rounded rectangles, circles, concave four-point star, leaf shapes), corner
   radii as a fraction of size, line weights if any, what is never used (outlines, hard shadows, gradients).
3. COLOUR: the exact palette with names and roles (field, hill layers, brand orange, deep brown, ink, white), how many
   orange shades appear on one asset, where solid orange #ea5a1e may be used and where it may not, tints for backgrounds,
   a contrast rule for text on art.
4. THE CHARACTER MODEL SHEET: the hero's proportions (head to body ratio), hair, face rules (simple features, expressions
   allowed), clothing colours, the watch, hands, pose set and what a new pose must keep. Say how to draw her in new
   situations (sitting, holding, pointing, celebrating, puzzled, waiting).
5. SECONDARY CHARACTERS: how other people are drawn (same style, different hair and clothes, same palette), and how
   candidates are shown (plain circles with initials).
6. OBJECT LIBRARY RULES: how props are drawn (size relative to the hero, tilt, shadow rule, the one-accent rule),
   with the list of the ones that exist, and how to design a new prop in the same way.
7. SCENE COMPOSITION: the layout of every scene (hero position, empty space about 65 to 70 percent, where the object
   sits, depth with three hill layers, plant placement, light direction), plus a template for an empty state, an error
   state, a loading state and a success state.
8. THE STAR AND THE DIAL: exact construction, states (rest, bright, lit, dim), the six powers and their icons and
   shades, and when each may appear.
9. MOTION PRINCIPLES (for animated versions): one easing, durations 120 to 900 ms, what moves, what stays still,
   idle loops, reduced-motion rule.
10. DO AND DON'T: ten of each, written as short rules with a reason.
11. FILE RULES: sizes, transparent PNG vs SVG, naming (kebab-case prefixes hero-, prop-, power-, field-, hill-,
    sprite-, empty-, error-, loading-, success-), margins, pivots.
12. A PROMPT FORMULA: the fill-in-the-blank sentence that produces a new asset in this style, and a "STYLE LOCK" block
    of 150 words to paste at the top of any future image prompt.

Then, using that system, list the assets the main console will need and give for each a one-line scene idea and a ready
prompt that begins with the STYLE LOCK: empty states (no campaigns yet, no candidates yet, empty pipeline, no matches,
no messages, no forms yet, no analytics yet, no search results, nothing shortlisted), error states (404, offline,
something went wrong, no permission), loading (reading a profile, searching, sending), success (shortlisted, message
sent, role created, set-up complete), and integrations (contact finder extension installed, WhatsApp connected).
Keep the console calm and professional: smaller scenes, more empty space, fewer props than the onboarding.
```

Notes for use:
1. The console's own rules (no status pills, no repeated visual patterns, human copy) still apply; empty states are
   illustrations only, with copy set in code.
2. The onboarding is the loud, story-led version of the style; the console uses the quiet version (smaller, fewer props).

---

## 25. Accurate assets: character lock + reference-edit workflow

Problem (images 37 and 38): the kit board (38) keeps the hero on-model, but the individually generated files (37) do
not: different face and hair, a boxy torso, narrow tapered legs instead of wide-leg trousers, tiny hands, the watch in
the wrong place. Each separate generation re-invents her. Fixes: (1) give an exact written **character lock**, (2) never
generate a new pose from scratch: **edit the approved reference** and change only the pose, (3) make the first piece
the master and check it before anything else, (4) generate in small batches and compare against the master.

Note: image 38 is only 1086 x 1448, so cutting hero pieces out of it would be too small to ship. Use it as the **reference**,
not the source.

### 25.1 The character lock (written from image 38)

```
CHARACTER LOCK: "Riya", the SuperHyre hero. Identical in every file.
- Proportions: about 6.5 heads tall, slim but not thin, shoulders about 1.6 head widths, a soft natural stance.
- Hair: long, dark brown almost black (#2b211c), thick and wavy, falling past the shoulders with volume on both sides, a
  soft centre-left parting, no fringe covering the eyes.
- Face: soft rounded oval, warm light-peach skin (#f6c3a8), two small dot eyes with a hint of lash, a tiny nose mark, a
  small gentle closed smile, small ears hidden by hair, a small gold-orange stud earring.
- Top: loose cream long-sleeve top (#fff3ea), slightly puffed sleeves gathered at the wrists, a round neckline, soft
  fabric folds as flat shapes, hem resting at the hip.
- Trousers: WIDE-LEG, high waist, terracotta brown (#a5532a) with darker fold shapes (#7a3a1e), falling straight to the
  ankle, never tapered.
- Shoes: clean white low sneakers with a pale peach sole.
- Hands: simple rounded hands with four fingers shapes merged, relaxed, always clearly drawn.
- Watch: a small orange watch with the white four-point star face on the LEFT wrist (viewer's right when she faces us),
  only when the pose list says so.
- Style: flat vector, no outlines, no hard shadows, shapes only, soft rounded edges, palette #fff6f1 #fdeae2 #fbd9c8
  #f6c3a8 #f08f5f #ea5a1e #c9481a #b16038 #7a3a1e, ink #312a23, white. Never photoreal, never anime, never 3D.
```

### 25.2 Workflow

1. **Master first.** Generate hero-idle only, with image 38 and image 36 attached as reference. Compare with image 38's
   hero-idle: hair, face, top, wide-leg trousers, shoes. Redo until it matches. Do not continue until it does.
2. **Each other pose is an edit of the master**, not a new image: attach the master as the reference and the instruction is
   "edit this exact character: same face, hair, clothes and proportions, change only the pose to ...".
3. **Batches of three**, each batch re-attaching the master; check each result against the master before the next batch.
4. Props, star, dial, scenery and effects are simple and need no master; give them the style lock and the palette only.
5. If a pose breaks the character, send "this is off model: [what is wrong]; redo it as an edit of the master".

### 25.3 Prompt for the master and the poses

```
You will make the hero assets for SuperHyre. Attached: image 36 (the approved board) and image 38 (the asset kit with
the hero poses). The hero in image 38 is the reference; match her exactly.

<paste the CHARACTER LOCK here>

STEP 1. Draw ONLY "hero-idle": the plain hero, no watch, standing straight, arms relaxed, looking up and to her right
as if at a star. Full body, centred, feet on a baseline, on a flat white background, 1024 x 1536, 12% empty margin, no
text, no shadow. Match image 38's hero-idle: same hair, face, cream top, wide-leg terracotta trousers, white sneakers.
Show me this one and wait for my "approved".

STEP 2 (after I approve). Make each of these as an EDIT of the approved hero-idle: keep the face, hair, top, trousers,
shoes, proportions and size exactly the same; change only the pose. Same canvas, baseline and scale, flat white
background, no text.
 - hero-tap: right arm raised forward at shoulder height, index finger extended, as if tapping a star.
 - hero-watch: left wrist raised to chest, glancing down at a small orange watch with a white four-point star face.
 - hero-think: one hand at her chin, head slightly tilted.
 - hero-tablet: both hands holding a tablet at chest height, looking at it, a small orange watch on the left wrist.
 - hero-tablet-blink: same as hero-tablet with her eyes closed, nothing else different.
 - hero-laptop-sit: seated on a low peach cushion with a laptop on her knees, trousers drape visible.
 - hero-door: standing three-quarter, one hand on the edge of an open door, warm light.
 - hero-rise: rising in flight, body leaning forward, one arm up, orange sparks trailing.
After every three, stop and wait for "next". Never redraw the face or hair differently between poses. If any pose does
not look like hero-idle, redo it before showing me.
```

### 25.4 The same rule for the sprite frames

For the sprite-breathe and sprite-blink frames, generate them as edits of the approved hero-tablet: same crop, only the
shoulders (breathe) or the eyes (blink) change by a few pixels. Send the four breathe frames in one request, so they are
drawn together and stay identical.

### 25.5 Check list for every returned hero asset

1. Same hair shape, parting and volume as the master?
2. Same face (small dot eyes, small smile)?
3. Wide-leg trousers, never tapered?
4. Cream top with puffed sleeves, same folds?
5. Same size, same baseline, same margin?
6. Watch only where the pose says so, on the correct wrist?
7. Background pure white and flat, no drop shadow?
Fail any one: send "off model: [which], redo as an edit of the master".

---

## 26. The one prompt: every asset, accurate, individual files, zip

Combines the character lock (25), exact geometry for every simple piece, a reference-edit workflow, a check after each
phase, and the final zip. Attach images 36 and 38 (the board and the kit) as references.

```
You are producing the complete asset set for the SuperHyre sign-up flow, as INDIVIDUAL transparent PNG files, then one
zip. Attached references: image 36 (the approved onboarding board) and image 38 (the asset kit). They define the look;
match them exactly. Work in the phases below, in order. After each phase STOP, show me the pieces, and wait for
"approved" or my fixes. Never move on with an off-model piece.

GLOBAL RULES (every file)
- Flat vector, clean soft-rounded edges, no outlines, no hard or ground shadows, no text, no gradients inside shapes
  (soft gradients only for glows and field plates). Never photoreal, anime or 3D.
- Palette ONLY: #fff6f1 #fdeae2 #f8d9c9 #fbd9c8 #f6c3a8 #f08f5f #ea5a1e #c9481a #b16038 #7a3a1e, ink #312a23, white.
  Nothing green, blue, red or purple.
- Transparent PNG, the piece centred, 12% clear margin, no stray pixels. Sizes: hero 1024 x 1536; scenery 3072 x 1536;
  everything else 1024 x 1024; sprite frames 512 x 512. Names exactly as given, kebab-case, lowercase.
- Every piece that moves is drawn alone, centred on its own pivot.
- Consistency: reuse the same shapes, shades and proportions across pieces. If a later piece disagrees with an
  approved earlier one, redraw the later one.

CHARACTER LOCK ("Riya", identical in every hero file)
About 6.5 heads tall, slim, shoulders 1.6 head widths. Long dark brown almost black wavy hair (#2b211c), thick, past the
shoulders, volume on both sides, soft centre-left parting, nothing covering her eyes. Soft rounded oval face, warm
light-peach skin #f6c3a8, two small dot eyes with a hint of lash, a tiny nose mark, a small gentle closed smile, a
small gold-orange stud earring. Loose cream long-sleeve top #fff3ea with slightly puffed sleeves gathered at the wrists,
round neckline, flat soft folds. WIDE-LEG high-waist trousers, terracotta #a5532a with darker folds #7a3a1e, falling
straight to the ankle, never tapered. Clean white low sneakers with a pale peach sole. Simple rounded relaxed hands,
always clearly drawn. When a pose shows the watch: a small orange (#ea5a1e) watch with a white four-point star face on the
LEFT wrist (viewer's right when she faces us), strap #b16038; otherwise no watch.

PHASE 1 · HERO MASTER. Draw only hero-idle: plain hero, no watch, standing straight, arms relaxed, looking up and to her
right as if at a star, full body, feet on a baseline. Match image 38's hero-idle. Show it, wait for "approved".

PHASE 2 · HERO POSES, each as an EDIT of the approved hero-idle (same face, hair, clothes, proportions, size, canvas and
baseline; change only the pose). In batches of three, stop after each batch.
 hero-tap: right arm raised forward at shoulder height, index finger out, as if tapping a star.
 hero-watch: left wrist raised to chest, glancing down at the watch.
 hero-think: one hand at her chin, head slightly tilted.
 hero-tablet: both hands holding a tablet at chest height, looking at it, watch on the left wrist.
 hero-tablet-blink: identical to hero-tablet with eyes closed, nothing else changed.
 hero-laptop-sit: seated on a low peach cushion, laptop on her knees.
 hero-door: three-quarter stance, one hand on the edge of an open door, warm light.
 hero-rise: rising in flight leaning forward, one arm up, orange sparks trailing.

PHASE 3 · STAR, WATCH, DIAL (exact geometry, 1024 square, centred)
 star: four-point star, points straight up, down, left, right; the sides curve inward (concave); the waist radius is 22%
  of the tip radius; tip radius 38% of the canvas; solid #ea5a1e; smooth, no outline.
 star-glow: the same star with a soft round halo of #f08f5f at 40% opacity, radius 2.2 times the tip radius, fading to
  nothing.
 ripple-1, ripple-2, ripple-3: thin concentric rings, stroke 2% of canvas, #ea5a1e at 60%, 40%, 25% opacity, diameters
  40%, 70%, 100% of the canvas.
 watch-star: a close-up of a cream sleeve cuff and wrist (hero's left) wearing the orange watch: rounded-square case
  #ea5a1e, white star face, strap #b16038.
 dial-0 to dial-6: a ring of SIX equal segments, each 60 degrees with 6 degree gaps, starting at the top and going
  clockwise, outer diameter 80% of the canvas, inner hole 52% of the outer diameter; the first n segments (n = 0 to 6)
  are lit #ea5a1e, the rest dim #f8d9c9.
 ring-progress-0 to ring-progress-4: a small round watch face (disc #fff6f1) with a thin ring around it, ring stroke 8%
  of the diameter, track #f8d9c9, filled #ea5a1e from the top, clockwise, 0%, 25%, 50%, 75%, 100%.

PHASE 4 · POWERS. Each power is a simple glyph centred on a round disc (#fdeae2, diameter 70% of the canvas). Lit: the
glyph in its colour with a faint halo. Dim: the glyph in #f6c3a8.
 power-mind (spark / four-point star, #ea5a1e), power-reach (puzzle piece, #b16038), power-voice (speech bubble with a
 tail, #f08f5f), power-forms (a form sheet with a tick, #c9481a), power-insight (three rising bars, #f6a67e),
 power-memory (stack of three discs, #7a3a1e). Files: power-<name>-lit and power-<name>-dim.
 seg-1 to seg-6: the six dial segments, each one sixth of the dial ring in the exact geometry above, in the colour of
 its power in order (mind, reach, voice, forms, insight, memory), files seg-<n>-lit and seg-<n>-dim (dim = 25% tint).

PHASE 5 · PROPS (each about 55% of the canvas, one accent of #ea5a1e, tilted at most 6 degrees, no ground shadow)
 prop-name (a rounded nameplate with a dot avatar and two lines), prop-workspace (a small building with a grid of
 windows), prop-link (a chain-link pin), prop-client-building (a taller building, different windows), prop-jd (a
 job-description sheet with a heading bar and lines), prop-message (two message-line bars), prop-campaign (a paper sheet
 rising with a tiny star), prop-door (an open door in #b16038 with a wedge of warm light), prop-lamp (round-shade lamp),
 prop-plant (leafy plant in a peach pot), prop-envelope (an envelope with an orange tick seal), prop-sofa (a rounded
 peach sofa).

PHASE 6 · SCENERY (3072 x 1536)
 field-1 to field-4: opaque soft plates, #fff1e8 to #fbd9c8 to deeper, field-1 lightest, field-4 deepest, edge to edge.
 hill-far, hill-mid, hill-near: layered rolling hills only, transparent above them, left and right edges meet so they
  tile seamlessly; far lightest, near deepest (#f6c3a8 to #f08f5f).
 skyline: plain circles of different heights like a skyline, transparent, 8 to 12 circles, tints of orange.
 leaf-s, leaf-m, leaf-l (leafy plants, 1024 square), sun (a pale #fbd9c8 circle with a faint halo), cloud (a soft flat
  cloud #fdeae2).

PHASE 7 · EFFECTS (1024 square, transparent)
 spark-s, spark-m, spark-l (a small four-point sparkle at 20%, 35%, 50% of the canvas, #ea5a1e), beam (a soft wedge of
 warm light #f6c3a8 fading out), glow (soft glow blob #f08f5f at 35%), dots (eight loose confetti circles in orange
 tints), trail (a flight trail of 8 fading circles along a curve).

PHASE 8 · SPRITE FRAMES (512 square, transparent, the pivot at the centre, only the stated thing changes between frames)
 sprite-star-pulse-1 to -6 (the star scaling 100, 104, 108, 112, 106, 100 percent with the halo breathing),
 sprite-typing-1 to -3 (three dots, one lit at a time), sprite-breathe-1 to -4 (upper body of hero-tablet, shoulders and
 chest rising 0, 2, 3, 1 px), sprite-blink-1 to -3 (hero-tablet face: open, half, closed), sprite-twinkle-1 to -4 (a
 sparkle growing and shrinking), sprite-trail-1 to -4 (the trail fading), sprite-ripple-1 to -4 (a ring expanding and
 fading). Do the four breathe frames in one request so they match.

FINISH
Put every file in a zip named superhyre-signup-assets.zip with folders hero/, star-dial/, powers/, props/, scenery/,
effects/, sprites/, plus manifest.json (name, folder, width, height, one-line description). List any file you could not
make or are unsure about.
```

### 26.1 My check on what comes back (send me the zip)

1. File list against the manifest: names, sizes, transparency, margin.
2. The hero files against the master (the seven points in 25.5).
3. The dial geometry: six segments, 60 degrees, clockwise from the top.
4. Palette: every pixel colour within the allowed list.
5. A contact sheet of everything so we can look at consistency in one glance.

### 26.2 From the sheet: copy image 38 exactly (add this block to the top of the 26 prompt)

```
SOURCE OF TRUTH: image 38 (the asset kit sheet). Do not invent new designs for anything that appears on it. For each
piece that exists on the sheet, REPRODUCE THAT PIECE EXACTLY at full resolution as its own file: same shapes, same
colours, same proportions, same pose, same facial features, same tilt, only cleaner and larger on a transparent
background. Treat the sheet like a design file you are exporting from, not inspiration.

EXISTS ON THE SHEET, copy exactly: hero-idle, hero-tap, hero-watch, hero-think, hero-tablet, hero-tablet-blink,
hero-laptop-sit, hero-door, hero-rise; star, star-glow, ripple-1, ripple-2, ripple-3, watch-star; power-mind,
power-reach, power-voice (lit and dim); prop-name, prop-workspace, prop-link, prop-client-building, prop-jd,
prop-message, prop-campaign, prop-door, prop-lamp, prop-plant, prop-envelope, prop-sofa; field-1 to field-4, hill-far,
hill-mid, hill-near, leaf-s, leaf-m, leaf-l, sun, cloud, skyline; spark-s, spark-m, spark-l, beam, trail, glow, dots;
the sprite strips (split into frames): star pulse, typing, breathe, blink; the sparkle-twinkle, ripple-expand and
flight-trail frames.

NEW, NOT ON THE SHEET, design to match the sheet's style and the exact geometry given below: power-forms,
power-insight, power-memory (redraw in the six-power set, keep the sheet's discs idea), dial-0 to dial-6 and seg-1 to
seg-6 (the sheet's dial has FOUR segments; the new one has SIX of 60 degrees), ring-progress-0 to ring-progress-4.

NOT NEEDED, skip: prop-clients, prop-team, prop-chrome, prop-whatsapp.

If a piece on the sheet is low resolution, redraw it at 1024 px keeping every detail the same, and tell me which pieces
you had to redraw. Never change the hero's face, hair, clothes or proportions from the sheet.
```

Resolution warning: image 38 is small (1086 x 1448), so "exactly" means re-export and redraw. If your tool can upload the
original full-size kit file, attach that instead; it is the best source.

---

## 27. Generate fresh, never crop (supersedes 26.2)

Image 39 shows what cropping did: jagged stair-stepped edges, a fragment of the neighbouring piece beside the hero, a low
resolution. Cause: the tool cut pieces out of the 1086 px kit sheet and removed the background by colour. Fix: **every
file is its own new image generation**; the sheet is only a visual reference; **no cropping, slicing, tracing, resizing
or Python image operations of any kind**. Backgrounds are left **pure flat white** (not cut out by the tool): a clean
cut-out is done afterwards on the full-resolution originals, so edges stay smooth.

```
IMPORTANT, READ FIRST. Generate every asset below as a NEW IMAGE, one generation per file. Do NOT crop, slice, cut out,
trace, upscale, resize or edit any part of an existing image, and do not use code to process pictures. The attached
images (36 board, 38 kit sheet) are STYLE REFERENCES ONLY: look at them, then draw the asset fresh, at full
resolution, matching the design. If you find yourself cutting from a sheet, stop and generate again.

OUTPUT PER FILE: one PNG, the piece alone, centred, on a PURE FLAT WHITE #ffffff background with nothing else in the
frame (no neighbour pieces, no grid, no shadow, no text, no border), 12% clear margin on every side, edges crisp and
smooth (no jagged or stair-stepped pixels). Size: heroes 2048 x 3072; scenery 4096 x 2048; everything else 2048 x
2048; sprite frames 1024 x 1024. If you cannot reach these sizes, use the largest you can and say so. Names exactly as
given.

STYLE (every file): flat vector illustration, soft-rounded clean edges, no outlines, no hard or ground shadows, no
gradients inside shapes (soft gradients only for glows and field plates), never photoreal, anime or 3D. Palette ONLY:
#fff6f1 #fdeae2 #f8d9c9 #fbd9c8 #f6c3a8 #f08f5f #ea5a1e #c9481a #b16038 #7a3a1e, ink #312a23, white. Nothing green,
blue, red or purple.

CHARACTER LOCK ("Riya", identical in every hero file; match image 38's hero): about 6.5 heads tall, slim, shoulders 1.6
head widths. Long dark brown almost black wavy hair (#2b211c) past the shoulders with volume on both sides, a soft
centre-left parting, nothing over her eyes. Soft rounded oval face, warm light-peach skin #f6c3a8, two small dot
eyes with a hint of lash, a tiny nose mark, a small gentle closed smile, a small gold-orange stud earring. Loose cream
long-sleeve top #fff3ea with slightly puffed sleeves gathered at the wrists. WIDE-LEG high-waist terracotta
trousers #a5532a with darker folds #7a3a1e, straight to the ankle, never tapered. White low sneakers with a pale
peach sole. Relaxed, clearly drawn rounded hands. Watch only when the pose says so: a small orange (#ea5a1e) watch with
a white four-point star face on the LEFT wrist (viewer's right), strap #b16038.

ORDER AND CHECKPOINTS
1. FIRST generate only hero-idle (plain, no watch, standing straight, arms relaxed, looking up and to her right).
   Show it and wait for "approved". All later hero files must look like the same woman.
2. Then generate the heroes one at a time, each as a NEW image of the same woman with the approved hero-idle attached as
   the character reference (same face, hair, clothes, proportions, scale; only the pose differs). In groups of three,
   stop after each group:
   hero-tap (right arm raised forward at shoulder height, index finger out, as if tapping a star), hero-watch (left wrist
   raised to chest, glancing at the watch), hero-think (hand at chin, head slightly tilted), hero-tablet (both hands holding
   a tablet at chest height, watch on the left wrist), hero-tablet-blink (identical to hero-tablet, eyes closed),
   hero-laptop-sit (seated on a low peach cushion, laptop on her knees), hero-door (three-quarter stance, one hand on the
   edge of an open door, warm light), hero-rise (flying, leaning forward, one arm up, orange sparks trailing).
3. Then, in groups of about six per message, with a pause after each group:
   star: four-point star, points up, down, left, right, concave curved sides, waist radius 22% of the tip radius, tip
   radius 38% of the canvas, solid #ea5a1e. star-glow: the same star with a soft round halo #f08f5f at 40% opacity.
   ripple-1, ripple-2, ripple-3: thin concentric rings, stroke 2% of the canvas, #ea5a1e at 60, 40, 25% opacity,
   diameters 40, 70, 100% of the canvas. watch-star: close-up of a cream sleeve cuff and the left wrist wearing the
   orange watch (rounded-square case #ea5a1e, white star face, strap #b16038).
   dial-0 to dial-6: a ring of SIX equal 60-degree segments with 6-degree gaps, starting at the top going clockwise,
   outer diameter 80% of the canvas, hole 52% of the outer diameter; the first n are #ea5a1e, the rest #f8d9c9.
   ring-progress-0 to ring-progress-4: a small round watch face #fff6f1 with a thin ring (stroke 8% of the diameter,
   track #f8d9c9, fill #ea5a1e clockwise from the top) at 0, 25, 50, 75, 100%.
   power-mind (spark, #ea5a1e), power-reach (puzzle piece, #b16038), power-voice (speech bubble, #f08f5f), power-forms
   (a form sheet with a tick, #c9481a), power-insight (three rising bars, #f6a67e), power-memory (stack of three discs,
   #7a3a1e): each glyph on a round disc #fdeae2 (70% of the canvas), files power-<name>-lit (glyph in colour with a faint
   halo) and power-<name>-dim (glyph #f6c3a8).
   seg-1 to seg-6: one sixth of the dial ring each in the same geometry, in the colour of its power in order (mind,
   reach, voice, forms, insight, memory), files seg-<n>-lit and seg-<n>-dim (dim is a 25% tint).
   prop-name (nameplate with a dot avatar and two lines), prop-workspace (small building with a window grid), prop-link
   (chain-link pin), prop-client-building (taller building), prop-jd (job-description sheet), prop-message (two
   message bars), prop-campaign (paper sheet rising with a tiny star), prop-door (open door #b16038 with a wedge of
   warm light), prop-lamp, prop-plant (leafy plant in a peach pot), prop-envelope (with an orange tick seal), prop-sofa
   (rounded peach sofa): each about 55% of the canvas, one orange accent, tilt at most 6 degrees.
   field-1 to field-4 (opaque soft plates, #fff1e8 to #fbd9c8 to deeper, lightest to deepest, edge to edge),
   hill-far, hill-mid, hill-near (rolling hills only on white, left and right edges meet so they tile seamlessly; far
   lightest, near deepest, #f6c3a8 to #f08f5f), skyline (8 to 12 plain circles of different heights, orange tints), leaf-s,
   leaf-m, leaf-l (leafy plants), sun (pale #fbd9c8 circle with a faint halo), cloud (soft flat #fdeae2).
   spark-s, spark-m, spark-l (four-point sparkle at 20, 35, 50% of the canvas, #ea5a1e), beam (soft wedge of light
   #f6c3a8 fading out), glow (soft blob #f08f5f at 35%), dots (eight loose confetti circles), trail (8 fading circles
   along a curve).
   sprite-star-pulse-1 to -6 (star scaling 100, 104, 108, 112, 106, 100%), sprite-typing-1 to -3 (three dots, one lit at a
   time), sprite-breathe-1 to -4 (upper body of hero-tablet, chest rising 0, 2, 3, 1 px; generate all four in one request
   so they match), sprite-blink-1 to -3 (open, half, closed), sprite-twinkle-1 to -4, sprite-trail-1 to -4,
   sprite-ripple-1 to -4.
4. Skip: prop-clients, prop-team, prop-chrome, prop-whatsapp.

QUALITY CHECK before showing each piece: edges clean, no fragments of other pieces, same woman, wide-leg trousers,
palette only, centred with margin. If any fails, regenerate silently.

FINISH: give me every file in one zip (superhyre-signup-assets.zip, folders hero/, star-dial/, powers/, props/,
scenery/, effects/, sprites/) with manifest.json (name, folder, width, height). List any file you could not make at the
stated size.
```

After the zip arrives I remove the white background from each full-resolution original with a proper cut-out (soft
alpha matting, not colour keying), then trace the simple pieces to SVG.

---

## 28. Final production run (all assets approved)

No checkpoints and no redesign. The approved pieces are the reference; the run regenerates each one as a final,
full-resolution file, fresh (never cropped), and delivers the zip. Attach all approved pieces (or their contact sheet)
plus images 36 and 38.

```
All the SuperHyre sign-up assets are APPROVED. Produce the FINAL production files now. The attached approved pieces
(and images 36 and 38) are the reference: every final file must be the same design as its approved version, same
shapes, colours, proportions, pose, face, hair and clothes, only at final quality. Do not redesign, restyle, reinterpret
or "improve" anything. Do not ask me to approve each piece; work through the whole list without stopping and give me
the zip at the end.

HOW: generate each file as a NEW image, one generation per file, at full resolution, using its approved version as the
reference. Never crop, slice, trace, upscale, resize or edit pixels of an existing image, and use no image-processing
code. If a generation drifts from the approved version (a different face, tapered trousers, a missing detail, a
changed colour), regenerate it silently until it matches.

FILE RULES (every file): PNG, the piece alone and centred on a PURE FLAT WHITE #ffffff background, nothing else in the
frame (no neighbouring pieces, no shadow, no text, no border), 12% clear margin on every side, smooth crisp edges with
no jagged pixels. Sizes: heroes 2048 x 3072; scenery (field-, hill-, skyline) 4096 x 2048; sprite frames 1024 x 1024;
everything else 2048 x 2048. Pieces of one family are the same scale and the same position in the frame so they swap
cleanly (dial-0 to dial-6, ring-progress-0 to -4, power-*-lit and -dim, seg-*-lit and -dim, every sprite set, hero
poses with feet on the same baseline). Palette only: #fff6f1 #fdeae2 #f8d9c9 #fbd9c8 #f6c3a8 #f08f5f #ea5a1e #c9481a
#b16038 #7a3a1e, ink #312a23, white.

THE LIST (names exactly, kebab-case):
hero/: hero-idle, hero-tap, hero-watch, hero-think, hero-tablet, hero-tablet-blink, hero-laptop-sit, hero-door,
  hero-rise
star-dial/: star, star-glow, ripple-1, ripple-2, ripple-3, watch-star, dial-0, dial-1, dial-2, dial-3, dial-4,
  dial-5, dial-6, ring-progress-0, ring-progress-1, ring-progress-2, ring-progress-3, ring-progress-4
powers/: power-mind-lit, power-mind-dim, power-reach-lit, power-reach-dim, power-voice-lit, power-voice-dim,
  power-forms-lit, power-forms-dim, power-insight-lit, power-insight-dim, power-memory-lit, power-memory-dim,
  seg-1-lit, seg-1-dim, seg-2-lit, seg-2-dim, seg-3-lit, seg-3-dim, seg-4-lit, seg-4-dim, seg-5-lit, seg-5-dim,
  seg-6-lit, seg-6-dim
props/: prop-name, prop-workspace, prop-link, prop-client-building, prop-jd, prop-message, prop-campaign, prop-door,
  prop-lamp, prop-plant, prop-envelope, prop-sofa, leaf-s, leaf-m, leaf-l, sun, cloud
scenery/: field-1, field-2, field-3, field-4, hill-far, hill-mid, hill-near, skyline (hills tile seamlessly at the
  left and right edges)
effects/: spark-s, spark-m, spark-l, beam, glow, dots, trail
sprites/: sprite-star-pulse-1 to -6, sprite-typing-1 to -3, sprite-breathe-1 to -4 (make these four in one request so
  they match), sprite-blink-1 to -3, sprite-twinkle-1 to -4, sprite-trail-1 to -4, sprite-ripple-1 to -4

DELIVER: one zip, superhyre-signup-assets-final.zip, with those folders, a manifest.json (name, folder, width, height,
source: "generated"), and contact-sheet.png (a small overview of every file so I can check them at a glance). At the end
list any file you could not make at the stated size, and any you had to regenerate more than twice.
```

### 28.1 What I do when the zip arrives

1. Verify the manifest against the list: names, sizes, margins, count.
2. Cut out each white background on the originals (soft alpha, no colour keying) and trim to a consistent pivot.
3. Trace the flat shapes (star, dial, segments, icons, props) to SVG; keep the hero and scenery as WebP/PNG.
4. Copy into `src/setup/art/` with a typed `art.ts`, then build the flow from signup-flow.md.
