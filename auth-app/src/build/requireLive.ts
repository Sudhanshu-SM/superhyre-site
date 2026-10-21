import type { Plugin } from "vite";

const LOCAL = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i;

/**
 * A production build that would ship without an API, or aimed at this machine, stops here with a plain message.
 *
 * Without VITE_API_URL the console runs on its fixtures (src/api/client.ts), which is right for design work and
 * wrong for the file that is committed and served: it would look like the product and talk to nothing. The same for
 * a local address, a plain-http one, a local sign-in shim in place of the real Supabase project, or a development token.
 * `ALLOW_DEMO_BUILD=1` is the one way past it, for a deliberate demo build.
 */
export function requireLiveApi(): Plugin {
  return {
    name: "require-live-api",
    apply: "build",
    configResolved(config) {
      if (config.mode !== "production" || process.env.ALLOW_DEMO_BUILD === "1") return;
      const env = config.env as Record<string, string | undefined>;
      const api = env.VITE_API_URL;
      const supabase = env.VITE_SUPABASE_URL;
      const problems: string[] = [];
      if (!api) problems.push("VITE_API_URL is not set: the console would run on its demo fixtures and talk to no API.");
      else if (!api.startsWith("https://") || LOCAL.test(api))
        problems.push("VITE_API_URL must be an https address that is not on this machine.");
      if (supabase && (!supabase.startsWith("https://") || LOCAL.test(supabase)))
        problems.push("VITE_SUPABASE_URL points at a local shim; leave it unset so the production project is used.");
      if (env.VITE_DEV_API_TOKEN) problems.push("VITE_DEV_API_TOKEN is set: a development token must not be built into production.");
      if (problems.length)
        throw new Error(`unsafe production build:\n  ${problems.join("\n  ")}\n  (ALLOW_DEMO_BUILD=1 builds a demo on purpose.)`);
    },
  };
}
