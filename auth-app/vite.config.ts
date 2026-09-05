import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

const here = resolve(fileURLToPath(import.meta.url), "..");
/** The site's own assets folder, one level up from this app. */
const SITE_ASSETS = resolve(here, "../assets");

const MIME: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".css": "text/css",
};

/**
 * Serves the SITE's /assets/* at the root during `npm run dev`.
 *
 * Why this exists, because it is not obvious:
 *
 * In production the built app lives at superhyre.com/access/ and the site
 * serves its shared assets at superhyre.com/assets/. So the CSS and markup
 * reference absolute `/assets/access-art.webp`, which is correct there.
 *
 * Under `vite dev` the root is this folder, so that path had nothing behind it
 * and returned 404 — the product illustration and the PP Mondwest font were
 * both silently absent from the dev server while being perfectly fine in the
 * build. Every `vite build` has been printing a "didn't resolve at build time"
 * warning about exactly this and it was easy to wave through, because the
 * production path really does resolve.
 *
 * `publicDir` cannot fix it on its own: with `base: "/access/"` Vite mounts the
 * public folder under the base, so the files land at /access/assets/* and the
 * absolute /assets/* references still miss. A middleware mounted at the server
 * root is the only thing that makes both environments agree, and it keeps a
 * single copy of every asset instead of a symlink or a duplicate folder.
 *
 * `apply: "serve"` — dev only. The build must not copy these; the site already
 * ships them.
 */
function serveSiteAssets(): Plugin {
  return {
    name: "serve-site-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0] ?? "";
        if (!path.startsWith("/assets/")) return next();

        // Normalise before joining, and refuse anything that climbs out of the
        // assets folder — this middleware is reachable by any request.
        const rel = normalize(decodeURIComponent(path.slice("/assets/".length)));
        if (rel.startsWith("..") || rel.includes("\0")) return next();

        const file = join(SITE_ASSETS, rel);
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }

        res.setHeader("Content-Type", MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

// The site deploys through GitHub Pages in "branch root" mode: no CI step runs,
// Pages just serves whatever is committed at the top of `main`. So the built
// output is committed, and it has to be built with the served path baked in.
//
//   base: "/access/"    -> asset URLs resolve at superhyre.com/access/assets/*
//   outDir: "../access" -> the committed folder Pages serves
//
// A relative base ("./") would also resolve, but absolute is what makes the
// Supabase OAuth return land correctly: the provider redirects back to
// /access/ and the page must load its own assets no matter how the URL is
// spelled (with or without the trailing slash).
export default defineConfig({
  base: "/access/",
  plugins: [react(), serveSiteAssets()],

  build: {
    outDir: "../access",
    emptyOutDir: true,
    // The app splits in exactly one place: the brand panel, so the animation
    // library loads after the sign-in form rather than in front of it.
    // Everything else stays in the entry chunk, since a round trip to fetch a
    // text input is worse than shipping it. Chunk names share the access-
    // prefix so the whole surface is greppable in one glob.
    rollupOptions: {
      output: {
        entryFileNames: "assets/access-[hash].js",
        chunkFileNames: "assets/access-[hash].js",
        assetFileNames: "assets/access-[hash][extname]",
      },
    },
  },
});
