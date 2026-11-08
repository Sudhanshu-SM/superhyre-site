import { describe, expect, it } from "vitest";
import { autoAnswer } from "../Clarify";
import { saveClient } from "../campaignStore";
import { campaignAskIn, campaignHintsIn, newCampaignAnswers, openingsIn, roleTitle } from "../clarify";
import type { Question } from "../clarify";
import { EMPTY_DRAFT, clientFromDraft } from "../clients";
import type { LiveData } from "../liveViews/clientQuestions";
import { liveCampaignAsk } from "../liveViews/clientQuestions";
import type { MomentCtx } from "../moments";

/**
 * A request to find people, said the way recruiters say it ("Find 5 product designers in Mumbai with 3+ years ..."),
 * picked as "Create a new campaign": the set-up reads the role, the city, how they work, the hires, "no JD" and the
 * years from those words and asks only what they leave open. "Find 5" is how many to look at, never the openings.
 */

const ctx = (answers: Record<string, string>, said: string): MomentCtx => ({
  said, verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {},
  deploy: () => null, undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {},
  prefs: {}, setPref: () => {}, answers,
});

/** The set-up answered the way the chat does: a preset applies itself, anything else takes the first tile, or nothing typed. */
function drive(data: LiveData, said: string) {
  const ask = liveCampaignAsk(() => data);
  const asked: string[] = [];
  const shown: Question[] = [];
  let answers: Record<string, string> = {};
  for (let n = 0; n < 30; n++) {
    const q = ask("campaign-new", said, ctx(answers, said));
    if (!q) break;
    shown.push(q);
    const auto = autoAnswer(q, {}, new Set());
    if (!auto) asked.push(q.id);
    const ids = auto ? [auto.id] : [q.input ? "" : q.options[0]?.id ?? ""];
    answers = { ...answers, ...q.apply(ids).answers };
  }
  return { asked, shown, answers };
}

const NONE: LiveData = { clients: [], rows: [] };

const DESIGNERS = "Find 5 product designers in Mumbai with 3+ years of experience at consumer internet companies";
const HRBP = "Find 5 HR business partners in Pune with 8+ years of experience, not people currently working at consulting firms. New campaign for Vahan, on-site, 1 opening, no JD.";
const NAMED = "Create a new campaign called HR Business Partner for Vahan and find 5 people";

describe("who to find is the role, with no 'campaign' said", () => {
  it("reads the role, singular and capitalised, the city and the years", () => {
    expect(campaignAskIn(DESIGNERS)).toMatchObject({ role: "Product Designer", city: "Mumbai", exp: "3", client: null });
    expect(campaignAskIn(HRBP)).toMatchObject({ role: "HR Business Partner", city: "Pune", exp: "8" });
  });

  it("names one of the people asked for", () => {
    expect(roleTitle("product designers")).toBe("Product Designer");
    expect(roleTitle("HR business partners")).toBe("HR Business Partner");
    expect(roleTitle("heads of sales")).toBe("Head of Sales");
    expect(roleTitle("iOS developers")).toBe("iOS Developer");
    expect(roleTitle("SDEs")).toBe("SDE");
  });

  it("takes no role from 'find 5 people'", () => {
    expect(campaignAskIn("Find 5 people").role).toBeNull();
    expect(campaignAskIn("Create a new campaign and find 10 candidates").role).toBeNull();
  });

  it("finds the city said anywhere as 'in <City>'", () => {
    expect(campaignAskIn("Create a campaign for a Data Engineer with 5 years, based in Bangalore, must know Spark").city).toBe("Bengaluru");
  });

  it("asks only what the words leave open: the role, the city and the years are not asked", () => {
    const run = drive(NONE, DESIGNERS);
    expect(run.asked).not.toContain("nc-role");
    expect(run.asked).not.toContain("nc-location");
    expect(run.asked).not.toContain("nc-more");
    expect(run.answers).toMatchObject({ location: "Mumbai" });
    expect(newCampaignAnswers(DESIGNERS, run.answers)).toMatchObject({ role: "Product Designer", exp: "3" });
    // "Find 5" was not the number of hires: that is asked, with nothing taken for it.
    expect(run.asked).toContain("nc-openings");
    expect(run.shown.find((q) => q.id === "nc-openings")?.preset).toBeUndefined();
  });
});

describe("a brief that says the client, how they work, the hires and that there is no JD", () => {
  it("reads 'on-site', '1 opening' and 'no JD' as answers", () => {
    expect(campaignHintsIn(HRBP)).toMatchObject({ mode: "onsite", openings: 1, jdLater: true });
    expect(newCampaignAnswers(HRBP)).toMatchObject({ role: "HR Business Partner", mode: "onsite", openings: "1", jd: "", location: "Pune", exp: "8" });
  });

  it("takes a company it does not know, named as who the campaign is for, as a new client", () => {
    expect(newCampaignAnswers(HRBP)).toMatchObject({ client: "new", newClient: "Vahan" });
    const run = drive(NONE, HRBP);
    for (const id of ["nc-role", "nc-client", "nc-mode", "nc-location", "nc-openings", "nc-jd", "nc-more"]) expect(run.asked, id).not.toContain(id);
  });

  it("asks none of it again for a client of the workspace either", () => {
    const vahan = saveClient(clientFromDraft({ ...EMPTY_DRAFT, name: "Vahan", location: "Bengaluru", status: "active" }, "cl-vahan-find"));
    const run = drive({ clients: [vahan], rows: [] }, HRBP);
    for (const id of ["nc-role", "nc-client", "nc-mode", "nc-location", "nc-openings", "nc-jd", "nc-more"]) expect(run.asked, id).not.toContain(id);
    expect(run.answers).toMatchObject({ mode: "onsite", location: "Pune", openings: "1" });
    expect(newCampaignAnswers(HRBP, run.answers)).toMatchObject({ role: "HR Business Partner", client: vahan.id, jd: "", exp: "8" });
  });

  it("reads 'no job description' and 'JD to follow' too, and a pasted JD wins over them", () => {
    expect(campaignHintsIn("Find 3 data engineers in Pune, no job description yet").jdLater).toBe(true);
    expect(campaignHintsIn("Find 3 data engineers in Pune, JD to follow").jdLater).toBe(true);
    expect(campaignHintsIn("Find 3 data engineers in Pune").jdLater).toBe(false);
  });
});

describe("how many to find is never the number of hires", () => {
  it("reads only hiring words as openings", () => {
    expect(openingsIn("Find 5 people")).toBeNull();
    expect(openingsIn("Source 10 candidates for the role")).toBeNull();
    expect(openingsIn("Find 5 product designers in Mumbai")).toBeNull();
    expect(openingsIn("Create a campaign to find 5 designers")).toBeNull();
    expect(openingsIn("we need 5 profiles")).toBeNull();
    expect(openingsIn(NAMED)).toBeNull();
    expect(openingsIn("hire 3 DevOps engineers")).toBe(3);
    expect(openingsIn("Find 5 HR business partners, 2 openings")).toBe(2);
    expect(newCampaignAnswers("Find 5 people for the Backend Engineer campaign").openings).toBeUndefined();
  });
});

describe("a campaign name ends where the next request begins", () => {
  it("cuts the name at 'and find' and at the end of the sentence", () => {
    expect(campaignAskIn(NAMED).role).toBe("HR Business Partner");
    expect(campaignAskIn(NAMED).client).toBe("Vahan");
    expect(campaignAskIn("Create a campaign called Backend Engineer, then source 10 people").role).toBe("Backend Engineer");
    expect(campaignAskIn("Create a campaign called Data Analyst. Find 5 people in Pune").role).toBe("Data Analyst");
    expect(campaignAskIn("Create a campaign called Sr. Backend Engineer").role).toBe("Sr. Backend Engineer");
  });

  it("keeps a region or a team after 'for' in the role", () => {
    expect(campaignAskIn("Create a campaign called Sales Manager for APAC and find 5 people")).toMatchObject({ role: "Sales Manager for APAC", client: null });
    expect(campaignAskIn("make a campaign called Product Manager for Payments")).toMatchObject({ role: "Product Manager for Payments", client: null });
  });
});
