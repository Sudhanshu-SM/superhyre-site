import { AccountErrorScreen, InvitationScreen, RequestSentScreen, TeamMatchScreen } from "./SideScreens";
import { SideScreen } from "./Side";

/**
 * `#/setup-preview?screen=...`: the screens around set-up on their own, saving nothing.
 *   invitation  an invitation waiting for this address ("<Name> invited you to <Org>")
 *   domain      the organisation on the work address's domain, joined at once
 *   request     the same, where joining is by asking
 *   name        an organisation found by the name they gave (personal address): ask to join
 *   sent        the request was sent: carry on in Personal
 *   invited     an invite link, ready; expired / elsewhere / taken are its other cases
 */
export const SIDE_SCREENS = ["invitation", "domain", "request", "name", "sent", "invited", "expired", "elsewhere", "taken", "error"] as const;
export type SideName = (typeof SIDE_SCREENS)[number];

const none = () => {};
const later = () => new Promise<void>((r) => window.setTimeout(r, 700));
const INVITATION = { id: "inv", organisationName: "Northstar Talent", inviterName: "Asha Rao", role: "recruiter" as const, createdAt: "2026-10-11T00:00:00Z", expiresAt: "2026-10-18T00:00:00Z" };

export function sideNameFrom(hash: string): SideName | null {
  const want = new URLSearchParams(hash.split("?")[1] ?? "").get("screen");
  return SIDE_SCREENS.find((s) => s === want) ?? null;
}

export function SidePreview({ name }: { name: SideName }): JSX.Element {
  switch (name) {
    case "invitation":
      return <InvitationScreen invitation={INVITATION} more={1} onJoin={later} onNotNow={none} onSignOut={none} />;
    case "domain":
      return <TeamMatchScreen name="Northstar Talent" via="domain" joinMode="direct" onJoin={later} onNo={none} onSignOut={none} />;
    case "request":
      return <TeamMatchScreen name="Northstar Talent" via="domain" joinMode="request" onJoin={later} onNo={none} onSignOut={none} />;
    case "name":
      return <TeamMatchScreen name="Northstar Talent" via="name" joinMode="request" onJoin={later} onNo={none} onSignOut={none} />;
    case "sent":
      return <RequestSentScreen name="Northstar Talent" onCarryOn={none} onSignOut={none} />;
    case "error":
      return <AccountErrorScreen message="The server didn't answer. Check your connection and try again." onRetry={later} onSignOut={none} />;
    case "expired":
      return <SideScreen picture={{ kind: "empty", name: "su-invite-expired" }} head={["That invite has *expired*."]} quiet="It may have run out, been used already or been withdrawn. Ask someone at Northstar Talent for a new one." primary={{ label: "Continue to SuperHyre", onClick: none }} corner={{ label: "Sign out", onClick: none }} />;
    case "elsewhere":
      return <SideScreen picture={{ kind: "prop", key: "props/prop-envelope" }} head={["This invite is for *another* address."]} quiet="Northstar Talent sent it to asha@northstar.example, and you're signed in as arnab@acme.example. Sign in with asha@northstar.example to join." primary={{ label: "Sign in with another address", onClick: none }} secondary={[{ label: "Not now", onClick: none }]} />;
    case "taken":
      return <SideScreen picture={{ kind: "prop", key: "props/prop-sofa" }} head={["You're already in *Quillhire*."]} quiet="Each person belongs to one organisation. To join Northstar Talent, leave Quillhire first." primary={{ label: "Continue to SuperHyre", onClick: none }} corner={{ label: "Sign out", onClick: none }} />;
    case "invited":
      return <SideScreen picture={{ kind: "hero", key: "hero/hero-door" }} head={["You're invited to *Northstar Talent*."]} quiet="You'll join as a recruiter." primary={{ label: "Join Northstar Talent", onClick: none }} secondary={[{ label: "Not now", onClick: none }]} corner={{ label: "Sign out", onClick: none }} field={2} />;
  }
}
