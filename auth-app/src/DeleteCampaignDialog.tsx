import { useEffect, useState } from "react";
import { Dialog } from "./ui";

/**
 * Deleting a campaign cannot be undone, so it asks for the campaign's name: a click on the wrong row's menu is not
 * enough. What goes and what stays is said plainly above the box.
 */
export function DeleteCampaignDialog({ open, name, onClose, onConfirm }: {
  open: boolean;
  name: string;
  onClose: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (open) setTyped(""); }, [open]);
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase() && name.trim() !== "";
  return (
    <Dialog open={open} onClose={onClose} label="Delete this campaign?" size="md">
      <form className="rl-dlg is-confirm" onSubmit={(e) => { e.preventDefault(); if (matches) onConfirm(); }}>
        <header className="rl-dlg-h">
          <h2 className="t-title">Delete this campaign?</h2>
          <div className="t-body rl-dlg-b">
            <b>{name}</b> is deleted for good: its pipeline, forms, role spec, outreach and history. The people stay in
            your candidates. This cannot be undone. To keep it but put it away, archive it instead.
          </div>
        </header>
        <label className="dc-confirm t-body">
          <span>Type the campaign&rsquo;s name to confirm</span>
          <input
            className="dc-input" type="text" value={typed} onChange={(e) => setTyped(e.target.value)}
            placeholder={name} autoComplete="off" spellCheck={false} aria-label="Campaign name" autoFocus
          />
        </label>
        <footer className="rl-dlg-f">
          <span />
          <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ct-btn rl-danger" disabled={!matches}>Delete campaign</button>
        </footer>
      </form>
    </Dialog>
  );
}
