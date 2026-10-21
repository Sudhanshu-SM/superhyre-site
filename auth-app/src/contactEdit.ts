/** What can be said about an email or phone number a person types before it is sent: a calm line, or null when it will do. */

export function emailProblem(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "Type an email address.";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? null : "That doesn't look like an email yet.";
}

export function phoneProblem(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "Type a phone number.";
  const digits = t.replace(/\D/g, "");
  if (/[^\d\s()+\-.]/.test(t) || digits.length < 7 || digits.length > 15) {
    return "Check the number. Outside India, start with + and the country code.";
  }
  return null;
}

/** The PATCH body that sets (or, with nothing typed, clears) one contact. */
export function contactPatch(kind: "email" | "phone", raw: string): { primaryEmail: string | null } | { primaryPhone: string | null } {
  const text = raw.trim();
  return kind === "email" ? { primaryEmail: text || null } : { primaryPhone: text || null };
}

/** The problem with what was typed for this kind of contact; nothing typed is fine (it clears the contact). */
export const contactProblem = (kind: "email" | "phone", raw: string): string | null =>
  raw.trim() === "" ? null : kind === "email" ? emailProblem(raw) : phoneProblem(raw);
