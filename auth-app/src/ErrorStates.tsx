import type { ReactNode } from "react";
import { ApiError } from "./api/client";
import type { FailureKind } from "./api/client";
import type { EmptyArtName } from "./EmptyArt";
import { EmptyArt } from "./EmptyArt";
import "./errorStates.css";

/**
 * The calm version of "that didn't work": a picture, one title, one sentence about what to do, and
 * (when there is something to do) one action. Never red, never an exclamation mark; an error is a
 * pause, not an alarm. The words say what happened and whose move it is.
 *
 * Mount it wherever a panel fails to load, a page is not found, or a person is not allowed in:
 *   <ErrorState kind="network" action={{ label: "Try again", onClick: retry }} />
 *   <NotFound />
 */
export type ErrorKind = "network" | "server" | "session" | "rate-limit" | "no-access" | "connector";

const ART: Readonly<Record<ErrorKind, { name: EmptyArtName; size: number }>> = {
  network: { name: "err-network", size: 160 },
  server: { name: "err-server", size: 180 },
  session: { name: "err-session", size: 180 },
  "rate-limit": { name: "err-rate-limit", size: 160 },
  "no-access": { name: "err-no-access", size: 180 },
  connector: { name: "err-connector", size: 120 },
};

const COPY: Readonly<Record<ErrorKind, { title: string; text: string }>> = {
  network: { title: "Can't reach SuperHyre", text: "Check your connection and try again." },
  server: { title: "Something went wrong on our side", text: "It's not you. Give it a moment and try again." },
  session: { title: "Your session has ended", text: "Sign in again and you'll pick up right where you were." },
  "rate-limit": { title: "That was a lot at once", text: "Give it a moment and try again." },
  "no-access": { title: "You don't have access to this", text: "Ask an admin of your organisation to add you." },
  connector: { title: "It's signed out", text: "Connect it again and the agent can use it." },
};

/** The picture and words for one kind (exported so the mapping can be tested without rendering). */
export function errorCopy(kind: ErrorKind): { art: { name: EmptyArtName; size: number }; title: string; text: string } {
  return { art: ART[kind], ...COPY[kind] };
}

/** What the server calls the services it can ask to be connected, in the words a person uses. */
const CONNECT_NAME: Readonly<Record<string, string>> = {
  slack: "Slack", notion: "Notion", gmail: "Gmail", sheets: "Google Sheets", google: "Google",
};

/** The service id a refusal says needs connecting (`details.connect`), or null when it says none. */
export function connectNeeded(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const c = err.details.connect;
  return typeof c === "string" && c ? c : null;
}

/** "Slack", "Google Sheets": a service id as a person would say it. */
export function connectName(id: string): string {
  return CONNECT_NAME[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Which kind a failed request is, from what the API said: a dropped connection is the person's,
 * a 401 means signing in again, a 403 a role, a 429 a pause, a 5xx ours. Anything else (a 400 or 404
 * with its own sentence) is not one of these and is left to the caller's own message.
 */
export function errorKindOf(err: unknown): ErrorKind | null {
  if (!(err instanceof ApiError)) return null;
  /* A service that is not connected (a 503 that says which) is a thing to connect, not a fault. */
  if (connectNeeded(err)) return "connector";
  if (err.status === 0 || err.code === "network") return "network";
  if (err.status === 401) return "session";
  if (err.status === 403) return "no-access";
  if (err.status === 429) return "rate-limit";
  if (err.status >= 500) return "server";
  return null;
}

/** The kind behind the "last failure" the API client remembers (see lastFailureKind). */
export function kindOfLastFailure(last: FailureKind | null): ErrorKind {
  switch (last) {
    case "network": return "network";
    case "limited": return "rate-limit";
    case "session": return "session";
    case "access": return "no-access";
    default: return "server";
  }
}

export type ErrorAction = { label: string; onClick?: () => void; href?: string };

/**
 * A session that has ended is not fixed by asking again: the same request fails the same way. So
 * a "Try again" on that kind becomes "Sign in again", which reloads the page and re-runs sign-in.
 * Any other action (a link, a different verb) is left as the caller wrote it.
 */
export function actionFor(kind: ErrorKind, action: ErrorAction | undefined, reload: () => void = () => window.location.reload()): ErrorAction | undefined {
  if (kind !== "session" || !action || action.href || action.label !== "Try again") return action;
  return { label: "Sign in again", onClick: reload };
}

export function ErrorState({
  kind, title, text, action, size, className, art = true,
}: {
  kind: ErrorKind;
  /** Replaces the default headline; `null` leaves only the sentence (when the sentence already names the thing). */
  title?: string | null;
  /** Replaces the default sentence. */
  text?: ReactNode;
  action?: ErrorAction;
  /** Picture width in px; defaults to the size made for this kind. */
  size?: number;
  className?: string;
  /** False in a narrow panel that sits beside others: the words and the way forward, without a picture each. */
  art?: boolean;
}): JSX.Element {
  const c = errorCopy(kind);
  const heading = title === undefined ? c.title : title;
  const act = actionFor(kind, action);
  return (
    <div className={`es is-${kind}${className ? ` ${className}` : ""}`} role={kind === "no-access" || kind === "connector" ? undefined : "alert"}>
      {art && <EmptyArt name={c.art.name} size={size ?? c.art.size} />}
      {heading && <h2 className="es-t t-title-sm">{heading}</h2>}
      <p className="es-p t-body">{text ?? c.text}</p>
      {act && (act.href
        ? <a className="ct-btn es-act" href={act.href}>{act.label}</a>
        : <button type="button" className="ct-btn es-act" onClick={act.onClick}>{act.label}</button>)}
    </div>
  );
}

/** A link that names no page. Home is one click away, and the words do not blame the link's owner. */
export function NotFound({ title = "That page isn't here", text = "The link may be old or mistyped. Home is a good place to start again.", onHome, homeHref = "#/home" }: {
  title?: string;
  text?: ReactNode;
  /** Called instead of following `homeHref`, for a caller that routes in state. */
  onHome?: () => void;
  homeHref?: string;
}): JSX.Element {
  return (
    <div className="es is-404">
      <EmptyArt name="err-404" size={200} />
      <h1 className="es-t t-title">{title}</h1>
      <p className="es-p t-body">{text}</p>
      {onHome
        ? <button type="button" className="ct-btn es-act" onClick={onHome}>Go to Home</button>
        : <a className="ct-btn es-act" href={homeHref}>Go to Home</a>}
    </div>
  );
}
