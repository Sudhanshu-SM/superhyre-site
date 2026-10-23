import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, setTabWorkspace } from "./api/client";
import { activeOrg, identityApi, pendingOrgName, readable, workspaceChanged } from "./api/identity";
import { onboardingApi } from "./api/onboarding";
import type { OrgMatch } from "./api/onboarding";
import type { JoinPolicy, PersonalImportOffer, Workspace } from "./api/identity";
import { useToast } from "./Contacts";
import type { LiveAccount } from "./Console";
import { settingsSectionFromHash } from "./nav";
import { DocTitle } from "./components/DocTitle";
import { pageTitle } from "./pageTitle";
import type { SettingsSection } from "./nav";
import { LogoPicker } from "./LogoPicker";
import { isUploadedLogo } from "./logoImage";
import { canonicalZone } from "./schedulesView";
import { SettingsConnections } from "./SettingsConnections";
import { nameFromDomain } from "./setup/lean/steps";
import {
  importedLine, importOfferLine, isolationLine, joinOfferButton, joinOfferLine, joinPolicyLabel, requestSentLine, ROLE_LABEL,
} from "./membership";
import "./newcampaign.css";
import "./workspace.css";
import "./settings.css";
import { Loader } from "./components/Loader";
import { SupportPage } from "./SupportPage";
import { ShimmerRegion, ShimmerText } from "./components/Shimmer";

/**
 * Settings, connected to the API: one short list on the left and one panel
 * on the right. The people and teams are on the Teams page now. Organisation
 * is where an owner or admin edits it, and where someone in Personal starts one
 * (or, being in one already, goes back to it).
 */

const LABEL: Record<SettingsSection, string> = {
  profile: "Profile",
  organisation: "Organisation",
  connections: "Connections",
  support: "Support",
};

const SECTIONS: readonly SettingsSection[] = ["profile", "organisation", "connections", "support"];

function useSection(): SettingsSection | null {
  const [at, setAt] = useState(() => settingsSectionFromHash(window.location.hash));
  useEffect(() => {
    const on = () => setAt(settingsSectionFromHash(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return at;
}

export function SettingsPage({ account, onAgent }: {
  account: LiveAccount;
  /** Hands words to the agent and opens it, sent at once: how "Send me a test email" gets to its card. */
  onAgent?: (text: string) => void;
}) {
  const org = activeOrg(account.me);
  const manages = org?.role === "owner" || org?.role === "admin";
  const active = account.me.workspaces.find((w) => w.active);
  /* Organisation is where it is managed (a recruiter reads it) and, from Personal, where one is started or gone back to. */
  const sections = SECTIONS;
  const asked = useSection();
  const section = asked && sections.includes(asked) ? asked : "profile";

  return (
    <div className="cw st">
      <DocTitle title={pageTitle({ route: "settings", section })} />
      <header className="cw-head">
        <div className="cw-head-t">
          <h1 className="cw-h1">Settings</h1>
          {active && <p className="st-iso t-body-sm">{isolationLine(active)}</p>}
        </div>
      </header>

      <div className="st-body">
        <nav className="st-nav" aria-label="Settings">
          {sections.map((id) => (
            <a
              key={id}
              href={`#/settings/${id}`}
              className={`st-nav-i${id === section ? " is-on" : ""}`}
              aria-current={id === section ? "page" : undefined}
            >
              {LABEL[id]}
            </a>
          ))}
        </nav>

        <section className="st-panel" aria-label={LABEL[section]}>
          {section === "profile" ? (
            <Profile key={account.me.user.id} account={account} />
          ) : section === "organisation" && org ? (
            <Organisation key={org.organizationId} account={account} org={org} manages={manages} />
          ) : section === "organisation" ? (
            <StartOrganisation account={account} />
          ) : section === "support" ? (
            <SupportPage account={{ name: account.me.user.fullName ?? "", email: account.me.user.email }} />
          ) : (
            <SettingsConnections canManage={!org || manages} {...(onAgent ? { onAgent } : {})} />
          )}
        </section>
      </div>
    </div>
  );
}

/** A labelled field in the settings forms. */
export function Fld({ id, label, hint, error, children }: {
  id: string; label: string; hint?: string; error?: string | null; children: ReactNode;
}) {
  return (
    <div className={`ncx-f${error ? " is-bad" : ""}`}>
      <label className="ncx-l" htmlFor={id}>{label}</label>
      {children}
      {error ? <small className="ncx-err" role="alert">{error}</small> : hint ? <small className="ncx-hint" id={`${id}-hint`}>{hint}</small> : null}
    </div>
  );
}

/** The zones to choose from, each under the name people use for it (Asia/Kolkata, not the browser's Asia/Calcutta). */
function timeZones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set([...all, current].map(canonicalZone))].sort((a, b) => a.localeCompare(b, "en"));
}

/** The longest name the server keeps. */
const NAME_MAX = 120;

function Profile({ account }: { account: LiveAccount }) {
  const { user } = account.me;
  const saved = { fullName: user.fullName ?? "", timeZone: canonicalZone(user.timeZone), emailSignature: user.emailSignature ?? "" };
  const [d, setD] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const zones = useMemo(() => timeZones(user.timeZone), [user.timeZone]);
  const dirty = d.fullName !== saved.fullName || d.timeZone !== saved.timeZone || d.emailSignature !== saved.emailSignature;
  const nameError = !d.fullName.trim() ? "Add your name." : d.fullName.trim().length > NAME_MAX ? `Keep it under ${NAME_MAX} characters.` : null;

  const save = async () => {
    if (nameError || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      await identityApi.updateSettings({
        fullName: d.fullName.trim(),
        timeZone: d.timeZone,
        emailSignature: d.emailSignature.trim() || null,
      });
      await account.reload();
      toast("Profile saved");
    } catch (err) {
      setD(saved);
      setError(readable(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="st-sec" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <h2 className="st-h t-title-sm">Profile</h2>
      <div className="ncx-grid">
        <Fld id="st-name" label="Name" error={d.fullName === saved.fullName ? null : nameError}>
          <input id="st-name" className="ncx-in" value={d.fullName} autoComplete="name" maxLength={NAME_MAX}
            aria-invalid={d.fullName !== saved.fullName && !!nameError}
            onChange={(e) => setD({ ...d, fullName: e.target.value })} />
        </Fld>
        <div className="ncx-f">
          <span className="ncx-l">Email</span>
          <p className="st-read t-body">{user.email}</p>
        </div>
        <Fld id="st-tz" label="Time zone" hint="Sends and reminders follow it.">
          <select id="st-tz" className="ncx-in" value={d.timeZone} aria-describedby="st-tz-hint"
            onChange={(e) => setD({ ...d, timeZone: e.target.value })}>
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </Fld>
        <div className="is-wide">
          <Fld id="st-sig" label="Email signature" hint="Added to the end of emails you send from SuperHyre.">
            <textarea id="st-sig" className="ncx-in is-area" rows={4} value={d.emailSignature} maxLength={2000}
              aria-describedby="st-sig-hint" onChange={(e) => setD({ ...d, emailSignature: e.target.value })} />
          </Fld>
        </div>
      </div>
      <footer className="st-foot">
        {error ? <span className="st-err t-body-sm" role="alert">{error}</span> : <span />}
        <button type="submit" className="ncx-btn is-primary" disabled={!dirty || !!nameError || busy} aria-busy={busy || undefined}>
          {busy ? <><Loader size="sm" tone="inherit" />Saving</> : "Save"}
        </button>
      </footer>
    </form>
  );
}

/**
 * Nothing is copied from a person's own space into an organisation when they join. If they have
 * candidates saved in Personal, this one line lets them choose to copy them; Personal keeps its own.
 */
function PersonalImport({ account, org }: { account: LiveAccount; org: Workspace }) {
  const user = account.me.user.id;
  const key = `superhyre.import-personal.${user}.${org.organizationId}`;
  const [offer, setOffer] = useState<PersonalImportOffer | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return window.localStorage.getItem(key) === "1"; } catch { return false; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => {
    let live = true;
    identityApi.personalImportOffer().then((o) => { if (live) setOffer(o); }, () => {});
    return () => { live = false; };
  }, [org.organizationId]);
  const line = importOfferLine(offer, org.name, dismissed);
  if (!line) return error ? <p className="st-err t-body-sm" role="alert">{error}</p> : null;
  const copy = async () => {
    setBusy(true);
    setError(null);
    try {
      const done = await identityApi.importPersonal();
      toast(importedLine(done.candidates, org.name, done.skipped));
      setOffer(offer ? { ...offer, imported: true } : offer);
    } catch (err) {
      setError(readable(err));
    } finally {
      setBusy(false);
    }
  };
  const later = () => {
    try { window.localStorage.setItem(key, "1"); } catch { /* it asks again next time */ }
    setDismissed(true);
  };
  return (
    <div className="st-import">
      <p className="st-quiet t-body">{line}</p>
      <p className="st-acts">
        <button type="button" className="ncx-btn is-primary is-sm" disabled={busy} onClick={() => void copy()}>
          {busy ? <><Loader size="sm" tone="inherit" />Copying</> : "Copy them"}
        </button>
        <button type="button" className="ncx-btn is-sm" disabled={busy} onClick={later}>Not now</button>
      </p>
      {error && <p className="st-err t-body-sm" role="alert">{error}</p>}
    </div>
  );
}

function Organisation({ account, org, manages }: { account: LiveAccount; org: Workspace; manages: boolean }) {
  if (!manages) {
    /* A recruiter reads the organisation; changing it is for owners and admins. */
    return (
      <div className="st-sec">
        <h2 className="st-h t-title-sm">Organisation</h2>
        <p className="st-read t-body">{org.name}</p>
        <p className="st-quiet t-body-sm">Admins of {org.name} manage its name, logo and who can join.</p>
        <PersonalImport account={account} org={org} />
      </div>
    );
  }
  return <OrganisationForm account={account} org={org} />;
}

function OrganisationForm({ account, org }: { account: LiveAccount; org: Workspace }) {
  /* An uploaded logo is not a link to type: the link field stays empty and the picture is shown beside it. */
  const uploaded = isUploadedLogo(org.logoUrl);
  const saved = { name: org.name, logoUrl: uploaded ? "" : (org.logoUrl ?? "") };
  const [d, setD] = useState(saved);
  /* A picture chosen here and not saved yet (a data URL, already cropped and shrunk). */
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<JoinPolicy>(org.joinPolicy ?? "domain_direct");
  const toast = useToast();
  const n = d.name.trim();
  const logo = d.logoUrl.trim();
  const nameError = n.length < 2 || n.length > 80 ? "Use 2 to 80 characters." : null;
  const logoError = logo && !/^https?:\/\/\S+\.\S+/.test(logo) ? "Use a full web address, starting with https://." : null;
  const linkChanged = d.logoUrl !== saved.logoUrl;
  const dirty = d.name !== saved.name || linkChanged || picked !== null;

  const save = async () => {
    if (nameError || logoError || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      /* Only what changed is sent: a saved picture is never replaced by an empty link field. The picture goes
         last, so a link typed beside it cannot undo it. */
      const patch: { name?: string; logoUrl?: string | null } = {};
      if (d.name !== saved.name) patch.name = n;
      if (linkChanged && picked === null) patch.logoUrl = logo || null;
      if (Object.keys(patch).length) await identityApi.updateOrganisation(patch);
      if (picked !== null) await identityApi.setOrganisationLogo(picked);
      setPicked(null);
      await account.reload();
      toast("Organisation saved");
    } catch (err) {
      setD(saved);
      setError(readable(err));
    } finally {
      setBusy(false);
    }
  };

  const removeLogo = async () => {
    setBusy(true);
    setError(null);
    try {
      await identityApi.removeOrganisationLogo();
      setD({ ...d, logoUrl: "" });
      await account.reload();
      toast("Logo removed");
    } catch (err) {
      setError(readable(err));
    } finally {
      setBusy(false);
    }
  };

  /* Saved as it is switched: it is one choice, and it takes effect for the next person who asks. */
  const flip = async () => {
    const next: JoinPolicy = policy === "domain_direct" ? "approval" : "domain_direct";
    setPolicy(next);
    setError(null);
    try {
      await identityApi.updateOrganisation({ joinPolicy: next });
      await account.reload();
      toast(next === "domain_direct" ? "People on your domain now join without approval" : "People now ask, and you approve");
    } catch (err) {
      setPolicy(policy);
      setError(readable(err));
    }
  };

  return (
    <form className="st-sec" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <h2 className="st-h t-title-sm">Organisation</h2>
      <div className="ncx-grid">
        <Fld id="st-org" label="Name" error={dirty ? nameError : null}>
          <input id="st-org" className="ncx-in" value={d.name} autoComplete="organization"
            onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Fld>
        <Fld id="st-logo" label="Logo link" hint="Or paste the address of an image." error={logoError}>
          <input id="st-logo" className="ncx-in" type="url" value={d.logoUrl} placeholder="https://"
            aria-describedby="st-logo-hint" aria-invalid={logoError ? true : undefined}
            onChange={(e) => { setPicked(null); setD({ ...d, logoUrl: e.target.value }); }} />
        </Fld>
        <div className="ncx-f is-wide">
          <LogoPicker
            name={d.name || org.name}
            saved={linkChanged ? (logo || null) : (org.logoUrl ?? null)}
            picked={picked}
            busy={busy}
            onPick={(url) => { setPicked(url); setD({ ...d, logoUrl: saved.logoUrl }); }}
            onDiscard={() => setPicked(null)}
            onRemove={() => void removeLogo()}
          />
        </div>
        {org.domain ? (
          <button type="button" role="switch" aria-checked={policy === "domain_direct"}
            className={`ncx-toggle${policy === "domain_direct" ? " is-on" : ""}`} onClick={() => void flip()}>
            <span className="ncx-toggle-t">
              <strong className="t-body-strong">{joinPolicyLabel(org.domain)}</strong>
              <span className="t-body-sm">When this is off, they ask to join and an owner or admin approves.</span>
            </span>
            <span className="ncx-switch" aria-hidden="true"><span /></span>
          </button>
        ) : (
          <p className="st-toggle-note t-body-sm">
            Nobody can join {org.name} by email domain. People come in by invitation, or by asking to join.
          </p>
        )}
      </div>
      <PersonalImport account={account} org={org} />
      <footer className="st-foot">
        {error ? <span className="st-err t-body-sm" role="alert">{error}</span> : <span />}
        <button type="submit" className="ncx-btn is-primary" disabled={!dirty || !!nameError || !!logoError || busy} aria-busy={busy || undefined}>
          {busy ? <><Loader size="sm" tone="inherit" />Saving</> : "Save"}
        </button>
      </footer>
    </form>
  );
}

/**
 * Organisation, seen from Personal. In none yet: start one, which makes this person its owner. In one
 * already (a person is in at most one): say so and take them there, since it can only be managed from inside.
 */
function StartOrganisation({ account }: { account: LiveAccount }) {
  const { me } = account;
  const member = me.workspaces.find((w) => w.kind === "org");
  const suggested = me.onboarding.personalEmail ? "" : nameFromDomain(me.onboarding.domain);
  const [name, setName] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The organisation already on their work address, if one is: asking to join it comes before starting another.
     Undefined while that is being looked up. */
  const [found, setFound] = useState<OrgMatch | null | undefined>(undefined);
  const [sent, setSent] = useState<string | null>(pendingOrgName(me));
  useEffect(() => {
    if (member || me.onboarding.personalEmail) { setFound(null); return; }
    let live = true;
    onboardingApi.organisationByDomain().then((m) => { if (live) setFound(m); }, () => { if (live) setFound(null); });
    return () => { live = false; };
  }, [member, me.onboarding.personalEmail]);
  const n = name.trim();
  const ready = n.length >= 2 && n.length <= 80;

  if (member) {
    return (
      <div className="st-sec">
        <h2 className="st-h t-title-sm">Organisation</h2>
        <p className="st-quiet t-body">
          You're {member.role === "admin" ? "an admin" : member.role === "owner" ? "the owner" : "a recruiter"} at {member.name}. {member.name}'s
          campaigns, candidates and clients are kept apart from your Personal ones.
        </p>
        <p className="st-acts">
          <button type="button" className="ncx-btn is-primary" disabled={busy}
            onClick={() => {
              setBusy(true);
              void account.switchWorkspace(member.organizationId).catch((err: unknown) => { setError(readable(err)); setBusy(false); });
            }}>
            Open {member.name}
          </button>
          {member.role && <span className="st-meta t-body-sm">{ROLE_LABEL[member.role]}</span>}
        </p>
        {error && <p className="st-err t-body-sm" role="alert">{error}</p>}
      </div>
    );
  }

  /* Joins at once where the organisation allows it for this address, otherwise asks. */
  const join = async (org: OrgMatch) => {
    setBusy(true);
    setError(null);
    try {
      const r = await onboardingApi.joinOrganisation(org.id);
      if (r.status === "requested") {
        setSent(org.name);
        setBusy(false);
        return;
      }
      setTabWorkspace(r.organisationId);
      workspaceChanged();
      await account.reload();
      account.say?.(`You're in ${org.name}.`);
    } catch (err) {
      setError(readable(err));
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="st-sec">
        <h2 className="st-h t-title-sm">Organisation</h2>
        <p className="st-quiet t-body">{requestSentLine(sent)}</p>
      </div>
    );
  }

  if (found === undefined) {
    return (
      <div className="st-sec">
        <h2 className="st-h t-title-sm">Organisation</h2>
        <ShimmerRegion label="Loading organisation"><ShimmerText lines={2} /></ShimmerRegion>
      </div>
    );
  }

  if (found) {
    return (
      <div className="st-sec">
        <h2 className="st-h t-title-sm">Organisation</h2>
        <p className="st-quiet t-body">{joinOfferLine(found.name, found.joinMode)}</p>
        <p className="st-acts">
          <button type="button" className="ncx-btn is-primary" disabled={busy} onClick={() => void join(found)}>
            {busy ? <><Loader size="sm" tone="inherit" />One moment</> : joinOfferButton(found.name, found.joinMode)}
          </button>
        </p>
        {error && <p className="st-err t-body-sm" role="alert">{error}</p>}
      </div>
    );
  }

  const create = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      /* A name on SuperHyre already: asking to join it comes first (looking is never a reason to stop). */
      const m = await onboardingApi.lookupOrganisation(n).catch(() => null);
      if (m) { setFound(m); setBusy(false); return; }
      const made = await identityApi.createOrganisation({ name: n, logoUrl: null });
      setTabWorkspace(made.organisationId);
      workspaceChanged();
      await account.reload();
      account.say?.(`${n} is ready. You're its owner.`);
    } catch (err) {
      /* The name is already on SuperHyre (a race, or a lookup that could not be made): show that one, to ask to join. */
      if (err instanceof ApiError && err.code === "organisation_exists") {
        const m = await onboardingApi.lookupOrganisation(n).catch(() => null);
        if (m) { setFound(m); setBusy(false); return; }
      }
      setError(readable(err));
      setBusy(false);
    }
  };

  return (
    <form className="st-sec" onSubmit={(e) => { e.preventDefault(); void create(); }} noValidate>
      <h2 className="st-h t-title-sm">Organisation</h2>
      <p className="st-quiet t-body">
        Start an organisation to work with a team. You'd be its owner, and what you do there stays apart from
        Personal, which only you can see.
      </p>
      <div className="ncx-grid">
        <Fld id="st-new-org" label="Organisation name" hint="Your company or agency.">
          <input id="st-new-org" className="ncx-in" value={name} autoComplete="organization" maxLength={80}
            aria-describedby="st-new-org-hint" onChange={(e) => setName(e.target.value)} />
        </Fld>
      </div>
      <footer className="st-foot">
        {error ? <span className="st-err t-body-sm" role="alert">{error}</span> : <span />}
        <button type="submit" className="ncx-btn is-primary" disabled={!ready || busy}>
          {busy ? <><Loader size="sm" tone="inherit" />Creating</> : "Create an organisation"}
        </button>
      </footer>
    </form>
  );
}
