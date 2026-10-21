import { useEffect, useState } from "react";
import { agentApi } from "./api/agent";
import { getCandidate } from "./api/candidates";
import { LIVE } from "./api/client";
import { ShimmerRegion, ShimmerText } from "./components/Shimmer";
import { candidateFromMatch } from "./liveCandidate";
import { matchFromProfile } from "./liveViews/compareLogic";
import { MatchResult } from "./MatchResult";
import type { Candidate } from "./sourcing";

/**
 * How well a candidate in the workspace matches the campaign they are in, for the places that open a person without
 * the ranked list (the Candidates page): the same panel the profile sheet has, read for their first campaign. Nothing
 * is drawn for someone who is in no campaign, or has no match yet to show.
 */
export function MatchSection({ candidateId, name }: { candidateId: string; name: string }): JSX.Element | null {
  const [state, setState] = useState<"loading" | "none" | { campaign: string; c: Candidate }>("loading");
  useEffect(() => {
    if (!LIVE) { setState("none"); return; }
    let gone = false;
    setState("loading");
    (async () => {
      const d = await getCandidate(candidateId);
      const campaign = d.campaigns[0];
      const personId = d.candidate.personId ?? null;
      if (!campaign || !personId) return "none" as const;
      const mp = await agentApi.matchProfile(campaign.id, personId);
      const c = candidateFromMatch({ ...matchFromProfile(personId, mp), fullName: name }, { profile: mp, campaignId: campaign.id });
      return c.result ? { campaign: campaign.name, c: { ...c, id: candidateId, personId } } : ("none" as const);
    })().then((r) => { if (!gone) setState(r); }, () => { if (!gone) setState("none"); });
    return () => { gone = true; };
  }, [candidateId, name]);
  if (state === "none") return null;
  if (state === "loading") return <ShimmerRegion as="section" label="Loading the match" className="cp-sec"><ShimmerText lines={3} /></ShimmerRegion>;
  return (
    <section className="cp-sec" aria-label="How well they match">
      <h3 className="cp-h">Match <span>· {state.campaign}</span></h3>
      <MatchResult c={state.c} />
    </section>
  );
}
