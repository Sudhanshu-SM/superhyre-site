import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MemoryItem } from "../api/memory";
import { isViewKind, VIEW_KINDS } from "../chatViews";
import { DoubtedNotes } from "../liveViews/MemoryDoubts";
import { doubtLine, DOUBTS_ASK, DOUBTS_SHOW } from "../memoryView";
import { routeFromHash, showFromHash, withoutShow } from "../nav";
import { taskLink } from "../api/tasks";

/**
 * The notes the agent has stopped opening with because answers that leaned on them were turned down: one card in the
 * chat, with a Confirm and a Forget on each, a ghost while it loads and a calm line when there is nothing to look at.
 * The task that counts them opens the Agent on it.
 */

const note = (over: Partial<MemoryItem> = {}): MemoryItem => ({
  id: "d1", text: "Acme only hires people based in Pune.", kind: "fact", scope: "client", level: "client",
  clientId: "cl1", clientName: "Acme Robotics", campaignId: null, campaignName: null, personLabel: null, about: [],
  type: "facts", episode: null, basis: null, status: "active", trust: "agent", source: "distil", quote: null,
  confidence: 0.8, createdAt: "2026-10-08T10:00:00.000Z", updatedAt: "2026-10-08T10:00:00.000Z", at: "2026-10-08T10:00:00.000Z",
  supersededBy: null, usedCount: 4, lastUsedAt: "2026-10-10T10:00:00.000Z", expiresAt: null, doubted: "2026-10-12T09:00:00.000Z", turnedDown: 3, ...over,
});

const ok = () => Promise.resolve({ ok: true as const });
const draw = (over: Partial<Parameters<typeof DoubtedNotes>[0]> = {}) =>
  renderToStaticMarkup(
    <DoubtedNotes phase="ready" items={[note()]} working={[]} manages onConfirm={ok} onForget={ok} onRetry={() => {}} {...over} />,
  );
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("the card of doubted notes", () => {
  it("says what each note says, where it applies and why the agent doubts it, with Confirm and Forget on each", () => {
    const out = draw({ items: [note(), note({ id: "d2", text: "Shortlists are always eight people.", turnedDown: 5, level: "org", scope: "org", clientId: null, clientName: null })] });
    const text = words(out);
    expect(text).toContain("Acme only hires people based in Pune.");
    expect(text).toContain("For Acme Robotics");
    expect(text).toContain("Answers that used it were turned down 3 times");
    expect(text).toContain("turned down 5 times");
    expect(out.match(/>Confirm</g)).toHaveLength(2);
    expect(out.match(/>Forget</g)).toHaveLength(2);
  });

  it("uses no jargon", () => {
    expect(words(draw())).not.toMatch(/doubt|confidence|supersed|trust|slot|memory/i);
  });

  it("shows a ghost until the first answer, not an empty card", () => {
    for (const phase of ["idle", "loading"] as const) {
      const out = draw({ phase, items: [] });
      expect(out).toContain("shm");
      expect(out).toContain("Looking at the notes I&#x27;m not sure about");
      expect(out).not.toContain("not unsure");
    }
  });

  it("keeps the rows on screen while a later look is on its way", () => {
    const out = draw({ phase: "loading" });
    expect(out).toContain("Acme only hires people based in Pune.");
    expect(out).not.toContain("shm");
  });

  it("says plainly there is nothing to look at", () => {
    const text = words(draw({ items: [] }));
    expect(text).toContain("not unsure about any of my notes");
    expect(draw({ items: [] })).not.toContain("<button");
  });

  it("offers to try again when the first look fails, and keeps the rows when a later one does", () => {
    const failed = draw({ phase: "failed", items: [] });
    expect(words(failed)).toContain("Couldn't look at these just now.");
    expect(failed).toContain("Try again");
    expect(draw({ phase: "failed" })).toContain(">Confirm<");
  });

  it("tells someone who cannot change a whole-agency note to ask an admin, instead of showing buttons", () => {
    const org = note({ id: "d3", level: "org", scope: "org", clientId: null, clientName: null });
    const out = draw({ items: [org], manages: false });
    expect(words(out)).toContain("Ask an admin to confirm");
    expect(words(out)).toContain("An admin can say whether they still hold");
    expect(out).not.toContain(">Confirm<");
    expect(draw({ items: [org], manages: true })).toContain(">Confirm<");
  });

  it("holds back a row's buttons while its change is on its way", () => {
    expect(draw({ working: ["d1"] }).match(/disabled/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a line of room for what the last press did, so the card does not jump", () => {
    expect(draw()).toContain('role="status"');
  });
});

describe("why, in a few words", () => {
  it("counts the turn-downs, once or many times, or says it plainly when the count is not known", () => {
    expect(doubtLine({ turnedDown: 3 })).toBe("Answers that used it were turned down 3 times");
    expect(doubtLine({ turnedDown: 1 })).toBe("An answer that used it was turned down");
    expect(doubtLine({ turnedDown: 0 })).toBe("Answers that used it were turned down");
  });
});

describe("opening it from the task", () => {
  it("is a view the chat can show, named the same on both sides", () => {
    expect(isViewKind("memory-doubts")).toBe(true);
    expect(VIEW_KINDS).toContain(DOUBTS_SHOW);
  });

  it("takes the task's link to the Agent and spends the request on the way in", () => {
    const link = taskLink({ kind: "open", path: "/agent?show=memory-doubts" });
    expect(link).toBe("#/agent?show=memory-doubts");
    expect(routeFromHash(link ?? "")).toBe(routeFromHash("#/agent"));
    expect(showFromHash(link ?? "")).toBe("memory-doubts");
    expect(withoutShow(link ?? "")).toBe("#/agent");
    expect(withoutShow("#/agent?campaign=c1&show=memory-doubts")).toBe("#/agent?campaign=c1");
    expect(withoutShow("#/agent?show=memory-doubts&campaign=c1")).toBe("#/agent?campaign=c1");
    expect(showFromHash("#/agent")).toBeNull();
  });

  it("asks in words the server answers with the card and no model turn", () => {
    expect(DOUBTS_ASK).toBe("Which notes are you unsure about?");
  });
});

