import { useCallback, useEffect, useRef, useState } from "react";
import {
  googleReasonText, googleReturnFrom, identityApi, missingProductsText, readable,
} from "./api/identity";
import type { GoogleConnection, GoogleProduct } from "./api/identity";
import { reloadConnections, useConnections } from "./connectionsStore";
import { ConnectorLogo } from "./ConnectorLogo";
import { EmptyArt } from "./EmptyArt";
import { Loader } from "./components/Loader";
import { connectionNotice, reconnectLine, signedOutTitle } from "./emptyStates";
import { ErrorState } from "./ErrorStates";
import { integrationsOf } from "./railConfig";
import { ConfirmDialog } from "./RoleBits";
import { LoadFailed } from "./ui";
import { OrgConnectionCard, takeProviderReturn } from "./SettingsOrgConnection";

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

const PRODUCTS: GoogleProduct[] = ["gmail", "sheets"];
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

function statusText(g: GoogleConnection): string {
  if (!g.available) return g.reason ?? "Not available yet.";
  if (g.status === "connected") {
    const lacking = PRODUCTS.filter((p) => !g.products.includes(p));
    const as = g.accountEmail ? `Connected as ${g.accountEmail}` : "Connected";
    return lacking.length ? `${as}, without ${lacking.map((p) => (p === "gmail" ? "Gmail" : "Sheets")).join(" or ")}` : as;
  }
  if (g.status === "expired" || g.status === "failed") return "Signed out. Reconnect to keep sending.";
  if (g.status === "revoked") return "Access was removed in Google. Connect again to use it.";
  return "Not connected";
}

export function SettingsConnections({ canManage = false }: { canManage?: boolean }) {
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
      .then((c) => { if (mounted.current) setGoogle((cur) => cur ?? c.google); })
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
          void reloadConnections();
          const missing = missingProductsText(res.missing);
          setNote(missing ? { tone: "problem", text: missing } : { tone: "ok", text: "Google is connected." });
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
        .then(() => reloadConnections())
        .then(() => { if (live) setNote({ tone: "ok", text: `${org.provider === "slack" ? "Slack" : "Notion"} is connected.` }); })
        .catch((err: unknown) => { if (live) setNote({ tone: "problem", text: readable(err) }); })
        .finally(() => { if (live) setBusy(false); });
    } else if (org?.kind === "error") {
      setNote({ tone: "problem", text: org.text });
    }

    loadGoogle();
    return () => { live = false; mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { url } = await identityApi.startGoogle(PRODUCTS);
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
      void reloadConnections();
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
    if (orgSeen.current !== null && orgSeen.current !== orgNow) setNote((n) => (n?.tone === "ok" && /^Google\b/.test(n.text) ? null : n));
    orgSeen.current = orgNow;
  }, [conns.status, orgNow]);
  /* Read from the shared store once it has answered, so this page says what the Agent's panel says. */
  const notice = conns.status === "ready" ? connectionNotice(integrationsOf(conns)) : null;
  const connected = google?.status === "connected";
  const complete = connected && PRODUCTS.every((p) => google.products.includes(p));

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
        <span className="st-lead">
          <ConnectorLogo id="google" tile={40} decorative />
          <span className="st-who">
            <span className="st-name">Google</span>
            <span className="st-mail t-body-sm">
              {google ? statusText(google) : "Checking"}
            </span>
          </span>
        </span>
        {google?.available && (
          <span className="st-acts">
            {!complete && (
              <button type="button" className="ncx-btn is-sm is-primary" disabled={busy} onClick={() => void connect()}>
                {busy ? <><Loader size="sm" tone="inherit" />Opening Google</> : google.status === "disconnected" ? "Connect Google" : "Reconnect"}
              </button>
            )}
            {google.status !== "disconnected" && (
              <button type="button" className="ncx-btn is-sm" disabled={busy} onClick={() => setConfirming(true)}>Disconnect</button>
            )}
          </span>
        )}
      </div>
      <div className="st-uses st-quiet t-body-sm">
        <p><ConnectorLogo id="gmail" size={16} />Gmail sends the outreach you approve, from your own address.</p>
        <p><ConnectorLogo id="sheets" size={16} />Sheets is where shortlists go when you export them.</p>
      </div>

      <OrgConnectionCard provider="slack" canManage={canManage} />
      <OrgConnectionCard provider="notion" canManage={canManage} />
      <WhatsAppConnection />
      </>
      )}

      <ConfirmDialog
        open={confirming}
        title="Disconnect Google?"
        body={<>SuperHyre stops sending from {google?.accountEmail ?? "your Gmail"} and exporting to Sheets. Emails that are coming up won't go until Gmail is connected again.</>}
        confirm="Disconnect"
        onClose={() => setConfirming(false)}
        onConfirm={() => void disconnect()}
      />
    </div>
  );
}

/**
 * WhatsApp through Magnifi: not connected here yet. It is listed so the Outreach page's WhatsApp tab has somewhere
 * to point, and says so plainly: no button that does nothing, and no pretending it is half set up.
 */
function WhatsAppConnection() {
  return (
    <div className="st-group st-org">
      <div className="st-item st-conn">
        <span className="st-lead">
          <ConnectorLogo id="whatsapp" tile={40} decorative />
          <span className="st-who">
            <span className="st-name">WhatsApp (via Magnifi)</span>
            <span className="st-mail t-body-sm">Not connected, available soon</span>
          </span>
        </span>
      </div>
    </div>
  );
}
