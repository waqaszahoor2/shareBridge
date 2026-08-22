'use client';

import { useState } from 'react';
import Link from 'next/link';

export function BrandMark() {
  return (
    <span className="brandMark" aria-hidden="true">
      <svg viewBox="0 0 32 32" role="img">
        <path d="M9 8.5 16 15.5 23 8.5M9 23.5 16 16.5l7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="m8 9 7-7m9 7-7-7M8 23l7 7m9-7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      </svg>
    </span>
  );
}

export default function AppHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function closeMenu() {
    setMobileMenuOpen(false);
  }

  return (
    <header className="siteHeader">
      <div className="shell headerInner">
        <Link className="brand" href="/" aria-label="PeerBridge home" onClick={closeMenu}>
          <BrandMark />
          <span>PeerBridge</span>
        </Link>

        <nav className="headerNav desktopNav" aria-label="Primary navigation">
          <a href="/#how">How it works</a>
          <a href="/#features">Features</a>
          <a href="/#security">Security</a>
        </nav>

        <div className="headerActions">
          <Link className="button buttonSmall desktopSendBtn" href="/send">
            Send files
          </Link>

          <button
            type="button"
            className="mobileMenuToggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="mobileNavDrawer" role="dialog" aria-modal="true">
          <nav className="mobileNavList">
            <a href="/#how" onClick={closeMenu}>How it works</a>
            <a href="/#features" onClick={closeMenu}>Features</a>
            <a href="/#security" onClick={closeMenu}>Security</a>
            <Link className="button buttonFull" href="/send" onClick={closeMenu}>
              Send files →
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
