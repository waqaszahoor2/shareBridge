'use client';

import type { FileMeta } from '@/lib/types';

const categories: Record<string, string> = {
  // Documents & Presentations
  pdf: 'PDF', ppt: 'PowerPoint', pptx: 'PowerPoint', key: 'Presentation', odp: 'Presentation',
  doc: 'Document', docx: 'Document', txt: 'Text', md: 'Markdown', rtf: 'Document', odt: 'Document',
  // Spreadsheets & Data
  xls: 'Excel', xlsx: 'Excel', csv: 'CSV', tsv: 'CSV', ods: 'Spreadsheet',
  json: 'JSON', xml: 'XML', yaml: 'YAML', yml: 'YAML', sql: 'SQL Data', db: 'Database', sqlite: 'Database',
  parquet: 'Data', pkl: 'Model', joblib: 'Model',
  // Images
  jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', webp: 'Image', svg: 'SVG Image',
  bmp: 'Image', ico: 'Icon', avif: 'Image', heic: 'Image', tiff: 'Image',
  // Archives & Compressed
  zip: 'Archive', rar: 'Archive', '7z': 'Archive', tar: 'Archive', gz: 'Archive', bz2: 'Archive', xz: 'Archive',
  // Code & Web
  js: 'JavaScript', ts: 'TypeScript', jsx: 'React Component', tsx: 'React Component',
  html: 'HTML', css: 'CSS', py: 'Python', cpp: 'C++', c: 'C Code', java: 'Java', rs: 'Rust', go: 'Go Code', php: 'PHP',
  // Audio & Video
  mp4: 'Video', mov: 'Video', mkv: 'Video', avi: 'Video', webm: 'Video',
  mp3: 'Audio', wav: 'Audio', flac: 'Audio', m4a: 'Audio', ogg: 'Audio', aac: 'Audio',
  // Applications & Executables
  exe: 'Application', dmg: 'Disk Image', iso: 'Disk Image', apk: 'Android App', deb: 'Package', rpm: 'Package'
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
