import { useSyncExternalStore } from "react";
import { onWorkspaceChange } from "./api/identity";
import type { Candidate } from "./sourcing";
import type { CandidateSet } from "./liveCandidate";

/**
 * The people the chat has shown, by campaign, kept where the page-level surfaces can reach
 * them: the ranked list, the profile sheet and the comparison all draw from here, so a person
 * opened from any card is the same person in all of them. A view registers a set when it loads
 * its matches; a profile loaded later replaces the bare candidate.
 */

const sets = new Map<string, CandidateSet>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version++;
  for (const l of listeners) l();
};

export function putSet(set: CandidateSet): void {
  // Registering what is already registered changes nothing and wakes nothing (a list that re-registers
  // itself on every draw must not be able to keep the whole console redrawing).
  const prev = sets.get(set.key);
  if (prev && prev.campaignId === set.campaignId && prev.total === set.total && JSON.stringify(prev.candidates) === JSON.stringify(set.candidates) && JSON.stringify(prev.criteria) === JSON.stringify(set.criteria) && JSON.stringify(prev.reasons) === JSON.stringify(set.reasons)) return;
  sets.set(set.key, set);
  emit();
}

/** The campaigns whose people are in view, for fetching what was already decided about them. */
export const campaignIds = (): string[] => [...new Set([...sets.values()].map((s) => s.campaignId).filter((c): c is string => c !== null))];

/** A campaign's matches (the set kept under its own id). */
export const getSet = (key: string): CandidateSet | null => sets.get(key) ?? null;

/** The set that holds this person. */
export function setOfCandidate(id: string): CandidateSet | null {
  /* The campaign's own set first: a card in the chat lists the same person in a set of its own, which knows less. */
  let first: CandidateSet | null = null;
  for (const set of sets.values()) {
    if (!set.candidates.some((x) => x.id === id)) continue;
    if (set.campaignId !== null && set.key === set.campaignId) return set;
    first ??= set;
  }
  return first;
}

/** Replaces one person in whichever set holds them (their full profile arrived). */
export function updateCandidate(c: Candidate): void {
  for (const [key, set] of sets) {
    if (!set.candidates.some((x) => x.id === c.id)) continue;
    sets.set(key, { ...set, candidates: set.candidates.map((x) => (x.id === c.id ? c : x)) });
  }
  emit();
}

export function candidateById(id: string): Candidate | undefined {
  for (const set of sets.values()) {
    const c = set.candidates.find((x) => x.id === id);
    if (c) return c;
  }
  return undefined;
}

/** The campaign the person belongs to, for the actions that need one (shortlist, pass). */
export function campaignOfCandidate(id: string): string | null {
  return setOfCandidate(id)?.campaignId ?? null;
}

export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Re-renders when any set changes; read the sets with the getters above. */
export function useCandidateSets(): number {
  return useSyncExternalStore(subscribe, () => version);
}

export function useCandidateSet(key: string | null): CandidateSet | null {
  useCandidateSets();
  return key ? getSet(key) : null;
}

/** For tests and "New chat". */
export function clearSets(): void {
  sets.clear();
  emit();
}
/* The people a chat showed belong to the workspace it was in. */
onWorkspaceChange(clearSets);
