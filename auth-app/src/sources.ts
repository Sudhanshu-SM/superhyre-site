/**
 * Where a campaign's searches look for people (the server's `setup.sources`): external sources only (what a search does with
 * nothing chosen), our own DB only, or our DB and then external sources. Said as where, never as the name of a provider.
 */
export type SourceMode = "database" | "both" | "external";

export const SOURCE_MODES: readonly SourceMode[] = ["external", "both", "database"];

/** What a search does when nobody chose (the server's `DEFAULT_SOURCE_MODE`). */
export const DEFAULT_SOURCE_MODE: SourceMode = "external";

export const SOURCES: Record<SourceMode, { label: string; hint: string; says: string }> = {
  database: { label: "DB only", hint: "Only people already in our DB.", says: "our DB only" },
  both: { label: "DB + external", hint: "Our DB first, then external sources.", says: "our DB and external sources" },
  external: { label: "External only", hint: "Only external sources, not our DB.", says: "external sources only" },
};

/** The mode a campaign's setup holds; anything else, or nothing, is the default. */
export const sourceModeOf = (setup: unknown): SourceMode => {
  const v = typeof setup === "object" && setup !== null ? (setup as { sources?: unknown }).sources : undefined;
  return SOURCE_MODES.find((m) => m === v) ?? DEFAULT_SOURCE_MODE;
};
