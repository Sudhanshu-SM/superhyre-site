import { describe, expect, it } from "vitest";
import { CONSUMER_DOMAINS, emailDomain, emailProblem, MIN_PASSWORD, passwordProblem } from "../validate";

describe("emailDomain", () => {
  it("lowercases and trims, matching core.email_domain()", () => {
    expect(emailDomain("  Jane@Acme.COM ")).toBe("acme.com");
  });

  it("keeps subdomains, because the DB slugs on the first label", () => {
    // core.slug_for_domain('mail.acme-corp.co.uk') -> 'mail', so the full host
    // has to survive this step intact or two domains collapse into one tenant.
    expect(emailDomain("jane@mail.acme-corp.co.uk")).toBe("mail.acme-corp.co.uk");
  });

  it.each([
    ["no at sign", "janeacme.com"],
    ["two at signs", "jane@@acme.com"],
    ["empty local part", "@acme.com"],
    ["empty domain", "jane@"],
    ["empty string", ""],
  ])("returns null for %s", (_label, input) => {
    expect(emailDomain(input)).toBeNull();
  });
});

describe("emailProblem", () => {
  it("accepts a work address", () => {
    expect(emailProblem("jane@acme.com")).toBeNull();
  });

  it("accepts an address whose domain is not in the local list", () => {
    // The client list is a courtesy, not the gate. An unknown domain must pass
    // here and be judged by the server.
    expect(emailProblem("jane@some-startup.xyz")).toBeNull();
  });

  it("rejects consumer domains before a round trip", () => {
    expect(emailProblem("jane@gmail.com")).toMatch(/work email/i);
  });

  it("rejects consumer domains regardless of case or padding", () => {
    expect(emailProblem("  Jane@GMAIL.com  ")).toMatch(/work email/i);
  });

  it("flags an incomplete domain separately from a personal one", () => {
    // Different copy matters: one is "fix your typing", the other is "this
    // address can never work".
    expect(emailProblem("jane@acme")).toMatch(/complete email/i);
    expect(emailProblem("jane@acme.")).toMatch(/complete email/i);
  });

  it("asks for input when empty rather than calling it malformed", () => {
    expect(emailProblem("   ")).toMatch(/enter your work email/i);
  });

  it("covers every domain in the mirrored list", () => {
    for (const domain of CONSUMER_DOMAINS) {
      expect(emailProblem(`jane@${domain}`)).toMatch(/work email/i);
    }
  });
});

describe("passwordProblem", () => {
  it("accepts a password at exactly the minimum", () => {
    expect(passwordProblem("a".repeat(MIN_PASSWORD))).toBeNull();
  });

  it("rejects one character below the minimum", () => {
    expect(passwordProblem("a".repeat(MIN_PASSWORD - 1))).toMatch(
      new RegExp(`${MIN_PASSWORD} characters`),
    );
  });

  it("asks for input when empty rather than reporting a length", () => {
    expect(passwordProblem("")).toMatch(/choose a password/i);
  });

  it("states our floor, not Supabase's 6", () => {
    expect(MIN_PASSWORD).toBeGreaterThan(6);
  });
});
