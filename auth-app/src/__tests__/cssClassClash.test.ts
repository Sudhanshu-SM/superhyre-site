import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The console ships one global stylesheet namespace. The shared chat once named its page `.sc`, which the board already
 * used for stage-coloured words (`<span class="sc" data-sc>`): every stage name turned into a full-height block and the
 * Pipeline columns showed no cards. A stylesheet that defines a plain top-level class another one defines is that bug again.
 */

const dir = resolve(__dirname, "..");
const sheets = readdirSync(dir).filter((f) => f.endsWith(".css"));
const topLevel = (css: string): Set<string> => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const names = new Set<string>();
  // `.name {` or `.name, ...` at the start of a rule: the class itself, not a descendant of something else.
  for (const m of bare.matchAll(/(?:^|[}\n;])\s*\.([a-zA-Z][\w-]*)\s*(?=[{,])/g)) names.add(m[1] as string);
  return names;
};
const defined = new Map(sheets.map((f) => [f, topLevel(readFileSync(resolve(dir, f), "utf8"))] as const));

describe("a plain class is defined by one stylesheet", () => {
  it("keeps the shared chat off the board's stage-word class", () => {
    const owners = sheets.filter((f) => defined.get(f)?.has("sc"));
    expect(owners.sort()).toEqual(["schedules.css"]);
    expect(readFileSync(resolve(dir, "SharedChat.tsx"), "utf8")).not.toMatch(/className="sc[ "-]/);
  });

  it.each(["shared-chat.css", "tag.css", "tile.css", "people.css", "sources.css"])(
    "%s defines no top-level class that another stylesheet defines",
    (file) => {
      const clashes = [...(defined.get(file) ?? [])].flatMap((name) =>
        sheets.filter((f) => f !== file && defined.get(f)?.has(name)).map((f) => `.${name} also in ${f}`),
      );
      expect(clashes).toEqual([]);
    },
  );
});
