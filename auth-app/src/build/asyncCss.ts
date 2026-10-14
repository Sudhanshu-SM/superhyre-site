import type { Plugin } from "vite";

/**
 * Takes the stylesheet off the critical path of the first paint, without making it wait its turn.
 *
 * A stylesheet in the head blocks rendering until it has arrived, and this one is large: on a slow link the page
 * stayed blank for as long as it took. index.html draws its own loader from inline CSS, so with the stylesheet
 * fetched as a *preload* (which does not block rendering, and is fetched at the priority of a stylesheet, not of
 * something to get to later) and turned into the page's stylesheet the moment it lands, the loader is on screen in the
 * first round trip and the styles are not starved by the scripts. main.tsx waits for the stylesheet before it
 * mounts the app (`stylesReady`), so the app is never seen unstyled. A `<noscript>` copy keeps the page styled
 * for the odd browser without scripts.
 */
export const STYLE_MARK = "data-sh-css";

const LINK = /<link rel="stylesheet"((?: crossorigin(?:="[^"]*")?)?) href="([^"]+\.css)">/g;

export function asyncStylesheets(html: string): string {
  return html.replace(
    LINK,
    (_m, crossorigin: string, href: string) =>
      `<link rel="preload" as="style"${crossorigin} href="${href}" onload="this.onload=null;this.rel='stylesheet'" ${STYLE_MARK}>` +
      `<noscript><link rel="stylesheet" href="${href}"></noscript>`,
  );
}

export function asyncCss(): Plugin {
  return {
    name: "superhyre-async-css",
    apply: "build",
    transformIndexHtml: { order: "post", handler: asyncStylesheets },
  };
}
