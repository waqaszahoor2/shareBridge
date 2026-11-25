'use client';

export const ACK_WINDOW = 8 * 1024 * 1024;
export const ACK_STEP = 1024 * 1024;

export function calculateChunkSize(maxMessageSize?: number) {
  // A zero SCTP limit means unlimited; keep a conservative cap for browser implementations.
  const max = maxMessageSize && maxMessageSize > 0 ? maxMessageSize : 64 * 1024;
  return Math.max(1, Math.min(64 * 1024, Math.floor(max / 2)));
}

export function calculateAdaptiveChunkSize(maxMessageSize: number | undefined, rttMs?: number) {
  const maximum = calculateChunkSize(maxMessageSize);
  if (rttMs !== undefined && rttMs > 150) return Math.min(maximum, 32 * 1024);
  return maximum;
}

export async function waitForReceiverReady(
  isReady: () => boolean,
  isCancelled: () => boolean,
  timeoutMs = 60_000
) {
  const started = Date.now();
  while (!isReady()) {
    if (isCancelled()) throw new Error('Transfer cancelled by user.');
    if (Date.now() - started > timeoutMs) {
      throw new Error('Receiver acknowledgement timeout (60 seconds).');
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
    if (Date.now() - started > 5 * 60_000) {
      throw new Error('Receiver stopped acknowledging data chunks (5-minute inactivity timeout).');
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
    if (Date.now() - started > 10 * 60_000) {
      throw new Error('Receiver did not finish saving the file (10-minute saving timeout).');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
