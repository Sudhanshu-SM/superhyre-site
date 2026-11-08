import { useCallback, useState } from "react";
import { RoleSpecCard } from "../agentCards/RoleSpecCard";
import type { RoleSpecCardData } from "../api/agent";
import { specApi } from "../api/agent";
import { messageOf } from "../api/client";
import { setCampaignJd } from "../api/campaigns";
import { useCampaignRow } from "../campaignStore";
import { jdQuestion } from "../clarify";
import { DocumentCard } from "../Clarify";
import { reloadSpec } from "../specDraft";

/**
 * "Draft the role spec" on a campaign's card, as an action and not a message. With a job description on the campaign
 * the draft starts at once and the role spec card appears in place, reading it. Without one, the job description is
 * asked for right there (paste it, upload a file, or draft from what the set-up says); what is given is kept on the
 * campaign and the draft starts from it, and with nothing given the draft is made from the campaign's years and
 * must-haves, so the press always leads to requirements, never back to the same card. Nothing is sent to the agent,
 * so nothing comes back asking for what the card could ask itself.
 */

type Stage = "idle" | "asking" | "going" | "failed";

/** What a press on "Draft the role spec" does: draft from the job description the campaign has, or ask for one on the card. */
export const onDraftPress = (hasJd: boolean, stage: Stage): "draft" | "ask" | "wait" => (stage === "going" ? "wait" : hasJd ? "draft" : "ask");

/**
 * What a job description given on the card does: any text is kept on the campaign and drafted from; no text drafts from
 * what the campaign was set up with (the server reads its years and must-haves, and says what is missing if that is too little).
 */
export const onJdGiven = (text: string): "draft" | "setup" => (text.trim() ? "draft" : "setup");

export function useDraftSpec(campaignId: string | null, jdAtCreation = false) {
  const row = useCampaignRow(campaignId ?? "");
  const [stage, setStage] = useState<Stage>("idle");
  const [why, setWhy] = useState("");
  /* A job description given with the campaign is drafted from as soon as it exists: the card shows that, unasked. */
  const hasJd = jdAtCreation || Boolean(row?.setup?.jd?.trim());

  const draft = useCallback((id: string) => {
    setStage("going");
    setWhy("");
    specApi.draft(id).then(
      () => { setStage("idle"); void reloadSpec(id); },
      (err: unknown) => { setWhy(messageOf(err)); setStage("failed"); void reloadSpec(id); },
    );
  }, []);

  /** The press: draft from the job description kept on the campaign, or ask for one on the card. */
  const press = () => {
    if (!campaignId) return;
    const what = onDraftPress(hasJd, stage);
    if (what === "draft") draft(campaignId);
    else if (what === "ask") setStage("asking");
  };

  /** The job description's step is answered: `[text, source]`; no text is a draft from the set-up. */
  const give = ([text = ""]: readonly string[]) => {
    if (!campaignId) return;
    if (onJdGiven(text) === "setup") { draft(campaignId); return; }
    setStage("going");
    setWhy("");
    setCampaignJd(campaignId, text.trim()).then(
      () => draft(campaignId),
      (err: unknown) => { setWhy(messageOf(err)); setStage("failed"); },
    );
  };

  return { stage, why, hasJd, press, give, going: stage === "going", asking: stage === "asking", failed: stage === "failed" };
}

/** The tile that drafts without a job description: what it does, said as what it does. */
const FROM_SETUP = { label: "Draft from what you told me", meta: "The years and must-haves from the set-up. Add the JD any time." };

/** The job description's step, inline on a card. Without one, the third tile drafts from the set-up instead of waiting. */
export function JdStep({ name, onAnswer, onGrow }: { name: string; onAnswer: (ids: readonly string[]) => void; onGrow?: () => void }): JSX.Element {
  const q = jdQuestion(name);
  const options = q.options.map((o) => (o.id === "later" ? { ...o, ...FROM_SETUP } : o));
  return <DocumentCard q={{ ...q, options, ask: `Do you have the job description for ${name}?` }} doc={q.document!} onGrow={onGrow} onAnswer={onAnswer} />;
}

/** The role spec card as it first stands on a campaign's card: reading the job description, or the way it stopped. */
export function specCardFor(campaignId: string, name: string, drafting: boolean, trouble?: string | null): RoleSpecCardData {
  return {
    kind: "role_spec", key: `role_spec:${campaignId}`, campaignId, campaignName: name,
    specId: null, version: null, spec: null, approved: false, trouble: trouble ?? null,
    status: drafting ? "drafting" : "ready",
  };
}

/** The role spec card, drafting in place while the job description is read, and its own buttons after. */
export function DraftingSpec({ campaignId, name, drafting, trouble }: { campaignId: string; name: string; drafting: boolean; trouble?: string | null }): JSX.Element {
  return <RoleSpecCard card={specCardFor(campaignId, name, drafting, trouble)} />;
}
