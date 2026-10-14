import { useCallback, useEffect, useState } from "react";

/**
 * One request for a view: its answer, whether it failed, and a way to ask again. A new `key`
 * asks again; an answer for an old key never lands. `settled` is true once there is an answer
 * either way, so a view that can do without it (email results, say) stops waiting.
 */
export function useAsync<T>(load: () => Promise<T>, key: string): { data: T | undefined; failed: boolean; settled: boolean; retry: () => void } {
  const [state, setState] = useState<{ key: string; attempt: number; data?: T; failed: boolean; settled: boolean }>({ key, attempt: 0, failed: false, settled: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ key, attempt, failed: false, settled: false });
    load().then(
      (data) => { if (live) setState({ key, attempt, data, failed: false, settled: true }); },
      () => { if (live) setState({ key, attempt, failed: true, settled: true }); },
    );
    return () => { live = false; };
    // `load` is a closure over what `key` names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const current = state.key === key && state.attempt === attempt;
  return { data: current ? state.data : undefined, failed: current && state.failed, settled: current && state.settled, retry };
}
