import { AddressBook, CaretDown } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { useMayChangeCampaign } from "./campaignRights";
import { Loader } from "./components/Loader";
import { CopyCell, Popover, useToast } from "./Contacts";
import { errorLine, getContacts, useContacts } from "./contactsFetch";
import { useContactValues } from "./contactValues";
import type { ContactMode, ContactPerson, ContactSide } from "./contactsModel";
import { contactWords, offerFor, planDetail, planFor, planLine, resultLine, sideLine, toastTone, valueCell } from "./contactsModel";
import "./contactsFetch.css";

/**
 * Getting contact details for people on a campaign's board (the words and rules are in contactsModel.ts, the store
 * in contactsFetch.ts). Three places show it and they read the same store: a row of the Shortlisted table
 * (`ContactCell`), a person's sheet and the profile sidebar (`ContactSideLine`), and the table's own menu for
 * the people picked or everyone who has none (`ContactsMenu`).
 */

/** Asks, then says in one line what came of it. */
function useAsk(campaignId: string) {
  const toast = useToast();
  return useCallback(async (ids: readonly string[], mode: ContactMode) => {
    try {
      const result = await getContacts(campaignId, ids, mode);
      const line = resultLine(result);
      toast(line, toastTone(result, line));
    } catch (err) {
      toast(errorLine(err), "error");
    }
  }, [campaignId, toast]);
}

type Reach = { email: boolean; phone: boolean };
const sideOf = (side: ContactSide | undefined, reach: boolean | undefined): ContactSide => side ?? (reach ? "found" : "none");

/* ── one person in the table ─────────────────────────────────────────────── */

export function ContactCell({ campaignId, id, name, reach }: { campaignId: string; id: string; name: string; reach?: Reach | undefined }) {
  const v = useContacts(campaignId);
  const ask = useAsk(campaignId);
  /* A lookup spends the workspace's credits: the campaign's own people ask for it; anyone else sees what is found. */
  const may = useMayChangeCampaign(campaignId);
  const p = v.of(id);
  const busy = v.busy(id);
  const email = sideOf(p?.email, reach?.email);
  const phone = sideOf(p?.phone, reach?.phone);
  // Until the figures arrive the board's own flags say what is on file, and nothing is offered.
  if (!v.ready && email === "none" && phone === "none") return <span className="sl-ct" />;
  const looking = busy !== null || email === "looking" || phone === "looking";
  const words = busy !== null ? "Looking" : contactWords(email, phone, { lookupable: p?.lookupable ?? true, stalled: v.stalled });
  const offer = may ? offerFor(p, v) : { email: false, phone: false, phoneBlocked: null };
  return (
    <div className="sl-ct">
      <span className="sl-ct-state">
        {looking && <Loader size="sm" />}
        <span title={words}>{words}</span>
      </span>
      {(offer.email || offer.phone) && (
        <span className="sl-ct-acts">
          {offer.email && (
            <button
              type="button" className="sl-ct-btn" disabled={v.anyBusy}
              onClick={() => void ask([id], "email")}
              aria-label={`Get email for ${name}`} title="Free"
            >
              {busy === "email" && <Loader size="sm" tone="inherit" />}Get email
            </button>
          )}
          {offer.phone && (
            <button
              type="button" className="sl-ct-btn" disabled={v.anyBusy || offer.phoneBlocked !== null}
              onClick={() => void ask([id], "phone")}
              aria-label={`Get phone number for ${name}`}
              title={offer.phoneBlocked ?? "Uses a credit when a number is found"}
            >
              {busy === "phone" && <Loader size="sm" tone="inherit" />}Get phone
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/* ── one side of one person, in its own column ───────────────────────────── */

/**
 * "Email" or "Phone" in the Shortlisted table: the value itself when it is on file (click to copy), else where
 * the lookup stands in muted words: "Not fetched" with a small "Get" for the campaign's own people, "Looking"
 * while it is being asked for, "Not found" when it missed. The value comes from the workspace's own row, the
 * only place it is kept, and arrives as null for anyone who may not see it.
 */
export function ContactValueCell({ campaignId, id, candidateId, name, kind, reach, value }: {
  campaignId: string;
  /** The campaign candidate id (the board's row). */
  id: string;
  candidateId?: string | undefined;
  name: string;
  kind: "email" | "phone";
  reach?: Reach | undefined;
  /** A value the page already holds (the console's own fixtures). */
  value?: string | null | undefined;
}) {
  const v = useContacts(campaignId);
  const ask = useAsk(campaignId);
  const toast = useToast();
  const { values, ready } = useContactValues(campaignId);
  const may = useMayChangeCampaign(campaignId);
  const p = v.of(id);
  const busy = v.busy(id);
  const side = sideOf(p?.[kind], reach?.[kind]);
  const held = (candidateId ? values.get(candidateId)?.[kind] : null) ?? value ?? null;
  const offer = may ? offerFor(p, v) : { email: false, phone: false, phoneBlocked: null };
  const can = kind === "email" ? offer.email : offer.phone;
  const blocked = kind === "phone" ? offer.phoneBlocked : null;

  const cell = valueCell({
    held, side, busy: busy !== null, known: v.ready || !!reach, valuesReady: ready, lookupable: p?.lookupable ?? true, offered: can,
  });
  if (cell.state === "value") {
    return (
      <span className="cv cv-value">
        <CopyCell kind={kind} value={cell.value} onCopy={(m) => toast(m)} />
      </span>
    );
  }
  if (cell.state === "blank") return <span className="cv" />;
  if (cell.state === "looking") return <span className="cv cv-muted"><Loader size="sm" /><span>{cell.words}</span></span>;
  if (cell.state === "on_file" || cell.state === "not_found") return <span className="cv cv-muted"><span>{cell.words}</span></span>;
  return (
    <span className="cv cv-muted">
      <span>{cell.words}</span>
      {cell.get && (
        <button
          type="button" className="sl-ct-btn cv-get" disabled={v.anyBusy || blocked !== null}
          onClick={() => void ask([id], kind)}
          aria-label={`Get ${kind === "email" ? "email" : "phone number"} for ${name}`}
          title={blocked ?? (kind === "email" ? "Free" : "Uses a credit when a number is found")}
        >
          Get
        </button>
      )}
    </span>
  );
}

/* ── one side of one person, in a sheet ──────────────────────────────────── */

/**
 * "Email" or "Phone" for a person: the value when it is on the page, else where the lookup stands, with the button
 * that starts it. Found by campaign candidate id (the board) or by candidate id (the profile sidebar).
 */
export function ContactSideLine({ campaignId, kind, ccId, candidateId, name, value, reach }: {
  campaignId: string | null | undefined;
  kind: "email" | "phone";
  ccId?: string | undefined;
  candidateId?: string | undefined;
  name: string;
  /** What the page already shows (a value, or "on file"). */
  value?: string | null | undefined;
  reach?: boolean | undefined;
}) {
  const v = useContacts(campaignId);
  const ask = useAsk(campaignId ?? "");
  const may = useMayChangeCampaign(campaignId);
  const p = ccId ? v.of(ccId) : candidateId ? v.ofCandidate(candidateId) : undefined;
  const id = p?.campaignCandidateId ?? ccId ?? "";
  const busy = id ? v.busy(id) : null;
  const side = sideOf(p?.[kind], reach);
  const offer = offerFor(p, v);
  const can = may && (kind === "email" ? offer.email : offer.phone);
  const blocked = kind === "phone" ? offer.phoneBlocked : null;
  const looking = busy !== null || side === "looking";
  const words = value ?? (!campaignId ? "Not on file" : busy !== null ? "Looking" : side === "none" && p && !p.lookupable ? "No profile to look up" : sideLine(kind, side, v.stalled));
  return (
    <span className="cf-side">
      {looking && !value && <Loader size="sm" />}
      <span className="cf-words">{words}</span>
      {can && !value && (
        <button
          type="button" className="sl-ct-btn" disabled={v.anyBusy || blocked !== null}
          onClick={() => void ask([id], kind)}
          aria-label={`Get ${kind === "email" ? "email" : "phone number"} for ${name}`}
          title={blocked ?? (kind === "email" ? "Free" : "Uses a credit when a number is found")}
        >
          {busy === kind && <Loader size="sm" tone="inherit" />}{kind === "email" ? "Get email" : "Get phone"}
        </button>
      )}
    </span>
  );
}

/* ── the table's menu ────────────────────────────────────────────────────── */

const MODES: ReadonlyArray<{ mode: ContactMode; label: string }> = [
  { mode: "email", label: "Email" },
  { mode: "phone", label: "Phone number" },
  { mode: "both", label: "Both" },
];

/**
 * "Get contact details": for the people picked, or for everyone who has none. One small menu, and each choice
 * says how many people it asks about, what it costs and how many credits are left before it is pressed.
 * `everyone` is who the table is showing (every page of it); `picked` are their campaign candidate ids.
 */
export function ContactsMenu({ campaignId, everyone, picked, narrowed = false }: {
  campaignId: string;
  everyone: readonly string[];
  picked: ReadonlySet<string>;
  /** A search or filter is on: "everyone" means everyone shown. */
  narrowed?: boolean;
}) {
  const v = useContacts(campaignId);
  const ask = useAsk(campaignId);
  const may = useMayChangeCampaign(campaignId);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<"picked" | "all" | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  if (!may || !v.ready || v.closed || (!v.available.email && !v.available.phone)) return null;

  const listed = new Set(everyone);
  const inRows = v.people.filter((p) => listed.has(p.campaignCandidateId));
  const mine = v.people.filter((p) => picked.has(p.campaignCandidateId));
  const scope: "picked" | "all" = picked.size > 0 ? chosen ?? "picked" : "all";
  const pool: readonly ContactPerson[] = scope === "picked" ? mine : inRows;
  const rules = { creditsLeft: v.creditsLeft, perRequest: v.perRequest, available: v.available };
  const modes = MODES.filter((m) => m.mode === "both" ? v.available.email && v.available.phone : m.mode === "email" ? v.available.email : v.available.phone);
  const missing = inRows.filter((p) => p.lookupable && (p.email === "none" || p.phone === "none")).length;
  const run = (mode: ContactMode, ids: readonly string[]) => { close(); void ask(ids, mode); };

  return (
    <>
      <button
        ref={ref} type="button" className="sl-btn" disabled={v.anyBusy}
        onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
      >
        {v.anyBusy ? <Loader size="sm" tone="inherit" /> : <AddressBook size={14} />} Get contact details<CaretDown size={11} weight="bold" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} width={330}>
        <div className="sl-menu cf-menu" role="menu">
          {picked.size > 0 ? (
            <div className="cf-scope" role="radiogroup" aria-label="Who to look up">
              {(["picked", "all"] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={scope === s} className={`cf-scope-i${scope === s ? " is-on" : ""}`} onClick={() => setChosen(s)}>
                  {s === "picked" ? `${picked.size} picked` : `${narrowed ? "Everyone shown" : "Everyone"} who has none (${missing})`}
                </button>
              ))}
            </div>
          ) : (
            <p className="sl-menu-h">{narrowed ? "Everyone shown who has none" : "Everyone who has none"} ({missing})</p>
          )}
          {modes.map((m) => {
            const plan = planFor(pool, m.mode, rules);
            const off = plan.ids.length === 0;
            return (
              <button
                key={m.mode} type="button" role="menuitem" className="sl-menu-i cf-item" disabled={off}
                title={planLine(plan, v.creditsLeft)} onClick={() => run(m.mode, plan.ids)}
              >
                <span className="cf-item-t"><span>{m.label}</span><small>{planDetail(plan, v.creditsLeft)}</small></span>
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
}
