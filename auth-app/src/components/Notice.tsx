import { Info, Warning } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ICON_WEIGHT } from "./Field";

type Props = {
  /** `problem` carries the accent rule and an alert role; `quiet` is neutral
   *  information nobody needs announced. */
  tone: "problem" | "quiet";
  children: ReactNode;
};

/**
 * Form-level result, as opposed to a per-field error. Kept separate because the
 * two answer different questions: a field error says "this input is wrong", a
 * notice says "the request came back with this".
 */
export function Notice({ tone, children }: Props) {
  const problem = tone === "problem";
  return (
    <div
      className={problem ? "notice" : "notice notice-quiet"}
      role={problem ? "alert" : undefined}
    >
      {problem
        ? <Warning size={16} weight={ICON_WEIGHT} aria-hidden="true" />
        : <Info size={16} weight={ICON_WEIGHT} aria-hidden="true" />}
      <span>{children}</span>
    </div>
  );
}
