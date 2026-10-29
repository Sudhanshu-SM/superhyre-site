import { useCallback, useEffect, useMemo, useState } from "react";
import type { MatchList } from "./api/agent";
import { agentApi, specApi } from "./api/agent";
import { getCandidate } from "./api/candidates";
import { api, LIVE } from "./api/client";
import { useMayChangeCampaign } from "./campaignRights";
import { onInvalidate } from "./invalidate";
import { candidateFromDetail, candidateFromMatch, setFromMatches } from "./liveCandidate";
import { candidateById, getSet, putSet, setOfCandidate, updateCandidate, useCandidateSets } from "./liveCandidates";
import { mergeSet } from "./liveSourcing";
import { matchFromProfile } from "./liveViews/compareLogic";
import { PageLoader } from "./components/PageLoader";
import { PassReasonDialog } from "./PassReason";
import { ProfileSidebar } from "./ProfileSidebar";
import { RankedMatches } from "./RankedMatches";
import { SearchHistoryButton } from "./SearchHistory";
import { SourcedEmpty } from "./SourcedEmpty";
import { SuggestNudge } from "./SuggestNudge";
import { asksAfter } from "./suggestNudge";
import { campaignLink } from "./nav";
import { similarToReject } from "./sourcedSimilar";
import { useToast } from "./toast";
import { undoNote } from "./verdictUndo";
import type { Verdict } from "./sourcing";
import "./sourced.css";

/**
 * Sourced: the people found for one campaign, to review. The ranked list is the page (not a dialog over the chat), the
 * first person is open beside it as soon as it loads, and the arrow keys move down it, opening each in turn. Shortlist
 * with S, reject with X (a rejection takes a short reason). The agent's chat is a click away, but nothing here needs it.
 */
export function SourcedPage({ campaignId, campaignName, onAgent }: {
  campaignId: string;
  campaignName: string;
  onAgent: (prompt?: string, opts?: { send?: boolean }) => void;
}) {
  useCandidateSets();
  const set = LIVE ? getSet(campaignId) : null;
  const may = useMayChangeCampaign(campaignId);
  const toast = useToast();
  const [state, setState] = useState<"loading" | "failed" | "ready">("loading");
  const [reload, setReload] = useState(0);
  const [verdicts, setVerdicts] = useState<Readonly<Record<string, Verdict>>>({});
  const [profile, setProfile] = useState<{ id: string; ids: readonly string[] } | null>(null);
  const [passing, setPassing] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  /* The most years the role asks for, when it says; a rejection for experience past it can take the rest who are past it too. */
  const [yearsMax, setYearsMax] = useState<number | null>(null);
  const [similar, setSimilar] = useState<{ ids: readonly string[]; max: number; reason: string } | null>(null);
  /* How many times someone was rejected with a reason on this page: each is a moment to say a change the daily search suggests. */
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    if (!LIVE) return undefined;
    let live = true;
    Promise.all([api<MatchList>("GET", `/v1/campaigns/${campaignId}/matches`), specApi.get(campaignId).catch(() => null)])
      .then(([m, s]) => {
        if (!live) return;
        putSet(mergeSet(getSet(campaignId), setFromMatches(campaignId, m.rows, s?.approved?.spec ?? null, new Date(), m.decided ?? [])));
        const top = s?.approved?.spec.yearsMax;
        setYearsMax(top && top > 0 ? top : null);
        setState("ready");
      })
      .catch(() => live && setState((cur) => (cur === "ready" ? cur : "failed")));
    return () => { live = false; };
  }, [campaignId, reload]);

  /* Something was written about people (here, in the chat, by the agent): the list is read again. */
  useEffect(() => onInvalidate((effects, campaigns) => {
    if ((effects.has("pipeline") || effects.has("candidates") || effects.has("sourcing")) && (campaigns.has(null) || campaigns.has(campaignId))) setReload((n) => n + 1);
  }), [campaignId]);

  const setVerdict = useCallback((id: string, v: Verdict | null) => {
    setVerdicts((all) => {
      const next = { ...all };
      if (v) next[id] = v;
      else delete next[id];
      return next;
    });
  }, []);
  const onVerdict = useCallback((id: string, v: Verdict | null) => {
    if (v === "shortlisted") {
      setVerdict(id, v);
      agentApi.shortlist(campaignId, [id]).catch(() => setVerdict(id, null));
    } else if (v === "rejected") setPassing(id);
    // Taking a shortlist or a pass back is not offered by the server: the press says so, and where to go.
    else {
      const note = undoNote(({ ...(getSet(campaignId)?.decisions ?? {}), ...verdicts })[id]);
      toast(note.text, "error", note.toPipeline ? { label: "Open the pipeline", onClick: () => { window.location.hash = campaignLink(campaignId, "pipeline"); } } : undefined);
    }
  }, [campaignId, setVerdict, verdicts, toast]);
  const passWith = useCallback((reason: string | undefined) => {
    const id = passing;
    setPassing(null);
    if (!id) return;
    setVerdict(id, "rejected");
    agentApi.reject(campaignId, [id], reason).catch(() => setVerdict(id, null));
    /* Rejected for experience while past the role's range: the others still to review who are past it too are offered. */
    const decided = { ...(getSet(campaignId)?.decisions ?? {}), ...verdicts, [id]: "rejected" as const };
    const ids = similarToReject(getSet(campaignId)?.candidates ?? [], decided, yearsMax, candidateById(id), reason);
    setSimilar(ids.length && yearsMax !== null && reason ? { ids, max: yearsMax, reason } : null);
    if (asksAfter(reason, may)) setAsked((n) => n + 1);
  }, [passing, campaignId, setVerdict, yearsMax, verdicts, may]);
  const rejectSimilar = () => {
    const now = similar;
    setSimilar(null);
    if (!now) return;
    for (const id of now.ids) setVerdict(id, "rejected");
    agentApi.reject(campaignId, [...now.ids], now.reason).then(() => setReload((n) => n + 1)).catch(() => { for (const id of now.ids) setVerdict(id, null); });
  };

  /* The full profile of whoever is open: the list gives the header and the fit, this the history. */
  useEffect(() => {
    if (!LIVE || !profile) return undefined;
    const s = setOfCandidate(profile.id);
    if (!s) return undefined;
    let current = true;
    if (candidateById(profile.id)?.inWorkspace === true || !s.campaignId) {
      getCandidate(profile.id).then((d) => { if (current) updateCandidate(candidateFromDetail(d)); }).catch(() => {});
      return () => { current = false; };
    }
    agentApi.matchProfile(campaignId, profile.id).then((mp) => {
      const base = s.candidates.find((c) => c.id === profile.id);
      if (!current || !base) return;
      updateCandidate(candidateFromMatch(
        { ...matchFromProfile(profile.id, mp), fullName: base.name, headline: base.headline, stage: mp.stage ?? "judged" },
        { criteria: s.criteria, profile: mp, campaignId },
      ));
    }).catch(() => {});
    return () => { current = false; };
  }, [profile?.id, campaignId]);

  const counts = useMemo(() => {
    const all = set?.candidates.length ?? 0;
    const decided = { ...(set?.decisions ?? {}), ...verdicts };
    const shortlisted = Object.values(decided).filter((v) => v === "shortlisted").length;
    const passed = Object.values(decided).filter((v) => v === "rejected").length;
    return { all, shortlisted, toReview: Math.max(0, all - shortlisted - passed) };
  }, [set, verdicts]);
  const unscored = set?.candidates.filter((c) => c.scored === false).length ?? 0;

  /* "Score the rest" starts a run on the server that reads each person in turn, which takes a while: the person is told it
     began, the list is read again every few seconds as people are scored, and the button says so until it is done. */
  const [watchUntil, setWatchUntil] = useState(0);
  const scoreRest = () => {
    setScoring(true);
    agentApi.score(campaignId)
      .then((r) => {
        toast(r.already ? "Those are already being read." : `Reading ${r.people} ${r.people === 1 ? "person" : "people"}. They move into place here as each is scored.`);
        setWatchUntil(Date.now() + 4 * 60_000);
        setReload((n) => n + 1);
      })
      .catch(() => toast("Couldn't start reading them. Try again.", "error"))
      .finally(() => setScoring(false));
  };
  const reading = watchUntil > Date.now() && unscored > 0;
  useEffect(() => {
    if (watchUntil <= Date.now()) return undefined;
    if (unscored === 0) { setWatchUntil(0); toast("Everyone has been read."); return undefined; }
    const t = window.setInterval(() => {
      if (Date.now() > watchUntil) { window.clearInterval(t); setWatchUntil(0); return; }
      setReload((n) => n + 1);
    }, 4000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchUntil, unscored]);

  /* The first read of the people found: the SuperHyre loader, in the middle of the page where the fallback's was (a page's file
     arriving and its data arriving are one wait, not two). A list already on hand is shown at once and read again quietly. */
  if (LIVE && state === "loading" && !set) return <PageLoader label="Reading the people found" />;

  return (
    <div className={`sp cw${profile ? " has-profile" : ""}`}>
      <header className="sp-head">
        <div>
          <h1 className="cw-h1">Sourced</h1>
          <p className="sp-sub t-body-sm">
            {state === "loading" && !set ? "Reading the people found…" : set && counts.all > 0
              ? <>{counts.all} found for {campaignName} · {counts.toReview} to review · {counts.shortlisted} shortlisted</>
              : null}
          </p>
        </div>
        <div className="sp-acts">
          {LIVE && <SearchHistoryButton campaignId={campaignId} />}
          {may && unscored > 0 && <button type="button" className="cw-btn" disabled={scoring || reading} onClick={scoreRest}>{scoring || reading ? `Reading ${unscored}…` : `Score the ${unscored} not read yet`}</button>}
          {may && counts.all > 0 && <button type="button" className="cw-btn is-primary" onClick={() => onAgent(`Find more people for ${campaignName}`, { send: true })}>Find more people</button>}
        </div>
      </header>

      {state === "failed" && !set && (
        <p className="sp-note" role="alert">Couldn't read the people found. <button type="button" className="cn-link" onClick={() => { setState("loading"); setReload((n) => n + 1); }}>Try again</button></p>
      )}
      {set && counts.all === 0 && state === "ready" && (
        <SourcedEmpty campaignId={campaignId} name={campaignName} may={may} onAgent={onAgent} />
      )}
      {similar && may && (
        <p className="sp-similar" role="status">
          <span>{similar.ids.length} more still to review {similar.ids.length === 1 ? "has" : "have"} over {similar.max} years of experience, past what the role asks for.</span>
          <button type="button" className="cw-btn is-primary" onClick={rejectSimilar}>Reject {similar.ids.length === 1 ? "them" : `all ${similar.ids.length}`}</button>
          <button type="button" className="cw-btn" onClick={() => setSimilar(null)}>Not now</button>
        </p>
      )}
      {may && <SuggestNudge campaignId={campaignId} campaignName={campaignName} asked={asked} hidden={similar !== null} onAgent={onAgent} />}
      {set && counts.all > 0 && (
        <RankedMatches
          inline
          autoSelect
          open
          set={set}
          onClose={() => {}}
          verdicts={verdicts}
          onVerdict={onVerdict}
          activeId={profile?.id ?? null}
          onOpen={(id, ids) => setProfile({ id, ids })}
          scoring={scoring || reading}
          {...(may ? { onScoreRest: scoreRest } : {})}
        />
      )}

      <PassReasonDialog who={passing ? (candidateById(passing)?.name.split(" ")[0] ?? "them") : null} onClose={() => setPassing(null)} onPass={passWith} />
      <ProfileSidebar
        candidate={profile ? candidateById(profile.id) ?? null : null}
        onClose={() => setProfile(null)}
        {...(() => {
          if (!profile) return {};
          const i = profile.ids.indexOf(profile.id);
          const go = (d: number) => {
            const next = profile.ids[i + d];
            return next ? () => setProfile({ ...profile, id: next }) : undefined;
          };
          return { onPrev: go(-1), onNext: go(1), position: { index: i, total: profile.ids.length } };
        })()}
        verdict={profile ? verdicts[profile.id] : undefined}
        onVerdict={onVerdict}
        scrim={false}
        canDecide={may}
        {...(() => {
          const s = profile ? setOfCandidate(profile.id) : null;
          return s ? { criteria: { text: s.criteria.map((c) => c.text), short: s.criteria.map((c) => c.short) } } : {};
        })()}
      />
    </div>
  );
}
