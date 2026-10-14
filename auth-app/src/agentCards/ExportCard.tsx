import { Check, DownloadSimple, FileCsv, FileXls } from "@phosphor-icons/react";
import { useState } from "react";
import { messageOf } from "../api/client";
import { EXPORT_COLUMNS, exportRows, recordExport } from "../api/exports";
import { download, shortlistName, shortlistTable, toCSV, toXLSX } from "../exportTable";

/**
 * A file the agent was asked for ("download the shortlist as a CSV"). It is made here, from the same rows the
 * Export button on the Shortlisted and Pipeline pages reads, when the person presses the button: the file never
 * passes through the chat, and every column is in it, with contact details only where this workspace holds them.
 */

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ExportCard({ campaignId, campaignName, list, format }: {
  campaignId: string;
  campaignName: string;
  list: "shortlist" | "pipeline";
  format: "csv" | "xlsx";
}): JSX.Element {
  const [state, setState] = useState<"idle" | "making" | { rows: number } | { problem: string }>("idle");
  const Icon = format === "csv" ? FileCsv : FileXls;
  const what = list === "shortlist" ? "shortlist" : "pipeline";
  const kind = format === "csv" ? "CSV" : "Excel file";

  const make = async () => {
    if (state === "making") return;
    setState("making");
    try {
      const r = await exportRows(campaignId, list, EXPORT_COLUMNS.map(([k]) => k));
      const table = shortlistTable(r.rows, r.columns);
      if (format === "csv") download(toCSV(table), "text/csv;charset=utf-8", shortlistName(campaignName, list, "csv"));
      else download(toXLSX(table), XLSX_MIME, shortlistName(campaignName, list, "xlsx"));
      /* The file is on their machine already; a missed audit row is not worth an error. */
      void recordExport({ kind: list, campaignId, format, rowCount: r.rows.length }).catch(() => {});
      setState({ rows: r.rows.length });
    } catch (err) {
      setState({ problem: messageOf(err) });
    }
  };

  const done = typeof state === "object" && "rows" in state ? state.rows : null;
  const problem = typeof state === "object" && "problem" in state ? state.problem : null;
  return (
    <section className="cc ex" aria-label={`Download the ${what} of ${campaignName}`}>
      <div className="cc-head">
        <span className="lt-app-mark" aria-hidden="true"><Icon size={16} weight="fill" /></span>
        <p className="cc-title">The {what} of {campaignName}</p>
      </div>
      <p className="cc-why">Every column, as a {kind}. Email and phone are in it where they are on file.</p>
      <div className="cc-acts">
        <button type="button" className="rep-commit" disabled={state === "making"} onClick={() => void make()}>
          {done !== null ? <Check size={14} weight="bold" aria-hidden="true" /> : <DownloadSimple size={14} aria-hidden="true" />}
          {state === "making" ? "Preparing" : done !== null ? "Download again" : `Download ${kind}`}
        </button>
        {done !== null && <span className="cc-wait" role="status">Downloaded, {done === 1 ? "1 person" : `${done} people`}.</span>}
        {problem && <span className="lt-note" role="alert">{problem}</span>}
      </div>
    </section>
  );
}
