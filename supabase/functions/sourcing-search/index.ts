// sourcing-search — JD in, ranked ContactOut candidates out, gated to the
// SuperHyre team. Ported from the local sourcing/ tool's server.js. The
// difference is entirely in WHO calls it and WHERE state lives: this runs for
// any signed-in SuperHyre teammate rather than one laptop, and the SQLite run
// log + seen-set move to core.sourcing_runs / core.sourcing_candidates (see
// db.ts) so "already delivered for this JD" is shared across the whole team
// instead of one machine's file.
//
// Auth follows reveal-phone's pattern exactly: verify_jwt lets the anon key
// through the platform gateway (it carries no user), so authenticatedJwt()
// below is what actually separates a signed-in recruiter from anyone who
// extracted the publishable key out of the auth-app bundle. The Postgres side
// enforces it again independently (core.require_superhyre()), so a bug here
// is not the only thing standing between this function and SuperHyre's paid
// ContactOut/AI-gateway credits.
//
// Secrets (set with `supabase secrets set`, never committed):
//   AI_GATEWAY_URL, AI_GATEWAY_API_KEY  — new, must be added
//   CONTACTOUT_API_KEY                  — already set (shared with reveal-phone)
import * as db from "./db.ts";
import { runSearch } from "./search.ts";
import { DATA_TYPES, canonical } from "./enums.ts";

const MODEL = Deno.env.get("SOURCING_MODEL") || "claude-sonnet";
const MAX_PAGES = Number(Deno.env.get("SOURCING_MAX_PAGES") || 12);
const MAX_RESULTS = Number(Deno.env.get("SOURCING_MAX_RESULTS") || 100);

// The auth-app's own documented origins (auth-app/README.md): production plus
// the two local-dev hosts `npm run dev` binds to.
const ALLOWED_ORIGINS = new Set([
  "https://superhyre.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://superhyre.com";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    vary: "origin",
  };
}

function json(body: unknown, origin: string | null, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "content-type": "application/json" },
  });
}

/**
 * The gateway has already verified the signature (`verify_jwt`), but it accepts
 * the anon/publishable key too — which carries no user. Reading the `role`
 * claim is what separates a signed-in recruiter from anyone who extracted the
 * publishable key out of the bundle. A publishable key is not even a JWT, so it
 * fails the parse and is rejected here.
 */
function authenticatedJwt(req: Request): string | null {
  const raw = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  try {
    const pad = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(pad + "=".repeat((4 - (pad.length % 4)) % 4)));
    return claims?.role === "authenticated" && claims?.sub ? raw : null;
  } catch {
    return null;
  }
}

/** Strips the function's own name (and, when present, the platform's
 *  /functions/v1 prefix) off the path, so routing reads the same regardless
 *  of which form the request arrived in. */
function route(pathname: string): string {
  return pathname.replace(/^\/(functions\/v1\/)?sourcing-search/, "") || "/";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

  const jwt = authenticatedJwt(req);
  if (!jwt) return json({ error: "unauthenticated" }, origin, 401);

  const url = new URL(req.url);
  const path = route(url.pathname);

  try {
    if (req.method === "GET" && path === "/history") {
      const limit = Number(url.searchParams.get("limit")) || 40;
      const runs = await db.history(limit, jwt);
      return json({ runs }, origin);
    }

    const runMatch = path.match(/^\/runs\/([0-9a-f-]{36})$/i);
    if (req.method === "GET" && runMatch) {
      const run = await db.runGet(runMatch[1], jwt);
      return json(run, origin);
    }

    if (req.method === "POST" && path === "/forget") {
      const body = await req.json().catch(() => ({} as Record<string, unknown>));
      if (!body?.jd && !body?.jdHash) return json({ error: "jd or jdHash required" }, origin, 400);
      const result = await db.forget(body, jwt);
      return json(result, origin);
    }

    if (req.method === "POST" && path === "/search") {
      // Checked before touching the DB or streaming anything back: a run row
      // for a search that cannot possibly complete is just noise in the
      // history, and the point of failing here is a plain, non-technical
      // message rather than whatever gateway.ts's or contactout.ts's own
      // "must be set as a function secret" exception says.
      const configured = Deno.env.get("AI_GATEWAY_URL") && Deno.env.get("AI_GATEWAY_API_KEY")
        && Deno.env.get("CONTACTOUT_API_KEY");
      if (!configured) {
        return json({ error: "Sourcing isn't finished being set up yet. Ask an admin to enable it." }, origin, 503);
      }

      const body = await req.json().catch(() => ({} as Record<string, unknown>));
      const jd = String(body.jd || "").trim();
      if (jd.length < 40) return json({ error: "Paste a job description (at least 40 characters)." }, origin, 400);

      const count = Math.min(Math.max(Number(body.count) || 20, 1), MAX_RESULTS);
      const dataTypes = Array.isArray(body.dataTypes)
        ? (body.dataTypes as unknown[]).map((t) => canonical(DATA_TYPES, t)).filter((v): v is string => Boolean(v))
        : [];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const emit = (event: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          };
          try {
            await runSearch({
              jd,
              comments: String(body.comments || "").trim(),
              count,
              revealInfo: Boolean(body.revealInfo),
              dataTypes: dataTypes.length ? dataTypes : ["work_email"],
              fastForward: body.fastForward !== false,
              broaden: body.broaden !== false,
              score: body.score !== false,
              model: MODEL,
              maxPages: MAX_PAGES,
            }, jwt, emit);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { ...cors(origin), "content-type": "application/x-ndjson", "cache-control": "no-store" },
      });
    }

    return json({ error: "not found" }, origin, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, origin, 500);
  }
});
