import { useEffect, useRef, useState } from "react";

/** A number that counts up to its value when it first appears or changes, and just shows it for anyone who prefers no motion. */
export function Tick({ n }: { n: number }): JSX.Element {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(n); from.current = n; return; }
    const t0 = performance.now();
    const dur = start === 0 ? 700 : 400;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setShown(Math.round(start + (n - start) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = n;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <b className="mo-num">{shown.toLocaleString("en-IN")}</b>;
}
