# Tester brief, round 2 (12 Oct 2026)

You are a tester verifying the integrated SuperHyre build LIVE against `docs/e2e-matrix-2026-10-11.md` (rows S, O, A, C and the
Round 2 additions K, P, M, V). You TEST; you do not edit product code. Be adversarial and exhaustive: the owner's complaint is
that earlier rounds declared completeness without covering the cases. For each row do the real steps in the real product,
then the variations a person would try (wrong input, double clicks, refresh mid-way, back, slow network, two tabs, another
person in a private window, another role, mobile width, dark mode).

Read `docs/round-brief-2026-10-11.md` (rules; ignore ownership), the matrix, the earlier tester reports `docs/e2e-2026-10-11/t1..t5.md`
(what failed before: confirm each is fixed), and the specs in `docs/` that touch your rows (`workspaces-and-orgs.md`,
`agent-framework.md`, `contacts.md`, `calls.md`, `signup-flow.md`, `agent-architecture.md`, `server/docs/memory.md` in the platform).

Stack (running; do not restart or stop anything): console http://localhost:5173/access/ (any email, code `000000`; Google picker
local), API :8090, gateway :8100 (Haiku 4.5, slow: 20 to 110 s per spec draft, 2 to 14 s per chat turn, shared by testers:
be patient), simulators: Crustdata :8130, Slack+Notion :8140 (`xoxb-sim-token`, `secret_sim_token`), Google/Gmail :8150, SalesQL
:8160, Apollo :8170 (pending then callback). Postgres :55432 (superhyre/superhyre/superhyre_dev, read-only psql encouraged to
verify what the UI claims), Qdrant :56333. Logs `~/.superhyre-dev/*.log`. Driver library: `auth-app/scripts/e2e/cdp.py`
(python3 `websockets`, `/usr/bin/google-chrome`, run WITHOUT `-I`); use your own Chrome debugging port; `localhost` not
127.0.0.1; copy examples into `/tmp/claude-1000/e2e-<id>/`. Look at your screenshots yourself (Read tool); do not list paths.

Accounts: use ONLY addresses with your prefix (work domains `<prefix>-co.io`, free-mail `<prefix>.<name>@gmail.com`). The demo
organisation is `own@fn3qa.dev` (owner; Gmail/Slack/Notion connected; seeded calls; fetched contacts): T-agent and T-views may
mutate it, others read only.

Evidence: PASS only if seen in the running product (and in the DB/API where the row says so). BLOCKED = could not be tried, with
how far you got. Deliverable: `docs/e2e-2026-10-12/<id>.md` (table per row: PASS/FAIL/BLOCKED, steps, what you saw; for FAIL
minimal repro, expected vs actual, severity S1 broken/data wrong/security, S2 wrong behaviour, S3 polish, area guess) plus extra
defects outside the matrix. Final message: counts and the S1/S2 FAIL list, one line each. Short.

## Machine resources (the owner's rule, firm)

The laptop ran out of memory in the first attempt (about 16 GB of leftover headless Chromes). Therefore:

- Testers may run in parallel (owner OK'd it) but each tester uses at most ONE Chrome at any moment, never more, and closes
  every tab and the browser when finished. Change viewport with the DevTools emulation call on the same Chrome instead of
  opening another one; open a second tab only when you need a second person, and close it right after.
- Close or kill your Chrome before you start another, and when you finish. `cdp.py` now reaps its Chrome (whole process
  group, profile dir) on `close()` and when python exits; always `await b.close()` in a `try/finally`. Do not leave a
  daemon, a background server, a watcher or a long-lived Chrome running between steps; if you need state across shell calls,
  save cookies/ids to a file and start a fresh short-lived Chrome.
- Never kill by a bare `pkill -f chrome`: that can hit the owner's own browser. Kill only your own process groups.
- Before you report, check `pgrep -fc '[u]ser-data-dir=/tmp/(cdp-profile|claude-1000/e2e)'` prints 0 and remove your
  `/tmp/cdp-profile-*` leftovers. Keep screenshots small (viewport only, no full-page captures in loops) and delete the ones
  you no longer need.
- Prefer API/psql checks over a browser wherever the row allows it; use the browser for what is visual or interactive.
- A previous attempt of your row may have left notes and scripts in `/tmp/claude-1000/e2e-<id>/` (results json, helpers):
  read them to skip work already done, but re-verify anything not clearly PASS.
