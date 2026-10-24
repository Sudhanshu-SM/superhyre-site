import { BookmarkSimple, Check, Sparkle, X } from "@phosphor-icons/react";
import { LIVE } from "./api/client";
import { stateLabel, stateTone } from "./matchResult";
import type { MatchResultView } from "./matchResult";
import type { Candidate, Verdict } from "./sourcing";
import { toneProps } from "./statusTones";
import { CRITERIA, CRITERIA_SHORT, NOW_INDEX, initials, trajectory } from "./sourcing";
import "./candidates.css";

/**
 * The pieces every candidate surface is built from — the transcript's cards,
 * the ranked list and the profile sidebar — so a candidate reads the same way
 * wherever they appear.
 */

export function Avatar({ name, hue, size = 40 }: { name: string; hue: string; size?: number }) {
  return (
    <span
      className="cb-avatar"
      style={{
        width: size,
        height: size,
        /* initials never drop under the 12px text floor: a fixed 12px up to
           40px avatars, then 0.4 of the size */
        font: size > 40 ? `600 ${Math.round(size * 0.4)}px/1 var(--ui)` : "600 var(--fs-12, 12px)/1 var(--ui)",
        background: `var(--c-${hue}-tint)`,
        color: `var(--c-${hue}-text)`,
        borderColor: `var(--c-${hue}-line)`,
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function Logo({ name, hue, size = 20 }: { name: string; hue: string; size?: number }) {
  return (
    <span
      className="cb-logo"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.5),
        borderRadius: Math.max(4, Math.round(size * 0.24)),
        background: `var(--c-${hue}-fill)`,
      }}
      aria-hidden="true"
    >
      {name[0]}
    </span>
  );
}

/* ── the career strip ────────────────────────────────────────────────────────
   Every candidate's employers laid on ONE shared axis — the last fourteen
   years — rather than each strip stretched to its own career. That is what
   makes a column of them readable: a longer bar is a longer tenure, a late
   start is a shorter career, a gap is a gap, and you can compare two rows by
   looking rather than by reading dates.

   Monochrome on purpose. Past employers are a quiet rule, the current one is
   ink; colouring each company would put twelve brand hues in one column and
   make the column about logos.                                              */

export const AXIS_YEARS = 14;
const AXIS_END = NOW_INDEX;
const AXIS_START = AXIS_END - AXIS_YEARS * 12;
export const AXIS_FROM = Math.floor(AXIS_START / 12);

export function Career({ c, labels = false }: { c: Candidate; labels?: boolean }) {
  const segs = trajectory(c);
  /* Placed by their real dates, so a gap between two jobs shows as a gap. */
  const placed = segs.filter((s) => s.end > AXIS_START);
  const pct = (m: number) => ((Math.max(m, AXIS_START) - AXIS_START) / (AXIS_END - AXIS_START)) * 100;
  const summary = segs.map((s) => `${s.org.name}, ${Math.round(s.months / 12) || "<1"} yrs`).join("; ");

  return (
    <div className="cb-career" role="img" aria-label={`Career: ${summary}`}>
      <div className="cb-career-track">
        {placed.map((s) => (
          <span
            key={s.org.name + s.from}
            className={`cb-seg${s.current ? " is-now" : ""}`}
            style={{ left: `${pct(s.start)}%`, width: `calc(${pct(s.end) - pct(s.start)}% - 2px)` }}
            title={`${s.title} · ${s.org.name} · ${s.from} – ${s.to}`}
          />
        ))}
      </div>
      {labels && (
        <div className="cb-career-axis" aria-hidden="true">
          <span>{AXIS_FROM}</span>
          <span>now</span>
        </div>
      )}
    </div>
  );
}

/* ── fit ─────────────────────────────────────────────────────────────────────
   One mark per ranking criterion. In the ranked list they sit in columns
   under a single header, so the criterion names are printed once instead of
   on every row; elsewhere `labelled` prints them beside the marks.          */

type Check = "met" | "partial" | "not_met" | "unknown";

/**
 * A years requirement said against the person's own years: "10 years, asked 5 to 8", not "Meets 5 to 8 years" (which reads
 * as though they have 5 to 8). Null when the label is not about years or the person's years are not known.
 */
export function askedYears(label: string, have: number | null | undefined): string | null {
  if (have == null || have <= 0) return null;
  const m = /^\s*(\d{1,2})\s*(?:(?:to|-|–)\s*(\d{1,2})|(\+))?\s*\+?\s*(?:years?|yrs?)\b/i.exec(label);
  if (!m) return null;
  const asked = m[2] ? `${m[1]} to ${m[2]}` : m[3] || /\+\s*(?:years?|yrs?)/i.test(label) ? `${m[1]}+` : m[1];
  return `${have} ${have === 1 ? "year" : "years"}, asked ${asked}`;
}

export function FitMark({ met, label, unscored = false, state, years }: { met: boolean; label: string; unscored?: boolean; state?: Check | undefined; years?: number | null | undefined }) {
  /* Someone the ranking has not judged yet is unknown, not a miss. So is a criterion the profile could not settle. */
  const unknown = !unscored && state === "unknown";
  const partial = !unscored && state === "partial";
  const said = unscored ? "Not scored yet" : unknown ? "Can't tell yet" : partial ? "Partly" : met ? "Meets" : "Does not meet";
  const asked = unscored || unknown ? null : askedYears(label, years);
  const text = asked ?? `${said}: ${label}`;
  return (
    <span className={`cb-fit${unscored || unknown ? " is-unscored" : partial ? " is-partial" : met ? " is-met" : ""}`} title={text}>
      {met && !unscored ? <Check size={10} weight="bold" aria-hidden="true" /> : null}
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function FitRow({ meets, criteria = CRITERIA, short = CRITERIA_SHORT, unscored = false, checks }: { meets: readonly boolean[]; criteria?: readonly string[]; short?: readonly string[]; unscored?: boolean; checks?: readonly Check[] | undefined }) {
  const n = meets.filter(Boolean).length;
  const open = checks ? checks.filter((c) => c === "unknown").length : 0;
  return (
    <ul className="cb-fitrow" aria-label={unscored ? "Not scored yet" : `Meets ${n} of ${criteria.length} criteria${open ? `, ${open} can't be told yet` : ""}`}>
      {criteria.map((c, i) => (
        <li key={`${c}${i}`} className={meets[i] && !unscored ? "is-met" : undefined}>
          <FitMark met={!!meets[i]} label={c} unscored={unscored} state={checks?.[i]} />
          <span aria-hidden="true">{short[i]}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What the server concluded, as a few plain words in the status colour: "Strong fit · 82", "Needs more evidence",
 * "Not scored yet". Text only, no marker in front of it; the word is always there, so colour never says it alone.
 */
export function FitState({ r }: { r: MatchResultView }) {
  return <span className="cb-state"><span {...toneProps(stateTone(r))}>{stateLabel(r)}</span></span>;
}

/** The agent's read of a profile. The phrases that earned the match are
    marked with a low highlighter stroke rather than a filled pill. */
export function Summary({ text, marks }: { text: string; marks: readonly string[] }) {
  const parts: Array<{ t: string; m: boolean }> = [];
  let rest = text;
  while (rest.length) {
    let best: { at: number; s: string } | null = null;
    for (const s of marks) {
      const at = rest.indexOf(s);
      if (at >= 0 && (!best || at < best.at)) best = { at, s };
    }
    if (!best) { parts.push({ t: rest, m: false }); break; }
    if (best.at > 0) parts.push({ t: rest.slice(0, best.at), m: false });
    parts.push({ t: best.s, m: true });
    rest = rest.slice(best.at + best.s.length);
  }
  return (
    <p className="cb-summary">
      <Sparkle size={14} weight="fill" aria-hidden="true" className="cb-summary-mark" />
      <span>{parts.map((p, i) => (p.m ? <mark key={i}>{p.t}</mark> : <span key={i}>{p.t}</span>))}</span>
    </p>
  );
}

/**
 * Shortlist and pass. Demo mode: pressing the active one again clears it. Connected, a decision is not taken back from
 * here (a shortlisted person is on the pipeline, a rejection is kept so matching can learn from it), so a button that
 * stands for a decision already made shows that state and is not pressable, rather than offering to undo what it cannot.
 * A rejected person can still be shortlisted, which brings them back. `icons` drops the labels for dense rows; the
 * buttons keep their names for assistive tech either way.
 */
export function Verdicts({
  verdict, onVerdict, name, icons = false,
}: {
  verdict?: Verdict;
  onVerdict: (v: Verdict | null) => void;
  name: string;
  icons?: boolean;
}) {
  const short = verdict === "shortlisted";
  const rej = verdict === "rejected";
  // Connected: a decided person's buttons say where they stand. Shortlisted: neither is pressable. Rejected: shortlisting is.
  const rejectFixed = LIVE && (rej || short);
  const shortFixed = LIVE && short;
  const rejectWhy = rej ? "Rejected. Shortlist them to bring them back." : "On the shortlist. Move them on the Pipeline to change that.";
  return (
    <div className={`cb-verdicts${icons ? " is-icons" : ""}`}>
      <button
        type="button"
        className={`cb-v is-reject${rej ? " is-on" : ""}`}
        aria-pressed={rej}
        disabled={rejectFixed}
        aria-label={rejectFixed ? `${name}: ${rejectWhy}` : `${rej ? "Undo reject" : "Reject"} ${name}`}
        title={rejectFixed ? rejectWhy : rej ? "Undo reject" : "Reject (X)"}
        onClick={(e) => { e.stopPropagation(); onVerdict(rej ? null : "rejected"); }}
      >
        <X size={14} weight="bold" aria-hidden="true" />
        {!icons && <span>{rej ? "Rejected" : "Reject"}</span>}
      </button>
      <button
        type="button"
        className={`cb-v is-short${short ? " is-on" : ""}`}
        aria-pressed={short}
        disabled={shortFixed}
        aria-label={shortFixed ? `${name} is on the shortlist. Move them on the Pipeline to change that.` : `${short ? "Remove from shortlist" : "Shortlist"} ${name}`}
        title={shortFixed ? "On the shortlist. Move them on the Pipeline to change that." : short ? "Remove from shortlist" : "Shortlist (S)"}
        onClick={(e) => { e.stopPropagation(); onVerdict(short ? null : "shortlisted"); }}
      >
        <BookmarkSimple size={14} weight={short ? "fill" : "bold"} aria-hidden="true" />
        {!icons && <span>{short ? "Shortlisted" : "Shortlist"}</span>}
      </button>
    </div>
  );
}
