import { Check } from "@phosphor-icons/react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ConnectProvider } from "../agentEvents";
import { TurnContext, saveMade, savedMade } from "../agentThread";
import { gmailStateOf, identityApi, orgConnectionOf, readable } from "../api/identity";
import { useCan } from "../can";
import { ConnectorLogo } from "../ConnectorLogo";
import { Loader } from "../components/Loader";
import { applyOrgConnection, connectionsNow, reloadConnections, useConnections } from "../connectionsStore";
import type { ConnectionsState } from "../connectionsStore";
import { addAccessLabel, askedFor, connectState, connectTitle, PROVIDER_LABEL, schedulingState, TESTS, TOKEN_WHERE, tokenButton } from "../connectStates";
import type { SchedulingProduct } from "../connectStates";
import { tokenProblem } from "../connectFlow";
import { watchOpened } from "../connectOpen";
import { rememberReturn } from "../connectReturn";
import { useSlowWhile } from "../slowState";
import { sendAction } from "../liveChat";

/**
 * A connection the agent needs and the person has not made, where the need is. One button opens the sign-in in a
 * popup (or a new tab where the browser would block it), the card watches for the connection and flips to
 * "Connected as ...", and, when something was waiting on it, the request that was held up goes through the
 * chat again by itself, once.
 *
 * It never sends anyone to Settings to do it. Slack and Notion belong to the organisation, so someone who is not
 * an admin is told to ask one, calmly, and offered nothing that would fail. Where the server has no sign-in for
 * Slack or Notion (`mode: "token"`), the card carries the field for the token itself, with one line on where to
 * find it, sends it to the same endpoint Settings uses, and flips to Connected.
 *
 * Every state is said: checking, not connected, needs reconnecting, connecting, connected, and what went wrong
 * with the way to try again. All of it is read from the shared connections store, so a card that comes back
 * (the chat was left and reopened, or the sign-in finished in another window) shows what is true now.
 */

/** What the connection is for, in the words a person would use. */
const FOR: Readonly<Record<ConnectProvider, string>> = {
  google: "Gmail, so emails go out from your own address",
  slack: "Slack, so messages and digests can be posted",
  notion: "Notion, so notes can be filed",
};

/** A Google connection asked for to schedule: its next step is not an email test. */
const SCHEDULING_REASON = /\b(?:calendar|tasks?|meetings?|reminders?|invit\w*)\b/i;

const POLL_MS = 2500;
const GIVE_UP_MS = 5 * 60_000;
/** A connection begun here is carried on only if it is made within this long: an old request is not sent again days later. */
const FRESH_MS = 15 * 60_000;
export const STARTED = "started:";
export const startedRecently = (v: string | null): boolean =>
  v !== null && v.startsWith(STARTED) && Date.now() - Number(v.slice(STARTED.length)) < FRESH_MS;

/** Whether the server has just asked for this connection in a live turn: what this window last knew of it is then read again, and not trusted before. */
export const askedNow = (c: { compact: boolean; waiting: boolean; restored: boolean }): boolean => !c.compact && c.waiting && !c.restored;

/** Whether the provider is connected, as the store knows it now. */
export function isConnected(c: Pick<ConnectionsState, "google" | "slack" | "notion">, provider: ConnectProvider): boolean {
  if (provider === "google") return !!c.google && gmailStateOf(c.google) === "connected";
  return c[provider]?.status === "connected";
}

type Phase = "idle" | "opening" | "waiting" | "stopped" | "failed";

export function ConnectCard({
  provider, url = null, mode = null, field = null, reason = null, retryText = null, turnSaid = null, waiting = true,
  approvalOpen = false, compact = false, quiet = false, products = [], label: named = null,
}: {
  provider: ConnectProvider;
  /** Google only: the parts the sign-in is for (Calendar and Tasks to schedule). Left out, it is Gmail's. */
  products?: readonly string[];
  /** The name the server put on the card when it is not Gmail's ("Google Calendar"). */
  label?: string | null;
  /** The authorise link the server made for this person, when it made one. */
  url?: string | null;
  /** `token`: no sign-in to open, the card asks for the token. Absent from an older server (then inferred). */
  mode?: "oauth" | "token" | null;
  /** The token field's label and help, as the server words them. */
  field?: { label: string; help: string } | null;
  /** Why it is needed here, in this run's terms. */
  reason?: string | null;
  /** What to send again once connected; the turn's own message when absent. */
  retryText?: string | null;
  turnSaid?: string | null;
  /** Something the person asked for is held up on this connection (false when it was asked for on its own). */
  waiting?: boolean;
  /** An approval of this turn is still waiting for a yes: it carries on by itself once this is connected. */
  approvalOpen?: boolean;
  /** Inside another card (an approval), without its own frame. */
  compact?: boolean;
  /** Inside a card that already says why: only the way to mend it, as a secondary button (the card's own button is the primary). */
  quiet?: boolean;
}): JSX.Element | null {
  const known = useConnections();
  const mayConnect = useCan("connections.manage") || provider === "google";
  /* A card for Calendar or Tasks asks to add that access to the sign-in; a person signed in to Gmail still needs it. */
  const scheduling: SchedulingProduct[] = provider === "google"
    ? products.filter((p): p is SchedulingProduct => p === "calendar" || p === "tasks")
    : [];
  const asksForAccess = scheduling.length > 0 && scheduling.length === products.length;
  const turn = useContext(TurnContext);
  /* A card the server has just asked for says what the server found, not what this window last knew: the connections are
     read again at once, and until that answer is in, a connection this window still has as on is not trusted. */
  const asked = askedNow({ compact, waiting, restored: turn?.restored === true });
  const [shownAt] = useState(() => Date.now());
  useEffect(() => { if (asked) void reloadConnections(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const read = asksForAccess ? schedulingState(known, scheduling) : connectState(provider, known);
  const state = asked && known.at <= shownAt ? askedFor(provider, read, asksForAccess) : read;
  const connected = state.s === "connected";
  const [phase, setPhase] = useState<Phase>("idle");
  /* Whether it flipped while this card was on screen: a card for an old turn that finds the connection already
     there says "Connected as ..." and offers nothing to repeat. */
  const [flipped, setFlipped] = useState(false);
  const popup = useRef<Window | null>(null);
  const timer = useRef<number | null>(null);
  const name = asksForAccess ? (named ?? "Google Calendar") : PROVIDER_LABEL[provider];
  /* A token is pasted and sent; the field keeps what was typed while the server answers and when it refuses it
     (the person fixes a letter instead of pasting it all again), and is emptied once the connection is made. */
  const tokenField = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const byToken = provider !== "google" && (mode === "token" || (mode === null && !url && !known.oauth[provider]));

  /* What this card has done in this chat, kept with the turn: a connection begun here, and the request carried
     on once it was made, so leaving the chat and coming back neither loses the first nor repeats the second. */
  const memory = turn ? `${turn.id}#connect:${provider}` : null;
  const began = useRef(memory !== null && startedRecently(savedMade(memory)));
  const [carried, setCarried] = useState(() => memory !== null && savedMade(memory) === "carried");
  const [tested, setTested] = useState<ReadonlySet<string>>(() => new Set());

  /* Where the sign-in goes, and the watch on whether a window really opened for it. */
  const [link, setLink] = useState<string | null>(null);
  const opened = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    opened.current?.();
    opened.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  /* A wait for a sign-in has limits like every other: after 8 seconds it says how to open it by hand. */
  const slow = useSlowWhile(phase === "opening" || phase === "waiting", { soft: 3_000, hard: 8_000 });

  useEffect(() => {
    if ((phase === "waiting" || phase === "opening") && connected) {
      stop();
      setFlipped(true);
      setPhase("idle");
      try { popup.current?.close(); } catch { /* the window is not ours to close any more */ }
    }
  }, [phase, connected, stop]);

  const watch = useCallback(() => {
    stop();
    const began = Date.now();
    timer.current = window.setInterval(() => {
      void reloadConnections().then(() => {
        const now = connectionsNow();
        if (asksForAccess ? schedulingState(now, scheduling).s === "connected" : isConnected(now, provider)) return;
        const closed = popup.current?.closed === true;
        if (closed || Date.now() - began > GIVE_UP_MS) {
          stop();
          setPhase("stopped");
        }
      });
    }, POLL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, stop, asksForAccess]);

  const said = retryText ?? turnSaid;
  /* Something held up on this, nothing else is carrying it on (an approval does that itself), and it has not
     been carried on already. */
  const mayCarryOn = !compact && waiting && !!said && !approvalOpen && !carried;

  const carryOn = useCallback(() => {
    if (!said) return;
    setCarried(true);
    if (memory) saveMade(memory, "carried");
    sendAction(said, "Carry on");
  }, [said, memory]);

  /* The connection came about through this card (here, or before the chat was left): the request goes on. */
  const carriedOnce = useRef(false);
  useEffect(() => {
    if (!connected || compact || carriedOnce.current) return;
    if (!(flipped || began.current)) return;
    carriedOnce.current = true;
    if (mayCarryOn) carryOn();
    else if (memory && (savedMade(memory) ?? "").startsWith(STARTED)) saveMade(memory, "carried");
  }, [connected, compact, flipped, mayCarryOn, carryOn, memory]);

  const sendToken = async () => {
    if (provider === "google" || checking) return;
    const token = tokenField.current?.value ?? "";
    const missing = tokenProblem(provider, token);
    if (missing) { setProblem(missing); return; }
    setChecking(true);
    setProblem(null);
    try {
      const result = await identityApi.connectWithToken(provider, token.trim());
      const made = orgConnectionOf(result, provider);
      if (made) applyOrgConnection(provider, made);
      else await reloadConnections();
      if (tokenField.current) tokenField.current.value = "";
      setFlipped(true);
    } catch (err) {
      setProblem(readable(err));
    }
    setChecking(false);
  };

  /* Signs in in this tab, and remembers the page and chat to come back to (Settings is not where they were). */
  const signInHere = (href: string) => {
    rememberReturn();
    window.location.assign(href);
  };

  const connect = async () => {
    if (phase === "opening" || phase === "waiting") return;
    setPhase("opening");
    setProblem(null);
    /* Opened before anything is awaited, or the browser takes it for a pop-up nobody asked for. */
    const win = window.open("", "sh-connect", "popup,width=520,height=720");
    popup.current = win;
    if (memory) saveMade(memory, `${STARTED}${Date.now()}`);
    began.current = true;
    try {
      const href = await linkFor(provider, url, known, asksForAccess ? scheduling : undefined);
      setLink(href);
      if (win && !win.closed) win.location.href = href;
      else {
        // Named like the pop-up, so that when it is done it can close itself and tell this window.
        const tab = window.open(href, "sh-connect");
        if (tab) {
          popup.current = tab;
        } else {
          // Both were blocked: this window goes, and the person comes back to this page and chat, not to Settings.
          signInHere(href);
          return;
        }
      }
      setPhase("waiting");
      watch();
      // A window object that never showed (blocked, or an environment that opens none) is found out, not waited on.
      opened.current?.();
      opened.current = watchOpened(() => signInHere(href));
    } catch {
      try { win?.close(); } catch { /* already gone */ }
      setPhase("failed");
    }
  };

  const working = phase === "opening" || phase === "waiting";
  /* Nothing has happened for 8 seconds: the way to open it by hand, and to start again. Never a spinner without an end. */
  const stuck = working && slow === "stuck" ? (
    <span className="kc-wait" role="status">
      Didn't open?
      <button type="button" className="rep-act" disabled={!link} onClick={() => link && signInHere(link)}>
        Open {provider === "google" ? "Google" : name} sign-in
      </button>
      <button type="button" className="rep-act" onClick={() => { stop(); try { popup.current?.close(); } catch { /* gone */ } setPhase("idle"); }}>
        Try again
      </button>
    </span>
  ) : null;
  const mark = asksForAccess
    ? <ConnectorLogo id={scheduling.includes("calendar") ? "calendar" : "tasks"} tile={compact ? 28 : 36} decorative />
    : provider === "google"
    ? <ConnectorLogo id="google" wide={compact ? 28 : 32} />
    : <ConnectorLogo id={provider} tile={compact ? 28 : 36} decorative />;
  const title = asksForAccess && state.s === "connected"
    ? `${name} is on`
    : asksForAccess && state.s === "disconnected" ? "Needs your OK in Google" : connectTitle(provider, state);
  const where = TOKEN_WHERE[provider === "slack" ? "slack" : "notion"];
  /* A test is the next step for what the connection was for: an email test after Gmail, not after Calendar or Tasks, and none
     while an approval of this turn waits (its Approve is the next step). */
  const forEmail = provider !== "google" || (!asksForAccess && !(reason && SCHEDULING_REASON.test(reason)));
  const chips = forEmail && !approvalOpen ? TESTS[provider].filter((t) => !tested.has(t.label)) : [];

  /* ── already connected ── */
  if (connected) {
    /* Inside an approval it is only said when it has just happened: the Approve button is the next step. A
       connection that was there all along needs no card in the way. */
    if (compact && !flipped) return null;
    return (
      <section className={`kc is-done${compact ? " is-compact" : ""}`} aria-label={`${name} connected`}>
        {compact ? (
          <p className="kc-done-line" role="status"><Check size={13} weight="bold" aria-hidden="true" />{title}. You can approve now.</p>
        ) : (
          <>
            <div className="kc-head">
              {mark}
              <p className="kc-title" role="status"><Check size={13} weight="bold" aria-hidden="true" /> {title}</p>
            </div>
            {(mayCarryOn || chips.length > 0) && (
              <ul className="oc-next">
                {mayCarryOn && (
                  <li><button type="button" className="rep-commit" onClick={carryOn}>Carry on</button></li>
                )}
                {chips.map((t) => (
                  <li key={t.label}>
                    <button
                      type="button"
                      className="rep-opt"
                      onClick={() => { setTested((s) => new Set(s).add(t.label)); sendAction(t.text, t.label); }}
                    >
                      {t.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    );
  }

  /* ── not yet ── */
  /* Inside an approval, "checking" is not worth a line: the card appears only once it knows there is
     something to connect. */
  if (compact && (state.s === "checking" || state.s === "unknown")) return null;
  const checkingNow = state.s === "checking";
  const lead = state.s === "reconnect" ? state.why : state.s === "unavailable" ? state.why : (reason ?? `This needs ${FOR[provider]}.`);
  const label = asksForAccess && state.s === "disconnected"
    ? addAccessLabel(scheduling)
    : state.s === "reconnect" ? `Reconnect ${name}` : `Connect ${name}`;

  const plain = compact && quiet && !checkingNow && !byToken && mayConnect && state.s !== "unknown" && state.s !== "unavailable";
  if (plain) {
    return (
      <section className="kc is-compact" aria-label={state.s === "reconnect" ? `Reconnect ${name}` : `Connect ${name}`}>
        <div className="kc-acts">
          <button type="button" className="rep-act" disabled={working} onClick={() => void connect()}>
            {working ? "Connecting…" : phase === "stopped" || phase === "failed" ? "Try again" : label}
          </button>
          {working && !stuck && (
            <span className="kc-wait" role="status">
              <Loader size="sm" />
              {phase === "opening" ? `Opening ${name}…` : `Finish signing in to ${name}. This updates by itself.`}
            </span>
          )}
          {stuck}
        </div>
        {phase === "stopped" && <p className="kc-problem" role="status">That window closed before the sign-in finished, so nothing is connected yet.</p>}
        {phase === "failed" && <p className="kc-problem" role="alert">Couldn't open {name} just now. Try again in a moment.</p>}
      </section>
    );
  }
  return (
    <section className={`kc${compact ? " is-compact" : ""}`} aria-label={state.s === "reconnect" ? `Reconnect ${name}` : `Connect ${name}`}>
      <div className="kc-head">
        {mark}
        <p className="kc-title">
          {checkingNow ? <span className="kc-wait" role="status"><Loader size="sm" />{title}</span> : title}
        </p>
      </div>
      {!checkingNow && <p className="kc-why">{lead}</p>}
      {state.s === "checking" || state.s === "unavailable" ? null : state.s === "unknown" ? (
        <div className="kc-acts">
          <button type="button" className="rep-commit" onClick={() => void reloadConnections()}>Try again</button>
        </div>
      ) : !mayConnect ? (
        <p className="kc-why">
          Ask an admin to {state.s === "reconnect" ? "reconnect" : "connect"} {name}. It belongs to the organisation.
        </p>
      ) : byToken ? (
        <form className="kc-token" onSubmit={(e) => { e.preventDefault(); void sendToken(); }} noValidate>
          <label className="kc-field">
            <span className="kc-field-l">{field?.label ?? where.label}</span>
            {/* A password field no manager will offer to remember: the token is a key to the workspace. */}
            <input
              ref={tokenField}
              className="ncx-in"
              type="password"
              name={`${provider}-token`}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={checking}
              placeholder={provider === "slack" ? "xoxb-…" : "ntn_… or secret_…"}
              aria-invalid={problem !== null}
              aria-describedby={`kc-help-${provider}`}
            />
          </label>
          <p className="kc-why" id={`kc-help-${provider}`}>
            {field?.help ?? where.help}
          </p>
          <div className="kc-acts">
            <button type="submit" className="rep-commit" disabled={checking}>{tokenButton(label, checking, problem)}</button>
            {checking && <span className="kc-wait" role="status"><Loader size="sm" /> Checking the token</span>}
          </div>
          {problem && <p className="kc-problem" role="alert">{problem}</p>}
        </form>
      ) : (
        <>
          <div className="kc-acts">
            <button type="button" className="rep-commit" disabled={working} onClick={() => void connect()}>
              {working ? "Connecting…" : phase === "stopped" || phase === "failed" ? "Try again" : label}
            </button>
            {working && !stuck && (
              <span className="kc-wait" role="status">
                <Loader size="sm" />
                {phase === "opening" ? `Opening ${name}…` : `Finish signing in to ${name}. This updates by itself.`}
              </span>
            )}
            {stuck}
          </div>
          {phase === "stopped" && (
            <p className="kc-problem" role="status">
              That window closed before the sign-in finished, so nothing is connected yet. If you are still signing in,
              this updates by itself when you are done. Otherwise, try again.
            </p>
          )}
          {phase === "failed" && (
            <p className="kc-problem" role="alert">Couldn't open {name} just now. Try again in a moment.</p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The page to open: the link the server made, else one asked for now. A provider that has no sign-in of its own
 * (a token is pasted) goes to the connections page, which this window opens in its own tab.
 */
export async function linkFor(
  provider: ConnectProvider,
  url: string | null,
  known: Pick<ConnectionsState, "oauth">,
  /** Google: Calendar and/or Tasks, to add that access to the sign-in. */
  products?: readonly SchedulingProduct[],
): Promise<string> {
  if (url) return url.startsWith("#") ? `${here()}${url}` : url;
  if (provider === "google") return (await identityApi.startGoogle(products?.length ? [...products] : ["gmail", "sheets"])).url;
  if (known.oauth[provider]) return (await identityApi.startProvider(provider)).url;
  return `${here()}#/settings/connections`;
}

/** This console's own address, without a hash, for a link into one of its pages. */
function here(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}
