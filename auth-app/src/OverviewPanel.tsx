import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { BoardStage, Call, FormResponse, PipelinePerson } from "./campaign";
import type { ApiCampaignAgents } from "./api/campaigns";
import { FOLLOWING_LINE } from "./campaignRights";
import { Avatar } from "./CandidateBits";
import { EmptyArt } from "./EmptyArt";
import { celebratesFirstHire } from "./emptyStates";

/**
 * The campaign Overview's side panel: "Hires".
 *
 * Three blocks, top to bottom, each gone when it has nothing to say:
 *   1. Hires: a bar (hired, offers out, open), one caption, then the people.
 *   2. Needs you: at most three things only a person can do.
 *   3. Screening: one line from the screening form.
 * Nothing here repeats a number the stats row or the funnel already prints.
 *
 * Voice rules (every string in this file follows them):
 *   - Order: numbers, then first names, then a date ("2 Sep").
 *   - No adjectives or metaphors (warm, in motion, lands, signals, seamless).
 *   - No " · ", em dashes or ellipses.
 *   - Sentence case.
 *   - Absolute dates only: never "today" or "N days ago".
 *   - Never state what the data cannot show ("no update", "owes feedback").
 */

/** What the panel reads from the Overview model. */
export type PanelModel = {
  phase: "closed" | "active";
  target: number;
  /** newest first (smallest inStage first) */
  hired: readonly PipelinePerson[];
  offer: readonly PipelinePerson[];
  replied: readonly PipelinePerson[];
  manager: string;
  clientWait?: PipelinePerson;
};

/* ── dates: always absolute, "2 Sep" and "September" ── */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dateAgo = (days: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - days); return d; };
export const dMMM = (daysAgo: number) => { const d = dateAgo(daysAgo); return `${d.getDate()} ${MON[d.getMonth()]}`; };
const first = (name: string) => name.split(" ")[0] ?? name;
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
/* "Offer sent" in the prototype's wording, "Offer made" in the live board's: an offer that is out. */
export const isSent = (p: PipelinePerson) => /^Offer (sent|made)/.test(p.last);

/* ── model helpers ── */

export function hireCounts(m: PanelModel) {
  const hired = m.hired.length;
  const offers = m.offer.length;
  const offerSeg = Math.min(offers, Math.max(0, m.target - hired));
  const open = Math.max(0, m.target - hired - offerSeg);
  return { hired, offers, offerSeg, open, filled: hired >= m.target };
}

export type HireGroup = { label: string; people: PipelinePerson[] };

/** This week (0-6 days), last week (7-13), then one group per calendar month. Newest first. */
export function hireGroups(hired: readonly PipelinePerson[]): HireGroup[] {
  const out: HireGroup[] = [];
  const at = (label: string) => {
    let g = out.find((x) => x.label === label);
    if (!g) { g = { label, people: [] }; out.push(g); }
    return g;
  };
  for (const p of [...hired].sort((a, b) => a.inStage - b.inStage)) {
    if (p.inStage <= 6) at("This week").people.push(p);
    else if (p.inStage <= 13) at("Last week").people.push(p);
    else {
      const d = dateAgo(p.inStage);
      const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
      at(`${MONTH[d.getMonth()]}${year}`).people.push(p);
    }
  }
  return out;
}

export type Row = { key: string; age: number; title: ReactNode; sub?: ReactNode; go: () => void };

type Go = { onPerson: (id: string) => void; onStage: (s: BoardStage) => void; onForms: () => void; onCalls: () => void };

/** Things only a person can do, oldest first. Shortlist review is the funnel's job and is never here. */
export function needsYou(m: PanelModel, calls: readonly Call[], responses: readonly FormResponse[], go: Go): Row[] {
  if (m.phase === "closed") return [];
  const rows: Row[] = [];
  for (const p of m.offer) {
    if (isSent(p)) {
      if (p.inStage >= 3) rows.push({ key: `offer-${p.id}`, age: p.inStage, title: `${first(p.name)}’s offer`, sub: `Sent ${dMMM(p.inStage)}, not accepted yet`, go: () => go.onPerson(p.id) });
    } else rows.push({ key: `offer-${p.id}`, age: p.inStage, title: `${first(p.name)}’s offer`, sub: "Written, not sent", go: () => go.onPerson(p.id) });
  }
  if (m.replied.length) {
    const oldest = Math.max(...m.replied.map((p) => p.inStage));
    if (oldest >= 1) {
      rows.push({
        key: "reply", age: oldest,
        title: m.replied.length === 1 ? `Reply to ${first(m.replied[0]!.name)}` : `${m.replied.length} replies to answer`,
        sub: `Oldest ${dMMM(oldest)}`, go: () => go.onStage("outreach"),
      });
    }
  }
  const w = m.clientWait;
  if (w && w.inStage >= 5) {
    rows.push({ key: `wait-${w.id}`, age: w.inStage, title: `${first(w.name)}, in interviews since ${dMMM(w.inStage)}`, sub: m.manager ? `Check with ${m.manager}` : "Check with the hiring team", go: () => go.onPerson(w.id) });
  }
  /* one call back, the most recent, as the old next-moves list had it */
  const back = calls.filter((c) => c.outcome === "voicemail" || c.outcome === "scheduled").sort((a, b) => a.at - b.at)[0];
  if (back) rows.push({ key: `call-${back.person.id}`, age: back.at / 1440, title: `Call ${first(back.person.name)} back`, sub: back.outcome === "voicemail" ? "Left a voicemail" : "Asked for a call back", go: go.onCalls });
  const flagged = responses.filter((r) => r.flagged);
  if (flagged.length) {
    rows.push({ key: "flagged", age: Math.max(...flagged.map((r) => r.at)) / 1440, title: `${flagged.length} flagged screening ${plural(flagged.length, "answer")}`, sub: "From screening", go: go.onForms });
  }
  rows.sort((a, b) => b.age - a.age);
  if (rows.length > 3) {
    const rest = rows.length - 2;
    return [...rows.slice(0, 2), { key: "more", age: 0, title: `${rest} more`, go: () => go.onStage("interviewing") }];
  }
  return rows;
}

/* ── building blocks ── */

export function OvCard({ title, aside, className, children }: { title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`ov2-card${className ? ` ${className}` : ""}`} aria-label={title}>
      <header className="ov2-h"><h2>{title}</h2>{aside}</header>
      {children}
    </section>
  );
}

export function PanelRow({ lead, title, sub, value, onClick }: { lead?: ReactNode; title: ReactNode; sub?: ReactNode; value?: ReactNode; onClick: () => void }) {
  return (
    <li>
      <button type="button" className={`pr${lead ? "" : " is-bare"}`} onClick={onClick}>
        {lead && <span className="pr-lead">{lead}</span>}
        <span className="pr-t">
          <b className="t-body-strong">{title}</b>
          {sub && <small className="t-body-sm">{sub}</small>}
        </span>
        {value != null && <span className="pr-v t-num-sm">{value}</span>}
      </button>
    </li>
  );
}

export function PanelBlock({ title, className, children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`pb${className ? ` ${className}` : ""}`}>
      {title && <h3 className="t-label">{title}</h3>}
      {children}
    </section>
  );
}

/** The pictures in this card are small and sit beside the words: the people and "Needs you" stay in view. */
const ART = 96;

/** true when the window is short (the Overview's max-height 840 block) */
function useShort() {
  const q = "(max-height: 840px)";
  const [short, setShort] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(q);
    const on = () => setShort(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return short;
}

/** The smallest height of the card's body in which the empty state's picture is drawn whole: the bar, its line, the picture over its sentence. */
export const ART_ROOM = 164;

/**
 * Whether the card this sits in is tall enough for a picture. The Overview is one screen, and on some window heights
 * (a 768px laptop) the Hires card is a hand's breadth tall: a picture there is cut by the card's edge, so it is left
 * out and the words stand alone. Not measurable (no layout: the server, a test) is room.
 */
function useRoomForArt(ref: React.RefObject<HTMLElement>, watch: unknown): boolean {
  const [room, setRoom] = useState(true);
  useLayoutEffect(() => {
    const body = ref.current?.closest<HTMLElement>(".hp-body");
    if (!body) return;
    const fit = () => setRoom(body.clientHeight >= ART_ROOM);
    fit();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    ro?.observe(body);
    return () => ro?.disconnect();
  }, [ref, watch]);
  return room;
}

/* ── block 1: hires ── */

export function HiresBar({ m }: { m: PanelModel }) {
  const c = hireCounts(m);
  return (
    <div className="hb" role="img" aria-label={`${c.hired} of ${m.target} hired, ${c.offers} ${plural(c.offers, "offer")} out, ${c.open} open`}>
      {c.hired > 0 && <i className="is-hired" style={{ flex: c.hired }} />}
      {c.offerSeg > 0 && <i className="is-offer" style={{ flex: c.offerSeg }} />}
      {c.open > 0 && <i className="is-open" style={{ flex: c.open }} />}
    </div>
  );
}

export function hireCaption(m: PanelModel): string {
  const c = hireCounts(m);
  if (m.phase === "closed") return `Closed with ${c.hired} of ${m.target}`;
  if (c.filled) return m.target === 1 ? "Filled" : `All ${m.target} filled`;
  return [
    c.open > 0 ? (m.target === 1 ? "Open" : `${c.open} open`) : "",
    c.offers > 0 ? `${c.offers} ${plural(c.offers, "offer")} out` : "",
  ].filter(Boolean).join(", ");
}

export function HireCaption({ m }: { m: PanelModel }) {
  const text = hireCaption(m);
  return text ? <p className="hp-cap t-body-sm">{text}</p> : null;
}

const names = (ps: readonly PipelinePerson[]) => {
  const shown = ps.slice(0, 3).map((p) => first(p.name));
  return ps.length > 3 ? `${shown.join(", ")} and ${ps.length - 3} more` : shown.join(", ");
};

/** Avatars that wrap onto at most two rows; the rest is a "+n" at the end. */
function AvatarGrid({ people, onPerson }: { people: readonly PipelinePerson[]; onPerson: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [perRow, setPerRow] = useState(8);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setPerRow(Math.max(1, Math.floor((el.clientWidth + 6) / (28 + 6))));
    fit();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const room = perRow * 2;
  const shown = people.length > room ? people.slice(0, room - 1) : people;
  const rest = people.length - shown.length;
  return (
    <div className="av-grid" ref={ref}>
      {shown.map((p) => (
        <button key={p.id} type="button" className="av-btn" title={p.name} aria-label={p.name} onClick={() => onPerson(p.id)}>
          <Avatar name={p.name} hue={p.hue} size={28} />
        </button>
      ))}
      {rest > 0 && <span className="av-more t-caption">+{rest}</span>}
    </div>
  );
}

export function HireList({ m, onPerson, onStage }: { m: PanelModel; onPerson: (id: string) => void; onStage: (s: BoardStage) => void }) {
  const short = useShort();
  const n = m.hired.length;
  const nobody = useRef<HTMLDivElement>(null);
  const room = useRoomForArt(nobody, n === 0);
  if (!n) {
    /* The picture over the line, centred in the card's free space (open or closed). Where the card is too short
       for it (a 768px window), the line alone, still centred. */
    return room ? (
      <div className="hp-first is-none" ref={nobody}>
        <EmptyArt name="empty-hires" size={ART} />
        <p className="hp-none t-body">No hires yet.</p>
      </div>
    ) : (
      <div className="hp-first is-none is-bare" ref={nobody}>
        <p className="hp-none t-body">No hires yet.</p>
      </div>
    );
  }
  const seeAll = (
    <li className="hp-all">
      <button type="button" className="t-label" onClick={() => onStage("hired")}>See all {n} {plural(n, "hire")}</button>
    </li>
  );
  if (n <= 5) {
    const cap = short ? 2 : 5;
    const rows = (
      <ul className="hp-list">
        {m.hired.slice(0, cap).map((p) => (
          <PanelRow key={p.id} lead={<Avatar name={p.name} hue={p.hue} size={28} />} title={p.name} sub={`Hired ${dMMM(p.inStage)}`} onClick={() => onPerson(p.id)} />
        ))}
        {n > cap && seeAll}
      </ul>
    );
    /* The first hire is celebrated beside the person, not above them. */
    return celebratesFirstHire(m.hired)
      ? <div className="hp-first"><EmptyArt name="moment-first-hire" size={ART} />{rows}</div>
      : rows;
  }
  const groups = hireGroups(m.hired);
  if (groups.length === 1) {
    const g = groups[0]!;
    return (
      <div className="hp-grid">
        <p className="hp-gl t-label">{g.label}</p>
        <AvatarGrid people={g.people} onPerson={onPerson} />
        <ul className="hp-list">{seeAll}</ul>
      </div>
    );
  }
  return (
    <ul className="hp-list">
      {groups.slice(0, short ? 2 : 3).map((g) => (
        <PanelRow
          key={g.label}
          lead={<span className="av-stack">{g.people.slice(0, 4).map((p) => <Avatar key={p.id} name={p.name} hue={p.hue} size={24} />)}</span>}
          title={g.label} sub={names(g.people)} value={g.people.length} onClick={() => onStage("hired")}
        />
      ))}
      {seeAll}
    </ul>
  );
}

/* ── block 2: needs you ── */

export function NeedsYou({ rows }: { rows: readonly Row[] }) {
  if (!rows.length) return null;
  return (
    <PanelBlock title="Needs you">
      <ul className="hp-list">
        {rows.map((r) => <PanelRow key={r.key} title={r.title} sub={r.sub} onClick={r.go} />)}
      </ul>
    </PanelBlock>
  );
}

/* ── block 3: screening ── */

export function Screening({ responses, onForms }: { responses: readonly FormResponse[]; onForms: () => void }) {
  if (!responses.length) return null;
  const notice = Object.keys(responses[0]!.answers).find((id) => responses.some((r) => typeof r.answers[id] === "string" && /days|Immediate/.test(String(r.answers[id]))));
  const total = responses.length;
  if (notice) {
    const soon = responses.filter((r) => /Immediate|15 days|30 days/.test(String(r.answers[notice]))).length;
    return (
      <PanelBlock title="Screening">
        <ul className="hp-list">
          <PanelRow title={<><span className="t-num-sm">{soon}</span> of <span className="t-num-sm">{total}</span> can join within 30 days</>} onClick={onForms} />
        </ul>
      </PanelBlock>
    );
  }
  return (
    <PanelBlock title="Screening">
      <ul className="hp-list">
        <PanelRow title={`${total} ${plural(total, "person", "people")} answered the screening form`} sub="Open the answers" onClick={onForms} />
      </ul>
    </PanelBlock>
  );
}

/* ── the card ── */

export function HiresCard({ m, people, responses, calls, onPerson, onStage, onForms, onCalls, onPool }: {
  m: PanelModel; people: readonly PipelinePerson[]; responses: readonly FormResponse[]; calls: readonly Call[];
  onPerson: (id: string) => void; onStage: (s: BoardStage) => void; onForms: () => void; onCalls: () => void;
  onPool: () => void;
}) {
  const c = hireCounts(m);
  const pool = people.filter((p) => p.stage !== "hired" && p.stage !== "passed" && (p.step === "replied" || p.stage === "interviewing")).length;
  const needs = needsYou(m, calls, responses, { onPerson, onStage, onForms, onCalls });

  return (
    <OvCard title="Hires" className="hp">
      <div className="hp-body">
        <PanelBlock className="hp-hires">
          <HiresBar m={m} />
          <HireCaption m={m} />
          <HireList m={m} onPerson={onPerson} onStage={onStage} />
          {c.filled && m.phase !== "closed" && pool > 0 && (
            <p className="hp-note t-body-sm">
              {pool} {plural(pool, "person", "people")} still interested if someone drops out.{" "}
              <button type="button" className="hp-link" onClick={onPool}>See them</button>
            </p>
          )}
        </PanelBlock>
        <NeedsYou rows={needs} />
        <Screening responses={responses} onForms={onForms} />
      </div>
    </OvCard>
  );
}

/* ── the campaign's agents ──
   What is working on this campaign, in plain words, each with the one thing to do about it. From the
   rows the work writes (server: GET /v1/campaigns/:id/agents); there is no deployment of its own. */

export type AgentsView = {
  /** "Working with 20 found and 8 scored", "Keeping watch until 25 people", "Idle". */
  sourcing: { line: string; action: { label: string; id: "find" | "spec" | "stop" | "resume" } | null };
  /** "Waiting for your approval: 12 messages", "Sending 4 messages", "Idle". */
  outreach: { line: string; action: { label: string; id: "review" } | null };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "until 25 people", "until 14 Oct", or both, as a watch was set. */
function untilLine(stop: { profiles?: number; until?: string }): string {
  const parts: string[] = [];
  if (stop.profiles !== undefined) parts.push(`${stop.profiles} ${plural(stop.profiles, "person", "people")}`);
  const d = stop.until ? new Date(stop.until) : null;
  if (d && Number.isFinite(d.getTime())) parts.push(`${d.getDate()} ${MONTHS[d.getMonth()]}`);
  return parts.length ? `until ${parts.join(" or ")}` : "";
}

/** The two lines of the panel, and what each offers, from what the server says the agents are doing. */
export function agentsView(a: ApiCampaignAgents): AgentsView {
  const s = a.sourcing;
  let sourcing: AgentsView["sourcing"];
  if (s.state === "working") {
    const r = s.run;
    sourcing = {
      line: r && r.found !== null ? `Working with ${r.found} found${r.scored > 0 ? ` and ${r.scored} scored` : ""}` : "Working",
      action: null,
    };
  } else if (s.state === "watching" && s.watch) {
    const w = s.watch;
    const until = untilLine(w.stop);
    sourcing = {
      line: `Keeping watch${until ? ` ${until}` : ""}${w.found ? `, ${w.found} found so far` : ""}`,
      action: { label: "Stop", id: "stop" },
    };
  } else if (s.state === "paused" && s.watch) {
    // Seen, not hidden behind "Idle": the owner can tell it is there, why it is not looking, and bring it back.
    const why = (s.watch.reason ?? "").trim().replace(/\.$/, "");
    sourcing = {
      line: !why || why === "Paused by you" ? "Keep-sourcing paused by you" : `Keep-sourcing paused. ${why}.`,
      action: { label: "Resume", id: "resume" },
    };
  } else if (!a.approvedSpec) {
    sourcing = { line: "Waiting for an approved role spec", action: { label: "Review the role spec", id: "spec" } };
  } else sourcing = { line: "Idle", action: { label: "Find people", id: "find" } };

  const o = a.outreach;
  const msgs = (n: number) => `${n} ${plural(n, "message")}`;
  const outreach: AgentsView["outreach"] =
    o.state === "waiting"
      ? { line: `Waiting for your approval: ${msgs(o.waiting)}`, action: { label: "Review", id: "review" } }
      : o.state === "sending"
        ? { line: `Sending ${msgs(o.sending)}`, action: null }
        : { line: "Idle", action: { label: "Review", id: "review" } };
  return { sourcing, outreach };
}

/**
 * What a closed campaign shows where the agents would be: one calm line with its picture. Nothing is running.
 * Reopening is the header's one control for whether the campaign is on, so it is not offered a second time here.
 */
export function ClosedPanel() {
  return (
    <section className="cag cag-closed" aria-label="This campaign is closed">
      <EmptyArt name="campaign-paused" size={160} />
      <div className="cag-closed-t">
        <h2 className="cag-closed-h t-body-strong">This campaign is closed</h2>
        <p className="cag-closed-p t-body-sm">Sourcing and outreach are stopped. Everyone in the pipeline stays on record.</p>
      </div>
    </section>
  );
}

export function AgentsPanel({ agents, onAction, canChange = true }: {
  agents: ApiCampaignAgents | null;
  onAction: (id: "find" | "spec" | "stop" | "resume" | "review") => void;
  /** False for someone who follows the campaign without being on it: the search and the role spec are not theirs. */
  canChange?: boolean;
}) {
  /* A closed campaign has nothing running: the header already says so, and offers to reopen it. */
  if (!agents || agents.status === "closed") return null;
  const v = agentsView(agents);
  const rows: Array<{ key: string; name: string; line: string; action: { label: string; id: "find" | "spec" | "stop" | "resume" | "review" } | null }> = [
    { key: "sourcing", name: "Sourcing", ...v.sourcing, ...(canChange ? {} : { action: null }) },
    { key: "outreach", name: "Outreach", ...v.outreach },
  ];
  return (
    <section className="cag" aria-label="Agents">
      <h2 className="cag-h t-label">Agents</h2>
      {!canChange && <p className="cag-line t-body-sm">{FOLLOWING_LINE}</p>}
      <ul className="cag-list">
        {rows.map((r) => (
          <li key={r.key} className="cag-row">
            <span className="cag-name t-body-strong">{r.name}</span>
            <span className="cag-line t-body-sm">{r.line}</span>
            {r.action && <button type="button" className="ov2-btn cag-act" onClick={() => onAction(r.action!.id)}>{r.action.label}</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
