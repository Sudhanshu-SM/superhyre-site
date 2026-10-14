import type { Plugin, Rule } from "postcss";

/**
 * Lining figures wherever the serif or the pixel face is set.
 *
 * Fanwood Text draws its digits old-style by default: a 1 is a small-cap I, a 3 hangs below the line. In a name
 * that reads as a different word ("T1 S4 Co" as "Tı S4 Co") and in a figure it reads as noise. `font-variant-numeric`
 * is a longhand that the `font` shorthand resets, so it cannot be set once at the root and inherited: it has to be
 * on every rule that picks the face. This does that at build time, so a new rule that sets the face gets it too.
 */

const FACE = /var\(--(?:serif|pixel)\)|Fanwood|Mondwest/i;

export function postcssLining(): Plugin {
  return {
    postcssPlugin: "superhyre-lining-figures",
    Once(root) {
      root.walkRules((rule: Rule) => {
        let sets = false;
        let figures: string | null = null;
        rule.each((n) => {
          if (n.type !== "decl") return;
          const prop = n.prop.toLowerCase();
          if ((prop === "font" || prop === "font-family") && FACE.test(n.value)) sets = true;
          if (prop === "font-variant-numeric") figures = n.value;
        });
        if (!sets) return;
        // A tabular figure is still a figure: keep it, and make it lining.
        if (figures !== null && /lining-nums/.test(figures)) return;
        rule.walkDecls(/^font-variant-numeric$/i, (d) => { d.remove(); });
        const kept = figures !== null ? String(figures).replace(/\b(normal|oldstyle-nums)\b/g, "").trim() : "";
        rule.append({ prop: "font-variant-numeric", value: kept ? `lining-nums ${kept}` : "lining-nums" });
      });
    },
  };
}
postcssLining.postcss = true as const;
