import { useEffect, useReducer, useRef, useState } from "react";
import { agoFrom } from "./api/campaigns";
import { identityApi, orgConnectionOf, PROVIDER_NAME, providerReasonText, providerReturnFrom, readable } from "./api/identity";
import type { NotionTarget, OrgConnection, OrgProvider, SlackChannel } from "./api/identity";
import { ConnectorLogo } from "./ConnectorLogo";
import { Loader } from "./components/Loader";
import { applyOrgConnection, reloadConnections, useConnections } from "./connectionsStore";
import {
  channelLabel, chosenIn, connectionLine, TOKEN_CLOSED, TOKEN_HELP, tokenFlow, tokenProblem, withSetting,
} from "./connectFlow";
import { ConfirmDialog } from "./RoleBits";
import { useSession } from "./roleStore";
import { Fld } from "./Settings";

/**
 * Slack and Notion on the Connections page: the organisation's, connected once by an owner
 * or admin and used by the agent for everyone.
 *
 * Anyone in the organisation can read the status; only an owner or admin sees the buttons.
 * A token pasted here is sent once and the field emptied at the same moment, and sign-in
 * with the provider is offered wherever the server has it set up.
 */

const ABOUT: Readonly<Record<OrgProvider, string>> = {
  slack: "Lets the agent post updates and messages to a Slack channel. Each one waits for your approval first.",
  notion: "Lets the agent add notes to a Notion page or database you choose. Each one waits for your approval first.",
};

export type Note = { tone: "ok" | "problem"; text: string } | null;

/* ── sign-in's answer, read from the address once ──
   Held outside React for the same reason Google's is: the development double-mount runs
   the effect twice, the address is already clean the second time, and a code works once. */
const BARE = "#/settings/connections";
type Back =
  | { kind: "complete"; provider: OrgProvider; result: Promise<unknown> }
  | { kind: "error"; provider: OrgProvider; text: string };
let waiting: Back | null = null;

export function takeProviderReturn(): Back | null {
  const back = providerReturnFrom(window.location.hash);
  if (back) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${BARE}`);
    waiting = back.kind === "complete"
      ? { kind: "complete", provider: back.provider, result: identityApi.completeProvider(back.provider, back.code, back.state) }
      : { kind: "error", provider: back.provider, text: providerReasonText(back.provider, back.reason) };
    const mine = waiting;
    window.setTimeout(() => { if (waiting === mine) waiting = null; }, 0);
  }
  return waiting;
}

export function OrgConnectionCard({ provider, canManage }: { provider: OrgProvider; canManage: boolean }) {
  const name = PROVIDER_NAME[provider];
  const all = useConnections();
  const conn = all[provider];
  const oauth = all.oauth[provider];
  const me = useSession().userId;

  const [flow, send] = useReducer(tokenFlow, TOKEN_CLOSED);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  const known = all.status === "ready" || conn !== null;
  const line = known
    ? connectionLine(provider, conn, { ago: conn?.lastUsedAt ? agoFrom(conn.lastUsedAt) : null, byYou: !!me && conn?.connectedBy?.id === me })
    : all.status === "failed" ? (all.error ?? "Couldn't check what's connected.") : "Checking";

  const submit = async () => {
    // Read once and emptied at once: the console never holds on to a token.
    const token = field.current?.value ?? "";
    if (field.current) field.current.value = "";
    send({ t: "submit" });
    setNote(null);
    const problem = tokenProblem(provider, token);
    if (problem) { send({ t: "failed", message: problem }); return; }
    try {
      const result = await identityApi.connectWithToken(provider, token.trim());
      const made = orgConnectionOf(result, provider);
      if (made) applyOrgConnection(provider, made);
      else await reloadConnections();
      send({ t: "connected" });
      setNote({ tone: "ok", text: `${name} is connected.` });
    } catch (err) {
      send({ t: "failed", message: readable(err) });
    }
  };

  const signIn = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { url } = await identityApi.startProvider(provider);
      window.location.assign(url);
    } catch (err) {
      setNote({ tone: "problem", text: readable(err) });
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const before = conn;
    setConfirming(false);
    setNote(null);
    applyOrgConnection(provider, null);
    try {
      await identityApi.disconnectProvider(provider);
    } catch (err) {
      applyOrgConnection(provider, before);
      setNote({ tone: "problem", text: readable(err) });
    }
  };

  const working = conn?.status === "connected";
  const entering = flow.s !== "closed";
  // A refused token sends the person straight back to the field, which was disabled while it was checked.
  useEffect(() => { if (flow.s === "entering") field.current?.focus(); }, [flow.s]);

  return (
    <div className="st-group st-org">
      <div className="st-item st-conn">
        <span className="st-lead">
          <ConnectorLogo id={provider} tile={40} decorative />
          <span className="st-who">
            <span className="st-name">{name}</span>
            <span className="st-mail t-body-sm">
              {line}
              {all.status === "failed" && !conn && (
                <> <button type="button" className="st-link" onClick={() => void reloadConnections()}>Try again</button></>
              )}
            </span>
          </span>
        </span>
        {canManage && known && !entering && (
          <span className="st-acts">
            {!working && oauth && (
              <button type="button" className="ncx-btn is-sm" disabled={busy} onClick={() => void signIn()}>
                {busy ? <><Loader size="sm" tone="inherit" />{`Opening ${name}`}</> : conn ? "Reconnect" : `Connect with ${name}`}
              </button>
            )}
            {!working && (
              <button type="button" className="ncx-btn is-sm" disabled={busy} onClick={() => send({ t: "open" })}>
                {oauth ? (conn ? "Use a new token" : "Use a token") : conn ? "Reconnect" : `Connect ${name}`}
              </button>
            )}
            {conn && (
              <button type="button" className="ncx-btn is-sm" disabled={busy} onClick={() => setConfirming(true)}>Disconnect</button>
            )}
          </span>
        )}
      </div>

      <div className="st-hang">
      {note && (
        <p className={note.tone === "ok" ? "st-ok t-body-sm" : "st-err t-body-sm"} role={note.tone === "ok" ? "status" : "alert"}>{note.text}</p>
      )}

      {entering && canManage && (
        <form
          className="st-invite st-token"
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
          noValidate
        >
          <Fld id={`st-tok-${provider}`} label={TOKEN_HELP[provider].label} error={flow.s === "entering" ? flow.error : null}>
            {/* A password field that no manager will offer to remember: the token is
                a key to the workspace, typed once. */}
            <input
              id={`st-tok-${provider}`}
              ref={field}
              className="ncx-in"
              type="password"
              name={`${provider}-token`}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              disabled={flow.s === "checking"}
              placeholder={TOKEN_HELP[provider].placeholder}
              aria-describedby={`st-tok-${provider}-help`}
              aria-invalid={flow.s === "entering" && !!flow.error}
            />
          </Fld>
          <p className="st-quiet t-body-sm" id={`st-tok-${provider}-help`}>
            {TOKEN_HELP[provider].steps}{" "}
            <a className="st-link" href={TOKEN_HELP[provider].link.href} target="_blank" rel="noreferrer">{TOKEN_HELP[provider].link.text}</a>
          </p>
          <footer className="st-foot">
            <span />
            <button type="button" className="ncx-btn" disabled={flow.s === "checking"} onClick={() => send({ t: "cancel" })}>Cancel</button>
            <button type="submit" className="ncx-btn is-primary" disabled={flow.s === "checking"}>
              {flow.s === "checking" ? <><Loader size="sm" tone="inherit" />Checking</> : "Connect"}
            </button>
          </footer>
        </form>
      )}

      {working && provider === "slack" && <SlackHome conn={conn} canManage={canManage} />}
      {working && provider === "notion" && <NotionHome conn={conn} canManage={canManage} />}

      {!canManage && known && !working && (
        <p className="st-quiet t-body-sm">{conn ? `Ask an admin to reconnect ${name}.` : `Ask an admin to connect ${name}.`}</p>
      )}
      <p className="st-quiet t-body-sm">{ABOUT[provider]}</p>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Disconnect ${name}?`}
        body={<>The agent stops {provider === "slack" ? "posting to Slack" : "saving notes to Notion"} for everyone in your organisation. Anything waiting for approval can't go out until you connect again.</>}
        confirm="Disconnect"
        danger
        onClose={() => setConfirming(false)}
        onConfirm={() => void disconnect()}
      />
    </div>
  );
}

/* ── Slack: where it posts when no channel is named ── */

type Loaded<T> = { s: "loading" } | { s: "failed" } | { s: "ready"; items: T[]; more?: boolean };

function SlackHome({ conn, canManage }: { conn: OrgConnection; canManage: boolean }) {
  const chosen = chosenIn(conn).channel;
  const [channels, setChannels] = useState<Loaded<SlackChannel>>({ s: "loading" });
  const [problem, setProblem] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    if (!canManage) return;
    let live = true;
    setChannels({ s: "loading" });
    identityApi.slackChannels()
      .then((r) => { if (live) setChannels({ s: "ready", items: r.channels ?? [], more: r.more === true }); })
      .catch(() => { if (live) setChannels({ s: "failed" }); });
    return () => { live = false; };
  }, [canManage, asked]);

  const pick = async (id: string) => {
    const hit = channels.s === "ready" ? channels.items.find((c) => c.id === id) : undefined;
    if (!hit) return;
    const before = conn;
    setProblem(null);
    applyOrgConnection("slack", withSetting(conn, "defaultChannel", { id: hit.id, name: hit.name }));
    try {
      // The server answers with the connection as saved; that, not the guess, is what stays.
      const saved = orgConnectionOf(await identityApi.setSlackChannel({ id: hit.id, name: hit.name }), "slack");
      if (saved) applyOrgConnection("slack", saved);
    } catch (err) {
      applyOrgConnection("slack", before);
      setProblem(readable(err));
    }
  };

  if (!canManage) {
    return <p className="st-quiet t-body-sm">{chosen ? `Posts to #${chosen.name.replace(/^#/, "")} unless a message names another channel.` : "No default channel has been chosen yet."}</p>;
  }

  return (
    <div className="st-pick">
      {channels.s === "ready" && channels.items.length > 0 && (
        <label className="st-pick-l t-body-sm" htmlFor="st-slack-channel">Posts to</label>
      )}
      {channels.s === "ready" && channels.items.length > 0 ? (
        <select id="st-slack-channel" className="ncx-in st-role" value={chosen?.id ?? ""} onChange={(e) => void pick(e.target.value)}>
          {!chosen && <option value="" disabled>Choose a channel</option>}
          {chosen && !channels.items.some((c) => c.id === chosen.id) && <option value={chosen.id}>#{chosen.name.replace(/^#/, "")}</option>}
          {channels.items.map((c) => <option key={c.id} value={c.id}>{channelLabel(c)}</option>)}
        </select>
      ) : channels.s === "loading" ? (
        <span className="st-mail t-body-sm"><Loader size="sm" /> Loading channels</span>
      ) : channels.s === "failed" ? (
        <span className="st-mail t-body-sm" role="status">
          Your Slack channels didn't load. <button type="button" className="st-link" onClick={() => setAsked((n) => n + 1)}>Try again</button>
        </span>
      ) : (
        <span className="st-mail t-body-sm">
          Slack shows no channels yet. Add the app to one, then <button type="button" className="st-link" onClick={() => setAsked((n) => n + 1)}>look again</button>.
        </span>
      )}
      {channels.s === "ready" && channels.more && (
        <span className="st-mail t-body-sm">Showing the first channels Slack lists.</span>
      )}
      {problem && <span className="st-err t-body-sm" role="alert">{problem}</span>}
    </div>
  );
}

/* ── Notion: the page or database notes are added to ── */

const targetLabel = (t: NotionTarget) => `${t.title || "Untitled"} (${t.type})`;

function NotionHome({ conn, canManage }: { conn: OrgConnection; canManage: boolean }) {
  const chosen = chosenIn(conn).parent;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Loaded<NotionTarget>>({ s: "loading" });
  const [problem, setProblem] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setFound({ s: "loading" });
    // A beat after the last keystroke, so typing a word asks once.
    const t = window.setTimeout(() => {
      identityApi.notionTargets(query.trim())
        .then((r) => { if (live) setFound({ s: "ready", items: (r.targets ?? []).slice(0, 8) }); })
        .catch(() => { if (live) setFound({ s: "failed" }); });
    }, query ? 300 : 0);
    return () => { live = false; window.clearTimeout(t); };
  }, [open, query, asked]);

  const pick = async (target: NotionTarget) => {
    const before = conn;
    setOpen(false);
    setQuery("");
    setProblem(null);
    applyOrgConnection("notion", withSetting(conn, "defaultParent", target));
    try {
      const saved = orgConnectionOf(await identityApi.setNotionParent({ type: target.type, id: target.id, title: target.title }), "notion");
      if (saved) applyOrgConnection("notion", saved);
    } catch (err) {
      applyOrgConnection("notion", before);
      setProblem(readable(err));
    }
  };

  return (
    <div className="st-pick-block">
      <div className="st-pick">
        <span className="st-pick-l t-body-sm">Notes go in</span>
        <span className="t-body-sm">{chosen ? targetLabel(chosen) : "No page or database chosen yet"}</span>
        {canManage && !open && (
          <button type="button" className="st-link" onClick={() => setOpen(true)}>{chosen ? "Change" : "Choose"}</button>
        )}
        {problem && <span className="st-err t-body-sm" role="alert">{problem}</span>}
      </div>
      {canManage && open && (
        <div className="st-invite st-targets">
          <label className="ncx-l" htmlFor="st-notion-find">Search your pages and databases</label>
          <input
            id="st-notion-find" className="ncx-in" type="search" value={query} autoFocus autoComplete="off"
            placeholder="Part of a title" onChange={(e) => setQuery(e.target.value)}
          />
          {found.s === "failed" ? (
            <p className="st-mail t-body-sm" role="status">
              Your Notion pages didn't load. <button type="button" className="st-link" onClick={() => setAsked((n) => n + 1)}>Try again</button>
            </p>
          ) : found.s === "loading" ? (
            <p className="st-mail t-body-sm">Looking</p>
          ) : found.items.length === 0 ? (
            <p className="st-mail t-body-sm">Nothing found. Share the page or database with your integration in Notion, then search again.</p>
          ) : (
            <ul className="st-results">
              {found.items.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => void pick(t)}>
                    <span>{t.title || "Untitled"}</span>
                    <span className="st-mail">{t.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <footer className="st-foot">
            <span />
            <button type="button" className="ncx-btn" onClick={() => { setOpen(false); setQuery(""); }}>Cancel</button>
          </footer>
        </div>
      )}
    </div>
  );
}
