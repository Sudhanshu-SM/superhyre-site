import { afterEach, describe, expect, it } from "vitest";
import {
  addClientContact, addClientNote, clientById, getClients, resetCampaignRows, resetClients, saveClient, setCampaignClient,
  setClientStatus, setPrimaryContact,
} from "../campaignStore";
import { CAMPAIGN_ROWS } from "../campaignsData";
import {
  CLIENT_SEED, EMPTY_DRAFT, NO_CLIENT_FILTER, SEED_CLIENT_OF, agoLabel, agoMinutes, clientFromDraft, clientNameIn, clientProblems,
  clientSummary, clientsLine, domainOf, draftOf, matchesClient, normaliseClient, primaryContact, sortClients,
} from "../clients";

afterEach(() => { resetClients(); resetCampaignRows(); });

describe("client seed", () => {
  it("links every seeded campaign to a seeded client", () => {
    for (const r of CAMPAIGN_ROWS) expect(CLIENT_SEED.some((c) => c.id === SEED_CLIENT_OF[r.id])).toBe(true);
  });
  it("keeps exactly one primary per client with contacts, mirrored into the flat fields", () => {
    for (const c of CLIENT_SEED) {
      const prim = (c.contacts ?? []).filter((x) => x.primary);
      expect(prim.length).toBe(c.contacts?.length ? 1 : 0);
      expect(c.manager).toBe(prim[0]?.name ?? "");
      expect(c.email).toBe(prim[0]?.email ?? "");
    }
  });
});

describe("domains and logos", () => {
  it.each([
    ["razorpay.com", "razorpay.com"],
    ["https://www.Razorpay.com/careers?x=1", "razorpay.com"],
    ["http://acme.co.in", "acme.co.in"],
    ["not a site", ""],
    ["", ""],
  ])("domainOf(%s)", (raw, want) => { expect(domainOf(raw)).toBe(want); });
});

describe("normaliseClient", () => {
  it("turns an old manager-and-email client into one primary contact", () => {
    const c = normaliseClient({ id: "x", name: "X", manager: "Asha", email: "asha@x.in", phone: "", notes: "" });
    expect(c.contacts).toHaveLength(1);
    expect(primaryContact(c)?.name).toBe("Asha");
    expect(c.status).toBe("active");
  });
  it("keeps only the first flagged primary", () => {
    const c = normaliseClient({ id: "x", name: "X", manager: "", email: "", phone: "", notes: "", contacts: [
      { id: "a", name: "A", title: "", email: "", phone: "", primary: false },
      { id: "b", name: "B", title: "", email: "b@x.in", phone: "", primary: true },
      { id: "c", name: "C", title: "", email: "", phone: "", primary: true },
    ] });
    expect(c.contacts!.filter((x) => x.primary).map((x) => x.id)).toEqual(["b"]);
    expect(c.email).toBe("b@x.in");
  });
});

describe("clientSummary", () => {
  it("reads open campaigns, hires and people in process from the client's campaigns", () => {
    const rz = CLIENT_SEED.find((c) => c.id === "cl-razorpay")!;
    const s = clientSummary(rz, SEED_CLIENT_OF, CAMPAIGN_ROWS);
    const backend = CAMPAIGN_ROWS.find((r) => r.id === "backend-snr")!;
    expect(s.campaigns.map((r) => r.id)).toEqual(["backend-snr"]);
    expect(s.open).toBe(1);
    expect(s.hires).toBe(backend.funnel.hired);
    expect(s.inProcess).toBe(backend.funnel.shortlisted + backend.funnel.contacted);
    expect(s.lastMin).toBe(agoMinutes(backend.updatedAgo));
  });
  it("counts no one in process on a closed campaign", () => {
    const fw = CLIENT_SEED.find((c) => c.id === "cl-freshworks")!;
    const s = clientSummary(fw, SEED_CLIENT_OF, CAMPAIGN_ROWS);
    expect(s.open).toBe(0);
    expect(s.inProcess).toBe(0);
    expect(s.hires).toBe(2);
  });
  it("falls back to when the client was added", () => {
    const now = Date.parse("2026-10-03T12:00:00");
    const s = clientSummary({ id: "none", createdAt: "2026-10-01" }, {}, CAMPAIGN_ROWS, now);
    expect(agoLabel(s.lastMin)).toBe("2d ago");
  });
});

describe("filter and sort", () => {
  const sum = (c: (typeof CLIENT_SEED)[number]) => clientSummary(c, SEED_CLIENT_OF, CAMPAIGN_ROWS);
  it("filters by status, industry and owner together", () => {
    const hit = CLIENT_SEED.filter((c) => matchesClient(c, { ...NO_CLIENT_FILTER, status: "active", industry: "Fintech" }));
    expect(hit.map((c) => c.name).sort()).toEqual(["CRED", "Razorpay"]);
    expect(CLIENT_SEED.filter((c) => matchesClient(c, { ...NO_CLIENT_FILTER, owner: "Arnab J" })).map((c) => c.name).sort()).toEqual(["Postman", "Zepto"]);
  });
  it("searches the primary contact too", () => {
    expect(CLIENT_SEED.filter((c) => matchesClient(c, { ...NO_CLIENT_FILTER, q: "neha" })).map((c) => c.id)).toEqual(["cl-razorpay"]);
  });
  it("sorts by hires, most first, ties by name", () => {
    const out = sortClients(CLIENT_SEED, { key: "hires", dir: -1 }, sum);
    expect(out[0]!.name).toBe("Freshworks");
    expect(sortClients(CLIENT_SEED, { key: "name", dir: 1 }, sum).map((c) => c.name)[0]).toBe("CRED");
  });
});

describe("validation", () => {
  it("needs a company name, and refuses a duplicate", () => {
    expect(clientProblems({ ...EMPTY_DRAFT }).name).toBeTruthy();
    expect(clientProblems({ ...EMPTY_DRAFT, name: "razorpay" }, CLIENT_SEED).name).toMatch(/already a client/);
    expect(clientProblems({ ...EMPTY_DRAFT, name: "Razorpay" }, CLIENT_SEED, "cl-razorpay").name).toBeUndefined();
  });
  it("checks website, email and phone only when given", () => {
    const p = clientProblems({ ...EMPTY_DRAFT, name: "Acme", website: "nope", contactName: "A", contactEmail: "a@", contactPhone: "123" });
    expect(Object.keys(p).sort()).toEqual(["contactEmail", "contactPhone", "website"]);
    expect(clientProblems({ ...EMPTY_DRAFT, name: "Acme", contactEmail: "a@acme.in" }).contactName).toBeTruthy();
    expect(clientProblems({ ...EMPTY_DRAFT, name: "Acme" })).toEqual({});
  });
  it("round-trips a draft", () => {
    const c = clientFromDraft({ ...EMPTY_DRAFT, name: " Acme ", website: "https://acme.in/", contactName: "Asha", contactEmail: "asha@acme.in", fee: "18%" }, "cl-a", new Date("2026-10-03T10:00:00Z"));
    expect(c).toMatchObject({ name: "Acme", website: "acme.in", manager: "Asha", fee: "18%", createdAt: "2026-10-03" });
    expect(draftOf(c).contactEmail).toBe("asha@acme.in");
  });
});

describe("client store", () => {
  it("adds a client and logs it", () => {
    const c = saveClient(clientFromDraft({ ...EMPTY_DRAFT, name: "Acme" }, "cl-acme"));
    expect(getClients().clients.some((x) => x.id === "cl-acme")).toBe(true);
    expect(c.history?.[0]?.text).toBe("Added as a client");
  });
  it("adding a primary contact moves the flag and the flat fields", () => {
    addClientContact("cl-razorpay", { name: "New Lead", title: "VP", email: "lead@razorpay.com", phone: "", primary: true });
    const c = clientById("cl-razorpay")!;
    expect(c.contacts!.filter((x) => x.primary).map((x) => x.name)).toEqual(["New Lead"]);
    expect(c.manager).toBe("New Lead");
    setPrimaryContact("cl-razorpay", "ct-rz-1");
    expect(clientById("cl-razorpay")!.manager).toBe("Neha Kapoor");
  });
  it("sets status and records it", () => {
    setClientStatus("cl-zepto", "inactive");
    expect(clientById("cl-zepto")!.status).toBe("inactive");
    expect(clientById("cl-zepto")!.history?.[0]?.text).toBe("Marked inactive");
  });
  it("links a campaign and logs it on both clients", () => {
    setCampaignClient("backend-snr", "cl-postman");
    expect(getClients().clientOf["backend-snr"]).toBe("cl-postman");
    expect(clientById("cl-postman")!.history?.[0]?.text).toMatch(/linked/);
    expect(clientById("cl-razorpay")!.history?.[0]?.text).toMatch(/another client/);
    setCampaignClient("backend-snr", null);
    expect(getClients().clientOf["backend-snr"]).toBeUndefined();
  });
  it("keeps notes, ignoring empty ones", () => {
    addClientNote("cl-cred", "  ");
    addClientNote("cl-cred", "Prefers Friday calls");
    expect(clientById("cl-cred")!.history).toHaveLength(1);
    expect(clientById("cl-cred")!.history![0]).toMatchObject({ text: "Prefers Friday calls", note: true });
  });
});

describe("clientNameIn", () => {
  it.each([
    ["add Acme Fintech as a client", "Acme Fintech"],
    ["Please add Zeta Labs as our new client.", "Zeta Labs"],
    ["new client: Orbit Labs", "Orbit Labs"],
    ["add a client called Northwind", "Northwind"],
    ["add a client", null],
    ["new client", null],
  ])("%s", (said, want) => { expect(clientNameIn(said)).toBe(want); });
});

describe("the line under the Clients title", () => {
  it("is one calm line, never a row of zeros", () => {
    expect(clientsLine(0, 0, 0)).toBe("The companies you hire for show up here.");
    expect(clientsLine(1, 1, 0)).toBe("1 company, 1 active, none with an open campaign.");
    expect(clientsLine(3, 2, 1)).toBe("3 companies, 2 active, with 1 open campaign between them.");
    expect(clientsLine(3, 2, 4)).toBe("3 companies, 2 active, with 4 open campaigns between them.");
  });
});
