import type { ReactNode } from "react";

/**
 * A task's title as a row draws it: a link where it opens, a button that hands it to the agent, or plain words a keyboard can
 * reach. The card that explains the task belongs to the whole row (TaskHover.tsx), not to the title.
 */
export function TaskTitle({ children, className, href, onClick, plain }: {
  children: ReactNode;
  className: string;
  href?: string | null;
  onClick?: () => void;
  plain?: boolean;
}) {
  if (href) return <a className={className} href={href}>{children}</a>;
  if (plain) return <span className={className} tabIndex={0}>{children}</span>;
  return <button type="button" className={className} onClick={onClick}>{children}</button>;
}
