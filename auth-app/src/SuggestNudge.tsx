import { useEffect, useState } from "react";
import { type ApiSuggestion, campaignSuggestions } from "./api/campaigns";
import { LIVE } from "./api/client";
import { nudgeText, showPhrase } from "./suggestNudge";

/** The nudge as one line with Yes / Not now, like the line that offers to reject the others past the years (sp-similar). */
export function SuggestNudgeLine({ text, onShow, onNotNow }: { text: string; onShow: () => void; onNotNow: () => void }) {
  return (
    <p className="sp-similar" role="status">
      <span>{text}</span>
      <button type="button" className="cw-btn is-primary" onClick={onShow}>Show me</button>
      <button type="button" className="cw-btn" onClick={onNotNow}>Not now</button>
    </p>
  );
}

/**
 * Looks for a suggested change on the campaign each time `asked` goes up (a rejection with a reason) and says so in one line. "Show me"
 * sends the agent the words that put it in the chat as a card; "Not now" puts the line away until the next rejection with a reason.
 */
export function SuggestNudge({ campaignId, campaignName, asked, hidden, onAgent }: {
  campaignId: string;
  campaignName: string;
  asked: number;
  /** Another line is being said (the one that offers the others past the years): one at a time. */
  hidden: boolean;
  onAgent: (prompt?: string, opts?: { send?: boolean }) => void;
}) {
  const [waiting, setWaiting] = useState<readonly ApiSuggestion[]>([]);
  useEffect(() => {
    if (!LIVE || asked === 0) return undefined;
    let live = true;
    campaignSuggestions(campaignId).then((rows) => { if (live) setWaiting(rows); }).catch(() => {});
    return () => { live = false; };
  }, [campaignId, asked]);
  const text = nudgeText(waiting);
  if (!text || hidden) return null;
  return (
    <SuggestNudgeLine
      text={text}
      onShow={() => { setWaiting([]); onAgent(showPhrase(campaignName), { send: true }); }}
      onNotNow={() => setWaiting([])}
    />
  );
}
