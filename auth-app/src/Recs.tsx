import { ArrowsClockwise } from "@phosphor-icons/react";
import { useState } from "react";
import type { ModeId } from "./orchestrator";
import type { Idea } from "./recs";
import { ideasFor } from "./recs";
import "./recs.css";

/**
 * Recs — three ideas to start from, above the composer.
 *
 * Deliberately quiet: an icon and a sentence on a soft tile, nothing else.
 * The observation behind each idea is still there, as the tile's tooltip,
 * for anyone who wants to know why it was suggested; it just doesn't compete
 * with the sentence for attention.
 *
 * Two interactions that cost no space: hovering a tile shows its sentence as
 * ghost text in the empty composer, and pressing it types the sentence in.
 * It never sends.
 */
export function Recs({
  mode, onPick, onPreview, disabled,
}: {
  mode: ModeId;
  onPick: (prompt: string) => void;
  onPreview: (prompt: string | null) => void;
  disabled: boolean;
}) {
  const all = ideasFor(mode);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(all.length / 3));
  const start = (page % pages) * 3;
  const shown = [...all.slice(start, start + 3), ...all.slice(0, Math.max(0, start + 3 - all.length))].slice(0, 3);

  return (
    <div className="rc">
      <ul className="rc-cards" key={`${mode}-${page}`}>
        {shown.map((idea, i) => (
          <li key={idea.id} style={{ animationDelay: `${i * 60}ms` }}>
            <Tile idea={idea} onPick={onPick} onPreview={onPreview} disabled={disabled} />
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <button type="button" className="rc-more" onClick={() => setPage((p) => p + 1)} tabIndex={disabled ? -1 : undefined}>
          <ArrowsClockwise size={12} weight="bold" aria-hidden="true" />
          Other ideas
        </button>
      )}
    </div>
  );
}

function Tile({
  idea, onPick, onPreview, disabled,
}: {
  idea: Idea;
  onPick: (prompt: string) => void;
  onPreview: (prompt: string | null) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className="rc-card"
      title={idea.because}
      tabIndex={disabled ? -1 : undefined}
      onClick={() => { onPreview(null); onPick(idea.prompt); }}
      onMouseEnter={() => onPreview(idea.prompt)}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(idea.prompt)}
      onBlur={() => onPreview(null)}
    >
      <idea.Icon size={20} weight="regular" className="rc-ico" aria-hidden="true" />
      <span className="rc-prompt">{idea.short ?? idea.prompt}</span>
    </button>
  );
}
