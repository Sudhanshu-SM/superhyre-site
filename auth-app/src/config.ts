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
/* No CHROME_STORE_URL. There is no published Chrome Web Store listing for
   this extension yet. The constant used to point at store item
   nfalnofcehfocfgncjpjgpcablgfipdf, which is a different product ("Reklis -
   Rekzon LinkedIn Sourcing"), currently reports as unavailable, and ships
   under an extension ID that is not the one the manifest pins — so the link
   was worse than no link. ExtensionPage documents the load-unpacked path
   instead.

   When the listing goes live, three things change together:
     1. restore a single CHROME_STORE_URL constant here,
     2. set EXTENSION_ID below to the ID the store assigned (it is NOT the
        pinned one — the store strips `key` and owns the keypair), and
     3. add chrome-extension://<store-id> to the reveal-phone function's
        EXTENSION_ORIGINS and https://<store-id>.chromiumapp.org/ to the
        Google OAuth client's authorized redirect URIs.
   Miss (3) and the published extension installs fine but cannot sign in. */

// The ID the extension identifies itself by. Shown on the install panel so
// someone can confirm in chrome://extensions that the thing they installed is
// the thing this console is talking about. Currently the ID pinned by the
// `key` in the extension's manifest, which is what an unpacked build gets.
export const EXTENSION_ID = "pgeckagnkclnkjaekbeadgjhgikioapp";
