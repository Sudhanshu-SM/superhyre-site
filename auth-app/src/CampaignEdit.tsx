import { useEffect, useState } from "react";
import type { ApiCampaign } from "./api/campaigns";
import { getCampaign } from "./api/campaigns";
import { api, messageOf } from "./api/client";
import type { Member } from "./api/identity";
import { identityApi } from "./api/identity";
import { retryCampaigns } from "./campaignStore";
import type { Priority } from "./campaignsData";
import { Dialog } from "./ui";
import "./newcampaign.css";
import "./campaignEdit.css";
import { Loader } from "./components/Loader";

/**
 * A campaign's details after it was created: name, openings, priority, where it's based,
 * who can see it and who owns it. Only what changed is sent, so a field someone else
 * edited meanwhile is left alone. Visibility belongs to admins and the owner, ownership
 * to admins; those fields aren't offered to anyone else, rather than offered and refused.
 */

export type CampaignEdits = Partial<Pick<ApiCampaign, "name" | "target" | "priority" | "location" | "visibility">> & {
  ownerId?: string;
};

type Fields = { name: string; target: string; priority: Priority; location: string; visibility: "team" | "org"; ownerId: string };

const PRIORITY_LABEL: Readonly<Record<Priority, string>> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

const fieldsOf = (c: ApiCampaign): Fields => ({
  name: c.name,
  target: String(c.target),
  priority: c.priority,
  location: c.location ?? "",
  visibility: c.visibility,
  ownerId: c.owner?.id ?? "",
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
          error ? <p className="ce-note" role="alert">{error}</p> : <Loader size="md" label="Loading the details" block />
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
                  <option value="team">Its team and admins</option>
                  <option value="org">Everyone in the organisation</option>
                </select>
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
