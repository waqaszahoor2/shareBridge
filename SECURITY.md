# PeerBridge Security Notes

## Threat model covered by this build
- Brute-force code attempts are throttled per IP.
- A room can only be claimed by one receiver.
- Session bearer tokens are random and are compared against server-stored hashes using a timing-safe comparison.
- Signaling writes are same-origin only and limited in body size.
- Temporary Redis keys expire automatically.
- Incoming file metadata is untrusted and validated before use.
- Filenames are sanitized and existing files are not silently overwritten when directory access is supported.
- Binary transfer is rejected before explicit receiver approval.
- Receiver verifies that the number of bytes written equals the sender-declared file size.
- File bytes do not pass through the Next.js/Vercel API.

## Important production considerations
- A 6-digit code is a convenience identifier, not the cryptographic secret. The random peer token provides authorization after room creation/join.
- Use TURN for reliable connectivity across restrictive networks. TURN credentials supplied to a browser must be temporary/rotating.
- Add application-level malware scanning only if you intentionally introduce server/cloud file storage; a pure P2P service cannot centrally scan file contents without receiving them.
- Do not log session bearer tokens, SDP payloads or filenames in production analytics.
- Do not loosen the Content Security Policy without reviewing the new origin/directive.
