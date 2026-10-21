import { PencilSimple } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { ChatCard } from "../api/agent";
import { messageOf } from "../api/client";
import * as outreach from "../api/outreach";
import { campaignHref } from "../chatCards";
import { Cta } from "./Cta";
import "./choiceCard.css";
import "./draftsCard.css";

/**
 * Emails the agent wrote to look over: each one in full, as it will read, with Edit, and the way on to Outreach where
 * they wait. Nothing here sends anything. The card is the words as they were written; as it comes up it reads the
 * messages again, so an email edited or sent since (here, in Outreach) shows as it is now and is edited only while it
 * is still a draft.
 */

export type DraftsCardData = Extract<ChatCard, { kind: "drafts" }>;

export type DraftRow = { id: string; to: string; subject: string; body: string; status: outreach.MessageStatus };

/** The rows a card starts from: every email is a draft until the messages are read again. */
export const rowsOf = (card: Pick<DraftsCardData, "emails">): DraftRow[] =>
  card.emails.map((m) => ({ id: m.messageId, to: m.to, subject: m.subject, body: m.body, status: "draft" }));

/** "1 email to look over", "3 emails to look over". */
export const draftsHeading = (n: number): string => `${n} ${n === 1 ? "email" : "emails"} to look over`;

/** Under the heading: where they are for, and that nothing has gone while that is true. */
export function draftsSubline(card: Pick<DraftsCardData, "campaignName">, rows: readonly Pick<DraftRow, "status">[]): string {
  return [card.campaignName, rows.every((r) => r.status === "draft") ? "Nothing has been sent" : null].filter(Boolean).join(" · ");
}

/** What an email that is no longer a draft says about itself, as plain text; null while it can still be edited. */
export function statusWord(status: outreach.MessageStatus): string | null {
  switch (status) {
    case "approved":
    case "sending": return "Going out";
    case "scheduled": return "Scheduled";
    case "sent":
    case "replied_logged": return "Sent";
    case "failed": return "Didn't send";
    default: return null;
  }
}

/** The rows with what the messages say now: their words and where each one stands. Messages not found are left as they were. */
export function mergeLive(rows: readonly DraftRow[], messages: readonly outreach.Message[]): DraftRow[] {
  const by = new Map(messages.map((m) => [m.id, m]));
  return rows.map((r) => {
    const m = by.get(r.id);
    return m ? { ...r, subject: m.subject ?? r.subject, body: m.body || r.body, status: m.status } : r;
  });
}

export type Editing = { id: string; subject: string; body: string; saving: boolean; problem: string | null };

/** The card for one state. Pure: the stateful one below holds the rows and the edit in progress. */
export function DraftsCardBody({ card, rows, editing, onEdit, onChange, onSave, onCancel }: {
  card: Pick<DraftsCardData, "campaignId" | "campaignName">;
  rows: readonly DraftRow[];
  editing: Editing | null;
  onEdit: (row: DraftRow) => void;
  onChange: (change: Partial<Pick<Editing, "subject" | "body">>) => void;
  onSave: () => void;
  onCancel: () => void;
}): JSX.Element {
  const sub = draftsSubline(card, rows);
  return (
    <section className="lk dr" aria-label={draftsHeading(rows.length)}>
      <header className="lk-head">
        <h3 className="lk-title">{draftsHeading(rows.length)}</h3>
        {sub && <p className="lk-sub">{sub}</p>}
      </header>
      <ul className="dr-list">
        {rows.map((r) => {
          const on = editing?.id === r.id ? editing : null;
          const said = statusWord(r.status);
          return (
            <li key={r.id} className="dr-mail">
              {on ? (
                <div className="dr-form">
                  <p className="lt-quote-w">To {r.to}</p>
                  <label className="ch-field">
                    <span className="ch-field-l">Subject</span>
                    <input
                      className="ch-input" type="text" value={on.subject} maxLength={200} disabled={on.saving} autoComplete="off"
                      onChange={(e) => onChange({ subject: e.target.value })}
                    />
                  </label>
                  <label className="ch-field dr-wide">
                    <span className="ch-field-l">Message</span>
                    <textarea
                      className="ch-input dr-area" value={on.body} rows={8} disabled={on.saving}
                      onChange={(e) => onChange({ body: e.target.value })}
                    />
                  </label>
                  {on.problem && <p className="kc-problem" role="alert">{on.problem}</p>}
                  <div className="kc-acts">
                    <button type="button" className="rep-commit" disabled={on.saving || on.body.trim() === ""} aria-busy={on.saving || undefined} onClick={onSave}>
                      {on.saving ? "Saving" : "Save"}
                    </button>
                    <button type="button" className="ch-skip" disabled={on.saving} onClick={onCancel}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <blockquote className="lt-quote">
                    <span className="lt-quote-w">To {r.to}</span>
                    {r.subject && <strong className="lt-quote-t">{r.subject}</strong>}
                    <p className="lt-mail-body">{r.body}</p>
                  </blockquote>
                  <p className="dr-acts">
                    {said
                      ? <span className="dr-said">{said}</span>
                      : <Cta small bare icon={PencilSimple} onClick={() => onEdit(r)} aria-label={`Edit the email to ${r.to}`}>Edit</Cta>}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {card.campaignId && (
        <p className="lk-foot">
          <Cta small href={campaignHref(card.campaignId, "outreach")}>Open Outreach</Cta>
        </p>
      )}
    </section>
  );
}

export function DraftsCard({ card }: { card: DraftsCardData }): JSX.Element {
  const [rows, setRows] = useState<DraftRow[]>(() => rowsOf(card));
  const [editing, setEditing] = useState<Editing | null>(null);
  const campaignId = card.campaignId;

  /* Read again as the card comes up: the words as they stand and whether each is still a draft. A failed read leaves the card as written. */
  useEffect(() => {
    if (!campaignId) return;
    let current = true;
    void outreach.listThreads(campaignId).then(
      (threads) => { if (current) setRows((cur) => mergeLive(cur, threads.flatMap((t) => t.messages))); },
      () => {},
    );
    return () => { current = false; };
  }, [campaignId, card.key]);

  const save = async () => {
    if (!editing || editing.saving) return;
    const { id, subject, body } = editing;
    setEditing({ ...editing, saving: true, problem: null });
    try {
      await outreach.editMessage(id, { subject: subject.trim(), body });
      setRows((cur) => cur.map((r) => (r.id === id ? { ...r, subject: subject.trim(), body } : r)));
      setEditing(null);
    } catch (err) {
      setEditing((cur) => (cur && cur.id === id ? { ...cur, saving: false, problem: messageOf(err) } : cur));
    }
  };

  return (
    <DraftsCardBody
      card={card}
      rows={rows}
      editing={editing}
      onEdit={(r) => setEditing({ id: r.id, subject: r.subject, body: r.body, saving: false, problem: null })}
      onChange={(change) => setEditing((cur) => (cur ? { ...cur, ...change } : cur))}
      onSave={() => void save()}
      onCancel={() => setEditing(null)}
    />
  );
}
