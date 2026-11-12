/**
 * Where a campaign's searches look for people (the server's `setup.sources`): DB-1 (`external`, what a search does with nothing
 * chosen), DB-2 (`apollo`), our own DB only, or our DB and then DB-1. DB-1 and DB-2 are separate sources, never mixed. Said as
 * where, never as the name of a provider.
 */
export type SourceMode = "database" | "both" | "external" | "apollo";

export const SOURCE_MODES: readonly SourceMode[] = ["external", "apollo", "both", "database"];

/** What a search does when nobody chose (the server's `DEFAULT_SOURCE_MODE`). */
export const DEFAULT_SOURCE_MODE: SourceMode = "external";

export const SOURCES: Record<SourceMode, { label: string; hint: string; says: string }> = {
  external: { label: "DB-1", hint: "External source 1, not our DB.", says: "DB-1" },
  apollo: { label: "DB-2", hint: "External source 2, not our DB.", says: "DB-2" },
  both: { label: "Our DB + DB-1", hint: "Our DB first, then DB-1.", says: "our DB, then DB-1" },
  database: { label: "Our DB only", hint: "Only people already in our DB.", says: "our DB only" },
};

/** The mode a campaign's setup holds; anything else, or nothing, is the default. */
export const sourceModeOf = (setup: unknown): SourceMode => {
  const v = typeof setup === "object" && setup !== null ? (setup as { sources?: unknown }).sources : undefined;
  return SOURCE_MODES.find((m) => m === v) ?? DEFAULT_SOURCE_MODE;
};
