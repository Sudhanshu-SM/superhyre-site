import { CaretDown, SidebarSimple, SignOut } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { GROUP_OF, NAV, ROUTES } from "./nav";
import type { NavItem, RouteId } from "./nav";

/**
 * The sidebar.
 *
 * ── THREE STATES, ONE COMPONENT ─────────────────────────────────────────────
 *   expanded  icons + labels, the default on a desktop
 *   rail      icons only, toggled by the button in the brand row and remembered
 *   drawer    below `--nav-bp` it slides in over the content, because 252px of
 *             a 360px screen is not a sidebar, it is the whole screen
 *
 * The drawer is the same markup, not a second nav — a duplicated mobile menu is
 * how a link gets added in one place and missed in the other.
 *
 * ── HOW RAIL MODE KEEPS ITS ACCESSIBLE NAMES ────────────────────────────────
 * Collapsing must not cost information. Every row keeps its label text in the
 * DOM and loses only its width, so a screen reader still reads "Candidates"
 * where the eye sees an icon; the sighted equivalent is a CSS tooltip fed from
 * `data-label`.
 */

const ICON = 20;
/* Regular, not the `bold` the form fields use: at 20px in a quiet sidebar bold
   icons read as active when nothing is. The reference design's rows are all
   thin outlines for the same reason. */
const WEIGHT = "regular" as const;

type Props = {
  route: RouteId;
  onNavigate: (id: RouteId) => void;
  /** Which collapsible groups are open. Owned by Console so it survives the
   *  drawer unmounting and so a route change can open the right group. */
  openGroups: Record<string, boolean>;
  /** `force` set means "open regardless", which is what expanding out of rail
   *  mode needs — toggling would close a group that was already open. */
  onToggleGroup: (id: string, force?: boolean) => void;
  railed: boolean;
  onToggleRail: () => void;
  /** Drawer only: present below the breakpoint, closes after a navigation. */
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  /** Already resolved by Console — full_name, or the email local-part when the
   *  account has no profile row yet. */
  name: string;
  email: string;
  onSignOut: () => void;
  signingOut: boolean;
};

export function Nav({
  route, onNavigate, openGroups, onToggleGroup,
  railed, onToggleRail, drawerOpen, onCloseDrawer,
  name, email, onSignOut, signingOut,
}: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const panel = useRef<HTMLDivElement>(null);

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

  /* Focus moves into the drawer when it opens, otherwise a keyboard user tabs
     from the menu button straight past the nav they just opened. */
  useEffect(() => {
    if (drawerOpen) panel.current?.focus();
  }, [drawerOpen]);

  const go = (id: RouteId) => {
    onNavigate(id);
    onCloseDrawer();
  };

  /* In rail mode a group cannot show its children — there is no room, and the
     labels would stack under the icon as stray text. So the row expands the
     sidebar and opens the group in one move, which is also how you get back to
     a usable nav without hunting for the toggle. */
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
      {/* Backdrop is the drawer's click-away. aria-hidden because Escape and the
          close button are the accessible paths out; a focusable backdrop would
          just be a tab stop with no name. */}
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
        <div className="nav-head">
          <span className="nav-brand">
            <svg className="nav-mark" viewBox="0 0 31 62" aria-hidden="true" focusable="false">
              <rect x="15.5" y="0" width="15.5" height="15.5" />
              <rect x="0" y="15.5" width="15.5" height="15.5" />
              <rect x="15.5" y="31" width="15.5" height="15.5" />
              <rect x="0" y="46.5" width="15.5" height="15.5" />
            </svg>
            <span className="nav-word">superhyre</span>
          </span>

          {/* Hidden in the drawer: on mobile the rail would be a 68px strip over
              the content, which is neither the nav nor the page. */}
          <button
            type="button"
            className="nav-rail-btn"
            onClick={onToggleRail}
            aria-pressed={railed}
            aria-label={railed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <SidebarSimple size={17} weight={WEIGHT} aria-hidden="true" />
          </button>
        </div>

        <nav className="nav-body" aria-label="Main">
          {NAV.map((section) => (
            <div className="nav-sec" key={section.id}>
              {section.label && <h2 className="nav-sec-label">{section.label}</h2>}
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
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Profile. Lives at the foot of the nav rather than in a top bar so
            the account and the sign-out sit together in one place, and so the
            content area carries no chrome of its own on desktop.

            The name is a plain span, not a menu: there is no profile page to
            open yet, and a button that leads nowhere is worse than a label. */}
        <div className="nav-foot">
          <div className="nav-me-row">
            <span className="nav-avatar" aria-hidden="true">{initial}</span>
            <span className="nav-me">
              <span className="nav-me-name">{name}</span>
              <span className="nav-me-mail">{email}</span>
            </span>
          </div>

          <button
            type="button"
            className="nav-out"
            onClick={onSignOut}
            disabled={signingOut}
            /* The visible label carries the name at full width, so no
               aria-label here — it would only shadow the text. data-label is
               for the rail tooltip, where the label collapses to an icon. */
            data-label="Sign out"
          >
            <SignOut size={16} weight={WEIGHT} aria-hidden="true" />
            <span className="nav-out-label">
              {signingOut ? "Signing out" : "Sign out"}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}

function Row({
  item, route, railed, open, onGroupClick, onGo,
}: {
  item: NavItem;
  route: RouteId;
  railed: boolean;
  open: boolean;
  onGroupClick: (id: string) => void;
  onGo: (id: RouteId) => void;
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
          onClick={(e) => {
            /* Left-click navigates in place; the href stays real so
               middle-click, ctrl-click and "copy link" all behave. */
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onGo(item.id);
          }}
        >
          <item.Icon className="nav-ico" size={ICON} weight={WEIGHT} aria-hidden="true" />
          <span className="nav-label">{item.label}</span>
        </a>
      </li>
    );
  }

  /* A group's own row is a toggle, not a link: the group has no page of its
     own, so navigating it would have to pick a child arbitrarily. It still
     shows as active when one of its children is, which is what makes the
     collapsed state readable. */
  const childActive = GROUP_OF[route] === item.id;
  /* Rail mode hides the children with `display: none`, taking them out of the
     accessibility tree — so reporting "expanded" there would be a lie. */
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
      >
        <item.Icon className="nav-ico" size={ICON} weight={WEIGHT} aria-hidden="true" />
        <span className="nav-label">{item.label}</span>
        <CaretDown
          className={`nav-caret${open ? " is-open" : ""}`}
          size={14} weight="bold" aria-hidden="true"
        />
      </button>

      {/* `hidden` when shut keeps the children out of the tab order and off the
          accessibility tree, which is stronger than relying on CSS alone. */}
      <ul className="nav-sub" id={`nav-group-${item.id}`} hidden={!expanded}>
        {item.children.map((child) => {
          const active = route === child.id;
          return (
            <li key={child.id}>
              <a
                className={`nav-sub-row${active ? " is-active" : ""}`}
                href={`#${ROUTES[child.id].path}`}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onGo(child.id);
                }}
              >
                {child.label}
              </a>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
