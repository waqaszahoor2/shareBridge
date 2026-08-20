import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import AppHeader from '@/components/AppHeader';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
});

export const metadata: Metadata = {
  title: {
    default: 'PeerBridge — Secure P2P File Transfer',
    template: '%s | PeerBridge'
  },
  description: 'Send large files directly between browsers with a short connection code. No permanent file storage.',
  applicationName: 'PeerBridge',
  robots: { index: true, follow: true }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#6d4aff'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <div className="ambient ambientOne" />
        <div className="ambient ambientTwo" />
        <AppHeader />
        {children}
        <footer className="siteFooter">
          <div className="shell footerInner">
            <span>© {new Date().getFullYear()} PeerBridge</span>
            <span>Files travel peer-to-peer. Session metadata expires automatically.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
