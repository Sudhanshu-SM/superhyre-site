import { GridFour } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { Bento } from "./Bento";
import { Tasks } from "./Tasks";
import { TileGallery, TileMenu } from "./TileMenu";
import { useTileLayout } from "./tileLayout";
import type { Campaign } from "./workspaces";

/**
 * Home — what should I do now.
 *
 * ── THE TASK LIST IS THE PAGE ───────────────────────────────────────────────
 * One question, and the task list answers it. Everything else describes the
 * campaign's state, which is context for that answer rather than the answer —
 * so the list comes first, takes the page's one hero treatment, and the bento
 * sits under it as "at a glance".
 *
 * The campaign header came off with this change. On a page with no composer
 * and no rail it named a scope nothing on the page disputed: the sidebar
 * already shows the current campaign, and every tile and task row names it.
 *
 * The composer, the transcript and the rail of past briefs moved to `Agent`.
 * Holding both here gave one page two unrelated jobs — a survey is scanned, a
 * conversation is worked — and they competed for the same viewport, which is
 * why the composer kept ending up below the fold however the rows were sized.
 *
 * ── HOW A SUGGESTION GETS FROM HERE TO THERE ────────────────────────────────
 * Every tile and task action still produces a concrete brief. It cannot drop
 * it into a composer that is no longer on this page, so it hands the text up
 * to the console, which navigates to Agent and seeds the field there.
 *
 * Deliberately NOT auto-sending on arrival. A suggestion the product wrote is
 * a starting point, and firing it off during a navigation would take the edit
 * away at the exact moment the recruiter knows something the suggestion does
 * not.
 */

export function Home({
  campaign, onBrief,
}: {
  campaign: Campaign;
  /** Hands a prompt to the Agent page and navigates there. */
  onBrief: (prompt: string) => void;
}) {
  const tiles = useTileLayout();
  /* The menu holds the element it was opened from, not just the id: it anchors
     to that button and returns focus to it on dismissal. */
  const [menu, setMenu] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [gallery, setGallery] = useState<HTMLElement | null>(null);

  /* Stable, so Bento and Tasks do not re-render on every Home render for a
     callback that never changes. */
  const brief = useCallback((prompt: string) => onBrief(prompt), [onBrief]);

  const menuSpec = menu ? tiles.layout.find((t) => t.id === menu.id) : undefined;

  return (
    /* `is-solo`: no rail on this page, so the grid must not reserve its
       column. Left as a two-track grid it held 340px of empty space against
       the right edge and the content stopped short of it for no reason. */
    <div className="orc is-solo">
      <div className="orc-main">
        {/* ── THE PAGE'S OWN NAME ──
            The sidebar shows which page you are on, but only while it is
            expanded — railed it is an icon, and the surface then had nothing
            on it saying where you were. A page heading is also what the widget
            control needs to sit beside: it was next to "At a glance", which
            put it inside the thing it edits. */}
        <header className="orc-page">
          <h1 className="orc-page-h">Home</h1>
          <button
            type="button"
            className="orc-add"
            onClick={(e) => setGallery(e.currentTarget)}
            aria-haspopup="dialog"
          >
            <GridFour size={14} weight="bold" aria-hidden="true" />
            Edit widgets
          </button>
        </header>

        <div className="orc-stream">
          <div className="orc-open">
            {/* ── TASKS FIRST, AND TASKS AS THE HERO ──
                This page answers one question — what should I do now — and the
                task list is the only thing on it that answers directly. The
                bento describes the campaign's state, which is context for that
                answer rather than the answer itself.

                It also takes the Tier 0 treatment, which is free here: the
                hierarchy allows exactly one hero per screen, and the composer
                that held that slot has moved to the Agent page. So the list
                gets this page's one resting shadow and its one large heading,
                and the bento reads as clearly secondary underneath. */}
            <Tasks onOpen={brief} hero />

            {/* Context for the tasks above. Labelled, because an unheaded grid
                of cards below a headed section reads as part of it. */}
            <section className="orc-context" aria-label="Campaign at a glance">
              {/* Just the label now. The widget control moved to the page
                  header: "Edit widgets" names what it acts on, so it does not
                  need to sit adjacent to it, and one page-level control in the
                  page's own header is where someone looks for it. */}
              <h2 className="orc-context-h">At a glance</h2>

              <Bento
                layout={tiles.layout}
                campaign={campaign}
                onOpen={brief}
                onEditTile={(id, el) => setMenu({ id, el })}
                onReorder={tiles.reorder}
                reorderable
              />
            </section>
          </div>
        </div>
      </div>

      {menu && menuSpec && (
        <TileMenu
          spec={menuSpec}
          anchor={menu.el}
          layout={tiles}
          onClose={() => setMenu(null)}
        />
      )}

      {gallery && (
        <TileGallery anchor={gallery} layout={tiles} onClose={() => setGallery(null)} />
      )}
    </div>
  );
}
