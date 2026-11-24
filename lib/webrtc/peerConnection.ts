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

const ICE_CREDENTIAL_TIMEOUT_MS = 5_000;
const ICE_SERVER_CACHE_MS = 5 * 60_000;
let iceServersCache: { expiresAt: number; promise: Promise<RTCIceServer[]> } | null = null;

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ICE_CREDENTIAL_TIMEOUT_MS);
  try {
    const res = await fetch('/api/turn-credentials', {
      cache: 'no-store',
      signal: controller.signal
    });
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        relayAvailable?: boolean;
        iceServers?: RTCIceServer[];
      };
      if (data.success && Array.isArray(data.iceServers)) {
        if (!data.relayAvailable) {
          console.warn('[WebRTC] No TURN relay is configured; cross-network connectivity cannot be guaranteed.');
        }
        return mergeIceServers([...buildIceServersSync(), ...data.iceServers]);
      }
      console.warn('[WebRTC] TURN credentials response was invalid; trying configured fallback ICE servers.');
    } else {
      console.warn(`[WebRTC] TURN credentials request failed (${res.status}); trying configured fallback ICE servers.`);
    }
  } catch (error) {
    console.warn('[WebRTC] Could not fetch TURN credentials; trying configured fallback ICE servers.', error);
  } finally {
    clearTimeout(timeout);
  }

  return buildIceServersSync();
}

function getIceServers(): Promise<RTCIceServer[]> {
  if (!iceServersCache || iceServersCache.expiresAt <= Date.now()) {
    iceServersCache = {
      expiresAt: Date.now() + ICE_SERVER_CACHE_MS,
      promise: fetchIceServers()
    };
  }
  return iceServersCache.promise;
}

export function prefetchIceServers() {
  void getIceServers();
}

function mergeIceServers(servers: RTCIceServer[]): RTCIceServer[] {
  const seen = new Set<string>();
  return servers.filter((server) => {
    const urls = Array.isArray(server.urls) ? [...server.urls].sort().join(',') : server.urls;
    const key = `${urls}|${server.username ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildIceServersSync(): RTCIceServer[] {
  const servers: RTCIceServer[] = [DEFAULT_STUN_SERVERS];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl && username && credential) {
    servers.push({ urls: turnUrl, username, credential });
  }

  return servers;
}

export const buildIceServers = buildIceServersSync;

export async function getIceRoute(pc: RTCPeerConnection): Promise<'relay' | 'direct' | 'unknown'> {
  const stats = await pc.getStats();

  for (const report of stats.values()) {
    if (report.type !== 'candidate-pair') continue;
    const pair = report as RTCIceCandidatePairStats & { selected?: boolean };
    if (pair.state !== 'succeeded' || (!pair.selected && !pair.nominated)) continue;

    const local = stats.get(pair.localCandidateId);
    const remote = stats.get(pair.remoteCandidateId);
    const localIsRelay = local && 'candidateType' in local && local.candidateType === 'relay';
    const remoteIsRelay = remote && 'candidateType' in remote && remote.candidateType === 'relay';
    return localIsRelay || remoteIsRelay ? 'relay' : 'direct';
  }

  return 'unknown';
}

export async function createPeerConnection(options: { forceTurn?: boolean } = {}) {
  const iceServers = await getIceServers();
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
