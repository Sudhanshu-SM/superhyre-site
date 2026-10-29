import type { ReadOptions } from "./api/peopleSheet";
import type { SheetSeed } from "./peopleSeed";
import type { PeopleSheet } from "./peopleSheet";

/**
 * How a spreadsheet attached in the chat, or a Google Sheet's link pasted in it, is read. A sheet of people becomes the
 * people card; a sheet of roles (job descriptions) keeps going to the roles import it always went to. What decides is what
 * is in the sheet, which only the server reads, so each is read first (reading changes nothing), and the chip it is on
 * is suggested what it looks like. A sheet that is neither goes to the people card, which says in words what a sheet of
 * people needs and offers to read it as roles. A sheet that cannot be read at all is told to the person by name.
 */

export type SheetReader = (file: File, options: ReadOptions) => Promise<PeopleSheet>;
export type LinkReader = (url: string, options: ReadOptions) => Promise<PeopleSheet>;

export type SheetRouting = {
  people: SheetSeed[];
  roles: File[];
  failed: Array<{ name: string; error: unknown }>;
};

/** Spreadsheet files by their name or their type; a pasted one often has no type, and Windows calls a CSV "ms-excel". */
export const isSheetName = (f: Pick<File, "name" | "type">): boolean =>
  /\.(xlsx|xls|csv|tsv)$/i.test(f.name) ||
  f.type === "text/csv" ||
  f.type === "text/tab-separated-values" ||
  f.type === "application/vnd.ms-excel" ||
  f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Read = { sheet: PeopleSheet; campaignId: string | null } | { error: unknown };

/** Reads a sheet for the campaign the chat is on; a campaign the person may not change, or one that is closed, is no reason to refuse it: read it for Candidates. */
async function readFor(campaignId: string | null, ask: (options: ReadOptions) => Promise<PeopleSheet>): Promise<Read> {
  try {
    return { sheet: await ask({ campaignId }), campaignId };
  } catch (first) {
    if (!campaignId) return { error: first };
    try {
      return { sheet: await ask({ campaignId: null }), campaignId: null };
    } catch {
      return { error: first };
    }
  }
}

/** One sheet read when it is attached (the paperclip's chip), for the campaign the chat is on or, failing that, for Candidates. */
export async function readOne(file: File, campaignId: string | null, read: SheetReader): Promise<{ sheet: PeopleSheet; campaignId: string | null }> {
  const got = await readFor(campaignId, (options) => read(file, options));
  if ("error" in got) throw got.error;
  return got;
}

export async function routeSheets(files: readonly File[], campaignId: string | null, read: SheetReader): Promise<SheetRouting> {
  const out: SheetRouting = { people: [], roles: [], failed: [] };
  const reads = await Promise.all(files.map(async (file) => ({ file, got: await readFor(campaignId, (options) => read(file, options)) })));
  for (const { file, got } of reads) {
    if ("error" in got) out.failed.push({ name: file.name || "That sheet", error: got.error });
    else if (got.sheet.kind === "roles") out.roles.push(file);
    else out.people.push({ file, link: null, read: got.sheet, campaignId: got.campaignId });
  }
  return out;
}

/**
 * One Google Sheet's link read when it is pasted (the chip's read), as a file's is: for the campaign the chat is on or, failing
 * that, for Candidates. What is in the sheet then decides what the chip is suggested to be, and the chip's scope routes it.
 */
export async function readLinkOne(url: string, campaignId: string | null, read: LinkReader): Promise<{ sheet: PeopleSheet; campaignId: string | null }> {
  const got = await readFor(campaignId, (options) => read(url, options));
  if ("error" in got) throw got.error;
  return got;
}

/** The words that say a list of roles is meant (campaigns to make from them), not people to add. */
export const ROLE_WORDS = /\b(campaigns?|roles?|jds?|job descriptions?|openings?|positions?|vacanc\w+|hir(?:e|ing))\b/i;
