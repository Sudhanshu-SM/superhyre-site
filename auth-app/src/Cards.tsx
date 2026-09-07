import { ArrowLeft, Prohibit } from "@phosphor-icons/react";
import { Button } from "./components/Button";
import { Field, ICON_WEIGHT } from "./components/Field";
import { GoogleButton } from "./components/GoogleButton";
import { Notice } from "./components/Notice";
import type { Op } from "./types";

/* Presentational only. Every card takes what it renders and returns what the
   user did; none of them talk to Supabase. That is what makes the flows in
   App.tsx the single place auth behaviour lives.

   ── TWO WAYS IN, NO PASSWORD ────────────────────────────────────────────────
   A one-time code to a work address, or Google. Password sign-in and the whole
   sign-up card are gone: there is no password stored, so there is nothing to
   leak, reset, or rate-limit, and no "create an account" step at all -- the
   first code sent to a work domain IS the account. `core.reject_free_email`
   still enforces the work-domain rule server-side either way.
*/

type EmailStepProps = {
  email: string;
  onEmail: (v: string) => void;
  emailError: string | null;
  formOp: Op;
  googleOp: Op;
  onSubmit: () => void;
  onGoogle: () => void;
};

export function SignInCard(p: EmailStepProps) {
  // Whichever path is busy locks the other: a Google redirect fired mid
  // request would abandon a code the user cannot see was sent.
  const busy = p.formOp.s === "busy" || p.googleOp.s === "busy";

  return (
    <form
      className="card"
      onSubmit={(e) => { e.preventDefault(); p.onSubmit(); }}
      noValidate
    >
      <h1 className="card-title">sign in</h1>
      <p className="card-sub">
        Use your work email. We send a code, so there is no password to
        remember.
      </p>

      {p.formOp.s === "error" && <Notice tone="problem">{p.formOp.message}</Notice>}
      {p.googleOp.s === "error" && <Notice tone="problem">{p.googleOp.message}</Notice>}

      <Field
        id="email"
        label="Work email"
        type="email"
        value={p.email}
        onChange={(e) => p.onEmail(e.target.value)}
        error={p.emailError}
        autoComplete="email"
        autoFocus
        placeholder="you@company.com"
        disabled={busy}
      />

      <Button variant="solid" type="submit" busy={p.formOp.s === "busy"}
              busyLabel="Sending" disabled={busy}>
        Send me a code
      </Button>

      <div className="or"><span>or</span></div>

      <GoogleButton onClick={p.onGoogle} busy={p.googleOp.s === "busy"} disabled={busy}
                    label="Continue with Google" />
    </form>
  );
}

type CodeStepProps = {
  email: string;
  code: string;
  onCode: (v: string) => void;
  codeError: string | null;
  formOp: Op;
  resendOp: Op;
  onSubmit: () => void;
  onResend: () => void;
  onBack: () => void;
};

/**
 * The code step.
 *
 * The field is `inputMode="numeric"` with `autoComplete="one-time-code"`, which
 * is what lets iOS and Android offer the code from the notification instead of
 * making someone switch apps and memorise eight digits. It is NOT `type=number`
 * -- that strips leading zeros and shows a spinner on a value that is not a
 * quantity.
 */
export function CodeCard(p: CodeStepProps) {
  const busy = p.formOp.s === "busy" || p.resendOp.s === "busy";

  return (
    <form
      className="card"
      onSubmit={(e) => { e.preventDefault(); p.onSubmit(); }}
      noValidate
    >
      <h1 className="card-title">check your email</h1>
      <p className="card-sub">
        We sent a code to <strong>{p.email}</strong>. It is good for an hour.
      </p>

      {p.formOp.s === "error" && <Notice tone="problem">{p.formOp.message}</Notice>}
      {p.resendOp.s === "error" && <Notice tone="problem">{p.resendOp.message}</Notice>}
      {p.resendOp.s === "done" && <Notice tone="quiet">{p.resendOp.message}</Notice>}

      <Field
        id="code"
        label="Sign-in code"
        type="text"
        value={p.code}
        onChange={(e) => p.onCode(e.target.value)}
        error={p.codeError}
        autoComplete="one-time-code"
        inputMode="numeric"
        autoFocus
        placeholder="12345678"
        disabled={busy}
      />

      <Button variant="solid" type="submit" busy={p.formOp.s === "busy"}
              busyLabel="Checking" disabled={busy}>
        Sign in
      </Button>

      {/* Reuses .switch rather than a new class: it already carries the
          considered treatment for a secondary action in a card -- underlined
          in ink rather than coloured, because a 14px orange link on white is
          3.51:1 and fails AA. Two actions, so the row splits them. */}
      <p className="switch switch-split">
        <button type="button" onClick={p.onResend} disabled={busy}>
          Send another code
        </button>
        <button type="button" className="switch-link" onClick={p.onBack} disabled={busy}>
          <ArrowLeft size={13} weight={ICON_WEIGHT} aria-hidden="true" />
          Use a different address
        </button>
      </p>
    </form>
  );
}

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

/* CheckInboxCard and LoadingCard lived here and are gone.
   CheckInbox was the confirm-your-address step that password sign-up needed;
   CodeCard is the whole flow now. LoadingCard became unreachable when the boot
   loader started returning before the sign-in shell, and an unused export does
   not trip noUnusedLocals -- it would have sat here compiling into the bundle
   with nothing rendering it. */
