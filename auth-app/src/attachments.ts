/**
 * Files and long text in the agent's composer.
 *
 * Everything here is pure: what a paste or a drop turns into, what is refused, and how the attachments are
 * written into the one message the agent receives. The agent never gets a file, only the text the person
 * attached, in their message (the server reads the file: POST /v1/attachments/read).
 */

/** What the file picker offers, and what the server's reader takes. A legacy .doc is not among them. */
export const ATTACH_ACCEPT = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** More than this and a paste becomes a chip instead of filling the field. */
export const LONG_TEXT_CHARS = 1500;
export const LONG_TEXT_LINES = 25;
/** The most files in one message. */
export const MAX_ATTACHMENTS = 5;
/** What the server takes in one message (liveChat.CHAT_LIMIT), kept here so this module needs nothing else. */
export const MESSAGE_LIMIT = 8000;

export type DocKind = "job_description" | "resume" | "document";

export type Attachment = {
  id: string;
  /** The file's name, or "Pasted text". */
  name: string;
  origin: "file" | "pasted";
  /** Bytes for a file, characters for pasted text. */
  size: number;
  status: "reading" | "ready" | "failed";
  text: string;
  docKind?: DocKind;
  /** One calm line: why it could not be read, or that only the start of it is used. */
  note?: string;
  /** What the chip says in place of the name ("Job description: jd.pdf"). */
  label?: string;
};

const TEXT_EXT = /\.(txt|md|markdown)$/i;
const KNOWN_EXT = /\.(pdf|docx?|txt|md|markdown|rtf|png|jpe?g|webp)$/i;
const TYPE_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const TAKEN = new Set(Object.values(TYPE_BY_EXT));

/** The type to send a file as: the browser's, else from the name (a pasted file often has none). */
export function typeOf(file: Pick<File, "name" | "type">): string {
  const given = (file.type || "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (given && given !== "application/octet-stream") return given;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? "";
  return TYPE_BY_EXT[ext] ?? given;
}

export const isPlainText = (file: Pick<File, "name" | "type">): boolean =>
  typeOf(file).startsWith("text/") || TEXT_EXT.test(file.name);

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Why a file is not taken, in one calm line, or null when it is. */
export function fileRefusal(file: Pick<File, "name" | "type" | "size">): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is over 10 MB. Attach a smaller file.`;
  const type = typeOf(file);
  if (type === "application/msword" || /\.doc$/i.test(file.name)) {
    return `${file.name} is an old Word file. Save it as .docx or PDF and attach it again.`;
  }
  if (!TAKEN.has(type) && !isPlainText(file)) return `I can read PDF, Word (.docx), text and image files, not ${file.name}.`;
  return null;
}

export const wordsOf = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

export const isLongText = (text: string): boolean =>
  text.length > LONG_TEXT_CHARS || text.split(/\r?\n/).length > LONG_TEXT_LINES;

/** A line that is a place on this computer, which a browser cannot open from its name. */
export function looksLikePath(text: string): boolean {
  const t = text.trim();
  if (!t || t.includes("\n") || t.length > 1024) return false;
  if (!(/^file:\/\//i.test(t) || /^(\/|~\/|[A-Za-z]:\\)/.test(t))) return false;
  return KNOWN_EXT.test(t.replace(/[?#].*$/, ""));
}

/** A name to say for a path: its last part, undone from a file:// address. */
export function nameOfPath(path: string): string {
  const last = path.trim().replace(/[?#].*$/, "").split(/[\\/]/).pop() ?? path;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** The parts of a DataTransfer this reads, so a test can pass a plain object. */
export type TransferLike = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null;
  getData(type: string): string;
};

export type PasteOutcome =
  /** Files (or images) were copied: attach them. */
  | { kind: "files"; files: File[] }
  /** Only the file's place came through: say so, and do not put it in the box. */
  | { kind: "path"; path: string; name: string }
  /** A long block of text: it becomes a chip, not the field's content. */
  | { kind: "long"; text: string }
  /** Anything else: the browser pastes it as it would. */
  | { kind: "text" };

/**
 * What a paste is. A file object wins wherever it is (`files`, then `items` of kind file); a file copied in a
 * file manager often arrives as its path (text/plain) or a file:// address (text/uri-list) and nothing else.
 */
export function readClipboard(dt: TransferLike | null | undefined): PasteOutcome {
  if (!dt) return { kind: "text" };
  const files: File[] = Array.from(dt.files ?? []);
  if (!files.length) {
    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind !== "file") continue;
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) return { kind: "files", files };

  const uris = (dt.getData("text/uri-list") || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const fileUri = uris.find((u) => /^file:\/\//i.test(u));
  if (fileUri) return { kind: "path", path: fileUri, name: nameOfPath(fileUri) };

  const text = dt.getData("text/plain") || "";
  if (looksLikePath(text)) return { kind: "path", path: text.trim(), name: nameOfPath(text) };
  if (isLongText(text)) return { kind: "long", text };
  return { kind: "text" };
}

/** What the page says under the composer when only a path came through. */
export const PATH_NOTE =
  "That's a file path. Browsers can't open it from the path, so drag the file into the chat or choose it here.";

/* ── the message ─────────────────────────────────────────────────────────── */

const OPEN = (name: string) => `[Attached: ${name}]`;
const CLOSE = "[End of attachment]";

const clean = (name: string) => name.replace(/[\[\]\r\n]+/g, " ").trim().slice(0, 120) || "file";

/**
 * The one message: what was typed, then each attachment's text under its name. A pasted block with nothing
 * typed goes as it is (the same message a pasted job description has always been). With no typed words a
 * job description or resume gets one plain sentence saying what it is, so the agent starts from it.
 * What does not fit in a message is cut from the end of the attachments, and each is told it was cut.
 */
export function composeMessage(
  typed: string,
  attachments: readonly Attachment[],
  opts: {
    campaignName?: string | undefined;
    /** No campaign is in focus: a job description starts one. */
    newCampaign?: boolean | undefined;
    /** A short line carried at the end (the filters set for the next campaign). */
    tail?: string | null | undefined;
    limit?: number;
  } = {},
): { text: string; cut: ReadonlySet<string> } {
  const limit = opts.limit ?? MESSAGE_LIMIT;
  const ready = attachments.filter((a) => a.status === "ready" && a.text.trim());
  const cut = new Set<string>();
  const said = typed.trim();
  const tail = opts.tail?.trim() || "";
  if (!ready.length) return { text: said && tail ? `${said}\n\n${tail}` : said, cut };

  const lone = ready.length === 1 && ready[0]?.origin === "pasted" && !said && !tail;
  if (lone) {
    const only = ready[0]!;
    const body = only.text.trim();
    if (body.length > limit) cut.add(only.id);
    return { text: body.slice(0, limit), cut };
  }

  const first = ready.find((a) => a.docKind === "job_description") ?? ready.find((a) => a.docKind === "resume");
  const lead = said
    ? said
    : first?.docKind === "job_description"
      ? opts.campaignName
        ? `Here is the job description for ${opts.campaignName}.`
        : opts.newCampaign
          ? "Here is a job description. Please start a new campaign from it."
          : "Here is the job description."
      : first?.docKind === "resume"
        ? "Here is a candidate's resume."
        : ready.length > 1
          ? "Here are the files I attached."
          : "Here is the file I attached.";

  const frame = (a: Attachment) => `${OPEN(clean(a.name))}\n`.length + `\n${CLOSE}`.length + 2;
  const fixed = lead.length + (tail ? tail.length + 2 : 0) + ready.reduce((n, a) => n + frame(a), 0);
  let room = Math.max(0, limit - fixed);
  const parts = [lead];
  ready.forEach((a, i) => {
    const share = Math.floor(room / (ready.length - i));
    const body = a.text.trim();
    const used = body.length > share ? body.slice(0, share) : body;
    if (used.length < body.length) cut.add(a.id);
    room -= used.length;
    parts.push(`${OPEN(clean(a.name))}\n${used}\n${CLOSE}`);
  });
  if (tail) parts.push(tail);
  return { text: parts.join("\n\n"), cut };
}

const BLOCK = /\[Attached: ([^\]\n]{1,120})\]\n([\s\S]*?)\n\[End of attachment\]/g;

/** A sent message taken apart again, to show the words and the files instead of the files' text. */
export function splitMessage(text: string): { said: string; files: Array<{ name: string; words: number }> } | null {
  const files: Array<{ name: string; words: number }> = [];
  let said = text;
  BLOCK.lastIndex = 0;
  for (const m of text.matchAll(BLOCK)) {
    files.push({ name: m[1] ?? "file", words: wordsOf(m[2] ?? "") });
    said = said.replace(m[0], "");
  }
  if (!files.length) return null;
  return { said: said.trim(), files };
}

/** Whether a sent message is long enough to be folded in the transcript until asked for. */
export const isLongMessage = (text: string): boolean => text.length > 700 || text.split("\n").length > 12;
