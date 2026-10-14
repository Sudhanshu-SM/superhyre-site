import { PhoneCall } from "@phosphor-icons/react";
import type { CallRow } from "./api/calls";
import { byLine, initialsOf, lengthLabel, lineOf, OUTCOME_LABEL, OUTCOME_TONE, personOf, splitHits, whenLabel } from "./callsView";
import { toneProps } from "./statusTones";

/** The search's own words, lit where they are found. */
export function Lit({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  return (
    <>
      {splitHits(text, q).map((p, i) => (p.hit ? <mark key={i} className="kl-hit">{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  );
}

/**
 * One call as a line: who it was with (a chip with their initials, in the campaign's colour), what it was about
 * under the name, then how it went, how long and when. For an owner or admin the name is followed by who called.
 */
export function CallLine({ r, on, showCaller, hit, onOpen }: {
  r: CallRow;
  on: boolean;
  showCaller: boolean;
  /** The search word, lit in the name and the line. */
  hit: string;
  onOpen: (r: CallRow) => void;
}) {
  const line = lineOf(r);
  const length = lengthLabel(r.durationSeconds);
  return (
    <button
      type="button"
      data-kl-row={r.id}
      className={`kl-row${on ? " is-on" : ""}${showCaller ? " has-caller" : ""}`}
      aria-haspopup="dialog"
      aria-pressed={on}
      onClick={() => onOpen(r)}
    >
      <span className={`kl-av${r.candidate ? "" : " is-number"}`} aria-hidden="true">
        {r.candidate ? initialsOf(r.candidate.name) : <PhoneCall size={14} weight="bold" />}
      </span>
      <span className="kl-main">
        <span className="kl-l1">
          <span className="kl-name kl-ell"><Lit text={personOf(r)} q={hit} /></span>
          {showCaller && <span className="kl-by is-name kl-ell"><Lit text={byLine(r.caller)} q={hit} /></span>}
        </span>
        {line.text && <span className={`kl-sum kl-ell${line.quiet ? " is-quiet" : ""}`}><Lit text={line.text} q={hit} /></span>}
      </span>
      <span {...toneProps(OUTCOME_TONE[r.outcome])} className="kl-how kl-ell st">{OUTCOME_LABEL[r.outcome]}</span>
      {/* On a wide row these are columns of their own; on a narrow one they are the third line, with who called. */}
      <span className="kl-tail">
        <span className="kl-len">{length}</span>
        <span className="kl-when">{whenLabel(r.at)}</span>
        {showCaller && <span className="kl-by is-tail kl-ell"><Lit text={byLine(r.caller)} q={hit} /></span>}
      </span>
    </button>
  );
}
