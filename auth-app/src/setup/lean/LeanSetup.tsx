import { ArrowRight, Check } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Loader } from "../../components/Loader";
import { readable } from "../../api/identity";
import type { Invitation, OrgMatch } from "../../api/onboarding";
import { art, STAR_PATH, useArtReady, warm } from "./art";
import { flight } from "./flight";
import { LogoAsk } from "./LogoAsk";
import { PowerList } from "./PowerList";
import { InvitationScreen, RequestSentScreen, TeamMatchScreen } from "./SideScreens";
import { type ProgressRow, type RowStatus, SetupProgress } from "./SetupProgress";
import { type Draft, Stage } from "./Stage";
import {
  type Answers,
  AWAKE,
  type Beat,
  beatsFor,
  CHAPTER_OF,
  CHAPTERS,
  type Chapter,
  checkJd,
  companyProblem,
  createLabel,
  EMPTY,
  firstBeatOf,
  firstName,
  fromSaved,
  isBareUrl,
  JD_MAX,
  jdTryable,
  nameProblem,
  nextBeat,
  organisationOf,
  parseRole,
  POWERS,
  progressOf,
  readyWords,
  roleProblem,
  ROLE_SUGGESTIONS,
  roleText,
  type Saved,
  settle,
  teamWords,
  toSaved,
  validCompany,
  validName,
  type Words,
  words,
} from "./steps";
import { afterNo, clashView, type TeamApi, type TeamContext, teamPersonal, useTeam } from "./Team";
import { AreaInput, Head, headMs, LineInput, Options, Quiet, TextAction } from "./Voice";
import "./lean.css";
import "./parts.css";

/**
 * The set-up. The whole screen is the canvas: Mind asks one thing at a time, typed straight onto the
 * left of it, and the answer is a line with a cursor; the story plays on the right. She touches the
 * star and wakes Mind, then her pad fills as the person answers (their name, their team if they have
 * one, the first role, its description, who it is for), the six powers are listed, and the campaign
 * starts.
 *
 * Everyone starts in Personal, which is theirs alone; nothing is named. "Your team" is the one
 * question that depends on who the person is (see Team.tsx).
 *
 * `preview` runs it alone with a small bar to jump about; it saves nothing. The live flow passes the
 * account and the team's server calls, and does the saving at each answer.
 */
export type Finished = {
  hash: string;
  conversationId: string | null;
  /** The organisation the set-up made, which holds the first campaign; null when it is in Personal. */
  organisationId: string | null;
};

export type Props = {
  mode?: "preview" | "live";
  /** What the account already knows: offered as the name, and what decides the team question. */
  account?: { name: string; team: TeamContext };
  /** What the server kept from an earlier visit (live): where to pick up, and the answers so far. */
  resume?: unknown;
  /** Keeps the answers as they are given (live). Never holds the screen up. */
  onSave?: (saved: Saved) => void;
  /** Makes the first campaign (and the organisation, if one was chosen) and starts the first search (live). */
  onFinish?: (answers: Answers) => Promise<Finished>;
  /** She has gone through the door: open the console (live). */
  onComplete?: (done: Finished) => void;
  /** The team question's server calls (live). */
  team?: TeamApi;
  onSignOut?: () => void;
};

const CRITICAL = ["scenery/field-1", "scenery/hill-far", "scenery/hill-mid", "scenery/hill-near", "star-dial/star", "effects/glow", "hero/hero-idle", "props/sun", "props/cloud"];
const REST = [
  ...["tap", "watch", "tablet", "tablet-b2", "tablet-b3", "tablet-b4", "tablet-eyes-2", "tablet-eyes-3", "laptop-sit", "door", "rise"].map((p) => `hero/hero-${p}`),
  ...[1, 2, 3, 4].map((n) => `sprites/sprite-star-pulse-${n}`),
  ...[2, 3, 4].map((n) => `scenery/field-${n}`),
  "star-dial/dial-0",
  "props/leaf-l",
  "props/leaf-m",
  ...POWERS.map((p) => `powers/power-${p.id}-lit`),
  ...[1, 2, 3].map((n) => `star-dial/ripple-${n}`),
];

/** Sample answers so the preview can land on any beat with a believable story behind it. */
const SAMPLE: Partial<Answers> = {
  name: "Arnab Jay",
  team: { kind: "create", name: "Northstar Talent" },
  role: { kind: "title", title: "Senior Backend Engineer" },
  jd: "We're hiring a Senior Backend Engineer to own our Node.js services and mentor two engineers. 5+ years, remote in India.",
  forClient: true,
  client: "Acme",
};

const JUMPS: { id: Beat; label: string }[] = [
  { id: "name", label: "1 · Name" },
  { id: "team", label: "2 · Your team" },
  { id: "role", label: "3 · First role" },
  { id: "jd", label: "4 · Job description" },
  { id: "client", label: "5 · Who it's for" },
  { id: "powers", label: "6 · Powers" },
  { id: "finish", label: "7 · Making it" },
];

function landing(known: Partial<Answers>): { beat: Beat; answers: Answers } {
  const base: Answers = { ...EMPTY, ...known };
  const want = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("step");
  const beat = JUMPS.find((j) => j.id === want)?.id;
  return beat && beat !== "name" ? jump(base, beat) : { beat: "name", answers: base };
}

/** Lands on a beat with every answer before it filled in from the sample, so its words and scene make sense. */
function jump(known: Answers, beat: Beat): { beat: Beat; answers: Answers } {
  const merged = settle({ ...known, ...SAMPLE });
  const beats = beatsFor(merged);
  const at = beats.indexOf(beat);
  const cleared: Answers = { ...merged };
  // Answers for this beat onward are not given yet.
  if (at <= beats.indexOf("name")) cleared.name = "";
  if (at <= beats.indexOf("team")) cleared.team = null;
  if (at <= beats.indexOf("role")) cleared.role = null;
  if (at <= beats.indexOf("jd")) cleared.jd = null;
  if (at <= beats.indexOf("client")) {
    cleared.forClient = null;
    cleared.client = null;
  }
  return { beat, answers: cleared };
}

/* ── the preview's stand-in for the server: `?team=work|domain|request|invited|personal|sent` ── */

type TeamVariant = "work" | "domain" | "request" | "invited" | "personal" | "sent";
const VARIANTS: readonly TeamVariant[] = ["work", "domain", "request", "invited", "personal", "sent"];
const NORTHSTAR: OrgMatch = { id: "preview", name: "Northstar Talent", joinMode: "direct" };
const INVITE: Invitation = { id: "inv", organisationName: "Northstar Talent", inviterName: "Asha Rao", role: "recruiter", createdAt: "2026-10-11T00:00:00Z", expiresAt: "2026-10-18T00:00:00Z" };
const later = <T,>(v: T) => new Promise<T>((r) => window.setTimeout(() => r(v), 500));

function previewTeam(variant: TeamVariant, onJoined: () => void): { ctx: TeamContext; api: TeamApi } {
  const personalEmail = variant === "personal";
  return {
    ctx: { personalEmail, domain: personalEmail ? null : "northstartalent.com", pending: variant === "sent" ? "Northstar Talent" : null },
    api: {
      invitations: async () => (variant === "invited" ? [INVITE] : []),
      byDomain: async () => (variant === "domain" ? NORTHSTAR : variant === "request" ? { ...NORTHSTAR, joinMode: "request" as const } : null),
      lookup: (name: string) => later(/northstar/i.test(name) ? { ...NORTHSTAR, joinMode: "request" as const } : null),
      accept: () => later(undefined),
      join: (_id: string) => later(variant === "request" || variant === "personal" ? ("requested" as const) : ("joined" as const)),
      joined: onJoined,
    },
  };
}

const variantOf = (): TeamVariant => {
  const v = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("team");
  return VARIANTS.find((x) => x === v) ?? "work";
};

export function LeanSetup({ mode = "preview", account, resume, onSave, onFinish, onComplete, team: liveTeam, onSignOut }: Props): JSX.Element {
  const systemReduce = useReducedMotion() ?? false;
  const [forceReduce, setForceReduce] = useState(false);
  const reduce = systemReduce || forceReduce;
  const known: Partial<Answers> = { name: account?.name ?? "" };
  const [init] = useState(() => {
    if (mode === "preview") return { ...landing(known), opened: false };
    const kept = fromSaved(resume);
    if (kept) return kept;
    return { beat: "name" as Beat, answers: { ...EMPTY, ...known }, opened: false };
  });

  const [beat, setBeat] = useState<Beat>(init.beat);
  const [answers, setAnswers] = useState<Answers>(init.answers);
  const [draft, setDraft] = useState<Draft>({});
  const [awaken, setAwaken] = useState(false);
  /** The opening has played (or this is a return visit): it is only ever shown once. */
  const [opened, setOpened] = useState(init.opened);
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ended, setEnded] = useState(false);
  const ready = useArtReady(CRITICAL);

  // The team question's server calls: the real ones live, a stand-in in the preview.
  const stand = useMemo(() => (mode === "preview" ? previewTeam(variantOf(), () => { flight.ready(); setEnded(true); }) : null), [mode]);
  const api = mode === "live" ? liveTeam : stand?.api;
  const ctx = useMemo<TeamContext>(() => (mode === "live" ? (account?.team ?? { personalEmail: false, domain: null, pending: null }) : (stand?.ctx as TeamContext)), [mode, account?.team, stand]);
  const team = useTeam(ctx, api, answers, beat === "team");
  const domainName = useMemo(() => (team.view.v === "create" ? team.view.name : ""), [team.view]);

  useEffect(() => {
    if (ready) warm(REST);
  }, [ready]);

  const finish = useFinishRows(beat === "finish", reduce, answers, mode === "live" ? onFinish : undefined);

  const go = useCallback((to: Beat) => {
    setDraft({});
    setAsking(false);
    setBeat(to);
  }, []);

  /* The server says the organisation about to be made is already there (someone made it a moment ago, or the
     lookup before it could not be made). That is not an error to read out: ask for it by name and show that one,
     to join or to ask to join, on the same screen as any other match. */
  const [clash, setClash] = useState<ReturnType<typeof clashView>>(null);
  const clashName = organisationOf(answers);
  useEffect(() => {
    if (!finish.exists || !api?.lookup || !clashName) return;
    let live = true;
    api.lookup(clashName).then(
      (m) => {
        const view = clashView(m, clashName);
        if (!live || !view) return;
        setAnswers((a) => ({ ...a, team: null }));
        setClash(view);
        go("team");
      },
      () => {},
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish.exists]);
  useEffect(() => {
    if (beat !== "team" || !clash) return;
    team.show(clash);
    setClash(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, clash]);

  /** Records an answer and moves on. The name is followed by the story of waking Mind first. */
  const give = (patch: Partial<Answers>) => {
    const a = settle({ ...answers, ...patch });
    setAnswers(a);
    setDraft({});
    const to = nextBeat(beat, a);
    onSave?.(toSaved(to, a, true));
    if (beat === "name" && !opened) {
      setOpened(true);
      setAwaken(true);
    } else go(to);
  };

  const awakened = () => {
    setAwaken(false);
    go(nextBeat("name", answers));
  };

  const beats = beatsFor(answers);
  const prev = beats[beats.indexOf(beat) - 1];
  const chapterTarget = (c: Chapter, at: Chapter): Beat | null => (CHAPTERS.findIndex((x) => x.id === c) < CHAPTERS.findIndex((x) => x.id === at) && c !== "powers" ? firstBeatOf(c) : null);

  const complete = () => {
    const done = () => (onComplete ? onComplete(finish.result ?? { hash: "#/", conversationId: null, organisationId: null }) : setEnded(true));
    // A new organisation opens with the same arrival as joining one: the scene is the way out, so the door's
    // own exit is not played under it.
    if (onComplete && answers.team?.kind === "create") {
      flight.begin({ kind: "create", org: organisationOf(answers) ?? "your organisation", person: validName(answers.name) ?? account?.name });
      return done();
    }
    if (reduce) return done();
    setLeaving(true);
    window.setTimeout(done, 1100);
  };

  /* The browser's Back button moves back a step, as the page's own Back does, and leaves the app only from
     the first step (or while the opening plays, which has no step to go back to). One entry is kept ahead of
     the page: Back lands on it, and it is put back once the step has moved. */
  const here = useRef({ beat, prev, awaken, leaving });
  here.current = { beat, prev, awaken, leaving };
  useEffect(() => {
    if (mode !== "live") return;
    const guard = { lean: true };
    window.history.pushState(guard, "");
    const onPop = () => {
      const cur = here.current;
      if (cur.awaken || cur.leaving || cur.beat === "finish") {
        window.history.pushState(guard, "");
        return;
      }
      if (cur.prev) {
        go(cur.prev);
        window.history.pushState(guard, "");
        return;
      }
      // The first step: this Back really leaves.
      window.removeEventListener("popstate", onPop);
      window.history.back();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [mode, go]);

  if (!ready) return <div className="lx-loading"><Loader size="lg" label="Getting things ready" /></div>;

  // An invitation, an organisation that is already here, a request that was sent: whole screens in the
  // same canvas, each with a way on.
  if (beat === "team" && !awaken && api) {
    const v = team.view;
    const out = onSignOut ?? (() => {});
    if (v.v === "invitation") {
      return (
        <InvitationScreen
          invitation={v.item}
          more={v.more}
          onJoin={async () => {
            // Joining is an arrival, not a jump: the flight goes up now and the call happens under it. If the
            // call fails the flight lets go at once and this screen's own calm retry is what is seen.
            flight.begin({ kind: "invite", org: v.item.organisationName, person: validName(answers.name) ?? account?.name });
            try {
              await api.accept(v.item.id, validName(answers.name) ?? undefined);
            } catch (err) {
              flight.cancel();
              throw err;
            }
            api.joined();
          }}
          onNotNow={team.skipInvitation}
          onSignOut={out}
        />
      );
    }
    if (v.v === "match") {
      return (
        <TeamMatchScreen
          name={v.org.name}
          via={v.via}
          joinMode={v.org.joinMode}
          onJoin={async () => {
            const arrival = { kind: "team", org: v.org.name, person: validName(answers.name) ?? account?.name } as const;
            // Only a join that lets them straight in is an arrival; asking to join is "request sent".
            if (v.org.joinMode === "direct") flight.begin(arrival);
            let r: "joined" | "requested";
            try {
              r = await api.join(v.org.id, validName(answers.name) ?? undefined);
            } catch (err) {
              flight.cancel();
              throw err;
            }
            if (r === "joined") {
              flight.begin(arrival);
              api.joined();
            } else {
              flight.cancel();
              team.show({ v: "sent", name: v.org.name });
            }
          }}
          // A different organisation: the question again, with nothing in the field (and nothing of the name just
          // typed left on her pad). Never a form that would make another one of the same name.
          onNo={() => {
            if (afterNo(v.via) === "personal") return give({ team: teamPersonal });
            setDraft({});
            team.show({ v: "ask" });
          }}
          onSignOut={out}
        />
      );
    }
    if (v.v === "sent") {
      return <RequestSentScreen name={v.name} onCarryOn={() => give({ team: { kind: "asked", name: v.name } })} onSignOut={out} />;
    }
  }

  const at = CHAPTER_OF[beat];
  const w: Words =
    beat === "finish" && finish.ready
      ? readyWords(answers)
      : beat === "team"
        ? teamWords(team.view.v === "ask" ? "ask" : team.view.v === "create" ? "create" : "loading", answers, domainName)
        : words(beat, answers, { askingClient: asking, hasJd: !!answers.jd });
  const turnKey = awaken ? "awake" : beat === "finish" && finish.ready ? "ready" : beat === "team" ? `team-${team.view.v}` : beat === "client" && asking ? "client-asking" : beat;

  return (
    <div className="lx">
      <Stage
        beat={beat}
        awaken={awaken}
        onAwakened={awakened}
        ready={beat === "finish" && finish.ready}
        leaving={leaving}
        stalled={finish.problem !== null}
        answers={answers}
        draft={draft}
        progress={progressOf(beat, answers)}
        reduce={reduce}
      />

      <header className="nx-top">
        <span className="bp-logo nx-logo">
          <svg className="bp-mark" viewBox="0 0 34 35" fill="none" aria-hidden="true" focusable="false">
            <path d={STAR_PATH} fill="currentColor" stroke="currentColor" strokeMiterlimit="10" />
          </svg>
          <span className="bp-word">superhyre</span>
        </span>
        <ol className="lx-steps" aria-label="Setting up">
          {CHAPTERS.map((c, i) => {
            const idx = CHAPTERS.findIndex((x) => x.id === at);
            const done = i < idx;
            const now = i === idx;
            const target = done ? chapterTarget(c.id, at) : null;
            const inner = (
              <>
                {(done || now) && <span className="lx-step-i">{done ? <Check size={12} weight="bold" aria-label="Done" /> : <ArrowRight size={12} weight="bold" aria-hidden="true" />}</span>}
                <span className="lx-step-t">{c.title}</span>
              </>
            );
            return (
              <Fragment key={c.id}>
                {i > 0 && (
                  <li className={`lx-dots${i <= idx ? " is-lit" : ""}`} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </li>
                )}
                <li className={`lx-step${now ? " is-now" : done ? " is-done" : ""}`} aria-current={now ? "step" : undefined}>
                  {target && !awaken && !leaving && beat !== "finish" ? (
                    <button type="button" className="lx-pill" onClick={() => go(target)}>
                      {inner}
                    </button>
                  ) : (
                    <span className="lx-pill">{inner}</span>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
        <span />
      </header>

      <main className="nx-voice" data-wide={beat === "powers" || beat === "finish" || beat === "jd" ? 1 : undefined}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={turnKey}
            className="nx-turn"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, filter: "blur(4px)", transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } }}
            transition={{ duration: 0.2 }}
          >
            {awaken ? (
              <Head lines={AWAKE(answers.name)} reduce={reduce} />
            ) : (
              <Turn
                beat={beat}
                w={w}
                answers={answers}
                reduce={reduce}
                ready={finish.ready}
                rows={finish.rows}
                problem={finish.problem}
                exists={finish.exists}
                retry={finish.retry}
                asking={asking}
                setAsking={setAsking}
                setDraft={setDraft}
                give={give}
                go={go}
                complete={complete}
                leaving={leaving}
                teamView={team.view.v}
                domainName={domainName}
                api={api}
                showTeam={team.show}
                back={() => {
                  team.refresh();
                  go("team");
                }}
              />
            )}
          </motion.section>
        </AnimatePresence>
        {prev && beat !== "finish" && !awaken && (
          <div className="nx-back">
            <TextAction back onClick={() => go(prev)}>
              Back
            </TextAction>
          </div>
        )}
      </main>

      {mode === "preview" && !new URLSearchParams(window.location.hash.split("?")[1] ?? "").has("nobar") && (
        <PreviewBar
          at={beat}
          reduce={forceReduce}
          onReduce={setForceReduce}
          onJump={(to) => {
            setEnded(false);
            setLeaving(false);
            setAwaken(false);
            const j = jump({ ...EMPTY, ...known }, to);
            setAnswers(j.answers);
            go(j.beat);
          }}
          onRestart={() => window.location.reload()}
        />
      )}
      {ended && (
        <div className="lx-end" role="status">
          <p>That's the end of the preview. In the live flow, this opens Mind.</p>
          <button type="button" className="nx-cta" onClick={() => window.location.reload()}>
            Start again
          </button>
        </div>
      )}
      <span hidden>{firstName(answers.name)}</span>
    </div>
  );
}

/**
 * The lines of work, ticking over one after another. In the live flow the call makes the organisation,
 * the client and the campaign on the server and hands the job description to Mind, which reads it and
 * starts the search in the background, so it comes back quickly; the lines tick on their own short
 * time and the page waits only for the call. In the preview the whole thing is on a timer.
 */
function useFinishRows(on: boolean, reduce: boolean, a: Answers, run?: (a: Answers) => Promise<Finished>): { rows: ProgressRow[]; ready: boolean; result: Finished | null; problem: string | null; /** An organisation of that name is already here: trying the same thing again cannot work. */ exists: boolean; retry: () => void } {
  const [n, setN] = useState(0);
  const [result, setResult] = useState<Finished | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  /** The call did not get an answer (offline, or a server still starting): it is tried again by itself once the line is back. */
  const [recoverable, setRecoverable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const answers = useRef(a);
  answers.current = a;
  const call = useRef(run);
  call.current = run;

  useEffect(() => {
    if (!on) {
      setN(0);
      setResult(null);
      setProblem(null);
      setExists(false);
      return;
    }
    const timers: number[] = [];
    const at = (ms: number, step: number) => timers.push(window.setTimeout(() => setN((x) => Math.max(x, step)), ms));
    if (!call.current) {
      if (reduce) setN(6);
      else [[900, 2], [1000, 3], [2000, 4], [2100, 5], [3200, 6]].forEach(([ms, step]) => at(ms as number, step as number));
      return () => {
        for (const t of timers) window.clearTimeout(t);
      };
    }
    let live = true;
    setProblem(null);
    setExists(false);
    setN(1);
    const began = Date.now();
    if (!reduce) [[900, 2], [1000, 3], [2000, 4], [2100, 5]].forEach(([ms, step]) => at(ms as number, step as number));
    call.current(answers.current).then(
      (r) => {
        if (!live) return;
        setResult(r);
        // The work can be quick; the story is not rushed: the last line is never ticked off before its beat.
        const wait = reduce ? 0 : Math.max(0, 3200 - (Date.now() - began));
        timers.push(window.setTimeout(() => setN(6), wait));
      },
      (err: unknown) => {
        if (!live) return;
        setExists(err instanceof ApiError && err.code === "organisation_exists");
        setRecoverable(!(err instanceof ApiError) || err.status === 0 || err.status >= 500);
        setProblem(readable(err));
      },
    );
    return () => {
      live = false;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [on, reduce, attempt]);

  useEffect(() => {
    if (!on || !problem || !recoverable) return;
    const again = () => setAttempt((x) => x + 1);
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [on, problem, recoverable]);

  const status = (row: number): RowStatus => (n >= row * 2 + 2 ? "done" : n >= row * 2 + 1 ? "working" : "waiting");
  const role = roleText(a.role);
  const org = organisationOf(a);
  const creating = a.team?.kind === "create";
  return {
    ready: n >= 6,
    result,
    problem,
    exists,
    retry: () => setAttempt((x) => x + 1),
    rows: [
      creating
        ? { id: "organisation", label: `Setting up ${org}`, detail: "You're its owner, so you can invite people.", status: problem ? "waiting" : status(0) }
        : { id: "organisation", label: "Setting up Personal", detail: "Only you can see it", status: problem ? "waiting" : status(0) },
      { id: "campaign", label: "Setting up your first campaign", detail: role ? `${role}${a.forClient && a.client ? ` for ${a.client}` : ""}` : "From the role you chose", status: status(1) },
      a.jd
        ? { id: "mind", label: "Handing it to Mind", detail: "It reads the job description, then starts the search", status: status(2) }
        : { id: "mind", label: "Mind is drafting the role", detail: "It will ask for the job description", status: status(2) },
    ],
  };
}

/* ── one turn: Mind's words, then the person's side ───────────────────────── */

type TurnProps = {
  beat: Beat;
  w: Words;
  answers: Answers;
  reduce: boolean;
  ready: boolean;
  leaving: boolean;
  rows: ProgressRow[];
  problem: string | null;
  exists: boolean;
  retry: () => void;
  asking: boolean;
  setAsking: (v: boolean) => void;
  setDraft: (d: Draft) => void;
  give: (patch: Partial<Answers>) => void;
  go: (to: Beat) => void;
  complete: () => void;
  teamView: "loading" | "invitation" | "match" | "sent" | "ask" | "create";
  domainName: string;
  api: TeamApi | undefined;
  showTeam: (v: { v: "match"; org: OrgMatch; via: "name"; typed: string } | { v: "create"; name: string }) => void;
  back: () => void;
};

function Turn(p: TurnProps): JSX.Element {
  const { beat, w, answers, reduce } = p;
  /* Making an organisation asks first whether its name is already on SuperHyre: if it is, the person is shown
     that one (ask to join) rather than being sent to make a second of the same name. A lookup that cannot be
     made never holds them up: the server still refuses a clash, and says so. */
  const [looking, setLooking] = useState(false);
  const createOrganisation = (name: string) => {
    if (looking) return;
    if (!p.api?.lookup) return p.give({ team: { kind: "create", name } });
    setLooking(true);
    p.api.lookup(name).then(
      (m) => (m ? p.showTeam({ v: "match", org: m, via: "name", typed: name }) : p.give({ team: { kind: "create", name } })),
      () => p.give({ team: { kind: "create", name } }),
    ).finally(() => setLooking(false));
  };
  const h = reduce ? 0 : headMs(w.head);
  const quietAt = h + 120;
  const inputAt = h + 360;
  const words_ = (
    <>
      <Head lines={w.head} reduce={reduce} />
      {w.quiet && (
        <Quiet delay={quietAt} reduce={reduce}>
          {w.quiet}
        </Quiet>
      )}
    </>
  );

  switch (beat) {
    case "name":
      return (
        <>
          {words_}
          <TextLine id="nx-name" label="Your name" initial={answers.name} placeholder="Your name" check={validName} delay={inputAt} reduce={reduce} autoComplete="name" maxLength={300} whenEmpty="Tell me what to call you." problemFor={nameProblem} onSend={(v) => p.give({ name: v })} />
        </>
      );
    case "team":
      if (p.teamView === "ask") {
        return (
          <>
            {words_}
            <AskOrganisation
              delay={inputAt}
              reduce={reduce}
              lookup={p.api?.lookup}
              onDraft={(v) => p.setDraft({ organisation: v })}
              onFound={(org, typed) => p.showTeam({ v: "match", org, via: "name", typed })}
              onNone={(typed) => p.showTeam({ v: "create", name: typed })}
              onSkip={() => p.give({ team: teamPersonal })}
            />
          </>
        );
      }
      if (p.teamView === "create") {
        return (
          <>
            {words_}
            <TextLine
              id="nx-org"
              label="Organisation name"
              initial={p.domainName}
              placeholder="Your company or agency"
              check={validCompany}
              delay={inputAt}
              reduce={reduce}
              maxLength={200}
              whenEmpty={companyProblem("", "organisation")}
              problemFor={(v) => companyProblem(v, "organisation")}
              ctaFor={(clean) => (looking ? "One moment" : createLabel(clean))}
              onDraft={(v) => p.setDraft({ organisation: v })}
              onSend={createOrganisation}
              extra={<TextAction onClick={() => p.give({ team: teamPersonal })}>Just me for now</TextAction>}
            />
            <LogoAsk delay={inputAt + 240} reduce={reduce} />
          </>
        );
      }
      return words_;
    case "role":
      return (
        <>
          {words_}
          <RoleAsk previous={roleText(answers.role)} delay={inputAt} reduce={reduce} onDraft={(t) => p.setDraft({ role: t })} onPick={(r) => p.give({ role: r })} />
        </>
      );
    case "jd":
      return (
        <>
          {words_}
          <JdAsk initial={answers.jd ?? ""} delay={inputAt} reduce={reduce} onDraft={(t) => p.setDraft({ jd: t })} onGive={(text) => p.give({ jd: text })} onLater={() => p.give({ jd: null })} />
        </>
      );
    case "client":
      return (
        <>
          {words_}
          <ClientAsk
            delay={inputAt}
            reduce={reduce}
            asking={p.asking}
            setAsking={p.setAsking}
            onDraft={(t) => p.setDraft({ client: t })}
            onOwn={() => p.give({ forClient: false })}
            onClient={(name) => p.give({ forClient: true, client: name })}
          />
        </>
      );
    case "powers":
      return (
        <>
          {words_}
          <div className="nx-after" style={{ "--delay": `${inputAt}ms` } as React.CSSProperties}>
            <PowerList />
            <button type="button" className="nx-cta" onClick={() => p.go("finish")}>
              Continue <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </>
      );
    case "finish":
      return (
        <>
          {words_}
          <div className="nx-after" style={{ "--delay": `${inputAt}ms` } as React.CSSProperties}>
            <SetupProgress rows={p.rows} reduce={reduce} />
            {p.problem && (
              <p className="nx-problem nx-finish-problem" role="alert">
                {p.problem}{" "}
                {!p.exists && (
                  <>
                    <TextAction onClick={p.retry}>Retry</TextAction>{" "}
                  </>
                )}
                <TextAction onClick={p.back}>{p.exists ? "Choose again" : "Change my team"}</TextAction>
              </p>
            )}
            {p.ready && (
              <button type="button" className="nx-cta" onClick={p.complete} disabled={p.leaving} autoFocus>
                Open Mind <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      );
  }
}

/* ── the person's side of each turn ────────────────────────────────────────── */

/**
 * What a typed answer says about itself once the person has paused: a line that is there for what cannot be
 * taken (too short, too long, a link), never for what is simply not finished. Nothing is shown for an empty field.
 */
function useSettledProblem(v: string, valid: boolean, why: (v: string) => string): string | null {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    if (!v.trim() || valid) return;
    const t = window.setTimeout(() => setSettled(true), 700);
    return () => window.clearTimeout(t);
  }, [v, valid]);
  return settled && v.trim() && !valid ? why(v) : null;
}

function TextLine({ id, label, initial, placeholder, check, delay, reduce, autoComplete, maxLength, onDraft, onSend, whenEmpty, problemFor, cta, ctaFor, extra }: { id: string; label: string; initial: string; placeholder: string; check: (v: string) => string | null; delay: number; reduce: boolean; autoComplete?: string; maxLength: number; onDraft?: (v: string) => void; onSend: (v: string) => void; whenEmpty: string; problemFor?: (v: string) => string; cta?: string; /** The button's words from what would be sent (null while it cannot be). */ ctaFor?: (clean: string | null) => string; extra?: ReactNode }) {
  const [v, setV] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const clean = check(v);
  const live = useSettledProblem(v, clean !== null, (x) => (problemFor ? problemFor(x) : whenEmpty));
  // A name that is already filled in (offered from the account or the domain) shows on the pad at once.
  useEffect(() => {
    if (initial) onDraft?.(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <LineInput
      id={id}
      label={label}
      value={v}
      onChange={(x) => {
        setV(x);
        setProblem(null);
        onDraft?.(x);
      }}
      onSubmit={() => (clean ? onSend(clean) : setProblem(v.trim() && problemFor ? problemFor(v) : whenEmpty))}
      placeholder={placeholder}
      ok={clean !== null}
      delay={delay}
      reduce={reduce}
      autoComplete={autoComplete}
      maxLength={maxLength}
      problem={problem ?? live}
      extra={extra}
      {...(ctaFor ? { cta: ctaFor(clean) } : cta ? { cta } : {})}
    />
  );
}

/** "Which organisation do you work with?" for a personal address: optional, found by name only. */
function AskOrganisation({ delay, reduce, lookup, onDraft, onFound, onNone, onSkip }: { delay: number; reduce: boolean; lookup: TeamApi["lookup"] | undefined; onDraft: (v: string) => void; onFound: (org: OrgMatch, typed: string) => void; onNone: (typed: string) => void; onSkip: () => void }) {
  const [v, setV] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = validCompany(v);
  const live = useSettledProblem(v, clean !== null, (x) => companyProblem(x, "organisation"));
  const send = () => {
    if (!clean) return setProblem(v.trim() ? companyProblem(v, "organisation") : "Add the name of your company or agency, or skip this.");
    if (busy) return;
    setBusy(true);
    // Not being able to ask never blocks the set-up: they go on to creating it. Being asked to wait (too many
    // lookups in an hour) is different: they are told, and nothing is made in its place.
    (lookup ? lookup(clean) : Promise.resolve(null)).then(
      (m) => (m ? onFound(m, clean) : onNone(clean)),
      (err: unknown) => {
        if (err instanceof ApiError && err.status === 429) {
          setBusy(false);
          setProblem(`${err.message.trim().replace(/([^.!?])$/, "$1.")} You can skip this and add your organisation later in Settings.`);
          return;
        }
        onNone(clean);
      },
    );
  };
  return (
    <LineInput
      id="nx-org-ask"
      label="Your company or agency"
      value={v}
      onChange={(x) => {
        setV(x);
        setProblem(null);
        onDraft(x);
      }}
      onSubmit={send}
      placeholder="Company or agency name"
      ok={clean !== null && !busy}
      delay={delay}
      reduce={reduce}
      problem={problem ?? live}
      maxLength={200}
      cta={busy ? "One moment" : "Continue"}
      extra={<TextAction onClick={onSkip}>Skip for now</TextAction>}
    />
  );
}

function RoleAsk({ previous, delay, reduce, onDraft, onPick }: { previous: string | null; delay: number; reduce: boolean; onDraft: (t: string | undefined) => void; onPick: (r: NonNullable<ReturnType<typeof parseRole>>) => void }) {
  const [other, setOther] = useState(false);
  const [v, setV] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  if (other) {
    const r = parseRole(v);
    return (
      <LineInput
        id="nx-role"
        label="Role"
        value={v}
        onChange={(x) => {
          setV(x);
          setProblem(null);
          onDraft(x.trim() || undefined);
        }}
        onSubmit={() => (r ? onPick(r) : setProblem(roleProblem(v)))}
        placeholder="A job title, like Data Engineer"
        ok={r !== null}
        delay={0}
        reduce={reduce}
        problem={problem}
        maxLength={200}
        extra={
          <TextAction
            onClick={() => {
              setOther(false);
              onDraft(undefined);
            }}
          >
            See suggestions
          </TextAction>
        }
      />
    );
  }
  return (
    <Options<string>
      delay={delay}
      reduce={reduce}
      items={[...ROLE_SUGGESTIONS.map((t) => ({ id: t, label: previous === t ? `${t} ✓` : t })), { id: "__other", label: "Something else…" }]}
      onEnter={(id) => onDraft(id === "__other" ? undefined : id)}
      onLeave={() => onDraft(undefined)}
      onPick={(id) => (id === "__other" ? setOther(true) : onPick({ kind: "title", title: id }))}
    />
  );
}

/** The job description: pasted text. "I'll add it later" is a plain link; a link is gently turned back. */
function JdAsk({ initial, delay, reduce, onDraft, onGive, onLater }: { initial: string; delay: number; reduce: boolean; onDraft: (t: string) => void; onGive: (text: string) => void; onLater: () => void }) {
  const [v, setV] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const check = checkJd(v);
  // A pasted link, or text past the limit, is said so at once, with the count: nothing is cut without a word.
  const tooLong = v.trim().length > JD_MAX;
  const shown = problem ?? ((isBareUrl(v) || tooLong) && !check.ok ? check.problem : null);
  return (
    <AreaInput
      id="nx-jd"
      label="Job description"
      value={v}
      onChange={(x) => {
        setV(x);
        setProblem(null);
        onDraft(x);
      }}
      onSubmit={() => (check.ok ? onGive(check.text) : setProblem(check.problem))}
      placeholder="Paste it here"
      ok={check.ok}
      tryable={jdTryable(v)}
      delay={delay}
      reduce={reduce}
      problem={shown}
      extra={<TextAction onClick={onLater}>I'll add it later</TextAction>}
    />
  );
}

/** "Is this role for a client?" Yes asks for one thing: the client's company name. */
function ClientAsk({ delay, reduce, asking, setAsking, onDraft, onOwn, onClient }: { delay: number; reduce: boolean; asking: boolean; setAsking: (v: boolean) => void; onDraft: (t: string) => void; onOwn: () => void; onClient: (name: string) => void }) {
  if (asking)
    return (
      <TextLine
        id="nx-client"
        label="Client's company name"
        initial=""
        placeholder="Client's company name"
        check={validCompany}
        delay={0}
        reduce={reduce}
        maxLength={200}
        whenEmpty={companyProblem("", "client")}
        problemFor={(v) => companyProblem(v, "client")}
        onDraft={onDraft}
        onSend={onClient}
        extra={
          <TextAction
            onClick={() => {
              setAsking(false);
              onDraft("");
            }}
          >
            Choose again
          </TextAction>
        }
      />
    );
  return (
    <Options<"yes" | "no">
      delay={delay}
      reduce={reduce}
      items={[
        { id: "yes", label: "Yes, it's for a client", sub: "I'll ask for their company name, nothing else" },
        { id: "no", label: "No, it's for my own company" },
      ]}
      onPick={(id) => (id === "yes" ? setAsking(true) : onOwn())}
    />
  );
}

function PreviewBar({ at, reduce, onReduce, onJump, onRestart }: { at: Beat; reduce: boolean; onReduce: (v: boolean) => void; onJump: (to: Beat) => void; onRestart: () => void }): ReactNode {
  return (
    <div className="lx-dev" role="region" aria-label="Preview controls">
      <span>Preview</span>
      <select aria-label="Jump to a step" value={at} onChange={(e) => onJump(e.target.value as Beat)}>
        {JUMPS.map((j) => (
          <option key={j.id} value={j.id}>
            {j.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={onRestart}>
        Restart
      </button>
      <label>
        <input type="checkbox" checked={reduce} onChange={(e) => onReduce(e.target.checked)} /> Reduced motion
      </label>
    </div>
  );
}

export { art };
