import { CaretDown } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConfigSlot } from "./Rail";
import type { RailSlot } from "./railConfig";
import type { RailChat } from "./chatGroups";

/**
 * The slim line above the conversation: what chat this is and, when it is about a campaign, which one, and one press away
 * what the agent knows about it. There is no side panel: the set-up (owner, filters, channels...), the earlier chats on the
 * campaign and the agents at work are in the popover, so the conversation has the whole width and the context is still
 * inspectable. A chat about no campaign in particular shows no campaign at all (the list's row menu puts it in one).
 */
type Props = {
  /** The chat's name, or nothing for one that has none yet (a new chat is not labelled "New chat"). */
  title: string;
  campaign: { id: string; name: string } | null;
  /** "29 found · 3 shortlisted": plain counts, or null while they are not known. */
  counts: string | null;
  slots: readonly RailSlot[];
  earlier: readonly RailChat[];
  /** The agents at work (standing searches), drawn by the page. */
  agents: ReactNode;
  onOpenCampaign: (id: string) => void;
  onOpenChat: (chat: RailChat) => void;
};

export function ChatHeader({ title, campaign, counts, slots, earlier, agents, onOpenCampaign, onOpenChat }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <header className="hx-head">
      {title ? <h1 className="hx-title" title={title}>{title}</h1> : <span className="hx-title" />}
      {campaign && (
        <div className="hx-ctx" ref={box}>
          <button type="button" className="hx-chip" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
            <span className="hx-chip-name">{campaign.name}</span>
            <span className="hx-chip-sub">{counts ?? ""}</span>
            <CaretDown size={11} weight="bold" aria-hidden="true" />
          </button>
          {open && (
            <div className="hx-pop" role="dialog" aria-label="What the agent knows">
              <p className="hx-pop-h">What the agent knows about <strong>{campaign.name}</strong></p>
              {slots.length > 0 && (
                <ul className="rail-config-rows hx-pop-rows">
                  {slots.map((slot) => <li key={slot.key}><ConfigSlot slot={slot} /></li>)}
                </ul>
              )}
              {agents && <div className="hx-pop-agents">{agents}</div>}
              {earlier.length > 0 && (
                <div className="hx-pop-earlier">
                  <p className="hx-pop-k">Earlier chats on this campaign</p>
                  <ul>
                    {earlier.map((c) => (
                      <li key={c.id}><button type="button" onClick={() => { setOpen(false); onOpenChat(c); }}>{c.title}</button></li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="hx-pop-foot">
                <button type="button" className="hx-link" onClick={() => { setOpen(false); onOpenCampaign(campaign.id); }}>Open the campaign</button>
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
