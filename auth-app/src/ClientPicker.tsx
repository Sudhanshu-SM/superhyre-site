import { useEffect, useId, useRef, useState } from "react";
import { companyIn } from "./campaignAsk";
import { useClients } from "./campaignStore";
import type { Client } from "./clients";
import { Loader } from "./components/Loader";
import "./clientPicker.css";

/**
 * Who a campaign is hiring for, chosen in one place: a select of the clients the person can see, and "Add a new client…"
 * for a company that is not there, which asks for its name and nothing more (the rest can be filled in later, in
 * Clients). A campaign always has a client, so there is no "no client" choice: until one is picked the select asks
 * the person to choose.
 *
 * The Requirements dialog and the Campaigns list both use it, and the new campaign form shares its one-field add. It
 * only says what was chosen (`onPick` with a client's id, `onAddByName` with a company's name); saving it is the
 * caller's, and `busy` holds the control while that is happening.
 *
 * A client chosen in the select is held until Save is pressed. A closed select changes on every arrow key (in Chrome and
 * Firefox, and for a screen reader), so saving on change would set, for good, whichever client the person passed while
 * reading the list, and only an admin or the owner can change it back.
 */

/** The select's value for "Add a new client…". It is never a client's id. */
export const ADD_CLIENT = "+";

type Pickable = Pick<Client, "id" | "name" | "status">;

/**
 * The clients to choose from: the active ones, then prospects (named as such), each by name. A client that has gone quiet is
 * left out unless it is the one picked. `valueName` names the one picked when it is not in the list yet (a company that was
 * just named for the campaign), so the select shows it rather than going back to asking.
 */
export function clientChoices(clients: readonly Pickable[], value = "", valueName = ""): Array<{ id: string; label: string }> {
  const rank = (c: Pickable) => (c.status === "prospect" ? 1 : c.status === "inactive" ? 2 : 0);
  const listed = [...clients]
    .filter((c) => c.status !== "inactive" || c.id === value)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, label: c.status === "prospect" ? `${c.name} (prospect)` : c.name }));
  return value && valueName && !listed.some((c) => c.id === value) ? [{ id: value, label: valueName }, ...listed] : listed;
}

/** What a typed company name comes to. */
export type Added = { kind: "pick"; id: string } | { kind: "name"; name: string } | { kind: "problem"; text: string };

/** The longest name the server keeps for a client. */
const NAME_MAX = 120;

/**
 * A client already in the list is picked, whatever the capitals or the "Pvt Ltd" after it (the server would use it too);
 * any other company is a name for the server to add. A name too short to be one is said, in plain words.
 */
export function addedAs(typed: string, clients: ReadonlyArray<Pick<Client, "id" | "name">>): Added {
  const name = typed.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { kind: "problem", text: "Add the company's name." };
  if (name.length > NAME_MAX) return { kind: "problem", text: `Keep the name under ${NAME_MAX} letters.` };
  const there = companyIn(name, clients);
  return there ? { kind: "pick", id: there.id } : { kind: "name", name };
}

/**
 * The one-field add: the company's name, Add and Cancel. Enter adds and Escape cancels (and is not passed on, so a dialog
 * around it stays open). It is not a form, because it is also drawn inside one (the new campaign form), where Enter
 * must not make the campaign.
 */
export function ClientNameAdd({ clients, onDone, onCancel, busy = false }: {
  clients: ReadonlyArray<Pick<Client, "id" | "name">>;
  /** What the name came to: a client already listed (pick it) or a name to add. */
  onDone: (added: Exclude<Added, { kind: "problem" }>) => void;
  onCancel: () => void;
  busy?: boolean;
}): JSX.Element {
  const id = useId();
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const add = () => {
    if (busy) return;
    const made = addedAs(name, clients);
    if (made.kind === "problem") setProblem(made.text);
    else onDone(made);
  };
  return (
    <div className="cpk-add">
      <label className="cpk-label" htmlFor={id}>Company name</label>
      <input
        id={id}
        className="cpk-input"
        value={name}
        maxLength={NAME_MAX}
        placeholder="e.g. Acme Fintech"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        disabled={busy}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-problem` : undefined}
        onChange={(e) => { setName(e.target.value); setProblem(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); }
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
        }}
      />
      {problem && <small className="cpk-problem" id={`${id}-problem`} role="alert">{problem}</small>}
      <div className="cpk-acts">
        <button type="button" className="cpk-btn" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="cpk-btn is-primary" disabled={busy} aria-busy={busy || undefined} onClick={add}>
          {busy ? <><Loader size="sm" tone="inherit" />Adding</> : "Add"}
        </button>
      </div>
    </div>
  );
}

export function ClientPicker({ value, valueName, onPick, onAddByName, disabled = false, busy = false, invalid = false, hint, label = "Client", autoFocus = false }: {
  /** The picked client's id; empty while none is picked, and the select then asks the person to choose one. */
  value: string;
  /** The name to show for `value` when it is not among the clients yet. */
  valueName?: string;
  onPick: (clientId: string) => void;
  /** A company that is not in the list was named. */
  onAddByName: (name: string) => void;
  disabled?: boolean;
  /** Saving what was chosen: the control waits, with the loader beside it. */
  busy?: boolean;
  /** A client is needed and none is picked: the select is marked, and `hint` says what to do. */
  invalid?: boolean;
  hint?: string;
  /** The select's name for a screen reader. */
  label?: string;
  autoFocus?: boolean;
}): JSX.Element {
  const { clients } = useClients();
  const hintId = useId();
  const [adding, setAdding] = useState(false);
  /* The client chosen and not yet saved, and the value it was chosen against: once the saved client changes, it is stale. */
  const [draft, setDraft] = useState<{ from: string; id: string } | null>(null);
  const select = useRef<HTMLSelectElement>(null);
  /* Leaving the add (added or cancelled) puts focus back on the select, where the person was. */
  const returning = useRef(false);
  useEffect(() => {
    if (!adding && returning.current) { returning.current = false; select.current?.focus(); }
  }, [adding]);
  const leave = () => { returning.current = true; setAdding(false); };

  if (adding) {
    return (
      <div className="cpk">
        <ClientNameAdd
          clients={clients}
          onDone={(made) => { leave(); if (made.kind === "pick") onPick(made.id); else onAddByName(made.name); }}
          onCancel={leave}
        />
      </div>
    );
  }
  const showHint = invalid && !!hint;
  const choices = clientChoices(clients, value, valueName);
  /* A value the list does not hold is not shown as some other client: the select asks instead. */
  const shown = choices.some((c) => c.id === value) ? value : "";
  const chosen = draft && draft.from === value && choices.some((c) => c.id === draft.id) ? draft.id : "";
  return (
    <div className="cpk">
      <div className="cpk-row">
        <select
          ref={select}
          className="cpk-select"
          value={chosen || shown}
          disabled={disabled || busy}
          autoFocus={autoFocus}
          aria-label={label}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={showHint ? hintId : undefined}
          aria-busy={busy || undefined}
          onChange={(e) => {
            if (e.target.value === ADD_CLIENT) setAdding(true);
            else if (e.target.value) setDraft({ from: value, id: e.target.value });
          }}
        >
          {!shown && <option value="" disabled>Choose a client</option>}
          {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          <option value={ADD_CLIENT}>Add a new client…</option>
        </select>
        {busy && <Loader size="sm" label="Saving the client" />}
        {chosen && chosen !== shown && !busy && (
          <button type="button" className="cpk-btn is-primary cpk-save" disabled={disabled} onClick={() => onPick(chosen)}>Save</button>
        )}
      </div>
      {showHint && <small className="cpk-hint" id={hintId}>{hint}</small>}
    </div>
  );
}
