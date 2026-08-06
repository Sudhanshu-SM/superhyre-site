import { useState } from 'react';

const NAV_LINKS: { label: string; href: string }[] = [
  { label: 'Advantage', href: 'index.html#features' },
  { label: 'Process', href: 'index.html#process' },
  { label: 'Philosophy', href: 'index.html#philosophy' },
  { label: 'Decision', href: 'index.html#decision' }
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  const toggle = () => setOpen((v) => !v);

  return (
    <>
      {/* Desktop / Mobile Bar */}
      <header className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
        {/* Logo */}
        <a href="index.html" className="flex items-center gap-2">
          <span
            className="font-heading text-[21px] sm:text-[26px] tracking-tight text-black"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            SUPERHYRE
          </span>
          <span className="text-[#FF4301]" style={{ fontFamily: 'var(--font-heading)' }}>
            .
          </span>
        </a>

        {/* Desktop Nav Links */}
        <nav className="hidden items-center gap-2 md:flex" aria-label="Main">
          {NAV_LINKS.map((link, idx) => (
            <span key={link.label} className="flex items-center gap-2">
              <a
                href={link.href}
                className="font-body text-[21px] text-black transition-opacity hover:opacity-60"
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

        {/* Desktop CTA */}
        <a
          href="index.html#contact"
          className="hidden font-body text-[21px] text-black underline underline-offset-2 transition-opacity hover:opacity-60 md:block"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Let's Talk
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
          href="index.html#contact"
          onClick={() => setOpen(false)}
          className="font-body text-[32px] font-medium text-black"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Let's Talk
        </a>
      </div>
    </>
  );
}