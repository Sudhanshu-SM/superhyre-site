import type {
  BestHour,
  CallsAnalytics,
  CampaignStats,
  CampaignsAnalytics,
  Envelope,
  Median,
  OutreachAnalytics,
  OutreachExtras,
  OutreachHub,
  OverviewAnalytics,
  PersonRow,
  PersonWeekly,
  PipelineAnalytics,
  Ratio,
  RecruitersAnalytics,
  WaitingPerson,
} from "./analytics";

/**
 * The wire format of the Analytics API (docs/analytics-api.md) read into the shapes the pages draw.
 *
 * The API sends a ratio as `{ n, of, rate (a fraction 0 to 1 or null), small }`, a median as `medianDays` next
 * to its count, and per-person figures as nested groups. The pages want `rate` as a whole percent, a `Median`
 * object, and a few flatter names. Doing the translation here, once, keeps every page and the fixtures on one
 * shape, and means a field the server has not sent yet reads as "nothing" rather than throwing.
 *
 * Pure functions; nothing here touches the network.
 */

/** The wire is untrusted JSON: every field is read defensively, so it is typed loosely on purpose. */
// biome-ignore lint/suspicious/noExplicitAny: untrusted JSON, read defensively
type W = any;

/** Fewer than this many people behind a share and it is shown as a count ("1 of 4"), never a percentage. */
const SMALL = 5;
/** A median needs at least this many values behind it. */
const MIN_MEDIAN = 3;

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = <T = W>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** `{ n, of, rate, small | smallN }` to a share with a whole-percent `rate`; null rate whenever it is a small number. */
export function ratio(w: W, parts?: { n?: number; of?: number }): Ratio {
  const n = num(parts?.n ?? w?.n);
  const of = num(parts?.of ?? w?.of);
  const small = typeof w?.small === "boolean" ? w.small : typeof w?.smallN === "boolean" ? w.smallN : of < SMALL;
  const fraction = w?.rate === undefined ? (of > 0 ? n / of : null) : numOrNull(w.rate);
  const rate = small || of < SMALL || fraction === null ? null : Math.min(100, Math.max(0, Math.round(fraction * 10_000) / 100));
  return { n, of, rate, smallN: small || of < SMALL };
}

/** A median of days or hours next to the number of values behind it. */
function median(unit: "days" | "hours", value: unknown, n: unknown): Median {
  const count = num(n);
  const v = count < MIN_MEDIAN ? null : numOrNull(value);
  return unit === "days" ? { days: v, n: count } : { hours: v, n: count };
}

export function envelope(w: W): Envelope {
  const days = num(w?.days, num(w?.period?.days, 30));
  const p = w?.period ?? {};
  const v = w?.viewer ?? {};
  const role = v.role === "owner" || v.role === "admin" || v.role === "recruiter" || v.role === "personal" ? v.role : "recruiter";
  return {
    period: {
      key: String(p.key ?? days),
      days: num(p.days, days),
      from: String(p.from ?? ""),
      to: String(p.to ?? ""),
      prevFrom: String(p.prevFrom ?? ""),
      prevTo: String(p.prevTo ?? ""),
    },
    timeZone: typeof w?.timeZone === "string" ? w.timeZone : "UTC",
    viewer: {
      role,
      userId: typeof v.userId === "string" ? v.userId : null,
      seesTeam: !!v.seesTeam,
      canPickRecruiter: !!v.canPickRecruiter,
      view: v.view === "team" || v.view === "recruiter" || v.view === "mine" || v.view === "campaigns" ? v.view : "mine",
      recruiterId: typeof v.recruiterId === "string" ? v.recruiterId : null,
    },
    empty: !!w?.empty,
    emptyReason: w?.emptyReason === "no_campaigns" || w?.emptyReason === "no_activity" ? w.emptyReason : null,
  };
}

/* ── Overview ── */

export function adaptOverview(w: W): OverviewAnalytics {
  const t = w?.tiles ?? {};
  const f = w?.funnel ?? {};
  return {
    ...envelope(w),
    tiles: {
      hires: { n: num(t.hires?.n), prev: num(t.hires?.prev), planned: num(t.hires?.planned) },
      interviews: { n: num(t.interviews?.n), prev: num(t.interviews?.prev) },
      replies: { n: num(t.replies?.n), prev: num(t.replies?.prev), contacted: num(t.replies?.contacted) },
      found: {
        n: num(t.found?.n),
        prev: num(t.found?.prev),
        series: list(t.found?.series).map((s) => ({ day: String(s.day ?? ""), n: num(s.n) })),
      },
    },
    funnel: {
      cohort: { from: String(f.cohort?.from ?? ""), to: String(f.cohort?.to ?? "") },
      steps: list(f.steps).map((s) => ({ id: String(s.id), label: String(s.label ?? s.id), n: num(s.n) })),
      rates: list(f.rates).map((r) => ({ ...ratio(r), id: String(r.id), label: String(r.label ?? r.id) })),
    },
    trend: {
      grain: w?.trendGrain === "day" ? "day" : "week",
      points: list(w?.trend).map((p) => ({
        start: String(p.weekStart ?? p.start ?? ""),
        interviews: num(p.interviews),
        hires: num(p.hires),
      })),
    },
    lookAt: list(w?.lookAt).map((l) => ({
      kind: String(l.kind),
      count: num(l.count),
      text: String(l.text ?? ""),
      campaignId: typeof l.campaignId === "string" ? l.campaignId : null,
      href: String(l.href ?? "#/analytics"),
    })),
  };
}

/* ── Recruiters ── */

function person(w: W): PersonRow {
  const e = w?.emails ?? {};
  const c = w?.calls ?? {};
  const p = w?.prev;
  const row: PersonRow = {
    name: String(w?.name ?? ""),
    emails: {
      sent: num(e.sent),
      replied: num(e.replied),
      reply: ratio({ rate: e.rate, small: e.small, smallN: e.smallN }, { n: num(e.replied), of: num(e.sent) }),
    },
    calls: {
      placed: num(c.placed),
      connected: num(c.connected),
      talkSeconds: num(c.talkSeconds),
      connect: ratio({ rate: c.rate, small: c.small, smallN: c.smallN }, { n: num(c.connected), of: num(c.placed) }),
    },
    moves: { shortlisted: num(w?.shortlisted), interviews: num(w?.interviews), hires: num(w?.hires) },
    tasks: { due: num(w?.tasks?.due), onTime: num(w?.tasks?.onTime), overdue: num(w?.tasks?.overdue) },
    load: { inProgress: num(w?.load?.inProgress), waiting: num(w?.load?.waiting), campaigns: num(w?.load?.campaigns) },
  };
  if (typeof w?.userId === "string") row.userId = w.userId;
  if (typeof w?.role === "string") row.role = w.role;
  if (typeof w?.former === "boolean") row.former = w.former;
  if (typeof w?.active === "boolean") row.active = w.active;
  if (p && typeof p === "object") {
    row.prev = {
      emailsSent: num(p.emails?.sent),
      replies: num(p.emails?.replied),
      callsPlaced: num(p.calls?.placed),
      talkSeconds: num(p.calls?.talkSeconds),
      shortlisted: num(p.shortlisted),
      interviews: num(p.interviews),
      hires: num(p.hires),
    };
  }
  return row;
}

function waiting(w: W): WaitingPerson {
  const row: WaitingPerson = {
    campaignCandidateId: String(w?.campaignCandidateId ?? ""),
    candidateId: String(w?.candidateId ?? ""),
    name: String(w?.name ?? ""),
    campaign: String(w?.campaign ?? ""),
    stage: String(w?.stage ?? ""),
    days: num(w?.days),
  };
  if (typeof w?.campaignId === "string") row.campaignId = w.campaignId;
  if (typeof w?.step === "string") row.step = w.step;
  if (typeof w?.pastThreshold === "boolean") row.pastThreshold = w.pastThreshold;
  if (typeof w?.ownerName === "string" || w?.ownerName === null) row.ownerName = w.ownerName;
  if (typeof w?.mine === "boolean") row.mine = w.mine;
  return row;
}

export function adaptRecruiters(w: W): RecruitersAnalytics {
  let typical: RecruitersAnalytics["typical"] = null;
  if (w?.typical && typeof w.typical === "object") {
    const { userId: _u, name: _n, ...rest } = person(w.typical);
    typical = rest;
  }
  return {
    ...envelope(w),
    people: Array.isArray(w?.people) ? w.people.map(person) : null,
    me: w?.me && typeof w.me === "object" ? person(w.me) : null,
    typical,
    waitingLongest: list(w?.waitingLongest).map(waiting),
  };
}

export function adaptWeekly(w: W): PersonWeekly {
  const point = (p: W) => ({
    start: String(p?.weekStart ?? p?.start ?? ""),
    emails: num(p?.emails),
    calls: num(p?.calls),
    interviews: num(p?.interviews),
  });
  return {
    ...envelope(w),
    userId: String(w?.userId ?? ""),
    name: String(w?.name ?? ""),
    grain: w?.grain === "day" ? "day" : "week",
    points: list(w?.weeks ?? w?.points).map(point),
    previous: list(w?.previous).map(point),
  };
}

/* ── Outreach (emails: the old payload, plus extras; calls: its own request) ── */

/** The email payload: everything the old answer had, unchanged, plus the envelope and the filtered extras. */
const bestHour = (h: W, nKey: string, answeredKey: string): BestHour | null =>
  h && typeof h.hour === "number"
    ? { hour: h.hour, n: num(h[nKey]), answered: num(h[answeredKey]), answer: ratio(h.reply ?? h.connect, { n: num(h[answeredKey]), of: num(h[nKey]) }) }
    : null;

/** The server's channel figures, read defensively; null when this server does not send them. */
function adaptHub(w: W): OutreachHub | null {
  const ch = w?.channels;
  if (!ch || typeof ch !== "object") return null;
  const e = ch.email ?? {};
  const c = ch.calls ?? {};
  const wa = ch.whatsapp ?? {};
  const a = w?.all ?? {};
  const pair = (v: W, ...keys: string[]) => Object.fromEntries(keys.map((k) => [k, num(v?.[k])]));
  return {
    fromServer: true,
    channels: {
      email: {
        sent: num(e.sent),
        replied: num(e.replied),
        bounced: num(e.bounced),
        scheduled: num(e.scheduled),
        awaiting: num(e.awaiting),
        reply: ratio(e.reply, e.reply ? undefined : { n: num(e.replied), of: num(e.sent) }),
        bounce: ratio(e.bounce, e.bounce ? undefined : { n: num(e.bounced), of: num(e.sent) }),
        previous: pair(e.previous, "sent", "replied") as { sent: number; replied: number },
      },
      calls: {
        placed: num(c.placed),
        connected: num(c.connected),
        talkSeconds: num(c.talkSeconds),
        avgSeconds: numOrNull(c.avgSeconds),
        connect: ratio(c.connect, c.connect ? undefined : { n: num(c.connected), of: num(c.placed) }),
        previous: pair(c.previous, "placed", "connected") as { placed: number; connected: number },
        outcomes: list(c.outcomes).map((o) => ({ outcome: String(o.outcome), n: num(o.n) })),
        withRecording: num(c.withRecording),
        withSummary: num(c.withSummary),
        bestHour: bestHour(c.bestHour, "placed", "connected"),
      },
      whatsapp: {
        connected: wa.connected === true,
        sent: num(wa.sent),
        replied: num(wa.replied),
        reply: ratio(wa.reply, wa.reply ? undefined : { n: num(wa.replied), of: num(wa.sent) }),
        previous: pair(wa.previous, "sent", "replied") as { sent: number; replied: number },
      },
    },
    all: {
      sent: num(a.sent),
      answered: num(a.answered),
      answer: ratio(a.answer, a.answer ? undefined : { n: num(a.answered), of: num(a.sent) }),
      previous: pair(a.previous, "sent", "answered") as { sent: number; answered: number },
    },
    campaigns: list(w?.campaigns).map((x) => ({
      campaignId: typeof x.campaignId === "string" ? x.campaignId : null,
      name: String(x.name ?? "No campaign"),
      email: {
        sent: num(x.email?.sent),
        replied: num(x.email?.replied),
        bounced: num(x.email?.bounced),
        scheduled: num(x.email?.scheduled),
        awaiting: num(x.email?.awaiting),
        reply: ratio(x.email?.reply, x.email?.reply ? undefined : { n: num(x.email?.replied), of: num(x.email?.sent) }),
      },
      calls: {
        placed: num(x.calls?.placed),
        connected: num(x.calls?.connected),
        talkSeconds: num(x.calls?.talkSeconds),
        avgSeconds: numOrNull(x.calls?.avgSeconds),
        connect: ratio(x.calls?.connect, x.calls?.connect ? undefined : { n: num(x.calls?.connected), of: num(x.calls?.placed) }),
      },
      whatsapp: { connected: x.whatsapp?.connected === true, sent: num(x.whatsapp?.sent), replied: num(x.whatsapp?.replied) },
      sent: num(x.sent),
      answered: num(x.answered),
      answer: ratio(x.answer, x.answer ? undefined : { n: num(x.answered), of: num(x.sent) }),
    })),
    byPerson: Array.isArray(w?.byPerson)
      ? list(w.byPerson).map((p) => ({
        userId: String(p.userId ?? ""),
        name: String(p.name ?? "A teammate"),
        email: {
          sent: num(p.email?.sent),
          replied: num(p.email?.replied),
          reply: ratio(p.email?.reply, p.email?.reply ? undefined : { n: num(p.email?.replied), of: num(p.email?.sent) }),
        },
        calls: {
          placed: num(p.calls?.placed),
          connected: num(p.calls?.connected),
          avgSeconds: numOrNull(p.calls?.avgSeconds),
          connect: ratio(p.calls?.connect, p.calls?.connect ? undefined : { n: num(p.calls?.connected), of: num(p.calls?.placed) }),
        },
      }))
      : null,
    email: {
      timeToFirstReply: median("hours", w?.email?.timeToFirstReply?.medianHours, w?.email?.timeToFirstReply?.n),
      bounce: ratio(w?.email?.bounce, w?.email?.bounce ? undefined : { n: num(e.bounced), of: num(e.sent) }),
      bestHour: bestHour(w?.email?.bestHour, "sent", "replied"),
    },
  };
}

export function adaptOutreach(w: W): OutreachAnalytics & OutreachExtras {
  const sent = num(w?.totals?.sent);
  return {
    ...(w as OutreachAnalytics),
    ...envelope(w),
    reply: ratio(w?.reply, w?.reply ? undefined : { n: num(w?.totals?.replied), of: sent }),
    timeToReply: median("hours", w?.timeToReply?.medianHours ?? w?.timeToReply?.hours, w?.timeToReply?.n),
    waiting: num(w?.waiting, num(w?.totals?.awaiting)),
    showByHour: typeof w?.showByHour === "boolean" ? w.showByHour : sent >= 30,
    hub: adaptHub(w),
  };
}

export function adaptCalls(w: W): CallsAnalytics {
  const t = w?.totals ?? {};
  return {
    ...envelope(w),
    totals: {
      placed: num(t.placed),
      connected: num(t.connected),
      connect: ratio({ rate: t.rate, small: t.small, smallN: t.smallN }, { n: num(t.connected), of: num(t.placed) }),
      talkSeconds: num(t.talkSeconds),
      avgSeconds: numOrNull(t.avgSeconds),
      ...(t.previous ? { previous: { placed: num(t.previous.placed), connected: num(t.previous.connected) } } : {}),
    },
    outcomes: list(w?.outcomes).map((o) => ({ outcome: String(o.outcome), n: num(o.n) })),
    byCampaign: list(w?.byCampaign).map((c) => ({
      campaignId: typeof c.campaignId === "string" ? c.campaignId : null,
      name: String(c.name ?? "No campaign"),
      placed: num(c.placed),
      connected: num(c.connected),
      talkSeconds: num(c.talkSeconds),
      avgSeconds: numOrNull(c.avgSeconds),
    })),
    byPerson: Array.isArray(w?.byPerson)
      ? list(w.byPerson).map((p) => ({
        userId: String(p.userId ?? ""),
        name: String(p.name ?? "A teammate"),
        placed: num(p.placed),
        connected: num(p.connected),
        talkSeconds: num(p.talkSeconds),
        avgSeconds: numOrNull(p.avgSeconds),
      }))
      : null,
    bestHour: bestHour(w?.bestHour, "placed", "connected"),
    records: { withRecording: num(w?.records?.withRecording), withSummary: num(w?.records?.withSummary) },
    daily: list(w?.daily).map((d) => ({ day: String(d.day ?? ""), placed: num(d.placed), connected: num(d.connected) })),
  };
}

/* ── Pipeline ── */

export function adaptPipeline(w: W): PipelineAnalytics {
  const th = w?.thresholds ?? {};
  const tot = w?.totals ?? {};
  const off = w?.offers ?? {};
  const forms = w?.forms ?? {};
  return {
    ...envelope(w),
    thresholds: { shortlisted: num(th.shortlisted, 7), outreach: num(th.outreach, 7), interviewing: num(th.interviewing, 14) },
    stages: list(w?.stages).map((s) => ({
      id: String(s.id ?? s.stage),
      stage: String(s.stage ?? s.id),
      step: typeof s.step === "string" ? s.step : null,
      label: String(s.label ?? s.stage ?? s.id),
      n: num(s.n),
      waiting: num(s.waiting),
    })),
    totals: { inProgress: num(tot.inProgress), waiting: num(tot.waiting), hired: num(tot.hired), passed: num(tot.passed) },
    waitingLongest: list(w?.waitingLongest).map(waiting),
    velocity: list(w?.velocity).map((v) => ({
      stage: String(v.stage),
      median: median("days", v.medianDays, v.n),
      /* The server sends only the earlier median, and null when it had under three stays behind it. */
      prev: median("days", v.prevMedianDays, numOrNull(v.prevMedianDays) === null ? 0 : MIN_MEDIAN),
    })),
    timeToHire: median("days", w?.timeToHire?.medianDays, w?.timeToHire?.n),
    timeToFirstContact: median("days", w?.timeToFirstContact?.medianDays, w?.timeToFirstContact?.n),
    conversion: list(w?.conversion).map((r) => ({ ...ratio(r), id: String(r.id), label: String(r.label ?? r.id) })),
    weakestStep: typeof w?.weakestStep === "string" ? w.weakestStep : null,
    offers: {
      made: num(off.made),
      accepted: num(off.accepted),
      notTaken: num(off.notTaken),
      acceptance: ratio(off.acceptance, off.acceptance ? undefined : { n: num(off.accepted), of: num(off.made) }),
    },
    sources: list(w?.sources).map((s) => ({
      source: String(s.source),
      label: String(s.label ?? s.source),
      added: num(s.added),
      interviewed: num(s.interviewed),
      hired: num(s.hired),
    })),
    forms: {
      views: num(forms.views),
      applications: num(forms.applications),
      added: num(forms.added),
      passed: num(forms.passed),
      conversion: ratio(forms.conversion, forms.conversion ? undefined : { n: num(forms.applications), of: num(forms.views) }),
    },
    passed: Array.isArray(w?.passed) ? w.passed.map((p: W) => ({ reason: String(p.reason), n: num(p.n) })) : null,
  };
}

/* ── Campaigns ── */

function campaign(w: W): CampaignStats {
  const target = num(w?.target);
  const hired = num(w?.hired);
  const p = w?.progress;
  return {
    campaignId: String(w?.campaignId ?? ""),
    name: String(w?.name ?? ""),
    status: w?.status === "closed" ? "closed" : "active",
    clientId: typeof w?.clientId === "string" ? w.clientId : null,
    client: typeof w?.client === "string" ? w.client : null,
    ownerId: typeof w?.ownerId === "string" ? w.ownerId : null,
    ownerName: typeof w?.ownerName === "string" ? w.ownerName : null,
    target,
    openedAt: String(w?.openedAt ?? ""),
    closedAt: typeof w?.closedAt === "string" ? w.closedAt : null,
    firstHireAt: typeof w?.firstHireAt === "string" ? w.firstHireAt : null,
    lastActivityAt: typeof w?.lastActivityAt === "string" ? w.lastActivityAt : null,
    found: num(w?.found),
    shortlisted: num(w?.shortlisted),
    contacted: num(w?.contacted),
    replied: num(w?.replied),
    interviewed: num(w?.interviewed),
    hired,
    progress: {
      hired: num(p?.hired, hired),
      target: num(p?.target, target),
      share: Math.min(1, Math.max(0, num(p?.share, target > 0 ? hired / target : 0))),
    },
    daysOpen: num(w?.daysOpen),
    daysToFirstHire: numOrNull(w?.daysToFirstHire),
    daysToFill: numOrNull(w?.daysToFill),
    quiet: !!w?.quiet,
    quietDays: numOrNull(w?.quietDays),
    activeInPeriod: typeof w?.activeInPeriod === "boolean" ? w.activeInPeriod : true,
  };
}

export function adaptCampaigns(w: W): CampaignsAnalytics {
  return {
    ...envelope(w),
    quietAfterDays: num(w?.quietAfterDays, 7),
    campaigns: list(w?.campaigns).map(campaign),
    clients: list(w?.clients).map((c) => ({
      clientId: String(c.clientId),
      name: String(c.name ?? ""),
      campaigns: num(c.campaigns),
      active: num(c.active),
      hired: num(c.hired),
      planned: num(c.planned),
      medianDaysToFirstHire: median(
        "days",
        c.medianDaysToFirstHire,
        c.medianDaysToFirstHireN ?? (numOrNull(c.medianDaysToFirstHire) === null ? 0 : MIN_MEDIAN),
      ),
      replied: ratio(c.replied),
    })),
  };
}
