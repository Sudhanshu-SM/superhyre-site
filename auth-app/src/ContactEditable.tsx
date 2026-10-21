import { PencilSimple, Plus } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Cta } from "./agentCards/Cta";
import { updateCandidate } from "./api/candidates";
import { messageOf } from "./api/client";
import { contactPatch, contactProblem } from "./contactEdit";
import "./contactsFetch.css";

/**
 * The one way a contact is typed in by hand, in every sheet that shows a person: a compact field with Save and Cancel on
 * the same row, our own calm words when it is not right (no browser bubble), and nothing else around it.
 *
 * An email or phone number a recruiter can type in by hand, where the sheet shows it. With none on file the line says so
 * calmly (the lookup stays beside it) and "Add email" opens an editor in place: Enter or Save keeps it, Esc leaves it. The
 * number shows at once and is put back, with the reason, if the server refuses it.
 */
export function ContactEditable({ candidateId, kind, value, onSaved, children }: {
  candidateId: string;
  kind: "email" | "phone";
  /** What the workspace holds now; null for none. */
  value: string | null;
  onSaved: () => void;
  /** What the line says and offers when nothing is being typed (the value, or "Not found yet" with Look up). */
  children: ReactNode;
}): JSX.Element {
  const noun = kind === "email" ? "email" : "phone number";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [shown, setShown] = useState<string | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const have = shown === undefined ? value : shown;

  const open = () => { setDraft(have ?? ""); setProblem(null); setEditing(true); window.setTimeout(() => box.current?.focus(), 0); };
  const save = async () => {
    const bad = contactProblem(kind, draft);
    if (bad) return setProblem(bad);
    const text = draft.trim();
    const before = shown;
    setSaving(true);
    setProblem(null);
    setShown(text || null);
    setEditing(false);
    try {
      await updateCandidate(candidateId, contactPatch(kind, text));
      onSaved();
    } catch (err) {
      setShown(before);
      setDraft(text);
      setEditing(true);
      setProblem(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <form className="ce" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <span className="ce-row">
        <input
          ref={box} className="ce-in" type="text" inputMode={kind === "email" ? "email" : "tel"}
          value={draft} aria-label={have ? `Edit ${noun}` : `Add ${noun}`} aria-invalid={problem !== null || undefined}
          placeholder={kind === "email" ? "name@company.com" : "+91 98450 12345"} autoComplete="off" maxLength={kind === "email" ? 320 : 40}
          onChange={(e) => { setDraft(e.target.value); setProblem(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(false); setProblem(null); } }}
        />
        <Cta small variant="primary" type="submit" disabled={saving}>Save</Cta>
        <Cta small onClick={() => { setEditing(false); setProblem(null); }}>Cancel</Cta>
        </span>
        {problem && <span className="ce-problem" role="alert">{problem}</span>}
      </form>
    );
  }
  return (
    <span className="ce-line">
      {shown !== undefined && shown !== null && value !== shown ? <span>{shown}</span> : children}
      <Cta small bare icon={have ? PencilSimple : Plus} onClick={open} aria-label={have ? `Edit ${noun}` : `Add ${noun}`}>
        {have ? "Edit" : `Add ${kind}`}
      </Cta>
    </span>
  );
}
