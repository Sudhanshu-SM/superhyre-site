import { useMayChangeCampaign } from "./campaignRights";
import { useEffect, useState } from "react";
import { agentApi } from "./api/agent";
import type { MatchAuditEntry, MatchFit, RequirementResult, Tier } from "./api/agent";
import { FitState } from "./CandidateBits";
import { TIER_LABEL } from "./chatCards";
import { candidateById, updateCandidate } from "./liveCandidates";
import { coverageLine, IMPORTANCE_WORD, PARTLY_CHECKED, provenanceLine, VERDICT_TONE, VERDICT_WORD, whenLine } from "./matchResult";
import type { MatchResultView } from "./matchResult";
import type { Candidate } from "./sourcing";
import { toneProps } from "./statusTones";
import { Loader } from "./components/Loader";
import { Dialog } from "./ui";
import "./roles.css";

/**
 * MatchResult — what the server concluded about one person on one role, and why, in the profile sheet.
 *
 * Everything here is read from the server's fields; nothing is added up, ranked or turned into a tier in the console.
 * It says what is known and what is not, and keeps the two apart: a fit and how much of the role it covers, the
 * must-haves still to check (never a mark against the person), the quote behind every verdict, a ruling-out with its
 * reason, and a recruiter's own call with who made it and why. The numbers are a view of the evidence, not a decision.
 */

const RULES: Readonly<Record<string, string>> = {
  location: "Location",
  min_experience: "Years of experience",
  required_qualification: "A requirement the role can't do without",
  legacy: "Role requirement",
};

const sortReq = (a: RequirementResult, b: RequirementResult) =>
  (a.importance === "must" ? 0 : 1) - (b.importance === "must" ? 0 : 1) || b.weight - a.weight;

export function MatchResult({ c }: { c: Candidate }) {
  const r = c.result;
  const campaignId = c.resultCampaignId;
  /* What the server keys a match by: the person, which for someone already in the workspace is not their candidate id. */
  const key = c.personId ?? c.id;
  const [changing, setChanging] = useState(false);
  const [history, setHistory] = useState<MatchAuditEntry[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [asked, setAsked] = useState<"idle" | "busy" | "queued" | "held" | "failed">("idle");

  useEffect(() => {
    if (!showHistory || !campaignId) return;
    let gone = false;
    agentApi.audit(campaignId, key).then((a) => { if (!gone) setHistory(a.entries); }, () => { if (!gone) setHistory([]); });
    return () => { gone = true; };
  }, [showHistory, campaignId, key, r?.override?.at]);

  if (!r) return null;
  const covered = coverageLine(r);
  const needsMore = r.status === "insufficient_evidence" || r.toVerify.length > 0;
  const partly = r.status !== "not_scored_yet" && r.status !== "knocked_out" && ((r.coverage ?? 100) < 99.95 || r.toVerify.length > 0);
  /* A requirement is said once: those already listed under "Still to check" are not listed again against the role. */
  const requirements = r.requirements.filter((q) => !r.toVerify.some((t) => t.requirementId === q.id)).sort(sortReq);
  /* What was checked is said once, in the header; under it one sentence at most, the server's own when it has one. */
  const why = r.status === "insufficient_evidence" && r.note ? r.note : null;
  /* Changing a result is for the people on the campaign; anyone else who can see it reads it. */
  const may = useMayChangeCampaign(campaignId ?? null);
  const canAct = Boolean(campaignId) && may;

  const lookForMore = async () => {
    if (!campaignId) return;
    setAsked("busy");
    try {
      const out = await agentApi.screen(campaignId, key);
      setAsked(out.queued ? "queued" : "held");
    } catch {
      setAsked("failed");
    }
  };

  return (
    <div className="mr">
      <div className="mr-head">
        <p className="mr-state"><FitState r={r} /></p>
        {covered && <p className="mr-cover">{covered}</p>}
      </div>
      {why ? <p className="mr-note">{why}</p> : r.display?.note ? <p className="mr-meta">{r.display.note}</p> : partly && <p className="mr-note">{PARTLY_CHECKED}</p>}

      {r.override && (
        <p className="mr-note">
          {r.override.carriedFrom ? <>Override from v{r.override.carriedFrom} still applies. </> : null}
          <b>{r.override.by ?? "A teammate"}</b> set this to {TIER_LABEL[r.override.to]}{r.override.from ? ` (the system said ${TIER_LABEL[r.override.from]})` : ""}
          {whenLine(r.override.at) ? `, ${whenLine(r.override.at)}` : ""}. “{r.override.reason}”
          {r.override.systemChanged ? " The system's result has changed since, so it may be worth a second look. You can go back to it under Change this result." : null}
        </p>
      )}

      {r.status === "knocked_out" || r.knockout ? (
        <div className="mr-block">
          <p className="mr-k">Why they were ruled out</p>
          {r.knockout ? (
            <>
              <p className="mr-body">{r.knockout.reason}</p>
              <p className="mr-meta">
                {RULES[r.knockout.rule] ?? r.knockout.rule}
                {r.knockout.evidence ? <> · from their profile: <q>{r.knockout.evidence}</q></> : null}
              </p>
              {r.knockout.override && (
                <p className="mr-meta">Overridden by {r.knockout.override.by ?? "a teammate"}: {r.knockout.override.reason}</p>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {r.status === "not_scored_yet" && (
        <p className="mr-note">Not read closely yet, so there is no score. That says nothing about how well they fit.</p>
      )}

      {r.toVerify.length > 0 && (
        <div className="mr-block">
          <p className="mr-k">Still to check</p>
          <p className="mr-meta">Must-haves the profile doesn't settle. Ask them, or look for more on their profile.</p>
          <ul className="mr-list">
            {r.toVerify.map((t) => <li key={t.requirementId}>{t.text}</li>)}
          </ul>
        </div>
      )}

      {requirements.length > 0 && (
        <div className="mr-block">
          <p className="mr-k">Against the role</p>
          <ul className="mr-reqs">
            {requirements.map((q) => (
              <li key={q.id} className="mr-req">
                <div className="mr-req-top">
                  <span className="mr-req-t">{q.text}</span>
                  <span className="mr-req-v"><span {...toneProps(VERDICT_TONE[q.verdict])}>{VERDICT_WORD[q.verdict]}</span></span>
                </div>
                <p className="mr-meta">
                  {IMPORTANCE_WORD[q.importance]}
                  {q.verdict === "unknown" ? " · not checked yet" : q.by === "code" ? " · from their profile" : ""}
                </p>
                {q.evidence && <p className="mr-quote"><q>{q.evidence}</q></p>}
                {q.rationale && <p className="mr-meta">{q.rationale}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(r.strengths.length > 0 || r.concerns.length > 0 || r.missing.length > 0) && (
        <div className="mr-cols">
          {r.strengths.length > 0 && (
            <div>
              <p className="mr-k">Strengths</p>
              <ul className="mr-list">{r.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {r.concerns.length > 0 && (
            <div>
              <p className="mr-k">Concerns</p>
              <ul className="mr-list">{r.concerns.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {r.missing.length > 0 && (
            <div>
              <p className="mr-k">Not on the profile</p>
              <ul className="mr-list">{r.missing.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      <p className="mr-meta mr-prov">{provenanceLine(r)}</p>

      {canAct && (
        <div className="mr-acts">
          <button type="button" className="ct-btn" onClick={() => setChanging(true)}>Change this result</button>
          {needsMore && r.status !== "knocked_out" && (
            <button type="button" className="ct-btn" disabled={asked === "busy" || asked === "queued"} onClick={() => void lookForMore()}>
              {asked === "queued" ? "Looking for more" : "Look for more on their profile"}
            </button>
          )}
          <button type="button" className="ct-btn" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Hide history" : "History"}
          </button>
        </div>
      )}
      {asked === "queued" && <p className="mr-meta">We'll fill in what we can. Score them again once it's in.</p>}
      {asked === "held" && <p className="mr-meta">Today's allowance for looking up profiles is used up. Try again tomorrow.</p>}
      {asked === "failed" && <p className="mr-meta">That didn't go through. Try again in a moment.</p>}

      {showHistory && (
        <ol className="mr-history" aria-label="History of this result">
          {history === null ? <li className="mr-meta">Loading</li> : history.length === 0 ? <li className="mr-meta">Nothing yet.</li> : history.map((e) => (
            <li key={e.id}>
              <p className="mr-body">{auditLine(e)}</p>
              <p className="mr-meta">{whenLine(e.at)}{e.reason && e.kind !== "scored" ? <> · “{e.reason}”</> : null}</p>
            </li>
          ))}
        </ol>
      )}

      <OverrideDialog
        open={changing}
        onClose={() => setChanging(false)}
        result={r}
        name={c.name}
        onSave={async (to, reason) => {
          if (!campaignId) return;
          const out = await agentApi.override(campaignId, key, { to, ...(reason ? { reason } : {}) });
          const now = candidateById(c.id) ?? c;
          updateCandidate(withResult(now, out));
          setChanging(false);
        }}
      />
    </div>
  );
}

const tierName = (t: Tier | null | undefined) => (t ? TIER_LABEL[t] : "no tier");

/** One line of the history, in the words a teammate would use. */
export function auditLine(e: MatchAuditEntry): string {
  if (e.kind === "scored") {
    const snap = e.snapshot as { status?: string; tier?: Tier | null; score?: number | null };
    if (snap.status === "insufficient_evidence") return "Read by the system: needs more evidence";
    return snap.tier ? `Scored by the system: ${TIER_LABEL[snap.tier]}${typeof snap.score === "number" ? ` (${Math.round(snap.score)})` : ""}` : "Scored by the system";
  }
  const who = e.byName ?? "A teammate";
  if (e.kind === "override") return `${who} set ${tierName(e.toTier)}${e.fromTier ? `, replacing ${tierName(e.fromTier)}` : ""}`;
  return `${who} went back to the system's result`;
}

/** The candidate with the result the server returned after a change. */
export function withResult(c: Candidate, fit: MatchFit & { tier: Tier | null }): Candidate {
  const result: MatchResultView = { ...(c.result ?? ({} as MatchResultView)), ...fit, tier: fit.tier };
  return { ...c, result };
}

/* ── the dialog ──────────────────────────────────────────────────────────── */

function OverrideDialog({ open, onClose, result, name, onSave }: {
  open: boolean;
  onClose: () => void;
  result: MatchResultView;
  name: string;
  onSave: (to: Tier | "clear", reason: string) => Promise<void>;
}) {
  const [to, setTo] = useState<Tier | "clear" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setTo(null);
      setReason("");
      setBusy(false);
      setError(null);
    }
  }, [open]);
  const first = name.trim().split(/\s+/)[0] ?? name;
  const ok = to !== null && (to === "clear" || reason.trim().length >= 3);
  return (
    <Dialog open={open} onClose={onClose} label={`Change the result for ${name}`} size="md">
      <form
        className="rl-dlg is-confirm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok || to === null || busy) return;
          setBusy(true);
          setError(null);
          onSave(to, reason.trim()).catch(() => {
            setBusy(false);
            setError("That didn't save. Try again.");
          });
        }}
      >
        <header className="rl-dlg-h">
          <h2 className="t-title">Change the result for {first}</h2>
          <p className="t-body rl-dlg-b">
            Your call is kept next to what the system concluded, with your name and your reason. Nothing is deleted, and you can take it back.
          </p>
        </header>
        <div className="pr-reasons" role="group" aria-label="Result">
          {(["A", "B", "C"] as const).map((t) => (
            <button key={t} type="button" className={`ct-btn${to === t ? " is-primary" : ""}`} aria-pressed={to === t} onClick={() => setTo(t)}>
              {TIER_LABEL[t]}
            </button>
          ))}
          {result.override && (
            <button type="button" className={`ct-btn${to === "clear" ? " is-primary" : ""}`} aria-pressed={to === "clear"} onClick={() => setTo("clear")}>
              Go back to the system's result
            </button>
          )}
        </div>
        <label className="pr-note">
          <span className="t-label">{to === "clear" ? "Why (optional)" : "Why"}</span>
          <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="For example: spoke on the phone, relocating in March" />
        </label>
        {error && <p className="t-body rl-dlg-b" role="alert">{error}</p>}
        <footer className="rl-dlg-f">
          <span />
          <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ct-btn is-primary" disabled={!ok || busy}>{busy ? <><Loader size="sm" tone="inherit" />Saving…</> : "Save"}</button>
        </footer>
      </form>
    </Dialog>
  );
}
