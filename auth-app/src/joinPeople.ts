/**
 * People who are in more than one of the files on a card, counted once. The rule is the import's own and is not written again
 * here: samePerson.ts is the server's file (modules/candidates/same-person.ts) byte for byte. A LinkedIn address says two rows are
 * one person; an email or a number only when neither has another address and their names can be one name. A company's mailbox, a
 * line with an extension, and an email or number on more different names than a person has say nobody.
 *
 * Only rows of different files are joined: a file is one reading, which has already joined its own repeats (the sheet's, the resumes'),
 * and what it kept as separate people stays separate. The first file in the order they were attached wins what two rows say
 * differently, and fills what it leaves blank (as the first row does inside one sheet). What the later row reaches them by or says of
 * them is kept beside it, as the reading's own merge keeps it (sheet-people.ts, absorb): a second address or number, notes it does not
 * have, and each status that differs, so placing a person by their status goes by every file that says one. What goes to the import
 * is the people that are left, so it adds each of them once; the import still looks at the workspace and at the rest of its batch,
 * as it always does.
 */

import { type SheetFields, statusKey } from "./peopleSheet";
import { Crowd, hasInitial, isRoleMailbox, mayBeSame } from "./samePerson";

type Kind = "linkedin" | "email" | "phone";

/** The profile a LinkedIn address names, as one key; null for an address that is not a person's. */
function linkedinKey(raw: string | undefined): string | null {
  let s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  s = (s.replace(/^<|>$/g, "").split(/[?#]/)[0] ?? "").replace(/^[a-z]+:\/\//, "").replace(/^(www|m|[a-z]{2})\./, "").replace(/\/+$/, "");
  const slug = /^linkedin\.com\/in\/([^/]+)$/.exec(s)?.[1];
  if (!slug) return null;
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

const emailKey = (raw: string | undefined): string | null => {
  const s = (raw ?? "").trim().toLowerCase().replace(/^mailto:/, "");
  return /^[^@\s]+@[^@\s]+\.[^@\s.]+$/.test(s) ? s : null;
};

/** A number as its digits: the sheets and the resumes give them whole (+919845012345), so the same number is the same digits. */
const phoneKey = (raw: string | undefined): string | null => {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
};

type Id = [Kind, string];

/** Strongest first, as the import reads them: the address, the emails, the numbers. */
function identifiersOf(f: SheetFields): Id[] {
  const out: Id[] = [];
  const link = linkedinKey(f.linkedinUrl);
  if (link) out.push(["linkedin", link]);
  for (const e of [f.email, ...(f.moreEmails ?? []), f.workEmail]) {
    const k = emailKey(e);
    if (k && !out.some((o) => o[0] === "email" && o[1] === k)) out.push(["email", k]);
  }
  for (const p of [f.phone, ...(f.morePhones ?? [])]) {
    const k = phoneKey(p);
    if (k && !out.some((o) => o[0] === "phone" && o[1] === k)) out.push(["phone", k]);
  }
  return out;
}

/** The ones that name a person: a company's mailbox and a line with an extension name nobody. */
const own = ([kind, value]: Id, f: SheetFields): boolean =>
  kind === "linkedin" || (kind === "email" ? !isRoleMailbox(value) : !(f.linePhones ?? []).some((p) => phoneKey(p) === value));

const key = ([kind, value]: Id): string => `${kind}:${value}`;

/** How many rows one key holds the first of, as the import does: not every row of a file of one number. */
const MAX_PER_KEY = 8;

const blank = (v: unknown): boolean => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** What the import takes beside a person's first address or number, in their notes and in their skills (service.ts, ImportRowFields; sheet-people.ts, NOTE_LIMIT). */
const MAX_MORE = 8;
const MAX_NOTE_CHARS = 4800;
const MAX_SKILLS = 100;
/** The most other statuses one person keeps, as the reading's own merge does. */
const MAX_SAID = 20;

/** The values, each once by what `keyOf` makes of it (a value it cannot read stands for itself), in the order given; blanks go. */
const distinctBy = (values: ReadonlyArray<string | undefined>, keyOf: (v: string) => string | null): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v?.trim()) continue;
    const k = keyOf(v) ?? v;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
};

const noteLines = (notes: string | undefined): string[] => (notes ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

/**
 * `first` with what it leaves blank taken from `later`: where they differ, the first stands. A name that is only initials gives way to the
 * whole one. What `later` reaches the person by that `first` does not have (another address, number or work address), its notes and its
 * skills are kept beside `first`'s, each once, as the reading's own merge of two rows does.
 */
export function fillFrom(first: SheetFields, later: SheetFields): SheetFields {
  const out: SheetFields = { ...first };
  const take = <K extends keyof SheetFields>(k: K) => {
    if (blank(out[k]) && !blank(later[k])) out[k] = later[k] as SheetFields[K];
  };
  for (const k of ["linkedinUrl", "title", "company", "location", "yearsOfExperience"] as const) take(k);
  if (first.fullName && later.fullName && hasInitial(first.fullName) && !hasInitial(later.fullName)) out.fullName = later.fullName;
  else take("fullName");

  /* The one work address a person has is the first file's; a different one from the later file is another way to reach them. */
  const work = first.workEmail?.trim() ? first.workEmail : later.workEmail?.trim() ? later.workEmail : undefined;
  const sameEmail = (a: string, b: string) => (emailKey(a) ?? a) === (emailKey(b) ?? b);
  const emails = distinctBy(
    [first.email, ...(first.moreEmails ?? []), later.email, ...(later.moreEmails ?? []), ...(first.workEmail?.trim() ? [later.workEmail] : [])],
    emailKey,
  ).filter((e) => !work || !sameEmail(e, work));
  if (emails[0]) out.email = emails[0];
  if (work) out.workEmail = work;
  if (emails.length > 1) out.moreEmails = emails.slice(1, 1 + MAX_MORE);
  else delete out.moreEmails;

  const samePhone = (a: string, b: string) => (phoneKey(a) ?? a) === (phoneKey(b) ?? b);
  const phones = distinctBy([first.phone, ...(first.morePhones ?? []), later.phone, ...(later.morePhones ?? [])], phoneKey);
  if (phones[0]) out.phone = phones[0];
  if (phones.length > 1) out.morePhones = phones.slice(1, 1 + MAX_MORE);
  else delete out.morePhones;
  const lines = distinctBy([...(first.linePhones ?? []), ...(later.linePhones ?? [])], phoneKey)
    .filter((p) => phones.some((q) => samePhone(q, p)))
    .slice(0, MAX_MORE);
  if (lines.length) out.linePhones = lines;
  else delete out.linePhones;

  const have = noteLines(first.notes);
  const more = noteLines(later.notes).filter((l) => !have.includes(l));
  if (more.length) out.notes = [...have, ...more].join("\n").slice(0, MAX_NOTE_CHARS);

  if (later.skills?.length) {
    const known = new Set((first.skills ?? []).map((s) => s.toLowerCase()));
    const extra = later.skills.filter((s) => !known.has(s.toLowerCase()));
    if (extra.length) out.skills = [...(first.skills ?? []), ...extra].slice(0, MAX_SKILLS);
  }
  return out;
}

/** What a sheet says of a person: the status its row has, and what the same person's later rows say when it differs. */
type Said = { status?: string | undefined; alsoSaid?: readonly string[] | undefined };

/**
 * What two rows of one person say of them, as the reading's own merge keeps it: the first status said stands, and each other that
 * differs from it follows in the order the files came (a status in other capitals or spacing is the same one). Nothing when neither
 * row says anything, so placing a person goes by every file that says something of them, and by the same words the card counted.
 */
function saidBy(a: Said, b: Said): { status?: string; alsoSaid?: string[] } {
  const all = [a.status, ...(a.alsoSaid ?? []), b.status, ...(b.alsoSaid ?? [])].filter((s): s is string => !!s?.trim());
  const [status, ...rest] = all;
  if (!status) return {};
  const seen = new Set([statusKey(status)]);
  const also = rest.filter((s) => {
    const k = statusKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { status, ...(also.length ? { alsoSaid: also.slice(0, MAX_SAID) } : {}) };
}

/**
 * The people of every file, in the order the files were attached, with the ones that are the same person joined into the first.
 * `file` says which file a row is from; rows of the same file are never joined to each other. `joined` is the rows that were folded
 * into an earlier one. Rows that name nobody (no address, email or number) stay as they are.
 */
export function joinPeople<T extends { fields: SheetFields; file?: string | undefined; status?: string | undefined; alsoSaid?: readonly string[] | undefined }>(
  rows: readonly T[],
): { people: T[]; joined: number } {
  const ids = rows.map((r) => identifiersOf(r.fields));
  const crowd = new Crowd();
  rows.forEach((r, i) => {
    for (const id of ids[i] ?? []) if (id[0] !== "linkedin" && own(id, r.fields)) crowd.add(key(id), r.fields.fullName);
  });

  /* Each row's group: the first row it is the same person as, or itself. Every row's keys are held, a repeat's too, as the import does. */
  const seen = new Map<string, number[]>();
  const group: number[] = [];
  let joined = 0;
  rows.forEach((r, i) => {
    const mine = (ids[i] ?? []).filter((id) => own(id, r.fields) && (id[0] === "linkedin" || !crowd.crowded(key(id))));
    const who = { name: r.fields.fullName, linkedin: linkedinKey(r.fields.linkedinUrl) };
    let hit = -1;
    for (const id of mine) {
      const found = (seen.get(key(id)) ?? []).find((j) => {
        const other = rows[j];
        if (!other || (r.file !== undefined && other.file === r.file)) return false;
        return mayBeSame(who, { name: other.fields.fullName, linkedin: linkedinKey(other.fields.linkedinUrl) }, id[0]);
      });
      if (found !== undefined) {
        hit = found;
        break;
      }
    }
    group[i] = hit < 0 ? i : (group[hit] ?? hit);
    if (hit >= 0) joined += 1;
    for (const id of mine) {
      const list = seen.get(key(id));
      if (!list) seen.set(key(id), [i]);
      else if (list.length < MAX_PER_KEY) list.push(i);
    }
  });

  const people: T[] = [];
  const at = new Map<number, number>();
  rows.forEach((r, i) => {
    const root = group[i] ?? i;
    if (root === i) {
      at.set(i, people.length);
      people.push(r);
      return;
    }
    const slot = at.get(root);
    const first = slot === undefined ? undefined : people[slot];
    if (slot !== undefined && first) people[slot] = { ...first, fields: fillFrom(first.fields, r.fields), ...saidBy(first, r) };
  });
  return { people, joined };
}
