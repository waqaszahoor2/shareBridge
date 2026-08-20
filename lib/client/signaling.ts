'use client';

import type { PeerRole, SignalMessage, SignalType } from '@/lib/types';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export async function createTransferSession() {
  return postJson<{ code: string; token: string; expiresIn: number }>('/api/session/create', {});
}

export async function joinTransferSession(code: string) {
  return postJson<{ code: string; token: string; expiresIn: number }>('/api/session/join', { code });
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
      onError(error instanceof Error ? error : new Error('Signaling failed.'));
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
