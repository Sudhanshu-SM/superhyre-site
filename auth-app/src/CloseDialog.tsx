import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Dialog } from "./ui";

/**
 * Closing a campaign asks first, in one place for every page that closes one. Its forms are a separate choice, offered
 * and left off: closing the campaign does not close a form that is still taking answers unless that is asked for.
 */
export function CloseDialog({ open, body, onClose, onConfirm }: {
  open: boolean;
  body: ReactNode;
  onClose: () => void;
  onConfirm: (closeForms: boolean) => void;
}): JSX.Element {
  const [forms, setForms] = useState(false);
  useEffect(() => { if (open) setForms(false); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} label="Close this campaign?" size="md">
      <form className="rl-dlg is-confirm" onSubmit={(e) => { e.preventDefault(); onConfirm(forms); }}>
        <header className="rl-dlg-h">
          <h2 className="t-title">Close this campaign?</h2>
          <div className="t-body rl-dlg-b">{body}</div>
        </header>
        <label className="cd-forms t-body">
          <input type="checkbox" checked={forms} onChange={(e) => setForms(e.target.checked)} />
          <span>Also close its forms</span>
        </label>
        <footer className="rl-dlg-f">
          <span />
          <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ct-btn rl-danger" autoFocus>Close campaign</button>
        </footer>
      </form>
    </Dialog>
  );
}
