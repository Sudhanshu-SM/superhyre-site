import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PipelinePerson } from "../campaign";
import { notContactedYet, shortlistSplit, shortlistTip } from "../shortlistWaiting";

/**
 * "3 still waiting to be contacted: Farid, Gina, Asha" named two people on the do-not-contact list
 * while the Outreach review held one draft. Who is left to reach is the people the one rule allows.
 */

const person = (name: string, stage: PipelinePerson["stage"], doNotContact = false) =>
  ({ name, stage, step: null, doNotContact }) as PipelinePerson;

const board = [
  person("Farid Khan", "shortlisted"),
  person("Gina Mehta", "shortlisted", true),
  person("Asha Verma", "shortlisted", true),
  person("Bimal Roy", "outreach"),
  person("Esha Kapoor", "passed"),
];

describe("who is left to contact on the shortlist", () => {
  it("leaves out people on the do-not-contact list, and says how many are held back", () => {
    const { shortlisted, toContact, listed } = shortlistSplit(board);
    expect(shortlisted.map((p) => p.name)).toEqual(["Farid Khan", "Gina Mehta", "Asha Verma"]);
    expect(toContact.map((p) => p.name)).toEqual(["Farid Khan"]);
    expect(listed.map((p) => p.name)).toEqual(["Gina Mehta", "Asha Verma"]);
  });

  it("names only the person who can be contacted in the funnel caption", () => {
    const { toContact, listed } = shortlistSplit(board);
    const tip = shortlistTip(5, toContact.length, "Farid", listed.length);
    expect(tip).toBe("5 shortlisted in all, 1 still waiting to be contacted: Farid, 2 on the do-not-contact list");
    expect(tip).not.toMatch(/Gina|Asha/);
  });

  it("says nobody is waiting when everyone shortlisted is on the list", () => {
    const all = [person("Gina Mehta", "shortlisted", true), person("Asha Verma", "shortlisted", true)];
    const { toContact, listed } = shortlistSplit(all);
    expect(shortlistTip(2, toContact.length, "", listed.length)).toBe(
      "2 shortlisted in all, 0 still waiting to be contacted, 2 on the do-not-contact list",
    );
    expect(notContactedYet(all)).toBe(0);
  });

  it("is the whole shortlist when nobody is listed", () => {
    const open = [person("Farid Khan", "shortlisted"), person("Hana Roy", "shortlisted")];
    expect(notContactedYet(open)).toBe(2);
    expect(shortlistTip(2, 2, "Farid, Hana", 0)).toBe("2 shortlisted in all, 2 still waiting to be contacted: Farid, Hana");
    expect(shortlistTip(0, 0, "", 0)).toBe("Nobody is shortlisted yet");
  });

  it("counts not-contacted-yet for the Shortlisted header without them", () => {
    expect(notContactedYet(board)).toBe(1);
  });
});

describe("the pages use it", () => {
  const page = readFileSync(new URL("../CampaignWorkspace.tsx", import.meta.url), "utf8");

  it("the Overview caption and the Shortlisted header do not count the shortlist stage whole", () => {
    expect(page).toContain("shortlistTip(");
    expect(page).toContain("notContactedYet(");
    // The old inline sentence counted every shortlisted person as waiting.
    expect(page).not.toMatch(/\$\{shortlisted\.length\} still waiting to be contacted/);
  });
});
