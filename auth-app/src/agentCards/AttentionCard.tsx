import { useState } from "react";
import type { Suggestion } from "../api/agent";
import { sendAction } from "../liveChat";
import { Cta } from "./Cta";
import "./attentionCard.css";

/**
 * What needs the person across their open campaigns: a row each, the most urgent first, one fact on each and a quiet button
 * to the way on. A button is either a page of the console or something the agent already knows how to do, sent as a turn
 * with no message of the person's.
 */

export type AttentionGroup = "overdue" | "today" | "waiting" | "soon";
export type AttentionItem = { campaignId: string | null; campaign: string; group?: AttentionGroup; line: string; cta: Suggestion };
export type TaskFigures = { open: number; overdue: number; today: number; later: number };

const GROUP_LABEL: Record<AttentionGroup, string> = { overdue: "Overdue", today: "Today", waiting: "Waiting on you", soon: "This week" };

/** "5 open tasks: 2 overdue, 1 due today, 2 later": Home's own figures, plain, with the zeros left out. */
export function tasksLine(t: TaskFigures): string {
  if (!t.open) return "";
  const parts = [t.overdue ? `${t.overdue} overdue` : "", t.today ? `${t.today} due today` : "", t.later ? `${t.later} later` : ""].filter(Boolean);
  return `${t.open} open ${t.open === 1 ? "task" : "tasks"}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

export function AttentionCard({ items, more = 0, tasks = null, campaignName }: { items: readonly AttentionItem[]; more?: number; tasks?: TaskFigures | null; /** The one campaign the card is about: named once in the heading, not on every row. */ campaignName?: string | undefined }): JSX.Element {
  /* A press acts once. */
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set());
  const facts = tasks ? tasksLine(tasks) : "";
  if (!items.length && !facts) return <p className="at-none" role="status">{campaignName ? `Nothing on ${campaignName} needs you right now.` : "Nothing is on your plate right now."}</p>;
  let lastGroup: AttentionGroup | undefined;
  return (
    <section className="at" aria-label={campaignName ? `${campaignName}: what needs you` : "Your plate"}>
      <h3 className="at-h">{campaignName ? `${campaignName}: what needs you` : "Your plate"}</h3>
      {facts && <p className="at-facts">{facts}</p>}
      <ul className="at-rows">
        {items.map((it, i) => {
          const key = `${it.campaignId ?? it.campaign}:${i}`;
          const caption = it.group && it.group !== lastGroup ? GROUP_LABEL[it.group] : null;
          lastGroup = it.group;
          return (
            <li key={key} className="at-item">
              {caption && <p className="at-group">{caption}</p>}
              <div className="at-row">
                <div className="at-what">
                  {!campaignName && <p className="at-campaign">{it.campaign}</p>}
                  <p className="at-line">{it.line}</p>
                </div>
                {it.cta.href ? (
                  <Cta small href={it.cta.href}>{it.cta.label}</Cta>
                ) : (
                  <Cta
                    small
                    disabled={sent.has(key)}
                    onClick={() => { setSent((p) => new Set(p).add(key)); sendAction(it.cta.text ?? it.cta.label, it.cta.label, it.campaignId ?? undefined); }}
                  >
                    {it.cta.label}
                  </Cta>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {more > 0 && <p className="at-more">and {more} more</p>}
    </section>
  );
}
