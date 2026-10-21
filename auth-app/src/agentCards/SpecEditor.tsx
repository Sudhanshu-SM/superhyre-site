import { ArrowDown, ArrowUp, Plus, X } from "@phosphor-icons/react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Requirement, RoleSpec } from "../api/agent";
import { addRequirement, editAvoid, editText, GROUP_LABEL, moveRequirement, removeAvoid, removeRequirement, specProblem } from "./specEdit";
import "./specEditor.css";

/**
 * The whole role spec on one surface, edited where it stands: the role's fields, then the lists. Click a line to change
 * its words; the arrow moves it between Must have and Nice to have; the cross removes it; the last row of each list adds
 * one. Nothing here saves or approves a single line: the one Save (a new version) and the one Approve belong to
 * whatever holds the editor.
 */

/** Before the first paint in a browser; a plain effect where there is no page to measure. */
const useBeforePaint = typeof document === "undefined" ? useEffect : useLayoutEffect;

/** A one-line field of words that grows to fit them, and saves on Enter or when it is left. */
function Words({ value, onChange, label, readOnly, invalid }: {
  value: string; onChange: (v: string) => void; label: string; readOnly: boolean; invalid: boolean;
}): JSX.Element {
  const box = useRef<HTMLTextAreaElement>(null);
  useBeforePaint(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={box}
      className="se-text"
      rows={1}
      value={value}
      maxLength={200}
      readOnly={readOnly}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
    />
  );
}

/** The row at the end of a list that adds a line: Enter, or leaving it with words in it, adds them. */
function AddRow({ label, onAdd, disabled }: { label: string; onAdd: (text: string) => void; disabled: boolean }): JSX.Element {
  const [text, setText] = useState("");
  const commit = () => {
    if (text.trim().length >= 2) onAdd(text);
    setText("");
  };
  return (
    <div className="se-add">
      <span className="se-add-mark" aria-hidden="true"><Plus size={14} /></span>
      <input
        className="se-add-input"
        value={text}
        maxLength={200}
        disabled={disabled}
        placeholder="Add requirement"
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      />
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }): JSX.Element {
  return (
    <section className="se-group" aria-label={title}>
      <h3 className="se-group-head"><span className="se-group-title">{title}</span><span className="se-group-n">{count}</span></h3>
      {children}
    </section>
  );
}

export function SpecEditor({ spec, onChange, readOnly = false }: { spec: RoleSpec; onChange: (next: RoleSpec) => void; readOnly?: boolean }): JSX.Element {
  const ids = useId();
  const problem = specProblem(spec);
  const [where, setWhere] = useState(spec.locations.join(", "));
  const [whereOf, setWhereOf] = useState(spec.locations.join("|"));
  /* A newer version brings its own places; what is being typed is left alone until then. */
  if (spec.locations.join("|") !== whereOf) {
    setWhereOf(spec.locations.join("|"));
    setWhere(spec.locations.join(", "));
  }
  const lists: Array<{ importance: Requirement["importance"]; move: Requirement["importance"] | null }> = [
    { importance: "knockout", move: "must" },
    { importance: "must", move: "nice" },
    { importance: "nice", move: "must" },
  ];

  return (
    <div className={`se${readOnly ? " is-off" : ""}`} aria-disabled={readOnly || undefined}>
      <div className="se-fields">
        <label className="se-field is-title" htmlFor={`${ids}t`}>
          <span className="se-label">Role</span>
          <input id={`${ids}t`} className="se-input" value={spec.title} maxLength={120} readOnly={readOnly} onChange={(e) => onChange({ ...spec, title: e.target.value })} />
        </label>
        <label className="se-field is-level" htmlFor={`${ids}l`}>
          <span className="se-label">Level</span>
          <input id={`${ids}l`} className="se-input" value={spec.seniority ?? ""} maxLength={40} readOnly={readOnly} onChange={(e) => onChange({ ...spec, seniority: e.target.value || null })} />
        </label>
        <label className="se-field is-years" htmlFor={`${ids}y`}>
          <span className="se-label">Years of experience</span>
          <input
            id={`${ids}y`} className="se-input" type="number" inputMode="numeric" min={0} max={40}
            value={spec.yearsMin ?? ""} readOnly={readOnly}
            onChange={(e) => onChange({ ...spec, yearsMin: e.target.value === "" ? null : Math.min(40, Math.max(0, Number(e.target.value))) })}
          />
        </label>
        <label className="se-field is-where" htmlFor={`${ids}w`}>
          <span className="se-label">Location</span>
          <input
            id={`${ids}w`} className="se-input" value={where} readOnly={readOnly} placeholder="City, city"
            onChange={(e) => setWhere(e.target.value)}
            onBlur={() => onChange({ ...spec, locations: where.split(",").map((l) => l.trim()).filter((l) => l.length >= 2).slice(0, 10) })}
          />
        </label>
        <div className="se-field is-work">
          <label className="se-check">
            <input type="checkbox" checked={spec.remoteOk} disabled={readOnly} onChange={(e) => onChange({ ...spec, remoteOk: e.target.checked })} />
            Remote is fine
          </label>
        </div>
      </div>

      {lists.map(({ importance, move }) => {
        const rows = spec.requirements.filter((r) => r.importance === importance);
        if (importance === "knockout" && rows.length === 0) return null;
        const title = GROUP_LABEL[importance];
        return (
          <Group key={importance} title={title} count={rows.length}>
            <ul className="se-rows">
              {rows.map((r) => (
                <li key={r.id} className="se-row">
                  <Words value={r.text} readOnly={readOnly} invalid={r.text.trim().length < 2} label={`${title}: ${r.text || "requirement"}`} onChange={(v) => onChange(editText(spec, r.id, v))} />
                  {!readOnly && move && importance !== "knockout" && (
                    <button type="button" className="se-act" aria-label={`Move to ${GROUP_LABEL[move]}`} title={`Move to ${GROUP_LABEL[move]}`} onClick={() => onChange(moveRequirement(spec, r.id, move))}>
                      {move === "nice" ? <ArrowDown size={15} /> : <ArrowUp size={15} />}
                    </button>
                  )}
                  {!readOnly && (
                    <button type="button" className="se-act" aria-label={`Remove ${r.text}`} title="Remove" disabled={spec.requirements.length <= 1} onClick={() => onChange(removeRequirement(spec, r.id))}>
                      <X size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!readOnly && importance !== "knockout" && (
              <AddRow label={`Add to ${title}`} disabled={spec.requirements.length >= 20} onAdd={(text) => onChange(addRequirement(spec, text, importance))} />
            )}
          </Group>
        );
      })}

      {spec.avoid.length > 0 && (
        <Group title="Avoid" count={spec.avoid.length}>
          <ul className="se-rows">
            {spec.avoid.map((a, i) => (
              <li key={i} className="se-row">
                <Words value={a} readOnly={readOnly} invalid={a.trim().length < 2} label={`Avoid: ${a || "background"}`} onChange={(v) => onChange(editAvoid(spec, i, v))} />
                {!readOnly && (
                  <button type="button" className="se-act" aria-label={`Remove ${a}`} title="Remove" onClick={() => onChange(removeAvoid(spec, i))}>
                    <X size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Group>
      )}

      {problem && <p className="se-problem" role="alert">{problem}</p>}
    </div>
  );
}
