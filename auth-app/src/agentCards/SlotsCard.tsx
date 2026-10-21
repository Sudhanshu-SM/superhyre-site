import { useMemo } from "react";
import type { ChatCard } from "../api/agent";
import { ConnectorLogo } from "../ConnectorLogo";
import { sendAction } from "../liveChat";
import { clock, dayWords } from "../meetingsView";
import { Cta } from "./Cta";
import { lengthWords } from "./meetingModel";
import "./meetingCard.css";

/** What a pick asks the agent for; the card books nothing itself. */
export function bookText(card: Pick<Extract<ChatCard, { kind: "slots" }>, "forName">, startsAt: string, when: string): string {
  const what = card.forName ? `the interview with ${card.forName}` : "the meeting";
  return `Book ${what} on ${when} (${startsAt})`;
}

/**
 * A pick: for a named person it is the invitation card for exactly that time, asked for in code (no words to route);
 * with nobody named it is the words, for the agent to ask who it is for.
 */
export function pick(card: Extract<ChatCard, { kind: "slots" }>, s: { startsAt: string; endsAt: string; when: string }): void {
  const label = `Book ${dayWords(s.startsAt, card.timezone)}, ${clock(s.startsAt, card.timezone)}`;
  sendAction(
    bookText(card, s.startsAt, s.when),
    label,
    card.campaignId ?? undefined,
    card.campaignCandidateId ? { book: { campaignCandidateId: card.campaignCandidateId, startsAt: s.startsAt, endsAt: s.endsAt } } : undefined,
  );
}

/**
 * Free times on the person's calendar, as choices: the days down the side, the times as buttons. Picking one asks
 * the agent to book it, which brings the invitation card; the hours it used are said once if they were never stated.
 */
export function SlotsCard({ card }: { card: Extract<ChatCard, { kind: "slots" }> }): JSX.Element {
  const days = useMemo(() => {
    const out: Array<{ day: string; slots: typeof card.slots }> = [];
    for (const s of card.slots) {
      const day = dayWords(s.startsAt, card.timezone);
      const last = out.at(-1);
      if (last?.day === day) last.slots = [...last.slots, s];
      else out.push({ day, slots: [s] });
    }
    return out;
  }, [card]);
  const usual = card.assumed.some((a) => /working day|working days/.test(a));
  return (
    <article className="rep-card lt-approval mt fs" aria-label="Free times">
      <header className="rep-app">
        <span className="lt-app-mark" aria-hidden="true"><ConnectorLogo id="calendar" size={16} decorative /></span>
        <span className="rep-app-name">{card.forName ? `Free times for ${card.forName}` : "Free times"}</span>
      </header>
      <p className="mt-sub">{lengthWords(card.durationMinutes)} each, in your time zone ({card.timezone}).</p>
      <ul className="fs-days">
        {days.map((d) => (
          <li key={d.day} className="fs-day">
            <span className="fs-day-k">{d.day}</span>
            <span className="fs-times">
              {d.slots.map((s) => (
                <Cta key={s.startsAt} small onClick={() => pick(card, s)}>
                  {clock(s.startsAt, card.timezone)}
                </Cta>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {usual && <p className="fs-hint">These use the usual working hours. Tell me yours and I'll remember them.</p>}
    </article>
  );
}
