import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader } from "./Loader";

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
      {busy && <Loader size="sm" tone="inherit" />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
