'use client';

export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: process.env.NEXT_PUBLIC_STUN_URL || 'stun:stun.l.google.com:19302' }
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl && username && credential) {
    servers.push({ urls: turnUrl, username, credential });
  }
  return servers;
}

export function createPeerConnection() {
  return new RTCPeerConnection({
    iceServers: buildIceServers(),
    iceCandidatePoolSize: 4,
    bundlePolicy: 'max-bundle'
  });
}
