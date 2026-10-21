import { useEffect, useRef, useState } from "react";

/** Asks for something once per `key` while `on`; the answer, or null while it is on its way or if it never comes. Never throws. */
export function useAsked<T>(on: boolean, key: string, ask: () => Promise<T>): { loading: boolean; data: T | null } {
  const [state, setState] = useState<{ key: string; data: T | null; loading: boolean }>({ key: "", data: null, loading: false });
  const latest = useRef(ask);
  latest.current = ask;
  useEffect(() => {
    if (!on) { setState({ key: "", data: null, loading: false }); return; }
    let gone = false;
    setState({ key, data: null, loading: true });
    latest.current().then(
      (data) => { if (!gone) setState({ key, data, loading: false }); },
      () => { if (!gone) setState({ key, data: null, loading: false }); },
    );
    return () => { gone = true; };
  }, [on, key]);
  return { loading: on && (state.key !== key || state.loading), data: state.key === key ? state.data : null };
}
