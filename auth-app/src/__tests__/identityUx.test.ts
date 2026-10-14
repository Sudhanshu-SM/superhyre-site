import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { afterNo, clashView, resolveTeam } from "../setup/lean/Team";

const { sent } = vi.hoisted(() => ({ sent: [] as Array<{ method: string; path: string; body: unknown }> }));
vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  return {
    ApiError,
    LIVE: true,
    api: async (method: string, path: string, body?: unknown) => {
      sent.push({ method, path, body });
      return { organisationId: "o1", role: "recruiter" };
    },
  };
});
const { identityApi } = await import("../api/identity");

/**
 * The people side of the console, second pass: one place where a failure or a confirmation is said, a name
 * that already exists is offered rather than refused, and "No, a different one" really is a different question.
 */

const SRC = resolve(__dirname, "..");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

describe("the one place that says what happened", () => {
  it("is mounted once, by the console, and by no page", () => {
    const mounts = readdirSync(SRC)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => /<Toaster\s*\/>/.test(strip(readFileSync(resolve(SRC, f), "utf8"))));
    expect(mounts).toEqual(["Console.tsx"]);
  });

  it("is where the failure line of a store is drawn too, so there is no second host to forget", () => {
    const toast = readFileSync(resolve(SRC, "toast.tsx"), "utf8");
    expect(toast).toMatch(/useProblem\(\)/);
    expect(readdirSync(SRC)).not.toContain("Problems.tsx");
    expect(strip(readFileSync(resolve(SRC, "App.tsx"), "utf8"))).not.toMatch(/ProblemHost/);
  });
});

describe("\"No, a different one\"", () => {
  it("is Personal for the organisation on their own address, and the question again for a name they typed", () => {
    expect(afterNo("domain")).toBe("personal");
    expect(afterNo("name")).toBe("ask");
  });

  it("never lands on a form that would make a second organisation of the same name", () => {
    // The question it returns to is the one a personal address is asked, not the create view with the name filled in.
    const view = resolveTeam({ invitations: [], domain: null }, 0, { personalEmail: true, domain: null, pending: null }, { team: null });
    expect(view).toEqual({ v: "ask" });
  });
});

describe("an organisation that already exists, found when it was about to be made", () => {
  it("is shown to join or ask to join, by its name", () => {
    const org = { id: "o1", name: "Acme Hire", joinMode: "request" as const };
    expect(clashView(org, "acme hire")).toEqual({ v: "match", org, via: "name", typed: "acme hire" });
  });

  it("is nothing to show when the lookup finds nothing, so the sentence the server wrote stays", () => {
    expect(clashView(null, "Acme Hire")).toBeNull();
  });
});

describe("words a person reads where they join, leave or are asked about their organisation", () => {
  it("never call Personal or an organisation a workspace", () => {
    for (const f of ["SettingsMembers.tsx", "Notifications.tsx", "Settings.tsx", "membership.ts", "ErrorStates.tsx", "Cards.tsx", "App.tsx"]) {
      const text = strip(readFileSync(resolve(SRC, f), "utf8"))
        .split("\n")
        .filter((l) => !/^\s*(import|export)\b.*\bfrom\b/.test(l) && !/^\s*import\s+["']/.test(l))
        .join("\n");
      const said = [
        ...[...text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2] ?? ""),
        ...[...text.matchAll(/>([^<>{}=;]{3,})</g)].map((m) => m[1] ?? ""),
      ];
      for (const raw of said) {
        // What is interpolated is code (`${workspace.name}`), and `x-workspace`, `/v1/workspace/active` and the like
        // are addresses: neither is copy.
        const line = raw.replace(/\$\{[^}]*\}/g, "");
        if (/^[/.\w-]*$/.test(line)) continue;
        expect(line, `${f}: ${line}`).not.toMatch(/\bworkspace\b/i);
      }
    }
  });
});

describe("the name a person gave", () => {
  it("goes with an invite link's accept, so being let in never leaves them shown by their address", async () => {
    sent.length = 0;
    await identityApi.acceptInvite("tok-1", "Lina Linked");
    expect(sent[0]).toMatchObject({ method: "POST", path: "/v1/invites/accept", body: { token: "tok-1", fullName: "Lina Linked" } });
  });

  it("is left out when none was given", async () => {
    sent.length = 0;
    await identityApi.acceptInvite("tok-2");
    expect(sent[0]?.body).toEqual({ token: "tok-2" });
    await identityApi.acceptInvitation("inv-1", "Ana");
    expect(sent[1]).toMatchObject({ path: "/v1/invitations/inv-1/accept", body: { fullName: "Ana" } });
  });
});

describe("what Personal does not have", () => {
  it("is never offered the team's controls: assigning recruiters, and who can see a campaign", () => {
    for (const f of ["CampaignsPage.tsx", "CampaignWorkspace.tsx"]) {
      const line = readFileSync(resolve(SRC, f), "utf8").split("\n").find((l) => l.includes("Assign recruiters"));
      expect(line, `${f} has the menu item`).toBeDefined();
      expect(line, `${f}: gated by the team capability, not by managing`).toMatch(/\b(assigns|teamwork) &&/);
    }
    const make = readFileSync(resolve(SRC, "NewCampaign.tsx"), "utf8");
    expect(make).toMatch(/session\.standing !== "personal" && \(\s*<Field label="Who can see it">/);
  });
});
