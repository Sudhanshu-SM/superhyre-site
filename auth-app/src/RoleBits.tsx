import { LIVE } from "./api/client";
import { Check, Lock } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Call, PipelinePerson, BoardStage } from "./campaign";
import type { CampaignRow } from "./campaignsData";
import { TEAM } from "./campaignsData";
import { setCampaignTeam, useCampaignRows, useTeam } from "./campaignStore";
import { Avatar } from "./CandidateBits";
import { useToast } from "./Contacts";
import { EmptyArt } from "./EmptyArt";
import { OvCard, PanelRow } from "./OverviewPanel";
import { ROLE_LABEL, isAssigned, normaliseTeam, setSession, useSession } from "./roleStore";
import type { Role } from "./roleStore";
import { Dialog } from "./ui";
import type { MoveLike } from "./yourWork";
import { upLine, yourWork } from "./yourWork";
import "./roles.css";

/**
 * The role pieces: the account menu's "Viewing as" switch, the Assign
 * recruiters dialog, a calm confirm, the "not on this campaign" state and the
 * recruiter's "Your work on this campaign" card.
 */

const first = (name: string) => name.split(" ")[0] ?? name;

/* ── account menu: viewing as ── */

export function RoleSwitch() {
  const s = useSession();
  const roles: readonly Role[] = ["admin", "recruiter"];
  return (
    <div className="rl-view">
      <p className="rl-view-l t-caption" id="rl-view-l">Viewing as</p>
      <div className="rl-seg" role="radiogroup" aria-labelledby="rl-view-l">
        {roles.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={s.role === r} className={s.role === r ? "is-on" : ""} onClick={() => setSession({ role: r })}>
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      {s.role === "recruiter" && (
        <div className="rl-who" role="radiogroup" aria-label="Recruiter">
          {TEAM.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={s.name === m} className={s.name === m ? "is-on" : ""} onClick={() => setSession({ name: m })}>
              <Avatar name={m} hue="brand" size={20} />
              <span>{m}</span>
            </button>
          ))}
        </div>
      )}
      <p className="rl-view-n t-caption">
        {s.role === "admin" ? "Creates, assigns and closes campaigns." : `Opens campaigns of their own, and sees the ones ${first(s.name)} is on.`}
      </p>
    </div>
  );
}

/* ── assign recruiters ── */

export function AssignDialog({ row, open, onClose }: { row: CampaignRow | undefined; open: boolean; onClose: () => void }) {
  const rows = useCampaignRows();
  const members = useTeam();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const toast = useToast();
  useEffect(() => { if (open && row) setPicked(row.team); }, [open, row?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.status !== "closed") for (const n of members) if (isAssigned(r, n)) m.set(n, (m.get(n) ?? 0) + 1);
    return m;
  }, [rows, members]);
  if (!row) return null;
  const team = normaliseTeam(row.owner, picked, members);
  const toggle = (m: string) => setPicked((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  const save = () => {
    setCampaignTeam(row.id, team);
    const n = team.length;
    toast(`${n} ${n === 1 ? "recruiter" : "recruiters"} on ${row.name}`);
    onClose();
  };
  const same = team.length === row.team.length && team.every((m) => row.team.includes(m));
  return (
    <Dialog open={open} onClose={onClose} label="Assign recruiters" size="md">
      <form className="rl-dlg" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <header className="rl-dlg-h">
          <h2 className="t-title">Assign recruiters</h2>
          <p className="t-body-sm">Who works on {row.name}. Recruiters only see the campaigns they are on.</p>
        </header>
        <ul className="rl-pick" role="group" aria-label="Recruiters">
          {members.map((m) => {
            const owner = m === row.owner;
            const on = owner || picked.includes(m);
            const n = load.get(m) ?? 0;
            return (
              <li key={m}>
                <label className={`rl-pick-i${on ? " is-on" : ""}${owner ? " is-owner" : ""}`}>
                  <input type="checkbox" checked={on} disabled={owner} onChange={() => toggle(m)} />
                  <Avatar name={m} hue="brand" size={32} />
                  <span className="rl-pick-t">
                    <b className="t-body-strong">{m}</b>
                    <small className="t-body-sm">{owner ? "Owns this campaign" : n ? `On ${n} open ${n === 1 ? "campaign" : "campaigns"}` : "Not on an open campaign"}</small>
                  </span>
                  <span className="rl-box" aria-hidden="true">{owner ? <Lock size={12} weight="bold" /> : on && <Check size={12} weight="bold" />}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <footer className="rl-dlg-f">
          <p className="t-body-sm">{team.length} {team.length === 1 ? "recruiter" : "recruiters"} on this campaign</p>
          <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ct-btn is-primary" disabled={same}>Save</button>
        </footer>
      </form>
    </Dialog>
  );
}

/* ── a calm confirm ── */

export function ConfirmDialog({ open, title, body, confirm, danger, problem, busy, onConfirm, onClose }: {
  open: boolean; title: string; body: ReactNode; confirm: string; danger?: boolean;
  /** Something the answer could not do, said here where the person is looking rather than on the page behind. */
  problem?: string | null;
  /** The answer is on its way: the button waits rather than being pressed twice. */
  busy?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} label={title} size="md">
      <form className="rl-dlg is-confirm" onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
        <header className="rl-dlg-h">
          <h2 className="t-title">{title}</h2>
          <div className="t-body rl-dlg-b">{body}</div>
          {problem && <p className="t-body-sm rl-dlg-err" role="alert">{problem}</p>}
        </header>
        <footer className="rl-dlg-f">
          <span />
          <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className={`ct-btn ${danger ? "rl-danger" : "is-primary"}`} autoFocus disabled={busy} aria-busy={busy || undefined}>{confirm}</button>
        </footer>
      </form>
    </Dialog>
  );
}

/** Reopening asks the same question closing does: it starts sourcing and outreach again, so it is not one click. */
export function ReopenDialog({ open, name, onConfirm, onClose }: {
  open: boolean; name: string; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="Reopen this campaign?"
      body={<><b>{name}</b> becomes active again. Sourcing and outreach can start again, and everyone in the pipeline stays where they are.</>}
      confirm="Reopen campaign"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

/* ── not on this campaign ── */

export function NotOnCampaign({ row, onBack }: { row: CampaignRow | undefined; onBack: () => void }) {
  const owner = row?.owner;
  return (
    <div className="rl-away">
      <div className="rl-away-c">
        <EmptyArt name="err-no-access" size={180} />
        <h1 className="t-title">You're not on this campaign</h1>
        <p className="t-body">
          {row ? <>{row.name} is run by <b>{owner}</b>. Ask its owner or the team lead to add you and it will appear with your campaigns.</> : "Ask its owner or the team lead to add you and it will appear with your campaigns."}
        </p>
        <button type="button" className="ct-btn is-primary" onClick={onBack}>See your campaigns</button>
      </div>
    </div>
  );
}

/* ── your work on this campaign (recruiter) ── */

export function YourWorkCard({ name, people, calls, moves, onStage, onCalls, onPerson }: {
  name: string; people: readonly PipelinePerson[]; calls: readonly Call[]; moves: readonly MoveLike[];
  onStage: (s: BoardStage) => void; onCalls: () => void; onPerson: (id: string) => void;
}) {
  const w = useMemo(() => yourWork(people, calls, moves, name), [people, calls, moves, name]);
  /* the comparison sits under the row it is about, only when it went up */
  const up = upLine(w.up);
  const upFor = (k: NonNullable<typeof w.up>["what"]) => (w.up?.what === k && up ? <span className="rl-up">{up}</span> : undefined);
  const hire = w.hires.length === 1 ? w.hires[0]! : null;
  return (
    <OvCard title="Your work on this campaign" className="hp rl-work">
      <div className="hp-body">
        <ul className="hp-list">
          <PanelRow title="People you reached out to" sub={upFor("reachedOut")} value={w.reachedOut} onClick={() => onStage("outreach")} />
          {/* The campaign's own calls feed it (campaignCalls.ts); with none placed, the row is not drawn. */}
          {(!LIVE || w.calls > 0) && <PanelRow title="Calls you made" sub={upFor("calls")} value={w.calls} onClick={onCalls} />}
          <PanelRow title="People you moved forward" sub={upFor("moved")} value={w.moved} onClick={() => onStage("interviewing")} />
          <PanelRow title="Replies from your people" value={w.replied} onClick={() => onStage("outreach")} />
          <PanelRow
            title="Hires you own" sub={w.hires.length ? (hire ? hire.name : w.hires.slice(0, 3).map((p) => first(p.name)).join(", ")) : undefined}
            value={w.hires.length} onClick={() => (hire ? onPerson(hire.id) : onStage("hired"))}
          />
        </ul>
      </div>
    </OvCard>
  );
}
