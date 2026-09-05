import { EnvelopeSimple, Prohibit } from "@phosphor-icons/react";
import { Button } from "./components/Button";
import { Field, ICON_WEIGHT } from "./components/Field";
import { GoogleButton } from "./components/GoogleButton";
import { Notice } from "./components/Notice";
import { PasswordField } from "./components/PasswordField";
import { MIN_PASSWORD } from "./validate";
import type { Op } from "./types";

/* Presentational only. Every card takes what it renders and returns what the
   user did; none of them talk to Supabase. That is what makes the flows in
   App.tsx the single place auth behaviour lives. */

type FormProps = {
  email: string;
  password: string;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  emailError: string | null;
  passwordError: string | null;
  formOp: Op;
  googleOp: Op;
  onSubmit: () => void;
  onGoogle: () => void;
  onSwitch: () => void;
};

export function SignInCard(p: FormProps) {
  // Whichever path is busy locks the other: a Google redirect fired mid
  // password-submit would abandon a request the user cannot see.
  const busy = p.formOp.s === "busy" || p.googleOp.s === "busy";
  return (
    <div className="card">
      <h1 className="card-title">sign in</h1>
      <p className="card-sub">Use the work account your team was set up with.</p>

      {p.formOp.s === "error" && <Notice tone="problem">{p.formOp.message}</Notice>}
      {p.googleOp.s === "error" && <Notice tone="problem">{p.googleOp.message}</Notice>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          p.onSubmit();
        }}
        noValidate
      >
        <Field
          id="email"
          label="Work email"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="you@company.com"
          value={p.email}
          onChange={(e) => p.onEmail(e.target.value)}
          error={p.emailError}
          disabled={busy}
          spellCheck={false}
          autoFocus
        />

        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          value={p.password}
          onChange={p.onPassword}
          error={p.passwordError}
          disabled={busy}
        />

        <Button
          type="submit"
          variant="solid"
          busy={p.formOp.s === "busy"}
          busyLabel="Signing in"
          disabled={p.googleOp.s === "busy"}
        >
          Sign in
        </Button>
      </form>

      <div className="or"><span>or</span></div>

      <GoogleButton
        label="Continue with Google"
        busy={p.googleOp.s === "busy"}
        disabled={p.formOp.s === "busy"}
        onClick={p.onGoogle}
      />

      <p className="switch">
        No account yet? <button type="button" onClick={p.onSwitch} disabled={busy}>Create one</button>
      </p>
    </div>
  );
}

export function SignUpCard(p: FormProps) {
  const busy = p.formOp.s === "busy" || p.googleOp.s === "busy";
  return (
    <div className="card">
      <h1 className="card-title">create account</h1>
      <p className="card-sub">
        SuperHyre groups people by email domain, so use the address you work from.
      </p>

      {p.formOp.s === "error" && <Notice tone="problem">{p.formOp.message}</Notice>}
      {p.googleOp.s === "error" && <Notice tone="problem">{p.googleOp.message}</Notice>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          p.onSubmit();
        }}
        noValidate
      >
        <Field
          id="email"
          label="Work email"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="you@company.com"
          help="Personal addresses cannot be used."
          value={p.email}
          onChange={(e) => p.onEmail(e.target.value)}
          error={p.emailError}
          disabled={busy}
          spellCheck={false}
          autoFocus
        />

        <PasswordField
          id="password"
          label="Password"
          autoComplete="new-password"
          // Stated before submit rather than sprung as an error after it.
          help={`At least ${MIN_PASSWORD} characters.`}
          value={p.password}
          onChange={p.onPassword}
          error={p.passwordError}
          disabled={busy}
        />

        <Button
          type="submit"
          variant="solid"
          busy={p.formOp.s === "busy"}
          busyLabel="Creating account"
          disabled={p.googleOp.s === "busy"}
        >
          Create account
        </Button>
      </form>

      <div className="or"><span>or</span></div>

      <GoogleButton
        label="Continue with Google"
        busy={p.googleOp.s === "busy"}
        disabled={p.formOp.s === "busy"}
        onClick={p.onGoogle}
      />

      <p className="switch">
        Already have an account?{" "}
        <button type="button" onClick={p.onSwitch} disabled={busy}>Sign in</button>
      </p>
    </div>
  );
}

/** Supabase returned a user but no session, which means the project has email
 *  confirmation on. The account exists and cannot be used yet, so this says
 *  exactly that instead of showing a success state for a session we lack. */
export function CheckInboxCard({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="card">
      <h1 className="card-title">check your inbox</h1>
      <p className="card-sub">
        We sent a confirmation link to <strong>{email}</strong>. Open it to finish
        setting up your account, then come back here to sign in.
      </p>
      <Notice tone="quiet">
        Nothing arrived? Check spam, and confirm the address above is spelled correctly.
      </Notice>
      <Button variant="outline" onClick={onBack}>
        <EnvelopeSimple size={17} weight={ICON_WEIGHT} aria-hidden="true" />
        Back to sign in
      </Button>
    </div>
  );
}

/**
 * `extension_bootstrap()` said `allowed: false, reason: 'personal_email'`.
 *
 * Its own view rather than a red line under the email field, because retyping
 * cannot fix it: the domain itself is the problem, and the session has already
 * been discarded by the time this renders.
 */
export function BlockedCard({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="card">
      <h1 className="card-title">work email needed</h1>
      <p className="card-sub">
        <strong>{email}</strong> is a personal address. SuperHyre groups people into
        teams by email domain, which only works with an address your organization owns.
      </p>
      <Notice tone="problem">
        You have been signed out. Sign in again with your work address, or ask
        SuperHyre to add your domain.
      </Notice>
      <Button variant="outline" onClick={onBack}>
        <Prohibit size={17} weight={ICON_WEIGHT} aria-hidden="true" />
        Try another address
      </Button>
    </div>
  );
}

/* SignedInCard lived here and is gone: the signed-in state is Console.tsx now,
   which replaces the whole surface instead of rendering as one more card
   inside the sign-in shell. Removed rather than left in place because an
   unused export does not trip noUnusedLocals — it would have sat here
   compiling into the bundle with nothing rendering it. */

/** Shaped like the sign-in card that usually follows, so the panel does not
 *  jump when the session check resolves. A centred spinner on an empty page
 *  would move everything the moment it finished. */
export function LoadingCard() {
  return (
    <div className="card skeleton" aria-hidden="true">
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      <div className="sk sk-field sk-field-first" />
      <div className="sk sk-field" />
      <div className="sk sk-btn" />
    </div>
  );
}
