import type { Question } from "./campaign";

/**
 * A form in pages, the way Google Forms does it. A section divider starts a new page and the questions after it
 * belong to that page; the questions before the first divider are page one (which also carries the applicant's
 * name, email, phone and LinkedIn). A section can end the form ("Submit form" after this section), and then the
 * pages after it are never shown. A form without dividers is one page.
 */

export type Page = { section: Question | null; items: Question[] };

/** Every page, in order, whether or not an applicant can reach it. At least one. */
export function pagesOf(qs: readonly Question[]): Page[] {
  const out: Page[] = [{ section: null, items: [] }];
  for (const q of qs) {
    if (q.type === "section") out.push({ section: q, items: [] });
    else out[out.length - 1]!.items.push(q);
  }
  // A leading page with nothing on it is only dropped when a section follows (the contact details stay page one).
  const pages = out.filter((p, i) => p.section || p.items.length || i === 0);
  return pages.length > 1 && !pages[0]!.items.length && !pages[0]!.section ? pages.slice(1) : pages;
}

/** The pages an applicant can reach: up to and including the first section set to "submit". */
export function reachablePages(pages: readonly Page[]): Page[] {
  const end = pages.findIndex((p) => p.section?.after === "submit");
  return end < 0 ? [...pages] : pages.slice(0, end + 1);
}

/** The questions an applicant can reach, in order. */
export const reachableQuestions = (qs: readonly Question[]): Question[] => reachablePages(pagesOf(qs)).flatMap((p) => p.items);

/** Each question's section title (none before the first section), for headers over answers and columns. */
export function sectionTitles(qs: readonly Question[]): Map<string, string> {
  const out = new Map<string, string>();
  let title = "";
  for (const q of qs) {
    if (q.type === "section") title = q.title.trim();
    else if (title) out.set(q.id, title);
  }
  return out;
}
