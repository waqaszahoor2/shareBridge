# PeerBridge — Design & Implementation Plan

## Product goal
PeerBridge transfers large files from one browser to another after the devices exchange a temporary 6-digit code. The application server coordinates only the connection metadata; the selected file bytes are sent through a WebRTC DataChannel.

## Primary screens
1. **Landing page** — product value proposition, Send and Receive actions, feature/security explanation.
2. **Send page** — drag/drop selection, automatic name/type/size detection, temporary code, receiver status, file queue, total progress, speed and ETA.
3. **Receive page** — 6-digit code entry, incoming manifest review, explicit approval, optional destination-folder selection, per-file and overall progress.
4. **Completion/error states** — clear successful, declined, interrupted and retry states.

## Responsive behavior
- Desktop: two-column transfer layouts, sticky status/connection panel.
- Tablet: columns collapse into a vertical workflow.
- Mobile: single-column cards, large touch targets, compact file rows and two-column statistics.
- 500 MB+ direct-to-disk receiving is best on current Chromium desktop browsers with the File System Access directory picker; other browsers use a memory/download fallback.

## Transfer architecture

```text
Sender browser
   │
   ├── HTTPS → Vercel Next.js signaling API → temporary Redis room
   │
   └════════════════ WebRTC DataChannel ════════════════╗
                                                        ║
Receiver browser ← HTTPS polling/signaling ← Vercel API ╝
```

## Reliability controls
- Dynamic WebRTC chunk size capped to a conservative maximum.
- `RTCDataChannel.bufferedAmount` backpressure.
- Receiver acknowledgements cap unacknowledged data to 8 MB.
- File completion is not marked successful on the sender until the receiver reports that the file has been saved.
- Ordered/reliable DataChannel protocol with explicit manifest, approval, file-start, chunks, file-end and completion messages.

## Security controls
- HTTPS/Vercel transport for signaling.
- WebRTC DTLS encrypted peer channel.
- 6-digit room expires after 10 minutes.
- 256-bit random sender/receiver tokens; server stores SHA-256 token hashes rather than raw tokens.
- First receiver claims the room.
- Same-origin validation on write APIs.
- Per-IP rate limiting for create/join/signaling requests.
- Maximum signaling body size.
- File manifest validation and filename sanitization.
- Receiver approval required before binary data is accepted.
- Received byte count must match declared file size.
- CSP, anti-clickjacking, MIME-sniffing, referrer and permissions headers.
- No permanent file upload/storage in PeerBridge.

## Production storage
Local development can use the built-in memory store. A Vercel production deployment intentionally requires Upstash Redis REST environment variables, because separate serverless instances cannot safely share an in-memory 6-digit room.
