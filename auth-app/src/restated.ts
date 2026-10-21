/**
 * Saying a thing once. A change that ran has its own sentence ("Updated G32 Data Engineer Two: target is 3.")
 * and the agent often writes one of its own beside it ("Done. G32 Data Engineer Two now targets 3 hires."). The
 * agent's is the one the recruiter reads: when it says everything the card's sentence says, the card keeps its
 * counts and its next steps and leaves its own sentence out.
 *
 * Pure, so the rule can be pinned by tests.
 */

const FILLER = new Set([
  ...["a", "an", "the", "of", "to", "in", "on", "it", "its", "is", "was", "were", "are", "and", "or", "as", "at", "by", "with"],
  ...["i", "ive", "have", "has", "had", "now", "just", "all", "so", "that", "this", "them", "they", "their", "then", "there", "here"],
  ...["for", "you", "your", "done", "ok", "okay", "great", "sure", "will", "would", "be", "been", "also", "again", "did", "do"],
]);

/** A word cut back to what it shares with its other forms: "targets" and "target", "hire" and "hires". */
function stem(word: string): string {
  if (/^\d+$/.test(word) || word.length <= 3) return word;
  return word.replace(/ies$/, "y").replace(/(?:ing|ed|es|s)$/, "").replace(/e$/, "");
}

/** The meaningful words of a sentence, in one form each; numbers are kept whole. */
export function wordsOf(text: string): string[] {
  const all = text.toLowerCase().replace(/['’]/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
  return all.filter((w) => !FILLER.has(w)).map(stem);
}

/**
 * Whether `reply` already says what `summary` says: every number in the summary is in the reply, and nearly
 * every other meaningful word of the summary is there too. A summary with nothing to compare ("Done.") is
 * never covered, so a bare card is never taken away.
 */
export function covers(reply: string, summary: string): boolean {
  const mine = wordsOf(summary);
  if (mine.length < 2) return false;
  const theirs = new Set(wordsOf(reply));
  if (mine.filter((w) => /^\d+$/.test(w)).some((n) => !theirs.has(n))) return false;
  return mine.filter((w) => theirs.has(w)).length / mine.length >= 0.75;
}
