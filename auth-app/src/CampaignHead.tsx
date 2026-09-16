import { DotsThree, FolderOpen, GridFour } from "@phosphor-icons/react";
import { ROUTES } from "./nav";
import { HUES } from "./orchestrator";
import type { Hue } from "./orchestrator";
import type { Campaign } from "./workspaces";

/**
 * CampaignHead — which campaign you are looking at. Nothing else.
 *
 * ── WHAT CAME OUT, AND WHY ──────────────────────────────────────────────────
 * This header used to carry the whole measurement apparatus: a three-cell
 * metrics panel (value + Delta chip + Spark, ×3), a `TRAILING 7 DAYS` /
 * `org_candidates · outreach_queue` strip above it, three state chips
 * (`2 calls today`, `4 awaiting reply`, `2 of 4 channels`) under the title,
 * and a bordered pill asking `Why did interested drop this week?`.
 *
 * All of it was defensible in isolation and wrong in aggregate. Counted on
 * screen it was six saturated spots (three chip hues, three spark hues) plus a
 * delta chip on every figure, in the one region of the page whose job is to
 * answer a single question — WHICH campaign. The chips in particular were
 * three coloured spots on a line that only needed to say which campaign you
 * are looking at, and the panel pushed the composer — the thing you came here
 * to type into — below the fold.
 *
 * So the stats did not die, they MOVED: `Rail` now renders them as a quiet
 * 3-up, which is where the reference puts them and where they sit beside the
 * other per-campaign configuration rather than on top of the work. The derived
 * "why did X drop" question moved with them, still derived from the weakest
 * stat's sign so the copy cannot outlive the decline it describes.
 *
 * What is left is Tier 1: type only, no container, no shadow, no glyph. Size
 * and weight do the work. If you are tempted to put a number back here, put it
 * in the rail — the header is identity, and identity does not have a trend.
 *
 * ── THE `onOpen` PROP IS GONE ───────────────────────────────────────────────
 * It existed to seed the composer with the derived question. The question is
 * the rail's now, so the prop was deleted rather than kept and commented: a
 * prop held "in case" is indistinguishable, from the call site, from a prop
 * that matters. `Home.tsx` passes `onOpen` to `Rail` instead.
 */
/**
 * A stable hue per campaign name.
 *
 * Deterministic on purpose: a mark whose colour changed between renders, or
 * differed between the header and the rail's brief chips, would actively
 * mislead rather than merely fail to help. A sum of code points is enough —
 * this is a palette pick, not a hash with any security or collision duty.
 */
function campaignHue(name: string): Hue {
  let n = 0;
  for (let i = 0; i < name.length; i++) n = (n + name.charCodeAt(i)) % 997;
  return HUES[n % HUES.length] ?? "brand";
}

export function CampaignHead({
  campaign, onCustomise,
}: {
  campaign: Campaign;
  /** Opens the tile gallery, anchored to the button that was clicked. */
  onCustomise: (anchor: HTMLElement) => void;
}): JSX.Element {
  return (
    <header className="orc-head">
      {/* The campaign's own mark, beside its name. A req is the object a
          recruiter navigates between all day, so it gets an identity rather
          than being text alone — the same device the reference uses for a
          project. Hue is derived from the name, so the same campaign always
          wears the same colour and two open backend reqs are separable at a
          glance; a mark that changed colour between renders would be worse
          than no mark. */}
      <span
        className="orc-head-mark"
        style={{
          background: `var(--c-${campaignHue(campaign.name)}-tint)`,
          borderColor: `var(--c-${campaignHue(campaign.name)}-line)`,
          color: `var(--c-${campaignHue(campaign.name)})`,
        }}
        aria-hidden="true"
      >
        <FolderOpen size={17} weight="duotone" />
      </span>

      {/* Just the name. The "Campaign · Engineering · Bangalore" kicker above
          it is gone, and so is the greeting bar that used to sit above this
          whole row. Both were headings in a stack of headings: the surface had
          a greeting, a kicker and a name competing before any content, and the
          page is about the work rather than about being introduced.

          `campaign.role` still carries "Engineering · Bangalore" and the rail
          names the owner and the channels, so nothing that was only in the
          kicker has been lost. */}
      <h1 className="orc-head-name">{campaign.name}</h1>

      {/* Moved here from the greeting bar, which no longer exists. It is a
          page-level control and this is now the page's only header row. */}
      <button
        type="button"
        className="orc-add"
        onClick={(e) => onCustomise(e.currentTarget)}
        aria-haspopup="dialog"
      >
        <GridFour size={14} weight="bold" aria-hidden="true" />
        Customise home
      </button>

      {/* A link, not a button with a popover. The overflow items a campaign
          header would actually offer — rename, archive, duplicate — have no
          backend behind them, so a real menu would be three dead rows inside a
          popover instead of one honest affordance. Settings is a route the hash
          router genuinely honours and the page that genuinely edits a campaign,
          so the dots go there and the accessible name says so rather than
          saying "More". Same device `.rail-manage` uses in the rail. */}
      <a
        className="orc-head-menu"
        href={`#${ROUTES.settings.path}`}
        aria-label={`Settings for ${campaign.name}`}
      >
        <DotsThree size={18} weight="bold" aria-hidden="true" />
      </a>
    </header>
  );
}
