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
