import { CaretRight } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { dailySearchApi, type DailyRead } from "./api/dailySearch";
import type { RailChat } from "./chatGroups";
import { DailySearchDialog } from "./DailySearchDialog";
import { dailyChatOf, dailyLine } from "./railDailyView";

/**
 * "Daily sourcing", the first of the rows under the figures at the top of the chat list: whether the daily search is on, and how many people
 * it found today, for the campaign the page is on or for all of them. Pressing it goes to where the people are: the campaign's own daily search chat
 * (the agent writes each morning's finds there), or, for all campaigns, the daily search itself. It is not drawn while the server has the
 * daily search switched off, or before it has answered.
 */

type Props = {
  /** The campaign the page is on, or null for all of them. */
  campaign: { id: string; name: string } | null;
  chats: readonly RailChat[] | undefined;
  /** Goes up when something the page did could have moved the numbers (a search ran, people were added): they are read again. */
  refresh: number;
  onOpenChat: (chat: RailChat) => void;
};

export function RailDaily({ campaign, chats, refresh, onOpenChat }: Props) {
  const [read, setRead] = useState<DailyRead | null>(null);
  const [dialog, setDialog] = useState(false);
  const [again, setAgain] = useState(0);

  useEffect(() => {
    let current = true;
    dailySearchApi
      .glance()
      // A read that fails after one was shown keeps what is on screen: the numbers are not worth a message.
      .then((r) => current && setRead(r))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [refresh, again]);

  /* Coming back to the tab: a morning may have run while it was away. */
  useEffect(() => {
    const back = () => { if (document.visibilityState === "visible") setAgain((n) => n + 1); };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, []);

  const line = useMemo(() => dailyLine(read, campaign), [read, campaign?.id]);
  if (!line) return null;
  const chat = line.goes === "chat" && campaign ? dailyChatOf(chats, campaign.id) : null;
  const press = () => (chat ? onOpenChat(chat) : setDialog(true));
  const where = chat ? "Open the daily search chat" : "Open the daily search";

  return (
    <>
      <button type="button" className="hx-day" onClick={press} title={line.detail} aria-label={`Daily sourcing, ${line.value}. ${where}`}>
        <span className="hx-day-t">Daily sourcing</span>
        <span className={`hx-day-v is-${line.state.toLowerCase()}`}>
          <span className="hx-day-x">{line.value}</span>
          <CaretRight size={12} weight="bold" className="hx-day-c" aria-hidden="true" />
        </span>
      </button>
      <DailySearchDialog open={dialog} onClose={() => { setDialog(false); setAgain((n) => n + 1); }} />
    </>
  );
}
