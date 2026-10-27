/**
 * Where a campaign's searches look for people (the server's `setup.sources`): our own DB only, our DB and then
 * external sources (what a search does with nothing chosen), or external sources only. Said as where, never as the name of a
 * provider.
 */
export type SourceMode = "database" | "both" | "external";

export const SOURCE_MODES: readonly SourceMode[] = ["database", "both", "external"];

export const SOURCES: Record<SourceMode, { label: string; hint: string; says: string }> = {
  database: { label: "DB only", hint: "Only people already in our DB.", says: "our DB only" },
  both: { label: "DB + external", hint: "Our DB first, then external sources.", says: "our DB and external sources" },
  external: { label: "External only", hint: "Only external sources, not our DB.", says: "external sources only" },
};

/** The mode a campaign's setup holds; anything else, or nothing, is both. */
export const sourceModeOf = (setup: unknown): SourceMode => {
  const v = typeof setup === "object" && setup !== null ? (setup as { sources?: unknown }).sources : undefined;
  return SOURCE_MODES.find((m) => m === v) ?? "both";
};
