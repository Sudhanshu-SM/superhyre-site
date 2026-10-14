/**
 * The stylesheet is not what the first paint waits for (index.html draws its own loader, and the build fetches the
 * stylesheet as a preload that turns into the page's own once it has arrived: src/build/asyncCss.ts), so the
 * app waits for it instead: it is never seen unstyled. Resolves at once where there is nothing to wait for (the
 * dev server, a stylesheet already in place), and gives up after a while: an app without its styling is a better
 * answer than a loader that never ends.
 */
export function stylesReady(doc: Document = document, giveUpMs = 10_000): Promise<void> {
  const link = doc.querySelector<HTMLLinkElement>("link[data-sh-css]");
  const placed = () => !link || (link.rel === "stylesheet" && !!link.sheet);
  if (placed()) return Promise.resolve();
  return new Promise((done) => {
    // The first `load` is the preload arriving (the link's own handler then makes it a stylesheet); the next is the
    // stylesheet being applied. Only that one counts.
    const check = () => { if (placed()) done(); };
    link!.addEventListener("load", check);
    link!.addEventListener("error", () => done(), { once: true });
    setTimeout(() => done(), giveUpMs);
  });
}
