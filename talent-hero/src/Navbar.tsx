import { useEffect, useRef, useState } from 'react';

// The talent.html navbar reuses the EXACT index.html markup + classes
// (.topbar / .brand / .menu-toggle / .burger / .nav-overlay / .nav-link),
// which are styled by the shared style.css — same typography, hover colors,
// burger→X morph and nav-in stagger. The element set stays talent's own
// (brand + hamburger + 4 overlay links).
const NAV_LINKS: { label: string; id: string }[] = [
  { label: 'Advantage', id: 'features' },
  { label: 'Process', id: 'process' },
  { label: 'Philosophy', id: 'philosophy' },
  { label: 'Decision', id: 'decision' }
];

// Cross-page nav: when on talent.html, store the section intent in
// sessionStorage and load index.html; a small listener there (added in
// index.html) defers the scroll until layout settles, so the page no
// longer snaps back to the hero after navigating in from talent.
export function Navbar() {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const toggle = () => setOpen((v) => !v);

  const handleCrossPageNav = (id: string) => {
    setOpen(false);
    if (window.location.pathname === '/' || window.location.pathname.endsWith('index.html')) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
sessionStorage.setItem('targetSection', id);
    window.location.href = 'index.html';
  };

  // Mirrors nav.js setState() (index.html): toggles .is-active on the overlay,
  // .is-open on the trigger, locks body scroll, focuses the first nav link.
  useEffect(() => {
    const overlay = overlayRef.current;
    document.body.classList.toggle('no-scroll', open);
    if (open) {
      const first = overlay?.querySelector('.nav-link') as HTMLElement | null;
      first?.focus({ preventScroll: true });
    }
    return () => document.body.classList.remove('no-scroll');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* index.html `.topbar` — grid 1fr auto 1fr keeps the brand centred;
          fixed on talent so the hero's video canvas scrolls beneath it */}
      <header
        className={`topbar${open ? ' is-open' : ''}`}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, width: '100%' }}
      >
        <a
          href="index.html"
          className="brand"
          aria-label="SuperHyre home"
          style={{
            justifySelf: 'start',
            fontFamily: "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif",
            fontWeight: 750,
            fontSize: '20px',
            lineHeight: '29px'
          }}
        >
          SUPER<span className="accent">HYRE</span>
        </a>
        <div aria-hidden="true" />
        <button
          type="button"
          className={`menu-toggle${open ? ' is-open' : ''}`}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="nav-overlay"
          onClick={toggle}
        >
          <span className="burger" />
        </button>
      </header>

      {/* index.html `.nav-overlay` — full-screen dark menu, staggered links */}
      <div
        ref={overlayRef}
        id="nav-overlay"
        className={`nav-overlay dark-section${open ? ' is-active' : ''}`}
        aria-hidden={!open}
      >
        <nav className="nav-links" aria-label="Main">
          {NAV_LINKS.map((link, idx) => (
            <a
              key={link.label}
              href={`index.html#${link.id}`}
              className="nav-link"
              style={{ '--i': idx } as React.CSSProperties}
              onClick={(e) => {
                e.preventDefault();
                handleCrossPageNav(link.id);
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}