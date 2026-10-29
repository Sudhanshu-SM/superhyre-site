import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Stages, type StageId, type StageView } from "../Stages";

/**
 * The goal card over a search says which of its three steps is going on, and only while one is. A card for a search that
 * has stopped, or that was read back from an earlier day, has no live step: it said "Step 1 of 3" on a finished search.
 */

const stage = (id: StageId, state: StageView["state"]): StageView => ({
  id,
  progress: state === "done" ? 1 : 0,
  state,
  note: "",
});

const html = (stages: StageView[], reached = false) =>
  renderToStaticMarkup(<Stages goal="Shortlist Backend Engineer" stages={stages} reached={reached} summary="3 shortlisted" />);

describe("the step a search is on", () => {
  it("is named while one is live, counted from one", () => {
    expect(html([stage("search", "done"), stage("match", "live"), stage("decide", "todo")])).toContain("Step 2 of 3");
    expect(html([stage("search", "live"), stage("match", "todo"), stage("decide", "todo")])).toContain("Step 1 of 3");
    expect(html([stage("search", "done"), stage("match", "done"), stage("decide", "wait")])).toContain("Step 3 of 3");
  });

  it("is not named when none is live: a search that stopped, or one read back from an earlier day", () => {
    const stopped = html([stage("search", "done"), stage("match", "todo"), stage("decide", "todo")]);
    expect(stopped).not.toContain("Step ");
    expect(stopped).toContain("Shortlist Backend Engineer");
  });

  it("says what was reached, and no step, once the goal is met", () => {
    const done = html([stage("search", "done"), stage("match", "done"), stage("decide", "done")], true);
    expect(done).toContain("3 shortlisted");
    expect(done).not.toContain("Step ");
  });
});
