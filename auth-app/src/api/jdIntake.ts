import type { JdFacts } from "../jdIntake";
import { api } from "./client";

/**
 * Reading job descriptions for the add-a-role flow (server: modules/campaigns/jd-facts.ts and jd-sheet.ts). A reading
 * is a model call that takes seconds; a sheet is read without one.
 */

export type SheetRole = { title: string | null; jd: string; hints: Record<string, string>; row: number };
/** A row of the sheet that did not become a role: its place (the header being row 1) and why. */
export type LeftOut = { row: number; why: "too-little" | "repeat" | "over-limit" };
export type SheetRoles = { roles: SheetRole[]; skipped: number; duplicates?: number; left?: LeftOut[] };

const READ_MS = 90_000;

export const jdApi = {
  /** One description into the facts it states. Contact details are taken out of the text that comes back. */
  read: (text: string, hints: Record<string, string> = {}) =>
    api<{ jd: string; facts: JdFacts }>("POST", "/v1/campaigns/jd/read", { text, hints }, { timeoutMs: READ_MS }),
  /** An Excel file or a CSV: one role a row. The body is the file itself, sent as its own type. */
  sheetFile: (file: Blob, type: string) =>
    api<SheetRoles>("POST", "/v1/campaigns/jd/sheet", file, { headers: { "content-type": type } }),
  /** A Google Sheet that anyone with the link may view. */
  sheetLink: (url: string) => api<SheetRoles>("POST", "/v1/campaigns/jd/sheet", { url }, { timeoutMs: 30_000 }),
};
