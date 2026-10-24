import { useSyncExternalStore } from "react";
import { api, LIVE } from "./api/client";

/**
 * What a person pinned in the chat list: chats and campaigns together, the most recently pinned first. A pin is a key,
 * "chat:<id>" or "campaign:<id>", so the one list keeps the order they were pinned in. Connected, they are kept with the
 * person's other settings (so they follow them to another device, and the agent can pin and unpin for them); this browser
 * keeps a copy so the list is right at once, and holds the pins of anyone not connected. A pin whose chat or campaign has
 * gone is simply not drawn.
 */
export type Pins = readonly string[];
export type PinKind = "chat" | "campaign";

const KEY = "superhyre.chatrail.pins";
const MAX = 100;
const EMPTY: Pins = [];

export const pinKey = (kind: PinKind, id: string) => `${kind}:${id}`;

const clean = (raw: unknown): Pins =>
  Array.isArray(raw)
    ? [...new Set(raw.filter((k): k is string => typeof k === "string" && /^(chat|campaign):.+/.test(k)))].slice(0, MAX)
    : EMPTY;

export function readPins(): Pins {
  try {
    return clean(JSON.parse(window.localStorage.getItem(KEY) ?? "null"));
  } catch {
    return EMPTY;
  }
}

/** The pins after one is added (at the front) or, when it is already there, taken away. */
export function toggled(pins: Pins, kind: PinKind, id: string): Pins {
  const key = pinKey(kind, id);
  return pins.includes(key) ? pins.filter((k) => k !== key) : [key, ...pins].slice(0, MAX);
}

let state: Pins = readPins();
/** Pressed before the settings were first read: what the person did wins over what was there, that once. */
let touched = false;
let loaded = false;
let asked = false;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());
const keep = (pins: Pins) => {
  try { window.localStorage.setItem(KEY, JSON.stringify(pins)); } catch { /* the pin holds for this visit */ }
};

/** Reads the pins again from this browser's copy (another tab changed it, or a test reset it). */
export function reloadPins() {
  state = readPins();
  tell();
}

/**
 * Reads the pins from the person's settings. Pins made in this browser before there were any there (the first time) are
 * kept and sent up, so nothing pinned earlier is lost.
 */
export async function loadPins(): Promise<void> {
  if (!LIVE) return;
  try {
    const { user } = await api<{ user: { chatPins?: unknown } }>("GET", "/v1/me");
    const theirs = clean(user.chatPins);
    const first = !loaded;
    loaded = true;
    if (first && touched) return;
    if (first && theirs.length === 0 && state.length > 0) {
      void api("PATCH", "/v1/me/settings", { chatPins: [...state] }).catch(() => {});
      return;
    }
    state = theirs;
    keep(state);
    tell();
  } catch {
    /* this browser's copy stands */
  }
}

export function togglePin(kind: PinKind, id: string) {
  touched = true;
  state = toggled(state, kind, id);
  keep(state);
  tell();
  if (LIVE) void api("PATCH", "/v1/me/settings", { chatPins: [...state] }).catch(() => {});
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!asked) { asked = true; void loadPins(); }
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) reloadPins(); };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export const usePins = (): Pins => useSyncExternalStore(subscribe, () => state, () => EMPTY);
