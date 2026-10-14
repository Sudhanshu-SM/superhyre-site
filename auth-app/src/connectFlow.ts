import { PROVIDER_NAME } from "./api/identity";
import type { NotionTarget, OrgConnection, OrgProvider, SlackChannel } from "./api/identity";

/**
 * Connecting Slack or Notion from Settings, as logic with no screen in it.
 *
 * A token is pasted into a field, sent once, and then gone: the field is emptied the moment
 * it is submitted and nothing here ever holds on to what was typed. If the server refuses
 * it, the person is told why and pastes again, rather than the console keeping a secret
 * around to make retrying easier.
 */

/* ── the paste-a-token form ── */

export type TokenFlow =
  | { s: "closed" }
  | { s: "entering"; error: string | null }
  | { s: "checking" };

export type TokenEvent =
  | { t: "open" }
  | { t: "cancel" }
  | { t: "submit" }
  | { t: "failed"; message: string }
  | { t: "connected" };

export const TOKEN_CLOSED: TokenFlow = { s: "closed" };

/** One step. A form that is checking a token ignores everything but the answer. */
export function tokenFlow(state: TokenFlow, e: TokenEvent): TokenFlow {
  switch (state.s) {
    case "closed":
      return e.t === "open" ? { s: "entering", error: null } : state;
    case "entering":
      if (e.t === "cancel") return TOKEN_CLOSED;
      if (e.t === "submit") return { s: "checking" };
      return state;
    case "checking":
      if (e.t === "failed") return { s: "entering", error: e.message };
      if (e.t === "connected") return TOKEN_CLOSED;
      return state;
  }
}

/** What stops a token being sent at all. The shape of a real one is the server's to judge. */
export function tokenProblem(provider: OrgProvider, token: string): string | null {
  return token.trim() ? null : `Paste the ${PROVIDER_NAME[provider]} token first.`;
}

/** Where a token comes from, in the words someone setting this up for the first time needs. */
export const TOKEN_HELP: Readonly<Record<OrgProvider, {
  label: string; placeholder: string; steps: string; link: { href: string; text: string };
}>> = {
  slack: {
    label: "Bot token",
    placeholder: "xoxb-…",
    steps: "Create an app in Slack, give it the chat:write and channels:read permissions, install it to your workspace, then copy its Bot User OAuth Token. Add the app to any channel you want it to post in.",
    link: { href: "https://api.slack.com/apps", text: "Open Slack apps" },
  },
  notion: {
    label: "Integration secret",
    placeholder: "ntn_… or secret_…",
    steps: "Create an internal integration in Notion and copy its secret. Then open the pages or databases the agent may write to, and share them with that integration.",
    link: { href: "https://www.notion.so/profile/integrations", text: "Open Notion integrations" },
  },
};

/* ── what a connection says about itself ── */

const WHAT: Readonly<Record<OrgProvider, string>> = { slack: "posting", notion: "saving notes" };

/**
 * One line for the connection card. `ago` is when it was last used, already phrased
 * ("2h ago"), and `byYou` says the person looking connected it themselves.
 */
export function connectionLine(
  provider: OrgProvider,
  c: OrgConnection | null,
  opts: { ago?: string | null; byYou?: boolean } = {},
): string {
  if (!c) return "Not connected";
  if (c.status === "expired") return `Signed out. Reconnect to keep ${WHAT[provider]}.`;
  if (c.status === "error") {
    const why = c.lastError?.trim().replace(/[.!?]*$/, "");
    return why ? `Not working: ${why}. Reconnect to keep ${WHAT[provider]}.` : `Not working. Reconnect to keep ${WHAT[provider]}.`;
  }
  const where = c.workspaceName ?? c.accountName;
  const by = opts.byYou ? "you" : c.connectedBy?.name;
  const head = [where ? `Connected to ${where}` : "Connected", by ? `by ${by}` : null].filter(Boolean).join(" ");
  // "Just now" and "2h ago" both read after "used" once the first letter is down.
  return opts.ago ? `${head} · used ${opts.ago.charAt(0).toLowerCase()}${opts.ago.slice(1)}` : head;
}

/** The default Slack channel and Notion home an admin chose, if they have. */
export function chosenIn(c: OrgConnection | null): {
  channel: { id: string; name: string } | null;
  parent: NotionTarget | null;
} {
  const s = c?.settings ?? {};
  const ch = s.defaultChannel as { id?: unknown; name?: unknown } | undefined;
  const pa = s.defaultParent as { type?: unknown; id?: unknown; title?: unknown } | undefined;
  return {
    channel: ch && typeof ch.id === "string" && typeof ch.name === "string" ? { id: ch.id, name: ch.name } : null,
    parent: pa && typeof pa.id === "string" && (pa.type === "page" || pa.type === "database")
      ? { type: pa.type, id: pa.id, title: typeof pa.title === "string" ? pa.title : "Untitled" }
      : null,
  };
}

/** The connection with one setting changed, for showing the choice before the server confirms it. */
export function withSetting(c: OrgConnection, key: "defaultChannel" | "defaultParent", value: unknown): OrgConnection {
  return { ...c, settings: { ...c.settings, [key]: value } };
}

/** "#hiring", "#leadership (private)", or "#random (add the app first)": the app never joins a channel itself. */
export function channelLabel(c: Pick<SlackChannel, "name" | "isPrivate" | "private" | "isMember">): string {
  const note = c.isMember === false ? "add the app first" : c.isPrivate ?? c.private ? "private" : null;
  return `#${c.name.replace(/^#/, "")}${note ? ` (${note})` : ""}`;
}
