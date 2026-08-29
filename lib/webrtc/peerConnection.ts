'use client';

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/turn-credentials', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { success?: boolean; iceServers?: RTCIceServer[] };
      if (data.success && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        return data.iceServers;
      }
    }
  } catch {}

  // Fallback to client environment config
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

export function buildIceServersSync(): RTCIceServer[] {
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

export const buildIceServers = buildIceServersSync;

export async function createPeerConnection(options: { forceTurn?: boolean } = {}) {
  const iceServers = await fetchIceServers();
  const forceTurn = options.forceTurn ?? process.env.NEXT_PUBLIC_FORCE_TURN === 'true';

  const configuration: RTCConfiguration = {
    iceServers,
    iceCandidatePoolSize: 4,
    bundlePolicy: 'max-bundle',
    iceTransportPolicy: forceTurn ? 'relay' : 'all'
  };

  const pc = new RTCPeerConnection(configuration);

  pc.onicecandidateerror = (event) => {
    console.warn('[WebRTC ICE Candidate Error]', event.url, event.errorCode, event.errorText);
  };

  return pc;
}

