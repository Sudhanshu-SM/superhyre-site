import { useMemo } from "react";
import { Clarified } from "../Clarify";
import { useCampaignRows } from "../campaignStore";
import { LiveOutreach } from "../Outreach";
import { campaignAsk, resolvedCampaignId } from "./ask";
import type { LiveViewProps } from "./types";

/**
 * Outreach for a campaign, in the chat: the console's own live outreach (drafts to read, edit and
 * approve, what is scheduled, what was sent), for the people the agent meant or the shortlist.
 * Which campaign is asked first, with tiles, when the request didn't say. Nothing is sent without
 * the recruiter's press on a draft.
 */
export default function OutreachView({ card, ctx }: LiveViewProps): JSX.Element {
  const rows = useCampaignRows();
  const ask = useMemo(() => campaignAsk(card, rows, { ask: "Which campaign should I write to?" }), [card, rows]);
  return (
    <Clarified kind="outreach" ctx={ctx} ask={ask}>
      {(c) => <Body card={card} ctx={c} />}
    </Clarified>
  );
}

function Body({ card, ctx }: LiveViewProps): JSX.Element | null {
  const rows = useCampaignRows();
  const id = resolvedCampaignId(card, ctx);
  if (!id) return null;
  const name = rows.find((r) => r.id === id)?.name ?? card.campaignName ?? "this campaign";
  return (
    <LiveOutreach
      campaign={{ id, name }}
      onGrow={ctx.onGrow}
      hosted={{ named: { candidateIds: card.candidateIds, personIds: card.personIds }, openProfile: ctx.openProfile }}
    />
  );
}
