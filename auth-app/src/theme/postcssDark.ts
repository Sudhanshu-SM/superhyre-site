import type { AnyNode, Declaration, Plugin, Rule } from "postcss";
import { darkValue, isLightText, isStateName, roleOf, roleOfCustom } from "./darkColors";

/**
 * Writes the dark theme out of the light one, at build time.
 *
 * For every rule that spends a colour literal on something the theme owns (a text colour, a surface, a line, a
 * shadow), a second rule follows it, scoped to `:root[data-theme="dark"]`, saying what that colour is there. The
 * source stylesheets are not touched and there is no second copy to keep in step: change a colour in a
 * stylesheet and its dark counterpart changes with it.
 *
 * What it does not do: a colour that comes through a token (`var(--ink)`) is the token's, so the dark values
 * of the tokens live in theme.css; and the rare place a token is used the other way round (white text on an
 * `--ink` fill) is turned over here, since the token flips to light.
 */

const SCOPE = ':root[data-theme="dark"]';
/**
 * The set-up screens have a look of their own (peach, light in both themes) and are never themed. Nor is the
 * boot screen in index.html: it already says what it is in each theme (html[data-theme="dark"]), and a dark twin
 * written over that would make it a different grey from the page it hands over to.
 */
const SKIP_FILES = /[\\/]setup[\\/]|[\\/]index\.html\b/;
/**
 * The candidate's page is light by design, wherever it is shown: the form builder edits the same components in
 * place, so their dark rules apply only inside the builder, never in the preview or on the page itself. The client's
 * review page (review.css) is light the same way; it has no builder, so it has no dark rules at all.
 */
const BUILDER_ONLY = /(apply|review)\.css$/;
const BUILDER = ".fm-canvas-wrap:not(.is-preview)";

/**
 * `.nav-row:hover` -> `:where(:root[data-theme="dark"]) .nav-row:hover`.
 *
 * The scope is `:where()` so it adds no specificity: a dark rule weighs exactly what its light source weighs and
 * sits right after it, so every ordering the stylesheet already relies on (a generic rule, then a more specific
 * one that overrides it) holds in the dark theme as it does in the light one. The root's own selectors keep the
 * full scope: they are tokens, and tokens are meant to win.
 */
function scoped(selector: string, within = ""): string {
  const s = selector.trim();
  if (s === ":root" || s === "html") return SCOPE;
  if (s.startsWith(":root")) return `${SCOPE}${s.slice(":root".length)}`;
  return `:where(${SCOPE}) ${within}${s}`;
}

const INK_FILL = /^var\(--(ink|ink-2|ink-3|black)\)$/;
/** Selectors for something laid over the page to dim it: it stays dark in the dark theme. */
const VEIL = /scrim|veil|backdrop|dimmer/i;

export function postcssDark(): Plugin {
  return {
    postcssPlugin: "superhyre-dark-theme",
    Once(root) {
      const file = root.source?.input.file ?? "";
      if (SKIP_FILES.test(file)) return;
      const builderOnly = BUILDER_ONLY.test(file);
      const within = builderOnly ? `:where(${BUILDER}) ` : "";
      root.walkRules((rule: Rule) => {
        // Keyframes are named, not selected: their colours would need their own copies.
        let p: AnyNode | undefined = rule.parent;
        while (p) {
          if (p.type === "atrule" && /keyframes$/i.test(p.name)) return;
          p = p.parent;
        }
        // Rules this plugin wrote are not read again.
        if (rule.selectors.every((s) => s.includes(SCOPE))) return;

        const veil = VEIL.test(rule.selector);
        const state = isStateName(rule.selector);
        let lightText = false;
        let inkFill = false;
        rule.each((n) => {
          if (n.type !== "decl") return;
          const prop = n.prop.toLowerCase();
          if (prop === "color" && isLightText(n.value)) lightText = true;
          if ((prop === "background" || prop === "background-color") && INK_FILL.test(n.value.trim())) inkFill = true;
        });

        const out: Array<{ prop: string; value: string; important: boolean }> = [];
        rule.each((n) => {
          if (n.type !== "decl") return;
          const d = n as Declaration;
          const prop = d.prop.toLowerCase();
          // The page's own tokens stay the page's: the builder's dark values for them are written by hand (theme.css).
          if (builderOnly && prop.startsWith("--")) return;
          // White text on a fill made of the ink token: the token goes light, so the text goes dark.
          if (prop === "color" && inkFill && isLightText(d.value)) {
            out.push({ prop: d.prop, value: "#111111", important: d.important });
            return;
          }
          const role = prop.startsWith("--") ? (/#|rgb/.test(d.value) ? roleOfCustom(prop) : null) : roleOf(prop);
          if (!role) return;
          const next = darkValue(role, d.value, { lightText, veil, state: state || (prop.startsWith("--") && isStateName(prop)) });
          if (next !== d.value) out.push({ prop: d.prop, value: next, important: d.important });
        });
        if (!out.length) return;

        const clone = rule.clone({ selector: rule.selectors.map((sel) => scoped(sel, within)).join(", ") });
        clone.removeAll();
        for (const o of out) clone.append({ prop: o.prop, value: o.value, important: o.important });
        // Directly after its source rule, in the same at-rule, so media and container queries carry over.
        rule.after(clone);
      });
    },
  };
}
postcssDark.postcss = true as const;
