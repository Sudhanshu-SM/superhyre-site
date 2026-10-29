import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { newTurn } from "../liveChat";
import { LiveTurnBody } from "../LiveTurn";

/**
 * An owner or admin reading somebody else's chat sees it as it was, and cannot do anything in it. A run that was still
 * going drew "Getting started" with a Stop beside it: a button for a run that is not theirs and that nothing in that view
 * can press.
 */

const working = { ...newTurn("t", "find candidates"), status: "working" as const, runId: "r1", startedAt: Date.now() };

describe("a turn that is still going", () => {
  it("can be stopped from the person's own chat", () => {
    expect(renderToStaticMarkup(<LiveTurnBody turn={working} onAnswer={() => {}} />)).toContain("lt-stop");
  });

  it("has no Stop in somebody else's chat, and still says it is getting started", () => {
    const html = renderToStaticMarkup(<LiveTurnBody turn={working} onAnswer={() => {}} readOnly />);
    expect(html).not.toContain("lt-stop");
    expect(html).toContain("Getting started");
  });

  it("is drawn read only by the shared chat page", () => {
    expect(readFileSync(resolve(__dirname, "..", "SharedChat.tsx"), "utf8")).toContain("later={state.turns.slice(i + 1)} readOnly />");
  });
});
