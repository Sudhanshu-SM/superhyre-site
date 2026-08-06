interface AssuranceCard {
  stat: string;
  statColor: string;
  title: string;
  description: string;
  footerTag: string;
}

const ASSURANCES: AssuranceCard[] = [
  {
    stat: '1\u00A0:\u00A01',
    statColor: '#FF6000',
    title: 'PRACTITIONER VETTING',
    description:
      "Your candidates aren't screened by keyword-matching HR reps. Every profile is evaluated directly by senior software engineers who test production-grade system design and code quality before shortlisting.",
    footerTag: 'TECHNICAL RIGOR'
  },
  {
    stat: '0%',
    statColor: '#000000',
    title: 'ZERO CODEBASE NOISE',
    description:
      "We don't send raw resume stacks hoping something sticks. You receive candidates engineered to seamlessly integrate into your existing tech stack, Git workflow, and team culture from day one.",
    footerTag: 'CULTURE & CODE ALIGNED'
  },
  {
    stat: '3-5',
    statColor: '#FF6000',
    title: 'HIGH-SIGNAL SHORTLIST',
    description:
      'Traditional recruitment agencies flood your inbox with dozens of unvetted profiles. We deliver a focused shortlist of 3 to 5 top-tier engineers who match your exact technical requirements.',
    footerTag: 'PRECISION SELECTION'
  }
];

export function TalentTrustSection() {
  return (
    <section
      className="sh-trust-section relative z-20 w-full bg-white px-6 py-20 text-black md:px-16"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-[#FF6000]">
            Why Hiring Managers Choose Us
          </span>
          <h2 className="mb-4 text-3xl font-black uppercase leading-tight tracking-tight sm:text-5xl">
            Recruitment Engineered for Results.
          </h2>
          <p className="text-base font-medium text-neutral-600 sm:text-lg">
            We removed traditional agency friction so you can hire elite technical talent with complete confidence.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {ASSURANCES.map((item) => (
            <div
              key={item.title}
              className="sh-trust-card flex flex-col justify-between rounded-2xl border border-neutral-200/80 bg-neutral-50/80 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-black hover:shadow-xl"
            >
              <div>
                <span
                  className="mb-4 block text-5xl font-black tracking-tight sm:text-6xl"
                  style={{ color: item.statColor }}
                >
                  {item.stat}
                </span>

                <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-black">{item.title}</h3>

                <p className="text-sm leading-relaxed text-neutral-600">{item.description}</p>
              </div>

              <div className="sh-trust-divider mt-8 flex items-center justify-between border-t border-neutral-200/80 pt-6 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                <span>{item.footerTag}</span>
                <span className="text-[#FF6000]">✓</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}