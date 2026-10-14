import type { IndexHtmlTransformContext, Plugin, ResolvedConfig } from "vite";

/**
 * Starts the console's files arriving in the first round trip, for someone who has signed in here before.
 *
 * The entry draws the sign-in and finds out who the person is. For a returning person that is only the start:
 * it then asks for the console (a file), which asks for the files it shares, and when it shows the page (another
 * file, with its own) the page asks for its data. Every step waits for the one before, and on a slow link each
 * wait is a round trip. The build knows what each step will ask for, so index.html says it up front: the
 * console's files, and the files of the page the address names. Someone who has never signed in here
 * (no `sb-*-auth-token` in storage) is only signing in, and fetches none of it.
 */

/** The address of a page, and the source module that is that page. First match wins. */
export const PAGE_FOR_ADDRESS: ReadonlyArray<{ address: string; module: string }> = [
  { address: "^#?/?(?:\\?.*)?$|^#/home", module: "src/Home.tsx" },
  { address: "^#/agent", module: "src/Agent.tsx" },
  { address: "^#/campaigns", module: "src/CampaignsPage.tsx" },
  { address: "^#/campaign/(?:outreach|calls)", module: "src/OutreachPage.tsx" },
  { address: "^#/campaign/forms", module: "src/CampaignForms.tsx" },
  { address: "^#/campaign", module: "src/CampaignWorkspace.tsx" },
  { address: "^#/contacts", module: "src/Contacts.tsx" },
  /* Everyone's outreach is for owners and admins; a recruiter's "#/outreach" is turned into their campaign's Outreach,
     which is the same file, so the one entry serves both. "#/calls" is the page's old address and still lands here. */
  { address: "^#/(?:outreach|calls)", module: "src/OutreachPage.tsx" },
  { address: "^#/clients", module: "src/Clients.tsx" },
  { address: "^#/settings", module: "src/Settings.tsx" },
  { address: "^#/analytics", module: "src/AnalyticsPages.tsx" },
];
const CONSOLE_MODULE = "src/Console.tsx";

type Chunk = { fileName: string; imports: string[]; moduleIds?: string[]; modules?: Record<string, unknown>; isEntry?: boolean; viteMetadata?: { importedCss?: Set<string> } };
type Bundle = Record<string, { type: string } & Partial<Chunk>>;

const sep = (s: string) => s.replace(/\\/g, "/");

/** The files a chunk needs before it can run: its static imports, all the way down, and their stylesheets. */
function closure(start: Chunk, chunks: Map<string, Chunk>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [start.fileName];
  while (stack.length) {
    const name = stack.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    const c = chunks.get(name);
    for (const css of c?.viteMetadata?.importedCss ?? []) out.push(css);
    for (const i of c?.imports ?? []) stack.push(i);
  }
  return out;
}

/** Which files each address needs beyond the entry's own. Pure, for the test. */
export function preloadPlan(bundle: Bundle): { shell: string[]; pages: Array<{ address: string; files: string[] }> } {
  const chunks = new Map<string, Chunk>();
  for (const [name, c] of Object.entries(bundle)) if (c.type === "chunk") chunks.set(name, { ...(c as Chunk), fileName: name });
  const entry = [...chunks.values()].find((c) => c.isEntry);
  const have = new Set(entry ? closure(entry, chunks) : []);
  const holder = (suffix: string): Chunk | undefined =>
    [...chunks.values()].find((c) => (c.moduleIds ?? Object.keys(c.modules ?? {})).some((m) => sep(m).endsWith(`/${suffix}`)));
  const beyond = (c: Chunk | undefined): string[] => (c ? closure(c, chunks).filter((f) => !have.has(f)) : []);
  const shell = beyond(holder(CONSOLE_MODULE));
  const inShell = new Set(shell);
  return {
    shell,
    pages: PAGE_FOR_ADDRESS.map((p) => ({ address: p.address, files: beyond(holder(p.module)).filter((f) => !inShell.has(f)) })),
  };
}

/** The inline script: nothing for someone who has not signed in here; the console's files, and the page's, for who has. */
export function preloadScript(plan: ReturnType<typeof preloadPlan>, base: string): string {
  const pages = plan.pages.filter((p) => p.files.length).map((p) => [p.address, p.files]);
  return `(function(){try{var s=false;for(var i=0;i<localStorage.length;i++){if(/^sb-.+-auth-token$/.test(localStorage.key(i))){s=true;break}}if(!s)return}catch(e){return}
var b=${JSON.stringify(base)},f=${JSON.stringify(plan.shell)},p=${JSON.stringify(pages)},h=location.hash||"#/";
for(var j=0;j<p.length;j++){if(new RegExp(p[j][0]).test(h)){f=f.concat(p[j][1]);break}}
f.forEach(function(n){var l=document.createElement("link");l.rel=/\\.css$/.test(n)?"preload":"modulepreload";if(l.rel==="preload")l.as="style";l.crossOrigin="anonymous";l.href=b+n;document.head.appendChild(l)})})();`;
}

export function preloadReturning(): Plugin {
  let base = "/";
  return {
    name: "superhyre-preload-returning",
    apply: "build",
    configResolved(c: ResolvedConfig) { base = c.base; },
    transformIndexHtml: {
      order: "post",
      handler(_html: string, ctx: IndexHtmlTransformContext) {
        if (!ctx.bundle) return;
        const plan = preloadPlan(ctx.bundle as unknown as Bundle);
        if (!plan.shell.length) return;
        // After the page's own tags, so it asks for the entry and its vendor files first.
        return [{ tag: "script", children: preloadScript(plan, base), injectTo: "body" as const }];
      },
    },
  };
}
