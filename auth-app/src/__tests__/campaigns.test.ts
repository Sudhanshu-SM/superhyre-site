import { describe, expect, it } from "vitest";
import {
  AGENT_ROLES, FLEET, ROLE_HUE, RUN_HUE, SCOPED, STEP_AT,
  activeCampaigns, deployPrompt, leadOf, rosterFor, timelineFor,
} from "../orchestrator";

/**
 * Campaigns — the activity bar and the per-campaign timeline.
 *
 * The timeline is only honest because `STEP_AT` exists; before it there were
 * no per-step times and a merged sequence would have had to invent the order
 * two agents' work happened in. Most of what follows pins that fixture to the
 * fleet it describes, because a timestamp that disagrees with its agent is
 * worse than no timestamp at all — it renders, and it renders plausibly.
 */

describe("STEP_AT agrees with the fleet", () => {
  /* THE INVARIANT. The most recent step is by definition when the agent last
     reported, so an agent's latest entry must equal its `seenAgo`. A fixture
     that drifted here would put a step after the agent's own clock. */
  it("ends each agent's steps at its own seenAgo", () => {
    for (const a of FLEET) {
      const key = `${a.id}:${a.step}`;
      expect(STEP_AT[key], `no STEP_AT for ${key}`).toBeDefined();
      expect(STEP_AT[key]).toBe(a.seenAgo);
    }
  });

  it("runs strictly backwards in time across each agent's steps", () => {
    for (const a of FLEET) {
      const times = a.steps
        .map((_, i) => STEP_AT[`${a.id}:${i}`])
        .filter((t): t is number => t !== undefined);
      /* Earlier steps happened longer ago, so the series descends. Equal
         values would mean two steps at the same instant. */
      for (let i = 1; i < times.length; i++) expect(times[i]!).toBeLessThan(times[i - 1]!);
    }
  });

  it("holds a time for every step an agent has reached and none beyond", () => {
    for (const key of Object.keys(STEP_AT)) {
      const [id, idx] = key.split(":");
      const a = FLEET.find((x) => x.id === id);
      expect(a, `STEP_AT key ${key} names no agent`).toBeDefined();
      expect(Number(idx)).toBeLessThanOrEqual(a!.step);
    }
  });
});

describe("timelineFor", () => {
  it("returns events oldest first", () => {
    for (const key of SCOPED) {
      const at = timelineFor(key).map((e) => e.at);
      expect(at).toEqual([...at].sort((a, b) => b - a));
    }
  });

  /* A timeline records what happened, not what is planned — so a step the
     agent has not reached is not an event. */
  it("omits steps that have not been reached", () => {
    for (const key of SCOPED) {
      for (const e of timelineFor(key)) {
        const i = Number(e.id.split(":")[1]);
        expect(i).toBeLessThanOrEqual(e.agent.step);
      }
    }
  });

  it("gives every campaign's own agents and no others", () => {
    for (const key of SCOPED) {
      for (const e of timelineFor(key)) expect(e.agent.campaignId).toBe(key);
    }
  });

  /* At most one step per agent is in flight, and it is the agent's current
     one — `doing` when it is moving, `blocked` when it has halted there. */
  it("marks at most one live step per agent, at that agent's index", () => {
    for (const key of SCOPED) {
      const live = timelineFor(key).filter((e) => e.kind !== "done");
      for (const e of live) {
        expect(Number(e.id.split(":")[1])).toBe(e.agent.step);
        expect(e.agent.state).not.toBe("done");
        const blocked = e.agent.state === "waiting" || e.agent.state === "error";
        expect(e.kind).toBe(blocked ? "blocked" : "doing");
      }
      const byAgent = new Map<string, number>();
      for (const e of live) byAgent.set(e.agent.id, (byAgent.get(e.agent.id) ?? 0) + 1);
      for (const n of byAgent.values()) expect(n).toBe(1);
    }
  });

  /* A finished agent has nothing in flight, so every one of its steps reads
     as done — the same rule `flowFor` follows. */
  it("marks every step of a finished agent as done", () => {
    for (const key of SCOPED) {
      for (const e of timelineFor(key)) {
        if (e.agent.state === "done") expect(e.kind).toBe("done");
      }
    }
  });
});

describe("the activity bar", () => {
  /* A finished campaign cannot change while you are looking at it and cannot
     need you, so it has no business in a bar about what is happening now. */
  it("drops campaigns whose every agent is done", () => {
    for (const c of activeCampaigns("all")) {
      expect(c.agents.some((a) => a.state !== "done")).toBe(true);
    }
    const all = rosterFor("all");
    const finished = all.filter((c) => c.agents.every((a) => a.state === "done"));
    const shown = activeCampaigns("all").map((c) => c.id);
    for (const f of finished) expect(shown).not.toContain(f.id);
  });

  /* ORDERED BY THE NUMBER THE CARD SHOWS. An earlier draft sorted on the
     freshest agent while the card displayed the lead's age, so the rendered
     ages ran 12m, 9m, 41m — an order the reader cannot verify. */
  it("orders by the lead agent's age, which is what the card renders", () => {
    const ages = activeCampaigns("all").map((c) => leadOf(c).seenAgo);
    expect(ages).toEqual([...ages].sort((a, b) => a - b));
  });

  it("leads each campaign with its most urgent agent", () => {
    const RANK = { waiting: 0, error: 1, running: 2, queued: 3, done: 4 } as const;
    for (const c of activeCampaigns("all")) {
      const best = Math.min(...c.agents.map((a) => RANK[a.state]));
      expect(RANK[leadOf(c).state]).toBe(best);
      expect(c.agents.map((a) => a.id)).toContain(leadOf(c).id);
    }
  });
});

describe("the role palette", () => {
  it("gives every pipeline role a hue", () => {
    for (const role of AGENT_ROLES) expect(ROLE_HUE[role]).toBeTruthy();
  });

  /* Colour is WHO and shape is WHAT, which only holds while the two palettes
     are disjoint — a hue doing double duty would make the reader ask whether
     it meant a role or a status. */
  it("shares no hue with the state palette", () => {
    const stateHues = new Set(Object.values(RUN_HUE).filter(Boolean));
    for (const role of AGENT_ROLES) expect(stateHues.has(ROLE_HUE[role])).toBe(false);
  });

  it("gives each role a distinct hue", () => {
    const hues = AGENT_ROLES.map((r) => ROLE_HUE[r]);
    expect(new Set(hues).size).toBe(hues.length);
  });
});

describe("the deploy prompt", () => {
  /* Shipped reading "Deploy a outreach agent". The article depends on the
     role's first sound, so it cannot be a fixed string in a template. */
  it("agrees its article with the role", () => {
    expect(deployPrompt("Outreach", "X")).toContain("Deploy an outreach agent");
    expect(deployPrompt("Sourcing", "X")).toContain("Deploy a sourcing agent");
    expect(deployPrompt("Screening", "X")).toContain("Deploy a screening agent");
  });

  it("names the campaign and leaves the sentence open to continue", () => {
    for (const role of AGENT_ROLES) {
      const p = deployPrompt(role, "Platform SRE");
      expect(p).toContain("Platform SRE");
      expect(p.endsWith("that ")).toBe(true);
    }
  });
});

