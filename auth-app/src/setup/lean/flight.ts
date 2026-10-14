import { useSyncExternalStore } from "react";

/**
 * The flight: the scene shown between "you are in" and the console, when someone joins an organisation
 * (straight in, by an accepted invitation, or when a request they sent is approved) or finishes making one.
 * It replaces an instant jump with a short, calm arrival.
 *
 * This file is the clock and the words, with no screen in it, so the timing is pinned by tests:
 *
 *   begin()   the scene goes up over whatever is showing
 *   ready()   the real work is done (the account is read, the console is mounted behind the scene)
 *   cancel()  the real work did not go through: the scene lets go at once and the calm retry underneath is seen
 *
 * The scene stays at least `minMs` so it is read as a story, and no longer than the work needs beyond that.
 * Reduced motion gets a still scene, a shorter hold and a longer, plainer fade.
 */

export type FlightKind = "invite" | "request" | "team" | "create";

export type FlightInfo = {
  kind: FlightKind;
  /** The organisation's name, typed in under its mark. */
  org: string;
  /** Its logo when it has one (drawn in place of its first letter). */
  logoUrl?: string | null;
  /** Who is arriving: their initials are the chip that flies. */
  person?: string | null;
};

export type FlightPhase = "idle" | "in" | "out";

export type FlightState = {
  phase: FlightPhase;
  info: FlightInfo | null;
  reduced: boolean;
  /** The work is done; the scene is only waiting out its minimum. */
  ready: boolean;
  /** How it ended, while it fades. */
  ended: "done" | "failed" | null;
  startedAt: number;
  fadeMs: number;
  /** Changes with every new scene, so its animations start from the top. */
  n: number;
};

export const FLIGHT = {
  /** The least time the scene is on screen, even if the server answered at once. */
  minMs: 3000,
  /** The same for reduced motion: there is no story to play, only a plain card. */
  minReducedMs: 1200,
  /** The cross-fade into the console: opacity and a little scale. */
  fadeMs: 250,
  fadeReducedMs: 600,
  /** Letting go because the work failed. */
  failFadeMs: 200,
  /** After the work is done, how long the scene waits for the page behind it to have drawn. */
  settleMs: 1500,
  /** Nothing ever holds the person on this scene longer than this. */
  giveUpMs: 30_000,
} as const;

const IDLE: FlightState = { phase: "idle", info: null, reduced: false, ready: false, ended: null, startedAt: 0, fadeMs: FLIGHT.fadeMs, n: 0 };

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The least time the scene is held, for the motion the person has chosen. */
export const holdFor = (reduced: boolean): number => (reduced ? FLIGHT.minReducedMs : FLIGHT.minMs);
export const fadeFor = (reduced: boolean): number => (reduced ? FLIGHT.fadeReducedMs : FLIGHT.fadeMs);

export class FlightController {
  private state: FlightState = IDLE;
  private readonly listeners = new Set<() => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private settled: (() => boolean) | null = null;
  private readyAt = 0;

  constructor(private readonly reducedNow: () => boolean = prefersReducedMotion) {}

  getState = (): FlightState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** What says the page behind the scene has drawn (the console is mounted and its page is not on its loader). */
  setSettled(fn: (() => boolean) | null): void {
    this.settled = fn;
  }

  /** Puts the scene up. Asked again while it is already up, it only takes the newer details; it never restarts. */
  begin(info: FlightInfo): void {
    if (this.state.phase === "in") {
      this.update(info);
      return;
    }
    this.clear();
    const reduced = this.reducedNow();
    this.readyAt = 0;
    this.set({ phase: "in", info, reduced, ready: false, ended: null, startedAt: Date.now(), fadeMs: fadeFor(reduced), n: this.state.n + 1 });
    this.later(() => this.cancel(), FLIGHT.giveUpMs);
  }

  /** The details learned while it plays (the logo arrives with the account). */
  update(patch: Partial<FlightInfo>): void {
    if (this.state.phase !== "in" || !this.state.info) return;
    const info: FlightInfo = { ...this.state.info };
    for (const [k, v] of Object.entries(patch) as [keyof FlightInfo, unknown][]) {
      if (v !== undefined && v !== null && v !== "") (info as Record<string, unknown>)[k] = v;
    }
    this.set({ ...this.state, info });
  }

  /** The real work is done: leave as soon as the minimum has passed and the page behind has drawn. */
  ready(): void {
    if (this.state.phase !== "in" || this.state.ready) return;
    this.readyAt = Date.now();
    this.set({ ...this.state, ready: true });
    this.check();
  }

  /** The real work failed (or the person turned back): the scene goes at once and what is under it is seen. */
  cancel(): void {
    if (this.state.phase !== "in") return;
    this.leave("failed");
  }

  private check(): void {
    if (this.state.phase !== "in") return;
    const now = Date.now();
    const until = this.state.startedAt + holdFor(this.state.reduced);
    if (until > now) return this.later(() => this.check(), until - now);
    const drawn = this.settled ? this.settled() : true;
    // The allowance for the page behind starts once the scene has had its minimum, not before.
    if (drawn || now - Math.max(this.readyAt, until) >= FLIGHT.settleMs) return this.leave("done");
    this.later(() => this.check(), 50);
  }

  private leave(ended: "done" | "failed"): void {
    if (this.state.phase !== "in") return;
    this.clear();
    const fadeMs = ended === "failed" ? FLIGHT.failFadeMs : this.state.fadeMs;
    this.set({ ...this.state, phase: "out", ended, fadeMs });
    this.later(() => this.set({ ...IDLE, n: this.state.n }), fadeMs);
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private clear(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private set(next: FlightState): void {
    this.state = next;
    for (const l of [...this.listeners]) l();
  }
}

/** The one scene of the app: the set-up, the invite link and the approval all put up this one. */
export const flight = new FlightController();

export function useFlight(): FlightState {
  return useSyncExternalStore(flight.subscribe, flight.getState, flight.getState);
}

/* ── the words ───────────────────────────────────────────────────────────── */

export type FlightWords = { verb: string; lines: readonly [string, string, string] };

/** What the scene says: "Joining <name>" and three quiet lines, the first of which depends on how they got in. */
export function flightWords(kind: FlightKind): FlightWords {
  switch (kind) {
    case "invite":
      return { verb: "Joining", lines: ["Checking your invitation", "Finding your seat", "Opening your workspace"] };
    case "request":
      return { verb: "Joining", lines: ["Your request was approved", "Finding your seat", "Opening your workspace"] };
    case "create":
      return { verb: "Opening", lines: ["Your organisation is ready", "Finding your seat", "Opening your first campaign"] };
    default:
      return { verb: "Joining", lines: ["Checking your team", "Finding your seat", "Opening your workspace"] };
  }
}

/** The chip's letters: the first of up to two words of the name, else of the email's local part. */
export function initialsOf(person: string | null | undefined): string {
  const raw = (person ?? "").trim();
  if (!raw) return "";
  const base = raw.includes("@") ? (raw.split("@")[0] ?? "").replace(/[._-]+/g, " ") : raw;
  const words = base.split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]]).map((w) => Array.from(w ?? "")[0] ?? "");
  return letters.join("").toUpperCase();
}

/** When each status line shows, from the start of the scene, in ms (a still scene shows them all at once). */
export const LINE_AT = [900, 1700, 2450] as const;
/** How the name is typed: when it starts and how long each letter takes. */
export const TYPE_FROM = 1000;
export const TYPE_EVERY = 36;

/** How much of `text` is typed after `elapsed` ms. Pure, so the typing is tested without a clock. */
export function typedLength(text: string, elapsed: number, from = TYPE_FROM, every = TYPE_EVERY): number {
  const total = Array.from(text).length;
  if (elapsed <= from) return 0;
  return Math.min(total, Math.floor((elapsed - from) / every) + 1);
}
