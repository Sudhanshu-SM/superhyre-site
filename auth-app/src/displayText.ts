/**
 * Text as a person typed it, made safe to put on a page.
 *
 * Names, roles and campaign names come from people and from imports. A right-to-left override
 * (U+202E) in one of them reverses everything after it, so "evil" + U+202E + "txt.exe" reads
 * as "evilexe.txt". These controls have no use in a name, so they are dropped when it is shown.
 */

/** Embeddings, overrides and isolates (U+202A to U+202E, U+2066 to U+2069), and the marks that do the same job. */
// eslint-disable-next-line no-misleading-character-class
const BIDI_CONTROLS = /[‪-‮⁦-⁩‎‏؜]/g;

export function plainText(text: string | null | undefined): string {
  return text ? text.replace(BIDI_CONTROLS, "") : "";
}

/** The parts that have something in them, joined: an empty department leaves no "· ·" behind. */
export function joinParts(parts: ReadonlyArray<string | null | undefined | false>, sep = " · "): string {
  return parts
    .map((p) => (p ? plainText(p).trim() : ""))
    .filter(Boolean)
    .join(sep);
}

/**
 * A data vendor's name is the product's to know, not the person's: a sentence the server or the agent wrote with
 * it in reads as "the lookup" on screen. A sentence that starts with the name starts with "The".
 */
export function vendorWords(text: string): string {
  return text
    .replace(/(^|[.!?:]\s+|\n)Crustdata(['\u2019]s)?(?=\W|$)/g, (_m, lead: string, poss?: string) => `${lead}The lookup${poss ?? ""}`)
    .replace(/\bCrustdata(['\u2019]s)?(?=\W|$)/gi, (_m, poss?: string) => `the lookup${poss ?? ""}`);
}
