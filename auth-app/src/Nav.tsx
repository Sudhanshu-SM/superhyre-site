import {
  ArrowClockwise, Bell, Buildings, CaretDown, CaretUpDown, Check, Compass, DotsThree, FolderDashed, FolderOpen,
  MagnifyingGlass, SidebarSimple, SignOut, User,
} from "@phosphor-icons/react";
import { findKey } from "./platform";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BorderGlow } from "./glow";
import { Loader } from "./components/Loader";
import { Shimmer, ShimmerRegion } from "./components/Shimmer";
import { CAMPAIGN_NAV, footNavFor, GROUP_OF, navFor, navLabel, ROUTES, scopePick } from "./nav";
import type { Icon } from "@phosphor-icons/react";
import type { NavItem, NavLeaf, RouteId } from "./nav";
import { CAMPAIGNS, currentWorkspace, workspacesFor } from "./workspaces";
import type { Campaign } from "./workspaces";
import { retryCampaigns, useCampaignRows, useCampaignsFailed, useCampaignsReady } from "./campaignStore";
import { NotificationsPanel } from "./Notifications";
import { OrgMark } from "./OrgMark";
import { RoleSwitch } from "./RoleBits";
import { CHOICES, setThemeChoice, useThemeChoice } from "./theme";
import { firstGlyph } from "./ui";
import { ROLE_LABEL, useSession, visibleCampaigns } from "./roleStore";
import { standingOf } from "./can";
import type { Standing } from "./can";
import { setTabWorkspace } from "./api/client";
import { pendingOrgName, readable, workspaceChanged } from "./api/identity";
import { onboardingApi } from "./api/onboarding";
import type { OrgMatch } from "./api/onboarding";
import { answerInvitation, useNotifications } from "./homeStore";
import { isolationLine, requestSentLine, workspaceHint } from "./membership";
import type { OrgRole } from "./api/identity";
import type { LiveAccount } from "./Console";
import { requestTour } from "./tour/useTour";

const ORG_ROLE_LABEL: Readonly<Record<OrgRole, string>> = { owner: "Owner", admin: "Admin", recruiter: "Recruiter" };

/**
 * The sidebar.
 *
 * ── THREE STATES, ONE COMPONENT ─────────────────────────────────────────────
 *   expanded  icons + labels, the default on a desktop
 *   rail      icons only, toggled by the nudge in the brand row and remembered
 *   drawer    below `--nav-bp` it slides in over the content, because 268px of
 *             a 360px screen is not a sidebar, it is the whole screen
 *
 * The drawer is the same markup, not a second nav — a duplicated mobile menu is
 * how a link gets added in one place and missed in the other.
 *
 * ── HOW COLLAPSING KEEPS ITS ACCESSIBLE NAMES ───────────────────────────────
 * Collapsing must not cost information, and an earlier version of this file
 * claimed that while doing the opposite: it hid labels with `display: none`,
 * which takes them out of the accessibility tree as surely as deleting them.
 * A screen reader on the railed sidebar read nine unlabelled links.
 *
 * Labels now collapse with opacity only. Zero-opacity text is still exposed to
 * assistive tech, so the row keeps its name; the sighted equivalent is a CSS
 * tooltip fed from `data-label`. This is also what makes the transition smooth
 * — see the note on `.nav-fade` in access.css.
 *
 * ── IDENTITY AT BOTH ENDS ───────────────────────────────────────────────────
 * Workspace at the top, account at the bottom. They answer different questions
 * ("which account is this" vs "who am I / how do I leave") and stacking both in
 * the foot had them competing for the same glance. Sign-out lives inside the
 * account menu rather than as a permanent row: it is the least-used control
 * here and it was holding the most prominent slot in the panel.
 */

/* 20px at a 1.5px line (see .nav-ico in access.css): a little larger and lighter than before. */
const ICON = 20;
const WEIGHT = "regular" as const;

/**
 * The hover glow's layers.
 *
 * ── WHY SO MANY ─────────────────────────────────────────────────────────────
 * The glow is a dash swept around an SVG stroke of the control's own outline,
 * which is what makes it follow the curve exactly. What a dash cannot do is
 * fade towards its own ends: `stroke-linecap: round` gives a ROUNDED end, not a
 * faded one, and SVG has no gradient along a dash.
 *
 * Three nested dashes therefore produced three stacked hard ends, which read as
 * a segment with steps in it rather than as light. Blur does not rescue it —
 * blur is isotropic, so softening an end by the amount needed also fattens the
 * line into a cloud, which was the version before that.
 *
 * So the falloff is sampled instead: sixteen dashes, each slightly shorter,
 * narrower, brighter and sharper than the last. The ends land ~1 unit apart and
 * overlap under their own blur, so the ramp reads as continuous, and the
 * composite is faint where only the long faint layers reach and bright where
 * all sixteen coincide. One curve, stated once, rather than sixteen rules.
 *
 * Inline styles rather than sixteen CSS classes: the shape of the falloff is
 * the thing a person needs to read and change, and as arithmetic it is legible.
 * Everything not per-layer — geometry, the dash pair, the centring offset —
 * stays in access.css.
 */

type Props = {
  route: RouteId;
  onNavigate: (id: RouteId) => void;
  openGroups: Record<string, boolean>;
  onToggleGroup: (id: string, force?: boolean) => void;
  railed: boolean;
  onToggleRail: () => void;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  name: string;
  email: string;
  organizationName: string | null;
  notifications: number;
  /** The campaign the sidebar is scoped to, and how to change it. Owned by
   *  Console so the scope survives this component remounting with the drawer. */
  campaign: Campaign;
  onSelectCampaign: (c: Campaign) => void;
  /** Opens the command palette. Owned by Console so the ⌘K binding is global
   *  rather than depending on focus being inside the sidebar. */
  onOpenPalette: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  /** The real account and its workspaces. Absent in prototype mode. */
  live?: LiveAccount;
};

export function Nav({
  route, onNavigate, openGroups, onToggleGroup,
  railed, onToggleRail, drawerOpen, onCloseDrawer,
  name, email, organizationName, notifications, campaign, onSelectCampaign,
  onOpenPalette, onSignOut, signingOut, live,
}: Props) {
  const initial = firstGlyph(name) || "?";
  const panel = useRef<HTMLDivElement>(null);

  const theme = useThemeChoice();
  const [wsOpen, setWsOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const wsRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const wsMenuId = useId();
  const meMenuId = useId();
  const scopeMenuId = useId();

  /* The organisation is the tenant; the workspace is the scope inside it.
     See workspaces.ts — these were one value until they were not. */
  const workspaces = workspacesFor(name, organizationName);
  const current = currentWorkspace(name, organizationName);
  const orgLevel = workspaces.filter((w) => w.level === "org");

  /* Connected: the personal workspace and the organisation, really switched. */
  const [wsError, setWsError] = useState<string | null>(null);
  const liveActive = live?.me.workspaces.find((w) => w.active);
  const liveOrg = live?.me.workspaces.find((w) => w.kind === "org");
  const pending = live ? pendingOrgName(live.me) : null;
  /* In Personal with an organisation they could be in (one that invited them, or one on their work address): the
     switcher offers it, so choosing "Not now" at sign-up never leaves the way in hidden in Settings. */
  const notices = useNotifications();
  const invited = notices.items.find((n) => n.invitation && n.open !== false && !n.invitation.blockedBy)?.invitation ?? null;
  const [onDomain, setOnDomain] = useState<OrgMatch | null>(null);
  const mayOffer = !!live && !liveOrg && !pending && !invited && !live.me.onboarding.personalEmail;
  useEffect(() => {
    if (!wsOpen || !mayOffer || onDomain) return;
    let alive = true;
    onboardingApi.organisationByDomain().then((m) => { if (alive && m) setOnDomain(m); }, () => {});
    return () => { alive = false; };
  }, [wsOpen, mayOffer, onDomain]);
  const offered: { id: string; name: string; hint: string } | null = !live || liveOrg || pending ? null
    : invited ? { id: "join:invite", name: `Join ${invited.organisationName}`, hint: "You were invited" }
    : onDomain ? { id: "join:domain", name: onDomain.joinMode === "direct" ? `Join ${onDomain.name}` : `Ask to join ${onDomain.name}`, hint: onDomain.joinMode === "direct" ? "Your team is already here" : "An admin there approves it" }
    : null;
  const takeOffer = async () => {
    if (!live) return;
    setWsError(null);
    try {
      if (invited) {
        const note = notices.items.find((n) => n.invitation?.id === invited.id);
        const done = note ? await answerInvitation(note.id, true) : { ok: false as const };
        if (!done.ok) return;
        setWsOpen(false);
        await live.reload();
        live.say?.(`You're in ${invited.organisationName}.`);
      } else if (onDomain) {
        const r = await onboardingApi.joinOrganisation(onDomain.id);
        setWsOpen(false);
        if (r.status === "requested") { await live.reload(); live.say?.(requestSentLine(onDomain.name)); return; }
        setTabWorkspace(r.organisationId);
        workspaceChanged();
        await live.reload();
        live.say?.(`You're in ${onDomain.name}.`);
      }
    } catch (err) {
      setWsError(readable(err));
    }
  };
  /* "Personal" and the organisation's own name: a workspace is called by what it is, not by whose it is. */
  const personalName = "Personal";
  const wsName = live ? (liveActive?.kind === "org" ? liveActive.name : personalName) : current.name;

  /* A recruiter's switcher lists only the campaigns they are on. */
  const session = useSession();
  const campaignRows = useCampaignRows();
  const campaignsReady = useCampaignsReady();
  const campaignsFailed = useCampaignsFailed();
  const switchable = useMemo(() => {
    const ok = new Set(visibleCampaigns(campaignRows, session).map((r) => r.id));
    const known = new Set(CAMPAIGNS.map((c) => c.id));
    const made = campaignRows.filter((r) => !known.has(r.id) && ok.has(r.id)).map((r) => ({ id: r.id, name: r.name, role: [r.department, r.location].filter(Boolean).join(" · ") }));
    return [...made, ...CAMPAIGNS.filter((c) => ok.has(c.id))];
  }, [campaignRows, session]);

  const pick = scopePick(switchable.length, { ready: campaignsReady, failed: campaignsFailed });

  /* Escape closes the drawer. Bound to the document rather than the panel so it
     works no matter where focus sits — including the backdrop, which is not
     focusable. Only while open, so Escape stays free on desktop. */
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseDrawer();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, onCloseDrawer]);

  useEffect(() => {
    if (drawerOpen) panel.current?.focus();
  }, [drawerOpen]);

  /* Both menus close on outside click and on Escape. Both, not one: Escape
     alone leaves a mouse user with a menu they can only dismiss by picking
     something, and outside-click alone is unreachable by keyboard.
     One effect for the pair, because opening either must close the other —
     two popovers open at once in a 268px column is just overlap. */
  useEffect(() => {
    if (!wsOpen && !meOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      /* The workspace switcher renders in a portal and dismisses itself (see
         SwitcherPopover); judged from here, a click on its own items is
         "outside" and would close it before the click lands. */
      if (meOpen && !meRef.current?.contains(t)) setMeOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      /* Stop the drawer's own Escape handler from also firing: closing a menu
         and the whole drawer with one key is two undos for one press. */
      e.stopPropagation();
      setWsOpen(false);
      setMeOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [wsOpen, meOpen]);

  /* Collapsing to the rail closes both: they are anchored to rows that are
     about to be 72px wide, and a 212px popup hanging off one is the kind of
     thing that survives a state change looking broken. */
  useEffect(() => {
    if (railed) { setWsOpen(false); setMeOpen(false); setScopeOpen(false); }
  }, [railed]);

  const go = (id: RouteId) => {
    onNavigate(id);
    onCloseDrawer();
  };

  const onGroupClick = (id: string) => {
    if (railed) {
      onToggleRail();
      onToggleGroup(id, true);
      return;
    }
    onToggleGroup(id);
  };

  return (
    <>
      <div
        className={`nav-scrim${drawerOpen ? " is-open" : ""}`}
        onClick={onCloseDrawer}
        aria-hidden="true"
      />

      <div
        ref={panel}
        tabIndex={-1}
        className={`nav${railed ? " is-railed" : ""}${drawerOpen ? " is-open" : ""}`}
      >
        {/* ── brand + nudge ── */}
        <div className="nav-head">
          <span className="nav-brand">
            <svg className="nav-mark" viewBox="0 0 34 35" fill="none" aria-hidden="true" focusable="false">
              <path d="M16.047 0.496124C16.0223 2.74925 16.6685 4.85749 17.9504 6.64333C19.9314 9.36012 22.9612 10.9359 26.1146 11.8233C28.2333 12.4029 30.3556 12.6674 32.605 12.6855V15.9384C30.3697 15.942 28.2969 16.4962 26.3159 17.4562C20.4611 20.3831 15.9694 26.7367 15.9129 33.4961L12.989 33.0868L12.0426 28.5008C11.3117 25.9579 10.3653 23.9656 7.78397 23.1252C6.90469 22.8427 6.03954 22.7014 5.11789 22.5963L1.34654 22.4551L0.60498 19.0464C2.40944 18.8218 4.13268 18.4378 5.79942 17.7315C12.8336 14.714 13.2221 7.87494 13.2362 0.829384L15.9023 0.496124" fill="currentColor" stroke="currentColor" strokeMiterlimit="10" />
            </svg>
            <span className="nav-word nav-fade">superhyre</span>
          </span>

          <button
            type="button"
            className="nav-nudge"
            onClick={onToggleRail}
            aria-pressed={railed}
            aria-label={railed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <SidebarSimple size={15} weight={WEIGHT} aria-hidden="true" />
          </button>
        </div>

        {/* ── workspace, at the top: scope before options ── */}
        <div className="nav-ws-block" ref={wsRef}>
          {wsOpen && (
            <SwitcherPopover
              id={wsMenuId}
              anchor={wsRef}
              placeholder="Search organisations"
              /* Two divisions, because there are exactly two kinds: the scope
                 that is yours alone and the scopes shared across the tenant.
                 The organisation is named in the closing note rather than as a
                 group label — it is the boundary these belong to, not a
                 heading of peers. */
              groups={live ? [
                {
                  id: "personal",
                  label: "Personal",
                  items: [{ id: "personal", name: personalName, hint: workspaceHint({ kind: "personal", role: null }), Icon: User, current: liveActive?.kind !== "org" }],
                },
                ...(liveOrg || pending || offered ? [{
                  id: "org",
                  label: "Organisation",
                  items: liveOrg ? [{
                    id: liveOrg.organizationId ?? "org", name: liveOrg.name,
                    hint: workspaceHint(liveOrg),
                    Icon: Buildings, logoUrl: liveOrg.logoUrl, current: liveOrg.active,
                  }] : pending ? [{ id: "pending", name: pending, hint: "Waiting for an admin to approve you", Icon: Buildings, disabled: true }]
                    : offered ? [{ id: offered.id, name: offered.name, hint: offered.hint, Icon: Buildings }] : [],
                }] : []),
              ] : [
                {
                  id: "personal",
                  label: "Personal",
                  items: workspaces.filter((w) => w.level === "user").map((w) => ({
                    id: w.id, name: w.name, hint: w.hint, Icon: User,
                    current: w.id === current.id, disabled: !w.switchable,
                  })),
                },
                ...(orgLevel.length > 0 ? [{
                  id: "org",
                  label: "Organisations",
                  items: orgLevel.map((w) => ({
                    id: w.id, name: w.name, hint: w.hint, Icon: Buildings,
                    current: w.id === current.id, disabled: !w.switchable,
                  })),
                }] : []),
              ]}
              emptyNote={(q) => <>Nothing matches <strong>{q}</strong>.</>}
              note={live ? wsError ?? (liveActive ? isolationLine(liveActive) : undefined) : organizationName?.trim() ? `Everything shared here belongs to ${organizationName.trim()}` : undefined}
              onPick={(item) => {
                if (!live || item.current) { setWsOpen(false); return; }
                if (item.id.startsWith("join:")) { void takeOffer(); return; }
                setWsError(null);
                live.switchWorkspace(item.id === "personal" ? null : item.id)
                  .catch((err: unknown) => setWsError(readable(err)));
              }}
              onClose={() => { setWsOpen(false); setWsError(null); }}
            />
          )}

          <button
            type="button"
            className={`nav-ws-trigger${wsOpen ? " is-open" : ""}`}
            onClick={() => { setWsOpen((v) => !v); setMeOpen(false); }}
            aria-expanded={wsOpen}
            aria-haspopup="menu"
            aria-controls={wsOpen ? wsMenuId : undefined}
            data-label={wsName}
          >
            {/* The organisation's own initial, so the chip is identity rather
                than decoration. */}
            <span className="nav-ws-chip" aria-hidden="true">
              <OrgMark name={wsName} fill logoUrl={live && liveActive?.kind === "org" ? liveActive.logoUrl : null} />
            </span>
            {/* One line, not two. The hint ("Your organization" / "Personal
                workspace") used to sit under the name here and it was the
                densest thing in the panel's head for the least information:
                the name already says which it is — an org is called by its
                name, a solo scope is called "<Person>'s Workspace". The hint
                still earns its place inside the switcher, where it
                distinguishes rows from each other. */}
            <span className="nav-ws-name nav-fade">{wsName}</span>
            <CaretUpDown className="nav-ws-caret nav-fade" size={14} weight="bold" aria-hidden="true" />
          </button>
        </div>

        {/* ── quick find + notifications ── */}
        <div className="nav-tools">
          {/* A button, not an input. Clicking opens the palette, which owns the
              only text cursor — two search inputs on screen at once is a
              question about which one is listening. */}
          <button
            type="button"
            className="nav-find"
            onClick={onOpenPalette}
            data-label="Quick find"
            data-tour="quick-find"
          >
            <BorderGlow />
            <MagnifyingGlass className="nav-find-ico" size={15} weight={WEIGHT} aria-hidden="true" />
            <span className="nav-find-text nav-fade">Quick find</span>
            <kbd className="nav-find-kbd nav-fade" aria-hidden="true">{findKey()}</kbd>
          </button>

          <button ref={bellRef} type="button" className="nav-bell" data-label="Notifications" data-tour="bell"
            onClick={() => setBellOpen((o) => !o)} aria-expanded={bellOpen}
            aria-label={notifications > 0
              ? `Notifications, ${notifications} unread`
              : "Notifications"}>
            <Bell size={16} weight={WEIGHT} aria-hidden="true" />
            {/* Zero renders nothing: a badge showing 0 is a notification about
                the absence of notifications. Past 9 it caps, because the badge
                is 16px and "12" already fills it. */}
            {notifications > 0 && (
              <span className="nav-bell-badge" aria-hidden="true">
                {notifications > 9 ? "9+" : notifications}
              </span>
            )}
          </button>
          <NotificationsPanel anchor={bellRef} open={bellOpen} onClose={() => setBellOpen(false)} live={live} />
        </div>

        <nav className="nav-body" aria-label="Main">
          {navFor(standingOf(session)).map((section) => (
            <div className="nav-sec" key={section.id}>
              {section.label && <h2 className="nav-sec-label nav-fade">{section.label}</h2>}
              <ul className="nav-list">
                {section.items.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    route={route}
                    railed={railed}
                    open={item.kind === "group" ? openGroups[item.id] === true : false}
                    onGroupClick={onGroupClick}
                    onGo={go}
                    standing={standingOf(session)}
                  />
                ))}
              </ul>
            </div>
          ))}

          {/* ── the selected campaign ──
              No label. The open folder, the name in medium weight and the six
              rows nested under it on a guide line already say "you are inside
              this campaign"; a caption saying so was a second telling. The
              whitespace above separates it from the main nav.

              The scope row is its own markup rather than a generic Row: it
              pairs a link with a menu trigger, and a button nested inside an
              anchor is invalid. */}
          <div className="nav-sec nav-campaign">

            {/* The scope row. An anchor and a button as SIBLINGS, not the
                generic Row: a menu trigger nested inside a link is a button
                inside an anchor, which is invalid and unreachable by keyboard
                in the order a user expects. */}
            {campaign.id ? (
              <div className="nav-scope" ref={scopeRef}>
                <a
                  className="nav-row nav-scope-link"
                  href={`#${ROUTES["campaign-overview"].path}`}
                  aria-current={undefined}
                  data-label={campaign.name}
                  title={campaign.name}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    go("campaign-overview");
                  }}
                >
                  <FolderOpen className="nav-ico" size={ICON} weight={WEIGHT} aria-hidden="true" />
                  <span className="nav-label nav-fade">{campaign.name}</span>
                </a>

                <button
                  type="button"
                  className="nav-scope-more nav-fade"
                  onClick={() => { setScopeOpen((v) => !v); setWsOpen(false); setMeOpen(false); }}
                  aria-expanded={scopeOpen}
                  aria-haspopup="menu"
                  aria-controls={scopeOpen ? scopeMenuId : undefined}
                  aria-label={`Options for ${campaign.name}`}
                >
                  <DotsThree size={16} weight="bold" aria-hidden="true" />
                </button>

                {scopeOpen && (
                  <SwitcherPopover
                    id={scopeMenuId}
                    anchor={scopeRef}
                    placeholder="Search campaigns"
                    groups={[{
                      id: "campaigns",
                      label: "",
                      items: switchable.map((c) => ({
                        id: c.id, name: c.name, hint: c.role, Icon: FolderOpen,
                        current: c.id === campaign.id,
                      })),
                    }]}
                    emptyNote={(q) => <>No campaign matches <strong>{q}</strong>.</>}
                    footer={{ label: "View all campaigns", onClick: () => { setScopeOpen(false); go("campaigns"); } }}
                    onPick={(item) => {
                      setScopeOpen(false);
                      const hit = switchable.find((c) => c.id === item.id);
                      if (hit) onSelectCampaign(hit);
                    }}
                    onClose={() => setScopeOpen(false)}
                  />
                )}
              </div>
            ) : pick.state === "loading" ? (
              /* The list is on its way: three quiet bars the height of the real rows, and nothing to read. */
              <ShimmerRegion label={pick.label} className="nav-wait">
                {[72, 56, 64].map((w) => <span className="nav-wait-row" key={w} aria-hidden="true"><Shimmer w={`${w}%`} h={12} r={6} /></span>)}
              </ShimmerRegion>
            ) : (
              /* No campaign chosen (a new organisation, or none they're on): one quiet row that
                 opens the same switcher, instead of a folder named "Pick a campaign" over six
                 pages that would all say the same thing. */
              <div className="nav-scope" ref={scopeRef}>
                <button
                  type="button"
                  className={`nav-row nav-scope-pick${pick.state === "failed" ? " is-failed" : ""}`}
                  onClick={() => {
                    if (pick.state === "failed") { retryCampaigns(); return; }
                    if (!switchable.length) { go("campaigns"); return; }
                    setScopeOpen((v) => !v); setWsOpen(false); setMeOpen(false);
                  }}
                  aria-expanded={switchable.length ? scopeOpen : undefined}
                  aria-haspopup={switchable.length ? "menu" : undefined}
                  aria-controls={scopeOpen ? scopeMenuId : undefined}
                  data-label={pick.state === "failed" ? `${pick.label}. Try again` : pick.label}
                  title={pick.state === "failed" ? `${pick.label}. Try again` : pick.label}
                >
                  <FolderDashed className="nav-ico" size={ICON} weight={WEIGHT} aria-hidden="true" />
                  <span className="nav-label nav-fade">{pick.label}</span>
                  {switchable.length > 0 && <CaretUpDown className="nav-scope-caret nav-fade" size={14} aria-hidden="true" />}
                  {pick.state === "failed" && <ArrowClockwise className="nav-scope-caret nav-fade" size={14} aria-hidden="true" />}
                </button>
                {scopeOpen && (
                  <SwitcherPopover
                    id={scopeMenuId}
                    anchor={scopeRef}
                    placeholder="Search campaigns"
                    groups={[{
                      id: "campaigns",
                      label: "",
                      items: switchable.map((c) => ({
                        id: c.id, name: c.name, hint: c.role, Icon: FolderOpen,
                        current: c.id === campaign.id,
                      })),
                    }]}
                    emptyNote={(q) => <>No campaign matches <strong>{q}</strong>.</>}
                    footer={{ label: "View all campaigns", onClick: () => { setScopeOpen(false); go("campaigns"); } }}
                    onPick={(item) => {
                      setScopeOpen(false);
                      const hit = switchable.find((c) => c.id === item.id);
                      if (hit) onSelectCampaign(hit);
                    }}
                    onClose={() => setScopeOpen(false)}
                  />
                )}
              </div>
            )}

            {campaign.id && <ul className="nav-list nav-campaign-list">
              {CAMPAIGN_NAV.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  route={route}
                  railed={railed}
                  open={false}
                  onGroupClick={onGroupClick}
                  onGo={go}
                />
              ))}
            </ul>}
          </div>
        </nav>

        {/* ── support, then the account ── */}
        <div className="nav-foot">
          <ul className="nav-list nav-support">
            {footNavFor(standingOf(session)).map((item) => (
              <Row
                key={item.id}
                item={item}
                route={route}
                railed={railed}
                open={false}
                onGroupClick={onGroupClick}
                onGo={go}
              />
            ))}
          </ul>

          <div className="nav-me-block" ref={meRef}>
            {meOpen && (
              <div className="nav-me-pop" id={meMenuId} role="menu">
                <p className="nav-me-pop-id">
                  <span className="nav-me-pop-name">{name}</span>
                  <span className="nav-me-pop-mail">{email}</span>
                </p>
                {/* Where the organisation gets named. The account menu is where
                    someone asks "which account am I in", so the answer lives
                    here rather than as another line of chrome in the panel. */}
                <p className="nav-me-pop-org">
                  Signed in to <strong>{organizationName?.trim() || "SuperHyre"}</strong>
                </p>

                {/* The demo's role switch. Connected, the role is the real one. */}
                {!live && <RoleSwitch />}

                <div className="nav-me-theme" role="radiogroup" aria-label="Appearance">
                  {CHOICES.map((c) => (
                    <button
                      key={c.id} type="button" role="radio" aria-checked={theme === c.id}
                      className={`nav-me-theme-opt${theme === c.id ? " is-on" : ""}`}
                      onClick={() => setThemeChoice(c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="nav-me-pop-out is-tour"
                  role="menuitem"
                  onClick={() => { setMeOpen(false); onCloseDrawer(); requestTour(); }}
                >
                  <Compass size={15} weight={WEIGHT} aria-hidden="true" />
                  Take the tour
                </button>

                <button
                  type="button"
                  className="nav-me-pop-out"
                  role="menuitem"
                  onClick={onSignOut}
                  disabled={signingOut}
                >
                  <SignOut size={15} weight={WEIGHT} aria-hidden="true" />
                  {signingOut ? <><Loader size="sm" tone="inherit" />Signing out</> : "Sign out"}
                </button>
              </div>
            )}

            <button
              type="button"
              className={`nav-me-row${meOpen ? " is-open" : ""}`}
              onClick={() => { setMeOpen((v) => !v); setWsOpen(false); }}
              aria-expanded={meOpen}
              aria-haspopup="menu"
              aria-controls={meOpen ? meMenuId : undefined}
              data-label={name}
            >
              <span className="nav-avatar" aria-hidden="true">{initial}</span>
              {/* Name over ORGANISATION. The account row is the tenant
                  identity — who you are and which organisation you belong to —
                  and the organisation has nowhere else to live now that the
                  workspace switcher correctly stopped pretending to be it. The
                  email is a detail, and it is one line away in the menu. */}
              <span className="nav-me nav-fade">
                <span className="nav-me-name">{name}</span>
                <span className="nav-me-org">
                  {live
                    ? liveActive?.kind === "org"
                      ? liveActive.role ? `${ORG_ROLE_LABEL[liveActive.role]} at ${liveActive.name}` : liveActive.name
                      /* Personal is yours alone: there is no role in it to name. */
                      : "Personal"
                    : `${ROLE_LABEL[session.role]} at ${organizationName?.trim() || "no organisation"}`}
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({
  item, route, railed, open, onGroupClick, onGo, standing,
}: {
  item: NavItem | NavLeaf;
  route: RouteId;
  railed: boolean;
  open: boolean;
  onGroupClick: (id: string) => void;
  onGo: (id: RouteId) => void;
  standing?: Standing | null;
}) {
  if (item.kind === "leaf") {
    const active = route === item.id;
    return (
      <li>
        <a
          className={`nav-row${active ? " is-active" : ""}`}
          href={`#${ROUTES[item.id].path}`}
          aria-current={active ? "page" : undefined}
          data-label={item.label}
          data-tour={`nav-${item.id}`}
          onClick={(e) => {
            /* Left-click navigates in place; the href stays real so
               middle-click, ctrl-click and "copy link" all behave. */
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onGo(item.id);
          }}
        >
          {/* Filled when current, outline otherwise. Sidebar research is
              blunt about this — an active state resting on colour alone fails
              anyone who cannot separate the hues — and DESIGN.md §5.6 has
              specified it since the iconography sheet landed without it ever
              being wired up. Three stacked signals now: wash, weight, fill. */}
          <item.Icon
            className="nav-ico"
            size={ICON}
            weight={active ? "fill" : WEIGHT}
            aria-hidden="true"
          />
          <span className="nav-label nav-fade">{item.label}</span>
        </a>
      </li>
    );
  }

  const childActive = GROUP_OF[route] === item.id;
  const expanded = railed ? false : open;
  return (
    <li>
      <button
        type="button"
        className={`nav-row nav-row-group${childActive ? " is-within" : ""}`}
        onClick={() => onGroupClick(item.id)}
        aria-expanded={expanded}
        aria-controls={`nav-group-${item.id}`}
        data-label={item.label}
        data-tour={`nav-${item.id}`}
      >
        <item.Icon
          className="nav-ico"
          size={ICON}
          weight={childActive && !expanded ? "fill" : WEIGHT}
          aria-hidden="true"
        />
        <span className="nav-label nav-fade">{item.label}</span>
        <CaretDown
          className={`nav-caret nav-fade${open ? " is-open" : ""}`}
          size={12} weight="bold" aria-hidden="true"
        />
      </button>

      {/* Height is animated with a grid-rows trick in CSS rather than toggling
          `hidden`, so opening Analytics slides instead of snapping — and
          `display: none` cannot be transitioned at all.

          Which leaves the closed children still in the document, so they are
          taken out of both paths to them explicitly: `tabIndex={-1}` below
          removes the tab stop, `aria-hidden` removes them from browse mode.
          `inert` would do both in one attribute and is the right answer, but
          React 18's JSX types have no such property — revisit at React 19.
          aria-hidden on focusable content is a violation, so the tabIndex is
          not optional decoration here; the two go together. */}
      <div
        className={`nav-sub-wrap${expanded ? " is-open" : ""}`}
        aria-hidden={expanded ? undefined : true}
      >
        <ul className="nav-sub" id={`nav-group-${item.id}`}>
          {item.children.map((child) => {
            const active = route === child.id;
            return (
              <li key={child.id}>
                <a
                  className={`nav-sub-row${active ? " is-active" : ""}`}
                  href={`#${ROUTES[child.id].path}`}
                  aria-current={active ? "page" : undefined}
                  tabIndex={expanded ? undefined : -1}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                    e.preventDefault();
                    onGo(child.id);
                  }}
                >
                  {navLabel(child.id, child.label, standing)}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

/** One row in a switcher. */
type SwitchItem = {
  id: string;
  name: string;
  hint: string;
  Icon: Icon;
  /** An organisation's own logo, drawn in place of the glyph when it has one. */
  logoUrl?: string | null;
  /** Marked with a check and a filled glyph. */
  current?: boolean;
  /** Rendered, dimmed, and refuses the click. Naming a capability is useful;
   *  pretending it works is not. */
  disabled?: boolean;
};

/** A labelled division within a switcher. An empty label renders no heading. */
type SwitchGroup = { id: string; label: string; items: SwitchItem[] };

/**
 * A switcher popover: search field over a grouped list, hanging off a row.
 *
 * ── WHY THIS IS SHARED ──────────────────────────────────────────────────────
 * Two controls in this sidebar have exactly this anatomy — the campaign
 * switcher and the workspace switcher — and the fiddly parts are not the
 * markup. They are the portal, the position measurement, the keyboard cursor,
 * the focus latch and the dismissal, every one of which has already cost a bug
 * once:
 *
 *   · the panel's `overflow: hidden` traps anything rendered inside it, so this
 *     portals to <body> and measures its own position;
 *   · a portal leaves the custom-property scope, which silently produced a
 *     transparent popover until the `--nav-*` tokens moved to :root;
 *   · `--nav-sweep-dur` on `.nav-find` resolved to nothing out here, which
 *     invalidates an `animation` shorthand into `none`;
 *   · focus has to wait for the measured position, or the mount effect runs
 *     before the input exists and the field never takes focus.
 *
 * Duplicating that list was not an option. So the shell is one component and
 * each caller supplies groups, a placeholder and a footer.
 *
 * Keyboard is the point: focus lands in the field, arrows walk the enabled
 * rows across group boundaries, Enter picks, Escape closes.
 */
function SwitcherPopover({
  id, anchor, groups, placeholder, emptyNote, footer, note, onPick, onClose,
}: {
  id: string;
  /** The row it hangs from. Measured for position, and treated as part of the
   *  popover for outside-click purposes so clicking the trigger does not close
   *  and immediately reopen. */
  anchor: React.RefObject<HTMLDivElement | null>;
  groups: SwitchGroup[];
  placeholder: string;
  /** Shown when the query matches nothing. Takes the query as an argument so
   *  it can quote it back. */
  emptyNote: (query: string) => React.ReactNode;
  footer?: { label: string; onClick: () => void };
  /** A quiet closing line — used to name the tenant whose workspaces these
   *  are, which the group labels deliberately do not. */
  note?: string;
  onPick: (item: SwitchItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  /* Name and hint both, so "remote" or "technical" narrows as readily as a
     name does — the hint line is the only other thing on a row. Groups that
     empty out drop away entirely rather than leaving a heading over nothing. */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) => i.name.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [query, groups]);

  /* The keyboard walks enabled rows only, and walks them ACROSS groups: the
     divisions are for reading, not for arrowing into and getting stuck. */
  const walkable = useMemo(
    () => shown.flatMap((g) => g.items).filter((i) => !i.disabled),
    [shown],
  );

  useLayoutEffect(() => {
    const measure = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      /* Anchored so only OVERLAP of its width stays over the panel and the
         rest lies on the page. Measured off the panel's right edge rather than
         the trigger's left, so it holds at either panel width and mid-collapse
         without a second constant to keep in sync. */
      const panel = el.closest(".nav")?.getBoundingClientRect();
      const anchored = panel ? panel.right - WIDTH * OVERLAP : r.left;
      const left = Math.min(anchored, window.innerWidth - WIDTH - 12);
      setPos({ top: r.bottom + 8, left: Math.max(12, left) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor]);

  /* Focus has to wait for `pos`: the first render returns null while the anchor
     is measured, so on mount there is no input yet. Latched, because `pos` also
     updates on resize and re-stealing focus mid-typing is worse than the bug
     it would fix. */
  const focused = useRef(false);
  useEffect(() => {
    if (!pos || focused.current) return;
    focused.current = true;
    input.current?.focus();
  }, [pos]);

  useEffect(() => {
    setCursor((c) => (walkable.length === 0 ? 0 : Math.min(c, walkable.length - 1)));
  }, [walkable.length]);

  /* Dismissal lives here rather than in Nav: in a portal this element is no
     longer inside the block Nav watches, so the shared outside-click handler
     would close it on its own first click. Scroll closes it too — it is
     anchored to a row that can scroll away, and a popover pointing at nothing
     is worse than one that dismissed. `capture` so it hears the nav body,
     whose scroll does not bubble. */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [anchor, onClose]);

  if (!pos) return null;

  const onCursor = walkable[cursor];

  return createPortal(
    <div
      ref={popRef}
      className="nav-switch"
      id={id}
      role="dialog"
      aria-label={placeholder}
      style={{ top: pos.top, left: pos.left, width: WIDTH }}
    >
      <label className="nav-switch-field">
        <BorderGlow />
        <MagnifyingGlass className="nav-switch-ico" size={16} weight={WEIGHT} aria-hidden="true" />
        <input
          ref={input}
          className="nav-switch-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-controls={`${id}-list`}
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              /* Without preventDefault the caret jumps to either end of the
                 input at the same time as the cursor moves. */
              e.preventDefault();
              if (walkable.length === 0) return;
              const step = e.key === "ArrowDown" ? 1 : -1;
              setCursor((c) => (c + step + walkable.length) % walkable.length);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (onCursor) onPick(onCursor);
            }
          }}
        />
      </label>

      {shown.length === 0 ? (
        <p className="nav-switch-empty">{emptyNote(query)}</p>
      ) : (
        <div className="nav-switch-list" id={`${id}-list`}>
          {shown.map((g) => (
            <div className="nav-switch-group" key={g.id}>
              {g.label && <p className="nav-switch-group-label">{g.label}</p>}
              <ul role="listbox" aria-label={g.label || placeholder}>
                {g.items.map((item) => {
                  const on = onCursor?.id === item.id;
                  return (
                    <li
                      key={item.id}
                      role="option"
                      aria-selected={on}
                      aria-disabled={item.disabled || undefined}
                      className={`nav-switch-opt${on ? " is-on" : ""}${item.current ? " is-current" : ""}${item.disabled ? " is-off" : ""}`}
                      title={item.disabled ? "Not available yet" : undefined}
                      /* Pointer and keyboard share one highlight, or Enter
                         becomes a coin toss about which row it takes. */
                      onMouseMove={() => {
                        if (item.disabled) return;
                        const i = walkable.findIndex((w) => w.id === item.id);
                        if (i >= 0) setCursor(i);
                      }}
                      onClick={() => { if (!item.disabled) onPick(item); }}
                    >
                      {item.logoUrl ? (
                        <span className="nav-switch-opt-ico nav-switch-opt-logo"><OrgMark name={item.name} logoUrl={item.logoUrl} size={28} /></span>
                      ) : (
                        <item.Icon
                          className="nav-switch-opt-ico"
                          size={16}
                          weight={item.current ? "fill" : WEIGHT}
                          aria-hidden="true"
                        />
                      )}
                      <span className="nav-switch-opt-text">
                        <span className="nav-switch-opt-name">{item.name}</span>
                        <span className="nav-switch-opt-role">{item.hint}</span>
                      </span>
                      {item.current && <Check size={14} weight="bold" aria-hidden="true" />}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {note && <p className="nav-switch-note">{note}</p>}

      {footer && (
        <button type="button" className="nav-switch-all" onClick={footer.onClick}>
          {footer.label}
        </button>
      )}
    </div>,
    document.body,
  );
}

/* Wider than the panel on purpose — that overhang is the point. */
const WIDTH = 316;
/* How much of it stays over the panel. The rest lies on the content area. */
const OVERLAP = 0.1;
