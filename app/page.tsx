import Link from 'next/link';

function ShieldGraphic() {
  return (
    <div className="heroVisual" aria-hidden="true">
      <div className="orbit orbitOne" />
      <div className="orbit orbitTwo" />
      <div className="device deviceLeft"><div className="screen" /></div>
      <div className="device deviceRight"><div className="screen" /></div>
      <div className="shield"><span>✓</span></div>
      <div className="floatFile ff1">PDF</div>
      <div className="floatFile ff2">ZIP</div>
      <div className="floatFile ff3">XLS</div>
      <div className="floatFile ff4">CSV</div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main>
      <section className="hero shell">
        <div className="heroCopy">
          <div className="eyebrow"><span className="dot" /> Browser-to-browser transfer</div>
          <h1>Send large files <span>directly. securely.</span></h1>
          <p className="heroLead">Move ZIPs, spreadsheets, PDFs, presentations, images and datasets between devices using a temporary 6-digit code.</p>
          <div className="heroActions">
            <Link className="button" href="/send">Send files <span>→</span></Link>
            <Link className="button buttonGhost" href="/receive">Receive files <span>↓</span></Link>
          </div>
          <div className="trustRow">
            <span>✓ No permanent uploads</span>
            <span>✓ WebRTC encrypted</span>
            <span>✓ 500 MB+ ready</span>
          </div>
        </div>
        <ShieldGraphic />
      </section>

      <section className="shell quickGrid" aria-label="Transfer actions">
        <Link href="/send" className="quickCard">
          <div className="quickIcon">↗</div>
          <div><strong>Send files</strong><span>Select files and create your code.</span></div>
          <b>→</b>
        </Link>
        <Link href="/receive" className="quickCard">
          <div className="quickIcon">↓</div>
          <div><strong>Receive files</strong><span>Enter a code and approve the transfer.</span></div>
          <b>→</b>
        </Link>
      </section>

      <section className="shell contentSection" id="how">
        <div className="sectionHeading"><span>How it works</span><h2>Three steps. No account required.</h2></div>
        <div className="stepGrid">
          <article><em>01</em><h3>Select</h3><p>Drop one or more files. PeerBridge automatically detects names, sizes and file types.</p></article>
          <article><em>02</em><h3>Connect</h3><p>Share the temporary 6-digit code. The receiving browser uses it to establish WebRTC.</p></article>
          <article><em>03</em><h3>Transfer</h3><p>After receiver approval, file bytes stream directly between devices in small controlled chunks.</p></article>
        </div>
      </section>

      <section className="shell featureBand" id="features">
        <div><small>Large file engine</small><strong>Chunked + backpressure</strong><span>Designed to avoid pushing a full large file through your application server.</span></div>
        <div><small>Auto detection</small><strong>ZIP · PDF · CSV · Excel · PPT</strong><span>Works with arbitrary binary files, not just a fixed whitelist.</span></div>
        <div><small>Live status</small><strong>Progress · speed · ETA</strong><span>Track the active file and total transfer progress in real time.</span></div>
      </section>

      <section className="shell securitySection" id="security">
        <div className="securityCopy">
          <span className="sectionLabel">Security</span>
          <h2>Files stay off the application server.</h2>
          <p>The backend only coordinates temporary connection metadata. WebRTC protects the peer connection with DTLS, while short-lived access tokens and rate limits protect the signaling layer.</p>
        </div>
        <div className="securityList">
          <div><span>01</span><p><strong>10-minute code expiry</strong>Old transfer rooms disappear automatically.</p></div>
          <div><span>02</span><p><strong>One receiver per code</strong>The first valid receiver claims the room.</p></div>
          <div><span>03</span><p><strong>Server-side token validation</strong>Session secrets are stored only as SHA-256 hashes.</p></div>
          <div><span>04</span><p><strong>Receiver approval</strong>No file transfer begins before the receiver accepts.</p></div>
        </div>
      </section>
    </main>
  );
}
