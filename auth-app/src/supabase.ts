import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

/**
 * The browser client. Publishable key only.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NEVER put a `sb_secret_…` / service-role key in this file or anywhere under
 * src/. This app compiles to a static bundle that GitHub Pages serves to the
 * public; there is no server to hide a secret in. A secret key bypasses RLS
 * outright, so shipping one would grant every visitor read/write on `core`,
 * `mother_data` and every `tenant_*` schema. The publishable key below cannot
 * do any of that: every RPC is granted to `authenticated`, so it buys the
 * ability to sign in as yourself and nothing more.
 *
 * JWT verification against the project's JWKS is likewise a server-side
 * concern. The browser does not verify its own token — it holds one and the
 * PostgREST gateway verifies it.
 * ────────────────────────────────────────────────────────────────────────────
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // The OAuth return lands back on /access/ carrying its result in the URL.
    // This is what exchanges it for a session and strips it from the address
    // bar, so a copied URL never contains a live token.
    detectSessionInUrl: true,
    // Authorization-code + PKCE. Available because the web flow redirects
    // through Supabase's own /authorize endpoint, which holds the Google client
    // secret. (The extension cannot use this and falls back to the id_token
    // grant — see Superhyre-Extension/src/background/auth.ts.)
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
  },
});
