import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import * as campaignsApi from "./api/campaigns";
import { campaignHref } from "./chatCards";
import { DraftingSpec } from "./liveViews/DraftSpec";

/**
 * Roles just made, taken one by one. The role spec is the one decision that matters (it is what people are scored
 * on), so each is shown in turn with its own "Approve and find people"; approving starts that search in the
 * background and the next role is a press away, with nothing to wait for. Under it, one line per role says where it
 * stands, from the server: waiting for approval, searching (with how many found so far), or done. A conversation about
 * one role is "Open in agent" on it, not a chat per role and not several live searches in one thread.
 */

export type BatchRole = { id: string; name: string; spec?: "drafting" | "drafted" | "failed" | undefined; specWhy?: string | undefined };

type Standing = { approved: boolean; searching: boolean; found: number | null };
const POLL_MS = 6_000;

/** Where each role's search stands, read again every few seconds while the batch is on screen. */
export function useBatchStanding(ids: readonly string[]): Readonly<Record<string, Standing>> {
  const [standing, setStanding] = useState<Record<string, Standing>>({});
  const key = ids.join(",");
  useEffect(() => {
    let live = true;
    const read = () => {
      for (const id of key ? key.split(",") : []) {
        campaignsApi.campaignAgents(id).then(
          (a) => {
            if (!live) return;
            setStanding((s) => ({
              ...s,
              [id]: { approved: a.approvedSpec, searching: a.sourcing.state === "working", found: a.sourcing.run?.found ?? null },
            }));
          },
          () => undefined,
        );
      }
    };
    read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [key]);
  return standing;
}

/** What a role's line says. */
export function standingWords(role: BatchRole, s: Standing | undefined): string {
  if (role.spec === "failed") return "Requirements not drafted";
  if (role.spec === "drafting" && !s?.approved) return "Drafting the requirements";
  if (!s) return "Checking";
  if (!s.approved) return "Needs your approval";
  if (s.searching) return s.found != null ? `Searching, ${s.found} found so far` : "Searching";
  return s.found != null ? `${s.found} found` : "Approved";
}

export function BatchReview({ roles }: { roles: readonly BatchRole[] }): JSX.Element | null {
  const standing = useBatchStanding(roles.map((r) => r.id));
  const [at, setAt] = useState(0);
  const role = roles[Math.min(at, roles.length - 1)];
  if (!role) return null;
  const many = roles.length > 1;
  const waiting = roles.filter((r) => standing[r.id] && !standing[r.id]?.approved).length;
  return (
    <div className="bv">
      {many && (
        <p className="bv-pos t-body-sm" aria-live="polite">Requirements for role {at + 1} of {roles.length}{waiting ? ` · ${waiting} need${waiting === 1 ? "s" : ""} approval` : ""}</p>
      )}

      <DraftingSpec key={role.id} campaignId={role.id} name={role.name} drafting={role.spec === "drafting"} trouble={role.spec === "failed" ? role.specWhy ?? "The requirements didn't come through this time." : null} />

      {/* Under the card, where its end is: the card grows once a search finds people, and the way on must not scroll away. */}
      {many && (
        <div className="bv-nav">
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => setAt((i) => Math.max(0, i - 1))} disabled={at === 0}>
            <ArrowLeft size={13} weight="bold" aria-hidden="true" />Previous
          </button>
          <button type="button" className="src-btn is-primary mo-small" onClick={() => setAt((i) => Math.min(roles.length - 1, i + 1))} disabled={at >= roles.length - 1}>
            Next role<ArrowRight size={13} weight="bold" aria-hidden="true" />
          </button>
        </div>
      )}

      {many && (
        <ul className="bv-list" aria-label="Where each role stands">
          {roles.map((r, i) => (
            <li key={r.id} className={`bv-row${i === at ? " is-here" : ""}`}>
              <button type="button" className="bv-name" onClick={() => setAt(i)} aria-current={i === at}>{r.name}</button>
              <span className="bv-state t-body-sm">{standingWords(r, standing[r.id])}</span>
              <a className="cn-link t-body-sm" href={campaignHref(r.id)}>Open</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
