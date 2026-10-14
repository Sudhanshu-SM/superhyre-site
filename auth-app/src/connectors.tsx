import { ArrowRight, Check } from "@phosphor-icons/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LIVE } from "./api/client";
import { ConnectorLogo } from "./ConnectorLogo";
import { Loader } from "./components/Loader";
import { gmailStateOf, identityApi } from "./api/identity";
import type { OrgConnection } from "./api/identity";
import { CONNECTIONS_HREF } from "./railConfig";
import { useConnections } from "./connectionsStore";
import type { ConnState, ServiceId } from "./moments";
import { INITIAL_CONNECTIONS, SERVICES } from "./moments";
import { useSession } from "./roleStore";
import "./moments.css";

/**
 * Connectors — which services the agent can act through, and the card that
 * connects one without leaving the conversation.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * A run that needs a service never fails for lack of one and never sends the
 * recruiter to a settings page. The connect step appears where the need is,
 * says what it unlocks, takes one click, and the run carries on by itself
 * the moment it lands. Every connect step has a skip, so no run dead-ends.
 *
 * State lives in one provider for the whole page: a service connected from
 * an outreach run is connected for the status card, the scheduler and the
 * rail too, the way a real integration would be.
 *
 * Connected to the API, Gmail is the real Google connection: its state is
 * read on mount, and connecting goes to Google's consent screen (the answer
 * comes back to Settings). Slack and Notion are the organisation's, read from
 * the same place; they are connected by pasting a token in Settings, so their
 * "Connect" leaves for Connections rather than signing in on the spot, and
 * only an admin is offered it. The other services are still simulated.
 */

/** Services that are connected in Settings, not signed in to from the card. */
export const IN_SETTINGS: readonly ServiceId[] = ["slack", "notion"];

type Ctx = {
  state: Readonly<Record<ServiceId, ConnState>>;
  identity: Readonly<Record<ServiceId, string>>;
  connect: (id: ServiceId) => void;
  choose: (id: ServiceId, choice: string) => void;
  /** Whether the person can connect it themselves: Slack and Notion belong to the organisation's admins. */
  mayConnect: (id: ServiceId) => boolean;
  /** Connecting it opens Settings → Connections, which leaves the chat. */
  inSettings: (id: ServiceId) => boolean;
};

/** A Slack or Notion connection as the card's state. */
export function orgState(c: OrgConnection | null): ConnState {
  return !c ? "disconnected" : c.status === "connected" ? "connected" : "expired";
}

const ConnectorsContext = createContext<Ctx | null>(null);

/** How long the simulated sign-in takes. Long enough to read the handshake. */
const SIGN_IN_MS = 1700;

export function ConnectorsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Record<ServiceId, ConnState>>(
    () => (LIVE ? { ...INITIAL_CONNECTIONS, gmail: "disconnected" } : { ...INITIAL_CONNECTIONS }),
  );
  const [identity, setIdentity] = useState<Record<ServiceId, string>>(() => ({
    gmail: SERVICES.gmail.identity,
    outlook: SERVICES.outlook.identity,
    magnifi: SERVICES.magnifi.identity,
    linkedin: SERVICES.linkedin.identity,
    slack: SERVICES.slack.identity,
    notion: SERVICES.notion.identity,
  }));
  const role = useSession().role;
  const known = useConnections();
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  /* What is really connected, from the one store the rail and Settings share. Until it has
     answered (or if it never does) the cards keep offering to connect. */
  useEffect(() => {
    if (!LIVE) return;
    const { google, slack, notion } = known;
    if (google) {
      setState((s) => (s.gmail === "connecting" ? s : { ...s, gmail: gmailStateOf(google) }));
      if (google.accountEmail) setIdentity((i) => ({ ...i, gmail: google.accountEmail ?? i.gmail }));
    }
    if (known.status === "ready") {
      setState((s) => ({ ...s, slack: orgState(slack), notion: orgState(notion) }));
      setIdentity((i) => ({
        ...i,
        slack: slack?.workspaceName ?? slack?.accountName ?? i.slack,
        notion: notion?.workspaceName ?? notion?.accountName ?? i.notion,
      }));
    }
  }, [known]);

  const mayConnect = useCallback(
    (id: ServiceId) => !(LIVE && IN_SETTINGS.includes(id)) || role === "admin",
    [role],
  );
  const inSettings = useCallback((id: ServiceId) => LIVE && IN_SETTINGS.includes(id), []);

  const connect = useCallback((id: ServiceId) => {
    if (LIVE && IN_SETTINGS.includes(id)) {
      /* A token has to be pasted, which happens on the Connections page. The chat is
         kept (it is reopened where it stopped) so coming back picks up the conversation. */
      window.location.hash = CONNECTIONS_HREF;
      return;
    }
    if (LIVE && id === "gmail") {
      setState((s) => ({ ...s, gmail: "connecting" }));
      identityApi.startGoogle(["gmail", "sheets"])
        .then(({ url }) => window.location.assign(url))
        .catch(() => setState((s) => ({ ...s, gmail: "failed" })));
      return;
    }
    setState((s) => ({ ...s, [id]: "connecting" }));
    timers.current.push(window.setTimeout(() => {
      setState((s) => ({ ...s, [id]: SERVICES[id].choices ? "choosing" : "connected" }));
    }, SIGN_IN_MS));
  }, []);

  const choose = useCallback((id: ServiceId, choice: string) => {
    setIdentity((i) => ({ ...i, [id]: choice }));
    setState((s) => ({ ...s, [id]: "connected" }));
  }, []);

  const value = useMemo(
    () => ({ state, identity, connect, choose, mayConnect, inSettings }),
    [state, identity, connect, choose, mayConnect, inSettings],
  );
  return <ConnectorsContext.Provider value={value}>{children}</ConnectorsContext.Provider>;
}

export function useConnectors(): Ctx {
  const ctx = useContext(ConnectorsContext);
  if (!ctx) throw new Error("useConnectors needs a ConnectorsProvider above it");
  return ctx;
}

/* ── marks ───────────────────────────────────────────────────────────────── */

export function ServiceMark({ id, size = 22 }: { id: ServiceId; size?: number }) {
  /* Gmail, Slack and Notion have their own marks; the rest are drawn as the prototype always drew them. */
  if (id === "gmail" || id === "slack" || id === "notion") return <ConnectorLogo id={id} size={size} decorative />;
  const s = SERVICES[id];
  return (
    <span
      className="cn-mark"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.46),
        background: s.fill, color: s.ink,
        borderColor: s.fill === "#ffffff" ? "#f1d4d0" : s.fill,
      }}
      aria-hidden="true"
    >
      {s.mark}
    </span>
  );
}

/** The SuperHyre mark, for the handshake. */
function HouseMark({ size = 22 }: { size?: number }) {
  return (
    <span className="cn-mark is-house" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 34 35" width={size * 0.62} height={size * 0.62}>
        <path
          d="M16 .5c0 2.3.7 4.4 2 6.2 2 2.7 5 4.3 8.1 5.2 2.1.6 4.3.8 6.5.8v3.3c-2.2 0-4.3.5-6.3 1.5C20.5 20.4 16 26.7 15.9 33.5L13 33l-1-4.6c-.7-2.5-1.6-4.5-4.2-5.4-.9-.3-1.7-.4-2.7-.5l-3.8-.1-.7-3.4c1.8-.2 3.5-.6 5.2-1.3 7-3 7.4-9.9 7.4-16.9L16 .5"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

/* ── the connect card ────────────────────────────────────────────────────── */

export type Need = {
  service: ServiceId;
  /** What connecting unlocks, in this run's terms. */
  why: string;
  /** The skip control's label: "Skip WhatsApp, use email first". */
  skipLabel: string;
  /** What happened instead, once skipped: "Email leads for those three." */
  skippedNote: string;
};

/**
 * One card for every service a run is waiting on.
 *
 * Each row moves through its own states — not connected or signed out,
 * signing in (the handshake), a choice where the service needs one, then
 * connected — and collapses to a single line once it is done. A skipped row
 * says what happens instead and keeps a way back.
 *
 * `onSettled` fires once, when every row is connected or skipped, which is
 * the parent's cue to carry on. It does not fire again if a skipped service
 * is connected later; the parent reads live state for that.
 */
export function ConnectGate({
  needs, skipped, onSkip, onUnskip, onSettled, title,
}: {
  needs: readonly Need[];
  skipped: readonly ServiceId[];
  onSkip: (id: ServiceId) => void;
  onUnskip?: (id: ServiceId) => void;
  onSettled: () => void;
  title?: string;
}) {
  const { state } = useConnectors();
  const settled = needs.every((n) => state[n.service] === "connected" || skipped.includes(n.service));
  const fired = useRef(false);

  useEffect(() => {
    if (settled && !fired.current) {
      fired.current = true;
      onSettled();
    }
  }, [settled, onSettled]);

  if (needs.length === 0) return null;

  const pending = needs.filter((n) => state[n.service] !== "connected" && !skipped.includes(n.service)).length;

  return (
    <section className={`cn-gate${settled ? " is-settled" : ""}`} aria-label="Connect services">
      <p className="cn-gate-h">
        {settled
          ? "All set. Carrying on."
          : title ?? `${pending === 1 ? "One service needs" : `${pending} services need`} connecting before I send`}
      </p>
      <ul className="cn-rows">
        {needs.map((n) => (
          <Row
            key={n.service}
            need={n}
            skipped={skipped.includes(n.service)}
            onSkip={() => onSkip(n.service)}
            onUnskip={onUnskip ? () => onUnskip(n.service) : undefined}
          />
        ))}
      </ul>
    </section>
  );
}

function Row({
  need, skipped, onSkip, onUnskip,
}: {
  need: Need;
  skipped: boolean;
  onSkip: () => void;
  onUnskip?: () => void;
}) {
  const { state, identity, connect, choose, mayConnect, inSettings } = useConnectors();
  const svc = SERVICES[need.service];
  const st = state[need.service];
  const [pick, setPick] = useState<string>(svc.choices?.[0]?.id ?? "");

  if (st === "connected") {
    return (
      <li className="cn-row is-done">
        <ServiceMark id={need.service} size={20} />
        <span className="cn-done"><Check size={12} weight="bold" aria-hidden="true" />{svc.name} connected</span>
        <span className="cn-id">{identity[need.service]}</span>
      </li>
    );
  }

  if (skipped) {
    return (
      <li className="cn-row is-skipped">
        <ServiceMark id={need.service} size={20} />
        <span className="cn-skipnote">Skipped {svc.channel}. {need.skippedNote}</span>
        {onUnskip && <button type="button" className="cn-link" onClick={() => { onUnskip(); connect(need.service); }}>Connect anyway</button>}
      </li>
    );
  }

  return (
    <li className={`cn-row is-${st}`}>
      <div className="cn-row-main">
        <div className="cn-shake" aria-hidden="true">
          <HouseMark />
          <span className={`cn-line${st === "connecting" ? " is-going" : ""}`} />
          <ServiceMark id={need.service} />
        </div>
        <div className="cn-copy">
          <p className="cn-name">
            {st === "expired" ? `${svc.name} signed out` : `Connect ${svc.name}`}
            <span className="cn-channel">{svc.channel === svc.name ? "" : ` for ${svc.channel}`}</span>
          </p>
          {st === "connecting" ? (
            <p className="cn-sub"><Loader size="sm" /> {svc.signIn}</p>
          ) : st === "choosing" ? (
            <p className="cn-sub">Signed in. Which number should messages come from?</p>
          ) : (
            <p className="cn-sub">{st === "expired" ? `Signed out${LIVE ? "" : " yesterday"}. ${need.why}` : need.why}</p>
          )}
        </div>
      </div>

      {st === "choosing" && svc.choices ? (
        <div className="cn-choose">
          <div className="cn-choices" role="radiogroup" aria-label={`${svc.name} sending number`}>
            {svc.choices.map((c) => (
              <label key={c.id} className={`cn-choice${pick === c.id ? " is-on" : ""}`}>
                <input type="radio" name={`cn-${need.service}`} value={c.id} checked={pick === c.id} onChange={() => setPick(c.id)} />
                <span className="cn-choice-l">{c.label}</span>
                <span className="cn-choice-h">{c.hint}</span>
              </label>
            ))}
          </div>
          <button type="button" className="src-btn is-primary" onClick={() => choose(need.service, pick)}>
            Use this number<ArrowRight size={13} weight="bold" aria-hidden="true" />
          </button>
        </div>
      ) : st !== "connecting" ? (
        <div className="cn-acts">
          {mayConnect(need.service) ? (
            <button type="button" className="src-btn is-primary" onClick={() => connect(need.service)}>
              {st === "expired" ? `Reconnect ${svc.name}` : `Connect ${svc.name}`}
              {inSettings(need.service) ? " in Settings" : ""}
            </button>
          ) : (
            <span className="cn-skipnote">Ask an admin to {st === "expired" ? "reconnect" : "connect"} {svc.name}.</span>
          )}
          <button type="button" className="cn-link" onClick={onSkip}>{need.skipLabel}</button>
        </div>
      ) : null}
    </li>
  );
}
