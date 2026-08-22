'use client';

import type { FileMeta } from '@/lib/types';
import { sendControl, waitForBuffer } from './dataChannel';
import { calculateChunkSize, waitForFileSaved, waitForReceiverAck } from './chunkTransfer';

export type SendFileProgressCallback = (
  fileId: string,
  offset: number,
  totalSent: number,
  speed: number,
  eta: number
) => void;

export async function sendSelectedFiles(args: {
  files: { file: File; meta: FileMeta }[];
  channel: RTCDataChannel;
  pc: RTCPeerConnection;
  ackedRef: React.MutableRefObject<Record<string, number>>;
  savedRef: React.MutableRefObject<Record<string, boolean>>;
  isCancelled: () => boolean;
  onFileStart: (fileId: string) => void;
  onProgress: SendFileProgressCallback;
}) {
  const { files, channel, pc, ackedRef, savedRef, isCancelled, onFileStart, onProgress } = args;
  if (channel.readyState !== 'open') throw new Error('Transfer channel is not connected.');

  const totalBytes = files.reduce((sum, item) => sum + item.file.size, 0);
  const started = performance.now();
  let totalSent = 0;
  let lastUi = 0;

  const maxMessage = pc.sctp?.maxMessageSize || 65_536;
  const chunkSize = calculateChunkSize(maxMessage);

  for (const item of files) {
    if (isCancelled()) throw new Error('Transfer cancelled.');
    ackedRef.current[item.meta.id] = 0;
    savedRef.current[item.meta.id] = false;

    sendControl(channel, { kind: 'file-start', file: item.meta, chunkSize });
    onFileStart(item.meta.id);

    let offset = 0;
    while (offset < item.file.size) {
      if (isCancelled()) throw new Error('Transfer cancelled.');
      await waitForBuffer(channel, 4 * 1024 * 1024);
      await waitForReceiverAck(item.meta.id, offset, ackedRef.current, isCancelled);

      const end = Math.min(offset + chunkSize, item.file.size);
      const buffer = await item.file.slice(offset, end).arrayBuffer();
      channel.send(buffer);
      const delta = end - offset;
      offset = end;
      totalSent += delta;

      const tick = performance.now();
      if (tick - lastUi > 120 || offset === item.file.size) {
        const elapsedSeconds = Math.max((tick - started) / 1000, 0.001);
        const currentSpeed = totalSent / elapsedSeconds;
        const eta = currentSpeed > 0 ? (totalBytes - totalSent) / currentSpeed : 0;
        onProgress(item.meta.id, offset, totalSent, currentSpeed, eta);
        lastUi = tick;
      }
    }

    sendControl(channel, { kind: 'file-end', fileId: item.meta.id });
    await waitForFileSaved(item.meta.id, savedRef.current, isCancelled);
  }

  sendControl(channel, { kind: 'all-complete' });
}
