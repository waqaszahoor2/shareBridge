import type { Metadata } from 'next';
import ThemeSettings from '@/components/ThemeSettings';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return <ThemeSettings />;
}
