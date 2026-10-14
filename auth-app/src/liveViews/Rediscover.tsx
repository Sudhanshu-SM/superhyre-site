import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { NotAddedError, addToCampaign } from "../api/candidates";
import { messageOf } from "../api/client";
import { Avatar } from "../CandidateBits";
import type { Ask } from "../Clarify";
import { Clarified } from "../Clarify";
import type { Question } from "../clarify";
import { useCampaignRows } from "../campaignStore";
import { candidateFromCardPerson } from "../liveCandidate";
import { putSet } from "../liveCandidates";
import type { MomentCtx } from "../moments";
import "../moments.css";
import "../liveCompareEtc.css";
import { hueFor } from "../candidateImport";
import { campaignAsk, resolvedCampaignId } from "./ask";
import type { Found } from "./rediscoverData";
import { findPast } from "./rediscoverData";
import { happenedLine, nowLine, queryFromSaid, selectAllLabel, standsOn } from "./rediscoverLogic";
import { PhaseRun } from "./PhaseRun";
import type { LiveViewProps } from "./types";
import { Loader } from "../components/Loader";

/**
 * People the workspace already has who fit what's being looked for, with where each got to on
 * an earlier search. The layout is the demo's (`mo-past`); the people, their histories and the
 * campaigns are the workspace's. The recruiter picks who to bring in and presses Add: nothing
 * is added for them.
 */

const FIRST = 8;

/** What to look for: the card's query, else the words of the request, else what was asked. */
const queryOf = (card: LiveViewProps["card"], ctx: Pick<MomentCtx, "said" | "answers">, campaignName: string | null): string | null =>
  card.query?.trim() || queryFromSaid(ctx.said, card.campaignName ?? campaignName) || (ctx.answers?.query ?? "").trim() || null;

const queryQuestion = (): Question => ({
  id: "rediscover-query",
  step: "Looking for",
  found: "The request doesn't say what to look for",
  ask: "What should they have?",
  why: "A skill, a job title or a place. Skip it to use this campaign's top requirement.",
  options: [],
  input: { placeholder: "e.g. Kotlin, or Product Designer", verb: "Look", optional: true, max: 80, skipped: "this campaign's top requirement" },
  apply: ([text]) => ({ answers: { query: text ?? "" } }),
});

export default function RediscoverView({ card, ctx }: LiveViewProps): JSX.Element {
  const rows = useCampaignRows();
  const ask = useMemo<Ask>(
    () => campaignAsk(card, rows, { ask: "Which campaign are you looking for people for?" }, (id, _said, c) => {
      const asked = c.answers?.query !== undefined;
      return queryOf(card, c, rows.find((r) => r.id === id)?.name ?? null) || asked ? null : queryQuestion();
    }),
    [card, rows],
  );
  return (
    <div className="src mo">
      <Clarified kind="rediscover" ctx={ctx} ask={ask}>
        {(c) => <Past card={card} ctx={c} />}
      </Clarified>
    </div>
  );
}

type State = { status: "loading" } | { status: "failed"; error: unknown } | { status: "ready"; found: Found };

function Past({ card, ctx }: LiveViewProps): JSX.Element {
  const rows = useCampaignRows();
  const campaignId = resolvedCampaignId(card, ctx);
  const campaignName = rows.find((r) => r.id === campaignId)?.name ?? card.campaignName ?? "this campaign";
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let live = true;
    findPast({ query: queryOf(card, ctx, campaignName), campaignId }).then(
      (found) => { if (live) setState({ status: "ready", found }); },
      (error) => { if (live) setState({ status: "failed", error }); },
    );
    return () => { live = false; };
    // The request and its answers are fixed once the slot mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const found = state.status === "ready" ? state.found : null;
  /* Registered so a name opens the console's profile sheet. They are the workspace's candidates, not matches of a campaign. */
  useEffect(() => {
    if (!found || !found.fresh.length) return;
    const candidates = found.fresh.flatMap((p) => {
      const c = candidateFromCardPerson({ personId: null, candidateId: p.id, name: p.name, title: p.title, company: p.company, city: p.city, years: p.years, strengths: [], linkedinUrl: p.linkedinUrl });
      return c ? [c] : [];
    });
    putSet({ key: `rediscover:${found.query}:${campaignId ?? "-"}`, campaignId: null, candidates, criteria: [], reasons: {}, total: candidates.length });
  }, [found, campaignId]);

  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [state.status, grow]);

  if (state.status === "failed") return <p className="lv-note" role="alert">{messageOf(state.error)}</p>;
  if (found && found.query.length < 2) return <p className="lv-note">Tell me what to look for, a skill or a job title, and I'll search the people you already have.</p>;
  const total = found ? found.fresh.length + found.here.length : 0;
  return (
    <PhaseRun
      id="rd-search"
      live="Searching the people you already have"
      done={found ? `Searched your candidates for “${found.query}”` : "Searched your candidates"}
      running={!found}
      steps={found ? [
        `${total} ${total === 1 ? "person matches" : "people match"} “${found.query}”${found.fromSpec ? ", this campaign's top requirement" : ""}`,
        ...(found.campaigns.length ? [`Included people from ${found.campaigns.join(", ")}`] : []),
        ...(found.here.length ? [`${found.here.length} already on ${campaignName}`] : []),
      ] : []}
      onGrow={ctx.onGrow}
    >
      {found && <Results found={found} campaignId={campaignId} campaignName={campaignName} ctx={ctx} />}
    </PhaseRun>
  );
}

function Results({ found, campaignId, campaignName, ctx }: { found: Found; campaignId: string | null; campaignName: string; ctx: MomentCtx }): JSX.Element {
  const { fresh, here, facts, query } = found;
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [added, setAdded] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const shown = more ? fresh : fresh.slice(0, FIRST);
  const ids = fresh.map((p) => p.id);
  /* "Select all" is the people on screen: nobody is added who wasn't shown. */
  const open = shown.filter((p) => !added.includes(p.id));
  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [more, added.length, error, grow]);

  const add = () => {
    if (!campaignId || !picked.length || busy) return;
    setBusy(true);
    setError(null);
    addToCampaign(campaignId, picked).then(
      () => { setAdded((a) => [...a, ...picked]); setPicked([]); setBusy(false); },
      (e: unknown) => {
        // Those that did go in stay added; only the ones the server refused stay picked.
        const failed = e instanceof NotAddedError ? e.failedIds : picked;
        setAdded((a) => [...a, ...picked.filter((id) => !failed.includes(id))]);
        setPicked(picked.filter((id) => failed.includes(id)));
        setError(e instanceof NotAddedError ? e.message : messageOf(e));
        setBusy(false);
      },
    );
  };

  if (!fresh.length) {
    return (
      <p className="src-para">
        {here.length
          ? `Everyone in your candidates who matches “${query}” is already on ${campaignName}.`
          : `Nobody in your candidates matches “${query}” yet.`}
      </p>
    );
  }
  return (
    <>
      <p className="src-para">
        {fresh.length === 1 ? "One person" : `${fresh.length} people`} you already have {fresh.length === 1 ? "matches" : "match"} “{query}”.
        {here.length ? ` ${here.length === 1 ? "One more is" : `${here.length} more are`} already on ${campaignName}.` : ""}
      </p>
      <ul className="mo-past">
        {shown.map((p, i) => {
          const past = p.before[0];
          const f = facts[p.id];
          const when = past ? f?.when[past.id] : undefined;
          const isAdded = added.includes(p.id);
          return (
            <li key={p.id} style={{ animationDelay: `${i * 70}ms` }}>
              <button type="button" className="mo-past-who" onClick={() => ctx.openProfile(p.id, ids)}>
                <Avatar name={p.name} hue={hueFor(p.name)} size={34} />
                <span>
                  <b>{p.name}</b>
                  <span className="mo-past-now">{nowLine(p)}</span>
                </span>
              </button>
              {isAdded ? (
                <span className="lv-pick is-done"><CheckCircle size={14} weight="fill" aria-hidden="true" />Added</span>
              ) : (
                <label className="lv-pick">
                  <input
                    type="checkbox"
                    checked={picked.includes(p.id)}
                    disabled={busy || !campaignId}
                    aria-label={`Add ${p.name} to ${campaignName}`}
                    onChange={() => setPicked((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
                  />
                  <span>Add</span>
                </label>
              )}
              <p className="mo-past-then">
                {isAdded ? (
                  /* Once added, where they stand now: not where they were before. */
                  <span>{standsOn(campaignName)}</span>
                ) : past ? (
                  <>
                    <span>{[past.name, when].filter(Boolean).join(" · ")}</span>
                    {happenedLine(past.stage, f?.reason[past.id])}
                    {p.before.length > 1 ? ` And ${p.before.length - 1} other ${p.before.length === 2 ? "campaign" : "campaigns"}.` : ""}
                  </>
                ) : (
                  "In your candidates, never put on a campaign."
                )}
              </p>
            </li>
          );
        })}
      </ul>
      {fresh.length > shown.length && (
        <p className="lt-more">
          <button type="button" className="lt-link" onClick={() => setMore(true)}>Show {fresh.length - shown.length} more</button>
        </p>
      )}
      <div className="mo-acts lv-acts">
        {selectAllLabel(open.length) && picked.length < open.length && (
          <button type="button" className="src-btn is-quiet mo-small" disabled={busy} onClick={() => setPicked(open.map((p) => p.id))}>
            {selectAllLabel(open.length)}
          </button>
        )}
        <button type="button" className="src-btn is-primary mo-small" disabled={busy || picked.length === 0 || !campaignId} aria-busy={busy || undefined} onClick={add}>
          {busy ? <><Loader size="sm" tone="inherit" />Adding</> : picked.length ? `Add ${picked.length} to ${campaignName}` : `Add to ${campaignName}`}
          <ArrowRight size={13} weight="bold" aria-hidden="true" />
        </button>
        {added.length > 0 && ctx.openCampaign && campaignId && (
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => ctx.openCampaign?.(campaignId)}>Open the campaign</button>
        )}
      </div>
      {added.length > 0 && !error && (
        <p className="mo-done">
          <CheckCircle size={15} weight="fill" aria-hidden="true" />
          {added.length === 1 ? "Added 1 person" : `Added ${added.length} people`} to {campaignName}. They're on its shortlist.
        </p>
      )}
      {error ? <p className="lv-note" role="alert">{String(error)}</p> : null}
    </>
  );
}
