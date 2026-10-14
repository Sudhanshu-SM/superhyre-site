import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importMessage } from "../api/candidates";
import { holdMs, isLongToast, LONG_HOLD_MS } from "../toast";

/**
 * The CSV result that names the rows left out is one 150-character sentence; as a normal toast it was gone after
 * 1.8 seconds, too short to read. A long sentence is held (and can be closed); short ones keep their glance.
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("how long a toast stays", () => {
  it("keeps a glance for a short confirmation, a little longer for a calm error and for a way back", () => {
    expect(holdMs("Saved", "done")).toBe(1800);
    expect(holdMs("That didn't go through.", "error")).toBe(4200);
    expect(holdMs("Task deleted", "done", { label: "Undo", onClick: () => {} })).toBe(6000);
  });

  it("holds the import result that names the rows left out, long enough to read it", () => {
    const text = importMessage(
      { created: 2, updated: 0, skipped: 1, touched: [], errors: [
        { row: 4, reasons: ["No LinkedIn, email or phone."] },
        { row: 6, reasons: ["Email doesn't look right."] },
        { row: 7, reasons: ["No name."] },
      ] },
      (row) => ({ 4: "X4 Csv Nocontact", 6: "X4 Badmail" })[row],
    );
    expect(text.length).toBeGreaterThan(100);
    expect(isLongToast(text)).toBe(true);
    expect(holdMs(text, "done")).toBeGreaterThanOrEqual(10_000);
    expect(holdMs(text, "done")).toBe(LONG_HOLD_MS);
  });

  it("does not hold a plain 'added' line", () => {
    const text = importMessage({ created: 3, updated: 0, skipped: 0, touched: [], errors: [] });
    expect(isLongToast(text)).toBe(false);
    expect(holdMs(text, "done")).toBe(1800);
  });

  it("gives a long toast a close button, and a fade that does not take a tenth of fifteen seconds each way", () => {
    const toast = src("toast.tsx");
    expect(toast).toMatch(/aria-label="Dismiss"/);
    const css = src("contacts.css");
    expect(css).toMatch(/\.ct-toast\.is-long \{[^}]*animation: ct-toast-long 15000ms/);
    expect(css).toMatch(/@keyframes ct-toast-long \{\s*0% \{[^}]*\}\s*1\.5%, 97% \{ opacity: 1;/);
    expect(css).toMatch(/\.ct-toast, \.ct-toast\.is-long, \.cp \{ animation: none;/);
  });
});
