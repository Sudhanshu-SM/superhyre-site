import { useEffect, useState } from "react";

/**
 * The sign-up art, by name: "hero/hero-idle", "star-dial/dial-3". The files are WebP with real
 * transparency, cut from the generated pictures by scripts/build-signup-art.py, and Vite gives
 * each a hashed URL, so a changed picture is never served stale.
 */
const urls = import.meta.glob<string>("../art/**/*.webp", { eager: true, query: "?url", import: "default" });

export function art(key: string): string {
  const url = urls[`../art/${key}.webp`];
  if (!url && import.meta.env.DEV) console.warn(`[setup] missing art: ${key}`);
  return url ?? "";
}

/** Sizes of the hero poses (they share one canvas, so one ratio). */
export const HERO_RATIO = 527 / 836;

/** Where things sit on the hero pictures, as shares of the picture, measured from the files. */
export const HERO_SPOT = {
  /** The fingertip in hero-tap, where the star is touched. */
  fingertip: { x: 0.831, y: 0.132 },
  /** The orange watch in hero-watch, where the star lands. */
  wrist: { x: 0.61, y: 0.285 },
} as const;

const decoded = new Map<string, Promise<void>>();

/** Loads and decodes a picture once, so swapping to it later never flashes. */
export function preload(key: string): Promise<void> {
  const src = art(key);
  if (!src) return Promise.resolve();
  let p = decoded.get(src);
  if (!p) {
    const img = new Image();
    img.src = src;
    p = img.decode().catch(() => undefined);
    decoded.set(src, p);
  }
  return p;
}

/** True once every named picture is ready; never longer than `maxMs`, so a slow one can't hold the page. */
export function useArtReady(keys: readonly string[], maxMs = 2500): boolean {
  const [ready, setReady] = useState(false);
  const joined = keys.join("|");
  useEffect(() => {
    let live = true;
    const done = () => live && setReady(true);
    const timer = window.setTimeout(done, maxMs);
    void Promise.all(joined.split("|").filter(Boolean).map(preload)).then(() => {
      window.clearTimeout(timer);
      done();
    });
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [joined, maxMs]);
  return ready;
}

/** Warms the rest of the pictures once the first screen is up. */
export function warm(keys: readonly string[]): void {
  const go = () => {
    for (const k of keys) void preload(k);
  };
  const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;
  if (idle) idle(go);
  else window.setTimeout(go, 400);
}

/** The SuperHyre star as an SVG path (the logo mark), 34 x 35. */
export const STAR_PATH =
  "M16.047 0.496124C16.0223 2.74925 16.6685 4.85749 17.9504 6.64333C19.9314 9.36012 22.9612 10.9359 26.1146 11.8233C28.2333 12.4029 30.3556 12.6674 32.605 12.6855V15.9384C30.3697 15.942 28.2969 16.4962 26.3159 17.4562C20.4611 20.3831 15.9694 26.7367 15.9129 33.4961L12.989 33.0868L12.0426 28.5008C11.3117 25.9579 10.3653 23.9656 7.78397 23.1252C6.90469 22.8427 6.03954 22.7014 5.11789 22.5963L1.34654 22.4551L0.60498 19.0464C2.40944 18.8218 4.13268 18.4378 5.79942 17.7315C12.8336 14.714 13.2221 7.87494 13.2362 0.829384L15.9023 0.496124";
