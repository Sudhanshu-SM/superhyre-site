import { Archive, CaretDown, Check, DotsThree, FolderOpen, Folders, MagnifyingGlass, PencilSimple, Plus, PushPin, PushPinSlash, SidebarSimple, Trash, X } from "@phosphor-icons/react";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { NESTED_SHOWN, RECENTS_BATCH, agoLabel, arrangeRail, searchChats, type PinnedCampaign, type RailChat } from "./chatGroups";
import { pinKey, togglePin, usePins } from "./chatPins";
import { Fold } from "./Fold";
import { useFlip } from "./useFlip";

/**
 * The chat history, laid out like the chat apps people already know: New chat, Search and Campaigns at the top, what
 * they pinned (chats, and campaigns with their own chats under them), then Recents, newest first, a few at a time.
 * Hiding it leaves one button in the corner; resting on that button lets the whole list drift in over the page, and
 * pressing it docks the list again. Every row of the person's own has the same small menu: pin, rename, put in a campaign, archive,
 * delete (asked twice, and for good); a campaign's daily search chat has no pin and no campaign to be put in (`menuOffers`).
 */

type Campaign = { id: string; name: string };

type Props = {
  chats: readonly RailChat[] | undefined;
  state: "loading" | "failed" | "ready";
  onRetry: () => void;
  activeId: string | null;
  /** The campaigns a chat can be put in (the ones still running). */
  campaigns: readonly Campaign[];
  hidden: boolean;
  onToggle: () => void;
  /** The campaigns page is showing in place of the conversation. */
  campaignsOpen: boolean;
  onCampaigns: () => void;
  onNew: () => void;
  onNewIn: (campaign: Campaign) => void;
  onOpenCampaign: (id: string) => void;
  onOpen: (chat: RailChat) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onMove: (id: string, campaignId: string | null) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  /** The campaign the person has selected: shown with its chats whether or not it is pinned. */
  selected?: { id: string; name: string } | null;
  /** Removes the chat and its messages for good; the row has asked first. */
  onDelete: (id: string) => Promise<void>;
  /** Above New chat: what the agent is on, its week and its set-up (drawn by the page). */
  top?: ReactNode;
  /** Each time this goes up the search is opened and focused ("/" asks for it). */
  findAsk?: number;
};

const OPEN_KEY = "superhyre.chatrail.open";
const CAMP_KEY = "superhyre.chatrail.campaigns";
/* What the Recents measure with: a row's height with its gap, what the section's heading and "View more" take, and the least shown. */
const ROW_H = 41;
const RECENTS_CHROME = 108;
const MIN_RECENTS = 4;
const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
export const RAIL_SHORTCUT = isMac ? "⌘B" : "Ctrl+B";

function readOpen(): Record<string, boolean> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function ChatRail({
  chats, state, onRetry, activeId, campaigns, hidden, onToggle, campaignsOpen, onCampaigns, onNew, onNewIn, onOpenCampaign,
  onOpen, onRename, onMove, onArchive, onDelete, selected = null, top, findAsk = 0,
}: Props) {
  const pins = usePins();
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen);
  /* How many Recents fit under what is pinned without leaving a gap at the foot (measured), and how many more "View more"
     has brought on top of that. */
  const [fit, setFit] = useState(RECENTS_BATCH);
  const [more, setMore] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  /* Hidden, the list shows while the pointer is on the button or the list, focus is inside it, or one of its menus is open. */
  const [near, setNear] = useState(false);
  const [within, setWithin] = useState(false);
  const [menus, setMenus] = useState(0);
  const leave = useRef<number>();
  const justToggled = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const peek = hidden && (near || within || menus > 0);

  /* The search is where "/" lands: the list is brought back if it was hidden. */
  const hiddenNow = useRef(hidden);
  hiddenNow.current = hidden;
  const toggleNow = useRef(onToggle);
  toggleNow.current = onToggle;
  useEffect(() => {
    if (findAsk < 1) return;
    if (hiddenNow.current) toggleNow.current();
    setSearching(true);
  }, [findAsk]);
  useEffect(() => {
    if (!searching) return undefined;
    const t = window.setTimeout(() => input.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [searching]);
  useEffect(() => {
    if (!flash) return undefined;
    const t = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(t);
  }, [flash]);

  const arranged = useMemo(() => arrangeRail(chats ?? [], pins, campaigns, selected), [chats, pins, campaigns, selected?.id, selected?.name]);
  const found = useMemo(() => searchChats(chats ?? [], q), [chats, q]);
  const searchMode = q.trim().length > 0;
  const count = fit + more;
  const recents = arranged.recents.slice(0, count);
  const pinnedOpen = open.pinned ?? true;
  const selectedOpen = open.selected ?? true;
  const recentsOpen = open.recents ?? true;
  const fold = (key: "pinned" | "recents" | "selected") => {
    const next = { ...open, [key]: !(open[key] ?? true) };
    setOpen(next);
    try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* not worth failing over */ }
  };

  /* What the rows are and their order, not how many of the Recents fit: opening a campaign's chats makes room for fewer, and the
     rows that stay put must not glide for it. "View more" is in it so the rows it brings come in one after another. */
  const signature = searchMode
    ? `s|${found.map((c) => c.id).join(",")}`
    : `${arranged.selected ? `sel:${arranged.selected.id}:${arranged.selected.chats.map((c) => c.id).join(",")}|` : ""}${arranged.pinned.map((p) => (p.kind === "chat" ? p.chat.id : `${p.id}:${p.chats.map((c) => c.id).join(",")}`)).join("|")}~${arranged.recents.map((c) => c.id).join(",")}~${more}`;
  useFlip(body, signature);

  /* The list fills the height it has: as many Recents as fit under the Pinned section, no more and no gap. */
  useEffect(() => {
    const box = body.current;
    if (!box) return undefined;
    const measure = () => {
      const pinnedH = (box.querySelector<HTMLElement>('[data-flip="sec:pinned"]')?.offsetHeight ?? 0)
        + (box.querySelector<HTMLElement>('[data-flip="sec:selected"]')?.offsetHeight ?? 0);
      const room = box.clientHeight - pinnedH - RECENTS_CHROME;
      setFit(Math.max(MIN_RECENTS, Math.floor(room / ROW_H)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(measure);
    watch.observe(box);
    for (const sec of ["pinned", "selected"]) {
      const el = box.querySelector(`[data-flip="sec:${sec}"]`);
      if (el) watch.observe(el);
    }
    return () => watch.disconnect();
  }, [arranged.pinned.length, arranged.selected?.id, searchMode, pinnedOpen, selectedOpen]);

  const pin = (kind: "chat" | "campaign", id: string) => {
    const was = pins.includes(pinKey(kind, id));
    togglePin(kind, id);
    setFlash(was ? null : pinKey(kind, id));
  };
  const hold = useCallback((on: boolean) => setMenus((n) => Math.max(0, n + (on ? 1 : -1))), []);
  const rowProps = { activeId, campaigns, onOpen, onRename, onMove, onArchive, onDelete, onPin: (id: string) => pin("chat", id), hold };

  const closeSearch = () => { setQ(""); setSearching(false); };
  const toggleEnter = () => {
    if (justToggled.current) return;
    window.clearTimeout(leave.current);
    setNear(true);
  };
  const toggleLeave = () => {
    justToggled.current = false;
    window.clearTimeout(leave.current);
    leave.current = window.setTimeout(() => setNear(false), 220);
  };

  const loading = state === "loading" && !chats;
  const empty = !!chats && chats.length === 0 && arranged.pinned.length === 0;

  return (
    <>
      <button
        type="button"
        className={`hx-toggle${hidden ? " is-hidden" : ""}${peek ? " is-peek" : ""}`}
        onClick={() => { justToggled.current = true; window.clearTimeout(leave.current); setNear(false); onToggle(); }}
        onPointerEnter={toggleEnter}
        onPointerLeave={toggleLeave}
        aria-label={hidden ? "Show chats" : "Hide chats"}
        aria-expanded={!hidden}
      >
        <SidebarSimple size={20} aria-hidden="true" mirrored />
        <span className="hx-tip" aria-hidden="true">{hidden ? "Show chats" : "Hide chats"}<kbd>{RAIL_SHORTCUT}</kbd></span>
      </button>

      <nav
        className={`hx-rail${hidden ? " is-hidden" : ""}${peek ? " is-peek" : ""}`}
        aria-label="Chats"
        onPointerEnter={() => { if (hidden) { window.clearTimeout(leave.current); setNear(true); } }}
        onPointerLeave={() => { if (hidden) toggleLeave(); }}
        onFocusCapture={() => setWithin(true)}
        onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setWithin(false); }}
      >
        <div className="hx-panel">
          {top}
          <div className="hx-navs">
            <button type="button" className="hx-nav hx-nav--new" onClick={onNew}>
              <Plus size={20} aria-hidden="true" />
              <span className="hx-nav-l">New chat</span>
            </button>
            {searching ? (
              <label className="hx-nav hx-nav--search is-open">
                <MagnifyingGlass size={20} aria-hidden="true" />
                <input
                  ref={input}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeSearch(); } }}
                  onBlur={() => { if (!q.trim()) setSearching(false); }}
                  placeholder="Search chats"
                  aria-label="Search chats"
                />
                <button type="button" className="hx-clear" onMouseDown={(e) => e.preventDefault()} onClick={closeSearch} aria-label="Close search"><X size={13} weight="bold" /></button>
              </label>
            ) : (
              <button type="button" className="hx-nav hx-nav--search" onClick={() => setSearching(true)}>
                <MagnifyingGlass size={20} aria-hidden="true" />
                <span className="hx-nav-l">Search</span>
                <kbd className="hx-nav-k">/</kbd>
              </button>
            )}
            <button type="button" className={`hx-nav hx-nav--campaigns${campaignsOpen ? " is-on" : ""}`} onClick={onCampaigns} aria-pressed={campaignsOpen}>
              <Folders size={20} aria-hidden="true" />
              <span className="hx-nav-l">Campaigns</span>
            </button>
          </div>

          <div className="hx-body" ref={body}>
            {loading && (
              <div className="hx-skel" aria-hidden="true">
                {[78, 62, 88, 54, 70, 46].map((w, i) => <span key={i} style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }} />)}
              </div>
            )}
            {state === "failed" && !chats && <p className="hx-note">Couldn't load chats. <button type="button" className="hx-link" onClick={onRetry}>Try again</button></p>}
            {empty && !searchMode && <p className="hx-note">Your chats will be here. Ask the agent anything to start one.</p>}

            {searchMode ? (
              found.length ? (
                <ul className="hx-list">
                  {found.map((c) => (
                    <li key={c.id} data-flip={c.id}>
                      <Row chat={c} {...rowProps} pinned={pins.includes(pinKey("chat", c.id))} sub={c.campaignName} />
                    </li>
                  ))}
                </ul>
              ) : <p className="hx-note">No chats match “{q.trim()}”.</p>
            ) : (
              <>
                {arranged.selected && (
                  <section className="hx-sec" data-flip="sec:selected">
                    <SectionHead label="Selected" open={selectedOpen} onToggle={() => fold("selected")} />
                    <Fold open={selectedOpen}>
                      <ul className="hx-list">
                        <li key={arranged.selected.id} data-flip={`selected:${arranged.selected.id}`}>
                          <CampaignBlock
                            item={arranged.selected}
                            current
                            pinned={false}
                            flash={flash === pinKey("campaign", arranged.selected.id)}
                            rowProps={rowProps}
                            onNewIn={onNewIn}
                            onOpenCampaign={onOpenCampaign}
                            onTogglePin={() => pin("campaign", arranged.selected!.id)}
                            hold={hold}
                          />
                        </li>
                      </ul>
                    </Fold>
                  </section>
                )}

                {arranged.pinned.length > 0 && (
                  <section className="hx-sec" data-flip="sec:pinned">
                    <SectionHead label="Pinned" open={pinnedOpen} onToggle={() => fold("pinned")} />
                    <Fold open={pinnedOpen}>
                      <ul className="hx-list">
                        {arranged.pinned.map((p) =>
                          p.kind === "chat" ? (
                            <li key={p.chat.id} data-flip={p.chat.id}>
                              <Row chat={p.chat} {...rowProps} pinned flash={flash === pinKey("chat", p.chat.id)} sub="" />
                            </li>
                          ) : (
                            <li key={p.id} data-flip={pinKey("campaign", p.id)}>
                              <CampaignBlock
                                item={p}
                                current={p.id === selected?.id}
                                pinned
                                flash={flash === pinKey("campaign", p.id)}
                                rowProps={rowProps}
                                onNewIn={onNewIn}
                                onOpenCampaign={onOpenCampaign}
                                onTogglePin={() => pin("campaign", p.id)}
                                hold={hold}
                              />
                            </li>
                          ),
                        )}
                      </ul>
                    </Fold>
                  </section>
                )}

                {arranged.recents.length > 0 && (
                  <section className="hx-sec" data-flip="sec:recents">
                    <SectionHead label="Recents" open={recentsOpen} onToggle={() => fold("recents")} />
                    <Fold open={recentsOpen}>
                      <ul className="hx-list">
                        {recents.map((c) => (
                          <li key={c.id} data-flip={c.id}>
                            <Row chat={c} {...rowProps} pinned={false} sub="" />
                          </li>
                        ))}
                      </ul>
                      {arranged.recents.length > count && (
                        <button type="button" className="hx-more" onClick={() => setMore((n) => n + RECENTS_BATCH)}>
                          View more
                        </button>
                      )}
                    </Fold>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

function SectionHead({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="hx-sec-h" onClick={onToggle} aria-expanded={open}>
      <span>{label}</span>
      <CaretDown size={11} weight="bold" aria-hidden="true" className="hx-sec-c" />
    </button>
  );
}

type RowProps = {
  activeId: string | null;
  campaigns: readonly Campaign[];
  onOpen: Props["onOpen"];
  onRename: Props["onRename"];
  onMove: Props["onMove"];
  onArchive: Props["onArchive"];
  onDelete: Props["onDelete"];
  onPin: (id: string) => void;
  hold: (on: boolean) => void;
};

function readOpenCampaigns(): Record<string, boolean> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CAMP_KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * A campaign with its chats: its name starts a chat in it, and its chats are folded away until the caret opens them, except
 * for the campaign that is selected, which opens by default (the person said which one they are on, so its chats are what
 * they want in front of them). A pinned one is in Pinned; the selected one, when it is not pinned, is in Selected and can be
 * pinned from its menu.
 */
function CampaignBlock({ item, current, pinned, flash, rowProps, onNewIn, onOpenCampaign, onTogglePin, hold }: {
  item: PinnedCampaign;
  /** The campaign the person has selected. */
  current: boolean;
  pinned: boolean;
  flash: boolean;
  rowProps: RowProps;
  onNewIn: Props["onNewIn"];
  onOpenCampaign: Props["onOpenCampaign"];
  onTogglePin: () => void;
  hold: (on: boolean) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(() => readOpenCampaigns()[item.id] ?? current);
  const more = useRef<HTMLButtonElement>(null);
  const campaign = { id: item.id, name: item.name };
  useEffect(() => {
    if (!menu) return undefined;
    hold(true);
    return () => hold(false);
  }, [menu, hold]);
  const fold = () => {
    const next = !open;
    setOpen(next);
    try { window.localStorage.setItem(CAMP_KEY, JSON.stringify({ ...readOpenCampaigns(), [item.id]: next })); } catch { /* not worth failing over */ }
  };
  const nested = all ? item.chats : item.chats.slice(0, NESTED_SHOWN);
  const chats = item.chats.length;
  return (
    <div className="hx-camp">
      <div className={`hx-row hx-camp-row${menu ? " has-menu" : ""}${flash ? " is-flash" : ""}${current ? " is-current" : ""}`}>
        <button type="button" className="hx-row-t" onClick={() => onNewIn(campaign)} title={`New chat in ${item.name}`}>
          <FolderOpen size={19} aria-hidden="true" className="hx-row-ico" />
          <span className="hx-row-title">{item.name}</span>
        </button>
        {flash && <Stamp />}
        <button ref={more} type="button" className="hx-icon hx-row-more" onClick={() => setMenu((m) => !m)} aria-label={`More for ${item.name}`} aria-haspopup="menu" aria-expanded={menu}>
          <DotsThree size={18} weight="bold" aria-hidden="true" />
        </button>
        {chats > 0 && (
          <button type="button" className={`hx-camp-fold${open ? " is-open" : ""}`} onClick={fold} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the ${chats} ${chats === 1 ? "chat" : "chats"} in ${item.name}`}>
            <span className="hx-camp-n">{chats}</span>
            <CaretDown size={11} weight="bold" aria-hidden="true" className="hx-sec-c" />
          </button>
        )}
        {menu && (
          <Pop anchor={more} onClose={() => setMenu(false)}>
            <MenuList
              onKey={(k) => {
                if (k === "p") { setMenu(false); onTogglePin(); return true; }
                if (k === "n") { setMenu(false); onNewIn(campaign); return true; }
                return false;
              }}
            >
              <Item icon={<Plus size={17} />} label="New chat" kbd="N" onSelect={() => { setMenu(false); onNewIn(campaign); }} />
              <Item icon={<FolderOpen size={17} />} label="Open campaign" onSelect={() => { setMenu(false); onOpenCampaign(item.id); }} />
              <Item icon={pinned ? <PushPinSlash size={17} /> : <PushPin size={17} />} label={pinned ? "Unpin" : "Pin"} kbd="P" onSelect={() => { setMenu(false); onTogglePin(); }} />
            </MenuList>
          </Pop>
        )}
      </div>
      {chats === 0 && current && <p className="hx-camp-none">No chats yet. New chat starts one.</p>}
      {chats > 0 && (
        <Fold open={open}>
          <ul className="hx-list hx-nest">
            {nested.map((c) => (
              <li key={c.id} data-flip={`${item.id}:${c.id}`}>
                <Row chat={c} {...rowProps} pinned={false} sub="" nested />
              </li>
            ))}
          </ul>
          {chats > NESTED_SHOWN && (
            <button type="button" className="hx-more hx-more--nest" onClick={() => setAll((a) => !a)}>
              {all ? "Show fewer" : `${chats - NESTED_SHOWN} more`}
            </button>
          )}
        </Fold>
      )}
    </div>
  );
}

/** The pin that lands on a row for a moment when it has just been pinned. */
function Stamp() {
  return (
    <span className="hx-stamp" aria-hidden="true">
      <PushPin size={15} weight="fill" />
    </span>
  );
}

function Row({ chat, activeId, pinned, flash = false, nested = false, sub, campaigns, onOpen, onRename, onMove, onArchive, onDelete, onPin, hold }: RowProps & {
  chat: RailChat;
  pinned: boolean;
  flash?: boolean;
  /** Under a pinned campaign: one step smaller, and its tooltip does not repeat the campaign. */
  nested?: boolean;
  /** A second line under the title (in search results, which campaign the chat is in). */
  sub: string;
}) {
  const [menu, setMenu] = useState(false);
  /* Delete was chosen: the menu asks once more before anything goes. */
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const [leaving, setLeaving] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const active = chat.id === activeId;
  /* Somebody else's chat about a campaign: read, not written in, so it has no menu, and says whose it is. */
  const theirs = chat.ownerName ?? null;
  /* Every daily search chat is titled the same, so outside its campaign's own list the campaign is what tells them apart, after the title
     in the same line (a second line would make these rows taller than the list is sized for). */
  const under = chat.daily && !nested ? chat.campaignName : "";
  useEffect(() => {
    if (!menu) return undefined;
    hold(true);
    return () => hold(false);
  }, [menu, hold]);

  const rename = () => {
    const next = title.trim();
    setEditing(false);
    if (next && next !== chat.title) void onRename(chat.id, next);
  };
  const archive = () => {
    setMenu(false);
    setLeaving(true);
    onArchive(chat.id).catch(() => setLeaving(false));
  };
  const remove = () => {
    setMenu(false);
    setAsking(false);
    setLeaving(true);
    onDelete(chat.id).catch(() => setLeaving(false));
  };
  const closeMenu = () => { setMenu(false); setAsking(false); };

  if (editing) {
    return (
      <form className="hx-edit" onSubmit={(e) => { e.preventDefault(); rename(); }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus aria-label="Chat name" onFocus={(e) => e.currentTarget.select()} onBlur={rename} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setTitle(chat.title); setEditing(false); } }} />
      </form>
    );
  }
  return (
    <div className={`hx-row${active ? " is-on" : ""}${menu ? " has-menu" : ""}${flash ? " is-flash" : ""}${leaving ? " is-leaving" : ""}${nested ? " is-nested" : ""}${theirs ? " is-theirs" : ""}${chat.daily ? " is-daily" : ""}`}>
      <button type="button" className="hx-row-t" onClick={() => onOpen(chat)} title={theirs ? `${chat.title} · started by ${theirs}` : chat.campaignName && !nested ? `${chat.title} · ${chat.campaignName}` : chat.title} aria-current={active ? "true" : undefined}>
        <span className="hx-row-title">{chat.daily && <PushPin size={14} weight="fill" aria-hidden="true" className="hx-row-pin" />}{chat.title}{under && <span className="hx-row-camp">{` · ${under}`}</span>}</span>
        {sub && <span className="hx-row-sub">{sub}</span>}
      </button>
      {flash && <Stamp />}
      <span className="hx-row-when">{theirs ? `${theirs.split(" ")[0]} · ${agoLabel(chat.at)}` : agoLabel(chat.at)}</span>
      {!theirs && <button ref={more} type="button" className="hx-icon hx-row-more" onClick={() => setMenu((m) => !m)} aria-label={`More for ${chat.title}${under ? `, ${under}` : ""}`} aria-haspopup="menu" aria-expanded={menu}>
        <DotsThree size={18} weight="bold" aria-hidden="true" />
      </button>}
      {menu && !theirs && (
        <Pop key={asking ? "ask" : "menu"} anchor={more} onClose={closeMenu}>
          {asking ? (
            <DeleteAsk chat={chat} pinned={pinned} onKeep={() => setAsking(false)} onDelete={remove} />
          ) : (
            <ChatMenu
              chat={chat}
              pinned={pinned}
              campaigns={campaigns}
              onPin={() => { setMenu(false); onPin(chat.id); }}
              onRename={() => { setMenu(false); setTitle(chat.title); setEditing(true); }}
              onArchive={archive}
              onDelete={() => setAsking(true)}
              onPick={(id) => { setMenu(false); void onMove(chat.id, id); }}
            />
          )}
        </Pop>
      )}
    </div>
  );
}

/* ── the row menu ── */

/**
 * What a chat's menu offers beyond rename, archive and delete. A campaign's daily search chat belongs to its campaign and is kept first
 * in it, so it is neither pinned by hand nor put in another campaign (one the agent pinned can still be unpinned). The menu's items and
 * its keys both go by this.
 */
export const menuOffers = (chat: RailChat, pinned: boolean) => ({ pin: !chat.daily || pinned, move: !chat.daily });

export function ChatMenu({ chat, pinned, campaigns, onPin, onRename, onArchive, onDelete, onPick }: {
  chat: RailChat;
  pinned: boolean;
  campaigns: readonly Campaign[];
  onPin: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onPick: (campaignId: string | null) => void;
}) {
  const [sub, setSub] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const offers = menuOffers(chat, pinned);
  return (
    <MenuList
      onKey={(k) => {
        if (k === "p" && offers.pin) { onPin(); return true; }
        if (k === "r") { onRename(); return true; }
        if (k === "a") { onArchive(); return true; }
        if (k === "d") { onDelete(); return true; }
        return false;
      }}
      onLeft={() => { if (sub) { setSub(false); trigger.current?.focus(); return true; } return false; }}
      onRight={(el) => { if (el === trigger.current) { setSub(true); return true; } return false; }}
    >
      {offers.pin && <Item icon={pinned ? <PushPinSlash size={17} /> : <PushPin size={17} />} label={pinned ? "Unpin" : "Pin"} kbd="P" onSelect={onPin} onEnter={() => setSub(false)} />}
      <Item icon={<PencilSimple size={17} />} label="Rename" kbd="R" onSelect={onRename} onEnter={() => setSub(false)} />
      {offers.move && (
        <div className="hx-mi-wrap" onPointerEnter={() => setSub(true)}>
          <Item ref={trigger} icon={<FolderOpen size={17} />} label="Add to campaign" chevron onSelect={() => setSub((s) => !s)} expanded={sub} />
          {sub && <CampaignPick campaigns={campaigns} current={chat.campaignId} onPick={onPick} />}
        </div>
      )}
      <Item icon={<Archive size={17} />} label="Archive" kbd="A" onSelect={onArchive} onEnter={() => setSub(false)} />
      <Item icon={<Trash size={17} />} label="Delete" kbd="D" danger onSelect={onDelete} onEnter={() => setSub(false)} />
    </MenuList>
  );
}

/** The second question: it opens on "Keep it", so Enter or a stray press never deletes. */
export function DeleteAsk({ chat, pinned, onKeep, onDelete }: { chat: RailChat; pinned: boolean; onKeep: () => void; onDelete: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => { keep.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="hx-ask" role="alertdialog" aria-labelledby="hx-ask-h" aria-describedby="hx-ask-p">
      <p className="hx-ask-h" id="hx-ask-h">Delete this chat?</p>
      <p className="hx-ask-p" id="hx-ask-p">
        “{chat.title}” and its messages are removed for good.{" "}
        {chat.daily ? "While the daily search is on for this campaign, it starts a new one the next time it has news." : pinned ? "It is pinned, so it would otherwise be kept." : "Chats nobody has written in for 60 days are deleted on their own; pin one to keep it."}
      </p>
      <div className="hx-ask-b">
        <button ref={keep} type="button" className="hx-ask-keep" onClick={onKeep}>Keep it</button>
        <button type="button" className="hx-ask-del" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function CampaignPick({ campaigns, current, onPick }: { campaigns: readonly Campaign[]; current: string | null; onPick: (campaignId: string | null) => void }) {
  const [q, setQ] = useState("");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { field.current?.focus({ preventScroll: true }); }, []);
  /* The campaign it is in comes first, so the tick is the first thing seen. */
  const list = campaigns
    .filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(b.id === current) - Number(a.id === current));
  return (
    <div className="hx-sub" role="menu" aria-label="Add to campaign">
      <label className="hx-sub-q">
        <MagnifyingGlass size={15} aria-hidden="true" />
        <input ref={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a campaign" aria-label="Find a campaign" />
      </label>
      <div className="hx-sub-list">
        {list.map((c) => (
          <button key={c.id} type="button" role="menuitem" className="hx-mi" disabled={c.id === current} onClick={() => onPick(c.id)}>
            <FolderOpen size={17} aria-hidden="true" />
            <span className="hx-mi-t">{c.name}</span>
            {c.id === current && <Check size={15} weight="bold" aria-hidden="true" className="hx-mi-check" />}
          </button>
        ))}
        {list.length === 0 && <p className="hx-sub-none">{campaigns.length ? "No campaign by that name." : "No running campaigns."}</p>}
      </div>
      {current && (
        <button type="button" role="menuitem" className="hx-mi hx-mi--quiet" onClick={() => onPick(null)}>
          <X size={17} aria-hidden="true" />
          <span className="hx-mi-t">Take out of its campaign</span>
        </button>
      )}
    </div>
  );
}

type ItemProps = {
  icon: ReactNode;
  label: string;
  kbd?: string;
  chevron?: boolean;
  expanded?: boolean;
  /** Takes something away: drawn in the warning colour. */
  danger?: boolean;
  onSelect: () => void;
  onEnter?: () => void;
};

/** A menu row. The one that opens a submenu hands its button up so the arrow keys can find it. */
const Item = forwardRef<HTMLButtonElement, ItemProps>(function Item({ icon, label, kbd, chevron, expanded, danger, onSelect, onEnter }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      className={`hx-mi${danger ? " hx-mi--danger" : ""}`}
      data-main=""
      aria-haspopup={chevron ? "menu" : undefined}
      aria-expanded={chevron ? !!expanded : undefined}
      onPointerEnter={onEnter}
      onClick={onSelect}
    >
      {icon}
      <span className="hx-mi-t">{label}</span>
      {kbd && <kbd className="hx-mi-k">{kbd}</kbd>}
      {chevron && <CaretDown size={12} weight="bold" aria-hidden="true" className="hx-mi-c" />}
    </button>
  );
});

/** The menu's keyboard: arrows move between its rows, a row's letter does what it says, and the rest is left to typing. */
function MenuList({ children, onKey, onLeft, onRight }: {
  children: ReactNode;
  onKey: (key: string) => boolean;
  onLeft?: () => boolean;
  onRight?: (target: HTMLElement) => boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.querySelector<HTMLElement>("[data-main]")?.focus({ preventScroll: true }); }, []);
  const keydown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const typing = target instanceof HTMLInputElement;
    const items = [...(root.current?.querySelectorAll<HTMLElement>("[data-main]") ?? [])];
    if (e.key === "ArrowLeft" && onLeft?.()) { e.preventDefault(); return; }
    if (typing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const at = items.indexOf(target);
      const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
      items[next]?.focus();
      return;
    }
    if (e.key === "ArrowRight" && onRight?.(target)) { e.preventDefault(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
    if (onKey(e.key.toLowerCase())) e.preventDefault();
  };
  return <div ref={root} className="hx-menu" onKeyDown={keydown}>{children}</div>;
}

/** A panel under its button (or above, with no room below), on the page rather than in the list so the list's scroll cannot clip it. */
function Pop({ anchor, onClose, children }: { anchor: RefObject<HTMLElement>; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = panel.current;
    if (!a || !el) return undefined;
    const place = () => {
      const r = a.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const below = window.innerHeight - r.bottom - 12;
      const up = h > below && r.top > below;
      el.style.top = `${up ? Math.max(8, r.top - h - 4) : Math.max(8, Math.min(r.bottom + 4, window.innerHeight - h - 8))}px`;
      el.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
      el.dataset.up = up ? "1" : "";
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); anchor.current?.focus(); } };
    const list = anchor.current?.closest(".hx-body");
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    list?.addEventListener("scroll", onClose, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
      list?.removeEventListener("scroll", onClose);
    };
  }, [anchor, onClose]);
  return createPortal(<div ref={panel} className="hx-fly" style={{ top: -9999, left: -9999 }}>{children}</div>, document.body);
}
