import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { afterMismatch, landedLine, LIVE, onWorkspaceMismatch, setTabWorkspace } from "./api/client";
import {
  activeOrg, displayNameOf, identityApi, inviteTokenFrom, onOtherTabWorkspaceChange, pendingOrgName, readable,
  rememberInvite, takeInvite, toBootstrap, workspaceChanged, workspaceChangedHere,
} from "./api/identity";
import { hashAfterWorkspaceChange } from "./nav";
import { BlockedCard, CodeCard, SignInCard } from "./Cards";
import { Console, hasStoredSession, prefetchConsole } from "./consoleChunk";
import type { LiveAccount } from "./Console";
import { finishWithRetry, onboardingApi } from "./api/onboarding";
import type { ResearchView, Setup } from "./api/onboarding";
import { landingPlace, needsSetup } from "./setup/lean/gate";
import { setupLogo } from "./setup/lean/logoDraft";
import { flight } from "./setup/lean/flight";
import type { FlightInfo } from "./setup/lean/flight";
import { finishBody } from "./setup/lean/steps";
import { markPending } from "./tour/useTour";
import type { TeamApi } from "./setup/lean/Team";
import { clearPersonalCaches } from "./clientCache";
import { errorKindOf } from "./ErrorStates";
import { sessionForScope, setSession } from "./roleStore";
import { describeAuthError } from "./authErrors";
import { redirectTarget } from "./config";
import { DEV_BOOTSTRAP, DEV_SKIP_AUTH } from "./devSession";
import { Loader } from "./components/Loader";
import { DocTitle } from "./components/DocTitle";
import { SET_UP_TITLE, SIGN_IN_TITLE } from "./pageTitle";
import { supabase } from "./supabase";
import { bootstrapSchema, BUSY, IDLE } from "./types";
import type { Op, View } from "./types";
import { emailProblem } from "./validate";

/** The set-up and the screens around it (team, invite, account error) share one canvas and Motion, so
 *  they load together and only when one is needed. */
const LeanSetup = lazy(() => import("./setup/lean/LeanSetup").then((m) => ({ default: m.LeanSetup })));
const InviteScreen = lazy(() => import("./setup/lean/SideScreens").then((m) => ({ default: m.InviteScreen })));
const AccountErrorScreen = lazy(() => import("./setup/lean/SideScreens").then((m) => ({ default: m.AccountErrorScreen })));
const WAITING = (
  <div className="boot" style={{ background: "#fff4ec" }}>
    <Loader size="lg" label="Getting things ready" />
  </div>
);
/* The console is a file of its own (consoleChunk.ts). While it arrives the page is what "Checking your session" was:
   the same loader, in the same place, on the same ground. */
const CONSOLE_WAITING = (
  <div className="boot">
    <Loader size="lg" label="Loading" />
  </div>
);
/* Someone who has signed in here before is about to be given the console: it starts arriving now, in step with
   finding out who they are, instead of after. */
if (hasStoredSession()) prefetchConsole();

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
  const [code, setCode] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Independent per action: a Google failure must not clear a code error the
  // user is still reading, and a resend must not overwrite either.
  const [formOp, setFormOp] = useState<Op>(IDLE);
  const [googleOp, setGoogleOp] = useState<Op>(IDLE);
  const [resendOp, setResendOp] = useState<Op>(IDLE);
  const [signingOut, setSigningOut] = useState(false);

  // Announced politely for screen readers, because switching card is a visual
  // change with no focus move attached to it.
  const [announce, setAnnounce] = useState("");

  // The code has been asked for: the console is the next thing they see, so it starts arriving while they type.
  useEffect(() => { if (view.v === "code") prefetchConsole(); }, [view.v]);

  // getSession() on mount and the SIGNED_IN event can both land for one
  // sign-in. Bootstrap is a cheap read either way, but running it twice makes
  // the card render, blank, and render again.
  const resolving = useRef(false);

  /* Connected to the API only: an invite link waiting to be accepted, and
     whether the person chose their personal workspace over onboarding. */
  const [invite, setInvite] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  /* The set-up was finished here (the first campaign is made): never put back in it, whatever a slow
     read of the account says for a moment. */
  const [setupDone, setSetupDone] = useState(false);
  /* Between "the set-up ended" and "the account says where they are now": a plain loader, so the console is never
     started on the workspace they have just left (and never asks for what it would be refused). */
  const [landing, setLanding] = useState(false);
  /* Set-up after sign-in, as the server keeps it: undefined until asked, null when there's
     none (an existing account), otherwise the step and what research there is. */
  const [setupInfo, setSetupInfo] = useState<{ setup: Setup | null; research: ResearchView | null } | null | undefined>(undefined);

  /** The workspace this tab last showed, so a change found while loading drops what belongs to the old one. */
  const shownWorkspace = useRef<string | null | undefined>(undefined);
  /** The person this tab last showed: a different person on the same tab starts from a clean page. */
  const shownUser = useRef<string | undefined>(undefined);

  /** `/v1/me` -> the role the console shows -> the view. */
  const loadMe = useCallback(async () => {
    const [me, setup] = await Promise.all([
      identityApi.me(),
      // Unreadable is not "none": an account whose set-up could not be read is not walked through it again.
      onboardingApi.setup().catch(() => null),
    ]);
    // Someone else signed in on this tab: nothing of the last person (chat, drafts, names on screen) may survive.
    if (shownUser.current !== undefined && shownUser.current !== me.user.id) {
      clearPersonalCaches();
      window.location.reload();
      return me;
    }
    shownUser.current = me.user.id;
    // Switched, removed or joined somewhere else: the stores must not keep the last workspace's lists on screen.
    const next = me.scope.organizationId ?? null;
    // The tab says it is on the new workspace before any store is told to read again, so what they ask is not refused.
    setTabWorkspace(me.scope.organizationId);
    if (shownWorkspace.current !== undefined && shownWorkspace.current !== next) {
      workspaceChangedHere();
      // A campaign belongs to the workspace it was made in: a link to one means nothing in the new one.
      const to = hashAfterWorkspaceChange(window.location.hash);
      if (to) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${to}`);
    }
    shownWorkspace.current = next;
    setSetupInfo(setup);
    setSession(sessionForScope(me.scope, displayNameOf(me), me.user.id));
    setView({ v: "live", me });
    return me;
  }, []);

  /* Another tab switched workspace: this one follows rather than saving into a
     workspace it isn't showing. */
  const [tabNotice, setTabNotice] = useState<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    if (!LIVE) return;
    const follow = (notice: string | null) => {
      if (notice) setTabNotice(notice);
      const was = shownWorkspace.current;
      void loadMe().then((me) => {
        if (!notice) return;
        // Said once the account is read: where they are now, or nothing if nothing moved.
        const org = activeOrg(me);
        setTabNotice(was !== (me.scope.organizationId ?? null) ? landedLine(org?.name ?? null) : null);
      }).catch(() => {});
    };
    onWorkspaceMismatch((failure) => {
      const { notice, leaveOrg } = afterMismatch(failure);
      if (!leaveOrg) return follow(notice);
      /* Removed from the organisation: never straight back to "Ask to join" it. Several
         requests in flight all hear it; the first one leaves. */
      if (leaving.current) return;
      leaving.current = true;
      setDeclined(true);
      setTabNotice(notice);
      void identityApi
        .setActiveWorkspace(null)
        .catch(() => {})
        .then(() => loadMe())
        .catch(() => {})
        .finally(() => { leaving.current = false; });
    });
    const stop = onOtherTabWorkspaceChange(() => follow(null));
    return () => { onWorkspaceMismatch(null); stop(); };
  }, [loadMe]);
  useEffect(() => {
    if (!tabNotice) return;
    const t = window.setTimeout(() => setTabNotice(null), 8000);
    return () => window.clearTimeout(t);
  }, [tabNotice]);

  /* They asked to join a team and are carrying on in Personal. An approval can land at any moment, and set-up
     ends by joining: look again while it is waiting, and open the team when it comes. */
  const [asked, setAsked] = useState(false);
  const waitingOnTeam = asked || (view.v === "live" && pendingOrgName(view.me) !== null);
  useEffect(() => {
    if (!LIVE || view.v !== "live" || setupDone || !waitingOnTeam) return;
    if (!needsSetup(view.me, setupInfo, declined)) return;
    let on = true;
    const look = async () => {
      if (document.hidden) return;
      try {
        const me = await identityApi.me();
        const org = me.workspaces.find((w) => w.kind === "org");
        if (on && org && !needsSetup(me, setupInfo, declined)) {
          // The approval is the arrival: the scene says "you're in" and lands them in the team.
          await joinedTeam({ kind: "request", org: org.name, logoUrl: org.logoUrl, person: displayNameOf(me) });
        }
      } catch { /* the next look tries again */ }
    };
    const timer = window.setInterval(() => void look(), 15_000);
    window.addEventListener("focus", look);
    return () => { on = false; window.clearInterval(timer); window.removeEventListener("focus", look); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingOnTeam, view, setupInfo, declined, setupDone]);

  const enterLive = useCallback(async () => {
    try {
      const me = await loadMe();
      const token = takeInvite();
      if (token) setInvite(token);
      setAnnounce(`Signed in as ${me.user.email}.`);
    } catch (error) {
      setView({ v: "accountError", message: readable(error), kind: (() => { const k = errorKindOf(error); return k && k !== "connector" ? k : "server"; })() });
    }
  }, [loadMe]);

  /* The team question inside set-up (server calls), and what happens when it ends in a team: the
     set-up is over (remembered, so leaving that team never walks them through it again) and the
     console opens on the organisation. */
  const joinedTeam = useCallback(async (how?: FlightInfo) => {
    // Arriving is a short scene, not a jump: it is already up when they joined here (the set-up puts it up on the
    // click), and is put up now when the arrival came from somewhere else (a request that was approved).
    if (how) flight.begin(how);
    setLanding(true);
    try {
      await onboardingApi.done().catch(() => {});
      // The account first (it says which workspace they are in), then the console: no request goes out for the old one.
      const me = await loadMe().catch(() => null);
      window.location.hash = "#/";
      workspaceChanged();
      setSetupDone(true);
      setLanding(false);
      if (me) {
        markPending(me.user.id);
        flight.update({ logoUrl: me.workspaces.find((w) => w.kind === "org")?.logoUrl ?? null });
      }
    } finally {
      // The console is mounted behind the scene now: it fades once its minimum time has passed.
      flight.ready();
    }
  }, [loadMe]);
  const teamApi = useMemo<TeamApi>(
    () => ({
      invitations: onboardingApi.invitations,
      byDomain: onboardingApi.organisationByDomain,
      lookup: onboardingApi.lookupOrganisation,
      accept: async (id, fullName) => {
        await onboardingApi.acceptInvitation(id, fullName);
      },
      join: async (id, fullName) => {
        const r = await onboardingApi.joinOrganisation(id, fullName);
        if (r.status === "joined") return "joined";
        setAsked(true);
        return "requested";
      },
      joined: () => void joinedTeam(),
    }),
    [joinedTeam],
  );

  /** Session -> tenancy -> view. `extension_bootstrap()` is the authority on
   *  whether this account may be here at all, so its answer decides the card. */
  const resolveSession = useCallback(async () => {
    if (resolving.current) return;
    resolving.current = true;
    try {
      /* Development: straight to the signed-in surface, no session and no RPC.

         Deliberately the FIRST thing in here, ahead of getSession(), so the
         dev server needs no Supabase reachability at all — the console renders
         offline, on a dead network, or against a project whose keys have
         rotated. See devSession.ts for why this cannot reach production. */
      if (DEV_SKIP_AUTH) {
        if (LIVE) {
          await enterLive();
          return;
        }
        setView({ v: "signedIn", bootstrap: DEV_BOOTSTRAP });
        setAnnounce("Development mode: authentication skipped.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setView({ v: "signIn" });
        return;
      }

      if (LIVE) {
        setFormOp(IDLE);
        setGoogleOp(IDLE);
        setCode("");
        await enterLive();
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
      setCode("");
      setView({ v: "signedIn", bootstrap: parsed.data });
      setAnnounce(`Signed in as ${parsed.data.email}.`);
    } catch (error) {
      setView({ v: "signIn" });
      setFormOp({ s: "error", message: describeAuthError(error) });
    } finally {
      resolving.current = false;
    }
  }, [enterLive]);

  useEffect(() => {
    /* An invite link survives sign-in in session storage: Google sends the
       browser back to the page without its hash. */
    const token = LIVE ? inviteTokenFrom(window.location.hash) : null;
    if (token) rememberInvite(token);
    if (!LIVE) return;
    /* An invite link opened in a tab that's already signed in shows at once, not after a reload. */
    const onHash = () => {
      const next = inviteTokenFrom(window.location.hash);
      if (next) setInvite(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    /* Development: resolve once and subscribe to nothing.

       Skipping the subscription is not an optimisation, it is the fix for a
       bug this bypass introduced and which cost a confusing round of "why is
       the sign-in card still up". A session left in localStorage by earlier
       real testing keeps living here: supabase-js tries to refresh it on
       mount, the refresh fails once it has expired, and the resulting
       SIGNED_OUT event set the view back to signIn — overriding the bypass
       that had already put the console on screen. Whoever had signed in for
       real most recently therefore got a different dev experience from
       everyone else, an hour later.

       Nothing below is wanted in dev anyway: there is no OAuth return to
       parse when no OAuth happens. */
    if (DEV_SKIP_AUTH) {
      void resolveSession();
      return;
    }

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
    setCodeError(null);
    setFormOp(IDLE);
    setGoogleOp(IDLE);
    setResendOp(IDLE);
  }

  /**
   * Step one: ask for a code.
   *
   * `shouldCreateUser` is left at its default of true on purpose. There is no
   * separate sign-up step any more, so the first code sent to a work address
   * IS the account, and `core.reject_free_email` is what decides whether that
   * address is allowed. That hook runs Before-User-Created, so a consumer
   * domain is refused before any row exists and never receives a code.
   *
   * emailRedirectTo still matters even though the user is going to type the
   * code: Supabase puts BOTH a magic link and a code in the same mail, and a
   * link pointing at the wrong origin is a dead end for anyone who clicks it
   * out of habit.
   */
  async function requestCode() {
    const problem = emailProblem(email);
    setEmailError(problem);
    if (problem) return;

    setFormOp(BUSY);
    const address = email.trim();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirectTarget() },
    });

    if (error) {
      setFormOp({ s: "error", message: describeAuthError(error) });
      return;
    }
    setFormOp(IDLE);
    setCode("");
    setCodeError(null);
    setView({ v: "code", email: address });
    setAnnounce(`A sign-in code was sent to ${address}.`);
  }

  /** Step two: exchange the typed code for a session. */
  async function submitCode(address: string) {
    const entered = code.replace(/\s+/g, "");
    if (entered === "") {
      setCodeError("Enter the code from your email.");
      return;
    }
    setCodeError(null);
    setFormOp(BUSY);

    // `type: "email"` is the typed-code variant. "magiclink" verifies the
    // token out of a clicked link instead and rejects a code entered by hand.
    const { error } = await supabase.auth.verifyOtp({
      email: address,
      token: entered,
      type: "email",
    });

    if (error) {
      setFormOp({ s: "error", message: describeAuthError(error) });
      return;
    }
    setFormOp(IDLE);
    await resolveSession();
  }

  async function resendCode(address: string) {
    setResendOp(BUSY);
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirectTarget() },
    });
    setResendOp(error
      ? { s: "error", message: describeAuthError(error) }
      : { s: "done", message: `A new code is on its way to ${address}.` });
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
    // What this browser kept for them goes too, so the next person on it starts clean.
    clearPersonalCaches();
    setSigningOut(false);
    setEmail("");
    setCode("");
    clearErrors();
    setView({ v: "signIn" });
    setAnnounce("Signed out.");
    // A fresh page, not just a fresh view: every in-memory store (chat, candidates, forms) goes with it.
    window.location.hash = "#/";
    window.location.reload();
  }

  /** Off the invite link, so a reload does not offer it again. */
  function leaveInvite() {
    setInvite(null);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/`);
  }

  async function switchWorkspace(organizationId: string | null) {
    await identityApi.setActiveWorkspace(organizationId);
    // From here every request is for the workspace they chose; the stores that read again are not refused.
    setTabWorkspace(organizationId);
    workspaceChanged();
    await loadMe();
  }

  /* Booting: the session check is async, so the very first paint happens
     before we know whether anyone is signed in. Rendering the sign-in shell
     during that window meant a reload flashed the entire marketing split
     panel at an already-authenticated user, then replaced it with the console,
     which reads as being logged out and bounced back in.

     A skeleton card did not fix it, because the card was inside the shell: the
     brand panel, the quote and the deco blocks all still painted. The fix is
     returning before the shell exists at all.

     formProps lived here and is gone with the password fields it carried: the
     two remaining cards take different props, so a shared bag would have to be
     widened to the union of both and then destructured back apart. */
  if (view.v === "loading") {
    return (
      <div className="boot">
        <Loader size="lg" label="Checking your session" />
      </div>
    );
  }

  /* Signed in: the console replaces the whole surface rather than rendering as
     another card inside it. Returning early is the point — once you are in,
     the split brand panel has done its job and the viewport belongs to the
     product, so the shell, the frame and the decorative blocks all go with it. */
  /* Setting up after sign-in takes the whole screen: a new organisation's first person, or one who
     started and hasn't finished (the organisation may already exist by then). So do the cases around
     it: a team that is already here, a request waiting, an invite, a personal address, a load error. */
  if (view.v === "accountError") {
    return (
      <Suspense fallback={WAITING}>
        <AccountErrorScreen kind={view.kind} message={view.message} onRetry={enterLive} onSignOut={() => void signOut()} />
      </Suspense>
    );
  }
  if (view.v === "live" && landing) {
    return (
      <div className="boot">
        <Loader size="lg" label="Getting things ready" />
      </div>
    );
  }
  if (view.v === "live" && invite) {
    const me = view.me;
    return (
      <Suspense fallback={WAITING}>
        <DocTitle title={SET_UP_TITLE} />
        <InviteScreen
          token={invite}
          email={me.user.email}
          memberOf={me.onboarding.memberOf}
          memberRole={me.workspaces.find((w) => w.kind === "org")?.role ?? null}
          knownName={!!me.user.fullName?.trim()}
          onAccept={async (fullName) => {
            await identityApi.acceptInvite(invite, fullName);
            // The account is read while the invite is still on screen, so the console starts in the organisation.
            const me = await loadMe();
            markPending(me.user.id);
            flight.update({ logoUrl: me.workspaces.find((w) => w.kind === "org")?.logoUrl ?? null });
            leaveInvite();
            workspaceChanged();
            flight.ready();
          }}
          onSkip={leaveInvite}
          onSignOut={() => { leaveInvite(); void signOut(); }}
        />
      </Suspense>
    );
  }
  if (view.v === "live" && setupInfo !== undefined && LIVE) {
    const me = view.me;
    if (!setupDone && needsSetup(me, setupInfo, declined)) {
      const kept = (setupInfo?.setup?.answers as Record<string, unknown> | undefined)?.lean;
      const o = me.onboarding;
      return (
        <Suspense fallback={WAITING}>
          <DocTitle title={SET_UP_TITLE} />
          <LeanSetup
            mode="live"
            account={{
              name: me.user.fullName?.trim() ?? "",
              team: { personalEmail: o.personalEmail, domain: o.domain, pending: pendingOrgName(me) },
            }}
            resume={kept}
            team={teamApi}
            onSignOut={() => { setupLogo.set(null); void signOut(); }}
            onSave={(saved) => void onboardingApi.lean(saved).catch(() => {})}
            onFinish={async (answers) => {
              const body = finishBody(answers);
              if (!body) throw new Error("Something is missing from your answers. Go back and check them.");
              // Quick on the server (the first search starts in the background); safe to repeat, so a slow
              // or dropped attempt is made again and returns the same ids.
              // The logo they added, if any, goes with the organisation it is for (never for Personal).
              const logo = answers.team?.kind === "create" ? setupLogo.get() : null;
              const made = await finishWithRetry(logo ? { ...body, logo } : body);
              setupLogo.set(null);
              // The console opens on the new campaign's chat, so the first search is the first thing seen.
              return { hash: `#/agent?campaign=${made.campaignId}`, conversationId: made.conversationId, organisationId: made.organisationId };
            }}
            onComplete={async (done) => {
              setLanding(true);
              try {
                // The account decides where they are (a new organisation, Personal, or one they were let into
                // meanwhile); only then does the console start, on a page that exists there.
                const me = await loadMe().catch(() => null);
                const there = landingPlace(done, me ? (me.scope.organizationId ?? null) : undefined);
                window.location.hash = there === "campaign" ? done.hash : "#/";
                workspaceChanged();
                setSetupInfo((s) => (s?.setup ? { ...s, setup: { ...s.setup, step: "done", completedAt: new Date().toISOString() } } : s));
                setSetupDone(true);
                setLanding(false);
                if (me) {
                  // Set-up is over: the console shows them around, once.
                  markPending(me.user.id);
                  flight.update({ logoUrl: me.workspaces.find((w) => w.kind === "org")?.logoUrl ?? null });
                }
                // After the workspace is the right one: the chat is opened and shows the run.
                if (there === "campaign" && done.conversationId) {
                  /* The chat's module is the console's, not the sign-in's: fetched here, where it is first needed. */
                  const chat = done.conversationId;
                  void import("./liveChat").then((m) => m.openChat(chat));
                }
              } finally {
                // A new organisation's arrival scene (set-up put it up) fades once the console is drawn behind it.
                flight.ready();
              }
            }}
          />
        </Suspense>
      );
    }
  }

  if (view.v === "live") {
    const me = view.me;
    const live: LiveAccount = { me, reload: async () => { await loadMe(); }, switchWorkspace, say: setTabNotice };
    return (
      <>
        <p className="sr-only" role="status" aria-live="polite">{announce}</p>
        {tabNotice && <p className="tab-notice" role="status">{tabNotice}</p>}
        {/* Keyed by workspace: switching remounts every page, so each loads
            the new workspace's data rather than showing the last one's. */}
        <Suspense fallback={CONSOLE_WAITING}>
          <Console
            key={me.scope.organizationId ?? "personal"}
            bootstrap={toBootstrap(me)}
            live={live}
            onSignOut={signOut}
            signingOut={signingOut}
          />
        </Suspense>
      </>
    );
  }

  if (view.v === "signedIn") {
    return (
      <>
        <p className="sr-only" role="status" aria-live="polite">{announce}</p>
        <Suspense fallback={CONSOLE_WAITING}>
          <Console bootstrap={view.bootstrap} onSignOut={signOut} signingOut={signingOut} />
        </Suspense>
      </>
    );
  }

  return (
    <div className="shell">
      <DocTitle title={SIGN_IN_TITLE} />
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
        {tabNotice && <p className="tab-notice" role="status">{tabNotice}</p>}

        {view.v === "signIn" && (
          <SignInCard
            email={email}
            onEmail={(v) => { setEmail(v); setEmailError(null); }}
            emailError={emailError}
            formOp={formOp}
            googleOp={googleOp}
            onSubmit={requestCode}
            onGoogle={startGoogle}
          />
        )}

        {view.v === "code" && (
          <CodeCard
            email={view.email}
            code={code}
            onCode={(v) => { setCode(v); setCodeError(null); }}
            codeError={codeError}
            formOp={formOp}
            resendOp={resendOp}
            onSubmit={() => void submitCode(view.email)}
            onResend={() => void resendCode(view.email)}
            onBack={() => { clearErrors(); setCode(""); setView({ v: "signIn" }); }}
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
