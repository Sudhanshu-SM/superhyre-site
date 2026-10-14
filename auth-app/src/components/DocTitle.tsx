import { useEffect } from "react";

/**
 * Says what the browser tab is called while this is on screen. Renders nothing.
 *
 * One component per page rather than a single effect at the top: each screen of the sign-in, the set-up and the
 * console states its own title next to what it draws, so a new screen cannot inherit the last one's by accident.
 * It is not restored on unmount: whatever draws next states its own, and the static title in index.html is the
 * answer for the instant before any of them has.
 */
export function DocTitle({ title }: { title: string }): null {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}

/**
 * The tab title of something open inside a page (a client, a form): it names that thing, and when the thing is
 * closed again the tab goes back to the page's own title, which the page above never re-stated because it did
 * not change.
 */
export function DetailTitle({ title, fallback }: { title: string; fallback: string }): null {
  useEffect(() => {
    document.title = title;
    return () => restoreTitle(document, title, fallback);
  }, [title, fallback]);
  return null;
}

/**
 * Puts the page's own title back when an open thing closes, unless something else has since said its own: leaving a
 * form for a page that is still loading (a lazy chunk keeps the old page on screen a moment) names the new page
 * first and unmounts the old one after, and the old one's cleanup must not take the new page's title away.
 */
export function restoreTitle(doc: { title: string }, own: string, fallback: string): void {
  if (doc.title === own) doc.title = fallback;
}
