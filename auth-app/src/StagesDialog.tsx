import { CaretDown, CaretUp, Eye, EyeSlash, Lock, Plus, X } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import type { StageColor, StageDef, StageRow } from "./boardStages";
import { Loader } from "./components/Loader";
import {
  MAX_WORKING, NAME_MAX, PRESETS, addRow, canSaveRows, defaultMoveTo, kindLabel, moveRow, patchRow, presetOf, presetRows, removeRow,
  removedWithPeople, rowProblems, rowsFrom, sameAsBoard, stageText,
} from "./boardStages";
import { Popover } from "./Contacts";
import { PICKABLE_HUES, stageVar } from "./stageDonut";
import { Dialog } from "./ui";
import "./stagesDialog.css";

/**
 * The stages of a board, edited: add, rename, reorder, recolour, remove, what each counts as, and which one the
 * client sees. Hired and Rejected sit locked at the end. Used from the board's header ("Stages") and from the New
 * campaign form (its Pipeline step), where `onSave` only keeps the choice until the campaign exists.
 *
 * Taking away a stage that has people in it asks where they go, in one short line with the sensible stage already
 * chosen, so saving is still one click.
 */

const HUE_LABEL: Readonly<Record<StageColor, string>> = {
  slate: "Slate", blue: "Blue", teal: "Teal", green: "Green", amber: "Amber", orange: "Orange", rose: "Rose", violet: "Violet",
};

type Props = {
  /** The board's stages now: the working ones first, then Hired and Rejected. */
  stages: readonly StageDef[];
  /** People in each stage, by stage id, so removing one can ask where they go. */
  counts?: Readonly<Record<string, number>>;
  title?: string;
  save?: string;
  /** Resolves true once the choice is kept; false leaves the dialog open (the reason has been said). */
  onSave: (rows: StageRow[], moveTo: Record<string, string>) => Promise<boolean>;
  onClose: () => void;
};

/** The dialog. Its form is made fresh each time it opens, so it always starts from the board as it is now. */
export function StagesDialog({ open, ...rest }: Props & { open: boolean }): JSX.Element {
  /* A new form each time it opens (and the old one stays as it is while the dialog fades out). */
  const [run, setRun] = useState(0);
  const [was, setWas] = useState(open);
  if (open !== was) { setWas(open); if (open) setRun((n) => n + 1); }
  return (
    <Dialog open={open} onClose={rest.onClose} label={rest.title ?? "Stages"} size="md">
      <StagesForm key={run} {...rest} />
    </Dialog>
  );
}

export function StagesForm({ stages, counts, title = "Stages", save = "Save stages", onSave, onClose }: Props): JSX.Element {
  const [rows, setRows] = useState<StageRow[]>(() => rowsFrom(stages, counts));
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const problems = useMemo(() => rowProblems(rows), [rows]);
  const leaving = useMemo(() => removedWithPeople(stages, rows, counts), [stages, rows, counts]);
  const changed = !sameAsBoard(rows, stages);
  const ok = canSaveRows(rows) && changed && !busy;
  const shown = presetOf(rows);
  const clientRow = rows.find((r) => r.clientView);
  const full = rows.length >= MAX_WORKING;

  /* Where each removed stage's people go: the choice made, else the nearest stage that is left. */
  const targetOf = (s: StageDef): string | null => {
    const left = rows.filter((r) => r.id);
    const chosen = moves[s.id];
    return chosen && left.some((r) => r.id === chosen) ? chosen : defaultMoveTo(s, rows, stages);
  };

  const submit = () => {
    if (!ok) return;
    const moveTo: Record<string, string> = {};
    for (const s of leaving) {
      const to = targetOf(s);
      if (to) moveTo[s.id] = to;
    }
    setBusy(true);
    void onSave(rows, moveTo).then((done) => {
      setBusy(false);
      if (done) onClose();
    }, () => setBusy(false));
  };

  return (
    <>
      <form className="rl-dlg sg" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <header className="rl-dlg-h">
          <h2 className="t-title">{title}</h2>
          <p className="t-body">Each stage is a column on the board. Hired and Rejected always stay at the end.</p>
        </header>

        <div className="sg-body">
          <div className="sg-presets">
            <span className="t-label">Start from</span>
            <div className="ncx-seg" role="radiogroup" aria-label="Start from">
              {PRESETS.map((p) => (
                <button
                  key={p.id} type="button" role="radio" aria-checked={shown === p.id} className={shown === p.id ? "is-on" : ""} title={p.hint}
                  onClick={() => { setRows((cur) => presetRows(p.id, cur)); setMoves({}); }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sg-grid" role="list" aria-label="Stages">
            <div className="sg-head t-caption" aria-hidden="true">
              <span /><span>Stage</span><span>Colour</span><span>Client</span><span />
            </div>
            {rows.map((r, i) => (
              <div key={r.key} role="listitem" className={`sg-row${problems[r.key] ? " is-bad" : ""}`}>
                <span className="sg-order">
                  <button type="button" className="sg-ico" onClick={() => setRows((cur) => moveRow(cur, r.key, -1))} disabled={i === 0} aria-label={`Move ${r.name || "this stage"} up`}><CaretUp size={13} weight="bold" /></button>
                  <button type="button" className="sg-ico" onClick={() => setRows((cur) => moveRow(cur, r.key, 1))} disabled={i === rows.length - 1} aria-label={`Move ${r.name || "this stage"} down`}><CaretDown size={13} weight="bold" /></button>
                </span>
                <span className="sg-name">
                  <input
                    className="ncx-in" value={r.name} maxLength={NAME_MAX} spellCheck={false} autoComplete="off" aria-label={`Name of stage ${i + 1}`} aria-invalid={!!problems[r.key]}
                    ref={(el) => { if (el && focusKey === r.key) { el.focus(); el.select(); setFocusKey(null); } }}
                    onChange={(e) => setRows((cur) => patchRow(cur, r.key, { name: e.target.value }))}
                  />
                  {problems[r.key] && <small className="ncx-err">{problems[r.key]}</small>}
                </span>
                <ColourPick
                  value={r.color} name={r.name || "this stage"} fixed={i === 0 ? "violet" : undefined}
                  onPick={(c) => setRows((cur) => patchRow(cur, r.key, { color: c }))}
                />
                <button
                  type="button" className={`sg-ico sg-eye${r.clientView ? " is-on" : ""}`} aria-pressed={r.clientView}
                  aria-label={`Show ${r.name || "this stage"} to the client`} title="Show this stage to the client"
                  onClick={() => setRows((cur) => patchRow(cur, r.key, { clientView: !r.clientView }))}
                >
                  {r.clientView ? <Eye size={16} weight="fill" /> : <EyeSlash size={16} />}
                </button>
                <button
                  type="button" className="sg-ico" onClick={() => setRows((cur) => removeRow(cur, r.key))} disabled={rows.length <= 1}
                  aria-label={`Remove ${r.name || "this stage"}`}
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            ))}
            {/* Hired and Rejected: fixed, and always last. */}
            {(["hired", "passed"] as const).map((kind) => {
              const tone = stageText({ kind, color: null });
              return (
                <div key={kind} role="listitem" className="sg-row is-locked">
                  <span className="sg-order"><Lock size={13} aria-hidden="true" /></span>
                  <span className="sg-name"><span {...tone} className={`${tone.className} sg-fixed t-body-strong`}>{kindLabel(kind)}</span></span>
                </div>
              );
            })}
          </div>

          <div className="sg-add">
            {full
              ? <p className="t-body-sm sg-note">Six stages is the most a board holds.</p>
              : <button type="button" className="ct-btn" onClick={() => { const next = addRow(rows); setRows(next); setFocusKey(next[next.length - 1]!.key); }}><Plus size={13} weight="bold" /> Add a stage</button>}
            <p className="t-body-sm sg-note">
              {clientRow
                ? <>Your client sees the people in <b>{clientRow.name.trim() || "this stage"}</b> on a page of their own, with no contact details.</>
                : "The eye shows one stage to your client."}
            </p>
          </div>

          {leaving.length > 0 && (
            <div className="sg-moves" role="group" aria-label="Where people go">
              {leaving.map((s) => {
                const left = rows.filter((r) => r.id);
                const to = targetOf(s);
                const n = counts?.[s.id] ?? s.count ?? 0;
                return (
                  <label key={s.id} className="sg-move t-body">
                    <span>{n} {n === 1 ? "person" : "people"} in <b>{s.name}</b> move to</span>
                    {left.length > 0 ? (
                      <select className="ncx-in" value={to ?? ""} onChange={(e) => setMoves((cur) => ({ ...cur, [s.id]: e.target.value }))}>
                        {left.map((r) => <option key={r.id} value={r.id}>{r.name.trim() || "this stage"}</option>)}
                      </select>
                    ) : <b>{rows[0]?.name.trim() || "the first stage"}</b>}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <footer className="rl-dlg-f">
          <span />
          <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ct-btn is-primary" disabled={!ok || busy} aria-busy={busy || undefined}>{busy ? <><Loader size="sm" tone="inherit" />Saving</> : save}</button>
        </footer>
      </form>
    </>
  );
}


/** A stage's colour: one small button showing it, opening the eight on offer and "Default" (the colour of its kind). */
function ColourPick({ value, name, fixed, onPick }: { value: StageColor | null; name: string; fixed?: StageColor | undefined; onPick: (c: StageColor | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const label = value ? HUE_LABEL[value] : "Default";
  /* The first stage of a campaign is always violet: it shows it, and it is not for changing. */
  if (fixed) {
    return (
      <span
        className="sg-ico sg-colour is-fixed" role="img" aria-label={`Colour of ${name}: ${HUE_LABEL[fixed]}, always the first stage's`}
        title="The first stage is always violet" style={{ ["--sg-c" as string]: stageVar(fixed) }}
      >
        <i aria-hidden="true" />
      </span>
    );
  }
  return (
    <>
      <button
        ref={ref} type="button" className={`sg-ico sg-colour${value ? "" : " is-auto"}`} aria-haspopup="listbox" aria-expanded={open}
        aria-label={`Colour of ${name}: ${label}`} title={label} onClick={() => setOpen((o) => !o)}
        style={value ? { ["--sg-c" as string]: stageVar(value) } : undefined}
      >
        <i aria-hidden="true" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={196}>
        <div className="sg-swatches" role="listbox" aria-label="Colour">
          {PICKABLE_HUES.map((h) => (
            <button
              key={h} type="button" role="option" aria-selected={value === h} className={`sg-sw${value === h ? " is-on" : ""}`} title={HUE_LABEL[h]} aria-label={HUE_LABEL[h]}
              style={{ ["--sg-c" as string]: stageVar(h) }} onClick={() => { onPick(h); setOpen(false); }}
            />
          ))}
          <button type="button" role="option" aria-selected={value === null} className={`sg-auto t-body-sm${value === null ? " is-on" : ""}`} onClick={() => { onPick(null); setOpen(false); }}>Default</button>
        </div>
      </Popover>
    </>
  );
}
