import { Check } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectProvider } from "../agentEvents";
import { gmailStateOf, identityApi, orgConnectionOf, readable } from "../api/identity";
import { useCan } from "../can";
import { ConnectorLogo } from "../ConnectorLogo";
import { Loader } from "../components/Loader";
import { applyOrgConnection, connectionsNow, reloadConnections, useConnections } from "../connectionsStore";
import type { ConnectionsState } from "../connectionsStore";
import { TOKEN_HELP, tokenProblem } from "../connectFlow";
import { sendMessage } from "../liveChat";

/**
 * A connection the agent needs and the person has not made, where the need is. One button opens the sign-in in a
 * popup (or a new tab where the browser would block it), the card watches for the connection and flips to
 * Connected, and offers to carry on: the request that was waiting is sent again through the chat.
 *
 * It never sends anyone to Settings to do it. Slack and Notion belong to the organisation, so someone who is not
 * an admin is told to ask one, calmly, and offered nothing that would fail. Where the server has no sign-in for
 * Slack or Notion (`mode: "token"`), the card carries the field for the token itself, sends it to the same
 * endpoint Settings uses, and flips to Connected.
 */

const NAME: Readonly<Record<ConnectProvider, string>> = { google: "Google", slack: "Slack", notion: "Notion" };
/** What the connection is for, in the words a person would use. */
const FOR: Readonly<Record<ConnectProvider, string>> = {
  google: "Gmail, so emails go out from your own address",
  slack: "Slack, so messages and digests can be posted",
  notion: "Notion, so notes can be filed",
};

const POLL_MS = 2500;
const GIVE_UP_MS = 5 * 60_000;

/** Whether the provider is connected, as the store knows it now. */
export function isConnected(c: Pick<ConnectionsState, "google" | "slack" | "notion">, provider: ConnectProvider): boolean {
  if (provider === "google") return !!c.google && gmailStateOf(c.google) === "connected";
  return c[provider]?.status === "connected";
}

type Phase = "idle" | "opening" | "waiting" | "failed";

export function ConnectCard({
  provider, url = null, mode = null, field = null, reason = null, retryText = null, turnSaid = null, compact = false,
}: {
  provider: ConnectProvider;
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
  /** Inside another card (an approval), without its own frame. */
  compact?: boolean;
}): JSX.Element {
  const known = useConnections();
  const mayConnect = useCan("connections.manage") || provider === "google";
  const connected = known.status === "ready" && isConnected(known, provider);
  const [phase, setPhase] = useState<Phase>("idle");
  /* Whether it flipped while this card was on screen: a card for an old turn that finds the connection already
     there says Connected and offers nothing to repeat. */
  const [flipped, setFlipped] = useState(false);
  const [sent, setSent] = useState(false);
  const popup = useRef<Window | null>(null);
  const timer = useRef<number | null>(null);
  const name = NAME[provider];
  /* A token is pasted, sent once and the field emptied at the same moment; nothing here keeps it. */
  const tokenField = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const byToken = provider !== "google" && (mode === "token" || (mode === null && !url && !known.oauth[provider]));

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (phase === "waiting" && connected) {
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
        if (isConnected(now, provider)) return;
        const closed = popup.current?.closed === true;
        if (closed || Date.now() - began > GIVE_UP_MS) {
          stop();
          setPhase("idle");
        }
      });
    }, POLL_MS);
  }, [provider, stop]);

  const sendToken = async () => {
    if (provider === "google" || checking) return;
    const token = tokenField.current?.value ?? "";
    if (tokenField.current) tokenField.current.value = "";
    const missing = tokenProblem(provider, token);
    if (missing) { setProblem(missing); return; }
    setChecking(true);
    setProblem(null);
    try {
      const result = await identityApi.connectWithToken(provider, token.trim());
      const made = orgConnectionOf(result, provider);
      if (made) applyOrgConnection(provider, made);
      else await reloadConnections();
      setFlipped(true);
    } catch (err) {
      setProblem(readable(err));
    }
    setChecking(false);
  };

  const connect = async () => {
    if (phase === "opening" || phase === "waiting") return;
    setPhase("opening");
    /* Opened before anything is awaited, or the browser takes it for a pop-up nobody asked for. */
    const win = window.open("", "sh-connect", "popup,width=520,height=720");
    popup.current = win;
    try {
      const link = await linkFor(provider, url, known);
      if (win && !win.closed) win.location.href = link;
      else window.open(link, "_blank", "noopener");
      setPhase("waiting");
      watch();
    } catch {
      try { win?.close(); } catch { /* already gone */ }
      setPhase("failed");
    }
  };

  const wait = phase === "opening" || phase === "waiting";
  const said = retryText ?? turnSaid;

  if (connected) {
    return (
      <section className={`cc is-done${compact ? " is-compact" : ""}`} aria-label={`${name} connected`}>
        <div className="cc-head">
          <Mark provider={provider} />
          <p className="cc-title"><Check size={13} weight="bold" aria-hidden="true" /> {name} is connected</p>
        </div>
        {flipped && said && (
          <div className="cc-acts">
            <button type="button" className="rep-commit" disabled={sent} onClick={() => { setSent(true); sendMessage(said); }}>
              {sent ? "Sent" : "Carry on"}
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={`cc${compact ? " is-compact" : ""}`} aria-label={`Connect ${name}`}>
      <div className="cc-head">
        <Mark provider={provider} />
        <p className="cc-title">{name} isn't connected</p>
      </div>
      <p className="cc-why">{reason ?? `This needs ${FOR[provider]}.`}</p>
      {mayConnect && byToken ? (
        <form className="cc-token" onSubmit={(e) => { e.preventDefault(); void sendToken(); }} noValidate>
          <label className="cc-field">
            <span className="cc-field-l">{field?.label ?? TOKEN_HELP[provider].label}</span>
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
              placeholder={TOKEN_HELP[provider].placeholder}
              aria-invalid={problem !== null}
            />
          </label>
          <p className="cc-why">
            {field?.help ?? TOKEN_HELP[provider].steps}{" "}
            <a className="lt-link" href={TOKEN_HELP[provider].link.href} target="_blank" rel="noreferrer">{TOKEN_HELP[provider].link.text}</a>
          </p>
          <div className="cc-acts">
            <button type="submit" className="rep-commit" disabled={checking}>{checking ? "Connecting" : `Connect ${name}`}</button>
            {problem && <span className="lt-note" role="alert">{problem}</span>}
          </div>
        </form>
      ) : mayConnect ? (
        <div className="cc-acts">
          <button type="button" className="rep-commit" disabled={wait} onClick={() => void connect()}>
            {wait ? "Waiting for you" : `Connect ${name}`}
          </button>
          {wait && <span className="cc-wait" role="status"><Loader size="sm" /> Finish signing in, then come back here.</span>}
          {phase === "failed" && <span className="lt-note" role="alert">Couldn't open {name}. Try again.</span>}
        </div>
      ) : (
        <p className="cc-why">Ask an admin to connect {name}. It belongs to the organisation.</p>
      )}
    </section>
  );
}

function Mark({ provider }: { provider: ConnectProvider }): JSX.Element {
  return <ConnectorLogo id={provider} tile decorative />;
}

/**
 * The page to open: the link the server made, else one asked for now. A provider that has no sign-in of its own
 * (a token is pasted) goes to the connections page, which this window opens in its own tab.
 */
export async function linkFor(provider: ConnectProvider, url: string | null, known: Pick<ConnectionsState, "oauth">): Promise<string> {
  if (url) return url.startsWith("#") ? `${here()}${url}` : url;
  if (provider === "google") return (await identityApi.startGoogle(["gmail", "sheets"])).url;
  if (known.oauth[provider]) return (await identityApi.startProvider(provider)).url;
  return `${here()}#/settings/connections`;
}

/** This console's own address, without a hash, for a link into one of its pages. */
function here(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}
