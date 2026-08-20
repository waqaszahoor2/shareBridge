# PeerBridge

Professional responsive Next.js/Vercel starter for code-based browser-to-browser large-file transfer.

## Included
- Next.js App Router + TypeScript.
- Responsive landing, Send and Receive interfaces.
- Drag/drop and multi-file selection (up to 20 files per room).
- Automatic file name, extension, MIME label and size detection.
- 6-digit temporary room code.
- Direct WebRTC DataChannel file transfer.
- Chunking, sender buffer backpressure and receiver acknowledgement window.
- Progress, speed and ETA.
- Receiver approval before file data.
- Direct-to-folder streaming when the File System Access API is available.
- Memory/download fallback on browsers without directory access.
- Server-only Upstash Redis REST signaling state for Vercel production.
- Security headers, hashed session tokens, same-origin validation and rate limiting.
- Health endpoint at `/api/health`.

## Important architecture rule
The large file never goes through a Next.js API route. Vercel handles only small session/signaling messages. File bytes travel browser-to-browser through WebRTC.

## Start locally

```bash
npm install
npm run validate
npm run typecheck
npm run dev
```

Then open `http://localhost:3000`.

## Deploy
Read `DEPLOYMENT.md`. For production on Vercel, configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` so different Vercel instances share the same temporary transfer rooms.

## Browser note
The layout works on mobile and desktop. For 500 MB+ receiving, Chrome/Edge desktop is recommended because a destination directory can be selected and chunks can be written progressively instead of accumulating the entire file in browser memory.

## No permanent file storage
Redis contains only short-lived room/signaling metadata. It never stores selected file bytes.
