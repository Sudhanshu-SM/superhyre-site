import { describe, expect, it } from "vitest";
import { getClients, saveClient } from "../campaignStore";
import { NEW_CLIENT, newCampaignAnswers, newClientOf } from "../clarify";
import { EMPTY_DRAFT, clientFromDraft } from "../clients";
import { campaignDraftFor, liveCampaignAnswers } from "../liveViews/clientCampaign";

/**
 * Z1-1: after Create on the guided New campaign form with "Add X as a new client" chosen, the card that stays on
 * screen said "Internal hire" under the campaign's name, although the campaign and the client were right in the
 * records. The company is in Clients by then, so the answers must name that client, not none.
 */

const said = "Set up a new campaign for a Data Analyst at Orchid Bank";

describe("the card after Create, for a campaign made with a new client", () => {
  it("names the client that Create added, by its own id, where it said nobody", () => {
    // Before Create: the company is offered as a new client, named by the message.
    const before = liveCampaignAnswers(said, { client: NEW_CLIENT }, getClients().clients);
    expect(newClientOf(before)).toBe("Orchid Bank");
    expect(campaignDraftFor(before, "Punith S", getClients().clients).clientId).toBe("");

    // Create adds it, as a prospect, by its name alone.
    const made = saveClient(clientFromDraft({ ...EMPTY_DRAFT, name: "Orchid Bank", status: "prospect", owner: "Punith S" }, "cl-done"));

    // The same answers, now: the client is that one. (Before the fix newClientOf was "" and clientId "": "Internal hire".)
    const after = liveCampaignAnswers(said, { client: NEW_CLIENT }, getClients().clients);
    expect(after.client).toBe(made.id);
    const d = campaignDraftFor(after, "Punith S", getClients().clients);
    expect(d.clientId).toBe(made.id);
    expect(getClients().clients.find((c) => c.id === d.clientId)?.name).toBe("Orchid Bank");
  });

  it("is not changed for another answer, or for a company that is not in Clients", () => {
    expect(newCampaignAnswers(said, { client: "none" }).client).toBe("none");
    expect(newCampaignAnswers("Set up a campaign for a Data Analyst at Quartz Mills", { client: NEW_CLIENT }).client).toBe(NEW_CLIENT);
  });
});
