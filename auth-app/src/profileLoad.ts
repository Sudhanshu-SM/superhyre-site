import { useEffect, useState } from "react";
import { agentApi } from "./api/agent";
import { getCandidate } from "./api/candidates";
import { LIVE } from "./api/client";
import { candidateFromDetail, candidateFromMatch } from "./liveCandidate";
import { campaignOfCandidate } from "./liveCandidates";
import { matchFromProfile } from "./liveViews/compareLogic";
import type { Candidate } from "./sourcing";

/**
 * The sheet shows the same person the same way wherever it was opened from. A list, a card or a search result carries a
 * summary (name, headline, place, fit); the history (experience, schooling, skills), the LinkedIn page and the scoring
 * panel come from the person's own profile, which the sheet reads as soon as it opens for anyone who arrived without it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether this is only a summary: nothing of the person's history came with it. */
export const isSummaryOnly = (c: Pick<Candidate, "jobs" | "schools" | "skills">): boolean =>
  c.jobs.length === 0 && c.schools.length === 0 && Object.keys(c.skills).length === 0;

/** The summary with the profile's history laid over it; what the summary says about the fit (marks, result) stays. */
export function withProfile(summary: Candidate, profile: Candidate): Candidate {
  return {
    ...summary,
    headline: summary.headline || profile.headline,
    location: profile.location || summary.location,
    current: profile.current.name ? profile.current : summary.current,
    school: profile.school.name ? profile.school : summary.school,
    about: profile.about || summary.about,
    totalYears: profile.totalYears || summary.totalYears,
    avgTenure: profile.avgTenure || summary.avgTenure,
    jobs: profile.jobs,
    schools: profile.schools,
    skills: profile.skills,
    ...(profile.linkedinUrl || summary.linkedinUrl ? { linkedinUrl: (profile.linkedinUrl ?? summary.linkedinUrl) as string } : {}),
    ...(profile.result ? { result: profile.result, scored: profile.scored ?? summary.scored } : {}),
    ...(profile.resultCampaignId ?? summary.resultCampaignId ? { resultCampaignId: (profile.resultCampaignId ?? summary.resultCampaignId) as string } : {}),
    ...(profile.inWorkspace || summary.inWorkspace ? { inWorkspace: true } : {}),
    ...(profile.personId ?? summary.personId ? { personId: (profile.personId ?? summary.personId) as string } : {}),
  };
}

/** The candidate with their full profile, and whether it is still on its way (the sheet draws ghosts meanwhile). */
export function useFullCandidate(c: Candidate, campaignHint: string | null = null, reload = 0): { candidate: Candidate; loading: boolean } {
  /* A person who came with their history but no match result is read again when a campaign is known to put them in;
     `reload` reads them again whatever they came with (their full career was asked for and may have landed). */
  const summary = isSummaryOnly(c) || (campaignHint !== null && !c.result) || reload > 0;
  const [loaded, setLoaded] = useState<{ id: string; value: Candidate } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!LIVE || !summary || !UUID.test(c.id)) return;
    let gone = false;
    const campaignId = campaignHint ?? c.resultCampaignId ?? campaignOfCandidate(c.id);
    const load = async (): Promise<Candidate | null> => {
      /* Someone found by a search and not yet in the workspace: the profile the match carries. */
      if (!c.inWorkspace && campaignId) {
        const mp = await agentApi.matchProfile(campaignId, c.id);
        return candidateFromMatch({ ...matchFromProfile(c.id, mp), fullName: c.name }, { profile: mp, campaignId });
      }
      const detail = await getCandidate(c.id);
      const base = candidateFromDetail(detail);
      /* Someone in the workspace is in a campaign: that campaign's match is theirs too. */
      const personId = detail.candidate.personId ?? null;
      const cid = campaignId ?? detail.campaigns[0]?.id ?? null;
      if (cid && personId) {
        try {
          const mp = await agentApi.matchProfile(cid, personId);
          const m = candidateFromMatch({ ...matchFromProfile(personId, mp), fullName: base.name }, { profile: mp, campaignId: cid });
          return { ...base, personId, ...(m.result ? { result: m.result, scored: m.scored, resultCampaignId: cid } : {}) };
        } catch { /* their history alone is shown */ }
      }
      return base;
    };
    setFailed(null);
    load().then(
      (value) => { if (!gone) { if (value) setLoaded({ id: c.id, value }); else setFailed(c.id); } },
      () => { if (!gone) setFailed(c.id); },
    );
    return () => { gone = true; };
  }, [c.id, c.inWorkspace, c.resultCampaignId, c.name, summary, campaignHint, reload]);
  if (!summary) return { candidate: c, loading: false };
  if (loaded?.id === c.id) return { candidate: withProfile(c, loaded.value), loading: false };
  return { candidate: c, loading: LIVE && UUID.test(c.id) && failed !== c.id };
}
