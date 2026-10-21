import { useContext, useEffect, useMemo, useState } from "react";
import { messageOf } from "../api/client";
import { TurnContext, saveMade, savedMade, savedTrail } from "../agentThread";
import { Loader } from "../components/Loader";
import { Clarified } from "../Clarify";
import { campaignRow, useCampaignRows } from "../campaignStore";
import type { Form } from "../campaign";
import type { Family } from "../formKit";
import { draftForm, draftNameAlts, roleTitle, titleCase } from "../formKit";
import { ensureLiveDraft, loadForms, recallForm, serverIdOf } from "../formsStore";
import { FormDraft, FormMade } from "../Moments";
import { resolvedCampaignId } from "./ask";
import { formAsk, madeFormOf } from "./formAsk";
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
  const turn = useContext(TurnContext);
  /* A form this card already made (the chat was left and come back to): it is shown as it stands, with its link
     and its answers, and its questions are never asked again. Read once: a form made now keeps its card. */
  const [madeId] = useState(() => madeFormOf(card.query) ?? (turn ? savedMade(turn.id) : null));
  const [again, setAgain] = useState(false);
  if (madeId && !again) return <Made id={madeId} ctx={ctx} onAgain={() => setAgain(true)} />;
  return <Guided card={card} ctx={ctx} />;
}

/**
 * A form the chat made, read again from the store or the server. If it has been deleted since, the card says
 * so and offers to draft it again: nothing is made just because the chat was opened.
 */
function Made({ id, ctx, onAgain }: { id: string; ctx: LiveViewProps["ctx"]; onAgain: () => void }): JSX.Element {
  const [form, setForm] = useState<Form | null | "missing">(null);
  useEffect(() => {
    let current = true;
    void recallForm(id).then((f) => { if (current) setForm(f ?? "missing"); });
    return () => { current = false; };
  }, [id]);
  useEffect(() => { ctx.onGrow(); }, [form, ctx]);
  if (form === "missing") {
    return (
      <div className="src mo">
        <p className="mo-note">That form has been deleted.</p>
        <div className="mo-acts"><button type="button" className="src-btn is-quiet mo-small" onClick={onAgain}>Draft it again</button></div>
      </div>
    );
  }
  if (!form) return <p className="pt-first" aria-live="polite"><Loader size="sm" /> Opening the form</p>;
  return <FormMade ctx={ctx} form={form} />;
}

function Guided({ card, ctx }: LiveViewProps): JSX.Element {
  const rows = useCampaignRows();
  /* The questions read each campaign's role as it arrives. */
  const arrived = useRoleVersion();
  const turn = useContext(TurnContext);
  /* Coming back to a half-answered card, the campaign it was about is read first: the questions are built
     from its role, so replaying the answers before it has arrived would find them different and ask again. */
  const back = turn?.restored ? (card.campaignId ?? savedTrail(turn.id).find((s) => s.qid === "campaign")?.ids[0] ?? null) : null;
  const waiting = useRole(back).state === "loading" && !!back;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ask = useMemo(() => formAsk(card, rows), [card, rows, arrived]);
  if (waiting) return <p className="pt-first" aria-live="polite"><Loader size="sm" /> Reading the role spec</p>;
  return (
    <Clarified kind="form" ctx={ctx} ask={ask}>
      {(c) => <Draft card={card} ctx={c} />}
    </Clarified>
  );
}

function Draft({ card, ctx }: LiveViewProps): JSX.Element {
  const turn = useContext(TurnContext);
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
        /* Kept under the card, by the server's id, so the chat coming back finds this form instead of asking for it. */
        void serverIdOf(form.id).then((id) => { if (turn) saveMade(turn.id, id); }, () => {});
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
