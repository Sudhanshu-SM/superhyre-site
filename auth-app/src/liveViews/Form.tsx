import { useEffect, useMemo, useState } from "react";
import { messageOf } from "../api/client";
import { Loader } from "../components/Loader";
import { Clarified } from "../Clarify";
import { campaignRow, useCampaignRows } from "../campaignStore";
import type { Form } from "../campaign";
import type { Family } from "../formKit";
import { draftForm, draftNameAlts, roleTitle, titleCase } from "../formKit";
import { ensureLiveDraft, loadForms } from "../formsStore";
import { FormDraft } from "../Moments";
import { resolvedCampaignId } from "./ask";
import { formAsk } from "./formAsk";
import { useRole, useRoleVersion } from "./roleFacts";
import type { LiveViewProps } from "./types";
import "./liveFormsOutreach.css";

/**
 * A screening form for a campaign, in the chat: the console's guided form flow (kind of role,
 * stack, the ideal hire in a line), drawn on the campaign's real role spec. The spec's must-haves,
 * minimum years and notice period become the form's must-haves; the draft is saved to the
 * workspace as a draft (nothing is published or sent), and opens in the builder from the card.
 */
export default function FormView({ card, ctx }: LiveViewProps): JSX.Element {
  const rows = useCampaignRows();
  /* The questions read each campaign's role as it arrives. */
  const arrived = useRoleVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ask = useMemo(() => formAsk(card, rows), [card, rows, arrived]);
  return (
    <Clarified kind="form" ctx={ctx} ask={ask}>
      {(c) => <Draft card={card} ctx={c} />}
    </Clarified>
  );
}

function Draft({ card, ctx }: LiveViewProps): JSX.Element {
  const campaignId = resolvedCampaignId(card, ctx);
  const role = useRole(campaignId);
  const rows = useCampaignRows();
  const row = rows.find((r) => r.id === campaignId);
  const [made, setMade] = useState<Form | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const a = ctx.answers ?? {};
  const facts = role.state === "ready" ? role.facts : null;
  const ready = !!campaignId && role.state === "ready" && !!row;

  useEffect(() => {
    if (!ready || !campaignId) return;
    let current = true;
    const family = (a.family as Family) ?? "other";
    /* A role typed in the chat wins; else the one the spec names. */
    const roleText = a.roleText ?? facts?.title;
    const name = campaignRow(campaignId)?.name ?? "New role";
    const base = `${roleText?.trim() ? titleCase(roleText) : roleTitle(name)} screening`;
    void (async () => {
      try {
        /* The campaign's existing forms first, so the new one gets a name none of them has. */
        await loadForms(campaignId);
        const form = await ensureLiveDraft(
          `${campaignId}|${ctx.said}|${JSON.stringify(a)}`,
          () => draftForm({ campaignId, family, sub: a.sub, roleText, ideal: a.ideal, facts }),
          draftNameAlts(base, family, a.sub, name),
          campaignId,
        );
        if (current) setMade(form);
      } catch (err) {
        if (current) setFailed(messageOf(err));
      }
    })();
    return () => { current = false; };
    // Once, when the campaign and its role are known: the answers are final by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, campaignId]);

  useEffect(() => { ctx.onGrow(); }, [made, failed, ctx]);

  if (failed) return <p className="lt-note" role="alert">I couldn't draft the form. {failed}</p>;
  if (!made) return <p className="pt-first" aria-live="polite"><Loader size="sm" /> Reading the role spec</p>;
  return <FormDraft ctx={ctx} live={{ form: made, facts, source: role.state === "ready" ? role.source : "none" }} />;
}
