import { TIER_LABEL } from "./chatCards";
import type { ExportColumn, ExportKind, ExportRow } from "./api/exports";
import { EXPORT_COLUMNS } from "./api/exports";
import type { Answer, Form, FormResponse, PipelinePerson } from "./campaign";
import { answerable, missedMustHaves, mustHaves } from "./campaign";
import { sectionTitles } from "./formPages";
import { cap, shortTitle } from "./formKit";
import type { Cell, Table } from "./xlsx";

export type { Cell, Table } from "./xlsx";
export { toXLSX } from "./xlsx";

/**
 * Responses as a flat table, plus the three ways out of the app: CSV,
 * .xlsx (see xlsx.ts) and a TSV for pasting into a sheet. Pure apart from
 * download/copyText, which touch the DOM.
 */

/* ── which rows: the filter every view and every export shares ── */

export type MustFilter = "all" | "met" | "missed";
export type AnswerFilter = { qid: string; value: string } | null;
export type Scope = { must: MustFilter; answer: AnswerFilter; search: string };

const hasAnswer = (a: Answer | undefined, v: string) => (Array.isArray(a) ? a.includes(v) : a !== undefined && String(a) === v);

export function filterResponses(form: Pick<Form, "questions">, all: readonly FormResponse[], s: Scope): FormResponse[] {
  const q = s.search.trim().toLowerCase();
  return all.filter((r) => {
    if (s.must !== "all") {
      const missed = missedMustHaves(form, r.answers).length > 0;
      if (s.must === "missed" ? !missed : missed) return false;
    }
    if (s.answer && !hasAnswer(r.answers[s.answer.qid], s.answer.value)) return false;
    if (q) {
      const hay = [r.person.name, r.person.company, r.person.title, ...Object.values(r.answers).map((a) => (Array.isArray(a) ? a.join(" ") : String(a)))].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ── formatting ── */

/** Seconds as "3m 20s"; responses the server couldn't time read as a dash. */
export const tookLabel = (sec: number) => (Number.isFinite(sec) && sec >= 0 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : "—");
const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local "YYYY-MM-DD HH:mm" for a response `at` minutes ago. */
export const submittedAt = (at: number, now = Date.now()) => { const d = new Date(now - at * 60000); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "form";
export const exportName = (form: Pick<Form, "name">, ext: "csv" | "xlsx", now = new Date()) => `${slug(form.name)}-responses-${ymd(now)}.${ext}`;

type Person = Pick<PipelinePerson, "id" | "stage"> & { step?: PipelinePerson["step"]; email?: { value: string } | null };
const STAGE_LABEL: Readonly<Record<string, string>> = { shortlisted: "Shortlisted", outreach: "In outreach", interviewing: "Interviewing", hired: "Hired", passed: "Rejected" };
/** Where someone is within a stage, in the words the board uses. */
const STEP_LABEL: Readonly<Record<string, string>> = { waiting: "Waiting for a reply", replied: "Replied", loop: "In interviews", offer: "Offer out" };
/** The words a spreadsheet shows for the API's stage and step: "In outreach", not "outreach". */
export const stageName = (stage: string): string => STAGE_LABEL[stage] ?? stage;
/** The status word, as the console's menus say it: "Replied" for outreach at its replied step, else the stage's. */
export const statusName = (stage: string, step?: string | null): string =>
  stage === "outreach" && step === "replied" ? "Replied" : stageName(stage);
export const stepName = (step: string): string => STEP_LABEL[step] ?? step;

export function responseTable(form: Form, rows: readonly FormResponse[], people: ReadonlyMap<string, Person>, now = Date.now()): Table & { wrap: boolean[] } {
  const qs = answerable(form);
  const must = mustHaves(form).length > 0;
  const seen = new Map<string, number>();
  /* Under a section, a column is headed "Section: question", so a sheet reads in the form's own pages. */
  const sections = sectionTitles(form.questions);
  const qHeads = qs.map((q) => {
    const own = q.title.trim() || "Untitled question";
    const base = sections.has(q.id) ? `${sections.get(q.id)}: ${own}` : own;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    return k > 1 ? `${base} (${k})` : base;
  });
  const headers = ["Name", "Email", "Phone", "LinkedIn", "Current role", "Company", "Stage", ...(must ? ["Must-haves"] : []), "Submitted", "Time taken", ...qHeads, "Candidate ID"];
  const widths = [22, 28, 16, 34, 24, 20, 14, ...(must ? [30] : []), 17, 10, ...qs.map((q) => (q.type === "long" ? 50 : Math.min(40, Math.max(14, q.title.length)))), 18];
  const wrap = [false, false, false, false, false, false, false, ...(must ? [false] : []), false, false, ...qs.map((q) => q.type === "long"), false];
  const body: Cell[][] = rows.map((r) => {
    const p = people.get(r.person.id);
    const miss = missedMustHaves(form, r.answers);
    const cells: Cell[] = [
      r.person.name, r.email ?? p?.email?.value ?? "", r.phone ?? "", r.linkedin ?? "", r.person.title, r.person.company,
      p ? statusName(p.stage, p.step) : "Not shortlisted yet",
      ...(must ? [miss.length ? `Missed: ${miss.map((m) => cap(shortTitle(m.q))).join("; ")}` : "Met"] : []),
      submittedAt(r.at, now), tookLabel(r.took),
      ...qs.map((q): Cell => {
        const a = r.answers[q.id];
        if (a === undefined || a === "") return "";
        if (Array.isArray(a)) return a.join("; ");
        if (typeof a === "number") return a;
        if (typeof a === "boolean") return a ? "Yes" : "No";
        return a;
      }),
      r.person.id,
    ];
    return cells;
  });
  return { headers, rows: body, widths, wrap };
}

/* ── a campaign's shortlist or pipeline, from the API's rows ── */

const WIDE: Partial<Record<ExportColumn, number>> = { name: 22, currentRole: 24, company: 20, location: 20, linkedin: 34, email: 28, notes: 40 };

/** The API's rows as a sheet. An email or phone this workspace doesn't hold stays empty. */
export function shortlistTable(rows: readonly ExportRow[], columns: readonly ExportColumn[], kind: ExportKind = "shortlist"): Table & { wrap: boolean[] } {
  const cols = EXPORT_COLUMNS.filter(([k]) => columns.includes(k));
  return {
    name: kind === "pipeline" ? "Pipeline" : "Shortlist",
    headers: cols.map(([, h]) => h),
    widths: cols.map(([k, h]) => WIDE[k] ?? Math.max(12, h.length + 2)),
    wrap: cols.map(([k]) => k === "notes"),
    rows: rows.map((r) => cols.map(([k]): Cell => {
      const v = r[k];
      if ((k === "addedOn" || k === "lastUpdate") && typeof v === "string") return ymd(new Date(v));
      if (k === "stage" && typeof v === "string") return statusName(v, typeof r.step === "string" ? r.step : null);
      if (k === "step" && typeof v === "string") return stepName(v);
      /* The tier in the product's words, never the letter (an older server sends the letter). */
      if (k === "tier" && typeof v === "string") return v === "A" || v === "B" || v === "C" ? TIER_LABEL[v] : v;
      return v ?? "";
    })),
  };
}

export const shortlistName = (campaign: string, kind: ExportKind, ext: "csv" | "xlsx", now = new Date()) => `${slug(campaign)}-${kind}-${ymd(now)}.${ext}`;

/* ── CSV / TSV ── */

const BOM = "﻿";
const guard = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const cell = (v: Cell) => {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  const s = guard(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCSV = (t: Table) => BOM + [t.headers, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
// Copied cells are pasted into spreadsheets, so they get the same formula guard as CSV (numbers are left alone).
export const toTSV = (t: Table) => [t.headers, ...t.rows].map((r) => r.map((v) => (v == null ? "" : typeof v === "number" ? String(v) : guard(String(v).replace(/[\t\r\n]+/g, " ")))).join("\t")).join("\n");

/* ── out of the browser ── */

export function download(data: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(s: string) {
  try { await navigator.clipboard.writeText(s); }
  catch {
    const ta = Object.assign(document.createElement("textarea"), { value: s });
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
}
