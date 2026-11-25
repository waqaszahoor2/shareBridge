# 🌉 Share Bridge — Private File & Text Sharing

> **Live Application**: [https://share-bridge-roan.vercel.app/](https://share-bridge-roan.vercel.app/)

Share Bridge is a responsive, browser-based file and text sharing app built with Next.js 16, TypeScript, and WebRTC. Devices exchange files directly when a peer connection is available; the server handles short-lived room and signaling data, not file contents.

---

## ✨ Key Features

- **🚀 Direct Browser-to-Browser P2P**: File bytes stream directly between devices via WebRTC DataChannels with SCTP backpressure control and windowed acknowledgements.
- **⚡ Low-Latency Signaling**: Authenticated server-sent events deliver WebRTC signaling promptly, with HTTP polling retained as a fallback for restrictive networks.
- **📱 Cross-Device & Cross-Network Reliability**: Automatically falls back to a configured TURN relay when device networks block direct WebRTC connections, including Mobile 4G/5G to Desktop Wi-Fi.
- **📡 Offline Hotspot Pairing**: The `/offline` flow uses a 6-digit match code and manual copy/paste of compressed WebRTC offer/answer data, then transfers directly over a shared local Wi-Fi network or hotspot without signaling servers.
- **↔️ Clear Send/Receive Navigation**: Switch between the send and receive flows directly from either transfer page.
- **📦 ZIP Recovery**: Download completed in-memory received files together as a ZIP; browsers supporting the File System Access API can stream the archive to a chosen file.
- **📊 Transfer Feedback**: Shows direct LAN, direct P2P, or TURN relay route and adapts chunk sizing to observed RTT; requests a screen wake lock during transfers where supported.
- **📝 1-Click Text & Snippet Sharing**: Type or paste notes, code snippets, and links to share instantly with built-in mobile clipboard copy (`navigator.clipboard` + WebView fallback).
- **🎨 Light, Dark & System Themes**: Choose ☀️ **Light Mode**, 🌙 **Dark Mode**, or 💻 **System Auto Mode**. The interface uses a soft blue palette, clear button outlines, and responsive layouts.
- **❓ First-Time Visitor Onboarding Tutorial**: Guided interactive pop-up tutorial modal with step navigation, dot indicators, and a 1-click **Skip** option.
- **📂 Progressive Disk Streaming**: Streams received files to a chosen folder or browser-managed private storage, avoiding whole-file RAM buffering for large transfers.
- **🔒 Zero-Trust Security Architecture**:
  - Hashed owner/receiver session tokens (`SHA-256` + constant-time comparison).
  - Rate limiting & Same-Origin subdomain protection.
  - Strict Content-Security-Policy (CSP) headers.
  - **Instant Data Purge**: Automatic wiping of expired session metadata from Upstash Redis immediately upon transfer completion.

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Language** | TypeScript (Strict Mode) |
| **Protocol** | WebRTC DataChannel (SCTP, STUN/TURN) |
| **Signaling Store** | Upstash Redis REST API (Serverless-Safe) |
| **Styling** | Vanilla CSS design tokens, responsive layouts, and theme-aware surfaces |
| **Testing** | Node.js Test Runner & TypeScript Compiler |

---

## 📐 Architecture & Data Flow

```
[ Sender Device ] <==== Direct P2P WebRTC DataChannel (Encrypted) ====> [ Receiver Device ]
       │                                                                        │
       └───── HTTP Poll / Signal ─────► [ Upstash Redis ] ◄───── Signal ────────┘
                                     (Short-Lived Metadata Only)
```

> **Core Security Rule**: Selected files and text snippets **never touch central servers**. Vercel and Upstash Redis handle only 6-digit room codes and encrypted SDP/ICE signaling messages.

---

## ⚡ Getting Started

### Prerequisites
- Node.js `v20.9.0` or higher
- npm `v9.x` or higher

### Installation & Local Setup

```bash
# 1. Clone repository
git clone https://github.com/waqaszahoor2/shareBridge.git
cd shareBridge

# 2. Install dependencies
npm install

# 3. Copy environment configuration
cp .env.example .env.local

# 4. Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For offline hotspot transfers, first load `/offline` while online so the service worker can cache its app shell. Later, connect both devices to the same Wi-Fi or hotspot, open the cached route on each device, and manually exchange the 6-digit match code plus offer/answer connection text. The six-digit code verifies that both devices are using the same offer; it does not replace exchanging that connection text. Offline receiving is currently limited to 256 MiB total per session and buffers the files in memory; use the normal online flow for larger transfers. Online transfers use the six-digit room code and require internet access.

---

## 🧪 Testing & Validation

Share Bridge includes automated unit tests and type checks:

```bash
# Run unit tests
npm run test

# Run TypeScript type check
npm run typecheck

# Run Next.js production build check
npm run build

# Run repository validation checks
npm run validate
```

---

## 🌐 Production Deployment

For production deployments on Vercel:

1. Connect your repository to Vercel.
2. Add an **Upstash Redis** integration from Vercel Marketplace (or set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`).
3. Configure a TURN service for cross-network connections. Set `TURN_SECRET` to its shared secret and `TURN_URLS` to its relay URLs (include TCP/TLS transports if your provider supports them). The server generates short-lived credentials. Alternatively, set `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, and `NEXT_PUBLIC_TURN_CREDENTIAL` for static provider credentials; these values are public to browser clients.
4. Deploy to production.

STUN can establish direct connections in many cases but cannot relay traffic. Without a configured, reachable TURN service, transfers across restrictive networks cannot be guaranteed. When a connection succeeds, the app reports whether it is using the direct path or a TURN relay.

Room creation and normal signaling require an internet connection to reach the Share Bridge app and its shared session store. The separate offline hotspot flow uses no signaling server or STUN/TURN after both devices have loaded the app shell; it depends on peer-to-peer host-candidate connectivity working on the local network. Browser isolation, router policies, or hotspot settings can still prevent a direct connection. WebRTC encrypts DataChannel traffic with DTLS; this release does not add a separate application-layer ECDH/AES-GCM protocol.

---

## 📜 License

Distributed under the MIT License. Built with ❤️ for fast, private, and secure file sharing.
