'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { applyThemeMode, readThemeMode, saveThemeMode, type ThemeMode } from '@/lib/client/theme';

const OPTIONS: { mode: ThemeMode; icon: string; title: string; description: string }[] = [
  { mode: 'system', icon: '◐', title: 'System', description: 'Follow your device appearance.' },
  { mode: 'light', icon: '☀', title: 'Light', description: 'Use a bright appearance everywhere.' },
  { mode: 'dark', icon: '☾', title: 'Dark', description: 'Use a low-light appearance everywhere.' }
];

export default function ThemeSettings() {
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const current = readThemeMode();
    setTheme(current);
    applyThemeMode(current);
  }, []);

  function chooseTheme(mode: ThemeMode) {
    setTheme(mode);
    setNotice(saveThemeMode(mode)
      ? `${OPTIONS.find((option) => option.mode === mode)?.title} theme saved.`
      : 'Theme applied, but this browser could not save your preference.');
  }

  return (
    <main className="shell utilityPage">
      <header className="utilityHeader">
        <span className="sectionLabel">Personalize</span>
        <h1>Settings</h1>
        <p>Choose how PeerBridge looks on this device.</p>
      </header>

      <section className="utilityCard settingsCard">
        <div className="settingsSectionHeading">
          <span className="utilityHeroIcon" aria-hidden="true">◐</span>
          <div>
            <h2>Appearance</h2>
            <p>Your theme is saved locally in this browser.</p>
          </div>
        </div>
        <div className="themeOptions" role="group" aria-label="Theme mode">
          {OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              className={`themeOption ${theme === option.mode ? 'themeOptionActive' : ''}`}
              aria-pressed={theme === option.mode}
              onClick={() => chooseTheme(option.mode)}
            >
              <span className="themeOptionIcon" aria-hidden="true">{option.icon}</span>
              <span className="themeOptionText">
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </span>
              <span className="themeOptionCheck" aria-hidden="true">{theme === option.mode ? '✓' : ''}</span>
            </button>
          ))}
        </div>
        {notice && <p className="utilityNotice" role="status">{notice}</p>}
      </section>

      <section className="utilityCard privacySettings">
        <h2>Privacy</h2>
        <p>Transfer history contains file names, sizes, direction, and completion time. It stays in this browser and can be removed from the History page.</p>
        <Link className="button buttonGhost buttonSmall" href="/history">Open history</Link>
      </section>
    </main>
  );
}
