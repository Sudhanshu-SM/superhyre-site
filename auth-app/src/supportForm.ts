import { ApiError } from "./api/client";
import { readable } from "./api/identity";
import { routeFromHash, settingsSectionFromHash } from "./nav";
import type { SupportReceipt, SupportRequest, SupportTopic } from "./api/support";

/**
 * The Support page's rules, apart from its screen: what each field needs, which file is taken, what a failed
 * send says, and which page the person was on. The server holds the same limits and says no again.
 */

/** Where a person writes when they would rather email: the public contact. */
export const SUPPORT_EMAIL = "punith@superhyre.com";

export const TOPICS: ReadonlyArray<{ id: SupportTopic; label: string }> = [
  { id: "question", label: "Question" },
  { id: "problem", label: "Something is not working" },
  { id: "feedback", label: "Feedback" },
  { id: "billing", label: "Billing or account" },
  { id: "other", label: "Other" },
];

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 5000;
export const SUBJECT_MAX = 120;
export const NAME_MAX = 120;
export const FILE_MAX_BYTES = 5 * 1024 * 1024;

export type Draft = { name: string; email: string; topic: SupportTopic; subject: string; message: string };
export type Field = "name" | "email" | "subject" | "message";
export type Problems = Partial<Record<Field, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** What each field still needs, in words a person can act on. Empty when the message can go. */
export function draftProblems(d: Draft): Problems {
  const out: Problems = {};
  if (!d.name.trim()) out.name = "Add your name so we know who to reply to.";
  else if (d.name.trim().length > NAME_MAX) out.name = `Keep your name under ${NAME_MAX} characters.`;
  const email = d.email.trim();
  if (!email) out.email = "Add the email we should reply to.";
  else if (!EMAIL.test(email) || email.length > 254) out.email = "That email doesn't look right.";
  if (d.subject.trim().length > SUBJECT_MAX) out.subject = `Keep the subject under ${SUBJECT_MAX} characters.`;
  const message = d.message.trim();
  if (!message) out.message = "Write your message here.";
  else if (message.length < MESSAGE_MIN) out.message = `A little more, please: at least ${MESSAGE_MIN} characters.`;
  else if (message.length > MESSAGE_MAX) out.message = `That's over ${MESSAGE_MAX.toLocaleString("en-US")} characters. Please shorten it.`;
  return out;
}

export const messageCount = (message: string): string =>
  `${message.trim().length.toLocaleString("en-US")} / ${MESSAGE_MAX.toLocaleString("en-US")}`;

/* ── the one attachment ── */

const BY_EXTENSION: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", pdf: "application/pdf", txt: "text/plain" };
const TYPES = new Set(Object.values(BY_EXTENSION));

/** What the picker offers. */
export const FILE_ACCEPT = ".png,.jpg,.jpeg,.pdf,.txt,image/png,image/jpeg,application/pdf,text/plain";

/** The type the file goes as: its own, or what its extension says when the browser gave none. Null if not taken. */
export function fileType(f: { name: string; type: string }): string | null {
  const own = f.type.toLowerCase();
  if (TYPES.has(own)) return own;
  if (own && own !== "application/octet-stream") return null;
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  return BY_EXTENSION[ext] ?? null;
}

/** Why a file is not taken, in one calm line; null when it is. */
export function fileProblem(f: { name: string; size: number; type: string }): string | null {
  if (!fileType(f)) return "Attach a PNG, JPG, PDF or text file.";
  if (f.size === 0) return "That file is empty.";
  if (f.size > FILE_MAX_BYTES) return "That file is over 5 MB. Choose a smaller one.";
  return null;
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The file's bytes as base64 (in chunks: a 5 MB file does not fit one `fromCharCode` call). */
export async function base64Of(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/* ── which page they were on ── */

let before: string | null = null;

/** Remembers the page named by the address, unless it is Support itself (the page they came from is what we want). */
export function rememberPage(hash: string): void {
  // Support is a section of Settings now: its own address is not a page they came from.
  if (settingsSectionFromHash(hash) === "support") return;
  const id = routeFromHash(hash);
  if (id !== "support") before = id.replace(/[^a-z0-9-]/g, "-").slice(0, 40);
}

/** The console route the person was on before Support: its name only, never an address with ids. */
export const pageBeforeSupport = (): string | null => before;

/* ── sending ── */

export type Outcome =
  | { kind: "sent"; emailed: boolean }
  | { kind: "failed"; message: string; /** A refusal of the message itself: trying again as it is cannot work. */ editable: boolean };

export type Send = (request: SupportRequest) => Promise<SupportReceipt>;

export async function sendSupport(
  draft: Draft,
  file: File | null,
  page: string | null,
  send: Send,
): Promise<Outcome> {
  try {
    const type = file ? fileType(file) : null;
    const attachment = file && type ? { name: file.name, type, data: await base64Of(file) } : null;
    const receipt = await send({
      name: draft.name.trim(),
      email: draft.email.trim(),
      topic: draft.topic,
      subject: draft.subject.trim(),
      message: draft.message.trim(),
      page,
      attachment,
    });
    return { kind: "sent", emailed: receipt.emailed };
  } catch (err) {
    if (err instanceof ApiError) {
      // A server that has no such route yet answers "Not found.": not something to put in front of anyone.
      const message = err.status === 404 ? "We couldn't send that just now." : readable(err);
      return { kind: "failed", message, editable: err.status === 400 };
    }
    return { kind: "failed", message: "Your message is still here.", editable: false };
  }
}
