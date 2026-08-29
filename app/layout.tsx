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
  metadataBase: new URL('https://share-bridge-roan.vercel.app'),
  title: {
    default: 'PeerBridge — Secure P2P File Transfer',
    template: '%s | PeerBridge'
  },
  description: 'Send large files directly between browsers with a short connection code. No permanent file storage.',
  applicationName: 'PeerBridge',
  keywords: ['P2P file transfer', 'WebRTC', 'browser file sharing', 'large file transfer', 'encrypted transfer'],
  robots: { index: true, follow: true },
  openGraph: {
    title: 'PeerBridge — Direct Browser-to-Browser File Transfer',
    description: 'Move files directly between devices using WebRTC and temporary 6-digit connection codes.',
    url: 'https://share-bridge-roan.vercel.app',
    siteName: 'PeerBridge',
    locale: 'en_US',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PeerBridge — Direct Browser-to-Browser File Transfer',
    description: 'Send large files directly between devices without uploading to cloud servers.'
  }
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
