import { ArrowRight, MagnifyingGlass, PushPin } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { pinKey, togglePin, usePins } from "./chatPins";

/**
 * "Campaigns" in the chat list, on the page: a search box over a wrap of blocks, one per campaign still running. Pressing a
 * block opens a new chat in that campaign, so the agent has its brief, its people and its tasks from the first message. A
 * pin on a block puts the campaign in the list's Pinned, with its chats under it.
 */

export type PickerCampaign = {
  id: string;
  name: string;
  /** Role, company, place: what tells two campaigns apart. */
  meta: string;
  found: number;
  shortlisted: number;
  /** Chats already in it, and when the last one was written. */
  chats: number;
  lastAt: number;
};

type Props = {
  campaigns: readonly PickerCampaign[];
  onStart: (campaign: { id: string; name: string }) => void;
  onClose: () => void;
};

/** Pinned first, then the ones chatted about most recently, then the rest as they came. */
export function orderCampaigns(list: readonly PickerCampaign[], pins: readonly string[]): PickerCampaign[] {
  const at = (c: PickerCampaign) => {
    const i = pins.indexOf(pinKey("campaign", c.id));
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => at(a.c) - at(b.c) || b.c.lastAt - a.c.lastAt || a.i - b.i)
    .map((x) => x.c);
}

export function CampaignsPicker({ campaigns, onStart, onClose }: Props) {
  const pins = usePins();
  const [q, setQ] = useState("");
  /* The pin that was just pressed, so it alone stamps down. */
  const [popped, setPopped] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => field.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, []);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = orderCampaigns(campaigns, pins);
    return needle ? list.filter((c) => `${c.name} ${c.meta}`.toLowerCase().includes(needle)) : list;
  }, [campaigns, pins, q]);

  return (
    <section className="hxp" aria-label="Campaigns" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <header className="hxp-head">
        <h1 className="hxp-title">Campaigns</h1>
        <p className="hxp-sub">Pick one to start a chat about it. The agent will know its brief, its people and its tasks.</p>
      </header>

      <label className="hxp-search">
        <MagnifyingGlass size={19} aria-hidden="true" />
        <input ref={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" aria-label="Search campaigns" />
      </label>

      {campaigns.length === 0 ? (
        <p className="hxp-none">Nothing is running yet. Tell the agent about a role and it will set up the campaign.</p>
      ) : rows.length === 0 ? (
        <p className="hxp-none">No campaign matches “{q.trim()}”.</p>
      ) : (
        <ul className="hxp-grid">
          {rows.map((c, i) => {
            const pinned = pins.includes(pinKey("campaign", c.id));
            return (
              <li key={c.id} className="hxp-card" style={{ ["--i" as string]: Math.min(i, 11) }}>
                <button type="button" className="hxp-open" onClick={() => onStart({ id: c.id, name: c.name })}>
                  <span className="hxp-name">{c.name}</span>
                  <span className="hxp-meta">{c.meta || " "}</span>
                  <span className="hxp-foot">
                    <span className="hxp-nums">{c.found} found · {c.shortlisted} shortlisted</span>
                    <span className="hxp-side">
                      {c.chats > 0 && <span className="hxp-chats">{c.chats} {c.chats === 1 ? "chat" : "chats"}</span>}
                      <span className="hxp-go" aria-hidden="true">New chat <ArrowRight size={14} weight="bold" /></span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`hxp-pin${pinned ? " is-on" : ""}${popped === c.id ? " is-pop" : ""}`}
                  onClick={() => { setPopped(pinned ? null : c.id); togglePin("campaign", c.id); }}
                  aria-pressed={pinned}
                  aria-label={pinned ? `Unpin ${c.name}` : `Pin ${c.name}`}
                  title={pinned ? "Unpin" : "Pin to the list"}
                >
                  <PushPin size={18} weight={pinned ? "fill" : "regular"} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
