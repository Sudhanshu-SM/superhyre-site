import type { Channel } from "./api/outreachActivity";

/**
 * The small mark that says which channel a line is on: an envelope for email, a phone for a call, and WhatsApp's
 * own mark (in its green, which is how people know it, and only at this size). Drawn inline so nothing is fetched,
 * in the text's own ink so the two others read as part of the sentence; decoration, the word is written beside it.
 */

const NAME: Readonly<Record<Channel, string>> = { email: "Email", whatsapp: "WhatsApp", call: "Call" };

export function ChannelMark({ channel, size = 16, className }: { channel: Channel; size?: number; className?: string }): JSX.Element {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, focusable: false,
    className: `chm is-${channel}${className ? ` ${className}` : ""}`,
  } as const;
  if (channel === "email") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
        <path d="m4 8 8 5.5L20 8" />
      </svg>
    );
  }
  if (channel === "call") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.6 3.5h2.5l1.4 3.6-1.7 1.3a10.2 10.2 0 0 0 5.8 5.8l1.3-1.7 3.6 1.4v2.5a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path fill="#25D366" d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.2 21.8l5-1.3A9.8 9.8 0 1 0 12 2.2z" />
      <path
        fill="#fff"
        d="M16.7 14.3c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.3 6.3 0 0 1-3.1-2.7c-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.4l-.7-1.6c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.5 1.5.6 2 .7 2.7.6.4-.1 1.4-.6 1.5-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3z"
      />
    </svg>
  );
}

/** What a screen reader hears for a channel's mark when the word is not beside it. */
export const channelName = (c: Channel): string => NAME[c];
