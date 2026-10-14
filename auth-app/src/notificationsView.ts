import type { ApiNotification } from "./api/tasks";

/**
 * The bell's panel, as plain functions: which category a notification belongs to, and what a filter leaves.
 * No React, so the rules are tested on their own.
 */

export type Category =
  | "invitations"
  | "requests"
  | "team"
  | "handovers"
  | "reminders"
  | "agent"
  | "calls"
  | "applicants"
  | "other";

/** In the order the menu lists them. */
export const CATEGORIES: readonly { id: Category; label: string }[] = [
  { id: "invitations", label: "Invitations" },
  { id: "requests", label: "Join requests" },
  { id: "team", label: "Team" },
  { id: "handovers", label: "Hand-overs" },
  { id: "reminders", label: "Reminders" },
  { id: "agent", label: "Agent" },
  { id: "calls", label: "Calls" },
  { id: "applicants", label: "Applicants" },
  { id: "other", label: "Other" },
];

export const categoryLabel = (c: Category): string => CATEGORIES.find((x) => x.id === c)?.label ?? "Other";

/** What a server `kind` is, to a person. A kind this build does not know is "Other", never dropped. */
export function categoryOf(kind: string): Category {
  switch (kind) {
    case "invitation":
    case "invitation_answered":
      return "invitations";
    case "join_request":
    case "request_answered":
      return "requests";
    case "member_joined":
    case "member_left":
    case "member_removed":
    case "removed":
    case "role_changed":
    case "admin_note":
      return "team";
    case "campaign_owner":
    case "campaign_added":
    case "task_assigned":
    case "task_done":
      return "handovers";
    case "reminder":
    case "digest":
      return "reminders";
    case "watch":
    case "schedule_failed":
    case "schedule_skipped":
      return "agent";
    case "form_applicant":
      return "applicants";
    default:
      if (kind.startsWith("call")) return "calls";
      if (kind.startsWith("agent")) return "agent";
      return "other";
  }
}

/** The categories that have at least one notification, in menu order. */
export function categoriesIn(items: readonly Pick<ApiNotification, "kind">[]): Category[] {
  const have = new Set(items.map((n) => categoryOf(n.kind)));
  return CATEGORIES.filter((c) => have.has(c.id)).map((c) => c.id);
}

export type Filter = { unreadOnly: boolean; category: Category | "all" };

export function visibleNotices<T extends Pick<ApiNotification, "kind" | "readAt">>(items: readonly T[], f: Filter): T[] {
  return items.filter((n) => (!f.unreadOnly || !n.readAt) && (f.category === "all" || categoryOf(n.kind) === f.category));
}

/** What an empty list says: calm, and honest about whether a filter is hiding something. */
export function emptyLine(f: Filter, total: number): string {
  if (total > 0 && f.unreadOnly && f.category === "all") return "Nothing unread. You're all caught up.";
  if (total > 0) return "Nothing here under this filter.";
  return "Nothing new. You're all caught up.";
}
