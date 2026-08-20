'use client';

import type { FileMeta } from '@/lib/types';

const categories: Record<string, string> = {
  pdf: 'PDF', csv: 'CSV', xls: 'Excel', xlsx: 'Excel', ppt: 'PowerPoint', pptx: 'PowerPoint',
  doc: 'Document', docx: 'Document', zip: 'Archive', rar: 'Archive', '7z': 'Archive', tar: 'Archive', gz: 'Archive',
  jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', webp: 'Image', svg: 'Image',
  mp4: 'Video', mov: 'Video', mkv: 'Video', avi: 'Video', webm: 'Video',
  mp3: 'Audio', wav: 'Audio', flac: 'Audio', m4a: 'Audio',
  json: 'Data', parquet: 'Data', pkl: 'Model', joblib: 'Model', txt: 'Text'
};

export function extensionOf(name: string) {
  const last = name.split('.').pop()?.toLowerCase();
  return last && last !== name.toLowerCase() ? last.replace(/[^a-z0-9]/g, '').slice(0, 12) : '';
}

export function fileCategory(name: string) {
  return categories[extensionOf(name)] ?? 'File';
}

export function fileMeta(file: File): FileMeta {
  return {
    id: crypto.randomUUID(),
    name: file.name.slice(0, 255),
    size: file.size,
    type: (file.type || 'application/octet-stream').slice(0, 120),
    extension: extensionOf(file.name)
  };
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

export function formatSpeed(bytesPerSecond: number) {
  return `${formatBytes(Math.max(0, bytesPerSecond))}/s`;
}

export function safeFileName(name: string) {
  const stripped = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return (stripped || 'download.bin').slice(0, 180);
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remain = Math.ceil(seconds % 60);
  return `${minutes}m ${remain}s`;
}
