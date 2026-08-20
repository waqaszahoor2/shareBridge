# Vercel Deployment

## 1. Project requirements
- Node.js 20.9+ (Node 22 is recommended in Vercel settings).
- Project root must be the directory containing `package.json`.
- Framework preset: Next.js.
- Build command: use Vercel's default (`next build`).
- Output directory: leave at the Next.js default.

## 2. Production session store
PeerBridge needs a shared short-lived store for connection codes when deployed on Vercel.

Create/connect an Upstash Redis database and add these **server-only** environment variables in Vercel:

```env
UPSTASH_REDIS_REST_URL=https://YOUR-DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR_REST_TOKEN
```

Do not add `NEXT_PUBLIC_` to these variables. They must never be sent to the browser.

The code uses Upstash's REST Redis protocol directly, so no Redis npm package is required.

## 3. Optional WebRTC ICE settings
The project defaults to a public STUN server for direct P2P connectivity. You can override it:

```env
NEXT_PUBLIC_STUN_URL=stun:your-stun.example.com:3478
```

TURN is optional but recommended for users behind restrictive NAT/firewalls:

```env
NEXT_PUBLIC_TURN_URL=turn:turn.example.com:3478
NEXT_PUBLIC_TURN_USERNAME=TEMPORARY_USERNAME
NEXT_PUBLIC_TURN_CREDENTIAL=TEMPORARY_CREDENTIAL
```

Anything prefixed `NEXT_PUBLIC_` is visible to the browser. Use temporary/rotating TURN credentials, not a permanent infrastructure secret.

## 4. Deploy from GitHub
1. Put the contents of this ZIP in a GitHub repository.
2. In Vercel choose **Add New → Project** and import the repository.
3. Keep **Root Directory** at `./` if `package.json` is at repository root.
4. Add the two Upstash environment variables.
5. Deploy.

## 5. Production verification
Open:

```text
https://YOUR-DOMAIN/api/health
```

Expected production response includes:

```json
{
  "status": "ok",
  "service": "PeerBridge",
  "sessionStore": "redis",
  "productionReady": true
}
```

Then test with two different devices/networks:
1. Sender selects a small file and creates a code.
2. Receiver enters the code and approves.
3. Confirm the received file size matches.
4. Repeat with a 500 MB+ file on Chrome/Edge desktop.

## 6. Local development
No Redis variables are required for a two-tab local test because the local Next.js process uses the in-memory fallback.

```bash
npm install
npm run validate
npm run typecheck
npm run dev
```

Open `http://localhost:3000` in two tabs or browsers.
