import { CampaignEditDialog } from "./CampaignEdit";
import { useToast } from "./toast";
import { AssignDialog } from "./RoleBits";
import type { RailConfig } from "./useRailConfig";

/**
 * The two dialogs the Configuration rows open: the campaign's details (owner and who can see it) and the people on
 * it. They are the campaign page's own dialogs, opened from here, so a change made on either page is one change.
 * Rendered by the rail, mounted only while one is open.
 */
export function RailDialogs({ dialog }: { dialog: NonNullable<RailConfig["dialog"]> }) {
  const toast = useToast();
  if (dialog.kind === "edit") {
    return (
      <CampaignEditDialog
        open onClose={dialog.close} campaignId={dialog.row.id}
        canShare={dialog.canShare} canReassign={dialog.canReassign}
        onSaved={(n) => toast(`${n} saved`)}
      />
    );
  }
  return <AssignDialog row={dialog.row} open onClose={dialog.close} />;
}
