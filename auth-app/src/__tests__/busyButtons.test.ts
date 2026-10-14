import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A button that is working shows the loader (the mark in its ring) beside its label, the same one everywhere.
 * "Saving" as bare text was how the console looked half-finished under a slow link. This reads the console's
 * source for a busy label written as a plain string in a ternary, and names the few that are allowed to be.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "__tests__" || f === "assets" ? [] : files(p);
    return /\.tsx$/.test(f) ? [p] : [];
  });
}

/** `busy ? "Saving"`, `phase === "starting" ? "Starting…"`, `signingOut ? "Signing out"`: a busy flag, then a bare string. */
const BUSY_WORD = "(?:busy|saving|working|pending|deciding|adding|sending|creating|importing|publishing|signingOut|copying|joining|writing|checking)";
const BARE_BUSY_LABEL = new RegExp(
  `(?:\\b${BUSY_WORD}[\\w.]*|[\\w.]+\\s*===\\s*"(?:starting|approving|checking|saving|loading|busy|working|adding|sending|creating|importing|publishing|signing)")\\s*\\?\\s*(["\`])((?:(?!\\1).)+)\\1\\s*:`,
  "g",
);

/** Where a bare label is the right thing, and why. */
const ALLOWED: Record<string, string> = {
  "agentCards/": "the agent's cards are the agent's own surface, with their own pending states",
  "ui.tsx": "ActionButton draws its ring on the line above the label",
  "DialerPage.tsx": "not routed (a placeholder page for a table that is not built)",
  "setup/": "the set-up is its own canvas and its own look, not the console's",
  "components/GoogleButton.tsx": "the sign-in's button: its ring sits beside the label in the line above",
};

describe("a busy button", () => {
  it("shows the loader beside its label wherever the console writes one", () => {
    const bare: string[] = [];
    for (const file of files(SRC)) {
      const name = relative(SRC, file);
      if (Object.keys(ALLOWED).some((k) => name === k || (k.endsWith("/") && name.startsWith(k)))) continue;
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(BARE_BUSY_LABEL)) {
        const label = m[2]!;
        // A line that says where a record stands ("Sending now" under a name) is a status, not a button.
        if (/\.status\b/.test(m[0])) continue;
        // A sentence or a value (a count, a time) is not a button label.
        if (!/^[A-Z][A-Za-z ]{2,28}…?$/.test(label)) continue;
        const line = text.slice(0, m.index).split("\n").length;
        bare.push(`${name}:${line} ${JSON.stringify(label)}`);
      }
    }
    expect(bare, `Put <Loader size="sm" tone="inherit" /> beside the label:\n${bare.join("\n")}`).toEqual([]);
  });

  it("is checked against something real: the pattern finds a bare label and passes a ringed one", () => {
    const find = (src: string) => [...src.matchAll(BARE_BUSY_LABEL)].map((m) => m[2]);
    expect(find('{busy ? "Saving" : "Save"}')).toEqual(["Saving"]);
    expect(find('{phase === "starting" ? "Starting…" : "Start"}')).toEqual(["Starting…"]);
    expect(find('{busy ? <><Loader size="sm" tone="inherit" />Saving</> : "Save"}')).toEqual([]);
  });
});
