import { useId, useRef, useState } from "react";
import type { DragEvent } from "react";
import { LOGO_ACCEPT, LOGO_HINT, squareLogo } from "./logoImage";
import { OrgMark } from "./OrgMark";
import "./orgMark.css";

/**
 * Choosing an organisation's logo: drop a picture on the block or press Upload image. The picture is cropped
 * to a square and shrunk here, and shown as it will look; nothing is sent until the caller saves it. Used by
 * Settings (where it is saved with the form) and by the set-up (where it goes with the organisation).
 */
export function LogoPicker({ name, saved, picked, onPick, onDiscard, onRemove, busy = false, compact = false, title = "Logo" }: {
  name: string;
  /** The organisation's logo now: an address, or null. */
  saved: string | null;
  /** A picture chosen here and not sent yet (a data URL). */
  picked: string | null;
  onPick: (dataUrl: string) => void;
  /** Throws away the chosen picture, back to what is saved. */
  onDiscard: () => void;
  /** Takes the saved logo away. Absent where there is nothing saved to take (the set-up). */
  onRemove?: () => void;
  busy?: boolean;
  compact?: boolean;
  title?: string;
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const take = async (file: File | undefined) => {
    if (!file || busy) return;
    setProblem(null);
    setReading(true);
    try {
      onPick(await squareLogo(file));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That image didn't work. Try another.");
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void take(e.dataTransfer.files?.[0]);
  };

  const shown = picked ?? saved;
  return (
    <div
      className={`lp${over ? " is-drag" : ""}${compact ? " is-compact" : ""}`}
      onDragOver={(e) => { e.preventDefault(); if (!over) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      style={{ position: "relative" }}
    >
      <OrgMark name={name} logoUrl={shown} size={compact ? 40 : 56} />
      <div className="lp-body">
        {!compact && <p className="lp-t t-body-strong">{title}</p>}
        <p className="lp-h t-body-sm" id={hintId}>
          {picked ? (compact ? "That's the logo." : "That's how it will look. Save to use it.") : compact ? "Drop an image here, or choose one." : `Drop an image here, or upload one. ${LOGO_HINT}`}
        </p>
        {problem && <p className="lp-err t-body-sm" role="alert">{problem}</p>}
        <div className="lp-acts">
          <button type="button" className="ncx-btn is-sm" disabled={busy || reading} onClick={() => input.current?.click()} aria-describedby={hintId}>
            {picked || saved ? "Choose another" : "Upload image"}
          </button>
          {picked ? (
            <button type="button" className="st-link" disabled={busy} onClick={() => { setProblem(null); onDiscard(); }}>
              {compact ? "Remove" : "Undo"}
            </button>
          ) : saved && onRemove ? (
            <button type="button" className="st-link" disabled={busy} onClick={onRemove}>Remove</button>
          ) : null}
        </div>
      </div>
      <input
        ref={input}
        className="lp-file"
        type="file"
        accept={LOGO_ACCEPT}
        tabIndex={-1}
        aria-label={`${title} image`}
        onChange={(e) => void take(e.target.files?.[0])}
      />
    </div>
  );
}
