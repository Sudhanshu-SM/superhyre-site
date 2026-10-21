import { useEffect, useState } from "react";
import { agentApi } from "./api/agent";
import type { SourcingStatus } from "./api/agent";
import { LIVE } from "./api/client";
import { EmptyArt } from "./EmptyArt";
import { type EmptyGo, emptyBoardWords, factsFrom } from "./pipelineEmpty";
import { useCampaignSpec } from "./specDraft";

/**
 * The Pipeline with nobody on it: what to do next depends on how far the search has got (pipelineEmpty.ts), so the
 * words and the one button follow it. Until the server has said, the words are true whatever has happened.
 */
export function PipelineEmpty({ campaignId, name, onAgent }: {
  campaignId: string;
  name: string;
  onAgent: (prompt?: string, opts?: { send?: boolean }) => void;
}): JSX.Element {
  const spec = useCampaignSpec(campaignId);
  const [sourcing, setSourcing] = useState<SourcingStatus | null>(null);
  useEffect(() => {
    if (!LIVE) return;
    let live = true;
    agentApi.sourcing(campaignId).then((s) => { if (live) setSourcing(s); }, () => undefined);
    return () => { live = false; };
  }, [campaignId]);

  const words = emptyBoardWords(factsFrom(spec.ready ? spec : null, LIVE ? sourcing : null));
  const go: Record<EmptyGo, () => void> = {
    draftSpec: () => onAgent(`Draft the role spec for ${name}`, { send: true }),
    approveSpec: () => onAgent(`Show me the role spec for ${name}`, { send: true }),
    matches: () => onAgent(`Show the sourcing for ${name}`, { send: true }),
    broaden: () => onAgent(`Find more people for ${name} with broader filters`),
    brief: () => onAgent(),
  };
  return (
    <div className="cw-empty">
      <EmptyArt name="empty-shortlist" size={180} />
      <h2>{words.title}</h2>
      <p>{words.body}</p>
      {words.cta && <button type="button" className="cw-btn is-primary" onClick={go[words.cta.go]}>{words.cta.label}</button>}
    </div>
  );
}
