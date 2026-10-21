import type { Hue } from "./orchestrator";
import type { MatchResultView } from "./matchResult";

/**
 * Sourcing — the fixtures behind a sourcing run in the agent transcript.
 *
 * Frontend-only, like every other fixture on this surface. The brief matches
 * the campaign the rest of the page already describes (Senior Backend
 * Engineers, Postgres at scale is the hard requirement, India or remote), so
 * the run agrees with the tiles and the rail around it. Anika Bose is the same
 * "two years short, deepest Postgres work" candidate the question reply names.
 */

/* ── the trigger ─────────────────────────────────────────────────────────── */

/** A brief that should get the full sourcing run rather than a canned reply. */
export function isSourcingBrief(said: string): boolean {
  return /sourc/i.test(said);
}

/* ── the run's phases ────────────────────────────────────────────────────────
   Each phase is a live line while it runs and a disclosure once it is done.
   `ms` is how long the phase is held on screen; the label printed afterwards
   uses the MEASURED elapsed time, never this number. */

export type Phase = {
  id: string;
  /** Present tense, shown while the phase runs. */
  live: string;
  /** Past tense, shown once it has finished: "Built the initial search". */
  done: string;
  ms: number;
  /** What the phase turned up, behind the disclosure. */
  steps: readonly string[];
  /** The agent's paragraph once the phase lands. */
  says: string;
  /** False hides the measured duration (a clarify finding is not work). */
  timed?: boolean;
};

export const PLAN_PHASES: readonly Phase[] = [
  {
    id: "brief",
    live: "Reading your brief and past searches",
    done: "Read the brief and your history",
    ms: 2300,
    steps: [
      "Senior Backend Engineers — Postgres at scale is the one hard requirement",
      "3 earlier searches in this workspace, all for senior backend roles",
      "Your last shortlist leaned 7+ years, product companies over services",
    ],
    says:
      "I found your brief plus history from past searches — your team has previously shortlisted senior backend engineers who ran Postgres in production, so I'll keep an eye on seniority as we calibrate. Building the initial search now.",
  },
  {
    id: "build",
    live: "Building the initial search",
    done: "Built the initial search",
    ms: 2700,
    steps: [
      "Titles: Senior, Staff and Lead backend roles, plus platform and database engineers",
      "Location: Bangalore, Hyderabad, Pune, or remote within India",
      "Experience: 6+ years, so near-misses on seniority still surface",
      "Baseline: {n} profiles clear every filter",
    ],
    says:
      "Solid baseline — about 1,400 senior backend engineers in India, with Postgres and Go well represented. Here is what I'll search with. Adjust anything before I run it.",
  },
];

export const RUN_PHASES: readonly Phase[] = [
  {
    id: "search",
    live: "Searching {n} profiles",
    done: "Searched {n} profiles",
    ms: 2400,
    steps: [
      "Pulled current role, full history, education and public code for each profile",
      "412 show hands-on Postgres work in a role, not only in a skills list",
      "Dropped 38 already in another campaign of yours",
    ],
    says:
      "The search is landing well — a healthy pool, with strong density of people who have genuinely run Postgres in production rather than just listing it.",
  },
  {
    id: "calibrate",
    live: "Calibrating against your taste",
    done: "Calibrated against your taste",
    ms: 2600,
    steps: [
      "Ranked on your three criteria: Postgres at scale, Go or Rust, product-company tenure",
      "Weighted toward the profiles your past shortlists resemble",
      "Kept one strong near-miss on seniority so you can tell me if it matters",
    ],
    says:
      "Here are three clean fits to react to so I can calibrate to your taste. The third is two years short on seniority but has the deepest Postgres work in the pool — tell me whether that trade is worth making here.",
  },
];

/* ── the search the agent proposes ───────────────────────────────────────── */

export type Filter = { id: string; label: string; value: string };

/**
 * Written as the sentence the card reads out loud: "{title} in {location}
 * with {experience} of experience". The first three are named in that
 * sentence; the rest fold into "+N more".
 */
export const FILTERS: readonly Filter[] = [
  { id: "title", label: "Title", value: "Senior Backend Engineer" },
  { id: "location", label: "Location", value: "India or remote" },
  { id: "experience", label: "Experience", value: "6+ years" },
  { id: "company", label: "Company type", value: "Product companies" },
  { id: "skill", label: "Required skill", value: "PostgreSQL" },
];

export const CRITERIA: readonly string[] = [
  "Ran Postgres at scale",
  "Writes Go or Rust",
  "2+ years at a product company",
];

export const TOTAL_MATCHES = 1398;

/* ── candidates ──────────────────────────────────────────────────────────── */

export type Org = { name: string; hue: Hue };

export type Role = {
  title: string;
  start: string;
  end: string;
  /** Printed after the dates: "3 yrs 7 mos". */
  span: string;
  body?: string;
  skills?: readonly string[];
  promotion?: boolean;
};

/** One employer, and every role held there, newest first. */
export type Job = { org: Org; span: string; roles: readonly Role[] };

export type School = { org: Org; degree: string; years: string };

export type Candidate = {
  id: string;
  name: string;
  headline: string;
  location: string;
  hue: Hue;
  current: Org;
  school: Org;
  /** The agent's one-line read, with the phrases that earned the match. */
  summary: string;
  highlights: readonly string[];
  /** Which of the three ranking criteria this profile meets. */
  meets: readonly boolean[];
  /** False when the ranking has not judged this person yet: their marks are unknown, not misses. */
  scored?: boolean;
  /** Per ranking criterion, what the judge found: a mark can say "can't tell yet", which a miss does not. */
  checks?: ReadonlyArray<"met" | "partial" | "not_met" | "unknown">;
  /** What the server says about this person's fit (score, coverage, status, verdicts with quotes, override); absent for the demo. */
  result?: MatchResultView;
  /** The campaign the result is for, so a recruiter's call on it can be sent. */
  resultCampaignId?: string;
  /** The shared person behind a workspace candidate: what a match is keyed by (its `id` is the candidate's own). */
  personId?: string;
  totalYears: number;
  avgTenure: number;
  about: string;
  jobs: readonly Job[];
  schools: readonly School[];
  skills: Readonly<Record<string, readonly string[]>>;
  github?: { handle: string; since: string; repos: number };
  openToWork?: boolean;
  /** Their public profile, for a person from a connected workspace. */
  linkedinUrl?: string;
  /** True for someone already in the workspace, whose own row (notes, status) the sheet can read. */
  inWorkspace?: boolean;
};

export const CANDIDATES: readonly Candidate[] = [
  {
    id: "rohan-mehta",
    name: "Rohan Mehta",
    headline: "Staff Backend Engineer at Razorpay",
    location: "Bengaluru, Karnataka, India",
    hue: "blue",
    current: { name: "Razorpay", hue: "blue" },
    school: { name: "IIT Bombay", hue: "violet" },
    summary:
      "Rohan is a Staff Backend Engineer at Razorpay who led the payments ledger migration to sharded Postgres, handling 40k writes per second at peak.",
    highlights: ["Staff Backend Engineer at Razorpay", "sharded Postgres, handling 40k writes per second"],
    meets: [true, true, true],
    totalYears: 9,
    avgTenure: 3,
    about:
      "Backend engineer who likes boring, correct systems. I have spent most of the last decade on money movement: ledgers, reconciliation, idempotent APIs, and the Postgres clusters underneath them.",
    jobs: [
      {
        org: { name: "Razorpay", hue: "blue" },
        span: "5 yrs 2 mos",
        roles: [
          {
            title: "Staff Backend Engineer",
            start: "Apr 2023",
            end: "Present",
            span: "2 yrs 6 mos",
            promotion: true,
            body:
              "Leading the ledger platform team of six. Designed the migration from a single Postgres primary to a 16-shard Citus cluster with zero downtime, and cut reconciliation lag from 40 minutes to under 2.",
            skills: ["Go", "PostgreSQL", "Citus", "Kafka"],
          },
          {
            title: "Senior Backend Engineer",
            start: "Aug 2020",
            end: "Apr 2023",
            span: "2 yrs 8 mos",
            body:
              "Built the idempotency layer used by every payments API. Owned on-call for the ledger database and wrote the runbooks the team still uses.",
            skills: ["Go", "PostgreSQL", "Redis"],
          },
        ],
      },
      {
        org: { name: "Flipkart", hue: "amber" },
        span: "3 yrs 4 mos",
        roles: [
          {
            title: "Software Engineer II",
            start: "Jun 2017",
            end: "Jul 2020",
            span: "3 yrs 1 mo",
            body: "Order management services in Java. Moved the order history store from MySQL to Postgres partitions.",
            skills: ["Java", "Spring Boot", "PostgreSQL"],
          },
        ],
      },
    ],
    schools: [{ org: { name: "IIT Bombay", hue: "violet" }, degree: "B.Tech, Computer Science", years: "2012 – 2016" }],
    skills: {
      "Back-End": ["Go", "Java", "gRPC", "REST APIs", "Spring Boot"],
      Databases: ["PostgreSQL", "Citus", "Redis", "MySQL"],
      Infrastructure: ["Kafka", "Kubernetes", "Terraform", "AWS"],
      Practices: ["Distributed Systems", "On-call", "System Design"],
    },
    github: { handle: "rohanm", since: "Mar 2014", repos: 41 },
  },
  {
    id: "priya-nair",
    name: "Priya Nair",
    headline: "Senior Software Engineer, Data Platform at Swiggy",
    location: "Bengaluru, Karnataka, India",
    hue: "teal",
    current: { name: "Swiggy", hue: "amber" },
    school: { name: "NIT Trichy", hue: "teal" },
    summary:
      "Priya is a Senior Engineer on Swiggy's data platform who owns the Postgres fleet behind order tracking, and writes most of her services in Rust.",
    highlights: ["owns the Postgres fleet behind order tracking", "writes most of her services in Rust"],
    meets: [true, true, true],
    totalYears: 8,
    avgTenure: 2.7,
    about:
      "I work where databases meet product. Currently making order tracking fast for a few million people a day. Previously search infrastructure. Rust in production since 2021.",
    jobs: [
      {
        org: { name: "Swiggy", hue: "amber" },
        span: "3 yrs 10 mos",
        roles: [
          {
            title: "Senior Software Engineer, Data Platform",
            start: "Dec 2021",
            end: "Present",
            span: "3 yrs 10 mos",
            body:
              "Own the 22-node Postgres fleet behind live order tracking. Rewrote the location-ingest service in Rust, dropping p99 from 180ms to 14ms and halving the fleet's CPU.",
            skills: ["Rust", "PostgreSQL", "PgBouncer", "Kafka"],
          },
        ],
      },
      {
        org: { name: "Myntra", hue: "rose" },
        span: "2 yrs 6 mos",
        roles: [
          {
            title: "Software Engineer, Search",
            start: "Jun 2019",
            end: "Dec 2021",
            span: "2 yrs 6 mos",
            body: "Catalogue indexing pipeline and the query service in front of Elasticsearch.",
            skills: ["Java", "Elasticsearch", "PostgreSQL"],
          },
        ],
      },
      {
        org: { name: "Infosys", hue: "blue" },
        span: "1 yr 11 mos",
        roles: [
          { title: "Systems Engineer", start: "Jul 2017", end: "Jun 2019", span: "1 yr 11 mos" },
        ],
      },
    ],
    schools: [{ org: { name: "NIT Trichy", hue: "teal" }, degree: "B.Tech, Information Technology", years: "2013 – 2017" }],
    skills: {
      "Back-End": ["Rust", "Java", "Tokio", "gRPC"],
      Databases: ["PostgreSQL", "PgBouncer", "Elasticsearch", "TimescaleDB"],
      Infrastructure: ["Kafka", "Kubernetes", "Prometheus"],
    },
    github: { handle: "priyanair", since: "Aug 2016", repos: 27 },
    openToWork: true,
  },
  {
    id: "anika-bose",
    name: "Anika Bose",
    headline: "Backend Engineer at Zerodha",
    location: "Remote · Kolkata, West Bengal, India",
    hue: "rose",
    current: { name: "Zerodha", hue: "sage" },
    school: { name: "Jadavpur University", hue: "brand" },
    summary:
      "Anika has 6 years against the brief's 8, but the deepest Postgres work in the pool: she maintains Zerodha's order-book archive, 60 TB on Postgres with logical replication.",
    highlights: ["6 years against the brief's 8", "60 TB on Postgres with logical replication"],
    meets: [true, true, false],
    totalYears: 6,
    avgTenure: 3,
    about:
      "Postgres person. I contribute to pg_partman and write about query planning on my blog. Go by day, a little Rust on weekends.",
    jobs: [
      {
        org: { name: "Zerodha", hue: "sage" },
        span: "3 yrs 9 mos",
        roles: [
          {
            title: "Backend Engineer",
            start: "Jan 2022",
            end: "Present",
            span: "3 yrs 9 mos",
            body:
              "Maintain the order-book archive: 60 TB on Postgres with native partitioning and logical replication to analytics. Cut the nightly archive job from 5 hours to 35 minutes.",
            skills: ["Go", "PostgreSQL", "pg_partman"],
          },
        ],
      },
      {
        org: { name: "Hasura", hue: "violet" },
        span: "2 yrs 3 mos",
        roles: [
          {
            title: "Software Engineer",
            start: "Sep 2019",
            end: "Dec 2021",
            span: "2 yrs 3 mos",
            body: "Worked on the Postgres query planner integration in the GraphQL engine.",
            skills: ["Haskell", "PostgreSQL", "GraphQL"],
          },
        ],
      },
    ],
    schools: [{ org: { name: "Jadavpur University", hue: "brand" }, degree: "B.E., Computer Science", years: "2015 – 2019" }],
    skills: {
      "Back-End": ["Go", "Haskell", "Rust", "GraphQL"],
      Databases: ["PostgreSQL", "pg_partman", "Logical replication", "ClickHouse"],
      "Open source": ["pg_partman contributor", "Technical writing"],
    },
    github: { handle: "anikab", since: "Jan 2016", repos: 58 },
  },
  {
    id: "vikram-iyer",
    name: "Vikram Iyer",
    headline: "Lead Engineer, Core Platform at Freshworks",
    location: "Chennai, Tamil Nadu, India",
    hue: "amber",
    current: { name: "Freshworks", hue: "sage" },
    school: { name: "BITS Pilani", hue: "blue" },
    summary:
      "Vikram leads Freshworks' core platform team and ran the multi-tenant Postgres consolidation across 4,000 customer databases.",
    highlights: ["leads Freshworks' core platform team", "multi-tenant Postgres consolidation"],
    meets: [true, false, true],
    totalYears: 11,
    avgTenure: 3.7,
    about: "Platform engineer and team lead. I care about tenancy, migrations, and making the next engineer's week easier.",
    jobs: [
      {
        org: { name: "Freshworks", hue: "sage" },
        span: "6 yrs 1 mo",
        roles: [
          {
            title: "Lead Engineer, Core Platform",
            start: "Oct 2022",
            end: "Present",
            span: "3 yrs",
            promotion: true,
            body: "Lead a team of nine. Consolidated 4,000 per-customer databases into a pooled multi-tenant Postgres design.",
            skills: ["Ruby", "Java", "PostgreSQL"],
          },
          { title: "Senior Engineer", start: "Sep 2019", end: "Oct 2022", span: "3 yrs 1 mo" },
        ],
      },
      {
        org: { name: "ThoughtWorks", hue: "rose" },
        span: "4 yrs 8 mos",
        roles: [{ title: "Senior Consultant", start: "Jan 2015", end: "Sep 2019", span: "4 yrs 8 mos" }],
      },
    ],
    schools: [{ org: { name: "BITS Pilani", hue: "blue" }, degree: "B.E., Computer Science", years: "2010 – 2014" }],
    skills: {
      "Back-End": ["Ruby on Rails", "Java", "Kotlin"],
      Databases: ["PostgreSQL", "MySQL", "Redis"],
      Leadership: ["Team lead", "Hiring", "Architecture reviews"],
    },
  },
  {
    id: "sneha-kulkarni",
    name: "Sneha Kulkarni",
    headline: "Senior Backend Engineer at CRED",
    location: "Pune, Maharashtra, India",
    hue: "violet",
    current: { name: "CRED", hue: "violet" },
    school: { name: "COEP Pune", hue: "amber" },
    summary:
      "Sneha builds CRED's rewards engine in Go on Postgres, and moved its hottest tables to partitioning without a maintenance window.",
    highlights: ["rewards engine in Go on Postgres", "without a maintenance window"],
    meets: [true, true, true],
    totalYears: 7,
    avgTenure: 2.3,
    about: "Go and Postgres. I like the part of the job where a migration ships and nobody notices.",
    jobs: [
      {
        org: { name: "CRED", hue: "violet" },
        span: "2 yrs 11 mos",
        roles: [
          {
            title: "Senior Backend Engineer",
            start: "Nov 2022",
            end: "Present",
            span: "2 yrs 11 mos",
            body: "Rewards and offers engine. Partitioned the three hottest tables online using pg_repack and dual writes.",
            skills: ["Go", "PostgreSQL", "Redis"],
          },
        ],
      },
      {
        org: { name: "PhonePe", hue: "violet" },
        span: "2 yrs 5 mos",
        roles: [{ title: "Software Engineer", start: "Jun 2020", end: "Nov 2022", span: "2 yrs 5 mos" }],
      },
      {
        org: { name: "Persistent Systems", hue: "blue" },
        span: "1 yr 11 mos",
        roles: [{ title: "Software Engineer", start: "Jul 2018", end: "Jun 2020", span: "1 yr 11 mos" }],
      },
    ],
    schools: [{ org: { name: "COEP Pune", hue: "amber" }, degree: "B.Tech, Computer Engineering", years: "2014 – 2018" }],
    skills: {
      "Back-End": ["Go", "Java", "gRPC"],
      Databases: ["PostgreSQL", "Redis", "DynamoDB"],
      Infrastructure: ["AWS", "Docker", "Grafana"],
    },
    github: { handle: "snehak", since: "Feb 2017", repos: 19 },
  },
  {
    id: "arjun-reddy",
    name: "Arjun Reddy",
    headline: "Database Reliability Engineer at Atlassian",
    location: "Remote · Hyderabad, Telangana, India",
    hue: "sage",
    current: { name: "Atlassian", hue: "blue" },
    school: { name: "IIIT Hyderabad", hue: "sage" },
    summary:
      "Arjun is a DBRE at Atlassian running Postgres for Jira Cloud across three regions, and has moved from pure ops into writing Go tooling.",
    highlights: ["running Postgres for Jira Cloud across three regions", "writing Go tooling"],
    meets: [true, true, true],
    totalYears: 8,
    avgTenure: 4,
    about: "Database reliability. Failovers should be boring. I write the tools that make them boring.",
    jobs: [
      {
        org: { name: "Atlassian", hue: "blue" },
        span: "4 yrs 2 mos",
        roles: [
          {
            title: "Database Reliability Engineer",
            start: "Aug 2021",
            end: "Present",
            span: "4 yrs 2 mos",
            body: "Postgres for Jira Cloud across three regions. Built the Go failover orchestrator that took regional failover from 11 minutes to 40 seconds.",
            skills: ["Go", "PostgreSQL", "Patroni", "AWS"],
          },
        ],
      },
      {
        org: { name: "Oracle", hue: "rose" },
        span: "3 yrs 10 mos",
        roles: [{ title: "Member of Technical Staff", start: "Oct 2017", end: "Aug 2021", span: "3 yrs 10 mos" }],
      },
    ],
    schools: [{ org: { name: "IIIT Hyderabad", hue: "sage" }, degree: "M.Tech, Computer Science", years: "2015 – 2017" }],
    skills: {
      "Back-End": ["Go", "Python", "Bash"],
      Databases: ["PostgreSQL", "Patroni", "pgBackRest", "Oracle"],
      Infrastructure: ["AWS", "Terraform", "Kubernetes"],
    },
  },
  {
    id: "kavya-sharma",
    name: "Kavya Sharma",
    headline: "Senior Software Engineer at Postman",
    location: "Bengaluru, Karnataka, India",
    hue: "brand",
    current: { name: "Postman", hue: "brand" },
    school: { name: "DTU Delhi", hue: "rose" },
    summary: "Kavya owns the workspace sync service at Postman, a Node and Go backend on Postgres serving 30M users.",
    highlights: ["workspace sync service at Postman", "Postgres serving 30M users"],
    meets: [true, true, true],
    totalYears: 7,
    avgTenure: 3.5,
    about: "Sync, conflict resolution, and APIs people build on. Node for years, Go since 2022.",
    jobs: [
      {
        org: { name: "Postman", hue: "brand" },
        span: "3 yrs 8 mos",
        roles: [
          { title: "Senior Software Engineer", start: "Feb 2022", end: "Present", span: "3 yrs 8 mos", skills: ["Go", "Node.js", "PostgreSQL"] },
        ],
      },
      {
        org: { name: "Zomato", hue: "rose" },
        span: "3 yrs 2 mos",
        roles: [{ title: "Software Engineer", start: "Dec 2018", end: "Feb 2022", span: "3 yrs 2 mos" }],
      },
    ],
    schools: [{ org: { name: "DTU Delhi", hue: "rose" }, degree: "B.Tech, Software Engineering", years: "2014 – 2018" }],
    skills: {
      "Back-End": ["Go", "Node.js", "TypeScript"],
      Databases: ["PostgreSQL", "Redis", "MongoDB"],
    },
  },
  {
    id: "rahul-verma",
    name: "Rahul Verma",
    headline: "Principal Engineer at Paytm",
    location: "Noida, Uttar Pradesh, India",
    hue: "blue",
    current: { name: "Paytm", hue: "blue" },
    school: { name: "IIT Delhi", hue: "amber" },
    summary: "Rahul is a Principal Engineer at Paytm with 13 years across payments backends, mostly Java on Postgres and Oracle.",
    highlights: ["Principal Engineer at Paytm", "Java on Postgres and Oracle"],
    meets: [true, false, true],
    totalYears: 13,
    avgTenure: 4.3,
    about: "Payments infrastructure for over a decade.",
    jobs: [
      {
        org: { name: "Paytm", hue: "blue" },
        span: "7 yrs",
        roles: [{ title: "Principal Engineer", start: "Oct 2018", end: "Present", span: "7 yrs", skills: ["Java", "PostgreSQL", "Oracle"] }],
      },
      {
        org: { name: "Amazon", hue: "amber" },
        span: "6 yrs",
        roles: [{ title: "SDE II", start: "Aug 2012", end: "Oct 2018", span: "6 yrs" }],
      },
    ],
    schools: [{ org: { name: "IIT Delhi", hue: "amber" }, degree: "B.Tech, Electrical Engineering", years: "2008 – 2012" }],
    skills: { "Back-End": ["Java", "Scala"], Databases: ["PostgreSQL", "Oracle", "Cassandra"] },
  },
  {
    id: "meghna-das",
    name: "Meghna Das",
    headline: "Backend Engineer II at Dunzo",
    location: "Bengaluru, Karnataka, India",
    hue: "teal",
    current: { name: "Dunzo", hue: "teal" },
    school: { name: "Manipal Institute of Technology", hue: "brand" },
    summary: "Meghna builds Dunzo's dispatch services in Go, with Postgres and PostGIS for live rider location.",
    highlights: ["dispatch services in Go", "Postgres and PostGIS"],
    meets: [true, true, true],
    totalYears: 6,
    avgTenure: 2,
    about: "Geospatial backends and dispatch.",
    jobs: [
      {
        org: { name: "Dunzo", hue: "teal" },
        span: "2 yrs 4 mos",
        roles: [{ title: "Backend Engineer II", start: "Jun 2023", end: "Present", span: "2 yrs 4 mos", skills: ["Go", "PostgreSQL", "PostGIS"] }],
      },
      {
        org: { name: "Ola", hue: "sage" },
        span: "3 yrs 6 mos",
        roles: [{ title: "Software Engineer", start: "Dec 2019", end: "Jun 2023", span: "3 yrs 6 mos" }],
      },
    ],
    schools: [{ org: { name: "Manipal Institute of Technology", hue: "brand" }, degree: "B.Tech, Computer Science", years: "2015 – 2019" }],
    skills: { "Back-End": ["Go", "Python"], Databases: ["PostgreSQL", "PostGIS", "Redis"] },
    openToWork: true,
  },
  {
    id: "siddharth-rao",
    name: "Siddharth Rao",
    headline: "Senior Engineer, Storage at Google",
    location: "Bengaluru, Karnataka, India",
    hue: "violet",
    current: { name: "Google", hue: "blue" },
    school: { name: "IISc Bangalore", hue: "violet" },
    summary: "Siddharth works on AlloyDB storage at Google, contributing to its Postgres-compatible WAL pipeline in C++.",
    highlights: ["AlloyDB storage at Google", "Postgres-compatible WAL pipeline"],
    meets: [true, false, false],
    totalYears: 9,
    avgTenure: 4.5,
    about: "Storage engines and the WAL.",
    jobs: [
      {
        org: { name: "Google", hue: "blue" },
        span: "4 yrs 6 mos",
        roles: [{ title: "Senior Engineer, Storage", start: "Apr 2021", end: "Present", span: "4 yrs 6 mos", skills: ["C++", "PostgreSQL internals"] }],
      },
      {
        org: { name: "Nutanix", hue: "sage" },
        span: "4 yrs 7 mos",
        roles: [{ title: "Member of Technical Staff", start: "Sep 2016", end: "Apr 2021", span: "4 yrs 7 mos" }],
      },
    ],
    schools: [{ org: { name: "IISc Bangalore", hue: "violet" }, degree: "M.E., Computer Science", years: "2014 – 2016" }],
    skills: { Systems: ["C++", "Rust"], Databases: ["PostgreSQL internals", "WAL", "Storage engines"] },
  },
  {
    id: "neha-joshi",
    name: "Neha Joshi",
    headline: "Senior Backend Engineer at Groww",
    location: "Remote · Indore, Madhya Pradesh, India",
    hue: "sage",
    current: { name: "Groww", hue: "sage" },
    school: { name: "IIIT Allahabad", hue: "teal" },
    summary: "Neha runs the portfolio service at Groww, Go on Postgres, and moved its read path to replicas with lag-aware routing.",
    highlights: ["portfolio service at Groww", "lag-aware routing"],
    meets: [true, true, true],
    totalYears: 7,
    avgTenure: 2.3,
    about: "Fintech backends. Reads are the easy part until they are not.",
    jobs: [
      {
        org: { name: "Groww", hue: "sage" },
        span: "3 yrs 1 mo",
        roles: [{ title: "Senior Backend Engineer", start: "Sep 2022", end: "Present", span: "3 yrs 1 mo", skills: ["Go", "PostgreSQL"] }],
      },
      {
        org: { name: "Walmart Global Tech", hue: "blue" },
        span: "3 yrs 3 mos",
        roles: [{ title: "Software Engineer III", start: "Jun 2019", end: "Sep 2022", span: "3 yrs 3 mos" }],
      },
    ],
    schools: [{ org: { name: "IIIT Allahabad", hue: "teal" }, degree: "B.Tech, Information Technology", years: "2014 – 2018" }],
    skills: { "Back-End": ["Go", "Java"], Databases: ["PostgreSQL", "Redis", "Kafka"] },
  },
  {
    id: "aditya-menon",
    name: "Aditya Menon",
    headline: "Staff Engineer at Chargebee",
    location: "Chennai, Tamil Nadu, India",
    hue: "amber",
    current: { name: "Chargebee", hue: "brand" },
    school: { name: "Anna University", hue: "amber" },
    summary: "Aditya is a Staff Engineer at Chargebee who owns the billing engine's Postgres schema and its multi-region rollout.",
    highlights: ["Staff Engineer at Chargebee", "multi-region rollout"],
    meets: [true, false, true],
    totalYears: 10,
    avgTenure: 5,
    about: "Billing, money, and the edge cases between them.",
    jobs: [
      {
        org: { name: "Chargebee", hue: "brand" },
        span: "5 yrs 5 mos",
        roles: [{ title: "Staff Engineer", start: "May 2020", end: "Present", span: "5 yrs 5 mos", skills: ["Java", "PostgreSQL"] }],
      },
      {
        org: { name: "Zoho", hue: "rose" },
        span: "4 yrs 9 mos",
        roles: [{ title: "Member Technical Staff", start: "Aug 2015", end: "May 2020", span: "4 yrs 9 mos" }],
      },
    ],
    schools: [{ org: { name: "Anna University", hue: "amber" }, degree: "B.E., Computer Science", years: "2011 – 2015" }],
    skills: { "Back-End": ["Java", "Kotlin"], Databases: ["PostgreSQL", "MySQL"] },
  },
];

/** How many the transcript shows before "See all". */
export const PREVIEW_COUNT = 3;

export type Verdict = "shortlisted" | "rejected";

export const initials = (name: string): string =>
  name.split(/\s+/).map((w) => Array.from(w)[0] ?? "").slice(0, 2).join("").toUpperCase();

/* ── the ranked list's vocabulary ────────────────────────────────────────────
   The list reads down columns instead of across paragraphs, so each criterion
   needs a short column name, and each candidate one sentence of WHY they rank
   where they do — the single fact a recruiter would otherwise dig for.       */

/** Column heads for the fit grid, index-aligned with CRITERIA. */
export const CRITERIA_SHORT: readonly string[] = ["Postgres", "Go / Rust", "Product"];

export const REASON: Readonly<Record<string, string>> = {
  "rohan-mehta": "Led a zero-downtime move to 16 Postgres shards at 40k writes/s",
  "priya-nair": "Owns a 22-node Postgres fleet; rewrote ingest in Rust, p99 180→14ms",
  "anika-bose": "Two years short on seniority, deepest Postgres work in the pool",
  "vikram-iyer": "Consolidated 4,000 tenant databases into pooled Postgres",
  "sneha-kulkarni": "Partitioned hot tables online, no maintenance window",
  "arjun-reddy": "Built the Go failover tool that took Jira's failover to 40s",
  "kavya-sharma": "Sync service on Postgres for 30M users, Go since 2022",
  "rahul-verma": "13 years of payments backends, Java rather than Go",
  "meghna-das": "Dispatch in Go on PostGIS; open to work",
  "siddharth-rao": "Postgres internals at AlloyDB, but C++ and no product tenure",
  "neha-joshi": "Lag-aware replica routing for Groww's portfolio reads",
  "aditya-menon": "Owns a billing schema through a multi-region rollout",
};

/** "Present" is this month: the fixtures' spans were written against Sep 2025, and a real profile's against today. */
const today = new Date();
const NOW = { y: today.getFullYear(), m: today.getMonth() };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toIndex = (s: string): number => {
  if (s === "Present") return NOW.y * 12 + NOW.m;
  const [mon, yr] = s.split(" ");
  return Number(yr) * 12 + Math.max(0, MONTHS.indexOf(mon ?? ""));
};

export type Segment = {
  org: Org; title: string; from: string; to: string; months: number; current: boolean;
  /** Absolute month indices (year * 12 + month), for placing on an axis. */
  start: number; end: number;
};

export const NOW_INDEX = NOW.y * 12 + NOW.m;

/**
 * Employers oldest first, each with how long it lasted — the input to the
 * trajectory strip. Derived from the same role dates the profile prints, so
 * the strip and the history can never disagree.
 */
export function trajectory(c: Candidate): readonly Segment[] {
  return c.jobs
    // A role whose dates a profile doesn't give has nowhere to sit on the axis.
    .filter((j) => j.roles.length > 0 && Number.isFinite(toIndex(j.roles[j.roles.length - 1]!.start)) && Number.isFinite(toIndex(j.roles[0]!.end)))
    .map((j) => {
      const first = j.roles[j.roles.length - 1]!;
      const last = j.roles[0]!;
      return {
        org: j.org,
        title: last.title,
        from: first.start,
        to: last.end,
        months: Math.max(1, toIndex(last.end) - toIndex(first.start)),
        current: last.end === "Present",
        start: toIndex(first.start),
        end: toIndex(last.end),
      };
    })
    .reverse();
}
