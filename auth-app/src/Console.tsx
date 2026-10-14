/* The pages are files of their own, fetched when they are first opened (consolePages.ts). */
import {
  Agent, CampaignOutreach, CampaignCandidates, CampaignForms, CampaignOverview, CampaignShortlisted,
  CampaignsAnalyticsPage, CampaignsPage, ClientsPage, ContactsPage, Home, OutreachAnalyticsPage, OutreachPage, OverviewAnalyticsPage,
  PageBoundary, PageFallback, PipelineAnalyticsPage, preloadPages, RecruitersAnalyticsPage, SettingsPage,
} from "./consolePages";
import { List } from "@phosphor-icons/react";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Nav } from "./Nav";
import { Toaster } from "./toast";
import { useBellCount } from "./Notifications";
import { Palette } from "./Palette";
import { CURRENT_CAMPAIGN, defaultCampaign } from "./workspaces";
import { campaignById, requestOpenForm } from "./formsStore";
import type { FormView } from "./formsStore";
import type { Scope } from "./orchestrator";
import type { Campaign } from "./workspaces";
import { campaignFromHash, GROUP_OF, hashForStanding, isKnownHash, redirectedHash, ROUTES, routeAllowed, routeFromHash } from "./nav";
import type { Route, RouteId } from "./nav";
import type { AllowedBootstrap } from "./types";
import { activeOrg } from "./api/identity";
import type { Me } from "./api/identity";
import { LIVE } from "./api/client";
import { connectInvalidation, revalidateCampaign, revalidateRoute } from "./invalidate";
import { startTheme } from "./theme";
import {
  campaignRow as campaignRowOf,
  retryCampaigns,
  useCampaignRow,
  useCampaignRows,
  useCampaignsFailed,
  useCampaignsReady,
} from "./campaignStore";
import { NotOnCampaign } from "./RoleBits";
import { canOpenCampaign, useSession } from "./roleStore";
import { standingOf } from "./can";
import { LoadFailed } from "./ui";
import { NoCampaign } from "./NoCampaign";
import { NotFound } from "./ErrorStates";
import { EmptyArt } from "./EmptyArt";
import { DocTitle } from "./components/DocTitle";
import { openerNow, restoreFocus } from "./components/focusTrap";
import { pageTitle } from "./pageTitle";
import { Loader } from "./components/Loader";
import { COMING_SOON_NOTE, comingSoon } from "./emptyStates";
import { SupportPage } from "./SupportPage";
import { canonicalZone } from "./schedulesView";

/* The first-run tour is a file of its own; it draws nothing until someone is new here or asks for it. */
const TourHost = lazy(() => import("./tour/Tour").then((m) => ({ default: m.TourHost })));

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

/** The signed-in account as the API reports it. Absent in prototype mode. */
export type LiveAccount = {
  me: Me;
  reload: () => Promise<void>;
  switchWorkspace: (organizationId: string | null) => Promise<void>;
  /** One calm line above the console, which outlives a workspace change (the console remounts under it). */
  say?: (text: string) => void;
};

type Props = {
  bootstrap: AllowedBootstrap;
  live?: LiveAccount;
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

/* Experiment: a frosted sidebar over a soft warm light. One flag, so it can
   be judged side by side and removed cleanly (the CSS is the `.con.is-glass`
   block at the end of access.css). */
const GLASS = true;

export function Console({ bootstrap, live, onSignOut, signingOut }: Props) {
  /* A link to a page that has gone is rewritten to where it goes now before anything reads the address. */
  useState(() => {
    const moved = redirectedHash(window.location.hash);
    if (moved) window.history.replaceState(null, "", moved);
  });
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(window.location.hash));
  const [unknownLink, setUnknownLink] = useState(() => !isKnownHash(window.location.hash));
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
      /* A link to a page that has gone is rewritten to where it goes now, so the address and Back agree. */
      const moved = redirectedHash(window.location.hash);
      if (moved) window.history.replaceState(null, "", moved);
      const next = routeFromHash(window.location.hash);
      setRoute(next);
      setUnknownLink(!isKnownHash(window.location.hash));
      const g = GROUP_OF[next];
      if (g) setOpenGroups((prev) => (prev[g] ? prev : { ...prev, [g]: true }));
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const current: Route = ROUTES[route];

  /* ── HANDING A BRIEF BETWEEN PAGES ──
     A bento tile or a task on Home produces a concrete brief, and the composer
     it belongs in now lives on Agent. The console holds the text for the one
     navigation it takes to get there.

     Console state rather than sessionStorage or a query parameter: this is
     in-flight UI state for a single navigation, not something that should
     survive a reload or be shareable as a URL. A link carrying someone else's
     half-written brief would be a strange thing to be able to send. */
  const [handoff, setHandoff] = useState<string | null>(null);
  /* A handoff that should go out as sent, not sit in the composer: an
     explicit "ask the agent" for a thing it can do in full. */
  const [handoffSend, setHandoffSend] = useState(false);
  const clearHandoff = useCallback(() => { setHandoff(null); setHandoffSend(false); }, []);
  const brief = useCallback((prompt: string, opts?: { send?: boolean }) => {
    setHandoff(prompt);
    setHandoffSend(!!opts?.send);
    /* Hash assignment rather than a router call: routeFromHash reads the hash
       and the hashchange listener already drives `route`, so this is the one
       navigation mechanism the console has. */
    window.location.hash = ROUTES.agent.path;
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(RAIL_KEY, railed ? "1" : "0"); } catch { /* not worth failing over */ }
  }, [railed]);

  /* Is the sidebar a drawer right now? Tracked in state, not just in CSS,
     because the rail is a JS concept too and the two were disagreeing.

     The bug: `railed` is remembered in localStorage, so a user who collapsed
     the sidebar on a desktop and then narrowed the window still had
     `is-railed` on the element. CSS neutralised its *appearance* below the
     breakpoint, but Nav's own logic kept reading `railed === true` and forcing
     every group shut — so Analytics rendered an open caret above a collapsed
     list. Measured on a 390px viewport before this existed.

     One source of truth instead: below the breakpoint the rail does not exist,
     and `effectiveRailed` is what anyone downstream asks. The remembered
     preference is untouched and comes back when the window grows. */
  const [isNarrow, setIsNarrow] = useState(
    () => !window.matchMedia(`(min-width: ${NAV_BP}px)`).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${NAV_BP}px)`);
    const onChange = (e: MediaQueryListEvent) => {
      setIsNarrow(!e.matches);
      /* Growing past the breakpoint must close the drawer: it becomes the
         static sidebar at that width, and the scrim would otherwise stay over
         the page with no visible way to dismiss it. */
      if (e.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const effectiveRailed = railed && !isNarrow;

  /* ── THE CONTENT SLIDES, IT DOES NOT REFLOW ──
     The page's grid column used to animate its width, so everything in the
     content column (headings, idea tiles, charts, the composer) re-laid out
     and re-wrapped on every frame of the collapse: measured, the heading was
     clipped mid-word partway through. Now the column snaps to its final
     width once, and the content is moved back to where it was and glided
     into place with a transform, which the compositor runs without layout.
     The sidebar animates its own width over the top (see .nav in
     access.css), on the same duration and curve, so the two edges travel
     together. */
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyWas = useRef<number | null>(null);
  const toggleRail = useCallback(() => {
    bodyWas.current = bodyRef.current?.getBoundingClientRect().left ?? null;
    setRailed((r) => !r);
  }, []);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    const was = bodyWas.current;
    bodyWas.current = null;
    if (!el || was === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dx = was - el.getBoundingClientRect().left;
    if (Math.abs(dx) < 1) return;
    const anim = el.animate(
      [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }],
      { duration: 300, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
    );
    return () => anim.cancel();
  }, [effectiveRailed]);

  /* The palette's open state lives here, not in Nav, so ⌘K works wherever
     focus is — including inside the content area, which is where it will be
     most of the time. A binding that only fires while the sidebar has focus is
     a shortcut nobody can reach. */
  const [paletteOpen, setPaletteOpen] = useState(false);

  /* The scoped campaign lives here, not in Nav: the drawer unmounts Nav on
     every navigation below the breakpoint, and the scope has to survive that.
     Selecting one really re-scopes the sidebar — see workspaces.ts for why that
     is honest while there is no campaigns table. */
  const [campaign, setCampaign] = useState<Campaign>(CURRENT_CAMPAIGN);
  /* Whether `campaign` is one the recruiter chose this session. The default
     above is only a starting scope for the sidebar; the agent assumes a
     campaign only once someone has picked or visited it. */
  const [campaignChosen, setCampaignChosen] = useState(false);
  const chooseCampaign = useCallback((c: Campaign) => {
    setCampaign(c);
    setCampaignChosen(true);
  }, []);
  /* Visiting any campaign page, by link, sidebar or back button, counts. */
  useEffect(() => {
    if (route.startsWith("campaign-")) setCampaignChosen(true);
  }, [route]);
  /* A link from a notification or a task names its campaign: select it, whatever was open. */
  const campaignRowsForLinks = useCampaignRows();
  useEffect(() => {
    const pick = () => {
      const id = campaignFromHash(window.location.hash);
      if (!id) return;
      const c = campaignById(id);
      chooseCampaign(
        c
          ? { id: c.id, name: c.name, role: [c.department, c.location].filter(Boolean).join(" · ") }
          : { id, name: "Campaign", role: "" },
      );
      /* Once the campaign is known the link has done its job; dropping the query keeps a later
         pick in the sidebar from being undone when the list refreshes. */
      if (c) history.replaceState(null, "", window.location.hash.replace(/\?campaign=[^&]*&?/, "?").replace(/\?$/, ""));
    };
    pick();
    window.addEventListener("hashchange", pick);
    return () => window.removeEventListener("hashchange", pick);
  }, [chooseCampaign, campaignRowsForLinks]);

  /* Which campaign the OVERVIEW is reporting on, or all of them.
     Distinct from `campaign` above, and the distinction is real rather than an
     oversight: `campaign` is a NAVIGATION context — it decides which sub-pages
     the sidebar offers, so it is always exactly one campaign and there is no
     "all" for it to be. This is an ANALYTICS scope, which has to be able to
     mean everything, because the first question on a dashboard is usually the
     total. Collapsing the two would force the sidebar to invent sub-pages for
     a campaign that is not selected.

     It lives here, not in Home, so that scoping the overview, walking to the
     Agent and coming back does not silently reset to All. */
  const [scope, setScope] = useState<Scope>("all");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* metaKey for macOS, ctrlKey elsewhere. Checking both rather than
         sniffing the platform: a Mac with an external PC keyboard sends ctrl,
         and the cost of accepting both is nil. */
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Focus returns to whatever opened the palette. Skipping this is the classic
     palette bug: focus lands on <body> and the next Tab restarts at the top of
     the page, which for a keyboard user means losing their place entirely. */
  const paletteOpener = useRef<HTMLElement | null>(null);

  const openPalette = useCallback(() => {
    paletteOpener.current = openerNow();
    setPaletteOpen(true);
  }, []);

  /* Back to the control that opened it; to the page's main area when that is gone (a shortcut from the page body). */
  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    restoreFocus(paletteOpener.current);
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
    if (id.startsWith("campaign-")) setCampaignChosen(true);
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

  /* From a form card in the chat to that form in the builder. */
  const openForm = useCallback((campaignId: string, formId: string, view: FormView) => {
    const c = campaignById(campaignId);
    if (c) setCampaign({ id: c.id, name: c.name, role: [c.department, c.location].filter(Boolean).join(" · ") });
    setCampaignChosen(true);
    requestOpenForm(formId, view);
    /* The form is in the address, so a reload or a shared link reopens it. */
    window.location.hash = `/campaign/forms/${encodeURIComponent(formId)}/${view}`;
    /* The chat's scroll position means nothing on the builder. */
    window.scrollTo(0, 0);
  }, [navigate]);

  /* What every campaign page needs: which campaign, how to move between the
     campaign's pages, and how to hand the agent a seeded prompt. */
  /* A recruiter opening a campaign they are not on sees who runs it, not
     its pages. Admins see everything. */
  const session = useSession();
  const bell = useBellCount(3);
  const campaignRow = useCampaignRow(campaign.id);

  /* Live, open on the most recent campaign once the list arrives; a campaign
     already picked is left alone. The default isn't a choice, so the agent
     still doesn't assume it. */
  const campaignRows = useCampaignRows();
  useEffect(() => {
    if (!LIVE || campaign.id) return;
    const r = defaultCampaign(campaignRows, (x) => canOpenCampaign(x, session));
    if (r) setCampaign({ id: r.id, name: r.name, role: [r.department, r.location].filter(Boolean).join(" · ") });
  }, [campaignRows, campaign.id, session]);
  const campaignsReady = useCampaignsReady();
  const campaignsFailed = useCampaignsFailed();
  /* Live, a campaign page needs a real campaign: none yet (a new organisation, a
     recruiter on no campaigns) or one that's gone gets a plain way forward, never
     a page asking the server about an empty id. */
  const noCampaign = LIVE && route.startsWith("campaign-") && (!campaign.id || (campaignsReady && !campaignRow));
  const offCampaign = route.startsWith("campaign-") && !canOpenCampaign(campaignRow, session);

  /* Everyone's calls is not a page a recruiter has: theirs are each campaign's own Calls. A link to it (an old
     bookmark, a notification) opens their calls on the campaign it names, else the one they are on, else Home.
     Nothing is sent until the list of campaigns has arrived, so "none" is never a guess. */
  const standing = standingOf(session);
  const routeOk = routeAllowed(route, standing);
  useEffect(() => {
    if (routeOk) return;
    if (LIVE && !campaignsReady && !campaign.id) return;
    const here = campaign.id && canOpenCampaign(campaignRow, session) ? campaign.id : null;
    const first = here ?? defaultCampaign(campaignRows, (x) => canOpenCampaign(x, session))?.id ?? null;
    const to = hashForStanding(window.location.hash, standing, first);
    if (to) window.location.replace(to);
  }, [routeOk, standing, campaign.id, campaignRow, campaignRows, campaignsReady, session]);

  /* Light, dark or the device's: set on the page while the console is, and taken off with it. */
  useEffect(() => startTheme(), []);

  /* What the agent changes, what is answered in the chat and what is written here all say what is stale in one
     place (invalidate.ts), and the console reads it again quietly. */
  useEffect(() => (LIVE ? connectInvalidation() : undefined), []);
  /* The pages not opened yet are fetched quietly, once this one has had its turn. */
  useEffect(() => { preloadPages(); }, []);
  /* A page shows what is cached at once and reads the server's numbers again behind it (unless they are under
     15 seconds old): Home's tasks and week, the campaign list, a campaign's board, Settings' team. A page opened
     before the agent did something never shows the old figures. */
  useEffect(() => {
    if (!LIVE) return;
    const onCampaign = route.startsWith("campaign-") && !!campaign.id;
    if (onCampaign) revalidateCampaign(campaign.id);
    revalidateRoute(route, onCampaign ? campaign.id : null);
  }, [route, campaign.id]);

  const cctx = useMemo(() => ({
    campaignId: campaign.id,
    go: navigate,
    onAgent: (prompt?: string, opts?: { send?: boolean }) => brief(prompt ?? `For ${campaign.name}: `, opts),
  }), [campaign.id, campaign.name, navigate, brief]);

  return (
    <div className={`con${GLASS ? " is-glass" : ""}`}>
      {/* The tab says where this is. Settings states its own (its section is known there). */}
      {route !== "settings" && (
        <DocTitle title={pageTitle({
          route,
          unknown: route === "home" && unknownLink,
          campaign: route.startsWith("campaign-") && campaign.id ? campaign.name : null,
          mine: ["recruiter", "personal"].includes(standingOf(session)),
        })} />
      )}
      {/* First tab stop on the page. With a nav this long, a keyboard user
          otherwise tabs through every row to reach the content. */}
      <a className="con-skip" href="#con-main">Skip to content</a>

      <Nav
        route={route}
        onNavigate={navigate}
        openGroups={openGroups}
        onToggleGroup={toggleGroup}
        railed={effectiveRailed}
        onToggleRail={toggleRail}
        drawerOpen={drawerOpen}
        onCloseDrawer={closeDrawer}
        name={displayName(bootstrap)}
        email={bootstrap.email}
        organizationName={bootstrap.organization_name}
        /* Unread notifications when live; the prototype's sample count on fixtures. */
        notifications={bell}
        campaign={campaign}
        onSelectCampaign={chooseCampaign}
        live={live}
        onOpenPalette={openPalette}
        onSignOut={onSignOut}
        signingOut={signingOut}
      />

      {/* The one place a confirmation or a refused change is said, for every page. */}
      <Toaster />

      {/* The introduction and the guided walk, for someone who has just joined (or who asked for them). */}
      <Suspense fallback={null}>
        <TourHost
          userId={session.userId}
          standing={standing}
          route={route}
          navigate={navigate}
          narrow={isNarrow}
          openNav={() => setDrawerOpen(true)}
          closeNav={closeDrawer}
        />
      </Suspense>

      <Palette
        open={paletteOpen} onClose={closePalette} onNavigate={navigate} campaignName={campaign.name}
        onOpenCampaign={(id, page) => {
          const r = campaignRowOf(id);
          if (r) chooseCampaign({ id: r.id, name: r.name, role: [r.department, r.location].filter(Boolean).join(" · ") });
          navigate(page);
        }}
        onAsk={(q) => brief(q)}
        inOrg={!!live && activeOrg(live.me) !== null}
      />

      <div className="con-body" ref={bodyRef}>
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
          {/* A page is a file of its own: the loader stands where it will be until it arrives. */}
          <PageBoundary>
          <Suspense fallback={<PageFallback />}>
          {/* Routes gain a real page here one at a time; everything still on
              Placeholder says so and names the table it will read. */}
          {route === "home" && unknownLink ? (
            /* A link that names no page: say so, with Home one click away, rather than quietly showing Home. */
            <div className="con-page"><NotFound text="That link doesn't go anywhere. It may be old or mistyped." onHome={() => navigate("home")} /></div>
          ) : route === "home" ? (
            <Home onBrief={brief} name={firstName(bootstrap)}
                  scope={scope} onScope={setScope} timeZone={live?.me.user.timeZone ? canonicalZone(live.me.user.timeZone) : undefined}
                  onOpenCampaign={(c) => { chooseCampaign({ id: c.id, name: c.name, role: [c.department, c.location].filter(Boolean).join(" · ") }); navigate("campaign-overview"); }} />
          ) : route === "agent" ? (
            <Agent
              campaign={campaign}
              handoff={handoff}
              handoffSend={handoffSend}
              onHandoffTaken={clearHandoff}
              campaignIsCurrent={campaignChosen}
              onNewChat={() => setCampaignChosen(false)}
              inOrg={!!live && activeOrg(live.me) !== null}
              onOpenForm={openForm}
              onOpenCampaign={(id) => {
                const r = campaignRowOf(id);
                if (r) chooseCampaign({ id: r.id, name: r.name, role: [r.department, r.location].filter(Boolean).join(" · ") });
                navigate("campaign-overview");
              }}
            />
          ) : route === "campaigns" ? (
            <CampaignsPage onOpen={(c) => { chooseCampaign({ id: c.id, name: c.name, role: [c.department, c.location].filter(Boolean).join(" · ") }); navigate("campaign-overview"); }} />
          ) : route === "contacts" ? (
            <ContactsPage />
          ) : route === "calls" ? (
            /* Held on the loader for the moment before a recruiter's link is turned into their campaign's calls. */
            routeOk ? <OutreachPage onAgent={(p) => brief(p)} /> : <PageFallback />
          ) : route === "clients" ? (
            <ClientsPage onOpenCampaign={(c) => { chooseCampaign({ id: c.id, name: c.name, role: [c.department, c.location].filter(Boolean).join(" · ") }); navigate("campaign-overview"); }} />
          ) : route === "settings" && live ? (
            <SettingsPage account={live} />
          ) : LIVE && route.startsWith("campaign-") && campaignsFailed ? (
            /* Without the campaign list nothing here can be shown, and saying there are no
               campaigns would be a wrong answer rather than a missing one. */
            <div className="con-page"><LoadFailed what="Your campaigns" onRetry={retryCampaigns} /></div>
          ) : noCampaign ? (
            campaignsReady ? (
              <NoCampaign
                rows={campaignRows.filter((r) => canOpenCampaign(r, session))}
                canCreate={session.role !== "recruiter"}
                onPick={(r) => chooseCampaign({ id: r.id, name: r.name, role: [r.department, r.location].filter(Boolean).join(" · ") })}
                onNew={() => {
                  try { sessionStorage.setItem("sh-new-campaign", "1"); } catch { /* falls back to just navigating */ }
                  navigate("campaigns");
                }}
                onAll={() => navigate("campaigns")}
              />
            ) : <div className="con-page" aria-busy="true"><Loader size="lg" label="Loading the campaign" block /></div>
          ) : offCampaign ? (
            <NotOnCampaign key={campaign.id} row={campaignRow} onBack={() => navigate("campaigns")} />
          ) : route === "campaign-overview" ? (
            <CampaignOverview key={campaign.id} ctx={cctx} />
          ) : route === "campaign-candidates" ? (
            <CampaignCandidates key={campaign.id} ctx={cctx} />
          ) : route === "campaign-forms" ? (
            <CampaignForms key={campaign.id} ctx={cctx} />
          ) : route === "campaign-shortlisted" ? (
            <CampaignShortlisted key={campaign.id} ctx={cctx} />
          ) : route === "campaign-calls" ? (
            /* The same view as Outreach, with this campaign fixed. */
            <CampaignOutreach key={campaign.id} ctx={cctx} />
          ) : route === "analytics-overview" ? (
            <OverviewAnalyticsPage />
          ) : route === "analytics-recruiters" ? (
            <RecruitersAnalyticsPage />
          ) : route === "analytics-outreach" ? (
            <OutreachAnalyticsPage />
          ) : route === "analytics-pipeline" ? (
            <PipelineAnalyticsPage />
          ) : route === "analytics-campaigns" ? (
            <CampaignsAnalyticsPage />
          ) : route === "support" ? (
            <SupportPage />
          ) : (
            <Placeholder route={current} />
          )}
          </Suspense>
          </PageBoundary>
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

/**
 * The first token of the display name, for the greeting.
 *
 * "Hello Priya Rajan" greets a database row; "Hello Priya" greets a person.
 * Falls through to "there" rather than to the whole string, because the last
 * resort of `displayName` is "Signed in" and "Hello Signed in" is worse than
 * the generic.
 */
function firstName(b: AllowedBootstrap): string {
  const first = displayName(b).split(/\s+/)[0];
  return !first || first === "Signed" ? "there" : first;
}

function Placeholder({ route }: { route: Route }) {
  const soon = comingSoon(route.id);
  return (
    <div className="con-page">
      <h1 className="con-h1">{route.title}</h1>
      <p className="con-lede">{route.blurb}</p>

      <div className="es is-soon">
        <EmptyArt name={soon.art} size={soon.size} />
        <h2 className="es-t t-title-sm">{soon.head}</h2>
        <p className="es-p t-body">{COMING_SOON_NOTE}</p>
      </div>
    </div>
  );
}
