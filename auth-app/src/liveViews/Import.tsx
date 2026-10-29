import { useEffect, useRef, useState } from "react";
import { JdIntake } from "../JdIntake";
import { finishImportFor, finishedImport, madeLine, peekImportFor, takeImport } from "../importFiles";
import { addingIdOf } from "../peopleSeed";
import { Finished, Gone } from "./Gone";
import type { LiveViewProps } from "./types";

/**
 * "Add roles in bulk", in the chat: the same add-from-job-descriptions flow as the New campaign button, drawn in the
 * conversation. What the composer handed over (a spreadsheet, several job descriptions, a Google Sheet's link) is read as soon as it opens.
 */
export default function ImportView({ card, ctx }: LiveViewProps): JSX.Element {
  /* Read when the card opens, and kept for the card that opens again on the same add (the chat was left and came back) until a campaign
     is made from the roles, or the card comes to its end, or the time runs out: a card drawn again after that would make them twice, so it
     says what they became instead. A card the paperclip opened looks at the roles of its own add, by the id in its query, and nobody
     else's; one the words opened takes what was left for any card, once. */
  const adding = addingIdOf(card.query);
  const [seed] = useState(() => (adding ? peekImportFor(adding) : takeImport()));
  const made = adding && !seed ? finishedImport(adding) : null;
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
      {adding && !seed ? (
        made !== null ? (
          <Finished line={madeLine(made)} href="#/campaigns" link="See Campaigns" />
        ) : (
          <Gone what="These roles" plural last="Any campaigns already made are in your list, so add only the roles that are left." />
        )
      ) : (
        <>
          {adding && <p className="pi-scope t-body-sm">Making campaigns from these roles only.</p>}
          <JdIntake seed={seed ?? { files: [], texts: [], links: [] }} embedded onFinish={(made, left) => { if (adding) finishImportFor(adding, made, left); }} />
        </>
      )}
    </div>
  );
}
