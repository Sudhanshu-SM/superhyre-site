import type { ReactNode } from "react";
import "./tag.css";

/**
 * A small labelled tag: a role, a team, where an invitation stands. Text on a soft tint, no dot, no border; the tone
 * is only ever a reading aid next to words, never the whole message. `title` is the longer sentence behind the word.
 */
export type TagTone = "plain" | "accent" | "good" | "warn" | "bad" | "info";

export function Tag({ tone = "plain", title, children }: { tone?: TagTone; title?: string; children: ReactNode }) {
  return (
    <span className={`tag is-${tone}`} {...(title ? { title } : {})}>
      {children}
    </span>
  );
}
