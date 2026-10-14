import "./styles";
import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyKeyFrom } from "./applyKey";
import { stylesReady } from "./stylesReady";
import { Loader } from "./components/Loader";
import { startTheme } from "./theme";

/* The candidate's page is a file of its own: nobody opening the console or the sign-in carries it. */
const ApplyPage = lazy(() => import("./ApplyPage").then((m) => ({ default: m.ApplyPage })));
const LeanSetup = lazy(() => import("./setup/lean/LeanSetup").then((m) => ({ default: m.LeanSetup })));
const SidePreview = lazy(() => import("./setup/lean/SidePreview").then((m) => ({ default: m.SidePreview })));
const AgentPreview = lazy(() => import("./agentCards/Preview").then((m) => ({ default: m.AgentPreview })));
/* The arrival scene (joining a team, opening a new one) sits over whatever the app is showing, so it is mounted
   here, once, where no screen's own render can restart it. It draws nothing until a flight begins. */
const FlightHost = lazy(() => import("./setup/lean/FlightScene").then((m) => ({ default: m.FlightHost })));
const SIDES = ["invitation", "domain", "request", "name", "sent", "invited", "expired", "elsewhere", "taken", "error"] as const;
type Side = (typeof SIDES)[number];
const sideFrom = (hash: string): Side | null => SIDES.find((s) => s === new URLSearchParams(hash.split("?")[1] ?? "").get("screen")) ?? null;

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

/** The candidate page (#/apply/…) renders on its own, with no console and
    no sign-in: it is what a form link opens. Everything else is the app. */
function Root() {
  const [key, setKey] = useState(() => applyKeyFrom(window.location.hash));
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => {
      setKey(applyKeyFrom(window.location.hash));
      bump((n) => n + 1);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // The chat's narration and cards, scripted, for looking at them without a server.
  if (window.location.hash.startsWith("#/agent-preview")) {
    return (
      <Suspense fallback={null}>
        <AgentPreview />
      </Suspense>
    );
  }
  // The new set-up, on its own with nothing saved, for looking at the flow and the motion.
  if (window.location.hash.startsWith("#/setup-preview")) {
    const side = sideFrom(window.location.hash);
    return (
      <Suspense fallback={null}>
        {side ? <SidePreview name={side} /> : <LeanSetup mode="preview" />}
        <FlightHost settle={false} />
      </Suspense>
    );
  }
  return key ? (
    <Suspense fallback={<div className="boot"><Loader size="lg" label="Loading" /></div>}>
      <ApplyPage key={key} formKey={key} />
    </Suspense>
  ) : <Themed><App /><Suspense fallback={null}><FlightHost /></Suspense></Themed>;
}

/** Light or dark for the whole app, the sign-in included. The candidate's page is its own, always light. */
function Themed({ children }: { children: ReactNode }) {
  useEffect(() => startTheme(), []);
  return <>{children}</>;
}

/* index.html does not wait for the stylesheet to paint its loader (src/build/asyncCss.ts); the app does, so it is never
   seen unstyled. */
void stylesReady().then(() => {
  createRoot(root).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
});
