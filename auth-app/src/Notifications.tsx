import { CaretDoubleLeft, Check, FunnelSimple, X } from "@phosphor-icons/react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { LIVE } from "./api/client";
import { agoFrom } from "./api/campaigns";
import type { ApiNotification } from "./api/tasks";
import { announce, browserAlertState, dismissBrowserAlerts, enableBrowserAlerts } from "./browserAlerts";
import type { LiveAccount } from "./Console";
import { EmptyArt } from "./EmptyArt";
import { answerInvitation, answerRequest, markAllRead, markRead, useNotifications } from "./homeStore";
import { ANSWERED, askOf, leaveFirstLine, noticeLine } from "./membership";
import { OrgMark } from "./OrgMark";
import { categoriesIn, categoryLabel, emptyLine, visibleNotices } from "./notificationsView";
import type { Category, Filter } from "./notificationsView";
import "./notifications.css";

/**
 * The bell's panel: a full-height sheet docked against the sidebar's right edge, sliding over the page
 * (a full-screen sheet on a phone). What happened that is yours to know about, newest first; a quiet dot
 * marks what is unread; "All / Unread" and a category filter narrow it.
 *
 * Invitations and requests to join are answered where they are read: Accept and Decline on an invitation,
 * Approve and Decline on a request. An invitation follows the person into every workspace, so accepting one
 * from Personal opens the organisation (the console is reloaded for it). Live only: on fixtures the bell has
 * nothing behind it.
 */

/** The number on the bell: unread notifications, or the prototype's sample count on fixtures. */
export function useBellCount(sample: number): number {
  const n = useNotifications();
  return LIVE ? n.unread : sample;
}

/** Below this the panel is the whole screen (the sidebar is a drawer by then). */
const SHEET_PX = 560;
const PANEL_W = 400;

export function NotificationsPanel({ anchor, open, onClose, live }: {
  anchor: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  /** The signed-in account, to reload it after accepting an invitation. */
  live?: LiveAccount;
}) {
  const { items, unread, ready, failed } = useNotifications();
  /* Their own place in an organisation, for the invitation they cannot take up while they are in one. */
  const myRole = live?.me.workspaces.find((w) => w.kind === "org")?.role ?? null;
  /** What is being answered, so its buttons rest and nothing is sent twice. */
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<Filter>({ unreadOnly: false, category: "all" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [alerts, setAlerts] = useState(browserAlertState);
  const [place, setPlace] = useState<{ left: number; sheet: boolean }>({ left: 0, sheet: false });
  const panel = useRef<HTMLElement>(null);
  const menuId = useId();

  /* A browser alert for what arrives while the tab is behind another: only what is new since the bell was
     first read, and only when the person has allowed it. */
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!LIVE || !ready) return;
    if (seen.current === null) { seen.current = new Set(items.map((n) => n.id)); return; }
    for (const n of items) {
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      if (!n.readAt) announce(noticeLine(n), n.id);
    }
  }, [items, ready]);

  /* Docked to the sidebar's right edge, wherever that is (full width, or collapsed to its rail). */
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const nav = anchor.current?.closest(".nav") as HTMLElement | null;
      const right = nav ? Math.round(nav.getBoundingClientRect().right) : 0;
      setPlace({ left: Math.max(0, right), sheet: window.innerWidth <= SHEET_PX });
    };
    measure();
    window.addEventListener("resize", measure);
    const nav = anchor.current?.closest(".nav");
    nav?.addEventListener("transitionend", measure);
    return () => { window.removeEventListener("resize", measure); nav?.removeEventListener("transitionend", measure); };
  }, [open, anchor]);

  /* Esc closes (the category menu first); a click outside, or a move to another page, closes it too. */
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (menuOpen) setMenuOpen(false);
      else { onClose(); anchor.current?.focus(); }
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const hash = () => onClose();
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("hashchange", hash);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("hashchange", hash);
    };
  }, [open, menuOpen, onClose, anchor]);

  /* Focus lands in the panel, so the keyboard is already there. */
  useEffect(() => {
    if (open) { setAlerts(browserAlertState()); panel.current?.focus({ preventScroll: true }); }
    else setMenuOpen(false);
  }, [open]);

  const categories = useMemo(() => categoriesIn(items), [items]);
  /* A category that has emptied out is not a filter to be stuck behind. */
  const effective: Filter = filter.category !== "all" && !categories.includes(filter.category) ? { ...filter, category: "all" } : filter;
  const shown = useMemo(() => visibleNotices(items, effective), [items, effective]);

  if (!LIVE || !open) return null;

  const hold = async (id: string, work: () => Promise<void>) => {
    if (busy.has(id)) return;
    setBusy((b) => new Set(b).add(id));
    try { await work(); } finally { setBusy((b) => { const next = new Set(b); next.delete(id); return next; }); }
  };

  const accept = (n: ApiNotification) => hold(n.id, async () => {
    const done = await answerInvitation(n.id, true);
    if (!done.ok) return;
    onClose();
    // The server has already moved them into it; this loads it, and every list starts from the organisation's.
    await live?.reload();
    live?.say?.(ANSWERED.accepted(n.invitation?.organisationName ?? "the organisation"));
  });
  const decline = (n: ApiNotification) => hold(n.id, async () => {
    const done = await answerInvitation(n.id, false);
    if (done.ok) live?.say?.(ANSWERED.declined);
  });
  const decide = (n: ApiNotification, approve: boolean) => hold(n.id, async () => {
    if (!n.subjectId) return;
    const who = n.text.replace(/\s+wants to join .*$/, "").replace(/\s*\(.*\)$/, "") || "They";
    if (await answerRequest(n.id, n.subjectId, approve)) {
      live?.say?.(approve ? ANSWERED.approved(who, "recruiter") : ANSWERED.turnedDown(who));
    }
  });

  const open_ = (n: ApiNotification) => {
    if (!n.readAt) markRead(n.id);
    const ask = askOf(n);
    if (ask === "open-organisation" && n.organisationId && live) {
      const here = live.me.workspaces.find((w) => w.active)?.organizationId ?? null;
      if (here !== n.organisationId) void live.switchWorkspace(n.organisationId).catch(() => {});
      onClose();
      return;
    }
    const to = n.link ?? (n.subjectKind === "task" ? "#/" : null);
    if (to) window.location.hash = to.replace(/^#/, "");
    onClose();
  };

  const enable = async () => {
    await enableBrowserAlerts();
    setAlerts(browserAlertState());
  };

  const setCategory = (category: Category | "all") => { setFilter({ ...filter, category }); setMenuOpen(false); };
  const empty = ready && !shown.length;
  const style = place.sheet ? undefined : { left: place.left, width: `min(${PANEL_W}px, calc(100vw - ${place.left}px))` };

  return createPortal(
    <aside
      ref={panel}
      tabIndex={-1}
      className={`ntp${place.sheet ? " is-sheet" : ""}`}
      style={style}
      role="dialog"
      aria-label="Notifications"
    >
      <header className="ntp-head">
        <h2 className="ntp-title">Notifications</h2>
        <div className="ntp-seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={!filter.unreadOnly} onClick={() => setFilter({ ...filter, unreadOnly: false })}>All</button>
          <button type="button" aria-pressed={filter.unreadOnly} onClick={() => setFilter({ ...filter, unreadOnly: true })}>Unread</button>
        </div>
        <button type="button" className="ntp-x" aria-label="Close notifications" onClick={() => { onClose(); anchor.current?.focus(); }}>
          <CaretDoubleLeft size={18} aria-hidden="true" />
        </button>
      </header>

      {alerts === "ask" && (
        <div className="ntp-ask">
          <span className="ntp-ask-t">Get notified in your browser when an agent replies.</span>
          <button type="button" className="ntp-ask-go" onClick={() => void enable()}>Enable</button>
          <button type="button" className="ntp-ask-x" aria-label="Not now" onClick={() => { dismissBrowserAlerts(); setAlerts("hidden"); }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="ntp-bar">
        <div className="ntp-cat">
          <button
            type="button"
            className="ntp-catbtn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span>{effective.category === "all" ? "All categories" : categoryLabel(effective.category)}</span>
            <FunnelSimple size={16} aria-hidden="true" />
          </button>
          {menuOpen && (
            <ul className="ntp-menu" id={menuId} role="menu" aria-label="Category">
              {(["all", ...categories] as const).map((c) => (
                <li key={c} role="none">
                  <button type="button" role="menuitemradio" aria-checked={effective.category === c} onClick={() => setCategory(c)}>
                    <span>{c === "all" ? "All categories" : categoryLabel(c)}</span>
                    {effective.category === c && <Check size={14} weight="bold" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {unread > 0 && (
          <button type="button" className="ntp-markall" onClick={() => markAllRead()}>Mark all as read</button>
        )}
      </div>

      <div className="ntp-list" role="list">
        {empty && (
          <div className="ntp-empty">
            <EmptyArt name={failed ? "err-network" : "empty-notifications"} size={96} />
            <p className="t-body-sm">{failed ? "Couldn't check for new notifications. It tries again in a moment." : emptyLine(effective, items.length)}</p>
          </div>
        )}
        {shown.map((n) => {
          const ask = askOf(n);
          const working = busy.has(n.id);
          const blocked = n.invitation?.blockedBy ?? null;
          return (
            <div key={n.id} role="listitem" className={`ntp-row${n.readAt ? "" : " is-unread"}`}>
              <button type="button" className="ntp-line" onClick={() => open_(n)}>
                {n.invitation && <OrgMark name={n.invitation.organisationName} logoUrl={n.invitation.logoUrl} size={28} />}
                <span className="ntp-text">{noticeLine(n)}</span>
                <span className="ntp-when">
                  <span className="t-caption">{agoFrom(n.createdAt)}</span>
                  <span className="ntp-dot" aria-hidden="true" />
                  {!n.readAt && <span className="ntp-sr">Unread</span>}
                </span>
              </button>
              {ask === "answer-invitation" && (
                <div className="nt-acts">
                  {blocked ? (
                    <p className="nt-note t-caption">{leaveFirstLine(blocked, n.invitation?.organisationName ?? "that organisation", n.invitation?.blockedByRole ?? myRole)}</p>
                  ) : (
                    <button type="button" className="nt-btn is-primary" disabled={working} onClick={() => void accept(n)}>Accept</button>
                  )}
                  <button type="button" className="nt-btn" disabled={working} onClick={() => void decline(n)}>Decline</button>
                </div>
              )}
              {ask === "decide-request" && (
                <div className="nt-acts">
                  <button type="button" className="nt-btn is-primary" disabled={working} onClick={() => void decide(n, true)}>Approve</button>
                  <button type="button" className="nt-btn" disabled={working} onClick={() => void decide(n, false)}>Decline</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>,
    document.body,
  );
}
