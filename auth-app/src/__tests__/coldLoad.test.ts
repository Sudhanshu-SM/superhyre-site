import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asyncStylesheets } from "../build/asyncCss";
import { vendorChunk } from "../build/chunks";
import { PAGE_FOR_ADDRESS, preloadPlan, preloadScript } from "../build/preload";
import { hasStoredSession } from "../consoleChunk";
import { stylesReady } from "../stylesReady";

/**
 * What a first visit on a slow link depends on (1.5 Mbps, 600 ms): something on screen in the first round trip,
 * an entry that is the size of the sign-in and not of the console, files that arrive compressed and fewer
 * round trips than there are files. These pin the pieces that make that so; the numbers themselves come from
 * a throttled load of a real build.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "..");
const read = (p: string) => readFileSync(p, "utf8");

describe("index.html, before any script has arrived", () => {
  const html = read(resolve(SRC, "../index.html"));

  it("draws the loader (the mark inside a ring) from inline CSS, in the first round trip", () => {
    expect(html).toContain('class="sh-boot"');
    expect(html).toContain("M16.047 0.496124"); // the mark's own path
    expect(html).toContain("sh-boot-arc");
    expect(html).toMatch(/<style>[\s\S]*\.sh-boot[\s\S]*<\/style>/);
    // Inside #root, so the app's first render replaces it rather than stacking on it.
    expect(html).toMatch(/<div id="root">\s*<div class="sh-boot"/);
  });

  it("puts the page's colour and colour-scheme on <html> before the bundle, from the saved choice or the device", () => {
    expect(html).toContain("superhyre.theme");
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toMatch(/html\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/);
    expect(html).toMatch(/setAttribute\("data-theme"/);
    // The candidate's page is light by design and is left alone.
    expect(html).toContain("#/apply");
  });

  it("does not block on a stylesheet or a font host: fonts load as print and switch on", () => {
    const links = [...html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "").matchAll(/<link[^>]+>/g)].map((m) => m[0]);
    const blocking = links.filter((l) => /rel="stylesheet"/.test(l) && !/media="print"/.test(l));
    expect(blocking, blocking.join("\n")).toEqual([]);
  });

  it("carries its own icon, so no /favicon.ico is asked for", () => {
    expect(html).toMatch(/<link rel="icon"[^>]+href="data:image\/svg\+xml/);
  });
});

describe("vendor files", () => {
  it("lifts React, Supabase, Motion and zod out of the app's own files", () => {
    expect(vendorChunk("/x/node_modules/react-dom/cjs/react-dom.production.min.js")).toBe("vendor-react");
    expect(vendorChunk("/x/node_modules/react/index.js")).toBe("vendor-react");
    expect(vendorChunk("/x/node_modules/@supabase/auth-js/dist/module/GoTrueClient.js")).toBe("vendor-supabase");
    expect(vendorChunk("/x/node_modules/motion-dom/dist/es/animation/JSAnimation.mjs")).toBe("vendor-motion");
    expect(vendorChunk("/x/node_modules/framer-motion/dist/es/index.mjs")).toBe("vendor-motion");
    expect(vendorChunk("/x/node_modules/zod/v3/types.js")).toBe("vendor-zod");
    expect(vendorChunk("C:\\x\\node_modules\\react\\index.js")).toBe("vendor-react");
  });

  it("leaves the app, and the icons (which belong to whoever draws them), to the bundler", () => {
    expect(vendorChunk("/x/auth-app/src/App.tsx")).toBeUndefined();
    expect(vendorChunk("/x/node_modules/@phosphor-icons/react/dist/defs/Gear.es.js")).toBeUndefined();
    expect(vendorChunk("/x/node_modules/reactive-thing/index.js")).toBeUndefined();
  });
});

describe("the stylesheet", () => {
  const injected = '<link rel="stylesheet" crossorigin href="/access/assets/access-AbC.css">';

  it("is fetched as a preload that becomes the stylesheet when it lands, with a noscript copy", () => {
    const out = asyncStylesheets(`<head>${injected}</head>`);
    expect(out).toContain('<link rel="preload" as="style" crossorigin href="/access/assets/access-AbC.css"');
    expect(out).toContain("onload=\"this.onload=null;this.rel='stylesheet'\"");
    expect(out).toContain("data-sh-css");
    expect(out).toContain('<noscript><link rel="stylesheet" href="/access/assets/access-AbC.css"></noscript>');
    // Not a stylesheet link in the head any more: nothing blocks the loader's first paint.
    expect(out.replace(/<noscript>[\s\S]*?<\/noscript>/g, "")).not.toMatch(/rel="stylesheet"/);
  });

  it("leaves other links alone", () => {
    const other = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter" media="print">';
    expect(asyncStylesheets(other)).toBe(other);
  });
});

describe("the app waits for the stylesheet it did not block on", () => {
  afterEach(() => vi.useRealTimers());

  /** Just enough of a link and a document: the events, `rel` and `sheet`. */
  function doc(link: { rel: string; sheet: unknown } | null) {
    const listeners = new Map<string, Array<() => void>>();
    const el = link && Object.assign(link, {
      addEventListener: (t: string, f: () => void) => { listeners.set(t, [...(listeners.get(t) ?? []), f]); },
    });
    return {
      doc: { querySelector: () => el } as unknown as Document,
      fire: (t: string) => (listeners.get(t) ?? []).forEach((f) => f()),
    };
  }

  it("does not wait where there is no such link (the dev server) or it is already the stylesheet", async () => {
    await expect(stylesReady(doc(null).doc)).resolves.toBeUndefined();
    await expect(stylesReady(doc({ rel: "stylesheet", sheet: {} }).doc)).resolves.toBeUndefined();
  });

  it("waits through the preload's own load, and for the stylesheet to be applied", async () => {
    const link = { rel: "preload", sheet: null as unknown };
    const d = doc(link);
    let done = false;
    void stylesReady(d.doc).then(() => { done = true; });
    // The preload arrives; the page's own handler makes it a stylesheet; it is not applied yet.
    link.rel = "stylesheet";
    d.fire("load");
    await Promise.resolve();
    expect(done).toBe(false);
    // Applied.
    link.sheet = {};
    d.fire("load");
    await Promise.resolve();
    expect(done).toBe(true);
  });

  it("gives up after a while rather than showing a loader for ever", async () => {
    vi.useFakeTimers();
    const d = doc({ rel: "preload", sheet: null });
    let done = false;
    void stylesReady(d.doc, 5000).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(4999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
  });
});

describe("what the entry carries", () => {
  /** The files the sign-in loads at once: static imports only, from main.tsx. */
  function staticClosure(entry: string): Set<string> {
    const seen = new Set<string>();
    const stack = [entry];
    const resolveImport = (from: string, spec: string): string | null => {
      if (!spec.startsWith(".")) return null;
      const base = resolve(dirname(from), spec);
      for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
        if (existsSync(c) && /\.(tsx?|css)$/.test(c)) return c;
      }
      return null;
    };
    while (stack.length) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      if (!/\.tsx?$/.test(file)) continue;
      const src = read(file);
      const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm;
      for (const m of src.matchAll(re)) {
        const to = resolveImport(file, m[1]!);
        if (to) stack.push(to);
      }
    }
    return seen;
  }

  const closure = staticClosure(resolve(SRC, "main.tsx"));
  const names = new Set([...closure].map((f) => f.slice(SRC.length + 1)));

  it("is the sign-in: the console, its sidebar and every page are fetched after it, on demand", () => {
    for (const page of [
      "Console.tsx", "Nav.tsx", "Palette.tsx", "Home.tsx", "Agent.tsx", "CampaignsPage.tsx", "CampaignWorkspace.tsx",
      "CampaignForms.tsx", "Contacts.tsx", "Clients.tsx", "Settings.tsx", "AnalyticsPages.tsx", "AgentActivity.tsx",
      "ApplyPage.tsx", "ApplyForm.tsx", "consolePages.tsx", "liveChat.ts",
    ]) {
      expect(names.has(page), `${page} is reachable from main.tsx without a dynamic import`).toBe(false);
    }
  });

  it("still has the sign-in itself, and the one stylesheet list", () => {
    expect(names.has("App.tsx")).toBe(true);
    expect(names.has("Cards.tsx")).toBe(true);
    expect(names.has("styles.ts")).toBe(true);
  });

  it("names every stylesheet the app had in one file, in an order that ends with access.css", () => {
    const list = [...read(resolve(SRC, "styles.ts")).matchAll(/^import "\.\/([^"]+\.css)";$/gm)].map((m) => m[1]!);
    expect(list.at(-1)).toBe("access.css");
    expect(new Set(list).size).toBe(list.length);
    for (const f of list) expect(existsSync(resolve(SRC, f)), f).toBe(true);
  });

  it("lists the stylesheets of the console's shell and shared parts (one fetched with a page would load after access.css)", () => {
    const list = new Set([...read(resolve(SRC, "styles.ts")).matchAll(/^import "\.\/([^"]+\.css)";$/gm)].map((m) => m[1]!));
    const shell = ["ui.css", "theme/theme.css", "components/loader.css", "emptyArt.css", "errorStates.css", "notifications.css", "access.css"];
    for (const f of shell) expect(list.has(f), f).toBe(true);
  });
});

describe("returning visitors", () => {
  /** A bundle shaped like a build: the entry and its vendor file, the console and what it shares, and two pages. */
  const bundle = {
    "assets/entry.js": { type: "chunk", isEntry: true, imports: ["assets/vendor.js"], moduleIds: ["/x/src/main.tsx", "/x/src/App.tsx"] },
    "assets/vendor.js": { type: "chunk", imports: [], moduleIds: ["/x/node_modules/react/index.js"] },
    "assets/console.js": { type: "chunk", imports: ["assets/vendor.js", "assets/shared.js", "assets/icons.js"], moduleIds: ["/x/src/Console.tsx"] },
    "assets/shared.js": { type: "chunk", imports: ["assets/vendor.js"], moduleIds: ["/x/src/campaignStore.ts"] },
    "assets/icons.js": { type: "chunk", imports: [], moduleIds: ["/x/node_modules/@phosphor-icons/react/dist/defs/Gear.es.js"] },
    "assets/home.js": { type: "chunk", imports: ["assets/shared.js", "assets/homeonly.js"], moduleIds: ["/x/src/Home.tsx"] },
    "assets/homeonly.js": { type: "chunk", imports: [], moduleIds: ["/x/src/HomeCards.tsx"] },
    "assets/agent.js": { type: "chunk", imports: ["assets/shared.js", "assets/console.js"], moduleIds: ["/x/src/Agent.tsx"] },
    "assets/site.css": { type: "asset" },
  } as const;
  const plan = preloadPlan(bundle as never);

  it("asks for the console's files, without what the entry already loads", () => {
    expect([...plan.shell].sort()).toEqual(["assets/console.js", "assets/icons.js", "assets/shared.js"]);
    expect(plan.shell).not.toContain("assets/entry.js");
    expect(plan.shell).not.toContain("assets/vendor.js");
  });

  it("asks, for a page, for what only that page needs on top of the console's", () => {
    const home = plan.pages.find((p) => p.address.includes("#/home"))!;
    expect([...home.files].sort()).toEqual(["assets/home.js", "assets/homeonly.js"]);
    const agent = plan.pages.find((p) => p.address === "^#/agent")!;
    expect(agent.files).toEqual(["assets/agent.js"]);
  });

  it("has an address for each page the console opens first, and Home answers the empty address", () => {
    const re = new RegExp(PAGE_FOR_ADDRESS[0]!.address);
    for (const hash of ["", "#/", "#/home", "#"]) expect(re.test(hash), JSON.stringify(hash)).toBe(true);
    expect(re.test("#/agent")).toBe(false);
    expect(PAGE_FOR_ADDRESS.map((p) => p.module)).toContain("src/CampaignWorkspace.tsx");
    // The more specific address comes first, or the Forms page would be the Overview's files.
    const at = (a: string) => PAGE_FOR_ADDRESS.findIndex((p) => p.address === a);
    expect(at("^#/campaign/forms")).toBeLessThan(at("^#/campaign"));
    // Agent activity is out of the navigation (its address redirects to Analytics), so it has no page of its own to preload.
    expect(at("^#/analytics/agent")).toBe(-1);
  });

  it("answers every Analytics address, filters and all, with the Analytics page's files", () => {
    const first = (hash: string) => PAGE_FOR_ADDRESS.find((p) => new RegExp(p.address).test(hash))?.module;
    for (const hash of [
      "#/analytics", "#/analytics?days=90", "#/analytics/recruiters", "#/analytics/outreach?campaignId=c1",
      "#/analytics/pipeline?from=2026-09-01&to=2026-09-30", "#/analytics/campaigns",
    ]) expect(first(hash), hash).toBe("src/AnalyticsPages.tsx");
  });

  /** Runs the inline script against a fake page. */
  function run(opts: { keys: string[]; hash: string }): string[] {
    const links: Array<{ rel: string; href: string; crossOrigin?: string; as?: string }> = [];
    const document = {
      createElement: () => ({ rel: "", href: "" } as { rel: string; href: string; crossOrigin?: string; as?: string }),
      head: { appendChild: (l: (typeof links)[number]) => links.push(l) },
    };
    const localStorage = { length: opts.keys.length, key: (i: number) => opts.keys[i] ?? null };
    new Function("localStorage", "location", "document", preloadScript(plan, "/access/"))(localStorage, { hash: opts.hash }, document);
    return links.map((l) => `${l.rel} ${l.href} ${l.crossOrigin}`);
  }

  it("preloads for someone who has signed in here, the page their address names included", () => {
    const out = run({ keys: ["superhyre.theme", "sb-localhost-auth-token"], hash: "#/agent" });
    expect(out).toContain("modulepreload /access/assets/console.js anonymous");
    expect(out).toContain("modulepreload /access/assets/agent.js anonymous");
    expect(out.some((l) => l.includes("home.js"))).toBe(false);
    const home = run({ keys: ["sb-localhost-auth-token"], hash: "" });
    expect(home).toContain("modulepreload /access/assets/home.js anonymous");
  });

  it("fetches nothing extra for someone who has not signed in: they are only signing in", () => {
    expect(run({ keys: ["superhyre.theme"], hash: "#/" })).toEqual([]);
    expect(run({ keys: [], hash: "#/" })).toEqual([]);
  });

  it("knows a stored session by Supabase's key", () => {
    const store = (...keys: string[]) => ({ length: keys.length, key: (i: number) => keys[i] ?? null });
    expect(hasStoredSession(store("sb-npqajviolhoufuggfobg-auth-token"))).toBe(true);
    expect(hasStoredSession(store("superhyre.theme", "superhyre.nav.railed"))).toBe(false);
    expect(hasStoredSession(null)).toBe(false);
    expect(hasStoredSession({ length: 1, key: () => { throw new Error("private window"); } })).toBe(false);
  });
});
