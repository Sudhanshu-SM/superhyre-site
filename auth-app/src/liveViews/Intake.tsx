import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { lastFailureKind, messageOf } from "../api/client";
import { specApi } from "../api/agent";
import { RunNarration } from "../agentCards";
import { Loader } from "../components/Loader";
import type { Ask } from "../Clarify";
import { Clarified } from "../Clarify";
import type { Question } from "../clarify";
import { FOLLOWING_LINE, useMayChangeCampaign } from "../campaignRights";
import { useCampaignRows } from "../campaignStore";
import type { MomentCtx } from "../moments";
import { act } from "../moments";
import "../moments.css";
import "../liveCompareEtc.css";
import { campaignAsk, resolvedCampaignId } from "./ask";
import type { Drafted } from "./intakeData";
import { draftOnce } from "./intakeData";
import { enough, factsOf, groupsOf, MAX_NOTES, missingOf, notesIn, questionsMessage } from "./intakeLogic";
import { PhaseRun } from "./PhaseRun";
import type { LiveViewProps } from "./types";

/**
 * Call notes or a messy brief turned into a role spec for a campaign. The notes come from the
 * request, or from a question; the draft is the API's (one model call), laid out the way the
 * demo's intake reads: what it understood, what's required and what's nice, what the notes
 * leave open. Approving makes it the role the search ranks on; nothing is approved for you.
 */

const notesOf = (ctx: Pick<MomentCtx, "answers" | "said">): string => (ctx.answers?.notes ?? "").trim() || notesIn(ctx.said) || "";

const notesQuestion = (): Question => ({
  id: "intake-notes",
  step: "Notes",
  found: "There are no notes in the request yet",
  ask: "Paste the notes from the call",
  why: "I'll turn them into a role you can review. Nothing starts until you approve it.",
  options: [],
  input: { placeholder: "Paste the call notes or the messy brief", verb: "Draft the role", rows: 6, max: MAX_NOTES },
  apply: ([text]) => ({ answers: { notes: text ?? "" } }),
});

export default function IntakeView({ card, ctx }: LiveViewProps): JSX.Element {
  const rows = useCampaignRows();
  const ask = useMemo<Ask>(
    () => campaignAsk(card, rows, { ask: "Which campaign are these notes for?" }, (_id, _said, c) => (notesOf(c) ? null : notesQuestion())),
    [card, rows],
  );
  return (
    <div className="src mo">
      <Clarified kind="intake" ctx={ctx} ask={ask}>
        {(c) => <Draft card={card} ctx={c} />}
      </Clarified>
    </div>
  );
}

type State = { status: "loading" } | { status: "failed"; error: unknown } | { status: "ready"; drafted: Drafted };

function Draft({ card, ctx }: LiveViewProps): JSX.Element {
  const campaignId = resolvedCampaignId(card, ctx);
  const notes = notesOf(ctx);
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const short = !enough(notes);
  /* Drafting and approving a role spec are the campaign's own people's; nothing is drafted for anyone else. */
  const may = useMayChangeCampaign(campaignId);

  useEffect(() => {
    if (!campaignId || short || !may) return;
    let live = true;
    setState({ status: "loading" });
    draftOnce(campaignId, notes).then(
      (drafted) => { if (live) setState({ status: "ready", drafted }); },
      (error) => { if (live) setState({ status: "failed", error }); },
    );
    return () => { live = false; };
  }, [campaignId, notes, short, may, attempt]);

  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [state.status, grow]);

  if (!campaignId) return <p className="lv-note">I need to know which campaign this is for.</p>;
  if (!may) return <p className="lv-note">{FOLLOWING_LINE}</p>;
  if (short) {
    return <p className="lv-note">That's a little short for me to read a role from. Use Change above to add a few more lines of the notes.</p>;
  }
  if (state.status === "failed") {
    const limited = lastFailureKind() === "limited";
    return (
      <div className="lv-fail" role="alert">
        <p className="lv-note">{messageOf(state.error)}</p>
        <div className="mo-acts">
          {!limited && <button type="button" className="src-btn is-quiet mo-small" onClick={() => setAttempt((a) => a + 1)}>Try again</button>}
          {ctx.openCampaign && <button type="button" className="src-btn is-quiet mo-small" onClick={() => ctx.openCampaign?.(campaignId)}>Write the role in the campaign</button>}
        </div>
      </div>
    );
  }
  const drafted = state.status === "ready" ? state.drafted : null;
  const open = drafted ? missingOf(drafted.row.spec, notes) : [];
  const count = drafted?.row.spec.requirements.length ?? 0;
  return (
    <PhaseRun
      id="intake-read"
      live="Reading the notes"
      done={drafted?.reused ? "Read the notes earlier" : "Read the notes"}
      running={!drafted}
      steps={drafted ? [
        `Found ${count} ${count === 1 ? "requirement" : "requirements"}`,
        open.length ? `Found ${open.length} ${open.length === 1 ? "thing" : "things"} the notes leave open` : "Nothing the notes leave open",
      ] : []}
      onGrow={ctx.onGrow}
    >
      {drafted && <Role campaignId={campaignId} drafted={drafted} open={open} ctx={ctx} onGrow={ctx.onGrow} />}
    </PhaseRun>
  );
}

function Role({ campaignId, drafted, open, ctx, onGrow }: { campaignId: string; drafted: Drafted; open: ReturnType<typeof missingOf>; ctx: MomentCtx; onGrow: () => void }): JSX.Element {
  const { row, approved } = drafted;
  const spec = row.spec;
  const [asked, setAsked] = useState<readonly number[]>(() => open.map((_, i) => i));
  const [phase, setPhase] = useState<"idle" | "approving" | "approved">(row.approvedAt ? "approved" : "idle");
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(row.version);
  /* What approving set going: the first search, or the people already found ranked on this version. */
  const [started, setStarted] = useState<"search" | "rank" | null>(null);
  /* The run approving started, followed here: what it is doing, then how it went. */
  const [runId, setRunId] = useState<string | null>(null);
  useEffect(() => { onGrow(); }, [phase, error, onGrow]);

  const approve = () => {
    setPhase("approving");
    setError(null);
    specApi.approve(campaignId, row.id, { match: true }).then(
      (r) => { setVersion(r.version); setStarted(r.matching?.kind ?? null); setRunId(r.matching?.runId ?? null); setPhase("approved"); },
      (e) => { setError(e); setPhase("idle"); },
    );
  };

  const facts = factsOf(spec);
  const replaces = approved && approved.id !== row.id && !row.approvedAt ? approved.version : null;
  return (
    <section className="mo-card" aria-label="Intake">
      <div className="mo-card-h">
        <b>Intake · {spec.title}</b>
        <span>from your call notes · version {version}</span>
      </div>
      {facts.length > 0 && (
        <ul className="mo-facts">
          {facts.map((f) => <li key={f.label}><span>{f.label}</span><b>{f.value}</b></li>)}
        </ul>
      )}
      {groupsOf(spec).map((g) => (
        <div key={g.id} className="lv-group">
          <p className="mo-grp">{g.label}</p>
          <ul className="mo-facts">
            {g.items.map((t) => <li key={t}><b>{t}</b></li>)}
          </ul>
        </div>
      ))}
      {open.length > 0 && (
        <div className="lv-group">
          <p className="mo-grp">Not in the notes</p>
          <ul className="mo-qs">
            {open.map((q, i) => (
              <li key={q.ask}>
                <label>
                  <input
                    type="checkbox"
                    id={`intake-q-${i}`}
                    checked={asked.includes(i)}
                    onChange={() => setAsked((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]))}
                  />
                  <span>{q.ask} <span className="lv-why">{q.because}</span></span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mo-acts">
            <button
              type="button"
              className="src-btn is-quiet mo-small"
              disabled={asked.length === 0}
              onClick={() => act(ctx, questionsMessage(spec.title, asked.map((i) => open[i]!.ask)))}
            >
              Draft a message with {asked.length === 1 ? "this question" : `these ${asked.length}`}
            </button>
          </div>
        </div>
      )}
      <div className="mo-card-f">
        {phase === "approved" ? (
          <span className="mo-done"><CheckCircle size={15} weight="fill" aria-hidden="true" />Approved as version {version}. {started === "rank" ? "The people already found are being ranked on it." : started === "search" ? "Looking for people on it now." : "Searches for this campaign rank people on it."}</span>
        ) : (
          <span>
            {replaces ? `Approving replaces version ${replaces}, which the search uses now.` : "Approve it and the search ranks people on this."}
            {" "}You can edit it in the campaign first.
          </span>
        )}
        <span className="mo-acts">
          {phase !== "approved" && (
            <button type="button" className="src-btn is-primary mo-small" disabled={phase === "approving"} onClick={approve}>
              {phase === "approving" ? <><Loader size="sm" tone="inherit" />Approving</> : <>Approve this role<ArrowRight size={13} weight="bold" aria-hidden="true" /></>}
            </button>
          )}
          {ctx.openCampaign && (
            <button type="button" className="src-btn is-quiet mo-small" onClick={() => ctx.openCampaign?.(campaignId)}>
              {phase === "approved" ? "Open the campaign" : "Edit in the campaign"}
            </button>
          )}
        </span>
      </div>
      {error ? <p className="lv-note" role="alert">{messageOf(error)}</p> : null}
      {phase === "approved" && runId && <RunNarration runId={runId} />}
    </section>
  );
}
