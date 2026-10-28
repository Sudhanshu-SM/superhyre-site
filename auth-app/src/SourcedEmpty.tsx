import { useEffect, useState } from "react";
import { agentApi } from "./api/agent";
import type { SourcingStatus } from "./api/agent";
import { LIVE } from "./api/client";
import { useFollowingLine } from "./campaignRights";
import { EmptyArt } from "./EmptyArt";
import { factsFrom } from "./pipelineEmpty";
import { type SourcedGo, sourcedEmptyWords } from "./sourcedEmpty";
import { useCampaignSpec } from "./specDraft";

/**
 * The Sourced page with nobody on it: an illustration, what is true (no spec, a spec to approve, a search not started, one going,
 * one that found no one), and the one button that moves it on. A person who only follows the campaign reads why the button is not there.
 */
export function SourcedEmpty({ campaignId, name, may, onAgent }: {
  campaignId: string;
  name: string;
  may: boolean;
  onAgent: (prompt?: string, opts?: { send?: boolean }) => void;
}): JSX.Element {
  const spec = useCampaignSpec(campaignId);
  const following = useFollowingLine();
  const [sourcing, setSourcing] = useState<SourcingStatus | null>(null);
  useEffect(() => {
    if (!LIVE) return;
    let live = true;
    agentApi.sourcing(campaignId).then((s) => { if (live) setSourcing(s); }, () => undefined);
    return () => { live = false; };
  }, [campaignId]);

  const words = sourcedEmptyWords(factsFrom(spec.ready ? spec : null, LIVE ? sourcing : null), Boolean(sourcing?.lastRun), may);
  const go: Record<SourcedGo, () => void> = {
    draftSpec: () => onAgent(`Draft the role spec for ${name}`, { send: true }),
    approveSpec: () => onAgent(`Show me the role spec for ${name}`, { send: true }),
    find: () => onAgent(`Find people for ${name}`, { send: true }),
    broaden: () => onAgent(`Find more people for ${name} with broader filters`),
  };
  return (
    <div className="cw-empty sp-empty">
      <EmptyArt name="empty-search" size={180} />
      <h2>{words.title}</h2>
      <p>{words.body}</p>
      {words.cta && <button type="button" className="cw-btn is-primary" onClick={go[words.cta.go]}>{words.cta.label}</button>}
      {!may && <p className="sp-follow">{following}</p>}
    </div>
  );
}
