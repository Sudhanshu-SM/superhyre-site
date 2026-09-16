import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LAYOUT, SIZE_RANK, TILE_KIND_INFO } from "./orchestrator";
import type { Hue, TileKind, TileSize, TileSpec } from "./orchestrator";

/**
 * The home surface's tile layout, owned by the person looking at it.
 *
 * ── WHY THIS IS PERSISTED LOCALLY ───────────────────────────────────────────
 * A layout is a user preference, and the table that would hold it
 * (`user_preferences`) does not exist. The options were to ship no
 * customisation until it does, or to persist locally and migrate later. Local
 * wins: the feature is real today, and a layout is the least damaging thing in
 * the product to lose — worst case a recruiter sees the default again.
 *
 * What this is NOT is a pretend backend. Nothing here claims to sync, there is
 * no spinner, and no copy implies the layout follows you between machines.
 */

/* ── v2, AND THE BUMP IS THE POINT OF VERSIONING THE KEY ──
   The bento went from a FOUR-column grid to a three-column one, and the
   default from five tiles to four. A spec saved against the old grid is not
   wrong in any way this file can detect — `kind`, `size` and `hue` all still
   validate — but a `size: "l"` that meant "half the width" now means
   two-thirds, and a five-tile layout that tiled cleanly at four columns
   leaves a hole at three.

   So the stored data is structurally valid and semantically stale, which is
   exactly the case the version exists for. Bumping the key discards it
   silently and the default takes over; not bumping it left people looking at
   a layout that could not be produced by the current grid. */
const KEY = "superhyre.home.layout.v5";

/**
 * Versioned in the key rather than inside the payload, so a shape change is a
 * new key and old data is simply never read. Migrating a cosmetic preference
 * is not worth the code to do it — but the bump has to actually happen when
 * the shape changes, which is the mistake that shipped a grid change without
 * one and left saved layouts rendering against a grid that no longer existed.
 */

export type TileLayout = {
  layout: readonly TileSpec[];
  setSize: (id: string, size: TileSize) => void;
  /**
   * Change WHAT a tile shows, keeping its place in the grid.
   *
   * Position and colour survive, because they are the user's arrangement and
   * a kind swap is not a request to undo it. Size survives too UNLESS the new
   * kind will not fit it, in which case it is raised to the kind's `minSize`
   * — silently growing a tile is better than rendering one whose content
   * overflows its own card, which is what the unguarded version did.
   */
  setKind: (id: string, kind: TileKind) => void;
  setHue: (id: string, hue: Hue) => void;
  remove: (id: string) => void;
  add: (kind: TileKind) => void;
  /** Moves `id` into the slot currently held by `toId`, shifting the rest. */
  reorder: (id: string, toId: string) => void;
  /** Signed step, for the keyboard path in the tile menu. */
  nudge: (id: string, by: -1 | 1) => void;
  reset: () => void;
  /** True when the layout differs from the shipped default. */
  dirty: boolean;
};

/**
 * Anything in storage is untrusted: it was written by an older build, or by a
 * user with devtools open. A spec naming a `kind` this build no longer ships
 * would crash the grid on render, so every field is checked and bad entries are
 * dropped rather than repaired — a half-understood tile is worse than absent.
 */
function parse(raw: string | null): readonly TileSpec[] | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;

  const sizes: readonly TileSize[] = ["s", "m", "l"];
  const seen = new Set<string>();
  const clean: TileSpec[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const { id, kind, size, hue } = item as Record<string, unknown>;
    if (typeof id !== "string" || seen.has(id)) continue;
    if (typeof kind !== "string" || !(kind in TILE_KIND_INFO)) continue;
    if (typeof size !== "string" || !sizes.includes(size as TileSize)) continue;
    if (typeof hue !== "string") continue;
    seen.add(id);
    clean.push({ id, kind: kind as TileKind, size: size as TileSize, hue: hue as Hue });
  }
  /* An empty array is a legitimate choice — someone removed every tile — but an
     array that parsed to empty because every entry was junk is not. There is no
     way to tell the two apart after the fact, so a non-empty input that cleans
     to nothing falls back to the default. */
  if (clean.length === 0 && data.length > 0) return null;
  return clean;
}

export function useTileLayout(): TileLayout {
  const [layout, setLayout] = useState<readonly TileSpec[]>(() => {
    /* Read once, lazily, inside the initialiser: reading during render on every
       pass would hit localStorage on each keystroke elsewhere in the page. */
    if (typeof window === "undefined") return DEFAULT_LAYOUT;
    return parse(window.localStorage.getItem(KEY)) ?? DEFAULT_LAYOUT;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
      /* Private browsing and full quotas both throw here. Losing the
         preference is acceptable; taking the surface down over it is not. */
    }
  }, [layout]);

  const setSize = useCallback((id: string, size: TileSize) => {
    setLayout((l) => l.map((t) => (t.id === id ? { ...t, size } : t)));
  }, []);

  const setKind = useCallback((id: string, kind: TileKind) => {
    setLayout((l) => l.map((t) => {
      if (t.id !== id) return t;
      const need = TILE_KIND_INFO[kind].minSize;
      /* Raise only. A kind that fits `s` keeps whatever size the user chose,
         including a deliberately large one. */
      const size = SIZE_RANK[t.size] < SIZE_RANK[need] ? need : t.size;
      return { ...t, kind, size };
    }));
  }, []);

  const setHue = useCallback((id: string, hue: Hue) => {
    setLayout((l) => l.map((t) => (t.id === id ? { ...t, hue } : t)));
  }, []);

  const remove = useCallback((id: string) => {
    setLayout((l) => l.filter((t) => t.id !== id));
  }, []);

  const add = useCallback((kind: TileKind) => {
    setLayout((l) => {
      const info = TILE_KIND_INFO[kind];
      /* Ids must stay unique across repeated adds of the same kind, and must
         not collide with the default layout's hand-written ids. A counter over
         the existing set is enough and stays readable in devtools, which a
         random suffix would not. */
      let n = 1;
      let id = `${kind}-${n}`;
      while (l.some((t) => t.id === id)) id = `${kind}-${++n}`;
      /* `info.size` is the kind's preferred size and is already >= minSize for
         every kind, but clamping here means a future entry that disagrees
         cannot ship a tile that overflows on the day it is added. */
      const size = SIZE_RANK[info.size] < SIZE_RANK[info.minSize] ? info.minSize : info.size;
      return [...l, { id, kind, size, hue: info.hue }];
    });
  }, []);

  const reorder = useCallback((id: string, toId: string) => {
    if (id === toId) return;
    setLayout((l) => {
      const from = l.findIndex((t) => t.id === id);
      const to = l.findIndex((t) => t.id === toId);
      if (from < 0 || to < 0) return l;
      const next = [...l];
      /* Splice out first, then insert at the target's index as measured in the
         shortened array. Computing the destination before the removal is the
         classic off-by-one here: dragging rightward lands one slot short. */
      const [moved] = next.splice(from, 1);
      /* `from` came from findIndex on this same array, so the splice always
         yields an element — but noUncheckedIndexedAccess cannot know that, and
         asserting it with `!` would hide a real bug if the guard above ever
         changed. Bail instead. */
      if (!moved) return l;
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const nudge = useCallback((id: string, by: -1 | 1) => {
    setLayout((l) => {
      const from = l.findIndex((t) => t.id === id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= l.length) return l;
      const a = l[from];
      const b = l[to];
      if (!a || !b) return l;
      const next = [...l];
      next[from] = b;
      next[to] = a;
      return next;
    });
  }, []);

  const reset = useCallback(() => setLayout(DEFAULT_LAYOUT), []);

  const dirty =
    layout.length !== DEFAULT_LAYOUT.length ||
    layout.some((t, i) => {
      const d = DEFAULT_LAYOUT[i];
      /* Lengths are compared first, so a missing counterpart here means the
         arrays diverged — which is itself the dirty answer. */
      if (!d) return true;
      return t.kind !== d.kind || t.size !== d.size || t.hue !== d.hue;
    });

  return { layout, setSize, setKind, setHue, remove, add, reorder, nudge, reset, dirty };
}
