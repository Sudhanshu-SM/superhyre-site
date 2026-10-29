/**
 * What the console and the server both say about adding by choice (the paperclip's menu) and about a sheet of people (the
 * plan the card keeps and sends back): the columns a sheet's column may be, the rules the person's words may make, the stages
 * and steps a status can place someone on, the words of adding that are not an instruction, and what a message may carry of
 * the files chosen. One definition, here.
 *
 * Nothing in this file imports anything, so the console can hold the same file: auth-app/src/attachContract.ts is this file
 * byte for byte (the console is its own repository and build, and cannot reach this package), and a console test fails when the
 * two differ. Change this one, then copy it over that one. The server's validators (sheet-plan-schema.ts, modules/agent/adding.ts)
 * are built from these lists and checked against these types.
 */

/* ── the columns of a sheet ── */

/** What a column of a sheet of people may be taken for. `date` and `addedBy` are the sheet's own bookkeeping; `ignore` is left out. */
export const SHEET_ROLES = [
  "name",
  "firstName",
  "middleName",
  "lastName",
  "linkedin",
  "email",
  "workEmail",
  "phone",
  "contacts",
  "title",
  "company",
  "location",
  "years",
  "skills",
  "notes",
  "status",
  "about",
  "education",
  "history",
  "extra",
  "date",
  "addedBy",
  "ignore",
] as const;
export type SheetRole = (typeof SHEET_ROLES)[number];

/* ── what the words typed beside a sheet may ask of its people ── */

export const WHERE_FIELDS = ["location", "title", "company", "years", "skills", "status"] as const;
export type WhereField = (typeof WHERE_FIELDS)[number];

export const WHERE_OPS = ["any_of", "not_any_of", "gte", "lte", "blank", "not_blank"] as const;
export type WhereOp = (typeof WHERE_OPS)[number];

/** Why a part of the person's words was not applied, as a plan keeps it. */
export const PLAN_UNUSED_WHY = ["no_column", "next_step", "protected", "unclear"] as const;
export type PlanUnusedWhy = (typeof PLAN_UNUSED_WHY)[number];
/** The same, as the card is told: it also hears that the step was not available (a busy model), which no plan keeps. */
export type AssistUnusedWhy = PlanUnusedWhy | "unavailable";

/** A question the plan could not settle and the card asks the person. */
export const PLAN_ASKS = ["which_tab", "which_name_column"] as const;
export type PlanAsk = (typeof PLAN_ASKS)[number];

/** The most a plan may hold: far past what a real sheet needs, and what keeps a plan that is sent back in a header small. */
export const PLAN_LIMITS = { tabs: 10, changes: 24, rules: 5, unused: 8 } as const;

/** The plan as the card keeps it and sends back on a re-read: the tabs by their real names, and which rules are on. */
export type ClientPlanWire = {
  tabs: Array<{ name: string; use: "people" | "skip"; headerRow?: number | null | undefined }>;
  changes: Array<{ tab: string; col: number; role: SheetRole }>;
  where: Array<{
    field: WhereField;
    op: WhereOp;
    values: string[];
    n?: number | null | undefined;
    on: boolean;
    /** Made from words that say "not": kept with the person's own words beside it, for as long as the card is open. */
    negated?: boolean | undefined;
    phrase?: string | undefined;
  }>;
  /** The campaign their words named (its id, checked against the campaigns they may change each time). */
  campaign?: string | null | undefined;
  ask?: PlanAsk | null | undefined;
  /** The parts of their words that were not applied, quoted. */
  unused?: Array<{ said: string; why: PlanUnusedWhy }> | undefined;
};

/* ── the stages and steps a status can place someone on ── */

export const PLACE_STAGES = ["shortlisted", "outreach", "interviewing", "hired", "passed"] as const;
export type PlaceStage = (typeof PLACE_STAGES)[number];
export const PLACE_STEPS = ["waiting", "replied", "loop", "offer"] as const;
export type PlaceStep = (typeof PLACE_STEPS)[number];

/* ── what a message carries of the files chosen ── */

export const ADDING_SCOPES = ["candidates", "roles", "job_description", "read"] as const;
export type AddingScope = (typeof ADDING_SCOPES)[number];

export const ADDING_FILE_KINDS = ["sheet", "document", "pasted"] as const;
export type AddingFileKind = (typeof ADDING_FILE_KINDS)[number];

/** What one message may carry: files in all, sheets and files to read among them, groups, and the lengths of a name, a detail and the add's id. */
export const ADDING_LIMITS = {
  files: 10,
  sheets: 5,
  read: 5,
  groups: 3,
  name: 120,
  detail: 80,
  idMin: 8,
  idMax: 64,
} as const;

export type AddingGroup = {
  scope: AddingScope;
  files: Array<{
    name: string;
    kind: AddingFileKind;
    /** What the chip said of it ("61 people"), kept so the transcript can draw it again. */
    detail?: string | undefined;
  }>;
};

/** What the person chose to add: the choice itself, never worked out from the words. `id` keys the cards' files. */
export type Adding = {
  id: string;
  /** The words are the product's ("Add the people in leads.xlsx"), not the recruiter's. */
  defaulted: boolean;
  groups: AddingGroup[];
};

/* ── the words typed beside the files ── */

/** The words of adding, and of asking nicely: not an instruction about the people. */
export const ADD_STOP_WORDS: readonly string[] = (
  "add these those people candidates candidate sheet sheets file files them please pls plz to the from a an and in into on onto for of it its all " +
  "everyone everybody my our this that campaign campaigns shortlist role roles list leads thanks thank you now just quickly asap"
).split(" ");

const STOP = new Set(ADD_STOP_WORDS);
const WORD = /[\p{L}\p{N}]+/gu;

/** Lower case, accents taken off: how words are compared everywhere a sheet's or a person's words are. */
export const fold = (s: string): string => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** What is left of the words once the campaigns named in them and the words of adding are taken out. */
export function contentWords(words: string, names: readonly string[] = []): string[] {
  const own = new Set(names.flatMap((n) => fold(n).match(WORD) ?? []));
  return (fold(words).match(WORD) ?? []).filter((w) => !STOP.has(w) && !own.has(w));
}

/**
 * Whether the words ask for something besides adding: at least `least` words left once the campaigns named and the words of adding
 * are taken out. "Add these to the Pune campaign" asks nothing more; "only the ones who replied" does. Two is the bar for a reading
 * that costs a model call to apply; one is enough for a turn that only answers ("email them").
 */
export const hasInstruction = (words: string, names: readonly string[] = [], least = 2): boolean =>
  contentWords(words, names).length >= least;
