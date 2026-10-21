import { ArrowSquareOut, Check, DownloadSimple, FileXls } from "@phosphor-icons/react";
import { useState } from "react";
import type { ChatCard } from "../api/agent";
import { apiFile, messageOf } from "../api/client";
import { download } from "../exportTable";
import { Cta } from "./Cta";

/**
 * A sheet the agent made (an Excel file of a list) and what the person can do with it: download it, open the
 * copy in their Google Drive once there is one, and ask for changes in words. The card holds counts and names
 * only. The file is made by the API when the button is pressed, from the rows as they are then, so it is
 * always current and the people in it never pass through the chat.
 */

export type FileCardData = Extract<ChatCard, { kind: "file" }>;

export type FileState =
  | { s: "idle" }
  | { s: "working" }
  | { s: "done" }
  | { s: "failed"; message: string };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const count = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** "12 rows, 5 columns". */
export const fileLine = (rows: number, columns: number): string => `${count(rows, "row")}, ${count(columns, "column")}`;

/** What the button says in each state. */
export function takeLabel(state: FileState): string {
  switch (state.s) {
    case "working": return "Preparing";
    case "done": return "Download again";
    case "failed": return "Try again";
    default: return "Download Excel file";
  }
}

/**
 * Fetches the file with the person's own token and hands it to the browser to save. The outcome is a state to
 * show, never a thrown error: a refusal says its own sentence (a campaign they have since left, an hour's
 * allowance used).
 */
export async function takeFile(
  card: Pick<FileCardData, "downloadUrl" | "filename">,
  io: { fetchFile: (path: string) => Promise<Blob>; save: (file: Blob, filename: string) => void } = {
    fetchFile: apiFile,
    save: (file, filename) => download(file, XLSX_MIME, filename),
  },
): Promise<FileState> {
  try {
    io.save(await io.fetchFile(card.downloadUrl), card.filename);
    return { s: "done" };
  } catch (err) {
    return { s: "failed", message: messageOf(err) };
  }
}

/** The card for one state. Pure: the stateful one below only holds which state it is in. */
export function FileCardBody({ card, state, onTake }: {
  card: FileCardData;
  state: FileState;
  onTake: () => void;
}): JSX.Element {
  const working = state.s === "working";
  return (
    <section className="kc ex" aria-label={`${card.title}, an Excel sheet`}>
      <div className="kc-head">
        <span className="lt-app-mark" aria-hidden="true"><FileXls size={16} weight="fill" /></span>
        <p className="kc-title">{card.title}</p>
      </div>
      <p className="kc-why">
        {fileLine(card.rows, card.columns)}
        {card.capped ? ". The list is longer than a file holds, so this has the first 5,000" : ""}
      </p>
      <div className="kc-acts">
        <button type="button" className="rep-commit" disabled={working} aria-busy={working} onClick={onTake}>
          {state.s === "done" ? <Check size={14} weight="bold" aria-hidden="true" /> : <DownloadSimple size={14} aria-hidden="true" />}
          {takeLabel(state)}
        </button>
        {card.googleUrl && (
          <Cta href={card.googleUrl} icon={ArrowSquareOut}>Open in Google Sheets</Cta>
        )}
        {state.s === "done" && <span className="kc-wait" role="status">Downloaded.</span>}
        {working && <span className="kc-wait" role="status">Making the file from your latest rows.</span>}
        {state.s === "failed" && <span className="lt-note" role="alert">{state.message}</span>}
      </div>
      <p className="kc-why">Edit it: ask me to add a column, sort or filter.</p>
    </section>
  );
}

export function FileCard({ card }: { card: FileCardData }): JSX.Element {
  const [state, setState] = useState<FileState>({ s: "idle" });
  const take = async () => {
    if (state.s === "working") return;
    setState({ s: "working" });
    setState(await takeFile(card));
  };
  return <FileCardBody card={card} state={state} onTake={() => void take()} />;
}
