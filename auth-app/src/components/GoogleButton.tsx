import { CircleNotch } from "@phosphor-icons/react";
import { ICON_WEIGHT } from "./Field";

/**
 * Google's official four-colour "G".
 *
 * This is the one inline SVG on the surface, and it is a brand asset rather
 * than an icon: Google's Sign-In branding guidelines require this exact mark in
 * these exact colours, so neither a Phosphor glyph nor a monochrome Simple
 * Icons fetch is a legal substitute. Inlined rather than loaded from a CDN
 * because a network hiccup must not leave the primary sign-in button unlabelled.
 */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A8.99 8.99 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a8.99 8.99 0 0 0 0 8.12l3.01-2.34z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

type Props = {
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** Sign-in and sign-up run the identical OAuth call — Google has no notion of
   *  which one you meant — but the label should still match the tab you are on
   *  rather than claiming to do something different. */
  label: string;
};

export function GoogleButton({ busy, disabled, onClick, label }: Props) {
  return (
    <button
      type="button"
      className="btn btn-outline"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
    >
      {busy
        ? <CircleNotch className="spin" size={18} weight={ICON_WEIGHT} aria-hidden="true" />
        : <GoogleMark />}
      {busy ? "Opening Google" : label}
    </button>
  );
}
