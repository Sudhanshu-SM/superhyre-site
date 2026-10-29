import { FileText, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { ApiJobDescription } from "./api/campaigns";
import { messageOf } from "./api/client";
import { addedLine, CHANGED_MEANWHILE, JD_FILE_TYPES, jdFileRefusal, pasteHint, pasteOk, replaceJd, takeJdFile, useCampaignJd } from "./campaignJd";
import type { FileState } from "./campaignJd";
import { useMayChangeCampaign } from "./campaignRights";
import { useCampaignRow } from "./campaignStore";
import { Loader } from "./components/Loader";
import { ShimmerRegion, ShimmerText } from "./components/Shimmer";
import { invalidate } from "./invalidate";
import { useToast } from "./toast";
import { Dialog, LoadFailed } from "./ui";
import "./roles.css";
import "./jobDescription.css";

/**
 * The campaign's job description, in a popup the Job description button in the campaign's header opens: all of the text
 * as it stands (scrolling inside the popup), when it was added and by whom, and the original file with a Download when
 * one was uploaded. For the people on the campaign there is Update, which turns the same popup into the paste or upload
 * form and, once saved, back into the text. Someone who only follows the campaign reads it and downloads the file.
 * Nothing here approves anything: the requirements have their own page.
 *
 * The popup is built from the Requirements dialog's own pieces (.rl-dlg), so the two read as the same kind of thing.
 * Its content is mounted with the dialog, so nothing is read from the server until someone opens it.
 */

/** The popup's content for a description that is loaded. Pure: the stateful panel below holds what is being done. */
export function JobDescriptionView({ jd, may, refreshFailed, file, now, back, onTake, onRetry, onUpdate, onClose }: {
  jd: ApiJobDescription;
  /** Whether this person may change the campaign (Update is theirs; reading and downloading are everyone's). */
  may: boolean;
  /** The last read did not come back: what is shown is the last one that did, and may be out of date. */
  refreshFailed: boolean;
  file: FileState;
  now?: Date;
  /** Coming back from the form: focus goes to Update, where it was, instead of to nothing. */
  back?: boolean;
  onTake: () => void;
  onRetry: () => void;
  onUpdate: () => void;
  onClose: () => void;
}): JSX.Element {
  const added = addedLine(jd, now);
  return (
    <div className="rl-dlg jdp">
      <header className="rl-dlg-h">
        <h2 className="t-title">Job description</h2>
        {jd.text && added && <p className="t-body rl-dlg-b">{added}</p>}
      </header>
      <div
        className="jdp-body"
        tabIndex={jd.text ? 0 : undefined} role={jd.text ? "region" : undefined} aria-label={jd.text ? "The job description text" : undefined}
      >
        {refreshFailed && <JobDescriptionStale onRetry={onRetry} />}
        {jd.text ? <p className="jdp-text t-body">{jd.text}</p> : <p className="jdp-none t-body">No job description yet.</p>}
      </div>
      <footer className="rl-dlg-f">
        {jd.file ? (
          <div className="jdp-file">
            <FileText size={16} aria-hidden="true" />
            <span className="jdp-file-n t-body-sm" title={jd.file.name}>{jd.file.name}</span>
            <button type="button" className="hp-link jdp-take" disabled={file.s === "working"} aria-busy={file.s === "working" || undefined} onClick={onTake}>
              {file.s === "working" ? <><Loader size="sm" tone="inherit" />Downloading</> : "Download"}
            </button>
            {file.s === "failed" && <span className="jdp-problem t-body-sm" role="alert">{file.message}</span>}
          </div>
        ) : <span />}
        <button type="button" className="ct-btn" onClick={onClose}>Close</button>
        {may && <button type="button" className="ct-btn is-primary" autoFocus={back} onClick={onUpdate}>{jd.text ? "Update" : "Add job description"}</button>}
      </footer>
    </div>
  );
}

/** Above the text when the last read did not come back: what is shown is the last one that did, and may be out of date. */
export function JobDescriptionStale({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <p className="jdp-stale t-body-sm" role="status">
      Couldn't check for changes, so this may be out of date.
      <button type="button" className="hp-link" onClick={onRetry}>Try again</button>
    </p>
  );
}

/**
 * The popup while a read is on the way: the real title, and lines where the text will be. Asking again ("Try again")
 * brings it in over the button that was pressed, so Close takes focus: it stays inside the popup instead of dropping to the page.
 */
export function JobDescriptionWait({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="rl-dlg jdp">
      <header className="rl-dlg-h">
        <h2 className="t-title">Job description</h2>
      </header>
      <ShimmerRegion label="Loading the job description" className="jdp-body">
        <ShimmerText lines={6} h={14} gap={10} />
      </ShimmerRegion>
      <footer className="rl-dlg-f">
        <span />
        <button type="button" className="ct-btn" autoFocus onClick={onClose}>Close</button>
      </footer>
    </div>
  );
}

/** The popup when the description could not be read at all (a later read that fails keeps the last one: see JobDescriptionStale). */
export function JobDescriptionFailed({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }): JSX.Element {
  return (
    <div className="rl-dlg jdp">
      <header className="rl-dlg-h">
        <h2 className="t-title">Job description</h2>
      </header>
      <div className="jdp-body">
        <LoadFailed what="The job description" compact onRetry={onRetry} />
      </div>
      <footer className="rl-dlg-f">
        <span />
        <button type="button" className="ct-btn" onClick={onClose}>Close</button>
      </footer>
    </div>
  );
}

/**
 * The form's content. Pure: the stateful panel below holds what is typed and what is busy. It opens on the text as it
 * stands, to be changed (a box that starts empty makes a small correction a whole new paste), and Save waits for a change.
 * The file picker is a real button (a tab stop a keyboard and a screen reader reach, which opens the browser's own
 * picker); the file input itself stays out of sight, so it is never what a person has to find.
 */
export function JobDescriptionForm({ saved, text, busy, problem, areaId, hintId, areaRef, fileRef, onText, onFile, onSave, onCancel }: {
  /** The description the form was opened over, empty when there was none: not the live one, which can change while the form is open. */
  saved: string;
  text: string;
  busy: "" | "text" | "file";
  problem: string;
  areaId: string;
  hintId: string;
  areaRef?: RefObject<HTMLTextAreaElement>;
  fileRef?: RefObject<HTMLInputElement>;
  onText: (text: string) => void;
  onFile: (file: File) => void;
  onSave: () => void;
  onCancel: () => void;
}): JSX.Element {
  const hasText = saved !== "";
  /* Why Save is not on yet, said under the box: the rule the server holds it to, so a refusal is never the first the person hears of it.
     It is part of what the box is described by while it shows, and the box is marked invalid, so a screen reader says it too. */
  const short = pasteHint(text);
  const shortId = `${hintId}-short`;
  const unchanged = hasText && text.trim() === saved.trim();
  return (
    <div className="rl-dlg is-confirm jdp-form">
      <header className="rl-dlg-h">
        <h2 className="t-title">{hasText ? "Update the job description" : "Add the job description"}</h2>
        <p className="t-body rl-dlg-b">
          {hasText ? "Change the text, or upload a new file. Requirements already drafted keep the text they were drafted from." : "Paste the text, or upload the file."}
        </p>
      </header>
      <div className="jdp-form-b">
        <label className="t-label" htmlFor={areaId}>Job description</label>
        <textarea
          id={areaId} ref={areaRef} className="jdp-area t-body" rows={9} value={text} disabled={busy !== ""}
          aria-describedby={short ? `${hintId} ${shortId}` : hintId} aria-invalid={short ? true : undefined} autoFocus
          onChange={(e) => onText(e.target.value)}
        />
        <p id={hintId} className="jdp-hint t-body-sm">A file is read into new requirements, for you to review. Pasted text only replaces the text.</p>
        {short && <p id={shortId} className="jdp-hint is-short t-body-sm">{short}</p>}
        {problem && <p className="rl-dlg-err t-body" role="alert">{problem}</p>}
      </div>
      <footer className="rl-dlg-f">
        <span />
        <button type="button" className="ct-btn jdp-pick" disabled={busy !== ""} aria-busy={busy === "file" || undefined} aria-describedby={hintId} onClick={() => fileRef?.current?.click()}>
          {busy === "file" ? <><Loader size="sm" tone="inherit" />Reading the file</> : <><UploadSimple size={14} aria-hidden="true" />Upload a file</>}
        </button>
        <input
          ref={fileRef} type="file" hidden tabIndex={-1} accept={JD_FILE_TYPES} disabled={busy !== ""}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
        <button type="button" className="ct-btn" disabled={busy !== ""} onClick={onCancel}>Cancel</button>
        <button type="button" className="ct-btn is-primary" disabled={busy !== "" || !pasteOk(text) || unchanged} aria-busy={busy === "text" || undefined} onClick={onSave}>
          {busy === "text" ? <><Loader size="sm" tone="inherit" />Saving</> : "Save"}
        </button>
      </footer>
    </div>
  );
}

/** What was typed and not saved, and the text it was typed over: it is only brought back while that is still the text. */
export type Draft = { text: string; basedOn: string };

/** No Download under way, none failed: where the Download state starts, and goes back to. */
const IDLE: FileState = { s: "idle" };

/**
 * What the popup holds while it is open: the description, or the form that changes it. It is the dialog's content, so it
 * is made when the popup opens and dropped when it has left: nothing is read until someone asks to see it.
 */
export function JobDescriptionPanel({ campaignId, draft, onDraft, working, onClose }: {
  campaignId: string;
  /** The changes not yet saved, kept by the popup so closing it by accident does not lose them. */
  draft: Draft | null;
  onDraft: (draft: Draft | null) => void;
  /** Set while a save is on its way, so the popup is not closed over it. */
  working: MutableRefObject<boolean>;
  onClose: () => void;
}): JSX.Element {
  const row = useCampaignRow(campaignId);
  /* Updating it is the brief's: the people on the campaign. Everyone who can see the campaign reads and downloads. */
  const may = useMayChangeCampaign(campaignId);
  const { jd, status, refreshFailed, rereading, reload } = useCampaignJd(campaignId, row?.setup?.jd ?? "");
  const [editing, setEditing] = useState(false);
  /* The text the form was opened over. The held text can change while the form is open (a teammate or the agent saved, or a read came back), so Save,
     Update or Add, and the draft's guard are all measured against this one, never against the text as it stands now. */
  const [base, setBase] = useState("");
  const [text, setText] = useState("");
  const [back, setBack] = useState(false);
  const [file, setFile] = useState<FileState>(IDLE);
  const [busy, setBusy] = useState<"" | "text" | "file">("");
  const [problem, setProblem] = useState("");
  const toast = useToast();
  const areaId = useId();
  const hintId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    working.current = busy !== "";
    return () => { working.current = false; };
  }, [busy, working]);

  /* While a write is on its way every control is disabled, and focus goes with them. When it comes back turned down (or a file is refused), the cursor
     returns to the box the sentence is about. Typing clears the sentence, so this never pulls focus from someone who is typing. */
  useEffect(() => {
    if (editing && problem && busy === "") areaRef.current?.focus();
  }, [editing, problem, busy]);

  /* A failed Download's sentence is about the file it was pressed for: when another file stands, the next one starts clean. */
  const fileId = jd?.file?.specId ?? "";
  useEffect(() => { setFile(IDLE); }, [fileId]);

  const saved = jd?.text ?? "";
  /* The form opens on what was typed and not saved, if the text is still the one it was typed over (a teammate's newer one is not written over), else on the text as it stands. */
  const update = () => { setBase(saved); setText(draft && draft.basedOn === saved ? draft.text : saved); setEditing(true); };
  const typed = (t: string) => { setText(t); onDraft({ text: t, basedOn: base }); setProblem(""); };
  const showText = () => { setProblem(""); setEditing(false); setBack(true); };
  /* The text comes back asked for again (replaceJd), and the popup waits for it rather than show the old one: see `rereading` below. */
  const done = (said: string) => { toast(said); onDraft(null); setBusy(""); setFile(IDLE); showText(); };
  /* A write that did not come back may still have gone through (a timeout says so): the text, and the views a write touches, are asked for again,
     so Cancel and the pages behind show what stands. The sentence stays in the form. */
  const failed = (kind: "text" | "file") => (err: unknown) => {
    setProblem(messageOf(err));
    setBusy("");
    invalidate([kind === "file" ? "spec" : "campaign"], { campaignId });
    reload();
  };
  const saveText = () => {
    /* Someone else saved while this was being edited: nothing goes over it. Their text is the one to measure against from here, so a second Save is a choice.
       (A text that already stands as it is in the box, say a save that timed out and went through, is not someone else's: sending it again changes nothing.) */
    if (saved !== base && saved.trim() !== text.trim()) { setProblem(CHANGED_MEANWHILE); setBase(saved); return; }
    setBusy("text");
    setProblem("");
    replaceJd(campaignId, { text }).then(done, failed("text"));
  };
  const takeUpload = (picked: File) => {
    const why = jdFileRefusal(picked);
    if (why) { setProblem(why); return; }
    setBusy("file");
    setProblem("");
    replaceJd(campaignId, { file: picked }).then(done, failed("file"));
  };
  const cancel = () => { if (!busy) { onDraft(null); showText(); } };
  const take = async () => {
    if (file.s === "working" || !jd?.file) return;
    setFile({ s: "working" });
    setFile(await takeJdFile(campaignId, jd.file));
  };

  if (editing) {
    return (
      <JobDescriptionForm
        saved={base} text={text} busy={busy} problem={problem} areaId={areaId} hintId={hintId} areaRef={areaRef} fileRef={fileRef}
        onText={typed} onFile={takeUpload} onSave={saveText} onCancel={cancel}
      />
    );
  }
  /* A save asks for the text again; until it answers the old text is not shown, so what the person sees is what was kept. */
  if (status === "loading" || rereading) return <JobDescriptionWait onClose={onClose} />;
  if (status === "failed" || !jd) return <JobDescriptionFailed onRetry={reload} onClose={onClose} />;
  return (
    <JobDescriptionView
      jd={jd} may={may} refreshFailed={refreshFailed} file={file} back={back}
      onTake={() => void take()} onRetry={reload} onUpdate={update} onClose={onClose}
    />
  );
}

/** The popup: read the description, and (for the people on the campaign) update it. */
export function JobDescriptionPopup({ open, onClose, campaignId }: { open: boolean; onClose: () => void; campaignId: string }): JSX.Element {
  /* What was changed and not saved stays for the next time it is opened, until it is saved or cancelled. */
  const [draft, setDraft] = useState<Draft | null>(null);
  const working = useRef(false);
  /* Escape, the scrim and the close button all wait for a save that is on its way, so its answer is not lost. */
  const leave = () => { if (!working.current) onClose(); };
  return (
    <Dialog open={open} onClose={leave} label="Job description" size="md">
      <JobDescriptionPanel campaignId={campaignId} draft={draft} onDraft={setDraft} working={working} onClose={leave} />
    </Dialog>
  );
}

/** The Job description button for a campaign's header (its real id), with the popup it opens. */
export function JobDescriptionButton({ campaignId }: { campaignId: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cw-btn" onClick={() => setOpen(true)}><FileText size={14} /> Job description</button>
      <JobDescriptionPopup open={open} onClose={() => setOpen(false)} campaignId={campaignId} />
    </>
  );
}
