import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { decidedLine } from "../api/forms";
import { LiveTurnBody } from "../LiveTurn";
import { newTurn } from "../liveChat";
import { adviceFor, stuckAside, waitedLabel } from "../liveReports";
import { reusableDraft } from "../formsStore";
import { act } from "../moments";
import type { MomentCtx } from "../moments";
import { queryFromSaid, selectAllLabel, standsOn } from "../liveViews/rediscoverLogic";
import { compareVerdict } from "../liveViews/compareLogic";
import { outcomeOf } from "../agentCards/outcome";
import type { Approval } from "../liveChat";

/**
 * The chat's views and forms, round 5 (D10 to D20): what a button does, who a card names, what a form
 * wizard reuses, and the words that used to send people elsewhere.
 */

const specState = vi.hoisted(() => ({ value: { ready: true, latest: null, approved: null, drafting: false, failed: true, reload: async () => {} } as Record<string, unknown> }));
vi.mock("../specDraft", () => ({ useCampaignSpec: () => specState.value }));

describe("a button that names its action does it (D16)", () => {
  const base = { seed: () => {} } as Pick<MomentCtx, "seed" | "send">;

  it("sends the words as a message where it can, and says which campaign it is about", () => {
    const sent: Array<[string, string | undefined]> = [];
    const seeded: string[] = [];
    act({ seed: (t) => seeded.push(t), send: (t, c) => sent.push([t, c]) }, "Follow up with everyone on Android who hasn't replied", "c1");
    expect(sent).toEqual([["Follow up with everyone on Android who hasn't replied", "c1"]]);
    expect(seeded).toEqual([]);
  });

  it("leaves the words in the composer where nothing can be sent", () => {
    const seeded: string[] = [];
    act({ ...base, seed: (t) => seeded.push(t) }, "Show me a report for Android");
    expect(seeded).toEqual(["Show me a report for Android"]);
  });

  it("says the number right: one candidate waiting is not 'the 1 candidates'", () => {
    const stuck = [{ kind: "replied", n: 1, longest: 2, who: "Asha Verma" }] as unknown as Parameters<typeof adviceFor>[1];
    const reach = { found: 90, shortlisted: 30, outreach: 20, replied: 6, interviewing: 3, hired: 1 };
    const chain = [
      { id: "found", label: "Found", n: 90 }, { id: "shortlisted", label: "Shortlisted", n: 30 },
      { id: "outreach", label: "Contacted", n: 20 }, { id: "replied", label: "Replied", n: 6 },
      { id: "interviewing", label: "Interviewing", n: 3 }, { id: "hired", label: "Hired", n: 1 },
    ];
    const drop = { from: chain[2], to: chain[4], gap: 17 } as unknown as Parameters<typeof adviceFor>[0];
    const a = adviceFor(drop, stuck, "Android", reach);
    const answer = a.acts.find((x) => x.primary);
    expect(answer?.seed).toBe("Draft an answer to the candidate waiting on me on Android");
    expect(answer?.seed).not.toMatch(/1 candidates/);
  });
});

describe("a person is named in full on a card (D15)", () => {
  it("does not shorten 'Imp 64' or two people who share a first name to one word", () => {
    expect(stuckAside({ n: 1, longest: 1, who: "Imp 64" })).toBe(`Imp 64, ${waitedLabel(1)}`);
    expect(stuckAside({ n: 3, longest: 2, who: "Apollosync Esha" })).toBe("Longest: Apollosync Esha, for 2 days");
    const v = compareVerdict(
      [
        { id: "a", name: "Karthik Bose", totalYears: 7, avgTenure: 2 },
        { id: "b", name: "Karthik Rao", totalYears: 4, avgTenure: 2 },
      ],
      { name: "Android", criteria: ["Kotlin"], meets: { a: [true], b: [false] }, evidence: {} },
    );
    expect(v.line).toContain("Karthik Bose meets 1 of 1");
    expect(v.line).toContain("Karthik Rao misses Kotlin");
  });
});

describe("rediscover (D17)", () => {
  it("reads the skills when the request ends with which campaign it is for", () => {
    expect(queryFromSaid("anyone from past searches for Go and Kafka for the Machine Learning Engineer campaign")).toBe("Go Kafka");
    expect(queryFromSaid("anyone from past searches for Go and Kafka for the Machine Learning Engineer campaign", "Machine Learning Engineer")).toBe("Go Kafka");
    expect(queryFromSaid("Anyone from past searches for Kotlin?")).toBe("Kotlin");
    expect(queryFromSaid("who has worked with Postgres on the Data Engineer role")).toBe("Postgres");
  });

  it("says where someone stands once added, and does not offer 'Select all 1'", () => {
    expect(standsOn("Machine Learning Engineer")).toBe("On Machine Learning Engineer");
    expect(selectAllLabel(1)).toBeNull();
    expect(selectAllLabel(0)).toBeNull();
    expect(selectAllLabel(5)).toBe("Select all 5");
  });
});

describe("a form's applicants (D10, D11, D20)", () => {
  it("says who an applicant was linked to, and that someone already on the campaign stays where they are", () => {
    expect(decidedLine("add", 1, { name: "Nomatch Dev", campaignCandidateId: "cc1" })).toBe(
      "Linked to Nomatch Dev, who is already on this campaign",
    );
    expect(decidedLine("add", 1, { name: "Nomatch Dev", campaignCandidateId: null })).toBe(
      "Linked to Nomatch Dev and added to the shortlist",
    );
    expect(decidedLine("add", 1)).toBe("Added to the shortlist");
    expect(decidedLine("add", 3)).toBe("3 added to the shortlist");
    expect(decidedLine("pass", 1)).toBe("Rejected");
    expect(decidedLine("pass", 2)).toBe("Rejected 2");
  });

  it("writes a campaign's earlier chat draft over only when it is still a draft, unanswered and untouched", () => {
    const wrote = 1_000_000;
    expect(reusableDraft({ updatedAt: wrote + 1_000 }, { status: "draft", responses: 0 }, wrote)).toBe(true);
    // Edited since the chat wrote it.
    expect(reusableDraft({ updatedAt: wrote + 10 * 60_000 }, { status: "draft", responses: 0 }, wrote)).toBe(false);
    // Published, or answered.
    expect(reusableDraft({ updatedAt: wrote }, { status: "live", responses: 0 }, wrote)).toBe(false);
    expect(reusableDraft({ updatedAt: wrote }, { status: "draft", responses: 2 }, wrote)).toBe(false);
    expect(reusableDraft({}, { status: "draft", responses: 0 }, wrote)).toBe(false);
  });
});

describe("words that sent people elsewhere (D13, D14, D18)", () => {
  const approval = (over: Partial<Approval>): Approval => ({
    seq: 1, action: "start_watch", summary: "", campaignName: null, people: [], notes: [], decided: null, ...over,
  } as unknown as Approval);

  it("says a watch started once, with one full stop", () => {
    const a = approval({
      decided: {
        decision: "approve",
        outcome: { summary: "Started keeping watch for Senior Backend Engineer: every 4 hours, 5 at a time, until 10 people.." },
      },
    } as Partial<Approval>);
    expect(outcomeOf(a)).toBe("Started keeping watch for Senior Backend Engineer: every 4 hours, 5 at a time, until 10 people.");
    expect(outcomeOf(a)).not.toMatch(/Watch started/);
  });

  it("puts the choices of a question on one card, with the heading once and a Continue", () => {
    const q = {
      kind: "client", runId: "r1", seq: 4,
      text: "Which client is this for?",
      choices: [
        { id: "c1", name: "Acme Fintech", text: "The client is Acme Fintech" },
        { id: "new", name: "A new client", text: "The client is {value}, who isn't in Clients yet", input: { label: "Client name" } },
        { id: "none", name: "No client", text: "No client for this one", quiet: true },
      ],
    };
    const html = renderToStaticMarkup(
      <LiveTurnBody turn={{ ...newTurn("t", "notes"), status: "done", reply: "Which client is this for?", questions: [q] }} onAnswer={() => {}} />,
    );
    // The agent's line that said the same is not shown beside the card's heading.
    expect(html.match(/Which client is this for\?/g)).toHaveLength(1);
    for (const label of ["Acme Fintech", "A new client"]) expect(html).toContain(label);
    expect(html).toContain(">Continue</button>");
    // "No client" is a way out beside Continue, not a third option.
    expect(html).toMatch(/class="ch-skip"[^>]*>No client</);
    // The name is asked for only once "A new client" is picked.
    expect(html).not.toContain("Client name");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue/);
  });

  it("offers a spec that did not come through a retry that needs nothing pasted", async () => {
    const { RoleSpecPanel } = await import("../RoleSpecPanel");
    const html = renderToStaticMarkup(<RoleSpecPanel campaignId="c1" />);
    expect(html).toContain("I can try again from what is saved");
    expect(html).toContain(">Try again</button>");
    expect(html).not.toContain("Paste the job description to try again");
  });
});
