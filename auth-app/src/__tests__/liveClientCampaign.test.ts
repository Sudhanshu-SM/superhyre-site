import { afterEach, describe, expect, it } from "vitest";
import { createBodyFrom } from "../api/campaigns";
import { deleteClient, getClients, resetClients } from "../campaignStore";
import { NEW_CLIENT } from "../clarify";
import { clientBody, contactBody } from "../api/clients";
import { ownCampaign, rowFromDraft } from "../campaignDraft";
import type { CampaignRow } from "../campaignsData";
import type { Question } from "../clarify";
import { clientFromDraft } from "../clients";
import type { Client } from "../clients";
import { clientDraftFromAnswers } from "../ClientMoments";
import {
  campaignChecks, campaignDraftFor, campaignFacts, cityOf, cityOptions, clientChecks, departmentOptions, experienceLabel, feeOptions,
  findClient, industryOptions, inferSeniority, liveCampaignAnswers, rankedValues, reasonFrom,
} from "../liveViews/clientCampaign";
import type { LiveData } from "../liveViews/clientQuestions";
import { liveCampaignAsk, liveClientAsk } from "../liveViews/clientQuestions";
import type { MomentCtx } from "../moments";
import { setSession } from "../roleStore";

const ctx = (answers: Record<string, string> = {}): MomentCtx => ({
  said: "", verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {},
  deploy: () => null, undeploy: () => {}, seed: () => {}, onGrow: () => {}, onBusy: () => {},
  prefs: {}, setPref: () => {}, answers,
});

const client = (over: Partial<Client> & Pick<Client, "id" | "name">): Client => ({ manager: "", email: "", phone: "", notes: "", contacts: [], ...over });
const row = (department: string | null, location: string | null): Pick<CampaignRow, "department" | "location"> => ({ department: department ?? "", location: location ?? "" });

const DATA: LiveData = {
  clients: [
    client({ id: "c-acme", name: "Acme Robotics", industry: "Fintech", location: "Bengaluru", fee: "18% of first-year CTC", status: "active" }),
    client({ id: "c-old", name: "Old Co", industry: "Healthtech", fee: "To be agreed", status: "inactive" }),
  ],
  rows: [row("Engineering", "Bengaluru"), row("Engineering", "Pune"), row("Platform", "Bengaluru"), row("", "Remote, Chennai")],
};

/** Answers a question the way a recruiter would: its first tile, or the text given for it. */
function walk(ask: ReturnType<typeof liveClientAsk>, said: string, text: Record<string, string> = {}, tile: Record<string, string> = {}) {
  const asked: Question[] = [];
  let a: Record<string, string> = {};
  for (let i = 0; i < 24; i++) {
    const q = ask("client", said, ctx(a));
    if (!q) break;
    asked.push(q);
    const pick = q.input ? (text[q.id] ?? "") : (tile[q.id] ?? q.options[0]?.id ?? "");
    a = { ...a, ...q.apply([pick]).answers };
  }
  return { asked, a, ids: asked.map((q) => q.id) };
}

describe("real options", () => {
  it("ranks distinct values, most used first, ignoring case and blanks", () => {
    expect(rankedValues(["Pune", "pune ", "", null, "Bengaluru", "Bengaluru", "Bengaluru"])).toEqual([
      { value: "Bengaluru", n: 3 }, { value: "Pune", n: 2 },
    ]);
  });

  it("offers the teams the workspace already uses, then the usual ones", () => {
    const o = departmentOptions(DATA.rows);
    expect(o.map((x) => x.id)).toEqual(["Engineering", "Platform", "Design", "Data", "Product"]);
    expect(o[0]?.meta).toBe("2 campaigns");
    expect(o[1]?.meta).toBe("1 campaign");
  });

  it("offers the usual teams alone when no campaign has one", () => {
    expect(departmentOptions([row(null, "Pune")]).map((x) => x.id)).toEqual(["Engineering", "Design", "Data", "Product", "Go to market"]);
  });

  it("reads the city out of a remote campaign's place", () => {
    expect(cityOf("Remote, Chennai")).toBe("Chennai");
    expect(cityOf("Remote")).toBe("");
    expect(cityOf("Hyderabad")).toBe("Hyderabad");
    expect(cityOf(null)).toBe("");
  });

  it("offers where the client is first, then where campaigns are", () => {
    const o = cityOptions(DATA.rows, DATA.clients[0]);
    expect(o.map((x) => x.id)).toEqual(["Bengaluru", "Pune", "Chennai"]);
    expect(o[0]?.meta).toBe("Where Acme Robotics is");
  });

  it("offers no city when none is known", () => {
    expect(cityOptions([row("Engineering", "Remote")], undefined)).toEqual([]);
  });

  it("puts the industries the clients are in first and always ends with something else", () => {
    const o = industryOptions(DATA.clients);
    expect(o.map((x) => x.id).slice(0, 3)).toEqual(["Fintech", "Healthtech", "Consumer internet"]);
    expect(o.at(-1)).toEqual({ id: "Other", label: "Something else" });
    expect(o).toHaveLength(7);
  });

  it("puts fee terms other clients are on first, and never a placeholder", () => {
    const o = feeOptions(DATA.clients);
    expect(o[0]).toMatchObject({ id: "18% of first-year CTC", meta: "On one client" });
    expect(o.map((x) => x.id)).not.toContain("To be agreed");
    /* the usual 18% is the same terms: not offered twice */
    expect(o.filter((x) => x.id === "18% of first-year CTC")).toHaveLength(1);
    expect(o).toHaveLength(4);
  });
});

describe("the add-client questions", () => {
  const ask = liveClientAsk(() => DATA);

  it("asks the company's name and nothing else (website, industry, contact and fee are added later)", () => {
    const w = walk(ask, "add a client", { "client-company": "Zz Chat Test Client" });
    expect(w.ids).toEqual(["client-company"]);
    expect(w.a).toEqual({ company: "Zz Chat Test Client" });
    // One field, in plain words, and a line that says the rest can wait.
    expect(w.asked[0]).toMatchObject({ ask: "What's the company called?", options: [] });
    expect(w.asked[0]?.why).toMatch(/Clients page later/);
  });

  it("asks nothing at all when the message names the company", () => {
    expect(ask("client", "add Zz Chat Test Client as a client", ctx())).toBeNull();
    expect(ask("client", "onboard Newco Systems as a client", ctx())).toBeNull();
  });

  it("asks nothing more for a company that is already a client", () => {
    expect(ask("client", "add Razorpay as a client", ctx())).toBeNull();
  });

  it("never asks for a website, an industry, a contact or fee terms, whatever was answered", () => {
    const answered: Array<Record<string, string>> = [{}, { company: "Zeta" }, { company: "Zeta", website: "" }, { company: "Zeta", website: "", industry: "Fintech" }];
    for (const answers of answered) {
      const id = ask("client", "add a client", ctx(answers))?.id;
      expect(["client-website", "client-industry", "client-contact", "client-fee"]).not.toContain(id);
    }
  });
});

describe("a client, from the answers to what the API is sent", () => {
  const owner = "Fn3 Owner";

  it("reads the contact, the site and the fee, and starts them as a prospect without terms", () => {
    const d = clientDraftFromAnswers({ company: " Zeta Labs ", website: "https://www.Zeta.in/careers", industry: "Fintech", contact: "Neha Kapoor, neha@zeta.in", fee: "none" }, owner);
    const c = clientFromDraft(d, "cl-x");
    const body = { ...clientBody(c), contacts: (c.contacts ?? []).map(({ id: _id, ...x }) => contactBody(x)) };
    expect(body).toMatchObject({ name: "Zeta Labs", website: "zeta.in", industry: "Fintech", status: "prospect", fee: null });
    expect(body.contacts).toEqual([{ name: "Neha Kapoor", title: null, email: "neha@zeta.in", phone: null, primary: true }]);
  });

  it("starts them active once fee terms are agreed, and leaves out what wasn't given", () => {
    const d = clientDraftFromAnswers({ company: "Zeta Labs", website: "", industry: "Other", contact: "", fee: "18% of first-year CTC" }, owner);
    const c = clientFromDraft(d, "cl-x");
    const body = clientBody(c);
    expect(body).toMatchObject({ status: "active", fee: "18% of first-year CTC", website: null, industry: null });
    expect(c.contacts).toEqual([]);
  });

  it("names the contact after the email when only an email was given", () => {
    expect(clientDraftFromAnswers({ company: "Zeta", contact: "neha@zeta.in" }, owner)).toMatchObject({ contactName: "neha", contactEmail: "neha@zeta.in" });
  });
});

describe("a repeated client name", () => {
  const clients = [{ id: "c1", name: "Acme Robotics" }];

  it("is found whatever its capitals or spaces", () => {
    expect(findClient("  acme ROBOTICS ", clients)?.id).toBe("c1");
    expect(findClient("Acme", clients)).toBeUndefined();
    expect(findClient("", clients)).toBeUndefined();
  });

  it("is its own case, not an error to fix", () => {
    const d = clientDraftFromAnswers({ company: "acme robotics" }, "me");
    const c = clientChecks(d, clients);
    expect(c.duplicate?.id).toBe("c1");
    expect(c.blocking).toBeNull();
  });

  it("stops a name that is too short, in the console's words", () => {
    expect(clientChecks(clientDraftFromAnswers({ company: "A" }, "me"), clients).blocking).toBe("Add the company's name.");
  });

  it("leaves out a website it can't read, and says so", () => {
    const c = clientChecks(clientDraftFromAnswers({ company: "Zeta", website: "not a website" }, "me"), clients);
    expect(c.blocking).toBeNull();
    expect(c.notes).toEqual(['I couldn\'t read "not a website" as a website, so I\'ve left it out.']);
    expect(clientChecks(clientDraftFromAnswers({ company: "Zeta", website: "zeta.in" }, "me"), clients).notes).toEqual([]);
  });

  it("gives the server's sentence back when it refuses", () => {
    expect(reasonFrom("Zeta wasn't added. Zeta is already a client.", "Zeta", "added")).toBe("Zeta is already a client.");
    expect(reasonFrom("Zeta wasn't created. Only admins can do this.", "Zeta", "created")).toBe("Only admins can do this.");
    expect(reasonFrom("Zeta wasn't added.", "Zeta", "added")).toBeNull();
    expect(reasonFrom("Other wasn't added. Nope.", "Zeta", "added")).toBeNull();
    expect(reasonFrom(null, "Zeta", "added")).toBeNull();
  });
});

describe("the new-campaign questions", () => {
  const ask = liveCampaignAsk(() => DATA);
  const FULL = { "nc-role": "Zz Chat Test Campaign", "nc-location": "", "nc-comp": "30 to 45", "nc-skills": "Go, Postgres" };

  it("walks the demo's order, asks experience, pay and must-haves once, in one line, and never asks about agents", () => {
    const w = walk(ask, "start a new campaign", { ...FULL, "nc-more": "5 to 8 years, 30 to 45 LPA, Go, Postgres" });
    expect(w.ids).toEqual(["nc-role", "nc-client", "nc-dept", "nc-mode", "nc-location", "nc-openings", "nc-jd", "nc-more"]);
    expect(w.ids).not.toContain("nc-agents");
  });

  it("skips the role when the message names it", () => {
    expect(ask("campaign-new", "set up a hiring campaign called Staff Data Engineer", ctx())?.id).toBe("nc-client");
  });

  it("offers real clients and a field for a company that is not one of them, never no client, and the client the message names counts as answered", () => {
    const q = ask("campaign-new", "new campaign called Staff Data Engineer", ctx())!;
    expect(q.options.map((o) => o.label)).not.toContain("No client");
    expect(q.other).toMatchObject({ label: "A new client" });
    expect(ask("campaign-new", "new campaign called Staff Data Engineer for Razorpay", ctx())?.id).toBe("nc-dept");
  });

  describe("with no client open to pick", () => {
    afterEach(() => { resetClients(); });
    it("is asked all the same, as the company's name, and what is typed is a company to add", () => {
      for (const c of getClients().clients) void deleteClient(c.id);
      const none = liveCampaignAsk(() => ({ clients: [client({ id: "c-old", name: "Old Co", status: "inactive" })], rows: [] }));
      const q = none("campaign-new", "new campaign called Staff Data Engineer", ctx())!;
      expect(q.id).toBe("nc-client");
      expect(q.options).toEqual([]);
      expect(q.input).toMatchObject({ placeholder: "Company name", verb: "Continue" });
      expect(q.input?.check?.("a")).toBe("Add the company's name.");
      expect(q.apply(["Orbit Labs"]).answers).toEqual({ client: NEW_CLIENT, newClient: "Orbit Labs" });
    });
  });

  it("offers the workspace's teams, and Other as a field under them for another, in the same question", () => {
    const a = { role: "Staff Data Engineer", client: "none" };
    const q = ask("campaign-new", "x", ctx(a))!;
    expect(q.id).toBe("nc-dept");
    // Other is not an option: there is no second question and no placeholder to answer.
    expect(q.options.map((o) => o.id)).toEqual(["Engineering", "Platform", "Design", "Data", "Product"]);
    expect(q.other).toMatchObject({ placeholder: "e.g. Platform" });
    expect(q.input).toBeUndefined();
    expect(q.apply(["Zz Platform"]).answers).toEqual({ dept: "Zz Platform" });
    const next = ask("campaign-new", "x", ctx({ ...a, ...q.apply(["Zz Platform"]).answers }))!;
    expect(next.id).toBe("nc-mode");
  });

  it("offers cities, with the client's first, and \"no city\" only for a remote role", () => {
    const base = { role: "Staff Data Engineer", client: "c-acme", dept: "Data", mode: "hybrid" };
    const q = ask("campaign-new", "x", ctx(base))!;
    expect(q.id).toBe("nc-location");
    expect(q.input).toBeUndefined();
    expect(q.options.map((o) => o.id)).toEqual(["Bengaluru", "Pune", "Chennai"]);
    expect(q.other).toMatchObject({ placeholder: "e.g. Pune" });
    const remote = ask("campaign-new", "x", ctx({ ...base, mode: "remote" }))!;
    expect(remote.options.map((o) => o.id)).toEqual(["Bengaluru", "Pune", "Chennai", "none"]);
    expect(remote.apply(["none"]).answers).toEqual({ location: "" });
    expect(remote.apply(["Pune"]).answers).toEqual({ location: "Pune" });
  });

  it("asks for the city in words when none is known, and takes a typed city as a tile's id would be", () => {
    const base = { role: "Staff Data Engineer", client: "cl-someone", dept: "Data", mode: "onsite" };
    const bare = liveCampaignAsk(() => ({ clients: [], rows: [] }));
    expect(bare("campaign-new", "x", ctx(base))?.input).toBeTruthy();
    const q = ask("campaign-new", "x", ctx(base))!;
    expect(q.apply(["kochi"]).answers).toEqual({ location: "Kochi" });
    expect(q.apply(["bangalore"]).answers).toEqual({ location: "Bengaluru" });
  });
});

describe("a campaign, from the answers to what the API is sent", () => {
  const owner = "Fn3 Owner";
  const answers = {
    role: "Senior Backend Engineer", client: "c-acme", dept: "Engineering", mode: "hybrid", location: "Pune",
    openings: "2", exp: "5 to 8", comp: "30 to 45", skills: "Go, Postgres at scale",
  };
  const team = [owner, "Fn3 Admin"];
  const idOf = (n: string) => ({ [owner]: "u-own", "Fn3 Admin": "u-adm" })[n];
  /* As it goes over the wire: a field left undefined isn't sent. */
  const sent = (b: ReturnType<typeof createBodyFrom>) => JSON.parse(JSON.stringify(b)) as ReturnType<typeof createBodyFrom>;

  it("sends what was said, the client's fee and hiring manager included", () => {
    const clients = [client({ id: "c-acme", name: "Acme Robotics", fee: "18% of first-year CTC", location: "Bengaluru", contacts: [{ id: "k", name: "Rahul Mehta", title: "", email: "", phone: "", primary: true }] })];
    const d = campaignDraftFor(answers, owner, clients);
    const body = sent(createBodyFrom(rowFromDraft(d, team, 1), idOf));
    expect(body).toMatchObject({
      name: "Senior Backend Engineer", clientId: "c-acme", department: "Engineering", location: "Pune", target: 2,
      priority: "normal", visibility: "team", ownerId: "u-own", memberIds: [],
    });
    // A campaign is on from the moment it is made: the body says nothing about a status.
    expect(body).not.toHaveProperty("status");
    expect(body.setup).toMatchObject({
      workMode: "hybrid", officeDays: 3, locations: ["Pune"], expMin: 5, expMax: 8,
      comp: { currency: "INR", min: 30, max: 45, shown: false }, mustHave: ["Go", "Postgres at scale"],
      seniority: "Senior", hiringManager: "Rahul Mehta", fee: "18% of first-year CTC", screening: "none",
    });
    /* nothing the person wasn't asked */
    expect(body.setup).not.toHaveProperty("notice");
    expect(body.setup).not.toHaveProperty("jd");
  });

  it("sends the company's name for a client that is only named, and a role with no level gets none", () => {
    const d = campaignDraftFor({ ...answers, role: "Backend Engineer", client: NEW_CLIENT, newClient: "Orbit Labs" }, owner, []);
    const body = sent(createBodyFrom(rowFromDraft(d, team, 1), idOf));
    expect(body.clientId).toBeNull();
    expect(body.newClient).toBe("Orbit Labs");
    expect(body.setup).not.toHaveProperty("newClient");
    expect(body.setup).not.toHaveProperty("seniority");
    expect(body.setup).not.toHaveProperty("hiringManager");
  });

  it("leaves a remote role without a place, and an unanswered field out", () => {
    const d = campaignDraftFor({ role: "Support Lead", client: NEW_CLIENT, newClient: "Orbit Labs", dept: "Operations", mode: "remote", location: "", openings: "1", exp: "", comp: "", skills: "" }, owner, []);
    const body = sent(createBodyFrom(rowFromDraft(d, team, 1), idOf));
    expect(body).toMatchObject({ location: "Remote", target: 1 });
    expect(body.setup).toMatchObject({ workMode: "remote", locations: [], mustHave: [], seniority: "Lead" });
    expect(body.setup).not.toHaveProperty("comp");
    expect(body.setup).not.toHaveProperty("expMin");
  });

  it("reads the level off the role's name", () => {
    expect(inferSeniority("Senior Backend Engineer")).toBe("Senior");
    expect(inferSeniority("Junior iOS Developer")).toBe("Junior");
    expect(inferSeniority("Staff Data Engineer")).toBe("Staff");
    expect(inferSeniority("Engineering Manager")).toBe("Lead");
    expect(inferSeniority("Head of Design")).toBe("Director");
    expect(inferSeniority("Backend Engineer")).toBe("");
  });

  it("describes the experience asked for", () => {
    expect(experienceLabel({ expMin: "5", expMax: "8" })).toBe("5 to 8 years");
    expect(experienceLabel({ expMin: "5", expMax: "" })).toBe("5+ years");
    expect(experienceLabel({ expMin: "", expMax: "3" })).toBe("Up to 3 years");
    expect(experienceLabel({ expMin: "1", expMax: "1" })).toBe("1 year");
    expect(experienceLabel({ expMin: "", expMax: "" })).toBe("");
  });

  it("fills the card in the console's order, with nothing invented", () => {
    const d = campaignDraftFor(answers, owner, []);
    expect(campaignFacts(d)).toEqual([
      ["Department", "Engineering"], ["Where", "Hybrid, Pune"], ["Openings", "2 hires"], ["Experience", "5 to 8 years"],
      ["CTC", "₹30–45 LPA"], ["Must-haves", "Go, Postgres at scale"], ["Level", "Senior"], ["Fee", "Not set"],
    ]);
    const bare = campaignDraftFor({ role: "Support", dept: "Operations", mode: "remote", location: "" }, owner, []);
    expect(campaignFacts(bare).find(([k]) => k === "Where")?.[1]).toBe("Remote");
    expect(campaignFacts(bare).find(([k]) => k === "CTC")?.[1]).toBe("Not set");
    expect(campaignFacts(bare).some(([k]) => k === "Level")).toBe(false);
  });

  it("never answers \"no client\" for itself: who it is for is left to be asked, and an answer already given stands", () => {
    expect(liveCampaignAnswers("new campaign", {}).client).toBeUndefined();
    expect(liveCampaignAnswers("new campaign", { client: "a" }).client).toBe("a");
  });
});

describe("what stops a campaign before the server has to", () => {
  const owner = "me";
  const ok = { role: "Backend Engineer", client: NEW_CLIENT, newClient: "Orbit Labs", dept: "Engineering", mode: "hybrid", location: "Pune", openings: "1" };

  it("lets a complete one through", () => {
    expect(campaignChecks(campaignDraftFor(ok, owner, []))).toEqual({ blocking: null });
  });

  it("stops one with no client, in the server's own words: a client picked or a company named is needed", () => {
    expect(campaignChecks(campaignDraftFor({ ...ok, client: "", newClient: "" }, owner, [])).blocking).toBe("Pick the client this campaign is for, or add one.");
    expect(campaignChecks(campaignDraftFor({ ...ok, client: "c-acme", newClient: "" }, owner, [client({ id: "c-acme", name: "Acme Robotics" })]))).toEqual({ blocking: null });
  });

  it("stops it for a name too short or a pay range the wrong way round", () => {
    expect(campaignChecks(campaignDraftFor({ ...ok, role: "B" }, owner, [])).blocking).toBe("Name the role you're hiring for.");
    expect(campaignChecks(campaignDraftFor({ ...ok, comp: "45 to 30" }, owner, [])).blocking).toBe("The top of the range is below the bottom.");
    expect(campaignChecks(campaignDraftFor({ ...ok, exp: "8 to 5" }, owner, [])).blocking).toBe("The most is below the least.");
    expect(campaignChecks(campaignDraftFor({ ...ok, exp: "50" }, owner, [])).blocking).toBe("Years, between 0 and 40.");
  });

  it("doesn't need a place to create a campaign: the requirements decide where to search", () => {
    const noPlace = campaignDraftFor({ ...ok, mode: "onsite", location: "" }, owner, []);
    expect(campaignChecks(noPlace)).toEqual({ blocking: null });
    expect(campaignChecks(campaignDraftFor({ ...ok, mode: "remote", location: "" }, owner, []))).toEqual({ blocking: null });
  });

  it("never asks for an agent or a channel: nothing starts them with real data", () => {
    const d = campaignDraftFor(ok, owner, []);
    expect(d.agents).toEqual([]);
    expect(campaignChecks(d).blocking).toBeNull();
  });
});

describe("a recruiter's campaign", () => {
  afterEach(() => setSession({ role: "admin", name: "Punith S" }));
  const said = "create a campaign called Backend Engineer at Zorblax Studios";

  it("names a company the message names as the client to add, as an admin's does: the server adds it with the campaign", () => {
    const admin = liveCampaignAnswers(said, {});
    expect(admin).toMatchObject({ newClient: "Zorblax Studios", role: "Backend Engineer", client: NEW_CLIENT });
    setSession({ role: "recruiter", name: "Riya K" });
    expect(liveCampaignAnswers(said, {})).toEqual(admin);
  });

  it("is asked about the clients they have and offered a field for a company that is not one of them, never no client", () => {
    setSession({ role: "recruiter", name: "Riya K" });
    const ask = liveCampaignAsk(() => ({ clients: [client({ id: "c-acme", name: "Acme Robotics", status: "active" })], rows: [] }));
    const w = walk(ask, "create a campaign called Backend Engineer", { "nc-location": "", "nc-comp": "", "nc-skills": "" });
    const who = w.asked.find((q) => q.id === "nc-client");
    // The clients the store has (a recruiter's list is the ones they can see), and a field for a company to add.
    expect(who?.options.map((o) => o.id)).not.toContain("none");
    expect(who?.options.map((o) => o.label).join(" ")).not.toMatch(/no client|internal/i);
    expect(who?.other).toMatchObject({ label: "A new client" });
  });

  it("goes over the wire as theirs: they are the owner, and nobody else is named", () => {
    const team = ["Riya K", "Asha Admin"];
    const idOf = (n: string) => ({ "Riya K": "u-riya", "Asha Admin": "u-asha" })[n];
    // A draft kept from a workspace where the person was an admin carried an owner and a team.
    const kept = { ...campaignDraftFor({ role: "Backend Engineer", client: NEW_CLIENT, newClient: "Orbit Labs", dept: "Engineering", mode: "hybrid", location: "Pune" }, "Asha Admin", []), recruiters: ["Riya K"] };
    const body = JSON.parse(JSON.stringify(createBodyFrom(rowFromDraft(ownCampaign(kept, "Riya K"), team, 1), idOf))) as ReturnType<typeof createBodyFrom>;
    expect(body).toMatchObject({ name: "Backend Engineer", ownerId: "u-riya", memberIds: [], visibility: "team" });
  });
});
