import { useEffect, useState } from "react";
import { type Attached, attachCaptures } from "./api/candidates";
import { LIVE } from "./api/client";
import { useCampaignRow } from "./campaignStore";
import { useMayChangeCampaign } from "./campaignRights";
import { invalidate } from "./invalidate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A campaign opened twice in a breath is looked at once: the people saved in between are brought the next time. */
export const ATTACH_EVERY_MS = 30_000;
/** A visit brings up to this many rounds of the server's most (200): everyone who fits, whatever the list's length. */
const ROUNDS = 5;
const tried = new Map<string, number>();

type Person = Attached["people"][number];

/** Who saved them, as "Archi 30, Punith 2": first names, the whole name where two people share one. Nothing when nobody is named. */
export function ownersLine(people: readonly Pick<Person, "owner">[]): string {
  const by = new Map<string, number>();
  for (const p of people) if (p.owner) by.set(p.owner, (by.get(p.owner) ?? 0) + 1);
  const firsts = new Map<string, number>();
  for (const name of by.keys()) { const f = name.split(" ")[0] ?? name; firsts.set(f, (firsts.get(f) ?? 0) + 1); }
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([name, n]) => `${(firsts.get(name.split(" ")[0] ?? name) ?? 0) > 1 ? name : (name.split(" ")[0] ?? name)} ${n}`).join(", ");
}

/** What was done, in the words of a person who did it: not a question, a fact. */
export function attachedLine(n: number, name: string, owners = ""): string {
  return `Added ${n} ${n === 1 ? "person" : "people"} saved from LinkedIn${owners ? ` (${owners})` : ""} to ${name}'s shortlist.`;
}

type Held = { campaignId: string; people: readonly Person[]; remaining: number; failed: boolean; open: boolean; away: boolean };

/**
 * People saved with the Chrome extension land in Candidates and on no campaign (the extension shortlists onto a job only when one is
 * picked in it). Opening a campaign's Shortlisted page, or choosing it on the Candidates page, puts those who fit its role on its
 * shortlist by itself, with no question: the extension's work and the campaign agree. What was done is said once, with who and a way
 * to read the names; nothing is asked. An owner or admin brings everyone's, anyone else who may change the campaign their own;
 * someone who may not, and a closed campaign, are left alone. Quiet when there is nobody. Only a failure says anything more.
 *
 * Held for ONE campaign and read back only for it (the Candidates filter changes `campaignId` under a banner that is up): an answer
 * that comes after the page moved on still refreshes the lists, and says nothing to a page that is no longer there.
 * `flush`: the page lays the note out in a grid with a gap of its own, so it brings no margin.
 */
export function CapturesNudge({ campaignId, name, flush = false }: { campaignId: string; name: string; flush?: boolean }) {
  const may = useMayChangeCampaign(campaignId);
  const closed = useCampaignRow(campaignId)?.status === "closed";
  const [held, setHeld] = useState<Held | null>(null);
  const [again, setAgain] = useState(0);

  useEffect(() => {
    if (!LIVE || closed || !may || !UUID.test(campaignId)) return undefined;
    if (Date.now() - (tried.get(campaignId) ?? 0) < ATTACH_EVERY_MS) return undefined;
    tried.set(campaignId, Date.now());
    let live = true;
    void (async () => {
      const added: Person[] = [];
      let remaining = 0;
      try {
        for (let round = 0; round < ROUNDS; round++) {
          const r = await attachCaptures(campaignId);
          added.push(...r.people);
          remaining = r.remaining;
          if (!r.added || !r.remaining) break;
        }
      } catch {
        tried.delete(campaignId);
        if (live) setHeld({ campaignId, people: [], remaining: 0, failed: true, open: false, away: false });
        return;
      }
      if (added.length) invalidate(["pipeline", "candidates"], { campaignId });
      if (live && added.length) setHeld({ campaignId, people: added, remaining, failed: false, open: false, away: false });
    })();
    return () => { live = false; };
  }, [campaignId, closed, may, again]);

  const shown = held && held.campaignId === campaignId && !held.away ? held : null;
  /* The page under it may have measured how many rows fit before it came (the Candidates list does, and again when the window
     is resized): its coming and its going change the room, so say so the way a window does. */
  const visible = Boolean(shown);
  useEffect(() => {
    if (!visible || typeof window === "undefined") return undefined;
    window.dispatchEvent(new Event("resize"));
    return () => { window.dispatchEvent(new Event("resize")); };
  }, [visible]);

  if (!shown) return null;
  const change = (patch: Partial<Held>) => setHeld((cur) => (cur && cur.campaignId === campaignId ? { ...cur, ...patch } : cur));
  if (shown.failed) {
    return (
      <div className="cn-nudge" role="status" style={flush ? { margin: 0 } : undefined}>
        <p className="cn-nudge-r">
          <span>Couldn't add the people you saved from LinkedIn just now.</span>
          <button type="button" className="cw-link t-body-sm" onClick={() => { setHeld(null); setAgain((n) => n + 1); }}>Try again</button>
        </p>
      </div>
    );
  }
  return (
    <div className="cn-nudge" role="status" style={flush ? { margin: 0 } : undefined}>
      <p className="cn-nudge-r">
        <span>
          {attachedLine(shown.people.length, name, ownersLine(shown.people))}
          {shown.remaining > 0 ? ` ${shown.remaining} more are waiting: open this again to bring them.` : ""}
        </span>
        <button type="button" className="cw-link t-body-sm" aria-expanded={shown.open} onClick={() => change({ open: !shown.open })}>{shown.open ? "Hide who" : "Show who"}</button>
        <button type="button" className="cw-link t-body-sm" onClick={() => change({ away: true })}>Dismiss</button>
      </p>
      {shown.open && (
        <ul className="cn-nudge-l">
          {shown.people.map((p, i) => (
            <li key={`${i}-${p.name}`}><b>{p.name}</b><span>{[p.title, p.company].filter(Boolean).join(" · ")}</span>{p.owner && <em>{p.owner}</em>}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
