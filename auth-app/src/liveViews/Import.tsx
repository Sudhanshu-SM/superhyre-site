import { useEffect, useRef, useState } from "react";
import { JdIntake } from "../JdIntake";
import { takeImportFiles } from "../importFiles";
import type { LiveViewProps } from "./types";

/**
 * "Add roles in bulk", in the chat: the same add-from-job-descriptions flow as the New campaign button, drawn in the
 * conversation. Files dropped in the composer that were a spreadsheet are read as soon as it opens.
 */
export default function ImportView({ ctx }: LiveViewProps): JSX.Element {
  /* Taken once, when the card first opens: the chat redraws it as it goes. */
  const [files] = useState(() => takeImportFiles());
  const box = useRef<HTMLDivElement>(null);
  const grow = ctx.onGrow;
  /* The card changes height as roles are read and questions come; the chat keeps it in view. */
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => grow());
    watch.observe(el);
    return () => watch.disconnect();
  }, [grow]);
  return (
    <div ref={box} className="src mo is-formflow">
      <JdIntake files={files} />
    </div>
  );
}
