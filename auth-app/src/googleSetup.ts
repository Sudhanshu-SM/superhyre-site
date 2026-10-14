import { useEffect, useState } from "react";
import { LIVE } from "./api/client";
import type { GoogleConnection } from "./api/identity";
import { identityApi } from "./api/identity";

/**
 * Whether this server can talk to Google at all, and what the person has
 * connected. Read once per page load: it changes only when someone connects
 * in Settings, which reloads what reads it.
 */
let pending: Promise<GoogleConnection | null> | null = null;

export function loadGoogle(): Promise<GoogleConnection | null> {
  if (!LIVE) return Promise.resolve(null);
  pending ??= identityApi.connections().then((c) => c.google, () => null);
  return pending;
}

/** Test-only: forget the cached answer. */
export function resetGoogle() { pending = null; }

export function useGoogle(): GoogleConnection | null {
  const [g, setG] = useState<GoogleConnection | null>(null);
  useEffect(() => {
    let live = true;
    void loadGoogle().then((x) => { if (live) setG(x); });
    return () => { live = false; };
  }, []);
  return g;
}

/** What to tell someone about sending or exporting through Google, or null when it will just work. */
export function googleHint(g: GoogleConnection | null, product: "gmail" | "sheets"): string | null {
  if (!g) return null;
  if (!g.available) return product === "gmail"
    ? "Sending from Gmail isn't set up on this server yet. Drafts are saved and can go out once it is."
    : "Google Sheets isn't set up on this server yet. CSV and Excel work now.";
  if (g.status !== "connected" || !g.products.includes(product)) return product === "gmail"
    ? "Connect Gmail in Settings → Connections before these can be sent."
    : "Connect Google in Settings → Connections to export to Sheets.";
  return null;
}
