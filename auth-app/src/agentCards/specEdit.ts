import type { Requirement, RoleSpec } from "../api/agent";

/**
 * Changes to a role spec as the editor makes them: plain functions from a spec to the next one, so the whole spec is
 * edited in place and saved once (a new version), never one requirement at a time.
 */

export type Importance = Requirement["importance"];

/** How much each group weighs when a requirement moves into it; a hard requirement is checked, not weighed. */
export const WEIGHT: Record<Importance, number> = { must: 0.8, nice: 0.3, knockout: 0 };

export const GROUP_LABEL: Record<Importance, string> = { knockout: "Hard requirement", must: "Must have", nice: "Nice to have" };

export function nextRequirementId(reqs: readonly Requirement[]): string {
  return `r${Math.max(0, ...reqs.map((r) => Number(r.id.slice(1)) || 0)) + 1}`;
}

const mapReq = (spec: RoleSpec, id: string, fn: (r: Requirement) => Requirement): RoleSpec => ({
  ...spec,
  requirements: spec.requirements.map((r) => (r.id === id ? fn(r) : r)),
});

export const editText = (spec: RoleSpec, id: string, text: string): RoleSpec => mapReq(spec, id, (r) => ({ ...r, text }));

/** A must-have becomes a nice-to-have and back; a hard requirement is only ever a must-have or removed. */
export const moveRequirement = (spec: RoleSpec, id: string, to: Importance): RoleSpec =>
  mapReq(spec, id, (r) => ({ ...r, importance: to, weight: WEIGHT[to] }));

/** The last requirement stays: a spec with none cannot be saved. */
export const removeRequirement = (spec: RoleSpec, id: string): RoleSpec =>
  spec.requirements.length <= 1 ? spec : { ...spec, requirements: spec.requirements.filter((r) => r.id !== id) };

export function addRequirement(spec: RoleSpec, text: string, importance: Importance): RoleSpec {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 2 || spec.requirements.length >= 20) return spec;
  const req: Requirement = { id: nextRequirementId(spec.requirements), kind: "other", text: clean.slice(0, 200), importance, weight: WEIGHT[importance] };
  return { ...spec, requirements: [...spec.requirements, req] };
}

export const editAvoid = (spec: RoleSpec, at: number, text: string): RoleSpec => ({ ...spec, avoid: spec.avoid.map((a, i) => (i === at ? text : a)) });
export const removeAvoid = (spec: RoleSpec, at: number): RoleSpec => ({ ...spec, avoid: spec.avoid.filter((_, i) => i !== at) });

/** What stops a save, in a few calm words; null when the spec is whole. */
export function specProblem(spec: RoleSpec): string | null {
  if (spec.title.trim().length < 2) return "The role needs a title.";
  if (spec.requirements.some((r) => r.text.trim().length < 2)) return "Each requirement needs a few words.";
  if (spec.avoid.some((a) => a.trim().length < 2)) return "Each line to avoid needs a few words.";
  return null;
}

/** The spec as it is saved: spaces tidied, empty values left out. */
export function tidy(spec: RoleSpec): RoleSpec {
  const one = (s: string) => s.replace(/\s+/g, " ").trim();
  return {
    ...spec,
    title: one(spec.title),
    seniority: spec.seniority ? one(spec.seniority) || null : null,
    locations: spec.locations.map(one).filter((l) => l.length >= 2),
    requirements: spec.requirements.map((r) => ({ ...r, text: one(r.text) })),
    avoid: spec.avoid.map(one).filter(Boolean),
  };
}

/** What leaving the popup does: close it, ask once about edits that would be lost, or (while asking) go back to them. */
export const leaveStep = (changed: boolean, asking: boolean): "close" | "ask" | "keep" => (asking ? "keep" : changed ? "ask" : "close");

export const sameSpec = (a: RoleSpec, b: RoleSpec): boolean => JSON.stringify(tidy(a)) === JSON.stringify(tidy(b));

/** "Senior · Bengaluru, Remote is fine · 4+ years": whatever the spec says about the person, in the order people ask. */
export function specMeta(s: {
  seniority?: string | null | undefined;
  locations: readonly string[];
  remoteOk: boolean;
  yearsMin?: number | null | undefined;
  yearsMax?: number | null | undefined;
}): string {
  const years =
    s.yearsMin != null && s.yearsMax != null && s.yearsMax > s.yearsMin ? `${s.yearsMin} to ${s.yearsMax} years`
    : s.yearsMin != null ? `${s.yearsMin}+ years`
    : null;
  const where = [s.locations.join(", "), s.remoteOk ? "Remote is fine" : ""].filter(Boolean).join(", ");
  return [s.seniority, where, years].filter(Boolean).join(" · ");
}
