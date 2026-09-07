import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import type { Transition, Variants } from "motion/react";

/**
 * The left panel: brand row, one big word, the tool strip, the product
 * illustration, and the quote carousel.
 *
 * ── WHAT WAS REMOVED, AND THE JUDGEMENT BEHIND IT ───────────────────────────
 * This replaces a scattered word collage with four background shapes, three
 * backdrop blobs, a blurred watermark and a hand-drawn hook arrow.
 *
 * All of it goes, because the panel now leads with an illustration of the
 * actual product. Once a real screen is on the panel, abstract geometry is not
 * supporting the message — it is competing with it. Six decorative layers
 * behind a product shot is the definition of a busy composition, and the honest
 * professional call is that the illustration alone says more about SuperHyre
 * than any arrangement of crosses and chevrons did.
 *
 * The seven tool words survive, but demoted from a poster-scale scatter to a
 * single line under the headline. They earn their place as one quiet line
 * naming the stack this replaces; they did not earn a third of the panel.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** The brand mark, from SuperHyre/superhyre_logo.svg. currentColor rather than
 *  the file's baked #F97316, so the single .bp-mark rule owns the hue; the
 *  stroke is the source's own, which the glyph needs for weight at this size.
 *
 *  No className prop: it took one and then ignored it, so a caller could pass
 *  a class and watch it vanish. There is one call site and it wants .bp-mark. */
function Mark() {
  return (
    <svg className="bp-mark" viewBox="0 0 34 35" fill="none" aria-hidden="true" focusable="false">
      <path d="M16.047 0.496124C16.0223 2.74925 16.6685 4.85749 17.9504 6.64333C19.9314 9.36012 22.9612 10.9359 26.1146 11.8233C28.2333 12.4029 30.3556 12.6674 32.605 12.6855V15.9384C30.3697 15.942 28.2969 16.4962 26.3159 17.4562C20.4611 20.3831 15.9694 26.7367 15.9129 33.4961L12.989 33.0868L12.0426 28.5008C11.3117 25.9579 10.3653 23.9656 7.78397 23.1252C6.90469 22.8427 6.03954 22.7014 5.11789 22.5963L1.34654 22.4551L0.60498 19.0464C2.40944 18.8218 4.13268 18.4378 5.79942 17.7315C12.8336 14.714 13.2221 7.87494 13.2362 0.829384L15.9023 0.496124" fill="currentColor" stroke="currentColor" stroke-miterlimit="10" />
    </svg>
  );
}

/**
 * What one SuperHyre login covers.
 *
 * These words were here before with a different job: they named the scattered
 * stack a recruiter juggles, set at poster scale in a heavy display face as
 * the panel's main visual. That reading died with the illustration — the art
 * now shows the product, so a huge list of tool names beside it argued with
 * the picture instead of supporting it.
 *
 * Re-cast as a capability line: small, set in the site's own UI face, sitting
 * under the headline as scope rather than as chaos. Same words, opposite
 * rhetorical purpose, so the typography is opposite too — quiet where it used
 * to shout.
 *
 * `tone` walks three steps down the accent so the line has rhythm without any
 * label dropping below AA. Verified against the real pixels behind it (the art
 * shows through the scrim here): 4.77, 5.24, 7.16.
 */
const COVERS: readonly { text: string; tone: 1 | 2 | 3 }[] = [
  { text: "Outreach", tone: 1 },
  { text: "ATS", tone: 2 },
  { text: "CRM", tone: 3 },
  { text: "Sourcing", tone: 1 },
  { text: "Screening", tone: 2 },
];

const QUOTES: readonly { text: string; who: string; org: string }[] = [
  {
    text:
      "The dynamic range between what an average person could accomplish and what the best person could accomplish was 50 or 100 to 1. Given that, you're well advised to go after the cream of the cream.",
    who: "Steve Jobs",
    org: "Apple",
  },
  {
    text:
      "The most important thing you can do in the early stages of a startup is hire great people.",
    who: "Paul Graham",
    org: "Y Combinator",
  },
];

/** Emil's stronger ease-out. Built-in curves are too weak to read as
 *  intentional, and ease-in is never right for an entrance. */
const ENTER: Transition = { duration: 0.46, ease: [0.23, 1, 0.32, 1] };

const group: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.06 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: ENTER },
};

const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22 } },
};

const ROTATE_MS = 9000;

export function BrandPanel() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  /** Rotation stops while the card is hovered or focused. Pulling a quote away
   *  from someone mid-sentence is worse than never rotating. */
  const [held, setHeld] = useState(false);

  useEffect(() => {
    // No timer under reduced motion: an unannounced content swap is motion in
    // the sense that matters, transition or not.
    if (reduced || held) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % QUOTES.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, [reduced, held]);

  const step = reduced ? fade : rise;
  const quote = QUOTES[index] ?? QUOTES[0];
  const onHold = useCallback(() => setHeld(true), []);
  const onRelease = useCallback(() => setHeld(false), []);

  if (!quote) return null;

  return (
    <motion.div className="bp" variants={group} initial="hidden" animate="visible">
      {/* Brand row: mark and wordmark left, the tagline set on the same
          baseline at the right. It read as a stacked eyebrow above the headline
          before, which spent a line of vertical space on four words. */}
      <motion.div className="bp-top" variants={step}>
        <a className="bp-logo" href="/">
          <Mark />
          <span className="bp-word">superhyre</span>
        </a>
        <span className="bp-tagline">Recruitment, Rebuilt.</span>
      </motion.div>

      {/* One word. The argument for it lives on the marketing site; this is a
          statement, not a pitch. The period is the site's own voice. */}
      <motion.h2 className="bp-huge" variants={step}>
        hired<span className="bp-huge-dot">.</span>
      </motion.h2>

      {/* One login covers all of these. Reads as scope under the headline, not
          as the poster-scale problem statement it used to be. */}
      <motion.p className="bp-covers" variants={step}>
        {COVERS.map((item, i) => (
          <span key={item.text}>
            <span className={`bp-cover bp-cover-${item.tone}`}>{item.text}</span>
            {i < COVERS.length - 1 && (
              <span className="bp-cover-sep" aria-hidden="true">·</span>
            )}
          </span>
        ))}
      </motion.p>

      {/* The illustration is no longer an element here. It is the panel's
          BACKGROUND — see .rail in access.css, which layers a peach scrim over
          it so this copy stays legible across it.

          It was a boxed slot between the strip and the quote card, which made
          a 1024x1536 illustration into a ~500x300 letterbox: the tablet ended
          up smaller than the wordmark above it, and the box's own rounded
          border read as a third card on a panel that already had two.

          Nothing replaces it in the DOM, because a decorative background needs
          no node — and one fewer flex child is one fewer thing competing for
          the panel's height budget. */}

      {/* Spacer: claims the height the background art occupies, so the quote
          card is pushed to the bottom and the middle of the panel stays clear
          for the illustration rather than collapsing onto it. */}
      <div className="bp-art-space" aria-hidden="true" />

      <motion.figure
        className="bp-quote"
        variants={step}
        /* `layout` (not "position") so SIZE animates: the two quotes are four
           lines and two, and the card has to ease between those heights rather
           than snap or reserve a floor for the taller one. */
        layout={reduced ? false : true}
        transition={{ duration: 0.42, ease: [0.23, 1, 0.32, 1] }}
        onMouseEnter={onHold}
        onMouseLeave={onRelease}
        onFocus={onHold}
        onBlur={onRelease}
      >
        {/* ONE keyed block for the quote AND its attribution.

            They were two separate AnimatePresence trees, and worse, on two
            different modes: the quote on "popLayout" and the caption on
            "wait". "wait" holds the outgoing element until its exit finishes,
            so for the length of that exit the new quote was on screen above the
            OLD person's name — Paul Graham's line credited to Steve Jobs.

            Misattributing a real quotation to a real person is not a polish
            issue, so the two can no longer be separate: one key, one presence,
            one transition. They swap atomically or not at all. */}
        <div className="bp-quote-slot">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={index}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(2px)" }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(2px)" }}
              transition={
                reduced ? { duration: 0.18 } : { duration: 0.52, ease: [0.23, 1, 0.32, 1] }
              }
            >
              <blockquote className="bp-quote-text" aria-live="polite">
                {quote.text}
              </blockquote>
              <figcaption>
                <span className="bp-who">{quote.who}</span>
                <span className="bp-org">{quote.org}</span>
              </figcaption>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="bp-dots" role="tablist" aria-label="Quotes">
          {QUOTES.map((q, i) => (
            <button
              key={q.who}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Quote from ${q.who}`}
              className={i === index ? "bp-dot bp-dot-on" : "bp-dot"}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </motion.figure>
    </motion.div>
  );
}
