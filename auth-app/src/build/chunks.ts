/**
 * How the build is cut into files, for vite.config.ts (and pinned by a test).
 *
 * The app's own code splits where it is loaded: the sign-in is the entry, the console is a file, and each page of
 * the console is a file (consoleChunk.ts, consolePages.tsx). What does not change from one release to the next
 * and is large (React, Supabase, Motion, zod) is lifted out into vendor files of its own, so a new release does
 * not make anyone download it again and the entry stays the size of the sign-in.
 *
 * The icon set is deliberately not one of them: each icon is code that belongs to the file that draws it, and
 * "every icon the app uses" as a vendor file would be fetched to sign in. (Nor are the app's own shared modules
 * named here: a manual chunk pulls in whatever it imports that nothing else claims, and the sign-in then
 * fetches the console. The bundler's own split by importers is the right one; it is the preload list that
 * hides its round trips, see preload.ts.)
 */
const GROUPS: ReadonlyArray<readonly [name: string, test: RegExp]> = [
  ["vendor-react", /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/],
  ["vendor-supabase", /[\\/]node_modules[\\/]@supabase[\\/]/],
  ["vendor-motion", /[\\/]node_modules[\\/](?:motion|motion-dom|motion-utils|framer-motion)[\\/]/],
  ["vendor-zod", /[\\/]node_modules[\\/]zod[\\/]/],
];

/** The vendor file a module belongs in, or undefined to leave it to the bundler. */
export function vendorChunk(id: string): string | undefined {
  for (const [name, test] of GROUPS) if (test.test(id)) return name;
  return undefined;
}
