import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMenu, ChatRail, DeleteAsk, menuOffers } from "../ChatRail";
import { RailContext } from "../RailContext";
import { ChatHeader } from "../ChatHeader";
import type { RailSlot } from "../railConfig";
import { CampaignsPicker } from "../CampaignsPicker";
import { NESTED_SHOWN, type RailChat } from "../chatGroups";

const css = readFileSync(join(__dirname, "..", "agentChat.css"), "utf8");
const noop = () => {};
const chat = (id: string, over: Partial<RailChat> = {}): RailChat => ({ id, title: `Chat ${id}`, campaignId: null, campaignName: "", at: Date.now() - Number(id) * 60_000, last: null, ...over });

const render = (over: Partial<Parameters<typeof ChatRail>[0]> = {}) =>
  renderToStaticMarkup(
    <ChatRail
      chats={Array.from({ length: 20 }, (_, i) => chat(String(i + 1)))}
      state="ready"
      onRetry={noop}
      activeId="2"
      campaigns={[{ id: "A", name: "Data Analyst" }]}
      hidden={false}
      onToggle={noop}
      campaignsOpen={false}
      onCampaigns={noop}
      onNew={noop}
      onNewIn={noop}
      onOpenCampaign={noop}
      onOpen={noop}
      onRename={async () => {}}
      onMove={async () => {}}
      onArchive={async () => {}}
      onDelete={async () => {}}
      {...over}
    />,
  );

describe("the chat list", () => {
  it("opens with New chat, Search and Campaigns, in that order, then Recents", () => {
    const html = render();
    const at = (s: string) => html.indexOf(s);
    expect(at("New chat")).toBeGreaterThan(-1);
    expect(at("New chat")).toBeLessThan(at(">Search<"));
    expect(at(">Search<")).toBeLessThan(at(">Campaigns<"));
    expect(at(">Campaigns<")).toBeLessThan(at(">Recents<"));
  });

  it("shows a batch of recents, then View more for the rest", () => {
    const html = render();
    expect((html.match(/class="hx-row[ "]/g) ?? []).length).toBe(12);
    expect(html).toContain("View more");
    expect(render({ chats: [chat("1"), chat("2")] })).not.toContain("View more");
  });

  it("marks the open chat and names it for assistive tech", () => {
    expect(render()).toContain('aria-current="true"');
  });

  it("says it is hidden or showing on the button that changes it", () => {
    expect(render({ hidden: true })).toContain('aria-label="Show chats"');
    expect(render({ hidden: false })).toContain('aria-label="Hide chats"');
    expect(render({ hidden: true })).toContain("hx-rail is-hidden");
  });

  it("marks Campaigns while its page is open", () => {
    expect(render({ campaignsOpen: true })).toContain('aria-pressed="true"');
  });

  it("has no Pinned section until something is pinned", () => {
    const html = render();
    expect(html).not.toContain(">Pinned<");
    expect(html).not.toContain("Pin a campaign");
  });

  it("draws what it is given above New chat", () => {
    const html = render({ top: <p>Week and set-up</p> });
    expect(html.indexOf("Week and set-up")).toBeLessThan(html.indexOf("New chat"));
  });

  it("asks nothing of a person with no chats yet, and says how one starts", () => {
    expect(render({ chats: [] })).toContain("Ask the agent anything");
  });

  it("is sized for reading: rows and nav at 15px or more", () => {
    expect(css).toMatch(/\.hx-row-t \{[^}]*font: 400 15\.5px/);
    expect(css).toMatch(/\.hx-nav \{[^}]*font: 400 16px/);
  });

  it("keeps its motion for people who have not asked for less", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*\.hx-rail \*/);
  });
});

describe("the campaigns page", () => {
  const rows = [
    { id: "A", name: "Data Analyst", meta: "Meridian · Pune", found: 79, shortlisted: 4, chats: 2, lastAt: 5 },
    { id: "B", name: "Frontend Engineer", meta: "", found: 0, shortlisted: 0, chats: 0, lastAt: 0 },
  ];
  const html = renderToStaticMarkup(<CampaignsPicker campaigns={rows} onStart={noop} onClose={noop} />);
  it("lists each campaign with what tells it apart and how many chats it has", () => {
    expect(html).toContain("Data Analyst");
    expect(html).toContain("Meridian · Pune");
    expect(html).toContain("2 chats");
    expect(html).not.toContain("0 chats");
  });
  it("is a search box over a wrap of blocks, not a list", () => {
    expect(html).toContain('class="hxp-search"');
    expect(html).toContain('class="hxp-grid"');
    expect(html).toContain("79 found · 4 shortlisted");
    expect(html.indexOf("hxp-search")).toBeLessThan(html.indexOf("hxp-grid"));
  });
  it("has a pin on every block and says what a press does", () => {
    expect(html).toContain('aria-label="Pin Data Analyst"');
  });
  it("says so when nothing is running", () => {
    expect(renderToStaticMarkup(<CampaignsPicker campaigns={[]} onStart={noop} onClose={noop} />)).toContain("Nothing is running yet");
  });
});

describe("the top of the list: this week and who is on it", () => {
  const slot = (key: string, over: Partial<RailSlot> = {}): RailSlot => ({
    key, label: key, value: "Set", empty: false, loading: false, twoLine: false, go: { href: "#/x" }, name: key, ...over,
  });
  const slots = [slot("Owner"), slot("Collaborators", { value: "Add collaborators", empty: true }), slot("Visibility"), slot("Filters"), slot("Channels"), slot("Intake")];
  const stats = [
    { id: "found", label: "Found", value: 79, gain: 12 },
    { id: "replies", label: "Replies", value: 4, gain: 0 },
    { id: "interviews", label: "Interviews", value: 2, gain: 1 },
  ];
  const draw = (over: Partial<Parameters<typeof RailContext>[0]> = {}) =>
    renderToStaticMarkup(
      <RailContext campaign={{ id: "A", name: "Data Analyst" }} week={{ state: "ready", stats }} onRetryWeek={noop} slots={slots} {...over} />,
    );

  it("does not name the campaign (the header does), and says only when it is everyone's", () => {
    const html = draw();
    expect(html).not.toContain(">Data Analyst<");
    expect(html).toContain("Last 7 days");
    expect(html).not.toContain("all campaigns");
    expect(draw({ campaign: null })).toContain("Last 7 days · all campaigns");
  });

  it("shows the three figures of the week, and a gain only when there is one", () => {
    const html = draw();
    for (const l of ["Found", "Replies", "Interviews"]) expect(html).toContain(`>${l}<`);
    expect(html).toContain("+12");
    expect(html).toContain("+1<");
    expect(html).not.toContain("+0");
  });

  it("holds the figures' place while they load and says so when they cannot", () => {
    expect(draw({ week: { state: "loading", stats: [] } })).toContain("Loading the week");
    expect(draw({ week: { state: "failed", stats: [] } })).toContain("The week");
  });

  it("keeps only the owner and the collaborators of the set-up", () => {
    const html = draw();
    expect(html).toContain('aria-label="Owner"');
    expect(html).toContain('aria-label="Collaborators"');
    for (const k of ["Visibility", "Filters", "Channels", "Intake"]) expect(html).not.toContain(`aria-label="${k}"`);
    expect(html).not.toContain("Configuration");
  });

  it("keeps the owner and the team for the whole workspace", () => {
    const html = draw({ campaign: null, slots: [slot("Owner"), slot("Team"), slot("Campaigns")] });
    expect(html).toContain('aria-label="Team"');
    expect(html).not.toContain('aria-label="Campaigns"');
  });
});

describe("the pinned campaigns", () => {
  it("fold their chats away until the caret opens them, and the chats read a step smaller", () => {
    expect(css).toMatch(/\.hx-row\.is-nested \.hx-row-t \{[^}]*font-size: 14\.5px/);
    expect(css).toMatch(/\.hx-camp-fold:not\(\.is-open\) \.hx-sec-c \{ transform: rotate\(-90deg\)/);
    const src = readFileSync(join(__dirname, "..", "ChatRail.tsx"), "utf8");
    expect(src).toContain("readOpenCampaigns()[item.id] ?? current");
  });

  it("fit the Recents to the height there is, so nothing is left empty at the foot", () => {
    const src = readFileSync(join(__dirname, "..", "ChatRail.tsx"), "utf8");
    expect(src).toContain("new ResizeObserver(measure)");
    expect(src).toMatch(/const count = fit \+ more;/);
  });

  it("keeps pinned campaigns close: a campaign row is no taller than a chat row, with no extra gap between blocks", () => {
    expect(css).toMatch(/\.hx-camp-row \.hx-row-t \{[^}]*min-height: 36px/);
    expect(css).not.toContain(".hx-list > li:not(:first-child) > .hx-camp");
  });

  it("start from one top inset shared by the header, the list and the hide button", () => {
    expect(css).toMatch(/\.orc\.orc--lx \{[^}]*--page-top: 20px/);
  });
});

describe("the header", () => {
  const head = (campaign: { id: string; name: string } | null) =>
    renderToStaticMarkup(
      <ChatHeader title="" campaign={campaign} counts="30 found · 1 shortlisted" slots={[]} earlier={[]} agents={null} onOpenCampaign={noop} onOpenChat={noop} />,
    );
  it("shows no campaign at all for a chat about none", () => {
    const html = head(null);
    expect(html).not.toContain("hx-chip");
    expect(html).not.toContain("General");
    expect(html).not.toContain("no campaign");
  });
  it("shows the campaign and its counts for a chat about one", () => {
    const html = head({ id: "A", name: "Data Analyst" });
    expect(html).toContain("Data Analyst");
    expect(html).toContain("30 found · 1 shortlisted");
  });
});

describe("opening a person from the results", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
  it("selects the first person once, so closing the profile stays closed", () => {
    const rm = read("RankedMatches.tsx");
    expect(rm).toContain("const autoDone = useRef<string | null>(null)");
    // Once per list, not per first person: scoring reorders the list, and that must not reopen a closed profile.
    expect(rm).toMatch(/if \(autoDone\.current === listKey\) return;/);
  });
  it("offers the first person of a search that ran in front of them, beside the chat, once", () => {
    const run = read("liveViews/SearchRun.tsx");
    expect(run).toContain("sawRunning");
    expect(run).toContain("ctx.openProfile(firstId, people, { auto: true })");
    expect(run).toContain("runStartedHere(search.runId)");
    expect(read("Agent.tsx")).toContain("scrim={profileModal && !matchesOpen}");
  });
  it("shows the open person's card as selected", () => {
    expect(read("sourcing.css")).toContain(".src-card.is-selected");
    expect(read("Sourcing.tsx")).toContain("aria-current={selected ?");
  });
});

describe("the add-task field", () => {
  it("is set in the console's type, not the browser's", () => {
    expect(readFileSync(join(__dirname, "..", "home.css"), "utf8")).toMatch(/\.hm-add input, \.hm-add textarea, \.hm-feat-s/);
  });
});

describe("controls that are shown work", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
  it("a decision already made shows as a state, not a button that cannot undo it", () => {
    const bits = read("CandidateBits.tsx");
    expect(bits).toContain("const shortFixed = LIVE && short;");
    expect(bits).toContain("const rejectFixed = LIVE && (rej || short);");
    expect(read("candidates.css")).toContain(".cb-v:disabled:not(.is-on) { opacity: 0.4; }");
  });
  it("Score the rest says it began, shows it is reading, and reads the list again until it is done", () => {
    const page = read("SourcedPage.tsx");
    expect(page).toContain("Reading ${r.people}");
    expect(page).toContain("setReload((n) => n + 1);\n    }, 4000)");
    expect(page).toContain('toast("Couldn\'t start reading them. Try again.", "error")');
    expect(page).toContain("scoring={scoring || reading}");
  });
});

describe("deleting a chat", () => {
  const ask = (pinned: boolean) =>
    renderToStaticMarkup(<DeleteAsk chat={chat("7", { title: "Backend shortlist" })} pinned={pinned} onKeep={noop} onDelete={noop} />);

  it("asks once more, names the chat, and says what happens to it", () => {
    const html = ask(false);
    expect(html).toContain("Delete this chat?");
    expect(html).toContain("Backend shortlist");
    expect(html).toContain("removed for good");
    expect(html).toContain("60 days");
    expect(html).toContain("Keep it");
  });

  it("says a pinned chat is kept by the 60-day clean-up, an unpinned one how to be", () => {
    expect(ask(true)).toContain("It is pinned");
    expect(ask(true)).not.toContain("60 days");
    expect(ask(false)).toContain("pin one to keep it");
  });

  it("has the menu row and the question styled, in the warning colour, apart from the other rows", () => {
    for (const rule of [".hx-mi--danger", ".hx-ask-del", ".hx-ask-keep"]) expect(css).toContain(rule);
    expect(css).toMatch(/\.hx-ask-del \{[^}]*c-rose-fill/);
  });

  it("keeps the list's ground the page's own and puts the brand colour on its headings", () => {
    expect(css).not.toMatch(/\.hx-panel \{[^}]*linear-gradient/);
    expect(css).toMatch(/\.hx-sec-h \{[^}]*color: var\(--accent-text/);
    expect(css).toMatch(/\.hx-wk-t \{[^}]*color: var\(--accent-text/);
  });

  it("lays the list above the conversation's own layers (the composer's go to 20) and under menus and dialogs (60)", () => {
    const z = (sel: string) => Number(new RegExp(`${sel.replace(/[.]/g, "\\.")} \\{[^}]*z-index: (\\d+)`).exec(css)?.[1]);
    expect(z(".hx-rail")).toBeGreaterThan(20);
    expect(z(".hx-rail")).toBeLessThan(60);
    expect(z(".hx-toggle")).toBeGreaterThan(z(".hx-rail"));
  });

  it("gives the header a ground only once there is a conversation, so it does not cut the landing's watermark", () => {
    expect(css).toMatch(/\.orc\.orc--lx:not\(\.is-chat\) \.hx-head \{ background: transparent; \}/);
  });

  it("keeps the header's chip clear of the list's button when the list is hidden", () => {
    expect(css).toMatch(/\.is-rail-hidden \.hx-head \{ padding-right: 68px; \}/);
  });

  it("holds the New chat, Search and Campaigns rows to the column's width, whatever the search field's own size", () => {
    expect(css).toMatch(/\.hx-navs \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.hx-nav \{[^}]*min-width: 0/);
    expect(css).toMatch(/\.hx-nav--search\.is-open input \{[^}]*width: 100%/);
  });
});

describe("the selected campaign in the list", () => {
  const withChats = (n: number) => Array.from({ length: n }, (_, i) => chat(String(i + 1), { campaignId: "A", campaignName: "Data Analyst" }));

  it("shows a Selected section above Pinned, with the campaign's chats, when one is selected and not pinned", () => {
    const html = render({ chats: withChats(3), selected: { id: "A", name: "Data Analyst" } });
    expect(html).toContain(">Selected<");
    expect(html.indexOf(">Selected<")).toBeLessThan(html.indexOf(">Recents<"));
    expect(html).toContain("Data Analyst");
    // Its chats are in Recents too.
    expect((html.match(/Chat 1</g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("says so, kindly, when the selected campaign has no chats of the person's", () => {
    const html = render({ chats: [chat("1")], selected: { id: "A", name: "Data Analyst" } });
    expect(html).toContain("No chats yet");
  });

  it("shows nothing extra when no campaign is selected", () => {
    expect(render({ chats: withChats(3) })).not.toContain(">Selected<");
  });
});

describe("what the list follows when its rows move", () => {
  const keysOf = (html: string) => [...html.matchAll(/data-flip="([^"]+)"/g)].map((m) => m[1] as string);

  it("holds each key once, though a campaign's chat is in its list and in Recents too", () => {
    const chats = [chat("1", { campaignId: "A", campaignName: "Data Analyst" }), chat("2", { campaignId: "A", campaignName: "Data Analyst" }), chat("3")];
    const keys = keysOf(render({ chats, selected: { id: "A", name: "Data Analyst" } }));
    // The chat is drawn twice, and the glide must tell the two apart.
    expect(render({ chats, selected: { id: "A", name: "Data Analyst" } }).match(/Chat 1</g)?.length).toBe(2);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("holds each key once for a pinned campaign's chats too", () => {
    const chats = [chat("1", { campaignId: "A", campaignName: "Data Analyst" }), chat("2")];
    const html = render({ chats, selected: { id: "B", name: "Other" } });
    const keys = keysOf(html);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("a campaign's daily search chat in the rail", () => {
  const A = { campaignId: "A", campaignName: "Data Analyst" };
  const daily = (id: string, over: Partial<RailChat> = {}) => chat(id, { ...A, title: "Daily search", daily: true, ...over });
  const withDaily = [chat("1", { ...A, at: Date.now() }), daily("9", { at: Date.now() - 3 * 86_400_000 }), chat("3")];
  const selectedSection = (html: string) => html.slice(html.indexOf('data-flip="sec:selected"'), html.indexOf('data-flip="sec:recents"'));
  /* A row from its opening tag to the next one; the one with this title in its title span is the one asked for. */
  const rowsOf = (html: string) => html.split(/(?=<div class="hx-row[ "])/).filter((r) => r.startsWith('<div class="hx-row'));
  const rowOf = (html: string, title: string) => rowsOf(html).find((r) => new RegExp(`class="hx-row-title">(?:<svg[^>]*>.*?</svg>)?${title}(?:<span|</span>)`).test(r)) ?? "";

  it("is the first of its campaign's chats, though older than the others, and drawn with the tint and the pin before its name", () => {
    const html = render({ chats: withDaily, selected: { id: "A", name: "Data Analyst" } });
    const section = selectedSection(html);
    const [daily9, chat1] = [rowOf(section, "Daily search"), rowOf(section, "Chat 1")];
    expect(daily9).not.toBe("");
    expect(section.indexOf(daily9)).toBeLessThan(section.indexOf(chat1));
    expect(daily9).toMatch(/class="hx-row[^"]* is-daily/);
    // The pin is inside the title, before its words; an ordinary chat has neither the tint nor the pin.
    expect(daily9).toMatch(/<span class="hx-row-title"><svg[^>]*class="hx-row-pin"/);
    expect(chat1).not.toContain("is-daily");
    expect(chat1).not.toContain("hx-row-pin");
  });

  it("is in Recents with the rest of the history, its campaign after its name in the same line there (where every daily chat would read the same), and not after it in its own campaign's chats", () => {
    const html = render({ chats: withDaily, selected: { id: "A", name: "Data Analyst" } });
    const recents = html.slice(html.indexOf('data-flip="sec:recents"'));
    const row = rowOf(recents, "Daily search");
    expect(row).toContain('<span class="hx-row-camp"> · Data Analyst</span>');
    // One line, as every row is: a second line would make these rows taller than the list is sized for.
    expect(row).not.toContain("hx-row-sub");
    expect(rowOf(selectedSection(html), "Daily search")).not.toContain("hx-row-camp");
    // Its menu button is told apart from the other daily chats' by the campaign.
    expect(row).toContain('aria-label="More for Daily search, Data Analyst"');
  });

  it("is built from the server's rows by the page for the person's own and for others', with railChatOf", () => {
    const page = readFileSync(join(__dirname, "..", "Agent.tsx"), "utf8");
    expect(page.match(/railChatOf\(/g)).toHaveLength(2);
    expect(page).not.toContain("campaignName: c.focusCampaignName");
  });

  it("holds each flip key once with a daily chat in the list: in its campaign's chats and in Recents", () => {
    const html = render({ chats: [...withDaily, daily("8", { campaignId: "B", campaignName: "Other" })], selected: { id: "A", name: "Data Analyst" } });
    const keys = [...html.matchAll(/data-flip="([^"]+)"/g)].map((m) => m[1] as string);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("selected:A");
    expect(keys.filter((k) => k.endsWith(":9"))).toEqual(["A:9"]);
  });

  it("keeps the chats under a campaign to the first few with the daily one always among them, and counts the rest from there", () => {
    const newer = Array.from({ length: NESTED_SHOWN + 2 }, (_, i) => chat(`n${i}`, { ...A, title: `Newer ${i}`, at: Date.now() - i * 60_000 }));
    const html = render({ chats: [...newer, daily("9", { at: Date.now() - 9 * 86_400_000 })], selected: { id: "A", name: "Data Analyst" } });
    const section = selectedSection(html);
    expect(rowOf(section, "Daily search")).not.toBe("");
    expect(rowsOf(section).filter((r) => r.startsWith('<div class="hx-row is-nested'))).toHaveLength(NESTED_SHOWN);
    expect(section).toContain(`${newer.length + 1 - NESTED_SHOWN} more`);
  });

  const menu = (c: RailChat, pinned = false) =>
    renderToStaticMarkup(<ChatMenu chat={c} pinned={pinned} campaigns={[{ id: "A", name: "Data Analyst" }]} onPin={noop} onRename={noop} onArchive={noop} onDelete={noop} onPick={noop} />);

  it("has no Pin and no Add to campaign in its menu, and Rename, Archive and Delete as every chat has", () => {
    const html = menu(daily("9"));
    expect(html).not.toContain(">Pin<");
    expect(html).not.toContain("Add to campaign");
    for (const item of ["Rename", "Archive", "Delete"]) expect(html).toContain(`>${item}<`);
    // Any other chat keeps both.
    const other = menu(chat("1", A));
    expect(other).toContain(">Pin<");
    expect(other).toContain("Add to campaign");
    // One the agent pinned for them can still be unpinned.
    expect(menu(daily("9"), true)).toContain(">Unpin<");
  });

  it("is not pinned or moved by a key either: the menu's keys go by what the menu offers", () => {
    expect(menuOffers(daily("9"), false)).toEqual({ pin: false, move: false });
    expect(menuOffers(daily("9"), true)).toEqual({ pin: true, move: false });
    expect(menuOffers(chat("1", A), false)).toEqual({ pin: true, move: true });
    const rail = readFileSync(join(__dirname, "..", "ChatRail.tsx"), "utf8");
    expect(rail).toContain('if (k === "p" && offers.pin) { onPin(); return true; }');
    expect(rail).toContain("{offers.pin && <Item");
    expect(rail).toContain("{offers.move && (");
  });

  it("is deleted knowing that the daily search starts another while it is on, not that a pin would keep it", () => {
    const ask = renderToStaticMarkup(<DeleteAsk chat={daily("9")} pinned={false} onKeep={noop} onDelete={noop} />);
    expect(ask).toContain("While the daily search is on for this campaign, it starts a new one the next time it has news.");
    expect(ask).not.toContain("pin one to keep it");
  });

  /* The wash is the accent (on the dark theme, the accent's lighter text colour: the accent itself over near-black is brown), a step deeper
     under the pointer and deeper again for the open chat, and the title, which is in the accent's text, keeps its contrast on every one. */
  const washes = (selector: string, token: string) => {
    const at = (rule: RegExp) => Number(rule.exec(css)?.[1]);
    const mix = `color-mix\\(in srgb, var\\(${token}\\) (\\d+)%, transparent\\)`;
    return {
      rest: at(new RegExp(`${selector}\\.hx-row\\.is-daily \\{[^}]*background: ${mix}`)),
      hover: at(new RegExp(`${selector}\\.hx-row\\.is-daily:hover, ${selector}\\.hx-row\\.is-daily\\.has-menu \\{[^}]*${mix}`)),
      open: at(new RegExp(`${selector}\\.hx-row\\.is-daily\\.is-on \\{[^}]*${mix}`)),
    };
  };
  const hex = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const over = (fg: number[], pct: number, bg: number[]) => fg.map((v, i) => bg[i]! + (v - bg[i]!) * (pct / 100));
  const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
  const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
  const token = (file: string, name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(readFileSync(join(__dirname, "..", file), "utf8"))?.[1] ?? "";

  it("is tinted in the accent, deeper under the pointer and deeper again when open, with the title readable on each", () => {
    const light = washes("", "--accent");
    expect(light.rest).toBeGreaterThan(0);
    expect(light.hover).toBeGreaterThan(light.rest);
    expect(light.open).toBeGreaterThan(light.hover);
    // The accent over the page is a peach; the open row of every other chat is peach too, so the rest of this one stays well under it.
    expect(light.rest).toBeLessThanOrEqual(10);
    const [accent, text, page] = [hex(token("access.css", "--accent")), hex(token("access.css", "--accent-text")), hex("#ffffff")];
    for (const pct of [light.rest, light.hover, light.open]) expect(ratio(text, over(accent, pct, page))).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/\.hx-row\.is-daily \.hx-row-title \{[^}]*color: var\(--accent-text/);
    expect(css).toMatch(/\.hx-row-pin \{[^}]*margin-right: 6px/);
  });

  it("is tinted on the dark theme in the accent's lighter text colour, not in the accent (which is brown there), with the title readable on each", () => {
    const dark = washes(':root\\[data-theme="dark"\\] ', "--accent-text");
    expect(dark.rest).toBeGreaterThan(0);
    expect(dark.hover).toBeGreaterThan(dark.rest);
    expect(dark.open).toBeGreaterThan(dark.hover);
    const [text, surface] = [hex(token("theme/theme.css", "--accent-text")), hex(token("theme/theme.css", "--nav-surface"))];
    for (const pct of [dark.rest, dark.hover, dark.open]) expect(ratio(text, over(text, pct, surface))).toBeGreaterThanOrEqual(4.5);
  });

  it("takes its colours from tokens, never from literals: both themes have the accent's text, and the light one the accent", () => {
    const [lightCss, darkCss] = ["access.css", "theme/theme.css"].map((f) => readFileSync(join(__dirname, "..", f), "utf8"));
    expect(lightCss).toContain("--accent:");
    expect(lightCss).toContain("--accent-text:");
    expect(darkCss).toContain("--accent-text:");
    for (const rule of css.match(/(?::root\[data-theme="dark"\] )?\.hx-row\.is-daily[^{]*\{[^}]*\}/g) ?? []) expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
