import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMenu, ChatRail, DeleteAsk, menuOffers } from "../ChatRail";
import { RailContext } from "../RailContext";
import { ChatHeader } from "../ChatHeader";
import type { RailSlot } from "../railConfig";
import { CampaignsPicker } from "../CampaignsPicker";
import { NESTED_SHOWN, RECENTS_BATCH, type RailChat } from "../chatGroups";

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
      onPickCampaign={noop}
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
    // One section of recents, not one for campaigns and another for chats.
    expect(html.match(/>Recents</g)).toHaveLength(1);
    expect(html).not.toContain("Recent campaigns");
    expect(html).not.toContain("Other chats");
  });

  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `C${i + 1}`, name: `Campaign ${i + 1}` }));
  /* The chats of campaign i are written i minutes ago, so Campaign 1 has the latest. */
  const chatsIn = (n: number) => many(n).map((c, i) => chat(String(i + 1), { campaignId: c.id, campaignName: c.name, at: Date.now() - (i + 1) * 60_000 }));

  it("lists a chat about a campaign as the campaign, not the chat, the one with the latest chat first, a batch at a time, then View more", () => {
    const html = render({ campaigns: many(20), chats: chatsIn(20) });
    expect((html.match(/class="hx-row hx-camp-row/g) ?? []).length).toBe(RECENTS_BATCH);
    expect(html).toContain("View more");
    // A chat of a listed campaign is not a row of its own, and Campaign 1 (the latest chat) comes before Campaign 2.
    expect(html).not.toContain(">Chat 1<");
    expect(html.indexOf(">Campaign 1<")).toBeLessThan(html.indexOf(">Campaign 2<"));
    expect(render({ campaigns: many(2), chats: chatsIn(2) })).not.toContain("View more");
  });

  it("lists a chat about no campaign as itself, among the campaigns by time, each with its own icon: a folder for a campaign, a bubble for a chat", () => {
    const now = Date.now();
    const chats = [
      chat("1", { campaignId: "C1", campaignName: "Campaign 1", at: now - 1 * 60_000 }),
      chat("2", { title: "Reminders", at: now - 2 * 60_000 }),
      chat("3", { campaignId: "C2", campaignName: "Campaign 2", at: now - 3 * 60_000 }),
    ];
    const html = render({ campaigns: many(2), chats });
    const at = (s: string) => html.indexOf(s);
    expect(at(">Campaign 1<")).toBeLessThan(at(">Reminders<"));
    expect(at(">Reminders<")).toBeLessThan(at(">Campaign 2<"));
    // The chat is a row with a lead icon (one line up with the campaigns), the campaigns are rows of the campaign kind.
    expect(html).toMatch(/class="hx-row[^"]*has-lead/);
    expect((html.match(/class="hx-row hx-camp-row/g) ?? []).length).toBe(2);
    // Every row has its icon (two folders, one bubble), so the titles start on one line.
    expect((html.match(/class="hx-row-ico"/g) ?? []).length).toBe(3);
  });

  it("leaves out a campaign nobody has chatted in: the Campaigns page lists them all", () => {
    const html = render({ campaigns: many(3), chats: [chat("1", { campaignId: "C3", campaignName: "Campaign 3", at: Date.now() - 1000 })] });
    expect(html).toContain(">Campaign 3<");
    expect(html).not.toContain(">Campaign 1<");
    expect(html).not.toContain(">Campaign 2<");
  });

  it("says how long ago a campaign's latest chat was", () => {
    const html = render({ campaigns: many(2), chats: [chat("1", { campaignId: "C1", campaignName: "Campaign 1", at: Date.now() - 3 * 3_600_000 })] });
    expect(html).toContain('<span class="hx-row-when">3h</span>');
    expect((html.match(/hx-row-when/g) ?? []).length).toBe(1);
  });

  it("has the campaign's menu on each campaign row: a new chat in it, the campaign, a pin", () => {
    const src = readFileSync(join(__dirname, "..", "ChatRail.tsx"), "utf8");
    expect(render({ campaigns: many(1), chats: chatsIn(1) })).toContain('aria-label="More for Campaign 1"');
    expect(src).toMatch(/<button type="button" className="hx-row-t" onClick=\{\(\) => onPick\(item\)\}/);
    for (const label of ['label="New chat"', 'label="Open campaign"', 'label={pinned ? "Unpin" : "Pin"}']) expect(src).toContain(label);
  });

  it("says how a person starts when there are no campaigns and no chats at all", () => {
    expect(render({ campaigns: [], chats: [] })).toContain("Ask the agent anything");
    expect(render({ campaigns: [], chats: [] })).not.toContain(">Recents<");
  });

  it("takes the list back to the top when a campaign is picked, so the Selected block it moves into is in front of them", () => {
    const src = readFileSync(join(__dirname, "..", "ChatRail.tsx"), "utf8");
    expect(src).toMatch(/body\.current\?\.scrollTo\?\.\(\{ top: 0, behavior: "smooth" \}\);\s+onPickCampaign\(c\);/);
  });

  it("picks a campaign by opening its latest chat of the person's own, or starting one", () => {
    const page = readFileSync(join(__dirname, "..", "Agent.tsx"), "utf8");
    expect(page).toContain("onPickCampaign={(c) => (c.latest ? openRailChat(c.latest) : startIn({ id: c.id, name: c.name }))}");
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

  it("is sized like the console's other pages: rows and nav at 14px, headings at 12.5px, times at 12px", () => {
    expect(css).toMatch(/\.hx-row-t \{[^}]*font: 400 14px/);
    expect(css).toMatch(/\.hx-nav \{[^}]*font: 400 14px/);
    expect(css).toMatch(/\.hx-sec-h \{[^}]*font: 500 12\.5px/);
    expect(css).toMatch(/\.hx-row-when \{[^}]*font: 400 12px/);
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

describe("the top of the list: today and who is on it", () => {
  const slot = (key: string, over: Partial<RailSlot> = {}): RailSlot => ({
    key, label: key, value: "Set", empty: false, loading: false, twoLine: false, go: { href: "#/x" }, name: key, ...over,
  });
  const slots = [slot("Owner"), slot("Collaborators", { value: "Add collaborators", empty: true }), slot("Visibility"), slot("Filters"), slot("Channels"), slot("Intake")];
  const stats = [
    { id: "found", label: "Found", value: 79, gain: 12 },
    { id: "contacted", label: "Contacted", value: 30, gain: 0 },
    { id: "interviews", label: "Interviews", value: 2, gain: 1 },
  ];
  const draw = (over: Partial<Parameters<typeof RailContext>[0]> = {}) =>
    renderToStaticMarkup(
      <RailContext campaign={{ id: "A", name: "Data Analyst" }} week={{ state: "ready", stats }} onRetryWeek={noop} slots={slots} {...over} />,
    );

  it("says it is today's, names the campaign they are for beside it, and says all campaigns when they are everyone's", () => {
    const html = draw();
    expect(html).toContain("<span>Today</span>");
    expect(html).toContain('<span class="hx-wk-c" title="Data Analyst">Data Analyst</span>');
    expect(html).not.toContain("Last 7 days");
    expect(draw({ campaign: null })).toContain('title="All campaigns">All campaigns</span>');
  });

  it("shows the day's three figures, found, contacted and interviews, and a gain on yesterday only when there is one", () => {
    const html = draw();
    for (const l of ["Found", "Contacted", "Interviews"]) expect(html).toContain(`>${l}<`);
    expect(html).not.toContain(">Replies<");
    expect(readFileSync(join(__dirname, "..", "Agent.tsx"), "utf8")).not.toContain('label: "Replies"');
    expect(html).toContain("up 12 on yesterday");
    expect(html).toContain("+12");
    expect(html).toContain("+1<");
    expect(html).not.toContain("+0");
  });

  it("holds the figures' place while they load and says so when they cannot", () => {
    expect(draw({ week: { state: "loading", stats: [] } })).toContain("Loading the week");
    expect(draw({ week: { state: "failed", stats: [] } })).toContain("ui-failed");
  });

  it("draws the daily sourcing line it is given under the figures and above who is on the campaign", () => {
    const html = draw({ daily: <button type="button">Daily sourcing line</button> });
    expect(html.indexOf(">Found<")).toBeLessThan(html.indexOf("Daily sourcing line"));
    expect(html.indexOf("Daily sourcing line")).toBeLessThan(html.indexOf('aria-label="Owner"'));
    expect(draw()).not.toContain("Daily sourcing");
  });

  it("lays the figures out in as many columns as there are, so three (an older server) or four both fill the row", () => {
    expect(css).toMatch(/\.hx-wk-grid \{[^}]*grid-auto-flow: column/);
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
    expect(css).toMatch(/\.hx-row\.is-nested \.hx-row-t \{[^}]*font-size: 13\.5px/);
    expect(css).toMatch(/\.hx-camp-fold:not\(\.is-open\) \.hx-sec-c \{ transform: rotate\(-90deg\)/);
    const src = readFileSync(join(__dirname, "..", "ChatRail.tsx"), "utf8");
    expect(src).toContain("readOpenCampaigns()[item.id] ?? current");
  });

  it("fit the campaigns to the height there is, so nothing is left empty at the foot", () => {
    const src = readFileSync(join(__dirname, "..", "ChatRail.tsx"), "utf8");
    expect(src).toContain("new ResizeObserver(measure)");
    expect(src).toMatch(/const count = fit \+ more;/);
  });

  it("keeps pinned campaigns close: a campaign row is no taller than a chat row, with no extra gap between blocks", () => {
    expect(css).toMatch(/\.hx-camp-row \.hx-row-t, \.hx-row\.has-lead \.hx-row-t \{[^}]*min-height: 38px/);
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
    // A rejection is kept (shortlisting brings them back); a shortlist can be taken back or turned into a rejection.
    expect(bits).toContain("const rejectFixed = LIVE && rej;");
    expect(bits).not.toContain("shortFixed");
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
    // The top block is quiet: its title is the ink's own, so the brand colour is for the list's headings and what is selected.
    expect(css).toMatch(/\.hx-wk-t \{[^}]*color: var\(--ink\)/);
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
    expect(css).toMatch(/\.is-rail-hidden:not\(\.is-rail-left\) \.hx-head \{ padding-right: 68px; \}/);
    expect(css).toMatch(/\.is-rail-left\.is-rail-hidden \.hx-head \{ padding-left: 68px; \}/);
  });

  it("holds the New chat, Search and Campaigns rows to the column's width, whatever the search field's own size", () => {
    expect(css).toMatch(/\.hx-navs \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.hx-nav \{[^}]*min-width: 0/);
    expect(css).toMatch(/\.hx-nav--search\.is-open input \{[^}]*width: 100%/);
  });
});

describe("the selected campaign in the list", () => {
  const withChats = (n: number) => Array.from({ length: n }, (_, i) => chat(String(i + 1), { campaignId: "A", campaignName: "Data Analyst" }));

  const twoCampaigns = [{ id: "A", name: "Data Analyst" }, { id: "B", name: "Other One" }];

  it("shows a Selected section above Pinned and the campaigns, with the campaign's chats, when one is selected and not pinned", () => {
    const html = render({ chats: [...withChats(3), chat("9", { campaignId: "B", campaignName: "Other One" })], campaigns: twoCampaigns, selected: { id: "A", name: "Data Analyst" } });
    expect(html).toContain(">Selected<");
    expect(html.indexOf(">Selected<")).toBeLessThan(html.indexOf(">Recents<"));
    expect(html).toContain("Data Analyst");
    // Its chats are under it, once; it is not listed a second time below, where the other campaign is.
    expect((html.match(/Chat 1</g) ?? []).length).toBe(1);
    expect(html).not.toContain('data-flip="campaign:A"');
    expect(html).toContain('data-flip="campaign:B"');
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

  it("holds each key once with a campaign selected, its chats under it, the other campaigns and the chats about none", () => {
    const chats = [chat("1", { campaignId: "A", campaignName: "Data Analyst" }), chat("2", { campaignId: "A", campaignName: "Data Analyst" }), chat("3")];
    const html = render({ chats, campaigns: [{ id: "A", name: "Data Analyst" }, { id: "B", name: "Other One" }], selected: { id: "A", name: "Data Analyst" } });
    const keys = keysOf(html);
    expect(html.match(/Chat 1</g)?.length).toBe(1);
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
  const campaigns = [{ id: "A", name: "Data Analyst" }, { id: "B", name: "Other One" }];
  const selectedSection = (html: string) => html.slice(html.indexOf('data-flip="sec:selected"'), html.indexOf('data-flip="sec:recents"'));
  /* A row from its opening tag to the next one; the one with this title in its title span is the one asked for. */
  const rowsOf = (html: string) => html.split(/(?=<div class="hx-row[ "])/).filter((r) => r.startsWith('<div class="hx-row'));
  const rowOf = (html: string, title: string) => rowsOf(html).find((r) => new RegExp(`class="hx-row-title">(?:<svg[^>]*>.*?</svg>)?${title}(?:<span|</span>)`).test(r)) ?? "";

  it("is the first of its campaign's chats, though older than the others, and drawn with the tint and the pin before its name", () => {
    const html = render({ chats: withDaily, campaigns, selected: { id: "A", name: "Data Analyst" } });
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

  it("is not a row of its own in the list below (its campaign is), and its campaign comes after its name where it is shown outside its campaign's chats", () => {
    const html = render({ chats: withDaily, campaigns, selected: { id: "A", name: "Data Analyst" } });
    expect(html.slice(html.indexOf('data-flip="sec:recents"'))).not.toContain("Daily search");
    // Under its own campaign it is not told apart by the campaign; elsewhere (pinned on its own, a search result) every daily chat would read the same.
    expect(rowOf(selectedSection(html), "Daily search")).not.toContain("hx-row-camp");
    const rail = readFileSync(join(__dirname, "..", "ChatRail.tsx"), "utf8");
    expect(rail).toContain('const under = chat.daily && !nested ? chat.campaignName : "";');
    expect(rail).toContain('aria-label={`More for ${chat.title}${under ? `, ${under}` : ""}`}');
  });

  it("is built from the server's rows by the page for the person's own and for others', with railChatOf", () => {
    const page = readFileSync(join(__dirname, "..", "Agent.tsx"), "utf8");
    expect(page.match(/railChatOf\(/g)).toHaveLength(2);
    expect(page).not.toContain("campaignName: c.focusCampaignName");
  });

  it("holds each flip key once with a daily chat in the list, under its campaign", () => {
    const html = render({ chats: [...withDaily, daily("8", { campaignId: "B", campaignName: "Other" })], campaigns, selected: { id: "A", name: "Data Analyst" } });
    const keys = [...html.matchAll(/data-flip="([^"]+)"/g)].map((m) => m[1] as string);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("selected:A");
    expect(keys.filter((k) => k.endsWith(":9"))).toEqual(["A:9"]);
  });

  it("keeps the chats under a campaign to the first few with the daily one always among them, and counts the rest from there", () => {
    const newer = Array.from({ length: NESTED_SHOWN + 2 }, (_, i) => chat(`n${i}`, { ...A, title: `Newer ${i}`, at: Date.now() - i * 60_000 }));
    const html = render({ chats: [...newer, daily("9", { at: Date.now() - 9 * 86_400_000 })], campaigns, selected: { id: "A", name: "Data Analyst" } });
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

describe("which side the list is on", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

  it("is on the right when the component is given no side, and has the side switch only when it can be moved", () => {
    const right = render({ onSide: noop });
    expect(right).toContain('class="hx-rail"');
    expect(right).not.toContain("is-left");
    expect(right).toContain('aria-label="Move the list to the left"');
    expect(render()).not.toContain("hx-side");
  });

  it("is marked as on the left, on its button and its panel, with the switch offering the right", () => {
    const left = render({ side: "left", onSide: noop });
    expect(left).toContain('class="hx-rail is-left"');
    expect(left).toContain('class="hx-toggle is-left"');
    expect(left).toContain('aria-label="Move the list to the right"');
  });

  it("starts right after the console's own side bar on the left: the page's two columns the other way round, the list in the first", () => {
    const css = read("agentChat.css");
    expect(css).toMatch(/\.orc\.orc--lx\.is-rail-left \{ grid-template-columns: var\(--hx-w\) minmax\(0, 1fr\); \}/);
    expect(css).toMatch(/\.orc\.orc--lx\.is-rail-left > \.hx-rail \{ grid-column: 1; \}/);
    expect(css).toMatch(/\.orc\.orc--lx\.is-rail-left > \.orc-main, \.orc\.orc--lx\.is-rail-left\.is-rail-hidden > \.orc-main \{ grid-column: 2; \}/);
    // Hidden or moving, the first track is nothing, as the second is on the right.
    expect(css).toMatch(/\.is-rail-left\.is-rail-hidden, \.orc\.orc--lx\.is-rail-left\.is-rail-moving \{ grid-template-columns: 0px minmax\(0, 1fr\); \}/);
    // The edge between the list and the conversation is on the side facing it.
    expect(css).toMatch(/\.hx-rail\.is-left \.hx-panel \{ border-left: 0; border-right: 1px solid/);
  });

  it("keeps the hide button in the list's outer top corner on either side, as an item of the page's grid that sticks, so it follows the side bar", () => {
    const css = read("agentChat.css");
    expect(css).toMatch(/\.hx-toggle \{[^}]*position: sticky;[^}]*top: var\(--page-top, 16px\)/);
    expect(css).toMatch(/\.hx-toggle \{[^}]*grid-column: 2;[^}]*justify-self: end/);
    expect(css).toMatch(/\.hx-toggle\.is-left \{ grid-column: 1; justify-self: start;/);
    expect(css).not.toMatch(/\.hx-toggle \{[^}]*position: fixed/);
  });

  it("anchors the list to its outer edge so it slides out toward that edge, and floats open from the page's own edge when it is hidden on the left", () => {
    const css = read("agentChat.css");
    expect(css).toMatch(/\.hx-rail\.is-left \{ justify-content: flex-end; \}/);
    expect(css).toMatch(/\.hx-rail\.is-left\.is-hidden\.is-peek \.hx-panel \{ left: calc\(var\(--peek-x, 0px\) \+ 10px\); right: auto;/);
    expect(css).toContain("@keyframes hx-peek-left");
    expect(read("ChatRail.tsx")).toContain('rail.current?.style.setProperty("--peek-x"');
  });

  it("moves in three steps so nothing jumps: it closes where it is, is put on the other side with the page's transitions off, and opens there", () => {
    const page = read("Agent.tsx");
    expect(page).toContain('setRailPhase("closing");');
    expect(page).toContain('later(() => { setRailPhase("swapping"); apply(); }, 300);');
    expect(page).toContain('later(() => setRailPhase("idle"), 360);');
    // The closing takes the 280ms the hide button takes; the swap comes after it.
    expect(read("agentChat.css")).toMatch(/transition: grid-template-columns 280ms/);
    // The two orders of the columns cannot ease into each other (the browser flips them halfway, and the conversation has no room for a moment), so the swap has no transition.
    expect(read("agentChat.css")).toMatch(/\.orc\.orc--lx\.is-rail-swapping \{ transition: none; \}/);
    expect(page).toContain('${LIVE && railPhase === "swapping" ? " is-rail-swapping" : ""}');
    // The button fades while it moves, and a change while it is moving is not taken.
    expect(read("agentChat.css")).toMatch(/\.is-rail-moving \.hx-toggle \{ opacity: 0; pointer-events: none; \}/);
    expect(page).toContain('if (to === railSide || railPhase !== "idle") return;');
  });

  it("is put on the other side at once when it is hidden or motion is not wanted, remembered, and given back as it was left", () => {
    const page = read("Agent.tsx");
    expect(page).toContain("railHiddenNow.current ||");
    expect(page).toContain('(prefers-reduced-motion: reduce)');
    expect(page).toContain('window.localStorage.setItem("superhyre.chatrail.side", to)');
    // Until someone moves it, the list is on the left; whoever moved it to the right has that remembered.
    expect(page).toContain('window.localStorage.getItem("superhyre.chatrail.side") === "right" ? "right" : "left"');
    expect(page).toContain('catch { return "left"; }');
  });

  it("keeps the header clear of the hide button on the left too, and the narrow window's single column on either side", () => {
    const css = read("agentChat.css");
    expect(css).toMatch(/@media \(max-width: 1099px\) \{\s+\.orc\.orc--lx, \.orc\.orc--lx\.is-rail-left \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(css).toMatch(/\.hx-rail\.is-left \.hx-wk-t \{ padding-right: 0; padding-left: 80px; \}/);
  });
});

describe("the top of the list, in three quiet parts", () => {
  const css = readFileSync(join(__dirname, "..", "agentChat.css"), "utf8");

  it("sets the daily search, the owner and the collaborators as rows of one list, one size and one height, with the label on the left", () => {
    expect(css).toMatch(/\.hx-day \{[^}]*padding: 8px 11px;[^}]*font: 400 13px/);
    expect(css).toMatch(/\.hx-cfg \.rail-row \{ font-size: 13\.5px; padding: 8px 11px; \}/);
    expect(css).toMatch(/\.hx-day-t \{ flex: none; color: var\(--ink-2\); \}/);
  });

  it("puts the figures at 18px with 12px labels, each column as wide as it needs (so Contacted and Interviews are whole)", () => {
    expect(css).toMatch(/\.hx-wk-n \{ font: 500 18px/);
    expect(css).toMatch(/\.hx-wk-l \{[^}]*font: 400 12px/);
    expect(css).toMatch(/\.hx-wk-grid \{[^}]*grid-auto-columns: auto; justify-content: space-between/);
  });

  it("draws the daily row inside the rows' list, first, so it lines up with them", () => {
    const rc = readFileSync(join(__dirname, "..", "RailContext.tsx"), "utf8");
    expect(rc).toContain("{daily && <li>{daily}</li>}");
    expect(rc.indexOf("{daily && <li>{daily}</li>}")).toBeLessThan(rc.indexOf("people.map("));
  });
});

describe("the agent page's type", () => {
  const css = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
  it("reads in the console's own sizes: the transcript's raised type tokens are gone", () => {
    const chat = css("chat.css");
    expect(chat).not.toContain("ONE SIZE UP");
    expect(chat).not.toMatch(/\.orc\.is-agent \.orc-log \{\s+--type-body:/);
  });
  it("has the message, the answer and the box at 15px, as they were before the page was made one size larger", () => {
    expect(css("access.css")).toMatch(/font: 400 15px\/1\.65 var\(--ui\)/);
    expect(css("chat.css")).toMatch(/\.orc-turn \.rep-prompt \{[^}]*font: 400 15px\/1\.65/);
  });
});
