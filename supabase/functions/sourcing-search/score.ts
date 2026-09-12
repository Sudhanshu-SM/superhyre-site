// Post-fetch fit scoring. Ported from sourcing/lib/score.js — logic unchanged.
//
// ContactOut's filters are substring matches over profile text, so they cannot
// tell "NIT Silchar" from "Narula Institute of Technology (NiT)", or a real IIT
// degree from an "Ashadeep IIT" coaching centre. This pass reads what each
// profile actually says and scores it against the JD. Nothing is removed —
// scores just reorder the list and explain themselves.

import { chat, parseJsonBlock } from "./gateway.ts";
import type { Candidate } from "./contactout.ts";

const BATCH = 25;

const SYSTEM = `You score sourced candidates against a job description. Be strict and specific.

Score 0-100 on how well the profile fits, weighing in this order:
1. Hard constraints the recruiter stated (location, education, years of experience). A miss here caps the score at 35.
2. Domain fit — has this person actually done the work the JD describes?
3. Seniority fit — infer years of experience from graduation years and role history.

Read education strings literally. Common traps:
- Coaching centres and schools that contain "IIT" or "NIT" in their name
  ("Ashadeep IIT", "IIT Home", "S.S.S.D. IIT-jnd") are NOT the institutes.
- Private colleges whose acronym collides ("Narula Institute of Technology (NiT)",
  "Nirma Institute") are NOT NITs.
- Online certificates run with an institute ("IHUB ... IIT Roorkee & Intellipaat")
  are not a degree from it.
- A real match reads like "Indian Institute of Technology Bhubaneswar",
  "IIT Jodhpur", "NIT Surat", "Dr B R Ambedkar National Institute of Technology".

The reason must be one sentence, concrete, naming the evidence — "IIT Jodhpur
BTech 2024, ships AI systems in Ahmedabad" or "Narula Institute of Technology is
a private college, not an NIT". Never generic praise.

Output ONLY a JSON array, one entry per candidate, no prose, no code fence:
[{"i": 0, "score": 82, "reason": "..."}]`;

export type Scored = Candidate & {
  matchedAfterDropping?: string[];
  score?: number | null;
  reason?: string;
};

function compact(candidate: Scored, index: number): string {
  return JSON.stringify({
    i: index,
    name: candidate.name,
    title: candidate.title,
    company: candidate.company,
    location: candidate.location,
    education: candidate.education,
    experience: candidate.experience,
    skills: (candidate.skills || []).slice(0, 12),
  });
}

async function scoreBatch({ batch, offset, brief, model }: {
  batch: Scored[]; offset: number; brief: string; model?: string;
}): Promise<Map<number, { score: number | null; reason: string }>> {
  const user = [
    brief,
    "\n## Candidates",
    ...batch.map((c, i) => compact(c, offset + i)),
  ].join("\n");

  const parsed = parseJsonBlock(await chat({ system: SYSTEM, user, model }));
  // parseJsonBlock digs out an object, so accept either a bare array or a
  // wrapper like {"candidates": [...]} that a model may reach for.
  const rows = Array.isArray(parsed)
    ? parsed
    : ((parsed as Record<string, unknown>).candidates
      || (parsed as Record<string, unknown>).results
      || (parsed as Record<string, unknown>).scores
      || []) as unknown[];

  const byIndex = new Map<number, { score: number | null; reason: string }>();
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const i = Number(r?.i);
    if (!Number.isInteger(i)) continue;
    const score = Number(r.score);
    byIndex.set(i, {
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
      reason: typeof r.reason === "string" ? r.reason.trim() : "",
    });
  }
  return byIndex;
}

export async function scoreCandidates(
  { candidates, jd, comments, mustHaves = [], model }: {
    candidates: Scored[]; jd: string; comments?: string; mustHaves?: string[]; model?: string;
  },
  onProgress?: (p: { from: number; to: number; total: number }) => void,
): Promise<Scored[]> {
  if (!candidates.length) return candidates;

  const brief = [
    "## Job description", jd.trim(),
    comments?.trim() ? `\n## Recruiter notes — treat these as hard constraints\n${comments.trim()}` : "",
    mustHaves.length ? `\n## Must-haves\n${mustHaves.map((m) => `- ${m}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  const scored = candidates.map((c) => ({ ...c }));

  for (let offset = 0; offset < scored.length; offset += BATCH) {
    const batch = scored.slice(offset, offset + BATCH);
    onProgress?.({ from: offset + 1, to: offset + batch.length, total: scored.length });
    try {
      const byIndex = await scoreBatch({ batch, offset, brief, model });
      batch.forEach((candidate, i) => {
        const hit = byIndex.get(offset + i);
        if (hit) Object.assign(candidate, hit);
      });
    } catch (err) {
      // A scoring failure must not cost you the candidates you already paid for.
      const message = err instanceof Error ? err.message : String(err);
      batch.forEach((c) => { c.score = null; c.reason = `not scored: ${message}`; });
    }
  }

  // Best first; anything the model skipped sinks to the bottom but is kept.
  return scored.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
