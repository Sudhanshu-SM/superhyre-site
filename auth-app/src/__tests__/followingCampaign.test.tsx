import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCampaignAgents } from "../api/campaigns";
import type { ContactPerson, ContactsStatus } from "../contactsModel";
import { recount } from "../contactsModel";
import type { Session } from "../roleStore";

/**
 * A campaign shared with the whole organisation can be followed by a recruiter who is not on it: they see it and work
 * its board, and the brief and what spends credits (the role spec, a search, ranking again, contact lookups) is the
 * people on it. The console draws no control the server would refuse, and says why once, in one line.
 */

const { server, may } = vi.hoisted(() => ({ server: { status: null as unknown }, may: { on: true } }));
vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    LIVE: true,
    API_URL: "http://api.test",
    ApiError,
    messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
    api: async (method: string) => (method === "GET" ? server.status : undefined),
    onWrite: () => () => {},
  };
});
vi.mock("../problems", () => ({ reportProblem: () => {} }));
vi.mock("../campaignRights", async (original) => ({
  ...(await original<typeof import("../campaignRights")>()),
  useMayChangeCampaign: () => may.on,
}));

const { FOLLOWING_LINE, FOLLOWING_LINE_ADMIN, mayChangeCampaign } = await import("../campaignRights");
const { setSession } = await import("../roleStore");
const { AgentsPanel } = await import("../OverviewPanel");
const store = await import("../contactsFetch");
const { ContactCell, ContactSideLine, ContactsMenu } = await import("../ContactsFetch");

const recruiter: Session = { role: "recruiter", standing: "recruiter", name: "Ravi", userId: "u-ravi" };
const admin: Session = { role: "admin", standing: "admin", name: "Ada", userId: "u-ada" };
const row = (over: Record<string, unknown> = {}) => ({
  id: "c1", owner: "Ana", team: ["Ana"], ownerId: "u-ana", teamIds: ["u-ana"], visibility: "org" as const, ...over,
});

describe("who may change a campaign they can see", () => {
  it("is anyone who owns it or is on its team, and an admin or the owner of the organisation", () => {
    expect(mayChangeCampaign(recruiter, row({ ownerId: "u-ravi" }))).toBe(true);
    expect(mayChangeCampaign(recruiter, row({ teamIds: ["u-ana", "u-ravi"] }))).toBe(true);
    expect(mayChangeCampaign(admin, row())).toBe(true);
    // A Personal workspace is its person's: they are an admin of it.
    expect(mayChangeCampaign({ role: "admin", standing: "personal", name: "Solo", userId: "u-solo" }, row())).toBe(true);
  });

  it("is not a recruiter who can see a campaign shared with the organisation and is not on it", () => {
    expect(mayChangeCampaign(recruiter, row())).toBe(false);
    expect(mayChangeCampaign(recruiter, row({ ownerId: null, teamIds: [] }))).toBe(false);
  });

  it("leaves a campaign that has not loaded yet to the server, which says the same thing", () => {
    expect(mayChangeCampaign(recruiter, undefined)).toBe(true);
  });

  it("says it in one calm line, about what they can do and who to ask", () => {
    expect(FOLLOWING_LINE).toBe(
      "You can follow this campaign. Ask its owner or the team lead to add you to change the role spec or start a search.",
    );
  });
});

const agents = (over: Partial<ApiCampaignAgents> = {}): ApiCampaignAgents => ({
  status: "active",
  approvedSpec: true,
  sourcing: { state: "idle", run: null, watch: null, lastRunAt: null },
  outreach: { state: "idle", waiting: 0, sending: 0 },
  ...over,
});
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("the agents panel of a campaign someone follows", () => {
  it("offers the search to the people on it, and the board's own review to everyone", () => {
    const html = renderToStaticMarkup(<AgentsPanel agents={agents()} onAction={() => {}} />);
    expect(html).toContain("Find people");
    expect(html).toContain("Review");
    expect(html).not.toContain(FOLLOWING_LINE);
  });

  it("says what is going on and says once that it is not theirs to start, with no search or spec button", () => {
    const html = renderToStaticMarkup(<AgentsPanel agents={agents()} onAction={() => {}} canChange={false} />);
    expect(html).not.toContain("Find people");
    expect(html).toContain("Review");
    expect(html.split(FOLLOWING_LINE_ADMIN.replace(/'/g, "&#x27;"))).toHaveLength(2);
    setSession(recruiter);
    expect(renderToStaticMarkup(<AgentsPanel agents={agents()} onAction={() => {}} canChange={false} />).split(FOLLOWING_LINE)).toHaveLength(2);
    setSession(admin);
    const waiting = renderToStaticMarkup(
      <AgentsPanel agents={agents({ approvedSpec: false })} onAction={() => {}} canChange={false} />,
    );
    expect(waiting).not.toContain("Review the role spec");
    expect(text(waiting)).toContain("Waiting for an approved role spec");
  });

  it("does not offer to stop or resume a watch they are not on the campaign for", () => {
    const watching = agents({
      sourcing: {
        state: "watching",
        run: null,
        lastRunAt: null,
        watch: { id: "w1", summary: "x", stop: { profiles: 20 }, found: 3, nextRunAt: null },
      },
    });
    expect(renderToStaticMarkup(<AgentsPanel agents={watching} onAction={() => {}} />)).toContain("Stop");
    expect(renderToStaticMarkup(<AgentsPanel agents={watching} onAction={() => {}} canChange={false} />)).not.toContain(
      ">Stop<",
    );
  });
});

const person = (n: number, over: Partial<ContactPerson> = {}): ContactPerson => ({
  campaignCandidateId: `cc-${n}`, candidateId: `cand-${n}`, personId: `p-${n}`, stage: "shortlisted",
  email: "none", phone: "none", lookupable: true, ...over,
});
const status = (people: ContactPerson[]): ContactsStatus => ({
  campaignId: "c1", closed: false, creditsLeft: 38, perRequest: 50, available: { email: true, phone: true },
  people, counts: recount(people),
});

describe("contact details on a campaign someone follows", () => {
  beforeEach(async () => {
    store.resetContacts();
    server.status = status([person(1)]);
    await store.load("c1");
  });

  it("are asked for by the people on the campaign: a button on the row and the table's menu", () => {
    may.on = true;
    expect(renderToStaticMarkup(<ContactCell campaignId="c1" id="cc-1" name="Asha Rao" />)).toContain("Get email");
    expect(
      renderToStaticMarkup(<ContactsMenu campaignId="c1" everyone={["cc-1"]} picked={new Set()} />),
    ).toContain("Get contact details");
  });

  it("are read, not asked for, by someone who follows it: what is found stays, nothing is offered", () => {
    may.on = false;
    const cell = renderToStaticMarkup(<ContactCell campaignId="c1" id="cc-1" name="Asha Rao" />);
    expect(cell).not.toContain("Get email");
    expect(cell).not.toContain("Get phone");
    expect(text(cell)).toContain("No contact details yet");
    const side = renderToStaticMarkup(
      <ContactSideLine campaignId="c1" kind="email" ccId="cc-1" name="Asha Rao" />,
    );
    expect(side).not.toContain("Get email");
    expect(
      renderToStaticMarkup(<ContactsMenu campaignId="c1" everyone={["cc-1"]} picked={new Set()} />),
    ).toBe("");
    may.on = true;
  });
});
