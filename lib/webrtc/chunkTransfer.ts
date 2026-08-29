'use client';

export const ACK_WINDOW = 2 * 1024 * 1024; // 2MB ACK window (safe for mobile socket buffers)
export const ACK_STEP = 256 * 1024; // 256KB ACK step

export function calculateChunkSize(maxMessageSize?: number) {
  // Universal 16KB max chunk size for 100% cross-browser (Chrome, Brave, Firefox, Safari) and mobile compatibility
  const max = maxMessageSize || 16_384;
  return Math.min(16 * 1024, Math.max(8 * 1024, Math.floor(max / 2)));
}

export async function waitForReceiverReady(
  isReady: () => boolean,
  isCancelled: () => boolean,
  timeoutMs = 30_000
) {
  const started = Date.now();
  while (!isReady()) {
    if (isCancelled()) throw new Error('Transfer cancelled by user.');
    if (Date.now() - started > timeoutMs) {
      throw new Error('Receiver acknowledgement timeout. (30 seconds)');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export async function waitForReceiverAck(
  fileId: string,
  sent: number,
  ackedMap: Record<string, number>,
  isCancelled: () => boolean
) {
  const started = Date.now();
  while (sent - (ackedMap[fileId] ?? 0) > ACK_WINDOW) {
    if (isCancelled()) throw new Error('Transfer cancelled by user.');
    if (Date.now() - started > 45_000) {
      throw new Error('Receiver stopped acknowledging data chunks (45s inactivity timeout).');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export async function waitForFileSaved(
  fileId: string,
  savedMap: Record<string, boolean>,
  isCancelled: () => boolean
) {
  const started = Date.now();
  while (!savedMap[fileId]) {
    if (isCancelled()) throw new Error('Transfer cancelled by user.');
    if (Date.now() - started > 60_000) {
      throw new Error('Receiver did not finish saving file (60s saving timeout).');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

