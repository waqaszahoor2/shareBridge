'use client';

import { AsyncZipDeflate, Zip } from 'fflate';
import { safeFileName } from '@/lib/client/files';

type ZipFile = { name: string; blob: Blob };
type WritableFile = { write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort?(): Promise<void> };
type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<{ createWritable(): Promise<WritableFile> }>;

export async function downloadFilesAsZip(files: ZipFile[]): Promise<boolean> {
  if (!files.length) throw new Error('There are no received files to archive.');

  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  let writer: WritableFile | undefined;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: 'peerbridge-files.zip',
        types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }]
      });
      writer = await handle.createWritable();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      throw error;
    }
  }

  const chunks: Uint8Array[] = [];
  let outputChain = Promise.resolve();
  let rejectOutput!: (error: Error) => void;
  let resolveOutput!: () => void;
  const outputDone = new Promise<void>((resolve, reject) => {
    resolveOutput = resolve;
    rejectOutput = reject;
  });
  const zip = new Zip();
  zip.ondata = (error, chunk, final) => {
    if (error) {
      rejectOutput(error);
      return;
    }
    outputChain = outputChain.then(async () => {
      if (writer) await writer.write(chunk);
      else chunks.push(chunk);
      if (final) resolveOutput();
    }).catch((cause) => {
      rejectOutput(cause instanceof Error ? cause : new Error('Could not write ZIP data.'));
    });
  };

  try {
    for (const file of files) {
      const entry = new AsyncZipDeflate(safeFileName(file.name), { level: 6 });
      zip.add(entry);
      const reader = file.blob.stream().getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          entry.push(value ? new Uint8Array(value) : new Uint8Array(), done);
          await outputChain;
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
    }
    zip.end();
    await outputDone;
    await outputChain;

    if (writer) {
      await writer.close();
      return true;
    }

    const blobParts = chunks.map((chunk) => {
      const buffer = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(buffer).set(chunk);
      return buffer;
    });
    const blob = new Blob(blobParts, { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'peerbridge-files.zip';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
    return true;
  } catch (error) {
    if (writer?.abort) await writer.abort().catch((abortError) => console.warn('[ZIP] Could not cancel the incomplete archive file.', abortError));
    else if (writer) await writer.close().catch((closeError) => console.warn('[ZIP] Could not close the archive file.', closeError));
    throw error;
  }
}
