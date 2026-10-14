import { ArrowRight, Check, CheckCircle, PencilSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, LIVE, messageOf } from "./api/client";
import { boardRows } from "./api/campaigns";
import type { Item, Outcome, Thread } from "./api/outreach";
import * as out from "./api/outreach";
import { suppressedNotice } from "./dncView";
import { hueFor } from "./candidateImport";
import { googleHint, useGoogle } from "./googleSetup";
import { Avatar } from "./CandidateBits";
import { ConnectGate, ServiceMark, useConnectors } from "./connectors";
import type { Need } from "./connectors";
import { candidateFromCardPerson } from "./liveCandidate";
import { putSet } from "./liveCandidates";
import type { Named, Scope, ScopePerson } from "./liveViews/outreachScope";
import { composeFirstEmail, namesLine, scopeLine, scopeOf, threadsInScope, unreachedOf } from "./liveViews/outreachScope";
import { cancellable, goesOut, listedByName, nextLookMs, sectionsOf } from "./outreachView";
import type { ChannelId, MomentCtx, ServiceId } from "./moments";
import {
  CARRIER, CHANNEL_LABEL, HOOK, LINKEDIN_LIMIT, OUTREACH_PLAN, OUTREACH_WRITE, REACH, SERVICES, draftFor,
} from "./moments";
import type { Candidate } from "./sourcing";
import { CANDIDATES } from "./sourcing";
import { Staged } from "./Staged";
import { Loader } from "./components/Loader";
import { EmptyArt } from "./EmptyArt";

/**
 * Outreach — the shortlist, reached on the channel each person answers on.
 *
 *   plan      read the shortlist, check how each person can be reached
 *   route     candidates × channels, the order each will be tried in
 *   connect   whatever the route needs that isn't connected, inline
 *   write     one draft per person, in the channel's own shape
 *   review    a deck: approve, edit or skip each, or approve all
 *   launch    lanes from Queued to Replied, filled as channels report
 *   reply     the first reply comes back into the conversation
 *
 * Nothing reaches a candidate before the recruiter has looked at it.
 *
 * With the API it is the campaign's real outreach: drafts to review, edit
 * and approve (each gets a send time from the recruiter's Gmail pacing),
 * what is scheduled, and sent emails waiting for a logged reply.
 */

const CHANNELS: readonly ChannelId[] = ["gmail", "whatsapp", "linkedin"];

/** Who this run is for: the shortlist if there is one, the top four if not. */
function audience(ctx: MomentCtx): { people: readonly Candidate[]; fromShortlist: boolean } {
  const short = CANDIDATES.filter((c) => ctx.verdicts[c.id] === "shortlisted");
  if (short.length > 0) return { people: short.slice(0, 6), fromShortlist: true };
  return { people: CANDIDATES.filter((c) => ctx.verdicts[c.id] !== "rejected").slice(0, 4), fromShortlist: false };
}

/** Each person's channels in the order they will be tried, WhatsApp first where possible. */
function defaultRoute(people: readonly Candidate[]): Record<string, ChannelId[]> {
  const out: Record<string, ChannelId[]> = {};
  for (const p of people) {
    const has = REACH[p.id] ?? ["gmail"];
    out[p.id] = [...has].sort((a, b) => rank(a) - rank(b));
  }
  return out;
}
const rank = (c: ChannelId) => ({ whatsapp: 0, gmail: 1, linkedin: 2 })[c];

export function Outreach({ ctx }: { ctx: MomentCtx }): JSX.Element {
  return LIVE ? <LiveOutreach campaign={ctx.campaign ?? null} onGrow={ctx.onGrow} /> : <FixtureOutreach ctx={ctx} />;
}

function FixtureOutreach({ ctx }: { ctx: MomentCtx }): JSX.Element {
  /* Frozen at send: shortlisting someone new mid-run must not rewrite a
     route the recruiter is already looking at. */
  const [{ people, fromShortlist }] = useState(() => audience(ctx));
  const [route, setRoute] = useState(() => defaultRoute(people));
  const [skipped, setSkipped] = useState<readonly ServiceId[]>([]);
  const [gateDone, setGateDone] = useState(false);
  const { state } = useConnectors();

  /* A skipped service drops its channel from every route; whoever is left
     with nothing is unreachable for this run and says so. */
  const live = useMemo(() => {
    const out: Record<string, ChannelId[]> = {};
    for (const p of people) out[p.id] = route[p.id]!.filter((c) => !skipped.includes(CARRIER[c]));
    return out;
  }, [people, route, skipped]);

  const reachable = people.filter((p) => live[p.id]!.length > 0);
  const primaries = new Set(reachable.map((p) => live[p.id]![0]!));

  const needs: Need[] = [...primaries]
    .map((ch) => CARRIER[ch])
    .filter((svc, i, all) => all.indexOf(svc) === i)
    .filter((svc) => state[svc] !== "connected" || skipped.includes(svc))
    .map((svc) => {
      const using = reachable.filter((p) => CARRIER[live[p.id]![0]!] === svc).length;
      const ch = SERVICES[svc].channel;
      return {
        service: svc,
        why: `${using} of ${reachable.length} messages go out on ${ch} first.`,
        skipLabel: `Skip ${ch}, use the next channel`,
        skippedNote: "Each person moves to their next channel.",
      };
    });
  /* Skipped services stay in the card so the skip can be undone. */
  const gateNeeds = [
    ...needs,
    ...skipped
      .filter((svc) => !needs.some((n) => n.service === svc))
      .map((svc) => ({
        service: svc,
        why: "",
        skipLabel: "",
        skippedNote: "Each person moves to their next channel.",
      })),
  ];

  const onSettled = useCallback(() => setGateDone(true), []);

  /* Clicking a cell makes that channel first for that person. */
  const lead = (id: string, ch: ChannelId) => {
    setRoute((r) => {
      const order = r[id]!;
      if (!order.includes(ch)) return r;
      return { ...r, [id]: [ch, ...order.filter((c) => c !== ch)] };
    });
  };

  return (
    <div className="src mo">
      <Staged phases={OUTREACH_PLAN} n={people.length} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        {!fromShortlist && (
          <p className="mo-note">Nobody is shortlisted yet, so I've taken the top {people.length} ranked matches.</p>
        )}
        <RouteGrid people={people} live={live} onLead={gateDone ? undefined : lead} />
        <ConnectGate
          needs={gateNeeds}
          skipped={skipped}
          onSkip={(svc) => setSkipped((s) => [...s, svc])}
          onUnskip={(svc) => setSkipped((s) => s.filter((x) => x !== svc))}
          onSettled={onSettled}
        />
        {gateDone && (
          <Staged phases={OUTREACH_WRITE} n={reachable.length} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
            <Review ctx={ctx} people={reachable} live={live} />
          </Staged>
        )}
      </Staged>
    </div>
  );
}

/* ── the route ───────────────────────────────────────────────────────────── */

function RouteGrid({
  people, live, onLead,
}: {
  people: readonly Candidate[];
  live: Readonly<Record<string, ChannelId[]>>;
  onLead?: (id: string, ch: ChannelId) => void;
}) {
  const unreachable = people.filter((p) => live[p.id]!.length === 0);
  const noPhone = people.filter((p) => !(REACH[p.id] ?? []).includes("whatsapp"));
  return (
    <section className="mo-card" aria-label="How each person will be reached">
      <div className="mo-card-h">
        <b>Route</b>
        <span>1 is tried first, then the next after two days</span>
      </div>
      <div className="mo-route" role="table">
        <div className="mo-route-r is-head" role="row">
          <span role="columnheader">Candidate</span>
          {CHANNELS.map((ch) => (
            <span key={ch} role="columnheader" className="mo-route-ch">
              <ServiceMark id={CARRIER[ch]} size={18} />{CHANNEL_LABEL[ch]}
            </span>
          ))}
        </div>
        {people.map((p) => {
          const order = live[p.id]!;
          return (
            <div key={p.id} className={`mo-route-r${order.length === 0 ? " is-out" : ""}`} role="row">
              <span className="mo-who" role="cell"><Avatar name={p.name} hue={p.hue} size={26} />{p.name}</span>
              {CHANNELS.map((ch) => {
                const i = order.indexOf(ch);
                const has = (REACH[p.id] ?? []).includes(ch);
                return (
                  <span key={ch} role="cell" className="mo-route-c">
                    {i >= 0 ? (
                      <button
                        type="button"
                        className={`mo-ord is-${i + 1}`}
                        onClick={onLead ? () => onLead(p.id, ch) : undefined}
                        disabled={!onLead || i === 0}
                        title={i === 0 ? "Tried first" : onLead ? `Try ${CHANNEL_LABEL[ch]} first` : undefined}
                        aria-label={`${p.name}, ${CHANNEL_LABEL[ch]}, try ${ordinal(i + 1)}`}
                      >
                        {i + 1}
                      </button>
                    ) : (
                      <span className="mo-ord is-none" title={has ? "Skipped" : "No contact on file"} aria-label={has ? "Skipped" : "No contact on file"} />
                    )}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      {(noPhone.length > 0 || unreachable.length > 0) && (
        <p className="mo-foot">
          {noPhone.length > 0 && <>No phone on file for {names(noPhone)}, so email leads. </>}
          {unreachable.length > 0 && <>{names(unreachable)} can't be reached with the channels left.</>}
        </p>
      )}
    </section>
  );
}

const ordinal = (n: number) => ["first", "second", "third"][n - 1] ?? `${n}th`;
const names = (ps: readonly Candidate[]) =>
  ps.map((p) => p.name.split(" ")[0]).join(ps.length === 2 ? " and " : ", ");

/* ── review ──────────────────────────────────────────────────────────────── */

type Decision = "approved" | "skipped";

function Review({
  ctx, people, live,
}: {
  ctx: MomentCtx;
  people: readonly Candidate[];
  live: Readonly<Record<string, ChannelId[]>>;
}) {
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [launched, setLaunched] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);

  const current = people.find((p) => !decided[p.id]);
  const approved = people.filter((p) => decided[p.id] === "approved");
  const done = !current;

  /* ── A DECISION LEAVES BEFORE THE NEXT DRAFT ARRIVES ──
     The front card plays its exit (a stamp and a slide left for approved, a
     slide right for skipped) and only then is the decision committed, which
     deals the next card from the stack. One card on screen doing one thing
     at a time; no card is ever replaced under the pointer. */
  const [leaving, setLeaving] = useState<{ id: string; d: Decision } | null>(null);
  const decide = useCallback((id: string, d: Decision) => {
    setEditing(false);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDecided((x) => ({ ...x, [id]: d }));
      return;
    }
    setLeaving({ id, d });
    window.setTimeout(() => {
      setLeaving(null);
      setDecided((x) => ({ ...x, [id]: d }));
    }, d === "approved" ? 380 : 240);
  }, []);

  /* A key pressed while a card is leaving is kept and run on the next card,
     so reviewing at typing speed never drops a keystroke. One is enough:
     nobody decides two drafts they have not seen. */
  const queued = useRef<string | null>(null);

  /* A, E, → while the deck is the thing being worked on. Never while typing
     in the composer or in an edit, and never once everything is decided. */
  useEffect(() => {
    if (done || launched) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      if (e.metaKey || e.ctrlKey || e.altKey || !current) return;
      if (leaving) {
        if (["a", "A", "e", "E", "ArrowRight"].includes(e.key)) { e.preventDefault(); queued.current = e.key; }
        return;
      }
      if (document.querySelector(".rm, .ps")) return;
      if (e.key === "a" || e.key === "A") { e.preventDefault(); decide(current.id, "approved"); }
      if (e.key === "e" || e.key === "E") { e.preventDefault(); setEditing(true); }
      if (e.key === "ArrowRight") { e.preventDefault(); decide(current.id, "skipped"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, done, launched, decide, leaving]);

  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [decided, launched, grow]);

  /* Run the buffered key once the next card is in front. */
  useEffect(() => {
    const k = queued.current;
    if (!k || leaving || !current) return;
    queued.current = null;
    if (k === "a" || k === "A") decide(current.id, "approved");
    else if (k === "e" || k === "E") setEditing(true);
    else decide(current.id, "skipped");
  }, [current, leaving, decide]);

  if (launched) {
    return <Lanes ctx={ctx} people={approved} live={live} />;
  }

  return (
    <section className="mo-card" aria-label="Drafts">
      <div className="mo-card-h">
        <b>Drafts</b>
        <ul className="mo-progress" aria-label="Review progress">
          {people.map((p) => (
            <li key={p.id} className={`is-${decided[p.id] ?? (p === current ? "now" : "todo")}`} title={p.name}>
              <Avatar name={p.name} hue={p.hue} size={22} />
              {decided[p.id] === "approved" && <span className="mo-tick"><Check size={8} weight="bold" /></span>}
            </li>
          ))}
        </ul>
        <span className="sp" />
        {!done && (
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => setDecided((x) => {
            const all = { ...x };
            people.forEach((p) => { if (!all[p.id]) all[p.id] = "approved"; });
            return all;
          })}>
            Approve all {people.filter((p) => !decided[p.id]).length}
          </button>
        )}
      </div>

      {current ? (
        <div className="mo-deck" ref={deckRef}>
          {people.filter((p) => !decided[p.id]).slice(1, 3).map((p, i) => (
            <div key={p.id} className={`mo-draft is-behind is-b${i + 1}`} aria-hidden="true" />
          ))}
          <Draft
            key={current.id}
            leaving={leaving?.id === current.id ? leaving.d : undefined}
            c={current}
            channel={live[current.id]![0]!}
            text={edits[current.id]}
            editing={editing}
            onEdit={() => setEditing(true)}
            onSave={(t) => { setEdits((x) => ({ ...x, [current.id]: t })); setEditing(false); }}
            onCancel={() => setEditing(false)}
            onApprove={() => decide(current.id, "approved")}
            onSkip={() => decide(current.id, "skipped")}
          />
        </div>
      ) : (
        <div className="mo-ready">
          <p>
            <b>{approved.length} approved</b>
            {people.length - approved.length > 0 && <>, {people.length - approved.length} skipped</>}.
            {approved.length > 0 ? " Ready to send." : " Nothing to send."}
          </p>
          <div className="mo-ready-acts">
            <button type="button" className="src-btn is-quiet" onClick={() => setDecided({})}>Review again</button>
            <button
              type="button"
              className="src-btn is-primary"
              disabled={approved.length === 0}
              onClick={() => { setLaunched(true); ctx.deploy("Outreach", "backend-snr"); }}
            >
              Start sequence<ArrowRight size={13} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Draft({
  c, channel, text, editing, onEdit, onSave, onCancel, onApprove, onSkip, leaving,
}: {
  leaving?: Decision;
  c: Candidate;
  channel: ChannelId;
  text?: string;
  editing: boolean;
  onEdit: () => void;
  onSave: (t: string) => void;
  onCancel: () => void;
  onApprove: () => void;
  onSkip: () => void;
}) {
  const d = draftFor(c.id, channel);
  const body = text ?? d.body;
  const [val, setVal] = useState(body);
  const hook = HOOK[c.id]!;
  const svc = SERVICES[CARRIER[channel]];
  const { identity } = useConnectors();
  const over = channel === "linkedin" && val.length > LINKEDIN_LIMIT;

  /* The personal line, underlined where it appears in the body. */
  const marked = (() => {
    const i = body.toLowerCase().indexOf(hook.line.toLowerCase().slice(0, 24));
    if (i < 0) return body;
    const end = i + hook.line.length;
    return <>{body.slice(0, i)}<mark className="mo-hook">{body.slice(i, end)}</mark>{body.slice(end)}</>;
  })();

  return (
    <article className={`mo-draft is-front is-${channel}${leaving ? ` is-leaving-${leaving}` : ""}`}>
      {leaving === "approved" && <span className="mo-approved" aria-hidden="true"><Check size={14} weight="bold" />Approved</span>}
      <header className="mo-draft-h">
        <Avatar name={c.name} hue={c.hue} size={30} />
        <div className="mo-draft-id">
          <b>{c.name}</b>
          <span>
            {channel === "whatsapp" && <>WhatsApp · from {identity.magnifi} · first-contact template</>}
            {channel === "gmail" && <>Email · from {identity.gmail}</>}
            {channel === "linkedin" && <>LinkedIn note · {svc.identity}</>}
          </span>
        </div>
        <ServiceMark id={CARRIER[channel]} size={22} />
      </header>

      {d.subject && !editing && <p className="mo-subject"><span>Subject</span>{d.subject}</p>}

      {editing ? (
        <div className="mo-edit">
          <textarea
            id={`mo-edit-${c.id}`}
            value={val}
            autoFocus
            rows={channel === "gmail" ? 8 : 4}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(val); }
              if (e.key === "Escape") { e.preventDefault(); onCancel(); }
            }}
          />
          <div className="mo-edit-acts">
            {channel === "linkedin" && <span className={`mo-count${over ? " is-over" : ""}`}>{val.length} / {LINKEDIN_LIMIT}</span>}
            <span className="sp" />
            <button type="button" className="src-btn is-quiet mo-small" onClick={onCancel}>Cancel</button>
            <button type="button" className="src-btn is-primary mo-small" disabled={over} onClick={() => onSave(val)}>Save</button>
          </div>
        </div>
      ) : (
        <div className={`mo-body is-${channel}`}>{marked}</div>
      )}

      {!editing && (
        <>
          <p className="mo-src">
            <span aria-hidden="true">↳</span> Personal line from {hook.from}
            {channel === "linkedin" && <span className="mo-count">{body.length} / {LINKEDIN_LIMIT}</span>}
          </p>
          <div className="mo-draft-acts">
            <button type="button" className="src-btn is-primary mo-small" onClick={onApprove}>Approve <kbd>A</kbd></button>
            <button type="button" className="src-btn is-quiet mo-small" onClick={onEdit}><PencilSimple size={13} aria-hidden="true" />Edit <kbd>E</kbd></button>
            <span className="sp" />
            <button type="button" className="src-btn is-quiet mo-small" onClick={onSkip}>Skip <kbd>→</kbd></button>
          </div>
        </>
      )}
    </article>
  );
}

/* ── launch ──────────────────────────────────────────────────────────────── */

const STEPS = ["Queued", "Sent", "Delivered", "Read", "Replied"] as const;

/**
 * How far each lane gets, and when. WhatsApp reports delivery and reads;
 * email reports delivery only; a LinkedIn note stops at sent until it is
 * accepted. One reply, from the first person on WhatsApp, so the demo has
 * its payoff without inventing a response rate.
 */
function plan(channel: ChannelId, i: number, replies: boolean): number[] {
  const base = 500 + i * 380;
  if (channel === "whatsapp") return [base, base + 700, base + 1500, base + 3200 + i * 500, ...(replies ? [base + 5200] : [])];
  if (channel === "gmail") return [base, base + 900, base + 1900];
  return [base, base + 1000];
}

function Lanes({
  ctx, people, live,
}: {
  ctx: MomentCtx;
  people: readonly Candidate[];
  live: Readonly<Record<string, ChannelId[]>>;
}) {
  const replier = people.find((p) => live[p.id]![0] === "whatsapp");
  const schedule = useMemo(
    () => people.map((p, i) => plan(live[p.id]![0]!, i, p === replier)),
    [people, live, replier],
  );
  const [reached, setReached] = useState<number[]>(() => people.map(() => 0));

  useEffect(() => {
    const timers: number[] = [];
    schedule.forEach((times, lane) => {
      times.forEach((ms, step) => {
        timers.push(window.setTimeout(() => {
          setReached((r) => r.map((v, i) => (i === lane ? Math.max(v, step + 1) : v)));
        }, ms));
      });
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [schedule]);

  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [reached, grow]);

  const settled = reached.every((r, i) => r >= schedule[i]!.length);
  const count = (step: number) => reached.filter((r) => r > step).length;
  const replied = replier ? reached[people.indexOf(replier)]! >= 5 : false;
  const channels = new Set(people.map((p) => live[p.id]![0]));

  return (
    <>
      <section className="mo-card" aria-label="Sequence">
        <div className="mo-card-h">
          <b>Sequence</b>
          <span>{people.length} {people.length === 1 ? "person" : "people"} · {channels.size} {channels.size === 1 ? "channel" : "channels"}</span>
          <span className="sp" />
          <span className="mo-tally" aria-live="polite">
            <span><b>{count(0)}</b> sent</span>
            <span><b>{count(1)}</b> delivered</span>
            <span className={replied ? "is-hot" : undefined}><b>{count(4)}</b> replied</span>
          </span>
        </div>
        <div className="mo-lanes">
          <div className="mo-lane is-head" aria-hidden="true">
            <span />
            <div className="mo-lane-steps">{STEPS.map((s) => <span key={s}>{s}</span>)}</div>
          </div>
          {people.map((p, i) => {
            const ch = live[p.id]![0]!;
            const got = reached[i]!;
            const final = schedule[i]!.length;
            return (
              <div key={p.id} className="mo-lane">
                <span className="mo-who" title={p.name}><ServiceMark id={CARRIER[ch]} size={18} />{p.name.replace(/ (\w)\w+$/, " $1.")}</span>
                <div className="mo-lane-track">
                  {STEPS.map((s, k) => (
                    <span
                      key={s}
                      className={`mo-seg${k < got ? (k === 4 ? " is-reply" : " is-on") : ""}${k >= final ? " is-na" : ""}`}
                    />
                  ))}
                </div>
                <span className="mo-lane-now">
                  {got === 0 ? "Queued" : got >= final && final < 5
                    ? (ch === "linkedin" ? "Awaiting accept" : STEPS[got - 1])
                    : STEPS[got - 1]}
                </span>
              </div>
            );
          })}
        </div>
        {settled && (
          <p className="mo-stamp"><CheckCircle size={15} weight="fill" aria-hidden="true" />Sequence live · follow-ups go out on 30 Sep to anyone who hasn't replied</p>
        )}
      </section>

      {replied && replier && (
        <section className="mo-reply" aria-live="polite">
          <Avatar name={replier.name} hue={replier.hue} size={32} />
          <div className="mo-reply-copy">
            <p className="mo-reply-h">{replier.name.split(" ")[0]} replied on WhatsApp <span>· just now</span></p>
            <p className="mo-quote">"Happy to talk. Thursday works for me."</p>
          </div>
          <button
            type="button"
            className="src-btn is-primary mo-small"
            onClick={() => ctx.seed(`Book ${replier.name.split(" ")[0]} with Sudhanshu on Thursday`)}
          >
            Book a call
          </button>
        </section>
      )}
    </>
  );
}

/* ── with the API ────────────────────────────────────────────────────────── */

const DRAFT_BATCH = 50;

const noGrow = () => {};

/** What the chat gives the outreach it hosts: whom the agent meant, and a way to open someone's profile. */
export type OutreachHost = {
  /** The people the agent named; with none, the campaign's shortlist. */
  named?: Named;
  openProfile?: (id: string, ids?: readonly string[]) => void;
};

type Waiting = Pick<ScopePerson, "campaignCandidateId" | "fullName"> & Partial<Pick<ScopePerson, "currentTitle" | "currentCompanyName">>;

/**
 * A campaign's real outreach. In the chat (`hosted`) it is drawn for the people the agent meant,
 * says who they are and who has no email, and asks to connect Gmail right where drafts wait; it
 * grows the turn. On a campaign page there is nothing to grow and it covers the whole shortlist.
 */
export function LiveOutreach({ campaign, onGrow = noGrow, hosted }: { campaign: { id: string; name: string } | null; onGrow?: () => void; hosted?: OutreachHost }): JSX.Element {
  const campaignId = campaign?.id ?? null;
  const [threads, setThreads] = useState<readonly Thread[] | null>(null);
  /* On the shortlist with an email and no thread yet: who a first draft can go to. */
  const [unreached, setUnreached] = useState<readonly Waiting[]>([]);
  const [noEmail, setNoEmail] = useState(0);
  /* In the chat: who the run is for, and those who can't be emailed. */
  const [scope, setScope] = useState<Scope | null>(null);
  const [noEmailPeople, setNoEmailPeople] = useState<readonly ScopePerson[]>([]);
  const [gateSkipped, setGateSkipped] = useState<readonly ServiceId[]>([]);
  const hostedRef = useRef(hosted);
  hostedRef.current = hosted;
  const namedKey = hosted ? `${hosted.named?.candidateIds.join(",") ?? ""}|${hosted.named?.personIds.join(",") ?? ""}` : "";
  const [failedLoad, setFailedLoad] = useState<string | null>(null);
  /* Message id → what is happening to it. Nothing is shown as scheduled,
     cancelled or logged until the server has said so. */
  const [busy, setBusy] = useState<Readonly<Record<string, string>>>({});
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  /* What to say beside one message ("it had already gone out"), kept with it rather than in a note far above. */
  const [rowNote, setRowNote] = useState<Readonly<Record<string, string>>>({});
  /* Some people were left out of an approval because they are on the do-not-contact list. */
  const [heldBack, setHeldBack] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const google = useGoogle();
  const sending = googleHint(google, "gmail");
  const [needsGmail, setNeedsGmail] = useState(false);

  const load = useCallback(async () => {
    if (!campaignId) return;
    try {
      if (hostedRef.current) {
        /* The board says who is on the do-not-contact list (the server's one rule, by person and by address),
           so the count says who would be drafted and nobody listed is counted as someone to write to. */
        const [ts, rows] = await Promise.all([out.listThreads(campaignId), boardRows(campaignId)]);
        const sc = scopeOf(rows, hostedRef.current.named);
        const { withEmail, withoutEmail } = unreachedOf(sc.people.filter((p) => !p.suppressed), ts);
        setScope(sc);
        setThreads(threadsInScope(ts, sc.people));
        setUnreached(withEmail);
        setNoEmail(withoutEmail.length);
        setNoEmailPeople(withoutEmail);
        setFailedLoad(null);
        return;
      }
      const [ts, short] = await Promise.all([out.listThreads(campaignId), out.shortlisted(campaignId)]);
      const has = new Set(ts.map((t) => t.campaignCandidateId));
      /* Someone on the do-not-contact list is not someone who can be drafted for: they are left out of the count. */
      const fresh = short.filter((c) => !has.has(c.campaignCandidateId) && !c.doNotContact);
      setThreads(ts);
      setUnreached(fresh.filter((c) => c.hasEmail));
      setNoEmail(fresh.filter((c) => !c.hasEmail).length);
      setFailedLoad(null);
    } catch (err) {
      setFailedLoad(messageOf(err));
    }
  }, [campaignId]);
  useEffect(() => { void load(); }, [load, namedKey]);

  /* A message on its way is looked at again just after it is due, so the card never says "Scheduled" about an
     email that has already gone, and a Cancel is never offered for one that has. */
  const lookIn = threads ? nextLookMs(threads) : null;
  useEffect(() => {
    if (lookIn === null) return;
    const t = window.setTimeout(() => { void load(); }, lookIn);
    return () => window.clearTimeout(t);
  }, [lookIn, threads, load]);

  useEffect(() => { onGrow(); }, [threads, busy, note, scope, gateSkipped, onGrow]);

  /* Whoever is in view opens their profile from here, so they are registered where the profile sheet looks. */
  useEffect(() => {
    if (!scope || !campaignId) return;
    const candidates = scope.people
      .map((p) => candidateFromCardPerson({
        personId: null, candidateId: p.candidateId, name: p.fullName, title: p.currentTitle, company: p.currentCompanyName,
        city: p.city, years: p.yearsOfExperience, strengths: [], linkedinUrl: p.linkedinUrl,
      }))
      .filter((c): c is NonNullable<typeof c> => c !== null);
    if (candidates.length) putSet({ key: `outreach:${campaignId}`, campaignId, candidates, criteria: [], reasons: {}, total: candidates.length });
  }, [scope, campaignId]);

  const mark = (ids: readonly string[], what: string | null) => setBusy((b) => {
    const next = { ...b };
    for (const id of ids) { if (what) next[id] = what; else delete next[id]; }
    return next;
  });
  const fail = (err: unknown) => {
    const msg = messageOf(err);
    /* A 503 here is Google: say what to do about it, unless the server can't use Google at all. */
    setNote(err instanceof ApiError && err.status === 503 && sending ? sending : msg);
  };

  const approve = async (ids: readonly string[]) => {
    if (!ids.length) return;
    /* Gmail isn't connected: say so right where they clicked, with the way to fix it,
       rather than sending a request we know will be refused. */
    if (sending) {
      setNeedsGmail(true);
      setNote(hosted && google?.available ? "Connect Gmail above first, then approve. Your drafts are kept until then." : `${sending} Your drafts are kept until then.`);
      return;
    }
    setNeedsGmail(false);
    setNote(null);
    setHeldBack(null);
    mark(ids, "Scheduling");
    try {
      const r = await out.approve(ids);
      setThreads((cur) => (cur ? out.applyScheduled(cur, r.scheduled) : cur));
      setHeldBack(suppressedNotice(r.suppressed ?? []));
      if (r.skipped.length) void load();
    } catch (err) {
      fail(err);
    }
    mark(ids, null);
  };

  const save = async (i: Item, subject: string, body: string) => {
    const before = i.message;
    setNote(null);
    setThreads((cur) => (cur ? out.patchMessage(cur, before.id, { subject, body }) : cur));
    try {
      await out.editMessage(before.id, { subject, body });
    } catch (err) {
      setThreads((cur) => (cur ? out.patchMessage(cur, before.id, { subject: before.subject, body: before.body }) : cur));
      fail(err);
    }
  };

  const cancel = async (i: Item) => {
    const id = i.message.id;
    setNote(null);
    setRowNote((r) => { const n = { ...r }; delete n[id]; return n; });
    mark([id], "Cancelling");
    try {
      await out.cancel(id);
      setThreads((cur) => (cur ? out.patchMessage(cur, id, { status: "draft", scheduledFor: null }) : cur));
      setSkipped((s) => { const n = new Set(s); n.delete(id); return n; });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        /* Too late: it went out between the card being drawn and the press. Say so beside it, and read the truth. */
        setRowNote((r) => ({ ...r, [id]: "It had already gone out, so it can't be called back." }));
        await load();
      } else {
        setRowNote((r) => ({ ...r, [id]: messageOf(err) }));
      }
    }
    mark([id], null);
  };

  const logIt = async (i: Item, outcome: Outcome, reply?: string) => {
    setNote(null);
    mark([i.message.id], "Saving");
    try {
      await out.logOutcome(i.message.id, outcome, reply);
      const change = outcome === "replied" ? { status: "replied_logged" as const } : outcome === "bounced" ? { status: "failed" as const, error: "bounced" } : {};
      setThreads((cur) => (cur ? out.patchMessage(cur, i.message.id, { ...change, outcome }) : cur));
    } catch (err) {
      fail(err);
    }
    mark([i.message.id], null);
  };

  const writeDrafts = async () => {
    if (!campaign) return;
    setNote(null);
    setWriting(true);
    try {
      const items = unreached.slice(0, DRAFT_BATCH).map((c) => ({
        campaignCandidateId: c.campaignCandidateId,
        ...(hosted ? composeFirstEmail({ fullName: c.fullName, currentTitle: c.currentTitle ?? null, currentCompanyName: c.currentCompanyName ?? null }, campaign.name) : out.firstDraft(c.fullName, campaign.name)),
      }));
      const r = await out.createDrafts(campaign.id, items);
      if (r.errors[0]) setNote(r.errors[0].message);
      await load();
    } catch (err) {
      fail(err);
    }
    setWriting(false);
  };

  if (!campaign) return <div className="src mo"><p className="mo-note">Open a campaign first. Outreach goes to one campaign's shortlist at a time.</p></div>;
  if (!threads) {
    return (
      <div className="src mo">
        {failedLoad ? <p className="mo-note">{failedLoad}</p> : <Loader size="md" label={`Loading outreach for ${campaign.name}`} block />}
        {failedLoad && <div className="mo-acts"><button type="button" className="src-btn is-quiet mo-small" onClick={() => void load()}>Try again</button></div>}
      </div>
    );
  }

  /* Someone on the do-not-contact list is never in the drafts, the schedule or a count: they have a row of their own, no actions. */
  const { drafts, scheduled, sent, failed, doNotContact } = sectionsOf(threads, skipped);
  /* Every person left out for being on the list is named here, those with a message waiting and those without. */
  const listedPeople = listedByName(doNotContact, scope?.people);
  const nothing = !drafts.length && !scheduled.length && !sent.length && !failed.length && !listedPeople.length;
  const now = Date.now();
  /* In the chat, Gmail is asked for right here when something is waiting to go and the server can use Google at all. */
  const askGmail = !!hosted && !!google?.available && sending !== null && (drafts.length > 0 || unreached.length > 0);
  const emailable = scope ? scope.people.filter((p) => p.hasEmail && !p.suppressed).length : 0;
  const listed = scope ? scope.people.filter((p) => p.suppressed).length : 0;
  const peopleIds = scope ? scope.people.map((p) => p.candidateId) : [];

  return (
    <div className="src mo">
      {hosted && scope && (
        <WhoFor scope={scope} emailable={emailable} listed={listed} without={noEmailPeople} onOpen={hosted.openProfile ? (id) => hosted.openProfile?.(id, peopleIds) : undefined} />
      )}
      {askGmail && (
        <ConnectGate
          needs={[{
            service: "gmail",
            why: "Approved emails go out from your own Gmail, spaced through the day. Nothing is sent until you approve each one.",
            skipLabel: "Not now, keep them as drafts",
            skippedNote: "Your drafts are kept until Gmail is connected.",
          }]}
          skipped={gateSkipped}
          onSkip={(svc) => setGateSkipped((g) => [...g, svc])}
          onUnskip={(svc) => setGateSkipped((g) => g.filter((x) => x !== svc))}
          onSettled={noGrow}
          title="Gmail needs connecting before anything can be sent"
        />
      )}
      {note && (
        <p className={`mo-note${needsGmail ? " is-ask" : ""}`} role={needsGmail ? "alert" : "status"}>
          {note}
          {needsGmail && !askGmail && <> <a href="#/settings/connections">Open Connections</a></>}
        </p>
      )}
      {heldBack && (
        <p className="mo-note" role="status">
          {heldBack}
        </p>
      )}
      {drafts.length > 0 && sending && !note && !askGmail && <p className="mo-note">{sending}</p>}
      {drafts.length > 0 && (
        <LiveDeck drafts={drafts} busy={busy} onApprove={(ids) => void approve(ids)} onSave={(i, s, b) => void save(i, s, b)}
          onSkip={(i) => setSkipped((s) => new Set(s).add(i.message.id))} />
      )}
      {unreached.length > 0 && (hosted || drafts.length === 0) ? (
        <section className="mo-card" aria-label={drafts.length > 0 ? "Not drafted yet" : "Drafts"}>
          <div className="mo-card-h"><b>{drafts.length > 0 ? "Not drafted yet" : "Drafts"}</b><span>{hosted ? nameList(unreached.map((c) => c.fullName)) : unreachedLine(unreached.length, noEmail)}</span></div>
          <div className="mo-ready">
            <p>A short first email to each. You read and approve every one before it goes out.</p>
            {sending && !askGmail && <p className="mo-note">{sending}</p>}
            <div className="mo-ready-acts">
              <button type="button" className="src-btn is-primary" disabled={writing} onClick={() => void writeDrafts()}>
                {writing ? <><Loader size="sm" tone="inherit" />Writing drafts</> : `Draft ${Math.min(unreached.length, DRAFT_BATCH)} ${unreached.length === 1 ? "email" : "emails"}`}
              </button>
            </div>
          </div>
        </section>
      ) : drafts.length === 0 && nothing && !hosted && (
        <div className="mo-none">
          <EmptyArt name="empty-approvals" size={160} />
          <p className="mo-note">
            {noEmail
              ? `${noEmail === 1 ? "The 1 person" : `The ${noEmail} people`} not contacted on the ${campaign.name} shortlist ${noEmail === 1 ? "has" : "have"} no email on file, so they can't be emailed yet.`
              : `Nothing is waiting for your approval on ${campaign.name}. Everyone on the shortlist has been written to.`}
          </p>
        </div>
      )}

      {skipped.size > 0 && drafts.length === 0 && (
        <p className="mo-foot">
          {skipped.size} skipped, still drafts.{" "}
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => setSkipped(new Set())}>Review them again</button>
        </p>
      )}

      {scheduled.length > 0 && (
        <section className="mo-card" aria-label="Scheduled">
          <div className="mo-card-h"><b>Scheduled</b><span>Sent from your Gmail, spaced out through the day</span></div>
          <div className="mo-stack">
            {scheduled.map((i) => {
              const m = i.message;
              const going = goesOut(m, now);
              return (
                <div key={m.id} className="mo-stack">
                  <div className="mo-draft-h">
                    <Avatar name={i.thread.candidate.name} hue={hueFor(i.thread.candidate.name)} size={26} />
                    <span className="mo-draft-id">
                      <b>{i.thread.candidate.name}</b>
                      <span>
                        {going === "now"
                          ? "Going out now"
                          : m.scheduledFor ? out.whenLabel(m.scheduledFor) : "Waiting for a slot"}
                      </span>
                    </span>
                    {(cancellable(m, now) || busy[m.id]) && (
                      <button type="button" className="src-btn is-quiet mo-small" disabled={!!busy[m.id]} onClick={() => void cancel(i)}>
                        {busy[m.id] ?? "Cancel"}
                      </button>
                    )}
                  </div>
                  {rowNote[m.id] && <p className="mo-foot" role="status">{rowNote[m.id]}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {listedPeople.length > 0 && (
        <section className="mo-card" aria-label="Do not contact">
          <div className="mo-card-h"><b>Do not contact</b><span>Left out of everything here. Nothing goes to them.</span></div>
          <div className="mo-stack">
            {listedPeople.map((p) => (
              <div key={p.id} className="mo-draft-h">
                <Avatar name={p.name} hue={hueFor(p.name)} size={26} />
                <span className="mo-draft-id">
                  <b>{p.name}</b>
                  <span>Do not contact</span>
                </span>
              </div>
            ))}
            <p className="mo-foot">Only an admin can take someone off this list.</p>
          </div>
        </section>
      )}

      {sent.length > 0 && (
        <section className="mo-card" aria-label="Sent">
          <div className="mo-card-h"><b>Sent</b><span>SuperHyre can't read replies yet, so log what happened</span></div>
          <div className="mo-stack">
            {sent.map((i) => <SentRow key={i.message.id} item={i} busy={busy[i.message.id]} onLog={(o, reply) => void logIt(i, o, reply)} />)}
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <section className="mo-card" aria-label="Didn't send">
          <div className="mo-card-h"><b>Didn't go out</b></div>
          <div className="mo-stack">
            {failed.map((i) => (
              <div key={i.message.id} className="mo-draft-h">
                <Avatar name={i.thread.candidate.name} hue={hueFor(i.thread.candidate.name)} size={26} />
                <span className="mo-draft-id">
                  <b>{i.thread.candidate.name}</b>
                  <span>{i.message.error === "bounced" ? "Bounced" : i.message.error ?? "Not sent"}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** "A, B, C and 2 more". */
function nameList(names: readonly string[], show = 3): string {
  const { shown, more } = namesLine(names, show);
  if (!more) return shown.length <= 1 ? shown.join("") : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  return `${shown.join(", ")} and ${more} more`;
}

/** Who the run is for, in one sentence, and who has no email (each a way into their profile). */
function WhoFor({ scope, emailable, listed, without, onOpen }: {
  scope: Scope; emailable: number; listed: number; without: readonly ScopePerson[]; onOpen?: (candidateId: string) => void;
}) {
  const [all, setAll] = useState(false);
  const { shown, more } = namesLine(without.map((p) => p.fullName), all ? without.length : 3);
  const people = without.slice(0, shown.length);
  return (
    <>
      <p className="mo-note">{scopeLine(scope, scope.people.length, emailable, listed)}</p>
      {without.length > 0 && (
        <p className="mo-note">
          Without an email:{" "}
          {people.map((p, i) => (
            <span key={p.candidateId}>
              {onOpen ? <button type="button" className="lt-link" onClick={() => onOpen(p.candidateId)}>{p.fullName}</button> : p.fullName}
              {i < people.length - 1 ? ", " : ""}
            </span>
          ))}
          {more > 0 && <>{" "}and <button type="button" className="lt-link" onClick={() => setAll(true)}>{more} more</button></>}
          .
        </p>
      )}
    </>
  );
}

function LiveDeck({ drafts, busy, onApprove, onSave, onSkip }: {
  drafts: readonly Item[];
  busy: Readonly<Record<string, string>>;
  onApprove: (ids: readonly string[]) => void;
  onSave: (i: Item, subject: string, body: string) => void;
  onSkip: (i: Item) => void;
}) {
  const [editing, setEditing] = useState(false);
  const current = drafts[0];
  const working = drafts.some((i) => busy[i.message.id]);
  useEffect(() => { setEditing(false); }, [current?.message.id]);

  /* A, E, → while the deck is what is being worked on; never while typing. */
  useEffect(() => {
    if (!current || editing) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      if (e.metaKey || e.ctrlKey || e.altKey || busy[current.message.id] || document.querySelector(".rm, .ps")) return;
      if (e.key === "a" || e.key === "A") { e.preventDefault(); onApprove([current.message.id]); }
      if (e.key === "e" || e.key === "E") { e.preventDefault(); setEditing(true); }
      if (e.key === "ArrowRight") { e.preventDefault(); onSkip(current); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, editing, busy, onApprove, onSkip]);

  if (!current) return null;
  const c = current.thread.candidate;
  const state = busy[current.message.id];
  return (
    <section className="mo-card" aria-label="Drafts">
      <div className="mo-card-h">
        <b>Drafts</b>
        <span>{drafts.length} to review</span>
        <span className="sp" />
        {drafts.length > 1 && (
          <button type="button" className="src-btn is-quiet mo-small" disabled={working} onClick={() => onApprove(drafts.map((i) => i.message.id))}>
            {working ? <><Loader size="sm" tone="inherit" />Scheduling</> : `Approve all ${drafts.length}`}
          </button>
        )}
      </div>
      <div className="mo-deck">
        {drafts.slice(1, 3).map((i, k) => <div key={i.message.id} className={`mo-draft is-behind is-b${k + 1}`} aria-hidden="true" />)}
        <article key={current.message.id} className="mo-draft is-front is-gmail">
          <header className="mo-draft-h">
            <Avatar name={c.name} hue={hueFor(c.name)} size={30} />
            <div className="mo-draft-id">
              <b>{c.name}</b>
              <span>Email{c.primaryEmail ? ` · to ${c.primaryEmail}` : ""}{c.title ? ` · ${c.title}` : ""}</span>
            </div>
          </header>
          {editing ? (
            <LiveEdit item={current} onCancel={() => setEditing(false)} onSave={(s, b) => { onSave(current, s, b); setEditing(false); }} />
          ) : (
            <>
              <p className="mo-subject"><span>Subject</span>{current.message.subject}</p>
              <div className="mo-body is-gmail">{current.message.body}</div>
              <div className="mo-draft-acts">
                <button type="button" className="src-btn is-primary mo-small" disabled={!!state} onClick={() => onApprove([current.message.id])}>
                  {state ?? <>Approve <kbd>A</kbd></>}
                </button>
                <button type="button" className="src-btn is-quiet mo-small" disabled={!!state} onClick={() => setEditing(true)}><PencilSimple size={13} aria-hidden="true" />Edit <kbd>E</kbd></button>
                <span className="sp" />
                <button type="button" className="src-btn is-quiet mo-small" disabled={!!state} onClick={() => onSkip(current)}>Skip <kbd>→</kbd></button>
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  );
}

function LiveEdit({ item, onSave, onCancel }: { item: Item; onSave: (subject: string, body: string) => void; onCancel: () => void }) {
  const [subject, setSubject] = useState(item.message.subject ?? "");
  const [body, setBody] = useState(item.message.body);
  const ok = subject.trim().length > 0 && body.trim().length > 0;
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ok) { e.preventDefault(); onSave(subject.trim(), body.trim()); }
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };
  return (
    <div className="mo-edit">
      <textarea aria-label="Subject" rows={1} value={subject} maxLength={200} onKeyDown={keys}
        onChange={(e) => setSubject(e.target.value.replace(/[\r\n]+/g, " "))} />
      <textarea aria-label="Email" rows={8} value={body} autoFocus onKeyDown={keys} onChange={(e) => setBody(e.target.value)} />
      <div className="mo-edit-acts">
        <span className="sp" />
        <button type="button" className="src-btn is-quiet mo-small" onClick={onCancel}>Cancel</button>
        <button type="button" className="src-btn is-primary mo-small" disabled={!ok} onClick={() => onSave(subject.trim(), body.trim())}>Save</button>
      </div>
    </div>
  );
}

function SentRow({ item, busy, onLog }: { item: Item; busy?: string; onLog: (o: Outcome, reply?: string) => void }) {
  const [pasting, setPasting] = useState(false);
  const [reply, setReply] = useState("");
  const c = item.thread.candidate;
  return (
    <div className="mo-stack">
      <div className="mo-draft-h">
        <Avatar name={c.name} hue={hueFor(c.name)} size={26} />
        <span className="mo-draft-id">
          <b>{c.name}</b>
          <span>{item.message.sentAt ? `Sent ${out.whenLabel(item.message.sentAt).toLowerCase()}` : "Sent"}</span>
        </span>
        {item.message.outcome ? <span className="mo-foot">{out.OUTCOME_WORDS[item.message.outcome]}</span> : busy ? <span className="mo-foot">{busy}</span> : !pasting && (
          <span className="mo-draft-acts">
            <button type="button" className="src-btn is-quiet mo-small" onClick={() => setPasting(true)}>Replied</button>
            <button type="button" className="src-btn is-quiet mo-small" onClick={() => onLog("no_reply")}>No reply</button>
            <button type="button" className="src-btn is-quiet mo-small" onClick={() => onLog("bounced")}>Bounced</button>
          </span>
        )}
      </div>
      {pasting && !busy && !item.message.outcome && (
        <div className="mo-edit">
          <textarea aria-label={`${c.name}'s reply`} rows={3} value={reply} autoFocus placeholder="Paste their reply, if you like" onChange={(e) => setReply(e.target.value)} />
          <div className="mo-edit-acts">
            <span className="sp" />
            <button type="button" className="src-btn is-quiet mo-small" onClick={() => setPasting(false)}>Cancel</button>
            {/* The form closes as soon as the reply is logged; the row then says it was, and the text is kept if it didn't save. */}
            <button type="button" className="src-btn is-primary mo-small" onClick={() => { setPasting(false); onLog("replied", reply); }}>Log reply</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Who a first email can go to, said so it adds up to the Shortlisted page's "not contacted
 * yet": people without an email are counted out loud, never silently left off.
 */
export function unreachedLine(withEmail: number, withoutEmail: number): string {
  const total = withEmail + withoutEmail;
  const lead = `${total} on the shortlist with nothing sent yet`;
  if (!withoutEmail) return lead;
  return `${lead}. ${withoutEmail} ${withoutEmail === 1 ? "has" : "have"} no email, so ${withEmail} can be emailed`;
}
