import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatRail, DeleteAsk } from "../ChatRail";
import { RailContext } from "../RailContext";
import { ChatHeader } from "../ChatHeader";
import type { RailSlot } from "../railConfig";
import { CampaignsPicker } from "../CampaignsPicker";
import type { RailChat } from "../chatGroups";

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
    expect(src).toContain("readOpenCampaigns()[item.id] ?? false");
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
