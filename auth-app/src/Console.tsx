import { List } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { DialerPage } from "./DialerPage";
import { ExtensionPage } from "./ExtensionPage";
import { Nav } from "./Nav";
import { SourcingPage } from "./SourcingPage";
import { GROUP_OF, ROUTES, routeFromHash } from "./routes";
import type { Route, RouteId } from "./routes";
import type { AllowedBootstrap } from "./types";

/**
 * The signed-in surface: a sidebar, a slim bar and one page at a time.
 *
 * ── WHY IT LIVES AT /access/ AND NOT /app/ ──────────────────────────────────
 * GitHub Pages serves static files with no rewrite rules, so a second URL means
 * a second Vite project — which means a second copy of the Supabase client, the
 * publishable key, the design tokens and the auth guard. Two copies of an auth
 * client is how they drift. /access/ already owns the session, so the console
 * replaces the signed-in state in place. Splitting it onto its own URL later is
 * a build-config change, not a rewrite.
 *
 * ── WHY HASH ROUTING ────────────────────────────────────────────────────────
 * Same constraint: no rewrites. `/access/candidates` would 404 on refresh
 * because no such file exists, whereas `#/candidates` never leaves index.html.
 * It costs nothing here and it means every page is linkable and the back button
 * works. The hash is also free of conflict with auth: this app uses the PKCE
 * flow, so Supabase returns `?code=` in the query string, never in the hash.
 *
 * ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────
 * No page shows invented data. Every destination in the nav is backed by a real
 * table (see nav.ts) and every unbuilt one says so and names the table it will
 * read, because a placeholder that admits what it is beats a fake chart.
 */

type Props = {
  bootstrap: AllowedBootstrap;
  onSignOut: () => void;
  signingOut: boolean;
};

/** Must match `--nav-bp` in access.css: above this the sidebar is a column,
 *  below it the sidebar is a drawer. Duplicated into JS because the drawer has
 *  behaviour — scroll lock, auto-close — that CSS cannot express. */
const NAV_BP = 900;
const RAIL_KEY = "superhyre.nav.railed";

/** localStorage throws outright in some privacy modes rather than no-opping,
 *  and a remembered sidebar width is never worth a blank page. */
function readRailed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
}

export function Console({ bootstrap, onSignOut, signingOut }: Props) {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(window.location.hash));
  const [railed, setRailed] = useState(readRailed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /* Seeded so that arriving directly on #/dialer/calls shows an open Dialer
     group — the alternative is a highlighted child inside a collapsed parent. */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const g = GROUP_OF[routeFromHash(window.location.hash)];
    return g ? { [g]: true } : {};
  });

  /* The hash is the single source of truth for which page is showing: clicks
     set it and this listener reacts, so in-app navigation and the back button
     travel exactly the same path. */
  useEffect(() => {
    const onHash = () => {
      const next = routeFromHash(window.location.hash);
      setRoute(next);
      const g = GROUP_OF[next];
      if (g) setOpenGroups((prev) => (prev[g] ? prev : { ...prev, [g]: true }));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const current: Route = ROUTES[route];

  /* Per-page title, so browser history and a tab-heavy window show where you
     were rather than ten identical "SuperHyre" entries. Restored on unmount so
     signing out does not leave a console title on the sign-in page. */
  useEffect(() => {
    const prev = document.title;
    /* Middot, not an em dash: the design references ban the em dash outright in
       user-visible strings, and a tab title is about as visible as it gets. */
    document.title = route === "home" ? "SuperHyre" : `${current.title} · SuperHyre`;
    return () => { document.title = prev; };
  }, [route, current.title]);

  useEffect(() => {
    try { window.localStorage.setItem(RAIL_KEY, railed ? "1" : "0"); } catch { /* not worth failing over */ }
  }, [railed]);

  /* Growing past the breakpoint must close the drawer: it becomes the static
     sidebar at that width, and the scrim would otherwise stay over the page
     with no visible way to dismiss it. */
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${NAV_BP}px)`);
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setDrawerOpen(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* Scroll lock while the drawer is over the content, or the page scrolls
     behind it under the scrim. */
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const navigate = useCallback((id: RouteId) => {
    /* Writing the hash rather than setState: the listener above owns the
       transition, which keeps one code path and gives a history entry. */
    window.location.hash = ROUTES[id].path;
  }, []);

  /* `force` exists for expanding out of rail mode, where the group must end up
     open whatever it was before — a plain toggle would close a group that was
     already open and make the click look broken. */
  const toggleGroup = useCallback((id: string, force?: boolean) => {
    setOpenGroups((prev) => ({ ...prev, [id]: force ?? !prev[id] }));
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const workspace =
    bootstrap.scope === "tenant"
      ? bootstrap.organization_name ?? "Your organization"
      : "Personal workspace";

  return (
    <div className="con">
      {/* First tab stop on the page. With a nav this long, a keyboard user
          otherwise tabs through every row to reach the content. */}
      <a className="con-skip" href="#con-main">Skip to content</a>

      <Nav
        route={route}
        onNavigate={navigate}
        openGroups={openGroups}
        onToggleGroup={toggleGroup}
        railed={railed}
        onToggleRail={() => setRailed((r) => !r)}
        drawerOpen={drawerOpen}
        onCloseDrawer={closeDrawer}
        name={displayName(bootstrap)}
        email={bootstrap.email}
        onSignOut={onSignOut}
        signingOut={signingOut}
      />

      <div className="con-body">
        {/* Mobile-only, and hidden above the breakpoint by CSS: with the account
            now in the nav's profile block, the hamburger is the only thing this
            bar ever holds, and an empty 62px strip is not worth keeping on
            desktop. */}
        <header className="con-bar">
          <button
            type="button"
            className="con-menu"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
          >
            <List size={19} weight="bold" aria-hidden="true" />
          </button>
        </header>

        <main className="con-main" id="con-main" tabIndex={-1}>
          {/* Routes gain a real page here one at a time; everything still on
              Placeholder says so and names the table it will read. */}
          {route === "home" ? (
            <Home bootstrap={bootstrap} workspace={workspace} />
          ) : route === "sourcing" ? (
            <SourcingPage />
          ) : route === "extension" ? (
            <ExtensionPage />
          ) : route === "dialer-calls" ? (
            <DialerPage section="calls" />
          ) : route === "dialer-queue" ? (
            <DialerPage section="queue" />
          ) : (
            <Placeholder route={current} />
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * `full_name` is empty for an account created by password before any profile
 * row exists, so both of these fall through to the email local-part. Kept
 * together and used by both the greeting and the nav profile, because two
 * copies of this fallback is how the sidebar ends up saying "p.raj" while the
 * page says "there".
 */
function displayName(b: AllowedBootstrap): string {
  return b.full_name.trim() || b.email.split("@")[0] || "Signed in";
}

function firstName(b: AllowedBootstrap): string {
  return b.full_name.trim().split(/\s+/)[0] || b.email.split("@")[0] || "there";
}

function Home({ bootstrap, workspace }: { bootstrap: AllowedBootstrap; workspace: string }) {
  const first = firstName(bootstrap);

  return (
    <div className="con-page">
      <h1 className="con-h1 con-h1-hi">Hello, {first}.</h1>
      <p className="con-lede">
        Your account is active and this workspace is ready. There is nothing in
        it yet.
      </p>

      <dl className="con-facts">
        <div>
          <dt>Workspace</dt>
          <dd>{workspace}</dd>
        </div>
        {bootstrap.role && (
          <div>
            <dt>Role</dt>
            <dd>{bootstrap.role}</dd>
          </div>
        )}
        {bootstrap.scope === "tenant" && bootstrap.schema_name && (
          <div>
            <dt>Data</dt>
            <dd>Shared with your team</dd>
          </div>
        )}
      </dl>

      {/* The solo/tenant split is real behaviour someone will hit, so it is
          worth saying out loud here instead of surprising them later. */}
      <p className="con-note">
        {bootstrap.scope === "solo"
          ? "You are the only account on your email domain, so this workspace is yours alone. When a colleague signs up with the same domain, SuperHyre creates a shared team workspace and moves your saved candidates into it."
          : "Candidates saved here are shared with everyone on your email domain. Contact details are shared across the whole SuperHyre platform; your pipeline and notes are not."}
      </p>
    </div>
  );
}

/**
 * An unbuilt page. States what it will do and which table it will read, rather
 * than showing a fake chart or an empty table with invented columns — when the
 * feature lands, this component is what gets replaced, and until then it is
 * honest about the edge of the product.
 */
function Placeholder({ route }: { route: Route }) {
  return (
    <div className="con-page">
      <h1 className="con-h1">{route.title}</h1>
      <p className="con-lede">{route.blurb}</p>

      <div className="con-soon">
        <p className="con-soon-head">Not built yet.</p>
        <p className="con-soon-body">
          When it is, this page reads{" "}
          {route.backing.split(", ").map((table, i, all) => (
            <span key={table}>
              <code>{table}</code>
              {i < all.length - 2 ? ", " : i === all.length - 2 ? " and " : ""}
            </span>
          ))}
          .
        </p>
      </div>
    </div>
  );
}
