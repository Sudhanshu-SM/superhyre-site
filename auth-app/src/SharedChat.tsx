import { ArrowLeft } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { agentApi, type ChatMessage } from "./api/agent";
import { Prose } from "./ReplyProse";
import "./shared-chat.css";

/**
 * Somebody else's chat about a campaign this person can see, as a transcript: what was asked and what the agent answered,
 * and nothing more (the server sends only the words, so there is no card to press and nothing to approve). It is read, not
 * written in: the one thing to do from it is to start their own chat about the same campaign.
 */
export type SharedView = { id: string; title: string; ownerName: string; campaignName: string; campaignId: string };

type State = { status: "loading" } | { status: "failed"; message: string } | { status: "ready"; messages: readonly ChatMessage[]; ownerName: string };

export function SharedChat({ view, onStartOwn, onClose }: { view: SharedView; onStartOwn: () => void; onClose: () => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    agentApi
      .conversation(view.id)
      .then((d) => { if (current) setState({ status: "ready", messages: d.messages, ownerName: d.ownerName ?? view.ownerName }); })
      .catch(() => { if (current) setState({ status: "failed", message: "That chat isn't available any more." }); });
    return () => { current = false; };
  }, [view.id, view.ownerName]);

  const who = state.status === "ready" ? state.ownerName : view.ownerName;
  return (
    <section className="sc" aria-label={`Chat by ${who}`}>
      <header className="sc-head">
        <button type="button" className="sc-back" onClick={onClose} aria-label="Back to your chat">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="sc-title">
          <h1>{view.title}</h1>
          <p>Started by <strong>{who}</strong> · {view.campaignName} · read only</p>
        </div>
      </header>

      <div className="sc-log">
        {state.status === "loading" && <p className="sc-note">Opening the chat…</p>}
        {state.status === "failed" && <p className="sc-note">{state.message}</p>}
        {state.status === "ready" && state.messages.length === 0 && <p className="sc-note">Nothing in this chat can be shown to you.</p>}
        {state.status === "ready" && state.messages.map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="sc-said">{m.text}</p>
          ) : m.text ? (
            <div key={m.id} className="sc-reply"><Prose text={m.text} /></div>
          ) : (
            <p key={m.id} className="sc-card">The agent answered with a card. {who.split(" ")[0]} can show it to you in the campaign.</p>
          ),
        )}
      </div>

      <footer className="sc-foot">
        <p>This is {who.split(" ")[0]}'s chat, so it can't be written in.</p>
        <button type="button" className="sc-own" onClick={onStartOwn}>Start your own chat about {view.campaignName}</button>
      </footer>
    </section>
  );
}
