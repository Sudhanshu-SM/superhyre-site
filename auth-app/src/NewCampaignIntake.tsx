import { JdIntake } from "./JdIntake";
import { Dialog } from "./ui";

/**
 * New campaign: add the job description (or many, or a sheet of them) and answer only what it leaves out. The long
 * form is still there for a role that has no description yet: "Fill in the details yourself".
 */
export function NewCampaignIntake({ open, onClose, onManual }: {
  open: boolean;
  onClose: () => void;
  onManual: () => void;
}): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} label="New campaign" size="lg">
      <div className="rl-dlg ji-dlg">
        <header className="rl-dlg-h"><h2 className="t-title">New campaign</h2></header>
        <div className="ji-dlg-b"><JdIntake onManual={onManual} onClose={onClose} /></div>
      </div>
    </Dialog>
  );
}
