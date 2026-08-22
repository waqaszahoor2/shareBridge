'use client';

import type { FileMeta } from '@/lib/types';
import { safeFileName } from '@/lib/client/files';

export function validateIncomingManifest(files: unknown): FileMeta[] {
  if (!Array.isArray(files) || files.length === 0 || files.length > 20) {
    throw new Error('Sender provided an invalid file list.');
  }
  return files.map((item) => {
    const value = item as Partial<FileMeta>;
    if (
      typeof value.id !== 'string' || value.id.length > 80 ||
      typeof value.name !== 'string' || value.name.length === 0 || value.name.length > 255 ||
      typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size <= 0 || value.size > 50 * 1024 ** 3
    ) {
      throw new Error('Sender provided invalid file metadata.');
    }
    return {
      id: value.id,
      name: value.name,
      size: value.size,
      type: typeof value.type === 'string' ? value.type.slice(0, 120) : 'application/octet-stream',
      extension: typeof value.extension === 'string' ? value.extension.slice(0, 12) : ''
    };
  });
}

export function triggerFileDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(name);
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
