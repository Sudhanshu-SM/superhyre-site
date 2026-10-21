import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { activeOrg, readable } from "./api/identity";
import type { OrgRole } from "./api/identity";
import { teamsApi } from "./api/teams";
import type { People, Person, Team, TeamCampaign, TeamPerson } from "./api/teams";
import { refreshCampaignsNow, useCampaignRows } from "./campaignStore";
import { Pager } from "./components/Pager";
import { Shimmer, ShimmerRegion } from "./components/Shimmer";
import { DocTitle } from "./components/DocTitle";
import { EmptyArt } from "./EmptyArt";
import { useToast } from "./Contacts";
import type { LiveAccount } from "./Console";
import { pollWhileVisible } from "./livePoll";
import { ROLE_LABEL } from "./membership";
import { pageTitle } from "./pageTitle";
import { ConfirmDialog } from "./RoleBits";
import { clampedOffset, hasDeepLink, loadSection, saveSection, take } from "./sectionState";
import { TeamsPeople } from "./TeamsPeople";
import { LoadFailed } from "./ui";
import "./newcampaign.css";
import "./workspace.css";
import "./settings.css";
import "./teams.css";

/**
 * Teams: the groups of people and campaigns an organisation is run in, and everyone who is in it. For the owner and
 * admins only (nav.ts). The owner makes and deletes teams and removes people; an admin changes the people and campaigns
 * of the teams they lead (`canManage` on a team, from the server), and reads the rest. The server holds every rule:
 * this page draws no control it would refuse, and says what it refuses in the server's own words.
 */

const SECTION = "teams";
/** How often the page reads the teams again while it is on screen. */
export const TEAMS_POLL_MS = 15_000;
export const TEAM_PAGE = 10;
export const ROW_PAGE = 8;

type Tab = "teams" | "everyone";
const TABS: readonly Tab[] = ["teams", "everyone"];
const TAB_LABEL: Readonly<Record<Tab, string>> = { teams: "Teams", everyone: "Everyone" };

type Remembered = { tab: Tab; team: string; q: string; offset: number };
const NOTHING: Remembered = { tab: "teams", team: "", q: "", offset: 0 };
const readRemembered = (raw: Record<string, unknown>): Remembered => ({
  tab: take.oneOf(raw.tab, TABS, "teams"),
  team: take.str(raw.team, "", 60),
  q: take.str(raw.q, "", 80),
  offset: take.int(raw.offset, 0),
});

/* ── words ── */

export const TEAMS_EMPTY = "Create your first team to group recruiters and their campaigns";
export const TEAMS_EMPTY_ADMIN = "Teams group recruiters and their campaigns. The owner creates them and chooses who leads.";
export const NO_TEAM_PICKED = "Pick a team to see who is on it and what it works on.";
export const NOT_HERE = "That page isn't here";
/** What a picker with nothing to add says: about the thing it adds, not always about people. */
export const NOTHING_TO_ADD: Readonly<Record<"people" | "campaigns", string>> = {
  people: "Everyone is on this team already.",
  campaigns: "Every campaign you can change is on this team already.",
};
/** A team name that is taken, said with the name as it was typed. */
export const nameTaken = (typed: string): string => `There's already a team called ${typed.trim()}. Pick another name.`;
/** Whether a team already has this name, ignoring case and stray spaces (the server's own test). */
export const hasTeamNamed = (teams: readonly Pick<Team, "name">[], typed: string): boolean =>
  teams.some((t) => t.name.trim().toLowerCase() === typed.trim().toLowerCase());

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const first = (name: string | null) => (name ?? "A teammate").split(" ")[0] ?? "A teammate";

/** The line under a team's name in the list: who leads it, how many people and campaigns. */
export function teamLine(t: Pick<Team, "leads" | "memberCount" | "campaignCount">): string {
  const lead = t.leads.length ? `Led by ${t.leads.map((l) => l.name ?? "A teammate").join(" and ")}` : "No lead yet";
  return `${lead}. ${plural(t.memberCount, "person", "people")}, ${plural(t.campaignCount, "campaign", "campaigns")}.`;
}

/** Teams whose name or lead matches what was typed, in the list's order. */
export function matchTeams(teams: readonly Team[], q: string): Team[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [...teams];
  return teams.filter((t) => [t.name, ...t.leads.map((l) => l.name ?? "")].some((x) => x.toLowerCase().includes(needle)));
}

export type Option = { id: string; name: string; hint: string };

/** People who can be put on this team: active, not on it already, matching what was typed. */
export function personOptions(people: readonly Person[], team: Team, q: string): Option[] {
  const on = new Set(team.members.map((m) => m.userId));
  const needle = q.trim().toLowerCase();
  return people
    .filter((p) => p.status !== "disabled" && !on.has(p.userId))
    .map((p) => ({ id: p.userId, name: p.fullName?.trim() || p.email || "A teammate", hint: ROLE_LABEL[p.role] }))
    .filter((o) => !needle || o.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type Row = { id: string; name: string; teamId?: string | null; teamName?: string | null; canManage?: boolean; status: string };

/** Campaigns that can be put on this team: the viewer's to change, not on it already, matching what was typed. */
export function campaignOptions(rows: readonly Row[], team: Team, q: string): Option[] {
  const needle = q.trim().toLowerCase();
  return rows
    .filter((r) => r.teamId !== team.id && r.canManage !== false)
    .map((r) => ({ id: r.id, name: r.name, hint: r.teamName ? `On ${r.teamName}` : "No team" }))
    .filter((o) => !needle || o.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ── the page ── */

type Load = { s: "loading" } | { s: "error" } | { s: "ready"; teams: Team[]; people: People };

type Run = (call: () => Promise<Team | void>, done?: string, opts?: { quiet?: boolean; undo?: () => Promise<Team | void> }) => Promise<string | null>;

export function TeamsPage({ account }: { account: LiveAccount }) {
  const org = activeOrg(account.me);
  const role: OrgRole | null = org?.role ?? null;
  if (!org || (role !== "owner" && role !== "admin")) return <NotHere />;
  return <TeamsBody account={account} role={role} orgName={org.name} />;
}

/** A recruiter's link to Teams: said once and calmly, with the way back. */
export function NotHere() {
  return (
    <div className="cw tm">
      <DocTitle title={pageTitle({ route: "teams" })} />
      <div className="tm-here" role="status">
        <h1 className="cw-h1">{NOT_HERE}</h1>
        <p className="t-body">It may have moved, or it isn't one for your role.</p>
        <p><a className="st-link" href="#/">Back to Home</a></p>
      </div>
    </div>
  );
}

function TeamsBody({ account, role, orgName }: { account: LiveAccount; role: "owner" | "admin"; orgName: string }) {
  const me = account.me.user.id;
  const owner = role === "owner";
  const toast = useToast();
  const [start] = useState<Remembered>(() => (hasDeepLink() ? NOTHING : loadSection(SECTION, readRemembered, NOTHING)));
  const [tab, setTab] = useState<Tab>(start.tab);
  const [picked, setPicked] = useState(start.team);
  const [q, setQ] = useState(start.q);
  const [offset, setOffset] = useState(start.offset);
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const changing = useRef(0);

  useEffect(() => { saveSection(SECTION, { tab, team: picked, q, offset }); }, [tab, picked, q, offset]);

  const refresh = useCallback(async () => {
    try {
      const [{ teams }, people] = await Promise.all([teamsApi.list(), teamsApi.people()]);
      setLoad({ s: "ready", teams, people });
    } catch {
      setLoad((cur) => (cur.s === "ready" ? cur : { s: "error" }));
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => pollWhileVisible(() => { if (changing.current === 0) void refresh(); }, TEAMS_POLL_MS), [refresh]);

  /**
   * Runs a change, shows what the server answers for the team, and says why when it refuses: on the page, or, for
   * a change made in a dialog or a field (`quiet`), only back to it. Answers with the reason, or null when it went.
   * `undo` is the way back, offered beside the confirmation for a short while.
   */
  const run: Run = useCallback(async (call, done, opts) => {
    setError(null);
    changing.current += 1;
    try {
      const out = await call();
      if (out) setLoad((cur) => (cur.s === "ready" ? { ...cur, teams: cur.teams.map((t) => (t.id === out.id ? out : t)) } : cur));
      const back = opts?.undo;
      if (done) toast(done, "done", back ? { label: "Undo", onClick: () => void run(back, "Undone") } : undefined);
      await refresh();
      return null;
    } catch (err) {
      const why = readable(err);
      if (!opts?.quiet) setError(why);
      return why;
    } finally {
      changing.current -= 1;
    }
  }, [refresh, toast]);

  const shell = (body: ReactNode) => (
    <div className="cw tm">
      <DocTitle title={pageTitle({ route: "teams" })} />
      <header className="cw-head">
        <div className="cw-head-t">
          <h1 className="cw-h1">Teams</h1>
          <p className="st-iso t-body-sm">{owner ? `Groups of people and campaigns in ${orgName}.` : `The teams you lead in ${orgName}, and the rest to read.`}</p>
        </div>
        {tab === "teams" && owner && load.s === "ready" && (
          <button type="button" className="ncx-btn is-sm" onClick={() => setMaking(true)}><Plus size={14} weight="bold" aria-hidden="true" /> New team</button>
        )}
      </header>
      <nav className="tm-tabs" aria-label="Teams page">
        {TABS.map((t) => (
          <button key={t} type="button" className={`st-nav-i${t === tab ? " is-on" : ""}`} aria-pressed={t === tab} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
        ))}
      </nav>
      {error && <p className="st-err t-body-sm" role="alert">{error}</p>}
      {body}
    </div>
  );

  if (load.s === "loading") return shell(tab === "teams" ? <TeamsGhost /> : <EveryoneGhost />);
  if (load.s === "error") return shell(<LoadFailed what="The teams" onRetry={() => { setLoad({ s: "loading" }); void refresh(); }} />);

  const { teams, people } = load;
  const found = matchTeams(teams, q);
  const at = clampedOffset(offset, found.length, TEAM_PAGE);
  const current = teams.find((t) => t.id === picked) ?? found[0] ?? null;

  const body = tab === "everyone" ? (
    <section className="st-panel" aria-label="Everyone">
      <TeamsPeople me={me} role={role} orgName={orgName} reload={account.reload} {...(account.say ? { say: account.say } : {})} teams={teams} onChanged={() => void refresh()} />
    </section>
  ) : teams.length === 0 ? (
    <div className="tm-empty">
      <EmptyArt name="empty-campaigns" size={160} />
      <h2 className="t-title-sm">{owner ? TEAMS_EMPTY : TEAMS_EMPTY_ADMIN}</h2>
      {owner && <p><button type="button" className="ncx-btn is-primary" onClick={() => setMaking(true)}>New team</button></p>}
    </div>
  ) : (
    <div className="tm-body">
      <aside className="tm-list" aria-label="Teams">
        {teams.length > 6 && (
          <label className="tm-search">
            <MagnifyingGlass size={15} aria-hidden="true" />
            <input type="search" value={q} placeholder="Search teams" spellCheck={false} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
          </label>
        )}
        <Pager offset={at} limit={TEAM_PAGE} total={found.length} unit="teams" onChange={setOffset} />
        <ul className="tm-teams" data-pager-list>
          {found.slice(at, at + TEAM_PAGE).map((t) => (
            <li key={t.id}>
              <button type="button" className={`tm-row${current?.id === t.id ? " is-on" : ""}`} aria-current={current?.id === t.id ? "true" : undefined} onClick={() => setPicked(t.id)}>
                <span className="t-body-strong sl-ell">{t.name}</span>
                <span className="t-body-sm tm-line">{teamLine(t)}</span>
              </button>
            </li>
          ))}
        </ul>
        {found.length === 0 && <p className="st-quiet t-body-sm">No team matches that.</p>}
        <Pager offset={at} limit={TEAM_PAGE} total={found.length} unit="teams" variant="foot" onChange={setOffset} />
      </aside>
      <section className="tm-detail" aria-label={current ? current.name : "Team"}>
        {current ? <TeamDetail key={current.id} team={current} people={people.people} owner={owner} me={me} run={run} onDeleted={() => setPicked("")} /> : <p className="st-quiet t-body">{NO_TEAM_PICKED}</p>}
      </section>
    </div>
  );

  return (
    <>
      {shell(body)}
      <NewTeamDialog open={making} people={people.people} teams={teams} onClose={() => setMaking(false)} onMake={async (name, leads) => {
        const why = await run(async () => { const made = await teamsApi.create(name, leads); setPicked(made.id); setLoad((cur) => (cur.s === "ready" ? { ...cur, teams: [...cur.teams, made] } : cur)); }, `${name} is a team now`, { quiet: true });
        if (!why) setMaking(false);
        return why;
      }} />
    </>
  );
}

/* ── one team ── */

function TeamDetail({ team, people, owner, me, run, onDeleted }: {
  team: Team;
  people: readonly Person[];
  owner: boolean;
  me: string;
  run: Run;
  onDeleted: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(team.name);
  const [renameProblem, setRenameProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState<"people" | "campaigns" | null>(null);
  const [mOffset, setMOffset] = useState(0);
  const [cOffset, setCOffset] = useState(0);
  const may = team.canManage;
  const roleOf = new Map(people.map((p) => [p.userId, p.role]));
  const memberAt = clampedOffset(mOffset, team.members.length, ROW_PAGE);
  const campaignAt = clampedOffset(cOffset, team.campaigns.length, ROW_PAGE);

  const save = () => {
    const next = name.trim();
    if (!next || next === team.name) { setRenaming(false); setRenameProblem(null); setName(team.name); return; }
    /* A name that is taken is said here, beside the field, with the name as it was typed; the field stays open. */
    void run(() => teamsApi.rename(team.id, next), `Renamed to ${next}`, { quiet: true }).then((why) => {
      if (why) { setRenameProblem(why); return; }
      setRenaming(false);
      setRenameProblem(null);
    });
  };

  return (
    <div className="st-sec">
      <div className="st-h-row">
        {renaming ? (
          <form className="tm-rename" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <input className="ncx-in" value={name} maxLength={40} autoFocus aria-label="Team name" aria-invalid={renameProblem ? true : undefined} onChange={(e) => { setName(e.target.value); setRenameProblem(null); }} />
            <button type="submit" className="ncx-btn is-sm is-primary">Save</button>
            <button type="button" className="ncx-btn is-sm" onClick={() => { setRenaming(false); setRenameProblem(null); setName(team.name); }}>Cancel</button>
            {renameProblem && <p className="st-err t-body-sm tm-rename-err" role="alert">{renameProblem}</p>}
          </form>
        ) : (
          <h2 className="st-h t-title-sm">{team.name}</h2>
        )}
        {may && !renaming && (
          <span className="st-acts">
            <button type="button" className="st-link" onClick={() => setRenaming(true)}>Rename</button>
            {owner && <button type="button" className="st-link" onClick={() => setDeleting(true)}>Delete team</button>}
          </span>
        )}
      </div>
      <p className="st-quiet t-body-sm">
        {team.leads.length ? `Led by ${team.leads.map((l) => l.name ?? "A teammate").join(" and ")}.` : "No lead yet, so the owner manages it."}
        {!may && " You can read it; its lead and the owner change it."}
      </p>

      <div className="st-group">
        <div className="st-h-row">
          <h3 className="st-sub t-label">Members ({team.memberCount})</h3>
          {may && <button type="button" className="ncx-btn is-sm" onClick={() => setAdding(adding === "people" ? null : "people")}>Add people</button>}
        </div>
        {adding === "people" && (
          <Picker label="Add people" noun="people" empty={NOTHING_TO_ADD.people} options={(q) => personOptions(people, team, q)}
            onPick={(id) => void run(() => teamsApi.members(team.id, { add: [id] }), "Added to the team")} onClose={() => setAdding(null)} />
        )}
        {team.members.length === 0 ? (
          <p className="st-quiet t-body-sm">Nobody is on this team yet.{may ? " Add people to start." : ""}</p>
        ) : (
          <>
            <Pager offset={memberAt} limit={ROW_PAGE} total={team.members.length} unit="people" onChange={setMOffset} />
            <ul className="st-list" data-pager-list>
              {team.members.slice(memberAt, memberAt + ROW_PAGE).map((m) => (
                <MemberLine key={m.userId} m={m} team={team} may={may} owner={owner} me={me} canLead={roleOf.get(m.userId) !== "recruiter"} run={run} />
              ))}
            </ul>
            <Pager offset={memberAt} limit={ROW_PAGE} total={team.members.length} unit="people" variant="foot" onChange={setMOffset} />
          </>
        )}
      </div>

      <TeamCampaigns team={team} may={may} adding={adding === "campaigns"} onAdding={(on) => setAdding(on ? "campaigns" : null)} run={run} offset={campaignAt} onOffset={setCOffset} />

      <ConfirmDialog
        open={deleting}
        title={`Delete the ${team.name} team?`}
        body={<>{team.campaignCount ? `Its ${plural(team.campaignCount, "campaign", "campaigns")} stay, on no team. ` : ""}Nobody leaves the organisation; people just come off this team.</>}
        confirm="Delete team"
        danger
        onClose={() => setDeleting(false)}
        onConfirm={() => { setDeleting(false); void run(async () => { await teamsApi.remove(team.id); onDeleted(); }, `${team.name} deleted`); }}
      />
    </div>
  );
}

function MemberLine({ m, team, may, owner, me, canLead, run }: {
  m: TeamPerson; team: Team; may: boolean; owner: boolean; me: string; canLead: boolean; run: Run;
}) {
  const lead = m.role === "lead";
  const self = m.userId === me;
  const [asking, setAsking] = useState<"stepDown" | "remove" | null>(null);
  /* Only the owner takes a lead off a team; a lead may step down themselves. */
  const mayDemote = lead && (owner || self);
  const mayRemove = may && (!lead || owner || self);
  const leads = team.leads.map((l) => l.userId);
  /* An admin who steps down or leaves no longer runs the team, so they could not put themselves back: no Undo then. */
  const canUndo = owner || !self;
  const who = self ? "you" : first(m.name);
  const stepDown = () => {
    setAsking(null);
    void run(() => teamsApi.members(team.id, { lead: leads.filter((id) => id !== m.userId) }), `${self ? "You are" : `${first(m.name)} is`} a member now`,
      canUndo ? { undo: () => teamsApi.members(team.id, { lead: leads }) } : undefined);
  };
  const remove = () => {
    setAsking(null);
    void run(() => teamsApi.members(team.id, { remove: [m.userId] }), `${self ? "You are" : `${first(m.name)} is`} off ${team.name}. Still in the organisation.`,
      canUndo ? { undo: () => teamsApi.members(team.id, lead ? { add: [m.userId], lead: leads } : { add: [m.userId] }) } : undefined);
  };
  return (
    <li className="st-item">
      <span className="st-who">
        <span className="t-body-strong sl-ell">{m.name ?? "A teammate"}{self ? " (you)" : ""}</span>
        <span className="st-mail t-body-sm">{lead ? "Lead" : "Member"}</span>
      </span>
      {may && (
        <span className="st-acts">
          {!lead && canLead && (
            <button type="button" className="st-link" onClick={() => void run(() => teamsApi.members(team.id, { lead: [...leads, m.userId] }), `${first(m.name)} leads ${team.name}`)}>Make lead</button>
          )}
          {mayDemote && (
            <button type="button" className="st-link" onClick={() => setAsking("stepDown")}>Step down</button>
          )}
          {mayRemove && (
            <button type="button" className="st-link" onClick={() => setAsking("remove")}>Remove from team</button>
          )}
        </span>
      )}
      <ConfirmDialog
        open={asking === "stepDown"}
        title={self ? `Step down from leading ${team.name}?` : `Make ${who} a member of ${team.name}?`}
        body={self
          ? <>You stay on the team as a member, but you will no longer change its people or campaigns. Only the owner can make you its lead again.</>
          : <>{first(m.name)} stays on the team as a member and no longer changes its people or campaigns. You can make them lead again.</>}
        confirm={self ? "Step down" : "Make a member"}
        danger
        onClose={() => setAsking(null)}
        onConfirm={stepDown}
      />
      <ConfirmDialog
        open={asking === "remove"}
        title={self ? `Leave ${team.name}?` : `Take ${who} off ${team.name}?`}
        body={self
          ? <>You stay in the organisation, and your campaigns and chats stay as they are. {lead ? "Only the owner can make you its lead again." : "A lead or the owner can add you back."}</>
          : <>{first(m.name)} stays in the organisation, and their campaigns and chats stay as they are. You can add them back any time.</>}
        confirm={self ? "Leave team" : "Remove from team"}
        danger
        onClose={() => setAsking(null)}
        onConfirm={remove}
      />
    </li>
  );
}

function TeamCampaigns({ team, may, adding, onAdding, run, offset, onOffset }: {
  team: Team; may: boolean; adding: boolean; onAdding: (on: boolean) => void; run: Run; offset: number; onOffset: (o: number) => void;
}) {
  const rows = useCampaignRows();
  return (
    <div className="st-group">
      <div className="st-h-row">
        <h3 className="st-sub t-label">Campaigns ({team.campaignCount})</h3>
        {may && <button type="button" className="ncx-btn is-sm" onClick={() => onAdding(!adding)}>Add campaign</button>}
      </div>
      {adding && (
        <Picker label="Add campaign" noun="campaigns" empty={NOTHING_TO_ADD.campaigns} options={(q) => campaignOptions(rows, team, q)}
          onPick={(id) => void run(async () => { const t = await teamsApi.campaigns(team.id, { add: [id] }); refreshCampaignsNow(); return t; }, "Added to the team")} onClose={() => onAdding(false)} />
      )}
      {team.campaigns.length === 0 ? (
        <p className="st-quiet t-body-sm">No campaigns on this team yet.{may ? " Add one to give it a home." : ""}</p>
      ) : (
        <>
          <Pager offset={offset} limit={ROW_PAGE} total={team.campaigns.length} unit="campaigns" onChange={onOffset} />
          <ul className="st-list" data-pager-list>
            {team.campaigns.slice(offset, offset + ROW_PAGE).map((c) => <CampaignLine key={c.id} c={c} team={team} may={may} run={run} />)}
          </ul>
          <Pager offset={offset} limit={ROW_PAGE} total={team.campaigns.length} unit="campaigns" variant="foot" onChange={onOffset} />
        </>
      )}
    </div>
  );
}

function CampaignLine({ c, team, may, run }: { c: TeamCampaign; team: Team; may: boolean; run: Run }) {
  const closed = c.status === "closed";
  return (
    <li className="st-item">
      <span className="st-who">
        <a className="t-body-strong sl-ell tm-link" href={`#/campaign?campaign=${encodeURIComponent(c.id)}`}>{c.name}</a>
        <span className="st t-body-sm" data-st={closed ? "muted" : "ink"}>{closed ? "Closed" : "Active"}</span>
      </span>
      {may && (
        <span className="st-acts">
          <button type="button" className="st-link" onClick={() => void run(async () => { const t = await teamsApi.campaigns(team.id, { remove: [c.id] }); refreshCampaignsNow(); return t; }, `${c.name} is on no team now`, { undo: async () => { const t = await teamsApi.campaigns(team.id, { add: [c.id] }); refreshCampaignsNow(); return t; } })}>Take off team</button>
        </span>
      )}
    </li>
  );
}

/* ── pickers and dialogs ── */

/** A searchable list of what can be added: one press adds, and it stays open to add more. */
function Picker({ label, noun, empty, options, onPick, onClose }: {
  label: string; noun: string; empty: string; options: (q: string) => Option[]; onPick: (id: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const all = useMemo(() => options(q), [options, q]);
  const shown = all.slice(0, 8);
  return (
    <div className="tm-pick" role="group" aria-label={label}>
      <label className="tm-search">
        <MagnifyingGlass size={15} aria-hidden="true" />
        <input type="search" value={q} autoFocus placeholder={`Search ${noun}`} spellCheck={false} onChange={(e) => setQ(e.target.value)} />
      </label>
      {shown.length === 0 ? (
        <p className="st-quiet t-body-sm">{q ? `No ${noun} match that.` : empty}</p>
      ) : (
        <ul className="st-list">
          {shown.map((o) => (
            <li key={o.id} className="st-item">
              <span className="st-who">
                <span className="t-body-strong sl-ell">{o.name}</span>
                <span className="st-mail t-body-sm">{o.hint}</span>
              </span>
              <button type="button" className="st-link" onClick={() => onPick(o.id)}>Add</button>
            </li>
          ))}
        </ul>
      )}
      {all.length > shown.length && <p className="st-quiet t-body-sm">Showing {shown.length} of {all.length}. Type to narrow it.</p>}
      <p className="st-acts"><button type="button" className="st-link" onClick={onClose}>Done</button></p>
    </div>
  );
}

function NewTeamDialog({ open, people, teams, onClose, onMake }: {
  open: boolean; people: readonly Person[]; teams: readonly Pick<Team, "name">[]; onClose: () => void;
  /** Makes the team and answers with the reason it could not, or null when it did (and the dialog closes). */
  onMake: (name: string, leads: string[]) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [lead, setLead] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(""); setLead(""); setProblem(null); setBusy(false); } }, [open]);
  const leaders = people.filter((p) => p.status !== "disabled" && (p.role === "admin" || p.role === "owner"));
  return (
    <ConfirmDialog
      open={open}
      title="New team"
      body={
        <div className="tm-new">
          <label className="ncx-f">
            <span className="ncx-l">Name</span>
            <input className="ncx-in" value={name} maxLength={40} autoFocus placeholder="Tech hiring" aria-invalid={problem ? true : undefined} onChange={(e) => { setName(e.target.value); setProblem(null); }} />
          </label>
          <label className="ncx-f">
            <span className="ncx-l">Lead</span>
            <select className="ncx-in" value={lead} onChange={(e) => setLead(e.target.value)}>
              <option value="">No lead yet</option>
              {leaders.map((p) => <option key={p.userId} value={p.userId}>{p.fullName?.trim() || p.email}</option>)}
            </select>
            <small className="ncx-hint">A lead is an admin. They manage the team's people and campaigns.</small>
          </label>
        </div>
      }
      confirm="Create team"
      problem={problem}
      busy={busy}
      onClose={onClose}
      onConfirm={() => {
        const n = name.trim();
        if (!n || busy) return;
        /* A name that is taken is said here, in the dialog, with the name as it was typed. */
        if (hasTeamNamed(teams, n)) { setProblem(nameTaken(n)); return; }
        setBusy(true);
        void onMake(n, lead ? [lead] : []).then((why) => { setBusy(false); if (why) setProblem(/already a team/i.test(why) ? nameTaken(n) : why); });
      }}
    />
  );
}

/* ── ghosts, shaped like the page ── */

function TeamsGhost() {
  return (
    <ShimmerRegion label="Loading the teams" className="tm-body">
      <div className="tm-list" aria-hidden="true">
        <ul className="tm-teams">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="tm-row"><Shimmer h={14} lh={20} w={`${96 + ((i * 29) % 60)}px`} /><Shimmer h={11} lh={18} w={`${180 + ((i * 17) % 50)}px`} /></li>
          ))}
        </ul>
      </div>
      <div className="tm-detail" aria-hidden="true">
        <div className="st-sec">
          <Shimmer h={20} lh={28} w={180} />
          <Shimmer h={12} lh={18} w={240} />
          <div className="st-group">
            <Shimmer h={11} lh={16} w={88} />
            {[0, 1, 2].map((i) => (
              <div key={i} className="st-item"><span className="st-who"><Shimmer h={13} lh={20} w={`${120 + ((i * 31) % 70)}px`} /><Shimmer h={11} lh={18} w={64} /></span><Shimmer h={24} w={110} r={8} /></div>
            ))}
          </div>
          <div className="st-group">
            <Shimmer h={11} lh={16} w={96} />
            {[0, 1].map((i) => (
              <div key={i} className="st-item"><span className="st-who"><Shimmer h={13} lh={20} w={`${150 + ((i * 41) % 60)}px`} /><Shimmer h={11} lh={18} w={52} /></span><Shimmer h={24} w={96} r={8} /></div>
            ))}
          </div>
        </div>
      </div>
    </ShimmerRegion>
  );
}

function EveryoneGhost() {
  return (
    <div className="st-panel">
      <ShimmerRegion label="Loading everyone" className="st-sec">
        <div className="st-h-row"><Shimmer h={20} lh={28} w={120} /><Shimmer h={32} w={116} r={8} /></div>
        <ul className="st-list" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="st-item"><span className="st-who"><Shimmer h={13} lh={20} w={`${120 + ((i * 31) % 70)}px`} /><Shimmer h={11} lh={20} w={`${170 + ((i * 23) % 80)}px`} /></span><Shimmer h={32} w={32} r={8} /></li>
          ))}
        </ul>
      </ShimmerRegion>
    </div>
  );
}
