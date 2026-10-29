import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBodyFrom } from "../api/campaigns";
import { TurnContext, clearThread, saveTrail } from "../agentThread";
import { canonicalCity, knownCity, parseOpenings, rowFromDraft } from "../campaignDraft";
import type { CampaignRow } from "../campaignsData";
import {
  briefParts, campaignBriefIn, campaignHintsIn, newCampaignAnswers, newCampaignQuestion, openingsIn, workModeIn,
} from "../clarify";
import type { Question } from "../clarify";
import { Clarified, TileCard, autoAnswer } from "../Clarify";
import type { Client } from "../clients";
import { draftFromAnswers } from "../ClientMoments";
import { campaignDraftFor, campaignFacts, cityOptions, draftingLine, liveCampaignAnswers } from "../liveViews/clientCampaign";
import type { LiveData } from "../liveViews/clientQuestions";
import { liveCampaignAsk } from "../liveViews/clientQuestions";
import type { MomentCtx } from "../moments";
import { setSession } from "../roleStore";
import { saveClient } from "../campaignStore";
import { EMPTY_DRAFT, clientFromDraft } from "../clients";

/**
 * The connected chat's "Start a new campaign": what the message already says is an answer (the city, how they
 * work, how many hires, a job description), shown as one and never asked; what it leaves open is asked in the
 * order Role, Client, Team, Work mode, City, Hires, Job description.
 */

const ctx = (answers: Record<string, string> = {}, said = ""): MomentCtx => ({
  said, verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {},
  deploy: () => null, undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {},
  prefs: {}, setPref: () => {}, answers,
});

const client = (over: Partial<Client> & Pick<Client, "id" | "name">): Client => ({ manager: "", email: "", phone: "", notes: "", contacts: [], ...over });
const row = (department: string, location: string): Pick<CampaignRow, "department" | "location"> => ({ department, location });

const DATA: LiveData = {
  clients: [client({ id: "c-acme", name: "Acme Robotics", industry: "Fintech", location: "Bengaluru", status: "active" })],
  rows: [row("Engineering", "Bengaluru"), row("Engineering", "Pune"), row("Platform", "Chennai")],
};
const ask = liveCampaignAsk(() => DATA);
const bare = liveCampaignAsk(() => ({ clients: [], rows: [] }));
/** An answer to "Who is it for?" for the tests that are about what comes after it: a client nobody knows, so no city comes with it. */
const WHO = "cl-someone";

type Asked = { id: string; auto: boolean; q: Question };

/**
 * The questions answered the way the chat does: a preset applies itself (unless it was changed), anything else
 * is the first tile, or the text given for it. `pick` answers a question its own way.
 */
function drive(
  askFn: typeof ask,
  said: string,
  pick: (q: Question, n: number) => readonly string[] | undefined = () => undefined,
  declined: ReadonlySet<string> = new Set(),
) {
  const rows: Asked[] = [];
  let answers: Record<string, string> = {};
  for (let n = 0; n < 30; n++) {
    const q = askFn("campaign-new", said, ctx(answers, said));
    if (!q) break;
    const auto = autoAnswer(q, {}, declined);
    const ids = auto ? [auto.id] : pick(q, n) ?? [q.input ? "" : q.options[0]?.id ?? ""];
    rows.push({ id: q.id, auto: !!auto, q });
    answers = { ...answers, ...q.apply(ids).answers };
  }
  return { rows, answers, ids: rows.map((r) => r.id), asked: rows.filter((r) => !r.auto).map((r) => r.id) };
}

afterEach(() => setSession({ role: "admin", name: "Punith S" }));

describe("a city said in any of its spellings is one city", () => {
  it("names each city once", () => {
    const want: Array<[string, string]> = [
      ["Bangalore", "Bengaluru"], ["Bengaluru", "Bengaluru"], ["Bengalooru", "Bengaluru"], ["Blr", "Bengaluru"], ["BLR", "Bengaluru"], [" bangalore ", "Bengaluru"],
      ["Bombay", "Mumbai"], ["Mumbai", "Mumbai"],
      ["Gurgaon", "Gurugram"], ["Gurugram", "Gurugram"],
      ["Madras", "Chennai"], ["Chennai", "Chennai"],
      ["Calcutta", "Kolkata"], ["Kolkata", "Kolkata"],
      ["Poona", "Pune"], ["Pune", "Pune"],
      ["Delhi NCR", "Delhi NCR"], ["New Delhi", "Delhi NCR"], ["Delhi", "Delhi NCR"], ["NCR", "Delhi NCR"],
      ["Hyderabad", "Hyderabad"], ["Hyd", "Hyderabad"], ["Noida", "Noida"],
    ];
    for (const [said, shown] of want) expect(canonicalCity(said), said).toBe(shown);
  });

  it("leaves a place it does not know as it was typed, with capitals for a lower-case word", () => {
    expect(canonicalCity("Cloud Platform")).toBe("Cloud Platform");
    expect(canonicalCity("tumakuru")).toBe("Tumakuru");
    expect(canonicalCity("")).toBe("");
    expect(canonicalCity(undefined)).toBe("");
    expect(knownCity("Cloud Platform")).toBeNull();
  });

  it("reads the city out of the message under that name, and keeps the role clean", () => {
    const said = (c: string) => `Create a new campaign for DevOps Engineer from ${c}`;
    for (const [c, shown] of [["Bangalore", "Bengaluru"], ["Blr", "Bengaluru"], ["Bengalooru", "Bengaluru"], ["Bombay", "Mumbai"], ["Gurgaon", "Gurugram"],
      ["Madras", "Chennai"], ["Calcutta", "Kolkata"], ["Poona", "Pune"], ["New Delhi", "Delhi NCR"], ["Delhi NCR", "Delhi NCR"], ["Hyd", "Hyderabad"], ["Noida", "Noida"]] as const) {
      expect(campaignBriefIn(said(c)), c).toEqual({ role: "DevOps Engineer", client: null, city: shown });
    }
    expect(campaignBriefIn("Set up a campaign called Lead in Data Science")).toMatchObject({ role: "Lead in Data Science", city: null });
  });

  it("takes the city after a comma, and with how they work said after it", () => {
    expect(campaignBriefIn("Create a campaign for DevOps Engineer, Bangalore")).toMatchObject({ role: "DevOps Engineer", city: "Bengaluru" });
    expect(campaignBriefIn("Create a campaign for DevOps Engineer from Bangalore, remote")).toMatchObject({ role: "DevOps Engineer", city: "Bengaluru" });
    expect(campaignBriefIn("Create a campaign for DevOps Engineer in Pune (hybrid)")).toMatchObject({ role: "DevOps Engineer", city: "Pune" });
  });

  it("merges the options for a city written two ways", () => {
    const options = cityOptions([row("Engineering", "Bangalore"), row("Platform", "Bengaluru"), row("Data", "Remote, Blr")], undefined);
    expect(options.map((o) => o.id)).toEqual(["Bengaluru"]);
    expect(options[0]?.meta).toBe("3 campaigns");
    expect(cityOptions([], { name: "Acme", location: "Bangalore" }).map((o) => o.id)).toEqual(["Bengaluru"]);
  });

  it("puts the console's name on the draft however the city came", () => {
    const d = draftFromAnswers({ role: "SRE", client: WHO, dept: "Engineering", mode: "onsite", location: "Bangalore", openings: "1" }, "Me", []);
    expect(d.locations).toEqual(["Bengaluru"]);
  });
});

describe("a city the message names is an answer, shown and never asked", () => {
  const said = "Create a new campaign for DevOps Engineer from Bangalore";

  it("is the location question's preset, not an empty 'Which city?'", () => {
    const q = ask("campaign-new", said, ctx({ role: "DevOps Engineer", client: WHO, dept: "Engineering", mode: "hybrid" }, said))!;
    expect(q.id).toBe("nc-location");
    expect(q.preset).toBe("Bengaluru");
    // Taken as it is: the log gets "Location: Bengaluru" with Change beside it.
    expect(autoAnswer(q, {}, new Set())).toMatchObject({ id: "Bengaluru", how: "preset" });
    expect(q.apply(["Bengaluru"]).answers).toEqual({ location: "Bengaluru" });
  });

  it("is applied as the answer all the way to the card, with the city never asked", () => {
    const run = drive(ask, said);
    expect(run.ids).toEqual(["nc-client", "nc-dept", "nc-mode", "nc-location", "nc-openings", "nc-jd", "nc-more"]);
    expect(run.rows.find((r) => r.id === "nc-location")?.auto).toBe(true);
    expect(run.asked).not.toContain("nc-location");
    expect(run.answers.location).toBe("Bengaluru");
    expect(run.answers.role).toBeUndefined();
    const a = liveCampaignAnswers(said, run.answers);
    expect(a).toMatchObject({ role: "DevOps Engineer", location: "Bengaluru" });
    expect(campaignDraftFor(a, "Me", DATA.clients).locations).toEqual(["Bengaluru"]);
  });

  it("is asked again, as tiles, once Change is pressed", () => {
    const run = drive(ask, said, undefined, new Set(["nc-location"]));
    const where = run.rows.find((r) => r.id === "nc-location")!;
    expect(where.auto).toBe(false);
    expect(where.q.other).toBeTruthy();
    expect(run.asked).toContain("nc-location");
  });

  it("is the text that is taken when no city is known to offer", () => {
    const run = drive(bare, "Create a campaign for DevOps Engineer from Blr");
    const where = run.rows.find((r) => r.id === "nc-location")!;
    expect(where.auto).toBe(true);
    expect(where.q.input).toBeTruthy();
    expect(run.answers.location).toBe("Bengaluru");
  });

  it("asks for a city only when the message names none, and canonicalises what is typed", () => {
    const run = drive(ask, "Create a new campaign for DevOps Engineer", (q) => (q.id === "nc-location" ? ["bangalore"] : undefined));
    expect(run.asked).toContain("nc-location");
    // One row for the city, with the final value: never a row for "Other" and then another for the text.
    expect(run.answers.location).toBe("Bengaluru");
    const q = ask("campaign-new", "x", ctx({ role: "SRE", client: WHO, dept: "Data", mode: "onsite" }, "x"))!;
    expect(q.apply(["bangalore"]).answers).toEqual({ location: "Bengaluru" });
  });
});

describe("how they work is read from the message", () => {
  it("takes remote, hybrid, on-site and WFH, and nothing when it says two things", () => {
    expect(workModeIn("Create a campaign for DevOps Engineer, remote")).toBe("remote");
    expect(workModeIn("a fully remote campaign for SRE")).toBe("remote");
    expect(workModeIn("Create a campaign for SRE, WFH")).toBe("remote");
    expect(workModeIn("a work from home role")).toBe("remote");
    expect(workModeIn("Create a hybrid campaign for SRE in Pune")).toBe("hybrid");
    expect(workModeIn("SRE, on-site in Pune")).toBe("onsite");
    expect(workModeIn("SRE onsite")).toBe("onsite");
    expect(workModeIn("SRE, work from office")).toBe("onsite");
    expect(workModeIn("remote or hybrid SRE")).toBeNull();
    expect(workModeIn("Create a campaign for SRE")).toBeNull();
  });

  it("is a preset on the work-mode question, so it is shown with 'from your message' and can be changed", () => {
    const said = "Create a new campaign for DevOps Engineer from Pune, hybrid";
    const q = newCampaignQuestion(said, ctx({ client: WHO, dept: "Engineering" }, said))!;
    expect(q).toMatchObject({ id: "nc-mode", preset: "hybrid", presetNote: "from your message" });
    expect(autoAnswer(q, {}, new Set())).toMatchObject({ id: "hybrid", label: "Hybrid", how: "preset" });
    // Not said: asked, with no preset.
    expect(newCampaignQuestion("Create a campaign for SRE", ctx({ client: WHO, dept: "Engineering" }))?.preset).toBeUndefined();
  });

  it("keeps the city optional when it is remote", () => {
    const said = "Create a remote campaign for DevOps Engineer";
    const run = drive(ask, said);
    expect(run.rows.find((r) => r.id === "nc-mode")?.auto).toBe(true);
    expect(run.answers.mode).toBe("remote");
    const where = run.rows.find((r) => r.id === "nc-location")!;
    // Nothing named a city: asked, as tiles with a way to say none.
    expect(where.auto).toBe(false);
    expect(where.q.ask).toBe("Any city they should be near?");
    expect(where.q.options.map((o) => o.id)).toContain("none");
    const words = drive(bare, said);
    const field = words.rows.find((r) => r.id === "nc-location")!;
    expect(field.q.input?.optional).toBe(true);
    expect(words.answers.location).toBe("");
  });

  it("takes a remote role in a named city: both are answers", () => {
    const run = drive(ask, "Create a campaign for DevOps Engineer from Bangalore, remote");
    expect(run.answers).toMatchObject({ mode: "remote", location: "Bengaluru" });
    expect(run.asked).not.toContain("nc-mode");
    expect(run.asked).not.toContain("nc-location");
  });
});

describe("how many hires", () => {
  it("reads a number said in the message", () => {
    expect(openingsIn("Create a campaign to hire 3 DevOps engineers")).toBe(3);
    expect(openingsIn("Create a campaign for hiring three DevOps Engineers in Pune")).toBe(3);
    expect(openingsIn("Create a campaign for 4 DevOps Engineers")).toBe(4);
    expect(openingsIn("Create a campaign for SRE, 5 openings")).toBe(5);
    expect(openingsIn("we need two backend engineers")).toBe(2);
    expect(openingsIn("headcount: 12")).toBe(12);
    // A figure that is a unit of something else is not a number of hires.
    expect(openingsIn("Create a campaign for a DevOps Engineer with 5 years")).toBeNull();
    expect(openingsIn("hire someone with 5+ years")).toBeNull();
    expect(openingsIn("need 30 LPA budget")).toBeNull();
    expect(openingsIn("Create a new campaign for DevOps Engineer from Bangalore")).toBeNull();
  });

  it("keeps the role clean of the count", () => {
    expect(campaignBriefIn("Create a campaign to hire 3 DevOps Engineers in Pune")).toEqual({ role: "DevOps Engineers", client: null, city: "Pune" });
    expect(campaignBriefIn("Create a campaign for hiring 2 SREs from Bangalore, remote")).toEqual({ role: "SREs", client: null, city: "Bengaluru" });
    expect(campaignBriefIn("Create a campaign for SRE in Pune, 3 openings")).toEqual({ role: "SRE", client: null, city: "Pune" });
  });

  it("is skipped when the message says it, and shown as an answer", () => {
    const said = "Create a campaign to hire 3 DevOps engineers from Bangalore";
    const run = drive(ask, said);
    expect(run.answers.openings).toBe("3");
    expect(run.rows.find((r) => r.id === "nc-openings")).toMatchObject({ auto: true });
    expect(run.asked).not.toContain("nc-openings");
    const d = campaignDraftFor(liveCampaignAnswers(said, run.answers), "Me", DATA.clients);
    expect(d.openings).toBe(3);
    // A number that is not a tile is added as one, so it can be taken.
    const four = newCampaignQuestion("Create a campaign to hire 4 SREs", ctx({ client: WHO, dept: "Data", mode: "onsite", location: "Pune" }))!;
    expect(four.options.map((o) => o.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(autoAnswer(four, {}, new Set())).toMatchObject({ id: "4", label: "Four", how: "preset" });
  });

  it("offers Other under the numbers, and takes 1 to 99 in words or digits, in the same question", () => {
    const base = { role: "SRE", client: WHO, dept: "Data", mode: "onsite", location: "Pune" };
    const q = ask("campaign-new", "x", ctx(base))!;
    expect(q.id).toBe("nc-openings");
    // Other is not a tile of the question: no placeholder to answer, and no second question for the number.
    expect(q.options.map((o) => o.id)).toEqual(["1", "2", "3", "5"]);
    expect(q.options.some((o) => o.meta)).toBe(false);
    expect(q.input).toBeUndefined();
    expect(q.other).toMatchObject({ placeholder: "e.g. 4", numeric: true });
    expect(q.apply(["3"]).answers).toEqual({ openings: "3" });
    expect(q.apply(["12"]).answers).toEqual({ openings: "12" });
    expect(q.apply(["seven"]).answers).toEqual({ openings: "7" });
    const check = q.other!.check!;
    expect(check("12")).toBeNull();
    expect(check("99")).toBeNull();
    expect(check("0")).toMatch(/1 to 99/);
    expect(check("100")).toMatch(/1 to 99/);
    expect(check("lots")).toMatch(/1 to 99/);
    expect(check("2.5")).toMatch(/1 to 99/);
    expect(draftFromAnswers({ ...base, openings: "12" }, "Me", []).openings).toBe(12);
    // Whatever gets through is a number from 1 to 99.
    expect(draftFromAnswers({ ...base, openings: "400" }, "Me", []).openings).toBe(99);
  });

  it("reads a typed number only whole", () => {
    expect(parseOpenings("3")).toBe(3);
    expect(parseOpenings(" two ")).toBe(2);
    expect(parseOpenings("3 hires")).toBe(3);
    expect(parseOpenings("0")).toBeNull();
    expect(parseOpenings("100")).toBeNull();
    expect(parseOpenings("three engineers")).toBeNull();
    expect(parseOpenings("")).toBeNull();
  });
});

describe("the job description", () => {
  const base = { role: "SRE", client: WHO, dept: "Data", mode: "onsite", location: "Pune", openings: "2" };

  it("is asked once the hires are known, with three ways to answer", () => {
    const q = ask("campaign-new", "Create a campaign for SRE", ctx(base))!;
    expect(q.id).toBe("nc-jd");
    expect(q.ask).toBe("Do you have the job description?");
    expect(q.options.map((o) => o.label)).toEqual(["Paste it", "Upload a file", "I'll add it later"]);
    expect(q.options.map((o) => o.id)).toEqual(["paste", "upload", "later"]);
    expect(q.document?.accept).toBe(".pdf,.docx,.txt,.md");
    expect(q.step).toBe("Job description");
  });

  it("takes pasted text, an uploaded file's text, or nothing", () => {
    const q = ask("campaign-new", "Create a campaign for SRE", ctx(base))!;
    const jd = "We are hiring an SRE to run our Kubernetes fleet. 5+ years, Go, Terraform, on-call.";
    // Pasted: the text, no file.
    expect(q.apply([jd, ""]).answers).toEqual({ jd });
    expect(q.say?.([jd, ""])).toBe(`Pasted, ${jd.split(/\s+/).length} words`);
    // Uploaded: the text the server read out of the file, and the file's name for the log.
    expect(q.apply([`  ${jd}\n`, "jd.pdf"]).answers).toEqual({ jd });
    expect(q.say?.([jd, "jd.pdf"])).toBe(`jd.pdf, ${jd.split(/\s+/).length} words`);
    // Later: nothing, and it is not asked again.
    expect(q.apply(["", ""]).answers).toEqual({ jd: "" });
    expect(q.say?.(["", ""])).toBe("I'll add it later");
    expect(q.apply(["later"]).answers).toEqual({ jd: "" });
    expect(ask("campaign-new", "x", ctx({ ...base, jd: "" }))?.id).not.toBe("nc-jd");
    expect(ask("campaign-new", "x", ctx({ ...base, jd }))?.id).not.toBe("nc-jd");
  });

  it("goes on to experience, pay and must-haves as one optional line when the description is left for later", () => {
    const run = drive(ask, "Create a campaign for SRE", (q) => (q.id === "nc-role" ? ["SRE"] : q.id === "nc-jd" ? ["later"] : undefined));
    const after = run.ids.slice(run.ids.indexOf("nc-jd") + 1);
    expect(after).toEqual(["nc-more"]);
    for (const id of after) expect(run.rows.find((r) => r.id === id)?.q.input?.optional, id).toBe(true);
  });

  it("is asked before the optional questions, and spares the ones the description answers", () => {
    const jd = "Own our production reliability. 5+ years running Kubernetes, Go, Terraform and Postgres at scale.";
    const run = drive(ask, "Create a campaign for SRE", (q) => (q.id === "nc-jd" ? [jd, "jd.docx"] : undefined));
    expect(run.ids.indexOf("nc-jd")).toBe(run.ids.indexOf("nc-openings") + 1);
    // The description says what is wanted; the rest can be edited on the campaign, so nothing more is asked.
    for (const id of ["nc-exp", "nc-comp", "nc-skills", "nc-more"]) expect(run.ids).not.toContain(id);
    expect(run.answers.jd).toBe(jd);
  });

  it("is not asked when the message carries one", () => {
    const said = [
      "Create a new campaign for DevOps Engineer from Bangalore",
      "",
      "About the role",
      "- 5+ years running production Kubernetes",
      "- Terraform, AWS and CI/CD pipelines",
      "- Comfortable on call",
    ].join("\n");
    const parts = briefParts(said);
    expect(parts.head).toBe("Create a new campaign for DevOps Engineer from Bangalore");
    expect(parts.jd).toContain("5+ years running production Kubernetes");
    expect(campaignBriefIn(said)).toEqual({ role: "DevOps Engineer", client: null, city: "Bengaluru" });
    const run = drive(ask, said);
    expect(run.ids).not.toContain("nc-jd");
    expect(run.answers.jd).toBeUndefined();
    const a = liveCampaignAnswers(said, run.answers);
    expect(a.jd).toBe(parts.jd);
    expect(campaignDraftFor(a, "Me", DATA.clients).jd).toBe(parts.jd);
  });

  it("counts a long block as a description, and a short second line as more of the request", () => {
    const long = `Create a campaign for DevOps Engineer from Pune\n${"We run a large fleet and need someone who owns it end to end. ".repeat(10)}`;
    expect(briefParts(long).jd.length).toBeGreaterThan(400);
    expect(campaignHintsIn(long).jd).toBe(briefParts(long).jd);
    // One long line: the first sentence is the request.
    const oneLine = `Create a campaign for DevOps Engineer from Pune. ${"We run a large fleet and need someone who owns it. ".repeat(12)}`;
    expect(briefParts(oneLine).head).toBe("Create a campaign for DevOps Engineer from Pune.");
    expect(campaignBriefIn(oneLine)).toMatchObject({ role: "DevOps Engineer", city: "Pune" });
    // A second line that is only part of the request.
    const two = "Create a campaign for DevOps Engineer\nin Pune, remote";
    expect(briefParts(two).jd).toBe("");
    expect(campaignBriefIn(two)).toMatchObject({ role: "DevOps Engineer", city: "Pune" });
    expect(campaignHintsIn(two).mode).toBe("remote");
    // One bullet is not a description.
    expect(briefParts("Create a campaign for SRE\n- urgent").jd).toBe("");
  });

  it("goes to the server with the campaign, and says so on the card", () => {
    const jd = "Own our production reliability. 5+ years running Kubernetes.";
    const answers = { ...base, jd };
    const d = campaignDraftFor(answers, "Me", []);
    expect(d.jd).toBe(jd);
    const body = JSON.parse(JSON.stringify(createBodyFrom(rowFromDraft(d, ["Me"], 1), () => "u-me"))) as ReturnType<typeof createBodyFrom>;
    expect(body.setup).toMatchObject({ jd });
    expect(campaignFacts(d).find(([k]) => k === "Job description")?.[1]).toMatch(/^8 words, the requirements are drafted from it$/);
    // Nothing is sent for none, and the card has no such line.
    const none = campaignDraftFor({ ...base, jd: "" }, "Me", []);
    const bodyNone = JSON.parse(JSON.stringify(createBodyFrom(rowFromDraft(none, ["Me"], 1), () => "u-me"))) as ReturnType<typeof createBodyFrom>;
    expect(bodyNone.setup).not.toHaveProperty("jd");
    expect(campaignFacts(none).some(([k]) => k === "Job description")).toBe(false);
  });

  it("is kept to what the server keeps", () => {
    const d = campaignDraftFor({ ...base, jd: "x ".repeat(40_000) }, "Me", []);
    expect(d.jd.length).toBeLessThanOrEqual(30_000);
  });

  it("says where the requirements stand on the done card", () => {
    expect(draftingLine("SRE")).toBe("SRE created. I'm drafting its requirements from your job description.");
    expect(draftingLine("SRE", "drafted")).toMatch(/requirements are drafted from your job description/);
    const failed = draftingLine("SRE", "failed", "That's a lot of drafts in an hour.");
    expect(failed).toMatch(/aren't drafted yet: That's a lot of drafts in an hour\./);
    expect(failed).toMatch(/Ask me to draft them/);
    expect(draftingLine("SRE", "failed")).toBe("SRE created, but its requirements aren't drafted yet. Ask me to draft them from your job description.");
  });
});

describe("the order, and how few questions it takes", () => {
  it("asks Role, Client, Team, Work mode, City, Hires, then the description", () => {
    const run = drive(ask, "start a new campaign", (q) => (q.id === "nc-role" ? ["Staff Data Engineer"] : q.id === "nc-jd" ? ["later"] : undefined));
    expect(run.ids.slice(0, 7)).toEqual(["nc-role", "nc-client", "nc-dept", "nc-mode", "nc-location", "nc-openings", "nc-jd"]);
  });

  it("asks nothing for a message that says it all, but the client, the description and what stays optional", () => {
    const said = "Create a new campaign for DevOps Engineer from Bangalore, remote, hire 3";
    const run = drive(ask, said, (q) => (q.id === "nc-jd" ? ["later"] : undefined));
    // The team is the role's own ("DevOps Engineer" is Engineering), taken and shown, not asked.
    expect(run.asked.slice(0, 3)).toEqual(["nc-client", "nc-jd", "nc-more"]);
    expect(run.answers).toMatchObject({ mode: "remote", location: "Bengaluru", openings: "3", dept: "Engineering" });
  });

  it("asks who it is for with the clients to tap and a field for any other company, and never offers no client", () => {
    const q = ask("campaign-new", "Create a new campaign for DevOps Engineer from Bangalore", ctx({ role: "DevOps Engineer" }))!;
    expect(q.id).toBe("nc-client");
    expect(q.options.map((o) => o.id)).not.toContain("none");
    expect(q.options.map((o) => o.label).join(" ")).not.toMatch(/no client|internal hire/i);
    expect(q.other).toMatchObject({ label: "A new client", placeholder: "Company name" });
    expect(q.other?.check?.("a")).toBe("Add the company's name.");
    expect(q.other?.check?.("Orbit Labs")).toBeNull();
    // A tile is a client; a typed company that is one of them is that client; any other is a company to add.
    expect(q.apply([q.options[0]!.id]).answers).toEqual({ client: q.options[0]!.id });
    expect(q.apply(["razorpay"]).answers).toEqual({ client: "cl-razorpay" });
    expect(q.apply(["Orbit Labs"]).answers).toEqual({ client: "new", newClient: "Orbit Labs" });
    // An answer from before every campaign had a client is not an answer: the question stays open.
    expect(q.apply(["none"]).answers).toEqual({});
  });

  it("answers for a message with more than one thing said, in the demo's own question", () => {
    const said = "Create a campaign to hire 2 SREs from Pune, hybrid";
    const A = newCampaignAnswers(said, {});
    expect(A).toMatchObject({ role: "SREs", location: "Pune", mode: "hybrid", openings: "2" });
  });
});

describe("the log, as the card shows it", () => {
  beforeEach(() => clearThread());
  const said = "Create a new campaign for DevOps Engineer from Bangalore";
  const render = (saved: Parameters<typeof saveTrail>[1], text = said) => {
    const turn = { id: "turn-guided", restored: true };
    saveTrail(turn.id, saved);
    return renderToStaticMarkup(
      <TurnContext.Provider value={turn}>
        <Clarified kind="campaign-new" ctx={ctx({}, text)} ask={ask}>{() => <p>THE CARD</p>}</Clarified>
      </TurnContext.Provider>,
    );
  };

  it("does not log what the message said (the card that follows shows it once), and goes on to the description", () => {
    const html = render([
      { qid: "nc-client", ids: [WHO], auto: false },
      { qid: "nc-dept", ids: ["Engineering"], auto: false },
      { qid: "nc-mode", ids: ["hybrid"], auto: false },
      { qid: "nc-location", ids: ["Bengaluru"], auto: "preset" },
      { qid: "nc-openings", ids: ["2"], auto: false },
    ]);
    // The city came from the message: one place shows it, the campaign card, not a row here as well.
    expect(html).not.toContain("Location:");
    expect(html).not.toContain("Change location");
    expect(html).toContain("Client:");
    expect(html).not.toContain("Which city?");
    expect(html).toContain("Do you have the job description?");
    expect(html).toContain("Paste it");
    expect(html).toContain("Upload a file");
    expect(html).toContain("I&#x27;ll add it later");
  });

  it("does not repeat a mode and a number the message gave", () => {
    const text = "Create a campaign to hire 3 DevOps engineers from Pune, remote";
    const html = render([
      { qid: "nc-client", ids: [WHO], auto: false },
      { qid: "nc-dept", ids: ["Engineering"], auto: false },
      { qid: "nc-mode", ids: ["remote"], auto: "preset" },
      { qid: "nc-location", ids: ["Pune"], auto: "preset" },
      { qid: "nc-openings", ids: ["3"], auto: "preset" },
    ], text);
    expect(html).not.toContain("Work mode:");
    expect(html).not.toContain("Openings:");
    expect(html).not.toContain("from your message");
    expect(html).toContain("Do you have the job description?");
  });

  it("shows the description's answer as one line", () => {
    const html = render([
      { qid: "nc-client", ids: [WHO], auto: false },
      { qid: "nc-dept", ids: ["Engineering"], auto: false },
      { qid: "nc-mode", ids: ["hybrid"], auto: false },
      { qid: "nc-location", ids: ["Bengaluru"], auto: "preset" },
      { qid: "nc-openings", ids: ["2"], auto: false },
      { qid: "nc-jd", ids: ["Own production reliability. Kubernetes, Go, Terraform and Postgres at scale.", "jd.pdf"], auto: false },
    ]);
    expect(html).toContain("Job description:");
    expect(html).toContain("jd.pdf, 10 words");
    expect(html).not.toContain("Do you have the job description?");
    // The description says what is wanted: no questions about experience, pay or must-haves follow.
    expect(html).not.toContain("years of experience");
    expect(html).not.toContain("CTC");
  });
});

describe("a short list of answers, and 'Other'", () => {
  const openings = (): Question => ask("campaign-new", "x", ctx({ role: "SRE", client: WHO, dept: "Data", mode: "onsite", location: "Pune" }))!;
  const draw = (q: Question) => renderToStaticMarkup(<TileCard q={q} hint="" keysHint onAnswer={() => {}} />);

  it("is one row of equal chips, Other last, with no second line to wrap in a narrow cell", () => {
    const html = draw(openings());
    expect(html).toContain("qa-opts is-chips");
    const labels = [...html.matchAll(/class="qa-opt-l">([^<]+)</g)].map((m) => m[1]);
    expect(labels).toEqual(["One", "Two", "Three", "Five", "Other"]);
    expect(html).not.toContain("qa-opt-m");
    expect(html).not.toMatch(/Another number|Type it in/);
    // The keys 1 to 5 stay: Other is the fifth.
    expect([...html.matchAll(/class="qa-key">(\d)</g)].map((m) => m[1])).toEqual(["1", "2", "3", "4", "5"]);
    // The field opens only once Other is chosen.
    expect(html).not.toContain("qa-other");
  });

  it("keeps rows for answers that say more about themselves, with Other as the last of them", () => {
    const q = ask("campaign-new", "x", ctx({ role: "SRE", client: "c-acme", dept: "Data", mode: "hybrid" }))!;
    const html = draw(q);
    expect(q.id).toBe("nc-location");
    expect(html).not.toContain("is-chips");
    expect(html.lastIndexOf(">Other<")).toBeGreaterThan(html.lastIndexOf("Pune"));
  });

  it("is one row in the log, with the final value, never the placeholder and then the text", () => {
    const turn = { id: "turn-other", restored: true };
    saveTrail(turn.id, [
      { qid: "nc-client", ids: [WHO], auto: false },
      { qid: "nc-dept", ids: ["Engineering"], auto: false },
      { qid: "nc-mode", ids: ["onsite"], auto: false },
      { qid: "nc-location", ids: ["Kochi"], auto: false },
      { qid: "nc-openings", ids: ["12"], auto: false },
    ]);
    const html = renderToStaticMarkup(
      <TurnContext.Provider value={turn}>
        <Clarified kind="campaign-new" ctx={ctx({}, "Create a new campaign for DevOps Engineer")} ask={ask}>{() => <p>THE CARD</p>}</Clarified>
      </TurnContext.Provider>,
    );
    expect((html.match(/Location:/g) ?? []).length).toBe(1);
    expect(html).toContain("Kochi");
    expect((html.match(/Openings:/g) ?? []).length).toBe(1);
    expect(html).toContain(">12<");
    expect(html).not.toMatch(/Another|Other…|Type it in/);
  });
});

describe("a brief that says it all", () => {
  const FULL = "Start a new campaign for a Senior Backend Engineer at Cobalt Payments in Pune, hybrid, 5 to 8 years, CTC 30-45 LPA, 2 openings, must have Go and Kafka";
  /* The workspace's clients are in the store the message is read against, as the card reads them. */
  const cobalt = saveClient(clientFromDraft({ ...EMPTY_DRAFT, name: "Cobalt Payments Pvt Ltd", location: "Pune", status: "active" }, "cl-cobalt-brief"));
  const withCobalt: LiveData = { clients: [...DATA.clients, cobalt], rows: DATA.rows };

  it("is asked nothing but the description: the client, the city, how they work, how many and the rest are the message's", () => {
    const run = drive(liveCampaignAsk(() => withCobalt), FULL, (q) => (q.id === "nc-jd" ? ["later"] : undefined));
    expect(run.asked).toEqual(["nc-jd"]);
    expect(run.answers).toMatchObject({ mode: "hybrid", location: "Pune", openings: "2", dept: "Engineering" });
    const a = liveCampaignAnswers(FULL, run.answers);
    expect(a).toMatchObject({ role: "Senior Backend Engineer", client: cobalt.id, exp: "5 to 8", comp: "30 to 45", skills: "Go and Kafka" });
    const d = campaignDraftFor(a, "Me", withCobalt.clients);
    expect(d).toMatchObject({ name: "Senior Backend Engineer", clientId: cobalt.id, openings: 2, expMin: "5", expMax: "8", compMin: "30", compMax: "45" });
    expect(d.mustHave).toEqual(["Go and Kafka"]);
    // And the log shows none of it a second time: the card is the one summary.
    const turn = { id: "turn-brief", restored: true };
    saveTrail(turn.id, [
      { qid: "nc-dept", ids: ["Engineering"], auto: "preset" },
      { qid: "nc-mode", ids: ["hybrid"], auto: "preset" },
      { qid: "nc-location", ids: ["Pune"], auto: "preset" },
      { qid: "nc-openings", ids: ["2"], auto: "preset" },
    ]);
    const html = renderToStaticMarkup(
      <TurnContext.Provider value={turn}>
        <Clarified kind="campaign-new" ctx={ctx({}, FULL)} ask={liveCampaignAsk(() => withCobalt)}>{() => <p>THE CARD</p>}</Clarified>
      </TurnContext.Provider>,
    );
    for (const row of ["Location:", "Work mode:", "Openings:", "Department:", "Client:"]) expect(html).not.toContain(row);
  });

  it("asks a bare request for what is missing, and no more than the optional line for experience, CTC and must-haves", () => {
    const run = drive(ask, "start a new campaign", (q) => (q.id === "nc-role" ? ["Staff Data Engineer"] : q.id === "nc-jd" ? ["later"] : undefined));
    // The department is the role's own ("Data"), taken and shown on the card, not asked.
    expect(run.asked).toEqual(["nc-role", "nc-client", "nc-mode", "nc-location", "nc-openings", "nc-jd", "nc-more"]);
  });
});
