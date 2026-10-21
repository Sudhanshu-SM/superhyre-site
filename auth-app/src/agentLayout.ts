/**
 * Where the rail sits on the Agent page.
 *
 * Wide enough for the rail beside the conversation, a chat in progress uses the page's whole height as it
 * always did, and the rail ends where the composer's input begins: the bottom edge of its last panel (History)
 * and the top edge of the input are one line, however many chats the History lists and whatever the window's
 * height (the page's grid: transcript row, attachments row, composer row; the rail ends on the third line).
 * Before a conversation (home) the composer keeps its own place, and at 1100px and under the page is the
 * stacked column it has always been.
 */

/** The page stacks at this width and under it (the same breakpoint as the stylesheet's). */
export const STACK_AT = 1100;

/**
 * The air under the transcript's last line, to the top of the composer's input, in px: enough that the line is
 * never against the input and no more. The follower scrolls to it (Agent.tsx), and `--log-tail` in chat.css is
 * the same number as the log's padding; a test keeps the two together.
 */
export const TRANSCRIPT_TAIL = 28;

/**
 * The log's bottom padding that leaves TRANSCRIPT_TAIL between its last line and the input, given where the
 * input's top sits against the log's bottom edge (`gap`, in px: negative when the input has risen into the log,
 * positive when there is room between them). Never less than nothing.
 */
export function tailPadding(gap: number): number {
  return Math.max(0, Math.round(TRANSCRIPT_TAIL - gap));
}

export type AgentLayout = "home" | "rail-meets-composer" | "stacked";

export function agentLayout(width: number, chatting: boolean): AgentLayout {
  if (width <= STACK_AT) return "stacked";
  return chatting ? "rail-meets-composer" : "home";
}

/**
 * The Agent page root's classes. `is-agent` is what scopes the page's grid to this page: Home is also an `.orc`
 * (`orc is-solo`) and must never be matched by it. `is-chat` is a conversation being open.
 */
export const orcClass = (chatting: boolean): string => (chatting ? "orc is-agent is-chat" : "orc is-agent");
