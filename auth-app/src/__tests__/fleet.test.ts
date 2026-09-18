import { describe, expect, it } from "vitest";
import {
  AGENT_ROLES, FLEET, RUN_RANK, SCOPED, STEP_NOTE, STRIP_CAP, fleetFor, flowFor, rosterFor,
} from "../orchestrator";
import type { CampaignKey } from "../orchestrator";

/**
 * Fleet — the campaign roster and the per-agent flow behind it.
 *
 * The flow is DERIVED from FLEET rather than authored beside it, and most of
 * what follows pins that derivation: a hand-written campaign history is free
 * to disagree with the roster it sits behind, and nothing in the type system
 * would notice. These assert the relations that make disagreement impossible.
 */

describe("flowFor derives from the fleet", () => {
  it("marks exactly the steps before the agent's index as done", () => {
    for (const key of SCOPED) {
      for (const f of flowFor(key)) {
        const { agent } = f;
        f.steps.forEach((s, i) => {
          if (agent.state === "done") {
            expect(s.state).toBe(i <= agent.step ? "done" : "ahead");
          } else if (i < agent.step) {
            expect(s.state).toBe("done");
          } else if (i === agent.step) {
            expect(s.state).toBe("at");
          } else {
            expect(s.state).toBe("ahead");
          }
        });
      }
    }
  });

  /* A finished run has nothing in flight. Without this, `done` rendered its
     last step as the one currently running — which is how a completed agent
     ends up looking like it is still going, and it is the reason the track's
     marks are keyed off the agent's state at all. */
  it("leaves no step in flight on a finished agent", () => {
    const finished = FLEET.filter((a) => a.state === "done");
    expect(finished.length).toBeGreaterThan(0);
    for (const a of finished) {
      const f = flowFor(a.campaignId).find((x) => x.agent.id === a.id);
      expect(f!.steps.some((s) => s.state === "at")).toBe(false);
    }
  });

  it("gives at most one step in flight per agent", () => {
    for (const key of SCOPED) {
      for (const f of flowFor(key)) {
        expect(f.steps.filter((s) => s.state === "at").length).toBeLessThanOrEqual(1);
      }
    }
  });

  /* A step the agent has not started has nothing honest to say about itself. */
  it("gives no note to a step not reached", () => {
    for (const key of SCOPED) {
      for (const f of flowFor(key)) {
        for (const s of f.steps) {
          if (s.state === "ahead") expect(s.note).toBeUndefined();
        }
      }
    }
  });

  /* The current step's note IS `doing`, not a second copy of it. This is what
     lets STEP_NOTE stay silent about the step in flight — see below. */
  it("reads the current step's note from the agent's own `doing`", () => {
    for (const key of SCOPED) {
      for (const f of flowFor(key)) {
        const at = f.steps.find((s) => s.state === "at");
        if (at) expect(at.note).toBe(f.agent.doing);
      }
    }
  });

  it("names every step the agent declares, in order", () => {
    for (const key of SCOPED) {
      for (const f of flowFor(key)) {
        expect(f.steps.map((s) => s.name)).toEqual([...f.agent.steps]);
      }
    }
  });
});

describe("STEP_NOTE cannot contradict the fleet", () => {
  /* THE CONTRADICTION GUARD. A note at or past the current step would be a
     second statement of what the agent is doing — free to differ from `doing`,
     and rendered in preference to nothing. Keys are only ever for finished
     steps. */
  it("holds notes only for steps an agent has finished", () => {
    for (const key of Object.keys(STEP_NOTE)) {
      const [id, idx] = key.split(":");
      const agent = FLEET.find((a) => a.id === id);
      expect(agent, `STEP_NOTE key ${key} names no agent`).toBeDefined();
      const i = Number(idx);
      expect(Number.isInteger(i)).toBe(true);
      /* A finished agent has completed its last step, so `<=` there and `<`
         everywhere else — the same split flowFor makes. */
      const limit = agent!.state === "done" ? agent!.step + 1 : agent!.step;
      expect(i, `STEP_NOTE ${key} is at or past the step in flight`).toBeLessThan(limit);
      expect(i).toBeLessThan(agent!.steps.length);
    }
  });
});

describe("the campaign roster", () => {
  /* THE FOLD. Every agent in scope lands on exactly one campaign row, so the
     roster cannot quietly drop one — the same principle the overview's totals
     are pinned by. */
  it("accounts for every agent in scope", () => {
    for (const scope of ["all", ...SCOPED] as const) {
      const roster = rosterFor(scope);
      const total = roster.reduce((n, c) => n + c.agents.length, 0);
      expect(total).toBe(fleetFor(scope).length);
      const ids = roster.flatMap((c) => c.agents.map((a) => a.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("puts each campaign's own agents on its row and no others", () => {
    for (const c of rosterFor("all")) {
      expect(c.agents.every((a) => a.campaignId === c.id)).toBe(true);
    }
  });

  /* The campaign's rank is its most urgent agent's rank. `lead` is gone —
     `pickLead` was a max() and every one of its consequences was a bug — so
     urgency is read off the agents directly. */
  it("orders campaigns by their most urgent agent", () => {
    const ranks = rosterFor("all").map(
      (c) => Math.min(...c.agents.map((a) => RUN_RANK[a.state])),
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  /* THE ANATOMY. Three slots, always, in pipeline order — because the only way
     to draw a gap is to render the slot whether or not it is filled. */
  it("gives every campaign all three pipeline slots in order", () => {
    for (const c of rosterFor("all")) {
      expect(c.slots.map((s) => s.role)).toEqual([...AGENT_ROLES]);
    }
  });

  it("fills each slot with that role's agent, or nothing", () => {
    for (const c of rosterFor("all")) {
      for (const slot of c.slots) {
        if (slot.agent) expect(slot.agent.role).toBe(slot.role);
        else expect(c.agents.some((a) => a.role === slot.role)).toBe(false);
      }
      /* Filled slots account for every agent — no agent is dropped by having a
         role outside the anatomy. */
      expect(c.slots.filter((s) => s.agent).length).toBe(c.agents.length);
    }
  });

  /* The differentiating fact: each campaign is missing a DIFFERENT stage, which
     is what makes the three regions structurally distinct. Asserted as "they
     differ", never as "backend-snr is missing Screening" — the fixture may
     change, the property is what matters. */
  it("leaves a gap in a different stage on each campaign", () => {
    const gaps = rosterFor("all").map(
      (c) => c.slots.filter((s) => !s.agent).map((s) => s.role).join("+"),
    );
    expect(new Set(gaps).size).toBe(gaps.length);
  });

  /* ── THE SPLIT IS THE POINT, AND IT IS WHY THIS TEST CHANGED ──
     `needsYou` used to count `waiting || error`, which is why 3 of 3 campaigns
     were loud: every campaign contains one of either, so the number was a
     constant wearing the loudest colour on the surface. It now counts
     `waiting` alone — a human is the blocker — and `stopped` carries `error`,
     which needs a fix rather than permission. Asserted as two disjoint counts
     that sum to the blocked total, so neither can silently absorb the other. */
  it("splits blocked agents into waiting and stopped, disjointly", () => {
    for (const c of rosterFor("all")) {
      expect(c.needsYou).toBe(c.agents.filter((a) => a.state === "waiting").length);
      expect(c.stopped).toBe(c.agents.filter((a) => a.state === "error").length);
      const blocked = c.agents.filter(
        (a) => a.state === "waiting" || a.state === "error",
      ).length;
      expect(c.needsYou + c.stopped).toBe(blocked);
      expect(c.needsYou + c.stopped).toBeLessThanOrEqual(c.agents.length);
    }
  });

  /* The cap makes its own precondition true: `rosterFor` sorts by urgency, so
     truncating at STRIP_CAP can only drop campaigns that are less urgent than
     the ones kept. Asserted as the ordering property rather than by naming a
     number, so it holds if the cap changes. */
  it("keeps the most urgent campaigns when capped", () => {
    const roster = rosterFor("all");
    const rank = (c: (typeof roster)[number]) =>
      Math.min(...c.agents.map((a) => RUN_RANK[a.state]));
    const kept = roster.slice(0, STRIP_CAP).map(rank);
    const dropped = roster.slice(STRIP_CAP).map(rank);
    for (const d of dropped) {
      for (const k of kept) expect(k).toBeLessThanOrEqual(d);
    }
  });

  /* A campaign with nothing deployed has no answer to "what are my agents
     doing", so it is absent rather than listed empty. */
  it("omits campaigns with no agents", () => {
    for (const c of rosterFor("all")) expect(c.agents.length).toBeGreaterThan(0);
  });

  it("scopes to a single campaign when asked", () => {
    for (const key of SCOPED) {
      const roster = rosterFor(key);
      if (roster.length === 0) continue;
      expect(roster).toHaveLength(1);
      expect(roster[0]!.id).toBe(key as CampaignKey);
    }
  });
});
