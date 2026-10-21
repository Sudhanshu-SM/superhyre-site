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
 *   <ConnectorLogo id="google" wide />       Google's own wordmark, "Google Workspace", on a wide light slot
 *                                            (40px high, or `wide={32}`): where the mark stands beside or
 *                                            above a "Google" label, the wordmark replaces both. Square slots
 *                                            (the rail's dots, a small chip) keep the four-colour G.
 */

export type ConnectorId = "google" | "gmail" | "sheets" | "calendar" | "tasks" | "slack" | "notion" | "whatsapp";

/** What each is called, as a person says it. */
export const CONNECTOR_NAME: Readonly<Record<ConnectorId, string>> = {
  google: "Google", gmail: "Gmail", sheets: "Google Sheets", calendar: "Google Calendar", tasks: "Google Tasks",
  slack: "Slack", notion: "Notion", whatsapp: "WhatsApp",
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
  /* Google Calendar: a white page with the blue header and the day grid. */
  calendar: {
    box: 24,
    paths: (
      <>
        <rect x="3.2" y="4.2" width="17.6" height="16.6" rx="2.6" fill="#fff" stroke="#dadce0" strokeWidth=".8" />
        <path fill="#4285F4" d="M3.2 6.8a2.6 2.6 0 0 1 2.6-2.6h12.4a2.6 2.6 0 0 1 2.6 2.6V10H3.2z" />
        <rect x="7.4" y="2.4" width="2" height="3.8" rx="1" fill="#1A73E8" />
        <rect x="14.6" y="2.4" width="2" height="3.8" rx="1" fill="#1A73E8" />
        <rect x="7" y="12.2" width="3" height="2.6" rx=".6" fill="#34A853" />
        <rect x="10.5" y="12.2" width="3" height="2.6" rx=".6" fill="#FBBC05" />
        <rect x="14" y="12.2" width="3" height="2.6" rx=".6" fill="#EA4335" />
        <rect x="7" y="15.9" width="3" height="2.6" rx=".6" fill="#4285F4" />
      </>
    ),
  },
  /* Google Tasks: the blue disc with its white tick. */
  tasks: {
    box: 24,
    paths: (
      <>
        <circle cx="12" cy="12" r="9.6" fill="#4285F4" />
        <path d="M7.6 12.4l3 3 5.8-6" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
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

/** What the Workspace wordmark is called for a screen reader: the name is in the picture, not beside it. */
export const GOOGLE_WORKSPACE = "Google Workspace";

/** The wide slot's height when `wide` is just switched on. */
export const WIDE = 40;

/**
 * Google's own "Google Workspace" wordmark: "Google" in its four colours and "Workspace" in grey. Drawn from
 * the official artwork's geometry (3995 x 512), inline, with no script, style or id. It is always on the
 * light slot, because the grey would not read on a near-black card.
 */
const WORDMARK = { w: 3995.04, h: 512 };
function Wordmark(): JSX.Element {
  return (
    <>
      <polygon fill="#5f6368" points="2086.62 38.61 2133.66 38.61 2040.07 389.45 1994.01 389.45 1918.55 158.17 1916.59 158.17 1841.13 389.45 1795.07 389.45 1697.56 38.61 1744.6 38.61 1818.59 314.48 1820.55 314.48 1896.5 85.65 1938.64 85.65 2014.59 314.48 2016.55 314.48 2086.62 38.61" />
      <path fill="#5f6368" d="M2129.4,269.4q0-55.36,34.79-91.63,35.28-36.26,88.69-36.26t88.2,36.26q35.28,36.27,35.28,91.63,0,55.86-35.28,91.63-34.8,36.27-88.2,36.26T2164.19,361q-34.8-36.25-34.79-91.63m45.08,0q0,38.72,22.54,62.72t55.86,24q33.32,0,55.86-24t22.54-62.72q0-38.22-22.54-62.23-23-24.49-55.86-24.5T2197,207.17q-22.55,24-22.54,62.23" />
      <path fill="#5f6368" d="M2453.43,389.45h-45.08V149.35h43.12v39.2h2q6.86-19.11,28.18-32.59t41.89-13.47q19.59,0,33.32,5.88L2543.1,192q-8.34-3.42-26.46-3.43-25.48,0-44.34,20.58t-18.87,48Z" />
      <polygon fill="#5f6368" points="2788.88 389.45 2734.49 389.45 2659.52 276.26 2622.77 312.52 2622.77 389.45 2577.69 389.45 2577.69 38.61 2622.77 38.61 2622.77 254.7 2726.65 149.35 2784.47 149.35 2784.47 151.31 2690.88 244.41 2788.88 387.49 2788.88 389.45" />
      <path fill="#5f6368" d="M2983.94,322.81q0,31.37-27.44,52.92t-69.09,21.56q-36.26,0-63.7-18.87a104,104,0,0,1-39.2-49.73l40.18-17.15q8.82,21.57,25.73,33.56a62.49,62.49,0,0,0,37,12q21.57,0,36-9.31t14.45-22.05q0-23-35.28-33.81l-41.16-10.29Q2791.38,264,2791.37,214q0-32.82,26.71-52.68t68.35-19.84q31.86,0,57.58,15.19t36,40.67L2939.84,214a50.62,50.62,0,0,0-22.29-23.77,70,70,0,0,0-34.55-8.57,57.92,57.92,0,0,0-31.6,8.82q-14,8.82-14,21.56,0,20.58,38.71,29.4l36.26,9.31q71.54,17.64,71.54,72" />
      <path fill="#5f6368" d="M3140.49,397.29q-26.46,0-48.26-11.27t-33.57-29.89h-2l2,33.32V495.29h-45.08V149.35h43.12v33.32h2q11.76-18.61,33.57-29.89t48.26-11.27q47.52,0,80.36,37.24,33.81,37.74,33.81,90.65,0,53.42-33.81,90.65-32.83,37.24-80.36,37.24m-7.35-41.16q32.34,0,54.39-24.5,22-24,22-62.23,0-37.72-22-62.23t-54.39-24.5q-32.83,0-54.88,24.5-21.57,24.51-21.56,62.23,0,38.22,21.56,62.72,22,24,54.88,24" />
      <path fill="#5f6368" d="M3378.14,141.51q50,0,78.89,26.7t28.91,73.26v148h-43.12V356.13h-2q-27.93,41.16-74.48,41.16-39.69,0-66.4-23.52t-26.7-58.8q0-37.23,28.17-59.29t75.22-22.05q40.17,0,66.15,14.7V238q0-23.52-18.62-39.94a63.88,63.88,0,0,0-43.61-16.41q-37.74,0-59.78,31.85l-39.69-25q32.82-47,97-47M3319.83,316q0,17.64,14.94,29.4t35,11.76q28.41,0,50.71-21.07t22.3-49.49q-21.08-16.65-58.8-16.66-27.45,0-45.82,13.23T3319.83,316" />
      <path fill="#5f6368" d="M3638.77,397.29q-53.42,0-88.69-36.26-34.8-37.23-34.79-91.63,0-55.36,34.79-91.63,35.28-36.26,88.69-36.26,36.75,0,64.19,18.37t41.16,50.72L3703,227.75q-19.11-45.08-67.13-45.08-30.87,0-53.41,25-22.05,25-22.05,61.74t22.05,61.74q22.53,25,53.41,25,49.49,0,69.58-45.08l40.18,17.15q-13.23,32.34-41.41,50.71t-65.41,18.38" />
      <path fill="#5f6368" d="M3881.36,397.29q-52.92,0-87.22-36.26t-34.3-91.63q0-54.87,33.32-91.39t85.26-36.5q53.4,0,85,34.54T3995,272.83l-.49,4.9H3805.9q1,35.28,23.52,56.84t53.9,21.56q43.11,0,67.62-43.12l40.18,19.6a119.71,119.71,0,0,1-44.84,47.53q-28.67,17.14-64.92,17.15m-72-156.8H3947q-2-25-20.34-41.41t-49.24-16.41q-25.49,0-43.86,15.68t-24.25,42.14" />
      <path fill="#4285f4" d="M202.4,235.58V181.32H384a178.13,178.13,0,0,1,2.93,33.27c0,40.68-11.13,91.06-47,126.9-34.87,36.33-79.42,55.71-138.5,55.71C92,397.2,0,308.07,0,198.6S92,0,201.45,0C262,0,305.08,23.74,337.53,54.74L299.27,93C276,71.21,244.55,54.25,201.45,54.25c-79.9,0-142.37,64.42-142.37,144.35S121.55,343,201.45,343c51.82,0,81.36-20.83,100.24-39.72,15.39-15.39,25.53-37.47,29.46-67.65Z" />
      <path fill="#ea4335" d="M663.64,269.32C663.64,343,606,397.2,535.32,397.2S407,343,407,269.32c0-74.11,57.63-127.88,128.34-127.88s128.32,53.77,128.32,127.88m-56.17,0c0-46-33.41-77.5-72.15-77.5s-72.16,31.48-72.16,77.5c0,45.53,33.41,77.5,72.16,77.5s72.15-32,72.15-77.5" />
      <path fill="#fbbc04" d="M943.59,269.32C943.59,343,886,397.2,815.27,397.2S686.94,343,686.94,269.32c0-74.11,57.62-127.88,128.33-127.88s128.32,53.77,128.32,127.88m-56.17,0c0-46-33.41-77.5-72.15-77.5s-72.16,31.48-72.16,77.5c0,45.53,33.41,77.5,72.16,77.5s72.15-32,72.15-77.5" />
      <path fill="#4285f4" d="M1211.93,149.19v229.6c0,94.46-55.69,133.21-121.55,133.21-62,0-99.28-41.66-113.32-75.56L1026,416.09c8.71,20.83,30,45.53,64.41,45.53,42.13,0,68.28-26.16,68.28-75.08v-18.4h-1.94c-12.59,15.5-36.8,29.06-67.31,29.06-63.93,0-122.52-55.71-122.52-127.39,0-72.18,58.59-128.37,122.52-128.37,30.51,0,54.72,13.56,67.31,28.58h1.94V149.19Zm-49.4,120.62c0-45.05-30-78-68.28-78-38.74,0-71.19,32.94-71.19,78,0,44.56,32.45,77,71.19,77,38.26,0,68.28-32.45,68.28-77" />
      <rect fill="#34a853" x="1250.9" y="14.82" width="56.17" height="374.63" />
      <path fill="#ea4335" d="M1524,311.46l43.58,29.06c-14,20.83-47.94,56.68-106.54,56.68-72.64,0-126.88-56.19-126.88-127.88,0-76,54.73-127.88,120.58-127.88,66.35,0,98.79,52.8,109.45,81.38l5.81,14.53-171,70.72c13.08,25.67,33.42,38.75,62,38.75s48.43-14,63-35.36m-134.15-46L1504.14,218c-6.3-16-25.18-27.12-47.46-27.12-28.57,0-68.28,25.19-66.83,74.6" />
    </>
  );
}

export function ConnectorLogo({
  id, size = 16, tile = false, wide = false, decorative = false, className,
}: {
  id: ConnectorId;
  /** The mark's width in px when it stands alone; inside a tile the tile sets it. */
  size?: number;
  /** On a light tile: `true` for the standard 36px, or the tile's size in px. */
  tile?: boolean | number;
  /**
   * Google only: its "Google Workspace" wordmark on a wide light slot, `true` for 40px high or the slot's
   * height in px. It carries the name, so the name is not written beside it (and `decorative` stays off).
   */
  wide?: boolean | number;
  /** The name is written beside it, so it is left out of what a screen reader says. */
  decorative?: boolean;
  className?: string;
}): JSX.Element {
  if (id === "google" && wide !== false) {
    const slot = wide === true ? WIDE : wide;
    const height = Math.round(slot * 0.45);
    return (
      <span
        className={`conn-logo conn-logo-wide is-google${className ? ` ${className}` : ""}`}
        style={{ height: slot, borderRadius: Math.round(slot * 0.28), paddingInline: Math.round(slot * 0.34) }}
        {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": GOOGLE_WORKSPACE })}
      >
        <svg
          width={Math.round((height * WORDMARK.w) / WORDMARK.h)}
          height={height}
          viewBox={`0 0 ${WORDMARK.w} ${WORDMARK.h}`}
          focusable="false"
          aria-hidden="true"
        >
          <Wordmark />
        </svg>
      </span>
    );
  }
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
