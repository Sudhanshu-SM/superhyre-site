/**
 * What goes in the composer when a tile, a task or a link hands the agent a start ("Finish the brief
 * for Product Designer: "). The words are a start for the person to carry on, so they are left ready
 * to type after; a dangling colon would only read as something missing.
 */
export function tidySeed(prompt: string): string {
  const open = /[:,;\s]+$/.test(prompt);
  if (!open) return prompt;
  const head = prompt.replace(/[:,;\s]+$/, "");
  return head ? `${head} ` : prompt;
}
