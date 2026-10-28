import { useEffect, useState } from "react";
import { addToCampaign, type Captured, capturesFor, NotAddedError } from "./api/candidates";
import { LIVE } from "./api/client";
import { useCan } from "./can";
import { useFollowingLine, useMayChangeCampaign } from "./campaignRights";
import { invalidate } from "./invalidate";
import { useToast } from "./toast";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who saved them, as "Archi 30, Punith 2". Nothing when nobody is named. */
export function ownersLine(people: readonly Pick<Captured, "owner">[]): string {
  const by = new Map<string, number>();
  for (const p of people) if (p.owner) by.set(p.owner, (by.get(p.owner) ?? 0) + 1);
  return [...by].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name.split(" ")[0]} ${n}`).join(", ");
}

/** The words about people who were saved but are on no campaign. `team` is an owner's or admin's view of everyone's. */
export function capturesLine(n: number, name: string, team = false, owners = ""): string {
  const who = team ? `${n === 1 ? "person" : "people"} saved from LinkedIn${owners ? ` (${owners})` : ""}` : `${n === 1 ? "person" : "people"} you saved from LinkedIn`;
  return `${n} ${who} ${n === 1 ? "fits" : "fit"} ${name} and ${n === 1 ? "isn't" : "aren't"} on its shortlist yet.`;
}

/**
 * People saved with the Chrome extension land in Candidates and on no campaign (the extension shortlists onto a job only when
 * one is picked in it). On a campaign's Shortlisted page, those who fit its role are offered here: one press puts them on the
 * shortlist, so the extension and the campaign agree. An owner or admin sees everyone's, says whose, and can read who they are;
 * the press is only for someone who may change the campaign. Quiet when there are none.
 */
export function CapturesNudge({ campaignId, name }: { campaignId: string; name: string }) {
  const may = useMayChangeCampaign(campaignId);
  const manager = useCan("campaign.seeAll");
  const following = useFollowingLine();
  const toast = useToast();
  const [people, setPeople] = useState<readonly Captured[]>([]);
  const [busy, setBusy] = useState(false);
  const [away, setAway] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!LIVE || !(may || manager) || !UUID.test(campaignId)) return undefined;
    let live = true;
    setAway(false);
    capturesFor(campaignId).then((r) => { if (live) setPeople(r.people); }, () => { if (live) setPeople([]); });
    return () => { live = false; };
  }, [campaignId, may, manager]);

  if (!(may || manager) || away || people.length === 0) return null;
  const ids = people.map((p) => p.candidateId);
  const owners = ownersLine(people);
  const add = () => {
    setBusy(true);
    addToCampaign(campaignId, ids, "extension")
      .then(() => { toast(`Added ${ids.length} to the shortlist.`); setPeople([]); invalidate(["pipeline", "candidates"], { campaignId }); })
      .catch((e: unknown) => { toast(e instanceof NotAddedError ? e.message : "Couldn't add them. Try again.", "error"); })
      .finally(() => setBusy(false));
  };
  return (
    <div className="cn-nudge" role="status">
      <p className="cn-nudge-r">
        <span>{capturesLine(ids.length, name, manager, owners)}</span>
        {may && <button type="button" className="cw-btn is-primary" disabled={busy} onClick={add}>Add {ids.length === 1 ? "them" : `all ${ids.length}`} to the shortlist</button>}
        {manager && <button type="button" className="cw-link t-body-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Hide who" : "Show who"}</button>}
        <button type="button" className="cw-link t-body-sm" onClick={() => setAway(true)}>Not now</button>
      </p>
      {!may && <p className="cn-nudge-n t-body-sm">{following}</p>}
      {open && (
        <ul className="cn-nudge-l">
          {people.map((p) => (
            <li key={p.candidateId}><b>{p.name}</b><span>{[p.title, p.company].filter(Boolean).join(" · ")}</span>{p.owner && <em>{p.owner}</em>}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
