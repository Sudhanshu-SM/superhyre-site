import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatTime, chatTime, chatTimeTitle } from "../ChatTime";
import { newTurn } from "../liveChat";
import { LiveTurnBody } from "../LiveTurn";
import { Prompt } from "../Reply";
import { SharedMessage } from "../SharedChat";

/**
 * Each message in a chat says when it was sent, small and quiet under it: the person's own words under their bubble, and
 * the agent's answer under it, at the left. The page is one px larger and wider than it was; its numbers are pinned
 * at the foot of this file.
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = new Date(2026, 9, 29, 0, 10);

describe("how a time is said", () => {
  it("is the time alone for today, in 12 hours with am and pm", () => {
    expect(chatTime(at(2026, 10, 29, 9, 5), NOW)).toBe("9:05 am");
    expect(chatTime(at(2026, 10, 29, 0, 5), NOW)).toBe("12:05 am");
    expect(chatTime(at(2026, 10, 29, 12, 0), NOW)).toBe("12:00 pm");
    expect(chatTime(at(2026, 10, 29, 23, 54), NOW)).toBe("11:54 pm");
  });

  it("puts the day before it on any other day, with the year only when it is not this one", () => {
    expect(chatTime(at(2026, 10, 28, 23, 54), NOW)).toBe("28 Oct, 11:54 pm");
    expect(chatTime(at(2026, 1, 3, 8, 30), NOW)).toBe("3 Jan, 8:30 am");
    expect(chatTime(at(2025, 12, 9, 15, 5), NOW)).toBe("9 Dec 2025, 3:05 pm");
  });

  it("says nothing for a time that is not one", () => {
    expect(chatTime(Number.NaN, NOW)).toBe("");
    expect(chatTimeTitle(Number.NaN)).toBe("");
  });

  it("has the whole date for the tooltip", () => {
    expect(chatTimeTitle(at(2026, 10, 28, 23, 54))).toBe("Wed 28 Oct 2026, 11:54 pm");
    expect(chatTimeTitle(at(2026, 1, 1, 0, 0))).toBe("Thu 1 Jan 2026, 12:00 am");
  });

  it("follows the console's voice: no dots between parts, no dashes, no ellipsis", () => {
    for (const label of [chatTime(at(2025, 12, 9, 15, 5), NOW), chatTime(at(2026, 10, 28, 23, 54), NOW), chatTimeTitle(at(2026, 10, 28, 23, 54))]) {
      expect(label).not.toMatch(/ · |—|–|…/);
    }
  });
});

describe("the time element", () => {
  it("is a <time> with its machine value and the whole date on hover", () => {
    const html = renderToStaticMarkup(<ChatTime at={at(2026, 10, 28, 23, 54)} className="rep-time-user" />);
    expect(html).toMatch(/^<time class="rep-time rep-time-user" dateTime="\d{4}-\d{2}-\d{2}T[^"]+Z" title="Wed 28 Oct 2026, 11:54 pm">/);
    expect(html).toContain("</time>");
  });

  it("is not drawn without a time", () => {
    expect(renderToStaticMarkup(<ChatTime at={null} />)).toBe("");
    expect(renderToStaticMarkup(<ChatTime at={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<ChatTime at={Number.NaN} />)).toBe("");
  });
});

describe("where it is drawn", () => {
  it("is under the person's bubble, and not drawn when the message has no time (a prompt in a place that does not know it)", () => {
    const html = renderToStaticMarkup(<Prompt text="find candidates from hyderabad only" at={at(2026, 10, 28, 23, 48)} />);
    expect(html.indexOf("rep-prompt-text")).toBeLessThan(html.indexOf("<time"));
    expect(html).toContain("rep-time-user");
    expect(renderToStaticMarkup(<Prompt text="find candidates" />)).not.toContain("<time");
  });

  it("is under an answer that was thought about, once the answer is whole", () => {
    const done = { ...newTurn("t", "hello"), status: "done" as const, runId: "r1", reply: "Hi.", startedAt: at(2026, 10, 28, 23, 54), finishedAt: at(2026, 10, 28, 23, 55) };
    const html = renderToStaticMarkup(<LiveTurnBody turn={done} onAnswer={() => {}} />);
    expect(html).toContain('class="rep-time rep-time-reply"');
    expect(html).toContain('title="Wed 28 Oct 2026, 11:55 pm"');
    // After the answer's words, as the person's own is after their bubble.
    expect(html.indexOf("rep-time-reply")).toBeGreaterThan(html.indexOf("Hi."));
  });

  it("is not drawn while the answer is still on its way, or for one that failed", () => {
    const working = { ...newTurn("t", "hello"), status: "working" as const, runId: "r1" };
    expect(renderToStaticMarkup(<LiveTurnBody turn={working} onAnswer={() => {}} />)).not.toContain("<time");
    const failed = { ...newTurn("t", "hello"), status: "failed" as const, runId: "r1", error: "It stopped.", finishedAt: at(2026, 10, 28, 23, 55) };
    expect(renderToStaticMarkup(<LiveTurnBody turn={failed} onAnswer={() => {}} />)).not.toContain("<time");
  });

  it("is under a line the agent said on its own, the way it is under an answer: a chat of mornings' findings says when each came, and no 'Thought for' line", () => {
    const morning = { ...newTurn("t", ""), status: "done" as const, runId: null, reply: "**3 new people for Data Analyst**", quiet: { label: "" }, startedAt: at(2026, 10, 28, 8, 0), finishedAt: at(2026, 10, 28, 8, 0) };
    const html = renderToStaticMarkup(<LiveTurnBody turn={morning} onAnswer={() => {}} />);
    expect(html).toContain('class="rep-time rep-time-reply"');
    expect(html).toContain('title="Wed 28 Oct 2026, 8:00 am"');
    expect(html.indexOf("rep-time-reply")).toBeGreaterThan(html.indexOf("3 new people"));
    expect(html).not.toContain("Thought for");
    // A turn with no run that is not the agent speaking first (the person's words are above it) keeps its old silence.
    const typed = { ...newTurn("t", "hello"), status: "done" as const, runId: null, reply: "Hi.", finishedAt: at(2026, 10, 28, 8, 0) };
    expect(renderToStaticMarkup(<LiveTurnBody turn={typed} onAnswer={() => {}} />)).not.toContain("<time");
  });

  it("is never said for the answer before it is said for the question, when this browser's clock runs ahead of the server's", () => {
    const done = { ...newTurn("t", "hello"), status: "done" as const, runId: "r1", reply: "Hi.", startedAt: at(2026, 10, 28, 23, 57), finishedAt: at(2026, 10, 28, 23, 55) };
    const html = renderToStaticMarkup(<LiveTurnBody turn={done} onAnswer={() => {}} />);
    expect(html).toContain('title="Wed 28 Oct 2026, 11:57 pm"');
    expect(html).not.toContain("11:55 pm");
    // With the clocks right, the answer's own time stands.
    const right = { ...done, startedAt: at(2026, 10, 28, 23, 54) };
    expect(renderToStaticMarkup(<LiveTurnBody turn={right} onAnswer={() => {}} />)).toContain('title="Wed 28 Oct 2026, 11:55 pm"');
  });

  it("is under each message of somebody else's chat for anyone who reads it as words, not only for an admin who sees the turns", () => {
    const message = (over: Record<string, unknown>) =>
      ({ id: "m1", conversationId: "c", seq: 1, role: "user", text: "find candidates", campaignIds: [], artifact: null, clientId: null, runId: null, createdAt: new Date(2026, 9, 28, 23, 48).toISOString(), ...over }) as Parameters<typeof SharedMessage>[0]["message"];
    const asked = renderToStaticMarkup(<SharedMessage message={message({})} who="Punith Rao" />);
    expect(asked).toContain("shc-said");
    expect(asked).toContain('class="rep-time shc-time"');
    const answered = renderToStaticMarkup(<SharedMessage message={message({ id: "m2", role: "assistant", text: "Here they are." })} who="Punith Rao" />);
    expect(answered).toContain("shc-reply");
    expect(answered).toContain('class="rep-time rep-time-reply"');
    // A card the words cannot show says so, and has no time of its own.
    const card = renderToStaticMarkup(<SharedMessage message={message({ id: "m3", role: "assistant", text: "" })} who="Punith Rao" />);
    expect(card).toContain("Punith can show it to you in the campaign.");
    expect(card).not.toContain("<time");
    // A message with no readable time draws none.
    expect(renderToStaticMarkup(<SharedMessage message={message({ createdAt: "not a time" })} who="Punith Rao" />)).not.toContain("<time");
  });

  it("is given to the prompt by the page (when the message was sent), and drawn under a message in somebody else's chat too", () => {
    expect(src("Agent.tsx")).toContain("<Prompt text={turn.said} at={turn.startedAt} files=");
    expect(src("SharedChat.tsx")).toContain('{t.said && <ChatTime at={t.startedAt} className="shc-time" />}');
    expect(src("LiveTurn.tsx")).toContain('<ChatTime at={answeredAt} className="rep-time-reply" />');
  });
});

describe("how it looks", () => {
  const css = src("chatTime.css");

  it("is small and quiet: 12px, the third ink, in figures that line up", () => {
    expect(css).toMatch(/\.rep-time \{[^}]*font: 400 12px\/1 var\(--ui\)/);
    expect(css).toMatch(/\.rep-time \{[^}]*color: var\(--ink-3\)/);
    expect(css).toMatch(/\.rep-time \{[^}]*tabular-nums/);
  });

  it("sits under the bubble on the right, and under the answer on the left", () => {
    expect(css).toMatch(/\.rep-time-user \{[^}]*text-align: right/);
    expect(css).toMatch(/\.rep-time-reply \{[^}]*margin-top: -2px/);
    expect(css).not.toMatch(/\.rep-time-reply \{[^}]*position: absolute/);
  });
});

describe("one size up, and wider", () => {
  const chat = src("chat.css");
  const page = src("agentChat.css");
  const access = src("access.css");
  const rule = (css: string, needle: string) => css.slice(css.indexOf(needle), css.indexOf("}", css.indexOf(needle)) + 1);

  it("reads the message and the answer at 16px, the thought line at 12.5px, and the people cards a px up", () => {
    expect(rule(chat, ".orc-turn .rep-prompt {")).toMatch(/font: 400 16px\/1\.65/);
    expect(rule(access, ".rep-para {")).toMatch(/font: 400 16px\/1\.65/);
    expect(rule(access, ".rep-thought {")).toMatch(/font: 400 12\.5px\/1/);
    expect(rule(src("sourcing.css"), ".src-card-name {")).toMatch(/font: 600 15\.5px\/1\.3/);
    expect(rule(src("sourcing.css"), ".src-card-line {")).toMatch(/font: 400 14\.5px\/1\.4/);
    expect(rule(src("clarify.css"), ".qa-ask {")).toMatch(/font: 600 16\.5px\/1\.35/);
    expect(rule(src("agentCards/cta.css"), ".cta {")).toMatch(/font: 500 14px\/1/);
  });

  it("shifts the type tokens one px up for everything in the log, and for nothing outside it", () => {
    const block = rule(chat, ".orc.is-agent .orc-log {\n  --type-caption");
    for (const token of ["caption", "label", "body-sm", "body", "body-strong", "body-lg", "title-sm", "num-sm"]) expect(block).toContain(`--type-${token}:`);
    expect(block).toContain("--type-body:        400 .9375rem/1.3125rem var(--ui);");
    expect(block).toContain("--type-body-sm:     400 .875rem/1.3125rem var(--ui);");
    // The scale itself, on :root, is the console's and is not touched.
    expect(access).toContain("--type-body:        400 var(--fs-14)/var(--lh-20) var(--ui);");
  });

  it("gives the transcript more room: a wider cap, smaller insets, a slimmer list, a wider bubble", () => {
    expect(page).toMatch(/\.orc\.orc--lx > \.orc-main \{[^}]*max-width: 1300px/);
    expect(page).toContain("--hx-w: 288px;");
    expect(page).toContain("--orc-inset-l: clamp(16px, 2vw, 36px);");
    expect(page).toContain("--orc-inset-r: clamp(16px, 2vw, 36px);");
    expect(rule(chat, ".orc-turn .rep-prompt {")).toContain("max-width: min(72%, 760px)");
  });
});
