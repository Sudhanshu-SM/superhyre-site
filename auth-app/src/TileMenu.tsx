import {
  ArrowLeft, ArrowRight, ArrowsCounterClockwise, Check, Plus, Trash, X,
} from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  HUES, HUE_LABEL, TILE_KINDS, TILE_KIND_INFO, TILE_SIZE_LABEL,
} from "./orchestrator";
import type { Hue, TileKind, TileSize, TileSpec } from "./orchestrator";
import type { TileLayout } from "./tileLayout";
import { Glyph } from "./viz";

/**
 * The tile menu, and the gallery that adds tiles.
 *
 * ── PORTALED, AND THAT IS WHY THE TOKENS LIVE AT :root ──────────────────────
 * Both render through a portal into <body> to escape the grid's stacking and
 * clipping. A portal leaves the DOM subtree and therefore leaves the CSS
 * custom-property scope — the sidebar's campaign switcher shipped with no
 * background at all for exactly this reason, because `var(--nav-surface)`
 * resolved to nothing out there. Every `--c-*` token is declared at `:root`, so
 * the hue swatches below resolve. Do not move them onto `.orc`.
 *
 * ── WHY A MENU RATHER THAN A SETTINGS PAGE ──────────────────────────────────
 * The thing being configured is visible three inches away. A modal that covers
 * it would force the recruiter to remember what they were changing, so the
 * menu anchors to the tile and every change applies immediately with no save
 * step. There is no confirm, because every action here is trivially reversible
 * and a confirm on a cosmetic change trains people to click through dialogs.
 */

const SIZES: readonly TileSize[] = ["s", "m", "l"];

/** Keeps a panel inside the viewport after it has been measured. */
function useAnchored(anchor: HTMLElement | null, width: number) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    /* Measured after mount rather than assumed: the menu's height depends on
       how many hues and sizes it renders, and guessing it is what puts a panel
       half off-screen near the bottom of the window. */
    const h = ref.current?.offsetHeight ?? 0;
    const gap = 6;
    const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
    const below = r.bottom + gap;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - gap - h) : below;
    setPos({ top, left });
  }, [anchor, width]);

  return { ref, pos };
}

/** Escape and outside-pointer both dismiss; focus returns to the anchor. */
function useDismiss(anchor: HTMLElement | null, onClose: () => void, panel: HTMLElement | null) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchor?.focus();
      }
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    /* Capture, so a dismissal beats any handler on the element underneath and
       the first click outside does not also activate what it landed on. */
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", down, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", down, true);
    };
  }, [anchor, onClose, panel]);
}

/* ── per-tile menu ────────────────────────────────────────────────────────── */

const MENU_W = 244;

export function TileMenu({
  spec, anchor, layout, onClose,
}: {
  spec: TileSpec;
  anchor: HTMLElement;
  layout: TileLayout;
  onClose: () => void;
}) {
  const { ref, pos } = useAnchored(anchor, MENU_W);
  useDismiss(anchor, onClose, ref.current);

  const info = TILE_KIND_INFO[spec.kind];
  const index = layout.layout.findIndex((t) => t.id === spec.id);
  const last = layout.layout.length - 1;

  return createPortal(
    <div
      ref={ref}
      className="tm"
      role="dialog"
      aria-label={`Customise ${info.label}`}
      style={{
        width: MENU_W,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        /* Hidden until measured, so it never paints at the off-screen
           placeholder position for a frame. */
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div className="tm-head">
        <Glyph Icon={info.Icon} hue={spec.hue} size={24} />
        <span className="tm-head-name">{info.label}</span>
        <button type="button" className="tm-x" onClick={onClose} aria-label="Close">
          <X size={13} weight="bold" />
        </button>
      </div>

      {/* ── WHAT THIS TILE SHOWS ──
          First group in the menu, because it is the biggest thing you can
          change about a tile — size and colour are adjustments to a decision
          this one makes. It also removes the old awkwardness of having to
          delete a tile and add a different one from the gallery just to swap
          what it displays, which lost its position in the grid.

          A select rather than a row of pills: eight options will not fit a
          244px menu as buttons, and a native select gets keyboard behaviour,
          type-ahead and a platform-correct popup for free. The one thing it
          cannot do is show each option's blurb, and the blurb belongs to the
          gallery — this is a swap, not a first choice. */}
      <div className="tm-group">
        <span className="tm-label" id={`${spec.id}-shows`}>Shows</span>
        <select
          className="tm-select"
          value={spec.kind}
          aria-labelledby={`${spec.id}-shows`}
          onChange={(e) => layout.setKind(spec.id, e.target.value as TileKind)}
        >
          {TILE_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>{k.label}</option>
          ))}
        </select>
        {/* Named, not hinted at. A size that changes itself without saying so
            reads as a bug; `pipeline` is the only kind that does it. */}
        {TILE_KIND_INFO[spec.kind].minSize !== "s" && (
          <span className="tm-note">
            Needs the {TILE_SIZE_LABEL[TILE_KIND_INFO[spec.kind].minSize].toLowerCase()} size
          </span>
        )}
      </div>

      <div className="tm-group">
        <span className="tm-label">Size</span>
        <div className="tm-row">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={`tm-seg${spec.size === s ? " is-on" : ""}`}
              aria-pressed={spec.size === s}
              onClick={() => layout.setSize(spec.id, s)}
            >
              {TILE_SIZE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="tm-group">
        <span className="tm-label">Colour</span>
        <div className="tm-hues">
          {HUES.map((h: Hue) => (
            <button
              key={h}
              type="button"
              className={`tm-hue${spec.hue === h ? " is-on" : ""}`}
              style={{ background: `var(--c-${h}-tint)`, borderColor: `var(--c-${h})` }}
              onClick={() => layout.setHue(spec.id, h)}
              /* The name ships with the swatch: a grid of colours is the one
                 place a hue really is the only carrier, so it needs the label
                 in the accessible name at minimum. */
              aria-label={HUE_LABEL[h]}
              title={HUE_LABEL[h]}
              aria-pressed={spec.hue === h}
            >
              {spec.hue === h && <Check size={11} weight="bold" color={`var(--c-${h}-text)`} />}
            </button>
          ))}
        </div>
      </div>

      <div className="tm-group">
        <span className="tm-label">Position</span>
        <div className="tm-row">
          {/* The keyboard-reachable equivalent of dragging. Drag is a pointer
              affordance and cannot be the only way to reorder. */}
          <button
            type="button" className="tm-seg" disabled={index <= 0}
            onClick={() => layout.nudge(spec.id, -1)}
          >
            <ArrowLeft size={12} weight="bold" /> Earlier
          </button>
          <button
            type="button" className="tm-seg" disabled={index < 0 || index >= last}
            onClick={() => layout.nudge(spec.id, 1)}
          >
            Later <ArrowRight size={12} weight="bold" />
          </button>
        </div>
      </div>

      <div className="tm-foot">
        <button
          type="button"
          className="tm-remove"
          onClick={() => {
            layout.remove(spec.id);
            onClose();
          }}
        >
          <Trash size={13} /> Remove tile
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ── gallery ──────────────────────────────────────────────────────────────── */

const GALLERY_W = 336;

export function TileGallery({
  anchor, layout, onClose,
}: {
  anchor: HTMLElement;
  layout: TileLayout;
  onClose: () => void;
}) {
  const { ref, pos } = useAnchored(anchor, GALLERY_W);
  useDismiss(anchor, onClose, ref.current);

  return createPortal(
    <div
      ref={ref}
      className="tm tm-gallery"
      role="dialog"
      aria-label="Add a tile"
      style={{
        width: GALLERY_W,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div className="tm-head">
        <span className="tm-head-name">Add a tile</span>
        {layout.dirty && (
          <button type="button" className="tm-reset" onClick={layout.reset}>
            <ArrowsCounterClockwise size={12} /> Reset
          </button>
        )}
        <button type="button" className="tm-x" onClick={onClose} aria-label="Close">
          <X size={13} weight="bold" />
        </button>
      </div>

      <ul className="tm-kinds">
        {TILE_KINDS.map((k) => {
          /* Duplicates are allowed — two metric tiles showing different stats
             is a reasonable layout — so the count is shown rather than the row
             being disabled. Blocking it would be a guess about intent. */
          const used = layout.layout.filter((t) => t.kind === k.kind).length;
          return (
            <li key={k.kind}>
              <button
                type="button"
                className="tm-kind"
                onClick={() => {
                  layout.add(k.kind);
                  onClose();
                }}
              >
                <Glyph Icon={k.Icon} hue={k.hue} size={28} />
                <span className="tm-kind-body">
                  <span className="tm-kind-name">
                    {k.label}
                    {used > 0 && <span className="tm-kind-used">{used} on your home</span>}
                  </span>
                  <span className="tm-kind-blurb">{k.blurb}</span>
                </span>
                <Plus size={13} weight="bold" className="tm-kind-add" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
}
