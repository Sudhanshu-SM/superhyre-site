# Sign-up, brand and forms: the build plan (5 Oct 2026)

Inputs: Mutiny's sign-up teardown, Binary (binary.so) feature research, and the current
code. Decisions taken with the user:

- Form applicants confirm their email with a 6-digit code before anything links them to
  an existing person in the shared pool. Typed details alone never attach to someone else.
  **Changed 13 Oct 2026:** the code step is gone ("even Google Forms gets fake responses"). An application is
  taken as typed and is never trusted to be the person it names: it is stored as a response of its own, never
  writes to or links itself to an existing candidate or person, and a recruiter sees "Looks like <name>" and
  decides (link, add as new, pass). Kept in its place: a hidden field, a 3 s minimum on the page, 10 per hour per
  visitor and 200 a day per form, one response per email in 10 minutes. The old path still exists on the server
  behind a form's `emailCode` setting (off; no screen sets it, and the console has no code step to go with it).
- Email sending: provider decided later. Everything goes through one `Mailer` interface;
  locally a dev mailer writes each email to the API log. Without a provider in production,
  features that need email say so and degrade (never silently drop a code).
- Same-domain joins stay admin-approved; the personal workspace is always there.
- Brand ("Your brand") is applied to the things we generate: job posts, application-form
  links (our "Binary links") and shared shortlists.

Design rules that apply everywhere (DESIGN.md, user feedback): no status pills or dot
markers, no icon tiles above headings, human copy without em dashes, one deliberate
animation per screen, dopamine not anxiety, nothing repeated from another surface, type
from the scale tokens, `prefers-reduced-motion` respected, `aria-live` on progress text.

---

## A. Sign-up and onboarding

The sign-in card stays (email code or Google). What changes is everything after the
email is verified.

### A1. Who goes where

| Arrives as | Goes to |
|---|---|
| Valid invite | Invite card, then the org (its brand already applied) |
| Work email, domain has an org (not removed from it) | "Your team is already on SuperHyre": ask to join (admin approves) or open the personal workspace |
| Work email, no org on the domain | The setup flow below |
| Allowlisted personal email | Personal workspace |
| Onboarding in progress | Resumes at its step (state is on the server) |

### A2. The setup flow

A three-word progress line, not pills: **Your company · Your brand · First steps**.
Current in ink, done ones with a check, the rest muted; done steps are links back.

1. **Let's set up {Company}.** Name (prefilled from Google), organisation name and website
   (prefilled from the email domain), "How do you hire?" (our own team / for clients /
   both). Beside the form a company card fills in live: research starts the moment the
   flow opens, so the logo and one line about the company are often there before the
   person finishes typing.
2. **Your company.** "Welcome, {first}." typed in, then the research card: logo, company,
   their name, and status lines tied to real progress ("Reading superhyre.com", "Looking
   for open roles", "Pulling it together"). Three facts appear one by one, each editable,
   each with its source. Then "What's your part in hiring?" (Founder, Head of talent,
   Recruiter, Sourcer, Hiring manager, Agency owner, Something else). Continue is never
   blocked on research: after a few seconds "Carry on, we'll finish in the background".
3. **First role.** "Which role do you want to fill first?" Suggestions from the open roles
   research found, "Something else" (free text), or "Not hiring right now".
4. **Your brand.** The brand shown on our own output for that role: the job post, the
   application form and the link preview as it appears when shared. One reveal: the
   skeleton post inks in (logo, colour band, fonts). "Looks right" / "Adjust" (logo, main
   colour from the colours we found, font pair from open fonts, tone). Contrast is fixed
   automatically and said so. Failure paths: another page, upload a logo, a clean default.
5. **First steps.** Three starting points for the role, ordered by their part in hiring
   (e.g. "Find people for {role}", "Map where this talent works today", "Turn your notes
   into a job description"). Picking one creates the campaign when needed and hands the
   brief to the agent. "I'll look around first" goes Home.

### A3. Server

- `core.onboarding` (one row per user): step, version, answers, research run, completion.
  Every submit carries the version, so two tabs or a double click are harmless.
- Company research job (`research` run skill, background lane): fetch the website safely
  (SSRF guard: http(s) only, ports 80/443, every resolved address checked at connect,
  redirects re-checked, 1.5 MB and 8 s caps, no cookies), extract title, description,
  Open Graph, theme colour, icons and logo, colours and font families from the page and
  up to two stylesheets, careers links and JSON-LD job postings, then one gateway task
  (`company_research@1`, Haiku) over the page text marked untrusted, validated by schema.
  Result cached per domain for 7 days in `mother_data.companies`; one job per domain at a
  time; quotas per user and org.
- Brand theme: `core.organizations.brand` (owned, editable), seeded from research.
  Shape shared with the console (`packages/shared/src/brand.ts`).
- Personal email domains never trigger research.

---

## B. Application forms (Binary parity, then better)

### B1. Who the applicant is
- Name, email and phone are required on every form (console and server). One phone
  normaliser for every layer (`packages/shared/src/phone.ts`, mirrored by
  `core.normalize_phone` in SQL, same test cases).
- Email code at submit: 6 digits, 10 minutes, 5 tries, resend after 30 s, one active code.
  A form can turn it off; then the application is kept but only linked when a recruiter
  confirms.
- One application per verified email per form; a repeat sees "You applied on {date}".

### B2. Into our people database
- After submit a job links the response: a verified email (or a signed outreach link)
  links to the existing person; otherwise a new person is created with the email, phone
  and LinkedIn (verified email marked verified; the phone is not yet). Every applicant is
  embedded so search finds them.
- Workspace dedupe on email, phone and LinkedIn (catches sourced-then-applied).
- Privacy notice and an unticked "Keep my profile in SuperHyre's talent network" opt-in;
  without it the contacts stay with the workspace that received them.

### B3. The form itself
- New question types: dropdown, date, and an "Other" choice. File upload (résumé) next.
- Closing date with auto-close and "Apply by {date}"; custom success and closed messages.
- Brand: the org's logo, colour and fonts on the page; a trust line in the meta text
  ("120 applied", only above thresholds); a promise line the recruiter writes.
- Views and sources (`?src=`, UTM, referrer) with simple form analytics.
- Later: AI screening with the matching judge (never auto-reject), link-preview images,
  careers page.

---

## C. Home: ready-made agent workflows

"Start with Hyre": text-first cards (verb-led name, what you get, what it needs, about how
long), ordered by the person's part in hiring. Each launches a real flow (source for a
role, notes to job description, form from a job description, keep sourcing, talent map).
Nothing is shown that can't run yet.

## D. No campaign selected

A placeholder that says so, points at the sidebar and lists recent campaigns; the sidebar
shows a quiet "Select a campaign" row instead of a folder over empty pages. (Done.)

## Migration numbers (platform repo)

167 to 169 forms; 170 to 172 onboarding and brand.
