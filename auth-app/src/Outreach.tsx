import { ArrowRight, Check, CheckCircle, PencilSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "./CandidateBits";
import { ConnectGate, ServiceMark, useConnectors } from "./connectors";
import type { Need } from "./connectors";
import type { ChannelId, MomentCtx, ServiceId } from "./moments";
import {
  CARRIER, CHANNEL_LABEL, HOOK, LINKEDIN_LIMIT, OUTREACH_PLAN, OUTREACH_WRITE, REACH, SERVICES, draftFor,
} from "./moments";
import type { Candidate } from "./sourcing";
import { CANDIDATES } from "./sourcing";
import { Staged } from "./Staged";

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
