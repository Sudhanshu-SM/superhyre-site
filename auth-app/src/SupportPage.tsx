import { Paperclip, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { LIVE } from "./api/client";
import { identityApi } from "./api/identity";
import { supportApi } from "./api/support";
import type { SupportTopic } from "./api/support";
import { Loader } from "./components/Loader";
import {
  FILE_ACCEPT, MESSAGE_MAX, SUPPORT_EMAIL, TOPICS, draftProblems, fileProblem, messageCount, pageBeforeSupport,
  rememberPage, sendSupport, sizeLabel,
} from "./supportForm";
import type { Draft, Field, Outcome, Problems, Send } from "./supportForm";
import { requestTour } from "./tour/useTour";
import "./newcampaign.css";
import "./support.css";

export { SUPPORT_EMAIL };

/**
 * Support: a short form that sends a question or a problem to the team. Name and email come from the signed-in
 * person and can be changed (the reply goes to the email written here). One optional attachment. When it is
 * sent the form is replaced by one calm line; when it cannot be sent the message is still there to try again.
 */

// The page they were on is whatever the address named last that was not this one; Console imports this module
// before its first render, so the landing page is already counted.
if (typeof window !== "undefined") {
  rememberPage(window.location.hash);
  window.addEventListener("hashchange", () => rememberPage(window.location.hash));
}

const mailto = (
  <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
);

type Props = {
  /** The signed-in person, to prefill the form; when absent it is read from the account. */
  account?: { name: string; email: string };
  /** How the message is sent (the API; replaced in tests). */
  send?: Send;
};

type View =
  | { kind: "form" }
  | { kind: "sent"; emailed: boolean; email: string }
  | { kind: "failed"; message: string; editable: boolean };

export function SupportPage({ account, send = supportApi.send }: Props = {}): JSX.Element {
  const [draft, setDraft] = useState<Draft>({
    name: account?.name ?? "", email: account?.email ?? "", topic: "question", subject: "", message: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [left, setLeft] = useState<ReadonlySet<Field>>(new Set());
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>({ kind: "form" });

  /* The account is read once when it was not handed over; what the person has already typed is never replaced. */
  useEffect(() => {
    if (account || !LIVE) return;
    let off = false;
    identityApi.me().then((me) => {
      if (off) return;
      setDraft((d) => ({ ...d, name: d.name || me.user.fullName || "", email: d.email || me.user.email }));
    }).catch(() => { /* the fields simply start empty */ });
    return () => { off = true; };
  }, [account]);

  const problems = draftProblems(draft);
  const shown: Problems = {};
  for (const f of Object.keys(problems) as Field[]) if (tried || left.has(f)) shown[f] = problems[f];

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const leave = (f: Field) => setLeft((s) => (s.has(f) ? s : new Set(s).add(f)));

  const transmit = async () => {
    setBusy(true);
    const outcome: Outcome = await sendSupport(draft, file, pageBeforeSupport() ?? "support", send);
    setBusy(false);
    setView(outcome.kind === "sent"
      ? { kind: "sent", emailed: outcome.emailed, email: draft.email.trim() }
      : { kind: "failed", message: outcome.message, editable: outcome.editable });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setTried(true);
    const first = (["name", "email", "subject", "message"] as const).find((f) => problems[f]);
    if (first) {
      document.getElementById(`sp-${first}`)?.focus();
      return;
    }
    void transmit();
  };

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!picked) return;
    const problem = fileProblem(picked);
    setFileError(problem);
    if (!problem) setFile(picked);
  };

  const again = () => {
    setDraft((d) => ({ ...d, subject: "", message: "" }));
    setFile(null);
    setFileError(null);
    setTried(false);
    setLeft(new Set());
    setView({ kind: "form" });
  };

  return (
    <div className="con-page sp">
      <h1 className="con-h1">Support</h1>
      <p className="con-lede">Ask us anything or tell us what's not working. We read every message.</p>

      {view.kind === "sent" ? (
        <SupportSent emailed={view.emailed} email={view.email} onAgain={again} />
      ) : view.kind === "failed" ? (
        <SupportFailed
          message={view.message}
          editable={view.editable}
          onRetry={() => { setView({ kind: "form" }); void transmit(); }}
          onEdit={() => setView({ kind: "form" })}
        />
      ) : (
        <SupportForm
          draft={draft} problems={shown} file={file} fileError={fileError} busy={busy}
          onChange={set} onLeave={leave} onSubmit={submit} onChoose={choose}
          onDrop={() => { setFile(null); setFileError(null); }}
        />
      )}

      <p className="sp-note t-body-sm">
        We usually reply within a working day.
        {view.kind === "form" || (view.kind === "sent" && view.emailed) ? <> You can also write to {mailto}.</> : null}
      </p>
      <p className="sp-note t-body-sm">
        New here? <button type="button" className="sp-link" onClick={requestTour}>Take the tour</button>.
      </p>
    </div>
  );
}

/** The form itself: every value and every handler comes from outside, so it draws the same in a test. */
export function SupportForm({
  draft, problems, file, fileError, busy, onChange, onLeave, onSubmit, onChoose, onDrop,
}: {
  draft: Draft;
  problems: Problems;
  file: { name: string; size: number } | null;
  fileError: string | null;
  busy: boolean;
  onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  onLeave: (field: Field) => void;
  onSubmit: (e: FormEvent) => void;
  onChoose: (e: ChangeEvent<HTMLInputElement>) => void;
  onDrop: () => void;
}): JSX.Element {
  const picker = useRef<HTMLInputElement>(null);
  const count = draft.message.trim().length;
  const bad = (f: Field) => (problems[f] ? { "aria-invalid": true, "aria-describedby": `sp-${f}-err` } : {});
  const note = (f: Field) =>
    problems[f] ? <small className="ncx-err" id={`sp-${f}-err`} role="alert">{problems[f]}</small> : null;

  return (
    <form className="sp-form" onSubmit={onSubmit} noValidate aria-label="Send us a message">
      <div className="sp-row">
        <div className={`ncx-f${problems.name ? " is-bad" : ""}`}>
          <label className="ncx-l" htmlFor="sp-name">Your name</label>
          <input id="sp-name" className="ncx-in" value={draft.name} autoComplete="name" readOnly={busy}
            onChange={(e) => onChange("name", e.target.value)} onBlur={() => onLeave("name")} {...bad("name")} />
          {note("name")}
        </div>
        <div className={`ncx-f${problems.email ? " is-bad" : ""}`}>
          <label className="ncx-l" htmlFor="sp-email">Your email</label>
          <input id="sp-email" className="ncx-in" type="email" inputMode="email" value={draft.email} autoComplete="email"
            readOnly={busy} onChange={(e) => onChange("email", e.target.value)} onBlur={() => onLeave("email")} {...bad("email")} />
          {note("email")}
        </div>
      </div>

      <div className="ncx-f">
        <label className="ncx-l" htmlFor="sp-topic">Topic</label>
        <select id="sp-topic" className="ncx-in" value={draft.topic} disabled={busy}
          onChange={(e) => onChange("topic", e.target.value as SupportTopic)}>
          {TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      <div className={`ncx-f${problems.subject ? " is-bad" : ""}`}>
        <label className="ncx-l" htmlFor="sp-subject">Subject <span className="sp-opt">optional</span></label>
        <input id="sp-subject" className="ncx-in" value={draft.subject} readOnly={busy}
          onChange={(e) => onChange("subject", e.target.value)} onBlur={() => onLeave("subject")} {...bad("subject")} />
        {note("subject")}
      </div>

      <div className={`ncx-f${problems.message ? " is-bad" : ""}`}>
        <label className="ncx-l" htmlFor="sp-message">Message</label>
        <textarea id="sp-message" className="ncx-in is-area" rows={6} value={draft.message} readOnly={busy}
          onChange={(e) => onChange("message", e.target.value)} onBlur={() => onLeave("message")} {...bad("message")} />
        <div className="sp-meta">
          {problems.message ? note("message") : <span />}
          <span className={`sp-count${count > MESSAGE_MAX ? " is-over" : ""}`} aria-live="polite">{messageCount(draft.message)}</span>
        </div>
      </div>

      <div className="ncx-f">
        <span className="ncx-l" id="sp-attach-l">Attachment <span className="sp-opt">optional</span></span>
        <div className="sp-attach">
          {file ? (
            <span className="sp-chip">
              <Paperclip size={14} aria-hidden="true" />
              <b title={file.name}>{file.name}</b>
              <small>{sizeLabel(file.size)}</small>
              <button type="button" aria-label={`Remove ${file.name}`} disabled={busy} onClick={onDrop}>
                <X size={12} weight="bold" aria-hidden="true" />
              </button>
            </span>
          ) : (
            <button type="button" className="ncx-btn is-sm" disabled={busy} onClick={() => picker.current?.click()}
              aria-describedby="sp-attach-h">
              <Paperclip size={14} aria-hidden="true" />Attach a file
            </button>
          )}
          <input ref={picker} className="sp-file" type="file" accept={FILE_ACCEPT} onChange={onChoose}
            tabIndex={-1} aria-labelledby="sp-attach-l" />
        </div>
        {fileError
          ? <small className="ncx-err" role="alert">{fileError}</small>
          : <small className="ncx-hint" id="sp-attach-h">PNG, JPG, PDF or text, up to 5 MB.</small>}
      </div>

      <div className="sp-act">
        <button type="submit" className="ncx-btn is-primary" disabled={busy} aria-busy={busy || undefined}>
          {busy ? <><Loader size="sm" tone="inherit" />Sending</> : "Send message"}
        </button>
      </div>
    </form>
  );
}

/** What replaces the form once the message is in. */
export function SupportSent({ emailed, email, onAgain }: { emailed: boolean; email: string; onAgain: () => void }): JSX.Element {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <div className="sp-done" role="status">
      <h2 ref={heading} tabIndex={-1} className="t-title-sm">{emailed ? "Thanks, we've got it." : "Saved."}</h2>
      <p className="t-body">
        {emailed ? <>We'll reply to {email}.</> : <>We'll get back to you at {email}.</>}
      </p>
      {!emailed && <p className="t-body sp-or">If it's urgent, write to {mailto}.</p>}
      <p className="sp-acts">
        <button type="button" className="sp-link" onClick={onAgain}>Send another</button>
      </p>
    </div>
  );
}

/** What replaces the form when the message could not be sent: nothing is lost, the form is as it was. */
export function SupportFailed({
  message, editable, onRetry, onEdit,
}: { message: string; editable: boolean; onRetry: () => void; onEdit: () => void }): JSX.Element {
  return (
    <div className="sp-done" role="alert">
      <h2 className="t-title-sm">That didn't go through.</h2>
      <p className="t-body">{message}</p>
      <p className="sp-acts">
        <button type="button" className="ncx-btn is-primary" onClick={onRetry}>Try again</button>
        {editable && <button type="button" className="sp-link" onClick={onEdit}>Edit your message</button>}
        <span className="sp-or t-body">or write to {mailto}</span>
      </p>
    </div>
  );
}
