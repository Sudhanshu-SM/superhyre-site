import { ArrowUpRight, GithubLogo, LinkedinLogo, MapPin, Sparkle } from "@phosphor-icons/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { Avatar, Career, FitMark, Logo, Verdicts } from "./CandidateBits";
import { criteriaFor } from "./clarify";
import type { MomentCtx } from "./moments";
import { EVIDENCE, EVIDENCE_SRE } from "./moments";
import type { CampaignKey } from "./orchestrator";
import { campaignName } from "./orchestrator";
import type { Candidate } from "./sourcing";
import { Dialog } from "./ui";
import type { CompareSource } from "./liveViews/compareLogic";
import { compareVerdict } from "./liveViews/compareLogic";
import "./liveCompareEtc.css";

/**
 * CompareDialog — two or three full profiles, side by side, row by row.
 *
 * Rows are the things a recruiter weighs, in the order they weigh them:
 * fit against this campaign's criteria (with the evidence), career on one
 * shared time axis, every role, education, skills, and what each person says
 * about themselves. Where one person leads on a row, that cell is marked, so
 * the table can be read by scanning for marks. "Differences only" hides the
 * rows where everyone is the same, which is usually most of them.
 */

export type Verdict = { lead: Candidate; line: string };

/**
 * The pick for a connected workspace's people, from what the judge found and their years. A set
 * nobody judged names no pick (`lead` is null), so the dialog never marks one it can't stand behind.
 */
export function verdictForSource(people: readonly Candidate[], source: CompareSource): { lead: Candidate | null; line: string } {
  const v = compareVerdict(people, source);
  return { lead: people.find((p) => p.id === v.leadId) ?? null, line: v.line };
}

/** The agent's pick for a set, against a campaign's criteria. */
export function verdictFor(people: readonly Candidate[], camp: CampaignKey): Verdict {
  const { criteria, meets } = criteriaFor(camp);
  const met = (c: Candidate) => (meets[c.id] ?? c.meets).filter(Boolean).length;
  const lead = [...people].sort((a, b) => met(b) * 100 + b.totalYears - (met(a) * 100 + a.totalYears))[0]!;
  const others = people.filter((p) => p !== lead);
  const first = (c: Candidate) => c.name.split(" ")[0];
  const misses = others.map((o) => {
    const miss = criteria.filter((_, i) => !(meets[o.id] ?? o.meets)[i]);
    return miss.length ? `${first(o)} misses ${miss.map((m) => m.toLowerCase()).join(" and ")}` : `${first(o)} is level on criteria`;
  });
  return {
    lead,
    line: `${first(lead)} meets ${met(lead)} of ${criteria.length} ${campaignName(camp)} criteria with ${lead.totalYears} years. ${misses.join("; ")}.`,
  };
}

type Row = { key: string; label: string; cells: ReactNode[]; same: boolean; best?: number };

export function CompareDialog({
  open, onClose, people, camp, ctx, source,
}: {
  open: boolean;
  onClose: () => void;
  people: readonly Candidate[];
  camp?: CampaignKey;
  ctx: MomentCtx;
  /** A connected workspace's criteria, fit and evidence in place of the demo's (`camp`). */
  source?: CompareSource;
}) {
  const [diffOnly, setDiffOnly] = useState(false);
  const demo = source ? null : criteriaFor(camp as CampaignKey);
  const criteria: readonly string[] = source ? source.criteria : (demo?.criteria ?? []);
  const meets: Readonly<Record<string, readonly boolean[]>> = source ? source.meets : (demo?.meets ?? {});
  const evidence: Readonly<Record<string, readonly string[]>> = source ? source.evidence : camp === "platform-sre" ? EVIDENCE_SRE : EVIDENCE;
  const title = source ? source.name : campaignName(camp as CampaignKey);
  const v = source ? verdictForSource(people, source) : verdictFor(people, camp as CampaignKey);
  const ids = people.map((p) => p.id);
  /* The demo's people always have a fit; a connected person the judge never read has none. */
  const fit = (c: Candidate): readonly boolean[] | undefined => (source ? meets[c.id] : (meets[c.id] ?? c.meets));
  const judged = !source || people.some((p) => meets[p.id]);

  const skillsOf = (c: Candidate) => Object.values(c.skills).flat();
  const shared = new Set(skillsOf(people[0]!).filter((s) => people.every((p) => skillsOf(p).includes(s))));

  const argmax = (xs: number[]) => {
    const m = Math.max(...xs);
    return xs.filter((x) => x === m).length === 1 ? xs.indexOf(m) : undefined;
  };

  const rows: { section: string; rows: Row[] }[] = [
    ...(!judged || criteria.length === 0 ? [] : [{
      section: `Fit for ${title}`,
      rows: criteria.map((cr, i) => {
        const vals = people.map((p) => !!fit(p)?.[i]);
        return {
          key: `fit-${i}`,
          label: cr,
          same: vals.every((x) => x === vals[0]),
          best: argmax(vals.map(Number)),
          cells: people.map((p) => (fit(p) ? (
            <span className="cd-fit">
              <FitMark met={!!fit(p)?.[i]} label={cr} />
              <span>{evidence[p.id]?.[i] ?? (fit(p)?.[i] ? "Yes" : "Not found")}</span>
            </span>
          ) : <span className="cd-none">Not judged</span>)),
        };
      }),
    }]),
    {
      section: "Career",
      rows: [
        {
          key: "strip", label: "Timeline", same: false,
          cells: people.map((p) => <Career c={p} labels />),
        },
        {
          key: "years", label: "Experience", same: people.every((p) => p.totalYears === people[0]!.totalYears),
          best: argmax(people.map((p) => p.totalYears)),
          cells: people.map((p) => p.totalYears > 0
            ? <span><b>{p.totalYears} years</b>{p.avgTenure ? ` · ${p.avgTenure} avg tenure` : ""}</span>
            : <span className="cd-none">Not on the profile</span>),
        },
        {
          key: "roles", label: "Roles", same: false,
          cells: people.map((p) => (
            <ol className="cd-roles">
              {p.jobs.flatMap((j) => j.roles.map((r) => (
                <li key={`${j.org.name}${r.start}`}>
                  <Logo name={j.org.name} hue={j.org.hue} size={18} />
                  <span>
                    <b>{r.title}</b>
                    <span>{r.start ? `${j.org.name} · ${r.start.split(" ")[1]}–${r.end === "Present" ? "now" : r.end.split(" ")[1]}` : j.org.name}</span>
                  </span>
                </li>
              )))}
            </ol>
          )),
        },
      ],
    },
    {
      section: "Background",
      rows: [
        {
          key: "edu", label: "Education", same: false,
          cells: people.map((p) => (p.schools[0] ? (
            <span className="cd-edu">
              <Logo name={p.school.name} hue={p.school.hue} size={18} />
              <span><b>{p.schools[0]?.org.name}</b><span>{p.schools[0]?.degree}</span></span>
            </span>
          ) : <span className="cd-none">Not on the profile</span>)),
        },
        {
          key: "loc", label: "Location", same: people.every((p) => p.location === people[0]!.location),
          cells: people.map((p) => (p.location
            ? <span className="cd-loc"><MapPin size={13} aria-hidden="true" />{p.location}</span>
            : <span className="cd-none">Not on the profile</span>)),
        },
        /* Open to work and public code come from a search nobody ran for a connected person. */
        ...(source ? [] : [
          {
            key: "otw", label: "Open to work", same: people.every((p) => !!p.openToWork === !!people[0]!.openToWork),
            best: argmax(people.map((p) => Number(!!p.openToWork))),
            cells: people.map((p) => <span>{p.openToWork ? "Yes, on the profile" : "Not stated"}</span>),
          },
          {
            key: "gh", label: "Public code", same: false,
            best: argmax(people.map((p) => p.github?.repos ?? 0)),
            cells: people.map((p) => (p.github
              ? <span className="cd-gh"><GithubLogo size={14} weight="fill" aria-hidden="true" />{p.github.repos} repos since {p.github.since.split(" ")[1]}</span>
              : <span className="cd-none">No GitHub found</span>)),
          },
        ]),
      ],
    },
    {
      section: "Skills",
      rows: [
        {
          key: "skills", label: `${shared.size} in common`, same: false,
          cells: people.map((p) => (
            <ul className="cd-skills">
              {[...skillsOf(p)].sort((a, b) => Number(shared.has(b)) - Number(shared.has(a))).map((s) => (
                <li key={s} className={shared.has(s) ? "is-shared" : undefined}>{s}</li>
              ))}
            </ul>
          )),
        },
        {
          key: "about", label: "In their words", same: false,
          cells: people.map((p) => (p.about ? <p className="cd-about">{p.about}</p> : <p className="cd-about cd-none">Not on the profile</p>)),
        },
      ],
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} label={`Compare ${people.map((p) => p.name).join(" and ")}`} size="xl">
      <div className="cd" style={{ ["--n" as string]: people.length }}>
        <header className="cd-top">
          <div className="cd-title">
            <h2>Compare {people.length}</h2>
            <p>{source ? (source.name ? `${source.name} criteria` : "Profiles side by side") : `${title} criteria`}</p>
          </div>
          <label className="cd-diff">
            <input type="checkbox" id="cd-diff" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} />
            <span className="cd-switch" aria-hidden="true" />
            Differences only
          </label>
        </header>

        <div className="cd-scroll">
          <div className="cd-grid">
            {/* Sticky identity row. */}
            <div className="cd-r cd-who-r">
              <span className="cd-k" />
              {people.map((p) => (
                <div key={p.id} className={`cd-who${p === v.lead ? " is-lead" : ""}`}>
                  {p === v.lead && <span className="cd-lead"><Sparkle size={11} weight="fill" aria-hidden="true" />Agent's pick</span>}
                  <div className="cd-who-top">
                    <Avatar name={p.name} hue={p.hue} size={40} />
                    <div className="cd-who-id">
                      <b>{p.name}<LinkedinLogo size={14} weight="fill" className="cd-li" aria-hidden="true" /></b>
                      <span>{p.headline}</span>
                    </div>
                  </div>
                  <div className="cd-who-acts">
                    {source?.status?.[p.id]
                      ? <span className="cd-status">{source.status[p.id]}</span>
                      : <Verdicts verdict={ctx.verdicts[p.id]} onVerdict={(x) => ctx.onVerdict(p.id, x)} name={p.name} icons />}
                    <button type="button" className="cn-link" onClick={() => ctx.openProfile(p.id, ids)}>
                      Full profile<ArrowUpRight size={12} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="cd-verdict">
              <Sparkle size={14} weight="fill" aria-hidden="true" />
              <p>{v.line}</p>
            </div>

            {rows.map((sec) => {
              const shown = sec.rows.filter((r) => !diffOnly || !r.same);
              if (shown.length === 0) return null;
              return (
                <section key={sec.section} className="cd-sec">
                  <h3 className="cd-sec-h">{sec.section}</h3>
                  {shown.map((r) => (
                    <div key={r.key} className="cd-r">
                      <span className="cd-k">{r.label}</span>
                      {r.cells.map((c, i) => (
                        <div key={i} className={`cd-v${r.best === i ? " is-best" : ""}`}>{c}</div>
                      ))}
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
