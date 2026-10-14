import { useEffect, useState } from "react";
import "./orgMark.css";

/**
 * An organisation's avatar: its logo when it has one (and it loads), otherwise its first letter. The one
 * place a logo is drawn, so the switcher, the bell, invitations and Settings can never disagree. `size` is
 * the box in px; with `fill` the mark takes the size of the box it sits in (a chip that already has its own).
 */
export function OrgMark({ name, logoUrl, size = 28, fill = false }: {
  name: string;
  logoUrl?: string | null;
  size?: number;
  fill?: boolean;
}): JSX.Element {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logoUrl]);
  const letter = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  const shown = logoUrl && !broken;
  return (
    <span
      className={`orgmark${shown ? " has-logo" : ""}${fill ? " is-fill" : ""}`}
      style={fill ? undefined : { width: size, height: size, borderRadius: Math.round((size * 8) / 28), fontSize: Math.max(11, Math.round(size * 0.46)) }}
      aria-hidden="true"
    >
      {shown ? <img src={logoUrl} alt="" draggable={false} onError={() => setBroken(true)} /> : letter}
    </span>
  );
}
