import { useEffect, useState } from "react";
import { addToCampaign, capturesFor, NotAddedError } from "./api/candidates";
import { LIVE } from "./api/client";
import { useMayChangeCampaign } from "./campaignRights";
import { invalidate } from "./invalidate";
import { useToast } from "./toast";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The words about people who were saved but are on no campaign. Plain data in, words out. */
export function capturesLine(n: number, name: string): string {
  return `${n} ${n === 1 ? "person" : "people"} you saved from LinkedIn ${n === 1 ? "fits" : "fit"} ${name} and ${n === 1 ? "isn't" : "aren't"} on its shortlist yet.`;
}

/**
 * People saved with the Chrome extension land in Candidates and on no campaign (the extension shortlists onto a job only when
 * one is picked in it). On a campaign's Shortlisted page, those who fit its role are offered here: one press puts them on the
 * shortlist, so the extension and the campaign agree. Quiet when there are none, and for someone who only follows the campaign.
 */
export function CapturesNudge({ campaignId, name }: { campaignId: string; name: string }) {
  const may = useMayChangeCampaign(campaignId);
  const toast = useToast();
  const [ids, setIds] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [away, setAway] = useState(false);

  useEffect(() => {
    if (!LIVE || !may || !UUID.test(campaignId)) return undefined;
    let live = true;
    setAway(false);
    capturesFor(campaignId).then((r) => { if (live) setIds(r.people.map((p) => p.candidateId)); }, () => { if (live) setIds([]); });
    return () => { live = false; };
  }, [campaignId, may]);

  if (!may || away || ids.length === 0) return null;
  const add = () => {
    setBusy(true);
    addToCampaign(campaignId, ids, "extension")
      .then(() => { toast(`Added ${ids.length} to the shortlist.`); setIds([]); invalidate(["pipeline", "candidates"], { campaignId }); })
      .catch((e: unknown) => { toast(e instanceof NotAddedError ? e.message : "Couldn't add them. Try again.", "error"); })
      .finally(() => setBusy(false));
  };
  return (
    <p className="cn-nudge" role="status">
      <span>{capturesLine(ids.length, name)}</span>
      <button type="button" className="cw-btn is-primary" disabled={busy} onClick={add}>Add {ids.length === 1 ? "them" : `all ${ids.length}`} to the shortlist</button>
      <button type="button" className="cw-link t-body-sm" onClick={() => setAway(true)}>Not now</button>
    </p>
  );
}
