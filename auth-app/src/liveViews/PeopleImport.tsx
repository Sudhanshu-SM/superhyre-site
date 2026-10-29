import { ArrowRight, Check, UploadSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FOLLOW_UP_LABEL, campaignsIn, followUpAfter, hasInstruction, inTurns } from "../adding";
import { peopleSheetApi } from "../api/peopleSheet";
import { messageOf } from "../api/client";
import { useCampaignRows } from "../campaignStore";
import { useMayChangeCampaign } from "../campaignRights";
import { Loader } from "../components/Loader";
import { invalidate } from "../invalidate";
import { JdIntake } from "../JdIntake";
import { joinPeople } from "../joinPeople";
import { sendAction } from "../liveChat";
import { SHEET_ACCEPT } from "../attachments";
import { sheetLinkIn } from "../importFiles";
import { useToast } from "../toast";
import {
  type ClientPlan,
  type PeopleSheet,
  type PlaceChoice,
  type PlacedTally,
  type PlaceView,
  type Role,
  type RuleLine,
  type SheetFields,
  type Tally,
  PLACE_CHOICES,
  PLACE_HELP,
  PLACE_LABEL,
  PROTECTED_LINE,
  ROLE_CHOICES,
  SEE_THEM,
  UNKNOWN_WORD,
  addAndPlace,
  addLabelOf,
  askLine,
  carryOn,
  carryPlaced,
  changedLine,
  choose,
  columnName,
  columnQuestion,
  columnsParam,
  countLine,
  doneLine,
  factLines,
  fallbackLine,
  firstStep,
  hasHidden,
  headline,
  hiddenLabel,
  latestRead,
  leftEarlyLine,
  leftOutLines,
  lookLine,
  nothingInFiles,
  nextStepsOf,
  nothingToAdd,
  placeView,
  placingOf,
  planAfter,
  planWith,
  progressLine,
  protectedColumnsLine,
  readAgainAfter,
  ruleLines,
  scopeLine,
  seeThemHref,
  selectValue,
  splitColumns,
  stillHolds,
  stoppedLine,
  suggestedBy,
  tabRows,
  tally,
  tickedTabs,
  totalsLine,
  unreadLine,
  unavailableLine,
  unusedLines,
  vetoLines,
  whereTheyGo,
} from "../peopleSheet";
import { type FinishedAdd, type SheetSeed, addingIdOf, finishFor, finishedFor, passedFor, peekFor, sentFor, takePeople } from "../peopleSeed";
import type { ResumeSeed } from "../resumeSheet";
import { Finished, Gone } from "./Gone";
import { type ResumeReport, ResumeImport, ResumeSection } from "./ResumeImport";
import type { LiveViewProps } from "./types";
import "../jd-intake.css";
import "../peopleImport.css";

/**
 * "Add the people in this sheet", in the chat: a recruiter's own sheet of people they fetched before, read row by row.
 * It says what it understood (the columns, and how sure it was), how many are new and how many are already here, and
 * why any row was left out, lets a person correct a column, and adds everyone with one button. Where they go is the
 * campaign the message came from (the one the chat had open when the sheet was attached) or Candidates, and the other
 * is always one choice away. Nothing is written until that button. A sheet of roles that comes here by mistake goes on
 * to the roles import in place.
 *
 * Adding is a batch at a time and can be left: a batch that fails stops it with what went in counted, the sheet is read
 * again so the button offers who is left, and going on is safe. A reading that is no longer wanted (another was asked
 * for, or the card was left) is cancelled, and so is the adding when the card is left.
 *
 * Several files are one card: a section for each, with its own tick and its tabs to tick, and one place they go and one button. Resumes
 * that came with the sheets are a section of the same card (read by their own route, a line and a tick for each person), and a person
 * who is in more than one file counts once, with the rows that were joined said plainly (joinPeople.ts).
 * When a sheet's columns were a guess, or the words typed beside it ask for more than adding, the card asks for the model's help
 * once, and says what it changed and what it did with each part of their words, quoting them; every part is a tick that reads
 * the sheet again in code. What it does not know it says, and the plain reading stands.
 */

export type CardPhase = "reading" | "ready" | "adding" | "done" | "failed";

export type CardView = {
  /** The file's name, or "your sheet" for a link. */
  name: string;
  phase: CardPhase;
  sheet: PeopleSheet | null;
  /** The shortlist they go on. Absent: Candidates. */
  shortlist: { id: string; name: string } | null;
  /** The campaigns they may be put on, and the one chosen (none: Candidates alone, which is always a choice too). */
  choice: { options: ReadonlyArray<{ id: string; name: string }>; value: string | null } | null;
  /** Said under the heading (following a campaign that can't be changed). */
  note: string | null;
  error: string | null;
  progress: { done: number; total: number } | null;
  done: { line: string; href: string; link: string } | null;
  columnsOpen: boolean;
  /** Reading again after a column or a campaign was changed: what is shown is about to be replaced. */
  refreshing: boolean;
  /** The last reading failed, so what is shown is from before it: adding waits for a reading that works. */
  stale: boolean;
  /** The first line: what is added from the file, and that nothing else in it is. Absent for a card the words opened. */
  scope: string | null;
  /** Said when the person's words named the campaign the people went to: the note stays in the chat. */
  words: string | null;
  /** The tabs with something in them, to tick which are added (several only). A tab read as no people is shown and cannot be ticked. */
  tabs: ReadonlyArray<{ name: string; people: number; on: boolean; rows?: number; readable?: boolean }>;
  /** Rows and columns the workbook hides: left out, with one tick to read them. */
  hidden: { label: string; on: boolean } | null;
  /** What the model's help did to the columns and to the words typed beside the sheet, said in the card's own words (peopleSheet.ts). */
  lines?: {
    changed: string | null;
    protectedColumns: string | null;
    protected: string | null;
    fallback: string | null;
    ask: string | null;
    vetoes: string[];
    unused: string[];
  };
  /** The choosing of people the words asked for, each with a tick. */
  rules?: RuleLine[];
  /** The model's help is being asked for: the plain reading is shown, and Add waits for the answer. */
  checking?: string | null;
  /** One of several files on a card: its tick, and what it holds. The card's own footer is not drawn for it. */
  file?: { on: boolean; label: string } | null;
  /** The people the button adds, when it adds those of several files; else the sheet's own. */
  total?: number;
  /** In place of the button, when there is nothing to add across the files. */
  nothing?: string;
  /** Placing the people on the stage their status says: only with a status column and a campaign they go on. */
  placing?: PlaceView | null;
  /** Said when the words typed beside the files were not read (one word is nothing a sheet can be told): in the person's own word, with what to do. */
  unread?: string | null;
  /** The people of several files together, and the rows joined where one person is in more than one: it is also what the button's count is read from. */
  totals?: string | null;
};

export type CardActions = {
  onColumn: (index: number, role: Role) => void;
  onShortlist: (id: string | null) => void;
  onAdd: () => void;
  onToggleColumns: () => void;
  onRetry: () => void;
  /** A sheet with no people in it that is a list of roles: read it with the roles import. */
  onAsRoles: () => void;
  /** After one is done: add another sheet. */
  onAnother?: () => void;
  onTab: (name: string, on: boolean) => void;
  onHidden: (on: boolean) => void;
  /** A rule made from the words ticked or not. */
  onRule?: (index: number, on: boolean) => void;
  /** A file of several ticked or not. */
  onFile?: (on: boolean) => void;
  /** Placing by status ticked or not; what one of the sheet's words means; the two ticks of their own. */
  onPlace?: (on: boolean) => void;
  onWord?: (key: string, choice: PlaceChoice) => void;
  onHire?: (on: boolean) => void;
  onReject?: (on: boolean) => void;
};

/** The model's part, said under the heading: what it changed, what it left alone, what it could not do. Nothing when it did nothing. */
function Lines({ lines }: { lines: NonNullable<CardView["lines"]> }): JSX.Element {
  const single = [lines.changed, lines.protectedColumns, lines.fallback, lines.ask].filter((t): t is string => !!t);
  const all = [...single, ...lines.vetoes, ...(lines.protected ? [lines.protected] : []), ...lines.unused];
  if (!all.length) return <></>;
  return <>{all.map((t) => <p key={t} className="pi-note t-body-sm">{t}</p>)}</>;
}

/** What is drawn: everything it needs is in `view`, so it can be tested without a page. */
export function PeopleCard({ view, on }: { view: CardView; on: CardActions }): JSX.Element {
  const { sheet, phase } = view;
  const uid = useId();

  const scope = view.scope && !view.file ? <p className="pi-scope t-body-sm">{view.scope}</p> : null;
  if (phase === "reading") {
    return <div className="pi">{scope}<p className="pi-busy t-body" role="status"><Loader size="sm" />Reading {view.name}</p></div>;
  }
  if (phase === "failed" && !sheet) {
    return (
      <div className="pi-fail">
        {scope}
        <p className="t-body" role="alert">{view.error ?? "I couldn't read that sheet."}</p>
        <div className="pi-row"><button type="button" className="src-btn is-quiet mo-small" onClick={on.onRetry}>Try again</button></div>
      </div>
    );
  }
  if (!sheet) return <></>;
  if (sheet.kind === "other" || (view.scope && sheet.kind === "roles")) {
    const columns = sheet.columns.length > 0;
    return (
      <div className="pi-fail">
        {scope}
        <p className="t-body" role="alert">I couldn't find people in {view.name}. A sheet of people needs a LinkedIn link, an email or a phone number on each row. If it is a list of roles instead, I can read it that way.</p>
        {view.lines && <Lines lines={view.lines} />}
        {columns && <p className="pi-look t-body-sm">Or tell me which column is which below, and I'll read it again.</p>}
        {columns && <ColumnList view={view} on={on} uid={uid} />}
        <div className="pi-row">
          <button type="button" className="src-btn is-quiet mo-small" onClick={on.onAsRoles}>Read it as roles</button>
        </div>
      </div>
    );
  }

  const left = leftOutLines(sheet);
  const facts = factLines(sheet, view.shortlist?.name ?? null);
  if (sheet.counts.phonesCut) facts.push(`${sheet.counts.phonesCut.toLocaleString("en-IN")} phone ${sheet.counts.phonesCut === 1 ? "number" : "numbers"} that Excel had cut short, not used`);
  const look = lookLine(sheet);
  const busy = phase === "adding";
  const off = view.file ? !view.file.on : false;
  const rules = view.rules ?? [];

  return (
    <div className="pi" aria-busy={busy || undefined}>
      {scope}
      {view.file && (
        <label className="pi-tick pi-file-t t-body">
          <input type="checkbox" checked={view.file.on} disabled={busy} onChange={(e) => on.onFile?.(e.target.checked)} />
          <span>{view.file.label}</span>
        </label>
      )}
      {off ? <p className="pi-note t-body-sm">Not added.</p> : (
        <>
      <h3 className="pi-h">{headline(sheet, view.name)}</h3>
      {view.words && <p className="pi-note t-body-sm">{view.words}</p>}
      {view.unread && <p className="pi-note t-body-sm">{view.unread}</p>}
      {view.checking && <p className="pi-upd t-caption" role="status"><Loader size="sm" />{view.checking}</p>}
      {view.refreshing && !view.checking && <p className="pi-upd t-caption" role="status"><Loader size="sm" />Reading it again</p>}
      {view.note && <p className="pi-note t-body-sm">{view.note}</p>}
      {view.lines && <Lines lines={view.lines} />}
      {rules.length > 0 && (
        <fieldset className="pi-tabs-pick" disabled={busy}>
          <legend className="t-label">From your words</legend>
          {rules.map((r, i) => (
            <label key={r.key} className="pi-tick t-body-sm">
              <input type="checkbox" checked={r.on} onChange={(e) => on.onRule?.(i, e.target.checked)} />
              <span>{r.text}{r.phrase && <small className="t-caption"> You said '{r.phrase}'.</small>}</span>
            </label>
          ))}
        </fieldset>
      )}
      {facts.length > 0 && <ul className="pi-facts">{facts.map((t) => <li key={t} className="t-body">{t}</li>)}</ul>}
      {view.tabs.length > 1 && (
        <fieldset className="pi-tabs-pick" disabled={busy}>
          <legend className="t-label">Tabs to add</legend>
          {view.tabs.map((t) => (
            <label key={t.name} className="pi-tick t-body-sm">
              <input
                type="checkbox"
                checked={t.on}
                disabled={t.readable === false || (t.on && view.tabs.filter((x) => x.on).length === 1)}
                onChange={(e) => on.onTab(t.name, e.target.checked)}
              />
              <span>
                {t.name}{" "}
                <small className="t-caption">
                  {t.readable === false
                    ? `(${(t.rows ?? 0).toLocaleString("en-IN")} ${t.rows === 1 ? "row" : "rows"}, not read as people)`
                    : `(${t.people.toLocaleString("en-IN")} ${t.people === 1 ? "person" : "people"}${t.on ? "" : ", not added"})`}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {view.hidden && (
        <label className="pi-tick t-body-sm">
          <input type="checkbox" checked={view.hidden.on} disabled={busy} onChange={(e) => on.onHidden(e.target.checked)} />
          <span>{view.hidden.label}</span>
        </label>
      )}

      {left.length > 0 && (
        <div className="pi-left" role="status">
          <p className="pi-left-h t-label">Left out</p>
          <ul>{left.map((t) => <li key={t} className="t-body-sm">{t}</li>)}</ul>
        </div>
      )}

      {sheet.columns.length > 0 && (
        <div className="pi-cols">
          {look && <p className="pi-look t-body-sm" role="status">{look}</p>}
          <button type="button" className="cn-link pi-cols-t" aria-expanded={view.columnsOpen} aria-controls={`${uid}-columns`} onClick={on.onToggleColumns}>
            {view.columnsOpen ? "Hide the columns" : look ? "Check the columns" : "How I read your columns"}
          </button>
          {view.columnsOpen && <ColumnList view={view} on={on} uid={uid} />}
        </div>
      )}
        </>
      )}

      {!view.file && <PeopleFooter view={view} on={on} />}
    </div>
  );
}

/** The columns of a sheet, each with a dropdown to say what it is: the ones that are read first, then the ones left out. */
function ColumnList({ view, on, uid }: { view: CardView; on: CardActions; uid: string }): JSX.Element {
  const sheet = view.sheet;
  if (!sheet) return <></>;
  const { used, left: unread } = splitColumns(sheet);
  const busy = view.phase === "adding";
  return (
    <ul id={`${uid}-columns`} className="pi-col-list" aria-label="Columns">
      {[...used, ...unread].map((c) => {
        const sample = `${uid}-sample-${c.index}`;
        return (
          <li key={c.index} className="pi-col">
            <span className="pi-col-n t-body-sm">
              {columnName(c)}
              {c.confidence === "guess" && <small className="pi-guess"> not sure</small>}
              {c.how === "plan" && <small className="pi-guess"> checked</small>}
            </span>
            <span className="pi-col-s t-caption" id={sample}>{c.samples[0] ?? ""}</span>
            <select
              className="pi-sel"
              value={selectValue(c.role)}
              aria-label={columnQuestion(c)}
              aria-describedby={c.samples[0] ? sample : undefined}
              disabled={busy}
              onChange={(e) => on.onColumn(c.index, e.target.value as Role)}
            >
              {ROLE_CHOICES.map(([role, text]) => <option key={role} value={role}>{text}</option>)}
            </select>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Placing the people on the stage their status says: one tick, off until the person turns it on. Then the sheet's own words, each
 * with a choice (the ones no rule can place say so and stay on Shared), and hiring and rejecting as two ticks of their own, named.
 */
function PlaceBlock({ view, on, busy }: { view: PlaceView; on: CardActions; busy: boolean }): JSX.Element {
  return (
    <div className="pi-place">
      <label className="pi-tick t-body">
        <input type="checkbox" checked={view.on} disabled={busy} onChange={(e) => on.onPlace?.(e.target.checked)} />
        <span>{PLACE_LABEL}</span>
      </label>
      {view.on && (
        <div className="pi-place-body">
          <p className="pi-note t-body-sm">{PLACE_HELP}</p>
          {view.words.length > 0 && (
            <ul className="pi-col-list" aria-label="What each status does">
              {view.words.map((w) => (
                <li key={w.key} className="pi-col">
                  <span className="pi-col-n t-body-sm">{w.text} <small className="t-caption">{w.count}</small></span>
                  <span className="pi-col-s t-caption">{w.unknown ? UNKNOWN_WORD : ""}</span>
                  <select
                    className="pi-sel"
                    value={w.choice}
                    aria-label={`Where ${w.text} goes`}
                    disabled={busy}
                    onChange={(e) => on.onWord?.(w.key, e.target.value as PlaceChoice)}
                  >
                    {PLACE_CHOICES.map(([choice, text]) => <option key={choice} value={choice}>{text}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          )}
          {view.hire && (
            <label className="pi-tick t-body-sm">
              <input type="checkbox" checked={view.hire.on} disabled={busy} onChange={(e) => on.onHire?.(e.target.checked)} />
              <span>{view.hire.label} <small className="t-caption">{view.hire.names}. {view.hire.said}</small></span>
            </label>
          )}
          {view.reject && (
            <label className="pi-tick t-body-sm">
              <input type="checkbox" checked={view.reject.on} disabled={busy} onChange={(e) => on.onReject?.(e.target.checked)} />
              <span>{view.reject.label} <small className="t-caption">{view.reject.names}. {view.reject.said}</small></span>
            </label>
          )}
          {view.unplaced && <p className="pi-note t-caption">{view.unplaced}</p>}
        </div>
      )}
    </div>
  );
}

/** Where they go, the one button, how far it has got and how it ended: the foot of a card, whether it holds one file or several. */
export function PeopleFooter({ view, on }: { view: CardView; on: CardActions }): JSX.Element {
  const { sheet, phase } = view;
  const result = useRef<HTMLParagraphElement>(null);
  const problem = useRef<HTMLParagraphElement>(null);
  const was = useRef(phase);
  /* Focus goes with the work. The button was where the keyboard and a screen reader were, and it is gone (or off) once
     adding ends: to the line that says how it went, whether it finished or stopped short. */
  useEffect(() => {
    if (was.current === "adding") (phase === "done" ? result : problem).current?.focus();
    was.current = phase;
  }, [phase]);

  const shortlistName = view.shortlist?.name ?? null;
  const total = view.total ?? (sheet ? sheet.rows.length : 0);
  const label = addLabelOf(total, shortlistName);
  const busy = phase === "adding";
  /* What the button adds, said where a screen reader finds it with the button, and again whenever a tick or a campaign changes it: the
     card of several files says it in view (with the rows that were joined); a card of one says it for the ear alone, as the button has it. */
  const counted = useId();
  const said = label ? (view.totals ?? countLine(total, shortlistName)) : null;
  return (
    <>
      {view.choice && phase !== "done" && (
        <label className="pi-pick t-body-sm">
          <span>Also put them on a campaign</span>
          <select className="pi-sel" value={view.choice.value ?? ""} disabled={busy} onChange={(e) => on.onShortlist(e.target.value || null)}>
            <option value="">No, just Candidates</option>
            {view.choice.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}

      {view.placing && phase !== "done" && <PlaceBlock view={view.placing} on={on} busy={busy} />}

      {phase !== "done" && said && <p id={counted} className={view.totals ? "pi-totals t-body-sm" : "sr-only"} aria-live="polite">{said}</p>}

      {phase === "done" && view.done ? (
        <footer className="pi-foot is-done">
          <p ref={result} tabIndex={-1} className="pi-done t-body" role="status"><Check size={14} weight="bold" aria-hidden="true" />{view.done.line}</p>
          <a className="cn-link" href={view.done.href}>{view.done.link}</a>
          <button type="button" className="src-btn is-quiet mo-small" onClick={on.onAnother}>Add another sheet</button>
        </footer>
      ) : (
        <footer className="pi-foot">
          {label ? (
            <button type="button" className="src-btn is-primary mo-small" aria-describedby={said ? counted : undefined} disabled={busy || view.refreshing || view.stale || !!view.checking} onClick={on.onAdd}>
              {busy ? <><Loader size="sm" tone="inherit" />Adding</> : <>{label}<ArrowRight size={13} weight="bold" aria-hidden="true" /></>}
            </button>
          ) : (
            <p className="pi-none t-body">{view.nothing ?? (sheet ? nothingToAdd(sheet, shortlistName) : "There is nobody to add.")}</p>
          )}
          {view.stale && <button type="button" className="src-btn is-quiet mo-small" onClick={on.onRetry}>Read it again</button>}
          {view.progress && (
            <div
              className="pi-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={view.progress.total}
              aria-valuenow={view.progress.done}
              aria-valuetext={progressLine(view.progress.done, view.progress.total)}
              aria-label="Adding"
            >
              <span className="pi-progress-t t-body-sm">{progressLine(view.progress.done, view.progress.total)}</span>
              <span className="ji-bar" aria-hidden="true"><span style={{ width: `${Math.round((view.progress.done / Math.max(1, view.progress.total)) * 100)}%` }} /></span>
            </div>
          )}
        </footer>
      )}
      {view.error && (sheet || view.total !== undefined) && <p ref={problem} tabIndex={-1} className="pi-err t-body-sm" role="alert">{view.error}</p>}
    </>
  );
}

/* ── one file, from reading to its people ── */

type Source = { file: File | null; link: string | null; name: string; read: PeopleSheet | null; readFor: string | null };

const seedSource = (s: SheetSeed): Source => ({
  file: s.file,
  link: s.link,
  name: s.file ? s.file.name || "your sheet" : "your sheet",
  read: s.read,
  readFor: s.campaignId,
});

const NOBODY: Tally = { added: 0, already: 0, failed: 0 };

/* The model's help is asked for one file at a time: a team has a few answers going at once, and several files asking together
   would take them all, and the last of them be told it is busy. */
const helpTurn = inTurns(1);

/** What a file tells the card it sits on: whether it can be added, what, and whether it is still working. */
type Report = {
  sheet: PeopleSheet | null;
  /** Read as people and shown: its people can be added. */
  ready: boolean;
  /** Reading, or reading again, or waiting for the model's help: Add waits. */
  busy: boolean;
  /** The last reading failed, so what is shown is from before it. */
  stale: boolean;
  /** The campaign the words named, as the model understood them. */
  suggests: { id: string; name: string } | null;
  /** The model's help was asked for about this file: the words typed beside it were read there, or were not asked about at all. */
  asked: boolean;
  /** The words ask for more than adding and the request for the model's help did not get an answer: they were not read, and the card says so. */
  lost: boolean;
};

/** What the card the file sits on holds for it: where the people go, how the adding is going, and what to do about it. */
type Shared = {
  phase: "ready" | "adding" | "done";
  shortlist: { id: string; name: string } | null;
  choice: CardView["choice"];
  note: string | null;
  halt: string | null;
  progress: CardView["progress"];
  done: CardView["done"];
  words: string | null;
  /** The words typed beside the files were not read: said once, where the card of several files has room for it. */
  unread: string | null;
  /** Nobody is left to add because everyone is in already: what the words asked besides adding goes on at once. */
  inAlready: boolean;
  placing: PlaceView | null;
  on: Pick<CardActions, "onShortlist" | "onAdd" | "onAnother" | "onPlace" | "onWord" | "onHire" | "onReject">;
};

function FileSection({ id, source, campaigns, shortlistId, many, scoped, say, off, onOff, again, shared, report }: {
  id: string;
  source: Source;
  campaigns: ReadonlyArray<{ id: string; name: string }>;
  shortlistId: string | null;
  /** One of several files on the card: it has its own tick, and the card's foot is not its own. */
  many: boolean;
  /** The person chose this file as Candidates: it is never handed on to the roles import by what is in it. */
  scoped: boolean;
  /** The words typed beside the files, as they typed them. */
  say: string | null;
  off: boolean;
  onOff: (off: boolean) => void;
  /** Counts up when an adding stopped short, so the sheet is read again for who is left. */
  again: number;
  shared: Shared;
  report: (id: string, r: Report) => void;
}): JSX.Element {
  const [chosen, setChosen] = useState<Readonly<Record<number, Role>>>({});
  const [sheet, setSheet] = useState<PeopleSheet | null>(source.read);
  const [phase, setPhase] = useState<CardPhase>(source.read ? "ready" : "reading");
  /* Why the last reading failed. */
  const [readError, setReadError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [open, setOpen] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /* The model's help is being asked for: what it is for, in a few words. */
  const [checking, setChecking] = useState<string | null>(null);
  const [asRoles, setAsRoles] = useState(false);
  /* The words were worth reading and the model's help could not be had at all (not even a busy answer): said, not dropped. */
  const [lost, setLost] = useState(false);
  /* Which tabs are added (none said: the main one alone when several hold people) and whether the hidden rows are read too. */
  const [tabs, setTabs] = useState<readonly string[] | undefined>(undefined);
  const [hidden, setHidden] = useState(false);
  /* What the first answer to the words said, kept and sent back with every reading after it; ticking a rule changes it, and counts up. */
  const [ticked, setTicked] = useState(0);
  const kept = useRef<ClientPlan | null>(null);
  const planned = useRef(false);
  const have = useRef<PeopleSheet | null>(source.read);
  const [reads] = useState(() => latestRead());
  const first = useRef(true);
  const loader = useRef<(columns: string | undefined, campaignId: string | null, start?: boolean, how?: "read" | "plan") => void>(() => undefined);

  const asks = !!say && hasInstruction(say, campaignsIn(say, campaigns).map((c) => c.name));
  /* What the words say and whether they ask for more than adding can change as the campaigns load; a reading in flight is not asked
     again for it, so the callback below reads them from here and not from its own dependencies. */
  const live = useRef({ asks, say });
  live.current = { asks, say };

  const load = useCallback(
    (columns: string | undefined, campaignId: string | null, start = false, how: "read" | "plan" = "read") => {
      // The sheet the composer already read is used as it is, unless it is worth the model's help and has not had it.
      let mode = how;
      if (start) {
        const step = firstStep({ start, read: source.read, readFor: source.readFor, campaignId, columns, tabs, hidden, kept: !!kept.current, planned: planned.current, wordsAsk: live.current.asks });
        if (step === "use") return;
        mode = step;
      }
      if (mode === "plan") {
        planned.current = true;
        setChecking(live.current.asks ? "Reading your words…" : "Checking your columns…");
      }
      const read = reads.begin();
      setReadError(null);
      setRefreshing(true);
      setPhase((p) => (p === "failed" ? "reading" : p));
      const opts = { campaignId, columns, tabs, hidden, plan: mode === "read" ? (kept.current ?? undefined) : undefined, signal: read.signal };
      const asked =
        mode === "plan"
          ? helpTurn(() => (source.file ? peopleSheetApi.plan(source.file, live.current.say ?? "", opts) : peopleSheetApi.planLink(source.link ?? "", live.current.say ?? "", opts)))
          : source.file ? peopleSheetApi.read(source.file, opts) : peopleSheetApi.readLink(source.link ?? "", opts);
      asked.then(
        (s) => {
          if (!read.current()) return;
          if (s.assist?.plan) kept.current = s.assist.plan;
          if (mode === "plan") setLost(false);
          have.current = s;
          setSheet(s);
          setPhase("ready");
          setRefreshing(false);
          setChecking(null);
          setStale(false);
          // A reading that says it is worth the model's help is asked for it, once.
          if (planAfter(s, mode, planned.current, live.current.asks)) loader.current(columns, campaignId, false, "plan");
        },
        (e: unknown) => {
          // Another reading was asked for, or the card was left: nothing to say about this one.
          if (!read.current()) return;
          setChecking(null);
          setRefreshing(false);
          // The model's help failing leaves the plain reading, which was good: nothing to hold Add for. The words it was to read are said to be unread.
          if (mode === "plan" && have.current) {
            if (live.current.asks) setLost(true);
            return;
          }
          setReadError(messageOf(e));
          setStale(true);
          setPhase((p) => (p === "reading" ? "failed" : p));
        },
      );
    },
    [source, reads, tabs, hidden, ticked],
  );
  loader.current = load;

  /* What changes the reading (a column, a campaign, a tab, the hidden rows, a rule ticked, an adding that stopped short) reads it
     again; the first time, the sheet the composer read is used as it is. */
  useEffect(() => {
    const start = first.current;
    first.current = false;
    load(columnsParam(chosen), shortlistId, start);
  }, [chosen, shortlistId, load, again]);

  /* Leaving the card leaves the work: no reading is waited for. */
  useEffect(() => () => reads.stop(), [reads]);

  const real = sheet?.kind === "people";
  useEffect(() => {
    report(id, {
      sheet,
      ready: real && phase === "ready",
      busy: refreshing || !!checking || phase === "reading",
      stale: stale && !!sheet,
      suggests: suggestedBy(sheet),
      asked: planned.current,
      lost,
    });
  }, [id, sheet, real, phase, refreshing, checking, stale, lost, report]);

  if (((sheet?.kind === "roles" && !scoped) || (sheet && sheet.kind !== "people" && asRoles)) && (source.file || source.link)) {
    return <JdIntake seed={{ files: source.file ? [source.file] : [], texts: [], links: source.link ? [source.link] : [] }} embedded />;
  }

  const a = sheet?.assist;
  const view: CardView = {
    name: source.name,
    phase: shared.phase === "ready" ? phase : shared.phase,
    sheet,
    shortlist: shared.shortlist,
    choice: shared.choice,
    /* On a card of several files what is said of the whole (where they go, what was done with the words) is said once, over them all. */
    note: many ? null : shared.note,
    error: many
      ? (readError ? (sheet ? `I couldn't read the sheet again, so Add stays off until I can. ${readError}` : readError) : null)
      : [shared.halt, readError ? (sheet ? `I couldn't read the sheet again, so Add stays off until I can. ${readError}` : readError) : null].filter(Boolean).join(" ") || null,
    progress: shared.progress,
    done: shared.done,
    columnsOpen: open ?? !!sheet?.needsCheck,
    refreshing,
    stale: stale && !!sheet,
    scope: scoped ? scopeLine(sheet, source.name) : null,
    words: many ? null : shared.words,
    unread: many ? null : shared.unread,
    tabs: sheet ? tabRows(sheet) : [],
    hidden: sheet && hasHidden(sheet) ? { label: hiddenLabel(sheet.hidden!), on: sheet.hidden!.included } : null,
    lines: sheet ? {
      changed: changedLine(sheet),
      protectedColumns: protectedColumnsLine(a),
      protected: a?.protected ? PROTECTED_LINE : null,
      fallback: fallbackLine(a),
      ask: askLine(a),
      vetoes: vetoLines(a),
      unused: many ? [] : [...unusedLines(a, say, shared.inAlready), ...(lost && say ? [unavailableLine(say.trim().slice(0, 80))] : [])],
    } : undefined,
    rules: ruleLines(a),
    checking,
    placing: shared.placing,
    file: many ? { on: !off, label: `${source.name}${sheet?.kind === "people" ? `, ${sheet.counts.people.toLocaleString("en-IN")} ${sheet.counts.people === 1 ? "person" : "people"}` : ""}` } : null,
  };
  return (
    <PeopleCard
      view={view}
      on={{
        onColumn: (index, role) => {
          const column = sheet?.columns.find((c) => c.index === index);
          if (column) setChosen((c) => choose(c, column, role));
        },
        onShortlist: shared.on.onShortlist,
        onAdd: shared.on.onAdd,
        onPlace: shared.on.onPlace,
        onWord: shared.on.onWord,
        onHire: shared.on.onHire,
        onReject: shared.on.onReject,
        onToggleColumns: () => setOpen((o) => !(o ?? !!sheet?.needsCheck)),
        onRetry: () => load(columnsParam(chosen), shortlistId),
        onAsRoles: () => setAsRoles(true),
        onAnother: shared.on.onAnother,
        onTab: (name, on) => {
          const now = tabs ?? (sheet ? tickedTabs(sheet) : []);
          const next = on ? [...now.filter((t) => t !== name), name] : now.filter((t) => t !== name);
          // The order of the sheet's own tabs, so the first it holds is the first read.
          const order = sheet?.tabs.map((t) => t.name) ?? next;
          if (next.length) setTabs(order.filter((t) => next.includes(t)));
        },
        onHidden: (on) => setHidden(on),
        onRule: (index, on) => {
          const base = kept.current ?? a?.plan;
          if (!base) return;
          kept.current = planWith(base, (a?.lines ?? []).map((l, i) => (i === index ? on : l.on)));
          setTicked((v) => v + 1);
        },
        onFile: (on) => onOff(!on),
      }}
    />
  );
}

/* ── the card: one or several files, one place they go, one button ── */

/** Who goes in: a person's fields, and what a sheet says of where they would be put (a resume says nothing). */
type Person = { fields: SheetFields; file: string; status?: string | undefined; alsoSaid?: readonly string[] | undefined };

function Files({ queue, resumes, reset, focus, scoped, words, say, onFinish, onSent, follow }: {
  queue: readonly Source[];
  /** Resumes that came with the sheets, as Candidates: one part of the same card, read by their own route and added by the same button. */
  resumes: readonly ResumeSeed[];
  reset: () => void;
  focus: { id: string; name: string } | null;
  scoped: boolean;
  words: { text: string; picked: string } | null;
  say: string | null;
  /** The adding came to its end: the card lets go of its files, and leaves what it said of how it went. */
  onFinish?: ((done: FinishedAdd) => void) | undefined;
  /** Some of the people went in (the adding may have stopped short): what the files were read as before is no longer true. */
  onSent?: (() => void) | undefined;
  /** Asks the agent for what the words said besides adding, once the people are in. */
  follow?: ((text: string, campaignId: string | null) => void) | undefined;
}): JSX.Element {
  const rows = useCampaignRows();
  const toast = useToast();
  const mayChange = useMayChangeCampaign(focus?.id ?? null);
  /* Where they go. Not chosen yet (undefined): the campaign the person's words named, else the one the message carried, if the person
     may use it, else Candidates. Chosen: that campaign, or null for Candidates alone, which the person can always say. */
  const [pick, setPick] = useState<string | null | undefined>(undefined);
  const [reports, setReports] = useState<Readonly<Record<string, Report>>>({});
  /* What the resumes hold, ticked (they are read by their own part of the card). */
  const [resumed, setResumed] = useState<ResumeReport | null>(null);
  /* The files the person took off the card, by their place in it. */
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [halt, setHalt] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [again, setAgain] = useState(0);
  const [progress, setProgress] = useState<CardView["progress"]>(null);
  const [done, setDone] = useState<CardView["done"]>(null);
  /* The adding in flight, to stop it if the card is left; and what earlier tries of it already put in and moved (for the same place). */
  const running = useRef<AbortController | null>(null);
  const earlier = useRef<{ for: string | null; tally: Tally; placed: PlacedTally | null } | null>(null);
  /* What the words asked besides adding is passed on once, when the people are in. */
  const passedOn = useRef(false);
  /* Placing the people by their status is a tick, off until the person turns it on. What they mean each of the sheet's words to be (only
     where they changed the rules' reading), and the two ticks of their own: hiring and rejecting go only for the people those name.
     Each of the two holds what it named when it was ticked (peopleSheet.ts, namedBy): once the sheet is read again and names others, it is off. */
  const [place, setPlace] = useState(false);
  const [meant, setMeant] = useState<Readonly<Record<string, PlaceChoice>>>({});
  const [hire, setHire] = useState<string | null>(null);
  const [reject, setReject] = useState<string | null>(null);

  const open_ = useMemo(() => rows.filter((r) => r.status === "active" && r.canManage !== false), [rows]);
  const focusRow = focus ? rows.find((r) => r.id === focus.id) : undefined;
  const onFocus = !!focus && mayChange && focusRow?.status !== "closed";
  const focusId = focus?.id ?? null;
  const focusName = focus?.name ?? "";
  const campaigns = useMemo(() => {
    const list = open_.map((r) => ({ id: r.id, name: r.name }));
    return onFocus && focusId && !list.some((c) => c.id === focusId) ? [{ id: focusId, name: focusName }, ...list] : list;
  }, [open_, onFocus, focusId, focusName]);
  const ids = queue.map((s, i) => `${i}:${s.name}`);
  const { suggested, wanted } = whereTheyGo({ pick, words: !!words, suggests: ids.map((id) => reports[id]?.suggests ?? null), campaigns, onFocus, focusId });
  const shortlist = wanted ? (campaigns.find((c) => c.id === wanted) ?? null) : null;
  const shortlistId = shortlist?.id ?? null;

  const report = useCallback((id: string, r: Report) => setReports((all) => ({ ...all, [id]: r })), []);

  /* Leaving the card leaves the work: no batch is sent after the one in flight. */
  useEffect(() => () => running.current?.abort(), []);

  const mine = ids.filter((id) => !off.has(id) && reports[id]?.ready);
  const sheets = mine.flatMap((id) => reports[id]?.sheet ?? []);
  /* The people of every file, the resumes first and then the sheets in the order they were attached, each person once: one who is in
     more than one file is joined into the first (joinPeople.ts, which is the import's own rule). */
  const { people: everyone, joined } = useMemo(
    () =>
      joinPeople<Person>([
        ...(resumed?.people ?? []),
        ...mine.flatMap((id) => (reports[id]?.sheet?.rows ?? []).map((r) => ({ fields: r.fields, file: id, status: r.status, alsoSaid: r.alsoSaid }))),
      ]),
    // (`mine` is made of these: the readings, the files taken off, and the files themselves.)
    [reports, off, resumed, ids.join("|")],
  );
  /* Only with a status column and a campaign they go on. Counted and named from the people that go in, each once (what joinPeople left), so
     the ticks promise what the moves do. */
  const placing = shortlistId ? placingOf([{ rows: everyone, statusWords: sheets.flatMap((s) => s.statusWords ?? []) }], meant) : null;
  const hireOn = stillHolds(hire, placing?.hireKey);
  const rejectOn = stillHolds(reject, placing?.rejectKey);
  const placeShown = placing ? placeView(placing, { on: place, hire: hireOn, reject: rejectOn }) : null;
  const busy = ids.some((id) => reports[id]?.busy) || !!resumed?.busy;
  const stale = ids.some((id) => reports[id]?.stale) || !!resumed?.stale;
  /* The words the card read, and the one it did not (one word left of them is nothing to ask a model about, and nothing else reads it). */
  const unread = say && ids.length > 0 && ids.every((id) => reports[id] && !reports[id]?.asked && !reports[id]?.busy)
    ? unreadLine(say, campaignsIn(say, campaigns).map((c) => c.name))
    : null;

  /* What the words asked besides adding (a next step the reading could not do) goes to the agent once the people are in, and once: after the
     adding, or at once when nobody is left to add because everyone is in already (there is no button to wait for). */
  const next = followUpAfter(nextStepsOf(mine.flatMap((id) => reports[id]?.sheet?.assist?.unused ?? []), say));
  const passOn = () => {
    if (!next || passedOn.current) return;
    passedOn.current = true;
    follow?.(next, shortlistId ?? focusId);
  };
  const allIn = !busy && !stale && !adding && !done && !everyone.length && sheets.some((s) => s.counts.alreadyHere > 0);
  useEffect(() => {
    if (allIn) passOn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allIn, next]);

  const add = async () => {
    // One adding at a time: the ref answers at once, before the button has been drawn off.
    if (adding || running.current || busy || stale || !everyone.length) return;
    const stop = new AbortController();
    running.current = stop;
    const before = earlier.current?.for === shortlistId ? earlier.current : null;
    setAdding(true);
    setHalt(null);
    setProgress({ done: 0, total: everyone.length });
    /* What the person agreed to when they pressed Add. Each batch's people are put on the stages their status says as they go in, by these
       ticks, so nothing waits for a later try to be made under ticks that have changed since (or for a place that has). */
    const { run, placed: placedNow } = await addAndPlace(everyone, {
      send: (fields) => peopleSheetApi.send(fields, shortlistId, stop.signal),
      place: shortlistId ? (request) => peopleSheetApi.place(shortlistId, request) : undefined,
      placing: place ? placing : null,
      ticks: { hire: hireOn, reject: rejectOn },
      signal: stop.signal,
      onProgress: (sent) => { if (!stop.signal.aborted) setProgress({ done: sent, total: everyone.length }); },
    });
    if (running.current === stop) running.current = null;
    if (run.parts.length) invalidate(["pipeline", "candidates", "campaign"], shortlistId ? { campaignId: shortlistId } : {});
    // Some went in, whether it ended, stopped short or the card was left: what the files were read as before is no longer who is new.
    if (run.sent > 0) onSent?.();
    // The card was left, so the page says how far it got, in a line that stays; the card has nobody to tell.
    if (run.stopped) { if (run.sent) toast(leftEarlyLine(run.sent, everyone.length), "error"); return; }
    const now = carryOn(before?.tally ?? NOBODY, tally(run.parts));
    const placed = carryPlaced(before?.placed ?? null, placedNow);
    setProgress(null);
    if (run.failure) {
      setAdding(false);
      earlier.current = { for: shortlistId, tally: now, placed };
      setHalt(stoppedLine(messageOf(run.failure.error), now, placed));
      // Who is left is read again, so the button and the numbers are true before it goes on (not when nobody went in).
      if (readAgainAfter(run)) setAgain((n) => n + 1);
      return;
    }
    if (stop.signal.aborted) return;
    setAdding(false);
    const said = { line: doneLine(now, shortlist?.name ?? null, placed), href: seeThemHref(shortlistId), link: SEE_THEM(shortlistId) };
    setDone(said);
    onFinish?.(said);
    // Only now are the people in.
    passOn();
  };

  const many = queue.length > 1 || resumes.length > 0;
  const shared: Shared = {
    phase: done ? "done" : adding ? "adding" : "ready",
    shortlist,
    choice: campaigns.length ? { options: campaigns, value: shortlistId } : null,
    note: focus && !onFocus
      ? mayChange ? `${focus.name} is closed, so I'll add them to Candidates.` : `You follow ${focus.name} but are not on it, so I'll add them to Candidates.`
      : null,
    halt,
    progress,
    done,
    words: words
      ? `Your note stays in the chat. I used it to pick ${words.picked}.`
      : suggested ? `Your note stays in the chat. I used it to pick ${suggested.name}.` : null,
    unread,
    inAlready: allIn,
    placing: placeShown,
    on: {
      onShortlist: (id) => { setPick(id); setHalt(null); },
      onAdd: () => { void add(); },
      onAnother: reset,
      onPlace: setPlace,
      onWord: (key, choice) => setMeant((all) => ({ ...all, [key]: choice })),
      onHire: (on) => setHire(on && placing ? placing.hireKey : null),
      onReject: (on) => setReject(on && placing ? placing.rejectKey : null),
    },
  };

  /* The files together: how many people, from how many files, and how many rows were one person in more than one of them. */
  const fromFiles = mine.length + (resumed?.files ?? 0);
  /* The parts of the words that could not be done, said once over all the files (each file was asked the same words). */
  const notDone = [...new Set([
    ...ids.flatMap((id) => unusedLines(reports[id]?.sheet?.assist, say, allIn)),
    ...(say && ids.some((id) => reports[id]?.lost) ? [unavailableLine(say.trim().slice(0, 80))] : []),
  ])];

  /* One card for the files: a line for what is added from all of them, a section for each with its tick, and the one foot. */
  const footer: CardView = {
    name: `${queue.length + resumes.length} files`,
    phase: shared.phase,
    sheet: null,
    shortlist,
    choice: shared.choice,
    note: null,
    error: halt,
    progress,
    done,
    columnsOpen: false,
    refreshing: busy,
    stale,
    scope: null,
    words: null,
    tabs: [],
    hidden: null,
    total: everyone.length,
    totals: everyone.length ? totalsLine(everyone.length, fromFiles, joined) : null,
    nothing: nothingInFiles(sheets, shortlist?.name ?? null),
    placing: placeShown,
  };

  return (
    <div className={many ? "pi pi-files" : undefined}>
      {many && scoped && <p className="pi-scope t-body-sm">{`Adding people from ${queue.length + resumes.length} files. Nothing else in them is added.`}</p>}
      {many && shared.words && <p className="pi-note t-body-sm">{shared.words}</p>}
      {many && shared.unread && <p className="pi-note t-body-sm">{shared.unread}</p>}
      {many && shared.note && <p className="pi-note t-body-sm">{shared.note}</p>}
      {many && notDone.map((t) => <p key={t} className="pi-note t-body-sm">{t}</p>)}
      {resumes.length > 0 && <ResumeSection seeds={resumes} shortlist={shortlist} again={again} phase={shared.phase} report={setResumed} />}
      {queue.map((source, i) => (
        <FileSection
          key={ids[i]}
          id={ids[i] ?? ""}
          source={source}
          campaigns={campaigns}
          shortlistId={shortlistId}
          many={many}
          scoped={scoped}
          say={say}
          off={off.has(ids[i] ?? "")}
          onOff={(v) => setOff((all) => { const next = new Set(all); if (v) next.add(ids[i] ?? ""); else next.delete(ids[i] ?? ""); return next; })}
          again={again}
          shared={shared}
          report={report}
        />
      ))}
      {many && (
        <PeopleFooter
          view={footer}
          on={{
            onColumn: () => undefined,
            onShortlist: shared.on.onShortlist,
            onAdd: shared.on.onAdd,
            onPlace: shared.on.onPlace,
            onWord: shared.on.onWord,
            onHire: shared.on.onHire,
            onReject: shared.on.onReject,
            onToggleColumns: () => undefined,
            onRetry: () => setAgain((n) => n + 1),
            onAsRoles: () => undefined,
            onAnother: reset,
            onTab: () => undefined,
            onHidden: () => undefined,
          }}
        />
      )}
    </div>
  );
}

/* ── no sheet yet: choose one, or paste a link ── */

function Picker({ onSource }: { onSource: (s: Source) => void }): JSX.Element {
  const [link, setLink] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const take = (files: File[]) => { const f = files[0]; if (f) onSource({ file: f, link: null, name: f.name, read: null, readFor: null }); };
  return (
    <div className="pi-pick-file">
      <input ref={input} type="file" hidden accept={SHEET_ACCEPT} onChange={(e) => { take([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <button type="button" className="src-btn is-primary mo-small" onClick={() => input.current?.click()}>
        <UploadSimple size={14} weight="bold" aria-hidden="true" />Choose a sheet
      </button>
      <span className="t-body-sm pi-or">Excel, CSV or TSV. Or paste a Google Sheet's link.</span>
      <form className="pi-link" onSubmit={(e) => {
        e.preventDefault();
        const url = sheetLinkIn(link);
        if (url) onSource({ file: null, link: url, name: "your sheet", read: null, readFor: null });
      }}>
        <input className="jd-paste ji-input" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="docs.google.com/spreadsheets/…" aria-label="Google Sheet link" autoComplete="off" spellCheck={false} />
        <button type="submit" className="src-btn is-quiet mo-small" disabled={!sheetLinkIn(link)}>Read it</button>
      </form>
    </div>
  );
}
export function PeopleImport({ seeds, resumes = [], focusId, focusName, scoped = false, words = null, say = null, onFinish, onSent, follow }: {
  seeds: readonly SheetSeed[];
  /** Resumes that came with the sheets: one part of the same card. */
  resumes?: readonly ResumeSeed[];
  focusId: string | null;
  focusName: string | null;
  /** The sheets were chosen as Candidates from the paperclip's menu. */
  scoped?: boolean;
  words?: { text: string; picked: string } | null;
  /** The words typed beside the files, as typed: read together with the sheets' shapes when they ask for more than adding. */
  say?: string | null;
  /** The adding came to its end: the card lets go of its files, and leaves what it said of how it went. */
  onFinish?: ((done: FinishedAdd) => void) | undefined;
  /** Some of the people went in (the adding may have stopped short): what the files were read as before is no longer true. */
  onSent?: (() => void) | undefined;
  /** Asks the agent for what the words said besides adding, once the people are in. */
  follow?: ((text: string, campaignId: string | null) => void) | undefined;
}): JSX.Element {
  const [queue, setQueue] = useState<Source[]>(() => seeds.map(seedSource));
  /* "Add another sheet" ends the card's files, the resumes' too, and the words that were typed beside them: another sheet is read as it is
     and is asked nothing of them (they were read, and what they asked besides adding was passed on, with the first). */
  const [gone, setGone] = useState(false);
  const focus = focusId ? { id: focusId, name: focusName ?? "this campaign" } : null;
  const held = gone ? [] : resumes;
  if (!queue.length && !held.length) return <Picker onSource={(s) => { setQueue([s]); setGone(true); }} />;
  return <Files queue={queue} resumes={held} reset={() => { setQueue([]); setGone(true); }} focus={focus} scoped={scoped} words={gone ? null : words} say={gone ? null : say} onFinish={onFinish} onSent={onSent} follow={follow} />;
}

export default function PeopleImportView({ card, ctx }: LiveViewProps): JSX.Element {
  /* Looked at when the card first opens, and again if it is drawn again (the chat was left and came back): a card the paperclip opened
     finds the files of its own add, by the id in its query, and nobody else's, until it has finished with them or the time runs out;
     one the words opened takes what was left for any card, once. One that finished says how it went; only a real reload, or the time
     running out, shows "Gone". What its sheets were read as is dropped when somebody went in, so a card drawn again reads them again. */
  const adding = addingIdOf(card.query);
  const [own] = useState(() => (adding ? peekFor(adding) : null));
  const [seeds] = useState(() => (adding ? (own?.sheets ?? []) : takePeople()));
  const ended = adding && !own ? finishedFor(adding) : null;
  /* Resumes attached as Candidates are on the same card as the sheets that came with them: one destination, one button. */
  const resumes = own?.resumes ?? [];
  const words = own?.words && own.picked ? { text: own.words, picked: own.picked } : null;
  const box = useRef<HTMLDivElement>(null);
  const grow = ctx.onGrow;
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => grow());
    watch.observe(el);
    return () => watch.disconnect();
  }, [grow]);
  const finish = (done?: FinishedAdd) => { if (adding) finishFor(adding, done); };
  return (
    <div ref={box} className="src mo is-formflow">
      {adding && !own ? (
        ended ? <Finished {...ended} /> : <Gone what="This sheet" />
      ) : resumes.length > 0 && seeds.length === 0 ? (
        // A card with only resumes does not offer to choose a sheet.
        <ResumeImport seeds={resumes} focusId={card.campaignId} focusName={card.campaignName} words={words} onDone={finish} />
      ) : (
        <PeopleImport
          seeds={seeds}
          resumes={resumes}
          focusId={card.campaignId}
          focusName={card.campaignName}
          scoped={!!adding}
          words={words}
          say={own?.say ?? null}
          onFinish={finish}
          onSent={() => { if (adding) sentFor(adding); }}
          // Passed on once for the add, not once for each time the card is drawn: a card drawn again after it was does not send it again.
          follow={own?.passed ? undefined : (text, campaignId) => {
            if (adding) passedFor(adding);
            sendAction(text, FOLLOW_UP_LABEL, campaignId ?? undefined);
          }}
        />
      )}
    </div>
  );
}
