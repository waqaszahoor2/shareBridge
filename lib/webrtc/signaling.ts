'use client';

import type { FileMeta, PeerRole, SignalMessage, SignalType } from '@/lib/types';

export type SessionResponse = {
  success?: boolean;
  code: string;
  sessionId: string;
  token: string;
  expiresIn: number;
  expiresAt?: string;
  files?: FileMeta[];
  error?: string;
  reasons?: string[];
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
  } catch {
    throw new Error('Unable to connect to server. Please check your internet connection.');
  }

  let data: T & { error?: string; reasons?: string[] };
  try {
    data = (await response.json()) as T & { error?: string; reasons?: string[] };
  } catch {
    throw new Error(`Server returned an unreadable response (${response.status}).`);
  }

  if (!response.ok) {
    const errorMsg = data.error || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    if (data.reasons && Array.isArray(data.reasons)) {
      (err as Error & { reasons?: string[] }).reasons = data.reasons;
    }
    throw err;
  }
  return data;
}

export async function createTransferSession(files: FileMeta[] = []) {
  return postJson<SessionResponse>('/api/session/create', { files });
}

export async function joinTransferSession(code: string) {
  return postJson<SessionResponse>('/api/session/join', { code });
}

export async function sendSignal(args: {
  code: string;
  role: PeerRole;
  token: string;
  type: SignalType;
  payload: unknown;
}) {
  return postJson<{ ok: true; id: string }>('/api/signal', { action: 'send', ...args });
}

export async function pollSignals(args: { code: string; role: PeerRole; token: string }) {
  return postJson<{ messages: SignalMessage[] }>('/api/signal', { action: 'poll', ...args });
}

export function startSignalPolling(
  args: { code: string; role: PeerRole; token: string },
  onMessage: (message: SignalMessage) => Promise<void> | void,
  onError: (error: Error) => void
) {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = 650;
  const seen = new Set<string>();

  const loop = async () => {
    if (!active) return;
    try {
      const { messages } = await pollSignals(args);
      delay = 650;
      for (const message of messages) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);
        if (seen.size > 500) {
          const first = seen.values().next().value as string | undefined;
          if (first) seen.delete(first);
        }
        await onMessage(message);
      }
    } catch (error) {
      delay = Math.min(delay * 1.7, 5000);
      onError(error instanceof Error ? error : new Error('Signaling poll failed.'));
    } finally {
      if (active) timer = setTimeout(loop, delay);
    }
  };

  void loop();
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}
