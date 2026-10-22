import { CheckCircle, FileText, Sparkle, UploadSimple, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { FACET_LABEL, read } from "./brief";
import { isSheetFile } from "./jdIntake";
import { sheetLinkIn } from "./importFiles";
import { SheetNeeds } from "./SheetNeeds";
import { Dialog } from "./ui";
import "./composer.css";

/**
 * JdDialog — attach the job description the search should rank against.
 *
 * Upload a file or paste the text. Either way the agent reads it back before
 * it is attached, as the facets it understood (level, skills, location,
 * experience…), so the recruiter sees what the search will use rather than
 * trusting that a PDF was parsed. Nothing leaves the browser in this
 * frontend-only build; a .txt file is read for real, other formats use the
 * campaign's sample JD.
 */

export type Jd = { name: string; size: string; text: string; facets: readonly { facet: string; text: string }[] };

const SAMPLE = `Senior Backend Engineer, Ledger Platform. Bangalore or remote in India. 6+ years building backend systems in Go or Rust, with Postgres at scale (sharding, replication, 10TB+). Experience at a Series B+ product company. You will own the ledger's storage layer and on-call for it.`;

const ACCEPT = ".pdf,.docx,.txt,.md";
/** Where several can be added at once, a sheet of them can be too. */
const ACCEPT_MANY = `${ACCEPT},.xlsx,.csv,.tsv`;

function facetsOf(text: string) {
  const seen = new Set<string>();
  return read(text)
    .map((m) => ({ facet: FACET_LABEL[m.facet], text: m.means }))
    .filter((f) => (seen.has(f.text) ? false : (seen.add(f.text), true)));
}

/** A job description from its text, with what the brief reader understood of it. */
export function jdFromText(name: string, text: string): Jd {
  return { name, size: `${text.trim().split(/\s+/).filter(Boolean).length.toLocaleString("en-IN")} words`, text, facets: facetsOf(text) };
}

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function JdDialog({
  open, onClose, current, onApply, onRemove, read: readFile, lead, viewOnly, onMany,
}: {
  open: boolean;
  onClose: () => void;
  current: Jd | null;
  onApply: (jd: Jd) => void;
  /** Absent where a description can only be replaced, not taken off. */
  onRemove?: (() => void) | undefined;
  /**
   * Connected, the file is read by the server and its text comes back; without it the prototype's
   * stand-in reads a .txt for real and uses the sample for anything else.
   */
  read?: ((file: File) => Promise<string>) | undefined;
  /** What the dialog says under its title; the prototype's line when absent. */
  lead?: string | undefined;
  /** Someone who follows the campaign reads the description and cannot replace it. */
  viewOnly?: boolean | undefined;
  /**
   * Present where a new campaign is being started: several descriptions, or a spreadsheet of them, are taken together
   * (the files picked or dropped come back, and the import card reads them); one is read here as before.
   */
  onMany?: ((pick: { files?: File[]; links?: string[] }) => void) | undefined;
}) {
  const [tab, setTab] = useState<"upload" | "paste" | "sheet">("upload");
  const [sheet, setSheet] = useState("");
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<{ name: string; size: string; text: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setFile(null); setReading(false); setDrag(false); setProblem(null); } }, [open]);

  /* Several files, or a spreadsheet, are roles to add together: they go to the import card. */
  const takeMany = (list: File[]): boolean => {
    if (!onMany || !list.length) return false;
    if (list.length === 1 && !isSheetFile(list[0] as File)) return false;
    setProblem(null);
    onMany({ files: list });
    onClose();
    return true;
  };

  const take = (f: File) => {
    setProblem(null);
    if (readFile) {
      if (f.size > 10 * 1024 * 1024) { setProblem("That file is over 10 MB. Attach a smaller one."); return; }
      setReading(true);
      setFile({ name: f.name, size: kb(f.size), text: "" });
      readFile(f).then(
        (text) => { setFile({ name: f.name, size: kb(f.size), text }); setReading(false); },
        (err: unknown) => {
          setFile(null);
          setReading(false);
          setProblem(err instanceof Error && err.message ? err.message : "I couldn't read that file. Paste the text instead.");
        },
      );
      return;
    }
    setReading(true);
    setFile({ name: f.name, size: kb(f.size), text: "" });
    const done = (text: string) => window.setTimeout(() => { setFile({ name: f.name, size: kb(f.size), text }); setReading(false); }, 1300);
    if (/\.(txt|md)$/i.test(f.name)) {
      const r = new FileReader();
      r.onload = () => done(String(r.result ?? "") || SAMPLE);
      r.onerror = () => done(SAMPLE);
      r.readAsText(f);
    } else done(SAMPLE);
  };

  const text = tab === "upload" ? file?.text ?? "" : tab === "sheet" ? "" : paste;
  const facets = text ? facetsOf(text) : [];
  const sheetLink = sheetLinkIn(sheet.trim());
  const ready = tab === "upload" ? !!file && !reading : tab === "sheet" ? !!sheetLink : paste.trim().length > 40;

  return (
    <Dialog open={open} onClose={onClose} label="Job description" size="md">
      <div className="jd">
        <header className="jd-top">
          <h2>Job description</h2>
          <p>{viewOnly ? "What this campaign's searches are ranked against." : (lead ?? "Candidates are ranked against the role as written.")}</p>
        </header>

        {viewOnly && (
          <>
            <pre className="jd-view">{current?.text ?? "No job description has been added yet."}</pre>
            <footer className="jd-foot">
              <span className="sp" />
              <button type="button" className="src-btn is-quiet mo-small" onClick={onClose}>Close</button>
            </footer>
          </>
        )}

        {!viewOnly && current && (
          <div className="jd-current">
            <FileText size={18} weight="fill" aria-hidden="true" />
            <span><b>{current.name}</b><small>{current.size} · {current.facets.length} things understood</small></span>
            {onRemove && <button type="button" className="cn-link" onClick={() => { onRemove(); onClose(); }}>Remove</button>}
          </div>
        )}

        {!viewOnly && (<>
        <div className="jd-tabs" role="tablist">
          {(onMany ? (["upload", "paste", "sheet"] as const) : (["upload", "paste"] as const)).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`jd-tab${tab === t ? " is-on" : ""}`} onClick={() => setTab(t)}>
              {t === "upload" ? (onMany ? "Upload files" : "Upload a file") : t === "paste" ? "Paste text" : "Google Sheet"}
            </button>
          ))}
        </div>

        {tab === "upload" ? (
          file ? (
            <div className={`jd-file${reading ? " is-reading" : ""}`}>
              <span className="jd-file-ico"><FileText size={20} weight="fill" aria-hidden="true" /></span>
              <span className="jd-file-id">
                <b>{file.name}</b>
                <small>{reading ? "Reading the job description…" : `${file.size} · read`}</small>
                {reading && <span className="jd-bar"><i /></span>}
              </span>
              {!reading && <CheckCircle size={20} weight="fill" className="jd-ok" aria-hidden="true" />}
              <button type="button" className="jd-x" aria-label="Choose a different file" onClick={() => setFile(null)}><X size={13} weight="bold" /></button>
            </div>
          ) : (
            <label
              className={`jd-drop${drag ? " is-drag" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const all = [...e.dataTransfer.files]; if (takeMany(all)) return; const f = all[0]; if (f) take(f); }}
            >
              <input
                ref={input} id="jd-file" type="file" accept={onMany ? ACCEPT_MANY : ACCEPT} multiple={!!onMany}
                onChange={(e) => { const all = [...(e.target.files ?? [])]; e.target.value = ""; if (takeMany(all)) return; const f = all[0]; if (f) take(f); }}
              />
              <span className="jd-drop-ico"><UploadSimple size={22} weight="bold" aria-hidden="true" /></span>
              <b>{drag ? "Drop it here" : onMany ? "Drop the JDs here, or browse" : "Drop the JD here, or browse"}</b>
              <small>{onMany ? "PDF, Word, text, Excel or CSV · pick several at once" : readFile ? "PDF, Word (.docx) or text · up to 10 MB" : "PDF, Word or text · up to 10 MB"}</small>
            </label>
          )
        ) : tab === "sheet" ? (
          <div className="ji">
            <input
              id="jd-sheet" className="jd-paste ji-input" type="url" value={sheet} onChange={(e) => setSheet(e.target.value)}
              placeholder="docs.google.com/spreadsheets/…" autoComplete="off" spellCheck={false} aria-label="Google Sheet link"
            />
            <SheetNeeds />
          </div>
        ) : (
          <textarea
            id="jd-paste"
            className="jd-paste"
            placeholder="Paste the job description…"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={7}
          />
        )}

        {problem && <p className="jd-problem" role="alert">{problem}</p>}

        {facets.length > 0 && (
          <div className="jd-read">
            <p className="jd-read-h"><Sparkle size={12} weight="fill" aria-hidden="true" />What I understood</p>
            <ul>
              {facets.map((f, i) => (
                <li key={f.text} style={{ animationDelay: `${i * 45}ms` }}><span>{f.facet}</span>{f.text}</li>
              ))}
            </ul>
          </div>
        )}

        <footer className="jd-foot">
          <span className="sp" />
          <button type="button" className="src-btn is-quiet mo-small" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="src-btn is-primary mo-small"
            disabled={!ready}
            onClick={() => {
              if (tab === "sheet") {
                if (sheetLink && onMany) onMany({ links: [sheetLink] });
                onClose();
                return;
              }
              onApply(tab === "upload" && file
                ? { name: file.name, size: file.size, text: file.text, facets }
                : { name: "Pasted job description", size: `${paste.trim().split(/\s+/).length} words`, text: paste, facets });
              onClose();
            }}
          >
            {tab === "sheet" ? "Read the sheet" : "Use this job description"}
          </button>
        </footer>
        </>)}
      </div>
    </Dialog>
  );
}
