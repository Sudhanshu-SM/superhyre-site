import type { DayTask } from "./api/tasks";

/**
 * What the card shown when someone rests on a task says. The title is the one line the task was made with, often several
 * things run together ("@Archi - check the assignment - send 2 proposals - close the discussions"): it is read as what is to be
 * done, a step to a line. The rows under it are the facts a person asks of a task: for whom, from whom, by when, on which
 * campaign, and where it stands. Plain data in, words out.
 */

export type TaskCardWords = {
  heading: string;
  /** The things to do, when the title lists them: the first part is whom it is for, the rest are the steps. */
  steps: string[];
  rows: Array<[label: string, value: string]>;
  /** A line about where it opens, when it opens somewhere. */
  opens: string | null;
};

const STATE: Record<DayTask["state"], string> = { todo: "To do", doing: "In progress", blocked: "Blocked", done: "Done" };

const dayWords = (t: number): string =>
  new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** "Today", "Tomorrow", "Overdue by 3 days", "Mon 3 Nov". Null when it has no date. */
export function dueWords(task: Pick<DayTask, "dueAt" | "dueInDays">): string | null {
  const d = task.dueInDays;
  if (d === null) return null;
  if (d < 0) return `Overdue by ${-d} day${d === -1 ? "" : "s"}`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return task.dueAt ? dayWords(Date.parse(task.dueAt)) : `In ${d} days`;
}

/** A title that lists things: "@Name - do this - do that" is a heading and its steps. Anything else is one heading. */
export function stepsOf(title: string): { heading: string; steps: string[] } {
  const parts = title.split(/\s+[-–•]\s+/).map((p) => p.trim().replace(/[.;,]+$/, "")).filter(Boolean);
  if (parts.length < 3) return { heading: title.trim(), steps: [] };
  const [first = title, ...rest] = parts;
  return { heading: first, steps: rest };
}

export function taskCardOf(
  t: Pick<DayTask, "title" | "state" | "campaign" | "assigneeName" | "createdByName" | "createdById" | "dueAt" | "dueInDays" | "progress" | "open" | "kind" | "candidateName" | "removable">,
  you: { id: string | null; name: string | null },
): TaskCardWords {
  const { heading, steps } = stepsOf(t.title);
  const rows: Array<[string, string]> = [];
  const forYou = !t.assigneeName || (you.name && t.assigneeName === you.name);
  rows.push(["For", forYou ? "You" : (t.assigneeName ?? "A teammate")]);
  const by = t.createdByName ?? (t.kind === "system" ? "A rule of the workspace" : t.kind === "agent" ? "The agent" : null);
  if (by && by !== t.assigneeName && !(you.id && t.createdById === you.id)) rows.push(["Added by", by]);
  const due = dueWords(t);
  rows.push(["Due", due ?? "No date"]);
  if (t.campaign) rows.push(["Campaign", t.campaign]);
  if (t.candidateName) rows.push(["About", t.candidateName]);
  rows.push(["Status", STATE[t.state]]);
  if (t.progress) rows.push(["Progress", `${t.progress.done} of ${t.progress.total} ${t.progress.what}`]);
  return { heading, steps, rows, opens: t.open ? "Click to open where it is done." : null };
}
