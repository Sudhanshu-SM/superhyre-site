import { JdIntake } from "./JdIntake";
import { Dialog } from "./ui";

/**
 * New campaign: add the job descriptions (one, several, or a sheet of them) and answer only what they leave out. The long
 * form is still there for a role that has no description yet: "Fill in the details yourself".
 */
export function NewCampaignIntake({ open, onClose, onManual }: {
  open: boolean;
  onClose: () => void;
  onManual: () => void;
}): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} label="New campaign" size="md">
      <JdIntake onManual={onManual} onClose={onClose} />
    </Dialog>
  );
}
