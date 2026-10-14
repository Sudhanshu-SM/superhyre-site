import { Check } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import { art } from "./art";
import type { Draft } from "./Stage";
import { type Answers, type Beat, checkJd, organisationOf, roleText } from "./steps";

/**
 * Her pad. Everything Mind is told is written on one pad she holds: the name, the organisation (only
 * when one was given or chosen), the first role, its job description, who it is for. It grows out of
 * her tablet (a soft beam links the two), and a line is added as each answer is given; the line being
 * typed shows live, with a cursor. At the end the page turns to the first campaign.
 *
 * `padRows` is the whole rule for what is on the pad, kept apart from the drawing so it can be tested.
 */

export type PadKey = "name" | "organisation" | "role" | "jd" | "client";
export type PadRow = {
  key: PadKey;
  label: string;
  value: string;
  /** A small line under the value: "Asked to join". */
  note?: string;
  /** The line being written now. */
  live: boolean;
};

const ORDER: readonly Beat[] = ["name", "team", "role", "jd", "client"];

/** True on the beats where she is writing: from the team question to the client. */
export const padBeat = (b: Beat): boolean => b !== "name" && b !== "powers" && ORDER.includes(b);

/** "312 words" for a pasted job description: what is on the pad is the fact that it is there, not the text. */
const wordsIn = (text: string): string => {
  const n = text.trim().split(/\s+/).filter(Boolean).length;
  return `${n} ${n === 1 ? "word" : "words"}`;
};

/** What is on the pad at this beat: every earlier answer, and the line for this beat as it is typed. */
export function padRows(beat: Beat, a: Answers, d: Draft): PadRow[] {
  const at = ORDER.indexOf(beat);
  if (!padBeat(beat)) return [];
  const rows: PadRow[] = [];
  for (const [i, b] of ORDER.entries()) {
    if (i > at) break;
    const live = i === at;
    switch (b) {
      case "name":
        if (a.name.trim()) rows.push({ key: "name", label: "Name", value: a.name.trim(), live: false });
        break;
      case "team": {
        // Only an organisation that was given or chosen: Personal has no name, so it has no line.
        const typed = live ? d.organisation?.trim() : undefined;
        const name = typed || organisationOf(a);
        if (name) rows.push({ key: "organisation", label: "Organisation", value: name, ...(a.team?.kind === "asked" && !typed ? { note: "Asked to join" } : {}), live: !!typed });
        break;
      }
      case "role": {
        const v = (live ? (d.role ?? roleText(a.role) ?? "") : (roleText(a.role) ?? "")).trim();
        if (v || live) rows.push({ key: "role", label: "First role", value: v, live });
        break;
      }
      case "jd": {
        const text = live ? (d.jd ?? a.jd ?? "") : (a.jd ?? "");
        // Only text that can be a job description is on the pad (a link or a scrap is not), and a
        // skipped one has no line, rather than a line that says nothing.
        if (checkJd(text).ok) rows.push({ key: "jd", label: "Description", value: "Added", note: wordsIn(text), live: false });
        else if (live) rows.push({ key: "jd", label: "Description", value: "", live });
        break;
      }
      case "client": {
        const typed = live ? d.client?.trim() : undefined;
        const forClient = a.forClient === true;
        const name = typed || (forClient ? a.client : null);
        if (name) rows.push({ key: "client", label: "For", value: name, live: !!typed });
        else if (forClient && live) rows.push({ key: "client", label: "For", value: "", live });
        break;
      }
    }
  }
  return rows;
}

const EASE = [0.23, 1, 0.32, 1] as const;

type Props = {
  beat: Beat;
  answers: Answers;
  draft: Draft;
  reduce: boolean;
  /** Mind is drafting the first campaign: the page turns. */
  campaign: boolean;
  working: boolean;
  stalled?: boolean;
};

export function Pad({ beat, answers, draft, reduce, campaign, working, stalled = false }: Props): JSX.Element {
  const rows = padRows(beat, answers, draft);
  return (
    <motion.div
      className="nx-pad"
      data-page={campaign ? "campaign" : "notes"}
      initial={reduce ? false : { opacity: 0, scale: 0.7, x: -28 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, x: -14, transition: { duration: 0.24, ease: EASE } }}
      transition={{ type: "spring", stiffness: 150, damping: 20, mass: 0.9 }}
    >
      <span className="nx-pad-beam" aria-hidden="true" />
      <div className="nx-pad-body">
        <div className="nx-pad-screen">
          <div className="nx-pad-top">
            <img src={art("star-dial/star")} alt="" draggable={false} />
            <span>{campaign ? "First campaign" : "Notes"}</span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {campaign ? (
              <motion.div key="camp" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.34, ease: EASE }}>
                <CampaignPage role={roleText(answers.role) ?? "Your first role"} client={answers.forClient ? answers.client : null} working={working} stalled={stalled} later={!answers.jd} />
              </motion.div>
            ) : (
              <motion.div key="notes" initial={false} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <ul className="nx-pad-rows">
                  <AnimatePresence initial={false}>
                    {rows.map((r) => (
                      <motion.li
                        key={r.key}
                        className={`nx-pad-row${r.live ? " is-live" : ""}`}
                        data-k={r.key}
                        layout={!reduce}
                        initial={reduce ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.38, ease: EASE }}
                      >
                        <span className="nx-pad-k">{r.label}</span>
                        <span className="nx-pad-v">
                          <span className={`nx-pad-t${r.value ? "" : " is-empty"}`}>{r.value}</span>
                          {r.note && <span className="nx-pad-n">{r.note}</span>}
                        </span>
                        <span className="nx-pad-ok" aria-hidden="true">
                          {!r.live && r.value && (
                            <motion.span initial={reduce ? false : { scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 380, damping: 16, delay: reduce ? 0 : 0.18 }}>
                              <Check size={13} weight="bold" />
                            </motion.span>
                          )}
                        </span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/** The page the pad turns to at the end: the role, and rows where people will appear. No invented names. */
function CampaignPage({ role, client, working, stalled, later }: { role: string; client: string | null; working: boolean; stalled: boolean; later: boolean }) {
  return (
    <div className="nx-pad-camp">
      <span className="nx-pad-role">{role}</span>
      {client && (
        <span className="nx-pad-for">
          For <b>{client}</b>
        </span>
      )}
      <ul className={`nx-people${working ? " is-working" : ""}`} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} style={{ "--i": i } as CSSProperties}>
            <span className="nx-pp-av" />
            <span className="nx-pp-bars">
              <i />
              <i />
            </span>
          </li>
        ))}
      </ul>
      <span className="nx-camp-note">{stalled ? "Not set up yet" : later ? (working ? "Mind is drafting the role" : "Ready for the job description") : working ? "Mind is reading the description" : "Mind is on it"}</span>
    </div>
  );
}
