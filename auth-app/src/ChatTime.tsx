import "./chatTime.css";

/**
 * When a message in a chat was sent, said the way the console says times: the time alone for today ("11:54 pm"), the day
 * before it for any other ("28 Oct, 11:54 pm", with the year when it is not this one). Local time, like the day a task is
 * due. Small and quiet: it is under a message, not part of it.
 */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "9:05 am", "12:30 pm", "12:00 am". */
const clock = (d: Date): string => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "am" : "pm"}`;

export function chatTime(at: number, now: Date = new Date()): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return clock(d);
  return `${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`}, ${clock(d)}`;
}

/** The whole of it, for the tooltip: "Wed 28 Oct 2026, 11:54 pm". */
export function chatTimeTitle(at: number): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${clock(d)}`;
}

export function ChatTime({ at, className }: { at: number | null | undefined; className?: string }): JSX.Element | null {
  if (at === null || at === undefined || Number.isNaN(new Date(at).getTime())) return null;
  return (
    <time className={`rep-time${className ? ` ${className}` : ""}`} dateTime={new Date(at).toISOString()} title={chatTimeTitle(at)}>
      {chatTime(at)}
    </time>
  );
}
