import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { clientInJd, companyKey, companySaid, departmentFor, sameCompany } from "../campaignAsk";
import { getClients, saveClient } from "../campaignStore";
import { NEW_CLIENT, campaignAskIn, newCampaignAnswers, newCampaignQuestion } from "../clarify";
import { EMPTY_DRAFT, clientFromDraft } from "../clients";
import { setSession } from "../roleStore";
import type { MomentCtx } from "../moments";

/**
 * A request to start a campaign says what it says once: the role, the client, the city, how they work, how many,
 * the experience, the pay and the must-haves are answers, and a client named in any of the usual ways is matched to the
 * workspace's by its name however it is capitalised, spaced or ended, or is a new client without being asked.
 */

const ctx = (answers: Record<string, string> = {}): MomentCtx => ({
  said: "", verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {},
  deploy: () => null, undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {},
  prefs: {}, setPref: () => {}, answers,
});

let cobalt = "";
beforeAll(() => {
  setSession({ role: "admin", name: "Ada A" });
  cobalt = saveClient(clientFromDraft({ ...EMPTY_DRAFT, name: "Cobalt Payments Pvt Ltd" }, "cl-cobalt-ask")).id;
});

describe("a company's name", () => {
  it.each([
    ["Zlice Technology PVT Limited", "zlice"],
    ["Cobalt Payments Pvt. Ltd.", "cobalt payments"],
    ["  COBALT   payments ", "cobalt payments"],
    ["Acme Technologies Inc", "acme"],
    ["Tech", "tech"],
    ["Orchid & Co", "orchid and"],
  ])("%s is %s", (name, key) => expect(companyKey(name)).toBe(key));

  it("is one company however it is capitalised, spaced or ended", () => {
    expect(sameCompany("northwind logistics", "Northwind Logistics")).toBe(true);
    expect(sameCompany("Cobalt Payments", "Cobalt Payments Pvt Ltd")).toBe(true);
    expect(sameCompany("Cobalt", "Cobalt Payments")).toBe(false);
    expect(sameCompany("", "")).toBe(false);
  });

  it("is found in a sentence by its name, without its ending, but not by a common word", () => {
    const named = [{ name: "Cobalt Payments Pvt Ltd" }, { name: "Tech Mahindra" }, { name: "First Tech" }];
    expect(companySaid("a role for Cobalt Payments in Pune", named)?.name).toBe("Cobalt Payments Pvt Ltd");
    expect(companySaid("good tech people please", named)).toBeUndefined();
    expect(companySaid("cobalt blue paint", named)).toBeUndefined();
  });
});

const TABLE: ReadonlyArray<[string, Partial<ReturnType<typeof campaignAskIn>>]> = [
  // The company after "at", "from", "for", "on behalf of", and as the owner of the role.
  ["Start a new campaign for Senior Backend Engineer at Cobalt Payments", { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd" }],
  ["create a campaign for a Senior Backend Engineer at cobalt payments", { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd" }],
  ["Create a campaign for a Senior Backend Engineer at COBALT   PAYMENTS Limited in Pune", { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd", city: "Pune" }],
  ["New campaign for Senior Backend Engineer from Cobalt Payments", { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd" }],
  ["Start a campaign for the client Cobalt Payments Technologies, a Backend Engineer", { client: "Cobalt Payments Pvt Ltd" }],
  ["Open a campaign on behalf of Cobalt Payments for a Senior Backend Engineer", { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd" }],
  ["Start a campaign for Cobalt Payments' Senior Backend Engineer, Pune", { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd", city: "Pune" }],
  ["Start a campaign: Senior Backend Engineer at Cobalt Payments", { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd" }],
  // Labelled.
  ["Start a campaign. Client: Cobalt Payments. Role: Senior Backend Engineer. City: Pune", { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd", city: "Pune" }],
  ["new campaign - client: cobalt payments, role: SRE, location: Bangalore, experience: 5-8 years, CTC: 30-45 LPA", { role: "SRE", client: "Cobalt Payments Pvt Ltd", city: "Bengaluru", exp: "5 to 8", comp: "30 to 45" }],
  ["Start a campaign, company: Zenith Foods; role: Data Analyst; skills: SQL, Python, Tableau", { role: "Data Analyst", client: "Zenith Foods", skills: "SQL, Python, Tableau" }],
  // A company that is not a client yet is a client to add.
  ["Start a new campaign for Staff SRE at Zenith Foods", { role: "Staff SRE", client: "Zenith Foods" }],
  ["Create a campaign on behalf of Zenith Foods for a Staff SRE", { role: "Staff SRE", client: "Zenith Foods" }],
  ["Create a campaign for Zenith Foods' Staff SRE", { role: "Staff SRE", client: "Zenith Foods" }],
  // Figures in the same sentence are answers, and are not part of the role.
  [
    "Start a new campaign for Senior Backend Engineer at Cobalt Payments, Pune, hybrid, 5-8 years experience, 30-45 LPA, 2 openings",
    { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd", city: "Pune", exp: "5 to 8", comp: "30 to 45" },
  ],
  ["Start a campaign for a Platform Engineer, Pune, 6+ yrs, 40 LPA", { role: "Platform Engineer", city: "Pune", exp: "6", comp: "40" }],
  ["Start a campaign for a Data Analyst in Pune, ₹12L to 18L, 3-5 yrs", { role: "Data Analyst", city: "Pune", exp: "3 to 5", comp: "12 to 18" }],
  // Everything in one sentence, in the orders people use.
  [
    "Start a new campaign: Senior Backend Engineer for Cobalt Payments, Pune, hybrid, 5-8 years, 30-45 LPA, 2 openings, must-haves Go, Kafka",
    { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd", city: "Pune", exp: "5 to 8", comp: "30 to 45", skills: "Go, Kafka" },
  ],
  [
    "Start a new campaign for a Senior Backend Engineer at Cobalt Payments in Pune, hybrid, 5 to 8 years of experience, CTC 30-45 LPA, 2 openings, must have Go, Kafka and Postgres",
    { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd", city: "Pune", exp: "5 to 8", comp: "30 to 45", skills: "Go, Kafka and Postgres" },
  ],
  [
    "Start a new campaign for a Senior Backend Engineer at Cobalt Payments in Pune hybrid 5-8 years 30-45 LPA 2 openings",
    { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd", city: "Pune", exp: "5 to 8", comp: "30 to 45" },
  ],
  [
    "Create a campaign for a Staff Data Engineer at Zenith Foods, remote, Bengaluru, 8+ years, up to 60 LPA, hiring 3",
    { role: "Staff Data Engineer", client: "Zenith Foods", city: "Bengaluru", exp: "8", compTop: "60" },
  ],
  [
    "Open a new campaign — DevOps Engineer, Cobalt Payments, Hyderabad, on-site, 3-5 yrs, ₹18L-26L, 4 positions, must-haves: Terraform, AWS",
    { client: "Cobalt Payments Pvt Ltd", city: "Hyderabad", exp: "3 to 5", comp: "18 to 26", skills: "Terraform, AWS" },
  ],
  [
    "Start a campaign for Cobalt Payments: Senior Backend Engineer, Pune, 5-8 years",
    { role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd", city: "Pune", exp: "5 to 8" },
  ],
  [
    "new campaign for senior backend engineer at cobalt payments in pune",
    { role: "senior backend engineer", client: "Cobalt Payments Pvt Ltd", city: "Pune" },
  ],
  [
    "Need a campaign for 2 Senior Backend Engineers at Cobalt Payments, Pune",
    { client: "Cobalt Payments Pvt Ltd", city: "Pune" },
  ],
  // What is only part of the role stays in it.
  ["set up a campaign called Lead in Data Science", { role: "Lead in Data Science", client: null, city: null }],
  ["Start a campaign for Engineer at scale", { role: "Engineer at scale", client: null }],
];

describe("what a request to start a campaign says", () => {
  it.each(TABLE)("%s", (said, want) => {
    expect(campaignAskIn(said)).toMatchObject(want);
  });

  it("is read from the first line of a long message, not from the job description under it", () => {
    const jd = "About the role\n- Build payment services in Go\n- Own reliability\n- 5-8 years in backend\nWe pay 30-45 LPA. Based at Cobalt Payments in Pune.\n".repeat(8);
    const said = `Start a new campaign for Senior Backend Engineer at Cobalt Payments\n${jd}`;
    expect(campaignAskIn(said)).toMatchObject({ role: "Senior Backend Engineer", client: "Cobalt Payments Pvt Ltd", exp: null, comp: null });
  });
});

describe("the client, once it is read", () => {
  it("is the workspace's own client when the name is the same company, however it was written", () => {
    for (const said of [
      "Start a new campaign for Senior Backend Engineer at Cobalt Payments",
      "Start a campaign for Cobalt Payments' Senior Backend Engineer",
      "start a campaign on behalf of cobalt payments technologies for a Senior Backend Engineer",
    ]) {
      const a = newCampaignAnswers(said, {});
      expect(a.client, said).toBe(cobalt);
      expect(a.newClient, said).toBeUndefined();
    }
  });

  it("is a new client, added with the campaign and not asked about, when it is not in Clients", () => {
    const said = "Start a new campaign for Staff SRE at Zenith Foods, Pune, remote";
    const a = newCampaignAnswers(said, {});
    expect(a).toMatchObject({ client: NEW_CLIENT, newClient: "Zenith Foods", role: "Staff SRE", location: "Pune", mode: "remote" });
    expect(newCampaignQuestion(said, ctx())?.id).not.toBe("nc-client");
  });

  it("is a company a recruiter cannot add: it stays in the role and the question is of the clients they have", () => {
    setSession({ role: "recruiter", name: "Riya K" });
    try {
      const said = "Start a new campaign for Staff SRE at Zenith Foods";
      expect(campaignAskIn(said)).toMatchObject({ client: null });
      expect(newCampaignAnswers(said, {}).client).toBeUndefined();
      // A client they can see is matched all the same.
      expect(newCampaignAnswers("Start a campaign for Senior Backend Engineer at Cobalt Payments", {}).client).toBe(cobalt);
    } finally {
      setSession({ role: "admin", name: "Ada A" });
    }
  });

  it("asks nothing that the message gave: only what is left", () => {
    const said = "Start a new campaign for Senior Backend Engineer at Cobalt Payments, Pune, hybrid, 2 openings, 5-8 years, 30-45 LPA, must-haves: Go, Kafka";
    const a = newCampaignAnswers(said, {});
    expect(a).toMatchObject({ role: "Senior Backend Engineer", client: cobalt, location: "Pune", mode: "hybrid", openings: "2", exp: "5 to 8", comp: "30 to 45", skills: "Go, Kafka" });
    // What remains to ask: the job description, and the agents. The department and how they work are the message's, shown to change.
    const asked: string[] = [];
    let answers: Record<string, string> = {};
    for (let n = 0; n < 12; n++) {
      const q = newCampaignQuestion(said, ctx(answers));
      if (!q) break;
      // A preset is taken, shown with its Change, and not asked.
      if (q.preset === undefined) asked.push(q.id);
      answers = { ...answers, ...q.apply([q.preset ?? (q.id === "nc-jd" ? "later" : q.options[0]?.id ?? "")]).answers };
    }
    expect(asked).toEqual(["nc-jd", "nc-agents"]);
    expect(getClients().clients.some((c) => c.id === cobalt)).toBe(true);
  });
});

describe("the department a role is in", () => {
  it.each([
    ["Senior Backend Engineer", "Engineering"],
    ["DevOps Engineer", "Engineering"],
    ["Data Analyst", "Data"],
    ["Data Engineer", "Data"],
    ["Product Designer", "Design"],
    ["Product Manager", "Product"],
    ["Sales Development Representative", "Go to market"],
    ["Accountant", "Finance"],
    ["Operations Manager", "Operations"],
    ["Lead", ""],
  ])("%s is %s", (role, dept) => expect(departmentFor(role)).toBe(dept));
});

describe("the client the real job descriptions name", () => {
  const dir = "/tmp/claude-1000/-home-arnab_fedora-Desktop-Pareto-Labs/203f3e28-0a17-43a5-b7e6-25bffad584eb/scratchpad";
  for (const f of ["lumen_jd.txt", "lumen_jd2.txt"]) {
    it(`${f}: Quillpad Software`, () => {
      const jd = existsSync(`${dir}/${f}`) ? readFileSync(`${dir}/${f}`, "utf8") : null;
      if (jd === null) return;
      expect(clientInJd(jd)).toBe("Quillpad Software");
      expect(clientInJd(jd, ["Orbit Staffing"])).toBe("Quillpad Software");
    });
  }
});

describe("the client a job description names", () => {
  it.each<[string, string, string | null]>([
    ["a Client line", "Senior Data Engineer\nClient: Tessellate Analytics\nLocation: Pune\n5+ years of Spark.", "Tessellate Analytics"],
    ["a bold Client line", "**Client:** Tessellate Analytics\nRole: Data Engineer", "Tessellate Analytics"],
    ["a Client line with the city after it", "Role: SRE\nClient name: Cobalt Payments Pvt Ltd (Series B, Pune)", "Cobalt Payments Pvt Ltd"],
    ["a customer line", "Backend Engineer\nCustomer - Razorpay\nGo and Postgres.", "Razorpay"],
    ["on behalf of", "We are recruiting on behalf of Zorblax Studios for a QA Lead in Pune.", "Zorblax Studios"],
    ["the company in the heading", "Senior Data Engineer for Tessellate Analytics\nBengaluru, hybrid\n6+ years.", "Tessellate Analytics"],
    ["our client in the heading", "Hiring for our client Cobalt Payments: Backend Engineer", "Cobalt Payments"],
    ["a company hiring", "Tessellate Analytics is hiring a Senior Data Engineer.\nYou will own pipelines.", "Tessellate Analytics"],
    ["an inline Client label", "Senior Data Engineer | Client: Tessellate Analytics | Pune", "Tessellate Analytics"],
    ["a company name as the first line", "Quillpad Software\nJob Description: Backend Engineer\nLocation: Bengaluru\n\nAbout Quillpad Software\nQuillpad Software builds writing tools.", "Quillpad Software"],
    ["an About line", "Backend Engineer\nLocation: Bengaluru, India\n\nAbout Quillpad Software\nWe build writing tools used by two million students.", "Quillpad Software"],
    ["a company with a suffix as the first line", "Cobalt Payments Pvt. Ltd.\nSenior SRE\nPune", "Cobalt Payments Pvt. Ltd"],
    ["a company that is looking", "Quillpad Software is looking for a Backend Engineer.\nGo and Postgres.", "Quillpad Software"],
    ["a job title as the first line", "Data Platform Engineer\nLocation: Pune\nYou will build pipelines.", null],
    ["a plain heading as the first line", "Job Description\nBackend Engineer\nGo.", null],
    ["a one-word kind of company", "Software\nBackend Engineer", null],
    ["About us and About the role", "Backend Engineer\nAbout us\nAbout the role\nGo.", null],
    ["no client at all", "Senior Data Engineer\nYou will build pipelines in Spark and Airflow.\n5+ years.", null],
    ["a city after for", "Senior Data Engineer for Pune office, hybrid", null],
    ["a team after for", "Backend Engineer for Platform Team\nGo.", null],
    ["customer-facing words", "Support Engineer\nCustomer-facing role, Client-side rendering experience.", null],
    ["a confidential client", "Client: Confidential\nData Engineer", null],
    ["nothing", "", null],
  ])("%s", (_name, jd, want) => expect(clientInJd(jd)).toBe(want));

  it("never offers the person's own company as the client", () => {
    expect(clientInJd("Client: Orbit Staffing Pvt Ltd\nData Engineer", ["Orbit Staffing"])).toBeNull();
    expect(clientInJd("Orbit Staffing is hiring a Data Engineer.", ["Orbit Staffing"])).toBeNull();
    expect(clientInJd("Client: Tessellate Analytics", ["Orbit Staffing"])).toBe("Tessellate Analytics");
    expect(clientInJd("Orbit Staffing Pvt Ltd\nBackend Engineer\nAbout Orbit Staffing\nWe place people.", ["Orbit Staffing"])).toBeNull();
  });
});

describe("a client name stops where its sentence stops", () => {
  it("does not run on into the place that follows", () => {
    expect(clientInJd("Data Analyst at Zetalabs. Mumbai, hybrid. 2 to 5 years of experience.")).toBe("Zetalabs");
  });

  it("keeps a company's own full stops", () => {
    expect(clientInJd("Client: Cobalt Payments Pvt. Ltd.")).toBe("Cobalt Payments Pvt. Ltd");
  });
});
