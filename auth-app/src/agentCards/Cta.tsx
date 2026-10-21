import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./cta.css";

/**
 * A button on a card. Where it goes is one of three things: an action (`onClick`), a page of the console (`href` starting
 * with `#`, which routes in place), or a page elsewhere (`https:`, opens a new tab and says so with its arrow). It is never
 * written as a sentence with an underline: a card says what is there, and a button is the way on.
 */
type Common = {
  children: ReactNode;
  /** A small mark before the words. The default for a page is an arrow. */
  icon?: Icon;
  variant?: "quiet" | "primary";
  small?: boolean;
  bare?: boolean;
  className?: string;
};

export function Cta(props: Common & ({ href: string } | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">))): JSX.Element {
  const { children, icon, variant = "quiet", small = false, bare = false, className = "", ...rest } = props;
  const cls = `cta${variant === "primary" ? " is-primary" : ""}${small ? " is-sm" : ""}${bare ? " is-bare" : ""}${className ? ` ${className}` : ""}`;
  if (typeof props.href === "string") {
    const { href } = props;
    const outside = /^https?:\/\//.test(href);
    const Mark = icon ?? (outside ? ArrowUpRight : ArrowRight);
    return (
      <a className={cls} href={href} {...(outside ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
        <Mark size={14} aria-hidden="true" />
      </a>
    );
  }
  const { href: _unused, ...button } = rest as ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
  const Mark = icon;
  return (
    <button type="button" className={cls} {...button}>
      {Mark && <Mark size={14} aria-hidden="true" />}
      {children}
    </button>
  );
}
