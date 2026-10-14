/**
 * "Look again while it is in front": the one way a screen that has no push keeps itself current.
 *
 * `run` is called every `ms` while the tab is visible, at once when it comes back to the front or is
 * focused, and never while it is hidden (a tab nobody is looking at asks for nothing). Returns the way to stop.
 */
export function pollWhileVisible(run: () => void, ms: number): () => void {
  const inFront = (): boolean => typeof document === "undefined" || !document.hidden;
  const timer = setInterval(() => { if (inFront()) run(); }, ms);
  const back = () => { if (inFront()) run(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", back);
  if (typeof window !== "undefined") window.addEventListener("focus", back);
  return () => {
    clearInterval(timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", back);
    if (typeof window !== "undefined") window.removeEventListener("focus", back);
  };
}
