import type { ReactNode } from "react";
import { Dialog } from "../ui";
import "./peek.css";

/**
 * The popup a card opens when what it shows is small and self-contained (a role spec, a draft, a list): a head with
 * what it is, a body that scrolls, and a foot that stays with the buttons that act on it. It is the console's dialog,
 * so focus stays inside it, Escape and the scrim close it, focus goes back to the button that opened it, and it
 * leaves the way the others do.
 */
export function Peek({ open, onClose, title, subtitle, footer, note, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One quiet line under the title: what it is and where it stands. */
  subtitle?: ReactNode;
  /** The buttons, right-aligned and always in view. */
  footer?: ReactNode;
  /** A word for the foot's left side (what is unsaved, what went wrong). */
  note?: ReactNode;
  children: ReactNode;
}): JSX.Element | null {
  return (
    <Dialog open={open} onClose={onClose} label={title} size="md">
      <div className="pk">
        <header className="pk-head">
          <h2 className="pk-title">{title}</h2>
          {subtitle && <p className="pk-sub">{subtitle}</p>}
        </header>
        <div className="pk-body">{children}</div>
        {(footer || note) && (
          <footer className="pk-foot">
            {note && <p className="pk-foot-note" role="status">{note}</p>}
            {footer}
          </footer>
        )}
      </div>
    </Dialog>
  );
}
