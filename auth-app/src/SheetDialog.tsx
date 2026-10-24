import { ArrowsClockwise, Table } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { messageOf } from "./api/client";
import type { SheetLink, SheetPreview, SheetSync } from "./api/campaigns";
import { sheetApi } from "./api/campaigns";
import { Loader } from "./components/Loader";
import { invalidate } from "./invalidate";
import "./roles.css";
import { Dialog } from "./ui";

/**
 * PURPOSE: moving a role that is already running. A team that tracks who was shared, and where each person stands, in a
 * Google Sheet connects that sheet to the campaign: its people are added and each is put on the stage its Status column
 * says, so the campaign's numbers start right instead of from zero. Syncing reads the same sheet again for what changed.
 * People only move forward, nothing is deleted, and nobody is hired from here when it would take them off another campaign.
 *
 * The button says which of the two it is (Import from sheet, then Sync sheet once one is connected); the dialog says what
 * it will do before it does it.
 */

const STAGE_WORDS: Record<string, string> = { shortlisted: "shared", outreach: "contacted", interviewing: "interviewing", hired: "joined", passed: "rejected" };
const tally = (m: Record<string, number>) => Object.entries(m).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${STAGE_WORDS[k] ?? k}`).join(", ");

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

export function SheetDialog({ open, onClose, campaignId, name }: { open: boolean; onClose: () => void; campaignId: string; name: string }) {
  const [saved, setSaved] = useState<SheetLink | null | undefined>(undefined);
  const [url, setUrl] = useState("");
  const [look, setLook] = useState<SheetPreview | null>(null);
  const [done, setDone] = useState<SheetSync | null>(null);
  const [busy, setBusy] = useState<"" | "look" | "sync">("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setLook(null); setDone(null); setError(""); setUrl("");
    sheetApi.saved(campaignId).then((s) => { if (live) setSaved(s); }, () => { if (live) setSaved(null); });
    return () => { live = false; };
  }, [open, campaignId]);

  const link = saved && !url.trim() ? undefined : url.trim();
  const fail = (e: unknown) => { setError(messageOf(e)); setBusy(""); };
  const check = () => {
    setBusy("look"); setError(""); setDone(null);
    sheetApi.preview(campaignId, link).then((p) => { setLook(p); setBusy(""); }, fail);
  };
  const bring = () => {
    setBusy("sync"); setError("");
    sheetApi.sync(campaignId, link).then((r) => {
      setDone(r); setLook(null); setUrl(""); setBusy("");
      sheetApi.saved(campaignId).then(setSaved, () => {});
      invalidate(["pipeline", "candidates", "campaign"], { campaignId });
    }, fail);
  };

  const needsLink = !saved && !url.trim();
  return (
    <Dialog open={open} onClose={onClose} label="Candidate sheet" size="md">
      <div className="rl-dlg is-confirm">
        <header className="rl-dlg-h">
          <h2 className="t-title">{saved ? "Sync your candidate sheet" : "Import from your candidate sheet"}</h2>
          <p className="t-body rl-dlg-b">
            For a role you are already running. Connect the Google Sheet your team tracks {name} in, and its numbers start from where you really are.
          </p>
        </header>
        <ul className="t-body sd-does">
          <li>Adds each person in the sheet to {name}, and skips anyone already here.</li>
          <li>Puts each on the stage their Status column says: shared, contacted, interviewing, offered, joined or rejected.</li>
          <li>Sync again any time: new rows come in and people move forward. Nobody is moved back or deleted.</li>
        </ul>
        <p className="t-body sd-needs">Needs a Name column and a Phone, Email or LinkedIn column, and sharing set to “Anyone with the link”.</p>

        {saved === undefined ? <p className="t-body sd-p"><Loader size="sm" /> Looking…</p> : (
          <>
            {saved && (
              <p className="t-body sd-p" role="status">
                <Table size={14} aria-hidden="true" /> Connected · {saved.people} {saved.people === 1 ? "person" : "people"} · read {when(saved.syncedAt)}
              </p>
            )}
            <label className="pr-note">
              <span className="t-label">{saved ? "Use a different sheet" : "Google Sheets link"}</span>
              <input value={url} onChange={(e) => { setUrl(e.target.value); setLook(null); }} maxLength={500} placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Google Sheets link" />
            </label>

            {look && (
              <div className="t-body sd-p" role="status">
                <p><b>{look.people} {look.people === 1 ? "person" : "people"}</b>{tally(look.stages) ? `: ${tally(look.stages)}` : ""}{look.noStatus ? `; ${look.noStatus} with no status I can place start as shared` : ""}.</p>
                <p>Reading: {look.read.map((r) => r.heading).join(", ")}.{look.left.length ? ` Left alone: ${look.left.join(", ")}.` : ""}</p>
                {look.unreadable > 0 && <p>{look.unreadable} {look.unreadable === 1 ? "row has" : "rows have"} no name, or no phone, email or LinkedIn, and can't be added.</p>}
              </div>
            )}
            {done && (
              <p className="t-body sd-p" role="status">
                Done: {done.added} new, {done.alreadyHere} already here{tally(done.moved) ? `, ${tally(done.moved)}` : ""}.
                {done.notMoved > 0 ? ` ${done.notMoved} need your yes (a hire that takes someone off another campaign).` : ""}
              </p>
            )}
            {error && <p className="t-body sd-p" role="alert">{error}</p>}
          </>
        )}

        <footer className="rl-dlg-f">
          <span />
          <button type="button" className="ct-btn" onClick={onClose}>Close</button>
          {saved && !url.trim() ? (
            <button type="button" className="ct-btn is-primary" disabled={busy !== ""} onClick={bring}>
              {busy === "sync" ? <><Loader size="sm" tone="inherit" /> Syncing…</> : <><ArrowsClockwise size={14} aria-hidden="true" /> Sync now</>}
            </button>
          ) : look ? (
            <button type="button" className="ct-btn is-primary" disabled={busy !== "" || look.people === 0} onClick={bring}>
              {busy === "sync" ? <><Loader size="sm" tone="inherit" /> Bringing them in…</> : `Bring in ${look.people}`}
            </button>
          ) : (
            <button type="button" className="ct-btn is-primary" disabled={busy !== "" || needsLink} onClick={check}>
              {busy === "look" ? <><Loader size="sm" tone="inherit" /> Reading…</> : "Check the sheet"}
            </button>
          )}
        </footer>
      </div>
    </Dialog>
  );
}

/**
 * The campaign header's button for the sheet: "Import from sheet" until one is connected, then "Sync sheet", with the
 * purpose in its tooltip. It owns the dialog, and re-reads what is connected whenever the dialog closes.
 */
export function SheetButton({ campaignId, name }: { campaignId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SheetLink | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    if (!open) sheetApi.saved(campaignId).then((s) => { if (live) setSaved(s); }, () => { if (live) setSaved(null); });
    return () => { live = false; };
  }, [campaignId, open]);
  const connected = Boolean(saved);
  return (
    <>
      <button
        type="button"
        className="cw-btn"
        onClick={() => setOpen(true)}
        title={connected
          ? "Read your team's candidate sheet again: new people come in and everyone moves to the stage their status says"
          : "Bring in the people your team already tracks in a Google Sheet, on the stage their status says"}
      >
        {connected ? <ArrowsClockwise size={14} aria-hidden="true" /> : <Table size={14} aria-hidden="true" />} {connected ? "Sync sheet" : "Import from sheet"}
      </button>
      <SheetDialog open={open} onClose={() => setOpen(false)} campaignId={campaignId} name={name} />
    </>
  );
}
