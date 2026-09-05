// The Superhyre Supabase project — the same one the Chrome extension signs into
// (`Superhyre-Extension/src/shared/config.ts`). One identity across the
// ecosystem is the point: an account created here works in the extension, and
// the tenancy the database assigns is the same either way.
// Overridable for local verification only. The default is production; setting
// VITE_SUPABASE_URL points the client at a local PostgREST-shaped shim so the
// dashboard can be exercised against real SQL without a live session. Same
// pattern the extension uses for VITE_GOOGLE_CLIENT_ID.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://npqajviolhoufuggfobg.supabase.co";

// Publishable/anon key — public by design, exactly as in the extension bundle.
// It is the `apikey` header the PostgREST and Auth gateways require and it
// authorises nothing on its own; every RPC is granted to `authenticated`, so
// this key buys the ability to sign in as yourself and nothing else.
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_GNHiZtlyWPLQQhySPd7Vhg_aTcqYWex";

// Where Google sends the browser back after consent.
//
// Deliberately computed from `location` rather than hardcoded, because this
// surface has three real origins: superhyre.com/access/ in production,
// 127.0.0.1:5173 under `npm run dev`, and whatever port `npm run preview`
// picks. A hardcoded production URL would make local sign-in bounce to
// production and silently drop the session.
//
// PREREQUISITE, and it cannot be done from this repo: each origin below must be
// listed in Supabase -> Authentication -> URL Configuration -> Redirect URLs.
// An origin missing from that allowlist fails as an opaque redirect back to the
// site root with no session and no error.
export function redirectTarget(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

// Unlike the extension, the web flow does NOT use a client-side Google client
// ID. `signInWithOAuth` hands off to Supabase's own /authorize endpoint, which
// holds the client ID *and secret* server-side — that is the whole reason a web
// page can use the authorization-code flow while the extension has to use the
// id_token grant with a pinned chromiumapp.org redirect. Do not copy the
// extension's GOOGLE_CLIENT_ID here; it is scoped to a different redirect URI
// and would fail as `invalid_grant`.

// Where "Install extension" points.
//
// This is an INTERIM listing. The repo pins the extension ID to
// `pgeckagnkclnkjaekbeadgjhgikioapp` (see Superhyre-Extension/src/manifest.ts),
// and the store item below is a different ID — so the OAuth redirect URI
// https://pgeckagnkclnkjaekbeadgjhgikioapp.chromiumapp.org/ does NOT match
// what this listing ships. Sign-in inside that build will fail until either
// the pinned key is published under this item or this constant is repointed.
//
// Kept as one exported constant precisely so that is a one-line change.
export const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/reklis-%E2%80%94-rekzon-linkedin/nfalnofcehfocfgncjpjgpcablgfipdf";

// The ID the extension's own manifest pins itself to. Shown on the install
// panel so someone can confirm in chrome://extensions that the thing they
// installed is the thing this console is talking about.
export const EXTENSION_ID = "pgeckagnkclnkjaekbeadgjhgikioapp";
