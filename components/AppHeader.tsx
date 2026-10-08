'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import TutorialModal from '@/components/TutorialModal';
import {
  applyThemeMode,
  readThemeMode,
  saveThemeMode,
  THEME_CHANGE_EVENT,
  type ThemeMode
} from '@/lib/client/theme';

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
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (dropdownOpen) setDropdownOpen(false);
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
          toggleBtnRef.current?.focus();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, dropdownOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const current = readThemeMode();
    setTheme(current);
    applyThemeMode(current);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const current = readThemeMode();
      if (current === 'system') applyThemeMode('system');
    };
    const handleThemeChange = (event: Event) => {
      const mode = (event as CustomEvent<ThemeMode>).detail;
      if (mode === 'system' || mode === 'light' || mode === 'dark') setTheme(mode);
    };
    mediaQuery.addEventListener('change', handleChange);
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    };
  }, []);

  function handleThemeChange(mode: ThemeMode) {
    setTheme(mode);
    saveThemeMode(mode);
    setDropdownOpen(false);
  }

  function closeMenu() {
    setMobileMenuOpen(false);
    setDropdownOpen(false);
    toggleBtnRef.current?.focus();
  }

  function openTutorial() {
    setTutorialOpen(true);
    closeMenu();
  }

  // Header action button logic:
  // If on /send page -> show Receive files
  // If on /receive page -> show Send files
  // Default -> Send files
  const isLandingPage = pathname === '/';
  const isSendPage = pathname === '/send';
  const actionHref = isSendPage ? '/receive' : '/send';
  const actionLabel = isSendPage ? 'Receive files ↓' : 'Send files →';

  const themeLabels: Record<ThemeMode, { icon: string; label: string }> = {
    light: { icon: '☀️', label: 'Light' },
    dark: { icon: '🌙', label: 'Dark' },
    system: { icon: '💻', label: 'System' }
  };

  return (
    <>
      <header className={`siteHeader ${isLandingPage ? 'siteHeaderLanding' : ''}`}>
        <div className="shell headerInner">
          <Link className="brand" href="/" aria-label="PeerBridge home" onClick={closeMenu}>
            <BrandMark />
            <span>PeerBridge</span>
          </Link>

          <nav className="headerNav desktopNav" aria-label="Primary navigation">
            <a href="/#how">How it works</a>
            <a href="/#features">Features</a>
            <a href="/#security">Security</a>
            <Link href="/history">History</Link>
            <Link href="/settings">Settings</Link>
            <button type="button" className="navHelpBtn" onClick={openTutorial}>
              ❓ How to Use
            </button>
          </nav>

          <div className="headerActions">
            {/* Vertical Popover Theme Switcher Dropdown */}
            <div className="themeDropdownWrapper" ref={dropdownRef}>
              <button
                type="button"
                className="themeDropdownTrigger"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-expanded={dropdownOpen}
                aria-label="Select theme appearance"
                title="Select theme appearance"
              >
                <span className="triggerIcon">{themeLabels[theme].icon}</span>
                <span className="triggerLabel">{themeLabels[theme].label}</span>
                <span className="triggerCaret" aria-hidden="true">{dropdownOpen ? '▲' : '▼'}</span>
              </button>

              {dropdownOpen && (
                <div className="themeVerticalDropdown" role="menu" aria-label="Theme options">
                  <button
                    type="button"
                    className={`themeDropdownItem ${theme === 'light' ? 'itemActive' : ''}`}
                    onClick={() => handleThemeChange('light')}
                    role="menuitem"
                  >
                    <span className="itemIcon">☀️</span>
                    <span className="itemLabel">Light</span>
                    {theme === 'light' && <span className="itemCheck">✓</span>}
                  </button>

                  <button
                    type="button"
                    className={`themeDropdownItem ${theme === 'dark' ? 'itemActive' : ''}`}
                    onClick={() => handleThemeChange('dark')}
                    role="menuitem"
                  >
                    <span className="itemIcon">🌙</span>
                    <span className="itemLabel">Dark</span>
                    {theme === 'dark' && <span className="itemCheck">✓</span>}
                  </button>

                  <button
                    type="button"
                    className={`themeDropdownItem ${theme === 'system' ? 'itemActive' : ''}`}
                    onClick={() => handleThemeChange('system')}
                    role="menuitem"
                  >
                    <span className="itemIcon">💻</span>
                    <span className="itemLabel">System (Auto)</span>
                    {theme === 'system' && <span className="itemCheck">✓</span>}
                  </button>
                </div>
              )}
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
              <Link href="/history" onClick={closeMenu}>Transfer history</Link>
              <Link href="/settings" onClick={closeMenu}>Settings</Link>
              <button type="button" className="mobileHelpBtn" onClick={openTutorial}>
                ❓ How to Use Tutorial
              </button>

              <div className="mobileThemeDropdownRow">
                <span className="mobileThemeTitle">Theme Mode</span>
                <div className="themeVerticalList">
                  <button
                    type="button"
                    className={`themeDropdownItem ${theme === 'light' ? 'itemActive' : ''}`}
                    onClick={() => handleThemeChange('light')}
                  >
                    <span className="itemIcon">☀️</span>
                    <span className="itemLabel">Light</span>
                    {theme === 'light' && <span className="itemCheck">✓</span>}
                  </button>

                  <button
                    type="button"
                    className={`themeDropdownItem ${theme === 'dark' ? 'itemActive' : ''}`}
                    onClick={() => handleThemeChange('dark')}
                  >
                    <span className="itemIcon">🌙</span>
                    <span className="itemLabel">Dark</span>
                    {theme === 'dark' && <span className="itemCheck">✓</span>}
                  </button>

                  <button
                    type="button"
                    className={`themeDropdownItem ${theme === 'system' ? 'itemActive' : ''}`}
                    onClick={() => handleThemeChange('system')}
                  >
                    <span className="itemIcon">💻</span>
                    <span className="itemLabel">System (Auto)</span>
                    {theme === 'system' && <span className="itemCheck">✓</span>}
                  </button>
                </div>
              </div>

              <Link className="button buttonFull" href={actionHref} onClick={closeMenu}>
                {actionLabel}
              </Link>
            </nav>
          </div>
        )}
      </header>

      <nav className="mobileBottomNav" aria-label="Quick navigation">
        <Link className={isLandingPage ? 'bottomNavActive' : ''} href="/" aria-current={isLandingPage ? 'page' : undefined}>
          <span aria-hidden="true">⌂</span><small>Home</small>
        </Link>
        <Link className={isSendPage ? 'bottomNavActive' : ''} href="/send" aria-current={isSendPage ? 'page' : undefined}>
          <span aria-hidden="true">↑</span><small>Send</small>
        </Link>
        <Link className={pathname === '/receive' ? 'bottomNavActive' : ''} href="/receive" aria-current={pathname === '/receive' ? 'page' : undefined}>
          <span aria-hidden="true">↓</span><small>Receive</small>
        </Link>
        <Link className={pathname === '/history' ? 'bottomNavActive' : ''} href="/history" aria-current={pathname === '/history' ? 'page' : undefined}>
          <span aria-hidden="true">◷</span><small>History</small>
        </Link>
        <Link className={pathname === '/settings' ? 'bottomNavActive' : ''} href="/settings" aria-current={pathname === '/settings' ? 'page' : undefined}>
          <span aria-hidden="true">⚙</span><small>Settings</small>
        </Link>
      </nav>

      {/* Auto First-Time Visitor & Manual Help Modal */}
      <TutorialModal
        isOpen={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        autoOpenOnLanding={isLandingPage}
      />
    </>
  );
}
