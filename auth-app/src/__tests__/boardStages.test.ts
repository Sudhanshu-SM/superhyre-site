import { describe, expect, it } from "vitest";
import type { StageDef, StageRow } from "../boardStages";
import { STAGE_HUES, stageHue } from "../stageDonut";
import {
  DEFAULT_STAGES, MAX_WORKING, NAME_MAX, addRow, adoptIds, bodyOf, canSaveRows, clientStageOf, columnsOf, defaultMoveTo, destinationFor, firstOfKind,
  columnNote, funnelBars, groupByStage, interviewWord, isDefaultSet, isStandardName, pipelineStrip, kindAbove, kindLocked, landing, moveRow, patchRow, presetOf, presetRows, removeRow, removedWithPeople, rowProblems, rowsFrom,
  sameAsBoard, stageIdOf, stageText, stepChip, stagesFrom, stagesFromRows, stagesFromSummary, verdictLabel, verdictTone, wouldMoveToStage, workingOf,
} from "../boardStages";

/**
 * A campaign's own board: which stages it has and in what order, which column a card is in, how a move lands, and
 * the editor's rules (names, counts-as, the one stage the client sees, where the people of a removed stage go).
 */

const def = (id: string, name: string, kind: StageDef["kind"], extra: Partial<StageDef> = {}): StageDef => ({
  id, name, kind, position: 0, color: null, clientView: false, locked: kind === "hired" || kind === "passed", ...extra,
});
/** A server's stages: five working-ish, out of order on purpose, with Hired and Rejected in the middle of the list. */
const SERVER = [
  def("p", "Rejected", "passed", { position: 5 }),
  def("s", "Shortlisted", "shortlisted", { position: 0 }),
  def("h", "Hired", "hired", { position: 4 }),
  def("c", "Client review", "outreach", { position: 2, clientView: true, color: "teal" }),
  def("o", "Outreach", "outreach", { position: 1 }),
  def("i", "Interviewing", "interviewing", { position: 3 }),
];
const person = (stage: StageDef["kind"], stageId?: string) => ({ stage, ...(stageId ? { stageId } : {}) });

describe("the stages a board has", () => {
  it("come in column order with Hired and Rejected last, whatever order they arrive in", () => {
    const list = stagesFrom(SERVER);
    expect(list.map((s) => s.name)).toEqual(["Shortlisted", "Outreach", "Client review", "Interviewing", "Hired", "Rejected"]);
    expect(list.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(list.slice(-2).every((s) => s.locked)).toBe(true);
  });

  it("put Hired and Rejected back when a server leaves them out, and fall back to the console's own five", () => {
    expect(stagesFrom([def("a", "Screen", "shortlisted")]).map((s) => s.kind)).toEqual(["shortlisted", "hired", "passed"]);
    expect(stagesFrom(undefined)).toBe(DEFAULT_STAGES);
    expect(stagesFrom([])).toBe(DEFAULT_STAGES);
    expect(stagesFrom([{ nope: 1 }, null, "x"])).toBe(DEFAULT_STAGES);
    expect(DEFAULT_STAGES.map((s) => s.name)).toEqual(["Shortlisted", "In outreach", "Interviewing", "Hired", "Rejected"]);
  });

  it("drop a colour this build does not know instead of drawing nothing", () => {
    const list = stagesFrom([{ id: "a", name: "Screen", kind: "shortlisted", color: "chartreuse", position: 0 }]);
    expect(list[0]!.color).toBeNull();
  });

  it("are read from the campaign list's own summary before the board has loaded", () => {
    const list = stagesFromSummary([
      { id: "a", name: "Intro call", kind: "shortlisted", color: "blue", count: 3 },
      { id: "h", name: "Hired", kind: "hired", color: null, count: 1 },
      { id: "p", name: "Rejected", kind: "passed", color: null, count: 0 },
    ]);
    expect(list.map((s) => [s.name, s.color, s.count])).toEqual([["Intro call", "blue", 3], ["Hired", null, 1], ["Rejected", null, 0]]);
  });

  it("make the board's columns without Rejected (that is the bin), and find the stage the client sees", () => {
    const list = stagesFrom(SERVER);
    expect(columnsOf(list).map((s) => s.name)).toEqual(["Shortlisted", "Outreach", "Client review", "Interviewing", "Hired"]);
    expect(workingOf(list).map((s) => s.name)).toEqual(["Shortlisted", "Outreach", "Client review", "Interviewing"]);
    expect(clientStageOf(list)?.id).toBe("c");
    expect(clientStageOf(DEFAULT_STAGES)).toBeUndefined();
    expect(firstOfKind(list, "outreach")?.id).toBe("o");
  });
});

describe("which column a card is in", () => {
  const list = stagesFrom(SERVER);

  it("is its own stage id when the board has it, else the first stage of its kind", () => {
    expect(stageIdOf(person("outreach", "c"), list)).toBe("c");
    expect(stageIdOf(person("outreach"), list)).toBe("o");
    expect(stageIdOf(person("outreach", "gone"), list)).toBe("o");
    expect(stageIdOf(person("passed"), list)).toBe("p");
  });

  it("groups people by column, every column present, in the order they came", () => {
    const by = groupByStage([person("outreach", "c"), person("outreach"), person("shortlisted"), person("hired", "h")], list);
    expect([...by.keys()]).toEqual(["s", "o", "c", "i", "h", "p"]);
    expect(by.get("c")).toHaveLength(1);
    expect(by.get("o")).toHaveLength(1);
    expect(by.get("i")).toHaveLength(0);
  });

  it("counts a move to the column they are already in as no move, and one to another column of the same kind as a move", () => {
    const at = list.find((s) => s.id === "c")!;
    expect(wouldMoveToStage(person("outreach", "c"), at, list)).toBe(false);
    expect(wouldMoveToStage(person("outreach", "o"), at, list)).toBe(true);
    expect(wouldMoveToStage(person("outreach"), list.find((s) => s.id === "o")!, list)).toBe(false);
  });
});

describe("where a move lands", () => {
  const list = stagesFrom(SERVER);
  it("follows the column's kind, and keeps the step inside the same kind", () => {
    expect(landing({ stage: "outreach", step: "replied" }, list.find((s) => s.id === "c")!)).toEqual({ stage: "outreach", step: "replied", stageId: "c" });
    expect(landing({ stage: "shortlisted", step: null }, list.find((s) => s.id === "i")!)).toEqual({ stage: "interviewing", step: "loop", stageId: "i" });
    expect(landing({ stage: "interviewing", step: "offer" }, list.find((s) => s.id === "o")!)).toEqual({ stage: "outreach", step: "waiting", stageId: "o" });
    expect(landing({ stage: "interviewing", step: "loop" }, list.find((s) => s.id === "h")!)).toEqual({ stage: "hired", step: null, stageId: "h" });
  });
});

describe("how a stage's name is coloured", () => {
  it("is text in the colour of its kind when it has no colour, and the campaign's colour when it has one", () => {
    expect(stageText({ kind: "shortlisted", color: null })).toEqual({ className: "sc", "data-sc": "violet" });
    expect(stageText({ kind: "outreach", color: null })).toEqual({ className: "sc", "data-sc": "blue" });
    expect(stageText({ kind: "interviewing", color: null })).toEqual({ className: "sc", "data-sc": "amber" });
    expect(stageText({ kind: "outreach", color: "teal" })).toEqual({ className: "sc", "data-sc": "teal" });
  });

  it("makes the first stage violet whatever it is or was given, and shows no grey", () => {
    expect(stageText({ kind: "outreach", color: "teal" }, 0)["data-sc"]).toBe("violet");
    expect(stageText({ kind: "outreach", color: "teal" }, 1)["data-sc"]).toBe("teal");
    expect(stageText({ kind: "outreach", color: "slate" }, 1)["data-sc"]).toBe("blue");
  });

  it("keeps Hired and Rejected one colour whatever colour they were given", () => {
    expect(stageText({ kind: "hired", color: "rose" })).toEqual({ className: "sc", "data-sc": "green" });
    expect(stageText({ kind: "passed", color: "teal" })).toEqual({ className: "sc", "data-sc": "rose" });
  });

  it("is the colour the stage donut and its tooltip draw, for every kind and every colour: one source", () => {
    for (const kind of ["shortlisted", "outreach", "interviewing", "hired", "passed"] as const) {
      for (const color of [null, ...STAGE_HUES]) {
        for (const position of [undefined, 0, 2]) expect(stageText({ kind, color }, position)["data-sc"], `${kind} ${color} ${position}`).toBe(stageHue({ kind, color }, position));
      }
    }
  });

  it("says what the client said in the words and tones statuses already use", () => {
    expect(verdictLabel("approved")).toBe("Client approved");
    expect(verdictLabel("declined")).toBe("Client rejected");
    expect(verdictTone("approved")).toBe("replied");
    expect(verdictTone("declined")).toBe("passed");
  });
});

describe("editing the stages", () => {
  const board = stagesFrom(SERVER);
  const counts = { s: 4, o: 2, c: 3, i: 1 };
  const rows = () => rowsFrom(board, counts);

  it("starts from the working stages, with how many people are in each", () => {
    const r = rows();
    expect(r.map((x) => [x.name, x.kind, x.clientView, x.count])).toEqual([
      ["Shortlisted", "shortlisted", false, 4], ["Outreach", "outreach", false, 2], ["Client review", "outreach", true, 3], ["Interviewing", "interviewing", false, 1],
    ]);
    expect(sameAsBoard(r, board)).toBe(true);
  });

  it("adds a stage at the end that counts as the one above it, with a name no other has", () => {
    const first = addRow(rows());
    expect(first).toHaveLength(5);
    expect(first[4]).toMatchObject({ name: "New stage", kind: "interviewing", clientView: false, count: 0 });
    expect(first[4]!.id).toBeUndefined();
    expect(addRow(first)[5]!.name).toBe("New stage 2");
    expect(kindAbove(first, 0)).toBe("shortlisted");
    expect(kindAbove(first, 2)).toBe("outreach");
  });

  it("holds at six working stages", () => {
    let r = rows();
    while (r.length < MAX_WORKING) r = addRow(r);
    expect(r).toHaveLength(MAX_WORKING);
    expect(addRow(r)).toHaveLength(MAX_WORKING);
  });

  it("moves a stage up or down by one, and leaves the ends where they are", () => {
    const r = rows();
    expect(moveRow(r, r[1]!.key, -1).map((x) => x.name)).toEqual(["Outreach", "Shortlisted", "Client review", "Interviewing"]);
    expect(moveRow(r, r[1]!.key, 1).map((x) => x.name)).toEqual(["Shortlisted", "Client review", "Outreach", "Interviewing"]);
    expect(moveRow(r, r[0]!.key, -1).map((x) => x.name)).toEqual(r.map((x) => x.name));
    expect(moveRow(r, r[3]!.key, 1).map((x) => x.name)).toEqual(r.map((x) => x.name));
  });

  it("shows only one stage to the client: choosing another takes it off the first", () => {
    const r = rows();
    const next = patchRow(r, r[3]!.key, { clientView: true });
    expect(next.filter((x) => x.clientView).map((x) => x.name)).toEqual(["Interviewing"]);
    expect(patchRow(next, r[3]!.key, { clientView: false }).some((x) => x.clientView)).toBe(false);
  });

  it("recolours, renames and re-counts a stage without touching the others", () => {
    const r = rowsFrom(board, { s: 0 });
    const next = patchRow(patchRow(patchRow(r, r[0]!.key, { name: "Screened" }), r[0]!.key, { color: "violet" }), r[0]!.key, { kind: "outreach" });
    expect(next[0]).toMatchObject({ name: "Screened", color: "violet", kind: "outreach", id: "s" });
    expect(next.slice(1)).toEqual(r.slice(1));
  });

  it("keeps what a stage counts as while it has people in it, and lets a new or empty one change", () => {
    const r = rows();
    expect(kindLocked(r[0]!)).toBe(true);
    const tried = patchRow(r, r[0]!.key, { kind: "interviewing", name: "Screened" });
    expect(tried[0]).toMatchObject({ kind: "shortlisted", name: "Screened" });
    const added = addRow(r);
    expect(kindLocked(added[4]!)).toBe(false);
    expect(patchRow(added, added[4]!.key, { kind: "shortlisted" })[4]!.kind).toBe("shortlisted");
    expect(kindLocked({ id: "s", count: 0 })).toBe(false);
    // a preset does not change it either
    const kept = presetRows("client", r);
    expect(kept.find((x) => x.id === "o")!.kind).toBe("outreach");
    expect(kept.find((x) => x.id === "i")!.kind).toBe("interviewing");
  });

  it("asks for a name, within 24 letters, that is not another stage's (any case) nor Hired or Rejected", () => {
    const r = rows();
    expect(rowProblems(r)).toEqual({});
    const bad = patchRow(patchRow(patchRow(r, r[0]!.key, { name: "  " }), r[1]!.key, { name: "x".repeat(NAME_MAX + 1) }), r[3]!.key, { name: "client REVIEW" });
    const p = rowProblems(bad);
    expect(p[bad[0]!.key]).toMatch(/name/);
    expect(p[bad[1]!.key]).toMatch(/24/);
    expect(p[bad[2]!.key]).toMatch(/Another stage/);
    expect(p[bad[3]!.key]).toMatch(/Another stage/);
    expect(rowProblems(patchRow(r, r[0]!.key, { name: "hired" }))[r[0]!.key]).toMatch(/always there/);
    expect(rowProblems(patchRow(r, r[0]!.key, { name: "Rejected" }))[r[0]!.key]).toMatch(/always there/);
    expect(canSaveRows(bad)).toBe(false);
    expect(canSaveRows(r)).toBe(true);
    expect(canSaveRows([])).toBe(false);
  });

  it("recognises the two presets by what they are, and reuses a stage the board already has under the same name", () => {
    const standard = presetRows("standard");
    expect(standard.map((x) => x.name)).toEqual(["Shortlisted", "Outreach", "Interviewing"]);
    expect(presetOf(standard)).toBe("standard");
    const client = presetRows("client");
    expect(client.map((x) => [x.name, x.kind, x.clientView])).toEqual([
      ["Shortlisted", "shortlisted", false], ["Outreach", "outreach", false], ["Client review", "interviewing", true], ["Interviewing", "interviewing", false],
    ]);
    expect(presetOf(client)).toBe("client");
    expect(presetOf(addRow(client))).toBeNull();

    const kept = presetRows("standard", rows());
    expect(kept.map((x) => x.id)).toEqual(["s", "o", "i"]);
    expect(kept[1]!.count).toBe(2);
    // and back again: the stage that was left out is made new, the rest keep their places
    expect(presetRows("client", kept).map((x) => x.id)).toEqual(["s", "o", undefined, "i"]);
  });

  it("asks where people go only for removed stages that have people, and picks the nearest of the same kind", () => {
    const r = rows();
    const without = (name: string) => removeRow(r, r.find((x) => x.name === name)!.key);
    expect(removedWithPeople(board, r, counts)).toEqual([]);
    expect(removedWithPeople(board, without("Client review"), counts).map((s) => s.id)).toEqual(["c"]);
    expect(removedWithPeople(board, without("Client review"), { ...counts, c: 0 })).toEqual([]);

    const gone = board.find((s) => s.id === "c")!;
    // Client review counted as outreach: the Outreach stage beside it takes them
    expect(defaultMoveTo(gone, without("Client review"), board)).toBe("o");
    // no other outreach stage left: the nearest stage at all, by where they sat on the board
    const noOutreach = removeRow(without("Client review"), r.find((x) => x.name === "Outreach")!.key);
    expect(defaultMoveTo(gone, noOutreach, board)).toBe("i");
    // two equally near: the one above
    const recounted = without("Client review");
    const tie = patchRow(recounted, recounted.find((x) => x.name === "Outreach")!.key, { kind: "shortlisted" });
    expect(defaultMoveTo(gone, tie, board)).toBe("o");
    // nothing the server knows is left
    expect(defaultMoveTo(gone, [addRow([])[0]!], board)).toBeNull();
  });

  it("builds the body the server takes: new rows without an id, the guess of an older server never sent, moves only for real stages", () => {
    const r = [...rows(), ...addRow([], "Offer call")];
    const body = bodyOf(r, { c: "o" });
    expect(body.stages.map((s) => s.name)).toEqual(["Shortlisted", "Outreach", "Client review", "Interviewing", "Offer call"]);
    expect(body.stages[2]).toEqual({ id: "c", name: "Client review", kind: "outreach", color: "teal", clientView: true });
    expect(body.stages[4]).toEqual({ name: "Offer call", kind: "shortlisted", color: null, clientView: false });
    expect(body.moveTo).toEqual({ c: "o" });

    const guess = rowsFrom(DEFAULT_STAGES);
    expect(bodyOf(guess, { "default:outreach": "default:shortlisted" }).moveTo).toBeUndefined();
    expect(bodyOf(guess).stages.every((s) => !("id" in s))).toBe(true);
  });

  it("gives a campaign's chosen stages the ids of the ones it was made with, by name", () => {
    const made = [def("m1", "Shortlisted", "shortlisted"), def("m2", "Outreach", "outreach"), def("m3", "Interviewing", "interviewing"), def("h", "Hired", "hired"), def("p", "Rejected", "passed")];
    const chosen = adoptIds(presetRows("client"), stagesFrom(made));
    expect(chosen.map((x) => x.id)).toEqual(["m1", "m2", undefined, "m3"]);
  });

  it("has an offline save too: new stages get ids, Hired and Rejected stay, and the people of a removed stage move on", () => {
    const r = rows();
    const without = removeRow(r, r.find((x) => x.name === "Client review")!.key);
    const after = stagesFromRows([...without, ...addRow([], "Offer call")], board);
    expect(after.map((s) => s.name)).toEqual(["Shortlisted", "Outreach", "Interviewing", "Offer call", "Hired", "Rejected"]);
    expect(after.find((s) => s.name === "Offer call")!.id).toMatch(/^local-/);
    expect(after.find((s) => s.name === "Hired")).toEqual(board.find((s) => s.id === "h")!.id ? { ...board.find((s) => s.id === "h")!, position: 4 } : undefined);
    const gone = board.find((s) => s.id === "c")!;
    expect(destinationFor(gone, without, {}, board, after)?.id).toBe("o");
    expect(destinationFor(gone, without, { c: "i" }, board, after)?.id).toBe("i");
  });
});

describe("the Overview's funnel", () => {
  const board = stagesFrom(SERVER);
  const at = (stage: StageDef["kind"], stageId?: string) => ({ stage, ...(stageId ? { stageId } : {}) });
  const people = [at("shortlisted"), at("shortlisted"), at("outreach", "c"), at("outreach"), at("interviewing"), at("hired", "h"), at("passed")];

  it("has one bar per stage in board order under its own name, Hired last and Rejected left out, counting who is in each now", () => {
    const bars = funnelBars(board, people, 0);
    expect(bars.map((b) => [b.label, b.n])).toEqual([["Shortlisted", 2], ["Outreach", 1], ["Client review", 1], ["Interviewing", 1], ["Hired", 1]]);
    expect(bars.map((b) => b.stageId)).toEqual(["s", "o", "c", "i", "h"]);
  });

  it("given the server's cumulative reach, is one bar per kind of everyone who got that far, not who sits in the column now", () => {
    // 7 made the shortlist (5 rejected since), 2 are on it now at Hired: no bar reads "Shortlisted 0" beside a 7.
    const bars = funnelBars(board, people, 46, { shortlisted: 7, outreach: 6, interviewing: 4, hired: 2 });
    expect(bars.map((b) => [b.label, b.n])).toEqual([["Found", 46], ["Shortlisted (ever)", 7], ["Contacted", 6], ["Interviewing", 4], ["Hired", 2]]);
    const steps = bars.slice(1).map((b) => b.n);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1]!);
    expect(bars.slice(1).map((b) => b.stageId)).toEqual(["s", "o", "i", "h"]);
  });

  it("draws each in the colour the board and the donut draw it in", () => {
    expect(funnelBars(board, people, 0).map((b) => b.hue)).toEqual(["violet", "blue", "teal", "amber", "green"]);
  });

  it("leads with Found only while it says something, and has no fixed Replied bar", () => {
    expect(funnelBars(board, people, 0)[0]!.kind).not.toBe("found");
    const withFound = funnelBars(board, people, 40);
    expect(withFound[0]).toMatchObject({ key: "found", label: "Found", n: 40, kind: "found", hue: null });
    expect(withFound).toHaveLength(6);
    expect(withFound.some((b) => b.label === "Replied")).toBe(false);
  });

  it("marks the first stage of each kind, where the step-to-step figures sit", () => {
    expect(funnelBars(board, people, 0).map((b) => b.first)).toEqual([true, true, false, true, true]);
  });

  it("is the console's own five for a campaign that has no stages of its own", () => {
    expect(funnelBars(DEFAULT_STAGES, [at("outreach")], 0).map((b) => [b.label, b.n])).toEqual([["Shortlisted", 0], ["In outreach", 1], ["Interviewing", 0], ["Hired", 0]]);
  });
});

describe("rows as stages again", () => {
  it("keeps ids and order through a round trip", () => {
    const board = stagesFrom(SERVER);
    const r: StageRow[] = rowsFrom(board);
    const back = stagesFromRows(r, board);
    expect(back.map((s) => s.id)).toEqual(["s", "o", "c", "i", "h", "p"]);
    expect(back.find((s) => s.id === "c")).toMatchObject({ name: "Client review", color: "teal", clientView: true });
  });
});

describe("the word for where someone is within a stage", () => {
  const v = { verdict: "approved" as const, note: null, reviewerName: null, at: "2026-10-18T10:00:00Z" };
  it("says Waiting for someone who has not been answered, and stops once the client has", () => {
    expect(stepChip({ step: "waiting" })).toEqual({ text: "Waiting", tone: "quiet" });
    expect(stepChip({ step: "waiting", clientVerdict: null })).toEqual({ text: "Waiting", tone: "quiet" });
    expect(stepChip({ step: "waiting", clientVerdict: v })).toBeNull();
    expect(stepChip({ step: "waiting", clientVerdict: { ...v, verdict: "declined" } })).toBeNull();
  });
  it("keeps the other words as they were, client's answer or not", () => {
    expect(stepChip({ step: "replied", clientVerdict: v })).toEqual({ text: "Replied", tone: "good" });
    expect(stepChip({ step: "offer" })).toEqual({ text: "Offer out", tone: "warm" });
    expect(stepChip({ step: "loop" })).toEqual({ text: "In loop", tone: "quiet" });
    expect(stepChip({ step: null })).toBeNull();
  });
});

describe("the slim bar over the board", () => {
  const board = stagesFrom(SERVER);
  const at = (stage: StageDef["kind"], stageId?: string) => ({ stage, ...(stageId ? { stageId } : {}) });

  it("has a segment per column in board order, Hired last and Rejected out, each in its stage's colour, sized by who is in it", () => {
    const { segments } = pipelineStrip(board, [at("shortlisted"), at("shortlisted"), at("outreach", "c"), at("hired", "h"), at("passed")]);
    expect(segments.map((g) => [g.name, g.n, g.hue])).toEqual([
      ["Shortlisted", 2, "violet"], ["Outreach", 0, "blue"], ["Client review", 1, "teal"], ["Interviewing", 0, "amber"], ["Hired", 1, "green"],
    ]);
  });

  it("says in one quiet line how many are in the pipeline and hired, and counts who was passed apart", () => {
    const s = pipelineStrip(board, [at("shortlisted"), at("outreach"), at("hired"), at("hired", "h"), at("passed"), at("passed")]);
    expect(s).toMatchObject({ inPipeline: 4, hired: 2, passed: 2, line: "4 in the pipeline · 2 hired" });
    expect(pipelineStrip(board, [at("shortlisted")]).line).toBe("1 in the pipeline");
  });

  it("is calm when nobody is there yet", () => {
    const s = pipelineStrip(board, []);
    expect(s.line).toBe("Nobody in the pipeline yet");
    expect(s.segments).toHaveLength(5);
    expect(s.segments.every((g) => g.n === 0)).toBe(true);
  });
});

describe("custom stages, in words", () => {
  const d = (name: string, kind: StageDef["kind"]) => ({ name, kind });
  const DEFAULTS = [d("Shortlisted", "shortlisted"), d("Outreach", "outreach"), d("Interviewing", "interviewing"), d("Hired", "hired"), d("Passed", "passed")];
  const CUSTOM = [d("Shortlisted", "shortlisted"), d("Outreach", "outreach"), d("Technical round", "interviewing"), d("Client review", "interviewing"), d("Hired", "hired"), d("Passed", "passed")];

  it("tells the default set from a campaign's own, and the console's older names count as default", () => {
    expect(isStandardName("outreach", "In outreach")).toBe(true);
    expect(isStandardName("interviewing", "Technical round")).toBe(false);
    expect(isDefaultSet(DEFAULTS)).toBe(true);
    expect(isDefaultSet(DEFAULT_STAGES)).toBe(true);
    expect(isDefaultSet(undefined)).toBe(true);
    expect(isDefaultSet(CUSTOM)).toBe(false);
    expect(isDefaultSet([d("Shortlisted", "shortlisted"), d("Intro call", "outreach"), d("Interviewing", "interviewing")])).toBe(false);
  });

  it("calls a count by kind Interviewing for the default set and In progress once there are stages of the campaign's own", () => {
    expect(interviewWord(DEFAULTS)).toBe("Interviewing");
    expect(interviewWord(undefined)).toBe("Interviewing");
    expect(interviewWord(CUSTOM)).toBe("In progress");
  });

  it("says 'with an offer' and 'replied' only under the default columns, and just how many are in a stage of the campaign's own", () => {
    const here = [{ step: "offer", inStage: 1 }, { step: "replied", inStage: 9 }, { step: null, inStage: 0 }] as never;
    expect(columnNote({ name: "Interviewing", kind: "interviewing", clientView: false }, here)).toBe("1 with an offer");
    expect(columnNote({ name: "Technical round", kind: "interviewing", clientView: false }, here)).toBe("3 people");
    expect(columnNote({ name: "Outreach", kind: "outreach", clientView: false }, here)).toBe("1 replied");
    expect(columnNote({ name: "Intro call", kind: "outreach", clientView: false }, here)).toBe("3 people");
    expect(columnNote({ name: "Shortlisted", kind: "shortlisted", clientView: false }, here)).toBe("2 new");
    expect(columnNote({ name: "Long list", kind: "shortlisted", clientView: false }, [here[0]] as never)).toBe("1 person");
    expect(columnNote({ name: "Client review", kind: "interviewing", clientView: true }, [{ step: null, inStage: 1 }, { step: null, inStage: 1, clientVerdict: { verdict: "approved" } }] as never)).toBe("1 waiting on the client");
    expect(columnNote({ name: "Hired", kind: "hired", clientView: false }, [])).toBe("First hire lands here");
    expect(columnNote({ name: "Hired", kind: "hired", clientView: false }, here)).toBe("Offers accepted");
  });
});
