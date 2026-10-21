import { MagnifyingGlass } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ModeId } from "./orchestrator";
import { LIVE } from "./api/client";
import { useCampaignRows, useCampaignsReady } from "./campaignStore";
import { useCan } from "./can";
import { mayChangeCampaign } from "./campaignRights";
import { useSession } from "./roleStore";
import { fitChips, ideaRows, ideasFor, liveIdeas, type Measure, pickChips } from "./recs";
import "./recs.css";

/**
 * Measures chip text in the page's own font (a canvas, once per width), so a label is judged against the room
 * it really takes. Without a canvas (a test, the server) it is undefined and `fitChips` estimates.
 */
let scratch: CanvasRenderingContext2D | null | undefined;
function measureIn(row: HTMLElement | null): Measure | undefined {
  if (!row || typeof CanvasRenderingContext2D === "undefined") return undefined;
  try {
    scratch ??= document.createElement("canvas").getContext("2d");
    const ctx = scratch;
    if (!ctx) return undefined;
    ctx.font = `400 13px ${getComputedStyle(row).fontFamily}`;
    // A touch over, so a font that has not finished loading still leaves a label room.
    return (text) => ctx.measureText(text).width * 1.03;
  } catch {
    return undefined;
  }
}

/**
 * IdeaChips — the row under the composer: up to three ideas to start from, and the way to
 * search past chats at its end.
 *
 * It is one line and stays one line. The ideas used to be three cards above the composer,
 * which put the field low on the page and made the landing a stack of boxes; now the
 * composer sits where the eye lands and the ideas are a quiet row beneath it. A chip is
 * never cut mid-word: when the row is too narrow for the usual words they are said in
 * fewer (`compact`), and on a narrower row there are fewer chips, so the row never wraps
 * and never pushes the page sideways.
 *
 * They move on by themselves: `visit` goes up each time the page is opened, and the three
 * shown are the visit-th three of the ideas in order of relevance. There is no control
 * for it, because asking a person to shuffle suggestions is asking them to do the work.
 *
 * Hovering or focusing a chip shows its sentence as ghost text in the empty composer, and
 * pressing it types the sentence in. It never sends.
 *
 * Connected, the ideas are the general ones (what needs attention, how the agents are doing,
 * find people for a role) followed by each running campaign's own next moves, so the row is
 * never empty and never claims a figure it does not have.
 */
export function IdeaChips({
  mode, visit, onPick, onPreview, onFind,
}: {
  mode: ModeId;
  /** Goes up on each visit; which three of the ideas are shown. */
  visit: number;
  onPick: (prompt: string) => void;
  onPreview: (prompt: string | null) => void;
  /** Opens the search of past chats. */
  onFind: () => void;
}) {
  const rows = useCampaignRows();
  const ready = useCampaignsReady();
  const canCreate = useCan("campaign.create");
  const canAddClient = useCan("client.manage");
  const session = useSession();
  const rowRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  /* How wide the row is decides how many chips it holds, so it is read before paint and on every resize. */
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const read = () => setWidth((w) => {
      const next = Math.round(el.getBoundingClientRect().width);
      return w === next ? w : next;
    });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Until the campaigns have arrived the ideas are not known; the row waits with only its search
     button, so the general ideas do not flash before the real ones replace them. */
  const ideas = LIVE ? (ready ? liveIdeas(rows, { canCreate, canAddClient, mayChange: (row) => mayChangeCampaign(session, row) }) : []) : ideasFor(mode);
  const page = pickChips(ideas, { visit, width });
  // Said whole: the usual words if the row holds them, fewer words if not, fewer chips if still not.
  const shown = fitChips(page, width, measureIn(rowRef.current));

  return (
    <div className="orc-chips" ref={rowRef} role="group" aria-label="Ideas to start from">
      {shown.map(({ idea, label }) => (
        <button
          key={idea.id}
          type="button"
          className="orc-chip"
          title={idea.because}
          onClick={() => { onPreview(null); onPick(idea.prompt); }}
          onMouseEnter={() => onPreview(idea.prompt)}
          onMouseLeave={() => onPreview(null)}
          onFocus={() => onPreview(idea.prompt)}
          onBlur={() => onPreview(null)}
        >
          <span className="orc-chip-t">{label}</span>
        </button>
      ))}
      <button
        type="button"
        className="orc-find"
        onClick={onFind}
        aria-label="Search chats"
        aria-keyshortcuts="/"
        title="Search chats (/)"
      >
        <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * IdeaList: three suggestions under the composer, one under the other, each a full sentence with a small
 * icon; and a fourth line that opens the search of past chats. Pressing a complete question sends it; an
 * open one (find people for a role) is put in the composer to be finished. Hovering shows the sentence as
 * ghost text in an empty composer. The page hides it while a brief is being written and in a long chat.
 *
 * With a campaign in focus the sentences are about it and say its name.
 */
export function IdeaList({
  focusName, onPick, onAsk, onPreview, onFind,
}: {
  focusName?: string | null;
  /** Puts the prompt in the composer. */
  onPick: (prompt: string) => void;
  /** Sends the prompt as the message. */
  onAsk: (prompt: string) => void;
  onPreview: (prompt: string | null) => void;
  /** Opens the search of past chats. */
  onFind: () => void;
}) {
  const rows = useCampaignRows();
  const ready = useCampaignsReady();
  const canCreate = useCan("campaign.create");
  const canAddClient = useCan("client.manage");
  const session = useSession();
  const focus = focusName ? rows.find((r) => r.name === focusName) : undefined;
  if (!ready && LIVE) {
    return (
      <div className="orc-ideas" role="group" aria-label="Ideas to start from" data-tour="ideas">
        <button type="button" className="orc-idea orc-idea-find" onClick={onFind} aria-keyshortcuts="/">
          <MagnifyingGlass size={15} weight="bold" aria-hidden="true" />
          <span>Search past chats</span>
        </button>
      </div>
    );
  }
  const list = ideaRows({
    focusName: focusName ?? null,
    canCreate,
    canAddClient,
    hasCampaigns: rows.length > 0,
    ...(focus ? { mayChange: mayChangeCampaign(session, focus) } : {}),
  });
  return (
    <div className="orc-ideas" role="group" aria-label="Ideas to start from" data-tour="ideas">
      {list.map((r) => (
        <button
          key={r.id}
          type="button"
          className="orc-idea"
          onClick={() => { onPreview(null); (r.send ? onAsk : onPick)(r.prompt); }}
          onMouseEnter={() => onPreview(r.prompt)}
          onMouseLeave={() => onPreview(null)}
          onFocus={() => onPreview(r.prompt)}
          onBlur={() => onPreview(null)}
        >
          <r.Icon size={15} aria-hidden="true" />
          <span>{r.label}</span>
        </button>
      ))}
      <button type="button" className="orc-idea orc-idea-find" onClick={onFind} aria-keyshortcuts="/" title="Search chats (/)">
        <MagnifyingGlass size={15} aria-hidden="true" />
        <span>Search past chats</span>
      </button>
    </div>
  );
}
