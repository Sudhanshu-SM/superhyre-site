import { useEffect, useState } from "react";
import type { ApiCampaign } from "./api/campaigns";
import { getCampaign } from "./api/campaigns";
import { api, messageOf } from "./api/client";
import type { Member } from "./api/identity";
import { identityApi } from "./api/identity";
import { teamsApi } from "./api/teams";
import type { Team } from "./api/teams";
import { VISIBILITY_HELP, VISIBILITY_LABEL } from "./campaignDraft";
import { retryCampaigns } from "./campaignStore";
import type { Priority } from "./campaignsData";
import { Dialog } from "./ui";
import "./newcampaign.css";
import "./campaignEdit.css";
import { Loader } from "./components/Loader";
import { Shimmer, ShimmerRegion } from "./components/Shimmer";

/**
 * A campaign's details after it was created: name, openings, priority, where it's based,
 * who can see it and who owns it. Only what changed is sent, so a field someone else
 * edited meanwhile is left alone. Visibility belongs to admins and the owner, ownership
 * to admins; those fields aren't offered to anyone else, rather than offered and refused.
 * The team it is on is the owner's to set to any team, and an admin's to set to a team they lead.
 */

export type CampaignEdits = Partial<Pick<ApiCampaign, "name" | "target" | "priority" | "location" | "visibility">> & {
  ownerId?: string;
  teamId?: string | null;
};

type Fields = { name: string; target: string; priority: Priority; location: string; visibility: "team" | "org"; ownerId: string; teamId?: string };

const PRIORITY_LABEL: Readonly<Record<Priority, string>> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

const fieldsOf = (c: ApiCampaign): Fields => ({
  name: c.name,
  target: String(c.target),
  priority: c.priority,
  location: c.location ?? "",
  visibility: c.visibility,
  ownerId: c.owner?.id ?? "",
  teamId: c.teamId ?? "",
});

/** The fields that differ from what was loaded, as the API's body; problems if any field won't do. */
export function editsFrom(before: Fields, after: Fields): { body: CampaignEdits; problems: Partial<Record<keyof Fields, string>> } {
  const problems: Partial<Record<keyof Fields, string>> = {};
  const body: CampaignEdits = {};
  const name = after.name.trim();
  if (name.length < 2) problems.name = "Give the campaign a name of at least 2 characters.";
  else if (name !== before.name) body.name = name;
  const target = Number(after.target);
  if (!Number.isInteger(target) || target < 1 || target > 1000) problems.target = "Openings is a whole number from 1 to 1000.";
  else if (String(target) !== before.target) body.target = target;
  if (after.priority !== before.priority) body.priority = after.priority;
  if (after.location.trim() !== before.location) body.location = after.location.trim() || null;
  if (after.visibility !== before.visibility) body.visibility = after.visibility;
  if (after.ownerId && after.ownerId !== before.ownerId) body.ownerId = after.ownerId;
  if ((after.teamId ?? "") !== (before.teamId ?? "")) body.teamId = after.teamId || null;
  return { body, problems };
}

export function CampaignEditDialog({
  open, onClose, campaignId, canShare, canReassign, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  /** Admins and the campaign's owner. */
  canShare: boolean;
  /** Admins only. */
  canReassign: boolean;
  onSaved: (name: string) => void;
}) {
  const [before, setBefore] = useState<Fields | null>(null);
  const [f, setF] = useState<Fields | null>(null);
  const [members, setMembers] = useState<readonly Member[]>([]);
  const [teams, setTeams] = useState<readonly Team[]>([]);
  const [problems, setProblems] = useState<Partial<Record<keyof Fields, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setBefore(null);
    setF(null);
    setProblems({});
    setError(null);
    getCampaign(campaignId).then(
      (c) => {
        if (!current) return;
        setBefore(fieldsOf(c));
        setF(fieldsOf(c));
      },
      (err: unknown) => current && setError(`This campaign didn't load. ${messageOf(err)}`),
    );
    if (canReassign) {
      identityApi.members().then((m) => current && setMembers(m.members.filter((x) => x.status === "active")), () => {});
      /* Only the teams the person may put it on: every one for the owner, their own for an admin (`canManage`). */
      teamsApi.list().then((t) => current && setTeams(t.teams.filter((x) => x.canManage)), () => {});
    }
    return () => { current = false; };
  }, [open, campaignId, canReassign]);

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((x) => (x ? { ...x, [k]: v } : x));

  const save = () => {
    if (!before || !f || saving) return;
    const { body, problems: p } = editsFrom(before, f);
    setProblems(p);
    if (Object.keys(p).length) return;
    if (!Object.keys(body).length) { onClose(); return; }
    setSaving(true);
    setError(null);
    api<ApiCampaign>("PATCH", `/v1/campaigns/${campaignId}`, body).then(
      (c) => {
        setSaving(false);
        retryCampaigns();
        onSaved(c.name);
        onClose();
      },
      (err: unknown) => {
        setSaving(false);
        setError(messageOf(err));
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} label="Campaign details" size="md">
      <form className="ce" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <header className="ce-h">
          <h2>Campaign details</h2>
          <p>The brief, spec and team have their own places; this is the rest.</p>
        </header>
        {!f ? (
          error ? <p className="ce-note" role="alert">{error}</p> : <ShimmerRegion label="Loading the details" className="ce-shm">
            <span className="ce-f" aria-hidden="true"><span>Name</span><Shimmer h={40} r={10} /></span>
            <div className="ce-row" aria-hidden="true">
              <span className="ce-f"><span>Openings</span><Shimmer h={40} r={10} /></span>
              <span className="ce-f"><span>Priority</span><Shimmer h={40} r={10} /></span>
            </div>
            <span className="ce-f" aria-hidden="true"><span>Where it's based</span><Shimmer h={40} r={10} /></span>
            <footer className="ce-foot">
              <button type="button" className="cw-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="cw-btn is-primary" disabled>Save</button>
            </footer>
          </ShimmerRegion>
        ) : (
          <>
            <label className="ce-f">
              <span>Name</span>
              <input className="ncx-in" value={f.name} maxLength={120} onChange={(e) => set("name", e.target.value)} aria-invalid={!!problems.name} />
              {problems.name && <em role="alert">{problems.name}</em>}
            </label>
            <div className="ce-row">
              <label className="ce-f">
                <span>Openings</span>
                <input className="ncx-in" inputMode="numeric" value={f.target} onChange={(e) => set("target", e.target.value.replace(/[^\d]/g, ""))} aria-invalid={!!problems.target} />
                {problems.target && <em role="alert">{problems.target}</em>}
              </label>
              <label className="ce-f">
                <span>Priority</span>
                <select className="ncx-in" value={f.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
                  {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
              </label>
            </div>
            <label className="ce-f">
              <span>Where it's based</span>
              <input className="ncx-in" value={f.location} maxLength={120} placeholder="City, or Remote" onChange={(e) => set("location", e.target.value)} />
            </label>
            {canShare && (
              <label className="ce-f">
                <span>Who can see it</span>
                <select className="ncx-in" value={f.visibility} onChange={(e) => set("visibility", e.target.value as "team" | "org")}>
                  <option value="team">{VISIBILITY_LABEL.team}</option>
                  <option value="org">{VISIBILITY_LABEL.org}</option>
                </select>
                <em>{VISIBILITY_HELP}</em>
              </label>
            )}
            {canReassign && members.length > 0 && (
              <label className="ce-f">
                <span>Owner</span>
                <select className="ncx-in" value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
                  {members.map((m) => <option key={m.userId} value={m.userId}>{m.fullName || m.email || "A teammate"}</option>)}
                </select>
              </label>
            )}
            {canReassign && (teams.length > 0 || f.teamId) && (
              <label className="ce-f">
                <span>Team</span>
                <select className="ncx-in" value={f.teamId ?? ""} onChange={(e) => set("teamId", e.target.value)}>
                  <option value="">No team</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  {f.teamId && !teams.some((t) => t.id === f.teamId) && <option value={f.teamId}>{before?.teamId === f.teamId ? "Its current team" : "Another team"}</option>}
                </select>
              </label>
            )}
            {error && <p className="ce-note is-bad" role="alert">{error}</p>}
            <footer className="ce-foot">
              <button type="button" className="cw-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="cw-btn is-primary" disabled={saving} aria-busy={saving || undefined}>{saving ? <><Loader size="sm" tone="inherit" />Saving</> : "Save"}</button>
            </footer>
          </>
        )}
      </form>
    </Dialog>
  );
}
