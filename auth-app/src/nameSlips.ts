/**
 * A name typed with a slip ("Dve Roa", "Archie", "Mira") is still a teammate. The same rules as the server's
 * (server/src/modules/agent/capabilities/team-lookup.ts), so a task typed on Home and one given to the agent read a name alike.
 * A word fits by a slip of a letter or two, by a swap of neighbours, or (from four letters) by sound; short names are held
 * to the letter.
 */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** Edit distance counting a swap of two neighbours as one slip. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

const skeleton = (s: string) =>
  s.replace(/ph/g, "f").replace(/(?:ck|kh)/g, "k").replace(/(.)\1+/g, "$1").replace(/(?<=[^aeiouy])[eh]$/, "").replace(/[aeiouy]+/g, "a");

/** Whether one word typed could be the other, with a slip or by sound. */
export function similarWord(typed: string, name: string): boolean {
  const a = fold(typed);
  const b = fold(name);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  const shortest = Math.min(a.length, b.length);
  const d = editDistance(a, b);
  if (d <= (shortest <= 3 ? 0 : shortest <= 6 ? 1 : 2)) return true;
  if (a.length === b.length && d === 1 && [...a].some((c, i) => i < a.length - 1 && a.slice(0, i) + a[i + 1] + c + a.slice(i + 2) === b)) return true;
  return shortest >= 4 && a[0] === b[0] && skeleton(a) === skeleton(b);
}
