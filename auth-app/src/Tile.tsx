import { EnvelopeSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { initialsOf } from "./ui";
import "./tile.css";

/**
 * A person's square tile: their picture when they have one that loads, their initials when they do not, and an envelope for
 * someone who has only been invited. One shape wherever people are listed, so a person is the same thing on every page.
 */
export function Tile({ name, url, size = 72, invited = false }: { name: string; url?: string | null; size?: number; invited?: boolean }) {
  const [broken, setBroken] = useState(false);
  const show = Boolean(url) && !broken && !invited;
  return (
    <span className={`tile${invited ? " is-invited" : ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.32) }} aria-hidden="true">
      {show ? (
        <img src={url ?? ""} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : invited ? (
        <EnvelopeSimple size={Math.round(size * 0.38)} weight="regular" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
