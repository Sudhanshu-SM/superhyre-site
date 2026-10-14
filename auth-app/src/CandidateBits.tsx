import { BookmarkSimple, Check, Sparkle, X } from "@phosphor-icons/react";
import type { Candidate, Verdict } from "./sourcing";
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

export function FitMark({ met, label, unscored = false }: { met: boolean; label: string; unscored?: boolean }) {
  /* Someone the ranking has not judged yet is unknown, not a miss. */
  const said = unscored ? "Not scored yet" : met ? "Meets" : "Does not meet";
  return (
    <span className={`cb-fit${unscored ? " is-unscored" : met ? " is-met" : ""}`} title={`${said}: ${label}`}>
      {met && !unscored ? <Check size={10} weight="bold" aria-hidden="true" /> : null}
      <span className="sr-only">{said}: {label}</span>
    </span>
  );
}

export function FitRow({ meets, criteria = CRITERIA, short = CRITERIA_SHORT, unscored = false }: { meets: readonly boolean[]; criteria?: readonly string[]; short?: readonly string[]; unscored?: boolean }) {
  const n = meets.filter(Boolean).length;
  return (
    <ul className="cb-fitrow" aria-label={unscored ? "Not scored yet" : `Meets ${n} of ${criteria.length} criteria`}>
      {criteria.map((c, i) => (
        <li key={`${c}${i}`} className={meets[i] && !unscored ? "is-met" : undefined}>
          <FitMark met={!!meets[i]} label={c} unscored={unscored} />
          <span aria-hidden="true">{short[i]}</span>
        </li>
      ))}
    </ul>
  );
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
 * Shortlist and pass. Pressing the active one again clears it, so a verdict
 * is never a one-way door. `icons` drops the labels for dense rows; the
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
  return (
    <div className={`cb-verdicts${icons ? " is-icons" : ""}`}>
      <button
        type="button"
        className={`cb-v is-reject${rej ? " is-on" : ""}`}
        aria-pressed={rej}
        aria-label={`${rej ? "Undo pass" : "Pass"} ${name}`}
        title={rej ? "Undo pass" : "Pass (X)"}
        onClick={(e) => { e.stopPropagation(); onVerdict(rej ? null : "rejected"); }}
      >
        <X size={14} weight="bold" aria-hidden="true" />
        {!icons && <span>{rej ? "Passed" : "Pass"}</span>}
      </button>
      <button
        type="button"
        className={`cb-v is-short${short ? " is-on" : ""}`}
        aria-pressed={short}
        aria-label={`${short ? "Remove from shortlist" : "Shortlist"} ${name}`}
        title={short ? "Remove from shortlist" : "Shortlist (S)"}
        onClick={(e) => { e.stopPropagation(); onVerdict(short ? null : "shortlisted"); }}
      >
        <BookmarkSimple size={14} weight={short ? "fill" : "bold"} aria-hidden="true" />
        {!icons && <span>{short ? "Shortlisted" : "Shortlist"}</span>}
      </button>
    </div>
  );
}
