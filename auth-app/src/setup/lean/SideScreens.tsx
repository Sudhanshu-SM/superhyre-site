import { useEffect, useState } from "react";
import { identityApi, inviteView, readable } from "../../api/identity";
import type { InviteView, OrgRole } from "../../api/identity";
import { leaveFirstLine } from "../../membership";
import type { Invitation } from "../../api/onboarding";
import { flight } from "./flight";
import { SideScreen } from "./Side";
import { validName } from "./steps";
import { LineInput, TextAction } from "./Voice";

/**
 * The cases around set-up, each in the same canvas: an invitation waiting for this address, an
 * organisation that is already on SuperHyre (found by the work address, or by the name given), a
 * request that was sent, an invite link (ready, expired, for another address, or you are already in an
 * organisation), and an account that would not load. Every one has a way on, so nobody is stuck on it.
 *
 * Personal is private to the person, and these screens say so wherever someone is deciding about a
 * team: joining one never touches it.
 */

/** Runs an action, holding "busy" and the API's message when it fails. */
function useAction(): { busy: boolean; problem: string | null; run: (fn: () => Promise<void>) => void } {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    fn().then(
      () => setBusy(false),
      (err: unknown) => {
        setBusy(false);
        setProblem(readable(err));
      },
    );
  };
  return { busy, problem, run };
}

const ROLE_WORDS = { admin: "an admin", recruiter: "a recruiter" } as const;
const PRIVATE_LINE = "Personal stays yours, and only you can see it.";

/** An invitation to an organisation, sent to this address and waiting. */
export function InvitationScreen({ invitation, more, onJoin, onNotNow, onSignOut }: { invitation: Invitation; more: number; onJoin: () => Promise<void>; onNotNow: () => void; onSignOut: () => void }): JSX.Element {
  const a = useAction();
  const from = invitation.inviterName?.trim() || "Someone";
  return (
    <SideScreen
      picture={{ kind: "hero", key: "hero/hero-door" }}
      head={[`${from} invited you to *${invitation.organisationName}*.`]}
      quiet={`You'd join as ${ROLE_WORDS[invitation.role]}. ${PRIVATE_LINE}${more > 0 ? ` You have ${more} more ${more === 1 ? "invitation" : "invitations"} waiting.` : ""}`}
      primary={{ label: `Join ${invitation.organisationName}`, onClick: () => a.run(onJoin), busy: a.busy }}
      secondary={[{ label: "Not now", onClick: onNotNow }]}
      problem={a.problem}
      corner={{ label: "Sign out", onClick: onSignOut }}
      field={2}
    />
  );
}

/**
 * An organisation that is already on SuperHyre. Found by the person's work address (their team: join it,
 * at once when it allows that for them, otherwise by asking) or by the name they gave (always a request an
 * admin approves). Only the name is ever shown: nothing else about it is known to the person yet.
 */
export function TeamMatchScreen({ name, via, joinMode, onJoin, onNo, onSignOut }: { name: string; via: "domain" | "name"; joinMode: "direct" | "request"; onJoin: () => Promise<void>; onNo: () => void; onSignOut: () => void }): JSX.Element {
  const a = useAction();
  // The server says how it would go for this person (a name or an address: "direct" only where it lets them straight in).
  const direct = joinMode === "direct";
  const quiet =
    via === "domain"
      ? direct
        ? `Join your team there and you'll see its campaigns, by your role. ${PRIVATE_LINE}`
        : `Ask to join your team. An admin there approves each request. ${PRIVATE_LINE}`
      : direct
        ? `Join, and you'll see its campaigns, by your role. ${PRIVATE_LINE}`
        : `Ask to join, and an admin there will approve it. ${PRIVATE_LINE}`;
  return (
    <SideScreen
      picture={{ kind: "hero", key: "hero/hero-door" }}
      head={[`*${name}* is already on SuperHyre.`]}
      quiet={quiet}
      primary={{ label: direct ? `Join ${name}` : via === "domain" ? `Ask to join ${name}` : "Ask to join", onClick: () => a.run(onJoin), busy: a.busy }}
      secondary={[{ label: via === "domain" ? "Not now" : "No, a different one", onClick: onNo }]}
      problem={a.problem}
      corner={{ label: "Sign out", onClick: onSignOut }}
      field={2}
    />
  );
}

/** A request was sent. They carry on in Personal while an admin decides. */
export function RequestSentScreen({ name, onCarryOn, onSignOut }: { name: string; onCarryOn: () => void; onSignOut: () => void }): JSX.Element {
  return (
    <SideScreen
      picture={{ kind: "hero", key: "hero/hero-laptop-sit" }}
      head={["Request *sent*."]}
      quiet={`An admin at ${name} has to approve it. Meanwhile, carry on in Personal. Only you can see it.`}
      primary={{ label: "Carry on", onClick: onCarryOn }}
      corner={{ label: "Sign out", onClick: onSignOut }}
      field={3}
    />
  );
}

/** An invite link: what it is for, then join; or why it cannot be used. */
export function InviteScreen({ token, email, memberOf, memberRole = null, knownName = true, onAccept, onSkip, onSignOut }: { token: string; email: string; memberOf: string | null; /** What they are in the organisation they are already in: an owner has to hand it on first. */ memberRole?: OrgRole | null; /** Whether the account already has a name (Google gives one). When it does not, the link asks, so they are never shown by their address. */ knownName?: boolean; onAccept: (fullName?: string) => Promise<void>; onSkip: () => void; onSignOut: () => void }): JSX.Element {
  const a = useAction();
  const [name, setName] = useState("");
  // Undefined while checking; null if the check itself failed, which leaves accepting to say what is wrong.
  const [view, setView] = useState<InviteView | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    identityApi.previewInvite(token).then(
      (p) => live && setView(inviteView(p, memberOf)),
      () => live && setView(null),
    );
    return () => {
      live = false;
    };
  }, [token, memberOf]);

  const corner = { label: "Sign out", onClick: onSignOut };
  if (view?.s === "invalid")
    return (
      <SideScreen
        picture={{ kind: "empty", name: "su-invite-expired" }}
        head={["That invite has *expired*."]}
        quiet={`It may have run out, been used already or been withdrawn. Ask ${view.organisation ? `someone at ${view.organisation}` : "whoever sent it"} for a new one.`}
        primary={{ label: "Continue to SuperHyre", onClick: onSkip }}
        corner={corner}
      />
    );
  if (view?.s === "elsewhere")
    return (
      <SideScreen
        picture={{ kind: "prop", key: "props/prop-envelope" }}
        head={["This invite is for *another* address."]}
        quiet={`${view.organisation} sent it to ${view.sentTo}, and you're signed in as ${email}. Sign in with ${view.sentTo} to join.`}
        primary={{ label: "Sign in with another address", onClick: onSignOut }}
        secondary={[{ label: "Not now", onClick: onSkip }]}
      />
    );
  if (view?.s === "taken")
    return (
      <SideScreen
        picture={{ kind: "prop", key: "props/prop-sofa" }}
        head={[`You're already in *${view.memberOf}*.`]}
        quiet={leaveFirstLine(view.memberOf, view.organisation, memberRole)}
        primary={{ label: "Continue to SuperHyre", onClick: onSkip }}
        corner={corner}
      />
    );
  const ready = view?.s === "ready";
  // Asked once, on the way in, and only when nobody has given a name yet: the name is what teammates see.
  const asksName = ready && !knownName;
  const typed = validName(name) ?? undefined;
  // Joining by a link is an arrival too: the flight goes up now, and lets go at once if the call fails, so this
  // screen's own message and its button (the retry) are what is seen.
  const accept = () =>
    a.run(async () => {
      if (view?.s === "ready") flight.begin({ kind: "invite", org: view.organisation, person: typed ?? email });
      try {
        await onAccept(typed);
      } catch (err) {
        flight.cancel();
        throw err;
      }
    });
  return (
    <SideScreen
      picture={{ kind: "hero", key: "hero/hero-door" }}
      head={ready ? [`You're invited to *${view.organisation}*.`] : view === undefined ? ["Checking your *invite*."] : ["You've been *invited*."]}
      quiet={ready ? `You'll join as ${ROLE_WORDS[view.role]}.${asksName ? " What should your team call you?" : ""}` : view === undefined ? undefined : `You're signed in as ${email}, which has to be the address the invite was sent to.`}
      ask={asksName ? (
        <LineInput
          id="nx-invite-name"
          label="Your name"
          value={name}
          onChange={setName}
          onSubmit={accept}
          placeholder="Your name"
          ok={!a.busy}
          delay={0}
          reduce
          maxLength={300}
          autoComplete="name"
          problem={a.problem}
          cta={a.busy ? "One moment" : `Join ${view.organisation}`}
          extra={<TextAction onClick={onSkip}>Not now</TextAction>}
        />
      ) : undefined}
      primary={{ label: ready ? `Join ${view.organisation}` : "Accept invite", onClick: accept, busy: a.busy || view === undefined }}
      secondary={[
        ...(asksName ? [] : [{ label: "Not now", onClick: onSkip }]),
        ...(a.problem ? [{ label: "Sign in with another address", onClick: onSignOut }] : []),
      ]}
      problem={asksName ? null : a.problem}
      corner={corner}
      field={2}
    />
  );
}

/** The account would not load: what is said, and which picture, follow why. */
const WHY = {
  network: { art: "err-network", head: "We can't reach *SuperHyre*.", quiet: "Check your connection and try again." },
  server: { art: "err-server", head: "We couldn't load your *account*.", quiet: "Something went wrong on our side. Try again in a moment." },
  session: { art: "err-session", head: "Your session has *ended*.", quiet: "Sign in again to carry on where you were." },
  "rate-limit": { art: "err-rate-limit", head: "Let's take a *moment*.", quiet: "There were a lot of requests. Try again in a few seconds." },
  "no-access": { art: "err-no-access", head: "That account can't open *this*.", quiet: "Ask the person who invited you to check your access." },
} as const;

export function AccountErrorScreen({ kind = "server", onRetry, onSignOut }: { kind?: keyof typeof WHY; message?: string; onRetry: () => Promise<void>; onSignOut: () => void }): JSX.Element {
  const a = useAction();
  const why = WHY[kind];
  const signIn = kind === "session";
  return (
    <SideScreen
      picture={{ kind: "empty", name: why.art }}
      head={[why.head]}
      quiet={a.problem ?? why.quiet}
      primary={signIn ? { label: "Sign in again", onClick: onSignOut } : { label: "Try again", onClick: () => a.run(onRetry), busy: a.busy }}
      secondary={signIn ? [] : [{ label: "Sign out", onClick: onSignOut }]}
    />
  );
}
