'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

type ThemeMode = 'system' | 'light' | 'dark';

export default function AppHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
        toggleBtnRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const saved = localStorage.getItem('peerbridge_theme') as ThemeMode | null;
    if (saved && ['system', 'light', 'dark'].includes(saved)) {
      setTheme(saved);
      applyTheme(saved);
    } else {
      applyTheme('system');
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const current = (localStorage.getItem('peerbridge_theme') as ThemeMode | null) || 'system';
      if (current === 'system') applyTheme('system');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  function applyTheme(mode: ThemeMode) {
    const root = document.documentElement;
    if (mode === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', mode);
    }
  }

  function handleThemeChange(mode: ThemeMode) {
    setTheme(mode);
    localStorage.setItem('peerbridge_theme', mode);
    applyTheme(mode);
  }

  function closeMenu() {
    setMobileMenuOpen(false);
    toggleBtnRef.current?.focus();
  }

  // Header action button logic:
  // If on /send page -> show Receive files
  // If on /receive page -> show Send files
  // Default -> Send files
  const isSendPage = pathname === '/send';
  const actionHref = isSendPage ? '/receive' : '/send';
  const actionLabel = isSendPage ? 'Receive files ↓' : 'Send files →';

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
          {/* Theme Selector Toggle */}
          <div className="themeSelector" role="group" aria-label="Theme mode switcher">
            <button
              type="button"
              className={`themeBtn ${theme === 'light' ? 'themeBtnActive' : ''}`}
              onClick={() => handleThemeChange('light')}
              title="Light mode"
              aria-label="Set light mode"
            >
              ☀️
            </button>
            <button
              type="button"
              className={`themeBtn ${theme === 'dark' ? 'themeBtnActive' : ''}`}
              onClick={() => handleThemeChange('dark')}
              title="Dark mode"
              aria-label="Set dark mode"
            >
              🌙
            </button>
            <button
              type="button"
              className={`themeBtn ${theme === 'system' ? 'themeBtnActive' : ''}`}
              onClick={() => handleThemeChange('system')}
              title="Auto system appearance"
              aria-label="Set auto system appearance mode"
            >
              💻
            </button>
          </div>

          <Link className="button buttonSmall desktopSendBtn" href={actionHref}>
            {actionLabel}
          </Link>

          <button
            ref={toggleBtnRef}
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
        <div className="mobileNavDrawer" role="dialog" aria-modal="true" aria-label="Mobile Navigation Menu">
          <nav className="mobileNavList">
            <a href="/#how" onClick={closeMenu}>How it works</a>
            <a href="/#features" onClick={closeMenu}>Features</a>
            <a href="/#security" onClick={closeMenu}>Security</a>

            <div className="mobileThemeRow">
              <span>Theme:</span>
              <button
                type="button"
                className={`themeBtn ${theme === 'light' ? 'themeBtnActive' : ''}`}
                onClick={() => handleThemeChange('light')}
              >
                ☀️ Light
              </button>
              <button
                type="button"
                className={`themeBtn ${theme === 'dark' ? 'themeBtnActive' : ''}`}
                onClick={() => handleThemeChange('dark')}
              >
                🌙 Dark
              </button>
              <button
                type="button"
                className={`themeBtn ${theme === 'system' ? 'themeBtnActive' : ''}`}
                onClick={() => handleThemeChange('system')}
              >
                💻 Auto
              </button>
            </div>

            <Link className="button buttonFull" href={actionHref} onClick={closeMenu}>
              {actionLabel}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

