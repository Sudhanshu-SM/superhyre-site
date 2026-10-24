import type { ReactNode } from "react";

/** A section that folds by easing its height, with what is inside it taken out of the tab order while it is shut. */
export function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`hx-fold${open ? " is-open" : ""}`}>
      <div className="hx-fold-in">{children}</div>
    </div>
  );
}
