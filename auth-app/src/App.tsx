import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  BlockedCard, CheckInboxCard, LoadingCard, SignInCard, SignUpCard,
} from "./Cards";
import { Console } from "./Console";
import { describeAuthError } from "./authErrors";
import { redirectTarget } from "./config";
import { supabase } from "./supabase";
import { bootstrapSchema, BUSY, IDLE } from "./types";
import type { Op, View } from "./types";
import { emailProblem, passwordProblem } from "./validate";

/** Deferred so Motion is not in the sign-in form's critical path. Named
 *  export, so unwrap it for React.lazy's default-export contract. */
const BrandPanel = lazy(() =>
  import("./components/BrandPanel").then((m) => ({ default: m.BrandPanel })),
);

/**
 * The whole auth surface, in one place.
 *
 * No router: GitHub Pages serves static files, so /access/callback would 404
 * before React ever loaded. Everything lives at /access/ and the OAuth return
 * is handled on the same URL by supabase-js (detectSessionInUrl). That removes
 * the deep-link 404 class of bug entirely rather than papering over it with a
 * 404.html redirect hack.
 */
export function App() {
  const [view, setView] = useState<View>({ v: "loading" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Independent per action: a Google failure must not clear a password error
  // the user is still reading, and vice versa.
  const [formOp, setFormOp] = useState<Op>(IDLE);
  const [googleOp, setGoogleOp] = useState<Op>(IDLE);
  const [signingOut, setSigningOut] = useState(false);

  // Announced politely for screen readers, because switching card is a visual
  // change with no focus move attached to it.
  const [announce, setAnnounce] = useState("");

  // getSession() on mount and the SIGNED_IN event can both land for one
  // sign-in. Bootstrap is a cheap read either way, but running it twice makes
  // the card render, blank, and render again.
  const resolving = useRef(false);

  /** Session -> tenancy -> view. `extension_bootstrap()` is the authority on
   *  whether this account may be here at all, so its answer decides the card. */
  const resolveSession = useCallback(async () => {
    if (resolving.current) return;
    resolving.current = true;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setView({ v: "signIn" });
        return;
      }

      const { data, error } = await supabase.rpc("extension_bootstrap");
      if (error) throw error;

      // Parsed, not cast: the shape lives in another repo's SQL.
      const parsed = bootstrapSchema.safeParse(data);
      if (!parsed.success) {
        setView({ v: "signIn" });
        setFormOp({
          s: "error",
          message: "Signed in, but SuperHyre returned an account record this page does not understand. Contact SuperHyre.",
        });
        return;
      }

      if (!parsed.data.allowed) {
        // Same posture as the extension: explain it, then drop the session
        // rather than leaving a usable token for an account that may not be here.
        const blockedEmail = parsed.data.email;
        await supabase.auth.signOut();
        setView({ v: "blocked", email: blockedEmail });
        setAnnounce("This account needs a work email address.");
        return;
      }

      setFormOp(IDLE);
      setGoogleOp(IDLE);
      setPassword("");
      setView({ v: "signedIn", bootstrap: parsed.data });
      setAnnounce(`Signed in as ${parsed.data.email}.`);
    } catch (error) {
      setView({ v: "signIn" });
      setFormOp({ s: "error", message: describeAuthError(error) });
    } finally {
      resolving.current = false;
    }
  }, []);

  useEffect(() => {
    // An OAuth failure comes back in the URL, not as a thrown error. PKCE puts
    // it in the query string, the implicit flow in the hash, so check both
    // before supabase-js strips them.
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const oauthError =
      query.get("error_description") ?? query.get("error") ??
      hash.get("error_description") ?? hash.get("error");

    if (oauthError) {
      setGoogleOp({ s: "error", message: describeAuthError(oauthError.replace(/\+/g, " ")) });
      // Clear it so a refresh does not replay an error the user already saw.
      window.history.replaceState({}, "", window.location.pathname);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        void resolveSession();
      }
      if (event === "SIGNED_OUT") {
        setView({ v: "signIn" });
      }
    });

    void resolveSession();
    return () => subscription.subscription.unsubscribe();
  }, [resolveSession]);

  function clearErrors() {
    setEmailError(null);
    setPasswordError(null);
    setFormOp(IDLE);
    setGoogleOp(IDLE);
  }

  async function submitSignIn() {
    // Presence only. Length rules belong to sign-up: telling someone their
    // existing password is too short is useless and leaks what is stored.
    const eProblem = email.trim() === "" ? "Enter your work email address." : null;
    const pProblem = password === "" ? "Enter your password." : null;
    setEmailError(eProblem);
    setPasswordError(pProblem);
    if (eProblem || pProblem) return;

    setFormOp(BUSY);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setFormOp({ s: "error", message: describeAuthError(error) });
      return;
    }
    await resolveSession();
  }

  async function submitSignUp() {
    const eProblem = emailProblem(email);
    const pProblem = passwordProblem(password);
    setEmailError(eProblem);
    setPasswordError(pProblem);
    if (eProblem || pProblem) return;

    setFormOp(BUSY);
    const address = email.trim();
    const { data, error } = await supabase.auth.signUp({
      email: address,
      password,
      // Where the confirmation link returns to, when confirmations are on.
      options: { emailRedirectTo: redirectTarget() },
    });

    if (error) {
      setFormOp({ s: "error", message: describeAuthError(error) });
      return;
    }

    // A user with no session means the project requires email confirmation.
    // The account is real and unusable until the link is opened, so this is a
    // distinct outcome, not a success.
    if (!data.session) {
      setFormOp(IDLE);
      setPassword("");
      setView({ v: "checkInbox", email: address });
      setAnnounce(`Confirmation email sent to ${address}.`);
      return;
    }
    await resolveSession();
  }

  async function startGoogle() {
    setGoogleOp(BUSY);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTarget(),
        // Work-email-only means the account someone is already signed into is
        // often the wrong one. Forcing the chooser is the difference between
        // "it just rejected me" and picking the right identity.
        queryParams: { prompt: "select_account" },
      },
    });
    // Success navigates away, so only a failure to *start* lands here.
    if (error) setGoogleOp({ s: "error", message: describeAuthError(error) });
  }

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
    setEmail("");
    setPassword("");
    clearErrors();
    setView({ v: "signIn" });
    setAnnounce("Signed out.");
  }

  const formProps = {
    email,
    password,
    onEmail: (v: string) => { setEmail(v); setEmailError(null); },
    onPassword: (v: string) => { setPassword(v); setPasswordError(null); },
    emailError,
    passwordError,
    formOp,
    googleOp,
    onGoogle: startGoogle,
  };

  /* Signed in: the console replaces the whole surface rather than rendering as
     another card inside it. Returning early is the point — once you are in,
     the split brand panel has done its job and the viewport belongs to the
     product, so the shell, the frame and the decorative blocks all go with it. */
  if (view.v === "signedIn") {
    return (
      <>
        <p className="sr-only" role="status" aria-live="polite">{announce}</p>
        <Console bootstrap={view.bootstrap} onSignOut={signOut} signingOut={signingOut} />
      </>
    );
  }

  return (
    <div className="shell">
      {/* Fragments of the logo's staircase, sitting BEHIND the card so each
          one is only partly visible past its edges. A single square is one cell
          of the 2x4 mark, which makes this decoration that belongs to the brand
          rather than generic confetti. Purely visual, so it is inert and
          hidden from assistive tech. */}
      <div className="deco" aria-hidden="true">
        <i className="d1" /><i className="d2" /><i className="d3" />
        <i className="d4" /><i className="d5" /><i className="d6" />
      </div>

      <div className="frame">
        <aside className="rail">
        {/* Brand lockup, value proposition, and the rotating quote card all
            live in BrandPanel.tsx, together with their entrance motion.

            Loaded lazily so the animation library stays off the critical path:
            this is a sign-in form, and 41kB gzip of motion code has no business
            sitting in front of it. The panel is the whole left column, so the
            fallback reserves its space via .rail's own background and padding
            rather than collapsing the grid. */}
        <Suspense fallback={null}>
          <BrandPanel />
        </Suspense>
      </aside>

      <main className="panel">
        <p className="sr-only" role="status" aria-live="polite">{announce}</p>

        {view.v === "loading" && <LoadingCard />}

        {view.v === "signIn" && (
          <SignInCard
            {...formProps}
            onSubmit={submitSignIn}
            onSwitch={() => { clearErrors(); setView({ v: "signUp" }); }}
          />
        )}

        {view.v === "signUp" && (
          <SignUpCard
            {...formProps}
            onSubmit={submitSignUp}
            onSwitch={() => { clearErrors(); setView({ v: "signIn" }); }}
          />
        )}

        {view.v === "checkInbox" && (
          <CheckInboxCard
            email={view.email}
            onBack={() => { clearErrors(); setView({ v: "signIn" }); }}
          />
        )}

        {view.v === "blocked" && (
          <BlockedCard
            email={view.email}
            onBack={() => { setEmail(""); clearErrors(); setView({ v: "signIn" }); }}
          />
        )}

        </main>
      </div>
    </div>
  );
}
