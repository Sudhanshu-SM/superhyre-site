import { takeReturn as takeSavedReturn } from "./connectReturn";
import { AddressBook } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  googleReasonText, googleReturnFrom, identityApi, missingProductsText, readable,
} from "./api/identity";
import type { GoogleConnection, GoogleProduct } from "./api/identity";
import { allowanceLine, LOOKUPS_RULE } from "./contactsModel";
import type { ContactsAllowance } from "./contactsModel";
import { fetchContactsAllowance } from "./contactsFetch";
import { connectionsChanged, reloadConnections, useConnections } from "./connectionsStore";
import { closeConnectWindow, isConnectWindow } from "./connectFlow";
import { ConnectorLogo } from "./ConnectorLogo";
import { accessAction, connectionLine, hasProjectTrouble, productRows } from "./googleProducts";
import { GoogleProducts, GoogleProductsGhost } from "./SettingsGoogleProducts";
import { EmptyArt } from "./EmptyArt";
import { Loader } from "./components/Loader";
import { connectionNotice, reconnectLine, signedOutTitle } from "./emptyStates";
import { ErrorState } from "./ErrorStates";
import { integrationsOf } from "./railConfig";
import { ConfirmDialog } from "./RoleBits";
import { LoadFailed } from "./ui";
import { takeProviderReturn } from "./SettingsOrgConnection";

/**
 * Connections: the person's own Google account, for sending from Gmail and
 * exporting to Sheets, and the organisation's Slack and Notion, which the agent
 * posts and writes through once an admin has connected them.
 *
 * Connecting leaves for Google's consent screen. Google's answer comes back
 * here as `#/settings/connections?google=complete&code=…&state=…`, and the
 * connection is only made when this page hands the code to the API as the
 * signed-in user, so a consent link someone else started can't attach this
 * account to them.
 */

const BARE = "#/settings/connections";

/* Google's answer, read from the address once. Held here rather than in
   state because React's development double-mount runs the effect twice and
   the address is already clean the second time; Google accepts a code once. */
type Return = { kind: "complete"; result: Promise<Awaited<ReturnType<typeof identityApi.completeGoogle>>> } | { kind: "error"; text: string };
let pending: Return | null = null;

function takeReturn(): Return | null {
  const back = googleReturnFrom(window.location.hash);
  if (back) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${BARE}`);
    pending = back.kind === "complete"
      ? { kind: "complete", result: identityApi.completeGoogle(back.code, back.state) }
      : { kind: "error", text: googleReasonText(back.reason) };
    const mine = pending;
    window.setTimeout(() => { if (pending === mine) pending = null; }, 0);
  }
  return pending;
}

type Note = { tone: "ok" | "problem"; text: string } | null;

export function SettingsConnections({ canManage = false, onAgent }: {
  canManage?: boolean;
  /** Asks the agent for something, in the chat, at once: the test email and the test message are its cards. */
  onAgent?: (text: string) => void;
}) {
  const [google, setGoogle] = useState<GoogleConnection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const mounted = useRef(true);
  /* Asks for the connections: the person's Google status, and again for the store the cards share. */
  const loadGoogle = useCallback(() => {
    setLoadError(null);
    identityApi.connections()
      .then((c) => {
        if (mounted.current) setGoogle((cur) => cur ?? c.google);
        /* A sign-in that has died in Google is found now, not at the first send that fails (one cheap check). */
        if (c.google.status === "connected") {
          identityApi.checkGoogle().then((checked) => { if (mounted.current) setGoogle(checked.google); void reloadConnections(); }, () => undefined);
        }
      })
      .catch((err: unknown) => { if (mounted.current) setLoadError(readable(err)); });
  }, []);
  const retryLoad = () => { void reloadConnections(); loadGoogle(); };

  useEffect(() => {
    let live = true;
    mounted.current = true;
    const back = takeReturn();
    if (back?.kind === "complete") {
      setBusy(true);
      back.result
        .then((res) => {
          if (!live) return;
          setGoogle(res.google);
          /* Calendar and Tasks can be allowed in Google and still be switched off for the Google project: ask once, so the
             card says so now rather than at the first meeting. */
          if (res.google.products.some((p) => p === "calendar" || p === "tasks")) {
            identityApi.checkGoogle().then((c) => { if (live) setGoogle(c.google); }, () => undefined);
          }
          // The chat that opened this window hears it at once, and so does every other card.
          void connectionsChanged();
          const missing = missingProductsText(res.missing);
          const email = res.google.accountEmail;
          const done = email ? `Connected as ${email}.` : "Google is connected.";
          setNote(missing ? { tone: "problem", text: missing } : { tone: "ok", text: isConnectWindow() ? `${done} You can go back to your chat.` : done });
          if (!missing && isConnectWindow()) closeConnectWindow();
          // Connected from the chat in this very window: back to the page and chat they left from, which reads it again.
          const from = missing || isConnectWindow() ? null : takeSavedReturn();
          if (from) window.location.hash = from;
        })
        .catch((err: unknown) => {
          if (live) setNote({ tone: "problem", text: readable(err) });
        })
        .finally(() => { if (live) setBusy(false); });
    } else if (back?.kind === "error") {
      setNote({ tone: "problem", text: back.text });
    }

    /* Slack's and Notion's sign-in comes back the same way, to the same page. */
    const org = takeProviderReturn();
    if (org?.kind === "complete") {
      setBusy(true);
      org.result
        .then(() => connectionsChanged())
        .then(() => {
          if (!live) return;
          const done = `${org.provider === "slack" ? "Slack" : "Notion"} is connected.`;
          setNote({ tone: "ok", text: isConnectWindow() ? `${done} You can go back to your chat.` : done });
          if (isConnectWindow()) closeConnectWindow();
        })
        .catch((err: unknown) => { if (live) setNote({ tone: "problem", text: readable(err) }); })
        .finally(() => { if (live) setBusy(false); });
    } else if (org?.kind === "error") {
      setNote({ tone: "problem", text: org.text });
    }

    loadGoogle();
    return () => { live = false; mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Asks Google for these parts: all of them for a first sign-in, and only the missing ones to add access. */
  const connect = async (products: GoogleProduct[]) => {
    setBusy(true);
    setNote(null);
    try {
      const { url } = await identityApi.startGoogle(products);
      window.location.assign(url);
    } catch (err) {
      setNote({ tone: "problem", text: readable(err) });
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!google) return;
    const before = google;
    setConfirming(false);
    setNote(null);
    setGoogle({ ...google, status: "disconnected", accountEmail: null, products: [], scopes: [], connectedAt: null });
    try {
      await identityApi.disconnectGoogle();
      void connectionsChanged();
    } catch (err) {
      setGoogle(before);
      setNote({ tone: "problem", text: readable(err) });
    }
  };

  const conns = useConnections();
  /* A line saying Google connected is about a moment that has passed once Slack or Notion changes under
     it: it goes, rather than sitting above a different change. (Only that one: Slack's own line, set
     as it lands, is the news.) */
  const orgSeen = useRef<string | null>(null);
  const orgNow = `${conns.slack?.status ?? ""}|${conns.notion?.status ?? ""}`;
  useEffect(() => {
    if (conns.status !== "ready") return;
    if (orgSeen.current !== null && orgSeen.current !== orgNow) setNote((n) => (n?.tone === "ok" && /^(Google|Connected as)\b/.test(n.text) ? null : n));
    orgSeen.current = orgNow;
  }, [conns.status, orgNow]);
  /* Read from the shared store once it has answered, so this page says what the Agent's panel says. */
  const notice = conns.status === "ready" ? connectionNotice(integrationsOf(conns)) : null;
  const connected = google?.status === "connected";
  /* The parts of Google and the one button that grows the sign-in: only what is missing is asked for. */
  const rows = google ? productRows(google) : [];
  const action = google?.available ? accessAction(google) : null;
  const [rechecking, setRechecking] = useState(false);
  const checkAgain = () => {
    setRechecking(true);
    identityApi.checkGoogle(true)
      .then((c) => { if (mounted.current) setGoogle(c.google); void reloadConnections(); })
      .catch((err: unknown) => { if (mounted.current) setNote({ tone: "problem", text: readable(err) }); })
      .finally(() => { if (mounted.current) setRechecking(false); });
  };

  return (
    <div className="st-sec">
      <h2 className="st-h t-title-sm">Connections</h2>
      {note && (
        <p className={note.tone === "ok" ? "st-ok t-body-sm" : "st-err t-body-sm"} role={note.tone === "ok" ? "status" : "alert"}>
          {note.text}
        </p>
      )}

      {notice?.kind === "signed-out" && (
        <ErrorState kind="connector" title={signedOutTitle(notice.names)} text={reconnectLine(notice.names)} />
      )}
      {notice?.kind === "none" && (
        <div className="ea-note st-none">
          <EmptyArt name="empty-integrations" size={160} />
          <p className="st-quiet t-body">Nothing is connected yet. Connect Google to send from your own address.</p>
        </div>
      )}

      {!google && loadError !== null ? (
        /* One failure for the whole page: Google, Slack and Notion all come from the one answer. */
        <LoadFailed what="Your connections" onRetry={retryLoad} />
      ) : (
      <>
      <div className="st-item st-conn">
        <span className="st-lead st-lead-wide">
          {/* The wordmark is the name: "Google" is not written a second time beside it. */}
          <ConnectorLogo id="google" wide={40} />
          <span className="st-who">
            <span className="st-mail t-body-sm">
              {google ? connectionLine(google) : "Checking"}
              {onAgent && connected && google?.products.includes("gmail") && (
                <> <button type="button" className="st-link" onClick={() => onAgent("Send me a test email")}>Send me a test email</button></>
              )}
            </span>
          </span>
        </span>
        {google?.available && (
          <span className="st-acts">
            {action && (
              <button type="button" className="ncx-btn is-sm is-primary" disabled={busy} onClick={() => void connect(action.products)}>
                {busy ? <><Loader size="sm" tone="inherit" />Opening Google</> : action.label}
              </button>
            )}
            {google.status !== "disconnected" && (
              <button type="button" className="ncx-btn is-sm" disabled={busy} onClick={() => setConfirming(true)}>Disconnect</button>
            )}
          </span>
        )}
      </div>
      {google ? (
        google.available && (
          <GoogleProducts rows={rows} checking={rechecking} onCheck={hasProjectTrouble(rows) ? checkAgain : null} />
        )
      ) : (
        <GoogleProductsGhost />
      )}

      <ComingSoonConnection id="slack" name="Slack" />
      <ComingSoonConnection id="notion" name="Notion" />
      {/* Owners and admins of an organisation, and anyone in Personal (canManage): the lookups spend its credits. */}
      {canManage && <ContactLookups />}
      <ComingSoonConnection id="whatsapp" name="WhatsApp (via Magnifi)" />
      </>
      )}

      <ConfirmDialog
        open={confirming}
        title="Disconnect Google?"
        body={<>SuperHyre stops sending from {google?.accountEmail ?? "your Gmail"}, scheduling on your calendar and exporting to Sheets. Emails and meetings that are coming up won't go until Google is connected again.</>}
        confirm="Disconnect"
        onClose={() => setConfirming(false)}
        onConfirm={() => void disconnect()}
      />
    </div>
  );
}

/**
 * Contact lookups: the feature the agent's "get contact details" card and the Shortlisted table use, said here
 * once, with whether it is on for this server and what the workspace has left. Nothing to connect or press.
 */
function ContactLookups() {
  const [seen, setSeen] = useState<{ s: "loading" } | { s: "failed" } | { s: "ready"; a: ContactsAllowance }>({ s: "loading" });
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    let live = true;
    setSeen({ s: "loading" });
    fetchContactsAllowance()
      .then((a) => { if (live) setSeen({ s: "ready", a }); })
      .catch(() => { if (live) setSeen({ s: "failed" }); });
    return () => { live = false; };
  }, [asked]);
  return (
    <div className="st-group st-org">
      <div className="st-item st-conn">
        <span className="st-lead">
          <span className="conn-logo conn-logo-tile" style={{ width: 40, height: 40, borderRadius: 11, color: "#5c524b" }}>
            <AddressBook size={24} aria-hidden="true" />
          </span>
          <span className="st-who">
            <span className="st-name">Contact lookups</span>
            <span className="st-mail t-body-sm">
              {seen.s === "ready" ? allowanceLine(seen.a) : seen.s === "failed" ? (
                <>Couldn't check just now. <button type="button" className="st-link" onClick={() => setAsked((n) => n + 1)}>Try again</button></>
              ) : "Checking"}
            </span>
          </span>
        </span>
      </div>
      <div className="st-hang">
        <p className="st-quiet t-body-sm">{LOOKUPS_RULE}</p>
      </div>
    </div>
  );
}

/**
 * Slack, Notion and WhatsApp (through Magnifi): built or planned, not offered yet. Listed so people can see they are
 * coming, greyed out, with nothing to press: no button that does nothing, and no pretending they are half set up.
 */
function ComingSoonConnection({ id, name }: { id: "slack" | "notion" | "whatsapp"; name: string }) {
  return (
    <div className="st-group st-org st-soon" aria-disabled="true">
      <div className="st-item st-conn">
        <span className="st-lead">
          <ConnectorLogo id={id} tile={40} decorative />
          <span className="st-who">
            <span className="st-name">{name}</span>
            <span className="st-mail t-body-sm">Coming soon</span>
          </span>
        </span>
      </div>
    </div>
  );
}
