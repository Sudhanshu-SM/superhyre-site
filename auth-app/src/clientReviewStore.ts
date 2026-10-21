import { useEffect, useSyncExternalStore } from "react";
import { LIVE } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import type { ClientLink } from "./api/stages";
import * as stagesApi from "./api/stages";
import { resolveCampaignId } from "./campaignStore";

/**
 * The link a campaign gives its client, as live state: whether it is on, its address, how many people wait for the
 * client's word and what the client has said so far. The board's header reads it; Copy link, New link and Turn off
 * write it.
 *
 * Connected, this is the API's (`/v1/campaigns/:id/client-review`). On fixtures there is no page to send anyone to,
 * so the link is made here and says nothing about verdicts; the controls still behave.
 */

const links = new Map<string, ClientLink>();
const listeners = new Set<() => void>();
let epoch = 0;

const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const OFF: ClientLink = { enabled: false, url: null, stageId: null, waiting: 0, verdicts: { approved: 0, declined: 0 } };

const keyOf = (campaignId: string): string => (LIVE ? resolveCampaignId(campaignId) : campaignId);

/** Reads the link from the server; a refusal (not yours to see) leaves it unknown, and nothing is said. */
function load(id: string): void {
  if (!LIVE) { if (!links.has(id)) { links.set(id, OFF); emit(); } return; }
  const was = epoch;
  stagesApi.getClientLink(id).then((l) => {
    if (was !== epoch) return;
    links.set(id, l);
    emit();
  }, () => { /* no link to show */ });
}

/** The address a copied link carries when there is no server: it opens the review page's own demonstration. */
const localUrl = (): string => `${window.location.origin}${window.location.pathname}#/review/preview`;

/**
 * The campaign's client link, or null until it is known (or when it cannot be read). `signature` is anything that
 * says the board changed in a way the link's figures follow (who is waiting, who has answered): a new value reads
 * the link again.
 */
export function useClientLink(campaignId: string, wanted: boolean, signature: string): ClientLink | null {
  const id = keyOf(campaignId);
  const snapshot = () => links.get(id) ?? null;
  const link = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!wanted || !id) return;
    load(id);
  }, [id, wanted, signature]);
  return link;
}

/** Makes the link, or a new one: the earlier address stops working. Throws the server's own words when it is refused. */
export async function makeClientLink(campaignId: string, waiting = 0, stageId: string | null = null): Promise<ClientLink> {
  const id = keyOf(campaignId);
  const made: ClientLink = LIVE
    ? await stagesApi.makeClientLink(id)
    : { enabled: true, url: localUrl(), stageId, waiting, verdicts: { approved: 0, declined: 0 } };
  links.set(id, made);
  emit();
  return made;
}

/** Turns the link off: the address shows the client a calm "not active" page until a new one is made. */
export async function turnOffClientLink(campaignId: string): Promise<ClientLink> {
  const id = keyOf(campaignId);
  const was = links.get(id) ?? OFF;
  let off: ClientLink = { ...was, enabled: false, url: null };
  if (LIVE) {
    const answer = await stagesApi.turnOffClientLink(id);
    if (answer) off = answer;
  }
  links.set(id, off);
  emit();
  return off;
}

/** Forgets everything, for a new workspace and for tests. */
export function resetClientReviews(): void {
  epoch += 1;
  links.clear();
  emit();
}
onWorkspaceChange(resetClientReviews);
