import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../components/focusTrap";
import type { Standing } from "../can";
import type { RouteId } from "../nav";
import { useToast } from "../toast";
import { TourIntro } from "./TourIntro";
import { counter, placePopover, presentUpFront, selectorFor, stepsFor, walkSteps, withPagesFound } from "./tourSteps";
import type { Box, TourStep } from "./tourSteps";
import { useTour } from "./useTour";
import "./tour.css";

/**
 * The first-run tour, mounted once in the console.
 *
 * Part A is the three-slide introduction (TourIntro). Part B is the guided walk: the page is dimmed, the thing
 * being explained is lit, and a small card beside it says what it is for. It moves between pages by itself where
 * a step lives on another one, skips what is not there for this person, and ends back on Home.
 */

type Props = {
  userId?: string | undefined;
  standing: Standing;
  /** The page the console is on now. */
  route: RouteId;
  navigate: (id: RouteId) => void;
  /** Below the sidebar's breakpoint it is a drawer, which has to be opened for the steps that point into it. */
  narrow: boolean;
  openNav: () => void;
  closeNav: () => void;
};

export function TourHost(props: Props): JSX.Element | null {
  const { phase, guide, close } = useTour(props.userId);
  if (phase === "off") return null;
  if (phase === "intro") return <TourIntro onGuide={guide} onSkip={close} />;
  return <GuidedTour {...props} onClose={close} />;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

async function waitFor<T>(find: () => T | null, ms = 1800, every = 60): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const hit = find();
    if (hit) return hit;
    if (Date.now() >= end) return null;
    await sleep(every);
  }
}

/** The step's target if it is on the page and has a size: hidden, collapsed or absent ones are not there. */
export function visibleTarget(step: Pick<TourStep, "target" | "fallback">): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selectorFor(step))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && !el.closest("[aria-hidden=\"true\"]")) return el;
  }
  return null;
}

const PAD = 6;
const SAME = (a: Box | null, b: Box): boolean =>
  !!a && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

function GuidedTour({ standing, route, navigate, narrow, openNav, closeNav, onClose }: Props & { onClose: () => void }): JSX.Element | null {
  const toast = useToast();
  const [plan, setPlan] = useState<TourStep[]>(() => presentUpFront(stepsFor(standing), (q) => !!document.querySelector(q)));
  /** The step the person has just asked for, shown at once while the page catches up. */
  const [arriving, setArriving] = useState<number | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [radius, setRadius] = useState(10);
  const [size, setSize] = useState({ width: 320, height: 150 });
  const [view, setView] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  const planRef = useRef(plan);
  /** Steps whose target was not there when its turn came: stepped over, never taken out of the count. */
  const missing = useRef(new Set<string>());
  const routeRef = useRef(route);
  routeRef.current = route;
  const narrowRef = useRef(narrow);
  narrowRef.current = narrow;
  const live = useRef(true);
  const moving = useRef(false);
  const drawer = useRef(false);
  const target = useRef<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  useFocusTrap(root, true, { focusFirst: false });

  /** Takes a step to where it can be shown, and says whether its target is there. */
  const prepare = useCallback(
    async (step: TourStep): Promise<boolean> => {
      if (step.area === "nav" && narrowRef.current) {
        if (!drawer.current) {
          drawer.current = true;
          openNav();
          await sleep(380);
        }
      } else if (drawer.current) {
        drawer.current = false;
        closeNav();
        await sleep(120);
      }
      let moved = false;
      if (step.route && routeRef.current !== step.route) {
        moved = true;
        navigate(step.route);
        await waitFor(() => (routeRef.current === step.route ? true : null), 1500);
      }
      // On a page we are already on, what is there is there within a beat; only a new page needs the long wait.
      const el = await waitFor(() => visibleTarget(step), moved ? 1800 : 500);
      if (!el) return false;
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      target.current = el;
      return true;
    },
    [navigate, openNav, closeNav],
  );

  const finish = useCallback(() => {
    if (drawer.current) closeNav();
    onClose();
    navigate("home");
    toast("You're all set");
  }, [closeNav, onClose, navigate, toast]);

  const skip = useCallback(() => {
    if (drawer.current) closeNav();
    onClose();
  }, [closeNav, onClose]);

  const go = useCallback(
    async (from: number, dir: 1 | -1) => {
      if (moving.current) return;
      moving.current = true;
      const at = await walkSteps(planRef.current, from, dir, prepare, missing.current);
      moving.current = false;
      if (!live.current) return;
      setArriving(null);
      if (at === null) return finish();
      setIndex(at);
    },
    [prepare, finish],
  );

  /**
   * The list is settled once, before the first step: the sidebar's rows were judged when the tour opened, and the
   * pages the other steps live on are visited here, once, to see which of their targets exist. From then on the
   * list and its total are fixed for the run, and a step is numbered by its place in it.
   */
  const freeze = useCallback(async (): Promise<TourStep[]> => {
    const base = planRef.current;
    const pages = base.filter((s) => s.area === "page" && s.route);
    if (!pages.length) return base;
    const home = routeRef.current;
    const found = new Set<string>();
    for (const route of new Set(pages.map((s) => s.route))) {
      const mine = pages.filter((s) => s.route === route);
      if (route && routeRef.current !== route) {
        navigate(route);
        await waitFor(() => (routeRef.current === route ? true : null), 1500);
      }
      // The page has drawn once any of its targets is there; the rest are judged a beat after it.
      await waitFor(() => (mine.some((s) => visibleTarget(s)) ? true : null), 1800);
      await sleep(250);
      for (const s of mine) if (visibleTarget(s)) found.add(s.id);
    }
    if (routeRef.current !== home) {
      navigate(home);
      await waitFor(() => (routeRef.current === home ? true : null), 1500);
    }
    return withPagesFound(base, found);
  }, [navigate]);

  /* Once per tour. A development build mounts, unmounts and mounts again: without this the list was settled twice, at
     the same time, and the two answers took turns at being the total (and the walk started over under the person). */
  const started = useRef(false);
  useEffect(() => {
    live.current = true;
    if (!started.current) {
      started.current = true;
      void freeze().then((frozen) => {
        if (!live.current) return;
        planRef.current = frozen;
        setPlan(frozen);
        void go(0, 1);
      });
    }
    return () => {
      live.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settled = index === null ? null : (plan[index] ?? null);
  const step = settled;
  // What the card shows: the step just asked for if there is one, so Next answers on the instant.
  const shownAt = arriving ?? index;
  const shown = shownAt === null ? null : (plan[shownAt] ?? settled);
  const busy = arriving !== null;

  // Keeps the light on the target: it moves with the page, the drawer and the window.
  useEffect(() => {
    if (!step) return;
    let frame = 0;
    let last: Box | null = null;
    const tick = () => {
      const el = target.current;
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        const next: Box = { left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
        if (!SAME(last, next)) {
          last = next;
          setBox(next);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    const el = target.current;
    if (el) {
      const r = parseFloat(getComputedStyle(el).borderRadius);
      setRadius(Number.isFinite(r) ? Math.min(Math.max(r + 4, 8), 28) : 10);
    }
    frame = window.requestAnimationFrame(tick);
    const onResize = () => setView({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [step]);

  useLayoutEffect(() => {
    const r = pop.current?.getBoundingClientRect();
    if (r && (Math.abs(r.width - size.width) > 1 || Math.abs(r.height - size.height) > 1)) setSize({ width: r.width, height: r.height });
  });

  // The next button has focus whenever a step arrives, so Enter goes on and Tab stays inside the card.
  useEffect(() => {
    if (!step) return;
    const t = window.setTimeout(() => nextBtn.current?.focus({ preventScroll: true }), 30);
    return () => window.clearTimeout(t);
  }, [step]);

  const nextStep = useCallback(() => {
    if (index === null || moving.current) return;
    if (planRef.current.slice(index + 1).every((s) => missing.current.has(s.id))) return finish();
    setArriving(index + 1);
    void go(index + 1, 1);
  }, [index, go, finish]);
  const backStep = useCallback(() => {
    if (index === null || moving.current || index === 0) return;
    setArriving(index - 1);
    void go(index - 1, -1);
  }, [index, go]);

  const keys = useRef({ nextStep, backStep, skip });
  keys.current = { nextStep, backStep, skip };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k !== "Escape" && k !== "ArrowRight" && k !== "ArrowLeft") return;
      e.preventDefault();
      e.stopPropagation();
      if (k === "Escape") keys.current.skip();
      else if (k === "ArrowRight") keys.current.nextStep();
      else keys.current.backStep();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (drawer.current) closeNav();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!step || index === null) {
    // Finding the first step: the page is held still, with nothing drawn yet.
    return createPortal(<div ref={root} className="tr-root" tabIndex={-1} aria-hidden="true"><div className="tr-block" /></div>, document.body);
  }

  const placed = box ? placePopover(box, size, view, step.place) : null;
  const at = shownAt ?? index;
  const last = plan.slice(at + 1).every((s) => missing.current.has(s.id));
  return createPortal(
    <div ref={root} className="tr-root" role="dialog" aria-modal="true" aria-labelledby="tr-title" tabIndex={-1}>
      <div className="tr-block" />
      {box && <div className="tr-veil" style={{ left: box.left, top: box.top, width: box.width, height: box.height, borderRadius: Math.min(radius, Math.min(box.width, box.height) / 2) }} />}
      <div
        ref={pop}
        key={step.id}
        className={`tr-pop${placed?.side === "sheet" ? " is-sheet" : ""}${busy ? " is-busy" : ""}`}
        aria-busy={busy}
        style={placed ? { left: placed.left, top: placed.top, visibility: "visible" } : { visibility: "hidden" }}
      >
        <p className="tr-count t-caption">{counter(at, plan.length)}</p>
        <h2 id="tr-title" className="tr-title t-title-sm">{(shown ?? step).title}</h2>
        <p className="tr-body t-body">{(shown ?? step).text}</p>
        <div className="tr-foot">
          <button type="button" className="tr-text" onClick={skip}>Skip tour</button>
          <span className="tr-acts">
            {at > 0 && <button type="button" className="ncx-btn is-sm" onClick={backStep} disabled={busy}>Back</button>}
            <button ref={nextBtn} type="button" className="ncx-btn is-sm is-primary" onClick={nextStep} disabled={busy}>{last ? "Done" : "Next"}</button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
