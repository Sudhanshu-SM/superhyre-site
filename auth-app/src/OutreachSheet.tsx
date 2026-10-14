import { ArrowUpRight } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityRow, CallItem, CandidateOutreach, EmailItem, TimelineItem, WhatsAppItem } from "./api/outreachActivity";
import { candidateOutreach } from "./api/outreachActivity";
import { approve, cancel } from "./api/outreach";
import { LIVE, messageOf } from "./api/client";
import { CallBody, SheetFrame } from "./CallSheet";
import { candidateHref, lengthLabel, OUTCOME_LABEL, OUTCOME_TONE } from "./callsView";
import { ChannelMark } from "./ChannelMark";
import { Loader } from "./components/Loader";
import { GhostChart } from "./GhostChart";
import { invalidateViews } from "./invalidate";
import {
  callHead, callRowFromActivity, emailHead, emailStatus, excerpt, followUpPrompt, isCall, itemsOf, SHEET_TABS, STATUS_TONE,
  WHATSAPP_REASON, WHATSAPP_WAITING, whenOf,
} from "./outreachActivityView";
import type { SheetTab } from "./outreachActivityView";
import { fixtureCandidate } from "./outreachFixtures";
import { toneProps } from "./statusTones";
import { useToast } from "./toast";

/**
 * One person's whole outreach in the right-hand sheet: who they are and where, a row of tabs (Timeline, Email,
 * WhatsApp, Calls), and under them what was said, newest first. A fact is on screen once: the header names the
 * person and the campaign, a card says what it is and when, and a call's summary is the card's line until the card
 * opens, when the call's own summary takes its place. The one quiet strip at the bottom offers only what can be done
 * today: ask the agent for a follow-up, add a note to a call, and nothing for WhatsApp until it is connected.
 */

type Props = {
  /** The row it was opened from: the sheet has a name and a campaign while the rest is read. */
  row: ActivityRow;
  onClose: () => void;
  /** Hands a written prompt to the agent (and leaves the page); absent where there is no agent to ask. */
  onAgent?: ((prompt: string) => void) | undefined;
  /** Something changed (an approval, a cancelled send): the page's list reads again. */
  onChanged: () => void;
};

function EmailCard({ e, busy, onApprove, onCancel }: { e: EmailItem; busy: boolean; onApprove: () => void; onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  const cut = excerpt(e.body);
  const status = emailStatus(e);
  const time = e.status === "scheduled" && e.scheduledFor ? e.scheduledFor : e.at;
  return (
    <article className={`ko-card is-email${e.direction === "in" ? " is-in" : ""}`} aria-label={`Email, ${emailHead(e)}`}>
      <header className="ko-card-h">
        <ChannelMark channel="email" />
        <span className="ko-card-who kl-ell">{emailHead(e)}</span>
        {status && <span {...toneProps(STATUS_TONE[e.status])} className="ko-card-st st">{status}</span>}
        <span className="ko-card-when kl-num">{whenOf(time)}</span>
      </header>
      {e.subject && <p className="ko-subject">{e.subject}</p>}
      {e.body && (
        <p className="ko-text">{open || !cut.cut ? e.body.trim() : cut.text}</p>
      )}
      {cut.cut && (
        <button type="button" className="kl-link ko-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Show less" : "Show the whole email"}
        </button>
      )}
      {(e.canApprove || e.canCancel) && (
        <div className="ko-actions">
          {e.canApprove && (
            <button type="button" className="kl-btn is-primary" disabled={busy} onClick={onApprove}>
              {busy ? <><Loader size="sm" tone="inherit" /> Approving</> : "Approve and schedule"}
            </button>
          )}
          {e.canCancel && (
            <button type="button" className="kl-btn" disabled={busy} onClick={onCancel}>
              {busy ? <><Loader size="sm" tone="inherit" /> Cancelling</> : "Cancel the send"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function WhatsAppBubble({ m }: { m: WhatsAppItem }) {
  return (
    <article className={`ko-card is-chat ${m.direction === "in" ? "is-in" : "is-out"}`} aria-label="WhatsApp message">
      <header className="ko-card-h">
        <ChannelMark channel="whatsapp" />
        <span className="ko-card-who kl-ell">{m.direction === "in" ? "Their message" : m.by?.mine ? "Sent by you" : `Sent by ${m.by?.name?.split(/\s+/)[0] ?? "a teammate"}`}</span>
        <span className="ko-card-when kl-num">{whenOf(m.at)}</span>
      </header>
      <p className="ko-bubble">{m.text}</p>
    </article>
  );
}

function CallCard({ c, open, onToggle, focusNote }: { c: CallItem; open: boolean; onToggle: () => void; focusNote: number }) {
  const call = c.call;
  const length = lengthLabel(call.durationSeconds);
  const line = call.summary ?? call.preview ?? call.outcomeText ?? "";
  const body = useRef<HTMLDivElement>(null);
  // A card opened by "Log a call note" is brought into view with its note.
  useEffect(() => {
    if (open && focusNote > 0) body.current?.scrollIntoView({ block: "nearest" });
  }, [open, focusNote]);
  return (
    <article className="ko-card is-call" aria-label={`Call, ${callHead(call)}`}>
      <header className="ko-card-h">
        <ChannelMark channel="call" />
        <span className="ko-card-who kl-ell">{callHead(call)}</span>
        <span {...toneProps(OUTCOME_TONE[call.outcome])} className="ko-card-st st">{OUTCOME_LABEL[call.outcome]}</span>
        <span className="ko-card-when kl-num">{whenOf(call.at)}{length ? `, ${length}` : ""}</span>
      </header>
      {!open && line && <p className="ko-text">{line}</p>}
      <button type="button" className="kl-link ko-more" aria-expanded={open} onClick={onToggle}>
        {open ? "Hide the call" : call.hasRecording || call.hasTranscript ? "Open the call" : "Open the call and add a note"}
      </button>
      {open && (
        <div className="ko-call-open" ref={body}>
          <CallBody id={call.id} hint={call} campaigns={[]} bare focusNote={focusNote} />
        </div>
      )}
    </article>
  );
}

/** The cards, newest first: an email, a WhatsApp message or a call each in its own shape. */
export function OutreachThread({ items, busy, openCall, focusNote, onApprove, onCancel, onToggleCall }: {
  items: readonly TimelineItem[];
  busy: string | null;
  openCall: string | null;
  focusNote: number;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
  onToggleCall: (id: string) => void;
}) {
  return (
    <ol className="ko-thread">
      {items.map((i) => (
        <li key={`${i.kind}-${i.id}`}>
          {i.kind === "email" ? (
            <EmailCard e={i} busy={busy === i.id} onApprove={() => onApprove(i.id)} onCancel={() => onCancel(i.id)} />
          ) : i.kind === "call" ? (
            <CallCard
              c={i}
              open={openCall === i.call.id}
              onToggle={() => onToggleCall(i.call.id)}
              focusNote={openCall === i.call.id ? focusNote : 0}
            />
          ) : (
            <WhatsAppBubble m={i} />
          )}
        </li>
      ))}
    </ol>
  );
}

export function OutreachSheet({ row, onClose, onAgent, onChanged }: Props) {
  const toast = useToast();
  const [data, setData] = useState<CandidateOutreach | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">(row.candidateId ? "loading" : "ready");
  const [tab, setTab] = useState<SheetTab>("timeline");
  const [openCall, setOpenCall] = useState<string | null>(null);
  const [focusNote, setFocusNote] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const reads = useRef(0);
  const read = useCallback(async () => {
    if (!row.candidateId) return;
    const mine = ++reads.current;
    try {
      const out = LIVE ? await candidateOutreach(row.candidateId) : fixtureCandidate(row.candidateId);
      if (mine !== reads.current) return;
      if (!out) { setPhase("failed"); return; }
      setData(out);
      setPhase("ready");
    } catch {
      if (mine === reads.current) setPhase((p) => (p === "ready" && data ? p : "failed"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.candidateId]);
  // Another person (or another number) is a new sheet, in the same panel: what was open does not carry over.
  const who = row.candidateId ?? row.id;
  useEffect(() => {
    setData(null);
    setPhase(row.candidateId ? "loading" : "ready");
    setTab("timeline");
    setOpenCall(null);
    void read();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, who]);

  // Everything of theirs, newest first; a person with no directory entry (a number) is the one call.
  const lone = useMemo<TimelineItem[]>(
    () => (!row.candidateId && row.channel === "call" ? [{ kind: "call", id: row.id, at: row.at, call: callRowFromActivity(row) }] : []),
    [row],
  );
  const all = data?.items ?? lone;
  const shown = useMemo(() => itemsOf(all, tab), [all, tab]);
  const counts = {
    email: data?.counts.email ?? all.filter((i) => i.kind === "email").length,
    whatsapp: data?.counts.whatsapp ?? 0,
    call: data?.counts.call ?? all.filter(isCall).length,
  };
  const tabCount = (t: SheetTab): number | null => (t === "timeline" ? null : counts[t]);
  const calls = useMemo(() => all.filter(isCall), [all]);
  const emails = useMemo(() => all.filter((i): i is EmailItem => i.kind === "email" && i.direction === "out"), [all]);

  const name = data?.candidate.name ?? row.candidateName ?? row.phone ?? "Unknown number";
  const title = data?.candidate.title ?? row.candidateTitle;
  const company = data?.candidate.company ?? row.candidateCompany;
  const sub = [title, company].filter(Boolean).join(" at ");
  const campaignNames = data?.campaigns.length
    ? data.campaigns.map((c) => c.name)
    : row.campaignName ? [row.campaignName] : [];
  const whatsappConnected = data?.whatsapp.connected === true;

  const act = async (id: string, run: () => Promise<unknown>, said: string) => {
    setBusy(id);
    try {
      if (LIVE) await run();
      invalidateViews(["boards", "campaigns", "week"]);
      await read();
      onChanged();
      toast(said);
    } catch (err) {
      toast(messageOf(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const lastOut = emails[0];
  const followUp = () => {
    if (!onAgent) return;
    onAgent(followUpPrompt({
      name,
      campaign: campaignNames[0] ?? null,
      lastSubject: lastOut?.subject ?? null,
      replied: all.some((i) => i.kind === "email" && i.direction === "in"),
    }));
  };
  const logNote = () => {
    const latest = calls[0];
    if (!latest) return;
    setTab((t) => (t === "email" || t === "whatsapp" ? "call" : t));
    setOpenCall(latest.call.id);
    setFocusNote((n) => n + 1);
  };

  const canFollowUp = Boolean(onAgent) && Boolean(row.candidateId) && (tab === "timeline" || tab === "email");
  const canNote = calls.length > 0 && (tab === "timeline" || tab === "call");
  const footer = (
    <footer className="ko-compose" aria-label="What you can do from here">
      {tab === "whatsapp" ? (
        <div className="ko-compose-row">
          <button type="button" className="kl-btn" disabled aria-describedby="ko-wa-why">Send a message</button>
          <p id="ko-wa-why" className="t-body-sm kl-quiet">{whatsappConnected ? "Sending from here is coming." : WHATSAPP_REASON}</p>
        </div>
      ) : canFollowUp || canNote ? (
        <div className="ko-compose-row">
          {canFollowUp && <button type="button" className="kl-btn" onClick={followUp}>Draft a follow-up</button>}
          {canNote && <button type="button" className="kl-btn" onClick={logNote}>Log a call note</button>}
        </div>
      ) : (
        <p className="t-body-sm kl-quiet">{tab === "call" ? "Calls placed from SuperHyre are logged here." : "Nothing to do here yet."}</p>
      )}
    </footer>
  );

  return (
    <SheetFrame
      label={`Outreach with ${name}`}
      backLabel="Back to outreach"
      closeLabel="Close the outreach"
      onClose={onClose}
      footer={footer}
    >
      {(leaveTo) => (
        <>
          <header className="kl-who-head">
            <h2 className="kl-title">{name}</h2>
            {sub && <p className="t-body kl-quiet kl-ell">{sub}</p>}
            {campaignNames.length > 0 && <p className="t-body-sm kl-quiet kl-ell">{campaignNames.join(", ")}</p>}
            {row.candidateId && (
              <a
                className="kl-link"
                href={candidateHref(row.candidateId)}
                onClick={(e) => {
                  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  leaveTo(candidateHref(row.candidateId!));
                }}
              >
                Open candidate <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            )}
          </header>

          <div className="ko-tabs" role="tablist" aria-label="What to show">
            {SHEET_TABS.map((t) => {
              const n = tabCount(t.value);
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  id={`ko-tab-${t.value}`}
                  aria-selected={tab === t.value}
                  aria-controls="ko-panel"
                  tabIndex={tab === t.value ? 0 : -1}
                  className={tab === t.value ? "is-on" : ""}
                  onClick={() => setTab(t.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    e.preventDefault();
                    const at = SHEET_TABS.findIndex((x) => x.value === tab);
                    const next = SHEET_TABS[(at + (e.key === "ArrowRight" ? 1 : SHEET_TABS.length - 1)) % SHEET_TABS.length];
                    if (next) { setTab(next.value); document.getElementById(`ko-tab-${next.value}`)?.focus(); }
                  }}
                >
                  {t.label}{n !== null && n > 0 ? <span className="ko-tab-n kl-num">{n}</span> : null}
                </button>
              );
            })}
          </div>

          <div id="ko-panel" role="tabpanel" aria-labelledby={`ko-tab-${tab}`} className="ko-panel">
            {phase === "loading" && <div className="kl-wait is-small" aria-busy="true"><Loader size="md" label="Opening their outreach" block /></div>}
            {phase === "failed" && (
              <div className="ko-failed" role="alert">
                <p className="t-body">Their outreach couldn't be opened.</p>
                <button type="button" className="kl-btn" onClick={() => { setPhase("loading"); void read(); }}>Try again</button>
              </div>
            )}

            {phase === "ready" && tab === "whatsapp" && shown.length === 0 && (
              <GhostChart kind="table" compact title="WhatsApp" line={WHATSAPP_WAITING} />
            )}
            {phase === "ready" && tab !== "whatsapp" && shown.length === 0 && (
              <p className="t-body kl-quiet kl-pad">
                {tab === "email" ? "No emails to or from them yet." : tab === "call" ? "No calls with them yet." : "Nothing with them yet."}
              </p>
            )}
            {phase === "ready" && shown.length > 0 && (
              <OutreachThread
                items={shown}
                busy={busy}
                openCall={openCall}
                focusNote={focusNote}
                onApprove={(id) => void act(id, () => approve([id]), "Approved. It will go out at its time.")}
                onCancel={(id) => void act(id, () => cancel(id), "Cancelled. It is a draft again.")}
                onToggleCall={(id) => setOpenCall((cur) => (cur === id ? null : id))}
              />
            )}
          </div>
        </>
      )}
    </SheetFrame>
  );
}
