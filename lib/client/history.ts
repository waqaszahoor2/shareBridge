'use client';

import type { FileMeta } from '@/lib/types';

const HISTORY_KEY = 'peerbridge_transfer_history_v1';
const MAX_HISTORY_ENTRIES = 50;

export type TransferHistoryEntry = {
  id: string;
  direction: 'sent' | 'received';
  files: Pick<FileMeta, 'name' | 'size' | 'type'>[];
  totalBytes: number;
  completedAt: string;
  durationMs: number;
};

function isHistoryEntry(value: unknown): value is TransferHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<TransferHistoryEntry>;
  return (
    typeof entry.id === 'string' &&
    (entry.direction === 'sent' || entry.direction === 'received') &&
    Array.isArray(entry.files) &&
    entry.files.every(
      (file) =>
        file &&
        typeof file.name === 'string' &&
        typeof file.size === 'number' &&
        Number.isFinite(file.size) &&
        typeof file.type === 'string'
    ) &&
    typeof entry.totalBytes === 'number' &&
    Number.isFinite(entry.totalBytes) &&
    typeof entry.completedAt === 'string' &&
    typeof entry.durationMs === 'number' &&
    Number.isFinite(entry.durationMs)
  );
}

export function readTransferHistory(): TransferHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries)) {
      console.warn('Ignoring invalid local transfer history.');
      return [];
    }
    return entries.filter(isHistoryEntry).slice(0, MAX_HISTORY_ENTRIES);
  } catch (error) {
    console.warn('Could not read local transfer history.', error);
    return [];
  }
}

export function recordTransferHistory(
  direction: TransferHistoryEntry['direction'],
  files: FileMeta[],
  durationMs: number
): boolean {
  if (typeof window === 'undefined' || files.length === 0) return false;
  try {
    const entries = readTransferHistory();
    const entry: TransferHistoryEntry = {
      id: crypto.randomUUID(),
      direction,
      files: files.map(({ name, size, type }) => ({ name, size, type })),
      totalBytes: files.reduce((total, file) => total + file.size, 0),
      completedAt: new Date().toISOString(),
      durationMs: Math.max(0, Math.round(durationMs))
    };
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...entries].slice(0, MAX_HISTORY_ENTRIES)));
    return true;
  } catch (error) {
    console.warn('Could not save this transfer to local history.', error);
    return false;
  }
}

export function removeTransferHistoryEntry(id: string): boolean {
  try {
    const entries = readTransferHistory().filter((entry) => entry.id !== id);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    return true;
  } catch (error) {
    console.warn('Could not remove the local transfer history entry.', error);
    return false;
  }
}

export function clearTransferHistory(): boolean {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
    return true;
  } catch (error) {
    console.warn('Could not clear local transfer history.', error);
    return false;
  }
}
