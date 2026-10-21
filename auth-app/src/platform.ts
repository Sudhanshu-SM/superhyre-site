/**
 * The key that opens quick find, said the way this computer says it: ⌘K on a Mac, Ctrl K anywhere else. Both keys
 * work everywhere (Console.tsx listens for either); this only decides what the screen calls it.
 */
type Nav = { platform?: string; userAgent?: string; userAgentData?: { platform?: string } } | undefined;

export function isMac(nav: Nav = typeof navigator === "undefined" ? undefined : (navigator as Nav)): boolean {
  const where = nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(where);
}

export const findKey = (nav?: Nav): string => (isMac(nav) ? "⌘K" : "Ctrl K");
