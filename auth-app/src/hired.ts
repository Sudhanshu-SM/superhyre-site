import type { PipelinePerson } from "./campaign";

/**
 * Hired people, in words: how many of the roles are filled, who is still open once they are, and what hiring
 * someone takes them off. Plain functions, so the wording is pinned without a page.
 */

export type Hires = { count: number; target: number | null };

/** How many are hired of how many were wanted: the server's `hires`, else the people on the board against the campaign's own target. */
export function hiresOf(
  row: { hires?: Hires; target?: number } | undefined,
  people: readonly Pick<PipelinePerson, "stage">[],
): Hires {
  if (row?.hires) return row.hires;
  return { count: people.filter((p) => p.stage === "hired").length, target: row?.target && row.target > 0 ? row.target : null };
}

/** "2 of 3 hired", or just "2 hired" when there is no target. */
export const hiresText = (h: Hires): string => (h.target ? `${h.count} of ${h.target} hired` : `${h.count} hired`);

/** Every place the campaign set out to fill is filled. A campaign with no target is never "filled". */
export const rolesFilled = (h: Hires): boolean => h.target !== null && h.target > 0 && h.count >= h.target;

/** The calm line when they are: "All 3 roles are filled", "The role is filled". */
export const filledLine = (target: number): string => (target === 1 ? "The role is filled" : `All ${target} roles are filled`);

/** People still open: neither hired nor passed. */
export const openPeople = <P extends Pick<PipelinePerson, "stage">>(people: readonly P[]): P[] => people.filter((p) => p.stage !== "hired" && p.stage !== "passed");

/** "A", "A and B", "A, B and C". */
export const listOf = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * What hiring someone takes them off, said before it happens: "Priya will be removed from the shortlists of A and B
 * (2 other campaigns). You can move them back from the board."
 */
export function removalLine(name: string, campaigns: readonly { name: string }[]): string {
  const n = campaigns.length;
  const where = `the ${n === 1 ? "shortlist" : "shortlists"} of ${listOf(campaigns.map((c) => c.name))}`;
  return `${name} will be removed from ${where} (${n} other ${n === 1 ? "campaign" : "campaigns"}). You can move them back from the board.`;
}
