import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The add-roles card as it first opens, and where it is hosted: the New campaign button, the chat's import view and a
 * spreadsheet dropped in the composer. (The flow itself, read then ask then make, is the rules in jdIntake.ts,
 * tested there, and the server's reading, tested there.)
 */

vi.mock("../api/client", () => {
  class ApiError extends Error {}
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => null, messageOf: (e: Error) => e.message };
});

/* The workspace's stores read from the server; here there is nobody to ask, so they answer with nothing. */
vi.mock("../campaignStore", () => ({
  useClients: () => ({ clients: [] }),
  useTeam: () => [],
  memberName: () => undefined,
  addCampaignRow: async () => true,
  resolveCampaignId: (id: string) => id,
  saveClient: () => ({ id: "x" }),
  setCampaignClient: () => undefined,
}));

const { JdIntake } = await import("../JdIntake");
const { hasSeed, sheetLinkIn, stashImport, takeImport } = await import("../importFiles");

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("the add-roles card", () => {
  const html = renderToStaticMarkup(<JdIntake onManual={() => undefined} onClose={() => undefined} />);

  it("starts from the job descriptions: drop or pick several files, paste one, or give a Google Sheet's link", () => {
    expect(html).toContain("New campaign");
    for (const tab of ["Upload files", "Paste text", "Google Sheet"]) expect(html).toContain(tab);
    expect(html).toContain("Drop job descriptions here, or browse");
    expect(html).toContain("pick several at once");
    expect(html).toMatch(/<input[^>]*type="file"[^>]*multiple/);
    expect(html).toMatch(/accept="[^"]*\.xlsx[^"]*\.csv/);
  });

  it("keeps the long form one click away, and cannot be started with nothing to read", () => {
    expect(html).toContain("Fill in the details yourself");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Read it/);
  });

  it("has no title of its own when it is drawn in the chat, which already said what it is", () => {
    const inChat = renderToStaticMarkup(<JdIntake embedded />);
    expect(inChat).not.toContain("New campaign");
    expect(inChat).not.toContain('class="jd-top"');
  });
});

describe("the client question in it", () => {
  const intake = src("JdIntake.tsx");

  it("cannot be skipped, not by Skip this and not by making the rest without asking", () => {
    expect(intake).toContain("{!ask.required && <button type=\"button\" className=\"cn-link\" onClick={() => skip(ask)}>Skip this</button>}");
    expect(intake).toContain(".filter((a) => a.required || !skipRest)");
  });

  it("takes a company that is typed the way the picker does, whoever the person is: a client already listed is picked, any other is a name", () => {
    expect(intake).toContain("const made = addedAs(t, clients);");
    expect(intake).toContain("else give({ newClient: made.name });");
    expect(intake).not.toContain("None of your clients is called that.");
  });

  it("is made by an admin as before (the client is saved now, by its name alone) and by anyone else as a name sent with the campaign", () => {
    expect(intake).toContain("else if (mayAddClient) clientId = saveClient(");
    expect(intake).toContain("else newClient = a.newClient;");
    expect(intake).toContain("draftFromIntake({ facts, jd: item.cleaned ?? item.jd, answers: item.answers, defaults, owner, clientId, newClient });");
  });
});

describe("a Google Sheet's link in the words", () => {
  it("is found among other words, and only when it is a Sheets address", () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    expect(sheetLinkIn(`please create campaigns from https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing thanks`)).toBe(`https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`);
    expect(sheetLinkIn("https://docs.google.com/document/d/abc")).toBeNull();
    expect(sheetLinkIn("no link here")).toBeNull();
  });
});

describe("where it is hosted", () => {
  it("is what the New campaign button opens on a connected workspace, with the long form behind it", () => {
    const page = src("CampaignsPage.tsx");
    expect(page).toContain("<NewCampaignIntake");
    expect(page).toContain("open={LIVE ? manual : creating}");
    expect(src("NewCampaignIntake.tsx")).toContain("onManual={onManual}");
  });

  it("is the chat's import view, which takes the files a spreadsheet drop left for it", () => {
    expect(src("liveViews/index.tsx")).toContain('"campaign-import": lazy(() => import("./Import"))');
    expect(src("liveViews/Import.tsx")).toContain("takeImport()");
    stashImport({ files: [new File(["a"], "roles.xlsx")], links: ["https://docs.google.com/spreadsheets/d/abc"] });
    const seed = takeImport();
    expect(seed.files.map((f) => f.name)).toEqual(["roles.xlsx"]);
    expect(seed.links).toHaveLength(1);
    expect(hasSeed(takeImport())).toBe(false);
  });

  it("is where a sheet of roles chosen from the paperclip goes: its own add's files, by id, opened under the line that says so", () => {
    const agent = src("Agent.tsx");
    expect(agent).toContain("stashImportFor(m.adding.id, rolesSeedOf(m.keep.roles));");
    expect(src("liveViews/Import.tsx")).toContain("(adding ? peekImportFor(adding) : takeImport())");
    expect(src("liveViews/Import.tsx")).toContain("Making campaigns from these roles only.");
    expect(src("liveViews/Import.tsx")).toContain('<Gone what="These roles" plural last=');
    // It lets its roles go when a campaign is made from them or it ends (rolesCardRun.test.tsx runs it), so it hears how many there are.
    expect(src("liveViews/Import.tsx")).toContain("onFinish={(made, left) => { if (adding) finishImportFor(adding, made, left); }}");
    expect(src("JdIntake.tsx")).toContain("if (doneCount > 0 || ended) onFinish?.(doneCount, toMake);");
    // A sheet is no longer sent to the roles import because of what is in it: the person chose it.
    expect(agent).not.toContain("stashImport({ files: sheets })");
    expect(agent).not.toContain('sendMessage("Add these roles in bulk"');
  });
});
