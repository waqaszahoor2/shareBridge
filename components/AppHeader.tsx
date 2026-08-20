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
  return (
    <header className="siteHeader">
      <div className="shell headerInner">
        <Link className="brand" href="/" aria-label="PeerBridge home">
          <BrandMark />
          <span>PeerBridge</span>
        </Link>
        <nav className="headerNav" aria-label="Primary navigation">
          <a href="/#how">How it works</a>
          <a href="/#features">Features</a>
          <a href="/#security">Security</a>
        </nav>
        <Link className="button buttonSmall" href="/send">Send files</Link>
      </div>
    </header>
  );
}
