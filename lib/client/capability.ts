'use client';

export interface BrowserCapabilities {
  supported: boolean;
  hasWebRTC: boolean;
  hasDataChannel: boolean;
  hasStreams: boolean;
  hasIndexedDB: boolean;
  hasFileSystemAccess: boolean;
  missing: string[];
}

export function checkBrowserCapabilities(): BrowserCapabilities {
  if (typeof window === 'undefined') {
    return {
      supported: true,
      hasWebRTC: true,
      hasDataChannel: true,
      hasStreams: true,
      hasIndexedDB: true,
      hasFileSystemAccess: false,
      missing: []
    };
  }

  const hasWebRTC =
    typeof window.RTCPeerConnection !== 'undefined' ||
    typeof (window as unknown as { webkitRTCPeerConnection?: unknown }).webkitRTCPeerConnection !== 'undefined';

  const hasDataChannel =
    hasWebRTC &&
    (typeof window.RTCDataChannel !== 'undefined' ||
      'createDataChannel' in (window.RTCPeerConnection?.prototype || {}));

  const hasStreams = typeof window.ReadableStream !== 'undefined' && typeof window.Blob !== 'undefined';
  const hasIndexedDB = typeof window.indexedDB !== 'undefined';
  const hasFileSystemAccess =
    typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

  const missing: string[] = [];
  if (!hasWebRTC) missing.push('WebRTC P2P networking');
  if (!hasDataChannel) missing.push('RTCDataChannel data channel streaming');

  return {
    supported: hasWebRTC && hasDataChannel,
    hasWebRTC,
    hasDataChannel,
    hasStreams,
    hasIndexedDB,
    hasFileSystemAccess,
    missing
  };
}
