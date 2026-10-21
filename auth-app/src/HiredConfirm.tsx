import { useEffect } from "react";
import { cancelHiredAsk, confirmHiredAsk, onHiredLanded, pipelineNow, useHiredAsk } from "./campaignStore";
import { removalLine } from "./hired";
import { plainText } from "./displayText";
import { ConfirmDialog } from "./RoleBits";
import { LooseEndsNote } from "./TiedBlock";
import { useToast } from "./toast";

/**
 * Mounted once, over every page: asks before someone is hired when that takes them off other shortlists, and says
 * so once the hire is real. A "no" leaves everything where it was. Nothing here applies a move itself.
 */
export function HiredConfirm(): JSX.Element | null {
  const ask = useHiredAsk();
  const toast = useToast();
  useEffect(() => onHiredLanded(({ campaignId, ccId }) => {
    const who = pipelineNow(campaignId).find((p) => p.id === ccId)?.name;
    toast(who ? `${plainText(who).split(" ")[0]} is hired` : "Hired");
  }), [toast]);
  if (!ask) return null;
  const name = plainText(ask.name);
  return (
    <ConfirmDialog
      open
      title={`Hire ${name}?`}
      body={<>{removalLine(name, ask.campaigns)}<LooseEndsNote on campaignId={ask.campaignId} ccIds={[ask.ccId]} to="hired" /></>}
      confirm="Hire and remove"
      onClose={cancelHiredAsk}
      onConfirm={confirmHiredAsk}
    />
  );
}
