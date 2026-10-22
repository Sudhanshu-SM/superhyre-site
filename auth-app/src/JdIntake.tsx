import { ArrowRight, Check, Paperclip, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { specApi, attachmentApi } from "./api/agent";
import { LIVE, messageOf } from "./api/client";
import { jdApi } from "./api/jdIntake";
import { ATTACH_ACCEPT, fileRefusal, isPlainText, typeOf } from "./attachments";
import { companyIn } from "./campaignAsk";
import { ownCampaign, rowFromDraft } from "./campaignDraft";
import { campaignHref } from "./chatCards";
import { addCampaignRow, memberName, resolveCampaignId, saveClient, setCampaignClient, useClients, useTeam } from "./campaignStore";
import { can, standingOf } from "./can";
import { EMPTY_DRAFT, clientFromDraft } from "./clients";
import { Loader } from "./components/Loader";
import {
  type Answers, type Ask, EXPERIENCE_OPTIONS, type JdFacts, NO_CLIENT, asksFor, clientSaid, draftFromIntake, factLine,
  isSheetFile, parseCities, parseComp, parseExperience, problemsOf,
} from "./jdIntake";
import { useSession } from "./roleStore";
import "./jd-intake.css";

/**
 * Add roles from their job descriptions: one pasted or attached, or many at once (files, a spreadsheet, a Google
 * Sheet's link). Each description is read for what it states, and the person is asked only for what it does not, one
 * question at a time with the answers to tap; a role whose description says everything is created without a question.
 * While they answer, the next ones are being read. Each campaign is made as it is finished, and its role spec is
 * drafted in the background, one after another. Nothing is approved and no search starts: that stays on the spec.
 */

type Phase = "waiting" | "reading" | "ready" | "failed" | "creating" | "made" | "skipped";
type Item = {
  id: string;
  label: string;
  jd: string;
  hints: Record<string, string>;
  phase: Phase;
  facts?: JdFacts;
  /** The description as kept: contact details taken out. */
  cleaned?: string;
  error?: string;
  answers: Answers;
  made?: { id: string; name: string };
  spec?: "drafting" | "drafted" | "failed";
  specWhy?: string;
};

/** The most roles in one go: a sheet is cut at fifty and a second sheet adds to it, up to this. */
const MAX_ITEMS = 60;
/** How many descriptions are being read at once: enough that the next is ready by the time a question is answered. */
const READ_AT_ONCE = 2;
const OPEN: readonly Phase[] = ["waiting", "reading", "ready", "failed", "creating"];

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const firstLine = (jd: string) => short(jd.trim().split(/\n/)[0] ?? "Job description");

export function JdIntake({ files, onManual, onClose }: {
  /** Files to read as soon as this opens (a spreadsheet dropped in the chat). */
  files?: readonly File[];
  /** "Fill in the details yourself": the long form, for a role that has no description. */
  onManual?: () => void;
  onClose?: () => void;
}): JSX.Element {
  const session = useSession();
  const { clients } = useClients();
  const team = useTeam();
  const own = standingOf(session) === "recruiter";
  const mayAddClient = can(standingOf(session), "client.manage");
  const me = memberName(session.userId) ?? session.name;
  const owner = own ? me : team.includes(session.name) ? session.name : team[0] ?? session.name;

  const [stage, setStage] = useState<"add" | "queue">("add");
  const [items, setItems] = useState<Item[]>([]);
  const [defaults, setDefaults] = useState<Answers>({});
  const [skipRest, setSkipRest] = useState(false);
  const itemsNow = useRef(items);
  itemsNow.current = items;
  const uid = useRef(0);
  const fresh = () => `r${Date.now().toString(36)}${(uid.current += 1)}`;
  const patch = useCallback((id: string, over: Partial<Item>) => setItems((all) => all.map((i) => (i.id === id ? { ...i, ...over } : i))), []);

  /* ── adding ── */
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const note = (t: string) => setNotes((n) => [...n.filter((x) => x !== t), t].slice(-4));
  const working = <T,>(what: string, run: () => Promise<T>) => {
    setBusy((b) => [...b, what]);
    return run().finally(() => setBusy((b) => b.filter((x, i) => !(x === what && i === b.indexOf(what)))));
  };
  const room = () => MAX_ITEMS - itemsNow.current.length;
  const add = (made: Array<{ label: string; jd: string; hints?: Record<string, string> }>) => {
    const take = made.slice(0, Math.max(0, room()));
    if (made.length > take.length) note(`Up to ${MAX_ITEMS} roles go in at once; the rest were left out.`);
    setItems((all) => [...all, ...take.map((m) => ({ id: fresh(), label: m.label, jd: m.jd, hints: m.hints ?? {}, phase: "waiting" as Phase, answers: {} }))]);
  };
  const addText = () => {
    const t = text.trim();
    if (!t) return;
    if (t.length < 60) { note("That is too short to be a job description."); return; }
    add([{ label: firstLine(t), jd: t }]);
    setText("");
  };
  const addSheet = (name: string, roles: Array<{ title: string | null; jd: string; hints: Record<string, string>; row: number }>, skipped: number) => {
    add(roles.map((r) => ({ label: r.title ? `${r.title}` : `${name}, row ${r.row}`, jd: r.jd, hints: r.hints })));
    if (skipped) note(`${skipped} ${skipped === 1 ? "row" : "rows"} of ${name} had too little to go on and were left out.`);
  };
  const addFiles = useCallback((list: readonly File[]) => {
    for (const f of list) {
      const sheet = isSheetFile(f);
      const why = sheet ? (f.size === 0 ? `${f.name} is empty.` : f.size > 5 * 1024 * 1024 ? `${f.name} is over 5 MB.` : null) : fileRefusal(f);
      if (why) { note(why); continue; }
      void working(f.name, async () => {
        try {
          if (sheet) {
            const type = /\.xlsx$/i.test(f.name) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : /\.tsv$/i.test(f.name) ? "text/tab-separated-values" : "text/csv";
            const r = await jdApi.sheetFile(f, type);
            addSheet(f.name, r.roles, r.skipped);
          } else {
            const body = isPlainText(f) ? (await f.text()).trim().slice(0, 30_000) : (await attachmentApi.read(f, typeOf(f))).text.trim();
            if (body.length < 60) note(`I couldn't read enough text from ${f.name}.`);
            else add([{ label: f.name.replace(/\.[a-z0-9]+$/i, ""), jd: body }]);
          }
        } catch (err) {
          note(`${f.name}: ${messageOf(err)}`);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const addLink = () => {
    const url = link.trim();
    if (!url) return;
    setLink("");
    void working("the Google Sheet", async () => {
      try {
        const r = await jdApi.sheetLink(url);
        addSheet("The Google Sheet", r.roles, r.skipped);
      } catch (err) {
        note(messageOf(err));
      }
    });
  };
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !files?.length || !LIVE) return;
    seeded.current = true;
    addFiles(files);
  }, [files, addFiles]);

  /* ── reading: two at a time, in order, as soon as the queue starts ── */
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (stage !== "queue") return;
    let live = items.filter((i) => i.phase === "reading").length;
    for (const item of items) {
      if (live >= READ_AT_ONCE) break;
      if (item.phase !== "waiting" || started.current.has(item.id)) continue;
      started.current.add(item.id);
      live += 1;
      patch(item.id, { phase: "reading" });
      jdApi.read(item.jd, item.hints).then(
        (r) => patch(item.id, { phase: "ready", facts: r.facts, cleaned: r.jd }),
        (err: unknown) => patch(item.id, { phase: "failed", error: messageOf(err) }),
      );
    }
  }, [stage, items, patch]);

  /* ── the one being worked on ── */
  const current = items.find((i) => OPEN.includes(i.phase));
  const lite = useMemo(() => clients.map((c) => ({ id: c.id, name: c.name, status: c.status })), [clients]);
  const cities = useMemo(
    () => [...new Set(items.flatMap((i) => i.answers.locations ?? i.facts?.locations ?? []))].slice(0, 4),
    [items],
  );
  const asks: Ask[] = current?.phase === "ready" && current.facts && !skipRest
    ? asksFor(current.facts, current.answers, { clients: lite, mayAddClient, defaults, cities })
    : [];
  const ask = asks[0];

  /* ── making it ── */
  const specs = useRef<Promise<void>>(Promise.resolve());
  const making = useRef(new Set<string>());
  const create = useCallback((item: Item) => {
    if (!item.facts || making.current.has(item.id)) return;
    making.current.add(item.id);
    patch(item.id, { phase: "creating" });
    const facts = item.facts;
    const a: Answers = { ...defaults, ...item.answers };
    const said = clientSaid(facts.client, lite);
    let clientId = "";
    if (a.newClient) {
      const there = companyIn(a.newClient, clients);
      clientId = there ? there.id : saveClient(clientFromDraft({ ...EMPTY_DRAFT, name: a.newClient, status: "active", owner }, `cl-${Date.now().toString(36)}`)).id;
    } else if (a.clientId !== undefined) clientId = a.clientId === NO_CLIENT ? "" : a.clientId;
    else if (said.kind === "match") clientId = said.id;
    const draft = draftFromIntake({ facts, jd: item.cleaned ?? item.jd, answers: item.answers, defaults, owner, clientId });
    const final = own ? ownCampaign(draft, me) : draft;
    const problem = problemsOf(final)[0];
    if (problem) {
      making.current.delete(item.id);
      patch(item.id, { phase: "failed", error: problem });
      return;
    }
    const row = rowFromDraft(final, team);
    const saved = addCampaignRow(row);
    if (clientId) setCampaignClient(row.id, clientId);
    void saved.then((ok) => {
      if (!ok) { patch(item.id, { phase: "failed", error: `${final.name} wasn't created.` }); making.current.delete(item.id); return; }
      const real = resolveCampaignId(row.id);
      patch(item.id, { phase: "made", made: { id: real, name: final.name }, spec: "drafting" });
      // The role spec is drafted in the background, one after another, so a batch does not start a dozen readings at once.
      specs.current = specs.current.then(() =>
        specApi.draft(real).then(
          () => patch(item.id, { spec: "drafted" }),
          (err: unknown) => patch(item.id, { spec: "failed", specWhy: messageOf(err) }),
        ).then(() => undefined),
      );
    });
  }, [clients, defaults, lite, me, owner, own, patch, team]);

  /* A role with nothing left to ask is made at once. */
  useEffect(() => {
    if (stage === "queue" && current?.phase === "ready" && !ask) create(current);
  }, [stage, current, ask, create]);

  /* ── answering ── */
  const [typed, setTyped] = useState("");
  const [oops, setOops] = useState<string | null>(null);
  const [forAll, setForAll] = useState(false);
  useEffect(() => { setTyped(""); setOops(null); setForAll(false); }, [ask?.key, current?.id]);
  const others = items.filter((i) => i.id !== current?.id && OPEN.includes(i.phase)).length;

  const give = (over: Answers) => {
    if (!current) return;
    // What was skipped before stays skipped: only the answers named here are replaced.
    patch(current.id, { answers: { ...current.answers, ...over, skipped: [...(current.answers.skipped ?? []), ...(over.skipped ?? [])] } });
    if (forAll && others) setDefaults((d) => ({ ...d, ...over, skipped: [...(d.skipped ?? []), ...(over.skipped ?? [])] }));
  };
  const pick = (a: Ask, optionId: string) => {
    switch (a.key) {
      case "client":
        if (optionId === "new") give({ newClient: clientSaid(current?.facts?.client ?? null, lite).kind === "named" ? (current?.facts?.client as string) : "" });
        else if (optionId === NO_CLIENT) give({ clientId: NO_CLIENT });
        else give({ clientId: optionId.replace(/^client:/, "") });
        return;
      case "workMode": give({ workMode: optionId as "onsite" | "hybrid" | "remote" }); return;
      case "locations": give({ locations: [optionId.replace(/^city:/, "")] }); return;
      case "experience": {
        const e = EXPERIENCE_OPTIONS.find((o) => o.id === optionId);
        if (e) give({ exp: { min: e.min, max: e.max } });
        return;
      }
      case "notice": give({ notice: optionId }); return;
      case "comp": return;
    }
  };
  const submitTyped = (a: Ask) => {
    const t = typed.trim();
    if (!t) return;
    if (a.key === "locations") { const c = parseCities(t); if (c.length) give({ locations: c }); else setOops("Type a city, or more than one with commas."); return; }
    if (a.key === "experience") { const r = parseExperience(t); if (r) give({ exp: r }); else setOops("Try years like 4-7, 5+ or up to 3."); return; }
    if (a.key === "comp") { const r = parseComp(t); if (r) give({ comp: r }); else setOops("Try lakhs like 20-30 or up to 25."); return; }
    if (a.key === "client") {
      const there = companyIn(t, clients);
      if (there) give({ clientId: there.id });
      else if (mayAddClient) give({ newClient: t });
      else setOops("None of your clients is called that.");
    }
  };
  const skip = (a: Ask) => give({ skipped: [a.key] });

  const begin = () => {
    if (text.trim().length >= 60) addText();
    setStage("queue");
  };
  const total = items.length;
  const doneCount = items.filter((i) => i.phase === "made").length;
  const position = current ? items.indexOf(current) + 1 : total;

  if (!LIVE) return <p className="ji-note">Adding roles from job descriptions needs a connected workspace.</p>;

  /* ── the screens ── */
  if (stage === "add") {
    return (
      <div className="ji">
        <p className="ji-lede t-body">
          Add a job description, or many at once. I read each one, use what it says, and ask only for what it leaves out.
        </p>
        <label className="ji-box">
          <span className="ji-l t-label">Paste a job description</span>
          <textarea
            className="ji-area" rows={6} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
            placeholder="Paste the job description here"
          />
        </label>
        <div className="ji-row">
          <button type="button" className="ncx-btn is-sm" onClick={addText} disabled={!text.trim()}>Add this description</button>
          <label className="ncx-btn is-sm ji-file">
            <Paperclip size={14} aria-hidden="true" />
            Attach files or a spreadsheet
            <input
              type="file" multiple accept={`${ATTACH_ACCEPT.replace(",.png,.jpg,.jpeg,.webp", "")},.xlsx,.csv,.tsv`}
              onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }}
            />
          </label>
        </div>
        <form className="ji-link" onSubmit={(e) => { e.preventDefault(); addLink(); }}>
          <label className="ji-l t-label" htmlFor="ji-sheet">Or a Google Sheet</label>
          <div className="ji-row">
            <input
              id="ji-sheet" className="ncx-in is-grow" type="url" value={link} onChange={(e) => setLink(e.target.value)}
              placeholder="docs.google.com/spreadsheets/…" autoComplete="off" spellCheck={false}
            />
            <button type="submit" className="ncx-btn is-sm" disabled={!link.trim()}>Add the sheet</button>
          </div>
          <p className="ji-hint t-caption">Set the sheet to “Anyone with the link can view”. Name a column “Job description” and one “Role”; columns like Client, Location, Experience and CTC are used too.</p>
        </form>

        {busy.length > 0 && <p className="ji-busy t-body-sm" role="status"><Loader size="sm" />Reading {busy.join(", ")}</p>}
        {notes.length > 0 && <ul className="ji-notes" role="status">{notes.map((n) => <li key={n} className="t-body-sm">{n}</li>)}</ul>}
        {items.length > 0 && (
          <ul className="ji-list" aria-label="To read">
            {items.map((i) => (
              <li key={i.id} className="ji-li">
                <span className="ji-li-t t-body">{i.label}</span>
                <button type="button" className="ji-x" aria-label={`Remove ${i.label}`} onClick={() => setItems((all) => all.filter((x) => x.id !== i.id))}><X size={12} weight="bold" /></button>
              </li>
            ))}
          </ul>
        )}

        <footer className="ji-foot">
          {onManual ? <button type="button" className="st-link" onClick={onManual}>Fill in the details yourself</button> : <span />}
          {onClose && <button type="button" className="ncx-btn" onClick={onClose}>Cancel</button>}
          <button type="button" className="ncx-btn is-dark" disabled={!items.length && text.trim().length < 60} onClick={begin}>
            {items.length > 1 ? `Read ${items.length} roles` : "Read it"}<ArrowRight size={14} weight="bold" aria-hidden="true" />
          </button>
        </footer>
      </div>
    );
  }

  const made = items.filter((i) => i.phase === "made");
  return (
    <div className="ji">
      {total > 1 && (
        <div className="ji-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount} aria-label="Roles made">
          <span className="ji-progress-t t-body-sm">{current ? `Role ${position} of ${total}` : `${doneCount} of ${total} made`}</span>
          <span className="ji-bar" aria-hidden="true"><span style={{ width: `${Math.round((doneCount / total) * 100)}%` }} /></span>
        </div>
      )}

      {current && (
        <section className="ji-now" aria-live="polite">
          <h3 className="ji-name t-title">{current.facts?.title ?? current.label}</h3>
          {current.facts && <p className="ji-found t-body-sm">{factLine(current.facts, { ...defaults, ...current.answers })}</p>}

          {(current.phase === "waiting" || current.phase === "reading") && <p className="ji-busy t-body" role="status"><Loader size="sm" />Reading the job description</p>}
          {current.phase === "creating" && <p className="ji-busy t-body" role="status"><Loader size="sm" />Creating the campaign</p>}
          {current.phase === "failed" && (
            <div className="ji-fail">
              <p className="t-body" role="alert">{current.error ?? "That didn't work."}</p>
              <div className="ji-row">
                {!current.facts && <button type="button" className="ncx-btn is-sm" onClick={() => { started.current.delete(current.id); patch(current.id, { phase: "waiting", error: "" }); }}>Try again</button>}
                {current.facts && <button type="button" className="ncx-btn is-sm" onClick={() => { making.current.delete(current.id); create({ ...current, phase: "ready" }); }}>Try again</button>}
                <button type="button" className="ncx-btn is-sm" onClick={() => patch(current.id, { phase: "skipped" })}>Skip this one</button>
              </div>
            </div>
          )}

          {current.phase === "ready" && ask && (
            <div className="ji-ask">
              <p className="ji-q t-body-strong">{ask.text}</p>
              {ask.options.length > 0 && (
                <div className="ji-opts" role="group" aria-label={ask.text}>
                  {ask.options.map((o) => <button key={o.id} type="button" className="ji-opt" onClick={() => pick(ask, o.id)}>{o.label}</button>)}
                </div>
              )}
              {ask.input && (
                <form className="ji-type" onSubmit={(e) => { e.preventDefault(); submitTyped(ask); }}>
                  <input
                    className="ncx-in is-grow" value={typed} onChange={(e) => { setTyped(e.target.value); setOops(null); }}
                    placeholder={ask.input.placeholder} aria-label={ask.input.label} autoComplete="off" spellCheck={false} autoFocus={!ask.options.length}
                  />
                  <button type="submit" className="ncx-btn is-sm" disabled={!typed.trim()}>Use this</button>
                </form>
              )}
              {oops && <p className="ji-oops t-caption" role="alert">{oops}</p>}
              <div className="ji-more">
                <button type="button" className="st-link" onClick={() => skip(ask)}>Skip this</button>
                {others > 0 && (
                  <label className="ji-all t-body-sm">
                    <input type="checkbox" checked={forAll} onChange={(e) => setForAll(e.target.checked)} />
                    Use my answer for the other {others} {others === 1 ? "role" : "roles"} too
                  </label>
                )}
                {others > 0 && <button type="button" className="st-link" onClick={() => setSkipRest(true)}>Make the rest without asking</button>}
              </div>
            </div>
          )}
        </section>
      )}

      {made.length > 0 && (
        <ul className="ji-made" aria-label="Made">
          {made.map((i) => (
            <li key={i.id} className="ji-made-i">
              <Check size={13} weight="bold" aria-hidden="true" />
              <a className="st-link t-body" href={campaignHref(i.made?.id ?? "")}>{i.made?.name}</a>
              <span className="ji-spec t-caption">
                {i.spec === "drafted" ? "Role spec ready to approve" : i.spec === "failed" ? `Role spec not drafted${i.specWhy ? `: ${i.specWhy}` : ""}` : "Drafting the role spec"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!current && (
        <footer className="ji-foot is-done">
          <p className="t-body">
            {doneCount ? `${doneCount} ${doneCount === 1 ? "campaign" : "campaigns"} created.` : "Nothing was created."}{" "}
            {doneCount > 0 && "Each role spec needs your approval before a search starts."}
          </p>
          <div className="ji-row">
            <button type="button" className="ncx-btn" onClick={() => { setItems([]); setStage("add"); setSkipRest(false); setDefaults({}); started.current.clear(); making.current.clear(); }}>Add more roles</button>
            {onClose && <button type="button" className="ncx-btn is-dark" onClick={onClose}>Done</button>}
          </div>
        </footer>
      )}
    </div>
  );
}
