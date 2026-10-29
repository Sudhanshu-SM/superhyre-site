/**
 * What the paperclip adds, and how. Everything here is pure: the menu's rows for the chat the person is in, what a file may be
 * chosen as, what a dropped file is suggested to be, the line that says a file looks like something else, the limits, and how
 * the chips become messages. The composer and the cards only draw and send it.
 *
 * The choice is the scope: it is data on each chip and on the message, and nothing is guessed from the words or from what is
 * in a file. A file picked as Candidates has no road to a campaign or a hire; the card says so on its first line.
 * Server: modules/agent/adding.ts.
 */

import type { Adding, AddingGroup } from "./api/agent";
import { ATTACH_ACCEPT, type AddScope, type Attachment, MAX_FILE_BYTES, composeMessage } from "./attachments";
import { ADDING_LIMITS, contentWords, fold, hasInstruction } from "./attachContract";
import { type ImportSeed, sheetLinksIn, withoutSheetLinks } from "./importFiles";
import type { Before } from "./liveChat";
import { PEOPLE_MESSAGE, type PeopleSheet, tooManyPeople } from "./peopleSheet";
import { resumeHeadline } from "./resumeSheet";
import { isSheetName } from "./sheetRoute";

export type { AddScope };

/** What a card asks the composer with, to open the paperclip's menu (a card cannot reach the composer itself). */
export const OPEN_ADD_MENU = "sh:add-menu";

/** Files in one message, counted over every chip (the next campaign's job description among them), and the kinds that are capped inside it. */
export const MAX_FILES = ADDING_LIMITS.files;
export const MAX_SHEETS = ADDING_LIMITS.sheets;
export const MAX_READ = ADDING_LIMITS.read;

export const LIMIT_LINE = `Up to ${MAX_FILES} files go in one message. Remove one to add more.`;
const NO_START = "Only owners and admins can start campaigns.";

/** What a chip says of an old Excel file, or a workbook with a password (which is the same kind of file, and shows the same header). */
export const oldExcelLine = (name: string): string =>
  `${name} is an old Excel file, or a workbook with a password. Open it, save it as .xlsx or CSV with no password, and attach it again.`;

/** The first four bytes of an old binary Excel file (.xls), and of a workbook with a password: both turned away by the server only after the whole upload. */
export const isOldExcel = (head: Uint8Array): boolean => head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;

/** The picker's lists: sheets, then the documents a scope takes. `.xls` is not offered: the server turns old Excel away only after the whole upload. */
export const SHEET_TYPES = ".xlsx,.csv,.tsv";
const JD_TYPES = ".pdf,.docx,.txt,.png,.jpg,.jpeg";

export type FileKind = "sheet" | "document";
export const kindOf = (f: Pick<File, "name" | "type">): FileKind => (isSheetName(f) ? "sheet" : "document");

/* ── the menu ── */

export type AddRow = {
  scope: AddScope;
  label: string;
  help: string;
  accept: string;
  multiple: boolean;
  /** Why the row can not be chosen now, in the words to show. */
  disabled?: string;
};

/** The chat the menu is opened in: the campaign the page has open (by name), what the person may do with it, and how many files are already attached. */
export type AddContext = {
  campaign: string | null;
  /** The id of that campaign, for what is bound to one (a job description chosen for it). */
  campaignId?: string | null;
  mayChange: boolean;
  closed: boolean;
  canStart: boolean;
  count: number;
};

/** The rows of "What are you adding?" for this chat, in the order they are likely to be wanted. */
export function menuFor(ctx: AddContext): AddRow[] {
  const mine = ctx.campaign !== null && ctx.mayChange && !ctx.closed;
  const full = ctx.count >= MAX_FILES ? LIMIT_LINE : undefined;
  const row = (r: Omit<AddRow, "disabled">, why?: string): AddRow => {
    const disabled = full ?? why;
    return disabled ? { ...r, disabled } : r;
  };
  const people = row({
    scope: "candidates",
    label: "Candidates",
    help: mine
      ? `A sheet of people, or resumes. They go on the ${ctx.campaign} shortlist.`
      : ctx.campaign
        ? `A sheet of people, or resumes. They go to your Candidates, not to ${ctx.campaign}.`
        : "A sheet of people, or resumes. They go to your Candidates.",
    accept: `${SHEET_TYPES},${ATTACH_ACCEPT}`,
    multiple: true,
  });
  const read = row({
    scope: "read",
    label: "Something to read",
    help: "A brief, notes or any document. Nothing is added.",
    accept: ATTACH_ACCEPT,
    multiple: true,
  });
  if (mine) {
    return [
      people,
      row({
        scope: "job_description",
        label: "Job description",
        help: `Replaces the one on ${ctx.campaign}. The old one is kept.`,
        accept: JD_TYPES,
        multiple: false,
      }),
      row(
        {
          scope: "roles",
          label: "More roles",
          help: "Job descriptions or a sheet of roles. Each becomes a new campaign.",
          accept: `${SHEET_TYPES},${ATTACH_ACCEPT}`,
          multiple: true,
        },
        ctx.canStart ? undefined : NO_START,
      ),
      read,
    ];
  }
  return [
    people,
    row(
      {
        scope: "roles",
        label: "Job descriptions",
        help: "One or many, or a sheet of roles. Each becomes a campaign.",
        accept: `${SHEET_TYPES},${ATTACH_ACCEPT}`,
        multiple: true,
      },
      ctx.canStart ? undefined : NO_START,
    ),
    read,
  ];
}

/** Why a spreadsheet is not taken before it is sent, in one calm line; null when it is. */
export function sheetRefusal(file: Pick<File, "name" | "size">): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is over 10 MB. Attach a smaller file.`;
  return null;
}

/* ── what a file may be, and what a dropped one looks like ── */

/** What a chip says of its scope, in the person's words. */
export const SCOPE_WORD: Record<AddScope, string> = {
  candidates: "Candidates",
  roles: "Roles",
  job_description: "Job description",
  read: "To read",
};
/** What a dropped file's scope says while it is only a suggestion. */
export const SUGGESTED_WORD: Record<AddScope, string> = {
  candidates: "Looks like candidates",
  roles: "Looks like roles",
  job_description: "Looks like a job description",
  read: "Looks like something to read",
};

/** Whether a kind of file can be this at all: a spreadsheet is never read by the agent, and is never one job description. */
export function canBe(kind: FileKind, scope: AddScope): boolean {
  if (kind === "sheet") return scope === "candidates" || scope === "roles";
  return true;
}

/** The scopes a file may be changed to, in the menu's order. `mine`: the person may put a job description on the campaign in the chat. */
export function scopesFor(kind: FileKind, ctx: Pick<AddContext, "campaign" | "mayChange" | "closed">): AddScope[] {
  const mine = ctx.campaign !== null && ctx.mayChange && !ctx.closed;
  const all: AddScope[] = mine ? ["candidates", "job_description", "roles", "read"] : ["candidates", "roles", "read"];
  return all.filter((s) => canBe(kind, s));
}

/** The name a scope has in this chat's menu ("More roles" beside a campaign, "Job descriptions" without one). */
export const scopeLabel = (scope: AddScope, ctx: Pick<AddContext, "campaign" | "mayChange" | "closed">): string =>
  menuFor({ ...ctx, canStart: true, count: 0 }).find((r) => r.scope === scope)?.label ?? SCOPE_WORD[scope];

/**
 * What a dropped or pasted file is suggested to be (the person changes it with one click). A sheet is what reading it found; a
 * document is a job description only when the reader called it one, a resume is a candidate (nothing is added before the button
 * on the card), and any other document is something to read: a suggestion must never write on its own.
 */
export function suggest(
  file: { kind: FileKind; sheetKind?: "people" | "roles" | "other" | undefined; docKind?: Attachment["docKind"] | undefined },
  ctx: Pick<AddContext, "campaign" | "mayChange" | "closed">,
): AddScope {
  if (file.kind === "sheet") return file.sheetKind === "roles" ? "roles" : "candidates";
  if (file.docKind === "job_description") {
    const mine = ctx.campaign !== null && ctx.mayChange && !ctx.closed;
    return mine ? "job_description" : "roles";
  }
  return file.docKind === "resume" ? "candidates" : "read";
}

/** What a pasted Google Sheet's link is called on its chip: the sheet's title is not in the link, so it is the kind of thing it is. */
export const LINK_NAME = "Google Sheet";

/** The name for a link's chip: the plain name, and when another link's chip already has it, the end of this sheet's address too, to tell them apart. */
export function linkName(url: string, have: ReadonlyArray<Pick<Attachment, "name">>): string {
  if (!have.some((a) => a.name === LINK_NAME)) return LINK_NAME;
  const id = /\/d\/([A-Za-z0-9_-]+)/.exec(url)?.[1] ?? "";
  return `${LINK_NAME} …${id.slice(-4)}`;
}

/** Why a file cannot be this, in one calm line; null when it can. */
export function refusalFor(file: Pick<File, "name" | "type">, scope: AddScope): string | null {
  if (canBe(kindOf(file), scope)) return null;
  return scope === "read"
    ? `${file.name} is a spreadsheet, which I can't read here. Choose Candidates or Roles for it.`
    : `${file.name} is a spreadsheet. A job description is a document: choose More roles for a sheet of them.`;
}

/**
 * Whether one more file fits beside the chips already there, as the kind it will be; else the line that says why. One count
 * for every chip, the next campaign's job description among them.
 */
export function fits(
  have: readonly Attachment[],
  file: { name: string; size: number; link?: string },
  as: { kind: FileKind; scope: AddScope },
): string | null {
  // (A link whose chip failed is not added: it can be added again once its sharing is changed.)
  if (file.link && have.some((a) => a.link === file.link && a.status !== "failed")) return "That sheet is already added.";
  if (have.some((a) => a.origin === "file" && a.name === file.name && a.size === file.size)) return `${file.name} is already added.`;
  if (have.length >= MAX_FILES) return LIMIT_LINE;
  if (as.kind === "sheet" && have.filter((a) => a.kind === "sheet").length >= MAX_SHEETS) return `Up to ${MAX_SHEETS} sheets go in one message.`;
  if (as.scope === "read" && have.filter((a) => a.scope === "read").length >= MAX_READ) return `Up to ${MAX_READ} files can be read at once.`;
  if (as.scope === "job_description" && have.some((a) => a.scope === "job_description" || a.id === "next-jd")) {
    return "One job description for this campaign. Choose More roles for several.";
  }
  return null;
}

/* ── a Google Sheet's link, as a chip ── */

/** What the door for a link needs of the composer, so it runs without a page: the chips now, one added (and the failed ones it replaces taken off), one changed, the sheet read, and a line said to the person. */
export type LinkDoor = {
  chips: () => readonly Attachment[];
  add: (chip: Attachment, replacing: readonly string[]) => void;
  patch: (id: string, change: Partial<Attachment>) => void;
  /** The sheet read for the campaign the chat is on (or for Candidates), as a dropped sheet is read. */
  read: (url: string) => Promise<{ sheet: PeopleSheet; campaignId: string | null }>;
  /** What a sheet that was read is suggested to be. */
  suggest: (sheet: PeopleSheet) => AddScope;
  id: () => string;
  /** A line for the person; null takes the last one away. */
  say: (line: string | null) => void;
  /** An error in the server's words. */
  words: (err: unknown) => string;
};

/**
 * A Google Sheet's link, pasted or lifted out of the words, becomes a chip like a sheet that was dropped: read now, for free, and
 * suggested what it looks like (people, or roles) to change with one click. A sheet that can not be opened (one that needs a
 * sign-in) says so on its chip in the server's words, and the same link added again after its sharing is changed is a second try:
 * the failed chip gives way to the new one.
 */
export function takeLinks(urls: readonly string[], door: LinkDoor): void {
  if (!urls.length) return;
  door.say(null);
  const refused: string[] = [];
  let have = [...door.chips()];
  for (const url of urls) {
    const failed = have.filter((a) => a.link === url && a.status === "failed");
    const others = have.filter((a) => !failed.includes(a));
    const name = linkName(url, others);
    const why = fits(others, { name, size: 0, link: url }, { kind: "sheet", scope: "candidates" });
    if (why) {
      refused.push(why);
      if (why === LIMIT_LINE) break;
      continue;
    }
    const id = door.id();
    const chip: Attachment = { id, name, origin: "link", link: url, size: 0, status: "reading", text: "", kind: "sheet", suggested: true };
    have = [...others, chip];
    door.add(chip, failed.map((a) => a.id));
    door.read(url).then(
      (got) => door.patch(id, { status: "ready", sheet: got.sheet, readFor: got.campaignId, scope: door.suggest(got.sheet) }),
      (err) => {
        // As a file: more people than can be added at once is no reason to turn the sheet away, its card reads it with the words typed.
        const many = tooManyPeople(err);
        door.patch(id, many === null ? { status: "failed", note: door.words(err) } : { status: "ready", tooMany: many, scope: "candidates" });
      },
    );
  }
  if (refused.length) door.say(refused[0] ?? "");
}

/** A link left in the words (typed, or inside a longer paste) becomes a chip, and is taken out of the words. Whether there was one: the Send is held for it, so the chip is seen before anything goes. */
export function liftLinksFrom(typed: string, door: LinkDoor, setWords: (text: string) => void): boolean {
  const urls = sheetLinksIn(typed);
  if (!urls.length) return false;
  takeLinks(urls, door);
  setWords(withoutSheetLinks(typed));
  return true;
}

/* ── the line that says a file looks like something else ── */

export type Mismatch = {
  line: string;
  /** Buttons on the line: change the file's scope, or keep it as it is. */
  actions: Array<{ label: string; scope?: AddScope; keep?: true }>;
};

/**
 * One calm line when what the file turned out to be does not fit what it was chosen as. The chip is left out of Send until it
 * is settled; nothing is sent somewhere else on the quiet. A roles sheet picked as Candidates can be kept as candidates: its card
 * then says no one was found, and has the columns to choose from, so a people sheet with odd headers is not stuck on being read as roles.
 */
export function mismatch(chip: Attachment, ctx: Pick<AddContext, "campaign" | "campaignId" | "mayChange" | "closed">): Mismatch | null {
  if (chip.status === "ready" && chip.scope === "job_description" && !(ctx.campaign !== null && ctx.mayChange && !ctx.closed)) {
    // A job description is the open campaign's: the chat has moved on from it since the file was chosen, and the file goes nowhere on its own.
    return {
      line: `There is no campaign open to put ${chip.name} on.`,
      actions: [{ label: `Use as ${scopeLabel("roles", ctx).toLowerCase()}`, scope: "roles" }, { label: "Use as something to read", scope: "read" }],
    };
  }
  if (chip.status === "ready" && chip.scope === "job_description" && !chip.suggested && chip.onCampaign && ctx.campaignId && chip.onCampaign.id !== ctx.campaignId) {
    // The chat moved to another campaign after the file was chosen: it goes to the one it was chosen for, or nowhere, and never to this one on its own.
    return {
      line: `${chip.name} was chosen for ${chip.onCampaign.name}, and ${ctx.campaign} is open now.`,
      actions: [{ label: `Put it on ${ctx.campaign}`, scope: "job_description" }, { label: "Use as something to read", scope: "read" }],
    };
  }
  if (chip.status === "ready" && chip.scope === "job_description" && chip.suggested) {
    // A suggestion is never the one that writes: this puts the file on the campaign as its job description with no card to check, so the person says yes.
    return {
      line: `${chip.name} looks like a job description. Put it on ${ctx.campaign}?`,
      actions: [{ label: "Use as job description", scope: "job_description" }, { label: "Use as something to read", scope: "read" }],
    };
  }
  if (chip.kept || chip.status !== "ready" || !chip.scope) return null;
  const roles = scopeLabel("roles", ctx);
  if (chip.kind === "sheet" && chip.sheet) {
    if (chip.scope === "candidates" && chip.sheet.kind === "roles") {
      return {
        line: `${chip.name} reads like a list of roles, not people.`,
        actions: [{ label: `Use as ${roles.toLowerCase()}`, scope: "roles" }, { label: "Keep as candidates", keep: true }],
      };
    }
    if (chip.scope === "roles" && chip.sheet.kind === "people") {
      return {
        line: `${chip.name} reads like a list of people, not roles.`,
        actions: [{ label: "Use as candidates", scope: "candidates" }, { label: "Keep as roles", keep: true }],
      };
    }
    return null;
  }
  if (chip.kind === "document") {
    if ((chip.scope === "job_description" || chip.scope === "roles") && chip.docKind === "resume") {
      return {
        line: `${chip.name} reads like a resume, not a job description.`,
        actions: [{ label: "Use as something to read", scope: "read" }, { label: `Keep as ${chip.scope === "roles" ? "a role" : "job description"}`, keep: true }],
      };
    }
    if (chip.scope === "candidates" && chip.docKind === "job_description") {
      return {
        line: `${chip.name} reads like a job description. Candidates need a name and a LinkedIn link, email or phone.`,
        actions: [{ label: "Use as something to read", scope: "read" }, { label: "Keep as candidate", keep: true }],
      };
    }
  }
  return null;
}

/** What a chip says of what it is, beside its scope: the count a sheet held, or that it needs a look. */
export function resultWord(chip: Attachment): string {
  if (chip.status === "reading") return "Reading…";
  // A resume says whose it is when its first line is a name; the card says what was read.
  if (chip.kind === "document" && chip.scope === "candidates" && chip.docKind !== "job_description") return chip.status === "ready" ? (resumeHeadline(chip.text) ?? "Resume") : "";
  if (chip.kind === "sheet" && !chip.sheet && chip.tooMany) return `${chip.tooMany.toLocaleString("en-IN")} people`;
  if (chip.kind !== "sheet" || !chip.sheet) return "";
  if (chip.sheet.kind === "people") {
    const n = chip.sheet.counts.people;
    return `${n.toLocaleString("en-IN")} ${n === 1 ? "person" : "people"}`;
  }
  // A roles sheet the person kept as Candidates is not roles to them: its card asks which column is which.
  if (chip.sheet.kind === "roles" && !(chip.scope === "candidates" && chip.kept)) return "Roles";
  return "Needs a look";
}

/* ── the words that came with the files ── */

// What is left of the words once the campaigns named in them and the words of adding are taken out, and whether that is more than "add
// these": one definition, shared with the server (attachContract.ts), which asks the same way.
export { contentWords, hasInstruction };

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Said as a destination: "to / into / onto / on" and then the name ("add these to the Pune campaign"). Not "in" or "for": "the ones in sales" is a filter. */
const toward = (name: string) => new RegExp(`\\b(?:to|into|onto|on)\\s+(?:the\\s+|our\\s+|my\\s+)?${escaped(fold(name))}(?![\\p{L}\\p{N}])`, "u");

/** Every campaign whose whole name is among the words, the longer name where one holds the other ("Senior Backend" over "Backend"). */
export function campaignsIn(
  words: string,
  campaigns: ReadonlyArray<{ id: string; name: string }>,
): Array<{ id: string; name: string }> {
  const said = fold(words);
  const named = campaigns.filter((c) => {
    const name = fold(c.name).trim();
    return name.length >= 2 && new RegExp(`(?<![\\p{L}\\p{N}])${escaped(name)}(?![\\p{L}\\p{N}])`, "u").test(said);
  });
  return named.filter((c) => !named.some((o) => o !== c && fold(o.name).includes(fold(c.name))));
}

/**
 * The one campaign the words name as where the people go: a whole name among the campaigns the person may change, said as a
 * destination. Not a name that only appears ("only the ones in sales" is a filter, not a campaign called Sales), and not when
 * more than one campaign's name is in the words.
 */
export function campaignNamedIn(
  words: string,
  campaigns: ReadonlyArray<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const named = campaignsIn(words, campaigns);
  const only = named.length === 1 ? named[0] : undefined;
  return only && toward(only.name).test(fold(words)) ? only : null;
}

/** Under this label the turn that answers the person's words is kept, and no message of theirs is shown a second time. */
export const FOLLOW_UP_LABEL = "Your note on what you added";

/**
 * What the model is told when words came with files that are already on their cards: the person's words as they typed them, and
 * that it answers only what they asked besides adding. Null when the words ask nothing more, so every ask is answered or none is made.
 */
export const followUpOf = (words: string, names: readonly string[] = []): string | null =>
  hasInstruction(words, names, 1)
    ? `What I attached is on the card above. Nothing is added until I press its button. Answer only what I asked besides adding: ${words.trim()}`
    : null;

/**
 * What the agent is asked once the people are added, when the words typed beside a sheet held a next step the sheet's card could not do
 * ("start outreach to the ones who replied"): those parts alone, as the person typed them, from the card (nextStepsOf). Null when there
 * are none: a bare add, or words the card used, cost no turn and no model at all.
 */
export const followUpAfter = (steps: readonly string[]): string | null =>
  steps.length ? `The people are added. Answer only what I asked besides adding: ${steps.join("; ")}` : null;

/* ── the chips, as messages ── */

/** One line while several files are being read: how many are done of how many, so a slow batch is seen to move. */
export function readingNote(chips: readonly Attachment[]): string | null {
  const files = chips.filter((c) => c.origin !== "pasted" && c.id !== "next-jd");
  const left = files.filter((c) => c.status === "reading").length;
  return files.length >= 3 && left > 0 ? `Reading ${files.length - left} of ${files.length} files…` : null;
}

/**
 * Runs jobs at most `max` at a time, the rest waiting their turn in order. A place is held until the promise the job returns
 * settles, and the answer is that job's own: a job must hand back the work it started, or it frees its place at once.
 */
export function inTurns(max: number): <T>(job: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: Array<() => void> = [];
  const done = () => {
    running -= 1;
    waiting.shift()?.();
  };
  return <T>(job: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const go = () => {
        running += 1;
        (async () => job())().then(resolve, reject).finally(done);
      };
      if (running < max) go();
      else waiting.push(go);
    });
}

/** The people a sheet chip holds, for the placeholder and the card's line. */
const peopleOf = (chip: Attachment): number => (chip.sheet?.kind === "people" ? chip.sheet.counts.people : 0);

/** The placeholder once a scoped chip is ready: what Enter does is open the card to check, never add. */
export function placeholderFor(chips: readonly Attachment[], campaign: string | null): string | null {
  const ready = chips.filter((c) => c.scope && c.status === "ready");
  if (!ready.length || chips.some((c) => c.status === "reading")) return null;
  const sheets = ready.filter((c) => c.kind === "sheet" && c.scope === "candidates" && c.sheet?.kind === "people");
  if (sheets.length === ready.length) {
    const n = sheets.reduce((sum, c) => sum + peopleOf(c), 0);
    return `Press Enter to review ${n.toLocaleString("en-IN")} ${n === 1 ? "person" : "people"}${campaign ? ` for ${campaign}` : ""}, or say more first.`;
  }
  const resumes = ready.filter((c) => c.kind === "document" && c.scope === "candidates");
  if (resumes.length === ready.length) {
    return `Press Enter to review ${resumes.length === 1 ? "this resume" : `these ${resumes.length} resumes`}${campaign ? ` for ${campaign}` : ""}, or say more first.`;
  }
  const jd = ready.length === 1 ? ready.find((c) => c.scope === "job_description") : undefined;
  // (A dropped one is still waiting on a yes before anything is read, so Enter promises nothing yet.)
  if (jd?.suggested) return null;
  if (jd) return `Press Enter to draft the requirements${campaign ? ` for ${campaign}` : ""} from ${jd.name}, or say more first.`;
  return "Press Enter to review what you attached, or say more first.";
}

/** The words that stand for the files when nothing was typed: product text, never the recruiter's. */
function defaultText(groups: readonly AddingGroup[]): string {
  const said = (g: AddingGroup, what: string) => {
    const names = g.files.map((f) => f.name);
    return `${what} in ${names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`}`;
  };
  const roles = groups.find((g) => g.scope === "roles");
  const people = groups.find((g) => g.scope === "candidates");
  const resumes = people?.files.every((f) => f.kind !== "sheet");
  return `Add ${[roles && said(roles, "the roles"), people && said(people, resumes ? "the resumes" : "the people")].filter(Boolean).join(" and ")}`;
}

/** The longest file name the server takes in an add (modules/agent/adding.ts): a longer one is refused, and the whole message with it. */
const MAX_NAME = ADDING_LIMITS.name;

/** A file's name as the server takes it, cut in the middle so the ending that says what the file is stays. */
export function shortName(name: string): string {
  const whole = name.trim() || "file";
  if (whole.length <= MAX_NAME) return whole;
  const ending = /\.[A-Za-z0-9]{1,5}$/.exec(whole)?.[0] ?? "";
  return `${whole.slice(0, MAX_NAME - ending.length - 1).trimEnd()}…${ending}`;
}

/** The detail the transcript shows beside a file's name. */
const detailOf = (chip: Attachment): string | undefined => {
  const word = resultWord(chip);
  return word && chip.status === "ready" ? word : undefined;
};

/**
 * What a job description chosen for the campaign in the chat asks of the agent once the file is in: the requirements drafted from it,
 * on their card. It is the product's words and is answered in code, so no model reads the file or the ask.
 */
export const SHOW_REQUIREMENTS = "Show the requirements";

/** What the turn of a job description says while its file is read and the requirements are drafted, once it is, and when it did not go in. */
export const jdReading = (name: string): string => `Reading ${name} and drafting the requirements. This takes about a minute.`;
export const jdRead = (name: string): string => `Read ${name}`;
/**
 * `maybeDone`: the server did not say no. The request ran out of time, the connection dropped, or the answer was not the server's
 * own: it may have kept the file, and "unchanged" would not be known to be true.
 */
export const jdFailureLine = (name: string, said: string, maybeDone = false): string =>
  maybeDone
    ? /may have gone through/.test(said)
      ? said
      : `Couldn't confirm that ${name} was saved. It may have gone through, so check the job description before you try again.`
    : `Couldn't save ${name}: ${said.trim().replace(/[.!?]+$/, "")}. The job description is unchanged.`;

export type Outgoing = {
  text: string;
  adding?: Adding;
  /** The campaign the message is for. */
  campaignId?: string | undefined;
  /** Set for the turn that answers the person's words: it goes under this label and shows no message of theirs, since the words are already in the chat. */
  quiet?: string;
  /** Sheets and roles the cards wait for, kept by `adding.id` until the card opens. */
  keep?: { people: Attachment[]; roles: Attachment[]; resumes: Attachment[]; words: string | null; picked: string | null; say: string | null };
  /**
   * A job description that goes to the campaign by its own route (the file is kept, the old one stays as a version, the requirements
   * are drafted from it) before this message is sent. `then` is what is asked after the message when this message is the person's own
   * words; none when this message is itself the ask to show the requirements.
   */
  jd?: { file: File; name: string; campaignId: string; then: { text: string; label: string } | null };
};

export type SendContext = {
  campaign: { id: string; name: string } | null;
  mayChange: boolean;
  closed: boolean;
  /** The campaigns the person may change, to find the ones the words name. */
  campaigns: ReadonlyArray<{ id: string; name: string }>;
  /** A fresh id for the add. */
  id: string;
  /** Composing a message about no campaign: the filters set for the next one go at its end. */
  tail?: string | null;
  /** The server does not take the paperclip's choice (it is not on, or not known to be: addingFlag.ts): the Send goes as the words it has always understood. */
  legacy?: boolean;
};

const asContext = (ctx: SendContext): Pick<AddContext, "campaign" | "campaignId" | "mayChange" | "closed"> => ({
  campaign: ctx.campaign?.name ?? null,
  campaignId: ctx.campaign?.id ?? null,
  mayChange: ctx.mayChange,
  closed: ctx.closed,
});

/** Whether a chip goes in what is sent: ready, and not waiting on a line that asks the person to decide. */
export const sendable = (chip: Attachment, ctx: Pick<AddContext, "campaign" | "campaignId" | "mayChange" | "closed">): boolean =>
  chip.status === "ready" && !mismatch(chip, ctx) && (chip.scope !== "job_description" || chip.file !== undefined);

/** The scoped chips of a draft: the ones that were chosen or suggested, as against pasted text and the next campaign's job description. */
export const scoped = (items: readonly Attachment[]): Attachment[] => items.filter((a) => a.scope !== undefined);

/**
 * The messages a Send makes when files were chosen, and which chips they took (the rest stay in the composer, each with its line).
 * One code-only message adds the people (sheets already read, and resumes the card reads itself, all in one batch) and the roles
 * (the cards open on what was already read); files to read are a turn of the agent after it, framed as they always were. A job description for the campaign in the chat is not
 * read by the agent at all: its file goes up by the campaign's own route (`jd`) and the message that follows asks to show the
 * requirements. The person's words are the add's own message when it is alone, else they go with the document; they are never
 * replaced. A campaign the words name as where the people go is used. What else they asked is read by the sheet's card when there is
 * a sheet of people (and reaches the agent only from there, once they are added); with none, it is a turn of its own. Null when no
 * file was chosen: the message goes as it always did.
 */
export function outgoing(
  items: readonly Attachment[],
  typed: string,
  ctx: SendContext,
): { messages: Outgoing[]; taken: string[]; usedBrief: boolean } | null {
  if (!scoped(items).length) return null;
  if (ctx.legacy) return legacyOutgoing(items, typed, ctx);
  const here = asContext(ctx);
  const chips = scoped(items).filter((c) => sendable(c, here));
  const words = typed.trim();
  const mine = ctx.campaign !== null && ctx.mayChange && !ctx.closed;
  const page = ctx.campaign?.id;
  const named = words ? campaignNamedIn(words, ctx.campaigns) : null;
  const toId = named?.id ?? (mine ? page : undefined);

  const people = chips.filter((c) => c.scope === "candidates" && c.kind === "sheet");
  const roles = chips.filter((c) => c.scope === "roles");
  const resumes = chips.filter((c) => c.scope === "candidates" && c.kind !== "sheet");
  const jd = chips.filter((c) => c.scope === "job_description");
  const read = chips.filter((c) => c.scope === "read");
  const unscoped = items.filter((c) => c.scope === undefined && c.status === "ready");
  const framed: Array<{ scope: "job_description" | "read"; chips: Attachment[] }> = [];
  if (jd.length) framed.push({ scope: "job_description", chips: jd });
  if (read.length) framed.push({ scope: "read", chips: read });

  const taken = [...chips, ...unscoped].map((c) => c.id);
  const out: Outgoing[] = [];
  const file = (c: Attachment, kind: "sheet" | "document"): AddingGroup["files"][number] => ({
    name: shortName(c.name),
    kind,
    ...(detailOf(c) ? { detail: detailOf(c) } : {}),
  });
  const addGroups: AddingGroup[] = [];
  if (roles.length) addGroups.push({ scope: "roles", files: roles.map((c) => file(c, c.kind ?? "document")) });
  const candidates = people.length + resumes.length;
  if (candidates) addGroups.push({ scope: "candidates", files: [...people.map((c) => file(c, "sheet")), ...resumes.map((c) => file(c, "document"))] });
  // The words ride with a document when there is one (a turn, or the pasted text); else they are the add's own message.
  const carrier = unscoped.length > 0 || framed.length > 0;
  if (addGroups.length) {
    out.push({
      text: !carrier && words ? words : defaultText(addGroups),
      adding: { id: ctx.id, defaulted: carrier || !words, groups: addGroups },
      ...(candidates && toId ? { campaignId: toId } : {}),
      // `say`: the words as typed, for the sheets' card to read with their shapes; they go whether or not the add carries them as its message.
      keep: { people, roles, resumes, words: !carrier && words && candidates && named ? words : null, picked: candidates && named ? named.name : null, say: people.length && words ? words : null },
    });
  }
  // Words typed beside nothing that can be sent (a file that failed, or one waiting on its line) still go, as the message they were.
  let lead = carrier || !addGroups.length ? words : "";
  for (const turn of framed) {
    if (turn.scope === "job_description") {
      /* The file goes up by the campaign's own route (kept, the old one stays as a version, the requirements drafted from it), and
         the agent is not asked to read it. Words typed beside it are theirs, as typed; the ask to show the requirements follows them. */
      const chip = turn.chips[0];
      if (chip?.file && page) {
        const said = lead;
        lead = "";
        out.push({
          text: said || SHOW_REQUIREMENTS,
          campaignId: page,
          adding: { id: `${ctx.id}-job_description`, defaulted: !said, groups: [{ scope: "job_description", files: turn.chips.map((c) => file(c, "document")) }] },
          jd: { file: chip.file, name: shortName(chip.name), campaignId: page, then: said ? { text: SHOW_REQUIREMENTS, label: SHOW_REQUIREMENTS } : null },
        });
      }
      continue;
    }
    const marked = turn.chips.map((c): Attachment => ({ ...c, docKind: "document" }));
    const { text } = composeMessage(lead, marked, {
      lead: "Read what I attached and tell me what it says.",
      tail: "These files are for reading only. Nothing is to be added from them.",
    });
    lead = "";
    const campaignId = page;
    out.push({
      text,
      ...(campaignId ? { campaignId } : {}),
      adding: {
        id: `${ctx.id}-${turn.scope}`,
        defaulted: false,
        groups: [{ scope: turn.scope, files: turn.chips.map((c) => file(c, "document")) }],
      },
    });
  }
  const brief = unscoped.length > 0 || (!chips.length && words !== "");
  if (brief) {
    const { text } = composeMessage(lead, unscoped, page ? { campaignName: ctx.campaign?.name } : { newCampaign: true, tail: ctx.tail ?? null });
    lead = "";
    if (text) out.push({ text, ...(page ? { campaignId: page } : {}) });
  }
  /* What the words asked besides adding. With a sheet of people in the Send, the sheet's card is the one reader of the words (it reads
     them beside the sheet's shapes), and the agent hears only what that reading could not do, from the card, once the people are in
     (followUpAfter): a turn here would be a model call that cannot see the card, before anyone is added, and could contradict it. With
     none (resumes, roles), no card reads the words, and the agent answers them as it always did. */
  const rest = !carrier && !people.length && words && addGroups.length ? followUpOf(words, campaignsIn(words, ctx.campaigns).map((c) => c.name)) : null;
  if (rest) {
    const campaignId = toId ?? page ? { campaignId: toId ?? page } : {};
    if (!resumes.length) out.push({ text: rest, quiet: FOLLOW_UP_LABEL, ...campaignId });
    else {
      /* A resume is on its card as people to add, not as text the agent could be asked about, so a question about the file would be
         answered blind. Its text goes with the question, in a turn for reading only (nothing is written from it), as many as the
         server reads at once. */
      const seen = resumes.slice(0, MAX_READ);
      const cut = resumes.length > seen.length ? ` Only the first ${seen.length} of ${resumes.length} resumes are here.` : "";
      const { text } = composeMessage(rest, seen.map((c): Attachment => ({ ...c, docKind: "document" })), {
        tail: `These files are for reading only. Nothing is to be added from them.${cut}`,
      });
      out.push({
        text,
        quiet: FOLLOW_UP_LABEL,
        adding: { id: `${ctx.id}-follow`, defaulted: false, groups: [{ scope: "read", files: seen.map((c) => file(c, "document")) }] },
        ...campaignId,
      });
    }
  }
  return { messages: out, taken: out.length ? taken : [], usedBrief: brief && out.length > 0 };
}

/** The words that open the roles import, as they were before the paperclip's choice was sent: the server reads them as a request for roles in bulk. */
export const ROLES_MESSAGE = "Add roles in bulk";

/**
 * What a Send makes of the files when the server does not take the paperclip's choice (it drops the field, and an add would arrive as
 * words with no card): nothing is sent as the choice. A sheet of people and the roles go as the fixed words that open their cards,
 * which find their files where the composer left them (not by the add's id, which they were never told); a document goes as it always
 * did, framed in the message; and the person's words go as their own, never as a phrase in their place. Nothing here needs the server
 * to know more than it did, and what the person chose still decides which card each sheet goes to.
 */
export function legacyOutgoing(
  items: readonly Attachment[],
  typed: string,
  ctx: SendContext,
): { messages: Outgoing[]; taken: string[]; usedBrief: boolean } {
  const here = asContext(ctx);
  const chips = scoped(items).filter((c) => sendable(c, here));
  const words = typed.trim();
  const mine = ctx.campaign !== null && ctx.mayChange && !ctx.closed;
  const page = ctx.campaign?.id;
  const named = words ? campaignNamedIn(words, ctx.campaigns) : null;
  const toId = named?.id ?? (mine ? page : undefined);
  const people = chips.filter((c) => c.scope === "candidates" && c.kind === "sheet");
  const roles = chips.filter((c) => c.scope === "roles");
  // Every document that is not roles goes in the message, as one attached to it always did: a resume, a job description, something to read.
  const carried = [...chips.filter((c) => c.kind !== "sheet" && c.scope !== "roles"), ...items.filter((c) => c.scope === undefined && c.status === "ready")];
  const keep = (over: Partial<NonNullable<Outgoing["keep"]>>): NonNullable<Outgoing["keep"]> => ({ people: [], roles: [], resumes: [], words: null, picked: null, say: null, ...over });
  const out: Outgoing[] = [];
  if (roles.length) out.push({ text: ROLES_MESSAGE, keep: keep({ roles }) });
  if (people.length) out.push({ text: PEOPLE_MESSAGE, ...(toId ? { campaignId: toId } : {}), keep: keep({ people }) });
  let brief = false;
  if (carried.length || words) {
    const { text } = composeMessage(words, carried, page ? { campaignName: ctx.campaign?.name } : { newCampaign: true, tail: ctx.tail ?? null });
    if (text) {
      out.push({ text, ...(page ? { campaignId: page } : {}) });
      brief = true;
    }
  }
  return { messages: out, taken: out.length ? [...chips, ...items.filter((c) => c.scope === undefined && c.status === "ready")].map((c) => c.id) : [], usedBrief: brief };
}

/**
 * The chips chosen as roles, as the roles import takes them: a sheet as the file itself, a document as the description already read
 * (the card reads no document again). A job description chosen with no campaign open is one such description.
 */
export const rolesSeedOf = (chips: readonly Attachment[]): Partial<ImportSeed> => ({
  files: chips.flatMap((c) => (c.kind === "sheet" && c.file ? [c.file] : [])),
  links: chips.flatMap((c) => (c.kind === "sheet" && c.link ? [c.link] : [])),
  texts: chips.filter((c) => c.kind !== "sheet").map((c) => ({ label: c.name.replace(/\.[a-z0-9]+$/i, ""), jd: c.text })),
});

/** The messages of a Send as the chat sends them: each with the choice it carries, and the work a job description's message waits for. */
export const partsOf = (messages: readonly Outgoing[], beforeJd: (jd: NonNullable<Outgoing["jd"]>) => Before) =>
  messages.map((m) => ({
    text: m.text,
    campaignId: m.campaignId,
    ...(m.quiet ? { quiet: m.quiet } : {}),
    ...(m.adding ? { structured: { adding: m.adding } } : {}),
    ...(m.jd ? { before: beforeJd(m.jd) } : {}),
  }));

/** How a message that carries the choice shows its files in the transcript: name, what it was chosen as, and what it held. */
export type AddedFile = { name: string; scope: AddScope; detail?: string };

export function filesOfAdding(adding: Adding | undefined): AddedFile[] {
  return (adding?.groups ?? []).flatMap((g) => g.files.map((f) => ({ name: f.name, scope: g.scope, ...(f.detail ? { detail: f.detail } : {}) })));
}

/** The same files from a message the server kept (`artifact.files`), after a reload. */
export function filesOfArtifact(artifact: Record<string, unknown> | null | undefined): AddedFile[] {
  if (artifact?.kind !== "adding" || !Array.isArray(artifact.files)) return [];
  return artifact.files.flatMap((f: unknown): AddedFile[] => {
    if (!f || typeof f !== "object") return [];
    const o = f as Record<string, unknown>;
    const scope = o.scope;
    if (typeof o.name !== "string" || (scope !== "candidates" && scope !== "roles" && scope !== "job_description" && scope !== "read")) return [];
    return [{ name: o.name, scope, ...(typeof o.detail === "string" && o.detail ? { detail: o.detail } : {}) }];
  });
}
