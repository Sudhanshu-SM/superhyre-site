import { useEffect, useState } from "react";
import type { PipelinePerson } from "./campaign";
import { mayCloseCampaign, useMayChangeCampaign } from "./campaignRights";
import { passOpenPeople, resolveCampaignId as resolveId, setCampaignStatus, useCampaignRow } from "./campaignStore";
import { filledLine, hiresOf, hiresText, openPeople, rolesFilled } from "./hired";
import { plainText } from "./displayText";
import { passOpenPreview } from "./api/windDown";
import { ReopenDialog } from "./RoleBits";
import { CloseDialog } from "./CloseDialog";
import { TiedBlock } from "./TiedBlock";
import { useAsked } from "./useAsked";
import { Dialog } from "./ui";
import { peopleCount, peopleNames, reasonFor } from "./windDown";
import { Guard } from "./Guard";
import { useSession } from "./roleStore";
import { useToast } from "./toast";

/**
 * Once every role a campaign set out to fill is filled, one calm line says so with two quiet choices: close the
 * campaign, or pass the rest of the people still open. Neither ever happens by itself, and each asks first.
 */
export function FilledBar({ campaignId, people }: { campaignId: string; people: readonly PipelinePerson[] }): JSX.Element | null {
  const row = useCampaignRow(campaignId);
  const session = useSession();
  const mayChange = useMayChangeCampaign(campaignId);
  const toast = useToast();
  const [asking, setAsking] = useState<"close" | "pass" | null>(null);
  const hires = hiresOf(row, people);
  if (!rolesFilled(hires) || row?.status === "closed") return null;
  const open = openPeople(people).length;
  const mayClose = mayCloseCampaign(session, row);
  const name = plainText(row?.name) || "this campaign";
  return (
    <section className="pl-filled" aria-label="Roles filled">
      <p className="t-body-sm pl-filled-t">{filledLine(hires.target!)}</p>
      <span className="pl-client-a">
        {mayClose && <button type="button" className="cw-btn is-quiet" onClick={() => setAsking("close")}>Close campaign</button>}
        {mayChange && open > 0 && <button type="button" className="cw-btn is-quiet" onClick={() => setAsking("pass")}>Reject the rest ({open})</button>}
      </span>
      <CloseDialog
        open={asking === "close"}
        body={<><b>{name}</b> stops here: {hiresText(hires)}. Sourcing and outreach stop, and everyone stays on record. You can reopen it any time.</>}
        onClose={() => setAsking(null)}
        onConfirm={(forms) => { setAsking(null); void setCampaignStatus(campaignId, "closed", { closeForms: forms }).then((ok) => { if (ok) toast(`${name} closed`); }); }}
      />
      <PassRestDialog
        open={asking === "pass"} campaignId={campaignId} name={name} open_={open}
        onClose={() => setAsking(null)}
        onConfirm={(reason) => { setAsking(null); void passOpenPeople(campaignId, reason).then((n) => { if (n !== null) toast(`Rejected ${n} ${n === 1 ? "person" : "people"}`); }); }}
      />
    </section>
  );
}

/**
 * A closed campaign says so on its Pipeline, calmly, with the one way back for the people who may reopen it. The board
 * under it is read-only (CampaignWorkspace passes `readOnly`): nothing is dragged, added or sent from here.
 */
export function ClosedBar({ campaignId }: { campaignId: string }): JSX.Element | null {
  const row = useCampaignRow(campaignId);
  const session = useSession();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  if (row?.status !== "closed") return null;
  const name = plainText(row.name) || "this campaign";
  return (
    <section className="pl-filled pl-closed" aria-label="Campaign closed">
      <p className="t-body-sm pl-filled-t">This campaign is closed. Everyone on it stays on record.</p>
      {mayCloseCampaign(session, row) && <span className="pl-client-a"><button type="button" className="cw-btn is-quiet" onClick={() => setAsking(true)}>Reopen</button></span>}
      <ReopenDialog
        open={asking} name={name} onClose={() => setAsking(false)}
        onConfirm={() => { setAsking(false); void setCampaignStatus(campaignId, "active").then((ok) => { if (ok) toast(`${name} is active again`); }); }}
      />
    </section>
  );
}

/**
 * "Reject the rest": says who, and what is tied to them (interviews, reminders, queued messages, tasks) that will be
 * cancelled or closed, with the list a click away, and asks for a reason (offered as "Role filled"). Nothing is sent
 * until the button.
 */
function PassRestDialog({ open, campaignId, name, open_, onClose, onConfirm }: {
  open: boolean; campaignId: string; name: string; open_: number; onClose: () => void; onConfirm: (reason: string | undefined) => void;
}): JSX.Element {
  const { loading, data } = useAsked(open, campaignId, () => passOpenPreview(resolveId(campaignId)));
  const [reason, setReason] = useState("");
  const [edited, setEdited] = useState(false);
  useEffect(() => { if (!open) { setReason(""); setEdited(false); } }, [open]);
  useEffect(() => { if (data && !edited) setReason(reasonFor(data)); }, [data, edited]);
  const names = peopleNames(data);
  const count = peopleCount(data) ?? (names.length || open_);
  const title = `Reject ${count} ${count === 1 ? "person" : "people"}?`;
  return (
    <Dialog open={open} onClose={onClose} label={title} size="md">
      <form className="rl-dlg is-confirm" onSubmit={(e) => { e.preventDefault(); onConfirm(reason.trim() || undefined); }}>
        <header className="rl-dlg-h">
          <h2 className="t-title">{title}</h2>
          <div className="t-body rl-dlg-b">
            Everyone still open on <b>{name}</b> moves to Rejected and stays on record. You can bring anyone back.
            {names.length > 0 && <> Includes {names.slice(0, 3).join(", ")}{names.length > 3 ? ` and ${names.length - 3} more` : ""}.</>}
          </div>
        </header>
        <Guard><TiedBlock loading={loading} data={data} one={count === 1} /></Guard>
        <label className="pr-note">
          <span className="t-label">Reason</span>
          <input className="ncx-in" value={reason} maxLength={300} onChange={(e) => { setReason(e.target.value); setEdited(true); }} placeholder="Optional" />
        </label>
        <footer className="rl-dlg-f">
          <span />
          <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ct-btn is-primary" autoFocus>{`Reject ${count}`}</button>
        </footer>
      </form>
    </Dialog>
  );
}
