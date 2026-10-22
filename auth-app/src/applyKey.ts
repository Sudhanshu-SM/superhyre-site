/** "#/apply/senior-backend-engineers-screening" → the key, or null. Its own file so the entry can ask the question
 *  without carrying the candidate's page (which is a chunk of its own). */
export const applyKeyFrom = (hash: string, pathname = ""): string | null => {
  /* The link people share is a plain path, /public/apply/<key> (a `#` never survives a chat app); on the site a 404 page
     turns it into the hash form, and anywhere that serves the app at the root (the dev server) it is read as it is. */
  const m = /^#\/apply\/([^/?#]+)/.exec(hash) ?? /(?:^|\/)public\/apply\/([^/?#]+)\/?$/.exec(pathname);
  return m ? m[1]! : null;
};
