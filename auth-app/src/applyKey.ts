/** "#/apply/senior-backend-engineers-screening" → the key, or null. Its own file so the entry can ask the question
 *  without carrying the candidate's page (which is a chunk of its own). */
export const applyKeyFrom = (hash: string): string | null => {
  const m = /^#\/apply\/([^/?#]+)/.exec(hash);
  return m ? m[1]! : null;
};
