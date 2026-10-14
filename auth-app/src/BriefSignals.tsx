import { Check } from "@phosphor-icons/react";
import { useMemo } from "react";
import { detectBrief } from "./briefSignals";
import type { Signal } from "./briefSignals";

/**
 * Under the composer while a brief is written: Location, Job Title, Years of Experience, Industry, Skills.
 * Each is quiet until the words say it, then it takes the brand colour and a bold check. Only the label: what
 * was found is not repeated here. Pressing one opens the filters at that group, to set it exactly.
 */
export function BriefSignals({ text, onOpen }: { text: string; onOpen: (category: Signal["category"]) => void }) {
  const signals = useMemo(() => detectBrief(text), [text]);
  return (
    <ul className="orc-signals" aria-label="What the brief says so far">
      {signals.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            className={`orc-signal${s.found ? " is-found" : ""}`}
            aria-label={`${s.label}: ${s.found ? "in the brief" : "not in the brief yet"}. Open filters`}
            aria-pressed={!!s.found}
            onClick={() => onOpen(s.category)}
          >
            <Check size={14} weight={s.found ? "bold" : "regular"} aria-hidden="true" />
            <span>{s.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
