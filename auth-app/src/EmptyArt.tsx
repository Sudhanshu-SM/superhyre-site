import { useState } from "react";
import "./emptyArt.css";

/**
 * The spot illustrations for empty, error and milestone states (assets/empty-state-transparent, built
 * into WebP by scripts/build-empty-art.py). One object each, flat vector, transparent, so they sit on
 * whatever the page is. They are decoration: the words next to them carry the meaning, so the picture
 * is hidden from screen readers.
 *
 * This list is the pictures a screen DRAWS. The set on disk is larger (42 files) and the rest stay unwired on
 * purpose, with the reason pinned in __tests__/emptyArt.test.ts (the owner's rules: no art on the agent's hero or
 * avatar, the right rail, the loaders or the set-up; no Extension anywhere). A name only enters this list in the
 * same change that draws it, and the test fails when the list and the code that uses it drift apart.
 */
export const EMPTY_ART = [
  "empty-tasks",
  "empty-tasks-delegated",
  "empty-campaigns",
  "empty-candidates",
  "empty-search",
  "empty-shortlist",
  "empty-passed",
  "empty-hires",
  "empty-calls",
  "empty-sent",
  "empty-clients",
  "empty-forms",
  "empty-responses",
  "empty-schedules",
  "empty-memory",
  "empty-dnc",
  "empty-notifications",
  "empty-agent-activity",
  "empty-analytics",
  "empty-integrations",
  "empty-approvals",
  "empty-no-matches",
  "err-network",
  "err-404",
  "err-no-access",
  "err-server",
  "err-session",
  "err-rate-limit",
  "err-connector",
  "form-closed",
  "form-clipboard",
  "campaign-paused",
  "su-invite-expired",
  "moment-first-hire",
] as const;

export type EmptyArtName = (typeof EMPTY_ART)[number];

const urls = import.meta.glob<string>("./assets/empty/*.webp", { eager: true, query: "?url", import: "default" });

/** The URL of one picture (empty when it is missing, which the tests rule out). */
export function emptyArtUrl(name: EmptyArtName): string {
  return urls[`./assets/empty/${name}.webp`] ?? "";
}

/**
 * One picture, `size` px wide (the pictures are square). 160 to 280 beside a headline; about 96 in a small menu.
 *
 * A picture is fetched when its page is first drawn, so on a connection that has just dropped (the very case the
 * "can't reach SuperHyre" picture is for) it cannot arrive, and a browser draws a broken-image icon where it was.
 * It is decoration, so when it fails it is simply not drawn and the words stand alone.
 */
export function EmptyArt({ name, size = 200, className }: { name: EmptyArtName; size?: number; className?: string }): JSX.Element | null {
  const [failed, setFailed] = useState<string | null>(null);
  const src = emptyArtUrl(name);
  if (failed === src) return null;
  return (
    <img
      className={`ea${className ? ` ${className}` : ""}`} src={src} width={size} height={size} alt="" aria-hidden="true"
      draggable={false} onError={() => setFailed(src)}
    />
  );
}
