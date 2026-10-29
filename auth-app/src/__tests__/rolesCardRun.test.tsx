import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The roles card in the chat, run: the roles the paperclip handed it are read, asked about and made into campaigns, and a card drawn again
 * on the same add (the chat was left and came back) must not read them again and make the campaigns twice. The console has no DOM to mount
 * a component in, so it is drawn with the tree runtime of hookTree.ts, which runs the effects. The server is in the test's hands: every
 * call is answered here. The flow itself (read, ask, make) is the rules in jdIntake.ts, tested there.
 */

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), ...(await import("./hookTree")).hooks }));

const net = vi.hoisted(() => ({
  /** Calls made, by what they were for. */
  sheets: [] as string[],
  reads: [] as string[],
  made: [] as Array<{ name: string }>,
  /** What a sheet of roles answers; and whether making a campaign answers at all (a held one never does). */
  roles: [] as Array<{ title: string; jd: string; hints: Record<string, string>; row: number }>,
  holdSheet: false,
  holdAfter: Infinity,
  /** Reading a role fails, in a way that is not tried again. */
  failReads: false,
}));
const FACTS = vi.hoisted(() => ({
  title: "Backend Engineer", client: "Acme", department: null, seniority: null, employment: "full-time", workMode: "remote", locations: [] as string[],
  openings: 1, expMin: 3, expMax: 6, comp: { currency: "INR", min: 20, max: 30 }, notice: "Up to 30 days", mustHave: ["Go"], niceToHave: [] as string[], education: null,
}));
const WORLD = vi.hoisted(() => ({ clients: [{ id: "cl1", name: "Acme", status: "active" }], team: [] as string[], session: { role: "admin", name: "Asha", userId: "u1" } }));

vi.mock("../api/client", () => {
  class ApiError extends Error {
    status = 0;
    code = "";
  }
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => null, messageOf: (e: Error) => e.message, LONG_REQUEST_TIMEOUT_MS: 170_000 };
});
vi.mock("../api/jdIntake", async () => {
  const { ApiError } = await import("../api/client");
  return {
    jdApi: {
      sheetFile: (file: File) => {
        net.sheets.push(file.name);
        return net.holdSheet ? new Promise(() => undefined) : Promise.resolve({ roles: net.roles, skipped: 0 });
      },
      sheetLink: async () => ({ roles: [], skipped: 0 }),
      read: async (jd: string) => {
        net.reads.push(jd);
        // (The mock of ../api/client below takes a message alone.)
        if (net.failReads) throw new (ApiError as unknown as new (message: string) => Error)("That description could not be read.");
        return { jd, facts: { ...FACTS, title: jd.split(".")[0] } };
      },
    },
  };
});
vi.mock("../api/agent", () => ({ specApi: { draft: async () => undefined }, attachmentApi: { read: async () => ({ text: "" }) } }));
vi.mock("../campaignStore", () => ({
  useClients: () => ({ clients: WORLD.clients }),
  useTeam: () => WORLD.team,
  memberName: () => undefined,
  // A campaign is saved when the server says so: the ones after `holdAfter` never are.
  addCampaignRow: (row: { name: string }) => {
    net.made.push(row);
    return net.made.length > net.holdAfter ? new Promise<boolean>(() => undefined) : Promise.resolve(true);
  },
  resolveCampaignId: (id: string) => id,
  saveClient: () => ({ id: "x" }),
  setCampaignClient: () => undefined,
}));
vi.mock("../roleStore", async (orig) => ({ ...(await orig<typeof import("../roleStore")>()), useSession: () => WORLD.session }));
vi.mock("../BatchReview", () => ({ BatchReview: () => null }));

const { mount, find, textOf, settle } = await import("./hookTree");
const { default: ImportView } = await import("../liveViews/Import");
const { stashImportFor, peekImportFor, finishedImport } = await import("../importFiles");
type Mounted = import("./hookTree").Mounted;

const said = (m: Mounted): string => textOf(m.tree).replace(/\s+/g, " ");
const draw = (id: string): Mounted =>
  mount(<ImportView card={{ kind: "view", key: `view:campaign-import:-:${id}`, view: "campaign-import", campaignId: null, campaignName: null, query: `adding:${id}` } as never} ctx={{ onGrow: () => undefined } as never} />);
const roles = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Role ${i + 1}`, jd: `Role ${i + 1}. We are hiring. ${"Needs Go and Postgres. ".repeat(4)}`, hints: {}, row: i + 2 }));

let n = 0;
/** An add id nobody has used, so the roles one test kept are not found by another. */
const fresh = (): string => `add-role${String(++n).padStart(5, "0")}`;

beforeEach(() => {
  net.sheets.length = 0;
  net.reads.length = 0;
  net.made.length = 0;
  net.roles = roles(2);
  net.holdSheet = false;
  net.holdAfter = Infinity;
  net.failReads = false;
});

describe("the roles card the paperclip opened", () => {
  const kept = () => {
    const id = fresh();
    stashImportFor(id, { files: [new File(["x"], "roles.xlsx")] });
    return id;
  };

  it("makes a campaign for each role its sheet holds, reading each once, and says how many it made", async () => {
    const id = kept();
    const m = draw(id);
    await settle(16);
    expect(net.sheets).toEqual(["roles.xlsx"]);
    expect(net.reads).toHaveLength(2);
    expect(net.made.map((r) => r.name)).toEqual(["Role 1", "Role 2"]);
    expect(said(m)).toContain("2 campaigns created. Approve their requirements to start finding people.");
    m.unmount();
  });

  it("lets go of its roles as soon as a campaign is made from them, and when it comes to its end: a card drawn again does not read them and make them twice", async () => {
    const id = kept();
    const first = draw(id);
    await settle(16);
    expect(net.made).toHaveLength(2);
    // Let go, and what it made is kept to say so.
    expect(peekImportFor(id)).toBeNull();
    expect(finishedImport(id)).toEqual({ made: 2, left: 0 });
    first.unmount();
    const again = draw(id);
    await settle(16);
    // Nothing is read or made a second time, and nobody is told the page was reloaded.
    expect(net.sheets).toEqual(["roles.xlsx"]);
    expect(net.reads).toHaveLength(2);
    expect(net.made).toHaveLength(2);
    const text = said(again);
    expect(text).toContain("2 campaigns created. Approve their requirements to start finding people.");
    expect(text).toContain("See Campaigns");
    expect(text).not.toContain("reloaded");
    expect(text).not.toContain("Making campaigns from these roles only.");
    again.unmount();
  });

  it("lets go as soon as the first campaign is made, not only at the end: one made and the rest still to be, and a card drawn again does not start over", async () => {
    const id = kept();
    // The server saves the first campaign and never answers for the second.
    net.holdAfter = 1;
    const first = draw(id);
    await settle(16);
    expect(net.made).toHaveLength(2);
    expect(peekImportFor(id)).toBeNull();
    expect(finishedImport(id)).toEqual({ made: 1, left: 1 });
    first.unmount();
    const again = draw(id);
    await settle(16);
    expect(net.sheets).toHaveLength(1);
    expect(net.made).toHaveLength(2);
    // It says the roles that are left were not made, and not that all is done.
    const text = said(again);
    expect(text).toContain("1 campaign created, 1 role left. Add it again with the paperclip.");
    expect(text).not.toContain("Approve its requirements");
    again.unmount();
  });

  it("keeps the roles until something is made from them: a card drawn again before then reads them again, as it did", async () => {
    const id = kept();
    net.holdSheet = true;
    const first = draw(id);
    await settle();
    expect(net.sheets).toEqual(["roles.xlsx"]);
    expect(peekImportFor(id)?.files).toHaveLength(1);
    first.unmount();
    const again = draw(id);
    await settle();
    expect(net.sheets).toEqual(["roles.xlsx", "roles.xlsx"]);
    expect(finishedImport(id)).toBeNull();
    expect(net.made).toHaveLength(0);
    again.unmount();
  });

  it("says nothing was created when it came to its end with nothing made, and does not read the roles again either", async () => {
    const id = kept();
    // The one role cannot be read, and the person lets it go: the card has come to its end with nothing made.
    net.roles = roles(1);
    net.failReads = true;
    const first = draw(id);
    await settle(16);
    expect(peekImportFor(id)?.files).toHaveLength(1);
    const skip = find(first.tree, (el) => el.type === "button" && textOf(el.props.children) === "Skip this one");
    expect(skip, "a Skip this one button").toBeTruthy();
    (skip?.props.onClick as () => void)();
    await settle();
    expect(peekImportFor(id)).toBeNull();
    expect(finishedImport(id)).toEqual({ made: 0, left: 0 });
    first.unmount();
    const again = draw(id);
    await settle(16);
    expect(net.sheets).toHaveLength(1);
    expect(net.reads).toHaveLength(1);
    expect(said(again)).toContain("Nothing was created.");
    again.unmount();
  });
});

describe("the roles card when its roles are not there", () => {
  it("says the page was reloaded, that the campaigns already made are in the list, and to add only the roles that are left: nobody is told 'nobody is added twice' about campaigns", async () => {
    const m = draw("add-role99999");
    await settle();
    const text = said(m);
    expect(text).toContain("These roles aren't here any more because the page was reloaded. Add them again with the paperclip. Any campaigns already made are in your list, so add only the roles that are left.");
    expect(text).not.toContain("Nobody is added twice");
    expect(text).toContain("Add something");
    m.unmount();
  });
});
