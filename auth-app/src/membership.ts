import type { ApiNotification } from "./api/tasks";
import type { Invite, InviteState, Member, OrgRole, PersonalImportOffer, Workspace } from "./api/identity";

/**
 * Words and small reducers for the people side of an organisation: who is in it, in what role, and what the bell
 * asks of whom. Nothing here talks to the API; the pages call it with what they already hold.
 */

export const ROLE_LABEL: Readonly<Record<OrgRole, string>> = { owner: "Owner", admin: "Admin", recruiter: "Recruiter" };
export const ROLE_PLURAL: Readonly<Record<OrgRole, string>> = { owner: "Owner", admin: "Admins", recruiter: "Recruiters" };

/** One line on what a role can do, wherever a role is shown or chosen. The server's `ROLE_SUMMARY`, in the same words. */
export const ROLE_LINE: Readonly<Record<OrgRole, string>> = {
  owner: "Owns the organisation. Can do everything, including handing ownership on.",
  admin: "Sees everything and manages recruiters. Can edit the organisation and its clients.",
  recruiter: "Works on their own and shared campaigns. Can't change who is here.",
};

/* ── invitations ── */

/** The one word each state wears as a tag. */
export const INVITE_STATE_LABEL: Readonly<Record<InviteState, string>> = {
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Bounced",
  not_sent: "Not emailed",
  accepted: "Accepted",
  expired: "Expired",
};

/** What each state means, said once, for the tag's hover and for anyone reading it cold. */
export const INVITE_STATE_LINE: Readonly<Record<InviteState, string>> = {
  sent: "The email is on its way. Their mail server hasn't confirmed it yet.",
  delivered: "The email reached their mail server. They haven't accepted yet.",
  bounced: "Their address refused the email. Check the address, or share the link yourself.",
  not_sent: "No email went out. Share the link with them, or send it again.",
  accepted: "They joined.",
  expired: "The link ran out before they accepted. Send it again for a new one.",
};

/** How the tag is tinted: green for good news, red for an address that failed, amber for a link that needs sharing, grey when over. */
export const INVITE_STATE_TONE: Readonly<Record<InviteState, "good" | "bad" | "warn" | "info" | "plain">> = {
  sent: "info",
  delivered: "info",
  bounced: "bad",
  not_sent: "warn",
  accepted: "good",
  expired: "plain",
};

/** An invitation that is still waiting for an answer: its link works and it can be cancelled. */
export const inviteIsOpen = (i: Pick<Invite, "state">): boolean => i.state !== "accepted" && i.state !== "expired";

/** An invitation worth sending again: the email did not arrive, or the link ran out. */
export const inviteNeedsResend = (i: Pick<Invite, "state">): boolean => i.state === "bounced" || i.state === "not_sent" || i.state === "expired";

/** The date and the reason under an invitation's tag: when it went and when it runs out, or why it did not go. */
export function inviteDetail(i: Pick<Invite, "state" | "createdAt" | "expiresAt" | "emailedAt" | "acceptedAt" | "emailError">, fmt: (iso: string) => string): string {
  if (i.state === "accepted") return i.acceptedAt ? `Joined ${fmt(i.acceptedAt)}` : "Joined";
  if (i.state === "expired") return `Ran out ${fmt(i.expiresAt)}`;
  const sent = i.state === "not_sent" ? (i.emailError ?? "No email was sent").replace(/\.$/, "") : `Sent ${fmt(i.emailedAt ?? i.createdAt)}`;
  return `${sent}. Open until ${fmt(i.expiresAt)}`;
}

const ORDER: readonly OrgRole[] = ["owner", "admin", "recruiter"];

/** The members in the order a team reads: owner, admins, recruiters; each group by joining date. Empty groups are left out. */
export function groupByRole<M extends Pick<Member, "role" | "joinedAt">>(members: readonly M[]): { role: OrgRole; people: M[] }[] {
  return ORDER.map((role) => ({
    role,
    people: members.filter((m) => m.role === role).sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt)),
  })).filter((g) => g.people.length > 0);
}

/** "People with an @acme.com email can join without approval." The domain is the organisation's own, or none. */
export function joinPolicyLabel(domain: string | null | undefined): string {
  return domain ? `People with an @${domain} email can join without approval` : "People can join without approval";
}

/** The line each workspace says about who can see it, in the switcher and in Settings. */
export function isolationLine(workspace: Pick<Workspace, "kind" | "name">): string {
  return workspace.kind === "personal"
    ? "Personal. Only you can see this."
    : `${workspace.name}. Visible to the people in ${workspace.name}, by role.`;
}

/** What the switcher shows under a workspace's name: the kind and what the person is in it. */
export function workspaceHint(workspace: Pick<Workspace, "kind" | "role">): string {
  if (workspace.kind === "personal") return "Only you";
  return workspace.role ? ROLE_LABEL[workspace.role] : "Member";
}

/* ── the bell ── */

/** What a bell line asks to be done in place. */
export type Ask = "answer-invitation" | "decide-request" | "open-organisation" | null;

export function askOf(n: Pick<ApiNotification, "kind" | "open" | "invitation" | "organisationId">): Ask {
  if (n.kind === "invitation" && n.invitation) return "answer-invitation";
  if (n.kind === "join_request" && n.open) return "decide-request";
  if (n.kind === "request_answered" && n.organisationId) return "open-organisation";
  return null;
}

/**
 * What a bell line reads. A request someone has answered no longer "wants" anything: the line the server
 * wrote at the time ("Gus wants to join Acme.") is told in the past, so a person who is in already is
 * never described as waiting at the door.
 */
export function noticeLine(n: Pick<ApiNotification, "kind" | "open" | "text">): string {
  if (n.kind === "join_request" && !n.open) return n.text.replace(/\s+wants to join\b/, " asked to join");
  return n.text;
}

/**
 * How a request to join ended, said under its line: "Approved by Rohan" or "Declined by Rohan", in the colour of
 * the word. Nothing while it is still waiting, and nothing for any other kind of line.
 */
export function noticeOutcome(n: Pick<ApiNotification, "kind" | "open" | "outcome" | "decidedByName">): { text: string; tone: "hired" | "passed" } | null {
  if (n.kind !== "join_request" || n.open || !n.outcome) return null;
  const by = n.decidedByName?.trim().split(/\s+/)[0];
  const word = n.outcome === "approved" ? "Approved" : "Declined";
  return { text: by ? `${word} by ${by}` : word, tone: n.outcome === "approved" ? "hired" : "passed" };
}

/**
 * Why an invitation can't be accepted yet, in one plain line. Someone is in one organisation at a time; an
 * owner can't just leave it, so for them the way out is named.
 */
export function leaveFirstLine(memberOf: string, joining: string, role: OrgRole | null): string {
  return role === "owner"
    ? `You own ${memberOf}. Invite someone and make them its owner, then leave it, before joining another organisation.`
    : `You're in ${memberOf}. Leave it first to join ${joining}.`;
}

/**
 * What an owner is told about leaving: they can't, until someone else owns it. With nobody else in it yet, the
 * way there starts with an invitation. Said where the leave control would be for anyone else.
 */
export function ownerLeaveLine(organisation: string, others: number): string {
  return others > 0
    ? `You own ${organisation}. To leave it, make someone else the owner first.`
    : `You own ${organisation}. To leave it, invite someone and make them the owner first.`;
}

/** An answered line leaves the list at once; the rest stay, in order. */
export function withoutNotice<N extends Pick<ApiNotification, "id">>(items: readonly N[], id: string): N[] {
  return items.filter((n) => n.id !== id);
}

/** A request someone else decided (or this person did) stops asking: it stays as a quiet line, read. */
export function settleRequest<N extends Pick<ApiNotification, "id" | "readAt" | "open">>(
  items: readonly N[],
  id: string,
  now = new Date(),
  /** How this person answered it, so the line says so at once; the server's own word replaces it on the next read. */
  answer?: { outcome: "approved" | "declined"; by: string | null },
): N[] {
  return items.map((n) => (n.id === id
    ? { ...n, open: false, readAt: n.readAt ?? now.toISOString(), ...(answer ? { outcome: answer.outcome, decidedByName: answer.by } : {}) }
    : n));
}

/** The line that confirms an answer, once, calmly. */
export const ANSWERED = {
  accepted: (organisation: string) => `You're in ${organisation}.`,
  declined: "Declined.",
  approved: (who: string, role: "admin" | "recruiter") => `${who} joined as ${role === "admin" ? "an admin" : "a recruiter"}.`,
  turnedDown: (who: string) => `Declined ${who}.`,
} as const;

/* ── copying their own space into the organisation ── */

/**
 * The one line offered in Settings > Organisation: they have candidates saved in Personal that the
 * organisation does not have. Nothing is copied when someone joins; this is them choosing to. Null when there
 * is nothing to offer, they already copied, or they said not now.
 */
export function importOfferLine(offer: PersonalImportOffer | null, org: string, dismissed: boolean): string | null {
  if (!offer || offer.imported || dismissed || offer.candidates < 1) return null;
  const n = offer.candidates;
  return `You have ${n} ${n === 1 ? "candidate" : "candidates"} saved in Personal. Copy ${n === 1 ? "it" : "them"} into ${org}? Personal keeps its own copy.${alreadyThere(offer.skipped, org, " ")}`;
}

/** "3 were already in Acme." for the people the organisation held before the copy; nothing for none. */
function alreadyThere(skipped: number | undefined, org: string, lead: string): string {
  if (!skipped || skipped < 1) return "";
  return `${lead}${skipped} ${skipped === 1 ? "was" : "were"} already in ${org}.`;
}

export const importedLine = (n: number, org: string, skipped?: number): string =>
  n === 0
    ? `Nothing new to copy into ${org}.${alreadyThere(skipped, org, " ")}`
    : `Copied ${n} ${n === 1 ? "candidate" : "candidates"} into ${org}.${alreadyThere(skipped, org, " ")}`;

/* ── asking to join the organisation on their address, from Settings ── */

/** What Settings says about an organisation that is already on SuperHyre for this person. */
export function joinOfferLine(name: string, joinMode: "direct" | "request"): string {
  return joinMode === "direct"
    ? `${name} is already on SuperHyre. Join your team there and you'll see its campaigns, by your role. Personal stays yours.`
    : `${name} is already on SuperHyre. Ask to join, and an admin there will approve it. Personal stays yours.`;
}

/** The button: joining at once, or asking. */
export const joinOfferButton = (name: string, joinMode: "direct" | "request"): string =>
  joinMode === "direct" ? `Join ${name}` : `Ask to join ${name}`;

/** After a request went. */
export const requestSentLine = (name: string): string =>
  `Request sent. An admin at ${name} has to approve it. You'll hear in your notifications, and Personal is yours meanwhile.`;
