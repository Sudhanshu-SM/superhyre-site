// ContactOut People Search — closed vocabularies.
// Source: the "accepted values" sheet linked from https://api.contactout.com/
// Anything sent outside these lists gets a 422 from ContactOut, so every
// enum-typed field is filtered against them before the request goes out.
// Ported from sourcing/lib/enums.js — keep the two in sync if either changes.

export const SENIORITY = [
  "Owner / Founder", "CXO", "Partner", "VP", "Head",
  "Director", "Manager", "Senior", "Entry", "Intern",
] as const;

export const JOB_FUNCTION = [
  "Operations", "Business Development", "Sales", "Education", "Engineering",
  "Healthcare Services", "Information Technology", "Administrative",
  "Arts and Design", "Customer Success and Support", "Finance",
  "Community and Social Services", "Media and Communication", "Accounting",
  "Marketing", "Human Resources", "Research",
  "Program and Project Management", "Legal",
  "Military and Protective Services", "Consulting", "Entrepreneurship",
  "Real Estate", "Quality Assurance", "Purchasing", "Product Management",
  "Leadership",
] as const;

export const COMPANY_SIZE = [
  "1_10", "11_50", "51_200", "201_500",
  "501_1000", "1001_5000", "5001_10000", "10001",
] as const;

// "10" means more than 10 years — there is no higher bucket.
export const YEARS_OF_EXPERIENCE = ["0_1", "1_2", "3_5", "6_10", "10"] as const;

export const YEARS_IN_CURRENT_ROLE = ["0_2", "2_4", "4_6", "6_8", "8_10", "10"] as const;

export const MATCH_EXPERIENCE = ["current", "past", "both"] as const;

export const COMPANY_FILTER = ["current", "past", "past_only", "both"] as const;

export const DATA_TYPES = ["personal_email", "work_email", "phone"] as const;

// Case-insensitive membership check that returns the canonically-cased value,
// so "cxo" from the model still lands as "CXO".
export function canonical(list: readonly string[], value: unknown): string | null {
  if (typeof value !== "string") return null;
  const needle = value.trim().toLowerCase();
  return list.find((v) => v.toLowerCase() === needle) ?? null;
}
