# 🌉 PeerBridge — High-Performance P2P File & Text Transfer

> **Live Application**: [https://share-bridge-roan.vercel.app/](https://share-bridge-roan.vercel.app/)

PeerBridge is an enterprise-grade, responsive WebRTC peer-to-peer file and text sharing application built with Next.js 16 (App Router), TypeScript, and Upstash Redis signaling. It enables ultra-fast, direct browser-to-browser transfers without routing file content through central server storage.

---

## ✨ Key Features

- **🚀 Direct Browser-to-Browser P2P**: File bytes stream directly between devices via WebRTC DataChannels with SCTP backpressure control and windowed acknowledgements.
- **📱 Cross-Device & Cross-Network Reliability**: Automatically falls back to a configured TURN relay when device networks block direct WebRTC connections, including Mobile 4G/5G to Desktop Wi-Fi.
- **📝 1-Click Text & Snippet Sharing**: Type or paste notes, code snippets, and links to share instantly with built-in mobile clipboard copy (`navigator.clipboard` + WebView fallback).
- **🎨 Interactive Vertical Theme Switcher**: Glassmorphic popover dropdown supporting ☀️ **Light Mode**, 🌙 **Dark Mode**, and 💻 **System Auto Mode** with high-contrast legibility.
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
| **Styling** | Vanilla CSS Tokens & Glassmorphism |
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
- Node.js `v18.x` or higher
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

---

## 🧪 Testing & Validation

PeerBridge includes automated unit tests and type checks:

```bash
# Run unit tests
npm run test

# Run TypeScript type check
npm run typecheck

# Run Next.js production build check
npm run build
```

---

## 🌐 Production Deployment

For production deployments on Vercel:

1. Connect your repository to Vercel.
2. Add an **Upstash Redis** integration from Vercel Marketplace (or set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`).
3. Configure a TURN service for cross-network connections. Set `TURN_SECRET` to its shared secret and `TURN_URLS` to its relay URLs (include TCP/TLS transports if your provider supports them). The server generates short-lived credentials. Alternatively, set `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, and `NEXT_PUBLIC_TURN_CREDENTIAL` for static provider credentials; these values are public to browser clients.
4. Deploy to production.

STUN can establish direct connections in many cases but cannot relay traffic. Without a configured, reachable TURN service, transfers across restrictive networks cannot be guaranteed. When a connection succeeds, the app reports whether it is using the direct path or a TURN relay.

---

## 📜 License

Distributed under the MIT License. Built with ❤️ for fast, private, and secure file sharing.
