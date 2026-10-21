import { beforeEach, describe, expect, it } from "vitest";
import { addRow, removeRow, rowsFrom, stageIdOf } from "../boardStages";
import { CAMPAIGN_ROWS } from "../campaignsData";
import { movePerson, pipelineNow, resetCampaignStore, saveStages, stagesNow } from "../campaignStore";

/**
 * The same stages without a server (the console's fixtures): the board starts as the console's five, a campaign can
 * be given stages of its own, a card can be moved into one, and the people of a removed stage move on.
 */

const ID = CAMPAIGN_ROWS[0]!.id;

beforeEach(() => resetCampaignStore());

describe("stages on fixtures", () => {
  it("start as the console's five, with every card in the first stage of its kind", () => {
    expect(stagesNow(ID).map((s) => s.name)).toEqual(["Shortlisted", "In outreach", "Interviewing", "Hired", "Rejected"]);
    const people = pipelineNow(ID);
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) expect(stagesNow(ID).find((s) => s.id === stageIdOf(p, stagesNow(ID)))?.kind).toBe(p.stage);
  });

  it("can be changed, and a card moved into a new one follows its kind", async () => {
    const rows = addRow(rowsFrom(stagesNow(ID)), "Client review");
    expect(await saveStages(ID, rows)).toBe(true);
    const names = stagesNow(ID).map((s) => s.name);
    expect(names).toEqual(["Shortlisted", "In outreach", "Interviewing", "Client review", "Hired", "Rejected"]);
    const review = stagesNow(ID).find((s) => s.name === "Client review")!;
    expect(review.kind).toBe("interviewing");

    const who = pipelineNow(ID).find((p) => p.stage === "shortlisted")!;
    movePerson(ID, who.id, { stageId: review.id });
    const moved = pipelineNow(ID).find((p) => p.id === who.id)!;
    expect(moved).toMatchObject({ stage: "interviewing", stageId: review.id, step: "loop" });
    // at the top of its new column, like every move
    expect(pipelineNow(ID)[0]!.id).toBe(who.id);
    // the same move again changes nothing
    const before = pipelineNow(ID);
    movePerson(ID, who.id, { stageId: review.id });
    expect(pipelineNow(ID)).toBe(before);
  });

  it("moves the people of a removed stage to the stage they were told to go to, else the nearest of their kind", async () => {
    const rows = rowsFrom(stagesNow(ID));
    const outreach = stagesNow(ID).find((s) => s.kind === "outreach")!;
    const inIt = pipelineNow(ID).filter((p) => p.stage === "outreach");
    expect(inIt.length).toBeGreaterThan(0);

    const next = removeRow(rows, rows.find((r) => r.id === outreach.id)!.key);
    const interviewing = stagesNow(ID).find((s) => s.kind === "interviewing")!;
    expect(await saveStages(ID, next, { [outreach.id]: interviewing.id })).toBe(true);

    expect(stagesNow(ID).some((s) => s.id === outreach.id)).toBe(false);
    for (const p of pipelineNow(ID).filter((x) => inIt.some((q) => q.id === x.id))) {
      expect(p).toMatchObject({ stage: "interviewing", stageId: interviewing.id });
    }
    // and nobody is left in a column that is gone
    for (const p of pipelineNow(ID)) expect(stagesNow(ID).some((s) => s.id === stageIdOf(p, stagesNow(ID)))).toBe(true);
  });

  it("moves by kind as it always did", () => {
    const who = pipelineNow(ID).find((p) => p.stage === "shortlisted")!;
    movePerson(ID, who.id, "outreach");
    expect(pipelineNow(ID).find((p) => p.id === who.id)).toMatchObject({ stage: "outreach", stageId: "default:outreach" });
  });
});
