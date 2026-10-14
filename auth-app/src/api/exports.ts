import { ApiError, api } from "./client";

/**
 * Exports. CSV and Excel are built in the browser from rows the API returns
 * (contacts only where this workspace holds them), and each one is recorded
 * for the audit trail. Google Sheets is built on the server, in the
 * recruiter's own Drive.
 */

export type ExportKind = "shortlist" | "pipeline";

/** Shortlist columns in the order platform-plan §10.4 lists them, with the header each one gets. */
export const EXPORT_COLUMNS = [
  ["name", "Name"],
  ["currentRole", "Current role"],
  ["company", "Company"],
  ["location", "Location"],
  ["experienceYears", "Experience (yrs)"],
  ["stage", "Stage"],
  ["step", "Step"],
  ["tier", "Tier"],
  ["mustHavesMet", "Must-haves met"],
  ["noticeDays", "Notice (days)"],
  ["expectedCtc", "Expected CTC"],
  ["owner", "Owner"],
  ["source", "Source"],
  ["linkedin", "LinkedIn"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["addedOn", "Added on"],
  ["lastUpdate", "Last update"],
  ["notes", "Notes"],
] as const;
export type ExportColumn = (typeof EXPORT_COLUMNS)[number][0];

export type ExportRow = { id: string; candidateId: string } & Partial<Record<ExportColumn, string | number | null>>;

export function exportRows(campaignId: string, kind: ExportKind, columns: readonly ExportColumn[]) {
  const q = new URLSearchParams({ kind, columns: columns.join(",") });
  return api<{ kind: ExportKind; columns: ExportColumn[]; rows: ExportRow[] }>("GET", `/v1/campaigns/${campaignId}/export-rows?${q.toString()}`);
}

export type ExportRecord = {
  kind: ExportKind | "candidates" | "clients" | "responses";
  campaignId?: string;
  format: "csv" | "xlsx";
  rowCount: number;
  filters?: Record<string, unknown>;
};

/** The audit row for a file the browser just made. */
export const recordExport = (r: ExportRecord) => api<{ id: string }>("POST", "/v1/exports", r);

export type SheetsOutcome = { kind: "made"; url: string; rows: number } | { kind: "connect"; message: string };

/**
 * A new sheet in the recruiter's Drive. Without a Google connection the API
 * says what to connect; that comes back as an answer, not a failure.
 */
export async function exportToSheets(campaignId: string, kind: ExportKind, headers: readonly string[]): Promise<SheetsOutcome> {
  try {
    const r = await api<{ url: string; rows: number }>("POST", `/v1/campaigns/${campaignId}/export/sheets`, { kind, columns: headers });
    return { kind: "made", url: r.url, rows: r.rows };
  } catch (err) {
    if (err instanceof ApiError && err.status === 503) return { kind: "connect", message: err.message };
    throw err;
  }
}
