/**
 * Files dropped in the agent's composer that are really a list of roles (a spreadsheet): they are kept here for the
 * moment it takes the chat to answer with the import card, which takes them. Held in memory only, and only once.
 */
let held: File[] = [];

export const stashImportFiles = (files: readonly File[]): void => {
  held = [...held, ...files];
};

export function takeImportFiles(): File[] {
  const out = held;
  held = [];
  return out;
}
