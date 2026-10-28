import { ArrowLeft } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { agentApi, type ChatMessage, type ConversationDetail } from "./api/agent";
import type { RunEvent } from "./api/events";
import { applyEvent, fromDetail, type LiveTurn } from "./liveChat";
import { LiveTurnBody } from "./LiveTurn";
import { Prose } from "./ReplyProse";
import "./shared-chat.css";

/**
 * Somebody else's chat about a campaign this person can see, as a transcript: what was asked and what the agent answered,
 * and nothing more (the server sends only the words, so there is no card to press and nothing to approve). It is read, not
 * written in: the one thing to do from it is to start their own chat about the same campaign.
 */
export type SharedView = { id: string; title: string; ownerName: string; campaignName: string; campaignId: string };

type State =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; messages: readonly ChatMessage[]; ownerName: string; turns: readonly LiveTurn[] };

/** What an admin is sent of the chat (its runs' events) folded into turns, as the person who had it saw them: cards and all. */
const turnsOf = (d: ConversationDetail): readonly LiveTurn[] =>
  d.events?.length ? (d.events as unknown as RunEvent[]).reduce(applyEvent, fromDetail(d)).turns : [];

export function SharedChat({ view, onStartOwn, onClose }: { view: SharedView; onStartOwn: () => void; onClose: () => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    agentApi
      .conversation(view.id)
      .then((d) => { if (current) setState({ status: "ready", messages: d.messages, ownerName: d.ownerName ?? view.ownerName, turns: turnsOf(d) }); })
      .catch(() => { if (current) setState({ status: "failed", message: "That chat isn't available any more." }); });
    return () => { current = false; };
  }, [view.id, view.ownerName]);

  const who = state.status === "ready" ? state.ownerName : view.ownerName;
  return (
    <section className="shc" aria-label={`Chat by ${who}`}>
      <header className="shc-head">
        <button type="button" className="shc-back" onClick={onClose} aria-label="Back to your chat">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="shc-title">
          <h1>{view.title}</h1>
          <p>Started by <strong>{who}</strong>{view.campaignName ? ` · ${view.campaignName}` : ""} · read only</p>
        </div>
      </header>

      <div className="shc-log">
        {state.status === "loading" && <p className="shc-note">Opening the chat…</p>}
        {state.status === "failed" && <p className="shc-note">{state.message}</p>}
        {state.status === "ready" && state.messages.length === 0 && <p className="shc-note">Nothing in this chat can be shown to you.</p>}
        {state.status === "ready" && state.turns.length > 0 && state.turns.map((t, i) => (
          <div key={t.key} className="shc-turn">
            {t.said && <p className="shc-said">{t.said}</p>}
            {/* Drawn as the person saw it, for reading only: nothing in it can be pressed or answered here. */}
            <div className="shc-cards" {...({ inert: "" } as object)}>
              <LiveTurnBody turn={t} onAnswer={() => {}} later={state.turns.slice(i + 1)} />
            </div>
          </div>
        ))}
        {state.status === "ready" && state.turns.length === 0 && state.messages.map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="shc-said">{m.text}</p>
          ) : m.text ? (
            <div key={m.id} className="shc-reply"><Prose text={m.text} /></div>
          ) : (
            <p key={m.id} className="shc-card">The agent answered with a card. {who.split(" ")[0]} can show it to you in the campaign.</p>
          ),
        )}
      </div>

      <footer className="shc-foot">
        <p>This is {who.split(" ")[0]}'s chat, so it can't be written in.</p>
        <button type="button" className="shc-own" onClick={onStartOwn}>{view.campaignName ? `Start your own chat about ${view.campaignName}` : "Start your own chat"}</button>
      </footer>
    </section>
  );
}
