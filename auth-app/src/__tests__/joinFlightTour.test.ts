import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLIGHT, FlightController, flightWords, holdFor, initialsOf, LINE_AT, TYPE_EVERY, TYPE_FROM, typedLength } from "../setup/lean/flight";
import { counter, placePopover, presentUpFront, selectorFor, settleStep, stepsFor, TOUR_STEPS, walkLabels, walkSteps, withPagesFound } from "../tour/tourSteps";
import type { TourStep } from "../tour/tourSteps";
import { hasSeen, markPending, markSeen, shouldAutoStart } from "../tour/useTour";
import type { TourStore } from "../tour/useTour";

/** A storage that is a Map, so the flag logic runs without a browser. */
function memory(): TourStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
const throwing: TourStore = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("the arrival scene's clock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const info = { kind: "invite", org: "fn3 Talent Partners", person: "Asha Rao" } as const;

  it("holds the scene about 3 seconds even when the work answered at once", () => {
    const f = new FlightController(() => false);
    f.begin(info);
    f.ready();
    expect(f.getState().phase).toBe("in");
    vi.advanceTimersByTime(FLIGHT.minMs - 1);
    expect(f.getState().phase).toBe("in");
    vi.advanceTimersByTime(1);
    expect(f.getState().phase).toBe("out");
    expect(f.getState().ended).toBe("done");
    // The cross-fade is 250 ms, then the scene is gone.
    vi.advanceTimersByTime(FLIGHT.fadeMs - 1);
    expect(f.getState().phase).toBe("out");
    vi.advanceTimersByTime(1);
    expect(f.getState().phase).toBe("idle");
  });

  it("never holds it longer than the work needs once the minimum has passed", () => {
    const f = new FlightController(() => false);
    f.begin(info);
    vi.advanceTimersByTime(5000);
    // Still on the work at 5 s: the scene waits for it, with no minimum left to wait out.
    expect(f.getState().phase).toBe("in");
    f.ready();
    expect(f.getState().phase).toBe("out");
  });

  it("waits for the page behind to have drawn, but only for a moment", () => {
    const f = new FlightController(() => false);
    let drawn = false;
    f.setSettled(() => drawn);
    f.begin(info);
    f.ready();
    vi.advanceTimersByTime(FLIGHT.minMs);
    expect(f.getState().phase).toBe("in");
    drawn = true;
    vi.advanceTimersByTime(50);
    expect(f.getState().phase).toBe("out");

    // A page that never settles does not hold the person: it lets go after the settle allowance.
    const g = new FlightController(() => false);
    g.setSettled(() => false);
    g.begin(info);
    g.ready();
    vi.advanceTimersByTime(FLIGHT.minMs + FLIGHT.settleMs);
    expect(g.getState().phase).toBe("out");
  });

  it("lets go at once when the work fails, so the calm retry underneath is seen", () => {
    const f = new FlightController(() => false);
    f.begin(info);
    vi.advanceTimersByTime(300);
    f.cancel();
    expect(f.getState()).toMatchObject({ phase: "out", ended: "failed", fadeMs: FLIGHT.failFadeMs });
    vi.advanceTimersByTime(FLIGHT.failFadeMs);
    expect(f.getState().phase).toBe("idle");
  });

  it("is never stuck: it gives up on its own if nothing answers", () => {
    const f = new FlightController(() => false);
    f.begin(info);
    vi.advanceTimersByTime(FLIGHT.giveUpMs);
    expect(f.getState()).toMatchObject({ phase: "out", ended: "failed" });
  });

  it("takes the newer details when asked again, and does not restart", () => {
    const f = new FlightController(() => false);
    f.begin(info);
    const { startedAt, n } = f.getState();
    vi.advanceTimersByTime(1000);
    f.begin({ ...info, org: "Other", logoUrl: "https://x/logo.png" });
    expect(f.getState().startedAt).toBe(startedAt);
    expect(f.getState().n).toBe(n);
    expect(f.getState().info).toMatchObject({ org: "Other", logoUrl: "https://x/logo.png" });
    // An update with nothing in it leaves what is known alone.
    f.update({ logoUrl: null, person: "" });
    expect(f.getState().info?.logoUrl).toBe("https://x/logo.png");
  });

  it("is still, shorter and fades for 600 ms under reduced motion", () => {
    const f = new FlightController(() => true);
    f.begin(info);
    expect(f.getState()).toMatchObject({ reduced: true, fadeMs: FLIGHT.fadeReducedMs });
    expect(holdFor(true)).toBe(FLIGHT.minReducedMs);
    expect(holdFor(false)).toBe(FLIGHT.minMs);
    f.ready();
    vi.advanceTimersByTime(FLIGHT.minReducedMs);
    expect(f.getState().phase).toBe("out");
    expect(f.getState().fadeMs).toBe(600);
    vi.advanceTimersByTime(600);
    expect(f.getState().phase).toBe("idle");
  });
});

describe("what the arrival scene says", () => {
  it("names the organisation and three quiet lines, the first of which says how they got in", () => {
    expect(flightWords("invite")).toEqual({ verb: "Joining", lines: ["Checking your invitation", "Finding your seat", "Opening your workspace"] });
    expect(flightWords("request").lines[0]).toBe("Your request was approved");
    expect(flightWords("create").verb).toBe("Opening");
    for (const k of ["invite", "request", "team", "create"] as const) expect(flightWords(k).lines).toHaveLength(3);
  });

  it("takes initials from a name, or from the front of an address", () => {
    expect(initialsOf("Asha Rao")).toBe("AR");
    expect(initialsOf("  priya  ")).toBe("P");
    expect(initialsOf("Mary Jane Watson")).toBe("MW");
    expect(initialsOf("team@superhyre.com")).toBe("T");
    expect(initialsOf("arnab.jay@x.com")).toBe("AJ");
    expect(initialsOf(null)).toBe("");
  });

  it("types the name in letter by letter, after the chip has set off", () => {
    expect(typedLength("Acme", 0)).toBe(0);
    expect(typedLength("Acme", TYPE_FROM)).toBe(0);
    expect(typedLength("Acme", TYPE_FROM + 1)).toBe(1);
    expect(typedLength("Acme", TYPE_FROM + TYPE_EVERY * 2)).toBe(3);
    expect(typedLength("Acme", 60_000)).toBe(4);
    // The three lines are all there well inside the minimum.
    expect(LINE_AT[2]).toBeLessThan(FLIGHT.minMs);
  });
});

describe("the tour's steps by role", () => {
  const ids = (s: TourStep[]) => s.map((x) => x.id);

  it("gives owners, admins and a personal workspace the Calls step, and a recruiter not", () => {
    for (const who of ["owner", "admin", "personal"] as const) expect(ids(stepsFor(who))).toContain("calls");
    expect(ids(stepsFor("recruiter"))).not.toContain("calls");
    // The Teams step is for the people who manage teams.
    for (const who of ["owner", "admin"] as const) expect(ids(stepsFor(who))).toContain("teams");
    expect(ids(stepsFor("recruiter"))).not.toContain("teams");
    // Everything else is the same for everyone.
    expect(ids(stepsFor("recruiter"))).toEqual(ids(stepsFor("owner")).filter((i) => i !== "calls" && i !== "teams"));
  });

  it("drops the campaign rows up front when no campaign is open, so the total never changes mid-walk", () => {
    const plan = stepsFor("owner");
    const noCampaign = presentUpFront(plan, (q) => !q.includes("nav-campaign-"));
    expect(noCampaign.length).toBe(plan.length - 5);
    expect(ids(noCampaign)).not.toContain("campaign-pipeline");
    // The agent's page is not judged from another page: its steps stay.
    expect(ids(noCampaign)).toContain("composer");
    expect(presentUpFront(plan, () => true)).toEqual(plan);
  });

  it("walks the sidebar first, then the places that are always there, then the agent's page", () => {
    const all = ids(stepsFor("owner"));
    expect(all.slice(0, 7)).toEqual(["home", "agent", "campaigns", "candidates", "calls", "clients", "analytics"]);
    expect(all.indexOf("campaign-overview")).toBeLessThan(all.indexOf("quick-find"));
    expect(all.slice(-6)).toEqual(["composer", "jd", "filters", "ideas", "history", "configuration"]);
    // Only the agent's steps live on another page, and they all say which.
    for (const s of TOUR_STEPS) expect(s.area === "page").toBe(s.route === "agent");
  });

  it("says one short, plain sentence per step, with no dashes or emoji", () => {
    for (const s of TOUR_STEPS) {
      expect(s.text.length).toBeGreaterThan(10);
      expect(s.text.length).toBeLessThanOrEqual(110);
      expect(s.text).not.toMatch(/[–—]|--/);
      expect(s.text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(s.text.match(/\./g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
  });

  it("finds a target by its attribute, then by its fallback", () => {
    expect(selectorFor({ target: "composer" })).toBe('[data-tour="composer"]');
    expect(selectorFor({ target: "history", fallback: ".rail-hist" })).toBe('[data-tour="history"], .rail-hist');
  });

  it("counts from one", () => {
    expect(counter(0, 18)).toBe("1 of 18");
    expect(counter(17, 18)).toBe("18 of 18");
  });
});

describe("skipping a step whose target is not there", () => {
  const plan = stepsFor("owner");
  const present = (gone: string[]) => async (s: TourStep) => !gone.includes(s.id);

  it("drops the absent ones and lands on the next that is there", async () => {
    const r = await settleStep(plan, 3, 1, present(["candidates", "calls"]));
    expect(r.plan.map((s) => s.id)).not.toContain("candidates");
    expect(r.plan.map((s) => s.id)).not.toContain("calls");
    expect(r.plan[r.index!]!.id).toBe("clients");
  });

  it("goes back past an absent step to the one before it", async () => {
    const r = await settleStep(plan, 4, -1, present(["calls", "candidates"]));
    expect(r.plan[r.index!]!.id).toBe("campaigns");
  });

  it("ends the tour when nothing further is there, and stays on the first when going back runs out", async () => {
    const tail = ["composer", "jd", "filters", "ideas", "history", "configuration"];
    const from = plan.findIndex((s) => s.id === "composer");
    expect((await settleStep(plan, from, 1, present(tail))).index).toBe(null);
    expect((await settleStep(plan, 0, 1, async () => false)).index).toBe(null);
    const back = await settleStep(plan, 1, -1, present(["home"]));
    expect(back.plan[back.index!]!.id).toBe("agent");
    // Asked for a step past the end, going forward, it is the end.
    expect((await settleStep(plan, plan.length, 1, present([]))).index).toBe(null);
  });

  it("asks only about steps it has to, in order", async () => {
    const asked: string[] = [];
    await settleStep(plan, 0, 1, async (s) => {
      asked.push(s.id);
      return s.id === "campaigns";
    });
    expect(asked).toEqual(["home", "agent", "campaigns"]);
  });
});

describe("where the card sits", () => {
  const view = { width: 1280, height: 800 };
  const pop = { width: 320, height: 150 };

  it("is beside the target on the side asked for when it fits", () => {
    const sidebarRow = { left: 12, top: 200, width: 220, height: 40 };
    const p = placePopover(sidebarRow, pop, view, "right");
    expect(p.side).toBe("right");
    expect(p.left).toBeGreaterThan(sidebarRow.left + sidebarRow.width);
    expect(p.top).toBeCloseTo(sidebarRow.top + sidebarRow.height / 2 - pop.height / 2, 0);
  });

  it("moves to a side with room, and stays inside the window", () => {
    const farRight = { left: 1100, top: 300, width: 160, height: 40 };
    const p = placePopover(farRight, pop, view, "right");
    expect(p.side).not.toBe("right");
    expect(p.left).toBeGreaterThanOrEqual(12);
    expect(p.left + pop.width).toBeLessThanOrEqual(view.width - 12);
    const topEdge = placePopover({ left: 600, top: 0, width: 100, height: 30 }, pop, view, "top");
    expect(topEdge.side).not.toBe("top");
    expect(topEdge.top).toBeGreaterThanOrEqual(12);
  });

  it("is a sheet at 390 px, on the edge away from the target", () => {
    const phone = { width: 390, height: 780 };
    const high = placePopover({ left: 16, top: 120, width: 300, height: 44 }, pop, phone, "right");
    expect(high.side).toBe("sheet");
    expect(high.top).toBeGreaterThan(phone.height / 2);
    const low = placePopover({ left: 16, top: 640, width: 300, height: 44 }, pop, phone, "right");
    expect(low.side).toBe("sheet");
    expect(low.top).toBe(12);
  });
});

describe("the tour is shown once, to someone new", () => {
  it("starts for a person marked pending who has not seen it", () => {
    const session = memory();
    const local = memory();
    markPending("u1", session);
    expect(shouldAutoStart("u1", local, session)).toBe(true);
  });

  it("never starts for a seeded or returning account, who has no pending mark", () => {
    const session = memory();
    const local = memory();
    expect(shouldAutoStart("demo-owner", local, session)).toBe(false);
    // Another person's mark in the same tab is not theirs.
    markPending("u1", session);
    expect(shouldAutoStart("u2", local, session)).toBe(false);
    expect(shouldAutoStart(null, local, session)).toBe(false);
  });

  it("is spent by finishing or skipping, and stays spent across tabs and sign-ins", () => {
    const session = memory();
    const local = memory();
    markPending("u1", session);
    markSeen("u1", local, session);
    expect(hasSeen("u1", local)).toBe(true);
    expect(shouldAutoStart("u1", local, session)).toBe(false);
    // Marked pending again (joining a second team): still seen, so still not on its own.
    markPending("u1", session);
    expect(shouldAutoStart("u1", local, session)).toBe(false);
    // It is kept per person.
    expect(hasSeen("u2", local)).toBe(false);
    expect(local.data.get("superhyre.tour.seen.u1")).toBe("1");
  });

  it("does not break when storage throws (a private window)", () => {
    expect(() => markPending("u1", throwing)).not.toThrow();
    expect(() => markSeen("u1", throwing, throwing)).not.toThrow();
    expect(hasSeen("u1", throwing)).toBe(false);
    expect(shouldAutoStart("u1", throwing, throwing)).toBe(false);
    expect(shouldAutoStart("u1", null, null)).toBe(false);
  });
});

describe("the tour's numbering over a whole run", () => {
  /** Takes every step the way the tour does: Next until the walk runs out, reporting "n of total" each time. */
  async function run(plan: TourStep[], absent: string[]): Promise<string[]> {
    const missing = new Set<string>();
    const shown: string[] = [];
    let at = await walkSteps(plan, 0, 1, async (s) => !absent.includes(s.id), missing);
    while (at !== null) {
      shown.push(counter(at, plan.length));
      at = await walkSteps(plan, at + 1, 1, async (s) => !absent.includes(s.id), missing);
    }
    return shown;
  }
  const upFront = (who: "owner" | "recruiter", gone: string[]) =>
    presentUpFront(stepsFor(who), (q) => !gone.some((g) => q.includes(`"${g}"`)));

  it("fixes the total before the first step: the agent page's missing steps are out before any is numbered", async () => {
    const plan = withPagesFound(upFront("owner", []), new Set(["composer", "jd", "filters"]));
    expect(plan.length).toBe(stepsFor("owner").length - 3);
    const shown = await run(plan, []);
    const total = plan.length;
    expect(shown[0]).toBe(`1 of ${total}`);
    expect(shown.at(-1)).toBe(`${total} of ${total}`);
    expect(new Set(shown.map((s) => s.split(" of ")[1]))).toEqual(new Set([String(total)]));
    expect(shown).toHaveLength(total);
  });

  it("never repeats or changes a number when a target goes missing during the run, for an owner or a recruiter", async () => {
    for (const who of ["owner", "recruiter"] as const) {
      const plan = upFront(who, []);
      const shown = await run(plan, ["analytics", "ideas"]);
      const nums = shown.map((s) => Number(s.split(" of ")[0]));
      expect(new Set(shown.map((s) => s.split(" of ")[1]))).toEqual(new Set([String(plan.length)]));
      expect(nums).toEqual([...nums].sort((a, b) => a - b));
      expect(new Set(nums).size).toBe(nums.length);
      expect(nums).toHaveLength(plan.length - 2);
    }
  });

  it("goes back over the same list, past a step known to be missing", async () => {
    const plan = upFront("recruiter", []);
    const missing = new Set<string>();
    const absent = ["candidates"];
    const prepare = async (s: TourStep) => !absent.includes(s.id);
    const into = await walkSteps(plan, 3, 1, prepare, missing);
    expect(plan[into!]!.id).toBe("clients");
    expect(plan[(await walkSteps(plan, into! - 1, -1, prepare, missing))!]!.id).toBe("campaigns");
  });
});

describe("the tour's counter reads the one frozen list", () => {
  /** What the tour settles at the start: the sidebar rows there are on that page, then the pages' targets found. */
  const frozen = (who: "owner" | "recruiter", campaignRows: boolean, agentFound: string[]) =>
    withPagesFound(presentUpFront(stepsFor(who), (q) => campaignRows || !q.includes("nav-campaign-")), new Set(agentFound));
  const AGENT = ["composer", "jd", "filters", "ideas", "history", "configuration"];

  it("shows a total equal to the steps walked, from Home and from other pages, ending on N of N", async () => {
    for (const who of ["owner", "recruiter"] as const) {
      for (const campaignRows of [true, false]) {
        for (const found of [AGENT, AGENT.slice(0, 4), AGENT.slice(0, 2)]) {
          const plan = frozen(who, campaignRows, found);
          const labels = await walkLabels(plan);
          expect(labels.length, `${who} ${campaignRows} ${found.length}`).toBe(plan.length);
          expect(labels[0]).toBe(`1 of ${plan.length}`);
          expect(labels.at(-1)).toBe(`${plan.length} of ${plan.length}`);
          expect(new Set(labels.map((l) => l.split(" of ")[1]))).toEqual(new Set([String(plan.length)]));
        }
      }
    }
  });

  it("counts only the real steps: no introduction slide or probe is in the list", () => {
    for (const s of stepsFor("owner")) expect(["nav", "page"]).toContain(s.area);
    expect(stepsFor("owner")[0]!.id).toBe("home");
  });
});
