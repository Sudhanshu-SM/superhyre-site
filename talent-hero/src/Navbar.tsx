import { useState, type MouseEvent } from 'react';

const NAV_LINKS: { label: string; href: string }[] = [
  { label: 'Advantage', href: 'index.html#features' },
  { label: 'Process', href: 'index.html#process' },
  { label: 'Philosophy', href: 'index.html#philosophy' },
  { label: 'Decision', href: 'index.html#decision' }
];

// Mirrors index.html's `cta-talk-btn contact-link`: opens the shared
// #contactModal (contact.js only binds static .contact-link nodes, so the
// React-mounted navbar must open it directly).
function openContactModal(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  const modal = document.getElementById('contactModal') as HTMLElement | null;
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  const closeBtn = modal.querySelector('.modal-close') as HTMLElement | null;
  closeBtn?.focus();
}

export function Navbar() {
  const [open, setOpen] = useState(false);

  const toggle = () => setOpen((v) => !v);

  return (
    <>
      {/* Desktop / Mobile Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-black/5 bg-white/85 px-5 py-4 backdrop-blur-md sm:px-8">
        {/* Logo: SUPER (Black) + HYRE (#FF6000), no trailing dot */}
        <a href="index.html" className="flex items-center">
          <span
            className="font-heading text-[21px] font-black tracking-tight text-black sm:text-[26px]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            SUPER
            <span className="text-[#FF6000]">HYRE</span>
          </span>
        </a>

        {/* Desktop Nav Links */}
        <nav className="hidden items-center gap-2 md:flex" aria-label="Main">
          {NAV_LINKS.map((link, idx) => (
            <span key={link.label} className="flex items-center gap-2">
              <a
                href={link.href}
                className="font-body text-[21px] text-black transition-colors hover:text-[#FF6000]"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {link.label}
              </a>
              {idx < NAV_LINKS.length - 1 && (
                <span className="font-body text-[21px] text-black" style={{ fontFamily: 'var(--font-body)' }}>
                  ,
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* Desktop CTA — LET'S TALK ↗ (index signature: tracking-widest caps,
            black → #FF6000 on hover, inline arrow drifts up-right) */}
        <a
          href="#contact"
          onClick={openContactModal}
          className="group hidden items-center gap-1.5 py-1 font-body text-xs font-extrabold uppercase tracking-widest text-black transition-colors hover:text-[#FF6000] sm:text-sm md:inline-flex"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          <span>LET'S TALK</span>
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          >
            ↗
          </span>
        </a>

        {/* Mobile Hamburger */}
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="flex flex-col items-center gap-[5px] md:hidden"
        >
          <span
            className="h-[2px] w-6 bg-black transition-transform duration-300"
            style={{ transform: open ? 'rotate(45deg) translateY(7px)' : 'none' }}
          />
          <span
            className="h-[2px] w-6 bg-black transition-opacity duration-300"
            style={{ opacity: open ? 0 : 1 }}
          />
          <span
            className="h-[2px] w-6 bg-black transition-transform duration-300"
            style={{ transform: open ? 'rotate(-45deg) translateY(-7px)' : 'none' }}
          />
        </button>
      </header>

      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 z-[9] flex flex-col items-center justify-center gap-8 bg-white/95 px-8 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        } md:hidden`}
      >
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            onClick={() => setOpen(false)}
            className="font-body text-[32px] font-medium text-black"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {link.label}
          </a>
        ))}
        <a
          href="#contact"
          onClick={(e) => {
            setOpen(false);
            openContactModal(e);
          }}
          className="group inline-flex items-center gap-1.5 font-body text-[32px] font-extrabold uppercase tracking-widest text-black"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          <span>LET'S TALK</span>
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          >
            ↗
          </span>
        </a>
      </div>
    </>
  );
}