import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactPerson, ContactsStatus } from "../contactsModel";
import { recount } from "../contactsModel";

/**
 * What a person reads and can press on a row of the Shortlisted table and in a person's sheet, drawn from the same
 * store. The API answers with whatever the test sets; nothing here needs a server.
 */

const { server } = vi.hoisted(() => ({ server: { status: null as unknown } }));
vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return {
    LIVE: true,
    API_URL: "http://api.test",
    ApiError,
    messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
    api: async (method: string) => (method === "GET" ? server.status : undefined),
    onWrite: () => () => {},
  };
});
vi.mock("../problems", () => ({ reportProblem: () => {} }));

const store = await import("../contactsFetch");
const { ContactCell, ContactSideLine, ContactsMenu } = await import("../ContactsFetch");

const person = (n: number, over: Partial<ContactPerson> = {}): ContactPerson => ({
  campaignCandidateId: `cc-${n}`, candidateId: `cand-${n}`, personId: `p-${n}`, stage: "shortlisted",
  email: "none", phone: "none", lookupable: true, ...over,
});
const status = (people: ContactPerson[], over: Partial<ContactsStatus> = {}): ContactsStatus => ({
  campaignId: "c1", closed: false, creditsLeft: 38, perRequest: 50, available: { email: true, phone: true },
  people, counts: recount(people), ...over,
});
const seed = async (s: ContactsStatus) => {
  store.resetContacts();
  server.status = s;
  await store.load("c1");
};
const cell = (id = "cc-1") => renderToStaticMarkup(<ContactCell campaignId="c1" id={id} name="Asha Rao" />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

beforeEach(() => store.resetContacts());

describe("a row of the Shortlisted table", () => {
  it("says nobody has asked, and offers both buttons, each named for the person", async () => {
    await seed(status([person(1)]));
    const html = cell();
    expect(text(html)).toBe("No contact details yet Get email Get phone");
    expect(html).toContain('aria-label="Get email for Asha Rao"');
    expect(html).toContain('aria-label="Get phone number for Asha Rao"');
    // The email is free; the phone says what it uses.
    expect(html).toContain('title="Free"');
    expect(html).toContain('title="Uses a credit when a number is found"');
    expect(html).not.toContain("disabled");
  });

  it("offers only what is missing", async () => {
    await seed(status([person(1, { email: "found" }), person(2, { phone: "found" }), person(3, { email: "found", phone: "found" })]));
    expect(text(cell("cc-1"))).toBe("Email found Get phone");
    expect(text(cell("cc-2"))).toBe("Phone found Get email");
    expect(text(cell("cc-3"))).toBe("Email and phone found");
  });

  it("shows a phone on its way with the loader and no button for it", async () => {
    await seed(status([person(1, { email: "found", phone: "looking" })]));
    const html = cell();
    expect(text(html)).toBe("Email found. Looking for a phone, this can take a few minutes");
    expect(html).toContain('class="ldr is-sm"');
    expect(html).not.toContain("Get phone");
  });

  it("says not found plainly and does not offer to ask again", async () => {
    await seed(status([person(1, { email: "not_found", phone: "not_found" })]));
    expect(text(cell())).toBe("Not found");
  });

  it("keeps Get phone but disabled, with the calm line, when no credits are left; the email stays", async () => {
    await seed(status([person(1)], { creditsLeft: 0 }));
    const html = cell();
    expect(html).toContain("No phone lookups left this month. Email lookups are free.");
    const button = (label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";
    expect(button("Get phone number for Asha Rao")).toContain("disabled");
    expect(button("Get email for Asha Rao")).not.toContain("disabled");
    expect(button("Get email for Asha Rao")).not.toBe("");
  });

  it("offers nothing on a closed campaign, without a profile to look up, or when no provider is set up", async () => {
    await seed(status([person(1)], { closed: true }));
    expect(text(cell())).toBe("No contact details yet");
    await seed(status([person(1, { lookupable: false })]));
    expect(text(cell())).toBe("No profile to look up");
    await seed(status([person(1)], { available: { email: false, phone: false } }));
    expect(text(cell())).toBe("No contact details yet");
    await seed(status([person(1)], { available: { email: true, phone: false } }));
    expect(text(cell())).toBe("No contact details yet Get email");
  });

  it("draws nothing before the figures arrive unless the board already knows they are on file", () => {
    expect(renderToStaticMarkup(<ContactCell campaignId="c9" id="cc-1" name="Asha Rao" />)).not.toContain("Get");
    expect(text(renderToStaticMarkup(<ContactCell campaignId="c9" id="cc-1" name="Asha Rao" reach={{ email: true, phone: true }} />))).toBe("Email and phone found");
  });

  it("never names a data provider", async () => {
    await seed(status([person(1), person(2, { phone: "looking" })], { creditsLeft: 0 }));
    expect(cell("cc-1") + cell("cc-2")).not.toMatch(/salesql|apollo|contactout|crustdata/i);
  });
});

describe("a person's sheet", () => {
  const line = (kind: "email" | "phone", over: Partial<Parameters<typeof ContactSideLine>[0]> = {}) =>
    text(renderToStaticMarkup(<ContactSideLine campaignId="c1" kind={kind} ccId="cc-1" name="Asha Rao" {...over} />));

  it("is the same words and buttons as the table, from the same store", async () => {
    await seed(status([person(1, { email: "found" })]));
    expect(line("email")).toBe("Email found");
    expect(line("phone")).toBe("No phone yet Get phone");
    expect(text(cell("cc-1"))).toBe("Email found Get phone");
  });

  it("finds a person by candidate, as the profile sidebar does", async () => {
    await seed(status([person(1, { phone: "looking" })]));
    expect(line("phone", { ccId: undefined, candidateId: "cand-1" })).toBe("Looking, this can take a few minutes");
  });

  it("shows the value when the page already has one, and no button", async () => {
    await seed(status([person(1)]));
    expect(line("email", { value: "asha@example.com" })).toBe("asha@example.com");
  });

  it("says it is not on file for someone on no campaign, with no button", () => {
    expect(line("email", { campaignId: null, ccId: undefined, candidateId: "cand-9" })).toBe("Not on file");
  });
});

describe("the table's menu", () => {
  const menu = () => renderToStaticMarkup(<ContactsMenu campaignId="c1" everyone={["cc-1"]} picked={new Set()} />);

  it("is a button named for what it does once the figures are there", async () => {
    await seed(status([person(1)]));
    const html = menu();
    expect(text(html)).toBe("Get contact details");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toContain("disabled");
  });

  it("is not drawn before the figures arrive, on a closed campaign, or when no provider is set up", async () => {
    store.resetContacts();
    expect(menu()).toBe("");
    await seed(status([person(1)], { closed: true }));
    expect(menu()).toBe("");
    await seed(status([person(1)], { available: { email: false, phone: false } }));
    expect(menu()).toBe("");
  });
});
