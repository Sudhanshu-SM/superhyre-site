import { useId, useRef, useState } from "react";
import { lastFailureKind } from "./api/client";
import { NOTE_MAX } from "./api/suppressions";
import type { Suppression } from "./api/suppressions";
import { Loader } from "./components/Loader";
import { SmRowsGhost } from "./settingsGhosts";
import { useToast } from "./Contacts";
import { EmptyArt } from "./EmptyArt";
import { ErrorState, kindOfLastFailure } from "./ErrorStates";
import { addByEmail, loadMoreDnc, openDnc, removeEntry, useDnc } from "./dncStore";
import type { DncState } from "./dncStore";
import { canRemove, emailProblem, metaLine, peopleLabel, removeHelp } from "./dncView";
import "./settingsMemory.css";
import "./settingsDnc.css";

/**
 * Settings → Do not contact: the people and addresses nobody may email. One list for the whole
 * workspace: someone who asked not to be contacted is left out of every campaign, whether the email
 * is drafted, scheduled or sent by hand. Anyone can add someone; only an owner or admin can lift one,
 * so everyone else is told to ask rather than shown a button that wouldn't work.
 */

export function SettingsDoNotContact({ manages, viewerId }: { manages: boolean; viewerId: string | null }) {
  const d = useDnc();
  const answered = d.phase === "ready" || d.phase === "failed";
  /* The first answer decides what the page draws; a later refresh keeps it where it is. */
  const seen = useRef(false);
  if (answered) seen.current = true;

  return (
    <div className="st-sec sm sd">
      <div className="st-h-row">
        <h2 className="st-h t-title-sm">Do not contact</h2>
        <span className="sm-count t-body-sm">{d.phase === "ready" && d.items.length > 0 ? peopleLabel(d.items.length) + (d.next ? "+" : "") : ""}</span>
      </div>
      <p className="st-quiet t-body-sm">
        Nobody on this list gets an email from any campaign, whether it is a draft, set up for later or sent by hand.{" "}
        {manages ? "Anyone can add someone. You can take them off again." : "Anyone can add someone. Only an admin can take them off."}
      </p>

      <AddForm />

      {!seen.current ? (
        <Waiting />
      ) : d.phase === "failed" && d.items.length === 0 ? (
        <ErrorState kind={kindOfLastFailure(lastFailureKind())} title={null} text="Couldn't load the list." action={{ label: "Try again", onClick: () => void openDnc() }} />
      ) : d.items.length === 0 ? (
        <div className="sm-note has-art">
          <EmptyArt name="empty-dnc" size={180} />
          <p className="st-quiet t-body">Nobody is on the list.</p>
          <p className="st-quiet t-body-sm">
            People you mark from a campaign's pipeline, anyone who unsubscribes, and addresses you add here show up in this list.
          </p>
        </div>
      ) : (
        <>
          <ul className="sm-list sd-list">
            {d.items.map((s) => <Entry key={s.id} entry={s} manages={manages} viewerId={viewerId} busy={d.working.includes(s.id)} />)}
          </ul>
          <More state={d} />
        </>
      )}
    </div>
  );
}

/* ── adding by email ── */

function AddForm() {
  const id = useId();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (busy) return;
    const problem = emailProblem(email);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    const r = await addByEmail(email, note);
    setBusy(false);
    if (r.ok) { setEmail(""); setNote(""); toast("Added to the list"); }
    else setError(r.message);
  };

  return (
    <form className="sd-add" onSubmit={(e) => { e.preventDefault(); void add(); }} noValidate>
      <label className="sr-only" htmlFor={`${id}-e`}>Email address</label>
      <input
        id={`${id}-e`} className="ncx-in sd-email" type="email" value={email} placeholder="Add an email address" autoComplete="off"
        aria-invalid={error ? true : undefined} onChange={(e) => { setEmail(e.target.value); setError(null); }}
      />
      <label className="sr-only" htmlFor={`${id}-n`}>Note, optional</label>
      <input
        id={`${id}-n`} className="ncx-in sd-note" value={note} maxLength={NOTE_MAX} placeholder="Why (optional)" autoComplete="off"
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="submit" className="ncx-btn is-primary sd-go" disabled={busy || !email.trim()} aria-busy={busy || undefined}>{busy ? <><Loader size="sm" tone="inherit" />Adding</> : "Add"}</button>
      {error && <p className="st-err t-caption sd-err" role="alert">{error}</p>}
    </form>
  );
}

/* ── states ── */

function Waiting() {
  return <SmRowsGhost n={4} label="Loading the do-not-contact list" />;
}

function More({ state }: { state: DncState }) {
  if (!state.next && state.more !== "failed") return null;
  return (
    <div className="sm-more">
      {state.more === "failed" && <span className="st-err t-body-sm" role="alert">Couldn't load more.</span>}
      <button type="button" className="ncx-btn is-sm" disabled={state.more === "loading"} onClick={() => void loadMoreDnc()}>
        {state.more === "loading" ? <><Loader size="sm" tone="inherit" />Loading</> : state.more === "failed" ? "Try again" : "Show more"}
      </button>
    </div>
  );
}

/* ── one entry ── */

function Entry({ entry, manages, viewerId, busy }: { entry: Suppression; manages: boolean; viewerId: string | null; busy: boolean }) {
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const help = removeHelp({ manages });

  return (
    <li className={`sm-row${busy ? " is-busy" : ""}${entry.expired ? " is-old" : ""}`}>
      <div className="sm-main">
        {/* Whoever can lift an entry sees the whole address when there is one; the rest see it masked. */}
        <p className="sm-text">{manages && entry.address ? entry.address : entry.label}</p>
        <p className="sm-meta t-caption">{metaLine(entry, viewerId)}</p>
        {entry.note && <p className="sm-said t-body-sm">{entry.note}</p>}
      </div>
      <div className="sm-acts">
        {!canRemove({ manages }) ? (
          <span className="sm-help t-body-sm">{help}</span>
        ) : asking ? (
          <>
            <span className="sm-help t-body-sm">Take them off? They can be emailed again.</span>
            <button type="button" className="st-link" onClick={() => setAsking(false)}>Keep</button>
            <button
              type="button" className="ncx-btn is-sm" disabled={busy} autoFocus
              onClick={() => void removeEntry(entry.id).then((r) => { if (r.ok) toast("Taken off the list"); else setAsking(false); })}
            >
              Take off
            </button>
          </>
        ) : (
          <button type="button" className="st-link" disabled={busy} onClick={() => setAsking(true)}>Remove</button>
        )}
      </div>
    </li>
  );
}
