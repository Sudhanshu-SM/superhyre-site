import { ArrowRight } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { changesOf, howMade, putBack, readSearchHistory, whoWhen } from "./searchHistory";
import type { SearchHistoryItem } from "./searchHistory";
import { ShimmerRegion, ShimmerText } from "./components/Shimmer";
import { useToast } from "./toast";
import { Dialog, LoadFailed } from "./ui";
import "./roles.css";
import "./searchHistory.css";

/**
 * What changed in where a campaign's searches look and how they filter: who, when, and each value before and after, newest
 * first, in a popup the Search history button in the Sourced page's header opens. The people on the campaign can put a change
 * back (Undo) while nothing has touched the same thing since; everyone who can see the campaign reads it. Nothing is read from
 * the server until someone opens it. Built on the Requirements dialog's own anatomy (.rl-dlg), like the job description popup.
 */

/** The popup's content for a list that is loaded. Pure: the stateful panel below holds what is being done. */
export function SearchHistoryView({ items, problem, busy, now, onUndo, onClose }: {
  items: readonly SearchHistoryItem[];
  /** Why the last Undo was not done, in the server's words. */
  problem: string;
  /** The line an Undo is on its way for. */
  busy: string | null;
  now?: number;
  onUndo: (item: SearchHistoryItem) => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="rl-dlg shy">
      <header className="rl-dlg-h">
        <h2 className="t-title">Search history</h2>
        <p className="t-body rl-dlg-b">What changed in where this campaign looks for people and how it filters, newest first.</p>
      </header>
      <div className="shy-body">
        {problem && <p className="rl-dlg-err t-body" role="alert">{problem}</p>}
        {items.length === 0 ? (
          <p className="shy-none t-body">Nothing has changed here yet.</p>
        ) : (
          <ul className="shy-list">
            {items.map((item) => {
              const how = howMade(item);
              return (
                <li key={item.id} className="shy-row">
                  <p className="shy-head t-body-sm">
                    <span>{now === undefined ? whoWhen(item) : whoWhen(item, now)}</span>
                    {how && <span>{how}</span>}
                  </p>
                  {changesOf(item).map((c) => (
                    <p key={c.label} className="shy-change t-body">
                      <span className="shy-label">{c.label}</span>
                      <span className="shy-from">{c.from}</span>
                      <ArrowRight size={12} aria-label="became" role="img" />
                      <span className="shy-to">{c.to}</span>
                    </p>
                  ))}
                  {item.canUndo ? (
                    <button type="button" className="hp-link shy-undo" disabled={busy !== null} aria-busy={busy === item.id || undefined} onClick={() => onUndo(item)}>
                      {busy === item.id ? "Putting it back" : "Undo"}
                    </button>
                  ) : item.undone ? (
                    <span className="shy-note t-body-sm">Put back later</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <footer className="rl-dlg-f">
        <span />
        <button type="button" className="ct-btn" autoFocus onClick={onClose}>Close</button>
      </footer>
    </div>
  );
}

/** The popup's content while the list is on its way: the real title, and the room the lines will fill. */
export function SearchHistoryWait({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="rl-dlg shy">
      <header className="rl-dlg-h">
        <h2 className="t-title">Search history</h2>
      </header>
      <ShimmerRegion label="Reading the search history" className="shy-body">
        <ShimmerText lines={4} h={14} gap={10} />
      </ShimmerRegion>
      <footer className="rl-dlg-f">
        <span />
        <button type="button" className="ct-btn" autoFocus onClick={onClose}>Close</button>
      </footer>
    </div>
  );
}

/** The popup when the list could not be read. */
export function SearchHistoryFailed({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }): JSX.Element {
  return (
    <div className="rl-dlg shy">
      <header className="rl-dlg-h">
        <h2 className="t-title">Search history</h2>
      </header>
      <div className="shy-body">
        <LoadFailed what="The search history" compact onRetry={onRetry} />
      </div>
      <footer className="rl-dlg-f">
        <span />
        <button type="button" className="ct-btn" onClick={onClose}>Close</button>
      </footer>
    </div>
  );
}

/** What the popup holds while it is open: the list, read when it opens, and an Undo on the lines that may have one. */
export function SearchHistoryPanel({ campaignId, onClose }: { campaignId: string; onClose: () => void }): JSX.Element {
  const [items, setItems] = useState<readonly SearchHistoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const toast = useToast();

  useEffect(() => {
    let live = true;
    setFailed(false);
    readSearchHistory(campaignId)
      .then((list) => { if (live) setItems(list); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [campaignId, reload]);

  const undo = (item: SearchHistoryItem) => {
    setBusy(item.id);
    setProblem("");
    void putBack(campaignId, item.id).then((done) => {
      setBusy(null);
      if ("problem" in done) {
        setProblem(done.problem);
        /* The line may be out of date (something changed since): read the list again so it shows what stands. */
        setReload((n) => n + 1);
        return;
      }
      setItems(done.items);
      toast("Put back.");
    });
  };

  if (items === null) return failed ? <SearchHistoryFailed onRetry={() => setReload((n) => n + 1)} onClose={onClose} /> : <SearchHistoryWait onClose={onClose} />;
  return <SearchHistoryView items={items} problem={problem} busy={busy} onUndo={undo} onClose={onClose} />;
}

/** The popup: read the history, and (for the people on the campaign) put a change back. */
export function SearchHistoryPopup({ open, onClose, campaignId }: { open: boolean; onClose: () => void; campaignId: string }): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} label="Search history" size="md">
      <SearchHistoryPanel campaignId={campaignId} onClose={onClose} />
    </Dialog>
  );
}

/** The Search history button for the Sourced page's header (its real campaign), with the popup it opens. */
export function SearchHistoryButton({ campaignId }: { campaignId: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cw-btn" onClick={() => setOpen(true)}>Search history</button>
      <SearchHistoryPopup open={open} onClose={() => setOpen(false)} campaignId={campaignId} />
    </>
  );
}
