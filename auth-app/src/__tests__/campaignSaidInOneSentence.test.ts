import { describe, expect, it } from "vitest";
import { campaignAskIn } from "../clarify";

describe("a request to start a campaign said in one sentence", () => {
  it("reads the role, the company, the city, the years and what they must know, never the whole sentence as the title", () => {
    expect(campaignAskIn("Start a new campaign: Data Engineer for Orbit Labs in Pune, 3 to 6 years, must know SQL, Spark and Airflow")).toMatchObject({
      role: "Data Engineer", client: "Orbit Labs", city: "Pune", exp: "3 to 6", skills: "SQL, Spark and Airflow",
    });
    expect(campaignAskIn("Create a campaign: Data Engineer for Orbit Labs in Pune")).toMatchObject({ role: "Data Engineer", client: "Orbit Labs", city: "Pune" });
  });

  it("takes 'should know' and 'needs to know' as the must-haves too", () => {
    expect(campaignAskIn("create a campaign called Backend Engineer in Pune, should know Go and Kafka")).toMatchObject({ role: "Backend Engineer", skills: "Go and Kafka" });
  });

  it("leaves a field or a team after 'for' in the role", () => {
    expect(campaignAskIn("make a campaign called Product Manager for Payments")).toMatchObject({ role: "Product Manager for Payments", client: null });
    expect(campaignAskIn("make a campaign called Lead for Data Science")).toMatchObject({ client: null });
  });
});
