import type { Approval } from "../liveChat";
import { clock, dayWords, fullWhen, zoneName } from "../meetingsView";

/**
 * What a meeting approval says, as plain data the card draws: the words of each of its states (waiting for a yes,
 * working, settled, declined), so the wording is pinned by tests and the component only lays it out.
 */

export const MEETING_ACTIONS = new Set(["meeting", "meeting_move", "meeting_cancel", "reminder"]);
export const isMeetingAction = (action: string): boolean => MEETING_ACTIONS.has(action);

type Kind = "invite" | "interview" | "move" | "cancel" | "reminder";

/** Which of the card's shapes this approval is. */
export function kindOf(a: Pick<Approval, "action" | "meeting">): Kind {
  if (a.action === "meeting_move") return "move";
  if (a.action === "meeting_cancel") return "cancel";
  if (a.action === "reminder") return "reminder";
  return a.meeting?.kind === "interview" ? "interview" : "invite";
}

/** The question the card asks while it waits for a yes. */
export function headingOf(a: Pick<Approval, "action" | "meeting">): string {
  const guest = a.meeting?.guests.find((g) => g.role === "candidate")?.name.split(/\s+/)[0] ?? null;
  switch (kindOf(a)) {
    case "interview": return guest ? `Invite ${guest} to an interview?` : "Invite them to an interview?";
    case "invite": return "Send this invitation?";
    case "move": return "Move this meeting?";
    case "cancel": return "Cancel this meeting?";
    case "reminder": return "Set this reminder?";
  }
}

/** What the yes button says, and what it says while it is working. */
export function yesWords(kind: Kind): { ready: string; working: string } {
  switch (kind) {
    case "move": return { ready: "Move it", working: "Moving…" };
    case "cancel": return { ready: "Cancel meeting", working: "Cancelling…" };
    case "reminder": return { ready: "Set reminder", working: "Setting…" };
    default: return { ready: "Send invite", working: "Sending…" };
  }
}

/** "30 min", "1 hr", "1 hr 15 min". */
export function lengthWords(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export { zoneName };

/** The time shown large on the card: "Thu 22 Oct, 2:00 pm IST". */
export const whenLine = (iso: string, timeZone: string): string => fullWhen(iso, timeZone);

/** A choice of another time inside the card: the day and the hour, short ("Wed 22 Oct, 11 am"). */
export const slotLabel = (iso: string, timeZone: string): string => `${dayWords(iso, timeZone)}, ${clock(iso, timeZone)}`;

/** Who is invited, in a line: "Asha Verma (candidate), Ravi Iyer, Meera Client". */
export function guestsLine(guests: ReadonlyArray<{ name: string; role: "candidate" | "team" | "other" }>): string {
  return guests.map((g) => (g.role === "candidate" ? `${g.name} (candidate)` : g.name)).join(", ");
}

/**
 * What the person did on the card before the yes: which of its offered times (by place, never by value) and the Meet
 * link when they changed it. A move or a cancellation has neither control.
 */
export function editOf(
  a: Pick<Approval, "action" | "meeting">,
  state: { meet: boolean; slot: number | null },
): { slot?: number; meet?: boolean } {
  const kind = kindOf(a);
  if (kind === "move" || kind === "cancel" || kind === "reminder") return {};
  return {
    ...(state.slot !== null ? { slot: state.slot } : {}),
    ...(a.meeting && state.meet !== a.meeting.meet ? { meet: state.meet } : {}),
  };
}

/** What stops an address being saved for a candidate: nothing for a plausible one. (The server judges it again.) */
export function candidateEmailProblem(value: string): string | null {
  const v = value.trim();
  if (v === "") return "Enter their email address.";
  return /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/.test(v) ? null : "That doesn't look like an email yet.";
}

/** What the card says once it has been answered. */
export function settledLine(a: Approval): { lead: string; when: string | null; declined: boolean } | null {
  if (!a.decided) return null;
  if (a.decided.decision === "decline") {
    return { lead: kindOf(a) === "reminder" ? "Not set." : kindOf(a) === "cancel" ? "Not cancelled." : kindOf(a) === "move" ? "Not moved." : "Not sent.", when: null, declined: true };
  }
  const o = a.decided.outcome;
  const m = o.meeting && typeof o.meeting === "object" ? (o.meeting as Record<string, unknown>) : null;
  const startsAt = typeof m?.startsAt === "string" ? m.startsAt : null;
  const timeZone = typeof m?.timezone === "string" ? m.timezone : a.meeting?.timezone ?? "UTC";
  const when = startsAt ? whenLine(startsAt, timeZone) : null;
  switch (kindOf(a)) {
    case "move": return { lead: "Moved to", when, declined: false };
    case "cancel": return { lead: "Cancelled", when, declined: false };
    case "reminder": return { lead: "Reminder set", when: null, declined: false };
    default: return { lead: "Invited", when, declined: false };
  }
}

/**
 * What a card, a refusal or the agent's own words say about Google access being missing ("Google Calendar access
 * isn't added yet", "needs to be connected first"). True when written, stale once the access is there: the card
 * restates the state from the server, so these go instead of sitting beside "Invited".
 */
const ACCESS_MISSING = /\b(?:access isn'?t added yet|needs? to be (?:re)?connected|isn'?t connected|(?:re)?connect\b[^.!?\n]{0,40}\bfirst)\b/i;
const ABOUT_GOOGLE = /\b(?:google|calendar|tasks)\b/i;
const NOT_GMAIL = /\b(?:gmail|e-?mails?)\b/i;
export const isStaleAccess = (sentence: string): boolean =>
  ACCESS_MISSING.test(sentence) && ABOUT_GOOGLE.test(sentence) && !NOT_GMAIL.test(sentence);

/** The agent's words without the sentences that say Google access is missing, once it is not. */
export function withoutMetAccess(reply: string): string {
  if (!reply || !ACCESS_MISSING.test(reply)) return reply;
  const lines = reply.split("\n").map((line) =>
    line.split(/(?<=[.!?])\s+/).filter((s) => !isStaleAccess(s)).join(" ").trim(),
  );
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Which Google parts the meeting and reminder approvals of a turn need: Tasks for a Google Task, Calendar otherwise. */
export function productsNeeded(approvals: ReadonlyArray<Pick<Approval, "action" | "detail">>): Array<"calendar" | "tasks"> {
  const need = new Set<"calendar" | "tasks">();
  for (const a of approvals) {
    if (!isMeetingAction(a.action)) continue;
    need.add(a.action === "reminder" && a.detail?.where === "google_tasks" ? "tasks" : "calendar");
  }
  return [...need];
}
