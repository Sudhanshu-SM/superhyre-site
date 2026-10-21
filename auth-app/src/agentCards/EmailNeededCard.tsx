import { EnvelopeSimple } from "@phosphor-icons/react";
import { useState } from "react";
import type { ChatCard } from "../api/agent";
import { updateCandidate } from "../api/candidates";
import { readable } from "../api/identity";
import { sendAction } from "../liveChat";
import { Cta } from "./Cta";
import { candidateEmailProblem } from "./meetingModel";
import "./meetingCard.css";

type Phase = { s: "idle" } | { s: "saving" } | { s: "saved" } | { s: "failed"; text: string };

/**
 * Someone with no email can't be invited, so the times they were wanted for wait on one. Two ways on, both on this
 * card: look it up (the card that gets their contact details, asked for in code) or add it by hand, which is checked
 * and saved to the candidate, after which the free times are asked for. It names no tool and books nothing.
 */
export function EmailNeededCard({ card }: { card: Extract<ChatCard, { kind: "need_email" }> }): JSX.Element {
  const first = card.name.split(/\s+/)[0] ?? card.name;
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  const problem = value.trim() === "" ? null : candidateEmailProblem(value);

  const save = async () => {
    const wrong = candidateEmailProblem(value);
    if (wrong) { setPhase({ s: "failed", text: wrong }); return; }
    setPhase({ s: "saving" });
    try {
      await updateCandidate(card.candidateId, { primaryEmail: value.trim() });
      setPhase({ s: "saved" });
      sendAction(`Find a time for ${card.name}`, "Find a time", card.campaignId ?? undefined, { times: { campaignCandidateId: card.campaignCandidateId } });
    } catch (err) {
      setPhase({ s: "failed", text: readable(err) });
    }
  };

  return (
    <article className="rep-card lt-approval mt" aria-label={`${card.name} has no email yet`}>
      <header className="rep-app">
        <span className="lt-app-mark" aria-hidden="true"><EnvelopeSimple size={15} weight="fill" /></span>
        <span className="rep-app-name">{first} has no email yet</span>
      </header>
      {phase.s === "saved" ? (
        <p className="mt-done">Saved. Finding times for {first}.</p>
      ) : (
        <>
          <p className="mt-sub">An invitation needs an address. Look it up, or add it yourself.</p>
          {adding && (
            <form className="mt-add" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
              <input
                className="ncx-in" type="email" inputMode="email" autoComplete="off" autoFocus
                placeholder={`${first.toLowerCase()}@company.com`} aria-label={`${card.name}'s email`}
                value={value} onChange={(e) => { setValue(e.target.value); if (phase.s === "failed") setPhase({ s: "idle" }); }}
                aria-invalid={problem !== null || phase.s === "failed"} disabled={phase.s === "saving"}
              />
              <button type="submit" className="rep-commit" disabled={phase.s === "saving" || value.trim() === ""}>
                {phase.s === "saving" ? "Saving…" : "Save email"}
              </button>
            </form>
          )}
          {(problem || phase.s === "failed") && <p className="kc-problem" role="alert">{phase.s === "failed" ? phase.text : problem}</p>}
          <div className="cta-row">
            <Cta small onClick={() => sendAction(`Look up the email for ${card.name}`, "Look up email", card.campaignId ?? undefined, { contacts: { campaignCandidateId: card.campaignCandidateId } })}>
              Look up email
            </Cta>
            {!adding && <Cta small variant="primary" onClick={() => setAdding(true)}>Add email</Cta>}
          </div>
        </>
      )}
    </article>
  );
}
