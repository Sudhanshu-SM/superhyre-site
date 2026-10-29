import { ArrowRight, Check, FileText, UploadSimple, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { specApi, attachmentApi } from "./api/agent";
import { ApiError, LIVE, messageOf } from "./api/client";
import { jdApi, type LeftOut } from "./api/jdIntake";
import { ATTACH_ACCEPT, fileRefusal, isPlainText, typeOf } from "./attachments";
import { companyIn } from "./campaignAsk";
import { ownCampaign, rowFromDraft } from "./campaignDraft";
import { campaignHref } from "./chatCards";
import { addCampaignRow, memberName, resolveCampaignId, saveClient, setCampaignClient, useClients, useTeam } from "./campaignStore";
import { can, standingOf } from "./can";
import { addedAs } from "./ClientPicker";
import { EMPTY_DRAFT, clientFromDraft } from "./clients";
import { Loader } from "./components/Loader";
import {
  type Answers, type Ask, EXPERIENCE_OPTIONS, type JdFacts, asksFor, clientSaid, draftFromIntake, factLine,
  isSheetFile, parseCities, parseComp, parseExperience, problemsOf,
} from "./jdIntake";
import { BatchReview } from "./BatchReview";
import { SheetNeeds } from "./SheetNeeds";
import { useSession } from "./roleStore";
import { type ImportSeed } from "./importFiles";
import "./composer.css";
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
/** Reading a description is safe to repeat, so a busy moment or a slow answer is tried again before anyone is told. */
const READ_WAITS_MS = [3_000, 8_000];
/** A batch this big says what to expect before the first question. */
const BIG_BATCH = 6;

const transient = (err: unknown) => !(err instanceof ApiError) || err.status >= 500 || err.status === 408 || err.code === "timeout";

async function readWithRetry(jd: string, hints: Record<string, string>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await jdApi.read(jd, hints);
    } catch (err) {
      const wait = READ_WAITS_MS[attempt];
      if (wait === undefined || !transient(err)) throw err;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const firstLine = (jd: string) => short(jd.trim().split(/\n/)[0] ?? "Job description");

const WHY: Record<LeftOut["why"], string> = {
  "too-little": "has too little to go on",
  repeat: "repeats an earlier row",
  "over-limit": "is past the first fifty",
  hidden: "is hidden in the sheet",
};

/** What was left out of each sheet and why, by row: "roles.csv: row 3 repeats an earlier row; row 5 has too little to go on." */
export function leftOutLines(rows: ReadonlyArray<LeftOut & { from: string }>): string[] {
  const by = new Map<string, Array<LeftOut>>();
  for (const r of rows) by.set(r.from, [...(by.get(r.from) ?? []), r]);
  return [...by.entries()].map(([from, list]) => {
    const shown = list.slice(0, 5).map((l) => `row ${l.row} ${WHY[l.why]}`);
    const more = list.length > 5 ? `, and ${list.length - 5} more` : "";
    return `${from}: ${shown.join("; ")}${more}.`;
  });
}

function LeftOutNote({ rows }: { rows: ReadonlyArray<LeftOut & { from: string }> }) {
  const lines = leftOutLines(rows);
  if (!lines.length) return null;
  return (
    <div className="ji-left" role="status">
      <p className="ji-left-h t-label">Left out</p>
      <ul>{lines.map((t) => <li key={t} className="t-body-sm">{t}</li>)}</ul>
    </div>
  );
}

type Tab = "upload" | "paste" | "sheet";
const TABS: ReadonlyArray<readonly [Tab, string]> = [["upload", "Upload files"], ["paste", "Paste text"], ["sheet", "Google Sheet"]];

export function JdIntake({ seed, embedded, onManual, onClose, onFinish }: {
  /**
   * What the chat handed over (files, job descriptions already read, a Google Sheet's link): they are read at once and
   * the questions start, with nothing more to press. Without it the person adds them here.
   */
  seed?: ImportSeed | undefined;
  /** Drawn in the chat, which already said what this is: no title of its own. */
  embedded?: boolean;
  /** "Fill in the details yourself": the long form, for a role that has no description. */
  onManual?: () => void;
  onClose?: () => void;
  /**
   * Told how many campaigns the roles have become and how many roles are still to be made, as soon as the first is made (a card drawn
   * again would make it twice) and as more are, and when the card comes to its end: so what the chat handed over is let go, and not read again.
   */
  onFinish?: ((made: number, left: number) => void) | undefined;
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
  const [tab, setTab] = useState<Tab>("upload");
  const [drag, setDrag] = useState(false);
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  /** Rows of sheets that did not become roles, by sheet, with the reason: said under the result as well as while adding. */
  const [leftOut, setLeftOut] = useState<Array<LeftOut & { from: string }>>([]);
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
  const addSheet = (name: string, roles: Array<{ title: string | null; jd: string; hints: Record<string, string>; row: number }>, skipped: number, left: readonly LeftOut[] = []) => {
    add(roles.map((r) => ({ label: r.title ? `${r.title}` : `${name}, row ${r.row}`, jd: r.jd, hints: r.hints })));
    if (left.length) {
      // Kept after the card moves on to reading: what was left out is said where the result is, not only while adding.
      setLeftOut((all) => [...all.filter((l) => l.from !== name), ...left.map((l) => ({ ...l, from: name }))]);
    } else if (skipped) {
      note(`${skipped} ${skipped === 1 ? "row" : "rows"} of ${name} had too little to go on and were left out.`);
    }
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
            addSheet(f.name, r.roles, r.skipped, r.left);
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
  const readLink = (url: string) => {
    void working("the Google Sheet", async () => {
      try {
        const r = await jdApi.sheetLink(url);
        addSheet("The Google Sheet", r.roles, r.skipped, r.left);
      } catch (err) {
        // Back on the sheet's own tab with the link still there and what a sheet needs in view: fixing it is one step.
        setTab("sheet");
        setLink(url);
        note(messageOf(err));
      }
    });
  };
  const addLink = () => {
    const url = link.trim();
    if (!url) return;
    setLink("");
    readLink(url);
  };
  /* Handed over by the chat: read at once, then on to the questions as soon as everything is in. */
  const seeded = useRef(false);
  const autoStart = useRef(!!seed && (seed.files.length + seed.texts.length + seed.links.length) > 0);
  useEffect(() => {
    if (seeded.current || !seed || !LIVE) return;
    seeded.current = true;
    if (seed.texts.length) add(seed.texts);
    if (seed.files.length) addFiles(seed.files);
    for (const url of seed.links) readLink(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, addFiles]);
  useEffect(() => {
    if (stage === "add" && autoStart.current && items.length > 0 && busy.length === 0) {
      autoStart.current = false;
      setStage("queue");
    }
  }, [stage, items.length, busy.length]);

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
      readWithRetry(item.jd, item.hints).then(
        (r) => patch(item.id, { phase: "ready", facts: r.facts, cleaned: r.jd }),
        (err: unknown) => patch(item.id, { phase: "failed", error: messageOf(err) }),
      );
    }
  }, [stage, items, patch]);

  /* ── the one being worked on ── */
  /* One that failed steps aside: the rest go on, and it comes back at the end to try again or skip. */
  const current = items.find((i) => OPEN.includes(i.phase) && i.phase !== "failed") ?? items.find((i) => i.phase === "failed");
  const aside = items.filter((i) => i.phase === "failed" && i !== current).length;
  const unread = items.filter((i) => i.phase === "waiting" || i.phase === "reading").length;
  const lite = useMemo(() => clients.map((c) => ({ id: c.id, name: c.name, status: c.status })), [clients]);
  const cities = useMemo(
    () => [...new Set(items.flatMap((i) => i.answers.locations ?? i.facts?.locations ?? []))].slice(0, 4),
    [items],
  );
  /* "Make the rest without asking" leaves the client, which every campaign has, still to be asked. */
  const asks: Ask[] = current?.phase === "ready" && current.facts
    ? asksFor(current.facts, current.answers, { clients: lite, defaults, cities }).filter((a) => a.required || !skipRest)
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
    /* A company that is not a client yet: an admin adds it now, with its name alone; anyone else names it with the campaign and the server adds it. */
    let newClient = "";
    if (a.newClient) {
      const there = companyIn(a.newClient, clients);
      if (there) clientId = there.id;
      else if (mayAddClient) clientId = saveClient(clientFromDraft({ ...EMPTY_DRAFT, name: a.newClient, status: "active", owner }, `cl-${Date.now().toString(36)}`)).id;
      else newClient = a.newClient;
    } else if (a.clientId !== undefined) clientId = a.clientId;
    else if (said.kind === "match") clientId = said.id;
    const draft = draftFromIntake({ facts, jd: item.cleaned ?? item.jd, answers: item.answers, defaults, owner, clientId, newClient });
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
      const made = addedAs(t, clients);
      if (made.kind === "problem") setOops(made.text);
      else if (made.kind === "pick") give({ clientId: made.id });
      else give({ newClient: made.name });
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

  /* A campaign made, or nothing left to do: what the chat handed over is not to be read again (it would make the campaigns twice). */
  const ended = stage === "queue" && total > 0 && !current;
  const toMake = items.filter((i) => OPEN.includes(i.phase)).length;
  useEffect(() => {
    if (doneCount > 0 || ended) onFinish?.(doneCount, toMake);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneCount, ended, toMake]);

  if (!LIVE) return <p className="ji-note">Adding roles from job descriptions needs a connected workspace.</p>;

  /* ── the screens ── */
  const shell = embedded ? "ji" : "jd ji";
  const title = embedded ? null : (
    <header className="jd-top">
      <h2>New campaign</h2>
      <p>{stage === "add"
        ? "Add one job description or several. I read each one, use what it says, and ask only for what it leaves out."
        : "I read each one and ask only for what it leaves out."}</p>
    </header>
  );

  if (stage === "add") {
    const n = items.length;
    return (
      <div className={shell}>
        {title}
        <div className="jd-tabs" role="tablist" aria-label="How to add">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`jd-tab${tab === id ? " is-on" : ""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === "upload" && (
          <label
            className={`jd-drop${drag ? " is-drag" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles([...e.dataTransfer.files]); }}
          >
            <input
              type="file" multiple accept={`${ATTACH_ACCEPT.replace(",.png,.jpg,.jpeg,.webp", "")},.xlsx,.csv,.tsv`}
              onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }}
            />
            <span className="jd-drop-ico"><UploadSimple size={22} weight="bold" aria-hidden="true" /></span>
            <b>{drag ? "Drop them here" : "Drop job descriptions here, or browse"}</b>
            <small>PDF, Word, text, Excel or CSV · pick several at once</small>
          </label>
        )}

        {tab === "paste" && (
          <>
            <textarea
              id="ji-paste" className="jd-paste" rows={7} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
              placeholder="Paste the job description…" aria-label="Job description"
            />
            <div className="ji-row">
              <button type="button" className="src-btn is-quiet mo-small" onClick={addText} disabled={!text.trim()}>Add this description</button>
              <span className="ji-hint t-caption">Add another after it, or read just this one.</span>
            </div>
          </>
        )}

        {tab === "sheet" && (
          <form className="ji-link" onSubmit={(e) => { e.preventDefault(); addLink(); }}>
            <div className="ji-row is-nowrap">
              <input
                id="ji-sheet" className="jd-paste ji-input" type="url" value={link} onChange={(e) => setLink(e.target.value)}
                placeholder="docs.google.com/spreadsheets/…" autoComplete="off" spellCheck={false} aria-label="Google Sheet link"
              />
              <button type="submit" className="src-btn is-quiet mo-small" disabled={!link.trim()}>Add the sheet</button>
            </div>
            <SheetNeeds />
          </form>
        )}

        {busy.length > 0 && <p className="ji-busy t-body-sm" role="status"><Loader size="sm" />Reading {busy.join(", ")}</p>}
        {notes.length > 0 && <ul className="ji-notes" role="status">{notes.map((t) => <li key={t} className="t-body-sm">{t}</li>)}</ul>}
        <LeftOutNote rows={leftOut} />

        {n > 0 && (
          <ul className="ji-list" aria-label="To read">
            {items.map((i) => (
              <li key={i.id} className="ji-li">
                <FileText size={16} aria-hidden="true" />
                <span className="ji-li-t">{i.label}</span>
                <button type="button" className="jd-x" aria-label={`Remove ${i.label}`} onClick={() => setItems((all) => all.filter((x) => x.id !== i.id))}><X size={13} weight="bold" /></button>
              </li>
            ))}
          </ul>
        )}

        <footer className="jd-foot">
          {onManual ? <button type="button" className="cn-link" onClick={onManual}>Fill in the details yourself</button> : null}
          <span className="sp" />
          {onClose && <button type="button" className="src-btn is-quiet mo-small" onClick={onClose}>Cancel</button>}
          <button type="button" className="src-btn is-primary mo-small" disabled={!n && text.trim().length < 60} onClick={begin}>
            {n > 1 ? `Read ${n} roles` : "Read it"}<ArrowRight size={13} weight="bold" aria-hidden="true" />
          </button>
        </footer>
      </div>
    );
  }

  const made = items.filter((i) => i.phase === "made");
  return (
    <div className={shell}>
      {title}
      {total > 1 && (
        <div className="ji-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount} aria-label="Roles made">
          <span className="ji-progress-t t-body-sm">{current ? `Role ${position} of ${total}` : `${doneCount} of ${total} made`}</span>
          <span className="ji-bar" aria-hidden="true"><span style={{ width: `${Math.round((doneCount / total) * 100)}%` }} /></span>
        </div>
      )}

      {current && (
        <section className="ji-now" aria-live="polite">
          <h3 className="ji-name">{current.facts?.title ?? current.label}</h3>
          {current.facts && <p className="ji-found t-body-sm">{factLine(current.facts, { ...defaults, ...current.answers })}</p>}

          {(current.phase === "waiting" || current.phase === "reading") && <p className="ji-busy t-body" role="status"><Loader size="sm" />Reading the job description</p>}
          {/* Only while the first role is being read: said alongside a question it moves the question when the last read lands. */}
          {(current.phase === "waiting" || current.phase === "reading") && unread > 0 && items.length >= BIG_BATCH && (
            <p className="ji-aside t-caption">{items.length} roles: I read two at a time, so the first questions come quickly and the rest are read while you answer.</p>
          )}
          {aside > 0 && (
            <p className="ji-aside t-caption">{aside} {aside === 1 ? "role" : "roles"} couldn't be read. I'll come back to {aside === 1 ? "it" : "them"} at the end.</p>
          )}
          {current.phase === "creating" && <p className="ji-busy t-body" role="status"><Loader size="sm" />Creating the campaign</p>}
          {current.phase === "failed" && (
            <div className="ji-fail">
              <p className="t-body" role="alert">{current.error ?? "That didn't work."}</p>
              <div className="ji-row">
                {!current.facts && <button type="button" className="src-btn is-quiet mo-small" onClick={() => { started.current.delete(current.id); patch(current.id, { phase: "waiting", error: "" }); }}>Try again</button>}
                {current.facts && <button type="button" className="src-btn is-quiet mo-small" onClick={() => { making.current.delete(current.id); create({ ...current, phase: "ready" }); }}>Try again</button>}
                <button type="button" className="src-btn is-quiet mo-small" onClick={() => patch(current.id, { phase: "skipped" })}>Skip this one</button>
              </div>
            </div>
          )}

          {current.phase === "ready" && ask && (
            <div className="ji-ask">
              <p className="ji-q">{ask.text}</p>
              {ask.options.length > 0 && (
                <div className="ji-opts" role="group" aria-label={ask.text}>
                  {ask.options.map((o) => <button key={o.id} type="button" className="ji-opt" onClick={() => pick(ask, o.id)}>{o.label}</button>)}
                </div>
              )}
              {ask.input && (
                <form className="ji-type" onSubmit={(e) => { e.preventDefault(); submitTyped(ask); }}>
                  <input
                    className="jd-paste ji-input" value={typed} onChange={(e) => { setTyped(e.target.value); setOops(null); }}
                    placeholder={ask.input.placeholder} aria-label={ask.input.label} autoComplete="off" spellCheck={false} autoFocus={!ask.options.length}
                  />
                  <button type="submit" className="src-btn is-quiet mo-small" disabled={!typed.trim()}>Use this</button>
                </form>
              )}
              {oops && <p className="ji-oops t-caption" role="alert">{oops}</p>}
              <div className="ji-more">
                {!ask.required && <button type="button" className="cn-link" onClick={() => skip(ask)}>Skip this</button>}
                {others > 0 && (
                  <label className="ji-all t-body-sm">
                    <input type="checkbox" checked={forAll} onChange={(e) => setForAll(e.target.checked)} />
                    Use my answer for the other {others} {others === 1 ? "role" : "roles"} too
                  </label>
                )}
                {others > 0 && <button type="button" className="cn-link" onClick={() => setSkipRest(true)}>Make the rest without asking</button>}
              </div>
            </div>
          )}
        </section>
      )}

      {made.length > 0 && current && (
        <ul className="ji-made" aria-label="Made">
          {made.map((i) => (
            <li key={i.id} className="ji-made-i">
              <Check size={13} weight="bold" aria-hidden="true" />
              <a className="cn-link" href={campaignHref(i.made?.id ?? "")}>{i.made?.name}</a>
              <span className="ji-spec t-caption">
                {i.spec === "drafted" ? "Requirements ready to approve" : i.spec === "failed" ? `Requirements not drafted${i.specWhy ? `: ${i.specWhy}` : ""}` : "Drafting the requirements"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* All made: each role spec in turn, to approve and start finding people, and where each role stands. */}
      {made.length > 0 && !current && (
        <BatchReview roles={made.map((i) => ({ id: i.made?.id ?? "", name: i.made?.name ?? i.label, spec: i.spec, specWhy: i.specWhy }))} />
      )}

      <LeftOutNote rows={leftOut} />

      {!current && (
        <footer className="jd-foot is-done">
          <p className="ji-done t-body">
            {doneCount ? `${doneCount} ${doneCount === 1 ? "campaign" : "campaigns"} created. Approve ${doneCount === 1 ? "its" : "their"} requirements to start finding people.` : "Nothing was created."}
          </p>
          <span className="sp" />
          <button type="button" className="src-btn is-quiet mo-small" onClick={() => { setItems([]); setStage("add"); setSkipRest(false); setDefaults({}); started.current.clear(); making.current.clear(); }}>Add more roles</button>
          {onClose && <button type="button" className="src-btn is-primary mo-small" onClick={onClose}>Done</button>}
        </footer>
      )}
    </div>
  );
}
