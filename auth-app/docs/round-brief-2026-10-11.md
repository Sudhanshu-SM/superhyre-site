# Round brief, 11 to 12 Oct 2026 (rules and owner feedback for anyone working on this round)

Repos: platform `/home/arnab_fedora/Desktop/Pareto Labs/SuperHyre/superhyre-platform` (pnpm; `server/`, `packages/shared/`,
`db/migrations/`), console `/home/arnab_fedora/Desktop/Pareto Labs/SuperHyre/superhyre-site/auth-app`.
Contracts: `docs/agent-framework.md`, `docs/workspaces-and-orgs.md`, `docs/signup-flow.md`, `docs/agent-architecture.md`,
`docs/security-audit-2026-10-10.md`, test matrix `docs/e2e-matrix-2026-10-11.md`, tester reports `docs/e2e-2026-10-11/t1..t5.md`.

## The owner's feedback, verbatim

Sign-up: "Reduce the text sizing and all on the left aligned with the character sizings by a bit. also the silver font kinda
isnt clearly visible and doesnt go too well, experiment a bit on that." / "Not clear what details of the client is required.
also no need to ask for client website, name is enough. we are anyhow not doing any scrapings" / "we dont need to highlight
each one one by one, just normally show them" / "The agent didnt start sourcing when i opened my workspace. Also in the
beginning before starting the campaign do ask for the JD so the sourcing can directly start" / "during signup no need to ask
for workspace name, by default they should signup to their personal. rather ask for organisation name in case they havent
logged in using org gmail. if used org gmail then they should be asked organisation of this name is already present would
you like to join and then can directly join. also data level isolation between personal and org" / "the org level hierarchy
should be properly implemented along with an invite feature and this invite should be an in-house notification coming up in
the notifications".

Console and agent: "remove the extensions tab. we dont need a separate scheduled tab, it should be stored in persistent
memory of the agent" / "the clients tab access and all" / "we dont need place holders for channels and the agent. for the
agent the logo in the background itself looked nice" / "Loader is weird and also dont need asset here. the loader should be
superhyre logo with a spinner around it. for general page loaders as well same format" / "thinking is not visible like
Looking through a pool of candidates, got this many candidates, shortlisting by matching candidates ... they would greatly
improve the performance. Also the latency is too high, juice box has a better performance" / "Asked it to send the rest of the
candidates to the candidates page ... it doesnt understand anything. Please make sure the agent has full knowledge of the
codebase and it can perform all kinds of actions with proper responses" / "looks weird in night mode fix it" / "Data
mismatch ... the agent said he shortlisted all 30 but doesnt seem to be reflected properly" / "what is this draft state, no
need of this, just normal active and closed. provide a CTA in campaigns for it. keep things simple" / "It should
automatically trigger actions for connecting gmail ... This is an Agentic based architecture recruiting platform and the AI is
not able to control the codebase. Also for things which isnt done like the draft status thing it should ask to do it rather
than tell the user to do it. Also their contact info is not fetched ... through crust data maybe" / "Agentic work and
deployment should be a proper framework with proper optimised UI for best UX" / "test the things exhaustively before sending
response of complete, that is the main issue, you are not covering all the cases" / "just now downloaded latest assets for
states and all so use those wherever required" (installed; names unchanged).

## Rules

- Everything is local. No commits, pushes, deploys, no Supabase/Railway calls. Never read or print `server/.env` or any token.
- Never `vite build` into `../access`. Console builds go to a scratch dir: `vite build --outDir <dir> --emptyOutDir` with
  `VITE_API_URL=http://localhost:8090 VITE_SUPABASE_URL=http://localhost:54321`; serve with
  `node --import tsx server/scripts/serve-console.ts <dir> superhyre-site/assets <port>` from `superhyre-platform/server` on YOUR
  port. The stack (`./dev-up.sh` at the repo root) is shared: do not restart or stop :8090/:5173/:8100/:8130/:54321; the
  owner/coordinator restarts it. Verify server changes with vitest.
- Local sign-in: any email, code `000000`. Headless Chrome driver library: `auth-app/scripts/e2e/cdp.py` (python3 with
  `websockets`, `/usr/bin/google-chrome`; run python WITHOUT `-I`). Use `localhost`, not 127.0.0.1. Screenshots are for your own
  checking (Read the png); do not list their paths in reports.
- Product rules: calm human copy; one standard type scale; no dot+pill status badges (plain muted text); no duplicated data on a
  screen (a fact stated once); empty states never sad, errors never scary; no repeated patterns; simple over clever; the loader
  is the logo mark with a ring everywhere, never artwork; no art on the agent avatar/hero, right rail or set-up; model is
  Haiku, never Sonnet. Do not read `superhyre-site/DESIGN.md` in full (grep it).
- Other builders edit the same repos. Re-read a file immediately before editing, use Edit (not Write) on existing files, never
  revert or reformat code you did not write, never `git checkout`/`stash`/`reset`/`clean`.
- Migrations: 176 to 181 exist and are applied to `superhyre_dev`. Next free: 182 (agent), 183 (console-side server needs).
- Gates: `npx tsc --noEmit -p .` and `npx vitest run` (full) in `server/` and `auth-app/` for anything you touch. Tests must be
  real (fail without the change). Do not delete or loosen tests to pass; do not weaken isolation or privacy tests.
- Final report: what changed (per item), files, test counts, what is left or risky. Short. No screenshot paths.
