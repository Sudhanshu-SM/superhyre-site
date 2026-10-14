import { useEffect, useState } from "react";
import "./theme/theme.css";

/**
 * Light, dark, or whatever the device says.
 *
 * The app sets `data-theme` on the page while it is mounted (index.html has already done it once, so the first paint is
 * the right colour). The sign-in follows it like the console does; the set-up screens have a look of their own
 * (peach, light in both themes) and pin their own tokens. The choice is the person's, per browser, and "system" is
 * the default: a device that is dark gets the dark console, with no setting to find first.
 */

export type ThemeChoice = "system" | "light" | "dark";
export type ThemeName = "light" | "dark";

export const THEME_KEY = "superhyre.theme";
export const CHOICES: ReadonlyArray<{ id: ThemeChoice; label: string }> = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export const isChoice = (v: unknown): v is ThemeChoice => v === "system" || v === "light" || v === "dark";

/** What is on screen for a choice, given whether the device prefers dark. */
export const resolveTheme = (choice: ThemeChoice, prefersDark: boolean): ThemeName =>
  choice === "system" ? (prefersDark ? "dark" : "light") : choice;

export function readChoice(storage: Pick<Storage, "getItem"> | null = safeStorage()): ThemeChoice {
  try {
    const v = storage?.getItem(THEME_KEY);
    return isChoice(v) ? v : "system";
  } catch {
    return "system";
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const prefersDark = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;

let choice: ThemeChoice = readChoice();
const listeners = new Set<() => void>();

function paint(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(choice, prefersDark());
}

/** How many screens are asking for the theme (the app as a whole, and the console inside it). */
let holders = 0;

/**
 * Applies the theme while the app is on screen. Returns the way to take it off; the page keeps it for as long as
 * anyone still holds it, so the console unmounting (sign-out) leaves the sign-in page in the theme it was in.
 */
export function startTheme(): () => void {
  holders += 1;
  choice = readChoice();
  paint();
  const mq = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const follow = () => { if (choice === "system") paint(); };
  mq?.addEventListener("change", follow);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    mq?.removeEventListener("change", follow);
    holders -= 1;
    if (holders === 0 && typeof document !== "undefined") delete document.documentElement.dataset.theme;
  };
}

export function setThemeChoice(next: ThemeChoice): void {
  choice = next;
  try { safeStorage()?.setItem(THEME_KEY, next); } catch { /* the choice still holds for this visit */ }
  paint();
  for (const l of listeners) l();
}

export function useThemeChoice(): ThemeChoice {
  const [now, setNow] = useState<ThemeChoice>(choice);
  useEffect(() => {
    const on = () => setNow(choice);
    listeners.add(on);
    return () => { listeners.delete(on); };
  }, []);
  return now;
}
