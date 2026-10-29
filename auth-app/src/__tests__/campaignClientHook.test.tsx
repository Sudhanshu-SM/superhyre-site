import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { blankDraft, rowFromDraft } from "../campaignDraft";
import { TEAM } from "../campaignsData";
import { addCampaignRow, resetCampaignRows, resetClients, setCampaignClientByName, useCampaignClient } from "../campaignStore";

/**
 * The client a campaign is for, as a campaign's own pages read it: its name once it has one, and nothing for a campaign
 * that has none yet (the Requirements dialog then asks, and holds the approval).
 */

function Who({ id }: { id: string }): JSX.Element {
  const c = useCampaignClient(id);
  return <>{c ? `${c.name} (${c.id})` : "nobody"}</>;
}
const who = (id: string) => renderToStaticMarkup(<Who id={id} />);

afterEach(() => { resetClients(); resetCampaignRows(); });

describe("useCampaignClient", () => {
  it("is the client a campaign is for, by name", () => {
    expect(who("backend-snr")).toBe("Razorpay (cl-razorpay)");
  });

  it("is nobody for a campaign that has no client yet, and the client once one is named for it", async () => {
    const row = rowFromDraft({ ...blankDraft("Punith S"), name: "Data Lead" }, TEAM, 1);
    void addCampaignRow(row);
    expect(who(row.id)).toBe("nobody");
    await setCampaignClientByName(row.id, "Orbit Labs");
    expect(who(row.id)).toMatch(/^Orbit Labs \(cl-/);
  });

  it("is nobody for a campaign nobody knows", () => {
    expect(who("not-a-campaign")).toBe("nobody");
  });
});
