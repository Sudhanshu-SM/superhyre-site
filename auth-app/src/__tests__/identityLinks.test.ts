import { describe, expect, it } from "vitest";
import { ApiError, messageOf, retryHint, waitLabel } from "../api/client";
import { taskLink } from "../api/tasks";
import { labelMembers } from "../campaignStore";
import { campaignFromHash, campaignLink, isKnownHash, routeFromHash } from "../nav";
import { isAssigned, isMe } from "../roleStore";

describe("who someone is", () => {
  it("goes by user id when it has one, so a shared or differently written name can't mislead", () => {
    const row = { id: "c-1", owner: "Asha", team: ["Ravi"], ownerId: "u-1", teamIds: ["u-2"] };
    expect(isAssigned(row, { name: "asha@x.dev", userId: "u-1" })).toBe(true);
    expect(isAssigned(row, { name: "Ravi", userId: "u-9" })).toBe(false);
    expect(isAssigned({ id: "c-2", owner: "Asha", team: [] }, "Asha")).toBe(true);
  });

  it("knows the signed-in person only by id", () => {
    expect(isMe("u-1", { role: "recruiter", name: "Asha", userId: "u-1" })).toBe(true);
    expect(isMe("u-2", { role: "recruiter", name: "Asha", userId: "u-1" })).toBe(false);
    expect(isMe(null, { role: "recruiter", name: "Asha", userId: "u-1" })).toBe(false);
  });

  it("tells two members with one name apart in pickers", () => {
    expect(
      labelMembers([
        { userId: "a", fullName: "Riya Shah", email: "riya@a.dev" },
        { userId: "b", fullName: "Riya Shah", email: "riya.s@a.dev" },
        { userId: "c", fullName: null, email: "dev@a.dev" },
      ]).map((m) => m.label),
    ).toEqual(["Riya Shah (riya@a.dev)", "Riya Shah (riya.s@a.dev)", "dev@a.dev"]);
  });
});

describe("links from notifications and tasks", () => {
  it("open the named campaign's page", () => {
    const link = campaignLink("c-1", "shortlisted");
    expect(link).toBe("#/campaign/shortlisted?campaign=c-1");
    expect(campaignFromHash(link)).toBe("c-1");
    expect(isKnownHash(link)).toBe(true);
    expect(routeFromHash(campaignLink("c-1"))).toBe(routeFromHash("#/campaign"));
    expect(campaignLink("c-1", "forms", { id: "f-1", tab: "responses" })).toBe(
      "#/campaign/forms/f-1/responses?campaign=c-1",
    );
  });

  it("turn a task's action into a console link, and ignore anything else", () => {
    expect(taskLink({ kind: "open", path: "/campaign/shortlisted?campaign=c-1" })).toBe(
      "#/campaign/shortlisted?campaign=c-1",
    );
    expect(taskLink({ kind: "open", path: "https://evil.example" } as never)).toBeNull();
    expect(taskLink(null)).toBeNull();
  });
});

describe("when to try again", () => {
  const now = 1_000_000;
  it("says the wait the way a person would", () => {
    expect(waitLabel(now + 40_000, now)).toBe("40s");
    expect(waitLabel(now + 150_000, now)).toBe("3 min");
    expect(waitLabel(now + 2 * 3_600_000, now)).toBe("2 h");
  });

  it("adds it to limit and busy errors, but not when the message already says midnight", () => {
    const busy = new ApiError(429, "rate_limited", "Your team has 3 answers or searches in progress.", {
      retryAt: Date.now() + 15_000,
    });
    expect(retryHint(busy)).toMatch(/^Try again in \d+s\.$/);
    expect(messageOf(busy)).toMatch(/in progress\. Try again in \d+s\.$/);
    const daily = new ApiError(429, "rate_limited", "They reset at midnight UTC.", { retryAt: Date.now() + 3_600_000 });
    expect(retryHint(daily)).toBe("");
    expect(retryHint(new ApiError(400, "bad_request", "No."))).toBe("");
  });
});
