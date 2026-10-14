/**
 * One phone number as one canonical string (E.164, "+919845012345"). The same rules as the
 * server's (superhyre-platform/packages/shared/src/phone.ts) and the database's
 * (core.normalize_phone), checked against the same PHONE_CASES, so the page never accepts a
 * number the server refuses or spells it differently.
 *
 * Without a "+" or "00" a number is read as Indian: 10 digits starting 6-9 (mobile), or with
 * the trunk 0 / a leading 91. Indian numbers always have exactly 10 digits after +91. Other
 * countries keep their own code and need 8 to 15 digits in total.
 */
export type PhoneProblem = "empty" | "letters" | "short_india" | "long_india" | "length" | "not_mobile";

export function parsePhone(raw: string): { ok: true; e164: string } | { ok: false; problem: PhoneProblem } {
  const s = raw.trim();
  if (!s) return { ok: false, problem: "empty" };
  if (/[^\d\s()+\-./]/.test(s)) return { ok: false, problem: "letters" };
  let d = s.replace(/\D/g, "");
  let intl = s.startsWith("+");
  if (!intl && d.startsWith("00")) {
    d = d.slice(2);
    intl = true;
  }
  if (intl) {
    if (d.startsWith("91")) return india(d.slice(2).replace(/^0/, ""));
    return d.length >= 8 && d.length <= 15 ? { ok: true, e164: `+${d}` } : { ok: false, problem: "length" };
  }
  if (d.length === 12 && d.startsWith("91")) return india(d.slice(2));
  if (d.length === 13 && d.startsWith("910")) return india(d.slice(3));
  if (d.length === 11 && d.startsWith("0")) return india(d.slice(1));
  if (d.length === 10) return /^[6-9]/.test(d) ? india(d) : { ok: false, problem: "not_mobile" };
  return { ok: false, problem: d.length < 10 ? "short_india" : "long_india" };
}

function india(national: string): { ok: true; e164: string } | { ok: false; problem: PhoneProblem } {
  if (national.length < 10) return { ok: false, problem: "short_india" };
  if (national.length > 10) return { ok: false, problem: "long_india" };
  if (!/^[1-9]/.test(national)) return { ok: false, problem: "length" };
  return { ok: true, e164: `+91${national}` };
}

/** The canonical number, or null. */
export function normalizePhone(raw: string): string | null {
  const r = parsePhone(raw);
  return r.ok ? r.e164 : null;
}

/** What to tell a person who typed a number we can't use. */
export function phoneProblemText(problem: PhoneProblem): string {
  switch (problem) {
    case "empty":
      return "Add a number we can reach you on.";
    case "letters":
      return "Use digits only, with + for a country code.";
    case "short_india":
    case "long_india":
      return "Indian numbers have 10 digits.";
    case "not_mobile":
      return "That doesn't look like an Indian mobile number. Outside India? Start with + and your country code.";
    default:
      return "Check the number. Outside India? Start with + and your country code.";
  }
}

/** A number as people read it: "+91 98450 12345"; any other country stays as stored. */
export function displayPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/** What someone typed, tidied once they leave the field: an Indian mobile reads "98450 12345". */
export function tidyPhone(raw: string): string {
  const r = parsePhone(raw);
  if (!r.ok) return raw;
  const indian = /^\+91(\d{5})(\d{5})$/.exec(r.e164);
  if (indian && !raw.trim().startsWith("+") && !raw.trim().startsWith("00")) return `${indian[1]} ${indian[2]}`;
  return displayPhone(r.e164);
}

/** Same cases as packages/shared/src/phone.ts; every layer runs them. */
export const PHONE_CASES: ReadonlyArray<readonly [string, string | null]> = [
  ["98450 12345", "+919845012345"],
  ["098450-12345", "+919845012345"],
  ["91 9845012345", "+919845012345"],
  ["0091 98450 12345", "+919845012345"],
  ["+91 0 98450 12345", "+919845012345"],
  ["+91-98450-12345", "+919845012345"],
  ["(+91) 98450 12345", "+919845012345"],
  ["080 4123 4567", "+918041234567"],
  ["+91 80 4123 4567", "+918041234567"],
  ["+1 (415) 555-0100", "+14155550100"],
  ["+44 20 7946 0958", "+442079460958"],
  ["+91 98450 1234", null],
  ["+91 98450 123456", null],
  ["98450 12345 / 98860 54321", null],
  ["call me", null],
  ["12345", null],
  ["5845012345", null],
  ["", null],
];
