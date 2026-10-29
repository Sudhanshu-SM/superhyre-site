import { useEffect, useState } from "react";
import { jdApi, setCampaignJd } from "./api/campaigns";
import type { ApiJobDescription } from "./api/campaigns";
import { ApiError, LIVE, messageOf } from "./api/client";
import { jdFailureLine, jdRead, jdReading } from "./adding";
import { typeOf } from "./attachments";
import { download } from "./exportTable";
import { invalidate } from "./invalidate";
import type { Before } from "./liveChat";

/**
 * A campaign's job description, in the popup its header opens: read from the server (`GET /v1/campaigns/:id/jd`), said
 * in a line ("Added 2 Sep by Ana Rao"), downloaded as the file that was uploaded, and replaced by pasting text or
 * uploading a file. The server keeps the earlier versions; the popup shows the one that stands.
 *
 * Voice (the Overview's): absolute dates only, no " · ", no dashes, sentence case.
 */

/* ── what it says ── */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2 Sep", with the year when it is not this one. */
export function addedOn(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`}`;
}

/** Who put it there, in words: a person's name, or what did it when no person did. */
function addedBy(jd: Pick<ApiJobDescription, "addedBy" | "source">): string {
  if (jd.addedBy) return jd.addedBy;
  if (jd.source === "agent") return "the agent";
  if (jd.source === "extension") return "the Chrome extension";
  return "";
}

/** "Added 2 Sep by Ana Rao"; whatever part the server did not say is left out, and nothing at all when it said neither. */
export function addedLine(jd: Pick<ApiJobDescription, "addedAt" | "addedBy" | "source">, now = new Date()): string {
  const on = jd.addedAt ? addedOn(jd.addedAt, now) : "";
  const by = addedBy(jd);
  return [on && `Added ${on}`, by && (on ? `by ${by}` : `Added by ${by}`)].filter(Boolean).join(" ");
}

/* ── what a replacement may be ── */

/** The server reads these, and keeps them: PDF, Word, plain text, and a picture of a page. */
const TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
]);
export const JD_FILE_TYPES = ".pdf,.docx,.txt,.png,.jpg,.jpeg";
export const JD_MAX_BYTES = 10 * 1024 * 1024;
/**
 * What the server asks of a pasted description (the same rule for a text saved here and one drafted from), so Save is
 * only offered for one it will take. Nothing else is refused: an address to send a CV to, an equal-opportunity line,
 * all of it is part of a real description.
 */
export const JD_MIN_CHARS = 80;
export const JD_MAX_CHARS = 30_000;

/** Why a file is not taken, in one calm line, or null when it is. */
export function jdFileRefusal(file: Pick<File, "name" | "type" | "size">): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > JD_MAX_BYTES) return `${file.name} is over 10 MB. Use a smaller file.`;
  if (/\.doc$/i.test(file.name) || file.type === "application/msword") {
    return `${file.name} is an old Word file. Save it as .docx or PDF and upload it again.`;
  }
  if (!TYPES.has(typeOf(file))) return `Upload a PDF, Word (.docx), text or image file, not ${file.name}.`;
  return null;
}

/** Whether pasted text can be saved as a description. */
export const pasteOk = (text: string): boolean => text.trim().length >= JD_MIN_CHARS && text.trim().length <= JD_MAX_CHARS;

/** Why pasted text cannot be saved yet, in one calm line; null when it can be, and while nothing has been typed. */
export function pasteHint(text: string): string | null {
  const n = text.trim().length;
  if (n === 0 || pasteOk(text)) return null;
  return n < JD_MIN_CHARS
    ? `A little more, please. The job description needs at least ${JD_MIN_CHARS} characters.`
    : `That is more than we keep. The most is ${JD_MAX_CHARS.toLocaleString("en-US")} characters.`;
}

/* ── the store: one read per campaign, read again when it changes ── */

export type JdState = {
  jd: ApiJobDescription | null;
  status: "loading" | "ready" | "failed";
  /** A read made after the first one did not come back: what is shown is the last one that did, and may be out of date. */
  refreshFailed: boolean;
};

const readers = new Map<string, Set<() => void>>();

/** Reads a campaign's description again, wherever it is showing. */
export function reloadCampaignJd(campaignId: string): void {
  for (const again of readers.get(campaignId) ?? []) again();
}

/**
 * What a read that did not come back leaves on screen: the last description that did, marked as possibly out of date
 * (a first read that failed has nothing to show, and says so).
 */
export const afterFailedRead = (s: JdState): JdState => ({ jd: s.jd, status: s.jd ? "ready" : "failed", refreshFailed: s.jd !== null });

/** What a place that has read nothing yet shows. */
const NOT_READ: JdState = { jd: null, status: "loading", refreshFailed: false };

/** What was read, and for which campaign: a page that moves from one campaign to another keeps its place, and must not keep the first one's text. */
export type HeldJd = JdState & { campaignId: string };

/** What is held for this campaign: only a read that was made for it. Another campaign's description is never shown under it. */
export const heldFor = (held: HeldJd | null, campaignId: string): JdState => (held && held.campaignId === campaignId ? held : NOT_READ);

/**
 * The description of a campaign. `signal` is anything that changes when the campaign's brief does (its saved
 * description text), so a change made in the chat or by a teammate is read here too. With no campaign (an empty id)
 * there is nothing to read. The Agent page stays mounted as the chat moves from one campaign to another, so what is
 * held is named for the campaign it was read for.
 */
export function useCampaignJd(campaignId: string, signal = ""): JdState & { reload: () => void; rereading: boolean } {
  const [held, setHeld] = useState<HeldJd | null>(null);
  const [tick, setTick] = useState(0);
  /* The newest asked-for read (by `tick`) that has answered, either way: a place that has just saved waits for it
     instead of showing the text that was there before. The first read is `status: "loading"`, not this. */
  const [answered, setAnswered] = useState(0);
  useEffect(() => {
    if (!LIVE || !campaignId) return undefined;
    let stopped = false;
    jdApi.read(campaignId).then(
      (jd) => { if (!stopped) { setHeld({ campaignId, jd, status: "ready", refreshFailed: false }); setAnswered(tick); } },
      /* What was on screen for this campaign stays, and says it may be out of date; only a first read that failed says it could not load. */
      () => { if (!stopped) { setHeld((h) => ({ campaignId, ...afterFailedRead(heldFor(h, campaignId)) })); setAnswered(tick); } },
    );
    return () => { stopped = true; };
  }, [campaignId, signal, tick]);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    const set = readers.get(campaignId) ?? new Set<() => void>();
    set.add(again);
    readers.set(campaignId, set);
    return () => { set.delete(again); };
  }, [campaignId]);
  return { ...heldFor(held, campaignId), reload: () => setTick((n) => n + 1), rereading: LIVE && campaignId !== "" && answered < tick };
}

/**
 * The description's text for a place that shows it away from the popup (the Agent page's dialog): the one the
 * server says stands now, once it has been read, else what the page already knew. The text of the approved
 * requirements is that only until the description is replaced; the server's answer is the one the popup shows too.
 */
export const liveJdTextOf = (read: Pick<ApiJobDescription, "text"> | null, known: string): string => (read ? (read.text ?? "") : known).trim();

/* ── doing something with it ── */

export type FileState = { s: "idle" } | { s: "working" } | { s: "failed"; message: string };

/**
 * Fetches the original file with the person's own token and hands it to the browser to save. It asks for the very
 * version of the requirements the file belongs to (`file.specId`, as it was read), so a teammate replacing the
 * description in the meantime cannot hand over a different file under this one's name. The outcome is a state to show,
 * never a thrown error: a refusal says its own sentence.
 */
export async function takeJdFile(
  campaignId: string,
  file: { name: string; specId: string },
  io: { fetchFile: (campaignId: string, specId: string) => Promise<Blob>; save: (file: Blob, filename: string) => void } = {
    fetchFile: (id, specId) => jdApi.file(id, specId),
    save: (blob, filename) => download(blob, blob.type || "application/octet-stream", filename),
  },
): Promise<FileState> {
  try {
    io.save(await io.fetchFile(campaignId, file.specId), file.name);
    return { s: "idle" };
  } catch (err) {
    return { s: "failed", message: messageOf(err) };
  }
}

/** What the person is told once a replacement is in. */
export const SAVED_TEXT = "Job description saved. The requirements stay as they are.";
export const SAVED_FILE = "Job description saved. New requirements are drafted from it, for you to review.";
/** What the form says when Save finds the description changed since the form was opened: nothing is sent, and the next Save replaces theirs on purpose. */
export const CHANGED_MEANWHILE = "Someone else changed the job description while you were editing. Your own text is still in the box, and Save will replace theirs.";

/**
 * Replaces the description with pasted text, or with a file. A file is kept as it was uploaded and read into new
 * requirements (the same endpoint the requirements page uses); pasted text only replaces the text. Requirements that
 * were drafted from the text it replaces keep that text; the page re-reads the description once the server has it.
 */
export async function replaceJd(
  campaignId: string,
  input: { text: string } | { file: File },
  io: Pick<typeof jdApi, "upload"> & { save: typeof setCampaignJd } = { upload: jdApi.upload, save: setCampaignJd },
): Promise<string> {
  if ("file" in input) {
    await io.upload(campaignId, input.file, typeOf(input.file));
    invalidate(["spec"], { campaignId });
    reloadCampaignJd(campaignId);
    return SAVED_FILE;
  }
  await io.save(campaignId, input.text.trim());
  invalidate(["campaign"], { campaignId });
  reloadCampaignJd(campaignId);
  return SAVED_TEXT;
}

/**
 * Whether the server itself said no before it did anything: its own refusal (4xx) or its own 503 (an answer with its code in it). No
 * answer, a page that is not its own, a 500 or a time-out leave it unknown whether the file went in, and the draft goes on without us.
 */
const refusedBy = (err: unknown): boolean =>
  err instanceof ApiError && err.code !== "error" && ((err.status >= 400 && err.status < 500) || err.status === 503);

/**
 * A job description picked from the paperclip for the campaign in the chat, as the work its message waits for (liveChat.ts): the
 * file goes up by the same route the job description popup uses, so it is kept, the old one stays as a version, and the requirements
 * are drafted from it. No chat model reads it, and no frame of the message is saved with it. `then`: what is asked once the
 * message is in (the person's own words came first).
 */
export function jdBefore(
  jd: { file: File; name: string; campaignId: string; then: { text: string; label: string } | null },
  io: { replace: typeof replaceJd } = { replace: replaceJd },
): Before {
  return {
    working: jdReading(jd.name),
    done: jdRead(jd.name),
    run: () => io.replace(jd.campaignId, { file: jd.file }),
    failure: (err) => jdFailureLine(jd.name, messageOf(err), !refusedBy(err)),
    ...(jd.then ? { then: { ...jd.then, campaignId: jd.campaignId } } : {}),
  };
}
