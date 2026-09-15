import type { AllowedBootstrap } from "./types";

/**
 * The development-only auth bypass.
 *
 * ── WHY IT CANNOT REACH PRODUCTION ──────────────────────────────────────────
 * `import.meta.env.DEV` is not a runtime lookup — Vite statically replaces it
 * with the literal `true` under `vite dev` and `false` under `vite build`. So
 * in the built bundle every branch guarded by DEV_SKIP_AUTH becomes
 * `if (false)` and Rollup deletes it, along with DEV_BOOTSTRAP below, since
 * nothing else references it. There is no flag to forget to flip, no
 * environment variable that production could be misconfigured with, and no
 * code path that could be reached by an attacker: the bypass is not in the
 * shipped file at all. Verify after any change with:
 *
 *     npm run build && grep -r "design-harness" ../access/   # expect no match
 *
 * ── WHY A BYPASS AND NOT A RELAXED GATE ─────────────────────────────────────
 * The alternative asked for was removing the work-email restriction. That
 * restriction is enforced by `core.reject_free_email`, a Before-User-Created
 * hook in the LIVE Supabase project that the Chrome extension also signs into
 * (Superhyre-Extension/supabase/04_extension.sql). Disabling it does not scope
 * to development — it admits personal-email accounts to production for every
 * real user, and `extension_bootstrap()` would still refuse to serve them, so
 * the result is a signup that succeeds into a dead end. Skipping auth on the
 * client in dev gets the same design access with none of that.
 */
export const DEV_SKIP_AUTH: boolean = import.meta.env.DEV;

/**
 * Fixture standing in for a real `extension_bootstrap()` response.
 *
 * Shaped to satisfy the same parse the live response goes through, so the
 * signed-in surface renders exactly as it does for a real tenant account
 * rather than a lookalike. Deliberately obvious as a placeholder — matching
 * the rule stated in Console.tsx, that a placeholder admitting what it is
 * beats a convincing fake. `scope: "tenant"` because it exercises more of the
 * UI than "solo" does: a workspace name, a role, and the shared-data notice.
 */
export const DEV_BOOTSTRAP: AllowedBootstrap = {
  allowed: true,
  scope: "tenant",
  user_id: "00000000-0000-4000-8000-000000000000",
  email: "design-harness@superhyre.com",
  full_name: "Design Harness",
  organization_id: "00000000-0000-4000-8000-000000000001",
  organization_name: "Harness Org (mock)",
  schema_name: "tenant_harness",
  role: "owner",
  providers: [
    { slug: "prospeo", display_name: "Prospeo", credits_left: 250 },
    { slug: "contactout", display_name: "ContactOut", credits_left: 100 },
  ],
};
