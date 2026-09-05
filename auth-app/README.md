# auth-app — the `/access/` sign-in surface

React + Vite source for `https://superhyre.com/access/`. Deliberately **not linked
from anywhere on the marketing site**, and `noindex, nofollow`: it is the operator
entrance, reachable by people who were told the URL.

```
auth-app/          source (this folder, not served)
  npm run build →  ../access/   committed build output (served by Pages)
```

## Why the build output is committed

The site deploys through **GitHub Pages in branch-root mode**: Pages serves whatever
sits at the top of `main`, and there is no Actions workflow. Nothing builds on push,
so a `dist/` that only exists on a laptop would 404 in production.

Two alternatives were considered and rejected:

- **Add a Pages Actions workflow.** Cleaner in principle, but it means changing the
  repo's Pages source in the GitHub dashboard, which cannot be done from here, and it
  converts every content edit on the static pages into a CI run.
- **React from a CDN, no build.** Keeps the zero-dependency property, but gives up
  TypeScript, JSX, and dependency pinning for the one surface where auth correctness
  matters most.

So: source in `auth-app/`, output committed to `/access/`. `vite.config.ts` bakes
`base: "/access/"` in, which is what makes the asset URLs resolve there.

**After changing anything under `auth-app/src/`, run `npm run build` and commit
`../access/` alongside it.** The site has no step that will do it for you.

## Commands

```bash
npm install
npm run dev          # localhost dev server, serves at /access/
npm test             # 30 unit tests, pure logic only
npm run type-check   # tsc --noEmit
npm run build        # type-check + emit ../access/
```

## Two prerequisites in the Supabase dashboard

Neither can be set from this repo, and **Google sign-in silently fails without the
first one** — the provider bounces back to the site with no session and no error.

1. **Authentication → URL Configuration → Redirect URLs** must include every origin
   this surface runs on:
   - `https://superhyre.com/access/`
   - `http://localhost:5173/access/` and `http://127.0.0.1:5173/access/` for `npm run dev`
2. **Authentication → Providers → Google** must be enabled with a **web** OAuth client
   (client ID *and* secret). This is a different client from the extension's: the
   extension is a public client using the `id_token` grant against a pinned
   `chromiumapp.org` redirect, and reusing its ID here fails as `invalid_grant`.

## What this shares with the rest of the ecosystem

The same Supabase project as the Chrome extension, so one account works in both.
Signing up here runs the same server-side machinery:

- `core.reject_free_email` — a **Before User Created** hook that rejects consumer
  email domains with HTTP 400, **for Google sign-in as well as password sign-up**.
  `src/validate.ts` mirrors the domain list to fail before the round trip, but the
  database is the authority.
- `core.handle_new_user` → `core.onboard_user` — assigns tenancy by email domain.
  First work-email login on a domain becomes a solo user in `public`; the second
  promotes the domain to an organization, provisions `tenant_<slug>`, and migrates
  the first user's shortlist into it.
- `public.extension_bootstrap()` — called after sign-in to render the *real* workspace
  the database assigned, rather than guessing from the JWT.

## Security

Publishable key only, in `src/config.ts`, exactly as the extension ships it. This
compiles to a static public bundle, so:

**Never add a `sb_secret_…` / service-role key to this app.** It would bypass RLS and
hand every visitor read/write on `core`, `mother_data`, and every `tenant_*` schema.
JWT verification against the project JWKS is a server-side concern; this surface has
no server.

## Design notes

Tokens (`--accent`, `--pixel`, `--serif`, `--ui`, `--rule*`) are **copied** from the
site's `style.css`, not imported — `access.css` is standalone so it does not inherit
213 rules of `.hero` / `.features` layout it never uses. That copy is a drift risk;
if the brand orange changes in `style.css` it must change in `access.css` too.

Contrast budget, measured rather than assumed:

| Pair | Ratio | Used for |
|---|---|---|
| `#EA5A1E` on white | 3.51:1 | display type ≥32px, button fill, borders, focus rings |
| `#0a0a0a` on `#EA5A1E` | 5.64:1 | all rail copy |
| `#131313` on white | 18.6:1 | body, labels, errors |
| `#5c5c5c` on white | 6.7:1 | helper text, placeholders |

The brand orange **fails AA at body size** (needs 4.5:1), which is why errors are
near-black with an orange icon and border rather than orange text, and why the primary
button label is 19px — that clears AA's large-text threshold of 3:1.

Radius scale, one documented rule: `100px` interactive (matches `.pill`), `20px`
containers (matches `.modal`), `10px` inputs (new here).
