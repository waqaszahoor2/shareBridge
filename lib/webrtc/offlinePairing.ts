import { deflateSync, inflateSync } from 'fflate';

const PREFIX = 'PB1:';
const MAX_COMPRESSED_BYTES = 16 * 1024;
const MAX_DESCRIPTION_BYTES = 64 * 1024;

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function encodeOfflineDescription(description: RTCSessionDescriptionInit) {
  if (!description.type || !description.sdp || description.sdp.length > MAX_DESCRIPTION_BYTES) {
    throw new Error('The WebRTC description is invalid or too large to share safely.');
  }
  const json = new TextEncoder().encode(JSON.stringify(description));
  const compressed = deflateSync(json);
  if (compressed.byteLength > MAX_COMPRESSED_BYTES) {
    throw new Error('This network produced a QR payload that is too large. Copy the text code instead.');
  }
  return PREFIX + toBase64Url(compressed);
}

export function decodeOfflineDescription(encoded: string): RTCSessionDescriptionInit {
  if (!encoded.startsWith(PREFIX) || encoded.length > MAX_COMPRESSED_BYTES * 2) {
    throw new Error('This is not a valid PeerBridge offline pairing code.');
  }
  const base64 = encoded.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  let bytes: Uint8Array;
  try {
    const binary = atob(base64);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('The offline pairing code is malformed.');
  }
  if (bytes.byteLength > MAX_COMPRESSED_BYTES) throw new Error('The offline pairing code is too large.');

  let parsed: unknown;
  try {
    const inflated = inflateSync(bytes, { out: new Uint8Array(MAX_DESCRIPTION_BYTES + 1) });
    if (inflated.byteLength > MAX_DESCRIPTION_BYTES) throw new Error('The WebRTC description is too large.');
    parsed = JSON.parse(new TextDecoder().decode(inflated));
  } catch (error) {
    if (error instanceof Error && error.message === 'The WebRTC description is too large.') throw error;
    throw new Error('The offline pairing code could not be decoded.');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('type' in parsed) ||
    !['offer', 'answer'].includes(String(parsed.type)) ||
    !('sdp' in parsed) ||
    typeof parsed.sdp !== 'string'
  ) {
    throw new Error('The offline pairing code does not contain a valid WebRTC offer or answer.');
  }
  return parsed as RTCSessionDescriptionInit;
}

export function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 15_000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Local network discovery timed out. Check that both devices are on the same Wi-Fi or hotspot.'));
    }, timeoutMs);

    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      pc.removeEventListener('icegatheringstatechange', onStateChange);
    };
    pc.addEventListener('icegatheringstatechange', onStateChange);
    onStateChange();
  });
}
