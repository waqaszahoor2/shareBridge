import Link from 'next/link';
import Hero3DVisual from '@/components/Hero3DVisual';

export default function HomePage() {
  return (
    <main className="landingPage3D">
      <section className="hero shell">
        <div className="heroCopy">
          <div className="eyebrow"><span className="dot" /> P2P WebRTC Direct Engine</div>
          <h1>Send files &amp; text <span>directly. securely.</span></h1>
          <p className="heroLead">Move files, code snippets and text notes directly between devices using a temporary 6-digit code. Zero server file uploads.</p>
          <div className="heroActions">
            <Link className="button buttonGlow" href="/send">Send files &amp; text <span>→</span></Link>
            <Link className="button buttonGhost" href="/receive">Receive transfer <span>↓</span></Link>
          </div>
          <div className="trustRow">
            <span>✓ No permanent uploads</span>
            <span>✓ WebRTC DTLS encrypted</span>
            <span>✓ 1-Click text copy</span>
            <span>✓ 500 MB+ stream ready</span>
          </div>
        </div>
        <Hero3DVisual />
      </section>

      <section className="shell quickGrid3D" aria-label="Transfer actions">
        <Link href="/send" className="quickCard3D cardSend">
          <div className="quickCardBadge">Fast P2P</div>
          <div className="quickIcon3D">📁</div>
          <div>
            <strong>Share Files &amp; Media</strong>
            <span>Send PDFs, archives, images, videos &amp; datasets directly.</span>
          </div>
          <span className="cardArrow">→</span>
        </Link>

        <Link href="/send" className="quickCard3D cardText">
          <div className="quickCardBadge">New Feature</div>
          <div className="quickIcon3D">📝</div>
          <div>
            <strong>Share Text &amp; Snippets</strong>
            <span>Type or paste notes, code &amp; links with 1-click clipboard copy.</span>
          </div>
          <span className="cardArrow">→</span>
        </Link>

        <Link href="/receive" className="quickCard3D cardReceive">
          <div className="quickCardBadge">Instant Join</div>
          <div className="quickIcon3D">⚡</div>
          <div>
            <strong>Receive Transfer</strong>
            <span>Enter a 6-digit code to connect and receive files automatically.</span>
          </div>
          <span className="cardArrow">→</span>
        </Link>
      </section>

      <section className="shell contentSection" id="how">
        <div className="sectionHeading"><span>How it works</span><h2>Three simple steps. Zero account required.</h2></div>
        <div className="stepGrid3D">
          <article className="stepCard3D">
            <span className="stepNum">01</span>
            <h3>Select Files or Type Text</h3>
            <p>Drop arbitrary binary files or type text notes to share. PeerBridge formats metadata automatically.</p>
          </article>
          <article className="stepCard3D">
            <span className="stepNum">02</span>
            <h3>Share 6-Digit Code</h3>
            <p>Share the temporary 6-digit code. The receiving browser enters it to establish WebRTC peer connection.</p>
          </article>
          <article className="stepCard3D">
            <span className="stepNum">03</span>
            <h3>Stream &amp; Copy Text</h3>
            <p>File bytes stream directly between browsers. Shared text snippets can be copied with 1-click.</p>
          </article>
        </div>
      </section>

      <section className="shell featureBand3D" id="features">
        <div className="featureItem3D">
          <small>Large file engine</small>
          <strong>Chunked + Backpressure</strong>
          <span>Streams data in 16KB WebRTC chunks directly to storage, avoiding RAM crashes.</span>
        </div>
        <div className="featureItem3D">
          <small>Text &amp; Snippet Engine</small>
          <strong>1-Click Clipboard Copy</strong>
          <span>Instantly copy text, code, passwords, and links from sender to receiver.</span>
        </div>
        <div className="featureItem3D">
          <small>Cross-Platform &amp; Browser</small>
          <strong>Chrome · Brave · Safari · Mobile</strong>
          <span>Multi-STUN/TURN fallback supports mobile-to-desktop and cross-browser transfers.</span>
        </div>
      </section>

      <section className="shell securitySection3D" id="security">
        <div className="securityCopy">
          <span className="sectionLabel">Security &amp; Privacy</span>
          <h2>Your data stays off application servers.</h2>
          <p>The backend only coordinates temporary connection signaling metadata. WebRTC protects peer channels with DTLS encryption, while short-lived access tokens and rate limits protect the signaling layer.</p>
        </div>
        <div className="securityList3D">
          <div><span>01</span><p><strong>10-minute code expiry</strong>Old transfer rooms expire automatically.</p></div>
          <div><span>02</span><p><strong>One receiver per code</strong>Provisional claiming prevents second device hijack.</p></div>
          <div><span>03</span><p><strong>Server-side SHA-256 tokens</strong>Session secrets are stored only as cryptographic hashes.</p></div>
          <div><span>04</span><p><strong>Sender approval</strong>No file transfer begins before the sender reviews and approves.</p></div>
        </div>
      </section>
    </main>
  );
}
