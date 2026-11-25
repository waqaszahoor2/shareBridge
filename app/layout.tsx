import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import AppHeader from '@/components/AppHeader';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import './globals.css';

const uiFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ui'
});

const monoFont = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono'
});

export const metadata: Metadata = {
  metadataBase: new URL('https://share-bridge-roan.vercel.app'),
  title: {
    default: 'Share Bridge — Secure P2P File Transfer',
    template: '%s | Share Bridge'
  },
  description: 'Send large files directly between browsers with a short connection code. No permanent file storage.',
  applicationName: 'Share Bridge',
  keywords: ['P2P file transfer', 'WebRTC', 'browser file sharing', 'large file transfer', 'encrypted transfer'],
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Share Bridge — Direct Browser-to-Browser File Transfer',
    description: 'Move files directly between devices using WebRTC and temporary 6-digit connection codes.',
    url: 'https://share-bridge-roan.vercel.app',
    siteName: 'Share Bridge',
    locale: 'en_US',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Share Bridge — Direct Browser-to-Browser File Transfer',
    description: 'Send large files directly between devices without uploading to cloud servers.'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FAFAFA'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${uiFont.variable} ${monoFont.variable}`} suppressHydrationWarning>
        <div className="ambient ambientOne" />
        <div className="ambient ambientTwo" />
        <AppHeader />
        <ServiceWorkerRegistration />
        {children}
        <footer className="siteFooter">
          <div className="shell footerInner">
            <span>© {new Date().getFullYear()} Share Bridge</span>
            <span>Files travel peer-to-peer. Session metadata expires automatically.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
