import { useState } from "react";
import { messageOf } from "./api/client";
import type { PipelinePerson } from "./campaign";
import type { StageDef } from "./boardStages";
import { clientStageOf, groupByStage } from "./boardStages";
import { makeClientLink, turnOffClientLink, useClientLink } from "./clientReviewStore";
import { useToast } from "./toast";
import { ConfirmDialog } from "./RoleBits";
import { toneProps } from "./statusTones";

/**
 * The line over the board when one stage is shown to the client: whether the link is on, how the client has
 * answered so far (as coloured words), and the three things a recruiter does with it: copy it, make a new one, turn
 * it off. Anyone who can see the board sees how it stands; changing it is for the people on the campaign.
 */

/** "3 waiting, 1 approved, 1 rejected": only what there is to say, in the colours statuses use everywhere. */
export function verdictSummary(waiting: number, approved: number, declined: number): { key: string; text: string; tone: "muted" | "replied" | "passed" }[] {
  return [
    { key: "waiting", text: waiting > 0 ? `${waiting} waiting` : "Nobody waiting", tone: "muted" as const },
    ...(approved > 0 ? [{ key: "approved", text: `${approved} approved`, tone: "replied" as const }] : []),
    ...(declined > 0 ? [{ key: "declined", text: `${declined} rejected`, tone: "passed" as const }] : []),
  ];
}

/** Copies text to the clipboard: true when it went, false when there is no clipboard or it refused (blocked, not a secure page). Never throws. */
export async function copyLink(clipboard: Pick<Clipboard, "writeText"> | undefined | null, text: string): Promise<boolean> {
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ClientBar({ campaignId, stages, people, mayChange }: {
  campaignId: string;
  stages: readonly StageDef[];
  /** Everyone on the board. */
  people: readonly PipelinePerson[];
  mayChange: boolean;
}): JSX.Element | null {
  const stage = clientStageOf(stages);
  const here = stage ? groupByStage(people, stages).get(stage.id) ?? [] : [];
  const answered = here.filter((p) => p.clientVerdict).length;
  const link = useClientLink(campaignId, !!stage, `${stage?.id ?? ""}|${here.length}|${answered}`);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<"new" | "off" | null>(null);
  /* The link, shown to copy by hand when the browser would not copy it for us. */
  const [bare, setBare] = useState<string | null>(null);
  if (!stage) return null;
  /* Not allowed to see the link and not on the campaign: nothing to say. */
  if (!link && !mayChange) return null;

  const on = !!link?.enabled && !!link.url;
  const waiting = link ? link.waiting : here.length - answered;
  const approved = link?.verdicts.approved ?? here.filter((p) => p.clientVerdict?.verdict === "approved").length;
  const declined = link?.verdicts.declined ?? here.filter((p) => p.clientVerdict?.verdict === "declined").length;

  /* Copying can be refused (a blocked clipboard, an insecure page): then the link itself is shown, ready to select. */
  const copy = (url: string, said: string) => {
    void copyLink(navigator.clipboard, url).then((ok) => {
      if (ok) { setBare(null); toast(said); } else { setBare(url); toast("The link is shown below. Select it and copy."); }
    });
  };
  const make = () => {
    setBusy(true);
    makeClientLink(campaignId, here.length, stage.id)
      .then((made) => (made.url ? copy(made.url, "Link copied. Send it to your client.") : toast("Link ready")))
      .catch((err: unknown) => toast(messageOf(err), "error"))
      .finally(() => setBusy(false));
  };
  const off = () => {
    setBusy(true);
    turnOffClientLink(campaignId)
      .then(() => toast("Client link is off"))
      .catch((err: unknown) => toast(messageOf(err), "error"))
      .finally(() => setBusy(false));
  };

  return (
    <section className="pl-client" aria-label="Client review">
      {on ? (
        <>
          <p className="t-body-sm pl-client-t">
            <b>{stage.name}</b> is shared with your client.{" "}
            {verdictSummary(waiting, approved, declined).map((v, i) => (
              <span key={v.key}>{i > 0 && <span className="pl-client-dot" aria-hidden="true"> · </span>}<span {...toneProps(v.tone)}>{v.text}</span></span>
            ))}
          </p>
          <span className="pl-client-a">
            <button type="button" className="cw-link" onClick={() => copy(link!.url!, "Link copied")}>Copy link</button>
            {mayChange && <button type="button" className="cw-link" disabled={busy} onClick={() => setAsking("new")}>New link</button>}
            {mayChange && <button type="button" className="cw-link" disabled={busy} onClick={() => setAsking("off")}>Turn off</button>}
          </span>
        </>
      ) : (
        <>
          <p className="t-body-sm pl-client-t">
            Your client can review the people in <b>{stage.name}</b> on a page of their own, with no contact details.
            {approved + declined > 0 && <> The link is off.</>}
          </p>
          {mayChange && <span className="pl-client-a"><button type="button" className="cw-link" disabled={busy} onClick={make}>Create link</button></span>}
        </>
      )}
      {on && bare === link!.url && (
        <p className="pl-client-field">
          <input
            className="ncx-in" readOnly value={bare ?? ""} aria-label="Client link" autoFocus spellCheck={false}
            onFocus={(e) => e.currentTarget.select()} onClick={(e) => e.currentTarget.select()}
          />
        </p>
      )}
      <ConfirmDialog
        open={asking === "new"}
        title="Make a new link?"
        body={<>The link your client has now stops working. Send them the new one once it is made.</>}
        confirm="Make a new link"
        onClose={() => setAsking(null)}
        onConfirm={() => { setAsking(null); make(); }}
      />
      <ConfirmDialog
        open={asking === "off"}
        title="Turn off the client link?"
        body={<>Your client sees a quiet note that the link isn't active. What they have already answered stays on the board. You can make a new link any time.</>}
        confirm="Turn off"
        onClose={() => setAsking(null)}
        onConfirm={() => { setAsking(null); off(); }}
      />
    </section>
  );
}
