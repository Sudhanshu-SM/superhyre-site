import { useEffect, useState } from "react";
import type { Traffic } from "../api/forms";
import { api, messageOf } from "../api/client";

/**
 * How a form's answers add up, from the server: how many answered, how many met every must-have,
 * and how the link is doing. The server counts them against the version people actually saw, so
 * this is the figure to trust over anything worked out from the builder's working copy.
 */
export type FormSummary = {
  total: number;
  medianDurationS: number | null;
  met: number;
  missed: number;
  /** One entry per question that counts as a must-have has `mustHave`; none means the form screens on nothing. */
  questions: { id: string; mustHave?: { met: number; missed: number } }[];
  traffic?: Traffic;
};

export const hasMustHaves = (s: Pick<FormSummary, "questions">) => s.questions.some((q) => q.mustHave !== undefined);

export const getSummary = (formId: string) => api<FormSummary>("GET", `/v1/forms/${formId}/summary`);

export type Summaries = {
  /** By form id; a form with nobody answering has none read. */
  byId: ReadonlyMap<string, FormSummary>;
  loading: boolean;
  error: string | null;
};

/** The summaries of the forms that have answers, read when they appear. */
export function useSummaries(forms: readonly { id: string; answered: number }[]): Summaries {
  const [byId, setById] = useState<ReadonlyMap<string, FormSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = forms.map((f) => `${f.id}:${f.answered}`).join(",");

  useEffect(() => {
    let current = true;
    const ids = forms.filter((f) => f.answered > 0).map((f) => f.id);
    if (!ids.length) { setLoading(false); setById(new Map()); return; }
    setLoading(true);
    void Promise.all(ids.map((id) => getSummary(id).then((s) => [id, s] as const)))
      .then((pairs) => { if (current) { setById(new Map(pairs)); setError(null); setLoading(false); } })
      .catch((err: unknown) => { if (current) { setError(messageOf(err)); setLoading(false); } });
    return () => { current = false; };
    // The forms are read when their ids or answer counts change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { byId, loading, error };
}
