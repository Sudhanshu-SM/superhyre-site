import { X } from "@phosphor-icons/react";
import { useState } from "react";
import { useCampaignRows } from "./campaignStore";
import { useSession, visibleCampaigns } from "./roleStore";

/**
 * A recommendation on Home for a team that already runs its roles from a sheet: campaigns with nobody in them yet, and a
 * way to bring over who was shared and where each person stands. It asks the agent (a sentence in the composer, the
 * link pasted after it); nothing is connected by this card. Said once, and a "Not now" is remembered on this device.
 */

const KEY = "superhyre.transition.dismissed";

const readDismissed = (): boolean => {
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
};

export function TransitionNudge({ onAsk }: { onAsk: (prompt: string) => void }) {
  const rows = useCampaignRows();
  const session = useSession();
  const [gone, setGone] = useState(readDismissed);
  const empty = visibleCampaigns(rows, session).filter(
    (r) => r.status === "active" && r.canManage !== false && !r.loading && Object.values(r.funnel).every((n) => n === 0),
  );
  if (gone || empty.length === 0) return null;
  const first = empty[0]!;
  const dismiss = () => {
    setGone(true);
    try { window.localStorage.setItem(KEY, "1"); } catch { /* it comes back next visit, which is fine */ }
  };
  return (
    <aside className="hm-nudge" aria-label="Bring your running roles over">
      <p className="hm-nudge-t">
        <b>Already running {empty.length === 1 ? first.name : `${first.name} and ${empty.length - 1} more`} in a Google Sheet?</b>{" "}
        Connect it and I'll add the people your team already shared and put each on the stage its status says, so the numbers start from where you really are.
      </p>
      <button type="button" className="hm-nudge-go" onClick={() => onAsk(`Connect our candidate sheet for ${first.name}: `)}>Connect a sheet</button>
      <button type="button" className="hm-nudge-x" onClick={dismiss} aria-label="Not now" title="Not now"><X size={14} weight="bold" /></button>
    </aside>
  );
}
