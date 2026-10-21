import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CountsCard } from "../agentCards/CountsCard";

const card = {
  kind: "counts" as const,
  key: "counts",
  columns: ["Shortlisted", "Outreach", "Interviewing", "Hired"],
  rows: [
    { id: "a1", name: "Helix DevOps", client: "Helix", cells: [7, 3, 2, 1], extras: [{ name: "Client review", people: 2 }], hiresWanted: 2 },
    { id: "b2", name: "Acme Data", client: null, cells: [4, 0, 1, 0], extras: [] },
  ],
  totals: [11, 3, 3, 1],
};

describe("people on each campaign", () => {
  it("is one table: a row each, the campaign's own stage name under it, and a totals row", () => {
    const html = renderToStaticMarkup(<CountsCard card={card} />);
    expect((html.match(/<tr>/g) ?? []).length).toBe(4);
    expect(html).toContain("Helix DevOps");
    expect(html).toContain("<small>Client review 2</small>");
    // a total for every row and for all
    expect(html).toContain('<td class="ctt-n ctt-total">13</td>');
    expect(html).toContain('<td class="ctt-n ctt-total">18</td>');
    expect(html).toContain("Total");
    expect(html).toContain("All campaigns");
    expect(html).toContain(">11<");
    expect(html).toContain('<th scope="col" class="ctt-n">Shortlisted</th>');
  });

  it("says hires against the target in the Hired cell, the plain number when there is none", () => {
    const html = renderToStaticMarkup(<CountsCard card={card} />);
    expect(html).toContain('<td class="ctt-n">1 of 2</td>');
    // Acme has no target: its Hired stays a plain 0.
    expect(html).toContain('<td class="ctt-n">0</td>');
  });

  it("has no totals row for one campaign, and says so when there are none", () => {
    expect(renderToStaticMarkup(<CountsCard card={{ ...card, rows: [card.rows[0]!] }} />)).not.toContain("All campaigns");
    expect(renderToStaticMarkup(<CountsCard card={{ ...card, rows: [] }} />)).toContain("No campaigns to count yet.");
  });
});

describe("the table's cells", () => {
  it("keep a count on one line, so '2 of 2' never wraps, and leave the name room", () => {
    const css = readFileSync(resolve(__dirname, "..", "agentCards/countsCard.css"), "utf8");
    expect(css).toMatch(/\.ctt \.ctt-n \{[^}]*white-space: nowrap/);
    expect(css).toContain(".ctt th.ctt-name { min-width: 22ch; }");
  });
});
