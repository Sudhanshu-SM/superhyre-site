import { useEffect, useSyncExternalStore } from "react";
import { LIVE } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import { type CalendarAnswer, calendarApi } from "./api/calendar";

/**
 * The person's own Google Calendar on Coming up: one read shared by every place that shows it (Home, the chat's
 * card), read again every few minutes while one is on screen. A calendar that cannot be read shows what was there, or
 * nothing: it never turns the list it sits in into an error. Someone who has not linked Google Calendar reads as
 * `connected: false`, which is where the page offers to link it.
 */

export type CalendarEntry = { phase: "idle" | "loading" | "ready" | "failed"; answer: CalendarAnswer };
const NOTHING: CalendarAnswer = { connected: false, events: [] };
const IDLE: CalendarEntry = { phase: "idle", answer: NOTHING };
const EVERY_MS = 5 * 60_000;

let entry: CalendarEntry = IDLE;
let pending: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

const put = (next: CalendarEntry) => {
  entry = next;
  version += 1;
  for (const l of listeners) l();
};

async function read(): Promise<void> {
  if (!LIVE) return;
  if (pending) return pending;
  if (entry.phase === "idle") put({ phase: "loading", answer: NOTHING });
  pending = calendarApi
    .events()
    .then((answer) => put({ phase: "ready", answer }))
    // What was on screen stays; with nothing yet, the list simply has no calendar in it.
    .catch(() => put({ phase: "failed", answer: entry.answer }))
    .finally(() => {
      pending = null;
    });
  return pending;
}

onWorkspaceChange(() => {
  entry = IDLE;
  version += 1;
  for (const l of listeners) l();
  void read();
});

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** The calendar, read when first shown and again every few minutes. Off (and reading nothing) when `enabled` is false. */
export function useCalendar(enabled = true): CalendarEntry {
  useSyncExternalStore(subscribe, () => version, () => version);
  useEffect(() => {
    if (!enabled || !LIVE) return;
    void read();
    const timer = setInterval(() => void read(), EVERY_MS);
    return () => clearInterval(timer);
  }, [enabled]);
  return enabled ? entry : IDLE;
}

/** Test-only: forget everything. */
export function resetCalendar(): void {
  entry = IDLE;
  pending = null;
  version += 1;
}
