import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A new console against an older server. The server drops a field it does not know, so a message that carries the paperclip's choice
 * would arrive as a fixed phrase and its card would find no files. The console asks the server whether it takes the choice
 * (GET /v1/agent/capabilities, `adding`), and uses the new send path only when it says so: until then, and for a server that says
 * no or cannot be asked, the paperclip opens the picker at once and a Send goes as the words the server has always understood.
 */

const answer = { value: { adding: true } as { adding?: boolean } };
vi.mock("../api/client", async (orig) => ({ ...(await orig<typeof import("../api/client")>()), LIVE: true }));
vi.mock("../api/agent", async (orig) => {
  const m = await orig<typeof import("../api/agent")>();
  return { ...m, agentApi: { ...m.agentApi, capabilities: vi.fn(async () => answer.value) } };
});

import { type SendContext, outgoing, ROLES_MESSAGE } from "../adding";
import { addingOn, forgetAdding } from "../addingFlag";
import { agentApi } from "../api/agent";
import type { Attachment } from "../attachments";
import { PEOPLE_MESSAGE, type PeopleSheet } from "../peopleSheet";

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

beforeEach(() => {
  forgetAdding();
  answer.value = { adding: true };
  vi.mocked(agentApi.capabilities).mockClear();
});

describe("whether the server takes the paperclip's choice", () => {
  it("is yes when the server says it takes it, asked once", async () => {
    expect(await addingOn()).toBe(true);
    expect(await addingOn()).toBe(true);
    expect(agentApi.capabilities).toHaveBeenCalledTimes(1);
  });

  it("is no when the server says no, or does not say (an older one answers nothing of the kind)", async () => {
    answer.value = { adding: false };
    expect(await addingOn()).toBe(false);
    forgetAdding();
    answer.value = {};
    expect(await addingOn()).toBe(false);
  });

  it("is no when the server cannot be asked, and is asked again after, rather than staying no for good", async () => {
    vi.mocked(agentApi.capabilities).mockRejectedValueOnce(new Error("404"));
    expect(await addingOn()).toBe(false);
    expect(await addingOn()).toBe(true);
    expect(agentApi.capabilities).toHaveBeenCalledTimes(2);
  });
});

const chip = (over: Partial<Attachment> = {}): Attachment => ({ id: "a1", name: "leads.xlsx", origin: "file", size: 1000, status: "ready", text: "", ...over });
const sheetOf = (kind: PeopleSheet["kind"], people = 0): PeopleSheet =>
  ({
    kind, tabs: [], tab: null, headerRow: null, columns: [], needsCheck: false,
    counts: { rows: people, people, toAdd: people, alreadyHere: 0, onCampaign: 0, repeats: 0, left: 0, namesFromLinks: 0, phonesRebuilt: 0, phonesCut: 0 },
    leftOutBy: {}, leftOut: [], rows: [],
  }) as PeopleSheet;
const people = (id: string, over: Partial<Attachment> = {}) =>
  chip({ id, name: `${id}.xlsx`, kind: "sheet", scope: "candidates", sheet: sheetOf("people", 61), ...over });
const roles = (id: string) => people(id, { scope: "roles", sheet: sheetOf("roles") });
const doc = (id: string, scope: Attachment["scope"], over: Partial<Attachment> = {}) =>
  chip({ id, name: `${id}.pdf`, kind: "document", scope, text: `Text of ${id} that is long enough to be a file`, docKind: "document", ...over });

const CAMPAIGNS = [{ id: "c-1", name: "Senior Backend" }, { id: "c-2", name: "Pune Backend" }];
const NOW: SendContext = { campaign: { id: "c-1", name: "Senior Backend" }, mayChange: true, closed: false, campaigns: CAMPAIGNS, id: "add-0001abcd" };
const OLD: SendContext = { ...NOW, legacy: true };

describe("a Send, with a server that takes the choice and with one that does not", () => {
  it("carries the choice, and the product's own words, when the server takes it", () => {
    const out = outgoing([people("leads")], "", NOW);
    expect(out?.messages).toHaveLength(1);
    expect(out?.messages[0]?.text).toBe("Add the people in leads.xlsx");
    expect(out?.messages[0]?.adding?.groups[0]?.scope).toBe("candidates");
  });

  it("carries no choice at all when the server does not: the words that open the people card, which finds its files where they were left", () => {
    const out = outgoing([people("leads")], "", OLD);
    expect(out?.messages).toHaveLength(1);
    const [m] = out?.messages ?? [];
    expect(m?.text).toBe(PEOPLE_MESSAGE);
    expect(m?.adding).toBeUndefined();
    expect(m?.campaignId).toBe("c-1");
    expect(m?.keep?.people.map((c) => c.id)).toEqual(["leads"]);
    expect(out?.taken).toEqual(["leads"]);
  });

  it("sends roles as the words that open the roles import, and people after them, each with its own files kept", () => {
    const out = outgoing([people("a"), roles("r")], "", OLD);
    expect(out?.messages.map((m) => m.text)).toEqual([ROLES_MESSAGE, PEOPLE_MESSAGE]);
    expect(out?.messages.every((m) => m.adding === undefined)).toBe(true);
    expect(out?.messages[0]?.keep?.roles.map((c) => c.id)).toEqual(["r"]);
    expect(out?.messages[1]?.keep?.people.map((c) => c.id)).toEqual(["a"]);
    expect(ROLES_MESSAGE).toBe("Add roles in bulk");
  });

  it("sends the person's own words as their own message, beside the sheet and never in place of the phrase that opens its card", () => {
    const out = outgoing([people("leads")], "these came from the Hyderabad meetup", OLD);
    expect(out?.messages.map((m) => m.text)).toEqual([PEOPLE_MESSAGE, "these came from the Hyderabad meetup"]);
    expect(out?.messages.every((m) => m.adding === undefined)).toBe(true);
  });

  it("finds the campaign the words name as where the people go, as it does with the choice", () => {
    const out = outgoing([people("leads")], "add these to the Pune Backend campaign", OLD);
    expect(out?.messages[0]?.campaignId).toBe("c-2");
  });

  it("sends a document as it always did, framed in one message with the words, and never as a job description put on the campaign by its own route", () => {
    const file = new File(["jd bytes"], "jd.pdf", { type: "application/pdf" });
    const jd = doc("jd", "job_description", { docKind: "job_description", file });
    const out = outgoing([jd], "", OLD);
    expect(out?.messages).toHaveLength(1);
    const [m] = out?.messages ?? [];
    expect(m?.text).toContain("Here is the job description for Senior Backend.");
    expect(m?.text).toContain("Text of jd");
    expect(m?.adding).toBeUndefined();
    expect(m?.jd).toBeUndefined();
    expect(out?.usedBrief).toBe(true);
  });

  it("sends files to read and a resume framed in the message too, with no choice for the server to drop", () => {
    const out = outgoing([doc("brief", "read"), doc("cv", "candidates", { docKind: "resume" })], "what do these say", OLD);
    expect(out?.messages).toHaveLength(1);
    expect(out?.messages[0]?.adding).toBeUndefined();
    expect(out?.messages[0]?.text.startsWith("what do these say")).toBe(true);
    expect(out?.messages[0]?.text).toContain("Text of brief");
    expect(out?.messages[0]?.text).toContain("Text of cv");
  });

  it("still leaves a file with a line to settle where it is, and sends the rest", () => {
    const stuck = people("stuck", { sheet: sheetOf("roles") });
    const out = outgoing([people("ok"), stuck], "", OLD);
    expect(out?.taken).toEqual(["ok"]);
    expect(out?.messages).toHaveLength(1);
  });

  it("is nothing when no file was chosen, with either server: the message goes as it always did", () => {
    expect(outgoing([], "hello", OLD)).toBeNull();
    expect(outgoing([], "hello", NOW)).toBeNull();
  });
});

describe("the composer, with the flag", () => {
  const agent = src("Agent.tsx");

  it("is asked once for the page, and the composer is told: the new send path only when it is yes", () => {
    expect(agent).toContain("const addingOn = useAddingOn();");
    expect(agent).toContain("on: addingOn,");
    expect(agent).toContain("const modern = adding?.on === true;");
    expect(agent).toContain("...(modern ? {} : { legacy: true }),");
  });

  it("opens the picker at once for a server that does not take the choice, and the menu for one that does; the menu is not drawn for the first", () => {
    expect(agent).toContain("onClick={() => (modern ? setMenuOpen((o) => !o) : openPicker())}");
    expect(agent).toContain("{LIVE && modern && (");
    expect(agent).toContain("const open = () => (modern ? setMenuOpen(true) : openPicker());");
  });

  it("keeps the files of a message that carries no choice where the cards always looked for them, and keeps by the add's id only when it does", () => {
    expect(agent).toContain("if (m.keep && !m.adding) {");
    expect(agent).toContain("stashPeople(m.keep.people.map(seedOf))");
    expect(agent).toContain("if (m.keep && m.adding) {");
  });

  it("is what the server's route is for: it asks GET /v1/agent/capabilities, and a server that does not have it fails that and stays on the old way", () => {
    expect(src("api/agent.ts")).toContain('capabilities: () => api<{ adding?: boolean }>("GET", "/v1/agent/capabilities")');
  });
});
