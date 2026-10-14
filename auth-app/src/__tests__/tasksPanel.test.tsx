import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { setSession } from "../roleStore";
import { TasksCard } from "../TasksPanel";

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

/**
 * The Overview's Tasks panel as a person sees it: pending work for this campaign, five rows, the day as plain
 * text, a calm line when there is none, an add line, and a place under Hires that leaves Hires and Activity as
 * they were. (The prototype's fixtures stand in for the API here; the store behind it is campaignTasksStore.test.)
 */
describe("the Tasks panel", () => {
  it("lists what is pending on the campaign, soonest first, with the day as plain text and no status pill", () => {
    const html = renderToStaticMarkup(<TasksCard campaignId="backend-snr" />);
    expect(html).toContain('aria-label="Tasks"');
    expect(html).toContain("Approve the outreach draft for four staff engineers");
    // Due today is amber text; a task past its day says so once, with the date.
    expect(html).toMatch(/class="tp-due t-body-sm is-today"[^>]*>Today</);
    expect(html).toMatch(/class="tp-due t-body-sm is-late"[^>]*>Overdue \d{1,2} [A-Z][a-z]{2}</);
    // The header counts and opens the whole list; a plain-text due day is not a dot or a pill.
    expect(html).toMatch(/\d+ open</);
    expect(html).toContain(">View all<");
    expect(html).not.toMatch(/tp-dot|tp-pill|class="[^"]*\bpill\b/);
    expect((html.match(/class="tp-row/g) ?? []).length).toBeLessThanOrEqual(5);
  });

  it("has one add line: the words first, the day and the person offered with it", () => {
    const html = renderToStaticMarkup(<TasksCard campaignId="backend-snr" />);
    expect(html).toContain('placeholder="Add a task"');
    expect(html).toMatch(/type="datetime-local"[^>]*value="\d{4}-\d{2}-\d{2}T09:00"/);
    expect(html).toContain(">Add<");
  });

  it("says nothing is pending in a calm line with the tasks picture", () => {
    const html = renderToStaticMarkup(<TasksCard campaignId="no-such-campaign" />);
    expect(html).toContain("Nothing pending. Nice.");
    expect(html).toContain('class="ea"');
    expect(html).not.toContain("View all");
    expect(html).not.toMatch(/sorry|oops|no tasks yet/i);
  });

  it("shows a recruiter who only follows the campaign their own tasks on it, and the team's to everyone on it", () => {
    try {
      setSession({ role: "recruiter" });
      // On the campaign: its tasks, whoever they are for (the server already decided what this person may see).
      expect(renderToStaticMarkup(<TasksCard campaignId="backend-snr" />)).toContain("Approve the outreach draft for four staff engineers");
      // Following it: only what is theirs, which here is nothing.
      const following = renderToStaticMarkup(<TasksCard campaignId="backend-snr" onlyMine />);
      expect(following).toContain("Nothing pending. Nice.");
      expect(following).not.toContain("Approve the outreach draft");
    } finally {
      setSession({ role: "admin" });
    }
    // An admin is on every campaign: following changes nothing for them.
    expect(renderToStaticMarkup(<TasksCard campaignId="backend-snr" onlyMine />)).toContain("Approve the outreach draft");
  });

  it("disables the box on a task the person may not change, and says why", () => {
    const html = renderToStaticMarkup(<TasksCard campaignId="backend-snr" />);
    // An admin may change any task: no box is disabled.
    expect(html).not.toContain("disabled=\"\" title=\"Only the person it is for");
    const src2 = src("TasksPanel.tsx");
    expect(src2).toContain("disabled={!allowed}");
    expect(src2).toContain("Only the person it is for, or an admin, can change this");
  });

  it("groups Hires (or a recruiter's work) and Tasks in the markup and puts Activity beside them", () => {
    const page = src("CampaignWorkspace.tsx");
    expect(page).toMatch(/<div className="ov4-left">\s*\{session\.role === "admin" \? \(\s*<HiresCard[^]*?<YourWorkCard[^]*?<TasksCard campaignId=\{ctx\.campaignId\} onlyMine=\{!mayChange\} \/>\s*<\/div>\s*<OvCard title="Activity"/);
  });

  it("is three equal columns from 1200px, one screen at 900px and 720px tall, and a stack that scrolls below 1200px", () => {
    const css = src("workspace.css");
    // The group is not a box of its own: Hires and Tasks are the row's first two columns.
    expect(css).toMatch(/\.ov4-low > \.ov4-left \{ display: contents; \}/);
    expect(css).toMatch(/\.ov4-low \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(css).toMatch(/@media \(min-width: 1200px\) \{\s*\.ov4-low \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); gap: 14px; \}/);
    // The one-screen lock holds from 1200px wide and 720px tall (it was 1100 and 760), and nothing unlocks it above that.
    expect(css).toContain("@media (min-width: 1200px) and (min-height: 720px) {\n  .con-main:has(> .ov2) { overflow: hidden; }");
    expect(css).not.toContain("@media (min-width: 1100px) and (min-height: 760px)");
    expect(css).not.toMatch(/@media \(min-width: 1100px\) \{\s*\.con-main:has\(> \.ov2\) \{ overflow: visible; \}/);
  });

  it("holds four pending rows at 900px tall, five when taller, three and two as the window gets shorter", () => {
    const css = src("workspace.css");
    expect(css).toContain("(max-height: 999px) { .tp .tp-list > .tp-row:nth-child(n+5) { display: none; } }");
    expect(css).toContain("(max-height: 799px) { .tp .tp-list > .tp-row:nth-child(n+4) { display: none; } }");
    expect(css).toContain("(max-height: 739px) { .tp .tp-list > .tp-row:nth-child(n+3) { display: none; } }");
    // The add line is the card's last row, however many tasks there are.
    expect(css).toMatch(/\.tp-add \{ flex: none; display: grid; gap: 8px; margin-top: auto;/);
  });

  it("makes Hires compact in a third of the row: bar and count, the chair beside its line, two lines of what needs you", () => {
    const css = src("workspace.css");
    expect(css).toMatch(/\.hp \.hp-first\.is-none \{ flex: 1 1 auto; flex-direction: row; justify-content: center;/);
    expect(css).toMatch(/\.hp \.hp-first\.is-none \.ea \{ width: 48px; height: 48px; margin: 0; flex: none; \}/);
    expect(css).toContain(".hp .pb .pr-t small { display: none; }");
    // At most two of the people or the things that need the person; a recruiter's own-work rows are all kept.
    expect(css).toContain(".hp:not(.rl-work) .hp-list > li:not(.hp-all):nth-child(n+3) { display: none; }");
  });

  it("marks tasks stale when one is made or finished, through the invalidate map", () => {
    const inv = src("invalidate.ts");
    expect(inv).toContain('{ re: /^\\/v1\\/tasks(\\/.*)?$/, effects: [], views: ["tasks"] }');
    expect(inv).toContain('"campaign-overview": ["boards", "campaigns", "week", "specs", "tasks"]');
  });

  it("colours the day in amber and red-brown as text only, in light and dark", () => {
    const css = src("workspace.css");
    expect(css).toMatch(/\.tp-due\.is-today \{ color: #8a5a10; \}/);
    expect(css).toMatch(/\.tp-due\.is-late \{ color: #9a3b1f; \}/);
  });
});
