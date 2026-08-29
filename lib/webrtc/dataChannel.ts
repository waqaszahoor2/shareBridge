'use client';

export function sendControl(channel: RTCDataChannel | null | undefined, message: unknown): boolean {
  if (!channel || channel.readyState !== 'open') return false;
  try {
    channel.send(JSON.stringify(message));
    return true;
  } catch (err) {
    console.warn('Control message send skipped (channel not open):', err);
    return false;
  }
}

export async function waitForBuffer(channel: RTCDataChannel, highWaterMark = 1024 * 1024) {
  if (!channel || channel.readyState !== 'open') {
    throw new Error('Transfer connection interrupted (data channel is closed).');
  }
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
      reject(new Error('Transfer channel closed unexpectedly.'));
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
