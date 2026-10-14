import type { CSSProperties } from "react";
import "./connectorLogo.css";

/**
 * The mark of each service the agent works through: Google, Gmail, Google Sheets, Slack, Notion and WhatsApp.
 *
 * Drawn inline, simplified, in each brand's own colours: nothing is fetched, so a slow network never
 * leaves a connection row without its mark, and no package carries them. The data providers behind the
 * agent (contact lookup, enrichment) are deliberately not here: they stay unnamed.
 *
 * Two ways to use it:
 *   <ConnectorLogo id="slack" size={16} />   the bare mark, for a line of text (drawn to be seen on
 *                                            either theme: Notion is a white cube, Gmail a white envelope)
 *   <ConnectorLogo id="slack" tile />        the mark on a light tile (36px, or `tile={40}`), the same
 *                                            white in both themes so a brand colour never shifts
 */

export type ConnectorId = "google" | "gmail" | "sheets" | "slack" | "notion" | "whatsapp";

/** What each is called, as a person says it. */
export const CONNECTOR_NAME: Readonly<Record<ConnectorId, string>> = {
  google: "Google", gmail: "Gmail", sheets: "Google Sheets", slack: "Slack", notion: "Notion", whatsapp: "WhatsApp",
};

/* WhatsApp has a mark here for Settings and Outreach; the rail's channel chips (brand-coloured, with their own icon)
   are not drawn with it, so it is not one of the ids `isConnectorId` lets through. */
const IDS: ReadonlySet<string> = new Set(Object.keys(CONNECTOR_NAME).filter((id) => id !== "whatsapp"));

/** Whether a string is one of the services that has a mark here (the prototype's channel ids include others). */
export function isConnectorId(id: string): id is ConnectorId {
  return IDS.has(id);
}

/** The tile's size when `tile` is just switched on. */
export const TILE = 36;

/** One mark's drawing and the box it is drawn in. */
const MARKS: Readonly<Record<ConnectorId, { box: number; paths: JSX.Element }>> = {
  /* Google's four-colour G. */
  google: {
    box: 18,
    paths: (
      <>
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A8.99 8.99 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a8.99 8.99 0 0 0 0 8.12l3.01-2.34z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
      </>
    ),
  },
  /* Gmail: a white envelope with the red M. */
  gmail: {
    box: 24,
    paths: (
      <>
        <rect x="2.4" y="5.4" width="19.2" height="13.2" rx="1.8" fill="#fff" stroke="#dadce0" strokeWidth=".8" />
        <path
          fill="#EA4335"
          d="M2 7a2 2 0 0 1 2-2h.5L12 10.6 19.5 5h.5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1.5V9.4L12 14.3 5.5 9.4V19H4a2 2 0 0 1-2-2z"
        />
      </>
    ),
  },
  /* Google Sheets: the green sheet, its corner folded, a white grid on it. */
  sheets: {
    box: 24,
    paths: (
      <>
        <path fill="#0F9D58" d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
        <path fill="#87CEAC" d="M14 2l5 5h-4a1 1 0 0 1-1-1z" />
        <rect x="7" y="11" width="10" height="7" rx="1" fill="#fff" />
        <path d="M7 13.35h10M7 15.65h10M10.5 11v7" stroke="#0F9D58" strokeWidth="1" fill="none" />
      </>
    ),
  },
  /* Slack's hash, in its four colours. */
  slack: {
    box: 122.8,
    paths: (
      <>
        <path fill="#E01E5A" d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" />
        <path fill="#36C5F0" d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" />
        <path fill="#2EB67D" d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" />
        <path fill="#ECB22E" d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" />
      </>
    ),
  },
  /* WhatsApp: its green speech bubble with the white handset. */
  whatsapp: {
    box: 24,
    paths: (
      <>
        <path fill="#25D366" d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.2 21.8l5-1.3A9.8 9.8 0 1 0 12 2.2z" />
        <path
          fill="#fff"
          d="M16.7 14.3c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.3 6.3 0 0 1-3.1-2.7c-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.4l-.7-1.6c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.5 1.5.6 2 .7 2.7.6.4-.1 1.4-.6 1.5-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3z"
        />
      </>
    ),
  },
  /* Notion: a white cube with a black outline and the black N, which is how Notion draws it, so it is visible on a dark card too. */
  notion: {
    box: 24,
    paths: (
      <>
        <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3.4" fill="#fff" stroke="#111" strokeWidth="1.6" />
        <path d="M8.6 17V7.3l6.8 9.4V7" fill="none" stroke="#111" strokeWidth="1.9" strokeLinejoin="miter" strokeLinecap="butt" />
      </>
    ),
  },
};

export function ConnectorLogo({
  id, size = 16, tile = false, decorative = false, className,
}: {
  id: ConnectorId;
  /** The mark's width in px when it stands alone; inside a tile the tile sets it. */
  size?: number;
  /** On a light tile: `true` for the standard 36px, or the tile's size in px. */
  tile?: boolean | number;
  /** The name is written beside it, so it is left out of what a screen reader says. */
  decorative?: boolean;
  className?: string;
}): JSX.Element {
  const tileSize = tile === false ? 0 : tile === true ? TILE : tile;
  const mark = tileSize ? Math.round(tileSize * 0.6) : size;
  const { box, paths } = MARKS[id];
  const name = CONNECTOR_NAME[id];
  const style: CSSProperties | undefined = tileSize
    ? { width: tileSize, height: tileSize, borderRadius: Math.round(tileSize * 0.28) }
    : undefined;
  return (
    <span
      className={`conn-logo${tileSize ? " conn-logo-tile" : ""} is-${id}${className ? ` ${className}` : ""}`}
      style={style}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
    >
      <svg width={mark} height={mark} viewBox={`0 0 ${box} ${box}`} focusable="false" aria-hidden="true">
        {paths}
      </svg>
    </span>
  );
}
