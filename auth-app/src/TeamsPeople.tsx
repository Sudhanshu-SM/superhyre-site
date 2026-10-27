import { useCallback, useEffect, useRef, useState } from "react";
import { DotsThree, MagnifyingGlass } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
  approveRequest, changeRole, declineRequest, dropInvite, dropMember, handOwnership, identityApi, nameOf, readable,
  workspaceChanged,
} from "./api/identity";
import type { Invite, JoinRequest, Member, Members, OrgRole } from "./api/identity";
import { teamsApi } from "./api/teams";
import type { People, Person, Team } from "./api/teams";
import { actionsOn, peopleRoles } from "./can";
import type { Assignable, Standing } from "./can";
import { Popover, useToast } from "./Contacts";
import { Loader } from "./components/Loader";
import { Shimmer } from "./components/Shimmer";
import { StItemsGhost } from "./settingsGhosts";
import { pollWhileVisible } from "./livePoll";
import {
  groupByRole, INVITE_STATE_LABEL, INVITE_STATE_LINE, INVITE_STATE_TONE, inviteDetail, inviteIsOpen, inviteNeedsResend,
  ownerLeaveLine, ROLE_LABEL, ROLE_LINE,
} from "./membership";
import { Tag } from "./Tag";
import { Tile } from "./Tile";
import "./people.css";
import { Pager } from "./components/Pager";
import { clampedOffset } from "./sectionState";
import { ConfirmDialog } from "./RoleBits";
import { useAsked } from "./useAsked";
import { Guard } from "./Guard";
import { removalPreview } from "./api/windDown";
import { handoverLine, teamNames } from "./windDown";
import { Fld } from "./Settings";
import { LoadFailed } from "./ui";

/**
 * Everyone: the Teams page's second tab, and what Settings > Members used to be. Who is in the organisation, in
 * what role and on which teams, the invitations and requests to join, and what the viewer may do about each person.
 * The owner changes roles and removes anyone from the organisation (their work goes to someone they choose); an
 * admin takes people off the teams they lead and nothing more (`actionsOn`, the same table the server enforces).
 * Every change shows at once and is put back, with the reason, if the API refuses it.
 */

/** How often the list is read again while it is on screen. */
export const MEMBERS_POLL_MS = 15_000;
/** People on a page of the Everyone list. */
export const PEOPLE_PAGE = 12;

const toMembers = (p: People): Members => ({ members: p.people, requests: p.requests, invites: p.invites });
const teamsOfPerson = (m: Member): Person["teams"] => (m as Partial<Person>).teams ?? [];

const day = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const date = (iso: string) => day.format(new Date(iso));
const first = (n: string) => n.split(" ")[0] ?? n;
const AS: Readonly<Record<Assignable, string>> = { admin: "an admin", recruiter: "a recruiter" };

type Load = { s: "loading" } | { s: "error" } | { s: "ready"; data: Members };

export function TeamsPeople({ me, role, orgName, reload, say, teams, onChanged }: {
  me: string;
  role: OrgRole;
  orgName: string;
  /** Reloads the account, for changes to the viewer's own role or place. */
  reload: () => Promise<void>;
  /** One calm line above the console, which survives it being reloaded. */
  say?: (text: string) => void;
  /** The teams, for the ones an admin leads. */
  teams: readonly Team[];
  /** Something here changed what the teams show (a person left, a role moved): read them again. */
  onChanged?: () => void;
}) {
  const standing: Standing = role;
  const manages = role === "owner" || role === "admin";
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [handing, setHanding] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [offering, setOffering] = useState<Member | null>(null);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const toast = useToast();
  /* An admin takes someone off a team they lead; the owner's removal is out of the organisation. */
  const led = new Set(teams.filter((t) => t.canManage).map((t) => t.id));
  const offTeams = (m: Member) => teamsOfPerson(m).filter((t) => led.has(t.id) && !t.lead);

  const fetchMembers = useCallback(async () => {
    try {
      const data = toMembers(await teamsApi.people());
      setLoad({ s: "ready", data });
    } catch {
      setLoad((cur) => (cur.s === "ready" ? cur : { s: "error" }));
    }
  }, []);
  useEffect(() => { void fetchMembers(); }, [fetchMembers]);
  /* Live: someone accepting an invitation, asking to join or leaving shows here without a reload. A change the
     person is making is left alone until it has settled, so a refresh never undoes what they just did. */
  const changing = useRef(0);
  useEffect(() => pollWhileVisible(() => { if (changing.current === 0) void fetchMembers(); }, MEMBERS_POLL_MS), [fetchMembers]);

  if (load.s === "loading") {
    /* The page's invite button (the person's standing is known before the list is); the rows are ghosts. */
    return (
      <div className="pp">
        <div className="pp-head">
          <Shimmer h={14} lh={20} w={160} />
          {peopleRoles(standing, "invite").length > 0 && <button type="button" className="ncx-btn is-sm" disabled>Invite someone</button>}
        </div>
        <StItemsGhost n={4} label="Loading everyone" />
      </div>
    );
  }
  if (load.s === "error") {
    return (
      <div className="pp">
        <LoadFailed what="The people here" onRetry={() => { setLoad({ s: "loading" }); void fetchMembers(); }} />
      </div>
    );
  }
  const data = load.data;
  const mayInvite = peopleRoles(standing, "invite").length > 0;

  /** Shows `next` now, runs the call, then loads the real list, or puts `data` back. */
  const change = async (next: Members, call: () => Promise<unknown>, done?: string) => {
    const before = data;
    setError(null);
    setLoad({ s: "ready", data: next });
    changing.current += 1;
    try {
      await call();
      if (done) toast(done);
      await fetchMembers();
    } catch (err) {
      setLoad({ s: "ready", data: before });
      setError(readable(err));
    } finally {
      changing.current -= 1;
    }
  };

  const decide = (r: JoinRequest, approve: boolean, as: Assignable) => {
    const who = r.fullName?.trim() || r.email;
    void change(
      approve ? approveRequest(data, r, as) : declineRequest(data, r.id),
      () => identityApi.decide(r.id, { approve, role: as }),
      approve ? `${who} joined as ${AS[as]}` : `Declined ${who}`,
    );
  };

  /** Sends an invitation again: a new link (the old one can't be read back, so asking again replaces it) and a new email. */
  const sendAgain = async (i: Invite) => {
    setError(null);
    try {
      const made = await identityApi.invite({ email: i.email, role: i.role });
      if (made.emailed) toast(`Invitation sent again to ${i.email}. The earlier link no longer works.`);
      else {
        try { await navigator.clipboard.writeText(made.link); toast(`${made.emailError ?? "The email didn't go."} The new link is copied, so you can share it.`); }
        catch { toast(`${made.emailError ?? "The email didn't go."} Use Copy link to share it.`); }
      }
      await fetchMembers();
    } catch (err) {
      setError(readable(err));
    }
  };

  /** A new link, copied, with no email (the earlier link stops working). */
  const copyFresh = async (i: Invite) => {
    setError(null);
    try {
      const made = await identityApi.invite({ email: i.email, role: i.role, notify: false });
      try { await navigator.clipboard.writeText(made.link); toast("Link copied. The earlier one no longer works."); }
      catch { toast("A new link is ready. Copy it from Invite someone."); }
      await fetchMembers();
    } catch (err) {
      setError(readable(err));
    }
  };

  const leave = async () => {
    setLeaving(false);
    setError(null);
    try {
      await identityApi.leaveOrganisation();
      workspaceChanged();
      await reload();
      say?.(`You've left ${orgName}. Personal is as you left it.`);
    } catch (err) {
      setError(readable(err));
    }
  };

  const needle = q.trim().toLowerCase();
  const people = groupByRole(data.members).flatMap((g) => g.people)
    .filter((m) => !needle || `${nameOf(m)} ${m.email ?? ""}`.toLowerCase().includes(needle));
  const at = clampedOffset(offset, people.length, PEOPLE_PAGE);
  const shown = people.slice(at, at + PEOPLE_PAGE);
  const invites = manages ? data.invites.filter((i) => !needle || i.email.toLowerCase().includes(needle)) : [];
  const waiting = data.invites.filter(inviteIsOpen).length;
  const summary = [
    data.members.length === 1 ? "1 person" : `${data.members.length} people`,
    manages && waiting > 0 ? `${waiting} invited` : null,
    manages && data.requests.length > 0 ? `${data.requests.length} asking to join` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="pp">
      <div className="pp-head">
        <p className="pp-sum t-body-sm">{summary}</p>
        <span className="pp-tools">
          {data.members.length + data.invites.length > 8 && (
            <label className="tm-search">
              <MagnifyingGlass size={14} weight="bold" aria-hidden="true" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search people" aria-label="Search people" />
            </label>
          )}
          {mayInvite && !inviting && (
            <button type="button" className="ncx-btn is-sm is-primary" onClick={() => setInviting(true)}>Invite someone</button>
          )}
        </span>
      </div>
      {error && <p className="st-err t-body-sm" role="alert">{error}</p>}

      {inviting && (
        <InviteForm
          standing={standing}
          onClose={() => setInviting(false)}
          onSent={() => void fetchMembers()}
          invites={data.invites}
        />
      )}

      {manages && data.requests.length > 0 && (
        <section className="pp-sec" aria-label="Asking to join">
          <h3 className="pp-h t-title-sm">Asking to join <small>{data.requests.length}</small></h3>
          <ul className="pp-grid">
            {data.requests.map((r) => <RequestCard key={r.id} r={r} standing={standing} onDecide={decide} />)}
          </ul>
        </section>
      )}

      <section className="pp-sec" aria-label="People" data-pager-list>
        <h3 className="pp-h t-title-sm">People <small>{people.length}</small></h3>
        {shown.length === 0 ? (
          <p className="pp-empty t-body-sm">No one matches that.</p>
        ) : (
          <ul className="pp-grid">
            {shown.map((m) => (
              <PersonCard
                key={m.userId}
                m={m}
                self={m.userId === me}
                standing={standing}
                offTeams={offTeams(m)}
                onRole={(to) => void change(changeRole(data, m.userId, to), async () => { await identityApi.setRole(m.userId, to); onChanged?.(); },
                  `${nameOf(m)} is now ${AS[to]}`)}
                onRemove={() => setRemoving(m)}
                onOffer={() => setOffering(m)}
                onHand={() => setHanding(m)}
              />
            ))}
          </ul>
        )}
      </section>

      {invites.length > 0 && (
        <section className="pp-sec" aria-label="Invitations">
          <h3 className="pp-h t-title-sm">Invitations <small>{invites.length}</small></h3>
          <ul className="pp-grid">
            {invites.map((i) => (
              <InviteCard
                key={i.id}
                i={i}
                mine={peopleRoles(standing, "invite").includes(i.role)}
                onSendAgain={() => void sendAgain(i)}
                onCopy={() => void copyFresh(i)}
                onCancel={() => void change(dropInvite(data, i.id), () => identityApi.revokeInvite(i.id), `Invite for ${i.email} cancelled`)}
              />
            ))}
          </ul>
        </section>
      )}

      {role === "owner" && (
        <p className="pp-foot t-body-sm">{ownerLeaveLine(orgName, data.members.filter((m) => m.userId !== me).length)}</p>
      )}

      {role !== "owner" && (
        <div className="pp-foot t-body-sm">
          <p className="pp-note">Leaving takes you out of {orgName}. Your campaigns and clients stay with it, with its owner. Your Personal stays as it is.</p>
          <p className="st-acts"><button type="button" className="st-link" onClick={() => setLeaving(true)}>Leave {orgName}</button></p>
        </div>
      )}

      <Pager offset={at} limit={PEOPLE_PAGE} total={people.length} unit="people" variant="foot" onChange={setOffset} />

      <TakeOffDialog
        member={offering}
        teams={offering ? offTeams(offering) : []}
        orgName={orgName}
        onClose={() => setOffering(null)}
        onConfirm={(m) => {
          setOffering(null);
          const names = offTeams(m).map((t) => t.name).join(" and ");
          void change(data, async () => { await teamsApi.removePerson(m.userId); onChanged?.(); },
            `${nameOf(m)} is off ${names}. They're still in ${orgName}.`);
        }}
      />

      <RemoveDialog
        member={removing}
        orgName={orgName}
        members={data.members}
        me={me}
        onClose={() => setRemoving(null)}
        onRemove={(m, to) => {
          setRemoving(null);
          const heir = data.members.find((x) => x.userId === to);
          void change(dropMember(data, m.userId), async () => { await teamsApi.removePerson(m.userId, to); onChanged?.(); },
            `${nameOf(m)} removed from ${orgName}. ${heir ? `${first(nameOf(heir))} has their work.` : ""}`.trim());
        }}
      />

      <ConfirmDialog
        open={handing !== null}
        title={handing ? `Make ${nameOf(handing)} the owner?` : "Make owner"}
        body={<>There is one owner, and only they can hand ownership on. You'll stay on as an admin.</>}
        confirm="Make owner"
        onClose={() => setHanding(null)}
        onConfirm={() => {
          const m = handing;
          setHanding(null);
          if (!m) return;
          void change(handOwnership(data, me, m.userId), async () => {
            await identityApi.transferOwnership(m.userId);
            await reload();
          }, `${nameOf(m)} is now the owner`);
        }}
      />

      <ConfirmDialog
        open={leaving}
        title={`Leave ${orgName}?`}
        body={<>You'll go back to Personal. To come back you'd ask {orgName} to let you in again.</>}
        confirm="Leave"
        danger
        onClose={() => setLeaving(false)}
        onConfirm={() => void leave()}
      />
    </div>
  );
}

/** The line under a member's name: their address, when they have a name and we may show it. */
export const addressLine = (m: { fullName: string | null; email: string | null }): string | null =>
  m.fullName?.trim() && m.email ? m.email : null;

/** The ⋯ button and its menu, shared by a person's card and an invitation's. */
function CardMenu({ label, width = 220, children }: { label: string; width?: number; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchor} type="button" className="st-more pp-more" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <DotsThree size={18} weight="bold" aria-hidden="true" />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" width={width}>
        <div className="ct-menu" role="menu">{children(() => setOpen(false))}</div>
      </Popover>
    </>
  );
}

function PersonCard({ m, self, standing, offTeams, onRole, onRemove, onOffer, onHand }: {
  m: Member;
  self: boolean;
  standing: Standing;
  /** The teams an admin leads that this person is a plain member of: what "Take off" would leave. */
  offTeams: Person["teams"];
  onRole: (to: Assignable) => void;
  onRemove: () => void;
  onOffer: () => void;
  onHand: () => void;
}) {
  const may = actionsOn(standing, { role: m.role, self });
  const takeOff = !self && standing === "admin" && m.role !== "owner" && offTeams.length > 0;
  const any = may.roles.length > 0 || may.remove || may.makeOwner || takeOff;
  const teams = teamsOfPerson(m);
  const name = nameOf(m);
  const item = (close: () => void, fn: () => void, label: string, danger = false) => (
    <button type="button" role="menuitem" className={`ct-menu-i${danger ? " is-danger" : ""}`} onClick={() => { close(); fn(); }}>
      <span className="ct-menu-t">{label}</span>
    </button>
  );
  return (
    <li className="pp-card">
      <Tile name={name} url={m.avatarUrl ?? null} />
      <div className="pp-body">
        <span className="pp-top">
          <span className="t-body-strong sl-ell">{name}</span>
          {self && <Tag title="This is you">You</Tag>}
          {any && (
            <CardMenu label={`Actions for ${name}`}>
              {(close) => (
                <>
                  {may.roles.map((to) => <span key={to}>{item(close, () => onRole(to), `Make ${to === "admin" ? "an admin" : "a recruiter"}`)}</span>)}
                  {may.makeOwner && item(close, onHand, "Make owner")}
                  {takeOff && item(close, onOffer, `Take ${first(name)} off ${offTeams.length === 1 ? offTeams[0]?.name : "their teams"}`)}
                  {may.remove && item(close, onRemove, `Remove ${first(name)} from the organisation`, true)}
                </>
              )}
            </CardMenu>
          )}
        </span>
        <span className="pp-role t-body-sm" title={ROLE_LINE[m.role]}>{ROLE_LABEL[m.role]}</span>
        {/* The address once: under a name, never again under the address that stands in for one, and not at
            all for a recruiter looking at a teammate (those are an owner's and admin's to see). */}
        {addressLine(m) && <span className="pp-sub t-body-sm sl-ell">{addressLine(m)}</span>}
        {teams.length > 0 && (
          <span className="pp-tags">
            {teams.map((t) => <Tag key={t.id} {...(t.lead ? { tone: "accent" as const, title: `Leads ${t.name}` } : {})}>{t.lead ? `${t.name} · Lead` : t.name}</Tag>)}
          </span>
        )}
        <span className="pp-sub t-body-sm">
          {m.campaigns === 1 ? "1 campaign" : `${m.campaigns} campaigns`} · Joined {date(m.joinedAt)}
        </span>
      </div>
    </li>
  );
}

/** Under someone asking to join: their address when they gave a name, and plainly that they gave none when not. */
export function requestLine(r: Pick<JoinRequest, "fullName" | "email" | "requestedAt">): string {
  const when = `asked ${date(r.requestedAt)}`;
  return r.fullName?.trim() ? `${r.email}, ${when}` : `${when}. No name on their account yet`;
}

function RequestCard({ r, standing, onDecide }: {
  r: JoinRequest;
  standing: Standing;
  onDecide: (r: JoinRequest, approve: boolean, as: Assignable) => void;
}) {
  const choices = peopleRoles(standing, "approve");
  const [as, setAs] = useState<Assignable>("recruiter");
  const who = r.fullName?.trim() || r.email;
  return (
    <li className="pp-card">
      <Tile name={who} />
      <div className="pp-body">
        <span className="t-body-strong sl-ell">{who}</span>
        <span className="pp-sub t-body-sm">{requestLine(r)}</span>
        <span className="pp-acts">
          {choices.length > 1 && (
            <select className="ncx-in st-role" value={as} aria-label={`Role for ${who}`}
              onChange={(e) => setAs(e.target.value === "admin" ? "admin" : "recruiter")}>
              <option value="recruiter">As recruiter</option>
              <option value="admin">As admin</option>
            </select>
          )}
          <button type="button" className="ncx-btn is-sm is-primary" onClick={() => onDecide(r, true, choices.length > 1 ? as : "recruiter")}>Approve</button>
          <button type="button" className="ncx-btn is-sm" onClick={() => onDecide(r, false, "recruiter")}>Decline</button>
        </span>
      </div>
    </li>
  );
}

/** One invitation, as a person yet to arrive: an envelope for a picture, the address, the role, where it stands and what can be done. */
function InviteCard({ i, mine, onSendAgain, onCopy, onCancel }: {
  i: Invite;
  mine: boolean;
  onSendAgain: () => void;
  onCopy: () => void;
  onCancel: () => void;
}) {
  const live = inviteIsOpen(i);
  const item = (close: () => void, fn: () => void, label: string, danger = false) => (
    <button type="button" role="menuitem" className={`ct-menu-i${danger ? " is-danger" : ""}`} onClick={() => { close(); fn(); }}>
      <span className="ct-menu-t">{label}</span>
    </button>
  );
  return (
    <li className="pp-card">
      <Tile name={i.email} invited />
      <div className="pp-body">
        <span className="pp-top">
          <span className="t-body-strong sl-ell">{i.email}</span>
          {mine && live && (
            <CardMenu label={`Actions for the invitation to ${i.email}`} width={200}>
              {(close) => (
                <>
                  {!inviteNeedsResend(i) && item(close, onSendAgain, "Send again")}
                  {item(close, onCopy, "Copy link")}
                  {item(close, onCancel, "Cancel invitation", true)}
                </>
              )}
            </CardMenu>
          )}
        </span>
        <span className="pp-role t-body-sm" title={ROLE_LINE[i.role]}>{ROLE_LABEL[i.role]}</span>
        <span className="pp-tags"><Tag tone={INVITE_STATE_TONE[i.state]} title={INVITE_STATE_LINE[i.state]}>{INVITE_STATE_LABEL[i.state]}</Tag></span>
        <span className="pp-sub t-body-sm">{inviteDetail(i, date)}</span>
        {mine && inviteNeedsResend(i) && (
          <span className="pp-acts"><button type="button" className="ncx-btn is-sm" onClick={onSendAgain}>Send again</button></span>
        )}
      </div>
    </li>
  );
}

function InviteForm({ standing, invites, onClose, onSent }: {
  standing: Standing;
  invites: Invite[];
  onClose: () => void;
  onSent: () => void;
}) {
  const roles = peopleRoles(standing, "invite");
  const [email, setEmail] = useState("");
  const [as, setAs] = useState<Assignable>("recruiter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; email: string; link: string; emailed: boolean; reason: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const until = made ? invites.find((i) => i.id === made.id)?.expiresAt : undefined;

  const send = async () => {
    const address = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) { setError("Enter a full email address."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await identityApi.invite({ email: address, role: roles.includes(as) ? as : "recruiter" });
      setMade({ id: res.inviteId, email: res.email, link: res.link, emailed: res.emailed === true, reason: res.emailError ?? null });
      setCopied(false);
      onSent();
    } catch (err) {
      setError(readable(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.link);
      setCopied(true);
    } catch {
      linkRef.current?.select();
    }
  };

  if (made) {
    return (
      <div className="pp-invite">
        <p className="t-body">
          {made.emailed
            ? <>We've emailed an invitation to <strong>{made.email}</strong>, and they'll see it in their notifications. Its status shows under Invitations below. You can also share this link{until ? `. It works until ${date(until)}` : ""}.</>
            : <>Invitation made for <strong>{made.email}</strong>, and they'll see it in their notifications. {made.reason ?? "We couldn't email it just now."} Share this link with them{until ? `. It works until ${date(until)}` : ""}.</>}
        </p>
        <div className="pp-copy">
          <input ref={linkRef} className="ncx-in" readOnly value={made.link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
          <button type="button" className="ncx-btn is-primary" onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button>
        </div>
        <p className="st-acts">
          <button type="button" className="st-link" onClick={() => { setMade(null); setEmail(""); }}>Invite someone else</button>
          <button type="button" className="st-link" onClick={onClose}>Done</button>
        </p>
      </div>
    );
  }

  const chosen: Assignable = roles.includes(as) ? as : "recruiter";
  return (
    <form className="pp-invite" onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate>
      <div className="ncx-grid">
        <Fld id="st-inv-email" label="Email" error={error}>
          <input id="st-inv-email" className="ncx-in" type="email" value={email} autoFocus placeholder="name@company.com"
            aria-invalid={!!error} onChange={(e) => { setEmail(e.target.value); setError(null); }} />
        </Fld>
        <div className="ncx-f">
          <span className="ncx-l" id="st-inv-role">Role</span>
          {roles.length > 1 ? (
            <div className="ncx-seg" role="radiogroup" aria-labelledby="st-inv-role">
              {roles.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={chosen === r} className={chosen === r ? "is-on" : ""} onClick={() => setAs(r)}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          ) : (
            <p className="st-read t-body">{ROLE_LABEL[chosen]}</p>
          )}
          <small className="ncx-hint">{ROLE_LINE[chosen]}</small>
        </div>
      </div>
      <footer className="st-foot">
        <span />
        <button type="button" className="ncx-btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="ncx-btn is-primary" disabled={busy}>{busy ? <><Loader size="sm" tone="inherit" />Sending</> : "Send invitation"}</button>
      </footer>
    </form>
  );
}

/** What an admin's "Remove" means: off the teams they lead, and still in the organisation. */
export const takeOffLine = (orgName: string): string =>
  `They stay in ${orgName}, with their campaigns, and can still be put on a team again.`;

/** What the owner's Remove means, said plainly before it happens. */
export const removeForGoodLine = (name: string, orgName: string): string =>
  `${name} is removed from ${orgName} for good. They lose access straight away and come off every team. Their Personal, and any other organisation they are in, are untouched.`;

function TakeOffDialog({ member, teams, orgName, onClose, onConfirm }: {
  member: Member | null;
  teams: Person["teams"];
  orgName: string;
  onClose: () => void;
  onConfirm: (m: Member) => void;
}) {
  const names = teams.map((t) => t.name).join(" and ");
  return (
    <ConfirmDialog
      open={member !== null}
      title={member ? `Take ${nameOf(member)} off ${names}?` : "Take off team"}
      body={<p>{takeOffLine(orgName)}</p>}
      confirm="Take off"
      onClose={onClose}
      onConfirm={() => { if (member) onConfirm(member); }}
    />
  );
}

function RemoveDialog({ member, members, me, orgName, onClose, onRemove }: {
  member: Member | null;
  members: Member[];
  me: string;
  orgName: string;
  onClose: () => void;
  onRemove: (m: Member, reassignTo: string) => void;
}) {
  const others = members.filter((m) => m.userId !== member?.userId);
  /* What the server says leaving hands on (tasks, reminders, campaigns, teams) and who gets it by default. Always said,
     even for someone who owns no campaigns: their tasks and reminders still need a home. */
  const { loading, data } = useAsked(member !== null, member?.userId ?? "", () => removalPreview(member!.userId));
  const [to, setTo] = useState(me);
  useEffect(() => { if (member) setTo(data?.reassignTo?.id ?? me); }, [member, me, data]);
  const heir = others.find((m) => m.userId === to);
  const leaves = teamNames(data);
  return (
    <ConfirmDialog
      open={member !== null}
      title={member ? `Remove ${nameOf(member)} from ${orgName}?` : "Remove from the organisation"}
      body={
        <div className="st-remove">
          <p>{member ? removeForGoodLine(nameOf(member), orgName) : null}</p>
          <Guard fallback={<p>Their campaigns, candidates, clients, tasks and reminders go to the person you choose, so nothing is left without an owner.</p>}>
            {loading ? (
              <div aria-hidden="true"><Shimmer h={12} lh={18} w="90%" /><Shimmer h={12} lh={18} w="40%" /></div>
            ) : (
              <p>{data ? handoverLine(data, heir ? first(nameOf(heir)) : "the person you choose") : "Their campaigns, candidates, clients, tasks and reminders go to the person you choose, so nothing is left without an owner."}</p>
            )}
          </Guard>
          <Fld id="st-heir" label="Hand their work to">
            <select id="st-heir" className="ncx-in" value={to} onChange={(e) => setTo(e.target.value)}>
              {others.map((m) => <option key={m.userId} value={m.userId}>{nameOf(m)}{m.userId === me ? " (you)" : ""}</option>)}
            </select>
          </Fld>
          {leaves.length > 0 && <p>They will leave {leaves.length === 1 ? "this team" : "these teams"}: {leaves.join(", ")}.</p>}
        </div>
      }
      confirm={member ? `Remove ${first(nameOf(member))}` : "Remove"}
      danger
      onClose={onClose}
      onConfirm={() => { if (member) onRemove(member, to); }}
    />
  );
}
