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

export async function waitForBuffer(channel: RTCDataChannel, highWaterMark = 1024 * 1024) {
  if (channel.bufferedAmount <= highWaterMark) return;
  channel.bufferedAmountLowThreshold = Math.floor(highWaterMark / 2);

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Network buffer did not drain in time.'));
    }, 30_000);
    const onLow = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Transfer channel closed.'));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      channel.removeEventListener('bufferedamountlow', onLow);
      channel.removeEventListener('close', onClose);
    };
    channel.addEventListener('bufferedamountlow', onLow, { once: true });
    channel.addEventListener('close', onClose, { once: true });
  });
}
