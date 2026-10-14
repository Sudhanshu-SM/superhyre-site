import "./statusTones.css";

/**
 * The colour of a status word, in one place. Text colour only: never a dot, a pill or a background, and the word
 * is always there, so colour is never the only thing that says it. The values are CSS variables with their own
 * numbers for the light and dark themes (statusTones.css), each measured at 4.5:1 or better on the surfaces a
 * status lands on (the test reads that file and checks).
 *
 *   Not contacted, Found, Saved        muted neutral
 *   Shortlisted                        ink
 *   In outreach, Contacted             amber
 *   Replied                            green
 *   Interviewing, Offer out            blue
 *   Hired                              brand orange, heavier
 *   Passed, Not interested, Do not contact   muted red-brown
 *   anything else                      ink
 */

export type StatusTone = "muted" | "ink" | "outreach" | "replied" | "interviewing" | "hired" | "passed";

/** Every status word the console shows for a person or a stage, and its tone. */
export const STATUS_TONE: Readonly<Record<string, StatusTone>> = {
  "Not contacted": "muted",
  Found: "muted",
  Saved: "muted",
  Shortlisted: "ink",
  "In outreach": "outreach",
  Contacted: "outreach",
  Replied: "replied",
  Interviewing: "interviewing",
  "Offer out": "interviewing",
  Hired: "hired",
  Passed: "passed",
  "Not interested": "passed",
  "Do not contact": "passed",
};

export const STATUS_TONES: readonly StatusTone[] = ["muted", "ink", "outreach", "replied", "interviewing", "hired", "passed"];

/** The tone of a status word as it is written; a word this build does not know is ink. */
export const toneOfLabel = (label: string | null | undefined): StatusTone => (label ? STATUS_TONE[label.trim()] : undefined) ?? "ink";

/** The same two attributes for a tone already known (a call's outcome, say). */
export const toneProps = (tone: StatusTone): { className: "st"; "data-st": StatusTone } => ({ className: "st", "data-st": tone });

/** The two attributes that give an element its status colour: `<span {...statusProps("Replied")}>Replied</span>`. */
export const statusProps = (label: string | null | undefined): { className: "st"; "data-st": StatusTone } => ({
  className: "st",
  "data-st": toneOfLabel(label),
});
