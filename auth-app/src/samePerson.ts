/**
 * When two records that share something are one person, and when they are two. A LinkedIn address belongs to one person,
 * so two records with the same one are the same. An email or a number does not: a family has one phone, a company one
 * switchboard and one `hr@`, a recruiter's address is on a hundred rows. So a shared email or number joins two records only
 * when nothing says they are different people: neither has another LinkedIn address, and their names can be one name.
 * The sheet of people uses this between its own rows (sheet-people.ts) and the import against the workspace (service.ts).
 * The console holds this same file, byte for byte (auth-app/src/samePerson.ts), to join a person who is in more than one of the
 * files on a card before anything is added; a console test fails when the two differ. Nothing in it may import anything.
 */

/**
 * An email or a number on more than this many different names in a file is somebody's shared line, not a person's own.
 * (One name on a great many rows is one person written down a great many times, not a crowd.)
 */
export const MAX_NAMES_PER_CONTACT = 3;

/** The first word of the part before the "@": what makes a mailbox a company's and not a person's. */
const ROLE_WORDS = new Set([
  "info",
  "hr",
  "admin",
  "administrator",
  "contact",
  "contactus",
  "hello",
  "sales",
  "support",
  "careers",
  "career",
  "jobs",
  "job",
  "team",
  "office",
  "mail",
  "enquiries",
  "enquiry",
  "inquiries",
  "inquiry",
  "noreply",
  "donotreply",
  "recruitment",
  "recruiting",
  "recruiter",
  "hiring",
  "talent",
  "talentacquisition",
  "help",
  "helpdesk",
  "accounts",
  "accounting",
  "billing",
  "marketing",
  "press",
  "webmaster",
  "postmaster",
  "feedback",
  "service",
  "services",
  "general",
  "reception",
  "admissions",
  "resume",
  "resumes",
  "cv",
  "apply",
  "applications",
  "vacancies",
]);

/** A mailbox a company keeps for a job to be done ("info@", "hr@", "careers.pune@"), read by whoever has it: nobody's own address. */
export function isRoleMailbox(email: string): boolean {
  const local = (email.split("@")[0] ?? "").toLowerCase();
  const words = local.split(/[._+-]+/).filter(Boolean);
  return words.length <= 3 && (ROLE_WORDS.has(words[0] ?? "") || ROLE_WORDS.has(words.join("")));
}

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "shri", "smt", "sri", "prof"]);

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const wordsOf = (name: string): string[] =>
  fold(name)
    .split(/[^\p{L}]+/u)
    .filter((w) => w && !HONORIFICS.has(w));

/** One word of a name for another: the same, an initial of it ("a" for "asha"), or the start of it ("dev" for "devendra"). */
function wordsAgree(x: string, y: string): boolean {
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.startsWith(short) && (short.length === 1 || short.length >= 3);
}

/**
 * Whether two names can be one person's: either is missing, or the first names agree and so do the last (in either order,
 * with a middle name or none, an initial for a name, a short form of one). "Asha Verma", "A. Verma" and "Asha V" can be;
 * "Asha Verma" and "Ravi Verma" are a family.
 */
export function namesCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = wordsOf(a ?? "");
  const y = wordsOf(b ?? "");
  if (!x.length || !y.length) return true;
  if (x.length === 1 || y.length === 1) {
    const [single, other] = x.length === 1 ? [x[0] ?? "", y] : [y[0] ?? "", x];
    return other.some((w) => wordsAgree(single, w));
  }
  const firstX = x[0] ?? "";
  const firstY = y[0] ?? "";
  const lastX = x[x.length - 1] ?? "";
  const lastY = y[y.length - 1] ?? "";
  // A surname written two ways ("Verma" and "Verma Rao") still has the one in it.
  const lastAgrees =
    x.slice(1).some((w) => wordsAgree(w, lastY)) || y.slice(1).some((w) => wordsAgree(w, lastX));
  return (
    (wordsAgree(firstX, firstY) && lastAgrees) || (wordsAgree(firstX, lastY) && wordsAgree(lastX, firstY))
  );
}

/** Whether a name has a word that is only an initial ("A. Verma", "Asha V"): the same person's whole name says more. */
export const hasInitial = (name: string): boolean => wordsOf(name).some((w) => w.length === 1);

export type Who = { name?: string | null | undefined; linkedin?: string | null | undefined };

/**
 * Whether two records that share `by` may be taken for one person. A LinkedIn address says so alone; an email or a number
 * only when they do not have different LinkedIn addresses and their names are not different names.
 */
export function mayBeSame(a: Who, b: Who, by: "linkedin" | "email" | "phone"): boolean {
  if (by === "linkedin") return true;
  if (a.linkedin && b.linkedin && a.linkedin !== b.linkedin) return false;
  return namesCompatible(a.name, b.name);
}

/**
 * The emails and numbers of a file that are on too many different people to say who any of them is (a family's phone, an
 * agency's address): `add` each with the name of the row it is on, then `crowded` says which are. A name written on a
 * hundred rows is one person, so it is counted once; only different names make a crowd.
 */
export class Crowd {
  private readonly names = new Map<string, Set<string>>();

  add(key: string, name: string | null | undefined): void {
    let seen = this.names.get(key);
    if (!seen) {
      seen = new Set();
      this.names.set(key, seen);
    }
    // One more than the limit is all it takes to know the key is crowded; no more names are kept past that.
    if (seen.size <= MAX_NAMES_PER_CONTACT) seen.add(wordsOf(name ?? "").join(" "));
  }

  crowded(key: string): boolean {
    return (this.names.get(key)?.size ?? 0) > MAX_NAMES_PER_CONTACT;
  }
}
