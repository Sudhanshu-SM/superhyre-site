import { AnimatePresence, motion } from "motion/react";
import { Loader } from "../../components/Loader";

/**
 * The workspace being made, as the real tasks it is: each line waits, works, then ticks. The
 * tick pops in as its line finishes. Percentages are never invented; lines only change state
 * when the work does.
 */
export type RowStatus = "waiting" | "working" | "done";
export type ProgressRow = { id: string; label: string; detail?: string; status: RowStatus };

export function SetupProgress({ rows, reduce }: { rows: ProgressRow[]; reduce: boolean }): JSX.Element {
  return (
    <ol className="ls-sp" aria-label="Setting up" aria-live="polite">
      {rows.map((r, i) => (
        <motion.li
          key={r.id}
          className={`is-${r.status}`}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: r.status === "waiting" ? 0.5 : 1, y: 0 }}
          transition={{ duration: 0.4, delay: reduce ? 0 : 0.1 + i * 0.1, ease: [0.23, 1, 0.32, 1] }}
        >
          <span className="ls-sp-icon" aria-hidden="true">
            <AnimatePresence mode="wait" initial={false}>
              {r.status === "done" ? (
                <motion.svg key="d" viewBox="0 0 20 20" width="20" height="20" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 480, damping: 18 }}>
                  <circle cx="10" cy="10" r="10" fill="#ea5a1e" />
                  <path d="M5.8 10.4l2.8 2.8 5.6-6.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </motion.svg>
              ) : r.status === "working" ? (
                <motion.span key="w" className="ls-sp-ldr" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Loader size="sm" tone="inherit" /></motion.span>
              ) : (
                <motion.span key="s" className="ls-sp-dot" />
              )}
            </AnimatePresence>
          </span>
          <span className="ls-sp-text">
            <b>{r.label}</b>
            {r.detail && <span>{r.detail}</span>}
          </span>
        </motion.li>
      ))}
    </ol>
  );
}
