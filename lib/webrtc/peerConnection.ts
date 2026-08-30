'use client';

const DEFAULT_STUN_SERVERS: RTCIceServer = {
  urls: [
    process.env.NEXT_PUBLIC_STUN_URL || 'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
    'stun:stun.cloudflare.com:3478',
    'stun:stun.services.mozilla.com:3478'
  ]
};

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/turn-credentials', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { success?: boolean; iceServers?: RTCIceServer[] };
      if (data.success && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        return [DEFAULT_STUN_SERVERS, ...data.iceServers];
      }
    }
  } catch {}

  // Fallback to client environment config
  const servers: RTCIceServer[] = [DEFAULT_STUN_SERVERS];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl && username && credential) {
    servers.push({ urls: turnUrl, username, credential });
  }

  return servers;
}

export function buildIceServersSync(): RTCIceServer[] {
  const servers: RTCIceServer[] = [DEFAULT_STUN_SERVERS];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl && username && credential) {
    servers.push({ urls: turnUrl, username, credential });
  } else {
    servers.push({
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    });
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

