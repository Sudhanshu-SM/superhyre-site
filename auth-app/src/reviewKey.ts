/**
 * The client's review page is addressed like the candidate's form: after the hash, `#/review/<token>`. A plain
 * `/review/<token>` path is read too, in case a link is made that way. Its own file so the entry can ask the question
 * without carrying the page (which is a chunk of its own).
 */
export const reviewTokenFrom = (hash: string, pathname = ""): string | null => {
  const fromHash = /^#\/review\/([^/?#]+)/.exec(hash)?.[1];
  const raw = fromHash ?? /(?:^|\/)review\/([^/?#]+)\/?$/.exec(pathname)?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};
