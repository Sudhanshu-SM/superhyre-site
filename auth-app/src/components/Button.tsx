import { CircleNotch } from "@phosphor-icons/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ICON_WEIGHT } from "./Field";

type Props = {
  variant: "solid" | "outline";
  busy?: boolean;
  /** Shown in place of `children` while busy, so the label describes what is
   *  happening rather than what the button normally offers. */
  busyLabel?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">;

export function Button({ variant, busy, busyLabel, children, disabled, ...rest }: Props) {
  return (
    <button
      className={`btn btn-${variant}`}
      // Disabled while busy so a double submit cannot create two signup
      // attempts, which the second time round returns "already registered".
      disabled={disabled || busy}
      aria-busy={busy}
      {...rest}
    >
      {busy && <CircleNotch className="spin" size={18} weight={ICON_WEIGHT} aria-hidden="true" />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
